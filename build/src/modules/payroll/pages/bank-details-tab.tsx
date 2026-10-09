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
  type BankAccountType,
  type EmployeeBankAccount,
  createEmployeeBankAccount,
  deleteEmployeeBankAccount,
  listEmployeeBankAccounts,
  updateEmployeeBankAccount,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { sel } from "./payroll-shared";

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = { savings: "Savings", current: "Current", salary: "Salary" };

const bankSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  account_holder_name: z.string().trim().min(1, "Account holder name is required"),
  bank_name: z.string().trim().min(1, "Bank name is required"),
  branch_name: z.string().optional(),
  account_number: z.string().trim().min(1, "Account number is required"),
  iban: z.string().optional(),
  swift_code: z.string().optional(),
  routing_code: z.string().optional(),
  account_type: z.enum(["savings", "current", "salary"]),
  notes: z.string().optional(),
});

type BankFormInput = z.input<typeof bankSchema>;
type BankFormValues = z.output<typeof bankSchema>;

const emptyForm: BankFormInput = {
  employee_id: 0, account_holder_name: "", bank_name: "", branch_name: "", account_number: "",
  iban: "", swift_code: "", routing_code: "", account_type: "savings", notes: "",
};

const maskAccount = (n: string) => (n.length <= 4 ? n : `${"•".repeat(Math.min(n.length - 4, 8))}${n.slice(-4)}`);
const orNull = (v?: string) => (v?.trim() ? v.trim() : null);

export function BankDetailsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const accountsQ  = useQuery({ queryKey: ["payroll", "bank-accounts"], queryFn: listEmployeeBankAccounts, enabled: canManage });
  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployeeOptions()).data ?? [] });

  const accounts  = accountsQ.data?.data ?? [];
  const employees = employeesQ.data ?? [];
  const takenIds  = new Set(accounts.map(a => a.employee_id));

  const { sorted, sort, toggle: toggleSort } = useTableSort(accounts, "employee", {
    employee: (a) => a.employee?.name,
    bank_name: (a) => a.bank_name,
    account_holder_name: (a) => a.account_holder_name,
  });

  const [modal, setModal] = useState(false);
  const [edit, setEdit]   = useState<EmployeeBankAccount | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BankFormInput, any, BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: emptyForm,
  });

  const toPayload = (v: BankFormValues) => ({
    account_holder_name: v.account_holder_name,
    bank_name: v.bank_name,
    branch_name: orNull(v.branch_name),
    account_number: v.account_number,
    iban: orNull(v.iban),
    swift_code: orNull(v.swift_code),
    routing_code: orNull(v.routing_code),
    account_type: v.account_type,
    notes: orNull(v.notes),
  });

  const create = useMutation({
    mutationFn: (v: BankFormValues) => createEmployeeBankAccount({ employee_id: v.employee_id, ...toPayload(v) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bank-accounts"] }); toast.success("Saved", "Bank details saved."); setModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const update = useMutation({
    mutationFn: (v: BankFormValues) => updateEmployeeBankAccount(edit!.id, toPayload(v)),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bank-accounts"] }); toast.success("Updated", "Bank details updated."); setModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const remove = useMutation({
    mutationFn: deleteEmployeeBankAccount,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bank-accounts"] }); toast.success("Deleted", "Bank details removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  if (!canManage) {
    return <p className="p-6 text-center text-sm text-[var(--muted)]">You do not have permission to view bank details.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="text-xs" onClick={() => { setEdit(null); reset(emptyForm); setModal(true); }}>+ Add Bank Details</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <SortableTh label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
              <SortableTh label="Account Holder" sortKey="account_holder_name" sort={sort} onSort={toggleSort} />
              <SortableTh label="Bank" sortKey="bank_name" sort={sort} onSort={toggleSort} />
              <th className="p-3">Branch</th>
              <th className="p-3">Account No.</th>
              <th className="p-3">Type</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(a => (
              <tr key={a.id} className="border-b border-[var(--border)]/50">
                <td className="p-3 font-medium" data-label="Employee">{a.employee?.name ?? `#${a.employee_id}`}</td>
                <td className="p-3" data-label="Account Holder">{a.account_holder_name}</td>
                <td className="p-3" data-label="Bank">{a.bank_name}</td>
                <td className="p-3" data-label="Branch">{a.branch_name || "—"}</td>
                <td className="p-3 font-mono" data-label="Account No.">{maskAccount(a.account_number)}</td>
                <td className="p-3" data-label="Type">{ACCOUNT_TYPE_LABELS[a.account_type] ?? a.account_type}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    <Button variant="outline" className="text-xs px-2 py-1" onClick={() => {
                      setEdit(a);
                      reset({
                        employee_id: a.employee_id, account_holder_name: a.account_holder_name, bank_name: a.bank_name,
                        branch_name: a.branch_name ?? "", account_number: a.account_number, iban: a.iban ?? "",
                        swift_code: a.swift_code ?? "", routing_code: a.routing_code ?? "", account_type: a.account_type, notes: a.notes ?? "",
                      });
                      setModal(true);
                    }}>Edit</Button>
                    <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete these bank details?")) void remove.mutateAsync(a.id); }}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No bank details added.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={`${edit ? "Edit" : "Add"} Bank Details`} onClose={() => setModal(false)}>
          <form className="space-y-4" onSubmit={handleSubmit((v) => (edit ? update : create).mutate(v))}>
            <FormField label="Employee">
              <select disabled={!!edit} className={sel} {...register("employee_id")}>
                <option value={0}>Select employee</option>
                {employees.filter(x => edit?.employee_id === x.id || !takenIds.has(x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {errors.employee_id && <p className="mt-1 text-xs text-red-500">{errors.employee_id.message}</p>}
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Account Holder Name">
                <FormInput {...register("account_holder_name")} />
                {errors.account_holder_name && <p className="mt-1 text-xs text-red-500">{errors.account_holder_name.message}</p>}
              </FormField>
              <FormField label="Bank Name">
                <FormInput {...register("bank_name")} />
                {errors.bank_name && <p className="mt-1 text-xs text-red-500">{errors.bank_name.message}</p>}
              </FormField>
              <FormField label="Branch (optional)">
                <FormInput {...register("branch_name")} />
              </FormField>
              <FormField label="Account Type">
                <select className={sel} {...register("account_type")}>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormField>
              <FormField label="Account Number">
                <FormInput autoComplete="off" {...register("account_number")} />
                {errors.account_number && <p className="mt-1 text-xs text-red-500">{errors.account_number.message}</p>}
              </FormField>
              <FormField label="IBAN (optional)">
                <FormInput autoComplete="off" {...register("iban")} />
              </FormField>
              <FormField label="SWIFT / BIC (optional)">
                <FormInput {...register("swift_code")} />
              </FormField>
              <FormField label="Routing / Sort / IFSC Code (optional)">
                <FormInput {...register("routing_code")} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
