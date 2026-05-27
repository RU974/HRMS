import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getReportsAnalytics } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";

export function AnalyticsReportsPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data } = useQuery({
    queryKey: ["reports", "analytics", month, year],
    queryFn: () => getReportsAnalytics(month, year),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics Reports" subtitle="Separate analytics reporting and report CRUD." />
      <Card>
        <h3 className="text-lg font-semibold">HR Analytics ({month}/{year})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Employees</p><p className="text-xl font-semibold">{data?.employees ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Active Employees</p><p className="text-xl font-semibold">{data?.active_employees ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Present</p><p className="text-xl font-semibold">{data?.attendance_present ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Late</p><p className="text-xl font-semibold">{data?.attendance_late ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Absent</p><p className="text-xl font-semibold">{data?.attendance_absent ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Payroll Paid</p><p className="text-xl font-semibold">{data?.payroll_paid ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Payroll Pending</p><p className="text-xl font-semibold">{data?.payroll_pending ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Payroll Amount</p><p className="text-xl font-semibold">${Number(data?.payroll_total_amount ?? 0).toLocaleString()}</p></div>
        </div>
      </Card>
      <ReportCrudSection reportType="custom" moduleKey="analytics" />
    </div>
  );
}
