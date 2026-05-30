import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/store/theme-store";

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return <Button variant="ghost" onClick={toggleTheme}>{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>;
}


