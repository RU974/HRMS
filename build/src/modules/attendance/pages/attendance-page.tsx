import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { TimeInput24 } from "@/components/forms/time-input-24";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import {
  type AttendanceItem,
  type AttendanceMonthlyStats,
  type TeamDailyAttendanceRow,
  checkInAttendance,
  checkOutAttendance,
  createAttendance,
  deleteAttendance,
  updateAttendance,
  listAttendancePaginated,
  getEmployeeAttendanceCalendar,
  getEmployeeLeavesForMonth,
  getEmployeeAttendance,
  getTeamDailyAttendance,
  getAttendanceMonthlyStats,
  requestAttendanceCorrection,
  exportAttendanceCsv,
  importAttendanceCsv,
} from "@/services/hr-management-service";
import { getEmployees, getEmployeeOptions } from "@/services/employee-service";
import { useAuthStore } from "@/store/auth-store";

// ── Helpers ───────────────────────────────────────────────────────────────────
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: "bg-emerald-50 text-emerald-700",
    late:    "bg-amber-50 text-amber-700",
    absent:  "bg-red-50 text-red-700",
    leave:   "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "bg-gray-50 text-gray-700"}`}>
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source?: string | null }) {
  const map: Record<string, string> = {
    biometric: "bg-violet-50 text-violet-700",
    mobile:    "bg-sky-50 text-sky-700",
    web:       "bg-slate-50 text-slate-600",
    manual:    "bg-gray-50 text-gray-600",
  };
  const s = source ?? "manual";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[s] ?? "bg-gray-50 text-gray-600"}`}>
      {s}
    </span>
  );
}

// Hours elapsed since check-in and time left until the shift ends, for open records.
function ShiftProgress({ item, now }: { item: AttendanceItem; now: Date }) {
  if (!item.check_in || item.check_out) return <span className="text-[var(--muted)]">—</span>;

  const checkIn = new Date(item.check_in.replace(" ", "T"));
  const elapsedMs = now.getTime() - checkIn.getTime();
  if (Number.isNaN(elapsedMs) || elapsedMs < 0) return <span className="text-[var(--muted)]">—</span>;

  const fmt = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
  };

  let endLabel: string | null = null;
  let remaining: number | null = null;
  if (item.shift_end_time) {
    const [h, m] = item.shift_end_time.split(":").map(Number);
    const end = new Date(checkIn);
    end.setHours(h, m, 0, 0);
    if (end <= checkIn) end.setDate(end.getDate() + 1); // night shift ends next day
    endLabel = item.shift_end_time;
    remaining = end.getTime() - now.getTime();
  }

  return (
    <div className="text-xs leading-tight">
      <p className="font-semibold text-[var(--text)]">{fmt(elapsedMs)} on shift</p>
      {endLabel && (
        <p className={remaining !== null && remaining <= 0 ? "text-amber-600" : "text-[var(--muted)]"}>
          {remaining !== null && remaining <= 0 ? `Shift ended ${endLabel}` : `Ends ${endLabel} · ${fmt(remaining ?? 0)} left`}
        </p>
      )}
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────
const HALF_DAY_MAX_HOURS = 4.5;

function CalendarView({ ownEmployeeId, canPickEmployee }: { ownEmployeeId: number; canPickEmployee: boolean }) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState(ownEmployeeId);

  const options = useQuery({
    queryKey: ["employees-options"],
    queryFn: () => getEmployeeOptions(),
    enabled: canPickEmployee,
  });
  const empList = options.data?.data ?? [];

  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "calendar", employeeId, month, year],
    queryFn:  () => getEmployeeAttendanceCalendar(employeeId, month, year),
    enabled: employeeId > 0,
  });

  const leavesQuery = useQuery({
    queryKey: ["attendance", "calendar-leaves", employeeId, month, year],
    queryFn:  () => getEmployeeLeavesForMonth(employeeId, month, year),
    enabled: employeeId > 0,
  });

  const records: AttendanceItem[] = (data as { data?: AttendanceItem[] } | undefined)?.data ?? [];
  const byDate = Object.fromEntries(records.map(r => [r.date?.slice(0, 10), r]));

  // Dates covered by an approved half-day leave
  const halfDayLeaveDates = new Set<string>();
  for (const l of leavesQuery.data?.data ?? []) {
    if (l.half_day && l.status === "approved") halfDayLeaveDates.add(l.from_date.slice(0, 10));
  }

  function dayKind(rec: AttendanceItem | undefined, dateStr: string): string {
    if (!rec) return halfDayLeaveDates.has(dateStr) ? "halfday" : "";
    if (rec.status === "leave" && halfDayLeaveDates.has(dateStr)) return "halfday";
    if ((rec.status === "present" || rec.status === "late") && rec.check_out
      && rec.duration_hours != null && rec.duration_hours > 0 && rec.duration_hours < HALF_DAY_MAX_HOURS) return "halfday";
    return rec.status;
  }

  const daysInMonth  = new Date(year, month, 0).getDate();
  const firstDayDow  = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const paddingDays  = (firstDayDow + 6) % 7; // shift to Mon-start
  const monthLabel   = new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  const todayStr     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Night shifts (e.g. 20:00-05:00) check out the next calendar day.
  function isOvernight(rec: AttendanceItem): boolean {
    if (!rec.check_in || !rec.check_out) return false;
    return rec.check_out.slice(0, 10) > rec.check_in.slice(0, 10)
      || rec.check_out.slice(11, 16) < rec.check_in.slice(11, 16);
  }

  const statusStyle: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-800 border-emerald-200",
    late:    "bg-amber-100 text-amber-800 border-amber-200",
    absent:  "bg-red-100 text-red-800 border-red-200",
    leave:   "bg-blue-100 text-blue-800 border-blue-200",
    halfday: "bg-orange-100 text-orange-800 border-orange-200",
  };

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Attendance Calendar</h3>
        {canPickEmployee && (
          <select
            aria-label="Select employee"
            className={`${inputClass} max-w-[240px]`}
            value={employeeId || ""}
            onChange={e => setEmployeeId(Number(e.target.value))}
          >
            <option value="">Select employee…</option>
            {empList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" className="text-xs px-3 py-1.5" onClick={prevMonth}>←</Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Button variant="outline" className="text-xs px-3 py-1.5" onClick={nextMonth}>→</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-3">
        {[["present","bg-emerald-100 text-emerald-800"],["late","bg-amber-100 text-amber-800"],["absent","bg-red-100 text-red-800"],["leave","bg-blue-100 text-blue-800"],["halfday","bg-orange-100 text-orange-800"]].map(([s, cls]) => (
          <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{s === "halfday" ? "half day" : s}</span>
        ))}
        <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">no record</span>
      </div>

      {employeeId <= 0 && <p className="py-8 text-center text-sm text-[var(--muted)]">Select an employee to view their calendar.</p>}
      {employeeId > 0 && isLoading && <div className="h-48 animate-pulse rounded-xl bg-[var(--border)]" />}

      {employeeId > 0 && !isLoading && (
        <div className="grid grid-cols-7 gap-1">
          {/* Day headers */}
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{d}</div>
          ))}

          {/* Padding */}
          {Array.from({ length: paddingDays }).map((_, i) => <div key={`pad-${i}`} />)}

          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day    = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const rec    = byDate[dateStr];
            const kind   = dayKind(rec, dateStr);
            const dow    = new Date(year, month - 1, day).getDay();
            const isWeekend = (dow === 0 || dow === 6) && !rec;
            const isToday = dateStr === todayStr;

            return (
              <div key={day}
                className={`relative flex flex-col items-center justify-start rounded-xl border p-1.5 min-h-[84px] transition
                  ${kind ? `${statusStyle[kind] ?? "bg-gray-50 border-gray-200"} cursor-pointer hover:opacity-80` : isWeekend ? "border-[var(--border)] bg-[var(--border)]/40 text-[var(--muted)]" : "border-[var(--border)] bg-[var(--background)]"}
                  ${isToday ? "ring-2 ring-[var(--primary)] ring-offset-1" : ""}
                `}
                title={rec || kind ? `${kind === "halfday" ? "half day" : kind}${rec?.check_in ? ` · In: ${rec.check_in.slice(11,16)}` : ""}${rec?.check_out ? ` · Out: ${rec.check_out.slice(11,16)}${rec && isOvernight(rec) ? " (next day)" : ""}` : ""}` : isWeekend ? "Weekend" : ""}
              >
                <span className={`text-xs font-bold ${isToday ? "text-[var(--primary)]" : ""}`}>{day}</span>
                {kind === "halfday" && <span className="text-[9px] leading-tight font-semibold">½ day</span>}
                {rec && (
                  <div className="mt-1 flex w-full flex-col items-center gap-0.5">
                    {rec.check_in && (
                      <span className="text-[11px] leading-tight font-medium">
                        <span className="opacity-70">In</span> {rec.check_in.slice(11,16)}
                      </span>
                    )}
                    {rec.check_out ? (
                      <span className="text-[11px] leading-tight font-medium">
                        <span className="opacity-70">Out</span> {rec.check_out.slice(11,16)}
                        {isOvernight(rec) && <span className="ml-1 rounded bg-black/10 px-1 text-[9px] font-bold">+1 day</span>}
                      </span>
                    ) : rec.check_in && (
                      <span className="text-[10px] leading-tight italic opacity-70">{dateStr === todayStr ? "On shift" : "No check-out"}</span>
                    )}
                    {rec.work_from_home && <span className="text-[9px] leading-tight font-semibold opacity-80">WFH</span>}
                    {(rec.overtime_hours ?? 0) > 0 && <span className="text-[9px] leading-tight opacity-70">+{rec.overtime_hours?.toFixed(1)}h OT</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly summary */}
      {!isLoading && records.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
          {[
            { label: "Present", value: records.filter(r => r.status === "present").length, color: "text-emerald-600" },
            { label: "Late",    value: records.filter(r => r.status === "late").length,    color: "text-amber-600" },
            { label: "Half day", value: records.filter(r => dayKind(r, r.date.slice(0, 10)) === "halfday").length + [...halfDayLeaveDates].filter(d => !byDate[d]).length, color: "text-orange-600" },
            { label: "Absent",  value: records.filter(r => r.status === "absent").length,  color: "text-red-600" },
            { label: "Leave",   value: records.filter(r => r.status === "leave").length,   color: "text-blue-600" },
            { label: "WFH",     value: records.filter(r => r.work_from_home).length,       color: "text-violet-600" },
            {
              label: "Total OT",
              value: `${records.reduce((s, r) => s + (r.overtime_hours ?? 0), 0).toFixed(1)}h`,
              color: "text-[var(--primary)]",
            },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-center">
              <p className="text-xs text-[var(--muted)]">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Local calendar date (YYYY-MM-DD). toISOString() is UTC and shows tomorrow for users west of UTC in the evening.
function localDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ── Team view ─────────────────────────────────────────────────────────────────
function TeamView() {
  const today = localDateString(new Date());
  const [date, setDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "team-daily", date],
    queryFn:  () => getTeamDailyAttendance(date),
  });

  const teamRows: TeamDailyAttendanceRow[] = (data as TeamDailyAttendanceRow[] | undefined) ?? [];
  const { sorted: rows, sort, toggle: toggleSort } = useTableSort(teamRows, "name", {
    status: (r) => r.attendance?.status ?? "no record",
    check_in: (r) => r.attendance?.check_in,
    check_out: (r) => r.attendance?.check_out,
  });
  const present = rows.filter(r => r.attendance?.status === "present").length;
  const late    = rows.filter(r => r.attendance?.status === "late").length;
  const absent  = rows.filter(r => !r.attendance || r.attendance.status === "absent").length;
  const wfh     = rows.filter(r => r.attendance?.work_from_home).length;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Present", value: present, color: "text-emerald-600" },
          { label: "Late",    value: late,    color: "text-amber-600" },
          { label: "Absent",  value: absent,  color: "text-red-600" },
          { label: "WFH",     value: wfh,     color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
            <p className="text-xs text-[var(--muted)]">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Team Attendance</h3>
          <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} className="max-w-[160px]" />
        </div>

        {isLoading && <div className="h-40 animate-pulse rounded-xl bg-[var(--border)]" />}

        {!isLoading && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--muted)]">No team members found.</p>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <SortableTh label="Employee" sortKey="name" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Check In" sortKey="check_in" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Check Out" sortKey="check_out" sort={sort} onSort={toggleSort} />
                  <th className="p-3">Flags</th>
                  <SortableTh label="Monthly Abs." sortKey="monthly_absences" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const att = row.attendance;
                  const noRecord = !att;
                  const isAbsent = noRecord || att?.status === "absent";
                  const highAbsence = row.monthly_absences >= 3;

                  return (
                    <tr key={row.employee_id}
                      className={`border-b border-[var(--border)]/50 transition
                        ${isAbsent ? "bg-red-50/30" : "hover:bg-[var(--border)]/10"}`}
                    >
                      <td data-label="Employee" className="p-3">
                        <Link to={`/employees/${row.employee_id}`} className="font-medium text-[var(--primary)] hover:underline">
                          {row.name}
                        </Link>
                        {row.designation && <p className="text-xs text-[var(--muted)]">{row.designation}</p>}
                      </td>
                      <td data-label="Department" className="p-3 text-[var(--muted)]">{row.department ?? "—"}</td>
                      <td data-label="Status" className="p-3">
                        {att ? <StatusBadge status={att.status} /> : (
                          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">No record</span>
                        )}
                      </td>
                      <td data-label="Check In" className="p-3">{att?.check_in ? att.check_in.slice(11, 16) : "—"}</td>
                      <td data-label="Check Out" className="p-3">{att?.check_out ? <>{att.check_out.slice(11, 16)}{att.check_out.slice(0, 10) > String(att.date).slice(0, 10) && <span className="ml-1 text-xs text-[var(--muted)]">+1d</span>}</> : "—"}</td>
                      <td data-label="Flags" className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {att?.work_from_home && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">WFH</span>}
                          {att?.biometric_device_id && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">Bio</span>}
                          {(att?.overtime_hours ?? 0) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">+{att?.overtime_hours?.toFixed(1)}h OT</span>}
                        </div>
                      </td>
                      <td data-label="Monthly Abs." className="p-3">
                        <span className={`font-semibold ${highAbsence ? "text-red-600" : "text-[var(--muted)]"}`}>
                          {row.monthly_absences}
                          {highAbsence && <span className="ml-1 text-xs">⚠</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.some(r => r.monthly_absences >= 3) && (
          <p className="mt-3 text-xs text-red-600">⚠ Employees with 3+ absences this month are highlighted as at-risk.</p>
        )}
      </Card>
    </div>
  );
}

// ── Attendance form modal ─────────────────────────────────────────────────────
interface AttendanceFormProps {
  editing: AttendanceItem | null;
  today: string;
  employeeOptions: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function AttendanceFormModal({ editing, today, employeeOptions, onClose, onSaved }: AttendanceFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_id: editing?.employee_id ?? 0,
    date:        editing?.date?.slice(0, 10) ?? today,
    check_in:    editing?.check_in ? editing.check_in.slice(11, 16) : "",
    check_out:   editing?.check_out ? editing.check_out.slice(11, 16) : "",
    status:      (editing?.status ?? "present") as AttendanceItem["status"],
    work_from_home: editing?.work_from_home ?? false,
    notes:       editing?.notes ?? "",
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date:           form.date,
        check_in:       form.check_in || null,
        check_out:      form.check_out || null,
        status:         form.status,
        work_from_home: form.work_from_home,
        notes:          form.notes || null,
      };
      if (editing) return updateAttendance(editing.id, payload);
      return createAttendance({ ...payload, employee_id: form.employee_id });
    },
    onSuccess: () => onSaved(),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title={editing ? "Edit Attendance" : "New Attendance Record"} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); setError(null); void saveMutation.mutateAsync(); }}>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {!editing && (
          <FormField label="Employee">
            <select className={inputClass} value={form.employee_id}
              onChange={e => setForm(p => ({ ...p, employee_id: Number(e.target.value) }))} required>
              <option value={0}>Select employee</option>
              {employeeOptions.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </FormField>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Date">
            <FormInput type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
          </FormField>
          <FormField label="Status">
            <select className={inputClass} value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as AttendanceItem["status"] }))}>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
            </select>
          </FormField>
          <FormField label="Check in">
            <TimeInput24 clearable value={form.check_in} onChange={v => setForm(p => ({ ...p, check_in: v }))} />
          </FormField>
          <FormField label="Check out">
            <TimeInput24 clearable value={form.check_out} onChange={v => setForm(p => ({ ...p, check_out: v }))} />
          </FormField>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="wfh" className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
            checked={form.work_from_home}
            onChange={e => setForm(p => ({ ...p, work_from_home: e.target.checked }))} />
          <label htmlFor="wfh" className="text-sm font-medium text-[var(--text)] cursor-pointer">Work from home (remote)</label>
        </div>

        <FormField label="Notes">
          <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Optional notes..." />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = "records" | "calendar" | "team";

export function AttendancePage() {
  const queryClient = useQueryClient();
  const user        = useAuthStore(s => s.user);
  const canManage   = useAuthStore(s => s.hasPermission("attendance:manage_settings"));
  const canApprove  = useAuthStore(s => s.hasPermission("attendance:approve"));
  // Line managers (e.g. Department Manager): read-only access to their team
  const isLineManager = useAuthStore(s => s.hasPermission("employees:view") && !s.hasPermission("employees:view_all"));
  const seesTeam    = canManage || canApprove || isLineManager;
  const now         = useLiveClock();
  const today       = localDateString(now);

  const [tab, setTab]           = useState<Tab>("records");
  const [page, setPage]         = useState(1);
  const [globalError, setGlobalError]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<AttendanceItem | null>(null);
  const [correctionModal, setCorrectionModal] = useState<AttendanceItem | null>(null);
  const [correctionNote, setCorrectionNote]   = useState("");
  const [proposedIn, setProposedIn]     = useState("");
  const [proposedOut, setProposedOut]   = useState("");

  // Records filters (dates are "YYYY-MM-DD" or "" for unbounded)
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const listFilters = {
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo || undefined,
    status:   statusFilter || undefined,
  };

  // Month shown in the stats card (defaults to the current month)
  const [statsYear, setStatsYear]   = useState(new Date().getFullYear());
  const [statsMonth, setStatsMonth] = useState(new Date().getMonth() + 1);
  function shiftStatsMonth(delta: number) {
    const d = new Date(statsYear, statsMonth - 1 + delta, 1);
    setStatsYear(d.getFullYear());
    setStatsMonth(d.getMonth() + 1);
  }

  const employeeId = user?.employee?.id ?? 0;

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  // Records list
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["attendance", "list", page, seesTeam ? null : employeeId, search, dateFrom, dateTo, statusFilter],
    queryFn: () => listAttendancePaginated(page, seesTeam ? undefined : employeeId, search || undefined, listFilters),
    enabled: seesTeam || employeeId > 0,
    placeholderData: (prev) => prev,
  });

  // Today's record (for the check-in card)
  const todayRecord = useQuery({
    queryKey: ["attendance", "today", employeeId],
    queryFn:  () => getEmployeeAttendance(employeeId),
    enabled: !!employeeId,
    // Pick up biometric punches synced while the page is open.
    refetchInterval: 60_000,
    select: d => {
      const rows = (d as { data: AttendanceItem[] }).data ?? [];
      const todays = rows.find(a => a.date?.startsWith(today)) ?? null;
      if (todays && !todays.check_out && todays.check_in) return todays;
      // Night shift: an open record from the previous evening is still "today's" shift.
      const open = rows.find(a =>
        a.check_in && !a.check_out && !a.date?.startsWith(today) &&
        Date.now() - new Date(a.check_in.replace(" ", "T")).getTime() < 20 * 3600 * 1000);
      return open ?? todays;
    },
  });

  // Monthly stats
  const monthlyStats = useQuery({
    queryKey: ["attendance", "monthly", employeeId, statsMonth, statsYear],
    queryFn:  () => getAttendanceMonthlyStats(employeeId, statsMonth, statsYear),
    enabled: !!employeeId,
  });

  const employees = useQuery({ queryKey: ["employees-list"], queryFn: () => getEmployees() });

  // Check-in/out
  const checkInMutation = useMutation({
    mutationFn: () => checkInAttendance(employeeId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["attendance"] }); showSuccess("Checked in successfully!"); },
    onError: (e: Error) => setGlobalError(e.message),
  });
  const checkOutMutation = useMutation({
    mutationFn: () => checkOutAttendance(employeeId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["attendance"] }); showSuccess("Checked out successfully!"); },
    onError: (e: Error) => setGlobalError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAttendance,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["attendance"] }); showSuccess("Record deleted."); },
    onError: (e: Error) => setGlobalError(e.message),
  });

  const correctionMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      requestAttendanceCorrection(id, note, { check_in: proposedIn, check_out: proposedOut }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setCorrectionModal(null);
      setCorrectionNote("");
      showSuccess("Correction request submitted.");
    },
    onError: (e: Error) => setGlobalError(e.message),
  });

  const importRef = useRef<HTMLInputElement>(null);
  const exportMutation = useMutation({
    mutationFn: () => exportAttendanceCsv(search || undefined, listFilters),
    onError: (e: Error) => setGlobalError(e.message),
  });
  const importMutation = useMutation({
    mutationFn: importAttendanceCsv,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showSuccess(`Imported ${r.imported}, skipped ${r.skipped}.`);
      if (r.errors.length) setGlobalError(r.errors.slice(0, 5).join(" • ") + (r.errors.length > 5 ? ` …and ${r.errors.length - 5} more` : ""));
    },
    onError: (e: Error) => setGlobalError(e.message),
  });
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) importMutation.mutate(file);
  }
  function downloadTemplate() {
    const csv = "employee_number,date,check_in,check_out,status,work_from_home,notes\nEMP001,2026-10-01,09:00,17:30,present,no,\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(item: AttendanceItem) { setEditing(item); setModalOpen(true); }
  function openCorrection(item: AttendanceItem) {
    setCorrectionNote("");
    setProposedIn(item.check_in ? item.check_in.slice(11, 16) : "");
    setProposedOut(item.check_out ? item.check_out.slice(11, 16) : "");
    setCorrectionModal(item);
  }

  const todayRec  = todayRecord.data;
  const checkedIn  = !!todayRec?.check_in;
  const checkedOut = !!todayRec?.check_out;
  const stats      = monthlyStats.data as Partial<AttendanceMonthlyStats> | undefined;
  const showEmployeeCol = seesTeam;
  const showActions     = canManage || employeeId > 0;
  const colCount        = 9 + (showEmployeeCol ? 1 : 0) + (showActions ? 1 : 0);
  const canExport       = canManage || canApprove || employeeId > 0;
  const pageRecords = (query.data as { data?: AttendanceItem[] } | undefined)?.data ?? [];
  const { sorted: records, sort: recSort, toggle: toggleRecSort } = useTableSort(pageRecords, "employee", {
    employee: (r) => r.employee?.name,
    overtime: (r) => r.overtime_hours ?? 0,
    hours: (r) => r.duration_hours ?? 0,
  });
  const totalPages = (query.data as { last_page?: number } | undefined)?.last_page ?? 1;
  const empOptions = (employees.data?.data ?? []).map(e => ({ id: e.id, name: e.name }));

  const tabDefs: { key: Tab; label: string; show?: boolean }[] = [
    { key: "records",  label: "Records" },
    { key: "calendar", label: "Calendar", show: employeeId > 0 || seesTeam },
    { key: "team",     label: "Team View", show: seesTeam },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle={seesTeam ? "Track daily attendance, check in/out, and manage records." : "Check in/out, review your attendance and request corrections."} />

      {globalError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
          <button className="ml-3 text-red-500 underline" onClick={() => setGlobalError(null)}>Dismiss</button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Check-in/Monthly stats hero */}
      {employeeId > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Today — {today}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
                {todayRec ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                    {todayRec.check_in  && <span>In: <span className="font-medium text-[var(--text)]">{todayRec.check_in.slice(11,16)}</span></span>}
                    {todayRec.check_out && <span>Out: <span className="font-medium text-[var(--text)]">{todayRec.check_out.slice(11,16)}</span></span>}
                    <StatusBadge status={todayRec.status} />
                    {todayRec.work_from_home && <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">WFH</span>}
                    {(todayRec.overtime_hours ?? 0) > 0 && <span className="text-xs text-emerald-600 font-medium">+{todayRec.overtime_hours?.toFixed(1)}h overtime</span>}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted)]">No attendance record for today.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {/* Once punched in (web or synced from biometric) Check In is locked and Check Out is available. */}
                <Button onClick={() => checkInMutation.mutate()} disabled={checkedIn || checkInMutation.isPending}
                  title={checkedIn ? (todayRec?.source === "biometric" ? "Already punched in on the biometric device" : "Already checked in") : undefined}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {checkInMutation.isPending ? "Checking in..." : checkedIn ? "🔒 Check In" : "✓ Check In"}
                </Button>
                {checkedIn && !checkedOut && (
                  <Button onClick={() => checkOutMutation.mutate()} disabled={checkOutMutation.isPending}
                    className="bg-red-500 hover:bg-red-600 text-white">
                    {checkOutMutation.isPending ? "Checking out..." : "✗ Check Out"}
                  </Button>
                )}
                {checkedIn && checkedOut && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                    ✓ Day complete
                  </div>
                )}
                {todayRec && (
                  <Button variant="outline" onClick={() => openCorrection(todayRec)} className="text-sm">
                    Request correction
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button variant="outline" className="text-xs px-2 py-1" aria-label="Previous month" onClick={() => shiftStatsMonth(-1)}>←</Button>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
                {new Date(statsYear, statsMonth - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}
              </p>
              <Button variant="outline" className="text-xs px-2 py-1" aria-label="Next month" onClick={() => shiftStatsMonth(1)}
                disabled={statsYear === now.getFullYear() && statsMonth === now.getMonth() + 1}>→</Button>
            </div>
            {monthlyStats.isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-4 animate-pulse rounded bg-[var(--border)]" />)}</div>
            ) : monthlyStats.isError ? (
              <p className="text-sm text-red-600">Could not load monthly stats.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Present", value: stats?.present ?? 0, color: "text-emerald-600" },
                  { label: "Late",    value: stats?.late    ?? 0, color: "text-amber-600" },
                  { label: "Absent",  value: stats?.absent  ?? 0, color: "text-red-600" },
                  { label: "Leave",   value: stats?.leave   ?? 0, color: "text-blue-600" },
                  { label: "WFH",     value: stats?.wfh_days ?? 0, color: "text-violet-600" },
                  { label: "Off days", value: stats?.off_days ?? 0, color: "text-[var(--muted)]" },
                  { label: "Hours",   value: `${(stats?.total_hours ?? 0).toFixed(1)}h`, color: "text-[var(--text)]" },
                  { label: "Overtime", value: `${(stats?.overtime_hours ?? 0).toFixed(1)}h`, color: "text-[var(--primary)]" },
                ].map(st => (
                  <div key={st.label} className="rounded-xl border border-[var(--border)]/60 p-3">
                    <p className="text-xs text-[var(--muted)]">{st.label}</p>
                    <p className={`text-xl font-bold ${st.color}`}>{st.value}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {tabDefs.filter(t => t.show !== false).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px
              ${tab === t.key ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Records tab */}
      {tab === "records" && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Attendance Records</h3>
            <div className="flex flex-wrap items-center gap-3">
              {seesTeam && (
                <FormInput
                  type="search"
                  aria-label="Search attendance records"
                  placeholder="Search by employee name or ID…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-64"
                />
              )}
              <div className="flex items-center gap-2">
                <FormInput
                  type="date"
                  aria-label="From date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-40"
                />
                <span className="text-xs text-[var(--muted)]">to</span>
                <FormInput
                  type="date"
                  aria-label="To date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="w-40"
                />
              </div>
              <select
                aria-label="Filter by status"
                className={`${inputClass} w-36`}
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="">All statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
              </select>
              {(dateFrom || dateTo || statusFilter) && (
                <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); setStatusFilter(""); setPage(1); }}>Clear</Button>
              )}
              {canExport && (
                <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
                  {exportMutation.isPending ? "Exporting..." : "Export"}
                </Button>
              )}
              {canManage && (
                <>
                  <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
                  <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importMutation.isPending}>
                    {importMutation.isPending ? "Importing..." : "Import"}
                  </Button>
                  <Button variant="outline" onClick={downloadTemplate} title="Download a sample CSV">Template</Button>
                  <Button onClick={openCreate}>+ New Record</Button>
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  {showEmployeeCol && <SortableTh label="Employee" sortKey="employee" sort={recSort} onSort={toggleRecSort} />}
                  <SortableTh label="Date" sortKey="date" sort={recSort} onSort={toggleRecSort} />
                  <SortableTh label="Status" sortKey="status" sort={recSort} onSort={toggleRecSort} />
                  <SortableTh label="In" sortKey="check_in" sort={recSort} onSort={toggleRecSort} />
                  <SortableTh label="Out" sortKey="check_out" sort={recSort} onSort={toggleRecSort} />
                  <SortableTh label="Hours" sortKey="hours" sort={recSort} onSort={toggleRecSort} />
                  <th className="p-3">Shift</th>
                  <SortableTh label="OT" sortKey="overtime" sort={recSort} onSort={toggleRecSort} />
                  <th className="p-3">Flags</th>
                  <SortableTh label="Source" sortKey="source" sort={recSort} onSort={toggleRecSort} />
                  {showActions && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {query.isLoading && [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    {[...Array(colCount)].map((__, j) => (
                      <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>
                    ))}
                  </tr>
                ))}

                {!query.isLoading && records.length === 0 && (
                  <tr><td colSpan={colCount} className="p-10 text-center text-sm text-[var(--muted)]">
                    {query.isError ? "Could not load attendance records." : dateFrom || dateTo || statusFilter ? "No records match these filters." : "No attendance records found."}
                  </td></tr>
                )}

                {records.map(item => (
                  <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                    {showEmployeeCol && <td data-label="Employee" className="p-3 font-medium">{item.employee?.name ?? `Employee #${item.employee_id}`}</td>}
                    <td data-label="Date" className="p-3">{item.date?.slice(0, 10)}</td>
                    <td data-label="Status" className="p-3"><StatusBadge status={item.status} /></td>
                    <td data-label="In" className="p-3">{item.check_in  ? item.check_in.slice(11,16)  : "—"}</td>
                    <td data-label="Out" className="p-3">
                      {item.check_out ? <>{item.check_out.slice(11,16)}{item.check_out.slice(0, 10) > String(item.date).slice(0, 10) && <span className="ml-1 text-xs text-[var(--muted)]">+1d</span>}</> : "—"}
                    </td>
                    <td data-label="Hours" className="p-3 tabular-nums">
                      {item.check_out && (item.duration_hours ?? 0) > 0 ? `${item.duration_hours?.toFixed(1)}h` : "—"}
                    </td>
                    <td data-label="Shift" className="p-3"><ShiftProgress item={item} now={now} /></td>
                    <td data-label="OT" className="p-3 text-xs font-medium">
                      {(item.overtime_hours ?? 0) > 0
                        ? <span className="text-emerald-600">+{item.overtime_hours?.toFixed(1)}h</span>
                        : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    <td data-label="Flags" className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {item.work_from_home   && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">WFH</span>}
                        {item.correction_status === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Correction pending</span>}
                        {item.correction_status === "approved" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Correction approved</span>}
                        {item.correction_status === "rejected" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Correction rejected</span>}
                      </div>
                      {item.correction_response_notes && item.correction_status !== "pending" && (
                        <p className="mt-1 max-w-[200px] truncate text-xs text-[var(--muted)]" title={item.correction_response_notes}>Reply: {item.correction_response_notes}</p>
                      )}
                    </td>
                    <td data-label="Source" className="p-3"><SourceBadge source={item.source} /></td>
                    {showActions && (
                      <td data-label="Actions" className="p-3">
                        <div className="flex justify-end gap-2">
                          {item.employee_id === employeeId && item.correction_status !== "pending" && (
                            <Button variant="outline" className="text-xs px-2 py-1" onClick={() => openCorrection(item)}>
                              {item.correction_status ? "Re-request" : "Correct"}
                            </Button>
                          )}
                          {canManage && (
                            <>
                              <Button variant="outline" className="text-xs px-2 py-1" onClick={() => openEdit(item)}>Edit</Button>
                              <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => { if (window.confirm("Delete this record?")) void deleteMutation.mutateAsync(item.id); }}>
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
                <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Calendar tab */}
      {tab === "calendar" && (employeeId > 0 || seesTeam) && <CalendarView ownEmployeeId={employeeId} canPickEmployee={seesTeam} />}

      {/* Team tab */}
      {tab === "team" && seesTeam && <TeamView />}

      {/* CRUD modal */}
      {modalOpen && (
        <AttendanceFormModal
          editing={editing}
          today={today}
          employeeOptions={empOptions}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            setModalOpen(false);
            showSuccess(editing ? "Attendance updated." : "Attendance recorded.");
          }}
        />
      )}

      {/* Correction modal */}
      {correctionModal && (
        <Modal title="Request Attendance Correction" onClose={() => setCorrectionModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Submitting a correction request for{" "}
              <span className="font-medium text-[var(--text)]">{correctionModal.date?.slice(0, 10)}</span>.
              Your manager will review and approve the correction.
            </p>
            {correctionModal.correction_status === "pending" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">A correction request is already pending for this record.</p>
            )}
            {correctionModal.correction_status === "rejected" && correctionModal.correction_response_notes && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Previously rejected: {correctionModal.correction_response_notes}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Correct check in (optional)">
                <TimeInput24 clearable value={proposedIn} onChange={setProposedIn} />
              </FormField>
              <FormField label="Correct check out (optional)">
                <TimeInput24 clearable value={proposedOut} onChange={setProposedOut} />
              </FormField>
            </div>
            <FormField label="Reason for correction">
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={correctionNote}
                onChange={e => setCorrectionNote(e.target.value)}
                placeholder="Explain what needs to be corrected and why..."
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCorrectionModal(null)}>Cancel</Button>
              <Button
                disabled={!correctionNote.trim() || correctionMutation.isPending || correctionModal.correction_status === "pending"}
                onClick={() => correctionMutation.mutate({ id: correctionModal.id, note: correctionNote })}
              >
                {correctionMutation.isPending ? "Submitting..." : "Submit request"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
