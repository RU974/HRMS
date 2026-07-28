import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkspaceDashboard } from "@/services/dashboard-service";
import { isSuperAdminRole } from "@/config/rbac";
import { useAuthStore } from "@/store/auth-store";
import { checkInAttendance, checkOutAttendance } from "@/services/hr-management-service";
import {
  SummaryCard, ChartCard, ActivityFeed,
  AttendanceWidget, AnnouncementWidget, NotificationWidget, TableWidget,
} from "./dashboard-widgets";
import {
  LogIn, LogOut, CheckCircle2, Clock, CalendarRange,
  FileText, MessageSquare, Bell, User, Briefcase,
  TrendingUp, CalendarDays, ArrowRight, AlertCircle,
  Wallet,
} from "lucide-react";
import { TicketStatsWidget } from "@/modules/tickets/ticket-stats-widget";

function fmt(v?: string | null) { return v?.slice(11, 16) ?? "—"; }
function fmtCurrency(v?: number | string | null) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ─── Status ring ──────────────────────────────────────────────────────────────
function StatusRing({ status }: { status: string | undefined }) {
  const cfg = {
    present: { color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Present" },
    late:    { color: "text-amber-500",   bg: "bg-amber-50",   ring: "ring-amber-200",   label: "Late"    },
    absent:  { color: "text-rose-500",    bg: "bg-rose-50",    ring: "ring-rose-200",    label: "Absent"  },
  }[status ?? ""] ?? { color: "text-slate-400", bg: "bg-slate-50", ring: "ring-slate-200", label: "No record" };

  return (
    <div className={`grid h-24 w-24 place-items-center rounded-full ring-4 ${cfg.ring} ${cfg.bg} shrink-0`}>
      <div className="text-center">
        <p className={`text-2xl font-black ${cfg.color}`}>{cfg.label[0]}</p>
        <p className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</p>
      </div>
    </div>
  );
}

// ─── Check-in / out ───────────────────────────────────────────────────────────
function CheckInCard({ today, employeeId }: {
  today: { status: string; check_in?: string | null; check_out?: string | null; date?: string } | null;
  employeeId: number;
}) {
  const qc = useQueryClient();

  const checkIn = useMutation({
    mutationFn: () => checkInAttendance(employeeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", "workspace"] }),
  });
  const checkOut = useMutation({
    mutationFn: () => checkOutAttendance(employeeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", "workspace"] }),
  });

  const checkedIn  = !!today?.check_in;
  const checkedOut = !!today?.check_out;
  const date = today?.date ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-center gap-5">
        <StatusRing status={today?.status} />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Today's Attendance</p>
          <p className="mt-0.5 text-sm font-bold text-[var(--text)]">{date}</p>

          <div className="mt-3 flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <LogIn className="h-3.5 w-3.5 text-emerald-500" />
              <span>In: <strong className="text-[var(--text)]">{fmt(today?.check_in)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <LogOut className="h-3.5 w-3.5 text-rose-500" />
              <span>Out: <strong className="text-[var(--text)]">{fmt(today?.check_out)}</strong></span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!checkedIn && (
              <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 shadow-sm">
                <LogIn className="h-4 w-4" />
                {checkIn.isPending ? "Checking in…" : "Check In"}
              </button>
            )}
            {checkedIn && !checkedOut && (
              <button onClick={() => checkOut.mutate()} disabled={checkOut.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 disabled:opacity-60 shadow-sm">
                <LogOut className="h-4 w-4" />
                {checkOut.isPending ? "Checking out…" : "Check Out"}
              </button>
            )}
            {checkedIn && checkedOut && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Day complete
              </div>
            )}
            <Link to="/attendance" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--background)]">
              Full log <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quick action button ───────────────────────────────────────────────────────
function QAction({ label, to, icon: Icon, desc }: { label: string; to: string; icon: React.ElementType; desc: string }) {
  return (
    <Link to={to}
      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition hover:-translate-y-0.5 hover:border-[var(--primary)]/30 hover:shadow-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary)]/10">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
        <p className="text-xs text-[var(--muted)]">{desc}</p>
      </div>
      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
    </Link>
  );
}

