import { apiClient } from "@/services/api-client";

export function sendHeartbeat() {
  return apiClient<null>("/heartbeat", { method: "POST" });
}

export function getOnlineStatus(userIds: number[]): Promise<Record<number, boolean>> {
  return apiClient<Record<number, boolean>>("/users/online-status", {
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

export function getIncomingCalls() {
  return apiClient<Call[]>("/calls/incoming");
}

export function getCallHistory() {
  return apiClient<Call[]>("/calls/history");
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
