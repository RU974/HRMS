import { API_BASE_URL, apiClient } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

const json = (body: unknown) => JSON.stringify(body);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "open" | "closed" | "on_hold" | "pending_approval" | "rejected";
export type TalentPool = "silver_medalist" | "general";
export type DocumentStatus = "requested" | "uploaded" | "verified" | "rejected";
export type CandidateStage = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";
export type InterviewResult = "pending" | "pass" | "fail" | "hold";
export type InterviewStatus = "scheduled" | "completed" | "cancelled";
export type InterviewType = "screening" | "technical" | "behavioral" | "managerial" | "hr";
export type OnboardingStatus = "pending" | "in_progress" | "completed" | "deferred";
export type OfferStatus = "draft" | "pending_approval" | "approved" | "rejected" | "sent" | "accepted" | "declined" | "expired" | "withdrawn";
export type TaskStatus = "pending" | "completed" | "skipped";
export type TaskLinkType = "none" | "inventory" | "document";
export type AssigneeType = "unassigned" | "user" | "hiring_manager" | "recruiter" | "new_hire";
export type Recommendation = "hire" | "no_hire" | "hold";

export interface PersonRef {
  id: number;
  name: string;
}

export interface Person {
  employee_id: number;
  user_id: number;
  name: string;
  email: string;
  designation?: string | null;
  department?: string | null;
}

export interface JobOpening {
  id: number;
  department_id?: number | null;
  title: string;
  employment_type: string;
  location?: string | null;
  description?: string | null;
  requirements?: string | null;
  status: JobStatus;
  open_positions: number;
  posted_at?: string | null;
  closed_at?: string | null;
  hiring_manager_id?: number | null;
  recruiter_id?: number | null;
  salary_min?: string | number | null;
  salary_max?: string | number | null;
  salary_currency?: string | null;
  is_public?: boolean;
  justification?: string | null;
  approval_note?: string | null;
  requested_by?: number | null;
  submitted_at?: string | null;
  estimated_cost?: string | number | null;
  budget_check?: BudgetCheck | null;
  requester?: PersonRef | null;
  candidates_count?: number;
  hired_count?: number;
  department?: { id: number; name: string } | null;
  hiring_manager?: PersonRef | null;
  recruiter?: PersonRef | null;
  required_checks?: CheckType[] | null;
  auto_reject_knockouts?: boolean;
  referral_bonus_amount?: string | number | null;
}

export interface ConvertedEmployee {
  id: number;
  name: string;
  email: string;
  designation?: string | null;
  department_id?: number | null;
  status: "active" | "inactive";
}

export interface StageHistory {
  id: number;
  from_stage: CandidateStage | null;
  to_stage: CandidateStage;
  reason?: string | null;
  /** Stage names as they were at the time (custom stages can be renamed later). */
  from_label?: string | null;
  to_label?: string | null;
  created_at: string;
  changed_by?: PersonRef | null;
}

export interface CandidateNote {
  id: number;
  body: string;
  user_id?: number | null;
  created_at: string;
  author?: PersonRef | null;
}

export interface Scorecard {
  id: number;
  interview_id: number;
  submitted_by: number;
  rating: number;
  recommendation: Recommendation;
  strengths?: string | null;
  concerns?: string | null;
  created_at: string;
  submitter?: PersonRef | null;
}

export interface Interview {
  id: number;
  candidate_id: number;
  interviewer_id?: number | null;
  interviewer_name: string;
  interview_type: InterviewType;
  scheduled_at: string;
  duration_minutes: number;
  location?: string | null;
  meeting_link?: string | null;
  status: InterviewStatus;
  cancel_reason?: string | null;
  result: InterviewResult;
  feedback?: string | null;
  // Recruiters get the full candidate; interviewers get a trimmed copy with job_title.
  candidate?: (Partial<Candidate> & { id?: number; full_name?: string | null; job_title?: string | null }) | null;
  interviewer?: { id: number; name: string; user_id: number } | null;
  scorecards?: Scorecard[];
  my_scorecard?: Scorecard | null;
  pending_reschedule_count?: number;
}

export interface Offer {
  id: number;
  candidate_id: number;
  salary: string;
  currency: string;
  start_date?: string | null;
  expires_at?: string | null;
  benefits?: string[] | null;
  terms?: string | null;
  additional_notes?: string | null;
  status: OfferStatus;
  approval_id?: number | null;
  approval_note?: string | null;
  sent_at?: string | null;
  responded_at?: string | null;
  decline_reason?: string | null;
  responded_via?: "portal" | "staff" | null;
  response_name?: string | null;
  signature_record?: SignatureRecord | null;
  candidate_emailed?: boolean;
  created_at: string;
  creator?: PersonRef | null;
  candidate?: {
    id: number;
    full_name: string;
    email: string;
    stage: CandidateStage;
    job_opening?: { id: number; title: string } | null;
  } | null;
}

export type PoolConsent = "unconfirmed" | "pending" | "granted" | "declined";

export interface FitBreakdown {
  reason?: "no_resume" | "no_requirements";
  matched_skills?: string[];
  missing_skills?: string[];
  required_years?: number | null;
  candidate_years?: number | null;
  skills_match?: number | null;
  experience_match?: number | null;
}

export interface SignatureRecord {
  name: string;
  email?: string | null;
  signed_at: string;
  ip?: string | null;
  user_agent?: string | null;
  document_hash: string;
  consent: string;
  verification: string;
  /** Fingerprint of the stored signed letter, and the server's seal over the whole record. */
  pdf_hash?: string;
  seal?: string;
}

export interface SignatureVerification {
  signed: boolean;
  valid: boolean;
  seal_valid: boolean;
  terms_unchanged: boolean;
  letter_intact: boolean;
  problems: string[];
}

export const verifyOfferSignature = (id: number) => apiClient<SignatureVerification>(`/offers/${id}/signature-verification`);

export interface BudgetCheck {
  fiscal_year: number;
  department_id?: number | null;
  /** The company's base currency: every amount below is in it. */
  currency: string;
  /** Currencies on jobs or offers that have no exchange rate, so their cost could not be counted. */
  unconverted_currencies: string[];
  requested_headcount: number;
  estimated_cost: number;
  has_budget: boolean;
  approved_headcount: number | null;
  approved_budget: number | null;
  used_headcount: number | null;
  used_cost: number | null;
  over_headcount: boolean;
  over_budget: boolean;
  high_cost: boolean;
  cost_threshold: number | null;
  requires_executive: boolean;
}

export interface RescheduleRequest {
  id: number;
  interview_id: number;
  candidate_id: number;
  note?: string | null;
  proposed_times?: string[] | null;
  status: "pending" | "resolved" | "declined";
  resolution_note?: string | null;
  created_at: string;
  interview?: Interview | null;
}

