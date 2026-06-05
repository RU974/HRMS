import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAttendanceReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { downloadCsv, formatMonthYear, monthNames } from "@/modules/reports/report-utils";

const yearOptions = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).filter((year) => year >= 2000);

export function AttendanceReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const { data } = useQuery({
    queryKey: ["reports", "attendance", "summary", month, year],
    queryFn: () => getAttendanceReportSummary(month, year),
  });

  const trendMonths = useMemo(() => {
    return [2, 1, 0].map((offset) => {
      const date = new Date(year, month - 1 - offset, 1);
      return { month: date.getMonth() + 1, year: date.getFullYear() };
    });
  }, [month, year]);

  const trendQueries = useQueries({
    queries: trendMonths.map((item) => ({
      queryKey: ["reports", "attendance", "trend", item.month, item.year],
      queryFn: () => getAttendanceReportSummary(item.month, item.year),
      staleTime: 1000 * 60 * 5,
    })),
  });

  const trendRows = useMemo(
    () => trendMonths.map((item, index) => {
      const query = trendQueries[index];
      const total = query.data?.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0;
      return {
        label: formatMonthYear(item.month, item.year),
        total,
        loading: query.isLoading,
      };
    }),
    [trendMonths, trendQueries]
  );

  const rows = useMemo(() => data ?? [], [data]);

  const exportSummary = () => {
    downloadCsv(
      `attendance-summary-${month}-${year}.csv`,
      ["Status", "Count"],
      rows.map((item) => [item.status, item.count ?? 0])
    );
  };

  const maxTrend = Math.max(...trendRows.map((item) => item.total), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance Reports" subtitle="Separate attendance reporting and report CRUD." />
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

        <h3 className="text-lg font-semibold">Monthly Attendance Summary ({formatMonthYear(month, year)})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {rows.map((item) => (
            <div key={item.status} className="rounded-lg border border-[var(--border)]/70 p-3">
              <p className="text-xs uppercase text-[var(--muted)]">{item.status}</p>
              <p className="text-xl font-semibold">{item.count ?? 0}</p>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-[var(--muted)]">No summary data available.</p>}
        </div>

        <div className="mt-6">
          <h4 className="text-base font-semibold">3-Month Trend</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {trendRows.map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--border)]/70 p-3">
                <p className="text-xs uppercase text-[var(--muted)]">{item.label}</p>
                <p className="text-xl font-semibold">{item.loading ? "Loading..." : item.total}</p>
                <div className="mt-3 h-2 rounded-full bg-[var(--border)]/50">
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(item.total / maxTrend) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <ReportCrudSection reportType="attendance" />
    </div>
  );
}
