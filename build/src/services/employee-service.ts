import { apiClient, API_BASE_URL } from "./api-client";
import { pollBackgroundRun } from "./background-run-service";
import { useAuthStore } from "@/store/auth-store";
import type { Payslip } from "./payroll-service";

export interface Employee {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  designation?: string | null;
  status: string;
  department?: {
    name: string;
  } | null;
  employee_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  cnic?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  address?: string | null;
  joining_date?: string | null;
  employment_type?: string | null;
  shift?: { id: number; name: string } | null;
  shift_id?: number | null;
  manager_id?: number | null;
  manager?: { id: number; name: string } | null;
  basic_salary?: number | null;
  allowances?: number | null;
  commission_percentage?: number | string | null;
  profile_image?: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface Department {
  id: number;
  name: string;
}

export interface Designation {
  id: number;
  name: string;
}

export interface Shift {
  id: number;
  name: string;
}

export function getEmployees() {
  return apiClient<PaginatedResponse<Employee>>("/employees?per_page=10");
}

/** Full employee list for pickers (e.g. manager select); not limited to the first page. */
export function getEmployeeOptions() {
  return apiClient<PaginatedResponse<Employee>>("/employees?per_page=1000&sort_by=name&sort_dir=asc");
}

export function getEmployeesPage(params: { per_page?: number; status?: string } = {}) {
  const query = new URLSearchParams({ per_page: String(params.per_page ?? 10) });
  if (params.status) query.set("status", params.status);
  return apiClient<PaginatedResponse<Employee>>(`/employees?${query.toString()}`);
}

export function createEmployee(formData: FormData) {
  return apiClient<Employee>("/employees", {
    method: "POST",
    body: formData,
  });
}

export function getEmployee(id: number) {
  return apiClient<Employee>(`/employees/${id}`);
}

export function updateEmployee(id: number, payload: FormData) {
  return apiClient<Employee>(`/employees/${id}`, { method: "POST", body: payload });
}

export function listEmployeesPaginated(
  page: number,
  search: string,
  companyId?: string,
  sortBy = "name",
  sortDir: "asc" | "desc" = "asc",
) {
  const params = new URLSearchParams({ page: String(page), per_page: "15", sort_by: sortBy, sort_dir: sortDir });
  if (search.trim()) params.set("search", search.trim());
  if (companyId) params.set("company_id", companyId);
  return apiClient<PaginatedResponse<Employee>>(`/employees?${params.toString()}`);
}

export function getActiveEmployees(limit = 10) {
  return apiClient<PaginatedResponse<Employee>>(`/employees?per_page=${limit}&status=active`);
}

export function getEmployeeDirectReports(employeeId: number) {
  return apiClient<PaginatedResponse<Employee>>(`/employees?manager_id=${employeeId}&per_page=50`);
}

export interface EmployeeImportResult { imported: number; skipped: number; errors: string[] }
interface BackgroundRunHandle { background_run_id: number }
interface EmployeeExportSummary { file_path: string; row_count: number }

export async function exportEmployeesCsv(): Promise<void> {
  const { background_run_id } = await apiClient<BackgroundRunHandle>("/employees/export/csv", { method: "POST" });
  const run = await pollBackgroundRun<EmployeeExportSummary>(background_run_id);
  if (run.status === "failed") throw new Error(run.error ?? "Export failed");

  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE_URL}/background-runs/${background_run_id}/download`, {
    headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "text/csv" },
  });
  if (!res.ok) throw new Error("Export download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importEmployeesCsv(file: File): Promise<EmployeeImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const { background_run_id } = await apiClient<BackgroundRunHandle>("/employees/import", { method: "POST", body: fd });
  const run = await pollBackgroundRun<EmployeeImportResult>(background_run_id);
  if (run.status === "failed") throw new Error(run.error ?? "Import failed");
  return run.summary ?? { imported: 0, skipped: 0, errors: [] };
}

export interface EmployeePromotion {
  id: number;
  type: string;
  from_designation?: string | null;
  to_designation?: string | null;
  from_department?: string | null;
  to_department?: string | null;
  from_salary?: number | string | null;
  to_salary?: number | string | null;
  effective_date: string;
  notes?: string | null;
}

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export interface EmergencyContact { name: string; relationship: string; phone: string; email?: string }

export function getEmployeePayslips(employeeId: number) {
  return apiClient<{ data: Payslip[] }>(`/payslips?employee_id=${employeeId}`);
}

export function saveEmployeeEmergencyContacts(employeeId: number, contacts: EmergencyContact[]) {
  const fd = new FormData();
  fd.append("emergency_contacts", JSON.stringify(contacts));
  fd.append("_method", "PUT");
  return apiClient(`/employees/${employeeId}`, { method: "POST", body: fd });
}

export function getEmployeePromotions(employeeId: number) {
  return apiClient<EmployeePromotion[]>(`/employees/${employeeId}/promotions`);
}

export function createEmployeePromotion(employeeId: number, data: Omit<EmployeePromotion, "id">) {
  return apiClient(`/employees/${employeeId}/promotions`, { method: "POST", body: JSON.stringify(data) });
}

export function deleteEmployeePromotion(employeeId: number, promotionId: number) {
  return apiClient(`/employees/${employeeId}/promotions/${promotionId}`, { method: "DELETE" });
}
