import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";
import { logoutRequest } from "@/services/auth-service";
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
          {children.map((child) => {
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
