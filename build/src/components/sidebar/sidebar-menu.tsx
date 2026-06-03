import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarRange, ChevronDown, ChevronRight, LogIn, LogOut, MessageCircleMore, WalletCards } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";
import { logoutRequest } from "@/services/auth-service";
import { checkInAttendance, checkOutAttendance } from "@/services/hr-management-service";
import { useAuthStore } from "@/store/auth-store";
import { getVisibleSidebarSections } from "@/config/sidebar-config";

function isActivePath(currentPath: string, currentSearch: string, target?: string) {
  if (!target) {
    return false;
  }

  const [path, search = ""] = target.split("?");
  if (search) {
    return currentPath === path && currentSearch === `?${search}`;
  }

  return currentPath === path || currentPath.startsWith(`${path}/`);
}

function SectionItem({
  label,
  path,
  icon: Icon,
  children,
  active,
  open,
  onToggle,
  pathname,
  search,
}: {
  label: string;
  path?: string;
  icon: ComponentType<{ className?: string }>;
  children?: Array<{ label: string; path?: string }>;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  pathname: string;
  search: string;
}) {
  const hasChildren = (children?.length ?? 0) > 0;
  const childItems = children ?? [];

  return (
    <div className="space-y-1">
      <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 transition", active ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text)] hover:bg-[var(--border)]/35")}>
        <Icon className="h-4 w-4 shrink-0" />
        {path ? (
          <Link to={path} className="min-w-0 flex-1 text-sm font-medium">
            {label}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
        )}
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full p-1 transition hover:bg-black/5 hover:text-inherit"
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {hasChildren && open ? (
        <div className="ml-6 space-y-1 border-l border-[var(--border)] pl-3">
          {childItems.map((child) => {
            const childActive = isActivePath(pathname, search, child.path);
            return child.path ? (
              <Link
                key={`${label}-${child.label}`}
                to={child.path}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  childActive ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text)] hover:bg-[var(--border)]/35"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current/70" />
                <span>{child.label}</span>
              </Link>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}

function EmployeeShortcuts() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const employeeId = user?.employee?.id;

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) {
        throw new Error("Employee profile is missing.");
      }

      return checkInAttendance(employeeId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] });
      setFeedback({ type: "success", message: "Check-in recorded." });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to record check-in." });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) {
        throw new Error("Employee profile is missing.");
      }

      return checkOutAttendance(employeeId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] });
      setFeedback({ type: "success", message: "Check-out recorded." });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to record check-out." });
    },
  });

  const leaveLinkVisible = hasPermission("request own leave") || hasPermission("view leaves") || hasPermission("approve leaves") || hasPermission("manage leaves");
  const payrollLinkVisible = hasPermission("view own payroll") || hasPermission("view payroll") || hasPermission("manage payroll");

  if (!employeeId) {
    return null;
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="px-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Quick Access</p>
      </div>

      {feedback ? (
        <div className={cn("mx-3 rounded-lg px-3 py-2 text-xs font-medium", feedback.type === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600")}>
          {feedback.message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void checkInMutation.mutateAsync()}
        disabled={checkInMutation.isPending || checkOutMutation.isPending}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
          "text-[var(--text)] hover:bg-[var(--border)]/35",
          (checkInMutation.isPending || checkOutMutation.isPending) && "cursor-not-allowed opacity-60"
        )}
      >
        <LogIn className="h-4 w-4 shrink-0" />
        <span>{checkInMutation.isPending ? "Checking in..." : "Check In"}</span>
      </button>

      <button
        type="button"
        onClick={() => void checkOutMutation.mutateAsync()}
        disabled={checkInMutation.isPending || checkOutMutation.isPending}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
          "text-[var(--text)] hover:bg-[var(--border)]/35",
          (checkInMutation.isPending || checkOutMutation.isPending) && "cursor-not-allowed opacity-60"
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        <span>{checkOutMutation.isPending ? "Checking out..." : "Check Out"}</span>
      </button>

      {leaveLinkVisible ? (
        <Link to="/leaves" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--border)]/35">
          <CalendarRange className="h-4 w-4 shrink-0" />
          <span>Request Leave</span>
        </Link>
      ) : null}
      {payrollLinkVisible ? (
        <Link to="/payroll?tab=payslips" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--border)]/35">
          <WalletCards className="h-4 w-4 shrink-0" />
          <span>Payroll</span>
        </Link>
      ) : null}
      <Link to="/notifications" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--border)]/35">
        <Bell className="h-4 w-4 shrink-0" />
        <span>Notifications</span>
      </Link>
      <Link to="/chat" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--border)]/35">
        <MessageCircleMore className="h-4 w-4 shrink-0" />
        <span>Support</span>
      </Link>
    </div>
  );
}

export function SidebarMenu() {
  const { pathname, search } = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const visibleSections = useMemo(() => getVisibleSidebarSections(user), [user]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleSections.map((section) => [section.title, true])) as Record<string, boolean>
  );

  useEffect(() => {
    setOpenSections(Object.fromEntries(visibleSections.map((section) => [section.title, true])) as Record<string, boolean>);
  }, [visibleSections]);

  async function handleLogout() {
    await logoutRequest().catch(() => null);
    logout();
    window.location.href = "/auth/login";
  }

  return (
    <nav className="space-y-5">
      {visibleSections.map((section) => {
        const isOpen = openSections[section.title] ?? true;

        return (
          <div key={section.title}>
            <button
              type="button"
              onClick={() => setOpenSections((prev) => ({ ...prev, [section.title]: !isOpen }))}
              className="mb-2 flex w-full items-center justify-between px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]"
            >
              <span>{section.title}</span>
              <span className="text-sm">{isOpen ? "▼" : "▶"}</span>
            </button>
            {isOpen ? (
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, search, item.path) || item.children?.some((child) => isActivePath(pathname, search, child.path)) || false;
                  const itemOpen = openSections[`${section.title}:${item.label}`] ?? active;

                  return (
                    <SectionItem
                      key={`${section.title}-${item.label}`}
                      label={item.label}
                      path={item.path}
                      icon={item.icon}
                      children={item.children?.map((child) => ({ label: child.label, path: child.path }))}
                      active={active}
                      open={itemOpen}
                      pathname={pathname}
                      search={search}
                      onToggle={() => setOpenSections((prev) => ({ ...prev, [`${section.title}:${item.label}`]: !itemOpen }))}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      <EmployeeShortcuts />

      <div className="border-t border-[var(--border)] pt-4">
        <Link to="/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--border)]/35">
          Profile
        </Link>
        <button onClick={handleLogout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10">
          Logout
        </button>
      </div>
    </nav>
  );
}
