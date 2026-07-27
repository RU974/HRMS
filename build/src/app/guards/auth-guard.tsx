import { useEffect, useRef, useState } from "react";
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
  // Block render until /auth/me resolves so stale sessionStorage permissions
  // are never briefly visible before the server response arrives.
  const [refreshing, setRefreshing] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    const storedVersion = localStorage.getItem(SESSION_VERSION_KEY);
    return storedVersion === SESSION_VERSION && Boolean(sessionStorage.getItem("hrms_token"));
  });

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
      setRefreshing(false);
      return;
    }

    // Refresh user from server on every app load so permissions are always fresh
    if (isAuthenticated && !refreshed.current) {
      refreshed.current = true;
      me()
        .then(({ user, license }) => setUser(user, license))
        .catch(() => {
          // Token is invalid or expired — clear session and redirect to login
          logout();
        })
        .finally(() => setRefreshing(false));
    }
  }, [isAuthenticated, setUser, logout]);

  // Also refresh on tab focus (throttled) so role/permission changes made by
  // an admin elsewhere show up without requiring a manual logout/login —
  // an SPA tab left open otherwise keeps the permission snapshot from login.
  useEffect(() => {
    if (!isAuthenticated) return;
    let lastRefresh = Date.now();
    const REFRESH_INTERVAL_MS = 60_000;

    const handleFocus = () => {
      if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
      lastRefresh = Date.now();
      me()
        .then(({ user, license }) => setUser(user, license))
        .catch(() => logout());
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isAuthenticated, setUser, logout]);

  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (refreshing) return null;
  return <>{children}</>;
}