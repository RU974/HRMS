import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { logoutRequest } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";
import { hasAllPermissions, hasAnyPermission } from "@/utils/permissions";

type MenuItem = {
  label: string;
  path: string;
  permissions?: string[];
  requireAllPermissions?: boolean;
};
type MenuGroup = {
  title: string;
  items: readonly MenuItem[];
  dropdown?: boolean;
};

const menu: readonly MenuGroup[] = [
  { title: "Workspace", items: [{ label: "Dashboard", path: "/" }] },
  {
    title: "HR Management",
    items: [
      { label: "Employees", path: "/employees" },
      { label: "Departments", path: "/departments", permissions: ["manage settings"] },
      { label: "Designations", path: "/designations", permissions: ["manage settings"] },
      { label: "Attendance", path: "/attendance" },
      { label: "Leaves", path: "/leaves" },
      { label: "Shifts", path: "/shifts", permissions: ["attendance.edit"] },
      { label: "Holidays", path: "/holidays", permissions: ["attendance.edit"] }
    ]
  },
  {
    title: "Payroll",
    dropdown: true,
    items: [
      { label: "Salary Structure", path: "/payroll?tab=salary-structure", permissions: ["manage payroll"] },
      { label: "Payroll Processing", path: "/payroll?tab=payroll-processing", permissions: ["manage payroll"] },
      { label: "Payslips", path: "/payroll?tab=payslips", permissions: ["manage payroll", "view payroll", "view own payroll"] },
      { label: "Bonuses", path: "/payroll?tab=bonuses", permissions: ["manage payroll", "view payroll", "view own payroll"] },
      { label: "Deductions", path: "/payroll?tab=deductions", permissions: ["manage payroll", "view payroll", "view own payroll"] }
    ]
  },
  {
    title: "Recruitment",
    items: [
      { label: "Overview", path: "/recruitment", permissions: ["recruitment.view"] },
      { label: "Jobs", path: "/recruitment/jobs", permissions: ["recruitment.view"] },
      { label: "Candidates", path: "/recruitment/candidates", permissions: ["recruitment.view"] },
      { label: "Interviews", path: "/recruitment/interviews", permissions: ["recruitment.view"] },
      { label: "Onboarding", path: "/recruitment/onboarding", permissions: ["recruitment.view"] }
    ]
  },
  {
    title: "Performance",
    items: [
      { label: "Overview", path: "/performance", permissions: ["view performance", "manage performance"] },
      { label: "Reviews", path: "/performance/reviews", permissions: ["view performance", "manage performance"] },
      { label: "KPIs", path: "/performance/kpis", permissions: ["view performance", "manage performance"] },
      { label: "Goals", path: "/performance/goals", permissions: ["view performance", "manage performance"] },
      { label: "Appraisals", path: "/performance/appraisals", permissions: ["view performance", "manage performance"] }
    ]
  },
  { title: "Communication", items: [{ label: "Announcements", path: "/announcements" }, { label: "Notifications", path: "/notifications" }, { label: "Chat", path: "/chat" }] },
  { title: "Reports", items: [{ label: "Attendance Reports", path: "/reports/attendance" }, { label: "Employee Reports", path: "/reports/employees" }, { label: "Payroll Reports", path: "/reports/payroll" }, { label: "Analytics", path: "/reports/analytics" }] },
  {
    title: "Settings",
    items: [
      { label: "User Management", path: "/settings?tab=users", permissions: ["user.manage"] },
      { label: "Roles & Permissions", path: "/settings?tab=roles", permissions: ["manage roles"] },
      { label: "Company Settings", path: "/settings?tab=company", permissions: ["user.manage"] },
      { label: "Branches", path: "/settings?tab=branches", permissions: ["user.manage"] },
      { label: "Themes", path: "/settings?tab=theme", permissions: ["user.manage"] },
      { label: "System Logs", path: "/settings?tab=logs", permissions: ["manage settings", "view audit logs"], requireAllPermissions: true }
    ]
  }
] as const;

export function SidebarMenu() {
  const { pathname, search } = useLocation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(menu.map((group) => [group.title, group.items.length > 1])) as Record<string, boolean>
  );
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  async function handleLogout() {
    await logoutRequest().catch(() => null);
    logout();
    window.location.href = "/auth/login";
  }

  const visibleMenu = menu
    .map((group) => {
      const items = group.items.filter((item) => {
        if (!item.permissions) {
          return true;
        }

        return item.requireAllPermissions ? hasAllPermissions(user, item.permissions) : hasAnyPermission(user, item.permissions);
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

  return (
    <nav className="space-y-5">
      {visibleMenu.map((group) => {
        const isDropdown = group.items.length > 1;
        const isOpen = openSections[group.title];

        return (
          <div key={group.title}>
            {isDropdown ? (
              <button
                type="button"
                onClick={() => setOpenSections((prev) => ({ ...prev, [group.title]: !prev[group.title] }))}
                className="mb-2 flex w-full items-center justify-between px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                <span>{group.title}</span>
                <span className="text-sm">{isOpen ? "▼" : "▶"}</span>
              </button>
            ) : (
              <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{group.title}</div>
            )}
            {(isDropdown ? isOpen : true) && (
              <div className={cn("space-y-1", isDropdown ? "pl-3" : "")}>
                {group.items.map(({ label, path }) => (
                  <Link
                    key={`${group.title}-${label}`}
                    to={path}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm capitalize transition",
                      `${pathname}${search}` === path || pathname === path ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text)] hover:bg-[var(--border)]/35"
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="border-t border-[var(--border)] pt-4">
        <Link to="/settings" className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--border)]/35">Profile</Link>
        <button onClick={handleLogout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10">Logout</button>
      </div>
    </nav>
  );
}
