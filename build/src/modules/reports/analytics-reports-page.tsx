import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getReportsAnalytics, getLeaveReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { downloadCsv, formatMonthYear, monthNames } from "@/modules/reports/report-utils";

const yearOptions = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).filter((year) => year >= 2000);

export function AnalyticsReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const analyticsQuery = useQuery({
    queryKey: ["reports", "analytics", month, year],
    queryFn: () => getReportsAnalytics(month, year),
  });

  const leaveQuery = useQuery({
    queryKey: ["reports", "leave", "summary", month, year],
    queryFn: () => getLeaveReportSummary(month, year),
  });

  const leaveRows = useMemo(() => leaveQuery.data ?? [], [leaveQuery.data]);

  const exportSummary = () => {
    const analytics = analyticsQuery.data;
    downloadCsv(
      `analytics-summary-${month}-${year}.csv`,
      ["Metric", "Value"],
      [
        ["Employees", analytics?.employees ?? 0],
        ["Active Employees", analytics?.active_employees ?? 0],
        ["Present", analytics?.attendance_present ?? 0],
        ["Late", analytics?.attendance_late ?? 0],
        ["Absent", analytics?.attendance_absent ?? 0],
        ["Payroll Paid", analytics?.payroll_paid ?? 0],
        ["Payroll Pending", analytics?.payroll_pending ?? 0],
        ["Payroll Amount", analytics?.payroll_total_amount ?? 0],
        ...leaveRows.map((row) => [
          `Leave ${row.status}`,
          row.count ?? 0,
        ]),
      ]
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics Reports" subtitle="Separate analytics reporting and report CRUD." />
      <Card>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <label className="text-sm text-[var(--muted)]">
              Month
              <select className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {monthNames.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-[var(--muted)]">
              Year
              <select className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>{yearOption}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportSummary}>Export CSV</Button>
          </div>
        </div>

        <h3 className="text-lg font-semibold">HR Analytics ({formatMonthYear(month, year)})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Employees</p><p className="text-xl font-semibold">{analyticsQuery.data?.employees ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Active Employees</p><p className="text-xl font-semibold">{analyticsQuery.data?.active_employees ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Present</p><p className="text-xl font-semibold">{analyticsQuery.data?.attendance_present ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Late</p><p className="text-xl font-semibold">{analyticsQuery.data?.attendance_late ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Absent</p><p className="text-xl font-semibold">{analyticsQuery.data?.attendance_absent ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Payroll Paid</p><p className="text-xl font-semibold">{analyticsQuery.data?.payroll_paid ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Payroll Pending</p><p className="text-xl font-semibold">{analyticsQuery.data?.payroll_pending ?? 0}</p></div>
          <div className="rounded-lg border border-[var(--border)]/70 p-3"><p className="text-xs text-[var(--muted)]">Payroll Amount</p><p className="text-xl font-semibold">${Number(analyticsQuery.data?.payroll_total_amount ?? 0).toLocaleString()}</p></div>
        </div>

        <div className="mt-6">
          <h4 className="text-base font-semibold">Leave Breakdown</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {leaveRows.map((item) => (
              <div key={item.status} className="rounded-lg border border-[var(--border)]/70 p-3">
                <p className="text-xs uppercase text-[var(--muted)]">{item.status}</p>
                <p className="text-xl font-semibold">{item.count ?? 0}</p>
              </div>
            ))}
            {leaveRows.length === 0 && <p className="text-sm text-[var(--muted)]">No leave statistics available.</p>}
          </div>
        </div>
      </Card>
      <ReportCrudSection reportType="custom" moduleKey="analytics" />
    </div>
  );
}
