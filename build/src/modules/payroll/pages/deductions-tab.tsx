import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { getEmployees } from "@/services/employee-service";
import {
  type Deduction,
  type DeductionType,
  createDeduction,
  deleteDeduction,
  listDeductions,
  listPayroll,
  updateDeduction,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { fmt, sel } from "./payroll-shared";

const DEDUCTION_TYPES: { value: DeductionType; label: string }[] = [
  { value: "tax",              label: "Tax" },
  { value: "provident_fund",   label: "Provident Fund (PF)" },
  { value: "pension",          label: "Pension" },
  { value: "esi",              label: "ESI" },
  { value: "professional_tax", label: "Professional Tax" },
  { value: "loan",             label: "Loan" },
  { value: "penalty",          label: "Penalty" },
  { value: "other",            label: "Other" },
];

export function DeductionsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const deductionsQ = useQuery({ queryKey: ["payroll", "deductions"], queryFn: async () => (await listDeductions()).data ?? [] });
  const employeesQ  = useQuery({ queryKey: ["payroll", "employees"],  queryFn: async () => (await getEmployees()).data ?? [] });
  const payrollsQ   = useQuery({ queryKey: ["payroll", "base"],       queryFn: async () => (await listPayroll()).data ?? [] });

  const deductions = deductionsQ.data ?? [];
  const employees  = employeesQ.data ?? [];
  const payrolls   = payrollsQ.data ?? [];

  const [dedModal, setDedModal] = useState(false);
  const [dedEdit,  setDedEdit]  = useState<Deduction | null>(null);
  const [dedForm,  setDedForm]  = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other" as DeductionType, effective_date: "", notes: "" });

  const dedCreate = useMutation({
    mutationFn: () => createDeduction({ ...dedForm, payroll_id: dedForm.payroll_id || null, notes: dedForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); toast.success("Deduction added", "Deduction record saved."); setDedModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const dedUpdate = useMutation({
    mutationFn: () => updateDeduction(dedEdit!.id, { title: dedForm.title, amount: dedForm.amount, type: dedForm.type, effective_date: dedForm.effective_date, notes: dedForm.notes || null, payroll_id: dedForm.payroll_id || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); toast.success("Deduction updated", "Deduction record updated."); setDedModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const dedDelete = useMutation({
    mutationFn: deleteDeduction,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); toast.success("Deleted", "Deduction removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setDedEdit(null); setDedForm({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other", effective_date: "", notes: "" }); setDedModal(true); }}>
            + New Deduction
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Employee</th>
              <th className="p-3">Title</th>
              <th className="p-3">Type</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deductions.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3 font-medium" data-label="Title">{item.title}</td>
                <td className="p-3 capitalize text-xs text-[var(--muted)]" data-label="Type">{item.type.replace(/_/g, " ")}</td>
                <td className="p-3" data-label="Amount">{fmt(Number(item.amount))}</td>
                <td className="p-3" data-label="Date">{item.effective_date.slice(0, 10)}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setDedEdit(item); setDedForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), type: item.type, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setDedModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void dedDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {deductions.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No deduction records.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {dedModal && (
        <Modal title={`${dedEdit ? "Edit" : "New"} Deduction`} onClose={() => setDedModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (dedEdit ? dedUpdate : dedCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Employee">
                <select required className={sel} value={dedForm.employee_id} onChange={e => setDedForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                  <option value={0}>Select employee</option>
                  {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </FormField>
              <FormField label="Type">
                <select required className={sel} value={dedForm.type} onChange={e => setDedForm(p => ({ ...p, type: e.target.value as DeductionType }))}>
                  {DEDUCTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FormField>
              <FormField label="Title"><FormInput required value={dedForm.title} onChange={e => setDedForm(p => ({ ...p, title: e.target.value }))} /></FormField>
              <FormField label="Amount"><FormInput required type="number" min={0} step="0.01" value={dedForm.amount} onChange={e => setDedForm(p => ({ ...p, amount: Number(e.target.value) }))} /></FormField>
              <FormField label="Effective Date"><FormInput required type="date" value={dedForm.effective_date} onChange={e => setDedForm(p => ({ ...p, effective_date: e.target.value }))} /></FormField>
              <FormField label="Payroll (optional)">
                <select className={sel} value={dedForm.payroll_id} onChange={e => setDedForm(p => ({ ...p, payroll_id: Number(e.target.value) }))}>
                  <option value={0}>No linked payroll</option>
                  {payrolls.filter(p => !dedForm.employee_id || p.employee_id === dedForm.employee_id).map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={dedForm.notes} onChange={e => setDedForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDedModal(false)}>Cancel</Button>
              <Button type="submit" disabled={dedCreate.isPending || dedUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
