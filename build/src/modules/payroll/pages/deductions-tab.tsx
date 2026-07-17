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

const deductionTypeValues = DEDUCTION_TYPES.map(t => t.value) as [DeductionType, ...DeductionType[]];

const deductionSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  payroll_id: z.coerce.number().optional(),
  title: z.string().min(1, "Title is required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  type: z.enum(deductionTypeValues),
  effective_date: z.string().min(1, "Effective date is required"),
  notes: z.string().optional(),
});

type DeductionFormInput = z.input<typeof deductionSchema>;
type DeductionFormValues = z.output<typeof deductionSchema>;

const emptyDedForm: DeductionFormInput = { employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other", effective_date: "", notes: "" };

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

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<DeductionFormInput, any, DeductionFormValues>({
    resolver: zodResolver(deductionSchema),
    defaultValues: emptyDedForm,
  });

  const selectedEmployeeId = watch("employee_id");

  const dedCreate = useMutation({
    mutationFn: (values: DeductionFormValues) => createDeduction({ ...values, payroll_id: values.payroll_id || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); toast.success("Deduction added", "Deduction record saved."); setDedModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const dedUpdate = useMutation({
    mutationFn: (values: DeductionFormValues) => updateDeduction(dedEdit!.id, { title: values.title, amount: values.amount, type: values.type, effective_date: values.effective_date, notes: values.notes || null, payroll_id: values.payroll_id || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); toast.success("Deduction updated", "Deduction record updated."); setDedModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const dedDelete = useMutation({
    mutationFn: deleteDeduction,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); toast.success("Deleted", "Deduction removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  function onSubmit(values: DeductionFormValues) {
    (dedEdit ? dedUpdate : dedCreate).mutate(values);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setDedEdit(null); reset(emptyDedForm); setDedModal(true); }}>
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
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setDedEdit(item); reset({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), type: item.type, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setDedModal(true); }}>
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
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Employee">
                <select className={sel} {...register("employee_id")}>
                  <option value={0}>Select employee</option>
                  {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {errors.employee_id && <p className="mt-1 text-xs text-red-500">{errors.employee_id.message}</p>}
              </FormField>
              <FormField label="Type">
                <select className={sel} {...register("type")}>
                  {DEDUCTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FormField>
              <FormField label="Title">
                <FormInput {...register("title")} />
                {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
              </FormField>
              <FormField label="Amount">
                <FormInput type="number" min={0} step="0.01" {...register("amount")} />
                {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
              </FormField>
              <FormField label="Effective Date">
                <FormInput type="date" {...register("effective_date")} />
                {errors.effective_date && <p className="mt-1 text-xs text-red-500">{errors.effective_date.message}</p>}
              </FormField>
              <FormField label="Payroll (optional)">
                <select className={sel} {...register("payroll_id")}>
                  <option value={0}>No linked payroll</option>
                  {payrolls.filter(p => !selectedEmployeeId || p.employee_id === selectedEmployeeId).map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
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
