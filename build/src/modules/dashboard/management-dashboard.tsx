import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { getDashboardInsights, getDashboardSummary } from "@/services/dashboard-service";
import { apiClient } from "@/services/api-client";
import { SummaryCard, ChartCard, TableWidget } from "./dashboard-widgets";
import {
  Users, Clock, CalendarX, Wallet, TrendingUp,
  UserPlus, ClipboardList, CalendarDays, CheckSquare,
  DollarSign, Briefcase, Target, BarChart3, ArrowRight,
  AlertCircle, TrendingDown, Activity, Award,
} from "lucide-react";

// ─── Currency ────────────────────────────────────────────────────────────────
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

// ─── Chart.js loader ─────────────────────────────────────────────────────────
declare global { interface Window { Chart: any; } }

function useChartJs(cb: () => void, deps: unknown[]) {
  useEffect(() => {
    if (window.Chart) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    s.onload = cb;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Line chart ──────────────────────────────────────────────────────────────
function AttendanceTrendChart({ points }: { points: Array<{ label: string; rate: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);

  useChartJs(() => {
    if (!ref.current || !points.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new window.Chart(ref.current, {
      type: "line",
      data: {
        labels: points.map(p => p.label),
        datasets: [{
          label: "Attendance %",
          data: points.map(p => p.rate),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.08)",
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#2563eb",
          pointBorderWidth: 2,
          tension: 0.45,
          fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#94a3b8", padding: 10, cornerRadius: 8 } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v: unknown) => `${v}%`, font: { size: 11 }, color: "#6b7280" }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { display: false } },
        },
      },
    });
  }, [points]);

  useEffect(() => () => { if (inst.current) inst.current.destroy(); }, []);
  if (!points.length) return <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">No attendance data yet.</div>;
  return <div className="h-48"><canvas ref={ref} /></div>;
}

// ─── Bar chart ───────────────────────────────────────────────────────────────
function DeptBarChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);
  const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

  useChartJs(() => {
    if (!ref.current || !items.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new window.Chart(ref.current, {
      type: "bar",
      data: {
        labels: items.map(i => i.label),
        datasets: [{
          label: "Employees",
          data: items.map(i => i.value),
          backgroundColor: items.map((_, idx) => COLORS[idx % COLORS.length] + "cc"),
          borderColor:      items.map((_, idx) => COLORS[idx % COLORS.length]),
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#94a3b8", padding: 10, cornerRadius: 8, callbacks: { label: (ctx: any) => ` ${ctx.parsed.x} employees` } } },
        scales: {
          x: { ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { color: "rgba(0,0,0,0.04)" } },
          y: { ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { display: false } },
        },
      },
    });
  }, [items]);

  useEffect(() => () => { if (inst.current) inst.current.destroy(); }, []);
  if (!items.length) return <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">No department data yet.</div>;
  return <div className="h-48"><canvas ref={ref} /></div>;
}

// ─── Doughnut chart ───────────────────────────────────────────────────────────
function LeaveDonut({ items }: { items: Array<{ label: string; value: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);
  const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

  useChartJs(() => {
    if (!ref.current || !items.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new window.Chart(ref.current, {
      type: "doughnut",
      data: {
        labels: items.map(i => i.label),
        datasets: [{ data: items.map(i => i.value), backgroundColor: COLORS, borderWidth: 3, borderColor: "#fff", hoverOffset: 8 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "68%",
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11 }, padding: 14, usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#94a3b8", padding: 10, cornerRadius: 8, callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed}` } },
        },
      },
    });
  }, [items]);

  useEffect(() => () => { if (inst.current) inst.current.destroy(); }, []);
  if (!items.length) return <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">No leave data yet.</div>;
  return <div className="h-52"><canvas ref={ref} /></div>;
}

// ─── Generic trend line chart ────────────────────────────────────────────────
function TrendLineChart({ points, label, color = "#10b981", prefix = "" }: {
  points: Array<{ label: string; value: number }>;
  label: string;
  color?: string;
  prefix?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);

  useChartJs(() => {
    if (!ref.current || !points.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new window.Chart(ref.current, {
      type: "line",
      data: {
        labels: points.map(p => p.label),
        datasets: [{
          label,
          data: points.map(p => p.value),
          borderColor: color,
          backgroundColor: color + "18",
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: "#fff",
          pointBorderColor: color,
          pointBorderWidth: 2,
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index", intersect: false,
            backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#94a3b8",
            padding: 10, cornerRadius: 8,
            callbacks: { label: (ctx: any) => ` ${prefix}${Number(ctx.parsed.y).toLocaleString()}` },
          },
        },
        scales: {
          y: { beginAtZero: false, ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { display: false } },
        },
      },
    });
  }, [points]);

  useEffect(() => () => { if (inst.current) inst.current.destroy(); }, []);
  if (!points.length) return <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]">No data yet.</div>;
  return <div className="h-40"><canvas ref={ref} /></div>;
}

// ─── Performance summary widget ───────────────────────────────────────────────
function PerformanceSummaryWidget({ data }: { data: import("@/services/dashboard-service").PerformanceSummary | null }) {
  if (!data) return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">No performance data.</div>
  );

  const stats = [
    { label: "Avg Goal Progress", value: `${data.avg_goal_progress}%`, icon: <Activity className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "KPI Achievement",   value: `${data.kpi_achievement_rate}%`, icon: <Award className="h-4 w-4" />, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Open Goals",        value: String(data.open_goals),          icon: <Target className="h-4 w-4" />, color: "text-amber-600",  bg: "bg-amber-50" },
    { label: "Completed Goals",   value: String(data.completed_goals),     icon: <CheckSquare className="h-4 w-4" />, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "Open Appraisals",   value: String(data.open_appraisals),     icon: <ClipboardList className="h-4 w-4" />, color: "text-rose-600", bg: "bg-rose-50" },
  ];

  return (
    <div className="space-y-2">
      {stats.map(s => (
        <div key={s.label} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${s.bg}`}>
            <span className={s.color}>{s.icon}</span>
          </div>
          <span className="flex-1 text-sm text-[var(--muted)]">{s.label}</span>
          <span className="text-sm font-bold text-[var(--text)]">{s.value}</span>
        </div>
      ))}
      <Link to="/performance" className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--background)]">
        View Performance <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ─── Attrition risk widget ────────────────────────────────────────────────────
function AttritionRiskWidget({ employees }: { employees: import("@/services/dashboard-service").AttritionRiskEmployee[] }) {
  if (!employees.length) return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100">
        <CheckSquare className="h-5 w-5 text-emerald-600" />
      </div>
      <p className="text-sm font-semibold text-[var(--text)]">No risk flags</p>
      <p className="text-xs text-[var(--muted)]">All employees within normal absence range</p>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            <th className="p-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Employee</th>
            <th className="p-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Dept</th>
            <th className="p-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Absence</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => {
            const riskColor = emp.absence_rate >= 50 ? "bg-rose-100 text-rose-700" : emp.absence_rate >= 35 ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700";
            return (
              <tr key={emp.id} className="border-b border-[var(--border)]/60 last:border-0 hover:bg-[var(--background)]">
                <td className="p-2.5 font-medium text-[var(--text)]">{emp.name}</td>
                <td className="p-2.5 text-[var(--muted)]">{emp.department}</td>
                <td className="p-2.5 text-right">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskColor}`}>
                    <TrendingDown className="h-3 w-3" />{emp.absence_rate}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-[var(--muted)]">Employees with ≥20% absence rate in the last 30 days</p>
    </div>
  );
}

// ─── Pending approvals ────────────────────────────────────────────────────────
interface PendingApproval {
  id: number; title: string; type: string;
  requester?: { name?: string } | null;
  created_at: string;
}

function PendingApprovalsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-pending-approvals"],
    queryFn: () => apiClient<{ data: PendingApproval[] }>("/approvals?status=pending&per_page=6"),
    retry: false,
  });
  const items = (data as { data?: PendingApproval[] } | undefined)?.data ?? [];

  return (
    <ChartCard
      title="Pending Approvals"
      subtitle="Requests awaiting your action"
      action={
        <Link to="/approvals" className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {isLoading && (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--border)]" />)}
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100">
            <CheckSquare className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">All clear</p>
            <p className="text-xs text-[var(--muted)]">No pending approvals</p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.map(item => (
          <Link key={item.id} to={`/approvals/${item.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm transition hover:border-amber-200 hover:bg-amber-50">
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--text)]">{item.title}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{item.requester?.name ?? "Unknown"} · {item.type}</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Pending</span>
          </Link>
        ))}
      </div>
    </ChartCard>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────
function QuickAction({ label, to, icon: Icon, color }: { label: string; to: string; icon: React.ElementType; color: string }) {
  return (
    <Link to={to}
      className={`group flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-transparent hover:shadow-md ${color}`}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/80 shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--text)]">{label}</span>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function ManagementDashboard({ roleName }: { roleName: string }) {
  const user = useAuthStore(s => s.user);
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const s = localStorage.getItem("dashboard-currency");
    return CURRENCY_OPTIONS.some(c => c.code === s) ? (s as CurrencyCode) : "PKR";
  });

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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const quickActions = [
    { label: "Add Employee",  to: "/employees/new",   icon: UserPlus,      color: "hover:bg-blue-50"   },
    { label: "Attendance",    to: "/attendance",       icon: Clock,         color: "hover:bg-cyan-50"   },
    { label: "Leaves",        to: "/leaves",           icon: CalendarDays,  color: "hover:bg-amber-50"  },
    { label: "Approvals",     to: "/approvals",        icon: CheckSquare,   color: "hover:bg-violet-50" },
    { label: "Payroll",       to: "/payroll",          icon: DollarSign,    color: "hover:bg-emerald-50"},
    { label: "Recruitment",   to: "/recruitment",      icon: Briefcase,     color: "hover:bg-rose-50"   },
    { label: "Performance",   to: "/performance",      icon: Target,        color: "hover:bg-orange-50" },
    { label: "Reports",       to: "/reports",          icon: BarChart3,     color: "hover:bg-slate-50"  },
  ];

  const kpiCards = [
    {
      title: "Total Employees",
      value: isLoading ? "…" : String(summary?.employees ?? 0),
      hint: `${summary?.active_employees ?? 0} active`,
      icon: <Users className="h-5 w-5" />,
      accent: "blue" as const,
    },
    {
      title: "Attendance Rate",
      value: isLoading ? "…" : `${summary?.attendance_rate ?? 0}%`,
      hint: "Present today",
      icon: <Clock className="h-5 w-5" />,
      accent: "cyan" as const,
    },
    {
      title: "Pending Leaves",
      value: isLoading ? "…" : String(summary?.pending_leaves ?? 0),
      hint: "Awaiting approval",
      icon: <CalendarX className="h-5 w-5" />,
      accent: "amber" as const,
    },
    {
      title: "Pending Payrolls",
      value: isLoading ? "…" : String(summary?.pending_payrolls ?? 0),
      hint: "Need processing",
      icon: <ClipboardList className="h-5 w-5" />,
      accent: "rose" as const,
    },
    {
      title: "Monthly Payroll",
      value: isLoading ? "…" : formatPayroll(Number(summary?.monthly_payroll ?? 0), currency),
      hint: `${summary?.month ?? "—"} / ${summary?.year ?? "—"}`,
      icon: <Wallet className="h-5 w-5" />,
      accent: "emerald" as const,
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--primary)] via-blue-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-white/5" />
          <div className="absolute right-1/3 top-0 h-px w-48 bg-white/20" />
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-200">{greeting},</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{user?.name ?? roleName}</h1>
            <p className="mt-1 text-sm text-blue-200">
              {roleName} · {insights?.as_of_date ?? new Date().toISOString().slice(0, 10)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <TrendingUp className="h-3 w-3" /> Workforce analytics
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <Users className="h-3 w-3" /> {summary?.active_employees ?? "—"} active employees
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-blue-200">Currency</label>
            <select
              value={currency}
              onChange={e => { setCurrency(e.target.value as CurrencyCode); localStorage.setItem("dashboard-currency", e.target.value); }}
              className="rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs text-white backdrop-blur focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code} className="text-slate-800">{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Backend unavailable — confirm Laravel is running and your token is valid.
        </div>
      )}

      {/* ── KPI cards ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map(card => (
          <SummaryCard key={card.title} {...card} />
        ))}
      </section>

      {/* ── Quick actions ── */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Quick Actions</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {quickActions.map(a => <QuickAction key={a.to} {...a} />)}
        </div>
      </section>

      {/* ── Charts row ── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Attendance Trend" subtitle="Daily rate — last 7 days">
          <AttendanceTrendChart points={insights?.attendance_trend ?? []} />
        </ChartCard>
        <ChartCard title="Department Headcount" subtitle="Employees per department">
          <DeptBarChart items={insights?.department_distribution ?? []} />
        </ChartCard>
        <ChartCard title="Leave Status" subtitle="Breakdown by type and status">
          <LeaveDonut items={insights?.leave_breakdown ?? []} />
        </ChartCard>
      </section>

      {/* ── Trend charts row ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly Payroll" subtitle="Net payroll disbursed — last 6 months">
          <TrendLineChart
            points={insights?.monthly_payroll_trend ?? []}
            label="Payroll"
            color="#10b981"
            prefix=""
          />
        </ChartCard>
        <ChartCard title="Headcount Growth" subtitle="Active employees at month-end — last 6 months">
          <TrendLineChart
            points={insights?.headcount_trend ?? []}
            label="Employees"
            color="#6366f1"
          />
        </ChartCard>
      </section>

      {/* ── Intelligence row ── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Performance Overview"
          subtitle="Goals, KPIs, and appraisals at a glance"
          action={
            <Link to="/performance" className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <PerformanceSummaryWidget data={insights?.performance_summary ?? null} />
        </ChartCard>

        <ChartCard
          title="Attrition Risk"
          subtitle="Employees with high absence rate (last 30 days)"
          action={
            <Link to="/attendance" className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
              Attendance <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <AttritionRiskWidget employees={insights?.attrition_risk ?? []} />
        </ChartCard>
      </section>

      {/* ── Bottom row ── */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TableWidget
            title="Recent Employees"
            headers={["#", "Name", "Department", "Status", "Joined"]}
            rows={(insights?.recent_employees ?? []).map(row => [
              <span key="num" className="font-mono text-xs text-[var(--muted)]">{row.employee_number}</span>,
              <span key="name" className="font-semibold text-[var(--text)]">{row.name}</span>,
              row.department,
              <span key="status" className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                row.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}>{row.status}</span>,
              <span key="joined" className="text-xs text-[var(--muted)]">{row.joined_at ?? "—"}</span>,
            ])}
          />
        </div>

        <div className="space-y-4">
          <PendingApprovalsWidget />
        </div>
      </section>
    </div>
  );
}