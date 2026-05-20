import { motion } from "framer-motion";
import { SidebarMenu } from "./sidebar-menu";
import { useLayoutStore } from "@/store/layout-store";

export function Sidebar() {
  const open = useLayoutStore((s) => s.sidebarOpen);
  return (
    <motion.aside
      animate={{ width: open ? 280 : 84 }}
      className={[
        "fixed left-0 top-0 z-40 h-screen overflow-y-auto border-r border-[var(--border)] bg-[var(--card)] p-4 shadow-xl transition-transform md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      ].join(" ")}
    >
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">H</div>
        {open && (
          <div>
            <div className="text-sm font-bold">HRMS One</div>
            <div className="text-xs text-[var(--muted)]">Enterprise suite</div>
          </div>
        )}
      </div>
      {open && <SidebarMenu />}
    </motion.aside>
  );
}


