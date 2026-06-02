import { useAuthStore } from "@/store/auth-store";

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  errors?: unknown;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_API_URL ??
  "/api/v1";

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => null) as ApiResponse<T> | null;

  if (!response.ok || payload?.success === false) {
    const validationDetails =
      payload && typeof payload.errors === "object" && payload.errors !== null
        ? Object.values(payload.errors as Record<string, unknown>)
            .flatMap((error) => (Array.isArray(error) ? error : [error]))
            .filter((error): error is string => typeof error === "string" && error.trim().length > 0)
            .join(" ")
        : "";

    const messageParts = [payload?.message, validationDetails].filter(
      (part): part is string => typeof part === "string" && part.trim().length > 0,
    );

    throw new Error(messageParts.length > 0 ? messageParts.join(" ") : `Request failed with status ${response.status}`);
  }

  return payload?.data as T;
}
