import { apiClient, API_BASE_URL } from "./api-client";
import { useAuthStore } from "@/store/auth-store";

export type ReportType = "attendance" | "employee" | "leave" | "payroll" | "custom";
export type ReportStatus = "active" | "inactive";

export interface ReportUser {
  id: number;
  name: string;
  email: string;
}

export type ExportFormat = "csv" | "excel" | "pdf";

export interface ReportSchedule {
  enabled: boolean;
  interval: "daily" | "weekly" | null;
  recipients: string[];
  format: ExportFormat;
  timezone: string;
  next_run_at: string | null;
  last_sent_at: string | null;
}

export interface ReportScheduleUpdate {
  enabled: boolean;
  interval?: "daily" | "weekly";
  recipients?: string[];
  format?: ExportFormat;
  timezone?: string;
}

export interface Report {
  id: number;
  name: string;
  type: ReportType;
  description?: string | null;
  status: ReportStatus;
  filters?: Record<string, unknown> | null;
  schedule?: ReportSchedule;
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

export function updateReportSchedule(id: number, payload: ReportScheduleUpdate) {
  return apiClient<Report>(`/reports/${id}/schedule`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

function parseExportFilename(header: string | null, fallback: string) {
  if (!header) return fallback;
  const match = /filename="?([^";]+)"?/.exec(header);
  return match ? match[1] : fallback;
}

/**
 * Downloads a backend-generated report export (CSV/Excel/PDF) by hitting the
 * same summary endpoint with ?format=, bypassing apiClient's JSON parsing
 * since the response body is a binary/text file, not a JSON envelope.
 */
export async function downloadReportExport(path: string, format: ExportFormat, fallbackFilename: string) {
  const token = useAuthStore.getState().token;
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API_BASE_URL}${path}${separator}format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Unable to export report (${response.status})`);
  }

  const blob = await response.blob();
  const filename = parseExportFilename(response.headers.get("Content-Disposition"), fallbackFilename);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