export interface CandidateMessage {
  id: number;
  direction: "candidate" | "staff";
  body: string;
  read_at?: string | null;
  created_at: string;
  author?: PersonRef | null;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
}

export interface DuplicateApplication {
  id: number;
  full_name: string;
  email: string;
  stage: CandidateStage;
  status: "active" | "inactive";
  applied_at?: string | null;
  job_opening_id: number;
  job_title?: string | null;
  talent_pool?: TalentPool | null;
  matched_on: "email" | "phone";
}

export interface CandidateDocument {
  id: number;
  candidate_id: number;
  label: string;
  status: DocumentStatus;
  original_name?: string | null;
  mime_type?: string | null;
  size?: number | null;
  has_file: boolean;
  uploaded_by_type?: "candidate" | "staff" | null;
  uploaded_at?: string | null;
  review_note?: string | null;
  requester?: PersonRef | null;
  reviewer?: PersonRef | null;
}

export interface Candidate {
  id: number;
  job_opening_id: number;
  employee_id?: number | null;
  full_name: string;
  email: string;
  phone?: string | null;
  source?: string | null;
  stage: CandidateStage;
  rating?: number | null;
  status: "active" | "inactive";
  applied_at?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  skills?: string[] | null;
  experience_years?: number | null;
  talent_pool?: TalentPool | null;
  talent_pool_note?: string | null;
  talent_pool_added_at?: string | null;
  talent_pool_expires_at?: string | null;
  pool_consent?: PoolConsent | null;
  pool_consent_requested_at?: string | null;
  fit_score?: number | null;
  fit_breakdown?: FitBreakdown | null;
  resume_review_reason?: "no_text_layer" | "little_text" | "unreadable" | "no_details" | "name_unclear" | null;
  merged_from?: Array<{ id: number; full_name: string; job_title?: string | null; stage: CandidateStage; merged_at: string }> | null;
  withdrawn_at?: string | null;
  anonymized_at?: string | null;
  pending_reschedule_requests?: RescheduleRequest[];
  unread_messages?: number;
  duplicate_count?: number;
  duplicates?: DuplicateApplication[];
  resume_snippet?: string | null;
  documents?: CandidateDocument[];
  rejection_reason?: string | null;
  has_resume?: boolean;
  resume_original_name?: string | null;
  onboarding_status?: OnboardingStatus | null;
  onboarding_start_date?: string | null;
  onboarding_notes?: string | null;
  score?: number | null;
  tasks_total?: number;
  tasks_done?: number;
  job_opening?: JobOpening | null;
  employee?: ConvertedEmployee | null;
  interviews?: Interview[];
  stage_histories?: StageHistory[];
  candidate_notes?: CandidateNote[];
  offers?: Offer[];
  onboarding_tasks?: OnboardingTask[];
  pipeline_stage_id?: number | null;
  source_type?: SourceType | null;
  referrer_employee_id?: number | null;
  agency_id?: number | null;
  knockout_failed?: boolean;
  /** The stages this candidate moves through, and where they are. Present on the detail response. */
  pipeline?: CandidatePipeline;
  answers?: CandidateAnswer[];
  checks?: CandidateCheckItem[];
  check_summary?: CheckSummary;
  referrer?: { id: number; name: string; email?: string } | null;
  agency?: Agency | null;
  referral_bonus?: ReferralBonusItem | null;
}

export interface OnboardingTask {
  id: number;
  candidate_id: number;
  title: string;
  description?: string | null;
  assignee_id?: number | null;
  due_date?: string | null;
  status: TaskStatus;
  completed_at?: string | null;
  link_type: TaskLinkType;
  assignee?: PersonRef | null;
  candidate?: { id: number; full_name: string; employee_id?: number | null } | null;
}

export interface TemplateTask {
  id?: number;
  title: string;
  description?: string | null;
  assignee_type: AssigneeType;
  assignee_user_id?: number | null;
  due_offset_days: number;
  link_type: TaskLinkType;
  assignee?: PersonRef | null;
}

export interface OnboardingTemplate {
  id: number;
  name: string;
  description?: string | null;
  is_default: boolean;
  tasks: TemplateTask[];
}

export interface BoardStage {
  stage: CandidateStage;
  /** Set for custom pipeline columns; several columns can share one stage category. */
  pipeline_stage_id?: number | null;
  name?: string;
  count: number;
  candidates: Array<{
    id: number;
    full_name: string;
    email: string;
    stage: CandidateStage;
    status: "active" | "inactive";
    rating?: number | null;
    fit_score?: number | null;
    source?: string | null;
    tags: string[];
    applied_at?: string | null;
    has_resume: boolean;
    job_opening_id: number;
    job_title?: string | null;
    knockout_failed?: boolean;
  }>;
}

export interface CandidateListParams {
  q?: string;
  page?: number;
  per_page?: number;
  stage?: CandidateStage | "";
  status?: "active" | "inactive" | "";
  source?: string;
  tag?: string;
  job_opening_id?: number | "";
  resume_q?: string;
  skill?: string;
  min_experience?: number | "";
  talent_pool?: TalentPool | "any" | "none" | "";
  duplicates?: boolean;
  min_fit?: number | "";
  sort?: "fit" | "";
  source_type?: SourceType | "";
  agency_id?: number | "";
  knockout_failed?: boolean;
}

export interface CandidateStats {
  total: number;
  active: number;
  hired: number;
  interview: number;
  offer: number;
  rejected: number;
}

export interface RecruitmentPipelineSummaryItem {
  stage: CandidateStage;
  count: number;
}

export interface RecruitmentOverview {
  open_jobs: number;
  active_candidates: number;
  interviews_this_week: number;
  offers_pending: number;
  pipeline: RecruitmentPipelineSummaryItem[];
  attention: {
    scorecards_overdue: number;
    offers_awaiting_approval: number;
    offers_expiring_soon: number;
    onboarding_tasks_due: number;
  };
}

export interface RecruitmentAnalytics {
  range: { from: string; to: string };
  total_candidates: number;
  funnel: Array<{ stage: CandidateStage; count: number; conversion_from_previous: number | null }>;
  time_to_hire: { hires: number; average_days: number | null; fastest_days: number | null; slowest_days: number | null };
  sources: Array<{ source: string; candidates: number; hired: number; hire_rate: number }>;
  rejection_reasons: Array<{ reason: string; count: number }>;
  offers: { total: number; sent: number; accepted: number; declined: number; expired: number; acceptance_rate: number | null };
  jobs: Array<{ id: number; title: string; status: JobStatus; open_positions: number; candidates: number; hired: number }>;
}

export interface CareersSettings {
  slug: string | null;
  enabled: boolean;
  intro: string | null;
  path: string | null;
  requisition_approval_required: boolean;
  email_delivery: boolean;
  requisition_cost_threshold: number | null;
  talent_pool_retention_months: number | null;
  candidate_retention_months: number | null;
  referral_bonus_amount: number | null;
  referral_bonus_wait_days: number;
}