// ─── Leave balance bar ────────────────────────────────────────────────────────
function LeaveBalanceBar({ name, remaining, total }: { name: string; remaining: number; total: number }) {
  const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--text)]">{name}</span>
        <span className="text-[var(--muted)]">{remaining}/{total} days</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function EmployeeDashboard() {
  const user = useAuthStore(s => s.user);
  const employeeId = user?.employee?.id ?? 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "workspace"],
    queryFn: getWorkspaceDashboard,
    retry: false,
  });

  const totalRemaining  = data?.leave.balances.reduce((a, b) => a + b.remaining_days, 0) ?? 0;
  const unread          = data?.notifications.filter(n => !n.is_read).length ?? 0;
  const latestPayslip   = data?.payroll.latest_payslip;
  const dept            = data?.employee?.department?.name ?? "your team";
  const showAdminLinks  = isSuperAdminRole(user);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const quickActions = [
    { label: "My Profile",    to: "/profile",                  icon: User,          desc: "Update your details" },
    { label: "Attendance",    to: "/attendance",               icon: Clock,         desc: "View full log" },
    { label: "Request Leave", to: "/leaves",                   icon: CalendarRange, desc: `${totalRemaining} days left` },
    { label: "My Payslips",   to: "/profile?tab=payslips",     icon: Wallet,        desc: "Download payslips" },
    { label: "Documents",     to: "/employee-documents",       icon: FileText,      desc: "Your files" },
    { label: "Chat",          to: "/chat",                     icon: MessageSquare, desc: "Team messaging" },
    ...(showAdminLinks ? [{ label: "Notifications", to: "/notifications", icon: Bell, desc: `${unread} unread` }] : []),
  ];

  return (
    <div className="space-y-6">

      {/* ── Welcome banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.15),transparent_50%)]" />
          <div className="absolute bottom-0 left-0 h-3/4 w-1/2 bg-[radial-gradient(circle_at_20%_80%,rgba(34,197,94,0.12),transparent_50%)]" />
          {/* grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-slate-400">{greeting},</p>
            <h1 className="mt-0.5 text-3xl font-black tracking-tight">
              {data?.employee?.name ?? user?.name ?? "Employee"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium">
                <Briefcase className="h-3 w-3 text-sky-400" />
                {data?.employee?.designation?.name ?? "Employee"}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium">
                <TrendingUp className="h-3 w-3 text-emerald-400" />
                {dept}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium">
                <CalendarDays className="h-3 w-3 text-amber-400" />
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
          </div>

          {/* Mini KPI strip */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Leave Left",     value: String(totalRemaining),                color: "text-emerald-400" },
              { label: "Unread",         value: String(unread),                        color: "text-amber-400"   },
              { label: "Today",          value: data?.attendance.today?.status ?? "—", color: "text-sky-400"     },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-center backdrop-blur-sm">
                <p className={`text-xl font-black capitalize ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Could not load workspace data — check your connection.
        </div>
      )}

      {/* ── Check-in card ── */}
      {employeeId > 0 && (
        <CheckInCard today={data?.attendance.today ?? null} employeeId={employeeId} />
      )}

      {/* ── KPI row ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Today's Status"
          value={data?.attendance.today?.status ?? "No record"}
          hint={`${fmt(data?.attendance.today?.check_in)} in · ${fmt(data?.attendance.today?.check_out)} out`}
          icon={<Clock className="h-5 w-5" />}
          accent="cyan"
        />
        <SummaryCard
          title="Leave Balance"
          value={String(totalRemaining)}
          hint={`${data?.leave.balances.length ?? 0} leave types`}
          icon={<CalendarRange className="h-5 w-5" />}
          accent="emerald"
        />
        <SummaryCard
          title="Unread Notices"
          value={String(unread)}
          hint="Notifications pending"
          icon={<Bell className="h-5 w-5" />}
          accent="amber"
        />
        <SummaryCard
          title="Latest Payslip"
          value={latestPayslip ? fmtCurrency(latestPayslip.payroll?.net_salary) : "—"}
          hint={latestPayslip ? `Issued ${latestPayslip.issue_date}` : "No payslip yet"}
          icon={<Wallet className="h-5 w-5" />}
          accent="violet"
        />
      </section>

      {/* ── Quick actions ── */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Quick Actions</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.slice(0, 4).map(a => <QAction key={a.to} {...a} />)}
        </div>
        {quickActions.length > 4 && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.slice(4).map(a => <QAction key={a.to} {...a} />)}
          </div>
        )}
      </section>

      {/* ── Attendance + payslip ── */}
      <section className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <AttendanceWidget title="Attendance Snapshot" today={data?.attendance.today ?? null} recent={data?.attendance.recent ?? []} />
        </div>

        <div className="space-y-4 xl:col-span-5">
          {/* Leave balances visual */}
          <ChartCard title="Leave Balances" subtitle="Remaining days per leave type">
            {(data?.leave.balances ?? []).length === 0
              ? <p className="py-6 text-center text-xs text-[var(--muted)]">No leave types configured</p>
              : (
                <div className="space-y-4">
                  {(data?.leave.balances ?? []).map(b => (
                    <LeaveBalanceBar key={b.id} name={b.name} remaining={b.remaining_days} total={b.default_days} />
                  ))}
                  <Link to="/leaves" className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--background)]">
                    Request leave <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
          </ChartCard>

          {/* Latest payslip */}
          <ChartCard title="Latest Payslip" subtitle="Most recent payroll statement">
            {latestPayslip ? (
              <div className="space-y-2.5 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Slip #",      value: latestPayslip.slip_number },
                    { label: "Status",      value: latestPayslip.status },
                    { label: "Issue Date",  value: latestPayslip.issue_date },
                    { label: "Net Salary",  value: fmtCurrency(latestPayslip.payroll?.net_salary) },
                  ].map(row => (
                    <div key={row.label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">{row.label}</p>
                      <p className="mt-0.5 font-bold capitalize text-[var(--text)]">{row.value}</p>
                    </div>
                  ))}
                </div>
                {latestPayslip.file_url && (
                  <a href={latestPayslip.file_url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-2.5 text-sm font-bold text-white transition hover:opacity-90">
                    <FileText className="h-4 w-4" /> Download Payslip
                  </a>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-[var(--muted)]">No payslip published yet</p>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ── Upcoming holidays + recent leave requests ── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <TableWidget
          title="Upcoming Holidays"
          headers={["Holiday", "Date", "Type"]}
          rows={(data?.calendar.upcoming_holidays ?? []).map(h => [
            <span key="n" className="font-medium text-[var(--text)]">{h.name}</span>,
            <span key="d" className="text-xs text-[var(--muted)]">{h.date}</span>,
            h.is_optional
              ? <span key="t" className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Optional</span>
              : <span key="t" className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Public</span>,
          ])}
        />
        <TableWidget
          title="Recent Leave Requests"
          headers={["Type", "From", "To", "Status"]}
          rows={(data?.leave.recent_requests ?? []).map(r => [
            r.type,
            r.from_date,
            r.to_date,
            <span key="s" className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
              r.status === "approved" ? "bg-emerald-100 text-emerald-700" :
              r.status === "rejected" ? "bg-rose-100 text-rose-700" :
              "bg-amber-100 text-amber-700"
            }`}>{r.status}</span>,
          ])}
        />
      </section>

      {/* ── Ticket stats widget ── */}
      <TicketStatsWidget />

      {/* ── Announcements + notifications + tasks ── */}
      <section className="grid gap-4 xl:grid-cols-3">
        <AnnouncementWidget title="Announcements" announcements={data?.announcements ?? []} />
        <NotificationWidget title="Notifications" notifications={data?.notifications ?? []} />
        <ActivityFeed
          title="Tasks & Reminders"
          items={(data?.tasks ?? []).map(t => ({
            id: t.id, label: t.title, description: t.details, status: t.status,
          }))}
        />
      </section>
    </div>
  );
}