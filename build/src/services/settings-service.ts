import { apiClient } from "@/services/api-client";

export type PermissionItem = { id: string; key?: string; name?: string; action?: string; module?: string; display_name?: string };
export type RoleItem = { id: string; name: string; description?: string | null; is_system?: boolean; permissions?: PermissionItem[] };
export type PermissionGroup = { module: string; permissions: PermissionItem[] };
export type UserItem = {
  id: number;
  name: string;
  email: string;
  role?: string | null;
  role_ids?: string[];
  roles?: { id: string; name: string }[];
  rolesRelation?: { id: string; name: string }[];
  roles_relation?: { id: string; name: string }[];
  company_id?: string | null;
  branch_id?: string | null;
  company?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
};
export type CompanyItem = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  timezone?: string | null;
  is_active?: boolean;
  branches_count?: number;
  users_count?: number;
};
export type BranchItem = {
  id: string;
  company_id: string;
  name: string;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
  users_count?: number;
  company?: { id: string; name: string } | null;
};
export type ThemeItem = {
  id: number;
  company_id?: string | null;
  user_id?: number | null;
  theme: string;
  preferences?: Record<string, unknown> | null;
  updated_at?: string | null;
};
export type LogItem = {
  id: number;
  user_id?: number | null;
  method: string;
  path: string;
  http_method?: string | null;
  endpoint?: string | null;
  module?: string | null;
  action?: string | null;
  description?: string | null;
  payload?: string | Record<string, unknown> | null;
  status_code: number;
  created_at: string;
  user?: { id: number; name: string; email?: string | null } | null;
};

export const listRoles = () => apiClient<RoleItem[]>("/roles");
export const listPermissions = () => apiClient<PermissionGroup[]>("/permissions");
export const createRole = (payload: { name: string; description?: string; permission_ids: string[] }) => apiClient<RoleItem>("/roles", { method: "POST", body: JSON.stringify(payload) });
export const updateRole = (id: string, payload: { name: string; description?: string; permission_ids: string[] }) => apiClient<RoleItem>(`/roles/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteRole = (id: string) => apiClient<null>(`/roles/${id}`, { method: "DELETE" });

export const listUsers = () => apiClient<UserItem[]>("/settings/users");
export const createUser = (payload: Record<string, unknown>) => apiClient<UserItem>("/settings/users", { method: "POST", body: JSON.stringify(payload) });
export const updateUser = (id: number, payload: Record<string, unknown>) => apiClient<UserItem>(`/settings/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteUser = (id: number) => apiClient<null>(`/settings/users/${id}`, { method: "DELETE" });

export const listCompanies = () => apiClient<CompanyItem[]>("/settings/companies");
export const createCompany = (payload: Record<string, unknown>) => apiClient<CompanyItem>("/settings/companies", { method: "POST", body: JSON.stringify(payload) });
export const updateCompany = (id: string, payload: Record<string, unknown>) => apiClient<CompanyItem>(`/settings/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteCompany = (id: string) => apiClient<null>(`/settings/companies/${id}`, { method: "DELETE" });

export const listBranches = () => apiClient<BranchItem[]>("/settings/branches");
export const createBranch = (payload: Record<string, unknown>) => apiClient<BranchItem>("/settings/branches", { method: "POST", body: JSON.stringify(payload) });
export const updateBranch = (id: string, payload: Record<string, unknown>) => apiClient<BranchItem>(`/settings/branches/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteBranch = (id: string) => apiClient<null>(`/settings/branches/${id}`, { method: "DELETE" });

export const listThemes = () => apiClient<ThemeItem[]>("/settings/themes");
export const createTheme = (payload: Record<string, unknown>) => apiClient<ThemeItem>("/settings/themes", { method: "POST", body: JSON.stringify(payload) });
export const updateTheme = (id: number, payload: Record<string, unknown>) => apiClient<ThemeItem>(`/settings/themes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteTheme = (id: number) => apiClient<null>(`/settings/themes/${id}`, { method: "DELETE" });

export const listLogs = () => apiClient<LogItem[]>("/settings/system-logs");

// ─── Licensing ───────────────────────────────────────────────────────────────
export type LicenseEdition = "Starter" | "Professional" | "Enterprise";
export type LicenseStatus  = "active" | "expired" | "suspended" | "trial";

export type LicenseItem = {
  id: string;
  license_key: string;
  product?: string | null;
  edition: LicenseEdition;
  licensee_name: string;
  licensee_email: string;
  max_employees: number;
  max_users: number;
  status: LicenseStatus;
  issued_at?: string | null;
  expires_at?: string | null;
  activated_at?: string | null;
  issued_by?: string | null;
  support_email?: string | null;
  features: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
  days_remaining?: number | null;
  company?: { id: string; name: string } | null;
};

export type LicenseUsage = {
  active_employees: number;
  active_users: number;
  license: LicenseItem | null;
};

export function listLicenses() {
  return apiClient<LicenseItem[]>("/settings/licenses");
}
export function getLicenseUsage() {
  return apiClient<LicenseUsage>("/settings/licenses/usage");
}
export function createLicense(data: Record<string, unknown>) {
  return apiClient<LicenseItem>("/settings/licenses", { method: "POST", body: JSON.stringify(data) });
}
export function updateLicense(id: string, data: Record<string, unknown>) {
  return apiClient<LicenseItem>(`/settings/licenses/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export function deleteLicense(id: string) {
  return apiClient(`/settings/licenses/${id}`, { method: "DELETE" });
}
export function activateLicense(key: string) {
  return apiClient<LicenseItem>("/settings/licenses/activate", { method: "POST", body: JSON.stringify({ license_key: key }) });
}