export interface HireResult {
  candidate: Candidate;
  employee: ConvertedEmployee;
  temp_password: string | null;
}

// Stages a candidate can be moved to from the given stage. "hired" is reached only through hireCandidate().
export const candidateStageOptions: Record<CandidateStage, CandidateStage[]> = {
  applied: ["applied", "screening", "rejected"],
  screening: ["screening", "interview", "rejected"],
  interview: ["interview", "offer", "rejected"],
  offer: ["offer", "rejected"],
  hired: ["hired"],
  rejected: ["rejected", "applied", "screening"],
};

export const candidateStageLabels: Record<CandidateStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobOpeningPayload {
  title: string;
  department_id?: number | null;
  employment_type?: string;
  location?: string | null;
  description?: string | null;
  requirements?: string | null;
  status?: JobStatus;
  open_positions?: number;
  posted_at?: string | null;
  closed_at?: string | null;
  hiring_manager_id?: number | null;
  recruiter_id?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  is_public?: boolean;
  justification?: string | null;
  required_checks?: CheckType[];
  auto_reject_knockouts?: boolean;
  referral_bonus_amount?: number | null;
}

export function listJobOpenings(q = "") {
  return apiClient<PaginatedResponse<JobOpening>>(`/job-openings${buildQuery({ q, per_page: 100 })}`);
}

export const createJobOpening = (payload: JobOpeningPayload) =>
  apiClient<JobOpening>("/job-openings", { method: "POST", body: json(payload) });

export const updateJobOpening = (id: number, payload: Partial<JobOpeningPayload>) =>
  apiClient<JobOpening>(`/job-openings/${id}`, { method: "PUT", body: json(payload) });

export const deleteJobOpening = (id: number) => apiClient<null>(`/job-openings/${id}`, { method: "DELETE" });

// Job requisitions: a role is requested, approved by an HR Manager / Company Admin, then goes live.
export const submitJobRequisition = (id: number) => apiClient<JobOpening>(`/job-openings/${id}/submit`, { method: "POST" });
export const approveJobRequisition = (id: number, notes?: string) =>
  apiClient<JobOpening>(`/job-openings/${id}/approve`, { method: "POST", body: json({ notes: notes || undefined }) });
export const rejectJobRequisition = (id: number, notes: string) =>
  apiClient<JobOpening>(`/job-openings/${id}/reject`, { method: "POST", body: json({ notes }) });

export const listRequisitionDepartments = () => apiClient<Array<{ id: number; name: string }>>("/requisitions/departments");
export const listMyRequisitions = () => apiClient<PaginatedResponse<JobOpening>>(`/requisitions${buildQuery({ per_page: 50 })}`);
export const createRequisition = (payload: JobOpeningPayload) =>
  apiClient<JobOpening>("/requisitions", { method: "POST", body: json(payload) });
export const updateRequisition = (id: number, payload: Partial<JobOpeningPayload>) =>
  apiClient<JobOpening>(`/requisitions/${id}`, { method: "PUT", body: json(payload) });
export const resubmitRequisition = (id: number) => apiClient<JobOpening>(`/requisitions/${id}/submit`, { method: "POST" });
export const withdrawRequisition = (id: number) => apiClient<JobOpening>(`/requisitions/${id}/withdraw`, { method: "POST" });

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface CandidatePayload {
  job_opening_id: number;
  full_name: string;
  email: string;
  phone?: string;
  source?: string;
  stage?: CandidateStage;
  rejection_reason?: string;
  rating?: number | null;
  status?: "active" | "inactive";
  applied_at?: string | null;
  notes?: string;
  tags?: string[];
  source_type?: SourceType | null;
  referrer_employee_id?: number | null;
  agency_id?: number | null;
}

export const listCandidates = (params: CandidateListParams = {}) =>
  apiClient<PaginatedResponse<Candidate>>(`/candidates${buildQuery({ per_page: 15, ...params })}`);

export const getCandidate = (id: number) => apiClient<Candidate>(`/candidates/${id}`);

export const getCandidateStats = (jobOpeningId?: number | "") =>
  apiClient<CandidateStats>(`/recruitment/stats${buildQuery({ job_opening_id: jobOpeningId })}`);

export const getCandidateBoard = (params: Omit<CandidateListParams, "page" | "per_page" | "stage"> = {}) =>
  apiClient<{ stages: BoardStage[]; limit: number }>(`/recruitment/board${buildQuery(params)}`);

export const createCandidate = (payload: CandidatePayload) =>
  apiClient<Candidate>("/candidates", { method: "POST", body: json(payload) });

export const updateCandidate = (id: number, payload: Partial<CandidatePayload>) =>
  apiClient<Candidate>(`/candidates/${id}`, { method: "PUT", body: json(payload) });

export const deleteCandidate = (id: number) => apiClient<null>(`/candidates/${id}`, { method: "DELETE" });

export const changeCandidateStage = (id: number, stage: CandidateStage, reason?: string, talentPool?: TalentPool, pipelineStageId?: number | null) =>
  apiClient<Candidate>(`/candidates/${id}/stage`, {
    method: "PATCH",
    body: json({ stage, pipeline_stage_id: pipelineStageId || undefined, reason: reason || undefined, talent_pool: talentPool || undefined }),
  });

/** Move to a specific stage of the job's pipeline (the stage's category is worked out by the server). */
export const moveCandidateToPipelineStage = (id: number, pipelineStageId: number, reason?: string) =>
  apiClient<Candidate>(`/candidates/${id}/stage`, { method: "PATCH", body: json({ pipeline_stage_id: pipelineStageId, reason: reason || undefined }) });

export interface HirePayload {
  salary?: number;
  joining_date?: string | null;
  template_id?: number | null;
  skip_offer?: boolean;
}

export const hireCandidate = (id: number, payload: HirePayload) =>
  apiClient<HireResult>(`/candidates/${id}/hire`, { method: "POST", body: json(payload) });

export function uploadCandidateResume(id: number, file: File) {
  const body = new FormData();
  body.append("resume", file);
  return apiClient<Candidate>(`/candidates/${id}/resume`, { method: "POST", body });
}

export const deleteCandidateResume = (id: number) => apiClient<Candidate>(`/candidates/${id}/resume`, { method: "DELETE" });

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number | null;
}

/** Read a CV without storing it, to prefill the add-candidate form. */
export function parseResumeFile(file: File) {
  const body = new FormData();
  body.append("resume", file);
  return apiClient<ParsedResume>("/recruitment/resume-parse", { method: "POST", body });
}

export const reparseCandidateResume = (id: number) => apiClient<Candidate>(`/candidates/${id}/resume/parse`, { method: "POST" });

// Candidate portal link, talent pool, documents

