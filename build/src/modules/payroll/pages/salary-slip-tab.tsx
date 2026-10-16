import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import {
  createSalarySlipFromPayroll,
  listAllPayroll,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { sel } from "./payroll-shared";

export function SalarySlipTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const payrollsQ = useQuery({ queryKey: ["payroll", "base"], queryFn: () => listAllPayroll() });
  const payrolls = payrollsQ.data ?? [];

  const [slipPayrollId, setSlipPayrollId] = useState(0);
  const [slipDate,      setSlipDate]      = useState("");

  const slipMut = useMutation({
    mutationFn: () => createSalarySlipFromPayroll(slipPayrollId, slipDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] });
      toast.success("Salary slip created", "Salary slip generated successfully.");
      setSlipPayrollId(0);
      setSlipDate("");
    },
    onError: (e: Error) => toast.error("Failed to create slip", e.message),
  });

  if (!canManage) return null;

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-[var(--muted)]">Generate and issue a salary slip from an existing payroll record.</p>
      <FormField label="Payroll Record">
        <select className={sel} value={slipPayrollId} onChange={e => setSlipPayrollId(Number(e.target.value))}>
          <option value={0}>Select payroll</option>
          {payrolls.map(p => <option key={p.id} value={p.id}>#{p.id} — {p.employee?.name} ({p.month}/{p.year})</option>)}
        </select>
      </FormField>
      <FormField label="Issue Date"><FormInput type="date" value={slipDate} onChange={e => setSlipDate(e.target.value)} /></FormField>
      <Button onClick={() => void slipMut.mutateAsync()} disabled={!slipPayrollId || !slipDate || slipMut.isPending}>
        {slipMut.isPending ? "Generating…" : "Generate Salary Slip"}
      </Button>
      {slipMut.isSuccess && <p className="text-sm text-emerald-600">Salary slip created. View it in the Payslips tab.</p>}
    </div>
  );
}
