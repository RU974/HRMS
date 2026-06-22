import { apiClient } from "./api-client";

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
  created_at: string;
  createdBy: TicketUser;
  assignedTo: TicketUser | null;
  department: TicketDepartment;
  comments: TicketComment[];
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  category?: string;
  department_id?: string;
}

export const listTickets = (filters?: TicketFilters) => {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set("status", filters.status);
  if (filters?.priority) qs.set("priority", filters.priority);
  if (filters?.category) qs.set("category", filters.category);
  if (filters?.department_id) qs.set("department_id", filters.department_id);
  const query = qs.toString();
  return apiClient<Ticket[]>(`/tickets${query ? `?${query}` : ""}`);
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
