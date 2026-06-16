import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { ReportDrillDownPanel } from "@/modules/reports/report-drilldown";
import { ReportExportButtons } from "@/modules/reports/report-export-buttons";
import { getLeaveReportSummary } from "@/services/report-service";
import { listLeaves, type LeaveItem } from "@/services/hr-management-service";
import { formatMonthYear, monthNames } from "@/modules/reports/report-utils";

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
  const [drillStatus, setDrillStatus] = useState<string | null>(null);

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
          <ReportExportButtons path={`/reports/leave?month=${month}&year=${year}`} filename={`leave-report-${year}-${month}`} />
        </div>

        <h3 className="text-lg font-semibold">Leave Summary ({formatMonthYear(month, year)})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {rows.map((item) => (
            <button
              key={item.status}
              type="button"
              onClick={() => setDrillStatus(item.status)}
              className="rounded-lg border border-[var(--border)]/70 p-3 text-left transition hover:border-[var(--primary)]/50 hover:bg-[var(--border)]/10"
            >
              <p className="text-xs uppercase text-[var(--muted)]">{item.status}</p>
              <p className="text-xl font-semibold">{item.count ?? 0}</p>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No leave summary data available for this period.</p>
          )}
        </div>
      </Card>

      {drillStatus && (
        <ReportDrillDownPanel
          title={`Leaves — ${drillStatus}`}
          queryKey={["reports", "leave", "drilldown", drillStatus]}
          queryFn={async () => (await listLeaves({ status: drillStatus as LeaveItem["status"] })).data ?? []}
          rowKey={(row) => row.id}
          viewAllHref={`/leaves?status=${drillStatus}`}
          onClose={() => setDrillStatus(null)}
          columns={[
            { header: "Employee", render: (row) => row.employee?.name ?? `#${row.employee_id}` },
            { header: "Type", render: (row) => row.type },
            { header: "From", render: (row) => row.from_date },
            { header: "To", render: (row) => row.to_date },
          ]}
        />
      )}

      <ReportCrudSection reportType="leave" />
    </div>
  );
}
