import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { HolidayItem, createHoliday, deleteHoliday, listHolidays, updateHoliday } from "@/services/hr-management-service";
import { toast } from "@/components/notifications/toast";

export function HolidaysPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["hr", "holidays"], queryFn: listHolidays });
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayItem | null>(null);
  const [form, setForm] = useState({ name: "", holiday_date: "", is_optional: false });
  const saveMutation = useMutation({ mutationFn: async () => editing ? updateHoliday(editing.id, form) : createHoliday(form), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "holidays"] }); toast.success("Saved", editing ? "Holiday updated successfully." : "Holiday created successfully."); setModalOpen(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const deleteMutation = useMutation({ mutationFn: deleteHoliday, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "holidays"] }); toast.success("Deleted", "Holiday removed successfully."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  return <div className="space-y-6">
    <PageHeader title="Holidays" subtitle="Create and maintain holiday calendar entries." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex justify-end"><Button onClick={() => { setEditing(null); setForm({ name: "", holiday_date: "", is_optional: false }); setModalOpen(true); }}>New Holiday</Button></div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="p-3">Name</th><th className="p-3">Date</th><th className="p-3">Optional</th><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>{(query.data ?? []).map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.name}</td><td className="p-3">{item.holiday_date}</td><td className="p-3">{item.is_optional ? "Yes" : "No"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(item); setForm({ name: item.name, holiday_date: item.holiday_date.slice(0, 10), is_optional: item.is_optional }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}</tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editing ? "Edit Holiday" : "New Holiday"} onClose={() => setModalOpen(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}><Field label="Name"><FormInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field><Field label="Date"><FormInput type="date" value={form.holiday_date} onChange={(e) => setForm((p) => ({ ...p, holiday_date: e.target.value }))} /></Field><Field label="Optional"><input type="checkbox" checked={form.is_optional} onChange={(e) => setForm((p) => ({ ...p, is_optional: e.target.checked }))} /></Field><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }


