import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from "@/services/hr-management-service";

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["hr", "departments"], queryFn: listDepartments });

  const saveMutation = useMutation({
    mutationFn: async () => editingId ? updateDepartment(editingId, { name }) : createDepartment({ name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "departments"] });
      setModalOpen(false);
      setEditingId(null);
      setName("");
    },
    onError: (e: Error) => setError(e.message)
  });
  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "departments"] }); },
    onError: (e: Error) => setError(e.message)
  });

  return <div className="space-y-6">
    <PageHeader title="Departments" subtitle="Create, update, and archive departments." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex justify-end"><Button onClick={() => { setEditingId(null); setName(""); setModalOpen(true); }}>New Department</Button></div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="p-3">Name</th><th className="p-3">Employees</th><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>
          {(query.data ?? []).map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.name}</td><td className="p-3">{item.employees_count ?? 0}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingId(item.id); setName(item.name); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}
          {!query.isLoading && (query.data?.length ?? 0) === 0 && <tr><td colSpan={3} className="p-5 text-center text-[var(--muted)]">No departments found.</td></tr>}
        </tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editingId ? "Edit Department" : "New Department"} onClose={() => setModalOpen(false)}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}>
        <div><label className="mb-1 block text-sm font-medium">Name</label><FormInput value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="flex justify-end"><Button type="submit">Save</Button></div>
      </form>
    </Modal>}
  </div>;
}


