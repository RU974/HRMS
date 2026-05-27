import { apiClient } from "@/services/api-client";

export interface ChatUser {
  id: number;
  name: string;
  email: string;
}

export interface ChatMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  sender?: ChatUser;
  receiver?: ChatUser;
}

export interface ChatMessagePayload {
  receiver_id: number;
  message: string;
}

export function listChatMessages(query?: { q?: string; sender_id?: number; receiver_id?: number }) {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set("q", query.q.trim());
  if (query?.sender_id) params.set("sender_id", String(query.sender_id));
  if (query?.receiver_id) params.set("receiver_id", String(query.receiver_id));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient<ChatMessage[]>(`/chat-messages${suffix}`);
}

export function createChatMessage(payload: ChatMessagePayload) {
  return apiClient<ChatMessage>("/chat-messages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateChatMessage(id: number, payload: Partial<Pick<ChatMessage, "message" | "is_read">>) {
  return apiClient<ChatMessage>(`/chat-messages/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteChatMessage(id: number) {
  return apiClient<null>(`/chat-messages/${id}`, { method: "DELETE" });
}
