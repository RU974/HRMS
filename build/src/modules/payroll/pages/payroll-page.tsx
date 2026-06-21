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
  type Bonus,
  type Deduction,
  type DeductionType,
  type LoanAdvance,
  type Payslip,
  type PayrollRecord,
  type PayrollProcessing,
  type SalaryGrade,
  type SalaryIncrement,
  type TaxBracket,
  approvePayroll,
  createBonus,
  createDeduction,
  createLoanAdvance,
  createPayroll,
  createPayrollProcessing,
  createPayslip,
  createSalaryGrade,
  createSalaryIncrement,
  createSalarySlipFromPayroll,
  createTaxBracket,
  deleteBonus,
  deleteDeduction,
  deleteLoanAdvance,
  deletePayroll,
  deletePayrollProcessing,
  deletePayslip,
  deleteSalaryGrade,
  deleteSalaryIncrement,
  deleteTaxBracket,
  downloadBankExport,
  generatePayroll,
  listBonuses,
  listDeductions,
  listLoanAdvances,
  listPayroll,
  listPayrollProcessings,
  listPayslips,
  listSalaryGrades,
  listSalaryIncrements,
  listTaxBrackets,
  markPayrollPaid,
  updateBonus,
  updateDeduction,
  updateLoanAdvance,
  updatePayroll,
  updatePayrollProcessing,
  updatePayslip,
  updateSalaryGrade,
  updateSalaryIncrement,
  updateTaxBracket,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { useCurrencyStore } from "@/store/currency-store";
import { toast } from "@/components/notifications/toast";

// ── Helpers ────────────────────────────────────────────────────────────────────
const sel = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

