<?php

namespace App\Services;

use Illuminate\Support\Facades\Response;

class ReportExportService
{
    public function export(string $filename, array $columns, array $rows, string $format)
    {
        $format = strtolower(trim($format));
        if ($format === 'csv') {
            return $this->csvResponse($filename, $columns, $rows);
        }

        if (in_array($format, ['excel', 'xlsx'], true)) {
            return $this->excelResponse($filename, $columns, $rows);
        }

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, $columns, $rows);
        }

        abort(422, 'Unsupported export format.');
    }

    private function csvResponse(string $filename, array $columns, array $rows)
    {
        $content = $this->toCsv($columns, $rows);

        return Response::make($content, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $this->safeFileName($filename) . '.csv"',
        ]);
    }

    private function excelResponse(string $filename, array $columns, array $rows)
    {
        $content = $this->toHtmlTable($columns, $rows);

        return Response::make($content, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $this->safeFileName($filename) . '.xls"',
        ]);
    }

    private function pdfResponse(string $filename, array $columns, array $rows)
    {
        $content = $this->toPdf($filename, $columns, $rows);

        return Response::make($content, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $this->safeFileName($filename) . '.pdf"',
        ]);
    }

    private function toCsv(array $columns, array $rows): string
    {
        $handle = fopen('php://temp', 'r+');
        fputcsv($handle, $columns);

        foreach ($rows as $row) {
            fputcsv($handle, array_map([$this, 'normalizeValue'], $row));
        }

        rewind($handle);
        $contents = stream_get_contents($handle);
        fclose($handle);

        return $contents ?: '';
    }

    private function toHtmlTable(array $columns, array $rows): string
    {
        $build = '<html><head><meta charset="UTF-8"></head><body><table border="1" cellpadding="4" cellspacing="0"><thead><tr>';
        foreach ($columns as $column) {
            $build .= '<th>' . htmlspecialchars((string) $column, ENT_QUOTES, 'UTF-8') . '</th>';
        }
        $build .= '</tr></thead><tbody>';

        foreach ($rows as $row) {
            $build .= '<tr>';
            foreach ($row as $value) {
                $build .= '<td>' . htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8') . '</td>';
            }
            $build .= '</tr>';
        }

        $build .= '</tbody></table></body></html>';

        return $build;
    }

    private function toPdf(string $title, array $columns, array $rows): string
    {
        $lines = [];
        $lines[] = $title;
        $lines[] = str_repeat('-', 120);
        $lines[] = implode(' | ', $columns);
        $lines[] = str_repeat('-', 120);

        foreach ($rows as $row) {
            $lines[] = implode(' | ', array_map([$this, 'normalizeValue'], $row));
        }

        $streamContent = '';
        $y = 760;
        foreach ($lines as $line) {
            $escaped = $this->escapePdfText($line);
            $streamContent .= "BT /F1 10 Tf 40 {$y} Td ({$escaped}) Tj ET\n";
            $y -= 14;
            if ($y < 40) {
                break;
            }
        }

        $objects = [];
        $objects[] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
        $objects[] = "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n";
        $objects[] = "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n";
        $objects[] = "4 0 obj\n<< /Length " . strlen($streamContent) . " >>\nstream\n{$streamContent}endstream\nendobj\n";
        $objects[] = "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        $pos = strlen($pdf);

        foreach ($objects as $object) {
            $offsets[] = $pos;
            $pdf .= $object;
            $pos += strlen($object);
        }

        $xref = "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $xref .= str_pad((string) $offset, 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        }

        $trailer = "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $pos . "\n%%EOF\n";

        return $pdf . $xref . $trailer;
    }

    private function normalizeValue(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_null($value)) {
            return '';
        }

        if (is_array($value) || is_object($value)) {
            return json_encode($value, JSON_UNESCAPED_UNICODE);
        }

        return (string) $value;
    }

    private function escapePdfText(string $value): string
    {
        $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
        return preg_replace('/[^\x20-\x7E]/', '?', $escaped);
    }

    private function safeFileName(string $name): string
    {
        return preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $name);
    }
}
