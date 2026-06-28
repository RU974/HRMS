import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { getEmployees } from "@/services/employee-service";
import {
  type Bonus,
  createBonus,
  deleteBonus,
  listBonuses,
  listPayroll,
  updateBonus,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, fmt, sel } from "./payroll-shared";

export function BonusesTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const bonusesQ   = useQuery({ queryKey: ["payroll", "bonuses"],   queryFn: async () => (await listBonuses()).data ?? [] });
  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployees()).data ?? [] });
  const payrollsQ  = useQuery({ queryKey: ["payroll", "base"],      queryFn: async () => (await listPayroll()).data ?? [] });

  const bonuses   = bonusesQ.data ?? [];
  const employees = employeesQ.data ?? [];
  const payrolls  = payrollsQ.data ?? [];

  const [bonusModal, setBonusModal] = useState(false);
  const [bonusEdit,  setBonusEdit]  = useState<Bonus | null>(null);
  const [bonusForm,  setBonusForm]  = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" });

  const bonusCreate = useMutation({
    mutationFn: () => createBonus({ ...bonusForm, payroll_id: bonusForm.payroll_id || null, notes: bonusForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); toast.success("Bonus added", "Bonus record saved successfully."); setBonusModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const bonusUpdate = useMutation({
    mutationFn: () => updateBonus(bonusEdit!.id, { title: bonusForm.title, amount: bonusForm.amount, taxable: bonusForm.taxable, effective_date: bonusForm.effective_date, notes: bonusForm.notes || null, payroll_id: bonusForm.payroll_id || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); toast.success("Bonus updated", "Bonus record updated successfully."); setBonusModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const bonusDelete = useMutation({
    mutationFn: deleteBonus,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); toast.success("Deleted", "Bonus removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setBonusEdit(null); setBonusForm({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" }); setBonusModal(true); }}>
            + New Bonus
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Employee</th>
              <th className="p-3">Title</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Taxable</th>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bonuses.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3 font-medium">{item.title}</td>
                <td className="p-3">{fmt(Number(item.amount))}</td>
                <td className="p-3"><Badge label={item.taxable ? "Yes" : "No"} tone={item.taxable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-700"} /></td>
                <td className="p-3">{item.effective_date.slice(0, 10)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setBonusEdit(item); setBonusForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), taxable: item.taxable, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setBonusModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void bonusDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {bonuses.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No bonus records.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {bonusModal && (
        <Modal title={`${bonusEdit ? "Edit" : "New"} Bonus`} onClose={() => setBonusModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (bonusEdit ? bonusUpdate : bonusCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Employee">
                <select required className={sel} value={bonusForm.employee_id} onChange={e => setBonusForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                  <option value={0}>Select employee</option>
                  {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </FormField>
              <FormField label="Payroll (optional)">
                <select className={sel} value={bonusForm.payroll_id} onChange={e => setBonusForm(p => ({ ...p, payroll_id: Number(e.target.value) }))}>
                  <option value={0}>No linked payroll</option>
                  {payrolls.filter(p => !bonusForm.employee_id || p.employee_id === bonusForm.employee_id).map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                </select>
              </FormField>
              <FormField label="Title"><FormInput required value={bonusForm.title} onChange={e => setBonusForm(p => ({ ...p, title: e.target.value }))} /></FormField>
              <FormField label="Amount"><FormInput required type="number" min={0} step="0.01" value={bonusForm.amount} onChange={e => setBonusForm(p => ({ ...p, amount: Number(e.target.value) }))} /></FormField>
              <FormField label="Effective Date"><FormInput required type="date" value={bonusForm.effective_date} onChange={e => setBonusForm(p => ({ ...p, effective_date: e.target.value }))} /></FormField>
              <FormField label="Taxable">
                <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={bonusForm.taxable} onChange={e => setBonusForm(p => ({ ...p, taxable: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />
                  Mark as taxable
                </label>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={bonusForm.notes} onChange={e => setBonusForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBonusModal(false)}>Cancel</Button>
              <Button type="submit" disabled={bonusCreate.isPending || bonusUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
