import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const payslipStatuses = ["draft", "issued", "cancelled"] as const;

const payslipSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  payroll_id: z.coerce.number().min(1, "Payroll is required"),
  slip_number: z.string().min(1, "Slip number is required"),
  issue_date: z.string().min(1, "Issue date is required"),
  status: z.enum(payslipStatuses),
  file_url: z.string().optional(),
  notes: z.string().optional(),
});

type PayslipFormInput = z.input<typeof payslipSchema>;
type PayslipFormValues = z.output<typeof payslipSchema>;

const emptyPayslipForm: PayslipFormInput = { employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft", file_url: "", notes: "" };

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PayslipFormInput, any, PayslipFormValues>({
    resolver: zodResolver(payslipSchema),
    defaultValues: emptyPayslipForm,
  });

  const payslipCreate = useMutation({
    mutationFn: (values: PayslipFormValues) => createPayslip({ ...values, file_url: values.file_url || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); toast.success("Payslip created", "Payslip saved successfully."); setPayslipModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const payslipUpdate = useMutation({
    mutationFn: (values: PayslipFormValues) => updatePayslip(payslipEdit!.id, { status: values.status, issue_date: values.issue_date, file_url: values.file_url || undefined, notes: values.notes || undefined }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); toast.success("Payslip updated", "Payslip updated successfully."); setPayslipModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const payslipDelete = useMutation({
    mutationFn: deletePayslip,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); toast.success("Deleted", "Payslip removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const filtered = payslips.filter(i => !payslipStatF || i.status === payslipStatF);

  function onSubmit(values: PayslipFormValues) {
    (payslipEdit ? payslipUpdate : payslipCreate).mutate(values);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={payslipStatF} onChange={e => setPayslipStatF((e.target.value as Payslip["status"]) || "")}>
          <option value="">All statuses</option>
          {payslipStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {canManage && (
          <Button className="text-xs" onClick={() => { setPayslipEdit(null); reset(emptyPayslipForm); setPayslipModal(true); }}>
            + New Payslip
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
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
                <td className="p-3 font-medium" data-label="Slip #">{item.slip_number}</td>
                <td className="p-3" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3" data-label="Period">{item.payroll ? `${item.payroll.month}/${item.payroll.year}` : `#${item.payroll_id}`}</td>
                <td className="p-3" data-label="Issue Date">{item.issue_date.slice(0, 10)}</td>
                <td className="p-3" data-label="Status"><Badge label={item.status} tone={item.status === "issued" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.status === "cancelled" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-100 text-slate-700"} /></td>
                <td className="p-3" data-label="File">{item.file_url ? <a href={item.file_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--primary)] underline">Download</a> : "—"}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setPayslipDetail(item)}>View</Button>
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setPayslipEdit(item); reset({ employee_id: item.employee_id, payroll_id: item.payroll_id, slip_number: item.slip_number, issue_date: item.issue_date.slice(0, 10), status: item.status, file_url: item.file_url ?? "", notes: item.notes ?? "" }); setPayslipModal(true); }}>
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
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            {!payslipEdit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Employee">
                  <select className={sel} {...register("employee_id")}>
                    <option value={0}>Select employee</option>
                    {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {errors.employee_id && <p className="mt-1 text-xs text-red-500">{errors.employee_id.message}</p>}
                </FormField>
                <FormField label="Payroll">
                  <select className={sel} {...register("payroll_id")}>
                    <option value={0}>Select payroll</option>
                    {payrolls.map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                  </select>
                  {errors.payroll_id && <p className="mt-1 text-xs text-red-500">{errors.payroll_id.message}</p>}
                </FormField>
                <FormField label="Slip Number">
                  <FormInput {...register("slip_number")} />
                  {errors.slip_number && <p className="mt-1 text-xs text-red-500">{errors.slip_number.message}</p>}
                </FormField>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Issue Date">
                <FormInput type="date" {...register("issue_date")} />
                {errors.issue_date && <p className="mt-1 text-xs text-red-500">{errors.issue_date.message}</p>}
              </FormField>
              <FormField label="Status">
                <select className={sel} {...register("status")}>
                  {payslipStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="File URL (optional)">
                <FormInput type="url" {...register("file_url")} placeholder="https://…" />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
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
