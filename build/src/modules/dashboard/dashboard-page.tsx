import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { StatsCard } from "@/components/cards/stats-card";
import { ChartPlaceholder } from "@/components/charts/chart-placeholder";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/tables/data-table";
import { getDashboardSummary } from "@/services/dashboard-service";

export function DashboardPage() {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    retry: false
  });

  const panels = [
    { title: "Notifications", items: ["Policy acknowledgement due from 18 employees.", "Finance approved payroll variance report.", "Shift roster changed for Support Team B."] },
    { title: "Upcoming Birthdays", items: ["Adeel Ahmed - May 21", "Sara Malik - May 23", "Omar Farooq - May 28"] },
    { title: "New Joiners", items: ["Noor Fatima - People Ops", "Hamza Ali - Engineering", "Mariam Shah - Finance"] }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="HR Dashboard" subtitle="Real-time workforce metrics for modern enterprises." />
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
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartPlaceholder title="Attendance Trends" />
        <ChartPlaceholder title="Department Distribution" />
        <ChartPlaceholder title="Employee Growth" />
        <ChartPlaceholder title="Payroll Analytics" />
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><DataTable /></div>
        <Card>
          <h3 className="font-semibold">Recent Activities</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>Hina submitted leave request.</li>
            <li>Payroll batch finalized.</li>
            <li>2 candidates moved to interview.</li>
            <li>Performance cycle opened for Q2.</li>
          </ul>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        {panels.map((panel) => (
          <Card key={panel.title}>
            <h3 className="font-semibold">{panel.title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              {panel.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Card>
        ))}
      </section>
    </div>
  );
}


