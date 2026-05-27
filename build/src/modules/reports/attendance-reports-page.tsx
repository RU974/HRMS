import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getAttendanceReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";

export function AttendanceReportsPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data } = useQuery({
    queryKey: ["reports", "attendance", "summary", month, year],
    queryFn: () => getAttendanceReportSummary(month, year),
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance Reports" subtitle="Separate attendance reporting and report CRUD." />
      <Card>
        <h3 className="text-lg font-semibold">Monthly Attendance Summary ({month}/{year})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {rows.map((item) => (
            <div key={item.status} className="rounded-lg border border-[var(--border)]/70 p-3">
              <p className="text-xs uppercase text-[var(--muted)]">{item.status}</p>
              <p className="text-xl font-semibold">{item.count ?? 0}</p>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-[var(--muted)]">No summary data available.</p>}
        </div>
      </Card>
      <ReportCrudSection reportType="attendance" />
    </div>
  );
}
