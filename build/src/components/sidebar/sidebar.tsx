import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { SidebarMenu } from "./sidebar-menu";
import { useLayoutStore } from "@/store/layout-store";
import { useAuthStore } from "@/store/auth-store";
import { apiClient } from "@/services/api-client";
import { logoutRequest } from "@/services/auth-service";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { CompanyItem } from "@/services/settings-service";

function useCompanyName() {
  const user = useAuthStore((s) => s.user);
  // Only fetch if user has a company_id
  const { data } = useQuery({
    queryKey: ["company-name", user?.company_id],
    queryFn: () => apiClient<CompanyItem>(`/settings/companies/${user?.company_id}`),
    enabled: !!user?.company_id,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });
  return (data as CompanyItem | undefined)?.name ?? "HRMS";
}

export function Sidebar() {
  const open      = useLayoutStore((s) => s.sidebarOpen);
  const user      = useAuthStore((s) => s.user);
  const logout    = useAuthStore((s) => s.logout);
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const company   = useCompanyName();

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      logout();
      qc.clear();
      navigate("/auth/login");
    },
  });

  return (
    <motion.aside
      animate={{ width: open ? 280 : 84 }}
      className={[
        "fixed left-0 top-0 z-40 flex h-screen flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--card)] p-4 shadow-xl transition-transform md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
    >
      {/* Company branding */}
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
          {company.slice(0, 1).toUpperCase()}
        </div>
        {open && (
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{company}</div>
            <div className="text-xs text-[var(--muted)]">Enterprise suite</div>
          </div>
        )}
      </div>

      {/* Navigation menu */}
      <div className="flex-1">
        {open && <SidebarMenu />}
      </div>

      {/* User card + logout at bottom */}
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        {open ? (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold leading-tight">{user?.name ?? "User"}</p>
              <p className="truncate text-[10px] text-[var(--muted)]">{user?.email ?? ""}</p>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title="Log out"
              className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-red-50 hover:text-red-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        ) : (
          // Collapsed state — just show avatar + logout icon stacked
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
              {initials}
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title="Log out"
              className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-red-50 hover:text-red-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}