import { create } from "zustand";
import { collectPermissionKeys, hasPermission as userHasPermission } from "@/utils/permissions";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  profile_image?: string | null;
  must_change_password?: boolean;
  company_id?: string | null;
  branch_id?: string | null;
  employee?: {
    id: number;
    employee_number?: string | null;
    name?: string | null;
    email?: string | null;
    status?: string | null;
    joining_date?: string | null;
    phone?: string | null;
    address?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    profile_image?: string | null;
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

export interface AuthLicense {
  status: "active" | "trial" | "expired" | "suspended";
  edition: string;
  days_remaining: number | null;
  expires_at: string | null;
  features: string[];
  max_employees: number | null;
  max_users: number | null;
}

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: AuthUser | null;
  license: AuthLicense | null;
  setSession: (token: string, user: AuthUser, license?: AuthLicense | null) => void;
  setUser: (user: AuthUser, license?: AuthLicense | null) => void;
  hasPermission: (permission: string) => boolean;
  logout: () => void;
}

function readStoredSession() {
  // Use sessionStorage so the token is never accessible to other tabs or
  // persisted beyond the browser session — mitigates XSS token theft.
  const storedToken = sessionStorage.getItem("hrms_token");
  const storedUser  = sessionStorage.getItem("hrms_user");
  const storedLic   = sessionStorage.getItem("hrms_license");

  let parsedUser: AuthUser | null = null;
  if (storedUser) {
    try {
      parsedUser = JSON.parse(storedUser) as AuthUser;
    } catch {
      sessionStorage.removeItem("hrms_user");
    }
  }

  let parsedLicense: AuthLicense | null = null;
  if (storedLic) {
    try {
      parsedLicense = JSON.parse(storedLic) as AuthLicense;
    } catch {
      sessionStorage.removeItem("hrms_license");
    }
  }

  return { storedToken, parsedUser, parsedLicense };
}

const { storedToken, parsedUser, parsedLicense } = readStoredSession();

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: Boolean(storedToken),
  token: storedToken,
  user: parsedUser,
  license: parsedLicense,
  setSession: (token, user, license = null) => {
    sessionStorage.setItem("hrms_token", token);
    sessionStorage.setItem("hrms_user", JSON.stringify(user));
    if (license) sessionStorage.setItem("hrms_license", JSON.stringify(license));
    set({ isAuthenticated: true, token, user, license: license ?? null });
  },
  setUser: (user, license = null) => {
    sessionStorage.setItem("hrms_user", JSON.stringify(user));
    if (license !== null) sessionStorage.setItem("hrms_license", JSON.stringify(license));
    set({ user, isAuthenticated: true, ...(license !== null ? { license } : {}) });
  },
  hasPermission: (permission) => {
    return userHasPermission(get().user, permission);
  },
  logout: () => {
    sessionStorage.removeItem("hrms_token");
    sessionStorage.removeItem("hrms_user");
    sessionStorage.removeItem("hrms_license");
    set({ isAuthenticated: false, token: null, user: null, license: null });
  }
}));

export const getCurrentPermissionKeys = () => collectPermissionKeys(useAuthStore.getState().user);