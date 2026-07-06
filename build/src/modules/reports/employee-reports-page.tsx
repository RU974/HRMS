import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getEmployeeReportSummary } from "@/services/report-service";
import { getEmployeesPage } from "@/services/employee-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { ReportDrillDownPanel } from "@/modules/reports/report-drilldown";
import { ReportExportButtons } from "@/modules/reports/report-export-buttons";

declare global { interface Window { Chart: any; } }

const STATUS_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#6366f1", "#0ea5e9"];

function EmployeeDonut({ rows }: { rows: { status: string; count: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    const init = () => {
      if (!ref.current || !rows.length) return;
      if (instanceRef.current) instanceRef.current.destroy();
      instanceRef.current = new window.Chart(ref.current, {
        type: "doughnut",
        data: {
          labels: rows.map((r) => r.status),
          datasets: [{ data: rows.map((r) => r.count), backgroundColor: STATUS_COLORS, borderWidth: 2, hoverOffset: 6 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "65%",
          plugins: {
            legend: { position: "right", labels: { font: { size: 11 }, usePointStyle: true } },
            tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed}` } },
          },
        },
      });
    };
    if (window.Chart) { init(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    script.onload = init;
    document.head.appendChild(script);
    return () => { if (instanceRef.current) instanceRef.current.destroy(); };
  }, [rows]);

  if (!rows.length) return <p className="text-sm text-[var(--muted)]">No data.</p>;
  return <div className="h-48"><canvas ref={ref} /></div>;
}

export function EmployeeReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "employees", "summary"],
    queryFn: getEmployeeReportSummary,
  });

  const rows = useMemo(() => data ?? [], [data]);
  const total = rows.reduce((s, r) => s + (r.count ?? 0), 0);
  const [drillStatus, setDrillStatus] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Employee Reports" subtitle="Workforce composition and status breakdown." />
        <ReportExportButtons path="/reports/employees" filename="employee-report" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold">Employee Status Summary</h3>
          {isLoading && <div className="h-48 animate-pulse rounded-xl bg-[var(--border)]" />}
          {!isLoading && <EmployeeDonut rows={rows.map((r) => ({ status: r.status, count: r.count ?? 0 }))} />}
        </Card>

        <Card>
          <h3 className="mb-4 text-base font-semibold">Breakdown Table</h3>
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Count</th>
                  <th className="p-3 text-right">% of total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={3} className="p-6 text-center text-sm text-[var(--muted)]">No data available.</td></tr>
                )}
                {isLoading && [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    {[1,2,3].map((j) => <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>)}
                  </tr>
                ))}
                {rows.map((item, i) => (
                  <tr
                    key={item.status}
                    className="cursor-pointer border-b border-[var(--border)]/50 hover:bg-[var(--border)]/20"
                    onClick={() => setDrillStatus(item.status)}
                  >
                    <td className="p-3" data-label="Status">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                        <span className="capitalize font-medium">{item.status}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-semibold" data-label="Count">{item.count ?? 0}</td>
                    <td className="p-3 text-right text-[var(--muted)]" data-label="% of total">
                      {total > 0 ? `${Math.round(((item.count ?? 0) / total) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length > 0 && (
                  <tr className="font-semibold">
                    <td className="p-3" data-label="Status">Total</td>
                    <td className="p-3 text-right" data-label="Count">{total}</td>
                    <td className="p-3 text-right" data-label="% of total">100%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {drillStatus && (
        <ReportDrillDownPanel
          title={`Employees — ${drillStatus}`}
          queryKey={["reports", "employees", "drilldown", drillStatus]}
          queryFn={async () => (await getEmployeesPage({ per_page: 25, status: drillStatus })).data ?? []}
          rowKey={(row) => row.id}
          viewAllHref={`/employees?status=${drillStatus}`}
          onClose={() => setDrillStatus(null)}
          columns={[
            { header: "Name", render: (row) => row.name },
            { header: "Email", render: (row) => row.email },
            { header: "Department", render: (row) => row.department?.name ?? "—" },
            { header: "Designation", render: (row) => row.designation ?? "—" },
          ]}
        />
      )}

      <ReportCrudSection reportType="employee" />
    </div>
  );
}