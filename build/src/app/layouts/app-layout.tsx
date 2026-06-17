import { Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TopNavbar } from "@/components/navbar/top-navbar";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { ErrorBoundary } from "@/app/error/error-boundary";
import { useLayoutStore } from "@/store/layout-store";

export function AppLayout() {
  const open = useLayoutStore((s) => s.sidebarOpen);
  const toggle = useLayoutStore((s) => s.toggleSidebar);

  return (
    <div className="min-h-screen bg-[var(--background)]">

      {/* ── Sidebar ── */}
      <Sidebar />

      {/* ── Mobile overlay backdrop ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={toggle}
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* ── Main content area ── */}
      <div
        className="transition-all duration-300"
        style={{ marginLeft: open ? "272px" : "68px" }}
      >
        {/* On mobile, ignore the sidebar margin */}
        <style>{`
          @media (max-width: 767px) {
            .ml-sidebar { margin-left: 0 !important; }
          }
        `}</style>

        <TopNavbar />

        <main className="mx-auto max-w-[1600px] p-4 md:p-8">
          <Breadcrumbs />

          {/* Error boundary wraps every page */}
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={typeof window !== "undefined" ? window.location.pathname : "page"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>

    </div>
  );
}