export interface PortalLink {
  token: string;
  path: string;
  url: string;
  expires_at: string;
}

export const createPortalLink = (id: number) => apiClient<PortalLink>(`/candidates/${id}/portal-link`, { method: "POST" });

export const addToTalentPool = (id: number, pool: TalentPool, note?: string) =>
  apiClient<Candidate>(`/candidates/${id}/talent-pool`, { method: "POST", body: json({ pool, note: note || undefined }) });

export const removeFromTalentPool = (id: number) => apiClient<Candidate>(`/candidates/${id}/talent-pool`, { method: "DELETE" });

export const considerForJob = (id: number, jobOpeningId: number) =>
  apiClient<Candidate>(`/candidates/${id}/consider`, { method: "POST", body: json({ job_opening_id: jobOpeningId }) });

export const requestCandidateDocuments = (id: number, labels: string[], notify = true) =>
  apiClient<{ documents: CandidateDocument[]; created: number; emailed: boolean }>(`/candidates/${id}/documents/request`, {
    method: "POST",
    body: json({ labels, notify }),
  });

export function uploadCandidateDocument(id: number, file: File, options: { label?: string; documentId?: number } = {}) {
  const body = new FormData();
  body.append("file", file);
  if (options.label) body.append("label", options.label);
  if (options.documentId) body.append("document_id", String(options.documentId));
  return apiClient<CandidateDocument>(`/candidates/${id}/documents`, { method: "POST", body });
}

export const reviewCandidateDocument = (id: number, documentId: number, status: "verified" | "rejected", note?: string) =>
  apiClient<CandidateDocument>(`/candidates/${id}/documents/${documentId}/review`, {
    method: "POST",
    body: json({ status, note: note || undefined }),
  });

export const deleteCandidateDocument = (id: number, documentId: number) =>
  apiClient<null>(`/candidates/${id}/documents/${documentId}`, { method: "DELETE" });

export const candidateDocumentPath = (id: number, documentId: number) => `/candidates/${id}/documents/${documentId}/download`;

// Bulk actions and CSV import

export type BulkAction = "move" | "reject" | "tag" | "untag" | "talent_pool" | "remove_from_pool" | "email";

/** Everything matching a filter, wherever it is in the list, minus the people who were unticked. */
export interface SelectAllScope {
  filters: CandidateFilterParams;
  exclude_ids: number[];
}

export interface BulkPayload {
  ids?: number[];
  select_all?: SelectAllScope;
  action: BulkAction;
  stage?: CandidateStage;
  reason?: string;
  tags?: string[];
  pool?: TalentPool;
  talent_pool?: TalentPool;
  note?: string;
  subject?: string;
  body?: string;
}

export interface BulkFailure {
  id: number;
  name: string | null;
  reason: string;
}

export interface BulkResult {
  action: BulkAction;
  requested: number;
  succeeded: number[];
  failed: BulkFailure[];
  run?: null;
}

/** A large filter-wide action: it finishes after the response and is followed by polling. */
export interface BulkRun {
  id: number;
  action: BulkAction;
  status: "queued" | "running" | "done" | "failed";
  total: number;
  processed: number;
  succeeded: number;
  failed_count: number;
  failed: BulkFailure[];
  finished_at?: string | null;
}

export const bulkCandidateAction = (payload: BulkPayload) =>
  apiClient<BulkResult | { run: BulkRun }>("/candidates/bulk", { method: "POST", body: json(payload) });

export const getBulkRun = (id: number) => apiClient<BulkRun>(`/candidates/bulk-runs/${id}`);

/** The filters the list sends, in the shape the bulk endpoint accepts. */
export type CandidateFilterParams = Pick<
  CandidateListParams,
  "q" | "stage" | "status" | "source" | "tag" | "job_opening_id" | "resume_q" | "skill" | "min_experience" | "talent_pool" | "duplicates" | "min_fit"
>;

export function toFilterParams(params: CandidateListParams): CandidateFilterParams {
  const keys: Array<keyof CandidateFilterParams> = ["q", "stage", "status", "source", "tag", "job_opening_id", "resume_q", "skill", "min_experience", "talent_pool", "duplicates", "min_fit"];
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "" && value !== false) result[key] = value;
  });
  return result as CandidateFilterParams;
}

export interface ImportRow {
  row: number;
  full_name: string | null;
  email: string | null;
  status: "created" | "skipped" | "error";
  message: string | null;
}

export interface ImportResult {
  dry_run: boolean;
  total: number;
  created: number;
  skipped: number;
  warnings: number;
  rows: ImportRow[];
}

export function importCandidatesCsv(jobOpeningId: number, file: File, dryRun: boolean) {
  const body = new FormData();
  body.append("file", file);
  body.append("job_opening_id", String(jobOpeningId));
  body.append("dry_run", dryRun ? "1" : "0");
  return apiClient<ImportResult>("/candidates/import", { method: "POST", body });
}

export const csvImportTemplate =
  "full_name,email,phone,source,tags,skills,experience_years,rating,notes\nAmna Khan,amna@example.com,0300 1234567,Referral,remote;senior,\"PHP, Laravel\",5,4,Met at a job fair\n";

export const addCandidateNote = (id: number, body: string) =>
  apiClient<CandidateNote>(`/candidates/${id}/notes`, { method: "POST", body: json({ body }) });

export const deleteCandidateNote = (id: number, noteId: number) =>
  apiClient<null>(`/candidates/${id}/notes/${noteId}`, { method: "DELETE" });

/** Fetch an authenticated file (resume, offer PDF) as a blob. */
export async function fetchRecruitmentFile(path: string): Promise<Blob> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? `Download failed (${response.status})`);
  }

  return response.blob();
}

export const candidateResumePath = (id: number, download = false) => `/candidates/${id}/resume${download ? "?download=1" : ""}`;
export const offerPdfPath = (id: number) => `/offers/${id}/pdf`;

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export interface InterviewPayload {
  candidate_id: number;
  interviewer_id?: number | null;
  interviewer_name?: string;
  interview_type?: InterviewType;
  scheduled_at: string;
  duration_minutes?: number;
  location?: string;
  meeting_link?: string;
  result?: InterviewResult;
  feedback?: string;
}

export interface InterviewListParams {
  q?: string;
  from?: string;
  to?: string;
  mine?: boolean;
  status?: InterviewStatus | "";
  candidate_id?: number;
  per_page?: number;
}

export const listInterviews = (params: InterviewListParams = {}) =>
  apiClient<PaginatedResponse<Interview>>(`/interviews${buildQuery({ per_page: 100, ...params })}`);

export const createInterview = (payload: InterviewPayload) =>
  apiClient<Interview>("/interviews", { method: "POST", body: json(payload) });

export const updateInterview = (id: number, payload: Partial<Omit<InterviewPayload, "candidate_id">>) =>
  apiClient<Interview>(`/interviews/${id}`, { method: "PUT", body: json(payload) });

