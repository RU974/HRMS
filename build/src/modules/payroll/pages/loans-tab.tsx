import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { getEmployees } from "@/services/employee-service";
import {
  type LoanAdvance,
  createLoanAdvance,
  deleteLoanAdvance,
  listLoanAdvances,
  updateLoanAdvance,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, fmt, loanBadge, sel } from "./payroll-shared";

export function LoansTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView   = useAuthStore(s => s.hasPermission("payroll:view"));

  const loansQ     = useQuery({ queryKey: ["payroll", "loans"],     queryFn: () => listLoanAdvances(), enabled: canView || canManage });
  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployees()).data ?? [] });

  const employees = employeesQ.data ?? [];

  const [loanModal, setLoanModal] = useState(false);
  const [loanEdit,  setLoanEdit]  = useState<LoanAdvance | null>(null);
  const [loanForm,  setLoanForm]  = useState({ employee_id: 0, title: "", amount: 0, outstanding_balance: 0, emi_amount: "" as number | "", start_date: "", end_date: "", notes: "" });

  const loanCreate = useMutation({
    mutationFn: () => createLoanAdvance({ ...loanForm, emi_amount: loanForm.emi_amount === "" ? null : Number(loanForm.emi_amount), end_date: loanForm.end_date || null, notes: loanForm.notes || null, status: "active" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "loans"] }); toast.success("Loan added", "Loan / advance record saved."); setLoanModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const loanUpdate = useMutation({
    mutationFn: () => updateLoanAdvance(loanEdit!.id, { title: loanForm.title, outstanding_balance: loanForm.outstanding_balance, emi_amount: loanForm.emi_amount === "" ? null : Number(loanForm.emi_amount), end_date: loanForm.end_date || null, notes: loanForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "loans"] }); toast.success("Loan updated", "Loan / advance record updated."); setLoanModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const loanDelete = useMutation({
    mutationFn: deleteLoanAdvance,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "loans"] }); toast.success("Deleted", "Loan / advance removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setLoanEdit(null); setLoanForm({ employee_id: 0, title: "", amount: 0, outstanding_balance: 0, emi_amount: "", start_date: "", end_date: "", notes: "" }); setLoanModal(true); }}>
            + New Loan / Advance
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Employee</th>
              <th className="p-3">Title</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Outstanding</th>
              <th className="p-3">EMI</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(loansQ.data?.data ?? []).map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3 font-medium" data-label="Title">{item.title}</td>
                <td className="p-3" data-label="Amount">{fmt(item.amount)}</td>
                <td className="p-3 font-semibold" data-label="Outstanding">{fmt(item.outstanding_balance)}</td>
                <td className="p-3" data-label="EMI">{item.emi_amount != null ? fmt(item.emi_amount) : "—"}</td>
                <td className="p-3" data-label="Status"><Badge label={item.status} tone={loanBadge(item.status)} /></td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setLoanEdit(item); setLoanForm({ employee_id: item.employee_id, title: item.title, amount: item.amount, outstanding_balance: item.outstanding_balance, emi_amount: item.emi_amount ?? "", start_date: item.start_date.slice(0, 10), end_date: item.end_date?.slice(0, 10) ?? "", notes: item.notes ?? "" }); setLoanModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void loanDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(loansQ.data?.data ?? []).length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No loans or advances.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loanModal && (
        <Modal title={`${loanEdit ? "Edit" : "New"} Loan / Advance`} onClose={() => setLoanModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (loanEdit ? loanUpdate : loanCreate).mutateAsync(); }}>
            <FormField label="Employee">
              <select required disabled={!!loanEdit} className={sel} value={loanForm.employee_id} onChange={e => setLoanForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Title"><FormInput required value={loanForm.title} onChange={e => setLoanForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Medical Emergency Advance" /></FormField>
              <FormField label="Principal Amount"><FormInput required type="number" min={0} step="0.01" value={loanForm.amount} onChange={e => setLoanForm(p => ({ ...p, amount: Number(e.target.value), outstanding_balance: loanEdit ? p.outstanding_balance : Number(e.target.value) }))} /></FormField>
              <FormField label="Outstanding Balance"><FormInput required type="number" min={0} step="0.01" value={loanForm.outstanding_balance} onChange={e => setLoanForm(p => ({ ...p, outstanding_balance: Number(e.target.value) }))} /></FormField>
              <FormField label="Monthly EMI (optional)"><FormInput type="number" min={0} step="0.01" value={loanForm.emi_amount} onChange={e => setLoanForm(p => ({ ...p, emi_amount: e.target.value ? Number(e.target.value) : "" }))} /></FormField>
              <FormField label="Start Date"><FormInput required type="date" value={loanForm.start_date} onChange={e => setLoanForm(p => ({ ...p, start_date: e.target.value }))} /></FormField>
              <FormField label="End Date (optional)"><FormInput type="date" value={loanForm.end_date} onChange={e => setLoanForm(p => ({ ...p, end_date: e.target.value }))} /></FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={loanForm.notes} onChange={e => setLoanForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLoanModal(false)}>Cancel</Button>
              <Button type="submit" disabled={loanCreate.isPending || loanUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
