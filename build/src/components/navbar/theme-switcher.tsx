import { Loader2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetTheme, saveTheme } from "@/services/theme-service";
import { getResolvedTheme, useThemeStore } from "@/store/theme-store";

export function ThemeSwitcher() {
  const theme = useThemeStore((state) => state.theme);
  const source = useThemeStore((state) => state.source);
  const isSaving = useThemeStore((state) => state.isSaving);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setSaving = useThemeStore((state) => state.setSaving);
  const setError = useThemeStore((state) => state.setError);

  const isDark = getResolvedTheme(theme) === "dark";

  async function handleToggle() {
    const snapshot = { theme, source };
    const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

    setSaving(true);
    setError(null);
    setTheme(nextTheme, "user");

    try {
      const response = await saveTheme({ theme: nextTheme });
      setTheme(response.theme, response.source);
    } catch (error) {
      setTheme(snapshot.theme, snapshot.source);
      setError(error instanceof Error ? error.message : "Unable to save theme.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const snapshot = { theme, source };

    setSaving(true);
    setError(null);

    try {
      const response = await resetTheme();
      setTheme(response.theme, response.source);
    } catch (error) {
      setTheme(snapshot.theme, snapshot.source);
      setError(error instanceof Error ? error.message : "Unable to reset theme.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button variant="ghost" onClick={handleToggle} onContextMenu={(event) => { event.preventDefault(); void handleReset(); }} disabled={isSaving} title={`Theme: ${theme}${source !== "system" ? ` (${source})` : ""}`}>
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
