import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import translations, { type Lang } from "./translations";

// ── Types ─────────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: typeof translations.zh;
}

// ── Context ───────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue>({
  lang: "zh",
  setLang: () => {},
  t: translations.zh,
});

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "app-lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "en" || stored === "zh" ? stored : "zh";
    } catch {
      return "zh";
    }
  });

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  // Sync <html lang> attribute for accessibility
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useI18n() {
  return useContext(I18nContext);
}
