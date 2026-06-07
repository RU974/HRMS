import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useLayoutStore } from "@/store/layout-store";
import { useAuthStore } from "@/store/auth-store";
import { apiClient } from "@/services/api-client";
import { SidebarMenu } from "./sidebar-menu";
import type { CompanyItem } from "@/services/settings-service";

function useCompanyName() {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery({
    queryKey: ["company-name", user?.company_id],
    queryFn: () => apiClient<CompanyItem>(`/settings/companies/${user?.company_id}`),
    enabled: !!user?.company_id,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return (data as CompanyItem | undefined)?.name ?? "Enterprise";
}

export function Sidebar() {
  const open    = useLayoutStore((s) => s.sidebarOpen);
  const company = useCompanyName();
  const letter  = company.slice(0, 1).toUpperCase();

  return (
    <motion.aside
      animate={{ width: open ? 272 : 72 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden bg-[var(--card)] border-r border-[var(--border)]"
      style={{ boxShadow: "2px 0 16px rgba(0,0,0,0.06)" }}
    >
      {/* ── Top primary accent line ── */}
      <div
        className="absolute inset-x-0 top-0 z-10 h-[2px]"
        style={{
          background: "linear-gradient(90deg, var(--primary) 0%, rgba(37,99,235,0.3) 100%)",
        }}
      />

      {/* ── Brand header ── */}
      <div className="relative z-10 flex h-[60px] shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
        {/* Logo mark */}
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, var(--primary) 0%, #60a5fa 100%)" }}
        >
          {letter}
        </div>

        {/* Company name */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="min-w-0 overflow-hidden"
            >
              <p className="truncate text-[13px] font-bold leading-none text-[var(--text)]">
                {company}
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                HRMS Platform
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ── */}
      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className={open ? "px-3 py-4" : "px-2 py-4"}>
          <SidebarMenu collapsed={!open} />
        </div>
      </div>
    </motion.aside>
  );
}