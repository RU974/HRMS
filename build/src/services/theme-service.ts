import { apiClient } from "@/services/api-client";

export type ThemePreference = "light" | "dark" | "system";
export type ThemeSource = "user" | "company" | "system";

export interface ThemeSettingRecord {
  id: number;
  company_id?: string | null;
  user_id?: number | null;
  theme: ThemePreference;
  preferences?: Record<string, unknown> | null;
  updated_at?: string | null;
}

export interface ThemeResolution {
  theme: ThemePreference;
  source: ThemeSource;
  user_theme: ThemeSettingRecord | null;
  company_theme: ThemeSettingRecord | null;
  fallback_theme: ThemePreference;
}

export interface ThemeSavePayload {
  theme: ThemePreference;
  preferences?: Record<string, unknown> | null;
}

export const getTheme = () => apiClient<ThemeResolution>("/settings/themes/current");
export const saveTheme = (payload: ThemeSavePayload) =>
  apiClient<ThemeResolution>("/settings/themes/current", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
export const resetTheme = () => apiClient<ThemeResolution>("/settings/themes/current", { method: "DELETE" });
export const getCompanyTheme = () => apiClient<ThemeSettingRecord | null>("/settings/themes/company");
