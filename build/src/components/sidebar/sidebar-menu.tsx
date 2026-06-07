import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, CalendarRange, ChevronDown, ChevronRight,
  LogIn, LogOut, MessageCircleMore, WalletCards,
  User, Power,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/utils/cn";
import { logoutRequest } from "@/services/auth-service";
import { checkInAttendance, checkOutAttendance } from "@/services/hr-management-service";
import { useAuthStore } from "@/store/auth-store";
import { getVisibleSidebarSections } from "@/config/sidebar-config";
import { isSuperAdminRole } from "@/config/rbac";

function isActivePath(currentPath: string, currentSearch: string, target?: string) {
  if (!target) return false;
  const [path, search = ""] = target.split("?");
  if (search) return currentPath === path && currentSearch === `?${search}`;
  return currentPath === path || currentPath.startsWith(`${path}/`);
}

function NavItem({
  label, path, icon: Icon, children, active, open, onToggle, pathname, search, collapsed,
}: {
  label: string; path?: string; icon: ComponentType<{ className?: string }>;
  children?: Array<{ label: string; path?: string }>;
  active: boolean; open: boolean; onToggle: () => void;
  pathname: string; search: string; collapsed: boolean;
}) {
  const hasChildren = (children?.length ?? 0) > 0;

  const rowClass = cn(
    "relative flex items-center gap-2.5 rounded-xl transition-all duration-150 cursor-pointer select-none",
    collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
    active
      ? "bg-[var(--primary)]/10 text-[var(--primary)]"
      : "text-[var(--text)] hover:bg-[var(--border)]/60"
  );

  const inner = (
    <>
      {active && !collapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--primary)]" />
      )}
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
        active ? "bg-[var(--primary)]/15" : ""
      )}>
        <Icon className={cn(
          "h-[15px] w-[15px] transition-colors",
          active ? "text-[var(--primary)]" : "text-[var(--muted)]"
        )} />
      </div>
      {!collapsed && (
        <>
          <span className={cn(
            "flex-1 min-w-0 truncate text-[13px] font-medium leading-none",
            active ? "text-[var(--primary)]" : "text-[var(--text)]"
          )}>
            {label}
          </span>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="space-y-0.5">
      {path ? (
        <Link to={path} className={rowClass} title={collapsed ? label : undefined}>{inner}</Link>
      ) : (
        <div className={rowClass} onClick={hasChildren ? onToggle : undefined} title={collapsed ? label : undefined}>{inner}</div>
      )}

      <AnimatePresence initial={false}>
        {hasChildren && open && !collapsed && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="ml-[14px] mt-1 space-y-0.5 border-l border-[var(--border)] pl-3">
              {(children ?? []).map((child) => {
                const childActive = isActivePath(pathname, search, child.path ?? "");
                return child.path ? (
                  <Link
                    key={child.label}
                    to={child.path}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all",
                      childActive
                        ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "text-[var(--muted)] hover:bg-[var(--border)]/60 hover:text-[var(--text)]"
                    )}
                  >
                    <span className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      childActive ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                    )} />
                    {child.label}
                  </Link>
                ) : null;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({ title, open, onToggle, collapsed }: {
  title: string; open: boolean; onToggle: () => void; collapsed: boolean;
}) {
  if (collapsed) return <div className="my-2 mx-2 h-px bg-[var(--border)]" />;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-1 flex w-full items-center justify-between px-3 py-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{title}</span>
      {open ? <ChevronDown className="h-2.5 w-2.5 opacity-50" /> : <ChevronRight className="h-2.5 w-2.5 opacity-50" />}
    </button>
  );
}

function QuickButton({
  icon: Icon, label, onClick, loading, disabled, accent, collapsed, path,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string; onClick?: () => void; loading?: boolean;
  disabled?: boolean; accent?: string; collapsed: boolean; path?: string;
}) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-medium",
    "text-[var(--text)] hover:bg-[var(--border)]/60 transition-all duration-150",
    collapsed && "justify-center px-0 py-2.5",
    disabled && "opacity-40 cursor-not-allowed pointer-events-none"
  );

  const content = (
    <>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: accent ? `${accent}18` : undefined }}
      >
        <Icon className="h-[14px] w-[14px]" style={{ color: accent } as React.CSSProperties} />
      </div>
      {!collapsed && <span className="text-[var(--text)]">{loading ? "Working…" : label}</span>}
    </>
  );

  if (path) return <Link to={path} className={className} title={collapsed ? label : undefined}>{content}</Link>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} title={collapsed ? label : undefined}>
      {content}
    </button>
  );
}

