import { Outlet } from "react-router-dom";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { ErrorBoundary } from "@/components/shared/error-boundary";

/**
 * Root shell: fixed header + collapsible sidebar + scrollable main content.
 * All authenticated pages render inside <Outlet />.
 */
export function MainLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-900">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
