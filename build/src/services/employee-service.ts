import { apiClient, API_BASE_URL } from "./api-client";
import { useAuthStore } from "@/store/auth-store";

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
  address?: string | null;
  joining_date?: string | null;
  employment_type?: string | null;
  shift?: { id: number; name: string } | null;
  manager?: { id: number; name: string } | null;
  basic_salary?: number | null;
  allowances?: number | null;
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

export function listEmployeesPaginated(page: number, search: string) {
  const params = new URLSearchParams({ page: String(page), per_page: "15" });
  if (search.trim()) params.set("search", search.trim());
  return apiClient<PaginatedResponse<Employee>>(`/employees?${params.toString()}`);
}

export function getActiveEmployees(limit = 10) {
  return apiClient<PaginatedResponse<Employee>>(`/employees?per_page=${limit}&status=active`);
}

export function getEmployeeDirectReports(employeeId: number) {
  return apiClient<PaginatedResponse<Employee>>(`/employees?manager_id=${employeeId}&per_page=50`);
}

export interface EmployeeImportResult { imported: number; skipped: number; errors: string[] }

export async function exportEmployeesCsv(): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE_URL}/employees/export/csv`, {
    headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "text/csv" },
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importEmployeesCsv(file: File): Promise<EmployeeImportResult> {
  const token = useAuthStore.getState().token;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/employees/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "application/json" },
    body: fd,
  });
  const json = (await res.json()) as { success?: boolean; data?: EmployeeImportResult; message?: string };
  if (!res.ok) throw new Error(json.message ?? "Import failed");
  return json.data ?? { imported: 0, skipped: 0, errors: [] };
}

export interface Payslip {
  id: number;
  slip_number: string;
  status: string;
  issue_date: string;
  file_url?: string | null;
  payroll?: { month: number; year: number; net_salary: number | string; base_salary?: number | string | null; bonus?: number | string | null; deductions?: number | string | null; tax?: number | string | null } | null;
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
