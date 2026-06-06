import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { apiClient } from "@/services/api-client";
import {
  AttendanceItem,
  checkInAttendance,
  checkOutAttendance,
  createAttendance,
  deleteAttendance,
  listAttendance,
  updateAttendance,
} from "@/services/hr-management-service";
import { getEmployees } from "@/services/employee-service";
import { useAuthStore } from "@/store/auth-store";

function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: "bg-emerald-50 text-emerald-700",
    late: "bg-amber-50 text-amber-700",
    absent: "bg-red-50 text-red-700",
    leave: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "bg-gray-50 text-gray-700"}`}>
      {status}
    </span>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

export function AttendancePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = useAuthStore((s) => s.hasPermission("manage attendance"));
  const now = useLiveClock();
  const today = now.toISOString().slice(0, 10);

  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceItem | null>(null);
  const [correctionModal, setCorrectionModal] = useState<AttendanceItem | null>(null);
  const [correctionNote, setCorrectionNote] = useState("");
  const [form, setForm] = useState({
    employee_id: 0,
    date: today,
    check_in: "",
    check_out: "",
    status: "present" as AttendanceItem["status"],
    notes: "",
  });

  const employeeId = user?.employee?.id ?? 0;

  const query = useQuery({
    queryKey: ["attendance", page],
    queryFn: () => apiClient<{ data: AttendanceItem[]; current_page: number; last_page: number; total: number }>(`/attendance?per_page=20&page=${page}`),
  });

  const todayRecord = useQuery({
    queryKey: ["attendance", "today", employeeId],
    queryFn: () => apiClient<{ data: AttendanceItem[] }>(`/attendance/employee/${employeeId}`),
    enabled: !!employeeId,
    select: (data) => (data as { data: AttendanceItem[] }).data?.find((a) => a.date?.startsWith(today)) ?? null,
  });

  const monthlyStats = useQuery({
    queryKey: ["attendance", "monthly", employeeId],
    queryFn: () => apiClient<{ present: number; absent: number; late: number; leave: number; total: number }>(
      `/attendance/monthly-stats/${employeeId}/${now.getMonth() + 1}/${now.getFullYear()}`
    ),
    enabled: !!employeeId,
  });

  const employees = useQuery({ queryKey: ["employees-list"], queryFn: () => getEmployees() });

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const checkInMutation = useMutation({
    mutationFn: () => checkInAttendance(employeeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showSuccess("Checked in successfully!");
    },
    onError: (e: Error) => setError(e.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => checkOutAttendance(employeeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showSuccess("Checked out successfully!");
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateAttendance(editing.id, {
          date: form.date,
          check_in: form.check_in ? `${form.date}T${form.check_in}:00` : null,
          check_out: form.check_out ? `${form.date}T${form.check_out}:00` : null,
          status: form.status,
          notes: form.notes || null,
        });
      }
      return createAttendance({
        employee_id: form.employee_id,
        date: form.date,
        check_in: form.check_in ? `${form.date}T${form.check_in}:00` : null,
        check_out: form.check_out ? `${form.date}T${form.check_out}:00` : null,
        status: form.status,
        notes: form.notes || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setModalOpen(false);
      showSuccess(editing ? "Attendance updated." : "Attendance recorded.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAttendance,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showSuccess("Record deleted.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const correctionMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiClient(`/attendance/${id}/request-correction`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: async () => {
      setCorrectionModal(null);
      setCorrectionNote("");
      showSuccess("Correction request submitted.");
    },
    onError: (e: Error) => setError(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm({ employee_id: 0, date: today, check_in: "", check_out: "", status: "present", notes: "" });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: AttendanceItem) {
    setEditing(item);
    setForm({
      employee_id: item.employee_id,
      date: item.date?.slice(0, 10) ?? today,
      check_in: item.check_in ? item.check_in.slice(11, 16) : "",
      check_out: item.check_out ? item.check_out.slice(11, 16) : "",
      status: item.status,
      notes: item.notes ?? "",
    });
    setError(null);
    setModalOpen(true);
  }

  const todayRec = todayRecord.data;
  const checkedIn = !!todayRec?.check_in;
  const checkedOut = !!todayRec?.check_out;
  const stats = monthlyStats.data as { present?: number; absent?: number; late?: number; leave?: number; total?: number } | undefined;
  const records = (query.data as { data?: AttendanceItem[] } | undefined)?.data ?? [];
  const totalPages = (query.data as { last_page?: number } | undefined)?.last_page ?? 1;

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle="Track daily attendance, check in/out, and manage records." />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button className="ml-3 text-red-500 underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

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
                    {todayRec.check_in && <span>In: <span className="font-medium text-[var(--text)]">{todayRec.check_in.slice(11, 16)}</span></span>}
                    {todayRec.check_out && <span>Out: <span className="font-medium text-[var(--text)]">{todayRec.check_out.slice(11, 16)}</span></span>}
                    <StatusBadge status={todayRec.status} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted)]">No attendance record for today.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {!checkedIn && (
                  <Button
                    onClick={() => checkInMutation.mutate()}
                    disabled={checkInMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {checkInMutation.isPending ? "Checking in..." : "✓ Check In"}
                  </Button>
                )}
                {checkedIn && !checkedOut && (
                  <Button
                    onClick={() => checkOutMutation.mutate()}
                    disabled={checkOutMutation.isPending}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    {checkOutMutation.isPending ? "Checking out..." : "✗ Check Out"}
                  </Button>
                )}
                {checkedIn && checkedOut && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                    ✓ Day complete
                  </div>
                )}
                {todayRec && !checkedOut && (
                  <Button variant="outline" onClick={() => setCorrectionModal(todayRec)} className="text-sm">
                    Request correction
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
              This month — {now.toLocaleString("default", { month: "long" })} {now.getFullYear()}
            </p>
            {monthlyStats.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-[var(--border)]" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Present", value: stats?.present ?? 0, color: "text-emerald-600" },
                  { label: "Late", value: stats?.late ?? 0, color: "text-amber-600" },
                  { label: "Absent", value: stats?.absent ?? 0, color: "text-red-600" },
                  { label: "Leave", value: stats?.leave ?? 0, color: "text-blue-600" },
                ].map((s) => (
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

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Attendance Records</h3>
          {canManage && (
            <Button onClick={openCreate}>+ New Record</Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="p-3">Employee</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
                <th className="p-3">Check In</th>
                <th className="p-3">Check Out</th>
                <th className="p-3">Notes</th>
                {canManage && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {query.isLoading && [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50">
                  {[...Array(canManage ? 7 : 6)].map((__, j) => (
                    <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>
                  ))}
                </tr>
              ))}

              {!query.isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="p-10 text-center text-sm text-[var(--muted)]">
                    No attendance records found.
                  </td>
                </tr>
              )}

              {records.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                  <td className="p-3 font-medium">
                    {item.employee?.name ?? `Employee #${item.employee_id}`}
                  </td>
                  <td className="p-3">{item.date?.slice(0, 10)}</td>
                  <td className="p-3"><StatusBadge status={item.status} /></td>
                  <td className="p-3">{item.check_in ? item.check_in.slice(11, 16) : "—"}</td>
                  <td className="p-3">{item.check_out ? item.check_out.slice(11, 16) : "—"}</td>
                  <td className="p-3 max-w-xs truncate text-[var(--muted)]">{item.notes ?? "—"}</td>
                  {canManage && (
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="text-xs px-2 py-1" onClick={() => openEdit(item)}>Edit</Button>
                        <Button
                          variant="outline"
                          className="text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => { if (confirm("Delete this record?")) void deleteMutation.mutateAsync(item.id); }}
                        >
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
              <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title={editing ? "Edit Attendance" : "New Attendance Record"} onClose={() => setModalOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); void saveMutation.mutateAsync(); }}>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {!editing && (
              <FormField label="Employee">
                <select className={inputClass} value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: Number(e.target.value) }))} required>
                  <option value={0}>Select employee</option>
                  {(employees.data?.data ?? []).map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </FormField>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Date">
                <FormInput type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} required />
              </FormField>
              <FormField label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as AttendanceItem["status"] }))}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="leave">Leave</option>
                </select>
              </FormField>
              <FormField label="Check in">
                <FormInput type="time" value={form.check_in} onChange={(e) => setForm((p) => ({ ...p, check_in: e.target.value }))} />
              </FormField>
              <FormField label="Check out">
                <FormInput type="time" value={form.check_out} onChange={(e) => setForm((p) => ({ ...p, check_out: e.target.value }))} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes..."
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {correctionModal && (
        <Modal title="Request Attendance Correction" onClose={() => setCorrectionModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Submitting a correction request for <span className="font-medium text-[var(--text)]">{correctionModal.date?.slice(0, 10)}</span>. Your manager will review and approve the correction.
            </p>
            <FormField label="Reason for correction">
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Explain what needs to be corrected and why..."
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCorrectionModal(null)}>Cancel</Button>
              <Button
                disabled={!correctionNote.trim() || correctionMutation.isPending}
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