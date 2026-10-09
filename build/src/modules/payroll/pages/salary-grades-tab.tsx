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
import {
  type SalaryGrade,
  createSalaryGrade,
  deleteSalaryGrade,
  listSalaryGrades,
  updateSalaryGrade,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { fmt, sel } from "./payroll-shared";

const gradeSchema = z.object({
  name: z.string().min(1, "Grade name is required"),
  min_salary: z.coerce.number().gt(0, "Min salary must be greater than 0"),
  max_salary: z.coerce.number().gt(0, "Max salary must be greater than 0"),
  basic_percent: z.coerce.number().min(0).max(100),
  hra_percent: z.coerce.number().min(0).max(100),
  transport_allowance: z.coerce.number().min(0),
  other_allowance: z.coerce.number().min(0),
  notes: z.string().optional(),
});

type GradeFormInput = z.input<typeof gradeSchema>;
type GradeFormValues = z.output<typeof gradeSchema>;

const emptyGradeForm: GradeFormInput = { name: "", min_salary: 0, max_salary: 0, basic_percent: 50, hra_percent: 20, transport_allowance: 0, other_allowance: 0, notes: "" };

export function SalaryGradesTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView   = useAuthStore(s => s.hasPermission("payroll:view"));

  const salaryGradesQ = useQuery({
    queryKey: ["payroll", "salary-grades"],
    queryFn:  listSalaryGrades,
    enabled:  canView || canManage,
  });

  const { sorted: sortedGrades, sort, toggle: toggleSort } = useTableSort(salaryGradesQ.data ?? [], "name", {
    min_salary: (g) => Number(g.min_salary),
  });
  const [gradeModal, setGradeModal] = useState(false);
  const [gradeEdit,  setGradeEdit]  = useState<SalaryGrade | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GradeFormInput, any, GradeFormValues>({
    resolver: zodResolver(gradeSchema),
    defaultValues: emptyGradeForm,
  });

  const gradeCreate = useMutation({
    mutationFn: (values: GradeFormValues) => createSalaryGrade({ ...values, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "salary-grades"] }); toast.success("Salary grade saved", "Salary grade created successfully."); setGradeModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const gradeUpdate = useMutation({
    mutationFn: (values: GradeFormValues) => updateSalaryGrade(gradeEdit!.id, { ...values, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "salary-grades"] }); toast.success("Salary grade updated", "Salary grade updated successfully."); setGradeModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const gradeDelete = useMutation({
    mutationFn: deleteSalaryGrade,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "salary-grades"] }); toast.success("Deleted", "Salary grade removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  function onSubmit(values: GradeFormValues) {
    (gradeEdit ? gradeUpdate : gradeCreate).mutate(values);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Salary Grade Templates</p>
          <p className="text-xs text-[var(--muted)]">Reusable salary bands. Link a grade to an employee to pre-fill salary components.</p>
        </div>
        {canManage && (
          <Button className="text-xs shrink-0" onClick={() => { setGradeEdit(null); reset(emptyGradeForm); setGradeModal(true); }}>
            + Add Grade
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
              <SortableTh label="Salary Range" sortKey="min_salary" sort={sort} onSort={toggleSort} />
              <SortableTh label="Basic %" sortKey="basic_percent" sort={sort} onSort={toggleSort} />
              <SortableTh label="HRA %" sortKey="hra_percent" sort={sort} onSort={toggleSort} />
              <SortableTh label="Transport" sortKey="transport_allowance" sort={sort} onSort={toggleSort} />
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedGrades.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50">
                <td className="p-3 font-medium" data-label="Name">{item.name}</td>
                <td className="p-3" data-label="Salary Range">{fmt(item.min_salary)} – {fmt(item.max_salary)}</td>
                <td className="p-3" data-label="Basic %">{item.basic_percent ?? 50}%</td>
                <td className="p-3" data-label="HRA %">{item.hra_percent ?? 20}%</td>
                <td className="p-3" data-label="Transport">{fmt(item.transport_allowance ?? 0)}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-1.5">
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setGradeEdit(item); reset({ name: item.name, min_salary: item.min_salary, max_salary: item.max_salary, basic_percent: item.basic_percent ?? 50, hra_percent: item.hra_percent ?? 20, transport_allowance: item.transport_allowance ?? 0, other_allowance: item.other_allowance ?? 0, notes: item.notes ?? "" }); setGradeModal(true); }}>
                        Edit
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void gradeDelete.mutateAsync(item.id); }}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(salaryGradesQ.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No salary grades configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {gradeModal && (
        <Modal title={`${gradeEdit ? "Edit" : "Add"} Salary Grade`} onClose={() => setGradeModal(false)}>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Grade Name">
                <FormInput {...register("name")} placeholder="e.g. Grade A" />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </FormField>
              <FormField label="Min Salary">
                <FormInput type="number" min={0} step="0.01" {...register("min_salary")} />
                {errors.min_salary && <p className="mt-1 text-xs text-red-500">{errors.min_salary.message}</p>}
              </FormField>
              <FormField label="Max Salary">
                <FormInput type="number" min={0} step="0.01" {...register("max_salary")} />
                {errors.max_salary && <p className="mt-1 text-xs text-red-500">{errors.max_salary.message}</p>}
              </FormField>
              <FormField label="Basic % of gross">
                <FormInput type="number" min={0} max={100} step="0.01" {...register("basic_percent")} />
                {errors.basic_percent && <p className="mt-1 text-xs text-red-500">{errors.basic_percent.message}</p>}
              </FormField>
              <FormField label="HRA % of basic">
                <FormInput type="number" min={0} max={100} step="0.01" {...register("hra_percent")} />
                {errors.hra_percent && <p className="mt-1 text-xs text-red-500">{errors.hra_percent.message}</p>}
              </FormField>
              <FormField label="Transport Allowance">
                <FormInput type="number" min={0} step="0.01" {...register("transport_allowance")} />
              </FormField>
              <FormField label="Other Allowance">
                <FormInput type="number" min={0} step="0.01" {...register("other_allowance")} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setGradeModal(false)}>Cancel</Button>
              <Button type="submit" disabled={gradeCreate.isPending || gradeUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
