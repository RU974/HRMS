import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getPayrollReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";

export function PayrollReportsPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data } = useQuery({
    queryKey: ["reports", "payroll", "summary", month, year],
    queryFn: () => getPayrollReportSummary(month, year),
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll Reports" subtitle="Separate payroll reporting and report CRUD." />
      <Card>
        <h3 className="text-lg font-semibold">Monthly Payroll Summary ({month}/{year})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {rows.map((item) => (
            <div key={item.status} className="rounded-lg border border-[var(--border)]/70 p-3">
              <p className="text-xs uppercase text-[var(--muted)]">{item.status}</p>
              <p className="text-xl font-semibold">{item.total_records ?? 0}</p>
              <p className="text-xs text-[var(--muted)]">${Number(item.total_net_salary ?? 0).toLocaleString()}</p>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-[var(--muted)]">No summary data available.</p>}
        </div>
      </Card>
      <ReportCrudSection reportType="payroll" />
    </div>
  );
}
