import { apiClient } from "@/services/api-client";

interface PaginatedResponse<T> {
  data: T[];
}

export type JobStatus = "open" | "closed" | "on_hold";
export type CandidateStage = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";
export type InterviewResult = "pending" | "pass" | "fail" | "hold";
export type OnboardingStatus = "pending" | "in_progress" | "completed" | "deferred";

export interface JobOpening {
  id: number;
  department_id?: number | null;
  title: string;
  employment_type: string;
  location?: string | null;
  description?: string | null;
  status: JobStatus;
  open_positions: number;
  posted_at?: string | null;
  closed_at?: string | null;
  department?: { id: number; name: string } | null;
}

export interface Candidate {
  id: number;
  job_opening_id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  source?: string | null;
  stage: CandidateStage;
  rating?: number | null;
  status: "active" | "inactive";
  applied_at?: string | null;
  notes?: string | null;
  onboarding_status?: OnboardingStatus | null;
  onboarding_start_date?: string | null;
  onboarding_notes?: string | null;
  job_opening?: JobOpening | null;
  jobOpening?: JobOpening | null;
}

export interface Interview {
  id: number;
  candidate_id: number;
  interviewer_name: string;
  interview_type: "screening" | "technical" | "behavioral" | "managerial" | "hr";
  scheduled_at: string;
  result: InterviewResult;
  feedback?: string | null;
  candidate?: Candidate | null;
}

export interface JobOpeningPayload {
  title: string;
  department_id?: number | null;
  employment_type?: string;
  location?: string;
  description?: string;
  status?: JobStatus;
  open_positions?: number;
  posted_at?: string | null;
  closed_at?: string | null;
}

export interface CandidatePayload {
  job_opening_id: number;
  full_name: string;
  email: string;
  phone?: string;
  source?: string;
  stage?: CandidateStage;
  rating?: number | null;
  status?: "active" | "inactive";
  applied_at?: string | null;
  notes?: string;
}

export interface InterviewPayload {
  candidate_id: number;
  interviewer_name: string;
  interview_type?: "screening" | "technical" | "behavioral" | "managerial" | "hr";
  scheduled_at: string;
  result?: InterviewResult;
  feedback?: string;
}

export interface OnboardingPayload {
  candidate_id: number;
  onboarding_status: OnboardingStatus;
  onboarding_start_date?: string | null;
  onboarding_notes?: string;
}

export function listJobOpenings(q = "") {
  const suffix = q ? `?q=${encodeURIComponent(q)}&per_page=100` : "?per_page=100";
  return apiClient<PaginatedResponse<JobOpening>>(`/job-openings${suffix}`);
}

export function createJobOpening(payload: JobOpeningPayload) {
  return apiClient<JobOpening>("/job-openings", { method: "POST", body: JSON.stringify(payload) });
}

export function updateJobOpening(id: number, payload: Partial<JobOpeningPayload>) {
  return apiClient<JobOpening>(`/job-openings/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteJobOpening(id: number) {
  return apiClient<null>(`/job-openings/${id}`, { method: "DELETE" });
}

export function listCandidates(q = "") {
  const suffix = q ? `?q=${encodeURIComponent(q)}&per_page=100` : "?per_page=100";
  return apiClient<PaginatedResponse<Candidate>>(`/candidates${suffix}`);
}

export function createCandidate(payload: CandidatePayload) {
  return apiClient<Candidate>("/candidates", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCandidate(id: number, payload: Partial<CandidatePayload>) {
  return apiClient<Candidate>(`/candidates/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteCandidate(id: number) {
  return apiClient<null>(`/candidates/${id}`, { method: "DELETE" });
}

export function listInterviews(q = "") {
  const suffix = q ? `?q=${encodeURIComponent(q)}&per_page=100` : "?per_page=100";
  return apiClient<PaginatedResponse<Interview>>(`/interviews${suffix}`);
}

export function createInterview(payload: InterviewPayload) {
  return apiClient<Interview>("/interviews", { method: "POST", body: JSON.stringify(payload) });
}

export function updateInterview(id: number, payload: Partial<InterviewPayload>) {
  return apiClient<Interview>(`/interviews/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteInterview(id: number) {
  return apiClient<null>(`/interviews/${id}`, { method: "DELETE" });
}

export function listOnboarding(q = "") {
  const suffix = q ? `?q=${encodeURIComponent(q)}&per_page=100` : "?per_page=100";
  return apiClient<PaginatedResponse<Candidate>>(`/onboarding${suffix}`);
}

export function createOnboarding(payload: OnboardingPayload) {
  return apiClient<Candidate>("/onboarding", { method: "POST", body: JSON.stringify(payload) });
}

export function updateOnboarding(id: number, payload: Partial<Omit<OnboardingPayload, "candidate_id">>) {
  return apiClient<Candidate>(`/onboarding/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteOnboarding(id: number) {
  return apiClient<null>(`/onboarding/${id}`, { method: "DELETE" });
}

export interface RecruitmentPipelineSummaryItem {
  stage: CandidateStage;
  count: number;
}

export function getRecruitmentPipelineSummary() {
  return apiClient<RecruitmentPipelineSummaryItem[]>("/recruitment/pipeline-summary");
}
