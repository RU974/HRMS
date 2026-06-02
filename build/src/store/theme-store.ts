import { create } from "zustand";
import type { ThemePreference, ThemeSource } from "@/services/theme-service";

interface ThemeState {
  theme: ThemePreference;
  source: ThemeSource;
  isHydrated: boolean;
  isSaving: boolean;
  error: string | null;
  setTheme: (theme: ThemePreference, source?: ThemeSource) => void;
  toggleTheme: () => void;
  hydrateTheme: (theme: ThemePreference, source: ThemeSource) => void;
  setSaving: (isSaving: boolean) => void;
  setError: (error: string | null) => void;
}

interface StoredThemeSnapshot {
  theme: ThemePreference;
  source: ThemeSource;
}

const THEME_STORAGE_KEY = "hrms_theme_snapshot";

function getSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function readStoredTheme(): StoredThemeSnapshot {
  if (typeof window === "undefined") {
    return { theme: "system", source: "system" };
  }

  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!raw) {
    return { theme: "system", source: "system" };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredThemeSnapshot>;
    if (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system") {
      return {
        theme: parsed.theme,
        source: parsed.source === "user" || parsed.source === "company" || parsed.source === "system" ? parsed.source : "system"
      };
    }
  } catch {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  }

  return { theme: "system", source: "system" };
}

function persistTheme(theme: ThemePreference, source: ThemeSource): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme, source }));
}

const storedTheme = readStoredTheme();

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: storedTheme.theme,
  source: storedTheme.source,
  isHydrated: false,
  isSaving: false,
  error: null,
  setTheme: (theme, source = "user") => {
    persistTheme(theme, source);
    set({ theme, source, error: null });
  },
  toggleTheme: () => {
    const current = get().theme;
    const nextTheme = current === "light" ? "dark" : current === "dark" ? "system" : "light";
    get().setTheme(nextTheme, "user");
  },
  hydrateTheme: (theme, source) => {
    persistTheme(theme, source);
    set({ theme, source, isHydrated: true, error: null });
  },
  setSaving: (isSaving) => set({ isSaving }),
  setError: (error) => set({ error }),
}));

export function getResolvedTheme(theme: ThemePreference): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}
