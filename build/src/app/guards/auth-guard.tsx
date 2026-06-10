import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { me } from "@/services/auth-service";

// Version bump — increment this whenever permission/user structure changes.
// It clears stale sessions automatically.
const SESSION_VERSION = "3";
const SESSION_VERSION_KEY = "hrms_session_v";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setUser, logout } = useAuthStore();
  const refreshed = useRef(false);

  useEffect(() => {
    // Clear stale sessions from older app versions.
    // Still stored in localStorage (non-sensitive version string) so it
    // survives tab closes and correctly invalidates old localStorage-based
    // sessions left over from before the sessionStorage migration.
    const storedVersion = localStorage.getItem(SESSION_VERSION_KEY);
    if (storedVersion !== SESSION_VERSION) {
      logout();
      // Also clear any legacy localStorage token/user left from v1/v2
      localStorage.removeItem("hrms_token");
      localStorage.removeItem("hrms_user");
      localStorage.setItem(SESSION_VERSION_KEY, SESSION_VERSION);
      return;
    }

    // Refresh user from server on every app load so permissions are always fresh
    if (isAuthenticated && !refreshed.current) {
      refreshed.current = true;
      me()
        .then((user) => setUser(user))
        .catch(() => {
          // Token is invalid or expired — clear session and redirect to login
          logout();
        });
    }
  }, [isAuthenticated, setUser, logout]);

  return isAuthenticated ? <>{children}</> : <Navigate to="/auth/login" replace />;
}