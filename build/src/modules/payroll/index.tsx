import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { getEmployees } from "@/services/employee-service";
import {
  Bonus,
  Deduction,
  Payslip,
  PayrollProcessing,
  createBonus,
  createDeduction,
  createPayrollProcessing,
  createPayslip,
  createSalarySlipFromPayroll,
  deleteBonus,
  deleteDeduction,
  deletePayrollProcessing,
  deletePayslip,
  listBonuses,
  listDeductions,
  listPayroll,
  listPayrollProcessings,
  listPayslips,
  updateBonus,
  updateDeduction,
  updatePayrollProcessing,
  updatePayslip
} from "@/services/payroll-service";

type Tab = "salary-slip" | "payroll-processing" | "payslips" | "bonuses" | "deductions";

export function PayrollPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("salary-slip");
  const [error, setError] = useState<string | null>(null);

  const [salarySlipIssueDate, setSalarySlipIssueDate] = useState("");
  const [salarySlipPayrollId, setSalarySlipPayrollId] = useState<number>(0);

  const [processingModal, setProcessingModal] = useState(false);
  const [processingEdit, setProcessingEdit] = useState<PayrollProcessing | null>(null);
  const [processingForm, setProcessingForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft" as PayrollProcessing["status"], processed_at: "", notes: "" });

  const [payslipModal, setPayslipModal] = useState(false);
  const [payslipEdit, setPayslipEdit] = useState<Payslip | null>(null);
  const [payslipForm, setPayslipForm] = useState({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft" as Payslip["status"], file_url: "", notes: "" });

  const [bonusModal, setBonusModal] = useState(false);
  const [bonusEdit, setBonusEdit] = useState<Bonus | null>(null);
  const [bonusForm, setBonusForm] = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" });

  const [deductionModal, setDeductionModal] = useState(false);
  const [deductionEdit, setDeductionEdit] = useState<Deduction | null>(null);
  const [deductionForm, setDeductionForm] = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other" as Deduction["type"], effective_date: "", notes: "" });

  const employees = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployees()).data ?? [] });
  const payrolls = useQuery({ queryKey: ["payroll", "base"], queryFn: async () => (await listPayroll()).data ?? [] });
  const processings = useQuery({ queryKey: ["payroll", "processings"], queryFn: async () => (await listPayrollProcessings()).data ?? [] });
  const payslips = useQuery({ queryKey: ["payroll", "payslips"], queryFn: async () => (await listPayslips()).data ?? [] });
  const bonuses = useQuery({ queryKey: ["payroll", "bonuses"], queryFn: async () => (await listBonuses()).data ?? [] });
  const deductions = useQuery({ queryKey: ["payroll", "deductions"], queryFn: async () => (await listDeductions()).data ?? [] });

  const salarySlipMutation = useMutation({
    mutationFn: () => createSalarySlipFromPayroll(salarySlipPayrollId, salarySlipIssueDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] });
      setSalarySlipIssueDate("");
      setSalarySlipPayrollId(0);
    },
    onError: (e: Error) => setError(e.message)
  });

  const processingCreate = useMutation({ mutationFn: createPayrollProcessing, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); setProcessingModal(false); }, onError: (e: Error) => setError(e.message) });
  const processingUpdate = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<Omit<PayrollProcessing, "id">> }) => updatePayrollProcessing(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); setProcessingModal(false); }, onError: (e: Error) => setError(e.message) });
  const processingDelete = useMutation({ mutationFn: deletePayrollProcessing, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "processings"] }); }, onError: (e: Error) => setError(e.message) });

  const payslipCreate = useMutation({ mutationFn: createPayslip, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); setPayslipModal(false); }, onError: (e: Error) => setError(e.message) });
  const payslipUpdateMut = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<{ status: Payslip["status"]; issue_date: string; file_url?: string; notes?: string }> }) => updatePayslip(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); setPayslipModal(false); }, onError: (e: Error) => setError(e.message) });
  const payslipDeleteMut = useMutation({ mutationFn: deletePayslip, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] }); }, onError: (e: Error) => setError(e.message) });

  const bonusCreate = useMutation({ mutationFn: createBonus, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); setBonusModal(false); }, onError: (e: Error) => setError(e.message) });
  const bonusUpdateMut = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<Omit<Bonus, "id" | "employee">> }) => updateBonus(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); setBonusModal(false); }, onError: (e: Error) => setError(e.message) });
  const bonusDeleteMut = useMutation({ mutationFn: deleteBonus, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "bonuses"] }); }, onError: (e: Error) => setError(e.message) });

  const deductionCreate = useMutation({ mutationFn: createDeduction, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); setDeductionModal(false); }, onError: (e: Error) => setError(e.message) });
  const deductionUpdateMut = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<Omit<Deduction, "id" | "employee">> }) => updateDeduction(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); setDeductionModal(false); }, onError: (e: Error) => setError(e.message) });
  const deductionDeleteMut = useMutation({ mutationFn: deleteDeduction, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "deductions"] }); }, onError: (e: Error) => setError(e.message) });

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" subtitle="Manage salary slip, payroll processing, payslips, bonuses, and deductions." />
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["salary-slip", "payroll-processing", "payslips", "bonuses", "deductions"] as Tab[]).map((t) => (
            <Button key={t} variant={tab === t ? "primary" : "outline"} onClick={() => setTab(t)}>{t.replace("-", " ").toUpperCase()}</Button>
          ))}
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {tab === "salary-slip" && (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Payroll Record">
              <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={salarySlipPayrollId} onChange={(e) => setSalarySlipPayrollId(Number(e.target.value))}>
                <option value={0}>Select payroll</option>
                {(payrolls.data ?? []).map((p) => <option key={p.id} value={p.id}>#{p.id} - {p.month}/{p.year}</option>)}
              </select>
            </FormField>
            <FormField label="Issue Date"><FormInput type="date" value={salarySlipIssueDate} onChange={(e) => setSalarySlipIssueDate(e.target.value)} /></FormField>
            <div className="flex items-end"><Button className="w-full" onClick={() => void salarySlipMutation.mutate()}>Generate Salary Slip</Button></div>
          </div>
        )}

        {tab === "payroll-processing" && (
          <SectionTable
            onAdd={() => { setProcessingEdit(null); setProcessingModal(true); }}
            headers={["Month", "Year", "Status", "Processed At", "Notes", "Actions"]}
            rows={(processings.data ?? []).map((item) => [String(item.month), String(item.year), item.status, item.processed_at?.slice(0, 10) ?? "-", item.notes ?? "-", <div className="flex gap-2" key={item.id}><Button variant="outline" onClick={() => { setProcessingEdit(item); setProcessingForm({ month: item.month, year: item.year, status: item.status, processed_at: item.processed_at?.slice(0, 10) ?? "", notes: item.notes ?? "" }); setProcessingModal(true); }}>Edit</Button><Button variant="outline" onClick={() => void processingDelete.mutateAsync(item.id)}>Delete</Button></div>])}
          />
        )}

        {tab === "payslips" && (
          <SectionTable
            onAdd={() => { setPayslipEdit(null); setPayslipModal(true); }}
            headers={["Slip #", "Employee", "Payroll", "Issue Date", "Status", "Actions"]}
            rows={(payslips.data ?? []).map((item) => [item.slip_number, item.employee?.name ?? `#${item.employee_id}`, `#${item.payroll_id}`, item.issue_date, item.status, <div className="flex gap-2" key={item.id}><Button variant="outline" onClick={() => { setPayslipEdit(item); setPayslipForm({ employee_id: item.employee_id, payroll_id: item.payroll_id, slip_number: item.slip_number, issue_date: item.issue_date.slice(0, 10), status: item.status, file_url: item.file_url ?? "", notes: item.notes ?? "" }); setPayslipModal(true); }}>Edit</Button><Button variant="outline" onClick={() => void payslipDeleteMut.mutateAsync(item.id)}>Delete</Button></div>])}
          />
        )}

        {tab === "bonuses" && (
          <SectionTable
            onAdd={() => { setBonusEdit(null); setBonusModal(true); }}
            headers={["Employee", "Payroll", "Title", "Amount", "Date", "Actions"]}
            rows={(bonuses.data ?? []).map((item) => [item.employee?.name ?? `#${item.employee_id}`, item.payroll_id ? `#${item.payroll_id}` : "-", item.title, Number(item.amount).toLocaleString(), item.effective_date, <div className="flex gap-2" key={item.id}><Button variant="outline" onClick={() => { setBonusEdit(item); setBonusForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), taxable: item.taxable, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setBonusModal(true); }}>Edit</Button><Button variant="outline" onClick={() => void bonusDeleteMut.mutateAsync(item.id)}>Delete</Button></div>])}
          />
        )}

        {tab === "deductions" && (
          <SectionTable
            onAdd={() => { setDeductionEdit(null); setDeductionModal(true); }}
            headers={["Employee", "Payroll", "Title", "Type", "Amount", "Actions"]}
            rows={(deductions.data ?? []).map((item) => [item.employee?.name ?? `#${item.employee_id}`, item.payroll_id ? `#${item.payroll_id}` : "-", item.title, item.type, Number(item.amount).toLocaleString(), <div className="flex gap-2" key={item.id}><Button variant="outline" onClick={() => { setDeductionEdit(item); setDeductionForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), type: item.type, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setDeductionModal(true); }}>Edit</Button><Button variant="outline" onClick={() => void deductionDeleteMut.mutateAsync(item.id)}>Delete</Button></div>])}
          />
        )}
      </section>

      {processingModal && <Modal title={`${processingEdit ? "Edit" : "New"} Payroll Processing`} onClose={() => setProcessingModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const payload = { ...processingForm, processed_at: processingForm.processed_at || null, notes: processingForm.notes || null }; if (processingEdit) { void processingUpdate.mutate({ id: processingEdit.id, payload }); return; } void processingCreate.mutate(payload); }}><FormField label="Month"><FormInput type="number" min={1} max={12} value={processingForm.month} onChange={(e) => setProcessingForm((p) => ({ ...p, month: Number(e.target.value) }))} /></FormField><FormField label="Year"><FormInput type="number" min={2020} value={processingForm.year} onChange={(e) => setProcessingForm((p) => ({ ...p, year: Number(e.target.value) }))} /></FormField><FormField label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={processingForm.status} onChange={(e) => setProcessingForm((p) => ({ ...p, status: e.target.value as PayrollProcessing["status"] }))}><option value="draft">Draft</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></FormField><FormField label="Processed At"><FormInput type="date" value={processingForm.processed_at} onChange={(e) => setProcessingForm((p) => ({ ...p, processed_at: e.target.value }))} /></FormField><FormField label="Notes"><FormInput value={processingForm.notes} onChange={(e) => setProcessingForm((p) => ({ ...p, notes: e.target.value }))} /></FormField><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
      {payslipModal && <Modal title={`${payslipEdit ? "Edit" : "New"} Payslip`} onClose={() => setPayslipModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (payslipEdit) { void payslipUpdateMut.mutate({ id: payslipEdit.id, payload: { status: payslipForm.status, issue_date: payslipForm.issue_date, file_url: payslipForm.file_url || undefined, notes: payslipForm.notes || undefined } }); return; } void payslipCreate.mutate({ ...payslipForm, file_url: payslipForm.file_url || null, notes: payslipForm.notes || null }); }}><FormField label="Employee"><select disabled={Boolean(payslipEdit)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipForm.employee_id} onChange={(e) => setPayslipForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Payroll"><select disabled={Boolean(payslipEdit)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipForm.payroll_id} onChange={(e) => setPayslipForm((p) => ({ ...p, payroll_id: Number(e.target.value) }))}><option value={0}>Select payroll</option>{(payrolls.data ?? []).map((x) => <option key={x.id} value={x.id}>#{x.id} - {x.month}/{x.year}</option>)}</select></FormField>{!payslipEdit && <FormField label="Slip Number"><FormInput value={payslipForm.slip_number} onChange={(e) => setPayslipForm((p) => ({ ...p, slip_number: e.target.value }))} /></FormField>}<FormField label="Issue Date"><FormInput type="date" value={payslipForm.issue_date} onChange={(e) => setPayslipForm((p) => ({ ...p, issue_date: e.target.value }))} /></FormField><FormField label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipForm.status} onChange={(e) => setPayslipForm((p) => ({ ...p, status: e.target.value as Payslip["status"] }))}><option value="draft">Draft</option><option value="issued">Issued</option><option value="cancelled">Cancelled</option></select></FormField><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
      {bonusModal && <Modal title={`${bonusEdit ? "Edit" : "New"} Bonus`} onClose={() => setBonusModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const payload = { ...bonusForm, payroll_id: bonusForm.payroll_id || null, notes: bonusForm.notes || null }; if (bonusEdit) { void bonusUpdateMut.mutate({ id: bonusEdit.id, payload }); return; } void bonusCreate.mutate(payload); }}><FormField label="Employee"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={bonusForm.employee_id} onChange={(e) => setBonusForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Title"><FormInput value={bonusForm.title} onChange={(e) => setBonusForm((p) => ({ ...p, title: e.target.value }))} /></FormField><FormField label="Amount"><FormInput type="number" min={0} step="0.01" value={bonusForm.amount} onChange={(e) => setBonusForm((p) => ({ ...p, amount: Number(e.target.value) }))} /></FormField><FormField label="Date"><FormInput type="date" value={bonusForm.effective_date} onChange={(e) => setBonusForm((p) => ({ ...p, effective_date: e.target.value }))} /></FormField><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
      {deductionModal && <Modal title={`${deductionEdit ? "Edit" : "New"} Deduction`} onClose={() => setDeductionModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const payload = { ...deductionForm, payroll_id: deductionForm.payroll_id || null, notes: deductionForm.notes || null }; if (deductionEdit) { void deductionUpdateMut.mutate({ id: deductionEdit.id, payload }); return; } void deductionCreate.mutate(payload); }}><FormField label="Employee"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={deductionForm.employee_id} onChange={(e) => setDeductionForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Title"><FormInput value={deductionForm.title} onChange={(e) => setDeductionForm((p) => ({ ...p, title: e.target.value }))} /></FormField><FormField label="Type"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={deductionForm.type} onChange={(e) => setDeductionForm((p) => ({ ...p, type: e.target.value as Deduction["type"] }))}><option value="tax">Tax</option><option value="loan">Loan</option><option value="penalty">Penalty</option><option value="other">Other</option></select></FormField><FormField label="Amount"><FormInput type="number" min={0} step="0.01" value={deductionForm.amount} onChange={(e) => setDeductionForm((p) => ({ ...p, amount: Number(e.target.value) }))} /></FormField><FormField label="Date"><FormInput type="date" value={deductionForm.effective_date} onChange={(e) => setDeductionForm((p) => ({ ...p, effective_date: e.target.value }))} /></FormField><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>;
}

function SectionTable({ headers, rows, onAdd }: { headers: string[]; rows: React.ReactNode[][]; onAdd: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={onAdd}>New</Button></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">{headers.map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-[var(--border)]/60">{row.map((cell, idx) => <td key={idx} className="p-3">{cell}</td>)}</tr>)}{rows.length === 0 && <tr><td className="p-6 text-center text-sm text-[var(--muted)]" colSpan={headers.length}>No records found.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

