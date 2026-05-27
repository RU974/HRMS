import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { getEmployees } from "@/services/employee-service";
import { LeaveItem, createLeave, deleteLeave, listLeaves, updateLeave } from "@/services/hr-management-service";

export function LeavesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["hr", "leaves"], queryFn: listLeaves });
  const employees = useQuery({ queryKey: ["hr", "leave-employees"], queryFn: async () => (await getEmployees()).data });
  const employeeMap = useMemo(() => new Map((employees.data ?? []).map((x) => [x.id, x.name])), [employees.data]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveItem | null>(null);
  const [form, setForm] = useState({ employee_id: 0, type: "", from_date: "", to_date: "", status: "pending" as LeaveItem["status"] });
  const saveMutation = useMutation({ mutationFn: async () => editing ? updateLeave(editing.id, { type: form.type, from_date: form.from_date, to_date: form.to_date, status: form.status }) : createLeave(form), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] }); setModalOpen(false); }, onError: (e: Error) => setError(e.message) });
  const deleteMutation = useMutation({ mutationFn: deleteLeave, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] }); }, onError: (e: Error) => setError(e.message) });

  return <div className="space-y-6">
    <PageHeader title="Leaves" subtitle="Manage leave requests and approvals." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex justify-end"><Button onClick={() => { setEditing(null); setForm({ employee_id: 0, type: "", from_date: "", to_date: "", status: "pending" }); setModalOpen(true); }}>New Leave</Button></div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="p-3">Employee</th><th className="p-3">Type</th><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>{(query.data?.data ?? []).map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{employeeMap.get(item.employee_id) ?? `#${item.employee_id}`}</td><td className="p-3">{item.type}</td><td className="p-3">{item.from_date.slice(0, 10)}</td><td className="p-3">{item.to_date.slice(0, 10)}</td><td className="p-3">{item.status}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(item); setForm({ employee_id: item.employee_id, type: item.type, from_date: item.from_date.slice(0, 10), to_date: item.to_date.slice(0, 10), status: item.status }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}</tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editing ? "Edit Leave" : "New Leave"} onClose={() => setModalOpen(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}><Field label="Employee"><select disabled={Boolean(editing)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="Type"><FormInput value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} /></Field><Field label="From"><FormInput type="date" value={form.from_date} onChange={(e) => setForm((p) => ({ ...p, from_date: e.target.value }))} /></Field><Field label="To"><FormInput type="date" value={form.to_date} onChange={(e) => setForm((p) => ({ ...p, to_date: e.target.value }))} /></Field><Field label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as LeaveItem["status"] }))}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></Field><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }


