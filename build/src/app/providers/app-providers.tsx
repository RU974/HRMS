import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { getTheme } from "@/services/theme-service";
import { useAuthStore } from "@/store/auth-store";
import { getResolvedTheme, useThemeStore } from "@/store/theme-store";
import { ToastContainer } from "@/components/notifications/toast";
import { CallProvider } from "@/components/call/CallProvider";

const queryClient = new QueryClient();

function applyDocumentTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const hydrateTheme = useThemeStore((state) => state.hydrateTheme);
  const theme = useThemeStore((state) => state.theme);
  const source = useThemeStore((state) => state.source);

  useEffect(() => {
    let active = true;

    if (!token) {
      applyDocumentTheme(getResolvedTheme(theme));
      return () => {
        active = false;
      };
    }

    void getTheme()
      .then((currentTheme) => {
        if (!active) {
          return;
        }

        hydrateTheme(currentTheme.theme, currentTheme.source);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        hydrateTheme(theme, source);
      });

    return () => {
      active = false;
    };
  }, [hydrateTheme, source, theme, token]);

  useEffect(() => {
    applyDocumentTheme(getResolvedTheme(theme));

    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const resolveTheme = () => applyDocumentTheme(getResolvedTheme(theme));

    mediaQuery.addEventListener("change", resolveTheme);
    return () => {
      mediaQuery.removeEventListener("change", resolveTheme);
    };
  }, [theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "hrms_theme_snapshot" || !event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as { theme?: "light" | "dark" | "system"; source?: "user" | "company" | "system" };
        if (parsed.theme) {
          hydrateTheme(parsed.theme, parsed.source ?? "system");
        }
      } catch {
        // Ignore malformed theme sync payloads.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [hydrateTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <CallProvider>
        {children}
        <ToastContainer />
      </CallProvider>
    </QueryClientProvider>
  );
}
