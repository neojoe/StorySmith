import { Menu, Sun, Moon, BookOpen, Languages } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/i18n";

export function Header() {
  const { toggleSidebar } = useUIStore();
  const { isDark, toggleTheme } = useTheme();
  const { t, lang, setLang } = useI18n();

  const ThemeIcon = isDark ? Sun : Moon;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-800">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={t.header.toggleSidebar}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 dark:bg-primary-500">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            {import.meta.env.VITE_APP_NAME ?? t.header.appName}
          </span>
        </Link>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* Language toggle */}
        <button
          type="button"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          aria-label={t.header.switchLang}
          className="flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-primary transition-colors cursor-pointer select-none"
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{lang === "zh" ? "EN" : "中"}</span>
        </button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={t.header.switchTheme}
          title={isDark ? "切换到亮色" : "切换到暗色"}
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
