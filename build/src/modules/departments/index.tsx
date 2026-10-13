import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loaders/loading-spinner";
import { createDepartment, deleteDepartment, getDepartment, listDepartments, updateDepartment, DepartmentDetailItem, exportDepartmentsCsv, importDepartmentsCsv } from "@/services/hr-management-service";
import { toast } from "@/components/notifications/toast";
import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsDepartment, setDetailsDepartment] = useState<DepartmentDetailItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["hr", "departments"], queryFn: listDepartments });
  const { sorted: sortedDepartments, sort, toggle: toggleSort } = useTableSort(query.data ?? [], "name");

  const saveMutation = useMutation({
    mutationFn: async () => editingId ? updateDepartment(editingId, { name }) : createDepartment({ name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "departments"] });
      toast.success("Saved", editingId ? "Department updated successfully." : "Department created successfully.");
      setModalOpen(false);
      setEditingId(null);
      setName("");
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); }
  });
  const detailsMutation = useMutation({
    mutationFn: async (id: number) => getDepartment(id),
    onSuccess: (department) => {
      setDetailsDepartment(department);
      setDetailsError(null);
    },
    onError: (e: Error) => setDetailsError(e.message)
  });
  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "departments"] }); toast.success("Deleted", "Department removed successfully."); },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); }
  });

  const importRef = useRef<HTMLInputElement>(null);
  const exportMutation = useMutation({
    mutationFn: exportDepartmentsCsv,
    onError: (e: Error) => toast.error("Export failed", e.message),
  });
  const importMutation = useMutation({
    mutationFn: importDepartmentsCsv,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "departments"] });
      toast.success("Import complete", `Imported ${r.imported}, skipped ${r.skipped}.`);
      if (r.errors.length) setError(r.errors.slice(0, 5).join(" • ") + (r.errors.length > 5 ? ` …and ${r.errors.length - 5} more` : ""));
      else setError(null);
    },
    onError: (e: Error) => { toast.error("Import failed", e.message); setError(e.message); },
  });
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) importMutation.mutate(file);
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(["name\nEngineering\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "departments-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-6">
    <PageHeader title="Departments" subtitle="Create, update, and archive departments." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
        <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>{exportMutation.isPending ? "Exporting..." : "Export"}</Button>
        <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importMutation.isPending}>{importMutation.isPending ? "Importing..." : "Import"}</Button>
        <Button variant="outline" onClick={downloadTemplate} title="Download a sample CSV">Template</Button>
        <Button onClick={() => { setEditingId(null); setName(""); setModalOpen(true); }}>New Department</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} /><SortableTh label="Employees" sortKey="employees_count" sort={sort} onSort={toggleSort} /><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>
          {sortedDepartments.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.name}</td><td className="p-3">{item.employees_count ?? 0}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setDetailsOpen(true); setDetailsDepartment(null); setDetailsError(null); void detailsMutation.mutateAsync(item.id); }}>View</Button><Button variant="outline" onClick={() => { setEditingId(item.id); setName(item.name); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}
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

    {detailsOpen && <Modal title="Department Details" onClose={() => setDetailsOpen(false)}>
      <div className="space-y-4">
        {detailsError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{detailsError}</p>}
        {!detailsDepartment && !detailsError && <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><LoadingSpinner /> <span>Loading department details...</span></div>}
        {detailsDepartment && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{detailsDepartment.name}</p>
              <p className="text-xs text-[var(--muted)]">Employees assigned to this department</p>
            </div>
            <div className="overflow-auto rounded-2xl border border-[var(--border)] bg-white p-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[var(--muted)]">
                    <th className="py-2">Employee</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Company</th>
                    <th className="py-2">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailsDepartment.employees ?? []).map((employee) => (
                    <tr key={employee.id} className="border-b last:border-0">
                      <td className="py-2">{employee.name}</td>
                      <td className="py-2 text-[var(--muted)]">{employee.email ?? "-"}</td>
                      <td className="py-2">{employee.company?.name ?? "-"}</td>
                      <td className="py-2">{employee.branch?.name ?? "-"}</td>
                    </tr>
                  ))}
                  {(detailsDepartment.employees ?? []).length === 0 && (
                    <tr><td colSpan={4} className="py-5 text-center text-[var(--muted)]">No employees assigned to this department yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>}
  </div>;
}


