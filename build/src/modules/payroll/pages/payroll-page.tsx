import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { getEmployees } from "@/services/employee-service";
import {
  Bonus,
  Deduction,
  Payslip,
  PayrollRecord,
  PayrollProcessing,
  createPayroll,
  createBonus,
  createDeduction,
  generatePayroll,
  createPayrollProcessing,
  createPayslip,
  createSalarySlipFromPayroll,
  deletePayroll,
  deleteBonus,
  deleteDeduction,
  deletePayrollProcessing,
  deletePayslip,
  listBonuses,
  listDeductions,
  listPayroll,
  listPayrollProcessings,
  listPayslips,
  markPayrollPaid,
  updatePayroll,
  updateBonus,
  updateDeduction,
  updatePayrollProcessing,
  updatePayslip
} from "@/services/payroll-service";

type Tab = "salary-structure" | "salary-slip" | "payroll-processing" | "payslips" | "bonuses" | "deductions";
const TAB_PARAM_MAP: Record<string, Tab> = {
  "salary-structure": "salary-structure",
  "salary-slip": "salary-slip",
  "payroll-processing": "payroll-processing",
  payslips: "payslips",
  bonuses: "bonuses",
  deductions: "deductions",
};

export function PayrollPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = TAB_PARAM_MAP[searchParams.get("tab") ?? ""] ?? "salary-structure";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);

  const [salarySlipIssueDate, setSalarySlipIssueDate] = useState("");
  const [salarySlipPayrollId, setSalarySlipPayrollId] = useState<number>(0);
  const [payrollModal, setPayrollModal] = useState(false);
  const [payrollEdit, setPayrollEdit] = useState<PayrollRecord | null>(null);
  const [payrollForm, setPayrollForm] = useState({ employee_id: 0, month: new Date().getMonth() + 1, year: new Date().getFullYear(), base_salary: 0, bonus: 0, deductions: 0, tax: 0, payment_date: "", status: "pending" as PayrollRecord["status"] });
  const [generateMonth, setGenerateMonth] = useState(new Date().getMonth() + 1);
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());

  const [processingModal, setProcessingModal] = useState(false);
  const [processingEdit, setProcessingEdit] = useState<PayrollProcessing | null>(null);
  const [processingForm, setProcessingForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft" as PayrollProcessing["status"], processed_at: "", notes: "" });
  const [processingMonthFilter, setProcessingMonthFilter] = useState<number | "">("");
  const [processingYearFilter, setProcessingYearFilter] = useState<number | "">(new Date().getFullYear());
  const [processingStatusFilter, setProcessingStatusFilter] = useState<PayrollProcessing["status"] | "">("");

  const [payslipModal, setPayslipModal] = useState(false);
  const [payslipDetailOpen, setPayslipDetailOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [payslipEdit, setPayslipEdit] = useState<Payslip | null>(null);
  const [payslipForm, setPayslipForm] = useState({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft" as Payslip["status"], file_url: "", notes: "" });
  const [payslipStatusFilter, setPayslipStatusFilter] = useState<Payslip["status"] | "">("");

  const [payrollDetailOpen, setPayrollDetailOpen] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);

  const [bonusModal, setBonusModal] = useState(false);
  const [bonusEdit, setBonusEdit] = useState<Bonus | null>(null);
  const [bonusForm, setBonusForm] = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" });

  const [deductionModal, setDeductionModal] = useState(false);
  const [deductionEdit, setDeductionEdit] = useState<Deduction | null>(null);
  const [deductionForm, setDeductionForm] = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other" as Deduction["type"], effective_date: "", notes: "" });

  const employees = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployees()).data ?? [] });
  const payrolls = useQuery({ queryKey: ["payroll", "base"], queryFn: async () => (await listPayroll()).data ?? [] });
  const processings = useQuery({
    queryKey: ["payroll", "processings", processingMonthFilter, processingYearFilter, processingStatusFilter],
    queryFn: async () => (await listPayrollProcessings(processingMonthFilter || undefined, processingYearFilter || undefined, processingStatusFilter || undefined)).data ?? []
  });
  const payslips = useQuery({ queryKey: ["payroll", "payslips"], queryFn: async () => (await listPayslips()).data ?? [] });
  const bonuses = useQuery({ queryKey: ["payroll", "bonuses"], queryFn: async () => (await listBonuses()).data ?? [] });
  const deductions = useQuery({ queryKey: ["payroll", "deductions"], queryFn: async () => (await listDeductions()).data ?? [] });
  const bonusPayrollOptions = (payrolls.data ?? []).filter((payroll) => !bonusForm.employee_id || payroll.employee_id === bonusForm.employee_id);

  const salarySlipMutation = useMutation({
    mutationFn: () => createSalarySlipFromPayroll(salarySlipPayrollId, salarySlipIssueDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payroll", "payslips"] });
      setSalarySlipIssueDate("");
      setSalarySlipPayrollId(0);
    },
    onError: (e: Error) => setError(e.message)
  });
  const payrollCreate = useMutation({ mutationFn: createPayroll, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "base"] }); setPayrollModal(false); }, onError: (e: Error) => setError(e.message) });
  const payrollUpdate = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updatePayroll>[1] }) => updatePayroll(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "base"] }); setPayrollModal(false); }, onError: (e: Error) => setError(e.message) });
  const payrollDelete = useMutation({ mutationFn: deletePayroll, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "base"] }); }, onError: (e: Error) => setError(e.message) });
  const payrollMarkPaid = useMutation({ mutationFn: markPayrollPaid, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll", "base"] }); }, onError: (e: Error) => setError(e.message) });

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
  useEffect(() => {
    const requestedTab = TAB_PARAM_MAP[searchParams.get("tab") ?? ""];
    if (requestedTab && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [searchParams, tab]);

  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  };

  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleGeneratePayroll() {
    setGenerating(true);
    setError(null);
    try {
      await generatePayroll({ month: generateMonth, year: generateYear });
      await queryClient.invalidateQueries({ queryKey: ["payroll", "base"] });
      setGenerateModalOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Payroll" subtitle="Manage salary slip, payroll processing, payslips, bonuses, and deductions." />
        <Button onClick={() => setGenerateModalOpen(true)} className="shrink-0">
          ⚡ Generate Payroll
        </Button>
      </div>

      {generateModalOpen && (
        <Modal title="Generate Monthly Payroll" onClose={() => setGenerateModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              This will auto-calculate payroll for all active employees for the selected month and year based on their salary structure.
            </p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month">
                <FormInput type="number" min={1} max={12} value={generateMonth} onChange={(e) => setGenerateMonth(Number(e.target.value))} />
              </FormField>
              <FormField label="Year">
                <FormInput type="number" min={2020} value={generateYear} onChange={(e) => setGenerateYear(Number(e.target.value))} />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setGenerateModalOpen(false)}>Cancel</Button>
              <Button onClick={handleGeneratePayroll} disabled={generating}>
                {generating ? "Generating…" : "Generate payroll"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["salary-structure", "salary-slip", "payroll-processing", "payslips", "bonuses", "deductions"] as Tab[]).map((t) => (
            <Button key={t} variant={tab === t ? "primary" : "outline"} onClick={() => switchTab(t)}>{t.replace("-", " ").toUpperCase()}</Button>
          ))}
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {tab === "salary-structure" && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="Month"><FormInput type="number" min={1} max={12} value={generateMonth} onChange={(e) => setGenerateMonth(Number(e.target.value))} /></FormField>
              <FormField label="Year"><FormInput type="number" min={2020} value={generateYear} onChange={(e) => setGenerateYear(Number(e.target.value))} /></FormField>
              <div className="flex items-end"><Button className="w-full" onClick={async () => { setError(null); try { await generatePayroll({ month: generateMonth, year: generateYear }); await queryClient.invalidateQueries({ queryKey: ["payroll", "base"] }); } catch (e) { setError((e as Error).message); } }}>Generate Month Payroll</Button></div>
            </div>
            <SectionTable
              onAdd={() => { setPayrollEdit(null); setPayrollForm({ employee_id: 0, month: new Date().getMonth() + 1, year: new Date().getFullYear(), base_salary: 0, bonus: 0, deductions: 0, tax: 0, payment_date: "", status: "pending" }); setPayrollModal(true); }}
              headers={["Employee", "Month/Year", "Base", "Net", "Payment Date", "Status", "Actions"]}
              rows={(payrolls.data ?? []).map((item) => [item.employee?.name ?? `#${item.employee_id}`, `${item.month}/${item.year}`, Number(item.base_salary).toLocaleString(), Number(item.net_salary).toLocaleString(), item.payment_date?.slice(0, 10) ?? "-", <span key={`status-${item.id}`} className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${ item.status === "paid" ? "bg-emerald-50 text-emerald-700" : item.status === "pending" ? "bg-amber-50 text-amber-700" : item.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700" }`}>{item.status}</span>, <div className="flex gap-2" key={item.id}><Button variant="outline" onClick={() => { setSelectedPayroll(item); setPayrollDetailOpen(true); }}>View</Button>{item.status !== "paid" && <Button variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => void payrollMarkPaid.mutateAsync(item.id)}>✓ Mark Paid</Button>}<Button variant="outline" onClick={() => { setPayrollEdit(item); setPayrollForm({ employee_id: item.employee_id, month: item.month, year: item.year, base_salary: Number(item.base_salary), bonus: Number(item.bonus), deductions: Number(item.deductions), tax: Number(item.tax), payment_date: item.payment_date.slice(0, 10), status: item.status }); setPayrollModal(true); }}>Edit</Button><Button variant="outline" onClick={() => void payrollDelete.mutateAsync(item.id)}>Delete</Button></div>])}
            />
          </div>
        )}

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
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)]/80 bg-gradient-to-r from-[var(--card)] to-[var(--card)]/60 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <FormField label="Filter Month">
                  <FormInput type="number" min={1} max={12} value={processingMonthFilter} onChange={(e) => setProcessingMonthFilter(e.target.value ? Number(e.target.value) : "")} />
                </FormField>
                <FormField label="Filter Year">
                  <FormInput type="number" min={2020} value={processingYearFilter} onChange={(e) => setProcessingYearFilter(e.target.value ? Number(e.target.value) : "")} />
                </FormField>
                <FormField label="Filter Status">
                  <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={processingStatusFilter} onChange={(e) => setProcessingStatusFilter((e.target.value as PayrollProcessing["status"]) || "")}>
                    <option value="">All</option>
                    <option value="draft">Draft</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </FormField>
                <div className="flex items-end gap-2">
                  <Button className="w-full" variant="outline" onClick={() => { setProcessingMonthFilter(""); setProcessingYearFilter(new Date().getFullYear()); setProcessingStatusFilter(""); }}>Reset</Button>
                  <Button className="w-full" onClick={() => { setProcessingEdit(null); setProcessingForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft", processed_at: "", notes: "" }); setProcessingModal(true); }}>New Run</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Total Runs" value={String((processings.data ?? []).length)} />
              <SummaryCard label="Draft" value={String((processings.data ?? []).filter((x) => x.status === "draft").length)} />
              <SummaryCard label="Processing" value={String((processings.data ?? []).filter((x) => x.status === "processing").length)} />
              <SummaryCard label="Completed" value={String((processings.data ?? []).filter((x) => x.status === "completed").length)} />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--border)]/30 text-left text-[var(--muted)]">
                    <th className="p-3">Month/Year</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Processed At</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(processings.data ?? []).map((item) => (
                      <tr key={item.id} className="border-t border-[var(--border)]/60">
                        <td className="p-3 font-medium">{item.month}/{item.year}</td>
                        <td className="p-3"><StatusBadge status={item.status} /></td>
                        <td className="p-3">{item.processed_at?.slice(0, 10) ?? "-"}</td>
                        <td className="max-w-[380px] truncate p-3 text-[var(--muted)]">{item.notes ?? "-"}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setProcessingEdit(item);
                                setProcessingForm({ month: item.month, year: item.year, status: item.status, processed_at: item.processed_at?.slice(0, 10) ?? "", notes: item.notes ?? "" });
                                setProcessingModal(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              onClick={async () => {
                                if (!window.confirm("Delete this payroll processing run?")) return;
                                await processingDelete.mutateAsync(item.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {(processings.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-[var(--muted)]">No payroll processing runs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "payslips" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)]/80 bg-gradient-to-r from-[var(--card)] to-[var(--card)]/60 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <FormField label="Filter Status">
                  <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipStatusFilter} onChange={(e) => setPayslipStatusFilter((e.target.value as Payslip["status"]) || "")}>
                    <option value="">All</option>
                    <option value="draft">Draft</option>
                    <option value="issued">Issued</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </FormField>
                <div className="flex items-end"><Button className="w-full" variant="outline" onClick={() => setPayslipStatusFilter("")}>Reset</Button></div>
                <div className="flex items-end"><Button className="w-full" onClick={() => { setPayslipEdit(null); setPayslipForm({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft", file_url: "", notes: "" }); setPayslipModal(true); }}>New Payslip</Button></div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--border)]/30 text-left text-[var(--muted)]">
                    <th className="p-3">Slip #</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Payroll</th>
                    <th className="p-3">Issue Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">File</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(payslips.data ?? [])
                    .filter((item) => !payslipStatusFilter || item.status === payslipStatusFilter)
                    .map((item) => (
                      <tr key={item.id} className="border-t border-[var(--border)]/60">
                        <td className="p-3 font-medium">{item.slip_number}</td>
                        <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                        <td className="p-3">#{item.payroll_id}</td>
                        <td className="p-3">{item.issue_date}</td>
                        <td className="p-3"><PayslipStatusBadge status={item.status} /></td>
                        <td className="p-3">{item.file_url ? <a className="text-[var(--primary)] underline" href={item.file_url} target="_blank" rel="noreferrer">Open</a> : "-"}</td>
                        <td className="max-w-[260px] truncate p-3 text-[var(--muted)]">{item.notes || "-"}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setSelectedPayslip(item); setPayslipDetailOpen(true); }}>View</Button>
                            <Button variant="outline" onClick={() => { setPayslipEdit(item); setPayslipForm({ employee_id: item.employee_id, payroll_id: item.payroll_id, slip_number: item.slip_number, issue_date: item.issue_date.slice(0, 10), status: item.status, file_url: item.file_url ?? "", notes: item.notes ?? "" }); setPayslipModal(true); }}>Edit</Button>
                            <Button variant="outline" onClick={async () => { if (!window.confirm("Delete this payslip?")) return; await payslipDeleteMut.mutateAsync(item.id); }}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {(payslips.data ?? []).filter((item) => !payslipStatusFilter || item.status === payslipStatusFilter).length === 0 && (
                    <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={8}>No payslips found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "bonuses" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)]/80 bg-gradient-to-r from-[var(--card)] to-[var(--card)]/60 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Bonus entries</p>
                  <p className="text-sm text-[var(--muted)]">Track incentives, taxable allowances, and linked payroll records in one place.</p>
                </div>
                <Button onClick={() => { setError(null); setBonusEdit(null); setBonusForm({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" }); setBonusModal(true); }}>New Bonus</Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard label="Total Bonus Records" value={String((bonuses.data ?? []).length)} />
              <SummaryCard label="Taxable Entries" value={String((bonuses.data ?? []).filter((item) => item.taxable).length)} />
              <SummaryCard label="Total Value" value={formatCurrency((bonuses.data ?? []).reduce((sum, item) => sum + Number(item.amount || 0), 0))} />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--border)]/30 text-left text-[var(--muted)]">
                    <th className="p-3">Employee</th>
                    <th className="p-3">Payroll</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Taxable</th>
                    <th className="p-3">Effective Date</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(bonuses.data ?? []).map((item) => (
                    <tr key={item.id} className="border-t border-[var(--border)]/60">
                      <td className="p-3 font-medium">{item.employee?.name ?? `#${item.employee_id}`}</td>
                      <td className="p-3">{item.payroll_id ? `#${item.payroll_id}` : "-"}</td>
                      <td className="p-3">{item.title}</td>
                      <td className="p-3">{formatCurrency(Number(item.amount || 0))}</td>
                      <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${item.taxable ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-700"}`}>{item.taxable ? "Yes" : "No"}</span></td>
                      <td className="p-3">{item.effective_date}</td>
                      <td className="max-w-[260px] truncate p-3 text-[var(--muted)]">{item.notes || "-"}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => { setError(null); setBonusEdit(item); setBonusForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), taxable: Boolean(item.taxable), effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setBonusModal(true); }}>Edit</Button>
                          <Button variant="outline" onClick={async () => { if (!window.confirm("Delete this bonus record?")) return; await bonusDeleteMut.mutateAsync(item.id); }}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(bonuses.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[var(--muted)]">No bonus records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "deductions" && (
          <SectionTable
            onAdd={() => { setDeductionEdit(null); setDeductionForm({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other", effective_date: "", notes: "" }); setDeductionModal(true); }}
            headers={["Employee", "Payroll", "Title", "Type", "Amount", "Actions"]}
            rows={(deductions.data ?? []).map((item) => [item.employee?.name ?? `#${item.employee_id}`, item.payroll_id ? `#${item.payroll_id}` : "-", item.title, item.type, Number(item.amount).toLocaleString(), <div className="flex gap-2" key={item.id}><Button variant="outline" onClick={() => { setDeductionEdit(item); setDeductionForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), type: item.type, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setDeductionModal(true); }}>Edit</Button><Button variant="outline" onClick={async () => { if (!window.confirm("Delete this deduction record?")) return; await deductionDeleteMut.mutateAsync(item.id); }}>Delete</Button></div>])}
          />
        )}
      </section>

      {payrollDetailOpen && selectedPayroll && <PayrollDetailModal payroll={selectedPayroll} onClose={() => { setPayrollDetailOpen(false); setSelectedPayroll(null); }} />}
      {payslipDetailOpen && selectedPayslip && <PayslipDetailModal payslip={selectedPayslip} onClose={() => { setPayslipDetailOpen(false); setSelectedPayslip(null); }} />}
      {processingModal && <Modal title={`${processingEdit ? "Edit" : "New"} Payroll Processing`} onClose={() => setProcessingModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setError(null); if (processingForm.month < 1 || processingForm.month > 12) { setError("Payroll Processing month must be between 1 and 12."); return; } if (processingForm.year < 2020) { setError("Payroll Processing year must be 2020 or later."); return; } const payload = { ...processingForm, processed_at: processingForm.processed_at || null, notes: processingForm.notes?.trim() ? processingForm.notes.trim() : null }; if (processingEdit) { void processingUpdate.mutate({ id: processingEdit.id, payload }); return; } void processingCreate.mutate(payload); }}><div className="grid gap-3 md:grid-cols-2"><FormField label="Month"><FormInput type="number" min={1} max={12} value={processingForm.month} onChange={(e) => setProcessingForm((p) => ({ ...p, month: Number(e.target.value) }))} /></FormField><FormField label="Year"><FormInput type="number" min={2020} value={processingForm.year} onChange={(e) => setProcessingForm((p) => ({ ...p, year: Number(e.target.value) }))} /></FormField><FormField label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={processingForm.status} onChange={(e) => setProcessingForm((p) => ({ ...p, status: e.target.value as PayrollProcessing["status"] }))}><option value="draft">Draft</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></FormField><FormField label="Processed At"><FormInput type="date" value={processingForm.processed_at} onChange={(e) => setProcessingForm((p) => ({ ...p, processed_at: e.target.value }))} /></FormField></div><FormField label="Notes"><textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={processingForm.notes} onChange={(e) => setProcessingForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Add processing notes, exceptions, and approvals..." maxLength={1000} /></FormField><div className="flex justify-end"><Button type="submit">{processingEdit ? "Update" : "Create"}</Button></div></form></Modal>}
      {payslipModal && <Modal title={`${payslipEdit ? "Edit" : "New"} Payslip`} onClose={() => setPayslipModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setError(null); if (!payslipForm.issue_date) { setError("Payslip issue date is required."); return; } if (!payslipEdit && (!payslipForm.employee_id || !payslipForm.payroll_id || !payslipForm.slip_number.trim())) { setError("Employee, payroll, and slip number are required."); return; } if (payslipEdit) { void payslipUpdateMut.mutate({ id: payslipEdit.id, payload: { status: payslipForm.status, issue_date: payslipForm.issue_date, file_url: payslipForm.file_url || undefined, notes: payslipForm.notes || undefined } }); return; } void payslipCreate.mutate({ ...payslipForm, slip_number: payslipForm.slip_number.trim(), file_url: payslipForm.file_url || null, notes: payslipForm.notes || null }); }}><div className="grid gap-3 md:grid-cols-2"><FormField label="Employee"><select disabled={Boolean(payslipEdit)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipForm.employee_id} onChange={(e) => setPayslipForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Payroll"><select disabled={Boolean(payslipEdit)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipForm.payroll_id} onChange={(e) => setPayslipForm((p) => ({ ...p, payroll_id: Number(e.target.value) }))}><option value={0}>Select payroll</option>{(payrolls.data ?? []).map((x) => <option key={x.id} value={x.id}>#{x.id} - {x.month}/{x.year}</option>)}</select></FormField>{!payslipEdit && <FormField label="Slip Number"><FormInput value={payslipForm.slip_number} onChange={(e) => setPayslipForm((p) => ({ ...p, slip_number: e.target.value }))} /></FormField>}<FormField label="Issue Date"><FormInput type="date" value={payslipForm.issue_date} onChange={(e) => setPayslipForm((p) => ({ ...p, issue_date: e.target.value }))} /></FormField><FormField label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payslipForm.status} onChange={(e) => setPayslipForm((p) => ({ ...p, status: e.target.value as Payslip["status"] }))}><option value="draft">Draft</option><option value="issued">Issued</option><option value="cancelled">Cancelled</option></select></FormField><FormField label="File URL"><FormInput value={payslipForm.file_url} onChange={(e) => setPayslipForm((p) => ({ ...p, file_url: e.target.value }))} placeholder="https://..." /></FormField></div><FormField label="Notes"><textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={payslipForm.notes} onChange={(e) => setPayslipForm((p) => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField><div className="flex justify-end"><Button type="submit">{payslipEdit ? "Update" : "Create"}</Button></div></form></Modal>}
      {bonusModal && <Modal title={`${bonusEdit ? "Edit" : "New"} Bonus`} onClose={() => setBonusModal(false)}><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (!bonusForm.employee_id) { setError("Please select an employee for the bonus record."); return; } if (!bonusForm.title.trim()) { setError("Bonus title is required."); return; } if (bonusForm.amount < 0) { setError("Bonus amount cannot be negative."); return; } if (!bonusForm.effective_date) { setError("Effective date is required."); return; } const linkedPayroll = bonusForm.payroll_id ? (payrolls.data ?? []).find((payroll) => payroll.id === bonusForm.payroll_id) : null; if (linkedPayroll && linkedPayroll.employee_id !== bonusForm.employee_id) { setError("Selected payroll must belong to the selected employee."); return; } const payload = { ...bonusForm, title: bonusForm.title.trim(), payroll_id: bonusForm.payroll_id || null, notes: bonusForm.notes.trim() || null, taxable: Boolean(bonusForm.taxable) }; if (bonusEdit) { void bonusUpdateMut.mutate({ id: bonusEdit.id, payload }); return; } void bonusCreate.mutate(payload); }}><div className="grid gap-3 md:grid-cols-2"><FormField label="Employee"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={bonusForm.employee_id} onChange={(e) => { const employeeId = Number(e.target.value); setBonusForm((p) => ({ ...p, employee_id: employeeId, payroll_id: (payrolls.data ?? []).some((payroll) => payroll.id === p.payroll_id && payroll.employee_id === employeeId) ? p.payroll_id : 0 })); }}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Payroll (optional)"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={bonusForm.payroll_id} onChange={(e) => setBonusForm((p) => ({ ...p, payroll_id: Number(e.target.value) }))}><option value={0}>No linked payroll</option>{bonusPayrollOptions.map((x) => <option key={x.id} value={x.id}>#{x.id} - {x.month}/{x.year}</option>)}</select></FormField><FormField label="Title"><FormInput value={bonusForm.title} onChange={(e) => setBonusForm((p) => ({ ...p, title: e.target.value }))} placeholder="Quarterly Incentive" /></FormField><FormField label="Amount"><FormInput type="number" min={0} step="0.01" value={bonusForm.amount} onChange={(e) => setBonusForm((p) => ({ ...p, amount: Number(e.target.value) }))} /></FormField><FormField label="Effective Date"><FormInput type="date" value={bonusForm.effective_date} onChange={(e) => setBonusForm((p) => ({ ...p, effective_date: e.target.value }))} /></FormField><FormField label="Taxable"><label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><input type="checkbox" checked={bonusForm.taxable} onChange={(e) => setBonusForm((p) => ({ ...p, taxable: e.target.checked }))} /> Mark as taxable</label></FormField></div><FormField label="Notes"><textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={bonusForm.notes} onChange={(e) => setBonusForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Add context for finance or payroll review." maxLength={1000} /></FormField><div className="flex justify-end"><Button type="submit" disabled={bonusCreate.isPending || bonusUpdateMut.isPending}>{bonusEdit ? "Update" : "Create"}</Button></div></form></Modal>}
      {deductionModal && <Modal title={`${deductionEdit ? "Edit" : "New"} Deduction`} onClose={() => setDeductionModal(false)}><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (!deductionForm.employee_id) { setError("Please select an employee for the deduction record."); return; } if (!deductionForm.title.trim()) { setError("Deduction title is required."); return; } if (!deductionForm.effective_date) { setError("Effective date is required."); return; } const payload = { ...deductionForm, title: deductionForm.title.trim(), payroll_id: deductionForm.payroll_id || null, notes: deductionForm.notes.trim() || null }; if (deductionEdit) { void deductionUpdateMut.mutate({ id: deductionEdit.id, payload }); return; } void deductionCreate.mutate(payload); }}><div className="grid gap-3 md:grid-cols-2"><FormField label="Employee"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={deductionForm.employee_id} onChange={(e) => setDeductionForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><FormField label="Payroll (optional)"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={deductionForm.payroll_id} onChange={(e) => setDeductionForm((p) => ({ ...p, payroll_id: Number(e.target.value) }))}><option value={0}>No linked payroll</option>{(payrolls.data ?? []).map((x) => <option key={x.id} value={x.id}>#{x.id} - {x.month}/{x.year}</option>)}</select></FormField><FormField label="Title"><FormInput value={deductionForm.title} onChange={(e) => setDeductionForm((p) => ({ ...p, title: e.target.value }))} placeholder="Late Arrival Penalty" /></FormField><FormField label="Type"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={deductionForm.type} onChange={(e) => setDeductionForm((p) => ({ ...p, type: e.target.value as Deduction["type"] }))}><option value="tax">Tax</option><option value="loan">Loan</option><option value="penalty">Penalty</option><option value="other">Other</option></select></FormField><FormField label="Amount"><FormInput type="number" min={0} step="0.01" value={deductionForm.amount} onChange={(e) => setDeductionForm((p) => ({ ...p, amount: Number(e.target.value) }))} /></FormField><FormField label="Effective Date"><FormInput type="date" value={deductionForm.effective_date} onChange={(e) => setDeductionForm((p) => ({ ...p, effective_date: e.target.value }))} /></FormField></div><FormField label="Notes"><textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={deductionForm.notes} onChange={(e) => setDeductionForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Add context for payroll review." maxLength={1000} /></FormField><div className="flex justify-end"><Button type="submit">{deductionEdit ? "Update" : "Create"}</Button></div></form></Modal>}
      {payrollModal && <Modal title={`${payrollEdit ? "Edit" : "New"} Payroll Record`} onClose={() => setPayrollModal(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const net_salary = Math.max(0, payrollForm.base_salary + payrollForm.bonus - payrollForm.deductions - payrollForm.tax); if (payrollEdit) { void payrollUpdate.mutate({ id: payrollEdit.id, payload: { bonus: payrollForm.bonus, deductions: payrollForm.deductions, tax: payrollForm.tax, net_salary, payment_date: payrollForm.payment_date, status: payrollForm.status } }); return; } void payrollCreate.mutate({ ...payrollForm, net_salary }); }}><FormField label="Employee"><select disabled={Boolean(payrollEdit)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payrollForm.employee_id} onChange={(e) => setPayrollForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}><option value={0}>Select employee</option>{(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><div className="grid gap-3 md:grid-cols-2"><FormField label="Month"><FormInput disabled={Boolean(payrollEdit)} type="number" min={1} max={12} value={payrollForm.month} onChange={(e) => setPayrollForm((p) => ({ ...p, month: Number(e.target.value) }))} /></FormField><FormField label="Year"><FormInput disabled={Boolean(payrollEdit)} type="number" min={2020} value={payrollForm.year} onChange={(e) => setPayrollForm((p) => ({ ...p, year: Number(e.target.value) }))} /></FormField><FormField label="Base Salary"><FormInput disabled={Boolean(payrollEdit)} type="number" min={0} step="0.01" value={payrollForm.base_salary} onChange={(e) => setPayrollForm((p) => ({ ...p, base_salary: Number(e.target.value) }))} /></FormField><FormField label="Bonus"><FormInput type="number" min={0} step="0.01" value={payrollForm.bonus} onChange={(e) => setPayrollForm((p) => ({ ...p, bonus: Number(e.target.value) }))} /></FormField><FormField label="Deductions"><FormInput type="number" min={0} step="0.01" value={payrollForm.deductions} onChange={(e) => setPayrollForm((p) => ({ ...p, deductions: Number(e.target.value) }))} /></FormField><FormField label="Tax"><FormInput type="number" min={0} step="0.01" value={payrollForm.tax} onChange={(e) => setPayrollForm((p) => ({ ...p, tax: Number(e.target.value) }))} /></FormField><FormField label="Payment Date"><FormInput type="date" value={payrollForm.payment_date} onChange={(e) => setPayrollForm((p) => ({ ...p, payment_date: e.target.value }))} /></FormField><FormField label="Status"><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={payrollForm.status} onChange={(e) => setPayrollForm((p) => ({ ...p, status: e.target.value as PayrollRecord["status"] }))}><option value="pending">Pending</option><option value="processed">Processed</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></FormField></div><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
    </div>
  );
}


function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function StatusBadge({ status }: { status: PayrollProcessing["status"] }) {
  const tone = status === "completed"
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : status === "processing"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : status === "cancelled"
        ? "bg-rose-100 text-rose-700 border-rose-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}

function PayslipStatusBadge({ status }: { status: Payslip["status"] }) {
  const tone = status === "issued"
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : status === "cancelled"
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}

function SalaryBreakdown({ payroll }: { payroll: PayrollRecord }) {
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Base Salary" value={formatCurrency(Number(payroll.base_salary ?? 0))} />
        <SummaryCard label="Bonus" value={formatCurrency(Number(payroll.bonus ?? 0))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Deductions" value={formatCurrency(Number(payroll.deductions ?? 0))} />
        <SummaryCard label="Tax" value={formatCurrency(Number(payroll.tax ?? 0))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Net Salary" value={formatCurrency(Number(payroll.net_salary ?? 0))} />
        <SummaryCard label="Payment Date" value={payroll.payment_date ? payroll.payment_date.slice(0, 10) : "Pending"} />
      </div>
    </div>
  );
}

function PayrollDetailModal({ payroll, onClose }: { payroll: PayrollRecord; onClose: () => void }) {
  return (
    <Modal title={`Payroll Detail — ${payroll.employee?.name ?? `#${payroll.employee_id}`}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryCard label="Month/Year" value={`${payroll.month}/${payroll.year}`} />
          <SummaryCard label="Status" value={payroll.status} />
        </div>
        <SalaryBreakdown payroll={payroll} />
      </div>
    </Modal>
  );
}

function PayslipDetailModal({ payslip, onClose }: { payslip: Payslip; onClose: () => void }) {
  return (
    <Modal title={`Payslip — ${payslip.slip_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryCard label="Employee" value={payslip.employee?.name ?? `#${payslip.employee_id}`} />
          <SummaryCard label="Issue Date" value={payslip.issue_date.slice(0, 10)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryCard label="Status" value={payslip.status} />
          <SummaryCard label="Payroll" value={payslip.payroll ? `#${payslip.payroll.id}` : String(payslip.payroll_id)} />
        </div>
        {payslip.file_url ? (
          <a href={payslip.file_url} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Download Payslip
          </a>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--muted)]">No file attached for this payslip.</div>
        )}
        {payslip.payroll ? <SalaryBreakdown payroll={payslip.payroll} /> : null}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-sm font-semibold text-[var(--text)]">Notes</p>
          <p className="text-sm text-[var(--muted)]">{payslip.notes ?? "No notes available."}</p>
        </div>
      </div>
    </Modal>
  );
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