import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useLayoutStore } from "@/store/layout-store";
import { useAuthStore } from "@/store/auth-store";
import { apiClient } from "@/services/api-client";
import { SidebarMenu } from "./sidebar-menu";
import type { CompanyItem } from "@/services/settings-service";

function useCompanyName() {
  const user = useAuthStore((s) => s.user);

  const nameFromUser = (user as any)?.company?.name ?? null;

  const { data } = useQuery({
    queryKey: ["company-name", user?.company_id],
    queryFn: () => apiClient<CompanyItem>(`/settings/companies/${user?.company_id}`),
    enabled: !!user?.company_id && !nameFromUser,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  return nameFromUser ?? (data as CompanyItem | undefined)?.name ?? "Enterprise";
}

export function Sidebar() {
  const open    = useLayoutStore((s) => s.sidebarOpen);
  const company = useCompanyName();
  const letter  = company.slice(0, 1).toUpperCase();

  return (
    <motion.aside
      animate={{ width: open ? 272 : 72 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden transition-transform duration-300 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{
        background: "linear-gradient(180deg, var(--card) 0%, color-mix(in srgb, var(--card) 92%, var(--primary)) 100%)",
        borderRight: "1px solid var(--border)",
        boxShadow: "4px 0 32px rgba(37,99,235,0.07), 2px 0 8px rgba(0,0,0,0.05)",
      }}
    >
      {/* Glossy top accent bar */}
      <div
        className="absolute inset-x-0 top-0 z-10 h-[3px]"
        style={{
          background: "linear-gradient(90deg, var(--primary) 0%, #60a5fa 50%, var(--primary) 100%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 3s linear infinite",
        }}
      />

      {/* Subtle decorative glow blob */}
      <div
        className="absolute -top-12 -left-12 h-40 w-40 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Brand header */}
      <div
        className="relative z-10 flex h-[64px] shrink-0 items-center gap-3 px-4"
        style={{
          borderBottom: "1px solid color-mix(in srgb, var(--border) 80%, var(--primary))",
          background: "linear-gradient(135deg, color-mix(in srgb, var(--card) 98%, var(--primary)) 0%, var(--card) 100%)",
        }}
      >
        {/* Glossy logo mark */}
        <div
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-[14px] font-black text-white"
          style={{
            background: "linear-gradient(145deg, #3b82f6 0%, #1d4ed8 60%, #1e40af 100%)",
            boxShadow: "0 4px 16px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        >
          {/* Shine overlay */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
          >
            <div
              className="absolute inset-x-0 top-0 h-1/2"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
              }}
            />
          </div>
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
              <p className="truncate text-[13px] font-extrabold leading-none tracking-tight text-[var(--text)]">
                {company}
              </p>
              <p
                className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em]"
                style={{ color: "var(--primary)" }}
              >
                HRMS Platform
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className={open ? "px-3 py-4" : "px-2 py-4"}>
          <SidebarMenu collapsed={!open} />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </motion.aside>
  );
}
