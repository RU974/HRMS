import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import { downloadReportExport, type ExportFormat, type PdfTemplate } from "@/services/report-service";

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "csv", label: "CSV" },
  { format: "excel", label: "Excel" },
  { format: "pdf", label: "PDF" },
];

const PDF_TEMPLATES: { value: PdfTemplate; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "corporate", label: "Corporate" },
  { value: "compact", label: "Compact" },
];

export function ReportExportButtons({ path, filename }: { path: string; filename: string }) {
  const canExport = useAuthStore((state) => state.hasPermission("reports:export"));
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>("classic");

  if (!canExport) return null;

  const handleExport = async (format: ExportFormat) => {
    setError(null);
    setPending(format);
    try {
      await downloadReportExport(path, format, filename, pdfTemplate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
          value={pdfTemplate}
          onChange={(event) => setPdfTemplate(event.target.value as PdfTemplate)}
          title="PDF template style"
        >
          {PDF_TEMPLATES.map((template) => (
            <option key={template.value} value={template.value}>
              {template.label} template
            </option>
          ))}
        </select>
        {FORMATS.map(({ format, label }) => (
          <Button key={format} variant="outline" disabled={pending !== null} onClick={() => handleExport(format)}>
            {pending === format ? "Exporting..." : `Export ${label}`}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
