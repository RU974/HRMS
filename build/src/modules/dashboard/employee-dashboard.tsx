import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { getWorkspaceDashboard } from "@/services/dashboard-service";
import { SummaryCard, ChartCard, ActivityFeed, AttendanceWidget, AnnouncementWidget, NotificationWidget, TableWidget } from "./dashboard-widgets";

function formatClock(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.length >= 16 ? value.slice(11, 16) : value;
}

export function EmployeeDashboard() {
  const workspaceQuery = useQuery({
    queryKey: ["dashboard", "workspace"],
    queryFn: getWorkspaceDashboard,
    retry: false,
  });

  const data = workspaceQuery.data;
  const totalRemainingLeave = data?.leave.balances.reduce((acc, item) => acc + item.remaining_days, 0) ?? 0;
  const unreadNotifications = data?.notifications.filter((item) => !item.is_read).length ?? 0;
  const latestPayslip = data?.payroll.latest_payslip;

  const quickActions = [
    { label: "View Profile", to: "/profile" },
    { label: "Attendance", to: "/attendance" },
    { label: "Request Leave", to: "/leaves" },
    { label: "Payroll", to: "/payroll?tab=payslips" },
    { label: "Notifications", to: "/notifications" },
    { label: "Support", to: "/chat" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.employee?.name ?? "Employee Dashboard"}
        subtitle={`Self-service workspace for ${data?.role_name ?? "Employee"}${data?.employee?.department?.name ? ` in ${data.employee.department.name}` : ""}.`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Today"
          value={data?.attendance.today?.status ?? "No record"}
          hint={`${formatClock(data?.attendance.today?.check_in)} in / ${formatClock(data?.attendance.today?.check_out)} out`}
          tone="from-cyan-50 to-white"
        />
        <SummaryCard
          title="Leave balance"
          value={String(totalRemainingLeave)}
          hint={`${data?.leave.balances.length ?? 0} leave types tracked`}
          tone="from-emerald-50 to-white"
        />
        <SummaryCard
          title="Unread notices"
          value={String(unreadNotifications)}
          hint="Notifications waiting in your inbox"
          tone="from-amber-50 to-white"
        />
        <SummaryCard
          title="Latest payslip"
          value={latestPayslip ? `${latestPayslip.payroll?.net_salary ?? "0"}` : "Unavailable"}
          hint={latestPayslip ? `Issued ${latestPayslip.issue_date}` : "No issued payslip yet"}
          tone="from-sky-50 to-white"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AttendanceWidget
            title="Attendance snapshot"
            today={data?.attendance.today ?? null}
            recent={data?.attendance.recent ?? []}
          />
        </div>
        <div className="space-y-4">
          <ChartCard title="Quick Actions" subtitle="Jump straight to the most used employee tasks.">
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link key={action.to} to={action.to} className="rounded-2xl border border-[var(--border)] bg-white/70 px-3 py-3 text-center text-sm font-medium text-[var(--text)] transition hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5">
                  {action.label}
                </Link>
              ))}
            </div>
          </ChartCard>
          <ChartCard title="Latest Payslip" subtitle="Your most recent payroll statement.">
            {latestPayslip ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Slip number</p>
                  <p className="mt-1 font-medium">{latestPayslip.slip_number}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Issue date</p>
                    <p className="mt-1 font-medium">{latestPayslip.issue_date}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Status</p>
                    <p className="mt-1 font-medium">{latestPayslip.status}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Net salary</p>
                  <p className="mt-1 text-lg font-semibold">{latestPayslip.payroll?.net_salary ?? "-"}</p>
                </div>
                {latestPayslip.file_url ? (
                  <a href={latestPayslip.file_url} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                    Download payslip
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No issued payslip has been published yet.</p>
            )}
          </ChartCard>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TableWidget
          title="Leave balances"
          headers={["Type", "Allocated", "Used", "Remaining"]}
          rows={(data?.leave.balances ?? []).map((item) => [
            item.name,
            item.default_days,
            item.used_days,
            item.remaining_days,
          ])}
        />
        <TableWidget
          title="Upcoming holidays"
          headers={["Name", "Date", "Optional"]}
          rows={(data?.calendar.upcoming_holidays ?? []).map((item) => [
            item.name,
            item.date,
            item.is_optional ? "Yes" : "No",
          ])}
        />
      </section>

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
