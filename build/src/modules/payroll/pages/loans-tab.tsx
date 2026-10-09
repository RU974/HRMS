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
import { getEmployeeOptions } from "@/services/employee-service";
import {
  type LoanAdvance,
  type LoanAdvanceStatus,
  type LoanAdvanceType,
  createLoanAdvance,
  deleteLoanAdvance,
  listLoanAdvances,
  updateLoanAdvance,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, LOAN_STATUS_LABELS, fmt, loanBadge, sel } from "./payroll-shared";

const loanSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  title: z.string().min(1, "Title is required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  outstanding_balance: z.coerce.number().min(0, "Outstanding balance is required"),
  emi_amount: z.string().optional().refine((v) => !v || Number.isFinite(Number(v)), "Enter a valid amount"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().min(1),
});

type LoanFormInput = z.input<typeof loanSchema>;
type LoanFormValues = z.output<typeof loanSchema>;

const emptyLoanForm: LoanFormInput = { employee_id: 0, title: "", amount: 0, outstanding_balance: 0, emi_amount: "", start_date: "", end_date: "", notes: "", status: "active" };
const defaultStatus = (t: LoanAdvanceType) => (t === "advance" ? "paid" : "active");

const COPY: Record<LoanAdvanceType, { singular: string; plural: string }> = {
  loan:    { singular: "Loan",    plural: "Loans" },
  advance: { singular: "Advance", plural: "Advances" },
};

export function LoansTab({ type = "loan" }: { type?: LoanAdvanceType }) {
  const { singular, plural } = COPY[type];
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView   = useAuthStore(s => s.hasPermission("payroll:view"));

  const loansQ     = useQuery({ queryKey: ["payroll", "loans", type], queryFn: () => listLoanAdvances({ type }), enabled: canView || canManage });
  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployeeOptions()).data ?? [] });

  const employees = employeesQ.data ?? [];

  const [loanModal, setLoanModal] = useState(false);
  const [loanEdit,  setLoanEdit]  = useState<LoanAdvance | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<LoanFormInput, any, LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: emptyLoanForm,
  });

  const loanCreate = useMutation({
    mutationFn: (values: LoanFormValues) => createLoanAdvance({ ...values, type, emi_amount: values.emi_amount ? Number(values.emi_amount) : null, end_date: values.end_date || null, notes: values.notes || null, status: values.status as LoanAdvanceStatus }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "loans", type] }); toast.success(`${singular} added`, `${singular} record saved.`); setLoanModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const loanUpdate = useMutation({
    mutationFn: (values: LoanFormValues) => updateLoanAdvance(loanEdit!.id, { title: values.title, outstanding_balance: values.outstanding_balance, emi_amount: values.emi_amount ? Number(values.emi_amount) : null, end_date: values.end_date || null, notes: values.notes || null, status: values.status as LoanAdvanceStatus }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "loans", type] }); toast.success(`${singular} updated`, `${singular} record updated.`); setLoanModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const loanDelete = useMutation({
    mutationFn: deleteLoanAdvance,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "loans", type] }); toast.success("Deleted", `${singular} removed.`); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  function onSubmit(values: LoanFormValues) {
    (loanEdit ? loanUpdate : loanCreate).mutate(values);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setLoanEdit(null); reset({ ...emptyLoanForm, status: defaultStatus(type) }); setLoanModal(true); }}>
            + New {singular}
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
                <td className="p-3" data-label="Status"><Badge label={LOAN_STATUS_LABELS[item.status] ?? item.status} tone={loanBadge(item.status)} /></td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setLoanEdit(item); reset({ employee_id: item.employee_id, title: item.title, amount: item.amount, outstanding_balance: item.outstanding_balance, emi_amount: item.emi_amount != null ? String(item.emi_amount) : "", start_date: item.start_date.slice(0, 10), end_date: item.end_date?.slice(0, 10) ?? "", notes: item.notes ?? "", status: item.status }); setLoanModal(true); }}>
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
              <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No {plural.toLowerCase()}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loanModal && (
        <Modal title={`${loanEdit ? "Edit" : "New"} ${singular}`} onClose={() => setLoanModal(false)}>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <FormField label="Employee">
              <select disabled={!!loanEdit} className={sel} {...register("employee_id")}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {errors.employee_id && <p className="mt-1 text-xs text-red-500">{errors.employee_id.message}</p>}
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Title">
                <FormInput {...register("title")} placeholder={type === "advance" ? "e.g. Medical Emergency Advance" : "e.g. Vehicle Loan"} />
                {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
              </FormField>
              <FormField label="Principal Amount">
                <FormInput
                  type="number" min={0} step="0.01"
                  {...register("amount", { onChange: (e) => { if (!loanEdit) setValue("outstanding_balance", Number(e.target.value)); } })}
                />
                {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
              </FormField>
              <FormField label="Outstanding Balance">
                <FormInput type="number" min={0} step="0.01" {...register("outstanding_balance")} />
                {errors.outstanding_balance && <p className="mt-1 text-xs text-red-500">{errors.outstanding_balance.message}</p>}
              </FormField>
              <FormField label="Monthly EMI (optional)">
                <FormInput type="number" min={0} step="0.01" {...register("emi_amount")} />
                {errors.emi_amount && <p className="mt-1 text-xs text-red-500">{errors.emi_amount.message}</p>}
              </FormField>
              <FormField label="Status">
                <select className={sel} {...register("status")}>
                  {Object.entries(LOAN_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormField>
              <FormField label="Start Date">
                <FormInput type="date" {...register("start_date")} />
                {errors.start_date && <p className="mt-1 text-xs text-red-500">{errors.start_date.message}</p>}
              </FormField>
              <FormField label="End Date (optional)">
                <FormInput type="date" {...register("end_date")} />
              </FormField>
            </div>
            <p className="text-xs text-[var(--muted)]">
              {type === "advance"
                ? "Pending/Approved advances are not deducted. Once the status is \"Paid out\", every payroll run deducts the EMI (or the whole balance if no EMI is set) automatically, and the advance is closed when the payroll is marked paid and the balance reaches zero."
                : "\"Deduct from salary\": the next payroll run deducts the EMI (or the full balance if no EMI is set); the loan closes when that payroll is marked paid and the balance reaches zero."}
            </p>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
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
