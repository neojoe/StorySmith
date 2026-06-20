import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider, App as AntApp, theme as antdThemeLib } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { router } from "@/router";
import { useTheme } from "@/hooks/use-theme";
import { I18nProvider, useI18n } from "@/i18n";

// ─── TanStack Query Client ─────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Theme + Locale Bridge ─────────────────────────────────────
function AppBridge() {
  const { isDark } = useTheme();
  const { lang } = useI18n();

  const antdTheme = {
    algorithm: isDark ? antdThemeLib.darkAlgorithm : antdThemeLib.defaultAlgorithm,
    token: {
      colorPrimary:  "#2563eb",
      colorSuccess:  "#22c55e",
      colorWarning:  "#f59e0b",
      colorError:    "#ef4444",
      borderRadius:  8,
      fontFamily:    "Inter, system-ui, -apple-system, sans-serif",
    },
  };

  return (
    <ConfigProvider locale={lang === "zh" ? zhCN : enUS} theme={antdTheme}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

// ─── Root App ──────────────────────────────────────────────────
export default function App() {
  return (
    <StyleProvider hashPriority="high">
      <I18nProvider>
        <AppBridge />
      </I18nProvider>
    </StyleProvider>
  );
}
