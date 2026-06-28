import { useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { getDashboardSummary, getDashboardInsights } from "@/services/dashboard-service";
import { getActiveEmployees } from "@/services/employee-service";
import { listPendingApprovals, type PendingApprovalItem } from "@/services/approval-service";
import { SummaryCard, ChartCard, TableWidget } from "./dashboard-widgets";
import {
  Users, Clock, CalendarX, ClipboardList, ArrowRight,
  AlertCircle, TrendingUp, Building2, CheckSquare,
} from "lucide-react";

import { useChartJs } from "./use-chart-js";

function TeamAttendanceTrendChart({ points }: { points: Array<{ label: string; rate: number }> }) {
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
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,0.08)",
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#6366f1",
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
  if (!points.length) return <div className="flex h-44 items-center justify-center text-sm text-[var(--muted)]">No attendance data yet.</div>;
  return <div className="h-44"><canvas ref={ref} /></div>;
}

interface TeamMember {
  id: number;
  employee_number?: string | null;
  name: string;
  status: string;
  department?: { name: string } | null;
  designation?: { name: string } | null;
}

function QuickLink({ label, to, icon: Icon, desc, color }: { label: string; to: string; icon: React.ElementType; desc: string; color: string }) {
  return (
    <Link to={to}
      className={`flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition hover:-translate-y-0.5 hover:shadow-sm ${color}`}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/60">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
        <p className="text-xs text-[var(--muted)]">{desc}</p>
      </div>
      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
    </Link>
  );
}

export function DepartmentManagerDashboard({ roleName }: { roleName: string }) {
  const user = useAuthStore(s => s.user);

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

  const { data: teamMembersData } = useQuery({
    queryKey: ["dashboard-team-members"],
    queryFn: () => getActiveEmployees(10),
    retry: false,
  });

  const { data: pendingApprovalsData } = useQuery({
    queryKey: ["dashboard-pending-approvals"],
    queryFn: () => listPendingApprovals(5),
    retry: false,
  });

  const teamMembers = (teamMembersData?.data ?? []) as TeamMember[];
  const pendingApprovals = (pendingApprovalsData as { data?: PendingApprovalItem[] } | undefined)?.data ?? [];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const kpiCards = [
    {
      title: "Team Size",
      value: isLoading ? "…" : String(summary?.employees ?? 0),
      hint: `${summary?.active_employees ?? 0} active`,
      icon: <Users className="h-5 w-5" />,
      accent: "blue" as const,
    },
    {
      title: "Attendance Rate",
      value: isLoading ? "…" : `${summary?.attendance_rate ?? 0}%`,
      hint: "Team present today",
      icon: <Clock className="h-5 w-5" />,
      accent: "cyan" as const,
    },
    {
      title: "Pending Leaves",
      value: isLoading ? "…" : String(summary?.pending_leaves ?? 0),
      hint: "Awaiting your approval",
      icon: <CalendarX className="h-5 w-5" />,
      accent: "amber" as const,
    },
    {
      title: "Pending Approvals",
      value: String(pendingApprovals.length),
      hint: "Items in your queue",
      icon: <ClipboardList className="h-5 w-5" />,
      accent: "rose" as const,
    },
  ];

  const quickLinks = [
    { label: "Team Attendance", to: "/attendance",  icon: Clock,         desc: "View team check-ins",    color: "hover:bg-cyan-50"   },
    { label: "Leave Requests",  to: "/leaves",      icon: CalendarX,     desc: "Approve pending leaves", color: "hover:bg-amber-50"  },
    { label: "Team Members",    to: "/employees",   icon: Users,         desc: "Browse your team",       color: "hover:bg-blue-50"   },
    { label: "Approvals",       to: "/approvals",   icon: CheckSquare,   desc: "Review requests",        color: "hover:bg-violet-50" },
  ];

  return (
    <div className="space-y-6">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-purple-800 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-white/5" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-200">{greeting},</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{user?.name ?? "Manager"}</h1>
            <p className="mt-1 text-sm text-indigo-200">{roleName} · {insights?.as_of_date ?? new Date().toISOString().slice(0, 10)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <TrendingUp className="h-3 w-3" /> Team dashboard
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <Building2 className="h-3 w-3" /> {summary?.active_employees ?? "—"} active members
              </span>
            </div>
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
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(card => <SummaryCard key={card.title} {...card} />)}
      </section>

      {/* ── Quick links ── */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Quick Actions</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map(l => <QuickLink key={l.to} {...l} />)}
        </div>
      </section>

      {/* ── Charts row ── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Team Attendance Trend" subtitle="Daily rate — last 7 days (your team)">
          <TeamAttendanceTrendChart points={insights?.attendance_trend ?? []} />
        </ChartCard>

        <ChartCard
          title="Pending Approvals"
          subtitle="Requests awaiting your action"
          action={
            <Link to="/approvals" className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {pendingApprovals.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100">
                <CheckSquare className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">All clear</p>
              <p className="text-xs text-[var(--muted)]">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingApprovals.map(item => (
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
          )}
        </ChartCard>
      </section>

      {/* ── Team member table ── */}
      <section>
        <TableWidget
          title="Team Members"
          headers={["#", "Name", "Designation", "Department", "Status"]}
          rows={teamMembers.map(emp => [
            <span key="num" className="font-mono text-xs text-[var(--muted)]">{emp.employee_number ?? "—"}</span>,
            <Link key="name" to={`/employees/${emp.id}`} className="font-semibold text-[var(--primary)] hover:underline">{emp.name}</Link>,
            <span key="desig">{emp.designation?.name ?? "—"}</span>,
            <span key="dept">{emp.department?.name ?? "—"}</span>,
            <span key="status" className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
              emp.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}>{emp.status}</span>,
          ])}
        />
        {teamMembers.length >= 10 && (
          <div className="mt-3 text-center">
            <Link to="/employees" className="text-xs font-semibold text-[var(--primary)] hover:underline">
              View all team members →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
