import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
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
  type Bonus,
  createBonus,
  deleteBonus,
  listBonuses,
  listAllPayroll,
  updateBonus,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, fmt, sel } from "./payroll-shared";

const bonusSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  payroll_id: z.coerce.number().optional(),
  title: z.string().min(1, "Title is required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  taxable: z.boolean(),
  effective_date: z.string().min(1, "Effective date is required"),
  notes: z.string().optional(),
});

type BonusFormInput = z.input<typeof bonusSchema>;
type BonusFormValues = z.output<typeof bonusSchema>;

const emptyBonusForm: BonusFormInput = { employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" };

export function BonusesTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const bonusesQ   = useQuery({ queryKey: ["payroll", "bonuses"],   queryFn: async () => (await listBonuses()).data ?? [] });
  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployeeOptions()).data ?? [] });
  const payrollsQ  = useQuery({ queryKey: ["payroll", "base"],      queryFn: () => listAllPayroll() });

  const { sorted: bonuses, sort, toggle: toggleSort } = useTableSort(bonusesQ.data ?? [], "employee", {
    employee: (b) => b.employee?.name, amount: (b) => Number(b.amount),
  });
  const employees = employeesQ.data ?? [];
  const payrolls  = payrollsQ.data ?? [];

  const [bonusModal, setBonusModal] = useState(false);
  const [bonusEdit,  setBonusEdit]  = useState<Bonus | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<BonusFormInput, any, BonusFormValues>({
    resolver: zodResolver(bonusSchema),
    defaultValues: emptyBonusForm,
  });

  const selectedEmployeeId = watch("employee_id");

  const bonusCreate = useMutation({
    mutationFn: (values: BonusFormValues) => createBonus({ ...values, payroll_id: values.payroll_id || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); toast.success("Bonus added", "Bonus record saved successfully."); setBonusModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const bonusUpdate = useMutation({
    mutationFn: (values: BonusFormValues) => updateBonus(bonusEdit!.id, { title: values.title, amount: values.amount, taxable: values.taxable, effective_date: values.effective_date, notes: values.notes || null, payroll_id: values.payroll_id || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); toast.success("Bonus updated", "Bonus record updated successfully."); setBonusModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const bonusDelete = useMutation({
    mutationFn: deleteBonus,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); toast.success("Deleted", "Bonus removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  function onSubmit(values: BonusFormValues) {
    (bonusEdit ? bonusUpdate : bonusCreate).mutate(values);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button className="text-xs" onClick={() => { setBonusEdit(null); reset(emptyBonusForm); setBonusModal(true); }}>
            + New Bonus
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <SortableTh label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
              <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
              <SortableTh label="Amount" sortKey="amount" sort={sort} onSort={toggleSort} />
              <SortableTh label="Taxable" sortKey="taxable" sort={sort} onSort={toggleSort} />
              <SortableTh label="Date" sortKey="effective_date" sort={sort} onSort={toggleSort} />
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bonuses.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3 font-medium" data-label="Title">{item.title}</td>
                <td className="p-3" data-label="Amount">{fmt(Number(item.amount))}</td>
                <td className="p-3" data-label="Taxable"><Badge label={item.taxable ? "Yes" : "No"} tone={item.taxable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-700"} /></td>
                <td className="p-3" data-label="Date">{item.effective_date.slice(0, 10)}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setBonusEdit(item); reset({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), taxable: item.taxable, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setBonusModal(true); }}>
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
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Employee">
                <select className={sel} {...register("employee_id")}>
                  <option value={0}>Select employee</option>
                  {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {errors.employee_id && <p className="mt-1 text-xs text-red-500">{errors.employee_id.message}</p>}
              </FormField>
              <FormField label="Payroll (optional)">
                <select className={sel} {...register("payroll_id")}>
                  <option value={0}>No linked payroll</option>
                  {payrolls.filter(p => !selectedEmployeeId || p.employee_id === selectedEmployeeId).map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
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
              <FormField label="Taxable">
                <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm cursor-pointer">
                  <input type="checkbox" {...register("taxable")} className="h-4 w-4 accent-[var(--primary)]" />
                  Mark as taxable
                </label>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
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
