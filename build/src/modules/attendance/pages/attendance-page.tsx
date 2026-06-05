import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { FormField } from "@/components/common/form-field";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { getEmployees } from "@/services/employee-service";
import { AttendanceItem, createAttendance, deleteAttendance, listAttendance, updateAttendance } from "@/services/hr-management-service";

export function AttendancePage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["hr", "attendance"], queryFn: listAttendance });
  const employees = useQuery({ queryKey: ["hr", "attendance-employees"], queryFn: async () => (await getEmployees()).data });
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceItem | null>(null);
  const [form, setForm] = useState({ employee_id: 0, date: "", check_in: "", check_out: "", status: "present" as AttendanceItem["status"], notes: "" });
  const employeeMap = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e.name])), [employees.data]);

  const saveMutation = useMutation({
    mutationFn: async () => editing
      ? updateAttendance(editing.id, { date: form.date, check_in: form.check_in || null, check_out: form.check_out || null, status: form.status, notes: form.notes || null })
      : createAttendance({ employee_id: form.employee_id, date: form.date, check_in: form.check_in || null, check_out: form.check_out || null, status: form.status, notes: form.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] }); setModalOpen(false); },
    onError: (e: Error) => setError(e.message)
  });
  const deleteMutation = useMutation({ mutationFn: deleteAttendance, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] }); }, onError: (e: Error) => setError(e.message) });

  return <div className="space-y-6">
    <PageHeader title="Attendance" subtitle="Track daily attendance records." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex justify-end"><Button onClick={() => { setEditing(null); setForm({ employee_id: 0, date: "", check_in: "", check_out: "", status: "present", notes: "" }); setModalOpen(true); }}>New Attendance</Button></div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="p-3">Employee</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Check In/Out</th><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>{(query.data?.data ?? []).map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.employee?.name ?? employeeMap.get(item.employee_id) ?? `#${item.employee_id}`}</td><td className="p-3">{item.date.slice(0, 10)}</td><td className="p-3">{item.status}</td><td className="p-3">{item.check_in ? item.check_in.slice(11, 16) : "-"} / {item.check_out ? item.check_out.slice(11, 16) : "-"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(item); setForm({ employee_id: item.employee_id, date: item.date.slice(0, 10), check_in: item.check_in ? item.check_in.slice(11, 16) : "", check_out: item.check_out ? item.check_out.slice(11, 16) : "", status: item.status, notes: item.notes ?? "" }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}</tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editing ? "Edit Attendance" : "New Attendance"} onClose={() => setModalOpen(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}><FormField label="Employee"><select disabled={Boolean(editing)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Date"><FormInput type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></FormField><FormField label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as AttendanceItem["status"] }))}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="leave">Leave</option></select></FormField><FormField label="Check In"><FormInput type="time" value={form.check_in} onChange={(e) => setForm((p) => ({ ...p, check_in: e.target.value }))} /></FormField><FormField label="Check Out"><FormInput type="time" value={form.check_out} onChange={(e) => setForm((p) => ({ ...p, check_out: e.target.value }))} /></FormField><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
  </div>;
}


