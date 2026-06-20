import { createBrowserRouter, Navigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/main-layout";
import { HomePage } from "@/pages/home";
import { DashboardPage } from "@/pages/dashboard";
import { NotFoundPage } from "@/pages/not-found";
import { NovelPage } from "@/pages/novel";
import { WorkspacePage } from "@/pages/novel/workspace";
import { ReaderPage } from "@/pages/novel/reader";
import { AgentNovelPage } from "@/pages/novel/agent";
import { NovelIdeasPage } from "@/pages/novel/ideas";
import { PlatformPage } from "@/pages/platform";
import { DramaPage } from "@/pages/drama";
import { DramaWorkspacePage } from "@/pages/drama/workspace";

/**
 * Application route tree.
 *
 * Pattern: all authenticated routes are nested under MainLayout,
 * which renders <Outlet /> in the page content area. Adding a new
 * page is as simple as adding one object here and creating the page file.
 *
 * Future extension:
 *   { path: "drama",  element: <DramaPage />  }   — AI 短剧自动化
 *   { path: "comic",  element: <ComicPage />  }   — AI 漫剧自动化
 */
export const router = createBrowserRouter([
  // Full-page reader (no shell, clean reading view)
  { path: "/novel/:id/read", element: <ReaderPage /> },

  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "dashboard", element: <DashboardPage /> },

      // AI 小说自动化
      { path: "novel", element: <NovelPage /> },
      { path: "novel/ideas", element: <NovelIdeasPage /> },
      { path: "novel/agent/new", element: <AgentNovelPage /> },
      { path: "novel/:id", element: <WorkspacePage /> },

      // AI 漫剧工厂
      { path: "drama", element: <DramaPage /> },
      { path: "drama/:id", element: <DramaWorkspacePage /> },

      // 平台账号管理
      { path: "platform", element: <PlatformPage /> },

      // Catch-all: redirect unknown paths to 404
      { path: "404", element: <NotFoundPage /> },
      { path: "*", element: <Navigate to="/404" replace /> },
    ],
  },
]);
