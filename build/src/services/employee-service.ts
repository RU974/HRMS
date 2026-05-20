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
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export function getEmployees() {
  return apiClient<PaginatedResponse<Employee>>("/employees?per_page=10");
}
