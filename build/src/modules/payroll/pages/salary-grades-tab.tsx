import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import {
  type SalaryGrade,
  createSalaryGrade,
  deleteSalaryGrade,
  listSalaryGrades,
  updateSalaryGrade,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { fmt, sel } from "./payroll-shared";

export function SalaryGradesTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView   = useAuthStore(s => s.hasPermission("payroll:view"));

  const salaryGradesQ = useQuery({
    queryKey: ["payroll", "salary-grades"],
    queryFn:  listSalaryGrades,
    enabled:  canView || canManage,
  });

  const [gradeModal, setGradeModal] = useState(false);
  const [gradeEdit,  setGradeEdit]  = useState<SalaryGrade | null>(null);
  const [gradeForm,  setGradeForm]  = useState({ name: "", min_salary: 0, max_salary: 0, basic_percent: 50, hra_percent: 20, transport_allowance: 0, other_allowance: 0, notes: "" });

  const gradeCreate = useMutation({
    mutationFn: () => createSalaryGrade({ ...gradeForm, notes: gradeForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "salary-grades"] }); toast.success("Salary grade saved", "Salary grade created successfully."); setGradeModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const gradeUpdate = useMutation({
    mutationFn: () => updateSalaryGrade(gradeEdit!.id, { ...gradeForm, notes: gradeForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "salary-grades"] }); toast.success("Salary grade updated", "Salary grade updated successfully."); setGradeModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const gradeDelete = useMutation({
    mutationFn: deleteSalaryGrade,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "salary-grades"] }); toast.success("Deleted", "Salary grade removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Salary Grade Templates</p>
          <p className="text-xs text-[var(--muted)]">Reusable salary bands. Link a grade to an employee to pre-fill salary components.</p>
        </div>
        {canManage && (
          <Button className="text-xs shrink-0" onClick={() => { setGradeEdit(null); setGradeForm({ name: "", min_salary: 0, max_salary: 0, basic_percent: 50, hra_percent: 20, transport_allowance: 0, other_allowance: 0, notes: "" }); setGradeModal(true); }}>
            + Add Grade
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Name</th>
              <th className="p-3">Salary Range</th>
              <th className="p-3">Basic %</th>
              <th className="p-3">HRA %</th>
              <th className="p-3">Transport</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(salaryGradesQ.data ?? []).map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3 font-medium" data-label="Name">{item.name}</td>
                <td className="p-3" data-label="Salary Range">{fmt(item.min_salary)} – {fmt(item.max_salary)}</td>
                <td className="p-3" data-label="Basic %">{item.basic_percent ?? 50}%</td>
                <td className="p-3" data-label="HRA %">{item.hra_percent ?? 20}%</td>
                <td className="p-3" data-label="Transport">{fmt(item.transport_allowance ?? 0)}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setGradeEdit(item); setGradeForm({ name: item.name, min_salary: item.min_salary, max_salary: item.max_salary, basic_percent: item.basic_percent ?? 50, hra_percent: item.hra_percent ?? 20, transport_allowance: item.transport_allowance ?? 0, other_allowance: item.other_allowance ?? 0, notes: item.notes ?? "" }); setGradeModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void gradeDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(salaryGradesQ.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No salary grades configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {gradeModal && (
        <Modal title={`${gradeEdit ? "Edit" : "Add"} Salary Grade`} onClose={() => setGradeModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (gradeEdit ? gradeUpdate : gradeCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Grade Name"><FormInput required value={gradeForm.name} onChange={e => setGradeForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Grade A" /></FormField>
              <FormField label="Min Salary"><FormInput required type="number" min={0} step="0.01" value={gradeForm.min_salary} onChange={e => setGradeForm(p => ({ ...p, min_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="Max Salary"><FormInput required type="number" min={0} step="0.01" value={gradeForm.max_salary} onChange={e => setGradeForm(p => ({ ...p, max_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="Basic % of gross"><FormInput type="number" min={0} max={100} step="0.01" value={gradeForm.basic_percent} onChange={e => setGradeForm(p => ({ ...p, basic_percent: Number(e.target.value) }))} /></FormField>
              <FormField label="HRA % of basic"><FormInput type="number" min={0} max={100} step="0.01" value={gradeForm.hra_percent} onChange={e => setGradeForm(p => ({ ...p, hra_percent: Number(e.target.value) }))} /></FormField>
              <FormField label="Transport Allowance"><FormInput type="number" min={0} step="0.01" value={gradeForm.transport_allowance} onChange={e => setGradeForm(p => ({ ...p, transport_allowance: Number(e.target.value) }))} /></FormField>
              <FormField label="Other Allowance"><FormInput type="number" min={0} step="0.01" value={gradeForm.other_allowance} onChange={e => setGradeForm(p => ({ ...p, other_allowance: Number(e.target.value) }))} /></FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={gradeForm.notes} onChange={e => setGradeForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setGradeModal(false)}>Cancel</Button>
              <Button type="submit" disabled={gradeCreate.isPending || gradeUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
