import { apiClient, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export interface ChatUser {
  id: number;
  name: string;
  email: string;
  is_online?: boolean;
  is_in_call?: boolean;
}

export interface ChatMessage {
  id: number;
  conversation_id: number | null;
  sender_id: number;
  /** Null for group messages. */
  receiver_id: number | null;
  message: string;
  is_read: boolean;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  created_at: string;
  updated_at: string;
  /** Set once the sender has edited the message. */
  edited_at?: string | null;
  /** Set when deleted: the thread shows a "message deleted" placeholder. */
  deleted_at?: string | null;
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
  created_by?: number | null;
  /** Whether the current user may rename the group and change its members. */
  can_manage?: boolean;
  participants: ChatParticipant[];
  last_message: ChatMessage | null;
  unread_count: number;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

/** A page of a conversation's messages, oldest first within the page. */
export interface ThreadPage {
  data: ChatMessage[];
  /** True when older messages exist beyond this page. */
  has_more: boolean;
}

/**
 * Cursor-paginated thread. Without `before_id` returns the newest page;
 * with it, the page of messages immediately older than that id.
 */
export function listThreadMessages(query: { conversation_id: number; before_id?: number; limit?: number; q?: string }) {
  const params = new URLSearchParams({ conversation_id: String(query.conversation_id) });
  if (query.before_id) params.set("before_id", String(query.before_id));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.q?.trim()) params.set("q", query.q.trim());
  return apiClient<ThreadPage>(`/chat-messages?${params.toString()}`);
}

/** Admin-style listing across conversations (not used by the chat page itself). */
export function listChatMessages(query?: {
  q?: string;
  sender_id?: number;
  receiver_id?: number;
  read?: "all" | "read" | "unread";
}) {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set("q", query.q.trim());
  if (query?.sender_id) params.set("sender_id", String(query.sender_id));
  if (query?.receiver_id) params.set("receiver_id", String(query.receiver_id));
  if (query?.read === "read") params.set("read", "true");
  if (query?.read === "unread") params.set("read", "false");
  params.set("per_page", "50");
  return apiClient<PaginatedResponse<ChatMessage>>(`/chat-messages?${params.toString()}`);
}

// Mirrors the server's validation so users get instant feedback, not a 422 after a long upload.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "doc", "docx", "xls", "xlsx", "zip"];
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Returns a human-readable problem with the file, or null if it is acceptable. */
export function validateAttachment(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return `.${ext || "?"} files are not allowed. Allowed: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `"${file.name}" is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  return null;
}

/**
 * Send a message with an attachment while reporting upload progress
 * (fetch cannot observe upload progress, XHR can).
 */
export function sendMessageWithProgress(
  payload: { conversation_id: number; message?: string; file: File },
  onProgress: (fraction: number) => void
): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const token = useAuthStore.getState().token;
    const form = new FormData();
    form.set("conversation_id", String(payload.conversation_id));
    if (payload.message) form.set("message", payload.message);
    form.set("file", payload.file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/chat-messages`);
    xhr.setRequestHeader("Accept", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and retry."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.onload = () => {
      let body: { success?: boolean; message?: string; errors?: Record<string, string[]>; data?: ChatMessage } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && body?.data) {
        resolve(body.data);
        return;
      }

      const details = body?.errors ? Object.values(body.errors).flat().join(" ") : "";
      reject(new Error([body?.message, details].filter(Boolean).join(" ") || `Upload failed (${xhr.status})`));
    };

    xhr.send(form);
  });
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

export function renameConversation(id: number, name: string) {
  return apiClient<ChatConversation>(`/chat-conversations/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function leaveConversation(id: number) {
  return apiClient<null>(`/chat-conversations/${id}/leave`, { method: "POST" });
}

export function listChatUsers() {
  return apiClient<ChatUser[]>("/chat-messages/users");
}

export function removeConversationParticipant(id: number, userId: number) {
  return apiClient<null>(`/chat-conversations/${id}/participants/${userId}`, { method: "DELETE" });
}
