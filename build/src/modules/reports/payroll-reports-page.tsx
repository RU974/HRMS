import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPayrollReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { downloadCsv, formatMonthYear, monthNames } from "@/modules/reports/report-utils";

declare global { interface Window { Chart: any; } }

const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).filter((y) => y >= 2000);

function PayrollTrendChart({ labels, amounts }: { labels: string[]; amounts: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    const init = () => {
      if (!ref.current) return;
      if (instanceRef.current) instanceRef.current.destroy();
      instanceRef.current = new window.Chart(ref.current, {
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
    };
    if (window.Chart) { init(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    script.onload = init;
    document.head.appendChild(script);
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
          <Button variant="outline" onClick={() => downloadCsv(`payroll-${month}-${year}.csv`, ["Status","Records","Net Salary"], rows.map((r) => [r.status, r.total_records ?? 0, Number(r.total_net_salary ?? 0).toFixed(2)]))}>
            Export CSV
          </Button>
        </div>

        <h3 className="mb-3 text-base font-semibold">Summary — {formatMonthYear(month, year)}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {rows.length === 0 && <p className="col-span-3 text-sm text-[var(--muted)]">No data available.</p>}
          {rows.map((item) => (
            <div key={item.status} className="rounded-2xl border border-[var(--border)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] capitalize mb-1">{item.status}</p>
              <p className="text-2xl font-bold">{item.total_records ?? 0}</p>
              <p className="text-xs text-[var(--muted)]">{Number(item.total_net_salary ?? 0).toLocaleString()} net</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h4 className="mb-3 text-base font-semibold">6-Month Payroll Trend</h4>
          <PayrollTrendChart labels={trendLabels} amounts={trendAmounts} />
        </div>
      </Card>

      <ReportCrudSection reportType="payroll" />
    </div>
  );
}