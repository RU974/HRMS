import { apiClient } from "./api-client";

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

export function getEmployeesPage(params: { per_page?: number } = {}) {
  const query = new URLSearchParams({ per_page: String(params.per_page ?? 10) });
  return apiClient<PaginatedResponse<Employee>>(`/employees?${query.toString()}`);
}

export function createEmployee(formData: FormData) {
  return apiClient<Employee>("/employees", {
    method: "POST",
    body: formData,
  });
}
