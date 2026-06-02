import { create } from "zustand";
import { collectPermissionKeys, hasPermission as userHasPermission } from "@/utils/permissions";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  company_id?: string | null;
  branch_id?: string | null;
  employee?: {
    id: number;
    employee_number?: string | null;
    name?: string | null;
    email?: string | null;
    status?: string | null;
    joining_date?: string | null;
    department?: { id: number; name: string } | null;
    designation?: { id: number; name: string } | null;
    shift?: { id: number; name: string } | null;
    manager?: { id: number; name: string } | null;
  } | null;
  permissions?: Array<{ id: string; key?: string; name?: string; module?: string; action?: string }>;
  roles?: Array<{ id: string; name: string; permissions?: Array<{ id: string; key: string }> }>;
  rolesRelation?: Array<{ id: string; name: string; permissions?: Array<{ id: string; key: string }> }>;
  roles_relation?: Array<{ id: string; name: string; permissions?: Array<{ id: string; key: string }> }>;
}

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  hasPermission: (permission: string) => boolean;
  logout: () => void;
}

function readStoredSession() {
  const storedToken = localStorage.getItem("hrms_token");
  const storedUser = localStorage.getItem("hrms_user");

  let parsedUser: AuthUser | null = null;
  if (storedUser) {
    try {
      parsedUser = JSON.parse(storedUser) as AuthUser;
    } catch {
      localStorage.removeItem("hrms_user");
    }
  }

  return { storedToken, parsedUser };
}

const { storedToken, parsedUser } = readStoredSession();

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: Boolean(storedToken),
  token: storedToken,
  user: parsedUser,
  setSession: (token, user) => {
    localStorage.setItem("hrms_token", token);
    localStorage.setItem("hrms_user", JSON.stringify(user));
    set({ isAuthenticated: true, token, user });
  },
  setUser: (user) => {
    localStorage.setItem("hrms_user", JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },
  hasPermission: (permission) => {
    return userHasPermission(get().user, permission);
  },
  logout: () => {
    localStorage.removeItem("hrms_token");
    localStorage.removeItem("hrms_user");
    set({ isAuthenticated: false, token: null, user: null });
  }
}));

export const getCurrentPermissionKeys = () => collectPermissionKeys(useAuthStore.getState().user);


