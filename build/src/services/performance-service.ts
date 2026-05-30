import { apiClient } from "@/services/api-client";

export interface PerformanceEmployee {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  employee_code?: string | null;
  employee_number?: string | null;
}

export interface PerformanceReview {
  id: number;
  employee_id: number;
  reviewer_id: number | null;
  period: string;
  rating: number;
  summary: string | null;
  employee?: PerformanceEmployee | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceKpi {
  id: number;
  employee_id: number;
  name: string;
  target_value: string | number;
  current_value: string | number;
  unit: string;
  employee?: PerformanceEmployee | null;
  created_at: string;
  updated_at: string;
}

export type GoalStatus = "not_started" | "in_progress" | "completed" | "on_hold";
export interface PerformanceGoal {
  id: number;
  employee_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  status: GoalStatus;
  progress: number;
  employee?: PerformanceEmployee | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceAppraisal {
  id: number;
  employee_id: number;
  reviewer_id: number | null;
  cycle: string;
  overall_score: number;
  strengths: string | null;
  improvements: string | null;
  employee?: PerformanceEmployee | null;
  created_at: string;
  updated_at: string;
}

export type PerformanceReviewPayload = Omit<PerformanceReview, "id" | "employee" | "created_at" | "updated_at">;
export type PerformanceKpiPayload = Omit<PerformanceKpi, "id" | "employee" | "created_at" | "updated_at">;
export type PerformanceGoalPayload = Omit<PerformanceGoal, "id" | "employee" | "created_at" | "updated_at">;
export type PerformanceAppraisalPayload = Omit<PerformanceAppraisal, "id" | "employee" | "created_at" | "updated_at">;

export function listPerformanceReviews(q = "") {
  const suffix = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiClient<PerformanceReview[]>(`/performance-reviews${suffix}`);
}
export function createPerformanceReview(payload: PerformanceReviewPayload) {
  return apiClient<PerformanceReview>("/performance-reviews", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePerformanceReview(id: number, payload: Partial<PerformanceReviewPayload>) {
  return apiClient<PerformanceReview>(`/performance-reviews/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deletePerformanceReview(id: number) {
  return apiClient<null>(`/performance-reviews/${id}`, { method: "DELETE" });
}

export function listPerformanceKpis(q = "") {
  const suffix = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiClient<PerformanceKpi[]>(`/performance-kpis${suffix}`);
}
export function createPerformanceKpi(payload: PerformanceKpiPayload) {
  return apiClient<PerformanceKpi>("/performance-kpis", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePerformanceKpi(id: number, payload: Partial<PerformanceKpiPayload>) {
  return apiClient<PerformanceKpi>(`/performance-kpis/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deletePerformanceKpi(id: number) {
  return apiClient<null>(`/performance-kpis/${id}`, { method: "DELETE" });
}

export function listPerformanceGoals(q = "", status = "") {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient<PerformanceGoal[]>(`/performance-goals${suffix}`);
}
export function createPerformanceGoal(payload: PerformanceGoalPayload) {
  return apiClient<PerformanceGoal>("/performance-goals", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePerformanceGoal(id: number, payload: Partial<PerformanceGoalPayload>) {
  return apiClient<PerformanceGoal>(`/performance-goals/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deletePerformanceGoal(id: number) {
  return apiClient<null>(`/performance-goals/${id}`, { method: "DELETE" });
}

export function listPerformanceAppraisals(q = "") {
  const suffix = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiClient<PerformanceAppraisal[]>(`/performance-appraisals${suffix}`);
}
export function createPerformanceAppraisal(payload: PerformanceAppraisalPayload) {
  return apiClient<PerformanceAppraisal>("/performance-appraisals", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePerformanceAppraisal(id: number, payload: Partial<PerformanceAppraisalPayload>) {
  return apiClient<PerformanceAppraisal>(`/performance-appraisals/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deletePerformanceAppraisal(id: number) {
  return apiClient<null>(`/performance-appraisals/${id}`, { method: "DELETE" });
}
