import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";

const reportAreas = [
  { title: "Attendance Reports", description: "Track present, absent, and late trends by month.", path: "/reports/attendance" },
  { title: "Employee Reports", description: "Review employee distribution and workforce status.", path: "/reports/employees" },
  { title: "Payroll Reports", description: "Monitor paid and pending payroll with salary totals.", path: "/reports/payroll" },
  { title: "Analytics Reports", description: "Cross-module HR analytics with consolidated KPIs.", path: "/reports/analytics" },
];

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Choose a focused report module." />
      <div className="grid gap-4 md:grid-cols-2">
        {reportAreas.map((area) => (
          <Link key={area.title} to={area.path}>
            <Card className="h-full border-[var(--border)]/70 transition hover:border-[var(--primary)]/50">
              <h3 className="text-lg font-semibold">{area.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{area.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
