import { apiClient } from "@/services/api-client";

export interface UserPresence {
  online: boolean;
  in_call: boolean;
}

export function getOnlineStatus(userIds: number[]): Promise<Record<number, UserPresence>> {
  return apiClient<Record<number, UserPresence>>("/users/online-status", {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export interface CallUser {
  id: number;
  name: string;
  email: string;
}

export interface CallParticipant {
  user_id: number;
  user: CallUser;
  status: "invited" | "joined" | "left" | "rejected";
  joined_at: string | null;
  left_at: string | null;
}

export interface Call {
  id: number;
  conversation_id: number | null;
  initiated_by: number;
  initiator: CallUser;
  type: "audio" | "video";
  call_type: "direct" | "group";
  status: "ringing" | "active" | "ended" | "missed";
  participants: CallParticipant[];
  started_at: string | null;
  ended_at: string | null;
  duration: number | null;
  created_at: string;
}

export interface CallSignal {
  id: number;
  from_user_id: number;
  type: "offer" | "answer" | "ice-candidate";
  payload: Record<string, unknown>;
}

export function initiateCall(payload: {
  conversation_id?: number;
  participant_ids: number[];
  type: "audio" | "video";
}) {
  return apiClient<Call>("/calls", { method: "POST", body: JSON.stringify(payload) });
}

export interface CallHistoryPage {
  data: Call[];
  current_page: number;
  last_page: number;
  total: number;
}

export function getCallHistory(filters?: {
  status?: "all" | "ended" | "missed";
  type?: "all" | "audio" | "video";
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return apiClient<CallHistoryPage>(`/calls/history${qs ? `?${qs}` : ""}`);
}

export function getCall(id: number) {
  return apiClient<Call>(`/calls/${id}`);
}

export function answerCall(id: number) {
  return apiClient<Call>(`/calls/${id}/answer`, { method: "POST" });
}

export function rejectCall(id: number) {
  return apiClient<null>(`/calls/${id}/reject`, { method: "POST" });
}

export function endCall(id: number) {
  return apiClient<null>(`/calls/${id}/end`, { method: "POST" });
}

export function addCallParticipant(callId: number, userId: number) {
  return apiClient<Call>(`/calls/${callId}/participants`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export function removeCallParticipant(callId: number, userId: number) {
  return apiClient<Call>(`/calls/${callId}/participants/${userId}`, { method: "DELETE" });
}

export function muteCallParticipant(callId: number, userId: number) {
  return apiClient<null>(`/calls/${callId}/participants/${userId}/mute`, { method: "POST" });
}

export function sendSignal(
  callId: number,
  payload: { to_user_id: number; type: "offer" | "answer" | "ice-candidate"; payload: Record<string, unknown> }
) {
  return apiClient<{ id: number }>(`/calls/${callId}/signals`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSignals(callId: number) {
  return apiClient<CallSignal[]>(`/calls/${callId}/signals`);
}
