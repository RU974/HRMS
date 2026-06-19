import { apiClient, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export interface ChatUser {
  id: number;
  name: string;
  email: string;
  is_online?: boolean;
}

export interface ChatMessage {
  id: number;
  conversation_id: number | null;
  sender_id: number;
  receiver_id: number;
  message: string;
  is_read: boolean;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  created_at: string;
  updated_at: string;
  sender?: ChatUser;
  receiver?: ChatUser;
}

export interface ChatParticipant extends ChatUser {
  pivot?: { last_read_at: string | null };
}

export interface ChatConversation {
  id: number;
  type: "direct" | "group";
  name: string | null;
  participants: ChatParticipant[];
  last_message: ChatMessage | null;
  unread_count: number;
  created_at: string;
}

export function listChatMessages(query?: {
  q?: string;
  sender_id?: number;
  receiver_id?: number;
  conversation_id?: number;
  read?: "all" | "read" | "unread";
}) {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set("q", query.q.trim());
  if (query?.sender_id) params.set("sender_id", String(query.sender_id));
  if (query?.receiver_id) params.set("receiver_id", String(query.receiver_id));
  if (query?.conversation_id) params.set("conversation_id", String(query.conversation_id));
  if (query?.read === "read") params.set("read", "true");
  if (query?.read === "unread") params.set("read", "false");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient<ChatMessage[]>(`/chat-messages${suffix}`);
}

export function createChatMessage(payload: { conversation_id: number; message?: string; file?: File | null }) {
  if (payload.file) {
    const form = new FormData();
    form.set("conversation_id", String(payload.conversation_id));
    if (payload.message) form.set("message", payload.message);
    form.set("file", payload.file);
    return apiClient<ChatMessage>("/chat-messages", { method: "POST", body: form });
  }

  return apiClient<ChatMessage>("/chat-messages", {
    method: "POST",
    body: JSON.stringify({ conversation_id: payload.conversation_id, message: payload.message }),
  });
}

export function updateChatMessage(id: number, payload: { message: string }) {
  return apiClient<ChatMessage>(`/chat-messages/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteChatMessage(id: number) {
  return apiClient<null>(`/chat-messages/${id}`, { method: "DELETE" });
}

export async function fetchChatAttachment(id: number): Promise<Blob> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE_URL}/chat-messages/${id}/attachment`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Unable to load attachment (${response.status})`);
  }

  return response.blob();
}

export async function downloadChatAttachment(id: number, filename: string) {
  const blob = await fetchChatAttachment(id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function listConversations() {
  return apiClient<ChatConversation[]>("/chat-conversations");
}

export function createConversation(payload: { type: "direct" | "group"; name?: string; participant_ids: number[] }) {
  return apiClient<ChatConversation>("/chat-conversations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function markConversationRead(id: number) {
  return apiClient<null>(`/chat-conversations/${id}/read`, { method: "POST" });
}

export function addConversationParticipant(id: number, userId: number) {
  return apiClient<ChatConversation>(`/chat-conversations/${id}/participants`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export function removeConversationParticipant(id: number, userId: number) {
  return apiClient<null>(`/chat-conversations/${id}/participants/${userId}`, { method: "DELETE" });
}
