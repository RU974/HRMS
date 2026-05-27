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

export function getReports(query?: { q?: string; type?: ReportType | ""; status?: ReportStatus | "" }) {
  const params = new URLSearchParams();
  params.set("per_page", "50");
  if (query?.q) params.set("q", query.q);
  if (query?.type) params.set("type", query.type);
  if (query?.status) params.set("status", query.status);
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

