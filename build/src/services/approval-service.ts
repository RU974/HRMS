import { apiClient } from "./api-client";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ConditionOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export interface ApprovalWorkflowItem {
  id: number;
  name: string;
  module: string;
  escalation_hours?: number | null;
}

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value: string | number;
}

export interface StepApproverItem {
  id?: number;
  approver_type: string;
  approver_identifier: string;
}

export interface ApprovalStepItem {
  id: number;
  step_order: number;
  approver_type: string;
  approver_identifier: string;
  conditions?: ConditionRule[];
  approvers?: StepApproverItem[];
  required_approvals?: number;
  approval_mode?: "first_n" | "all";
  escalation_hours?: number | null;
}

export interface AuditTrailEntry {
  id: number;
  action: string;
  module: string | null;
  new_value: Record<string, unknown> | null;
  user?: { id: number; name: string; email: string } | null;
  created_at: string;
}

export interface ApprovalItem {
  id: number;
  module: string;
  module_id: number;
  status: ApprovalStatus;
  metadata?: Record<string, unknown>;
  workflow: ApprovalWorkflowItem;
  currentStep?: ApprovalStepItem | null;
  requester?: { id: number; name: string; email: string } | null;
  due_at?: string | null;
  escalated_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  audit_trail?: AuditTrailEntry[];
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowItem {
  id: number;
  name: string;
  module: string;
  definition?: Record<string, unknown> | Array<unknown>;
  escalation_hours?: number | null;
  steps: ApprovalStepItem[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateApprovalPayload {
  module: string;
  module_id: number;
  workflow_id: number;
  metadata?: Record<string, unknown>;
}

export interface ApprovalActionPayload {
  notes?: string | null;
}

export interface WorkflowStepPayload {
  step_order: number;
  approver_type: string;
  approver_identifier: string;
  approvers?: StepApproverItem[];
  conditions?: ConditionRule[];
  required_approvals?: number;
  approval_mode?: "first_n" | "all";
  escalation_hours?: number | null;
}

export interface CreateWorkflowPayload {
  name: string;
  module: string;
  definition: Record<string, unknown> | Array<unknown>;
  escalation_hours?: number | null;
  steps: WorkflowStepPayload[];
}

export interface DelegationItem {
  id: number;
  delegator_user_id: number;
  delegate_user_id: number;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  delegate?: { id: number; name: string; email: string };
}

export interface CreateDelegationPayload {
  delegate_user_id: number;
  starts_at: string;
  ends_at: string;
  notes?: string;
}

export const listApprovals = (filters: { status?: ApprovalStatus; module?: string } = {}) => {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.module) query.set("module", filters.module);
  const queryString = query.toString();
  return apiClient<ApprovalItem[]>(`/approvals${queryString ? `?${queryString}` : ""}`);
};

export const getApproval = (id: number) => apiClient<ApprovalItem>(`/approvals/${id}`);

export const startApproval = (payload: CreateApprovalPayload) =>
  apiClient<ApprovalItem>("/approvals", { method: "POST", body: JSON.stringify(payload) });

export const approveApproval = (id: number, payload: ApprovalActionPayload = {}) =>
  apiClient<ApprovalItem>(`/approvals/${id}/approve`, { method: "POST", body: JSON.stringify(payload) });

export const rejectApproval = (id: number, payload: ApprovalActionPayload = {}) =>
  apiClient<ApprovalItem>(`/approvals/${id}/reject`, { method: "POST", body: JSON.stringify(payload) });

export const listWorkflows = () => apiClient<WorkflowItem[]>("/workflows");
export const getWorkflow = (id: number) => apiClient<WorkflowItem>(`/workflows/${id}`);

export const createWorkflow = (payload: CreateWorkflowPayload) =>
  apiClient<WorkflowItem>("/workflows", { method: "POST", body: JSON.stringify(payload) });

export const updateWorkflow = (id: number, payload: Partial<CreateWorkflowPayload>) =>
  apiClient<WorkflowItem>(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteWorkflow = (id: number) => apiClient<null>(`/workflows/${id}`, { method: "DELETE" });

export const listDelegations = () => apiClient<DelegationItem[]>("/approval-delegations");

export const createDelegation = (payload: CreateDelegationPayload) =>
  apiClient<DelegationItem>("/approval-delegations", { method: "POST", body: JSON.stringify(payload) });

export const deleteDelegation = (id: number) =>
  apiClient<null>(`/approval-delegations/${id}`, { method: "DELETE" });
