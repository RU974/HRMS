import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import {
  type TaxBracket,
  createTaxBracket,
  deleteTaxBracket,
  listTaxBrackets,
  updateTaxBracket,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { fmt, sel } from "./payroll-shared";

export function TaxBracketsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView   = useAuthStore(s => s.hasPermission("payroll:view"));

  const taxBracketsQ = useQuery({
    queryKey: ["payroll", "tax-brackets"],
    queryFn:  listTaxBrackets,
    enabled:  canView || canManage,
  });

  const [taxModal, setTaxModal] = useState(false);
  const [taxEdit,  setTaxEdit]  = useState<TaxBracket | null>(null);
  const [taxForm,  setTaxForm]  = useState({ name: "", min_income: 0, max_income: "" as number | "", rate: 0, sort_order: 0 });

  const taxCreate = useMutation({
    mutationFn: () => createTaxBracket({ ...taxForm, max_income: taxForm.max_income === "" ? null : Number(taxForm.max_income) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "tax-brackets"] }); toast.success("Tax bracket saved", "Tax bracket created successfully."); setTaxModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const taxUpdate = useMutation({
    mutationFn: () => updateTaxBracket(taxEdit!.id, { ...taxForm, max_income: taxForm.max_income === "" ? null : Number(taxForm.max_income) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "tax-brackets"] }); toast.success("Tax bracket updated", "Tax bracket updated successfully."); setTaxModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const taxDelete = useMutation({
    mutationFn: deleteTaxBracket,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "tax-brackets"] }); toast.success("Deleted", "Tax bracket removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Tax Slab Configuration</p>
          <p className="text-xs text-[var(--muted)]">Define income tax brackets. Lower brackets are applied first.</p>
        </div>
        {canManage && (
          <Button className="text-xs shrink-0" onClick={() => { setTaxEdit(null); setTaxForm({ name: "", min_income: 0, max_income: "", rate: 0, sort_order: 0 }); setTaxModal(true); }}>
            + Add Bracket
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Name</th>
              <th className="p-3">Min Income</th>
              <th className="p-3">Max Income</th>
              <th className="p-3">Rate (%)</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(taxBracketsQ.data ?? []).map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3">{fmt(item.min_income)}</td>
                <td className="p-3">{item.max_income != null ? fmt(item.max_income) : "No limit"}</td>
                <td className="p-3">{item.rate}%</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setTaxEdit(item); setTaxForm({ name: item.name, min_income: item.min_income, max_income: item.max_income ?? "", rate: item.rate, sort_order: item.sort_order ?? 0 }); setTaxModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void taxDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(taxBracketsQ.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">No tax brackets configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {taxModal && (
        <Modal title={`${taxEdit ? "Edit" : "Add"} Tax Bracket`} onClose={() => setTaxModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (taxEdit ? taxUpdate : taxCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Name"><FormInput required value={taxForm.name} onChange={e => setTaxForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 10% Slab" /></FormField>
              <FormField label="Rate (%)"><FormInput required type="number" min={0} max={100} step="0.01" value={taxForm.rate} onChange={e => setTaxForm(p => ({ ...p, rate: Number(e.target.value) }))} /></FormField>
              <FormField label="Min Income"><FormInput required type="number" min={0} step="0.01" value={taxForm.min_income} onChange={e => setTaxForm(p => ({ ...p, min_income: Number(e.target.value) }))} /></FormField>
              <FormField label="Max Income (blank = no limit)"><FormInput type="number" min={0} step="0.01" value={taxForm.max_income} onChange={e => setTaxForm(p => ({ ...p, max_income: e.target.value ? Number(e.target.value) : "" }))} /></FormField>
              <FormField label="Sort Order"><FormInput type="number" min={0} value={taxForm.sort_order} onChange={e => setTaxForm(p => ({ ...p, sort_order: Number(e.target.value) }))} /></FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTaxModal(false)}>Cancel</Button>
              <Button type="submit" disabled={taxCreate.isPending || taxUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
