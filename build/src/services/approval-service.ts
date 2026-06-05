import { apiClient } from "./api-client";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApprovalWorkflowItem {
  id: number;
  name: string;
  module: string;
}

export interface ApprovalStepItem {
  id: number;
  step_order: number;
  approver_type: string;
  approver_identifier: string;
  conditions?: unknown[];
}

export interface ApprovalItem {
  id: number;
  module: string;
  module_id: number;
  status: ApprovalStatus;
  metadata?: Record<string, unknown>;
  workflow: ApprovalWorkflowItem;
  currentStep?: ApprovalStepItem | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowItem {
  id: number;
  name: string;
  module: string;
  definition?: Record<string, unknown> | Array<unknown>;
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

export interface CreateWorkflowPayload {
  name: string;
  module: string;
  definition: Record<string, unknown> | Array<unknown>;
  steps: Array<{
    step_order: number;
    approver_type: string;
    approver_identifier: string;
    conditions?: unknown[];
  }>;
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
