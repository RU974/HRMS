import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { getLeaveReportSummary, type ReportCountsItem } from "@/services/report-service";
import { downloadCsv, formatMonthYear, monthNames } from "@/modules/reports/report-utils";

const yearOptions = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).filter((year) => year >= 2000);

export function LeaveReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const { data } = useQuery({
    queryKey: ["reports", "leave", "summary", month, year],
    queryFn: () => getLeaveReportSummary(month, year),
  });

  const rows = useMemo(() => data ?? [], [data]);

  const exportSummary = () => {
    downloadCsv(
      `leave-summary-${month}-${year}.csv`,
      ["Status", "Count"],
      rows.map((item) => [item.status, item.count ?? 0])
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Leave Reports" subtitle="Review monthly leave statistics and manage saved leave reports." />

      <Card>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <label className="text-sm text-[var(--muted)]">
              Month
              <select
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {monthNames.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-[var(--muted)]">
              Year
              <select
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              >
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

        <h3 className="text-lg font-semibold">Leave Summary ({formatMonthYear(month, year)})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {rows.map((item) => (
            <div key={item.status} className="rounded-lg border border-[var(--border)]/70 p-3">
              <p className="text-xs uppercase text-[var(--muted)]">{item.status}</p>
              <p className="text-xl font-semibold">{item.count ?? 0}</p>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No leave summary data available for this period.</p>
          )}
        </div>
      </Card>

      <ReportCrudSection reportType="leave" />
    </div>
  );
}
