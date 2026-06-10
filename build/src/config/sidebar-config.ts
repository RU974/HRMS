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

// ─── Actual permission keys from DB (module:action → normalized as module.action) ───
// Seeder generates: dashboard.view, employees.view, employees.create, employees.edit,
// employees.delete, leaves.view, leaves.approve, leaves.manage_settings,
// attendance.view, attendance.create, attendance.edit, attendance.manage_settings,
// payroll.view, payroll.create, payroll.edit, payroll.approve, payroll.manage_settings,
// recruitment.view, recruitment.create, recruitment.edit, recruitment.delete,
// documents.view, documents.create, documents.edit, documents.delete,
// approvals.view, approvals.approve, approvals.manage_settings,
// reports.view, reports.export, reports.manage_settings,
// announcement.view, announcement.create, announcement.edit, announcement.delete,
// notification.view, performance.view, performance.edit, performance.manage_settings,
// settings.manage_settings, users.view, users.create, users.edit, users.delete,
// audit_logs.view

export const sidebarSections: SidebarSectionConfig[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permissions: ["dashboard.view"] },
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
        permissions: ["attendance.view", "attendance.create", "attendance.edit", "attendance.manage_settings"],
      },
      {
        label: "Leave Management",
        path: "/leaves",
        icon: CalendarRange,
        permissions: ["leaves.view", "leaves.approve", "leaves.create", "leaves.manage_settings"],
      },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Announcements", path: "/announcements", icon: Megaphone, permissions: ["announcement.view"] },
      { label: "Notifications",  path: "/notifications",  icon: Bell,    permissions: ["notification.view"] },
      { label: "Chat",           path: "/chat",           icon: MessageCircleMore },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Employees",
        path: "/employees",
        icon: Users2,
        permissions: ["employees.view", "employees.create", "employees.edit", "employees.delete"],
      },
      {
        label: "Employee Documents",
        path: "/employee-documents",
        icon: FileText,
        permissions: ["documents.view", "documents.create", "documents.edit", "documents.delete"],
      },
      {
        label: "Attendance",
        path: "/attendance",
        icon: Clock3,
        permissions: ["attendance.view", "attendance.edit", "attendance.manage_settings"],
      },
      {
        label: "Leaves",
        path: "/leaves",
        icon: CalendarRange,
        permissions: ["leaves.view", "leaves.approve", "leaves.manage_settings"],
      },
      {
        label: "Approvals",
        path: "/approvals",
        icon: ShieldCheck,
        permissions: ["approvals.view", "approvals.approve", "approvals.manage_settings"],
      },
      {
        label: "Approval Workflows",
        path: "/workflows",
        icon: FolderKanban,
        permissions: ["approvals.manage_settings"],
      },
      {
        label: "Payroll",
        icon: WalletCards,
        permissions: ["payroll.view", "payroll.create", "payroll.edit", "payroll.approve", "payroll.manage_settings"],
        children: [
          { label: "Payroll Records",     path: "/payroll?tab=payroll-records",    icon: BriefcaseBusiness, permissions: ["payroll.manage_settings"] },
          { label: "Payroll Processing",  path: "/payroll?tab=payroll-processing",  icon: FolderKanban,      permissions: ["payroll.edit", "payroll.manage_settings"] },
          { label: "Payslips",            path: "/payroll?tab=payslips",            icon: FileText,          permissions: ["payroll.view", "payroll.create", "payroll.edit", "payroll.manage_settings"] },
          { label: "Bonuses",             path: "/payroll?tab=bonuses",             icon: BadgeInfo,         permissions: ["payroll.view", "payroll.edit", "payroll.manage_settings"] },
          { label: "Deductions",          path: "/payroll?tab=deductions",          icon: ScrollText,        permissions: ["payroll.view", "payroll.edit", "payroll.manage_settings"] },
        ],
      },
      {
        label: "Recruitment",
        icon: FolderKanban,
        permissions: ["recruitment.view", "recruitment.create", "recruitment.edit", "recruitment.delete"],
        children: [
          { label: "Overview",     path: "/recruitment",                icon: FolderKanban,    permissions: ["recruitment.view"] },
          { label: "Jobs",         path: "/recruitment/jobs",           icon: BriefcaseBusiness, permissions: ["recruitment.view"] },
          { label: "Candidates",   path: "/recruitment/candidates",     icon: Users2,          permissions: ["recruitment.view"] },
          { label: "Interviews",   path: "/recruitment/interviews",     icon: CalendarClock,   permissions: ["recruitment.view"] },
          { label: "Onboarding",   path: "/recruitment/onboarding",     icon: FileText,        permissions: ["recruitment.view"] },
        ],
      },
      {
        label: "Performance",
        icon: ChartColumn,
        permissions: ["performance.view", "performance.edit", "performance.manage_settings"],
        children: [
          { label: "Overview",    path: "/performance",             icon: ChartColumn,  permissions: ["performance.view", "performance.edit"] },
          { label: "Reviews",     path: "/performance/reviews",     icon: FileText,     permissions: ["performance.view", "performance.edit"] },
          { label: "KPIs",        path: "/performance/kpis",        icon: BadgeInfo,    permissions: ["performance.view", "performance.edit"] },
          { label: "Goals",       path: "/performance/goals",       icon: ShieldCheck,  permissions: ["performance.view", "performance.edit"] },
          { label: "Appraisals",  path: "/performance/appraisals",  icon: BriefcaseBusiness, permissions: ["performance.view", "performance.edit"] },
        ],
      },
      {
        label: "Reports",
        path: "/reports",
        icon: FileText,
        permissions: ["reports.view", "reports.export", "reports.manage_settings", "reports.view_own"],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Departments",
        path: "/departments",
        icon: Building2,
        // Fixed: employees.manage_settings was never seeded. Use the real admin permission.
        permissions: ["settings.manage_settings"],
      },
      {
        label: "Designations",
        path: "/designations",
        icon: BriefcaseBusiness,
        // Fixed: employees.manage_settings was never seeded. Use the real admin permission.
        permissions: ["settings.manage_settings"],
      },
      {
        label: "Shifts",
        path: "/shifts",
        icon: CalendarClock,
        permissions: ["attendance.edit", "attendance.manage_settings"],
      },
      {
        label: "Holidays",
        path: "/holidays",
        icon: CalendarRange,
        permissions: ["attendance.edit", "attendance.manage_settings"],
      },
      {
        label: "Settings",
        path: "/settings",
        icon: Settings2,
        permissions: ["users.view", "users.create", "users.edit", "users.delete", "settings.manage_settings"],
        children: [
          { label: "User Management",    path: "/settings?tab=users",    icon: Users2,       permissions: ["users.view", "users.create", "users.edit", "users.delete"] },
          { label: "Roles & Permissions",path: "/settings?tab=roles",    icon: ShieldCheck,  permissions: ["settings.manage_settings"] },
          { label: "Company Settings",   path: "/settings?tab=company",  icon: Building2,    permissions: ["settings.manage_settings"] },
          { label: "Branches",           path: "/settings?tab=branches", icon: FolderCog,    permissions: ["settings.manage_settings"] },
          { label: "Themes",             path: "/settings?tab=theme",    icon: BadgeInfo,    permissions: ["settings.manage_settings"] },
          { label: "Licensing",          path: "/settings?tab=licensing",icon: BadgeInfo,    permissions: ["settings.manage_settings"] },
          { label: "System Logs",        path: "/settings?tab=logs",     icon: ScrollText,   permissions: ["audit_logs.view", "settings.manage_settings"], requireAllPermissions: true },
        ],
      },
    ],
  },
];

function canSeeItem(user: AuthUser | null | undefined, item: SidebarItemConfig): boolean {
  const roleKeys = getUserRoleKeys(user);

  // Super admin always sees everything
  if (roleKeys.includes("super_admin")) return true;

  const matchesRole = !item.roles?.length
    || item.roles.some(role => roleKeys.includes(normalizeRoleKey(role)));

  const matchesPermission = !item.permissions?.length
    || (item.requireAllPermissions
      ? hasAllPermissions(user, item.permissions)
      : hasAnyPermission(user, item.permissions));

  return matchesRole && matchesPermission;
}

export function getVisibleSidebarSections(user: AuthUser | null | undefined): SidebarSectionConfig[] {
  return sidebarSections
    .map(section => ({
      ...section,
      items: section.items
        .map(item => {
          const children = item.children?.filter(child => canSeeItem(user, child));
          return { ...item, children };
        })
        .filter(item => canSeeItem(user, item) || (item.children?.length ?? 0) > 0),
    }))
    .filter(section => section.items.length > 0);
}