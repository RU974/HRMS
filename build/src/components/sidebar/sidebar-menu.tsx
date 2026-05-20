import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { logoutRequest } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";

type MenuItem = readonly [string, string];
type MenuGroup = {
  title: string;
  items: readonly MenuItem[];
  dropdown?: boolean;
};

const menu: readonly MenuGroup[] = [
  { title: "Workspace", items: [["Dashboard", "/"]] },
  { title: "HR Management", items: [["Employees", "/employees"], ["Departments", "/departments"], ["Designations", "/departments"], ["Attendance", "/attendance"], ["Leaves", "/leaves"], ["Shifts", "/shifts"], ["Holidays", "/holidays"]] },
  {
    title: "Payroll",
    dropdown: true,
    items: [["Salary Structure", "/payroll"], ["Payroll Processing", "/payroll"], ["Payslips", "/payroll"], ["Bonuses", "/payroll"], ["Deductions", "/payroll"]]
  },
  { title: "Recruitment", items: [["Candidates", "/recruitment"], ["Interviews", "/recruitment"], ["Jobs", "/recruitment"], ["Onboarding", "/recruitment"]] },
  { title: "Performance", items: [["Reviews", "/performance"], ["KPIs", "/performance"], ["Goals", "/performance"], ["Appraisals", "/performance"]] },
  { title: "Communication", items: [["Announcements", "/announcements"], ["Notifications", "/announcements"], ["Chat", "/announcements"]] },
  { title: "Reports", items: [["Attendance Reports", "/reports"], ["Employee Reports", "/reports"], ["Payroll Reports", "/reports"], ["Analytics", "/reports"]] },
  { title: "Settings", items: [["User Management", "/settings"], ["Roles & Permissions", "/settings"], ["Company Settings", "/settings"], ["Branches", "/settings"], ["Themes", "/settings"], ["System Logs", "/settings"]] }
] as const;

export function SidebarMenu() {
  const { pathname } = useLocation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(menu.map((group) => [group.title, group.items.length > 1])) as Record<string, boolean>
  );
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await logoutRequest().catch(() => null);
    logout();
    window.location.href = "/auth/login";
  }

  return (
    <nav className="space-y-5">
      {menu.map((group) => {
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
                {group.items.map(([label, path]) => (
                  <Link
                    key={`${group.title}-${label}`}
                    to={path}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm capitalize transition",
                      pathname === path ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text)] hover:bg-[var(--border)]/35"
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


