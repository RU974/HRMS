<?php

namespace App\Services\Recruitment;

use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;
use Throwable;

/**
 * Reads scanned or image-only resumes. Uses Tesseract (and Poppler's pdftoppm for PDFs) when they
 * are installed, found on the PATH or at their usual install folders, or set in config/recruitment.php.
 * A custom `ocr_command` (shell command with {input}) takes priority. With nothing available it
 * returns an empty string and the resume is flagged for a human instead.
 */
class ResumeOcrService
{
    private const MAX_PAGES = 5;

    private const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp'];

    public function available(): bool
    {
        return trim((string) config('recruitment.ocr_command', '')) !== '' || $this->binary('tesseract') !== null;
    }

    public function read(string $path, string $extension): string
    {
        try {
            $command = trim((string) config('recruitment.ocr_command', ''));

            if ($command !== '' && str_contains($command, '{input}')) {
                return $this->run(Process::fromShellCommandline(str_replace('{input}', escapeshellarg($path), $command)));
            }

            $tesseract = $this->binary('tesseract');

            if ($tesseract === null) {
                return '';
            }

            $extension = strtolower($extension);

            if (in_array($extension, self::IMAGE_EXTENSIONS, true)) {
                return $this->recognise($tesseract, $path);
            }

            if ($extension === 'pdf') {
                return $this->readPdf($tesseract, $path);
            }

            return '';
        } catch (Throwable $exception) {
            Log::info('Resume OCR failed: ' . $exception->getMessage());

            return '';
        }
    }

    private function readPdf(string $tesseract, string $path): string
    {
        $pdftoppm = $this->binary('pdftoppm');

        if ($pdftoppm === null) {
            return '';
        }

        $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'resume-ocr-' . bin2hex(random_bytes(6));
        mkdir($directory, 0700, true);

        try {
            $this->run(new Process([$pdftoppm, '-r', '200', '-l', (string) self::MAX_PAGES, '-png', $path, $directory . DIRECTORY_SEPARATOR . 'page']));

            $pages = glob($directory . DIRECTORY_SEPARATOR . 'page*.png') ?: [];
            sort($pages);

            return trim(implode("\n", array_map(fn (string $page) => $this->recognise($tesseract, $page), $pages)));
        } finally {
            array_map('unlink', glob($directory . DIRECTORY_SEPARATOR . '*') ?: []);
            @rmdir($directory);
        }
    }

    private function recognise(string $tesseract, string $image): string
    {
        return $this->run(new Process([$tesseract, $image, 'stdout', '-l', (string) config('recruitment.ocr_language', 'eng')]));
    }

    private function run(Process $process): string
    {
        $process->setTimeout((int) config('recruitment.ocr_timeout', 60));
        $process->run();

        return $process->isSuccessful() ? mb_substr($process->getOutput(), 0, 100000) : '';
    }

    private function binary(string $name): ?string
    {
        $configured = (string) config("recruitment.{$name}_path", '');

        if ($configured !== '' && is_file($configured)) {
            return $configured;
        }

        $found = (new ExecutableFinder())->find($name, null, $this->extraDirectories($name));

        return $found !== null && is_file($found) ? $found : null;
    }

    /** @return array<int, string> */
    private function extraDirectories(string $name): array
    {
        $dirs = ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'];

        if (DIRECTORY_SEPARATOR === '\\') {
            $dirs[] = 'C:\\Program Files\\Tesseract-OCR';

            // winget installs Poppler under the user's package folder.
            $local = getenv('LOCALAPPDATA');
            if ($local) {
                foreach (glob($local . '\\Microsoft\\WinGet\\Packages\\*Poppler*\\*\\Library\\bin') ?: [] as $dir) {
                    $dirs[] = $dir;
                }
            }
        }

        return $dirs;
    }
}
