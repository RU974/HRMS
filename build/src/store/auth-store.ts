import { create } from "zustand";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  rolesRelation?: Array<{ id: string; name: string; permissions?: Array<{ id: string; key: string }> }>;
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

const storedToken = localStorage.getItem("hrms_token");
const storedUser = localStorage.getItem("hrms_user");

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: Boolean(storedToken),
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) as AuthUser : null,
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
    const state = useAuthStore.getState();
    const keys = (state.user?.rolesRelation ?? []).flatMap((r) => (r.permissions ?? []).map((p) => p.key));
    return keys.includes("*.*") || keys.includes(permission);
  },
  logout: () => {
    localStorage.removeItem("hrms_token");
    localStorage.removeItem("hrms_user");
    set({ isAuthenticated: false, token: null, user: null });
  }
}));


