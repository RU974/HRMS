import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { apiClient } from "@/services/api-client";
import {
  type AttendanceItem,
  checkInAttendance,
  checkOutAttendance,
  createAttendance,
  deleteAttendance,
  updateAttendance,
} from "@/services/hr-management-service";
import { getEmployees } from "@/services/employee-service";
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

// ── Calendar view ─────────────────────────────────────────────────────────────
function CalendarView({ employeeId }: { employeeId: number }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "calendar", employeeId, month, year],
    queryFn:  () => apiClient<{ data: AttendanceItem[] }>(
      `/attendance/employee/${employeeId}?month=${month}&year=${year}&per_page=31`
    ),
    enabled: employeeId > 0,
  });

  const records: AttendanceItem[] = (data as { data?: AttendanceItem[] } | undefined)?.data ?? [];
  const byDate = Object.fromEntries(records.map(r => [r.date?.slice(0, 10), r]));

  const daysInMonth  = new Date(year, month, 0).getDate();
  const firstDayDow  = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const paddingDays  = (firstDayDow + 6) % 7; // shift to Mon-start
  const monthLabel   = new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  const todayStr     = new Date().toISOString().slice(0, 10);

  const statusStyle: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-800 border-emerald-200",
    late:    "bg-amber-100 text-amber-800 border-amber-200",
    absent:  "bg-red-100 text-red-800 border-red-200",
    leave:   "bg-blue-100 text-blue-800 border-blue-200",
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
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Attendance Calendar</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="text-xs px-3 py-1.5" onClick={prevMonth}>←</Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Button variant="outline" className="text-xs px-3 py-1.5" onClick={nextMonth}>→</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-3">
        {[["present","bg-emerald-100 text-emerald-800"],["late","bg-amber-100 text-amber-800"],["absent","bg-red-100 text-red-800"],["leave","bg-blue-100 text-blue-800"]].map(([s, cls]) => (
          <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{s}</span>
        ))}
        <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">no record</span>
      </div>

      {isLoading && <div className="h-48 animate-pulse rounded-xl bg-[var(--border)]" />}

      {!isLoading && (
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
            const isToday = dateStr === todayStr;

            return (
              <div key={day}
                className={`relative flex flex-col items-center justify-start rounded-xl border p-1.5 min-h-[52px] transition
                  ${rec ? `${statusStyle[rec.status] ?? "bg-gray-50 border-gray-200"} cursor-pointer hover:opacity-80` : "border-[var(--border)] bg-[var(--background)]"}
                  ${isToday ? "ring-2 ring-[var(--primary)] ring-offset-1" : ""}
                `}
                title={rec ? `${rec.status}${rec.check_in ? ` · In: ${rec.check_in.slice(11,16)}` : ""}${rec.check_out ? ` · Out: ${rec.check_out.slice(11,16)}` : ""}` : ""}
              >
                <span className={`text-xs font-bold ${isToday ? "text-[var(--primary)]" : ""}`}>{day}</span>
                {rec && (
                  <div className="mt-0.5 flex flex-col items-center gap-0.5">
                    {rec.check_in  && <span className="text-[9px] leading-tight opacity-70">{rec.check_in.slice(11,16)}</span>}
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

// ── Team view ─────────────────────────────────────────────────────────────────
interface TeamRow {
  employee_id: number;
  name: string;
  department?: string | null;
  designation?: string | null;
  attendance?: AttendanceItem | null;
  monthly_absences: number;
}

function TeamView() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "team-daily", date],
    queryFn:  () => apiClient<TeamRow[]>(`/attendance/team-daily?date=${date}`),
  });

  const rows: TeamRow[] = (data as TeamRow[] | undefined) ?? [];
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Check In</th>
                  <th className="p-3">Check Out</th>
                  <th className="p-3">Flags</th>
                  <th className="p-3">Monthly Abs.</th>
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
                      <td className="p-3">
                        <Link to={`/employees/${row.employee_id}`} className="font-medium text-[var(--primary)] hover:underline">
                          {row.name}
                        </Link>
                        {row.designation && <p className="text-xs text-[var(--muted)]">{row.designation}</p>}
                      </td>
                      <td className="p-3 text-[var(--muted)]">{row.department ?? "—"}</td>
                      <td className="p-3">
                        {att ? <StatusBadge status={att.status} /> : (
                          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">No record</span>
                        )}
                      </td>
                      <td className="p-3">{att?.check_in ? att.check_in.slice(11, 16) : "—"}</td>
                      <td className="p-3">{att?.check_out ? att.check_out.slice(11, 16) : "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {att?.work_from_home && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">WFH</span>}
                          {att?.biometric_device_id && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">Bio</span>}
                          {(att?.overtime_hours ?? 0) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">+{att?.overtime_hours?.toFixed(1)}h OT</span>}
                        </div>
                      </td>
                      <td className="p-3">
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
            <FormInput type="time" value={form.check_in} onChange={e => setForm(p => ({ ...p, check_in: e.target.value }))} />
          </FormField>
          <FormField label="Check out">
            <FormInput type="time" value={form.check_out} onChange={e => setForm(p => ({ ...p, check_out: e.target.value }))} />
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
  const now         = useLiveClock();
  const today       = now.toISOString().slice(0, 10);

  const [tab, setTab]           = useState<Tab>("records");
  const [page, setPage]         = useState(1);
  const [globalError, setGlobalError]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<AttendanceItem | null>(null);
  const [correctionModal, setCorrectionModal] = useState<AttendanceItem | null>(null);
  const [correctionNote, setCorrectionNote]   = useState("");

  const employeeId = user?.employee?.id ?? 0;

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  // Records list
  const query = useQuery({
    queryKey: ["attendance", "list", page, canManage ? null : employeeId],
    queryFn: () => {
      const base = `/attendance?per_page=20&page=${page}`;
      return apiClient<{ data: AttendanceItem[]; current_page: number; last_page: number; total: number }>(
        canManage ? base : `${base}&employee_id=${employeeId}`
      );
    },
    enabled: canManage || employeeId > 0,
  });

  // Today's record (for the check-in card)
  const todayRecord = useQuery({
    queryKey: ["attendance", "today", employeeId],
    queryFn:  () => apiClient<{ data: AttendanceItem[] }>(`/attendance/employee/${employeeId}`),
    enabled: !!employeeId,
    select: d => (d as { data: AttendanceItem[] }).data?.find(a => a.date?.startsWith(today)) ?? null,
  });

  // Monthly stats
  const monthlyStats = useQuery({
    queryKey: ["attendance", "monthly", employeeId, now.getMonth() + 1, now.getFullYear()],
    queryFn:  () => apiClient<{ present: number; absent: number; late: number; leave: number; total: number }>(
      `/attendance/monthly-stats/${employeeId}/${now.getMonth() + 1}/${now.getFullYear()}`
    ),
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
      apiClient(`/attendance/${id}/request-correction`, {
        method: "POST",
        body: JSON.stringify({ correction_request_notes: note }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setCorrectionModal(null);
      setCorrectionNote("");
      showSuccess("Correction request submitted.");
    },
    onError: (e: Error) => setGlobalError(e.message),
  });

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(item: AttendanceItem) { setEditing(item); setModalOpen(true); }

  const todayRec  = todayRecord.data;
  const checkedIn  = !!todayRec?.check_in;
  const checkedOut = !!todayRec?.check_out;
  const stats      = monthlyStats.data as { present?: number; absent?: number; late?: number; leave?: number } | undefined;
  const records    = (query.data as { data?: AttendanceItem[] } | undefined)?.data ?? [];
  const totalPages = (query.data as { last_page?: number } | undefined)?.last_page ?? 1;
  const empOptions = (employees.data?.data ?? []).map(e => ({ id: e.id, name: e.name }));

  const tabDefs: { key: Tab; label: string; show?: boolean }[] = [
    { key: "records",  label: "Records" },
    { key: "calendar", label: "Calendar", show: employeeId > 0 },
    { key: "team",     label: "Team View", show: canApprove || canManage },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle="Track daily attendance, check in/out, and manage records." />

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
                {!checkedIn && (
                  <Button onClick={() => checkInMutation.mutate()} disabled={checkInMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {checkInMutation.isPending ? "Checking in..." : "✓ Check In"}
                  </Button>
                )}
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
                  <Button variant="outline" onClick={() => { setCorrectionNote(""); setCorrectionModal(todayRec); }} className="text-sm">
                    Request correction
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
              {now.toLocaleString("default", { month: "long" })} {now.getFullYear()}
            </p>
            {monthlyStats.isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-4 animate-pulse rounded bg-[var(--border)]" />)}</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Present", value: stats?.present ?? 0, color: "text-emerald-600" },
                  { label: "Late",    value: stats?.late    ?? 0, color: "text-amber-600" },
                  { label: "Absent",  value: stats?.absent  ?? 0, color: "text-red-600" },
                  { label: "Leave",   value: stats?.leave   ?? 0, color: "text-blue-600" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-[var(--border)]/60 p-3">
                    <p className="text-xs text-[var(--muted)]">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
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
            {canManage && <Button onClick={openCreate}>+ New Record</Button>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">In</th>
                  <th className="p-3">Out</th>
                  <th className="p-3">OT</th>
                  <th className="p-3">Flags</th>
                  <th className="p-3">Source</th>
                  {canManage && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {query.isLoading && [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    {[...Array(canManage ? 9 : 8)].map((__, j) => (
                      <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>
                    ))}
                  </tr>
                ))}

                {!query.isLoading && records.length === 0 && (
                  <tr><td colSpan={canManage ? 9 : 8} className="p-10 text-center text-sm text-[var(--muted)]">No attendance records found.</td></tr>
                )}

                {records.map(item => (
                  <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                    <td className="p-3 font-medium">{item.employee?.name ?? `Employee #${item.employee_id}`}</td>
                    <td className="p-3">{item.date?.slice(0, 10)}</td>
                    <td className="p-3"><StatusBadge status={item.status} /></td>
                    <td className="p-3">{item.check_in  ? item.check_in.slice(11,16)  : "—"}</td>
                    <td className="p-3">{item.check_out ? item.check_out.slice(11,16) : "—"}</td>
                    <td className="p-3 text-xs font-medium">
                      {(item.overtime_hours ?? 0) > 0
                        ? <span className="text-emerald-600">+{item.overtime_hours?.toFixed(1)}h</span>
                        : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {item.work_from_home   && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">WFH</span>}
                        {item.correction_status === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Correction pending</span>}
                      </div>
                    </td>
                    <td className="p-3"><SourceBadge source={item.source} /></td>
                    {canManage && (
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" className="text-xs px-2 py-1" onClick={() => openEdit(item)}>Edit</Button>
                          <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => { if (window.confirm("Delete this record?")) void deleteMutation.mutateAsync(item.id); }}>
                            Delete
                          </Button>
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
      {tab === "calendar" && employeeId > 0 && <CalendarView employeeId={employeeId} />}

      {/* Team tab */}
      {tab === "team" && (canApprove || canManage) && <TeamView />}

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
