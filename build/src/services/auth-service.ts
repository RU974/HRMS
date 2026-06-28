import { apiClient } from "./api-client";
import type { AuthUser } from "@/store/auth-store";

interface AuthPayload {
  user: AuthUser;
  token: string;
}

export function login(email: string, password: string) {
  return apiClient<AuthPayload>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password })
  });
}

export function register(name: string, email: string, password: string, passwordConfirmation: string) {
  return apiClient<AuthPayload>("/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      name,
      email,
      password,
      password_confirmation: passwordConfirmation
    })
  });
}

export function me() {
  return apiClient<AuthUser>("/auth/me");
}

export function logoutRequest() {
  return apiClient<null>("/auth/logout", { method: "POST" });
}

export function forgotPassword(email: string) {
  return apiClient<null>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email })
  });
}

export interface ResetPasswordPayload {
  token: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export function resetPassword(payload: ResetPasswordPayload) {
  return apiClient<null>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      token: payload.token,
      email: payload.email,
      password: payload.password,
      password_confirmation: payload.passwordConfirmation
    })
  });
}

export function changePassword(payload: { current_password: string; password: string; password_confirmation: string }) {
  return apiClient("/auth/change-password", { method: "POST", body: JSON.stringify(payload) });
}
