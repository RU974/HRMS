<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Response;

class ReportExportService
{
    public const PDF_TEMPLATES = ['classic', 'corporate', 'compact'];

    public function export(string $filename, array $columns, array $rows, string $format, array $context = [])
    {
        $built = $this->buildExport($filename, $columns, $rows, $format, $context);

        return Response::make($built['content'], 200, [
            'Content-Type' => $built['mime'],
            'Content-Disposition' => 'attachment; filename="' . $built['filename'] . '"',
        ]);
    }

    /**
     * Builds the raw export payload (content/mime/filename) without wrapping
     * it in an HTTP response, so it can also be used as a mail attachment.
     *
     * $context may include: template (pdf style), company_name, generated_by.
     */
    public function buildExport(string $filename, array $columns, array $rows, string $format, array $context = []): array
    {
        $format = strtolower(trim($format));

        if ($format === 'csv') {
            return [
                'content' => $this->toCsv($columns, $rows),
                'mime' => 'text/csv; charset=UTF-8',
                'filename' => $this->safeFileName($filename) . '.csv',
            ];
        }

        if (in_array($format, ['excel', 'xlsx'], true)) {
            return [
                'content' => $this->toHtmlTable($columns, $rows),
                'mime' => 'application/vnd.ms-excel; charset=UTF-8',
                'filename' => $this->safeFileName($filename) . '.xls',
            ];
        }

        if ($format === 'pdf') {
            return [
                'content' => $this->toPdf($filename, $columns, $rows, $context),
                'mime' => 'application/pdf',
                'filename' => $this->safeFileName($filename) . '.pdf',
            ];
        }

        abort(422, 'Unsupported export format.');
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

    private function toPdf(string $title, array $columns, array $rows, array $context = []): string
    {
        $template = strtolower((string) ($context['template'] ?? 'classic'));
        if (!in_array($template, self::PDF_TEMPLATES, true)) {
            $template = 'classic';
        }

        $displayRows = array_map(
            fn ($row) => array_map([$this, 'normalizeValue'], $row),
            $rows
        );

        $pdf = Pdf::loadView("reports.pdf.{$template}", [
            'title' => $title,
            'columns' => $columns,
            'rows' => $displayRows,
            'companyName' => $context['company_name'] ?? 'HRMS',
            'generatedBy' => $context['generated_by'] ?? null,
            'generatedAt' => $context['generated_at'] ?? now()->format('M j, Y g:i A'),
        ])->setPaper('a4', 'portrait');

        return $pdf->output();
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

    private function safeFileName(string $name): string
    {
        return preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $name);
    }
}
