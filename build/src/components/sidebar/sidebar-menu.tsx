import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, CalendarRange, ChevronDown, ChevronRight, ChevronUp,
  MessageCircleMore, WalletCards,
  User, Power,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/utils/cn";
import { logoutRequest } from "@/services/auth-service";
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

const ACTIVE_BG = "rgba(255,255,255,0.10)";
const ACTIVE_SHADOW = "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.25)";

type NavChild = { label: string; path?: string };

function ChildLinks({ items, pathname, search }: { items: NavChild[]; pathname: string; search: string }) {
  return (
    <div className="relative ml-[22px] mt-1 space-y-0.5 pl-5">
      {items.map((child, i) => {
        const childActive = isActivePath(pathname, search, child.path ?? "");
        if (!child.path) return null;
        return (
          <div key={child.label} className="relative">
            {/* tree connector */}
            <span
              className="pointer-events-none absolute -left-5 w-4 rounded-bl-lg border-b border-l border-white/15"
              style={{ height: i === 0 ? "50%" : "calc(50% + 4px)", top: i === 0 ? 0 : -4 }}
            />
            <Link
              to={child.path}
              className={cn(
                "flex items-center rounded-xl px-3 py-2 text-[12px] font-medium transition-all duration-150",
                childActive ? "text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
              )}
              style={childActive ? { background: ACTIVE_BG, boxShadow: ACTIVE_SHADOW } : undefined}
            >
              {child.label}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function NavItem({
  label, path, icon: Icon, children, active, open, onToggle, pathname, search, collapsed,
}: {
  label: string; path?: string; icon: ComponentType<{ className?: string }>;
  children?: NavChild[];
  active: boolean; open: boolean; onToggle: () => void;
  pathname: string; search: string; collapsed: boolean;
}) {
  const hasChildren = (children?.length ?? 0) > 0;
  const [flyout, setFlyout] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlyout = (el: HTMLElement) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = el.getBoundingClientRect();
    setFlyout({ top: r.top, left: r.right + 8 });
  };
  const hideFlyout = () => {
    closeTimer.current = setTimeout(() => setFlyout(null), 120);
  };

  const rowClass = cn(
    "relative flex items-center gap-3 rounded-2xl transition-all duration-200 cursor-pointer select-none",
    collapsed ? "mx-auto h-11 w-11 justify-center" : "px-3 py-3",
    active ? "text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
  );
  const rowStyle = active ? { background: ACTIVE_BG, boxShadow: ACTIVE_SHADOW } : undefined;

  const inner = (
    <>
      <Icon className="h-[19px] w-[19px] shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-none">{label}</span>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white/60 hover:text-white"
            >
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </>
      )}
    </>
  );

  const hoverProps = collapsed && hasChildren
    ? { onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showFlyout(e.currentTarget), onMouseLeave: hideFlyout }
    : {};

  return (
    <div className="space-y-0.5">
      {path ? (
        <Link to={path} className={rowClass} title={collapsed && !hasChildren ? label : undefined} style={rowStyle} {...hoverProps}>
          {inner}
        </Link>
      ) : (
        <div className={rowClass} onClick={hasChildren ? onToggle : undefined} title={collapsed && !hasChildren ? label : undefined} style={rowStyle} {...hoverProps}>
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
            <ChildLinks items={children ?? []} pathname={pathname} search={search} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed flyout */}
      {collapsed && hasChildren && flyout && (
        <div
          className="fixed z-[60] min-w-[168px] rounded-2xl p-1.5"
          style={{
            top: flyout.top,
            left: flyout.left,
            background: "color-mix(in srgb, var(--primary) 14%, #120a0d)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            backdropFilter: "blur(16px)",
          }}
          onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }}
          onMouseLeave={hideFlyout}
        >
          {(children ?? []).map((child) => {
            const childActive = isActivePath(pathname, search, child.path ?? "");
            return child.path ? (
              <Link
                key={child.label}
                to={child.path}
                onClick={() => setFlyout(null)}
                className={cn(
                  "block rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                  childActive ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
                style={childActive ? { background: ACTIVE_BG } : undefined}
              >
                {child.label}
              </Link>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ title, open, onToggle, collapsed }: {
  title: string; open: boolean; onToggle: () => void; collapsed: boolean;
}) {
  if (collapsed) {
    return <div className="mx-3 my-3 h-px bg-white/[0.07]" />;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-1.5 flex w-full items-center justify-between px-3 py-1.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">{title}</span>
      <span className="text-white/40">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
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
    "flex items-center gap-3 rounded-2xl text-left text-[13px] font-medium text-white/65 transition-all duration-150 hover:bg-white/5 hover:text-white",
    collapsed ? "mx-auto h-11 w-11 justify-center" : "w-full px-3 py-2.5",
    disabled && "opacity-40 cursor-not-allowed pointer-events-none"
  );

  const content = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{loading ? "Working…" : label}</span>}
      {!collapsed && accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
    </>
  );

  if (path) {
    return (
      <Link to={path} className={className} title={collapsed ? label : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} title={collapsed ? label : undefined}>
      {content}
    </button>
  );
}

function EmployeeShortcuts({ collapsed }: { collapsed: boolean }) {
  const user          = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const employeeId    = user?.employee?.id;

  const leaveLinkVisible   = hasPermission("leaves:view") || hasPermission("leaves:approve");
  const payrollLinkVisible = hasPermission("payroll:view") || hasPermission("payroll:manage_settings") || hasPermission("payroll:view_own");
  const showComms          = isSuperAdminRole(user);

  if (!employeeId) return null;

  return (
    <div className="space-y-0.5 pt-1">
      {!collapsed && (
        <p
          className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40"
        >
          Quick Access
        </p>
      )}

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

  return (
    <div className="shrink-0 space-y-0.5 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <QuickButton icon={User} label="My Profile" path="/profile" collapsed={collapsed} />
      <QuickButton icon={Power} label="Sign out" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending} collapsed={collapsed} />
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

        <div className="pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <EmployeeShortcuts collapsed={collapsed} />
        </div>
      </nav>

      <UserCard collapsed={collapsed} />
    </div>
  );
}
