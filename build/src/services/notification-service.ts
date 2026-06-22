import { apiClient } from "@/services/api-client";

export type NotificationType = "info" | "warning" | "success" | "error";

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
  link?: string | null;
  is_read: boolean;
  user_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  user_id?: number | null;
}

export function listNotifications(query?: { q?: string; read?: "all" | "read" | "unread" }) {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set("q", query.q.trim());
  if (query?.read === "read") params.set("read", "true");
  if (query?.read === "unread") params.set("read", "false");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient<NotificationItem[]>(`/notifications${suffix}`);
}

export function createNotification(payload: NotificationPayload) {
  return apiClient<NotificationItem>("/notifications", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateNotification(id: number, payload: Partial<NotificationPayload>) {
  return apiClient<NotificationItem>(`/notifications/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteNotification(id: number) {
  return apiClient<null>(`/notifications/${id}`, { method: "DELETE" });
}