export const cancelInterview = (id: number, reason?: string) =>
  apiClient<Interview>(`/interviews/${id}/cancel`, { method: "POST", body: json({ reason: reason || undefined }) });

export const deleteInterview = (id: number) => apiClient<null>(`/interviews/${id}`, { method: "DELETE" });

export interface ScorecardPayload {
  rating: number;
  recommendation: Recommendation;
  strengths?: string;
  concerns?: string;
}

export const submitScorecard = (id: number, payload: ScorecardPayload) =>
  apiClient<Scorecard>(`/interviews/${id}/scorecard`, { method: "POST", body: json(payload) });

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export interface OfferPayload {
  candidate_id?: number;
  salary: number;
  currency?: string;
  start_date?: string | null;
  expires_at?: string | null;
  benefits?: string[];
  terms?: string | null;
  additional_notes?: string | null;
}

export const listOffers = (params: { status?: OfferStatus | ""; q?: string; candidate_id?: number; page?: number; per_page?: number } = {}) =>
  apiClient<PaginatedResponse<Offer>>(`/offers${buildQuery({ per_page: 15, ...params })}`);

export const createOffer = (payload: OfferPayload) => apiClient<Offer>("/offers", { method: "POST", body: json(payload) });

export const updateOffer = (id: number, payload: Partial<OfferPayload>) =>
  apiClient<Offer>(`/offers/${id}`, { method: "PUT", body: json(payload) });

export const deleteOffer = (id: number) => apiClient<null>(`/offers/${id}`, { method: "DELETE" });

export const submitOffer = (id: number) => apiClient<Offer>(`/offers/${id}/submit`, { method: "POST" });
export const approveOffer = (id: number, notes?: string) =>
  apiClient<Offer>(`/offers/${id}/approve`, { method: "POST", body: json({ notes: notes || undefined }) });
export const rejectOffer = (id: number, notes: string) =>
  apiClient<Offer>(`/offers/${id}/reject`, { method: "POST", body: json({ notes }) });
export const sendOffer = (id: number) => apiClient<Offer>(`/offers/${id}/send`, { method: "POST" });
// Candidates normally answer through their portal; this records an answer given by phone or on paper.
export const respondToOffer = (id: number, response: "accepted" | "declined", reason?: string) =>
  apiClient<Offer>(`/offers/${id}/respond`, { method: "POST", body: json({ response, reason: reason || undefined }) });
export const withdrawOffer = (id: number) => apiClient<Offer>(`/offers/${id}/withdraw`, { method: "POST" });

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingPayload {
  candidate_id: number;
  onboarding_status: OnboardingStatus;
  onboarding_start_date?: string | null;
  onboarding_notes?: string;
}

export const listOnboarding = (q = "") =>
  apiClient<PaginatedResponse<Candidate>>(`/onboarding${buildQuery({ q, per_page: 100 })}`);

export const getOnboarding = (id: number) => apiClient<Candidate>(`/onboarding/${id}`);

export const createOnboarding = (payload: OnboardingPayload) =>
  apiClient<Candidate>("/onboarding", { method: "POST", body: json(payload) });

export const updateOnboarding = (id: number, payload: Partial<Omit<OnboardingPayload, "candidate_id">>) =>
  apiClient<Candidate>(`/onboarding/${id}`, { method: "PUT", body: json(payload) });

export const listOnboardingTasks = (params: { candidate_id?: number; mine?: boolean; status?: TaskStatus | "" } = {}) =>
  apiClient<PaginatedResponse<OnboardingTask>>(`/onboarding-tasks${buildQuery({ per_page: 200, ...params })}`);

export interface TaskPayload {
  candidate_id?: number;
  title: string;
  description?: string | null;
  assignee_id?: number | null;
  due_date?: string | null;
  link_type?: TaskLinkType;
}

export const createOnboardingTask = (payload: TaskPayload) =>
  apiClient<OnboardingTask>("/onboarding-tasks", { method: "POST", body: json(payload) });

export const updateOnboardingTask = (id: number, payload: Partial<Omit<TaskPayload, "candidate_id">>) =>
  apiClient<OnboardingTask>(`/onboarding-tasks/${id}`, { method: "PUT", body: json(payload) });

export const setOnboardingTaskStatus = (id: number, status: "completed" | "skipped" | "pending") =>
  status === "pending"
    ? apiClient<OnboardingTask>(`/onboarding-tasks/${id}/reopen`, { method: "POST" })
    : apiClient<OnboardingTask>(`/onboarding-tasks/${id}/complete`, { method: "POST", body: json({ status }) });

export const deleteOnboardingTask = (id: number) => apiClient<null>(`/onboarding-tasks/${id}`, { method: "DELETE" });

export interface TemplatePayload {
  name: string;
  description?: string | null;
  is_default?: boolean;
  tasks: Array<Omit<TemplateTask, "id" | "assignee">>;
}

export const listOnboardingTemplates = () => apiClient<OnboardingTemplate[]>("/onboarding-templates");
export const createOnboardingTemplate = (payload: TemplatePayload) =>
  apiClient<OnboardingTemplate>("/onboarding-templates", { method: "POST", body: json(payload) });
export const updateOnboardingTemplate = (id: number, payload: Partial<TemplatePayload>) =>
  apiClient<OnboardingTemplate>(`/onboarding-templates/${id}`, { method: "PUT", body: json(payload) });
