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
  type PayrollProcessing,
  createPayrollProcessing,
  deletePayrollProcessing,
  listPayrollProcessings,
  updatePayrollProcessing,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, payrollBadge, sel } from "./payroll-shared";

const processingStatuses = ["draft", "processing", "completed", "cancelled"] as const;

const processingSchema = z.object({
  month: z.coerce.number().min(1, "Month must be between 1 and 12").max(12, "Month must be between 1 and 12"),
  year: z.coerce.number().min(2020, "Enter a valid year"),
  status: z.enum(processingStatuses),
  processed_at: z.string().optional(),
  notes: z.string().optional(),
});

type ProcessingFormInput = z.input<typeof processingSchema>;
type ProcessingFormValues = z.output<typeof processingSchema>;

const emptyProcForm: ProcessingFormInput = { month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft", processed_at: "", notes: "" };

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProcessingFormInput, any, ProcessingFormValues>({
    resolver: zodResolver(processingSchema),
    defaultValues: emptyProcForm,
  });

  const procCreate = useMutation({
    mutationFn: (values: ProcessingFormValues) => createPayrollProcessing({ ...values, processed_at: values.processed_at || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); toast.success("Processing created", "Payroll processing record saved."); setProcModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const procUpdate = useMutation({
    mutationFn: (values: ProcessingFormValues) => updatePayrollProcessing(procEdit!.id, { status: values.status, processed_at: values.processed_at || null, notes: values.notes || null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); toast.success("Processing updated", "Payroll processing record updated."); setProcModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const procDelete = useMutation({
    mutationFn: deletePayrollProcessing,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); toast.success("Deleted", "Processing record removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  function onSubmit(values: ProcessingFormValues) {
    (procEdit ? procUpdate : procCreate).mutate(values);
  }

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
            {processingStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button variant="outline" className="text-xs" onClick={() => { setProcMonthF(""); setProcYearF(new Date().getFullYear()); setProcStatF(""); }}>Reset</Button>
        {canManage && (
          <Button className="ml-auto text-xs" onClick={() => { setProcEdit(null); reset(emptyProcForm); setProcModal(true); }}>
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
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setProcEdit(item); reset({ month: item.month, year: item.year, status: item.status, processed_at: item.processed_at?.slice(0, 10) ?? "", notes: item.notes ?? "" }); setProcModal(true); }}>
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
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month">
                <FormInput type="number" min={1} max={12} {...register("month")} />
                {errors.month && <p className="mt-1 text-xs text-red-500">{errors.month.message}</p>}
              </FormField>
              <FormField label="Year">
                <FormInput type="number" min={2020} {...register("year")} />
                {errors.year && <p className="mt-1 text-xs text-red-500">{errors.year.message}</p>}
              </FormField>
              <FormField label="Status">
                <select className={sel} {...register("status")}>
                  {processingStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Processed At">
                <FormInput type="date" {...register("processed_at")} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" {...register("notes")} maxLength={1000} />
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
