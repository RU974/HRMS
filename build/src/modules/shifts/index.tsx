import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { TimeInput24 } from "@/components/forms/time-input-24";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { ShiftItem, createShift, deleteShift, listShifts, updateShift } from "@/services/hr-management-service";
import { toast } from "@/components/notifications/toast";

export function ShiftsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["hr", "shifts"], queryFn: listShifts });
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftItem | null>(null);
  const [form, setForm] = useState({ name: "", start_time: "09:00", end_time: "17:00", grace_minutes: 0, is_active: true });
  const saveMutation = useMutation({
    mutationFn: async () => editing ? updateShift(editing.id, form) : createShift(form),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "shifts"] }); toast.success("Saved", editing ? "Shift updated successfully." : "Shift created successfully."); setModalOpen(false); },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); }
  });
  const deleteMutation = useMutation({ mutationFn: deleteShift, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "shifts"] }); toast.success("Deleted", "Shift removed successfully."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  return <div className="space-y-6">
    <PageHeader title="Shifts" subtitle="Manage shift times and active state." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex justify-end"><Button onClick={() => { setEditing(null); setForm({ name: "", start_time: "09:00", end_time: "17:00", grace_minutes: 0, is_active: true }); setModalOpen(true); }}>New Shift</Button></div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="p-3">Name</th><th className="p-3">Timing</th><th className="p-3">Grace</th><th className="p-3">Active</th><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>{(query.data ?? []).map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.name}</td><td className="p-3">{item.start_time} - {item.end_time}</td><td className="p-3">{item.grace_minutes} min</td><td className="p-3">{item.is_active ? "Yes" : "No"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(item); setForm({ name: item.name, start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5), grace_minutes: item.grace_minutes, is_active: item.is_active }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}</tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editing ? "Edit Shift" : "New Shift"} onClose={() => setModalOpen(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}><Field label="Name"><FormInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field><Field label="Start Time"><TimeInput24 value={form.start_time} onChange={(v) => setForm((p) => ({ ...p, start_time: v }))} /></Field><Field label="End Time"><TimeInput24 value={form.end_time} onChange={(v) => setForm((p) => ({ ...p, end_time: v }))} /></Field><Field label="Grace Minutes"><FormInput type="number" min={0} max={180} value={form.grace_minutes} onChange={(e) => setForm((p) => ({ ...p, grace_minutes: Number(e.target.value) }))} /></Field><Field label="Active"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} /></Field><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }


