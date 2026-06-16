import { apiClient, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export type PayrollStatus = "draft" | "reviewed" | "approved" | "pending" | "processed" | "paid" | "cancelled";

export interface PayrollEmployee {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  employee_number?: string | null;
}

export interface PayrollRecord {
  id: number;
  employee_id: number;
  month: number;
  year: number;
  base_salary: number | string;
  bonus: number | string;
  deductions: number | string;
  tax: number | string;
  net_salary: number | string;
  payment_date: string;
  status: PayrollStatus;
  employee?: PayrollEmployee | null;
}

export interface PaginationMeta<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface PayrollPayload {
  employee_id: number;
  month: number;
  year: number;
  base_salary: number;
  bonus?: number;
  deductions?: number;
  tax?: number;
  net_salary: number;
  payment_date: string;
  status: PayrollStatus;
}

export interface PayrollGeneratePayload {
  month: number;
  year: number;
  department_id?: number;
}

export interface PayrollGenerateResult {
  created: number;
  skipped: number;
  failed: number;
}

export interface PayrollSummaryItem {
  total_employees: number;
  total_base_salary: number | string | null;
  total_bonus: number | string | null;
  total_deductions: number | string | null;
  total_tax: number | string | null;
  total_net_salary: number | string | null;
  status: PayrollStatus;
}

export interface PayrollProcessing {
  id: number;
  month: number;
  year: number;
  status: "draft" | "processing" | "completed" | "cancelled";
  processed_at?: string | null;
  notes?: string | null;
}

export interface Bonus {
  id: number;
  employee_id: number;
  payroll_id?: number | null;
  title: string;
  amount: number | string;
  taxable: boolean;
  effective_date: string;
  notes?: string | null;
  employee?: PayrollEmployee | null;
}

export type DeductionType = "tax" | "loan" | "penalty" | "provident_fund" | "pension" | "esi" | "professional_tax" | "other";

export interface Deduction {
  id: number;
  employee_id: number;
  payroll_id?: number | null;
  title: string;
  amount: number | string;
  type: DeductionType;
  effective_date: string;
  notes?: string | null;
  employee?: PayrollEmployee | null;
}

export interface TaxBracket {
  id: number;
  company_id?: number | null;
  name: string;
  min_income: number;
  max_income?: number | null;
  rate: number;
  sort_order?: number;
}

export interface SalaryGrade {
  id: number;
  company_id?: number | null;
  name: string;
  min_salary: number;
  max_salary: number;
  basic_percent?: number;
  hra_percent?: number;
  transport_allowance?: number;
  other_allowance?: number;
  notes?: string | null;
}

export interface SalaryIncrement {
  id: number;
  employee_id: number;
  appraisal_id?: number | null;
  effective_date: string;
  old_salary: number;
  new_salary: number;
  increment_percent_computed?: number;
  reason?: string | null;
  notes?: string | null;
  employee?: PayrollEmployee | null;
}

export interface LoanAdvance {
  id: number;
  employee_id: number;
  company_id?: number | null;
  title: string;
  amount: number;
  outstanding_balance: number;
  emi_amount?: number | null;
  start_date: string;
  end_date?: string | null;
  status: "active" | "completed" | "cancelled";
  notes?: string | null;
  employee?: PayrollEmployee | null;
}

export interface Payslip {
  id: number;
  employee_id: number;
  payroll_id: number;
  slip_number: string;
  issue_date: string;
  status: "draft" | "issued" | "cancelled";
  file_url?: string | null;
  notes?: string | null;
  employee?: PayrollEmployee | null;
  payroll?: PayrollRecord | null;
}

export interface PayrollFilters {
  employee_id?: number;
  status?: PayrollStatus;
  month?: number;
  year?: number;
  page?: number;
}

function qs(params: Record<string, string | number | undefined> | PayrollFilters) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

export function listPayroll(filters: PayrollFilters = {}) {
  return apiClient<PaginationMeta<PayrollRecord>>(`/payroll${qs(filters)}`);
}

export function getPayrollByEmployee(employeeId: number, year?: number) {
  return apiClient<PaginationMeta<PayrollRecord>>(`/payroll/employee/${employeeId}${qs({ year })}`);
}

export function createPayroll(payload: PayrollPayload) {
  return apiClient<PayrollRecord>("/payroll", { method: "POST", body: JSON.stringify(payload) });
}

export function updatePayroll(id: number, payload: Partial<PayrollPayload>) {
  return apiClient<PayrollRecord>(`/payroll/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deletePayroll(id: number) {
  return apiClient<null>(`/payroll/${id}`, { method: "DELETE" });
}

export function markPayrollPaid(id: number) {
  return apiClient<PayrollRecord>(`/payroll/${id}/mark-paid`, { method: "POST" });
}

export function generatePayroll(payload: PayrollGeneratePayload) {
  return apiClient<PayrollGenerateResult>("/payroll/generate", { method: "POST", body: JSON.stringify(payload) });
}

export function getPayrollMonthlySummary(month: number, year: number) {
  return apiClient<PayrollSummaryItem[]>(`/payroll/summary/monthly${qs({ month, year })}`);
}

export function listPayrollProcessings(month?: number, year?: number, status?: PayrollProcessing["status"]) {
  return apiClient<PaginationMeta<PayrollProcessing>>(`/payroll-processings${qs({ month, year, status })}`);
}
export function createPayrollProcessing(payload: Omit<PayrollProcessing, "id">) {
  return apiClient<PayrollProcessing>("/payroll-processings", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePayrollProcessing(id: number, payload: Partial<Omit<PayrollProcessing, "id">>) {
  return apiClient<PayrollProcessing>(`/payroll-processings/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deletePayrollProcessing(id: number) {
  return apiClient<null>(`/payroll-processings/${id}`, { method: "DELETE" });
}

export function listBonuses() {
  return apiClient<PaginationMeta<Bonus>>("/bonuses");
}
export function createBonus(payload: Omit<Bonus, "id" | "employee">) {
  return apiClient<Bonus>("/bonuses", { method: "POST", body: JSON.stringify(payload) });
}
export function updateBonus(id: number, payload: Partial<Omit<Bonus, "id" | "employee">>) {
  return apiClient<Bonus>(`/bonuses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteBonus(id: number) {
  return apiClient<null>(`/bonuses/${id}`, { method: "DELETE" });
}

export function listDeductions() {
  return apiClient<PaginationMeta<Deduction>>("/deductions");
}
export function createDeduction(payload: Omit<Deduction, "id" | "employee">) {
  return apiClient<Deduction>("/deductions", { method: "POST", body: JSON.stringify(payload) });
}
export function updateDeduction(id: number, payload: Partial<Omit<Deduction, "id" | "employee">>) {
  return apiClient<Deduction>(`/deductions/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteDeduction(id: number) {
  return apiClient<null>(`/deductions/${id}`, { method: "DELETE" });
}

export function listPayslips() {
  return apiClient<PaginationMeta<Payslip>>("/payslips");
}
export function createPayslip(payload: Omit<Payslip, "id" | "employee" | "payroll">) {
  return apiClient<Payslip>("/payslips", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePayslip(id: number, payload: Partial<Omit<Payslip, "id" | "employee" | "payroll" | "slip_number" | "employee_id" | "payroll_id">>) {
  return apiClient<Payslip>(`/payslips/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deletePayslip(id: number) {
  return apiClient<null>(`/payslips/${id}`, { method: "DELETE" });
}
export function createSalarySlipFromPayroll(payroll_id: number, issue_date: string) {
  return apiClient<Payslip>("/salary-slips/from-payroll", { method: "POST", body: JSON.stringify({ payroll_id, issue_date }) });
}

export function approvePayroll(id: number) {
  return apiClient<PayrollRecord>(`/payroll/${id}/approve`, { method: "POST" });
}

export async function downloadBankExport(month: number, year: number): Promise<void> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE_URL}/payroll/bank-export?month=${month}&year=${year}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-${year}-${String(month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function listTaxBrackets() {
  return apiClient<TaxBracket[]>("/tax-brackets");
}
export function createTaxBracket(payload: Omit<TaxBracket, "id" | "company_id">) {
  return apiClient<TaxBracket>("/tax-brackets", { method: "POST", body: JSON.stringify(payload) });
}
export function updateTaxBracket(id: number, payload: Partial<Omit<TaxBracket, "id" | "company_id">>) {
  return apiClient<TaxBracket>(`/tax-brackets/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteTaxBracket(id: number) {
  return apiClient<null>(`/tax-brackets/${id}`, { method: "DELETE" });
}

export function listSalaryGrades() {
  return apiClient<SalaryGrade[]>("/salary-grades");
}
export function createSalaryGrade(payload: Omit<SalaryGrade, "id" | "company_id">) {
  return apiClient<SalaryGrade>("/salary-grades", { method: "POST", body: JSON.stringify(payload) });
}
export function updateSalaryGrade(id: number, payload: Partial<Omit<SalaryGrade, "id" | "company_id">>) {
  return apiClient<SalaryGrade>(`/salary-grades/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteSalaryGrade(id: number) {
  return apiClient<null>(`/salary-grades/${id}`, { method: "DELETE" });
}

export function listSalaryIncrements(filters: { employee_id?: number } = {}) {
  return apiClient<PaginationMeta<SalaryIncrement>>(`/salary-increments${qs(filters)}`);
}
export function createSalaryIncrement(payload: Omit<SalaryIncrement, "id" | "employee" | "increment_percent_computed">) {
  return apiClient<SalaryIncrement>("/salary-increments", { method: "POST", body: JSON.stringify(payload) });
}
export function updateSalaryIncrement(id: number, payload: Partial<Omit<SalaryIncrement, "id" | "employee" | "increment_percent_computed">>) {
  return apiClient<SalaryIncrement>(`/salary-increments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteSalaryIncrement(id: number) {
  return apiClient<null>(`/salary-increments/${id}`, { method: "DELETE" });
}

export function listLoanAdvances(filters: { employee_id?: number; status?: string } = {}) {
  return apiClient<PaginationMeta<LoanAdvance>>(`/loan-advances${qs(filters)}`);
}
export function createLoanAdvance(payload: Omit<LoanAdvance, "id" | "company_id" | "employee">) {
  return apiClient<LoanAdvance>("/loan-advances", { method: "POST", body: JSON.stringify(payload) });
}
export function updateLoanAdvance(id: number, payload: Partial<Omit<LoanAdvance, "id" | "company_id" | "employee">>) {
  return apiClient<LoanAdvance>(`/loan-advances/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteLoanAdvance(id: number) {
  return apiClient<null>(`/loan-advances/${id}`, { method: "DELETE" });
}
