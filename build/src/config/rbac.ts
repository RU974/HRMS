import type { AuthUser } from "@/store/auth-store";
import { collectPermissionKeys, normalizePermissionKey } from "@/utils/permissions";

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  hr_manager: "HR Manager",
  hr_executive: "HR Executive",
  payroll_manager: "Payroll Manager",
  attendance_manager: "Attendance Manager",
  recruiter: "Recruiter",
  department_manager: "Department Manager",
  it_support: "IT Support",
  employee: "Employee",
} as const;

export type RoleKey = keyof typeof ROLE_LABELS;

export function normalizeRoleKey(roleName: string): RoleKey | string {
  const normalized = roleName.trim().toLowerCase().replace(/[\s:-]+/g, "_");

  switch (normalized) {
    case "super_admin":
    case "company_admin":
    case "hr_manager":
    case "hr_executive":
    case "payroll_manager":
    case "attendance_manager":
    case "recruiter":
    case "department_manager":
    case "it_support":
    case "employee":
      return normalized;
    default:
      return normalized;
  }
}

function extractRoleNames(user?: AuthUser | null): string[] {
  if (!user) {
    return [];
  }

  return [
    ...(user.roles ?? []),
    ...(user.rolesRelation ?? []),
    ...(user.roles_relation ?? []),
  ]
    .map((role) => role.name)
    .filter(Boolean);
}

export function getUserRoleKeys(user?: AuthUser | null): string[] {
  return extractRoleNames(user).map((roleName) => normalizeRoleKey(roleName));
}

export function getPrimaryRoleKey(user?: AuthUser | null): string {
  const roleKeys = getUserRoleKeys(user);
  return roleKeys[0] ?? "employee";
}

export function isEmployeeRole(user?: AuthUser | null): boolean {
  return getUserRoleKeys(user).includes("employee");
}

export function getUserPermissionKeys(user?: AuthUser | null): string[] {
  return collectPermissionKeys(user);
}

export function hasPermissionAlias(user: AuthUser | null | undefined, permission: string): boolean {
  return getUserPermissionKeys(user).includes(normalizePermissionKey(permission));
}
