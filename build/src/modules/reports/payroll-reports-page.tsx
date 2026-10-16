import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getPayrollReportSummary } from "@/services/report-service";
import { listAllPayroll, type PayrollStatus } from "@/services/payroll-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { ReportDrillDownPanel } from "@/modules/reports/report-drilldown";
import { ReportExportButtons } from "@/modules/reports/report-export-buttons";
import { formatMonthYear, monthNames } from "@/modules/reports/report-utils";
import { Chart } from "@/lib/chart-setup";

const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).filter((y) => y >= 2000);

function PayrollTrendChart({ labels, amounts }: { labels: string[]; amounts: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (instanceRef.current) instanceRef.current.destroy();
    instanceRef.current = new Chart(ref.current, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Net payroll",
          data: amounts,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.08)",
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: "#22c55e",
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ` ${Number(ctx.parsed.y).toLocaleString()}` } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 11 }, callback: (v: any) => Number(v).toLocaleString() }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
    return () => { if (instanceRef.current) instanceRef.current.destroy(); };
  }, [labels, amounts]);

  return <div className="h-48"><canvas ref={ref} /></div>;
}

export function PayrollReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());

  const { data } = useQuery({
    queryKey: ["reports", "payroll", "summary", month, year],
    queryFn: () => getPayrollReportSummary(month, year),
  });

  const trendMonths = useMemo(() =>
    [5, 4, 3, 2, 1, 0].map((offset) => {
      const d = new Date(year, month - 1 - offset, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }), [month, year]);

  const trendQueries = useQueries({
    queries: trendMonths.map((item) => ({
      queryKey: ["reports", "payroll", "trend", item.month, item.year],
      queryFn: () => getPayrollReportSummary(item.month, item.year),
      staleTime: 300_000,
    })),
  });

  const trendLabels  = trendMonths.map((m) => formatMonthYear(m.month, m.year));
  const trendAmounts = trendMonths.map((_, i) =>
    trendQueries[i].data?.reduce((s, r) => s + Number(r.total_net_salary ?? 0), 0) ?? 0
  );

  const rows = data ?? [];
  const [drillStatus, setDrillStatus] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll Reports" subtitle="Monthly payroll breakdown and salary trends." />

      <Card>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-[var(--muted)]">
              Month
              <select className="mt-1 block h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {monthNames.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
              </select>
            </label>
            <label className="text-sm text-[var(--muted)]">
              Year
              <select className="mt-1 block h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <ReportExportButtons path={`/reports/payroll?month=${month}&year=${year}`} filename={`payroll-report-${year}-${month}`} />
        </div>

        <h3 className="mb-3 text-base font-semibold">Summary — {formatMonthYear(month, year)}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {rows.length === 0 && <p className="col-span-3 text-sm text-[var(--muted)]">No data available.</p>}
          {rows.map((item) => (
            <button
              key={item.status}
              type="button"
              onClick={() => setDrillStatus(item.status)}
              className="rounded-2xl border border-[var(--border)] p-4 text-left transition hover:border-[var(--primary)]/50 hover:bg-[var(--border)]/10"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] capitalize mb-1">{item.status}</p>
              <p className="text-2xl font-bold">{item.total_records ?? 0}</p>
              <p className="text-xs text-[var(--muted)]">{Number(item.total_net_salary ?? 0).toLocaleString()} net</p>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <h4 className="mb-3 text-base font-semibold">6-Month Payroll Trend</h4>
          <PayrollTrendChart labels={trendLabels} amounts={trendAmounts} />
        </div>
      </Card>

      {drillStatus && (
        <ReportDrillDownPanel
          title={`Payroll — ${drillStatus} (${formatMonthYear(month, year)})`}
          queryKey={["reports", "payroll", "drilldown", drillStatus, month, year]}
          queryFn={() => listAllPayroll({ status: drillStatus as PayrollStatus, month, year })}
          rowKey={(row) => row.id}
          viewAllHref={`/payroll?status=${drillStatus}`}
          onClose={() => setDrillStatus(null)}
          columns={[
            { header: "Employee", render: (row) => row.employee?.name ?? `#${row.employee_id}` },
            { header: "Net Salary", render: (row) => Number(row.net_salary).toLocaleString() },
            { header: "Payment Date", render: (row) => row.payment_date ?? "—" },
          ]}
        />
      )}

      <ReportCrudSection reportType="payroll" />
    </div>
  );
}