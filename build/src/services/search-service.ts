import { apiClient } from "@/services/api-client";

export interface GlobalSearchItem {
  id: number;
  title: string;
  subtitle: string;
  detail: string;
  path: string;
}

export interface GlobalSearchCategory {
  key: string;
  label: string;
  items: GlobalSearchItem[];
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  categories: GlobalSearchCategory[];
}

export function searchGlobal(query: string) {
  return apiClient<GlobalSearchResponse>(`/search?q=${encodeURIComponent(query)}`);
}
