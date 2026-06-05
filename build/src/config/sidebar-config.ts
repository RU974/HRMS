import {
  BadgeInfo,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  FileText,
  FolderCog,
  FolderKanban,
  LayoutDashboard,
  MessageCircleMore,
  Megaphone,
  ShieldCheck,
  Settings2,
  Users2,
  WalletCards,
  type LucideIcon,
  UserCircle2,
  Clock3,
  ScrollText,
} from "lucide-react";
import type { AuthUser } from "@/store/auth-store";
import { hasAllPermissions, hasAnyPermission } from "@/utils/permissions";
import { getUserRoleKeys, normalizeRoleKey, type RoleKey } from "@/config/rbac";

export interface SidebarItemConfig {
  label: string;
  path?: string;
  icon: LucideIcon;
  roles?: RoleKey[];
  permissions?: string[];
  requireAllPermissions?: boolean;
  children?: SidebarItemConfig[];
}

export interface SidebarSectionConfig {
  title: string;
  items: SidebarItemConfig[];
}

const employeeRoleOnly: RoleKey[] = ["employee"];
const superAdminRoleOnly: RoleKey[] = ["super_admin"];

export const sidebarSections: SidebarSectionConfig[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "My Profile", path: "/profile", icon: UserCircle2 },
    ],
  },
  {
    title: "Self Service",
    items: [
      {
        label: "Attendance",
        path: "/attendance",
        icon: Clock3,
        permissions: ["view attendance", "manage attendance"],
      },
      {
        label: "Leave Management",
        path: "/leaves",
        icon: CalendarRange,
        permissions: ["view leaves", "approve leaves", "request own leave", "manage leaves"],
      },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Announcements", path: "/announcements", icon: Megaphone },
      { label: "Notifications", path: "/notifications", icon: Bell },
      { label: "Chat", path: "/chat", icon: MessageCircleMore },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Employees", path: "/employees", icon: Users2, permissions: ["view employees", "manage employees"] },
      { label: "Employee Documents", path: "/employee-documents", icon: FileText, permissions: ["manage employee documents", "view employees", "view attendance"] },
      { label: "Attendance", path: "/attendance", icon: Clock3, permissions: ["view attendance", "manage attendance"] },
      { label: "Leaves", path: "/leaves", icon: CalendarRange, permissions: ["view leaves", "approve leaves", "manage leaves"] },
      { label: "Approvals", path: "/approvals", icon: ShieldCheck, permissions: ["approvals:view", "approvals:manage_settings", "approvals:approve"] },
      { label: "Approval Workflows", path: "/workflows", icon: FolderKanban, permissions: ["approvals:manage_settings"] },
      {
        label: "Payroll",
        icon: WalletCards,
        permissions: ["manage payroll", "view payroll", "view own payroll"],
        children: [
          { label: "Salary Structure", path: "/payroll?tab=salary-structure", icon: BriefcaseBusiness, permissions: ["manage payroll"] },
          { label: "Payroll Processing", path: "/payroll?tab=payroll-processing", icon: FolderKanban, permissions: ["manage payroll"] },
          { label: "Payslips", path: "/payroll?tab=payslips", icon: FileText, permissions: ["manage payroll", "view payroll", "view own payroll"] },
          { label: "Bonuses", path: "/payroll?tab=bonuses", icon: BadgeInfo, permissions: ["manage payroll", "view payroll", "view own payroll"] },
          { label: "Deductions", path: "/payroll?tab=deductions", icon: ScrollText, permissions: ["manage payroll", "view payroll", "view own payroll"] },
        ],
      },
      {
        label: "Recruitment",
        icon: FolderKanban,
        permissions: ["recruitment.view"],
        children: [
          { label: "Overview", path: "/recruitment", icon: FolderKanban, permissions: ["recruitment.view"] },
          { label: "Jobs", path: "/recruitment/jobs", icon: BriefcaseBusiness, permissions: ["recruitment.view"] },
          { label: "Candidates", path: "/recruitment/candidates", icon: Users2, permissions: ["recruitment.view"] },
          { label: "Interviews", path: "/recruitment/interviews", icon: CalendarClock, permissions: ["recruitment.view"] },
          { label: "Onboarding", path: "/recruitment/onboarding", icon: FileText, permissions: ["recruitment.view"] },
        ],
      },
      {
        label: "Performance",
        icon: ChartColumn,
        permissions: ["view performance", "manage performance"],
        children: [
          { label: "Overview", path: "/performance", icon: ChartColumn, permissions: ["view performance", "manage performance"] },
          { label: "Reviews", path: "/performance/reviews", icon: FileText, permissions: ["view performance", "manage performance"] },
          { label: "KPIs", path: "/performance/kpis", icon: BadgeInfo, permissions: ["view performance", "manage performance"] },
          { label: "Goals", path: "/performance/goals", icon: ShieldCheck, permissions: ["view performance", "manage performance"] },
          { label: "Appraisals", path: "/performance/appraisals", icon: BriefcaseBusiness, permissions: ["view performance", "manage performance"] },
        ],
      },
      { label: "Reports", path: "/reports", icon: FileText, permissions: ["view reports", "manage reports"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Departments", path: "/departments", icon: Building2, permissions: ["manage settings"] },
      { label: "Designations", path: "/designations", icon: BriefcaseBusiness, permissions: ["manage settings"] },
      { label: "Shifts", path: "/shifts", icon: CalendarClock, permissions: ["attendance.edit"] },
      { label: "Holidays", path: "/holidays", icon: CalendarRange, permissions: ["attendance.edit"] },
      {
        label: "Settings",
        path: "/settings",
        icon: Settings2,
        permissions: ["manage users", "user.manage", "manage roles", "manage settings"],
        children: [
          { label: "User Management", path: "/settings?tab=users", icon: Users2, permissions: ["manage users", "user.manage"] },
          { label: "Roles & Permissions", path: "/settings?tab=roles", icon: ShieldCheck, permissions: ["manage roles"] },
          { label: "Company Settings", path: "/settings?tab=company", icon: Building2, permissions: ["manage settings"] },
          { label: "Branches", path: "/settings?tab=branches", icon: FolderCog, permissions: ["manage settings"] },
          { label: "Themes", path: "/settings?tab=theme", icon: BadgeInfo, permissions: ["manage settings"] },
          { label: "System Logs", path: "/settings?tab=logs", icon: ScrollText, permissions: ["manage settings", "view audit logs"], requireAllPermissions: true },
        ],
      },
    ],
  },
];

function canSeeItem(user: AuthUser | null | undefined, item: SidebarItemConfig): boolean {
  // Super admin always has access to everything
  const roleKeys = getUserRoleKeys(user);
  if (roleKeys.includes('super_admin')) {
    return true;
  }

  const matchesRole = !item.roles?.length || item.roles.some((role) => roleKeys.includes(normalizeRoleKey(role)));
  const matchesPermission = !item.permissions?.length
    || (item.requireAllPermissions ? hasAllPermissions(user, item.permissions) : hasAnyPermission(user, item.permissions));

  return matchesRole && matchesPermission;
}

export function getVisibleSidebarSections(user: AuthUser | null | undefined): SidebarSectionConfig[] {
  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => {
          const children = item.children?.filter((child) => canSeeItem(user, child));
          return { ...item, children };
        })
        .filter((item) => canSeeItem(user, item) || (item.children?.length ?? 0) > 0),
    }))
    .filter((section) => section.items.length > 0);
}
