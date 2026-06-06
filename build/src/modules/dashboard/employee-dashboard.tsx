import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { getWorkspaceDashboard } from "@/services/dashboard-service";
import { isSuperAdminRole } from "@/config/rbac";
import { useAuthStore } from "@/store/auth-store";
import { apiClient } from "@/services/api-client";
import {
  SummaryCard,
  ChartCard,
  ActivityFeed,
  AttendanceWidget,
  AnnouncementWidget,
  NotificationWidget,
  TableWidget,
} from "./dashboard-widgets";

function formatClock(value?: string | null) {
  if (!value) return "—";
  return value.length >= 16 ? value.slice(11, 16) : value;
}

function formatCurrency(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return String(value);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ─── Check-in / Check-out card ────────────────────────────────────────────────
function AttendanceActionCard({
  today,
  employeeId,
}: {
  today: { status: string; check_in?: string | null; check_out?: string | null; date?: string } | null;
  employeeId: number;
}) {
  const queryClient = useQueryClient();

  const checkInMutation = useMutation({
    mutationFn: () => apiClient(`/attendance/check-in`, { method: "POST", body: JSON.stringify({ employee_id: employeeId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", "workspace"] }),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => apiClient(`/attendance/check-out`, { method: "POST", body: JSON.stringify({ employee_id: employeeId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", "workspace"] }),
  });

  const checkedIn  = !!today?.check_in;
  const checkedOut = !!today?.check_out;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Today's attendance</p>
        <p className="mt-1 text-sm font-medium text-[var(--text)]">{today?.date ?? new Date().toISOString().slice(0, 10)}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
          {today?.check_in  && <span>In:  <span className="font-medium text-[var(--text)]">{formatClock(today.check_in)}</span></span>}
          {today?.check_out && <span>Out: <span className="font-medium text-[var(--text)]">{formatClock(today.check_out)}</span></span>}
          {today?.status && (
            <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${
              today.status === "present" ? "bg-emerald-50 text-emerald-700" :
              today.status === "late"    ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700"
            }`}>
              {today.status}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {!checkedIn && (
          <button
            onClick={() => checkInMutation.mutate()}
            disabled={checkInMutation.isPending}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {checkInMutation.isPending ? "Checking in…" : "✓ Check In"}
          </button>
        )}
        {checkedIn && !checkedOut && (
          <button
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
          >
            {checkOutMutation.isPending ? "Checking out…" : "✗ Check Out"}
          </button>
        )}
        {checkedIn && checkedOut && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
            ✓ Day complete
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmployeeDashboard() {
  const user = useAuthStore((state) => state.user);
  const employeeId = user?.employee?.id ?? 0;

  const workspaceQuery = useQuery({
    queryKey: ["dashboard", "workspace"],
    queryFn: getWorkspaceDashboard,
    retry: false,
  });

  const data = workspaceQuery.data;
  const totalRemainingLeave  = data?.leave.balances.reduce((acc, item) => acc + item.remaining_days, 0) ?? 0;
  const unreadNotifications  = data?.notifications.filter((item) => !item.is_read).length ?? 0;
  const latestPayslip        = data?.payroll.latest_payslip;
  const todayLabel           = data?.attendance.today?.date ?? new Date().toISOString().slice(0, 10);
  const departmentName       = data?.employee?.department?.name ?? "your team";
  const showRestrictedLinks  = isSuperAdminRole(user);

  const quickActions = [
    { label: "View Profile",   to: "/profile" },
    { label: "Attendance",     to: "/attendance" },
    { label: "Request Leave",  to: "/leaves" },
    { label: "My Payslips",    to: "/payroll?tab=payslips" },
    { label: "Documents",      to: "/employee-documents" },
    ...(showRestrictedLinks ? [{ label: "Notifications", to: "/notifications" }] : []),
    { label: "Chat",           to: "/chat" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Dashboard"
        subtitle={`Self-service workspace for ${data?.role_name ?? "Employee"} in ${departmentName}.`}
      />

      {/* Hero + quick actions */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.14),transparent_35%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Employee workspace</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">{todayLabel}</span>
            </div>
            <div className="mt-5 max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome back, {data?.employee?.name ?? user?.name ?? "Employee"}.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Your day at a glance — attendance, leave balance, payroll status, and team updates are all below.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Department</p>
                <p className="mt-1 font-medium">{departmentName}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Today's status</p>
                <p className="mt-1 font-medium capitalize">{data?.attendance.today?.status ?? "No record"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Unread notices</p>
                <p className="mt-1 font-medium">{unreadNotifications}</p>
              </div>
            </div>
          </div>
        </div>

        <ChartCard title="Quick Actions" subtitle="Jump straight to the most-used tasks." className="border-white/70 bg-white/85 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex min-h-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/85 px-3 py-3 text-center text-sm font-medium text-[var(--text)] transition hover:-translate-y-0.5 hover:border-[var(--primary)]/25 hover:bg-[var(--primary)]/6 hover:shadow-sm"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </ChartCard>
      </section>

      {/* Check-in / check-out card — always visible */}
      {employeeId > 0 && (
        <AttendanceActionCard today={data?.attendance.today ?? null} employeeId={employeeId} />
      )}

      {/* KPI summary cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Today"
          value={data?.attendance.today?.status ?? "No record"}
          hint={`${formatClock(data?.attendance.today?.check_in)} in / ${formatClock(data?.attendance.today?.check_out)} out`}
          tone="from-cyan-50 via-white to-white"
        />
        <SummaryCard
          title="Leave balance"
          value={String(totalRemainingLeave)}
          hint={`${data?.leave.balances.length ?? 0} leave types tracked`}
          tone="from-emerald-50 via-white to-white"
        />
        <SummaryCard
          title="Unread notices"
          value={String(unreadNotifications)}
          hint="Notifications waiting in your inbox"
          tone="from-amber-50 via-white to-white"
        />
        <SummaryCard
          title="Latest payslip"
          value={latestPayslip ? formatCurrency(latestPayslip.payroll?.net_salary) : "Unavailable"}
          hint={latestPayslip ? `Issued ${latestPayslip.issue_date}` : "No payslip yet"}
          tone="from-sky-50 via-white to-white"
        />
      </section>

      {/* Attendance + payslip */}
      <section className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <AttendanceWidget title="Attendance snapshot" today={data?.attendance.today ?? null} recent={data?.attendance.recent ?? []} />
        </div>
        <div className="space-y-4 xl:col-span-5">
          <ChartCard title="Latest Payslip" subtitle="Your most recent payroll statement.">
            {latestPayslip ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Slip number</p>
                  <p className="mt-1 font-medium">{latestPayslip.slip_number}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Issue date</p>
                    <p className="mt-1 font-medium">{latestPayslip.issue_date}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Status</p>
                    <p className="mt-1 font-medium capitalize">{latestPayslip.status}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Net salary</p>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(latestPayslip.payroll?.net_salary)}</p>
                </div>
                {latestPayslip.file_url && (
                  <a href={latestPayslip.file_url} target="_blank" rel="noreferrer"
                    className="inline-flex rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                    Download payslip
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No payslip has been published yet.</p>
            )}
          </ChartCard>

          {/* Leave request shortcut */}
          <Link
            to="/leaves"
            className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:bg-[var(--border)]/20"
          >
            <div>
              <p className="text-sm font-semibold">Request Leave</p>
              <p className="text-xs text-[var(--muted)]">{totalRemainingLeave} days remaining</p>
            </div>
            <span className="text-[var(--primary)]">→</span>
          </Link>
        </div>
      </section>

      {/* Leave balances + holidays */}
      <section className="grid gap-4 xl:grid-cols-2">
        <TableWidget
          title="Leave balances"
          headers={["Type", "Allocated", "Used", "Remaining"]}
          rows={(data?.leave.balances ?? []).map((item) => [
            item.name,
            item.default_days,
            item.used_days,
            <span key={item.id} className={`font-semibold ${item.remaining_days > 0 ? "text-emerald-600" : "text-red-500"}`}>
              {item.remaining_days}
            </span>,
          ])}
        />
        <TableWidget
          title="Upcoming holidays"
          headers={["Name", "Date", "Optional"]}
          rows={(data?.calendar.upcoming_holidays ?? []).map((item) => [
            item.name,
            item.date,
            item.is_optional
              ? <span key={item.id} className="text-amber-600">Optional</span>
              : <span key={item.id} className="text-emerald-600">Public</span>,
          ])}
        />
      </section>

      {/* Announcements + notifications + tasks */}
      <section className="grid gap-4 xl:grid-cols-3">
        <AnnouncementWidget title="Announcements" announcements={data?.announcements ?? []} />
        <NotificationWidget title="Notifications" notifications={data?.notifications ?? []} />
        <ActivityFeed
          title="Tasks and reminders"
          items={(data?.tasks ?? []).map((item) => ({
            id: item.id,
            label: item.title,
            description: item.details,
            status: item.status,
          }))}
        />
      </section>
    </div>
  );
}