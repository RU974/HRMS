import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { getEmployees } from "@/services/employee-service";
import {
  type Payslip,
  createPayslip,
  deletePayslip,
  listPayroll,
  listPayslips,
  updatePayslip,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, SummaryCard, fmt, sel } from "./payroll-shared";

export function PayslipsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const payslipsQ  = useQuery({ queryKey: ["payroll", "payslips"],  queryFn: async () => (await listPayslips()).data ?? [] });
  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployees()).data ?? [] });
  const payrollsQ  = useQuery({ queryKey: ["payroll", "base"],      queryFn: async () => (await listPayroll()).data ?? [] });

  const payslips  = payslipsQ.data ?? [];
  const employees = employeesQ.data ?? [];
  const payrolls  = payrollsQ.data ?? [];

  const [payslipStatF,  setPayslipStatF]  = useState<Payslip["status"] | "">("");
  const [payslipModal,  setPayslipModal]  = useState(false);
  const [payslipEdit,   setPayslipEdit]   = useState<Payslip | null>(null);
  const [payslipDetail, setPayslipDetail] = useState<Payslip | null>(null);
  const [payslipForm,   setPayslipForm]   = useState({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft" as Payslip["status"], file_url: "", notes: "" });

  const payslipCreate = useMutation({
    mutationFn: () => createPayslip({ ...payslipForm, file_url: payslipForm.file_url || null, notes: payslipForm.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); toast.success("Payslip created", "Payslip saved successfully."); setPayslipModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const payslipUpdate = useMutation({
    mutationFn: () => updatePayslip(payslipEdit!.id, { status: payslipForm.status, issue_date: payslipForm.issue_date, file_url: payslipForm.file_url || undefined, notes: payslipForm.notes || undefined }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); toast.success("Payslip updated", "Payslip updated successfully."); setPayslipModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const payslipDelete = useMutation({
    mutationFn: deletePayslip,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); toast.success("Deleted", "Payslip removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const filtered = payslips.filter(i => !payslipStatF || i.status === payslipStatF);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={payslipStatF} onChange={e => setPayslipStatF((e.target.value as Payslip["status"]) || "")}>
          <option value="">All statuses</option>
          {["draft", "issued", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {canManage && (
          <Button className="text-xs" onClick={() => { setPayslipEdit(null); setPayslipForm({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft", file_url: "", notes: "" }); setPayslipModal(true); }}>
            + New Payslip
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Slip #</th>
              <th className="p-3">Employee</th>
              <th className="p-3">Period</th>
              <th className="p-3">Issue Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">File</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3 font-medium">{item.slip_number}</td>
                <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3">{item.payroll ? `${item.payroll.month}/${item.payroll.year}` : `#${item.payroll_id}`}</td>
                <td className="p-3">{item.issue_date.slice(0, 10)}</td>
                <td className="p-3"><Badge label={item.status} tone={item.status === "issued" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.status === "cancelled" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-100 text-slate-700"} /></td>
                <td className="p-3">{item.file_url ? <a href={item.file_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--primary)] underline">Download</a> : "—"}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setPayslipDetail(item)}>View</Button>
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setPayslipEdit(item); setPayslipForm({ employee_id: item.employee_id, payroll_id: item.payroll_id, slip_number: item.slip_number, issue_date: item.issue_date.slice(0, 10), status: item.status, file_url: item.file_url ?? "", notes: item.notes ?? "" }); setPayslipModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void payslipDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No payslips.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {payslipDetail && (
        <Modal title={`Payslip — ${payslipDetail.slip_number}`} onClose={() => setPayslipDetail(null)}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard label="Employee" value={payslipDetail.employee?.name ?? `#${payslipDetail.employee_id}`} />
              <SummaryCard label="Issue Date" value={payslipDetail.issue_date.slice(0, 10)} />
              <SummaryCard label="Status" value={payslipDetail.status} />
              <SummaryCard label="Payroll" value={payslipDetail.payroll ? `${payslipDetail.payroll.month}/${payslipDetail.payroll.year}` : `#${payslipDetail.payroll_id}`} />
            </div>
            {payslipDetail.payroll && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Net Salary" value={fmt(Number(payslipDetail.payroll.net_salary))} />
                <SummaryCard label="Base" value={fmt(Number(payslipDetail.payroll.base_salary))} />
              </div>
            )}
            {payslipDetail.file_url
              ? <a href={payslipDetail.file_url} target="_blank" rel="noreferrer" className="inline-block rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">Download Payslip PDF</a>
              : <p className="text-sm text-[var(--muted)]">No file attached.</p>
            }
          </div>
        </Modal>
      )}

      {/* Form modal */}
      {payslipModal && (
        <Modal title={`${payslipEdit ? "Edit" : "New"} Payslip`} onClose={() => setPayslipModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (payslipEdit ? payslipUpdate : payslipCreate).mutateAsync(); }}>
            {!payslipEdit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Employee">
                  <select required className={sel} value={payslipForm.employee_id} onChange={e => setPayslipForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                    <option value={0}>Select employee</option>
                    {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Payroll">
                  <select required className={sel} value={payslipForm.payroll_id} onChange={e => setPayslipForm(p => ({ ...p, payroll_id: Number(e.target.value) }))}>
                    <option value={0}>Select payroll</option>
                    {payrolls.map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                  </select>
                </FormField>
                <FormField label="Slip Number"><FormInput required value={payslipForm.slip_number} onChange={e => setPayslipForm(p => ({ ...p, slip_number: e.target.value }))} /></FormField>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Issue Date"><FormInput required type="date" value={payslipForm.issue_date} onChange={e => setPayslipForm(p => ({ ...p, issue_date: e.target.value }))} /></FormField>
              <FormField label="Status">
                <select className={sel} value={payslipForm.status} onChange={e => setPayslipForm(p => ({ ...p, status: e.target.value as Payslip["status"] }))}>
                  {["draft", "issued", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="File URL (optional)"><FormInput type="url" value={payslipForm.file_url} onChange={e => setPayslipForm(p => ({ ...p, file_url: e.target.value }))} placeholder="https://…" /></FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={payslipForm.notes} onChange={e => setPayslipForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayslipModal(false)}>Cancel</Button>
              <Button type="submit" disabled={payslipCreate.isPending || payslipUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
