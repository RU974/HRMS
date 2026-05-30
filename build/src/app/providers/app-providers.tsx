import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { listThemes } from "@/services/settings-service";
import { useAuthStore } from "@/store/auth-store";
import { useThemeStore } from "@/store/theme-store";

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const canManageUsers = useAuthStore((state) => state.hasPermission("manage users"));
  const setTheme = useThemeStore((state) => state.setTheme);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    let active = true;

    if (!token || !canManageUsers) {
      return () => {
        active = false;
      };
    }

    void listThemes()
      .then((themes) => {
        if (!active) {
          return;
        }

        const preferredTheme = themes[0]?.theme;
        if (preferredTheme === "light" || preferredTheme === "dark" || preferredTheme === "system") {
          setTheme(preferredTheme);
        }
      })
      .catch(() => {
        // Theme preferences are optional; keep the current client-side value on failure.
      });

    return () => {
      active = false;
    };
  }, [canManageUsers, setTheme, token]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const resolveTheme = () => {
      const resolvedTheme = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    };

    resolveTheme();

    if (theme !== "system") {
      return;
    }

    mediaQuery.addEventListener("change", resolveTheme);
    return () => {
      mediaQuery.removeEventListener("change", resolveTheme);
    };
  }, [theme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}


