import { apiClient } from "./api-client";

export type ReportType = "attendance" | "employee" | "leave" | "payroll" | "custom";
export type ReportStatus = "active" | "inactive";

export interface ReportUser {
  id: number;
  name: string;
  email: string;
}

export interface Report {
  id: number;
  name: string;
  type: ReportType;
  description?: string | null;
  status: ReportStatus;
  filters?: Record<string, unknown> | null;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
  creator?: ReportUser | null;
  updater?: ReportUser | null;
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface SaveReportPayload {
  name: string;
  type: ReportType;
  description?: string;
  status: ReportStatus;
  filters?: Record<string, unknown>;
}

export interface ReportCountsItem {
  status: string;
  count?: number;
  total_records?: number;
  total_net_salary?: number;
}

export interface ReportsAnalyticsSummary {
  employees: number;
  active_employees: number;
  attendance_present: number;
  attendance_late: number;
  attendance_absent: number;
  payroll_paid: number;
  payroll_pending: number;
  payroll_total_amount: number;
}

export function getReports(query?: { q?: string; type?: ReportType | ""; status?: ReportStatus | ""; module?: string }) {
  const params = new URLSearchParams();
  params.set("per_page", "50");
  if (query?.q) params.set("q", query.q);
  if (query?.type) params.set("type", query.type);
  if (query?.status) params.set("status", query.status);
  if (query?.module) params.set("module", query.module);
  return apiClient<PaginatedResponse<Report>>(`/reports?${params.toString()}`);
}

export function createReport(payload: SaveReportPayload) {
  return apiClient<Report>("/reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateReport(id: number, payload: SaveReportPayload) {
  return apiClient<Report>(`/reports/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteReport(id: number) {
  return apiClient<null>(`/reports/${id}`, {
    method: "DELETE",
  });
}

export function getEmployeeReportSummary() {
  return apiClient<ReportCountsItem[]>("/reports/employees");
}

export function getAttendanceReportSummary(month: number, year: number) {
  return apiClient<ReportCountsItem[]>(`/reports/attendance?month=${month}&year=${year}`);
}

export function getPayrollReportSummary(month: number, year: number) {
  return apiClient<ReportCountsItem[]>(`/reports/payroll?month=${month}&year=${year}`);
}

export function getLeaveReportSummary(month: number, year: number) {
  return apiClient<ReportCountsItem[]>(`/reports/leave?month=${month}&year=${year}`);
}

export function getReportsAnalytics(month: number, year: number) {
  return apiClient<ReportsAnalyticsSummary>(`/reports/analytics?month=${month}&year=${year}`);
}
