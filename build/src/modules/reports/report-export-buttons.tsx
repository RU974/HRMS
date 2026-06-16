import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import { downloadReportExport, type ExportFormat } from "@/services/report-service";

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "csv", label: "CSV" },
  { format: "excel", label: "Excel" },
  { format: "pdf", label: "PDF" },
];

export function ReportExportButtons({ path, filename }: { path: string; filename: string }) {
  const canExport = useAuthStore((state) => state.hasPermission("reports:export"));
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canExport) return null;

  const handleExport = async (format: ExportFormat) => {
    setError(null);
    setPending(format);
    try {
      await downloadReportExport(path, format, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
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
