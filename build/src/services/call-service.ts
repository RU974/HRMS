import { apiClient, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

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
  /** Current host — the initiator until they leave a group call. */
  host_id: number;
  initiator: CallUser;
  type: "audio" | "video";
  call_type: "direct" | "group";
  status: "ringing" | "active" | "ended" | "missed" | "declined";
  participants: CallParticipant[];
  started_at: string | null;
  ended_at: string | null;
  duration: number | null;
  created_at: string;
}

export interface CallConfig {
  ice_servers: RTCIceServer[];
  heartbeat_interval_seconds: number;
  max_participants: number;
  video_enabled: boolean;
  screen_share_enabled: boolean;
}

export const DEFAULT_CALL_CONFIG: CallConfig = {
  ice_servers: [{ urls: ["stun:stun.l.google.com:19302"] }],
  heartbeat_interval_seconds: 15,
  max_participants: 4,
  video_enabled: true,
  screen_share_enabled: true,
};

export interface CallMediaState {
  muted: boolean;
  camera_off: boolean;
  screen_sharing: boolean;
}

export interface CallHeartbeat {
  call_status: Call["status"];
  participant_status: CallParticipant["status"];
  host_id: number;
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
  status?: "all" | "ended" | "missed" | "declined";
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

export function getCallConfig() {
  return apiClient<CallConfig>("/calls/config");
}

/** The user's own ringing/active call, or null. */
export function getCurrentCall() {
  return apiClient<Call | null>("/calls/current");
}

export function pingPresence() {
  return apiClient<null>("/presence/ping", { method: "POST" });
}

export function sendHeartbeat(callId: number) {
  return apiClient<CallHeartbeat>(`/calls/${callId}/heartbeat`, { method: "POST" });
}

export function sendMediaState(callId: number, state: CallMediaState) {
  return apiClient<null>(`/calls/${callId}/media-state`, { method: "POST", body: JSON.stringify(state) });
}

/**
 * Leave a call while the page is unloading. A normal fetch is cancelled by the
 * browser on unload; `keepalive` lets the request finish. Best effort: if it
 * is lost the server heartbeat timeout cleans the call up.
 */
export function leaveCallOnUnload(callId: number) {
  const token = useAuthStore.getState().token;
  if (!token) return;
  try {
    void fetch(`${API_BASE_URL}/calls/${callId}/end`, {
      method: "POST",
      keepalive: true,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
  } catch {
    /* nothing more we can do while unloading */
  }
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
