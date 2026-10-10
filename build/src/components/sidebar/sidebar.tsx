import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const open      = useLayoutStore((s) => s.sidebarOpen);
  const toggle    = useLayoutStore((s) => s.toggleSidebar);
  const company   = useCompanyName();
  const user      = useAuthStore((s) => s.user);
  const avatarUrl = (user as any)?.profile_image ?? (user as any)?.employee?.profile_image ?? null;
  const role      = user?.rolesRelation?.[0]?.name ?? user?.roles?.[0]?.name ?? company;
  const initials  = (user?.name ?? "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <motion.aside
      animate={{ width: open ? 272 : 76 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col transition-transform duration-300 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{
        background:
          "linear-gradient(180deg, rgba(40, 12, 22, 0.78) 0%, rgba(18, 8, 14, 0.82) 100%)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "8px 0 40px rgba(0,0,0,0.35)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Collapse toggle on the edge */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        className="absolute -right-3 top-6 z-50 hidden h-6 w-6 place-items-center rounded-full text-white/80 transition hover:text-white md:grid"
        style={{ background: "rgba(40,20,28,0.95)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
      >
        {open ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {/* Profile header */}
      <div className={`flex shrink-0 items-center gap-3 pb-4 pt-5 ${open ? "px-4" : "justify-center px-2"}`}>
        <div
          className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full text-[13px] font-bold text-white"
          style={{
            background: "linear-gradient(145deg, var(--primary), color-mix(in srgb, var(--primary) 50%, #000))",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.15)",
          }}
        >
          {avatarUrl ? <img src={avatarUrl} alt={user?.name ?? "User"} className="h-full w-full object-cover" /> : initials}
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="min-w-0"
            >
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-white/50">{role}</p>
              <p className="truncate text-[14px] font-semibold text-white">{user?.name ?? company}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mx-4 h-px shrink-0 bg-white/[0.06]" />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className={open ? "px-3 py-4" : "px-2 py-4"}>
          <SidebarMenu collapsed={!open} />
        </div>
      </div>
    </motion.aside>
  );
}
