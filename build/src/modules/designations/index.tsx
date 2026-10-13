import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { createDesignation, deleteDesignation, listDesignations, updateDesignation, exportDesignationsCsv, importDesignationsCsv } from "@/services/hr-management-service";
import { toast } from "@/components/notifications/toast";
import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";

export function DesignationsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["hr", "designations"], queryFn: listDesignations });
  const { sorted: sortedDesignations, sort, toggle: toggleSort } = useTableSort(query.data ?? [], "name");

  const saveMutation = useMutation({
    mutationFn: async () => editingId ? updateDesignation(editingId, { name }) : createDesignation({ name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "designations"] });
      toast.success("Saved", editingId ? "Designation updated successfully." : "Designation created successfully.");
      setModalOpen(false);
      setEditingId(null);
      setName("");
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteDesignation,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "designations"] }); toast.success("Deleted", "Designation removed successfully."); },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); }
  });

  const importRef = useRef<HTMLInputElement>(null);
  const exportMutation = useMutation({
    mutationFn: exportDesignationsCsv,
    onError: (e: Error) => toast.error("Export failed", e.message),
  });
  const importMutation = useMutation({
    mutationFn: importDesignationsCsv,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "designations"] });
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
    const url = URL.createObjectURL(new Blob(["name\nSenior Developer\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "designations-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-6">
    <PageHeader title="Designations" subtitle="Manage designation master data." />
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
        <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>{exportMutation.isPending ? "Exporting..." : "Export"}</Button>
        <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importMutation.isPending}>{importMutation.isPending ? "Importing..." : "Import"}</Button>
        <Button variant="outline" onClick={downloadTemplate} title="Download a sample CSV">Template</Button>
        <Button onClick={() => { setEditingId(null); setName(""); setModalOpen(true); }}>New Designation</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} /><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>
          {sortedDesignations.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.name}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingId(item.id); setName(item.name); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}
          {!query.isLoading && (query.data?.length ?? 0) === 0 && <tr><td colSpan={2} className="p-5 text-center text-[var(--muted)]">No designations found.</td></tr>}
        </tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editingId ? "Edit Designation" : "New Designation"} onClose={() => setModalOpen(false)}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}>
        <div><label className="mb-1 block text-sm font-medium">Name</label><FormInput value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="flex justify-end"><Button type="submit">Save</Button></div>
      </form>
    </Modal>}
  </div>;
}
