import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { getDashboardInsights, getDashboardSummary } from "@/services/dashboard-service";
import { SummaryCard, ChartCard, TableWidget } from "./dashboard-widgets";

const CURRENCY_OPTIONS = [
  { code: "USD", symbol: "$", label: "USD - US Dollar" },
  { code: "PKR", symbol: "Rs", label: "PKR - Pakistani Rupee" },
  { code: "EUR", symbol: "€", label: "EUR - Euro" },
  { code: "GBP", symbol: "£", label: "GBP - British Pound" },
  { code: "SAR", symbol: "﷼", label: "SAR - Saudi Riyal" },
  { code: "AED", symbol: "د.إ", label: "AED - UAE Dirham" },
  { code: "INR", symbol: "₹", label: "INR - Indian Rupee" },
] as const;

type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];

function formatMonthlyPayroll(amount: number, currency: CurrencyCode) {
  const option = CURRENCY_OPTIONS.find((item) => item.code === currency);
  return `${option?.symbol ?? currency} ${Number(amount).toLocaleString()}`;
}

function LineChart({ points }: { points: Array<{ label: string; rate: number }> }) {
  if (!points.length) return <p className="text-sm text-[var(--muted)]">No attendance data yet.</p>;
  const width = 320;
  const height = 160;
  const max = Math.max(...points.map((p) => p.rate), 100);
  const coords = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * (width - 20) + 10;
      const y = height - (point.rate / max) * (height - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <polyline fill="none" stroke="var(--primary)" strokeWidth="3" points={coords} />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
        {points.map((p) => <span key={p.label}>{p.label}</span>)}
      </div>
    </div>
  );
}

function BarChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-[var(--muted)]">No department data yet.</p>}
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{item.label}</span>
            <span className="text-[var(--muted)]">{item.value}</span>
          </div>
          <div className="h-2 rounded bg-[var(--border)]">
            <div className="h-2 rounded bg-[var(--primary)]" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PieChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const total = items.reduce((acc, item) => acc + item.value, 0);
  const colors = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
  let start = 0;
  const segments = items.map((item, index) => {
    const percent = total > 0 ? item.value / total : 0;
    const end = start + percent * 360;
    const segment = { ...item, start, end, color: colors[index % colors.length] };
    start = end;
    return segment;
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-32 w-32 -rotate-90">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--border)" strokeWidth="8" />
        {segments.map((segment) => {
          const circumference = 100;
          const arc = total > 0 ? ((segment.end - segment.start) / 360) * circumference : 0;
          const offset = (segment.start / 360) * circumference;
          return <circle key={segment.label} cx="21" cy="21" r="15.915" fill="transparent" stroke={segment.color} strokeWidth="8" strokeDasharray={`${arc} ${circumference - arc}`} strokeDashoffset={-offset} />;
        })}
      </svg>
      <div className="space-y-1 text-sm">
        {items.length === 0 && <p className="text-[var(--muted)]">No leave data yet.</p>}
        {items.map((item, index) => (
          <p key={item.label}><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{item.label}: {item.value}</p>
        ))}
      </div>
    </div>
  );
}

export function ManagementDashboard({ roleName }: { roleName: string }) {
  const [currency] = useState<CurrencyCode>(() => {
    if (typeof window === "undefined") return "USD";
    const stored = window.localStorage.getItem("dashboard-currency");
    return CURRENCY_OPTIONS.some((item) => item.code === stored) ? (stored as CurrencyCode) : "USD";
  });

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    retry: false
  });

  const { data: insights } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    retry: false
  });

  const quickActions = [
    { label: "Add Employee", to: "/employees/new" },
    { label: "Attendance", to: "/attendance" },
    { label: "Leaves", to: "/leaves" },
    { label: "Approvals", to: "/approvals" },
    { label: "Workflows", to: "/workflows" },
    { label: "Payroll", to: "/payroll" },
    { label: "Recruitment", to: "/recruitment" },
    { label: "Performance", to: "/performance" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`${roleName} Dashboard`} subtitle={`Real-time workforce metrics as of ${insights?.as_of_date ?? new Date().toISOString().slice(0, 10)}.`} />
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Backend dashboard summary is unavailable. Confirm Laravel is running on http://127.0.0.1:8000 and the user token is valid.
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Total Employees" value={isLoading ? "..." : String(summary?.employees ?? 0)} hint={`${summary?.active_employees ?? 0} active`} tone="from-slate-50 to-white" />
        <SummaryCard title="Present Today" value={isLoading ? "..." : `${summary?.attendance_rate ?? 0}%`} hint="Attendance rate" tone="from-cyan-50 to-white" />
        <SummaryCard title="Pending Leaves" value={isLoading ? "..." : String(summary?.pending_leaves ?? 0)} hint="Awaiting approval" tone="from-amber-50 to-white" />
        <SummaryCard title="Payroll Status" value={isLoading ? "..." : String(summary?.pending_payrolls ?? 0)} hint="Pending payrolls" tone="from-rose-50 to-white" />
        <SummaryCard
          title="Monthly Payroll"
          value={isLoading ? "..." : formatMonthlyPayroll(Number(summary?.monthly_payroll ?? 0), currency)}
          hint={`${summary?.month ?? "-"} / ${summary?.year ?? "-"}`}
          tone="from-emerald-50 to-white"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Attendance Trend (7 Days)">
          <LineChart points={insights?.attendance_trend ?? []} />
        </ChartCard>
        <ChartCard title="Department Distribution">
          <BarChart items={insights?.department_distribution ?? []} />
        </ChartCard>
        <ChartCard title="Leave Status Split">
          <PieChart items={insights?.leave_breakdown ?? []} />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TableWidget
            title="Recent Employees"
            headers={["ID", "Name", "Department", "Status", "Joined"]}
            rows={(insights?.recent_employees ?? []).map((row) => [
              row.employee_number,
              row.name,
              row.department,
              row.status,
              row.joined_at ?? "-",
            ])}
          />
        </div>
        <ChartCard title="Quick Actions" subtitle="Jump into common admin workflows.">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="rounded-2xl border border-[var(--border)] bg-white/70 p-3 text-center font-medium text-[var(--text)] transition hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5">
                {action.label}
              </Link>
            ))}
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
