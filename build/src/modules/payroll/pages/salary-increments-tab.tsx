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
  type SalaryIncrement,
  createSalaryIncrement,
  deleteSalaryIncrement,
  listSalaryIncrements,
  updateSalaryIncrement,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, fmt, sel } from "./payroll-shared";

const incrementSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  effective_date: z.string().min(1, "Effective date is required"),
  old_salary: z.coerce.number().gt(0, "Old salary must be greater than 0"),
  new_salary: z.coerce.number().gt(0, "New salary must be greater than 0"),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

type IncrementFormInput = z.input<typeof incrementSchema>;
type IncrementFormValues = z.output<typeof incrementSchema>;

const emptyIncForm: IncrementFormInput = { employee_id: 0, effective_date: "", old_salary: 0, new_salary: 0, reason: "", notes: "" };

export function SalaryIncrementsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView   = useAuthStore(s => s.hasPermission("payroll:view"));

  const incrementsQ = useQuery({ queryKey: ["payroll", "increments"], queryFn: () => listSalaryIncrements(), enabled: canView || canManage });
  const employeesQ  = useQuery({ queryKey: ["payroll", "employees"],  queryFn: async () => (await getEmployees()).data ?? [] });

  const employees = employeesQ.data ?? [];

  const [incModal, setIncModal] = useState(false);
  const [incEdit,  setIncEdit]  = useState<SalaryIncrement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<IncrementFormInput, any, IncrementFormValues>({
    resolver: zodResolver(incrementSchema),
    defaultValues: emptyIncForm,
  });

  const [oldSalaryRaw, newSalaryRaw] = watch(["old_salary", "new_salary"]);
  const oldSalary = Number(oldSalaryRaw);
  const newSalary = Number(newSalaryRaw);

  const incCreate = useMutation({
    mutationFn: (values: IncrementFormValues) => createSalaryIncrement({ ...values, reason: values.reason || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "increments"] }); toast.success("Increment saved", "Salary increment recorded successfully."); setIncModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const incUpdate = useMutation({
    mutationFn: (values: IncrementFormValues) => updateSalaryIncrement(incEdit!.id, { effective_date: values.effective_date, old_salary: values.old_salary, new_salary: values.new_salary, reason: values.reason || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "increments"] }); toast.success("Increment updated", "Salary increment updated."); setIncModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const incDelete = useMutation({
    mutationFn: deleteSalaryIncrement,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "increments"] }); toast.success("Deleted", "Salary increment removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  function onSubmit(values: IncrementFormValues) {
    (incEdit ? incUpdate : incCreate).mutate(values);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setIncEdit(null); reset(emptyIncForm); setIncModal(true); }}>
            + Record Increment
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Employee</th>
              <th className="p-3">Effective Date</th>
              <th className="p-3">Old Salary</th>
              <th className="p-3">New Salary</th>
              <th className="p-3">% Change</th>
              <th className="p-3">Reason</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(incrementsQ.data?.data ?? []).map(item => {
              const pct = item.increment_percent_computed ?? (item.old_salary ? ((item.new_salary - item.old_salary) / item.old_salary * 100) : 0);
              return (
                <tr key={item.id} className="border-b border-[var(--border)]/50">
                  <td className="p-3" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                  <td className="p-3" data-label="Effective Date">{String(item.effective_date).slice(0, 10)}</td>
                  <td className="p-3" data-label="Old Salary">{fmt(item.old_salary)}</td>
                  <td className="p-3 font-semibold" data-label="New Salary">{fmt(item.new_salary)}</td>
                  <td className="p-3" data-label="% Change">
                    <Badge label={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`} tone={pct >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"} />
                  </td>
                  <td className="max-w-[140px] truncate p-3 text-xs text-[var(--muted)]" data-label="Reason">{item.reason ?? "—"}</td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-1.5">
                      {canManage && (
                        <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setIncEdit(item); reset({ employee_id: item.employee_id, effective_date: String(item.effective_date).slice(0, 10), old_salary: item.old_salary, new_salary: item.new_salary, reason: item.reason ?? "", notes: item.notes ?? "" }); setIncModal(true); }}>
                          Edit
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void incDelete.mutateAsync(item.id); }}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(incrementsQ.data?.data ?? []).length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No salary increment history.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {incModal && (
        <Modal title={`${incEdit ? "Edit" : "Record"} Salary Increment`} onClose={() => setIncModal(false)}>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <FormField label="Employee">
              <select disabled={!!incEdit} className={sel} {...register("employee_id")}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {errors.employee_id && <p className="mt-1 text-xs text-red-500">{errors.employee_id.message}</p>}
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Effective Date">
                <FormInput type="date" {...register("effective_date")} />
                {errors.effective_date && <p className="mt-1 text-xs text-red-500">{errors.effective_date.message}</p>}
              </FormField>
              <FormField label="Old Salary">
                <FormInput type="number" min={0} step="0.01" {...register("old_salary")} />
                {errors.old_salary && <p className="mt-1 text-xs text-red-500">{errors.old_salary.message}</p>}
              </FormField>
              <FormField label="New Salary">
                <FormInput type="number" min={0} step="0.01" {...register("new_salary")} />
                {errors.new_salary && <p className="mt-1 text-xs text-red-500">{errors.new_salary.message}</p>}
              </FormField>
              <FormField label="Reason">
                <select className={sel} {...register("reason")}>
                  <option value="">Select reason</option>
                  {["Annual review", "Promotion", "Market correction", "Performance-based", "Probation completion", "Other"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </FormField>
            </div>
            {oldSalary > 0 && newSalary > 0 && (
              <p className="text-sm text-[var(--muted)]">Change: <strong className={newSalary >= oldSalary ? "text-emerald-600" : "text-red-600"}>{newSalary >= oldSalary ? "+" : ""}{(((newSalary - oldSalary) / oldSalary) * 100).toFixed(2)}%</strong></p>
            )}
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIncModal(false)}>Cancel</Button>
              <Button type="submit" disabled={incCreate.isPending || incUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
