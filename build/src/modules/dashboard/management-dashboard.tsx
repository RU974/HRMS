import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { getDashboardInsights, getDashboardSummary } from "@/services/dashboard-service";
import { apiClient } from "@/services/api-client";
import { SummaryCard, ChartCard, TableWidget } from "./dashboard-widgets";

// ─── Currency ───────────────────────────────────────────────────────────────
const CURRENCY_OPTIONS = [
  { code: "USD", symbol: "$",   label: "USD – US Dollar" },
  { code: "PKR", symbol: "Rs",  label: "PKR – Pakistani Rupee" },
  { code: "EUR", symbol: "€",   label: "EUR – Euro" },
  { code: "GBP", symbol: "£",   label: "GBP – British Pound" },
  { code: "SAR", symbol: "﷼",   label: "SAR – Saudi Riyal" },
  { code: "AED", symbol: "د.إ", label: "AED – UAE Dirham" },
  { code: "INR", symbol: "₹",   label: "INR – Indian Rupee" },
] as const;
type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];

function formatPayroll(amount: number, currency: CurrencyCode) {
  const sym = CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol ?? currency;
  return `${sym} ${Number(amount).toLocaleString()}`;
}

// ─── Chart helpers (Chart.js loaded from CDN via useEffect) ─────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Chart: any;
  }
}

