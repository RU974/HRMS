import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { StatsCard } from "@/components/cards/stats-card";
import { Card } from "@/components/ui/card";
import { getDashboardInsights, getDashboardSummary } from "@/services/dashboard-service";

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

export function DashboardPage() {
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
    { label: "Payroll", to: "/payroll" },
    { label: "Recruitment", to: "/recruitment" },
    { label: "Performance", to: "/performance" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="HR Dashboard" subtitle={`Real-time workforce metrics as of ${insights?.as_of_date ?? new Date().toISOString().slice(0, 10)}.`} />
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Backend dashboard summary is unavailable. Confirm Laravel is running on http://127.0.0.1:8000 and the user token is valid.
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatsCard title="Total Employees" value={isLoading ? "..." : String(summary?.employees ?? 0)} trend={`${summary?.active_employees ?? 0} active`} />
        <StatsCard title="Present Today" value={isLoading ? "..." : `${summary?.attendance_rate ?? 0}%`} trend="Attendance rate" />
        <StatsCard title="Pending Leaves" value={isLoading ? "..." : String(summary?.pending_leaves ?? 0)} trend="Awaiting approval" />
        <StatsCard title="Payroll Status" value={isLoading ? "..." : String(summary?.pending_payrolls ?? 0)} trend="Pending payrolls" />
        <StatsCard title="Monthly Payroll" value={isLoading ? "..." : `$${Number(summary?.monthly_payroll ?? 0).toLocaleString()}`} trend={`${summary?.month ?? "-"} / ${summary?.year ?? "-"}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 font-semibold">Attendance Trend (7 Days)</h3>
          <LineChart points={insights?.attendance_trend ?? []} />
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Department Distribution</h3>
          <BarChart items={insights?.department_distribution ?? []} />
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Leave Status Split</h3>
          <PieChart items={insights?.leave_breakdown ?? []} />
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Recent Employees</h3>
            <Link to="/employees" className="text-sm text-[var(--primary)]">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Department</th><th className="p-2">Status</th><th className="p-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(insights?.recent_employees ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border)]/50">
                    <td className="p-2">{row.employee_number}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.department}</td>
                    <td className="p-2">{row.status}</td>
                    <td className="p-2">{row.joined_at ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold">Quick Actions</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="rounded-lg border border-[var(--border)] p-2 text-center hover:bg-[var(--border)]/30">
                {action.label}
              </Link>
            ))}
          </div>
          <h3 className="mt-5 font-semibold">Recent Activities</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>Track pending approvals from Leaves and Payroll modules.</li>
            <li>Review weekly attendance trend for absentee spikes.</li>
            <li>Use Recruitment and Performance actions for quick drill-down.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
