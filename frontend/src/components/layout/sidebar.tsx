import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  ChevronLeft,
  BookOpen,
  Film,
  Lightbulb,
  MonitorSmartphone,
  Lock,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useUIStore } from "@/stores/ui-store";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

function DisabledNavItem({
  label,
  Icon,
  badge,
  sidebarOpen,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  sidebarOpen: boolean;
}) {
  return (
    <div
      title={badge}
      className="flex cursor-not-allowed select-none items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium opacity-45 text-neutral-500 dark:text-neutral-500"
    >
      <span className="shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      {sidebarOpen && (
        <span className="flex flex-1 items-center justify-between gap-2 truncate">
          <span className="truncate">{label}</span>
          <span className="flex items-center gap-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
            <Lock className="h-2.5 w-2.5" />
            {badge}
          </span>
        </span>
      )}
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { t } = useI18n();

  const activeClass =
    "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400";
  const inactiveClass =
    "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700";
  const linkCls = (isActive: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150",
      isActive ? activeClass : inactiveClass,
    );

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-neutral-200 bg-white transition-all duration-200",
        "dark:border-neutral-700 dark:bg-neutral-800",
        sidebarOpen ? "w-56" : "w-14",
      )}
    >
      <nav className="flex flex-1 flex-col gap-1 p-2 pt-4">
        {/* ── Main ── */}
        {[
          { to: "/", label: t.nav.home, icon: Home, end: true },
          { to: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
        ].map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => linkCls(isActive)}>
            <Icon className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span className="truncate">{label}</span>}
          </NavLink>
        ))}

        {/* ── AI 创作 ── */}
        {sidebarOpen && (
          <p className="mb-1 mt-3 px-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t.nav.aiCreation}
          </p>
        )}
        {!sidebarOpen && <div className="mx-2 my-1 h-px bg-neutral-200 dark:bg-neutral-700" />}

        {/* AI 灵感 — 放在最前面 */}
        <NavLink to="/novel/ideas" className={({ isActive }) => linkCls(isActive)}>
          <Lightbulb className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span className="truncate">{t.nav.aiIdeas}</span>}
        </NavLink>

        {/* AI 小说创作 */}
        <NavLink to="/novel" className={({ isActive }) => linkCls(isActive)}>
          <BookOpen className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span className="truncate">{t.nav.novelFactory}</span>}
        </NavLink>

        {/* AI 漫剧工厂 — 禁用 */}
        <DisabledNavItem
          label={t.nav.dramaFactory}
          Icon={Film}
          badge={t.common.comingSoon}
          sidebarOpen={sidebarOpen}
        />

        {/* ── 平台 ── */}
        {sidebarOpen && (
          <p className="mb-1 mt-3 px-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {t.nav.platform}
          </p>
        )}
        {!sidebarOpen && <div className="mx-2 my-1 h-px bg-neutral-200 dark:bg-neutral-700" />}

        {/* 平台发布 — 禁用 */}
        <DisabledNavItem
          label={t.nav.platformPublish}
          Icon={MonitorSmartphone}
          badge={t.common.comingSoon}
          sidebarOpen={sidebarOpen}
        />
      </nav>

      {/* Collapse */}
      <div className="border-t border-neutral-200 p-2 dark:border-neutral-700">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="w-full"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              !sidebarOpen && "rotate-180",
            )}
          />
        </Button>
      </div>
    </aside>
  );
}
