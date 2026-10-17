import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import {
  getAttendanceDetailReport,
  getAttendanceReportSummary,
  type AttendanceDayCell,
  type AttendanceDetailEmployee,
} from "@/services/report-service";
import { getAttendanceByFilter } from "@/services/hr-management-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { ReportDrillDownPanel } from "@/modules/reports/report-drilldown";
import { ReportExportButtons } from "@/modules/reports/report-export-buttons";
import { formatMonthYear, monthNames } from "@/modules/reports/report-utils";
import { Chart } from "@/lib/chart-setup";

const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).filter((y) => y >= 2000);

const STATUS_COLORS: Record<string, string> = {
  present: "#22c55e",
  late:    "#f59e0b",
  absent:  "#ef4444",
  leave:   "#6366f1",
  half_day: "#06b6d4",
  missing_check_in: "#a855f7",
  missing_check_out: "#a855f7",
};

type ReportView = "overview" | "employees" | "departments" | "late" | "overtime" | "grid";

const VIEWS: { key: ReportView; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "employees", label: "By employee" },
  { key: "departments", label: "By department" },
  { key: "late", label: "Late arrivals" },
  { key: "overtime", label: "Overtime" },
  { key: "grid", label: "Monthly grid" },
];

const GRID_CODES: Record<string, string> = {
  present: "P",
  late: "L",
  absent: "A",
  leave: "LV",
  half_day: "HD",
  missing_check_in: "MI",
  missing_check_out: "MO",
};

const GRID_LEGEND: { status: string; label: string }[] = [
  { status: "present", label: "Present" },
  { status: "late", label: "Late" },
  { status: "absent", label: "Absent" },
  { status: "leave", label: "Leave" },
  { status: "half_day", label: "Half day" },
  { status: "missing_check_in", label: "Missing punch" },
];

const hours = (value: number) => `${value.toFixed(1)}h`;
const percent = (value: number | null) => (value == null ? "—" : `${value}%`);
const dayCell = (row: AttendanceDetailEmployee, day: number): AttendanceDayCell | undefined => row.days?.[String(day)];

