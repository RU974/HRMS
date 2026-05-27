import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getEmployeeReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";

export function EmployeeReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports", "employees", "summary"],
    queryFn: getEmployeeReportSummary,
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Employee Reports" subtitle="Separate employee reporting and report CRUD." />
      <Card>
        <h3 className="text-lg font-semibold">Employee Status Summary</h3>
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
      <ReportCrudSection reportType="employee" />
    </div>
  );
}
