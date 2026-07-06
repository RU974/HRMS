import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import {
  type PayrollProcessing,
  createPayrollProcessing,
  deletePayrollProcessing,
  listPayrollProcessings,
  updatePayrollProcessing,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, payrollBadge, sel } from "./payroll-shared";

export function PayrollProcessingTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const [procMonthF, setProcMonthF] = useState<number | "">("");
  const [procYearF,  setProcYearF]  = useState<number | "">(new Date().getFullYear());
  const [procStatF,  setProcStatF]  = useState<PayrollProcessing["status"] | "">("");

  const processingsQ = useQuery({
    queryKey: ["payroll", "processings", procMonthF, procYearF, procStatF],
    queryFn:  async () => (await listPayrollProcessings(procMonthF || undefined, procYearF || undefined, procStatF || undefined)).data ?? [],
  });

  const [procModal, setProcModal] = useState(false);
  const [procEdit,  setProcEdit]  = useState<PayrollProcessing | null>(null);
  const [procForm,  setProcForm]  = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft" as PayrollProcessing["status"], processed_at: "", notes: "" });

  const procCreate = useMutation({
    mutationFn: () => createPayrollProcessing({ ...procForm, processed_at: procForm.processed_at || null, notes: procForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); toast.success("Processing created", "Payroll processing record saved."); setProcModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const procUpdate = useMutation({
    mutationFn: () => updatePayrollProcessing(procEdit!.id, { status: procForm.status, processed_at: procForm.processed_at || null, notes: procForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); toast.success("Processing updated", "Payroll processing record updated."); setProcModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const procDelete = useMutation({
    mutationFn: deletePayrollProcessing,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); toast.success("Deleted", "Processing record removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-[var(--muted)]">Month</label>
          <input type="number" min={1} max={12} className="mt-1 h-9 w-20 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={procMonthF} onChange={e => setProcMonthF(e.target.value ? Number(e.target.value) : "")} />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Year</label>
          <input type="number" min={2020} className="mt-1 h-9 w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={procYearF} onChange={e => setProcYearF(e.target.value ? Number(e.target.value) : "")} />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Status</label>
          <select className="mt-1 h-9 w-36 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={procStatF} onChange={e => setProcStatF((e.target.value as PayrollProcessing["status"]) || "")}>
            <option value="">All</option>
            {["draft", "processing", "completed", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button variant="outline" className="text-xs" onClick={() => { setProcMonthF(""); setProcYearF(new Date().getFullYear()); setProcStatF(""); }}>Reset</Button>
        {canManage && (
          <Button className="ml-auto text-xs" onClick={() => { setProcEdit(null); setProcForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft", processed_at: "", notes: "" }); setProcModal(true); }}>
            + New Run
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Period</th>
              <th className="p-3">Status</th>
              <th className="p-3">Processed At</th>
              <th className="p-3">Notes</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(processingsQ.data ?? []).map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3 font-medium" data-label="Period">{item.month}/{item.year}</td>
                <td className="p-3" data-label="Status"><Badge label={item.status} tone={payrollBadge(item.status)} /></td>
                <td className="p-3" data-label="Processed At">{item.processed_at?.slice(0, 10) ?? "—"}</td>
                <td className="max-w-[260px] truncate p-3 text-xs text-[var(--muted)]" data-label="Notes">{item.notes ?? "—"}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-2">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setProcEdit(item); setProcForm({ month: item.month, year: item.year, status: item.status, processed_at: item.processed_at?.slice(0, 10) ?? "", notes: item.notes ?? "" }); setProcModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void procDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(processingsQ.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">No processing runs.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {procModal && (
        <Modal title={`${procEdit ? "Edit" : "New"} Processing Run`} onClose={() => setProcModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (procEdit ? procUpdate : procCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month"><FormInput required type="number" min={1} max={12} value={procForm.month} onChange={e => setProcForm(p => ({ ...p, month: Number(e.target.value) }))} /></FormField>
              <FormField label="Year"><FormInput required type="number" min={2020} value={procForm.year} onChange={e => setProcForm(p => ({ ...p, year: Number(e.target.value) }))} /></FormField>
              <FormField label="Status">
                <select className={sel} value={procForm.status} onChange={e => setProcForm(p => ({ ...p, status: e.target.value as PayrollProcessing["status"] }))}>
                  {["draft", "processing", "completed", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Processed At"><FormInput type="date" value={procForm.processed_at} onChange={e => setProcForm(p => ({ ...p, processed_at: e.target.value }))} /></FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={procForm.notes} onChange={e => setProcForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setProcModal(false)}>Cancel</Button>
              <Button type="submit" disabled={procCreate.isPending || procUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
