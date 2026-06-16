import { apiClient } from "@/services/api-client";

export type AnnouncementTarget = "all" | "hr" | "managers" | "employees";

export interface Announcement {
  id: number;
  title: string;
  body: string;
  target: AnnouncementTarget;
  category: string | null;
  tags: string[];
  is_published: boolean;
  published_at: string | null;
  created_by: number | null;
  creator?: { id: number; name: string; email: string } | null;
  reads_count?: number;
  read_by_me?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRead {
  id: number;
  announcement_id: number;
  user_id: number;
  read_at: string;
  user?: { id: number; name: string; email: string };
}

export interface AnnouncementPayload {
  title: string;
  body: string;
  target: AnnouncementTarget;
  category?: string | null;
  tags?: string[];
  is_published: boolean;
  published_at?: string | null;
}

export function listAnnouncements(query?: {
  q?: string;
  published?: "all" | "published" | "draft";
  category?: string;
  tag?: string;
}) {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set("q", query.q.trim());
  if (query?.published === "published") params.set("published", "true");
  if (query?.published === "draft") params.set("published", "false");
  if (query?.category?.trim()) params.set("category", query.category.trim());
  if (query?.tag?.trim()) params.set("tag", query.tag.trim());
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

export function markAnnouncementRead(id: number) {
  return apiClient<{ reads_count: number }>(`/announcements/${id}/read`, {
    method: "POST"
  });
}

export function getAnnouncementReads(id: number) {
  return apiClient<AnnouncementRead[]>(`/announcements/${id}/reads`);
}

export function uploadAnnouncementImage(file: File) {
  const formData = new FormData();
  formData.append("image", file);
  return apiClient<{ url: string }>("/announcements/upload-image", {
    method: "POST",
    body: formData
  });
}
