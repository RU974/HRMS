import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { getEmployeeOptions } from "@/services/employee-service";
import { createCommission, deleteCommission, listCommissions } from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, fmt, sel } from "./payroll-shared";

const today = () => new Date().toISOString().slice(0, 10);

export function CommissionsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const commissionsQ = useQuery({ queryKey: ["payroll", "commissions"], queryFn: async () => (await listCommissions()).data ?? [] });
  const employeesQ   = useQuery({ queryKey: ["payroll", "employee-options"], queryFn: async () => (await getEmployeeOptions()).data ?? [] });

  const { sorted: commissions, sort, toggle: toggleSort } = useTableSort(commissionsQ.data ?? [], "employee", {
    employee: (c) => c.employee?.name,
    business_amount: (c) => Number(c.business_amount),
    commission_percentage: (c) => Number(c.commission_percentage),
    commission_amount: (c) => Number(c.commission_amount),
  });
  const employees   = (employeesQ.data ?? []).filter(e => e.status !== "inactive");

  const [employeeId, setEmployeeId] = useState("");
  const [business, setBusiness]     = useState("");
  const [date, setDate]             = useState(today());
  const [notes, setNotes]           = useState("");

  const employee   = useMemo(() => employees.find(e => String(e.id) === employeeId), [employees, employeeId]);
  const percentage = Number(employee?.commission_percentage ?? 0);
  const businessAmount = Number(business) || 0;
  // Preview only — the server recomputes the amount from the employee's stored percentage.
  const commissionAmount = Math.round(businessAmount * percentage) / 100;

  const noRate  = !!employee && percentage <= 0;
  const canSave = canManage && !!employee && !noRate && businessAmount > 0 && !!date;

  const create = useMutation({
    mutationFn: () => createCommission({ employee_id: Number(employeeId), business_amount: businessAmount, effective_date: date, notes: notes || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payroll", "commissions"] });
      toast.success("Commission saved", "It will be added to this month's payroll when it is generated.");
      setBusiness("");
      setNotes("");
    },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const remove = useMutation({
    mutationFn: deleteCommission,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "commissions"] }); toast.success("Deleted", "Commission removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-base font-semibold">Commission Calculator</h3>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Select an employee and enter the business they brought in. The commission is added to their payroll for the month of the date below.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Employee">
              <select className={sel} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormField>
            <FormField label="Commission %">
              <FormInput readOnly disabled value={employee ? `${percentage}%` : ""} placeholder="Auto" />
            </FormField>
            <FormField label="Business Amount">
              <FormInput type="number" min={0} step="0.01" value={business} onChange={e => setBusiness(e.target.value)} />
            </FormField>
            <FormField label="Date">
              <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} />
            </FormField>
          </div>
          {noRate && (
            <p className="mt-3 text-sm text-red-600">This employee has no commission percentage. Set one on their profile (Salary Information) first.</p>
          )}
          <div className="mt-3">
            <FormField label="Notes (optional)">
              <textarea className="min-h-14 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} />
            </FormField>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Total Commission</p>
              <p className="text-2xl font-semibold">{fmt(commissionAmount)}</p>
              {employee && percentage > 0 && businessAmount > 0 && (
                <p className="text-xs text-[var(--muted)]">{fmt(businessAmount)} × {percentage}%</p>
              )}
            </div>
            <Button disabled={!canSave || create.isPending} onClick={() => create.mutate()}>Save Commission</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <SortableTh label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
              <SortableTh label="Business" sortKey="business_amount" sort={sort} onSort={toggleSort} />
              <SortableTh label="Rate" sortKey="commission_percentage" sort={sort} onSort={toggleSort} />
              <SortableTh label="Commission" sortKey="commission_amount" sort={sort} onSort={toggleSort} />
              <SortableTh label="Date" sortKey="effective_date" sort={sort} onSort={toggleSort} />
              <th className="p-3">Payroll</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {commissions.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3" data-label="Business">{fmt(Number(item.business_amount))}</td>
                <td className="p-3" data-label="Rate">{Number(item.commission_percentage)}%</td>
                <td className="p-3 font-medium" data-label="Commission">{fmt(Number(item.commission_amount))}</td>
                <td className="p-3" data-label="Date">{item.effective_date.slice(0, 10)}</td>
                <td className="p-3" data-label="Payroll">
                  <Badge
                    label={item.payroll_id ? `In payroll #${item.payroll_id}` : "Pending"}
                    tone={item.payroll_id ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
                  />
                </td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end">
                    {canManage && !item.payroll_id && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete this commission?")) void remove.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {commissions.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No commission records.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