function EmployeeShortcuts({ collapsed }: { collapsed: boolean }) {
  const user          = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const qc            = useQueryClient();
  const employeeId    = user?.employee?.id;
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  const checkIn = useMutation({
    mutationFn: () => {
      if (!employeeId) throw new Error("No employee profile.");
      return checkInAttendance(employeeId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setFeedback({ type: "success", msg: "✓ Checked in" });
    },
    onError: (e: Error) => setFeedback({ type: "error", msg: e.message }),
  });

  const checkOut = useMutation({
    mutationFn: () => {
      if (!employeeId) throw new Error("No employee profile.");
      return checkOutAttendance(employeeId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setFeedback({ type: "success", msg: "✓ Checked out" });
    },
    onError: (e: Error) => setFeedback({ type: "error", msg: e.message }),
  });

  const leaveLinkVisible   = hasPermission("request own leave") || hasPermission("view leaves") || hasPermission("approve leaves");
  const payrollLinkVisible = hasPermission("view own payroll") || hasPermission("view payroll") || hasPermission("manage payroll");
  const showComms          = isSuperAdminRole(user);

  if (!employeeId) return null;

  const busy = checkIn.isPending || checkOut.isPending;

  return (
    <div className="space-y-0.5 pt-1">
      {!collapsed && (
        <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Quick Access
        </p>
      )}

      {feedback && !collapsed && (
        <div className={cn(
          "mx-3 mb-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold",
          feedback.type === "success"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-600 border border-red-200"
        )}>
          {feedback.msg}
        </div>
      )}

      <QuickButton icon={LogIn}              label="Check In"       onClick={() => checkIn.mutate()}  loading={checkIn.isPending}  disabled={busy} accent="#10b981" collapsed={collapsed} />
      <QuickButton icon={LogOut}             label="Check Out"      onClick={() => checkOut.mutate()} loading={checkOut.isPending} disabled={busy} accent="#f59e0b" collapsed={collapsed} />
      {leaveLinkVisible   && <QuickButton icon={CalendarRange}     label="Request Leave"  path="/leaves"               accent="#6366f1" collapsed={collapsed} />}
      {payrollLinkVisible && <QuickButton icon={WalletCards}       label="My Payslips"    path="/payroll?tab=payslips" accent="#0ea5e9" collapsed={collapsed} />}
      {showComms          && <QuickButton icon={Bell}              label="Notifications"  path="/notifications"        accent="#f59e0b" collapsed={collapsed} />}
      <QuickButton           icon={MessageCircleMore} label="Team Chat" path="/chat"                    accent="#8b5cf6" collapsed={collapsed} />
    </div>
  );
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const user     = useAuthStore((s) => s.user);
  const logout   = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => { logout(); qc.clear(); navigate("/auth/login"); },
  });

  const initials = (user?.name ?? "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const role     = user?.rolesRelation?.[0]?.name ?? user?.roles?.[0]?.name ?? "Employee";

  return (
    <div className="shrink-0 border-t border-[var(--border)] p-3">
      {collapsed ? (
        <div className="flex flex-col items-center gap-2.5">
          <Link to="/profile" title="My profile">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl text-[12px] font-bold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, var(--primary) 0%, #60a5fa 100%)" }}
            >
              {initials}
            </div>
          </Link>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            title="Sign out"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-all"
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
          <Link to="/profile" title="My profile" className="shrink-0">
            <div
              className="relative grid h-9 w-9 place-items-center rounded-xl text-[12px] font-bold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, var(--primary) 0%, #60a5fa 100%)" }}
            >
              {initials}
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-emerald-500" />
            </div>
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold leading-tight text-[var(--text)]">
              {user?.name ?? "User"}
            </p>
            <p className="truncate text-[10px] leading-tight text-[var(--muted)]">{role}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/profile"
              title="Profile"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--border)]/60 hover:text-[var(--text)] transition-all"
            >
              <User className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-500 transition-all"
            >
              <Power className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { pathname, search } = useLocation();
  const user = useAuthStore((s) => s.user);
  const visibleSections = useMemo(() => getVisibleSidebarSections(user), [user]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleSections.map((s) => [s.title, true]))
  );

  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};
      visibleSections.forEach((s) => { next[s.title] = prev[s.title] ?? true; });
      return next;
    });
  }, [visibleSections]);

  return (
    <div className="flex h-full flex-col gap-4">
      <nav className="flex-1 space-y-4">
        {visibleSections.map((section) => {
          const isOpen = openSections[section.title] ?? true;
          return (
            <div key={section.title}>
              <SectionLabel
                title={section.title}
                open={isOpen}
                collapsed={collapsed}
                onToggle={() => setOpenSections((p) => ({ ...p, [section.title]: !isOpen }))}
              />
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key={section.title + "-items"}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeInOut" }}
                    className="overflow-hidden space-y-0.5"
                  >
                    {section.items.map((item) => {
                      const active =
                        isActivePath(pathname, search, item.path) ||
                        (item.children?.some((c) => isActivePath(pathname, search, c.path)) ?? false);
                      const itemKey = `${section.title}:${item.label}`;
                      const itemOpen = openSections[itemKey] ?? active;

                      return (
                        <NavItem
                          key={item.label}
                          label={item.label}
                          path={item.path}
                          icon={item.icon}
                          children={item.children?.map((c) => ({ label: c.label, path: c.path }))}
                          active={active}
                          open={itemOpen}
                          pathname={pathname}
                          search={search}
                          collapsed={collapsed}
                          onToggle={() => setOpenSections((p) => ({ ...p, [itemKey]: !itemOpen }))}
                        />
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div className="border-t border-[var(--border)] pt-3">
          <EmployeeShortcuts collapsed={collapsed} />
        </div>
      </nav>

      <UserCard collapsed={collapsed} />
    </div>
  );
}