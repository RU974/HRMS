import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/store/theme-store";

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useThemeStore();
  return <Button variant="ghost" onClick={toggleTheme}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</Button>;
}


