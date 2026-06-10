import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { me } from "@/services/auth-service";

// Version bump — increment this whenever permission/user structure changes.
// It clears stale localStorage sessions automatically.
const SESSION_VERSION = "2";
const SESSION_VERSION_KEY = "hrms_session_v";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setUser, logout } = useAuthStore();
  const refreshed = useRef(false);

  useEffect(() => {
    // Clear stale sessions from older app versions
    const storedVersion = localStorage.getItem(SESSION_VERSION_KEY);
    if (storedVersion !== SESSION_VERSION) {
      logout();
      localStorage.setItem(SESSION_VERSION_KEY, SESSION_VERSION);
      return;
    }

    // Refresh user from server on every app load so permissions are always fresh
    if (isAuthenticated && !refreshed.current) {
      refreshed.current = true;
      me()
        .then((user) => setUser(user))
        .catch(() => {
          // Token is invalid — clear session and redirect to login
          logout();
        });
    }
  }, [isAuthenticated, setUser, logout]);

  return isAuthenticated ? <>{children}</> : <Navigate to="/auth/login" replace />;
}