function fmt(v: number) {
  return useCurrencyStore.getState().formatAmount(v);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${tone}`}>{label}</span>;
}

function payrollBadge(status: string) {
  const map: Record<string, string> = {
    paid:      "border-emerald-200 bg-emerald-50 text-emerald-700",
    approved:  "border-blue-200 bg-blue-50 text-blue-700",
    reviewed:  "border-indigo-200 bg-indigo-50 text-indigo-700",
    pending:   "border-amber-200 bg-amber-50 text-amber-700",
    draft:     "border-slate-200 bg-slate-100 text-slate-700",
    processed: "border-cyan-200 bg-cyan-50 text-cyan-700",
    cancelled: "border-red-200 bg-red-50 text-red-700",
  };
  return map[status] ?? "border-slate-200 bg-slate-100 text-slate-700";
}

function loanBadge(status: string) {
  const map: Record<string, string> = {
    active:    "border-amber-200 bg-amber-50 text-amber-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-red-200 bg-red-50 text-red-700",
  };
  return map[status] ?? "border-slate-200 bg-slate-100 text-slate-700";
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = "payroll-records" | "salary-slip" | "payroll-processing" | "payslips" | "bonuses" | "deductions" | "tax-brackets" | "salary-grades" | "salary-increments" | "loans";
const TAB_PARAM_MAP: Record<string, Tab> = {
  "payroll-records":    "payroll-records",
  "salary-structure":   "payroll-records",
  "salary-slip":        "salary-slip",
  "payroll-processing": "payroll-processing",
  payslips:             "payslips",
  bonuses:              "bonuses",
  deductions:           "deductions",
  "tax-brackets":       "tax-brackets",
  "salary-grades":      "salary-grades",
  "salary-increments":  "salary-increments",
  loans:                "loans",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "payroll-records",    label: "Payroll Records" },
  { key: "salary-slip",        label: "Salary Slip" },
  { key: "payroll-processing", label: "Processing" },
  { key: "payslips",           label: "Payslips" },
  { key: "bonuses",            label: "Bonuses" },
  { key: "deductions",         label: "Deductions" },
  { key: "salary-increments",  label: "Increment History" },
  { key: "loans",              label: "Loans / Advances" },
  { key: "tax-brackets",       label: "Tax Brackets" },
  { key: "salary-grades",      label: "Salary Grades" },
];

const DEDUCTION_TYPES: { value: DeductionType; label: string }[] = [
  { value: "tax",               label: "Tax" },
  { value: "provident_fund",    label: "Provident Fund (PF)" },
  { value: "pension",           label: "Pension" },
  { value: "esi",               label: "ESI" },
  { value: "professional_tax",  label: "Professional Tax" },
  { value: "loan",              label: "Loan" },
  { value: "penalty",           label: "Penalty" },
  { value: "other",             label: "Other" },
];

// ── Main component ─────────────────────────────────────────────────────────────
export function PayrollPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const canManage   = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const canView     = useAuthStore(s => s.hasPermission("payroll:view"));
  // Subscribe to currency so the component re-renders on currency change
  useCurrencyStore(s => s.currency);

  const initialTab = TAB_PARAM_MAP[searchParams.get("tab") ?? ""] ?? "payroll-records";
  const [tab, setTab]     = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);

  const switchTab = (t: Tab) => { setTab(t); setSearchParams({ tab: t }); };

  useEffect(() => {
    const requested = TAB_PARAM_MAP[searchParams.get("tab") ?? ""];
    if (requested && requested !== tab) setTab(requested);
  }, [searchParams, tab]);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const employeesQ    = useQuery({ queryKey: ["payroll","employees"],  queryFn: async () => (await getEmployees()).data ?? [] });
  const payrollsQ     = useQuery({ queryKey: ["payroll","base"],       queryFn: async () => (await listPayroll()).data ?? [] });
  const payslipsQ     = useQuery({ queryKey: ["payroll","payslips"],   queryFn: async () => (await listPayslips()).data ?? [] });
  const bonusesQ      = useQuery({ queryKey: ["payroll","bonuses"],    queryFn: async () => (await listBonuses()).data ?? [] });
  const deductionsQ   = useQuery({ queryKey: ["payroll","deductions"], queryFn: async () => (await listDeductions()).data ?? [] });
  const taxBracketsQ  = useQuery({ queryKey: ["payroll","tax-brackets"],   queryFn: listTaxBrackets,       enabled: canView || canManage });
  const salaryGradesQ = useQuery({ queryKey: ["payroll","salary-grades"],  queryFn: listSalaryGrades,      enabled: canView || canManage });
  const incrementsQ   = useQuery({ queryKey: ["payroll","increments"],     queryFn: () => listSalaryIncrements(), enabled: canView || canManage });
  const loansQ        = useQuery({ queryKey: ["payroll","loans"],          queryFn: () => listLoanAdvances(),     enabled: canView || canManage });

  const [procMonthF, setProcMonthF]   = useState<number | "">("");
  const [procYearF,  setProcYearF]    = useState<number | "">(new Date().getFullYear());
  const [procStatF,  setProcStatF]    = useState<PayrollProcessing["status"] | "">("");
  const processingsQ = useQuery({
    queryKey: ["payroll","processings", procMonthF, procYearF, procStatF],
    queryFn:  async () => (await listPayrollProcessings(procMonthF || undefined, procYearF || undefined, procStatF || undefined)).data ?? [],
  });

  // ── Generate modal ───────────────────────────────────────────────────────────
  const [genModal, setGenModal] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear,  setGenYear]  = useState(new Date().getFullYear());
  const genMut = useMutation({
    mutationFn: () => generatePayroll({ month: genMonth, year: genYear }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","base"] }); toast.success("Payroll generated", "Payroll records have been generated successfully."); setGenModal(false); },
    onError: (e: Error) => { toast.error("Generation failed", e.message); setError(e.message); },
  });

  // ── Bank export ──────────────────────────────────────────────────────────────
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear,  setExportYear]  = useState(new Date().getFullYear());
  const [exporting, setExporting]     = useState(false);
  async function handleExport() {
    setExporting(true); setError(null);
    try { await downloadBankExport(exportMonth, exportYear); }
    catch (e) { setError((e as Error).message); }
    finally { setExporting(false); }
  }

  // ── Payroll record form ──────────────────────────────────────────────────────
  const [payrollModal, setPayrollModal] = useState(false);
  const [payrollEdit,  setPayrollEdit]  = useState<PayrollRecord | null>(null);
  const [payrollForm,  setPayrollForm]  = useState({ employee_id: 0, month: new Date().getMonth() + 1, year: new Date().getFullYear(), base_salary: 0, bonus: 0, deductions: 0, tax: 0, payment_date: "", status: "draft" as PayrollRecord["status"] });
  const [payrollDetail, setPayrollDetail] = useState<PayrollRecord | null>(null);

  const payrollCreate = useMutation({ mutationFn: () => createPayroll({ ...payrollForm, net_salary: Math.max(0, payrollForm.base_salary + payrollForm.bonus - payrollForm.deductions - payrollForm.tax) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","base"] }); toast.success("Payroll created", "Payroll record created successfully."); setPayrollModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const payrollUpdate = useMutation({ mutationFn: () => updatePayroll(payrollEdit!.id, { bonus: payrollForm.bonus, deductions: payrollForm.deductions, tax: payrollForm.tax, net_salary: Math.max(0, payrollForm.base_salary + payrollForm.bonus - payrollForm.deductions - payrollForm.tax), payment_date: payrollForm.payment_date, status: payrollForm.status }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","base"] }); toast.success("Payroll updated", "Payroll record updated successfully."); setPayrollModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const payrollDelete = useMutation({ mutationFn: deletePayroll, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","base"] }); toast.success("Deleted", "Payroll record removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });
  const payrollPaid   = useMutation({ mutationFn: markPayrollPaid, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","base"] }); toast.success("Marked as paid", "Payroll has been marked as paid."); }, onError: (e: Error) => { toast.error("Action failed", e.message); setError(e.message); } });
  const payrollApprov = useMutation({ mutationFn: approvePayroll,  onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","base"] }); toast.success("Approved", "Payroll has been approved."); }, onError: (e: Error) => { toast.error("Approval failed", e.message); setError(e.message); } });

  // ── Salary slip ──────────────────────────────────────────────────────────────
  const [slipPayrollId, setSlipPayrollId] = useState(0);
  const [slipDate,      setSlipDate]      = useState("");
  const slipMut = useMutation({ mutationFn: () => createSalarySlipFromPayroll(slipPayrollId, slipDate), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","payslips"] }); toast.success("Salary slip created", "Salary slip generated successfully."); setSlipPayrollId(0); setSlipDate(""); }, onError: (e: Error) => { toast.error("Failed to create slip", e.message); setError(e.message); } });

  // ── Processing form ──────────────────────────────────────────────────────────
  const [procModal, setProcModal] = useState(false);
  const [procEdit,  setProcEdit]  = useState<PayrollProcessing | null>(null);
  const [procForm,  setProcForm]  = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft" as PayrollProcessing["status"], processed_at: "", notes: "" });

  const procCreate = useMutation({ mutationFn: () => createPayrollProcessing({ ...procForm, processed_at: procForm.processed_at || null, notes: procForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","processings"] }); toast.success("Processing created", "Payroll processing record saved."); setProcModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const procUpdate = useMutation({ mutationFn: () => updatePayrollProcessing(procEdit!.id, { status: procForm.status, processed_at: procForm.processed_at || null, notes: procForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","processings"] }); toast.success("Processing updated", "Payroll processing record updated."); setProcModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const procDelete = useMutation({ mutationFn: deletePayrollProcessing, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","processings"] }); toast.success("Deleted", "Processing record removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Payslip form ─────────────────────────────────────────────────────────────
  const [payslipModal,  setPayslipModal]  = useState(false);
  const [payslipEdit,   setPayslipEdit]   = useState<Payslip | null>(null);
  const [payslipDetail, setPayslipDetail] = useState<Payslip | null>(null);
  const [payslipStatF,  setPayslipStatF]  = useState<Payslip["status"] | "">("");
  const [payslipForm,   setPayslipForm]   = useState({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft" as Payslip["status"], file_url: "", notes: "" });

  const payslipCreate = useMutation({ mutationFn: () => createPayslip({ ...payslipForm, file_url: payslipForm.file_url || null, notes: payslipForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","payslips"] }); toast.success("Payslip created", "Payslip saved successfully."); setPayslipModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const payslipUpdate = useMutation({ mutationFn: () => updatePayslip(payslipEdit!.id, { status: payslipForm.status, issue_date: payslipForm.issue_date, file_url: payslipForm.file_url || undefined, notes: payslipForm.notes || undefined }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","payslips"] }); toast.success("Payslip updated", "Payslip updated successfully."); setPayslipModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const payslipDelete = useMutation({ mutationFn: deletePayslip, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","payslips"] }); toast.success("Deleted", "Payslip removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Bonus form ───────────────────────────────────────────────────────────────
  const [bonusModal, setBonusModal] = useState(false);
  const [bonusEdit,  setBonusEdit]  = useState<Bonus | null>(null);
  const [bonusForm,  setBonusForm]  = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" });

  const bonusCreate = useMutation({ mutationFn: () => createBonus({ ...bonusForm, payroll_id: bonusForm.payroll_id || null, notes: bonusForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","bonuses"] }); toast.success("Bonus added", "Bonus record saved successfully."); setBonusModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const bonusUpdate = useMutation({ mutationFn: () => updateBonus(bonusEdit!.id, { title: bonusForm.title, amount: bonusForm.amount, taxable: bonusForm.taxable, effective_date: bonusForm.effective_date, notes: bonusForm.notes || null, payroll_id: bonusForm.payroll_id || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","bonuses"] }); toast.success("Bonus updated", "Bonus record updated successfully."); setBonusModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const bonusDelete = useMutation({ mutationFn: deleteBonus, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","bonuses"] }); toast.success("Deleted", "Bonus removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Deduction form ───────────────────────────────────────────────────────────
  const [dedModal, setDedModal] = useState(false);
  const [dedEdit,  setDedEdit]  = useState<Deduction | null>(null);
  const [dedForm,  setDedForm]  = useState({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other" as DeductionType, effective_date: "", notes: "" });

  const dedCreate = useMutation({ mutationFn: () => createDeduction({ ...dedForm, payroll_id: dedForm.payroll_id || null, notes: dedForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","deductions"] }); toast.success("Deduction added", "Deduction record saved."); setDedModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const dedUpdate = useMutation({ mutationFn: () => updateDeduction(dedEdit!.id, { title: dedForm.title, amount: dedForm.amount, type: dedForm.type, effective_date: dedForm.effective_date, notes: dedForm.notes || null, payroll_id: dedForm.payroll_id || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","deductions"] }); toast.success("Deduction updated", "Deduction record updated."); setDedModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const dedDelete = useMutation({ mutationFn: deleteDeduction, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","deductions"] }); toast.success("Deleted", "Deduction removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Tax bracket form ─────────────────────────────────────────────────────────
  const [taxModal, setTaxModal] = useState(false);
  const [taxEdit,  setTaxEdit]  = useState<TaxBracket | null>(null);
  const [taxForm,  setTaxForm]  = useState({ name: "", min_income: 0, max_income: "" as number | "", rate: 0, sort_order: 0 });

  const taxCreate = useMutation({ mutationFn: () => createTaxBracket({ ...taxForm, max_income: taxForm.max_income === "" ? null : Number(taxForm.max_income) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","tax-brackets"] }); toast.success("Tax bracket saved", "Tax bracket created successfully."); setTaxModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const taxUpdate = useMutation({ mutationFn: () => updateTaxBracket(taxEdit!.id, { ...taxForm, max_income: taxForm.max_income === "" ? null : Number(taxForm.max_income) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","tax-brackets"] }); toast.success("Tax bracket updated", "Tax bracket updated successfully."); setTaxModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const taxDelete = useMutation({ mutationFn: deleteTaxBracket, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","tax-brackets"] }); toast.success("Deleted", "Tax bracket removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Salary grade form ────────────────────────────────────────────────────────
  const [gradeModal, setGradeModal] = useState(false);
  const [gradeEdit,  setGradeEdit]  = useState<SalaryGrade | null>(null);
  const [gradeForm,  setGradeForm]  = useState({ name: "", min_salary: 0, max_salary: 0, basic_percent: 50, hra_percent: 20, transport_allowance: 0, other_allowance: 0, notes: "" });

  const gradeCreate = useMutation({ mutationFn: () => createSalaryGrade({ ...gradeForm, notes: gradeForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","salary-grades"] }); toast.success("Salary grade saved", "Salary grade created successfully."); setGradeModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const gradeUpdate = useMutation({ mutationFn: () => updateSalaryGrade(gradeEdit!.id, { ...gradeForm, notes: gradeForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","salary-grades"] }); toast.success("Salary grade updated", "Salary grade updated successfully."); setGradeModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const gradeDelete = useMutation({ mutationFn: deleteSalaryGrade, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","salary-grades"] }); toast.success("Deleted", "Salary grade removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Salary increment form ────────────────────────────────────────────────────
  const [incModal, setIncModal] = useState(false);
  const [incEdit,  setIncEdit]  = useState<SalaryIncrement | null>(null);
  const [incForm,  setIncForm]  = useState({ employee_id: 0, effective_date: "", old_salary: 0, new_salary: 0, reason: "", notes: "" });

  const incCreate = useMutation({ mutationFn: () => createSalaryIncrement({ ...incForm, reason: incForm.reason || null, notes: incForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","increments"] }); toast.success("Increment saved", "Salary increment recorded successfully."); setIncModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const incUpdate = useMutation({ mutationFn: () => updateSalaryIncrement(incEdit!.id, { effective_date: incForm.effective_date, old_salary: incForm.old_salary, new_salary: incForm.new_salary, reason: incForm.reason || null, notes: incForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","increments"] }); toast.success("Increment updated", "Salary increment updated."); setIncModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const incDelete = useMutation({ mutationFn: deleteSalaryIncrement, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","increments"] }); toast.success("Deleted", "Salary increment removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Loan form ────────────────────────────────────────────────────────────────
  const [loanModal, setLoanModal] = useState(false);
  const [loanEdit,  setLoanEdit]  = useState<LoanAdvance | null>(null);
  const [loanForm,  setLoanForm]  = useState({ employee_id: 0, title: "", amount: 0, outstanding_balance: 0, emi_amount: "" as number | "", start_date: "", end_date: "", notes: "" });

  const loanCreate = useMutation({ mutationFn: () => createLoanAdvance({ ...loanForm, emi_amount: loanForm.emi_amount === "" ? null : Number(loanForm.emi_amount), end_date: loanForm.end_date || null, notes: loanForm.notes || null, status: "active" }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","loans"] }); toast.success("Loan added", "Loan / advance record saved."); setLoanModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const loanUpdate = useMutation({ mutationFn: () => updateLoanAdvance(loanEdit!.id, { title: loanForm.title, outstanding_balance: loanForm.outstanding_balance, emi_amount: loanForm.emi_amount === "" ? null : Number(loanForm.emi_amount), end_date: loanForm.end_date || null, notes: loanForm.notes || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll","loans"] }); toast.success("Loan updated", "Loan / advance record updated."); setLoanModal(false); }, onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); } });
  const loanDelete = useMutation({ mutationFn: deleteLoanAdvance, onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll","loans"] }); toast.success("Deleted", "Loan / advance removed."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  // ── Render ───────────────────────────────────────────────────────────────────
  const payrolls   = payrollsQ.data ?? [];
  const employees  = employeesQ.data ?? [];
  const payslips   = payslipsQ.data ?? [];
  const bonuses    = bonusesQ.data ?? [];
  const deductions = deductionsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Payroll" subtitle="Salary records, payslips, deductions, loans, and pay structure." />
        {canManage && <Button onClick={() => setGenModal(true)}>⚡ Generate Payroll</Button>}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        {/* Tab bar */}
        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${t.key === tab ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Payroll Records ───────────────────────────────────────── */}
        {tab === "payroll-records" && (
          <div className="space-y-4">
            {canManage && (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="flex gap-2 items-end">
                  <div><label className="mb-1 block text-xs text-[var(--muted)]">Month</label><input type="number" min={1} max={12} value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))} className="h-9 w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs text-[var(--muted)]">Year</label><input type="number" min={2020} value={exportYear} onChange={e => setExportYear(Number(e.target.value))} className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" /></div>
                  <Button variant="outline" className="text-xs" onClick={() => void handleExport()} disabled={exporting}>{exporting ? "Exporting…" : "⬇ Bank CSV Export"}</Button>
                </div>
                <Button className="ml-auto text-xs" onClick={() => { setPayrollEdit(null); setPayrollForm({ employee_id: 0, month: new Date().getMonth() + 1, year: new Date().getFullYear(), base_salary: 0, bonus: 0, deductions: 0, tax: 0, payment_date: "", status: "draft" }); setPayrollModal(true); }}>+ Manual Entry</Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                    <th className="p-3">Employee</th><th className="p-3">Period</th><th className="p-3">Base</th><th className="p-3">Net</th><th className="p-3">Payment Date</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollsQ.isLoading && [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--border)]/50">{[...Array(7)].map((__, j) => <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>)}</tr>
                  ))}
                  {payrolls.map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                      <td className="p-3 font-medium">{item.employee?.name ?? `#${item.employee_id}`}</td>
                      <td className="p-3">{item.month}/{item.year}</td>
                      <td className="p-3">{fmt(Number(item.base_salary))}</td>
                      <td className="p-3 font-semibold">{fmt(Number(item.net_salary))}</td>
                      <td className="p-3">{item.payment_date?.slice(0, 10) ?? "—"}</td>
                      <td className="p-3"><Badge label={item.status} tone={payrollBadge(item.status)} /></td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setPayrollDetail(item)}>View</Button>
                          {canManage && item.status !== "paid" && item.status !== "approved" && (
                            <Button variant="outline" className="text-xs px-2 py-1 border-blue-200 text-blue-700" onClick={() => void payrollApprov.mutateAsync(item.id)}>✓ Approve</Button>
                          )}
                          {canManage && item.status === "approved" && (
                            <Button variant="outline" className="text-xs px-2 py-1 border-emerald-200 text-emerald-700" onClick={() => void payrollPaid.mutateAsync(item.id)}>✓ Mark Paid</Button>
                          )}
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setPayrollEdit(item); setPayrollForm({ employee_id: item.employee_id, month: item.month, year: item.year, base_salary: Number(item.base_salary), bonus: Number(item.bonus), deductions: Number(item.deductions), tax: Number(item.tax), payment_date: item.payment_date?.slice(0, 10) ?? "", status: item.status }); setPayrollModal(true); }}>Edit</Button>}
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete payroll?")) void payrollDelete.mutateAsync(item.id); }}>Delete</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!payrollsQ.isLoading && payrolls.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">No payroll records. Generate payroll or add manually.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Salary Slip ───────────────────────────────────────────── */}
        {tab === "salary-slip" && canManage && (
          <div className="max-w-lg space-y-4">
            <p className="text-sm text-[var(--muted)]">Generate and issue a salary slip from an existing payroll record.</p>
            <FormField label="Payroll Record">
              <select className={sel} value={slipPayrollId} onChange={e => setSlipPayrollId(Number(e.target.value))}>
                <option value={0}>Select payroll</option>
                {payrolls.map(p => <option key={p.id} value={p.id}>#{p.id} — {p.employee?.name} ({p.month}/{p.year})</option>)}
              </select>
            </FormField>
            <FormField label="Issue Date"><FormInput type="date" value={slipDate} onChange={e => setSlipDate(e.target.value)} /></FormField>
            <Button onClick={() => void slipMut.mutateAsync()} disabled={!slipPayrollId || !slipDate || slipMut.isPending}>{slipMut.isPending ? "Generating…" : "Generate Salary Slip"}</Button>
            {slipMut.isSuccess && <p className="text-sm text-emerald-600">Salary slip created. View it in the Payslips tab.</p>}
          </div>
        )}

        {/* ── Payroll Processing ────────────────────────────────────── */}
        {tab === "payroll-processing" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="text-xs text-[var(--muted)]">Month</label><input type="number" min={1} max={12} className="mt-1 h-9 w-20 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={procMonthF} onChange={e => setProcMonthF(e.target.value ? Number(e.target.value) : "")} /></div>
              <div><label className="text-xs text-[var(--muted)]">Year</label><input type="number" min={2020} className="mt-1 h-9 w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={procYearF} onChange={e => setProcYearF(e.target.value ? Number(e.target.value) : "")} /></div>
              <div><label className="text-xs text-[var(--muted)]">Status</label>
                <select className="mt-1 h-9 w-36 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={procStatF} onChange={e => setProcStatF((e.target.value as PayrollProcessing["status"]) || "")}>
                  <option value="">All</option>
                  {["draft","processing","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Button variant="outline" className="text-xs" onClick={() => { setProcMonthF(""); setProcYearF(new Date().getFullYear()); setProcStatF(""); }}>Reset</Button>
              {canManage && <Button className="ml-auto text-xs" onClick={() => { setProcEdit(null); setProcForm({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: "draft", processed_at: "", notes: "" }); setProcModal(true); }}>+ New Run</Button>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                    <th className="p-3">Period</th><th className="p-3">Status</th><th className="p-3">Processed At</th><th className="p-3">Notes</th><th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(processingsQ.data ?? []).map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3 font-medium">{item.month}/{item.year}</td>
                      <td className="p-3"><Badge label={item.status} tone={payrollBadge(item.status)} /></td>
                      <td className="p-3">{item.processed_at?.slice(0, 10) ?? "—"}</td>
                      <td className="max-w-[260px] truncate p-3 text-xs text-[var(--muted)]">{item.notes ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setProcEdit(item); setProcForm({ month: item.month, year: item.year, status: item.status, processed_at: item.processed_at?.slice(0, 10) ?? "", notes: item.notes ?? "" }); setProcModal(true); }}>Edit</Button>}
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void procDelete.mutateAsync(item.id); }}>Delete</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(processingsQ.data ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">No processing runs.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Payslips ──────────────────────────────────────────────── */}
        {tab === "payslips" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={payslipStatF} onChange={e => setPayslipStatF((e.target.value as Payslip["status"]) || "")}>
                <option value="">All statuses</option>
                {["draft","issued","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {canManage && <Button className="text-xs" onClick={() => { setPayslipEdit(null); setPayslipForm({ employee_id: 0, payroll_id: 0, slip_number: "", issue_date: "", status: "draft", file_url: "", notes: "" }); setPayslipModal(true); }}>+ New Payslip</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                    <th className="p-3">Slip #</th><th className="p-3">Employee</th><th className="p-3">Period</th><th className="p-3">Issue Date</th><th className="p-3">Status</th><th className="p-3">File</th><th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.filter(i => !payslipStatF || i.status === payslipStatF).map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3 font-medium">{item.slip_number}</td>
                      <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                      <td className="p-3">{item.payroll ? `${item.payroll.month}/${item.payroll.year}` : `#${item.payroll_id}`}</td>
                      <td className="p-3">{item.issue_date.slice(0, 10)}</td>
                      <td className="p-3"><Badge label={item.status} tone={item.status === "issued" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.status === "cancelled" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-100 text-slate-700"} /></td>
                      <td className="p-3">{item.file_url ? <a href={item.file_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--primary)] underline">Download</a> : "—"}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setPayslipDetail(item)}>View</Button>
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setPayslipEdit(item); setPayslipForm({ employee_id: item.employee_id, payroll_id: item.payroll_id, slip_number: item.slip_number, issue_date: item.issue_date.slice(0, 10), status: item.status, file_url: item.file_url ?? "", notes: item.notes ?? "" }); setPayslipModal(true); }}>Edit</Button>}
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void payslipDelete.mutateAsync(item.id); }}>Delete</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {payslips.filter(i => !payslipStatF || i.status === payslipStatF).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No payslips.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Bonuses ───────────────────────────────────────────────── */}
        {tab === "bonuses" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {canManage && <Button className="text-xs" onClick={() => { setBonusEdit(null); setBonusForm({ employee_id: 0, payroll_id: 0, title: "", amount: 0, taxable: false, effective_date: "", notes: "" }); setBonusModal(true); }}>+ New Bonus</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Employee</th><th className="p-3">Title</th><th className="p-3">Amount</th><th className="p-3">Taxable</th><th className="p-3">Date</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {bonuses.map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                      <td className="p-3 font-medium">{item.title}</td>
                      <td className="p-3">{fmt(Number(item.amount))}</td>
                      <td className="p-3"><Badge label={item.taxable ? "Yes" : "No"} tone={item.taxable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-700"} /></td>
                      <td className="p-3">{item.effective_date.slice(0, 10)}</td>
                      <td className="p-3"><div className="flex justify-end gap-1.5">
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setBonusEdit(item); setBonusForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), taxable: item.taxable, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setBonusModal(true); }}>Edit</Button>}
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void bonusDelete.mutateAsync(item.id); }}>Delete</Button>}
                      </div></td>
                    </tr>
                  ))}
                  {bonuses.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No bonus records.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Deductions ────────────────────────────────────────────── */}
        {tab === "deductions" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {canManage && <Button className="text-xs" onClick={() => { setDedEdit(null); setDedForm({ employee_id: 0, payroll_id: 0, title: "", amount: 0, type: "other", effective_date: "", notes: "" }); setDedModal(true); }}>+ New Deduction</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Employee</th><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Amount</th><th className="p-3">Date</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {deductions.map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                      <td className="p-3 font-medium">{item.title}</td>
                      <td className="p-3 capitalize text-xs text-[var(--muted)]">{item.type.replace(/_/g, " ")}</td>
                      <td className="p-3">{fmt(Number(item.amount))}</td>
                      <td className="p-3">{item.effective_date.slice(0, 10)}</td>
                      <td className="p-3"><div className="flex justify-end gap-1.5">
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setDedEdit(item); setDedForm({ employee_id: item.employee_id, payroll_id: item.payroll_id ?? 0, title: item.title, amount: Number(item.amount), type: item.type, effective_date: item.effective_date.slice(0, 10), notes: item.notes ?? "" }); setDedModal(true); }}>Edit</Button>}
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void dedDelete.mutateAsync(item.id); }}>Delete</Button>}
                      </div></td>
                    </tr>
                  ))}
                  {deductions.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No deduction records.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Salary Increments ─────────────────────────────────────── */}
        {tab === "salary-increments" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {canManage && <Button className="text-xs" onClick={() => { setIncEdit(null); setIncForm({ employee_id: 0, effective_date: "", old_salary: 0, new_salary: 0, reason: "", notes: "" }); setIncModal(true); }}>+ Record Increment</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Employee</th><th className="p-3">Effective Date</th><th className="p-3">Old Salary</th><th className="p-3">New Salary</th><th className="p-3">% Change</th><th className="p-3">Reason</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {(incrementsQ.data?.data ?? []).map(item => {
                    const pct = item.increment_percent_computed ?? (item.old_salary ? ((item.new_salary - item.old_salary) / item.old_salary * 100) : 0);
                    return (
                      <tr key={item.id} className="border-b border-[var(--border)]/50">
                        <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                        <td className="p-3">{String(item.effective_date).slice(0, 10)}</td>
                        <td className="p-3">{fmt(item.old_salary)}</td>
                        <td className="p-3 font-semibold">{fmt(item.new_salary)}</td>
                        <td className="p-3"><Badge label={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`} tone={pct >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"} /></td>
                        <td className="max-w-[140px] truncate p-3 text-xs text-[var(--muted)]">{item.reason ?? "—"}</td>
                        <td className="p-3"><div className="flex justify-end gap-1.5">
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setIncEdit(item); setIncForm({ employee_id: item.employee_id, effective_date: String(item.effective_date).slice(0, 10), old_salary: item.old_salary, new_salary: item.new_salary, reason: item.reason ?? "", notes: item.notes ?? "" }); setIncModal(true); }}>Edit</Button>}
                          {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void incDelete.mutateAsync(item.id); }}>Delete</Button>}
                        </div></td>
                      </tr>
                    );
                  })}
                  {(incrementsQ.data?.data ?? []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No salary increment history.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Loans / Advances ──────────────────────────────────────── */}
        {tab === "loans" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {canManage && <Button className="text-xs" onClick={() => { setLoanEdit(null); setLoanForm({ employee_id: 0, title: "", amount: 0, outstanding_balance: 0, emi_amount: "", start_date: "", end_date: "", notes: "" }); setLoanModal(true); }}>+ New Loan / Advance</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Employee</th><th className="p-3">Title</th><th className="p-3">Amount</th><th className="p-3">Outstanding</th><th className="p-3">EMI</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {(loansQ.data?.data ?? []).map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3">{item.employee?.name ?? `#${item.employee_id}`}</td>
                      <td className="p-3 font-medium">{item.title}</td>
                      <td className="p-3">{fmt(item.amount)}</td>
                      <td className="p-3 font-semibold">{fmt(item.outstanding_balance)}</td>
                      <td className="p-3">{item.emi_amount != null ? fmt(item.emi_amount) : "—"}</td>
                      <td className="p-3"><Badge label={item.status} tone={loanBadge(item.status)} /></td>
                      <td className="p-3"><div className="flex justify-end gap-1.5">
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setLoanEdit(item); setLoanForm({ employee_id: item.employee_id, title: item.title, amount: item.amount, outstanding_balance: item.outstanding_balance, emi_amount: item.emi_amount ?? "", start_date: item.start_date.slice(0, 10), end_date: item.end_date?.slice(0, 10) ?? "", notes: item.notes ?? "" }); setLoanModal(true); }}>Edit</Button>}
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void loanDelete.mutateAsync(item.id); }}>Delete</Button>}
                      </div></td>
                    </tr>
                  ))}
                  {(loansQ.data?.data ?? []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-[var(--muted)]">No loans or advances.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tax Brackets ──────────────────────────────────────────── */}
        {tab === "tax-brackets" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Tax Slab Configuration</p>
                <p className="text-xs text-[var(--muted)]">Define income tax brackets. Lower brackets are applied first.</p>
              </div>
              {canManage && <Button className="text-xs shrink-0" onClick={() => { setTaxEdit(null); setTaxForm({ name: "", min_income: 0, max_income: "", rate: 0, sort_order: 0 }); setTaxModal(true); }}>+ Add Bracket</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Name</th><th className="p-3">Min Income</th><th className="p-3">Max Income</th><th className="p-3">Rate (%)</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {(taxBracketsQ.data ?? []).map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3">{fmt(item.min_income)}</td>
                      <td className="p-3">{item.max_income != null ? fmt(item.max_income) : "No limit"}</td>
                      <td className="p-3">{item.rate}%</td>
                      <td className="p-3"><div className="flex justify-end gap-1.5">
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setTaxEdit(item); setTaxForm({ name: item.name, min_income: item.min_income, max_income: item.max_income ?? "", rate: item.rate, sort_order: item.sort_order ?? 0 }); setTaxModal(true); }}>Edit</Button>}
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void taxDelete.mutateAsync(item.id); }}>Delete</Button>}
                      </div></td>
                    </tr>
                  ))}
                  {(taxBracketsQ.data ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">No tax brackets configured.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Salary Grades ─────────────────────────────────────────── */}
        {tab === "salary-grades" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Salary Grade Templates</p>
                <p className="text-xs text-[var(--muted)]">Reusable salary bands. Link a grade to an employee to pre-fill salary components.</p>
              </div>
              {canManage && <Button className="text-xs shrink-0" onClick={() => { setGradeEdit(null); setGradeForm({ name: "", min_salary: 0, max_salary: 0, basic_percent: 50, hra_percent: 20, transport_allowance: 0, other_allowance: 0, notes: "" }); setGradeModal(true); }}>+ Add Grade</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Name</th><th className="p-3">Salary Range</th><th className="p-3">Basic %</th><th className="p-3">HRA %</th><th className="p-3">Transport</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {(salaryGradesQ.data ?? []).map(item => (
                    <tr key={item.id} className="border-b border-[var(--border)]/50">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3">{fmt(item.min_salary)} – {fmt(item.max_salary)}</td>
                      <td className="p-3">{item.basic_percent ?? 50}%</td>
                      <td className="p-3">{item.hra_percent ?? 20}%</td>
                      <td className="p-3">{fmt(item.transport_allowance ?? 0)}</td>
                      <td className="p-3"><div className="flex justify-end gap-1.5">
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setGradeEdit(item); setGradeForm({ name: item.name, min_salary: item.min_salary, max_salary: item.max_salary, basic_percent: item.basic_percent ?? 50, hra_percent: item.hra_percent ?? 20, transport_allowance: item.transport_allowance ?? 0, other_allowance: item.other_allowance ?? 0, notes: item.notes ?? "" }); setGradeModal(true); }}>Edit</Button>}
                        {canManage && <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete?")) void gradeDelete.mutateAsync(item.id); }}>Delete</Button>}
                      </div></td>
                    </tr>
                  ))}
                  {(salaryGradesQ.data ?? []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No salary grades configured.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Generate modal ─────────────────────────────────────────────── */}
      {genModal && (
        <Modal title="Generate Monthly Payroll" onClose={() => setGenModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">Auto-calculate payroll for all active employees. Existing records for the period are skipped.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month"><FormInput type="number" min={1} max={12} value={genMonth} onChange={e => setGenMonth(Number(e.target.value))} /></FormField>
              <FormField label="Year"><FormInput type="number" min={2020} value={genYear} onChange={e => setGenYear(Number(e.target.value))} /></FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGenModal(false)}>Cancel</Button>
              <Button onClick={() => void genMut.mutateAsync()} disabled={genMut.isPending}>{genMut.isPending ? "Generating…" : "Generate"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Payroll detail modal ────────────────────────────────────────── */}
      {payrollDetail && (
        <Modal title={`Payroll — ${payrollDetail.employee?.name ?? `#${payrollDetail.employee_id}`}`} onClose={() => setPayrollDetail(null)}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Period" value={`${payrollDetail.month}/${payrollDetail.year}`} />
              <SummaryCard label="Status" value={payrollDetail.status} />
              <SummaryCard label="Payment Date" value={payrollDetail.payment_date?.slice(0, 10) ?? "—"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard label="Base Salary" value={fmt(Number(payrollDetail.base_salary))} />
              <SummaryCard label="Bonus" value={fmt(Number(payrollDetail.bonus))} />
              <SummaryCard label="Deductions" value={fmt(Number(payrollDetail.deductions))} />
              <SummaryCard label="Tax" value={fmt(Number(payrollDetail.tax))} />
            </div>
            <div className="rounded-xl border-2 border-[var(--primary)]/30 bg-[var(--primary)]/5 p-3 text-center">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Net Salary</p>
              <p className="text-3xl font-bold text-[var(--primary)]">{fmt(Number(payrollDetail.net_salary))}</p>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Payslip detail modal ────────────────────────────────────────── */}
      {payslipDetail && (
        <Modal title={`Payslip — ${payslipDetail.slip_number}`} onClose={() => setPayslipDetail(null)}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard label="Employee" value={payslipDetail.employee?.name ?? `#${payslipDetail.employee_id}`} />
              <SummaryCard label="Issue Date" value={payslipDetail.issue_date.slice(0, 10)} />
              <SummaryCard label="Status" value={payslipDetail.status} />
              <SummaryCard label="Payroll" value={payslipDetail.payroll ? `${payslipDetail.payroll.month}/${payslipDetail.payroll.year}` : `#${payslipDetail.payroll_id}`} />
            </div>
            {payslipDetail.payroll && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Net Salary" value={fmt(Number(payslipDetail.payroll.net_salary))} />
                <SummaryCard label="Base" value={fmt(Number(payslipDetail.payroll.base_salary))} />
              </div>
            )}
            {payslipDetail.file_url
              ? <a href={payslipDetail.file_url} target="_blank" rel="noreferrer" className="inline-block rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">Download Payslip PDF</a>
              : <p className="text-sm text-[var(--muted)]">No file attached.</p>
            }
          </div>
        </Modal>
      )}

      {/* ── Payroll record form modal ──────────────────────────────────── */}
      {payrollModal && (
        <Modal title={`${payrollEdit ? "Edit" : "New"} Payroll Record`} onClose={() => setPayrollModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (payrollEdit ? payrollUpdate : payrollCreate).mutateAsync(); }}>
            <FormField label="Employee">
              <select required disabled={!!payrollEdit} className={sel} value={payrollForm.employee_id} onChange={e => setPayrollForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month"><FormInput disabled={!!payrollEdit} type="number" min={1} max={12} value={payrollForm.month} onChange={e => setPayrollForm(p => ({ ...p, month: Number(e.target.value) }))} /></FormField>
              <FormField label="Year"><FormInput disabled={!!payrollEdit} type="number" min={2020} value={payrollForm.year} onChange={e => setPayrollForm(p => ({ ...p, year: Number(e.target.value) }))} /></FormField>
              <FormField label="Base Salary"><FormInput disabled={!!payrollEdit} type="number" min={0} step="0.01" value={payrollForm.base_salary} onChange={e => setPayrollForm(p => ({ ...p, base_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="Bonus"><FormInput type="number" min={0} step="0.01" value={payrollForm.bonus} onChange={e => setPayrollForm(p => ({ ...p, bonus: Number(e.target.value) }))} /></FormField>
              <FormField label="Deductions"><FormInput type="number" min={0} step="0.01" value={payrollForm.deductions} onChange={e => setPayrollForm(p => ({ ...p, deductions: Number(e.target.value) }))} /></FormField>
              <FormField label="Tax"><FormInput type="number" min={0} step="0.01" value={payrollForm.tax} onChange={e => setPayrollForm(p => ({ ...p, tax: Number(e.target.value) }))} /></FormField>
              <FormField label="Payment Date"><FormInput type="date" value={payrollForm.payment_date} onChange={e => setPayrollForm(p => ({ ...p, payment_date: e.target.value }))} /></FormField>
              <FormField label="Status">
                <select className={sel} value={payrollForm.status} onChange={e => setPayrollForm(p => ({ ...p, status: e.target.value as PayrollRecord["status"] }))}>
                  {["draft","reviewed","approved","pending","processed","paid","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
            </div>
            <div className="rounded-lg bg-[var(--background)] p-2 text-sm text-[var(--muted)]">
              Net: <strong className="text-[var(--text)]">{fmt(Math.max(0, payrollForm.base_salary + payrollForm.bonus - payrollForm.deductions - payrollForm.tax))}</strong>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayrollModal(false)}>Cancel</Button>
              <Button type="submit" disabled={payrollCreate.isPending || payrollUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Processing form modal ──────────────────────────────────────── */}
      {procModal && (
        <Modal title={`${procEdit ? "Edit" : "New"} Processing Run`} onClose={() => setProcModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (procEdit ? procUpdate : procCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month"><FormInput required type="number" min={1} max={12} value={procForm.month} onChange={e => setProcForm(p => ({ ...p, month: Number(e.target.value) }))} /></FormField>
              <FormField label="Year"><FormInput required type="number" min={2020} value={procForm.year} onChange={e => setProcForm(p => ({ ...p, year: Number(e.target.value) }))} /></FormField>
              <FormField label="Status">
                <select className={sel} value={procForm.status} onChange={e => setProcForm(p => ({ ...p, status: e.target.value as PayrollProcessing["status"] }))}>
                  {["draft","processing","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Processed At"><FormInput type="date" value={procForm.processed_at} onChange={e => setProcForm(p => ({ ...p, processed_at: e.target.value }))} /></FormField>
            </div>
            <FormField label="Notes">
              <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={procForm.notes} onChange={e => setProcForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setProcModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Payslip form modal ─────────────────────────────────────────── */}
      {payslipModal && (
        <Modal title={`${payslipEdit ? "Edit" : "New"} Payslip`} onClose={() => setPayslipModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (payslipEdit ? payslipUpdate : payslipCreate).mutateAsync(); }}>
            {!payslipEdit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Employee">
                  <select required className={sel} value={payslipForm.employee_id} onChange={e => setPayslipForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                    <option value={0}>Select employee</option>
                    {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Payroll">
                  <select required className={sel} value={payslipForm.payroll_id} onChange={e => setPayslipForm(p => ({ ...p, payroll_id: Number(e.target.value) }))}>
                    <option value={0}>Select payroll</option>
                    {payrolls.map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                  </select>
                </FormField>
                <FormField label="Slip Number"><FormInput required value={payslipForm.slip_number} onChange={e => setPayslipForm(p => ({ ...p, slip_number: e.target.value }))} /></FormField>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Issue Date"><FormInput required type="date" value={payslipForm.issue_date} onChange={e => setPayslipForm(p => ({ ...p, issue_date: e.target.value }))} /></FormField>
              <FormField label="Status">
                <select className={sel} value={payslipForm.status} onChange={e => setPayslipForm(p => ({ ...p, status: e.target.value as Payslip["status"] }))}>
                  {["draft","issued","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="File URL (optional)"><FormInput type="url" value={payslipForm.file_url} onChange={e => setPayslipForm(p => ({ ...p, file_url: e.target.value }))} placeholder="https://…" /></FormField>
            </div>
            <FormField label="Notes"><textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={payslipForm.notes} onChange={e => setPayslipForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayslipModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Bonus form modal ───────────────────────────────────────────── */}
      {bonusModal && (
        <Modal title={`${bonusEdit ? "Edit" : "New"} Bonus`} onClose={() => setBonusModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (bonusEdit ? bonusUpdate : bonusCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Employee">
                <select required className={sel} value={bonusForm.employee_id} onChange={e => setBonusForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                  <option value={0}>Select employee</option>
                  {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </FormField>
              <FormField label="Payroll (optional)">
                <select className={sel} value={bonusForm.payroll_id} onChange={e => setBonusForm(p => ({ ...p, payroll_id: Number(e.target.value) }))}>
                  <option value={0}>No linked payroll</option>
                  {payrolls.filter(p => !bonusForm.employee_id || p.employee_id === bonusForm.employee_id).map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                </select>
              </FormField>
              <FormField label="Title"><FormInput required value={bonusForm.title} onChange={e => setBonusForm(p => ({ ...p, title: e.target.value }))} /></FormField>
              <FormField label="Amount"><FormInput required type="number" min={0} step="0.01" value={bonusForm.amount} onChange={e => setBonusForm(p => ({ ...p, amount: Number(e.target.value) }))} /></FormField>
              <FormField label="Effective Date"><FormInput required type="date" value={bonusForm.effective_date} onChange={e => setBonusForm(p => ({ ...p, effective_date: e.target.value }))} /></FormField>
              <FormField label="Taxable">
                <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={bonusForm.taxable} onChange={e => setBonusForm(p => ({ ...p, taxable: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />
                  Mark as taxable
                </label>
              </FormField>
            </div>
            <FormField label="Notes"><textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={bonusForm.notes} onChange={e => setBonusForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBonusModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Deduction form modal ───────────────────────────────────────── */}
      {dedModal && (
        <Modal title={`${dedEdit ? "Edit" : "New"} Deduction`} onClose={() => setDedModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (dedEdit ? dedUpdate : dedCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Employee">
                <select required className={sel} value={dedForm.employee_id} onChange={e => setDedForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                  <option value={0}>Select employee</option>
                  {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </FormField>
              <FormField label="Type">
                <select required className={sel} value={dedForm.type} onChange={e => setDedForm(p => ({ ...p, type: e.target.value as DeductionType }))}>
                  {DEDUCTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FormField>
              <FormField label="Title"><FormInput required value={dedForm.title} onChange={e => setDedForm(p => ({ ...p, title: e.target.value }))} /></FormField>
              <FormField label="Amount"><FormInput required type="number" min={0} step="0.01" value={dedForm.amount} onChange={e => setDedForm(p => ({ ...p, amount: Number(e.target.value) }))} /></FormField>
              <FormField label="Effective Date"><FormInput required type="date" value={dedForm.effective_date} onChange={e => setDedForm(p => ({ ...p, effective_date: e.target.value }))} /></FormField>
              <FormField label="Payroll (optional)">
                <select className={sel} value={dedForm.payroll_id} onChange={e => setDedForm(p => ({ ...p, payroll_id: Number(e.target.value) }))}>
                  <option value={0}>No linked payroll</option>
                  {payrolls.filter(p => !dedForm.employee_id || p.employee_id === dedForm.employee_id).map(x => <option key={x.id} value={x.id}>#{x.id} — {x.month}/{x.year}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Notes"><textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={dedForm.notes} onChange={e => setDedForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDedModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Tax bracket form modal ─────────────────────────────────────── */}
      {taxModal && (
        <Modal title={`${taxEdit ? "Edit" : "Add"} Tax Bracket`} onClose={() => setTaxModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (taxEdit ? taxUpdate : taxCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Name"><FormInput required value={taxForm.name} onChange={e => setTaxForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 10% Slab" /></FormField>
              <FormField label="Rate (%)"><FormInput required type="number" min={0} max={100} step="0.01" value={taxForm.rate} onChange={e => setTaxForm(p => ({ ...p, rate: Number(e.target.value) }))} /></FormField>
              <FormField label="Min Income"><FormInput required type="number" min={0} step="0.01" value={taxForm.min_income} onChange={e => setTaxForm(p => ({ ...p, min_income: Number(e.target.value) }))} /></FormField>
              <FormField label="Max Income (blank = no limit)"><FormInput type="number" min={0} step="0.01" value={taxForm.max_income} onChange={e => setTaxForm(p => ({ ...p, max_income: e.target.value ? Number(e.target.value) : "" }))} /></FormField>
              <FormField label="Sort Order"><FormInput type="number" min={0} value={taxForm.sort_order} onChange={e => setTaxForm(p => ({ ...p, sort_order: Number(e.target.value) }))} /></FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTaxModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Salary grade form modal ────────────────────────────────────── */}
      {gradeModal && (
        <Modal title={`${gradeEdit ? "Edit" : "Add"} Salary Grade`} onClose={() => setGradeModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (gradeEdit ? gradeUpdate : gradeCreate).mutateAsync(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Grade Name"><FormInput required value={gradeForm.name} onChange={e => setGradeForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Grade A" /></FormField>
              <FormField label="Min Salary"><FormInput required type="number" min={0} step="0.01" value={gradeForm.min_salary} onChange={e => setGradeForm(p => ({ ...p, min_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="Max Salary"><FormInput required type="number" min={0} step="0.01" value={gradeForm.max_salary} onChange={e => setGradeForm(p => ({ ...p, max_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="Basic % of gross"><FormInput type="number" min={0} max={100} step="0.01" value={gradeForm.basic_percent} onChange={e => setGradeForm(p => ({ ...p, basic_percent: Number(e.target.value) }))} /></FormField>
              <FormField label="HRA % of basic"><FormInput type="number" min={0} max={100} step="0.01" value={gradeForm.hra_percent} onChange={e => setGradeForm(p => ({ ...p, hra_percent: Number(e.target.value) }))} /></FormField>
              <FormField label="Transport Allowance"><FormInput type="number" min={0} step="0.01" value={gradeForm.transport_allowance} onChange={e => setGradeForm(p => ({ ...p, transport_allowance: Number(e.target.value) }))} /></FormField>
              <FormField label="Other Allowance"><FormInput type="number" min={0} step="0.01" value={gradeForm.other_allowance} onChange={e => setGradeForm(p => ({ ...p, other_allowance: Number(e.target.value) }))} /></FormField>
            </div>
            <FormField label="Notes"><textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={gradeForm.notes} onChange={e => setGradeForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setGradeModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Salary increment form modal ────────────────────────────────── */}
      {incModal && (
        <Modal title={`${incEdit ? "Edit" : "Record"} Salary Increment`} onClose={() => setIncModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (incEdit ? incUpdate : incCreate).mutateAsync(); }}>
            <FormField label="Employee">
              <select required disabled={!!incEdit} className={sel} value={incForm.employee_id} onChange={e => setIncForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Effective Date"><FormInput required type="date" value={incForm.effective_date} onChange={e => setIncForm(p => ({ ...p, effective_date: e.target.value }))} /></FormField>
              <FormField label="Old Salary"><FormInput required type="number" min={0} step="0.01" value={incForm.old_salary} onChange={e => setIncForm(p => ({ ...p, old_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="New Salary"><FormInput required type="number" min={0} step="0.01" value={incForm.new_salary} onChange={e => setIncForm(p => ({ ...p, new_salary: Number(e.target.value) }))} /></FormField>
              <FormField label="Reason">
                <select className={sel} value={incForm.reason} onChange={e => setIncForm(p => ({ ...p, reason: e.target.value }))}>
                  <option value="">Select reason</option>
                  {["Annual review","Promotion","Market correction","Performance-based","Probation completion","Other"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </FormField>
            </div>
            {incForm.old_salary > 0 && incForm.new_salary > 0 && (
              <p className="text-sm text-[var(--muted)]">Change: <strong className={incForm.new_salary >= incForm.old_salary ? "text-emerald-600" : "text-red-600"}>{incForm.new_salary >= incForm.old_salary ? "+" : ""}{(((incForm.new_salary - incForm.old_salary) / incForm.old_salary) * 100).toFixed(2)}%</strong></p>
            )}
            <FormField label="Notes"><textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={incForm.notes} onChange={e => setIncForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIncModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Loan form modal ────────────────────────────────────────────── */}
      {loanModal && (
        <Modal title={`${loanEdit ? "Edit" : "New"} Loan / Advance`} onClose={() => setLoanModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void (loanEdit ? loanUpdate : loanCreate).mutateAsync(); }}>
            <FormField label="Employee">
              <select required disabled={!!loanEdit} className={sel} value={loanForm.employee_id} onChange={e => setLoanForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Title"><FormInput required value={loanForm.title} onChange={e => setLoanForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Medical Emergency Advance" /></FormField>
              <FormField label="Principal Amount"><FormInput required type="number" min={0} step="0.01" value={loanForm.amount} onChange={e => setLoanForm(p => ({ ...p, amount: Number(e.target.value), outstanding_balance: loanEdit ? p.outstanding_balance : Number(e.target.value) }))} /></FormField>
              <FormField label="Outstanding Balance"><FormInput required type="number" min={0} step="0.01" value={loanForm.outstanding_balance} onChange={e => setLoanForm(p => ({ ...p, outstanding_balance: Number(e.target.value) }))} /></FormField>
              <FormField label="Monthly EMI (optional)"><FormInput type="number" min={0} step="0.01" value={loanForm.emi_amount} onChange={e => setLoanForm(p => ({ ...p, emi_amount: e.target.value ? Number(e.target.value) : "" }))} /></FormField>
              <FormField label="Start Date"><FormInput required type="date" value={loanForm.start_date} onChange={e => setLoanForm(p => ({ ...p, start_date: e.target.value }))} /></FormField>
              <FormField label="End Date (optional)"><FormInput type="date" value={loanForm.end_date} onChange={e => setLoanForm(p => ({ ...p, end_date: e.target.value }))} /></FormField>
            </div>
            <FormField label="Notes"><textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={loanForm.notes} onChange={e => setLoanForm(p => ({ ...p, notes: e.target.value }))} maxLength={1000} /></FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLoanModal(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
