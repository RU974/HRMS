import { apiClient } from "@/services/api-client";

export type RoleItem = { id: string; name: string; description?: string | null; permissions?: { id: string; key: string }[] };
export type PermissionGroup = { module: string; permissions: { id: string; key: string }[] };
export type UserItem = {
  id: number;
  name: string;
  email: string;
  role?: string | null;
  rolesRelation?: { id: string; name: string }[];
  roles_relation?: { id: string; name: string }[];
  company_id?: string | null;
  branch_id?: string | null;
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
