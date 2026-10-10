import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TopNavbar } from "@/components/navbar/top-navbar";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { PageLoader } from "@/app/components/page-loader";
import { OrbitWidget } from "@/components/orbit/orbit-widget";
import { useLayoutStore } from "@/store/layout-store";

export function AppLayout() {
  const open = useLayoutStore((s) => s.sidebarOpen);
  const toggle = useLayoutStore((s) => s.toggleSidebar);
  const closeSidebar = useLayoutStore((s) => s.closeSidebar);
  const location = useLocation();

  // On mobile the sidebar is an overlay drawer — close it after navigating.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      closeSidebar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      <div className="app-wallpaper" aria-hidden />

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
      <div className={`transition-all duration-300 ${open ? "md:ml-[272px]" : "md:ml-[68px]"}`}>
        <TopNavbar />

        <main className="mx-auto max-w-[1600px] p-4 md:p-8">
          <Breadcrumbs />

          <AnimatePresence mode="wait">
            <motion.div
              key={typeof window !== "undefined" ? window.location.pathname : "page"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <OrbitWidget />
    </div>
  );
}