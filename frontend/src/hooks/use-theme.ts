import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

/**
 * Applies the active theme class to <html>.
 * Returns isDark so callers can drive Ant Design's algorithm.
 */
export function useTheme() {
  const { theme, setTheme } = useUIStore();

  const systemDark =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;

  const isDark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, setTheme, isDark, toggleTheme };
}
