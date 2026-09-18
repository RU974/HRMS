import { apiClient } from "@/services/api-client";

export interface OrbitMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OrbitAction {
  label: string;
  path: string;
}

export interface OrbitReply {
  reply: string;
  actions: OrbitAction[];
}

export function sendOrbitMessage(messages: OrbitMessage[]) {
  return apiClient<OrbitReply>("/orbit/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}
