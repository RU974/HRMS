<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resumes live on the private "local" disk and are only reachable through
 * authenticated endpoints, never through a public storage URL.
 */
class ResumeStorageService
{
    public const DISK = 'local';

    public const DIRECTORY = 'recruitment/resumes';

    public const VALIDATION_RULES = 'required|file|mimes:pdf,doc,docx,jpg,jpeg,png|max:5120';

    public function store(Candidate $candidate, UploadedFile $file): Candidate
    {
        $previous = $candidate->resume_path;

        $path = $file->store(self::DIRECTORY . '/' . ($candidate->company_id ?? 'shared'), self::DISK);

        $candidate->update([
            'resume_path' => $path,
            'resume_original_name' => mb_substr($file->getClientOriginalName(), 0, 250),
        ]);

        if ($previous && $previous !== $path) {
            Storage::disk(self::DISK)->delete($previous);
        }

        // Reading the CV is best effort: an unreadable file is still stored.
        try {
            $parser = app(ResumeParserService::class);
            $parser->apply($candidate, $parser->parseFile($file->getRealPath() ?: Storage::disk(self::DISK)->path($path), $file->getClientOriginalExtension() ?: pathinfo($path, PATHINFO_EXTENSION)));
        } catch (\Throwable $exception) {
            report($exception);
        }

        return $candidate;
    }

    public function delete(Candidate $candidate): void
    {
        if ($candidate->resume_path) {
            Storage::disk(self::DISK)->delete($candidate->resume_path);
        }

        $candidate->update([
            'resume_path' => null,
            'resume_original_name' => null,
            'resume_text' => null,
            'resume_parsed' => null,
            'skills' => null,
            'experience_years' => null,
        ]);
    }

    public function respond(Candidate $candidate, bool $download = false): Response
    {
        $path = $candidate->resume_path;

        if (! $path || ! Storage::disk(self::DISK)->exists($path)) {
            abort(404, 'No resume on file for this candidate.');
        }

        $name = $candidate->resume_original_name ?: ('resume.' . pathinfo($path, PATHINFO_EXTENSION));

        return $download
            ? Storage::disk(self::DISK)->download($path, $name)
            : Storage::disk(self::DISK)->response($path, $name);
    }
}
