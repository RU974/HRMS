import { Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TopNavbar } from "@/components/navbar/top-navbar";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { useLayoutStore } from "@/store/layout-store";

export function AppLayout() {
  const open = useLayoutStore((s) => s.sidebarOpen);
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar />
      <div className={open ? "transition-all md:ml-[280px]" : "transition-all md:ml-[84px]"}>
        <TopNavbar />
        <main className="mx-auto max-w-[1600px] p-4 md:p-8">
          <Breadcrumbs />
          <AnimatePresence mode="wait">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}


