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

export function getDashboardSummary() {
  return apiClient<DashboardSummary>("/dashboard/summary");
}
