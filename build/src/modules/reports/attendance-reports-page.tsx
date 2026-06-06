import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAttendanceReportSummary } from "@/services/report-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { downloadCsv, formatMonthYear, monthNames } from "@/modules/reports/report-utils";

declare global { interface Window { Chart: any; } }

const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).filter((y) => y >= 2000);

const STATUS_COLORS: Record<string, string> = {
  present: "#22c55e",
  late:    "#f59e0b",
  absent:  "#ef4444",
  leave:   "#6366f1",
};

function AttendanceTrendChart({ trendRows }: { trendRows: { label: string; total: number; loading: boolean }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    const init = () => {
      if (!ref.current) return;
      if (instanceRef.current) instanceRef.current.destroy();
      instanceRef.current = new window.Chart(ref.current, {
        type: "bar",
        data: {
          labels: trendRows.map((r) => r.label),
          datasets: [{
            label: "Total records",
            data: trendRows.map((r) => r.total),
            backgroundColor: "rgba(99,102,241,0.75)",
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y} records` } } },
          scales: {
            y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
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
  }, [trendRows]);

  return <div className="h-48"><canvas ref={ref} /></div>;
}

export function AttendanceReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());

  const { data } = useQuery({
    queryKey: ["reports", "attendance", "summary", month, year],
    queryFn: () => getAttendanceReportSummary(month, year),
  });

  const trendMonths = useMemo(() =>
    [2, 1, 0].map((offset) => {
      const d = new Date(year, month - 1 - offset, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }), [month, year]);

  const trendQueries = useQueries({
    queries: trendMonths.map((item) => ({
      queryKey: ["reports", "attendance", "trend", item.month, item.year],
      queryFn: () => getAttendanceReportSummary(item.month, item.year),
      staleTime: 300_000,
    })),
  });

  const trendRows = trendMonths.map((item, i) => ({
    label: formatMonthYear(item.month, item.year),
    total: trendQueries[i].data?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0,
    loading: trendQueries[i].isLoading,
  }));

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance Reports" subtitle="Monthly attendance breakdown and trend analysis." />

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
          <Button variant="outline" onClick={() => downloadCsv(`attendance-${month}-${year}.csv`, ["Status","Count"], rows.map((r) => [r.status, r.count ?? 0]))}>
            Export CSV
          </Button>
        </div>

        <h3 className="mb-3 text-base font-semibold">Summary — {formatMonthYear(month, year)}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.length === 0 && <p className="col-span-4 text-sm text-[var(--muted)]">No data available.</p>}
          {rows.map((item) => (
            <div key={item.status} className="rounded-2xl border border-[var(--border)] p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.status] ?? "#94a3b8" }} />
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] capitalize">{item.status}</p>
              </div>
              <p className="text-2xl font-bold">{item.count ?? 0}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h4 className="mb-3 text-base font-semibold">3-Month Trend</h4>
          <AttendanceTrendChart trendRows={trendRows} />
        </div>
      </Card>

      <ReportCrudSection reportType="attendance" />
    </div>
  );
}