export const deleteOnboardingTemplate = (id: number) => apiClient<null>(`/onboarding-templates/${id}`, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Overview, reports, settings, directory
// ---------------------------------------------------------------------------

export const getRecruitmentPipelineSummary = (jobOpeningId?: number | "") =>
  apiClient<RecruitmentPipelineSummaryItem[]>(`/recruitment/pipeline-summary${buildQuery({ job_opening_id: jobOpeningId })}`);

export const getRecruitmentOverview = () => apiClient<RecruitmentOverview>("/recruitment/overview");

export const getRecruitmentAnalytics = (params: { from?: string; to?: string; job_opening_id?: number | "" } = {}) =>
  apiClient<RecruitmentAnalytics>(`/recruitment/analytics${buildQuery(params)}`);

export const getCareersSettings = () => apiClient<CareersSettings>("/recruitment/careers-settings");

export const updateCareersSettings = (
  payload: Partial<{
    slug: string | null;
    enabled: boolean;
    intro: string | null;
    requisition_approval_required: boolean;
    requisition_cost_threshold: number | null;
    talent_pool_retention_months: number | null;
    candidate_retention_months: number | null;
    referral_bonus_amount: number | null;
    referral_bonus_wait_days: number;
  }>
) =>
  apiClient<CareersSettings>("/recruitment/careers-settings", { method: "PUT", body: json(payload) });

export const listRecruitmentPeople = (q = "") => apiClient<Person[]>(`/recruitment/people${buildQuery({ q, limit: 50 })}`);

// ---------------------------------------------------------------------------
// Public careers site (no authentication)
// ---------------------------------------------------------------------------

export interface PublicJob {
  id: number;
  title: string;
  department?: string | null;
  location?: string | null;
  employment_type: string;
  posted_at?: string | null;
  salary_min?: string | number | null;
  salary_max?: string | number | null;
  salary_currency?: string | null;
  description?: string | null;
  requirements?: string | null;
  questions?: PublicQuestion[];
}

export const getPublicCareers = (slug: string) =>
  apiClient<{ company: { name: string; logo_url?: string | null; intro?: string | null }; jobs: PublicJob[] }>(
    `/public/careers/${encodeURIComponent(slug)}`,
    { auth: false }
  );

export const getPublicJob = (slug: string, jobId: number) =>
  apiClient<{ company: { name: string; logo_url?: string | null }; job: PublicJob }>(
    `/public/careers/${encodeURIComponent(slug)}/jobs/${jobId}`,
    { auth: false }
  );

export const applyToPublicJob = (slug: string, jobId: number, form: FormData) =>
  apiClient<{ portal_path?: string } | null>(`/public/careers/${encodeURIComponent(slug)}/jobs/${jobId}/apply`, { method: "POST", body: form, auth: false });

// ---------------------------------------------------------------------------
// Public candidate portal (no authentication; the secret token identifies the candidate)
// ---------------------------------------------------------------------------

export interface PortalOffer {
  id: number;
  status: "sent" | "accepted" | "declined" | "expired";
  salary: string;
  currency: string;
  start_date?: string | null;
  expires_at?: string | null;
  benefits: string[];
  terms?: string | null;
  additional_notes?: string | null;
  sent_at?: string | null;
  responded_at?: string | null;
  can_respond: boolean;
  signature?: { name?: string | null; signed_at?: string | null; document_hash?: string | null } | null;
  consent_statement?: string;
}

export interface PortalMessage {
  id: number;
  from: "you" | "team";
  author?: string | null;
  body: string;
  at?: string | null;
}

export interface PortalView {
  company: { name?: string | null; logo_url?: string | null };
  candidate: { full_name: string; email: string };
  job: { title?: string | null; department?: string | null; location?: string | null };
  applied_at?: string | null;
  status: { key: string; label: string; message: string };
  timeline: Array<{ status: string; label: string; at?: string | null }>;
  interviews: Array<{ id: number; reschedule_requested: boolean; type: string; scheduled_at: string; duration_minutes?: number | null; location?: string | null; meeting_link?: string | null }>;
  offer: PortalOffer | null;
  documents: Array<{ id: number; label: string; status: DocumentStatus; original_name?: string | null; uploaded_at?: string | null; review_note?: string | null; has_file: boolean }>;
  can_upload: boolean;
  can_withdraw: boolean;
  can_message: boolean;
  messages: PortalMessage[];
  unread_messages: number;
  talent_pool: { status: PoolConsent; can_respond: boolean; expires_at?: string | null } | null;
}

const portalPath = (token: string) => `/public/portal/${encodeURIComponent(token)}`;

export const getPortal = (token: string) => apiClient<PortalView>(portalPath(token), { auth: false });

export const sendPortalSigningCode = (token: string) =>
  apiClient<{ email: string }>(`${portalPath(token)}/offer/code`, { method: "POST", auth: false });

export const respondToPortalOffer = (
  token: string,
  response: "accepted" | "declined",
  options: { name?: string; reason?: string; code?: string; consent?: boolean } = {}
) =>
  apiClient<PortalOffer>(`${portalPath(token)}/offer`, {
    method: "POST",
    body: json({ response, name: options.name || undefined, reason: options.reason || undefined, code: options.code || undefined, consent: options.consent }),
    auth: false,
  });

export const requestPortalReschedule = (token: string, interviewId: number, note: string, proposedTimes: string[]) =>
  apiClient<null>(`${portalPath(token)}/interviews/${interviewId}/reschedule`, {
    method: "POST",
    body: json({ note: note || undefined, proposed_times: proposedTimes.length ? proposedTimes : undefined }),
    auth: false,
  });

export const withdrawPortalApplication = (token: string, reason?: string) =>
  apiClient<PortalView>(`${portalPath(token)}/withdraw`, { method: "POST", body: json({ reason: reason || undefined }), auth: false });

export const sendPortalMessage = (token: string, body: string) =>
  apiClient<PortalView>(`${portalPath(token)}/messages`, { method: "POST", body: json({ body }), auth: false });

export const answerPortalTalentPool = (token: string, consent: boolean) =>
  apiClient<PortalView>(`${portalPath(token)}/talent-pool`, { method: "POST", body: json({ consent }), auth: false });

export const erasePortalData = (token: string) =>
  apiClient<null>(`${portalPath(token)}/erase`, { method: "POST", body: json({ confirm: true }), auth: false });

export function uploadPortalDocument(token: string, file: File, options: { label?: string; documentId?: number } = {}) {
  const body = new FormData();
  body.append("file", file);
  if (options.label) body.append("label", options.label);
  if (options.documentId) body.append("document_id", String(options.documentId));
  return apiClient<{ id: number; label: string; status: DocumentStatus }>(`${portalPath(token)}/documents`, { method: "POST", body, auth: false });
}

/** Public files need no bearer token: the portal token in the URL is the credential. */
export async function fetchPortalFile(token: string, path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${portalPath(token)}${path}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Download failed (${response.status})`);
  }

  return response.blob();
}

export const requestPortalLink = (slug: string, email: string) =>
  apiClient<null>(`/public/careers/${encodeURIComponent(slug)}/portal-link`, { method: "POST", body: json({ email }), auth: false });

// ---------------------------------------------------------------------------
// Duplicates, erasure, messages, reschedule requests, consent
// ---------------------------------------------------------------------------

export const mergeCandidates = (keepId: number, mergeIds: number[]) =>
  apiClient<Candidate>(`/candidates/${keepId}/merge`, { method: "POST", body: json({ merge_ids: mergeIds }) });

export const eraseCandidate = (id: number) => apiClient<Candidate>(`/candidates/${id}/erase`, { method: "POST" });

export const listCandidateMessages = (id: number) => apiClient<CandidateMessage[]>(`/candidates/${id}/messages`);

export const sendCandidateMessage = (id: number, body: string) =>
  apiClient<CandidateMessage>(`/candidates/${id}/messages`, { method: "POST", body: json({ body }) });

export const declineRescheduleRequest = (requestId: number, note?: string) =>
  apiClient<RescheduleRequest>(`/reschedule-requests/${requestId}/decline`, { method: "POST", body: json({ note: note || undefined }) });

export const requestTalentPoolConsent = (id: number) =>
  apiClient<Candidate>(`/candidates/${id}/talent-pool/consent-request`, { method: "POST" });

export interface SuggestedCandidate {
  id: number;
  full_name: string;
  email: string;
  talent_pool: TalentPool;
  pool_consent?: PoolConsent | null;
  previous_job_title?: string | null;
  skills: string[];
  experience_years?: number | null;
  fit_score: number;
  matched_skills: string[];
}

export const getSuggestedCandidates = (jobId: number) => apiClient<SuggestedCandidate[]>(`/job-openings/${jobId}/suggested-candidates`);

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export type EmailTemplatePayload = Pick<EmailTemplate, "name" | "subject" | "body">;

export const listEmailTemplates = () => apiClient<EmailTemplate[]>("/email-templates");
export const createEmailTemplate = (payload: EmailTemplatePayload) => apiClient<EmailTemplate>("/email-templates", { method: "POST", body: json(payload) });
export const updateEmailTemplate = (id: number, payload: EmailTemplatePayload) =>
  apiClient<EmailTemplate>(`/email-templates/${id}`, { method: "PUT", body: json(payload) });
export const deleteEmailTemplate = (id: number) => apiClient<null>(`/email-templates/${id}`, { method: "DELETE" });
export const addStarterEmailTemplates = () => apiClient<EmailTemplate[]>("/email-templates/starters", { method: "POST" });

// ---------------------------------------------------------------------------
// Headcount and budget
// ---------------------------------------------------------------------------

export interface HeadcountRow {
  id: number;
  department_id: number;
  department: string | null;
  fiscal_year: number;
  approved_headcount: number;
  approved_budget: number | null;
  hired: number;
  open_slots: number;
  used_headcount: number;
  used_cost: number;
  remaining_headcount: number;
  remaining_budget: number | null;
  unconverted_currencies: string[];
  over: boolean;
}

export const getHeadcountBudgets = (year?: number) =>
  apiClient<{ year: number; currency: string; budgets: HeadcountRow[] }>(`/recruitment/headcount${buildQuery({ year })}`);

export interface CurrencySettings {
  base_currency: string;
  rates: Array<{ currency: string; rate: number }>;
}

export const getCurrencySettings = () => apiClient<CurrencySettings>("/recruitment/currency");

export const saveCurrencySettings = (payload: CurrencySettings) =>
  apiClient<CurrencySettings>("/recruitment/currency", { method: "PUT", body: json(payload) });

export const listBudgetDepartments = () => apiClient<Array<{ id: number; name: string }>>("/recruitment/headcount/departments");

export const saveHeadcountBudget = (payload: { department_id: number; fiscal_year: number; approved_headcount: number; approved_budget: number | null }) =>
  apiClient<unknown>("/recruitment/headcount", { method: "PUT", body: json(payload) });

export const deleteHeadcountBudget = (id: number) => apiClient<null>(`/recruitment/headcount/${id}`, { method: "DELETE" });

export const checkRequisitionBudget = (payload: { department_id?: number | null; open_positions?: number; salary_min?: number | null; salary_max?: number | null; job_id?: number }) =>
  apiClient<BudgetCheck>("/requisitions/budget-check", { method: "POST", body: json(payload) });

// ---------------------------------------------------------------------------
// Pipelines, screening questions, sources and referrals, candidate checks
// ---------------------------------------------------------------------------

export type SourceType = "careers" | "referral" | "agency" | "direct" | "import" | "other";
export type CheckType = "reference" | "background" | "assessment";
export type CheckStatus = "requested" | "in_progress" | "passed" | "failed" | "waived";
export type QuestionType = "text" | "textarea" | "number" | "yes_no" | "single_choice" | "multi_choice" | "date";
export type KnockoutOperator = "eq" | "neq" | "gte" | "lte" | "in" | "not_in";
export type BonusStatus = "tracking" | "pending" | "eligible" | "approved" | "paid" | "cancelled";
export type PipelineCategory = "applied" | "screening" | "interview" | "offer";

export const sourceTypeLabels: Record<SourceType, string> = {
  careers: "Careers page",
  referral: "Employee referral",
  agency: "Agency",
  direct: "Direct / sourced",
  import: "Imported",
  other: "Other",
};

export const checkTypeLabels: Record<CheckType, string> = {
  reference: "Reference check",
  background: "Background check",
  assessment: "Skills assessment",
};

export const checkStatusLabels: Record<CheckStatus, string> = {
  requested: "Requested",
  in_progress: "In progress",
  passed: "Passed",
  failed: "Failed",
  waived: "Waived",
};

export const bonusStatusLabels: Record<BonusStatus, string> = {
  tracking: "Tracking",
  pending: "Waiting period",
  eligible: "Ready to approve",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

export interface PipelineStageItem {
  id: number | null;
  name: string;
  category: PipelineCategory;
  is_skippable: boolean;
  sort_order: number;
}

export interface CandidatePipeline {
  scope: "job" | "company" | "default";
  stages: PipelineStageItem[];
  current_index: number | null;
  current: PipelineStageItem | null;
  /** Where a rejected candidate was before the rejection; reopening can go here or earlier. */
  reopen_to: PipelineStageItem | null;
}

export interface PipelineConfig {
  scope: "job" | "company" | "default";
  job_opening_id: number | null;
  stages: PipelineStageItem[];
  categories: PipelineCategory[];
  candidate_counts: Record<string, number>;
}

export interface PipelineStageInput {
  id?: number | null;
  name: string;
  category: PipelineCategory;
  is_skippable: boolean;
}

export const getPipeline = (jobOpeningId?: number | null) =>
  apiClient<PipelineConfig>(`/recruitment/pipeline${buildQuery({ job_opening_id: jobOpeningId })}`);

export const savePipeline = (jobOpeningId: number | null, stages: PipelineStageInput[]) =>
  apiClient<PipelineConfig>("/recruitment/pipeline", { method: "PUT", body: json({ job_opening_id: jobOpeningId ?? undefined, stages }) });

export const resetPipeline = (jobOpeningId: number | null) =>
  apiClient<PipelineConfig>(`/recruitment/pipeline${buildQuery({ job_opening_id: jobOpeningId })}`, { method: "DELETE" });

export interface PublicQuestion {
  id: number;
  label: string;
  help_text?: string | null;
  type: QuestionType;
  options: string[];
  required: boolean;
}

export interface KnockoutRule {
  operator: KnockoutOperator;
  value: string | number | string[];
}

export interface JobQuestionItem {
  id?: number;
  label: string;
  help_text?: string | null;
  type: QuestionType;
  options?: string[] | null;
  required: boolean;
  knockout?: KnockoutRule | null;
}

export interface JobQuestionSet {
  questions: JobQuestionItem[];
  auto_reject_knockouts: boolean;
  types: QuestionType[];
}

export const getJobQuestions = (jobId: number) => apiClient<JobQuestionSet>(`/job-openings/${jobId}/questions`);

export const saveJobQuestions = (jobId: number, questions: JobQuestionItem[], autoRejectKnockouts: boolean) =>
  apiClient<JobQuestionSet>(`/job-openings/${jobId}/questions`, { method: "PUT", body: json({ questions, auto_reject_knockouts: autoRejectKnockouts }) });

export interface CandidateAnswer {
  id: number;
  question: string;
  type: QuestionType;
  answer: Array<string | number> | null;
  knocked_out: boolean;
}

export interface Agency {
  id: number;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  fee_percent?: string | number | null;
  terms?: string | null;
  is_active: boolean;
  candidates_count?: number;
  hired_count?: number;
}

export type AgencyPayload = Partial<Omit<Agency, "id" | "candidates_count" | "hired_count">> & { name: string };

export const listAgencies = () => apiClient<Agency[]>("/recruitment/agencies");
export const createAgency = (payload: AgencyPayload) => apiClient<Agency>("/recruitment/agencies", { method: "POST", body: json(payload) });
export const updateAgency = (id: number, payload: Partial<AgencyPayload>) =>
  apiClient<Agency>(`/recruitment/agencies/${id}`, { method: "PUT", body: json(payload) });
export const deleteAgency = (id: number) => apiClient<null>(`/recruitment/agencies/${id}`, { method: "DELETE" });

export interface ReferralBonusItem {
  id: number;
  candidate_id: number;
  employee_id?: number | null;
  agency_id?: number | null;
  amount?: string | number | null;
  currency?: string | null;
  status: BonusStatus;
  eligible_on?: string | null;
  paid_on?: string | null;
  bonus_id?: number | null;
  notes?: string | null;
  candidate?: { id: number; full_name: string; stage: CandidateStage; job_opening?: { id: number; title: string } | null } | null;
  employee?: { id: number; name: string; email: string } | null;
  agency?: { id: number; name: string } | null;
}

export interface ReferralBonusList {
  bonuses: ReferralBonusItem[];
  totals: Partial<Record<BonusStatus, { count: number; amount: number }>>;
  wait_days: number;
}

export const listReferralBonuses = (params: { status?: BonusStatus | ""; type?: "referral" | "agency" | "" } = {}) =>
  apiClient<ReferralBonusList>(`/recruitment/referral-bonuses${buildQuery(params)}`);
export const updateReferralBonus = (id: number, payload: { amount?: number | null; notes?: string | null }) =>
  apiClient<ReferralBonusItem>(`/recruitment/referral-bonuses/${id}`, { method: "PUT", body: json(payload) });
export const approveReferralBonus = (id: number) => apiClient<ReferralBonusItem>(`/recruitment/referral-bonuses/${id}/approve`, { method: "POST" });
export const payReferralBonus = (id: number) => apiClient<ReferralBonusItem>(`/recruitment/referral-bonuses/${id}/pay`, { method: "POST" });
export const cancelReferralBonus = (id: number, notes?: string) =>
  apiClient<ReferralBonusItem>(`/recruitment/referral-bonuses/${id}/cancel`, { method: "POST", body: json({ notes: notes || undefined }) });

export interface MyReferral {
  id: number;
  name: string;
  job_title?: string | null;
  referred_on?: string | null;
  status: string;
  bonus_status?: BonusStatus | null;
  bonus_amount?: number | null;
  bonus_currency?: string | null;
  bonus_eligible_on?: string | null;
}

export interface ReferableJob {
  id: number;
  title: string;
  department?: string | null;
  location?: string | null;
  employment_type?: string | null;
  bonus?: number | null;
  currency?: string | null;
}

export const listReferableJobs = () => apiClient<ReferableJob[]>("/referrals/jobs");
export const listMyReferrals = () => apiClient<MyReferral[]>("/referrals/mine");
export const submitReferral = (form: FormData) => apiClient<{ id: number }>("/referrals", { method: "POST", body: form });

export interface CandidateCheckItem {
  id: number;
  candidate_id: number;
  type: CheckType;
  title: string;
  status: CheckStatus;
  provider?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  relationship?: string | null;
  due_on?: string | null;
  score?: string | number | null;
  max_score?: string | number | null;
  pass_mark?: string | number | null;
  result_notes?: string | null;
  response?: Record<string, string | number> | null;
  document_id?: number | null;
  document?: { id: number; label: string } | null;
  requested_at?: string | null;
  completed_at?: string | null;
  waive_reason?: string | null;
}

export interface CheckSummary {
  required: CheckType[];
  unmet: Array<{ type: CheckType; reason: string }>;
  cleared: boolean;
}

export interface CheckPayload {
  type?: CheckType;
  title?: string;
  status?: Exclude<CheckStatus, "waived">;
  provider?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  relationship?: string | null;
  due_on?: string | null;
  score?: number | null;
  max_score?: number | null;
  pass_mark?: number | null;
  result_notes?: string | null;
  document_id?: number | null;
  send_request?: boolean;
}

export interface CheckList {
  checks: CandidateCheckItem[];
  summary: CheckSummary;
  email_sent?: boolean | null;
}

export const listCandidateChecks = (candidateId: number) => apiClient<CheckList>(`/candidates/${candidateId}/checks`);
export const createCandidateCheck = (candidateId: number, payload: CheckPayload) =>
  apiClient<CheckList>(`/candidates/${candidateId}/checks`, { method: "POST", body: json(payload) });
export const updateCandidateCheck = (id: number, payload: CheckPayload) =>
  apiClient<CheckList>(`/candidate-checks/${id}`, { method: "PUT", body: json(payload) });
export const waiveCandidateCheck = (id: number, reason: string) =>
  apiClient<CheckList>(`/candidate-checks/${id}/waive`, { method: "POST", body: json({ reason }) });
export const sendReferenceRequest = (id: number) => apiClient<CheckList>(`/candidate-checks/${id}/send-request`, { method: "POST" });
export const deleteCandidateCheck = (id: number) => apiClient<CheckList>(`/candidate-checks/${id}`, { method: "DELETE" });

export interface ReferenceQuestion {
  key: string;
  label: string;
  type: "text" | "textarea" | "rating" | "yes_no";
  required: boolean;
}

export interface ReferenceForm {
  candidate_name: string;
  job_title?: string | null;
  company?: string | null;
  referee_name?: string | null;
  already_submitted: boolean;
  questions: ReferenceQuestion[];
}

export const getReferenceForm = (token: string) =>
  apiClient<ReferenceForm>(`/public/references/${encodeURIComponent(token)}`, { auth: false });
export const submitReferenceForm = (token: string, answers: Record<string, string | number>) =>
  apiClient<null>(`/public/references/${encodeURIComponent(token)}`, { method: "POST", body: json({ answers }), auth: false });
