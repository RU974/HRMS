import { API_BASE_URL, apiClient } from "./api-client";
import { useAuthStore } from "@/store/auth-store";

export interface TicketUser {
  id: number;
  name: string;
  email: string;
}

export interface TicketDepartment {
  id: number;
  name: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: number;
  body: string;
  is_internal: boolean;
  created_at: string;
  user: TicketUser;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  user_id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  user: TicketUser;
}

export interface TicketActivity {
  id: string;
  ticket_id: string;
  user_id: number;
  action: "created" | "status_changed" | "assigned" | "commented";
  meta: Record<string, string | boolean | number> | null;
  created_at: string;
  user: TicketUser;
}

export interface Ticket {
  id: string;
  company_id: string;
  created_by: number;
  assigned_to: number | null;
  department_id: number;
  category: "IT" | "HR" | "Finance" | "Admin" | "General";
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed" | "reopened";
  title: string;
  description: string;
  resolved_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  createdBy: TicketUser;
  assignedTo: TicketUser | null;
  department: TicketDepartment;
  comments: TicketComment[];
  attachments: TicketAttachment[];
  activities?: TicketActivity[];
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  category?: string;
  department_id?: string;
  search?: string;
  page?: number;
  mine?: string;
  assigned_to_me?: string;
}

export interface PaginatedTickets {
  data: Ticket[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
  };
}

export const listTickets = (filters?: TicketFilters) => {
  const qs = new URLSearchParams();
  if (filters?.status)        qs.set("status",        filters.status);
  if (filters?.priority)      qs.set("priority",      filters.priority);
  if (filters?.category)      qs.set("category",      filters.category);
  if (filters?.department_id) qs.set("department_id", filters.department_id);
  if (filters?.search)        qs.set("search",        filters.search);
  if (filters?.mine)          qs.set("mine",          filters.mine);
  if (filters?.assigned_to_me) qs.set("assigned_to_me", filters.assigned_to_me);
  if (filters?.page && filters.page > 1) qs.set("page", String(filters.page));
  const query = qs.toString();
  return apiClient<PaginatedTickets>(`/tickets${query ? `?${query}` : ""}`);
};

export const getTicket = (id: string) =>
  apiClient<Ticket>(`/tickets/${id}`);

export const createTicket = (payload: {
  title: string;
  description: string;
  category: string;
  priority: string;
  department_id: number;
}) =>
  apiClient<Ticket>("/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const assignTicket = (id: string, assigned_to: number) =>
  apiClient<Ticket>(`/tickets/${id}/assign`, {
    method: "POST",
    body: JSON.stringify({ assigned_to }),
  });

export const getAssignableUsers = (ticketId: string) =>
  apiClient<TicketUser[]>(`/tickets/${ticketId}/assignable-users`);

export const changeTicketStatus = (id: string, status: string) =>
  apiClient<Ticket>(`/tickets/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

export const addTicketComment = (ticketId: string, payload: { body: string; is_internal?: boolean }) =>
  apiClient<TicketComment>(`/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const uploadTicketAttachment = (ticketId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return apiClient<TicketAttachment>(`/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: form,
  });
};

export interface TicketStats {
  open: number;
  in_progress: number;
  resolved_this_month: number;
  closed_this_month: number;
  avg_resolution_days: number;
  by_department: { name: string; count: number }[];
  by_priority: { priority: string; count: number }[];
  my_open: number;
  my_resolved: number;
}

export const getTicketStats = () =>
  apiClient<TicketStats>("/tickets/stats");

export async function downloadTicketAttachment(ticketId: string, attachmentId: string, fileName: string): Promise<void> {
  const token = useAuthStore.getState().token;
  const headers = new Headers({ Accept: "application/octet-stream" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/attachments/${attachmentId}/download`, { headers });
  if (!response.ok) throw new Error("Download failed");

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