function useChartJs(cb: () => void, deps: unknown[]) {
  useEffect(() => {
    if (window.Chart) { cb(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    script.onload = cb;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Line chart: attendance trend ────────────────────────────────────────────
function AttendanceTrendChart({ points }: { points: Array<{ label: string; rate: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useChartJs(() => {
    if (!ref.current || !points.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const C = window.Chart;
    if (instanceRef.current) instanceRef.current.destroy();
    instanceRef.current = new C(ref.current, {
      type: "line",
      data: {
        labels: points.map((p) => p.label),
        datasets: [{
          label: "Attendance %",
          data: points.map((p) => p.rate),
          borderColor: "rgb(99,102,241)",
          backgroundColor: "rgba(99,102,241,0.08)",
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: "rgb(99,102,241)",
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: "index", intersect: false },
        },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { callback: (v: unknown) => `${v}%`, font: { size: 11 } },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }, [points]);

  useEffect(() => () => { if (instanceRef.current) instanceRef.current.destroy(); }, []);

  if (!points.length) return <p className="py-8 text-center text-sm text-[var(--muted)]">No attendance data yet.</p>;
  return <div className="h-48"><canvas ref={ref} /></div>;
}

// ─── Horizontal bar chart: department distribution ────────────────────────────
function DeptBarChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useChartJs(() => {
    if (!ref.current || !items.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const C = window.Chart;
    if (instanceRef.current) instanceRef.current.destroy();
    instanceRef.current = new C(ref.current, {
      type: "bar",
      data: {
        labels: items.map((i) => i.label),
        datasets: [{
          label: "Employees",
          data: items.map((i) => i.value),
          backgroundColor: [
            "rgba(99,102,241,0.75)","rgba(34,197,94,0.75)","rgba(245,158,11,0.75)",
            "rgba(239,68,68,0.75)","rgba(14,165,233,0.75)","rgba(168,85,247,0.75)",
          ],
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: { parsed: { x: number } }) => ` ${ctx.parsed.x} employees` } },
        },
        scales: {
          x: { ticks: { font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }, [items]);

  useEffect(() => () => { if (instanceRef.current) instanceRef.current.destroy(); }, []);

  if (!items.length) return <p className="py-8 text-center text-sm text-[var(--muted)]">No department data yet.</p>;
  return <div className="h-48"><canvas ref={ref} /></div>;
}

// ─── Doughnut chart: leave breakdown ─────────────────────────────────────────
function LeaveDonut({ items }: { items: Array<{ label: string; value: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);
  const COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#0ea5e9","#a855f7"];

  useChartJs(() => {
    if (!ref.current || !items.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const C = window.Chart;
    if (instanceRef.current) instanceRef.current.destroy();
    instanceRef.current = new C(ref.current, {
      type: "doughnut",
      data: {
        labels: items.map((i) => i.label),
        datasets: [{
          data: items.map((i) => i.value),
          backgroundColor: COLORS,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx: { label: string; parsed: number }) => ` ${ctx.label}: ${ctx.parsed}` } },
        },
      },
    });
  }, [items]);

  useEffect(() => () => { if (instanceRef.current) instanceRef.current.destroy(); }, []);

  if (!items.length) return <p className="py-8 text-center text-sm text-[var(--muted)]">No leave data yet.</p>;
  return <div className="h-48"><canvas ref={ref} /></div>;
}

// ─── Pending approvals widget ─────────────────────────────────────────────────
interface PendingApproval {
  id: number;
  title: string;
  type: string;
  requester?: { name?: string } | null;
  created_at: string;
}

function PendingApprovalsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-pending-approvals"],
    queryFn: () => apiClient<{ data: PendingApproval[] }>("/approvals?status=pending&per_page=5"),
    retry: false,
  });

  const items = (data as { data?: PendingApproval[] } | undefined)?.data ?? [];

  return (
    <ChartCard title="Pending Approvals" subtitle="Requests waiting for your action.">
      {isLoading && (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--border)]" />)}
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-2xl">✓</p>
          <p className="mt-1 text-sm font-medium text-[var(--text)]">All clear</p>
          <p className="text-xs text-[var(--muted)]">No pending approvals.</p>
        </div>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/approvals/${item.id}`}
            className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] p-3 text-sm transition hover:bg-[var(--border)]/20"
          >
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight">{item.title}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {item.requester?.name ?? "Unknown"} · {item.type}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Pending
            </span>
          </Link>
        ))}
      </div>
      {items.length > 0 && (
        <Link to="/approvals" className="mt-3 block text-center text-xs font-medium text-[var(--primary)] hover:underline">
          View all approvals →
        </Link>
      )}
    </ChartCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ManagementDashboard({ roleName }: { roleName: string }) {
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const stored = localStorage.getItem("dashboard-currency");
    return CURRENCY_OPTIONS.some((c) => c.code === stored) ? (stored as CurrencyCode) : "PKR";
  });

  function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);
    localStorage.setItem("dashboard-currency", code);
  }

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    retry: false,
  });

  const { data: insights } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    retry: false,
  });

  const quickActions = [
    { label: "Add Employee",  to: "/employees/new" },
    { label: "Attendance",    to: "/attendance" },
    { label: "Leaves",        to: "/leaves" },
    { label: "Approvals",     to: "/approvals" },
    { label: "Payroll",       to: "/payroll" },
    { label: "Recruitment",   to: "/recruitment" },
    { label: "Performance",   to: "/performance" },
    { label: "Reports",       to: "/reports" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={`${roleName} Dashboard`}
          subtitle={`Workforce metrics as of ${insights?.as_of_date ?? new Date().toISOString().slice(0, 10)}.`}
        />
        {/* Currency selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[var(--muted)]">Currency</label>
          <select
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          Backend unavailable. Confirm Laravel is running and your token is valid.
        </div>
      )}

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="Total Employees"
          value={isLoading ? "…" : String(summary?.employees ?? 0)}
          hint={`${summary?.active_employees ?? 0} active`}
          tone="from-slate-50 to-white"
        />
        <SummaryCard
          title="Present Today"
          value={isLoading ? "…" : `${summary?.attendance_rate ?? 0}%`}
          hint="Attendance rate"
          tone="from-cyan-50 to-white"
        />
        <SummaryCard
          title="Pending Leaves"
          value={isLoading ? "…" : String(summary?.pending_leaves ?? 0)}
          hint="Awaiting approval"
          tone="from-amber-50 to-white"
        />
        <SummaryCard
          title="Pending Payrolls"
          value={isLoading ? "…" : String(summary?.pending_payrolls ?? 0)}
          hint="Need processing"
          tone="from-rose-50 to-white"
        />
        <SummaryCard
          title="Monthly Payroll"
          value={isLoading ? "…" : formatPayroll(Number(summary?.monthly_payroll ?? 0), currency)}
          hint={`${summary?.month ?? "—"} / ${summary?.year ?? "—"}`}
          tone="from-emerald-50 to-white"
        />
      </section>

      {/* Charts row */}
      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Attendance Trend" subtitle="Last 7 days — daily attendance rate.">
          <AttendanceTrendChart points={insights?.attendance_trend ?? []} />
        </ChartCard>
        <ChartCard title="Department Distribution" subtitle="Headcount per department.">
          <DeptBarChart items={insights?.department_distribution ?? []} />
        </ChartCard>
        <ChartCard title="Leave Status" subtitle="Breakdown by leave type.">
          <LeaveDonut items={insights?.leave_breakdown ?? []} />
        </ChartCard>
      </section>

      {/* Bottom row */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TableWidget
            title="Recent Employees"
            headers={["#", "Name", "Department", "Status", "Joined"]}
            rows={(insights?.recent_employees ?? []).map((row) => [
              row.employee_number,
              row.name,
              row.department,
              <span
                key={row.id}
                className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                  row.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {row.status}
              </span>,
              row.joined_at ?? "—",
            ])}
          />
        </div>

        <div className="space-y-4">
          <PendingApprovalsWidget />

          <ChartCard title="Quick Actions" subtitle="Jump into common admin workflows.">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="rounded-xl border border-[var(--border)] bg-white/70 p-3 text-center text-sm font-medium text-[var(--text)] transition hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </ChartCard>
        </div>
      </section>
    </div>
  );
}