function AttendanceTrendChart({ trendRows }: { trendRows: { label: string; total: number; loading: boolean }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (instanceRef.current) instanceRef.current.destroy();
    instanceRef.current = new Chart(ref.current, {
      type: "bar",
      data: {
        labels: trendRows.map((r) => r.label),
        datasets: [{
          label: "Total records",
          data: trendRows.map((r) => r.total),
          backgroundColor: "rgba(99,102,241,0.75)",
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y} records` } } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
    return () => { if (instanceRef.current) instanceRef.current.destroy(); };
  }, [trendRows]);

  return <div className="h-48"><canvas ref={ref} /></div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "right";
}

function DataTable<T>({ columns, rows, rowKey, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="rtable w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            {columns.map((c) => <th key={c.header} className={`p-2 ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-[var(--border)]/50">
              {columns.map((c) => (
                <td key={c.header} data-label={c.header} className={`p-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyGrid({ rows, daysInMonth, month, year }: { rows: AttendanceDetailEmployee[]; daysInMonth: number; month: number; year: number }) {
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekday = (d: number) => new Date(year, month - 1, d).getDay();

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-[var(--muted)]">No employees to show.</p>;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        {GRID_LEGEND.map((item) => (
          <span key={item.status} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS[item.status] }} />
            {GRID_CODES[item.status]} · {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-[var(--border)] bg-[var(--border)]/40" />Rest day</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--border)]/20">
              <th className="sticky left-0 z-10 min-w-[160px] bg-[var(--card)] p-2 text-left">Employee</th>
              {days.map((d) => (
                <th key={d} className={`min-w-[28px] p-1 text-center font-medium ${weekday(d) === 0 || weekday(d) === 6 ? "text-[var(--muted)]" : ""}`}>
                  <div>{d}</div>
                  <div className="text-[9px] font-normal">{"SMTWTFS"[weekday(d)]}</div>
                </th>
              ))}
              <th className="p-2 text-center">P</th>
              <th className="p-2 text-center">L</th>
              <th className="p-2 text-center">A</th>
              <th className="p-2 text-center">LV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employee_id} className="border-t border-[var(--border)]/60">
                <td className="sticky left-0 z-10 bg-[var(--card)] p-2">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-[10px] text-[var(--muted)]">{row.department}</div>
                </td>
                {days.map((d) => {
                  const cell = dayCell(row, d);
                  const color = cell ? STATUS_COLORS[cell.status] : undefined;
                  const title = cell
                    ? `${row.name} · ${d} ${monthNames[month - 1]} · ${cell.status.replace(/_/g, " ")}${cell.hours ? ` · ${hours(cell.hours)}` : ""}${cell.late_minutes ? ` · ${cell.late_minutes} min late` : ""}${cell.overtime ? ` · ${hours(cell.overtime)} overtime` : ""}`
                    : undefined;
                  return (
                    <td key={d} title={title} className={`p-0.5 text-center ${cell?.off ? "bg-[var(--border)]/30" : ""}`}>
                      {cell && (
                        <span
                          className="inline-flex h-6 min-w-[24px] items-center justify-center rounded px-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: color ?? "#94a3b8" }}
                        >
                          {GRID_CODES[cell.status] ?? "•"}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="p-2 text-center tabular-nums">{row.present}</td>
                <td className="p-2 text-center tabular-nums">{row.late}</td>
                <td className="p-2 text-center tabular-nums">{row.absent}</td>
                <td className="p-2 text-center tabular-nums">{row.leave}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AttendanceReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [view, setView] = useState<ReportView>("overview");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["reports", "attendance", "summary", month, year],
    queryFn: () => getAttendanceReportSummary(month, year),
  });

  const detailQuery = useQuery({
    queryKey: ["reports", "attendance", "detail", month, year],
    queryFn: () => getAttendanceDetailReport(month, year),
    enabled: view !== "overview",
  });
  const detail = detailQuery.data;

  const trendMonths = useMemo(() =>
    [2, 1, 0].map((offset) => {
      const d = new Date(year, month - 1 - offset, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }), [month, year]);

  const trendQueries = useQueries({
    queries: trendMonths.map((item) => ({
      queryKey: ["reports", "attendance", "trend", item.month, item.year],
      queryFn: () => getAttendanceReportSummary(item.month, item.year),
      staleTime: 300_000,
    })),
  });

  const trendRows = trendMonths.map((item, i) => ({
    label: formatMonthYear(item.month, item.year),
    total: trendQueries[i].data?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0,
    loading: trendQueries[i].isLoading,
  }));

  const rows = data ?? [];
  const [drillStatus, setDrillStatus] = useState<string | null>(null);

  const departmentOptions = useMemo(
    () => (detail?.departments ?? []).filter((d) => d.department_id != null).map((d) => ({ id: d.department_id as number, name: d.department })),
    [detail],
  );

  const employees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (detail?.employees ?? []).filter((e) =>
      (departmentId === "" || e.department_id === departmentId)
      && (needle === "" || e.name.toLowerCase().includes(needle) || (e.employee_number ?? "").toLowerCase().includes(needle)));
  }, [detail, departmentId, search]);

  const departments = useMemo(
    () => (detail?.departments ?? []).filter((d) => departmentId === "" || d.department_id === departmentId),
    [detail, departmentId],
  );

  const lateRows = useMemo(() => employees.filter((e) => e.late_count > 0).sort((a, b) => b.late_count - a.late_count || b.late_minutes - a.late_minutes), [employees]);
  const overtimeRows = useMemo(() => employees.filter((e) => e.overtime_hours > 0).sort((a, b) => b.overtime_hours - a.overtime_hours), [employees]);

  const kpi = useMemo(() => {
    const sum = (pick: (e: AttendanceDetailEmployee) => number) => employees.reduce((s, e) => s + pick(e), 0);
    const worked = sum((e) => e.days_worked);
    const absent = sum((e) => e.absent);
    return {
      hours: sum((e) => e.hours_worked),
      overtime: sum((e) => e.overtime_hours),
      lates: sum((e) => e.late_count),
      lateMinutes: sum((e) => e.late_minutes),
      rate: worked + absent > 0 ? Math.round((worked / (worked + absent)) * 1000) / 10 : null,
    };
  }, [employees]);

  const exportPath = view === "overview"
    ? `/reports/attendance?month=${month}&year=${year}`
    : `/reports/attendance/detail?month=${month}&year=${year}&view=${view}${departmentId !== "" ? `&department_id=${departmentId}` : ""}`;
  const exportName = view === "overview" ? `attendance-report-${year}-${month}` : `attendance-${view}-${year}-${month}`;

  const selectClass = "mt-1 block h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance Reports" subtitle="Monthly attendance by status, employee, department, lateness, overtime and day." />

      <Card>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-[var(--muted)]">
              Month
              <select className={selectClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {monthNames.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
              </select>
            </label>
            <label className="text-sm text-[var(--muted)]">
              Year
              <select className={selectClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            {view !== "overview" && (
              <>
                <label className="text-sm text-[var(--muted)]">
                  Department
                  <select className={selectClass} value={departmentId} onChange={(e) => setDepartmentId(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">All departments</option>
                    {departmentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                {(view === "employees" || view === "grid") && (
                  <label className="text-sm text-[var(--muted)]">
                    Employee
                    <input
                      className={`${selectClass} w-48`}
                      placeholder="Search name or number"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
          </div>
          <ReportExportButtons key={exportPath} path={exportPath} filename={exportName} />
        </div>

        <div className="mb-5 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3" role="tablist">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={view === item.key}
              onClick={() => setView(item.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${view === item.key ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)]/20"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === "overview" && (
          <>
            <h3 className="mb-3 text-base font-semibold">Summary — {formatMonthYear(month, year)}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rows.length === 0 && <p className="col-span-4 text-sm text-[var(--muted)]">No data available.</p>}
              {rows.map((item) => (
                <button
                  key={item.status}
                  type="button"
                  onClick={() => setDrillStatus(item.status)}
                  className="rounded-2xl border border-[var(--border)] p-4 text-left transition hover:border-[var(--primary)]/50 hover:bg-[var(--border)]/10"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.status] ?? "#94a3b8" }} />
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] capitalize">{item.status.replace(/_/g, " ")}</p>
                  </div>
                  <p className="text-2xl font-bold">{item.count ?? 0}</p>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <h4 className="mb-3 text-base font-semibold">3-Month Trend</h4>
              <AttendanceTrendChart trendRows={trendRows} />
            </div>
          </>
        )}

        {view !== "overview" && detailQuery.isLoading && <p className="py-6 text-center text-sm text-[var(--muted)]">Loading report...</p>}
        {view !== "overview" && detailQuery.error && <p className="py-6 text-center text-sm text-red-500">{(detailQuery.error as Error).message}</p>}

        {view !== "overview" && detail && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Employees" value={employees.length} />
              <Stat label="Attendance rate" value={percent(kpi.rate)} />
              <Stat label="Hours worked" value={hours(kpi.hours)} />
              <Stat label="Late arrivals" value={`${kpi.lates} (${kpi.lateMinutes} min)`} />
              <Stat label="Overtime" value={hours(kpi.overtime)} />
            </div>

            {view === "employees" && (
              <DataTable
                rows={employees}
                rowKey={(r) => r.employee_id}
                empty="No employees match."
                columns={[
                  { header: "Employee", render: (r) => <><div className="font-medium">{r.name}</div>{r.employee_number && <div className="text-xs text-[var(--muted)]">{r.employee_number}</div>}</> },
                  { header: "Department", render: (r) => r.department },
                  { header: "Present", align: "right", render: (r) => r.present },
                  { header: "Late", align: "right", render: (r) => r.late },
                  { header: "Absent", align: "right", render: (r) => r.absent },
                  { header: "Leave", align: "right", render: (r) => r.leave },
                  { header: "Half day", align: "right", render: (r) => r.half_day },
                  { header: "Hours", align: "right", render: (r) => hours(r.hours_worked) },
                  { header: "Avg / day", align: "right", render: (r) => hours(r.avg_hours) },
                  { header: "Overtime", align: "right", render: (r) => hours(r.overtime_hours) },
                  { header: "Attendance", align: "right", render: (r) => percent(r.attendance_rate) },
                ]}
              />
            )}

            {view === "departments" && (
              <DataTable
                rows={departments}
                rowKey={(r) => r.department_id ?? r.department}
                empty="No departments to show."
                columns={[
                  { header: "Department", render: (r) => <span className="font-medium">{r.department}</span> },
                  { header: "Headcount", align: "right", render: (r) => r.headcount },
                  { header: "Present", align: "right", render: (r) => r.present },
                  { header: "Late", align: "right", render: (r) => r.late },
                  { header: "Absent", align: "right", render: (r) => r.absent },
                  { header: "Leave", align: "right", render: (r) => r.leave },
                  { header: "Hours", align: "right", render: (r) => hours(r.hours_worked) },
                  { header: "Avg / day", align: "right", render: (r) => hours(r.avg_hours) },
                  { header: "Overtime", align: "right", render: (r) => hours(r.overtime_hours) },
                  { header: "Attendance", align: "right", render: (r) => percent(r.attendance_rate) },
                ]}
              />
            )}

            {view === "late" && (
              <DataTable
                rows={lateRows}
                rowKey={(r) => r.employee_id}
                empty="No late arrivals this month."
                columns={[
                  { header: "Employee", render: (r) => <span className="font-medium">{r.name}</span> },
                  { header: "Department", render: (r) => r.department },
                  { header: "Late days", align: "right", render: (r) => r.late_count },
                  { header: "Total minutes late", align: "right", render: (r) => r.late_minutes },
                  { header: "Avg minutes late", align: "right", render: (r) => (r.late_count ? Math.round((r.late_minutes / r.late_count) * 10) / 10 : 0) },
                  { header: "Early leaves", align: "right", render: (r) => r.early_leave_count },
                  {
                    header: "Dates",
                    render: (r) => Object.entries(r.days ?? {}).filter(([, c]) => c.late).map(([d]) => d).join(", "),
                  },
                ]}
              />
            )}

            {view === "overtime" && (
              <DataTable
                rows={overtimeRows}
                rowKey={(r) => r.employee_id}
                empty="No overtime this month."
                columns={[
                  { header: "Employee", render: (r) => <span className="font-medium">{r.name}</span> },
                  { header: "Department", render: (r) => r.department },
                  { header: "Overtime hours", align: "right", render: (r) => hours(r.overtime_hours) },
                  { header: "Days with overtime", align: "right", render: (r) => Object.values(r.days ?? {}).filter((c) => c.overtime > 0).length },
                  { header: "Total hours worked", align: "right", render: (r) => hours(r.hours_worked) },
                ]}
              />
            )}

            {view === "grid" && <MonthlyGrid rows={employees} daysInMonth={detail.days_in_month} month={month} year={year} />}
          </div>
        )}
      </Card>

      {view === "overview" && drillStatus && (
        <ReportDrillDownPanel
          title={`Attendance — ${drillStatus.replace(/_/g, " ")} (${formatMonthYear(month, year)})`}
          queryKey={["reports", "attendance", "drilldown", drillStatus, month, year]}
          queryFn={async () => {
            const response = await getAttendanceByFilter({ month, year, status: drillStatus, per_page: 25 });
            return response.data ?? [];
          }}
          rowKey={(row) => row.id}
          viewAllHref={`/attendance?status=${drillStatus}`}
          onClose={() => setDrillStatus(null)}
          columns={[
            { header: "Employee", render: (row) => row.employee?.name ?? `#${row.employee_id}` },
            { header: "Date", render: (row) => row.date },
            { header: "Check In", render: (row) => row.check_in ?? "—" },
            { header: "Check Out", render: (row) => row.check_out ?? "—" },
          ]}
        />
      )}

      <ReportCrudSection reportType="attendance" />
    </div>
  );
}
