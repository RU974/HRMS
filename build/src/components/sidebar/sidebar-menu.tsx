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
import { toast } from "@/components/notifications/toast";

function isActivePath(currentPath: string, currentSearch: string, target?: string) {
  if (!target) return false;
  const [path, search = ""] = target.split("?");
  if (search) return currentPath === path && currentSearch === `?${search}`;
  return currentPath === path || currentPath.startsWith(`${path}/`);
}

/* ── Glossy active pill ── */
const glossyActive = {
  background: "linear-gradient(145deg, #3b82f6 0%, #2563eb 55%, #1d4ed8 100%)",
  boxShadow: "0 4px 14px rgba(37,99,235,0.38), inset 0 1px 0 rgba(255,255,255,0.28)",
} as const;

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
    "relative flex items-center gap-2.5 rounded-xl transition-all duration-200 cursor-pointer select-none",
    collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
    !active && "text-[var(--text)] hover:bg-[var(--primary)]/8 hover:text-[var(--primary)]"
  );

  const inner = (
    <>
      {/* Glossy shine overlay for active state */}
      {active && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div
            className="absolute inset-x-0 top-0 h-1/2"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)" }}
          />
        </div>
      )}

      {/* Icon container */}
      <div className={cn(
        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
        active ? "bg-white/20" : ""
      )}>
        <Icon className={cn(
          "h-[15px] w-[15px] transition-colors",
          active ? "text-white drop-shadow-sm" : "text-[var(--muted)]"
        )} />
      </div>

      {!collapsed && (
        <>
          <span className={cn(
            "flex-1 min-w-0 truncate text-[13px] font-semibold leading-none",
            active ? "text-white drop-shadow-sm" : "text-[var(--text)]"
          )}>
            {label}
          </span>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
                active ? "text-white/80 hover:text-white" : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
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
        <Link
          to={path}
          className={rowClass}
          title={collapsed ? label : undefined}
          style={active ? glossyActive : undefined}
        >
          {inner}
        </Link>
      ) : (
        <div
          className={rowClass}
          onClick={hasChildren ? onToggle : undefined}
          title={collapsed ? label : undefined}
          style={active ? glossyActive : undefined}
        >
          {inner}
        </div>
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
            <div
              className="ml-[14px] mt-1 space-y-0.5 pl-3"
              style={{ borderLeft: "2px solid color-mix(in srgb, var(--primary) 25%, var(--border))" }}
            >
              {(children ?? []).map((child) => {
                const childActive = isActivePath(pathname, search, child.path ?? "");
                return child.path ? (
                  <Link
                    key={child.label}
                    to={child.path}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-150",
                      childActive
                        ? "text-white"
                        : "text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/8"
                    )}
                    style={childActive ? {
                      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                      boxShadow: "0 2px 8px rgba(37,99,235,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                    } : undefined}
                  >
                    {childActive && (
                      <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
                        <div
                          className="absolute inset-x-0 top-0 h-1/2"
                          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }}
                        />
                      </div>
                    )}
                    <span className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                      childActive ? "bg-white shadow-sm" : "bg-[var(--border)]"
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
  if (collapsed) {
    return (
      <div
        className="my-3 mx-2 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-1.5 flex w-full items-center justify-between px-3 py-1 group transition-colors"
    >
      <span
        className="text-[9.5px] font-black uppercase tracking-[0.2em] transition-colors"
        style={{ color: "color-mix(in srgb, var(--primary) 60%, var(--muted))" }}
      >
        {title}
      </span>
      <span
        className="flex h-4 w-4 items-center justify-center rounded-md transition-all"
        style={{ color: "var(--muted)" }}
      >
        {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
      </span>
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
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-semibold",
    "text-[var(--text)] transition-all duration-150",
    collapsed && "justify-center px-0 py-2.5",
    disabled && "opacity-40 cursor-not-allowed pointer-events-none"
  );

  const content = (
    <>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150"
        style={{
          background: accent ? `${accent}1a` : undefined,
          color: accent,
          boxShadow: accent ? `0 2px 8px ${accent}22` : undefined,
        }}
      >
        <Icon className="h-[14px] w-[14px]" />
      </div>
      {!collapsed && <span className="text-[var(--text)]">{loading ? "Working…" : label}</span>}
    </>
  );

  if (path) {
    return (
      <Link
        to={path}
        className={className}
        title={collapsed ? label : undefined}
        style={{ "--hover-bg": `${accent}12` } as React.CSSProperties}
        onMouseEnter={(e) => { if (accent) (e.currentTarget as HTMLElement).style.background = `${accent}12`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={collapsed ? label : undefined}
      onMouseEnter={(e) => { if (accent) (e.currentTarget as HTMLElement).style.background = `${accent}12`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
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

  const leaveLinkVisible   = hasPermission("leaves:view") || hasPermission("leaves:approve");
  const payrollLinkVisible = hasPermission("payroll:view") || hasPermission("payroll:manage_settings") || hasPermission("payroll:view_own");
  const showComms          = isSuperAdminRole(user);

  if (!employeeId) return null;

  const busy = checkIn.isPending || checkOut.isPending;

  return (
    <div className="space-y-0.5 pt-1">
      {!collapsed && (
        <p
          className="mb-1.5 px-3 text-[9.5px] font-black uppercase tracking-[0.2em]"
          style={{ color: "color-mix(in srgb, var(--primary) 60%, var(--muted))" }}
        >
          Quick Access
        </p>
      )}

      {feedback && !collapsed && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className={cn(
            "mx-3 mb-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold",
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-600 border border-red-200"
          )}
        >
          {feedback.msg}
        </motion.div>
      )}

      <QuickButton icon={LogIn}              label="Check In"       onClick={() => checkIn.mutate()}  loading={checkIn.isPending}  disabled={busy} accent="#10b981" collapsed={collapsed} />
      <QuickButton icon={LogOut}             label="Check Out"      onClick={() => checkOut.mutate()} loading={checkOut.isPending} disabled={busy} accent="#f59e0b" collapsed={collapsed} />
      {leaveLinkVisible   && <QuickButton icon={CalendarRange}     label="Request Leave"  path="/leaves"               accent="#6366f1" collapsed={collapsed} />}
      {payrollLinkVisible && <QuickButton icon={WalletCards}       label="My Payslips"    path="/profile?tab=payslips" accent="#0ea5e9" collapsed={collapsed} />}
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
    onSettled: () => {
      toast.info("Goodbye!", `See you soon, ${user?.name?.split(" ")[0] ?? "there"}.`);
      logout();
      qc.clear();
      navigate("/auth/login");
    },
  });

  const initials = (user?.name ?? "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const role     = user?.rolesRelation?.[0]?.name ?? user?.roles?.[0]?.name ?? "Employee";

  return (
    <div
      className="shrink-0 p-3"
      style={{ borderTop: "1px solid color-mix(in srgb, var(--border) 80%, var(--primary))" }}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2.5">
          <Link to="/profile" title="My profile">
            <div
              className="relative grid h-9 w-9 place-items-center rounded-xl text-[12px] font-bold text-white"
              style={{
                background: "linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)",
                boxShadow: "0 4px 12px rgba(37,99,235,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            >
              <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)" }} />
              </div>
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
        <div
          className="relative flex items-center gap-3 rounded-xl p-3 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--background)) 0%, var(--background) 100%)",
            border: "1px solid color-mix(in srgb, var(--primary) 20%, var(--border))",
            boxShadow: "0 2px 12px rgba(37,99,235,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          {/* Subtle shine on card */}
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)" }}
          />

          <Link to="/profile" title="My profile" className="shrink-0">
            <div
              className="relative grid h-9 w-9 place-items-center rounded-xl text-[12px] font-bold text-white"
              style={{
                background: "linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)",
                boxShadow: "0 4px 12px rgba(37,99,235,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            >
              <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)" }} />
              </div>
              {initials}
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-emerald-500" style={{ boxShadow: "0 0 6px rgba(16,185,129,0.6)" }} />
            </div>
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold leading-tight text-[var(--text)]">
              {user?.name ?? "User"}
            </p>
            <p className="truncate text-[10px] leading-tight font-medium" style={{ color: "color-mix(in srgb, var(--primary) 70%, var(--muted))" }}>
              {role}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/profile"
              title="Profile"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-all"
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

        <div className="pt-3" style={{ borderTop: "1px solid color-mix(in srgb, var(--border) 80%, var(--primary))" }}>
          <EmployeeShortcuts collapsed={collapsed} />
        </div>
      </nav>

      <UserCard collapsed={collapsed} />
    </div>
  );
}
