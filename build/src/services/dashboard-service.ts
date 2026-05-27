import { apiClient } from "./api-client";

export interface DashboardSummary {
  employees: number;
  active_employees: number;
  attendance_rate: number;
  pending_leaves: number;
  pending_payrolls: number;
  monthly_payroll: number;
  month: number;
  year: number;
}

export interface DashboardTrendPoint {
  date: string;
  label: string;
  rate: number;
}

export interface DashboardSlice {
  label: string;
  value: number;
}

export interface DashboardEmployeeRow {
  id: number;
  employee_number: string;
  name: string;
  status: string;
  department: string;
  joined_at: string | null;
}

export interface DashboardInsights {
  as_of_date: string;
  attendance_trend: DashboardTrendPoint[];
  department_distribution: DashboardSlice[];
  leave_breakdown: DashboardSlice[];
  recent_employees: DashboardEmployeeRow[];
}

export function getDashboardSummary() {
  return apiClient<DashboardSummary>("/dashboard/summary");
}

export function getDashboardInsights() {
  return apiClient<DashboardInsights>("/dashboard/insights");
}
