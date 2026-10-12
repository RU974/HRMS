<?php

namespace Tests\Support;

use Illuminate\Http\UploadedFile;

/** Builds tiny but real PDF and DOCX files so resume parsing is tested against actual formats. */
trait BuildsResumeFiles
{
    protected function pdfBytes(array $lines): string
    {
        $stream = "BT\n/F1 12 Tf\n72 720 Td\n14 TL\n";
        foreach ($lines as $line) {
            $stream .= '(' . str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $line) . ") Tj T*\n";
        }
        $stream .= 'ET';

        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            "<< /Length " . strlen($stream) . " >>\nstream\n{$stream}\nendstream",
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1) . " 0 obj\n{$object}\nendobj\n";
        }

        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";

        return $pdf;
    }

    /** A stored (uncompressed) ZIP holding only word/document.xml, which is all a DOCX reader needs. */
    protected function docxBytes(array $paragraphs): string
    {
        $body = '';
        foreach ($paragraphs as $paragraph) {
            $body .= '<w:p><w:r><w:t>' . htmlspecialchars($paragraph, ENT_XML1) . '</w:t></w:r></w:p>';
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' . $body . '</w:body></w:document>';
        $name = 'word/document.xml';
        $crc = crc32($xml);

        $local = "PK\x03\x04" . pack('vvvvvVVVvv', 20, 0, 0, 0, 0, $crc, strlen($xml), strlen($xml), strlen($name), 0) . $name . $xml;
        $central = "PK\x01\x02" . pack('vvvvvvVVVvvvvvVV', 20, 20, 0, 0, 0, 0, $crc, strlen($xml), strlen($xml), strlen($name), 0, 0, 0, 0, 0, 0) . $name;
        $end = "PK\x05\x06" . pack('vvvvVVv', 0, 0, 1, 1, strlen($central), strlen($local), 0);

        return $local . $central . $end;
    }

    protected function fakePdf(array $lines, string $name = 'cv.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $this->pdfBytes($lines));
    }

    protected function fakeDocx(array $paragraphs, string $name = 'cv.docx'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $this->docxBytes($paragraphs));
    }

    /** @return array<int, string> */
    protected function sampleCvLines(string $name = 'Ayesha Malik', string $phone = '+92 300 1234567'): array
    {
        return [
            $name,
            'Senior Backend Engineer',
            "Email: ayesha.malik@example.com   Phone: {$phone}",
            'Summary',
            '6+ years of experience building web platforms.',
            'Skills',
            'PHP, Laravel, MySQL, Docker, Kubernetes, Redis',
            'Experience',
            'Acme Corp - Jan 2019 - Present',
        ];
    }
}
