import { apiClient } from "@/services/api-client";

export type AnnouncementTarget = "all" | "hr" | "managers" | "employees";

export interface Announcement {
  id: number;
  title: string;
  body: string;
  target: AnnouncementTarget;
  is_published: boolean;
  published_at: string | null;
  created_by: number | null;
  creator?: { id: number; name: string; email: string } | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementPayload {
  title: string;
  body: string;
  target: AnnouncementTarget;
  is_published: boolean;
}

export function listAnnouncements(query?: { q?: string; published?: "all" | "published" | "draft" }) {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set("q", query.q.trim());
  if (query?.published === "published") params.set("published", "true");
  if (query?.published === "draft") params.set("published", "false");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient<Announcement[]>(`/announcements${suffix}`);
}

export function createAnnouncement(payload: AnnouncementPayload) {
  return apiClient<Announcement>("/announcements", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAnnouncement(id: number, payload: Partial<AnnouncementPayload>) {
  return apiClient<Announcement>(`/announcements/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteAnnouncement(id: number) {
  return apiClient<null>(`/announcements/${id}`, {
    method: "DELETE"
  });
}
