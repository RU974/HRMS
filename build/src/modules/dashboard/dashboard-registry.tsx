import type { ComponentType } from "react";
import type { RoleKey } from "@/config/rbac";
import { EmployeeDashboard } from "./employee-dashboard";
import { ManagementDashboard } from "./management-dashboard";
import { DepartmentManagerDashboard } from "./department-manager-dashboard";

type DashboardComponent = ComponentType<{ roleName: string }>;

const managementRoles: RoleKey[] = [
  "super_admin",
  "company_admin",
  "hr_manager",
  "hr_executive",
  "payroll_manager",
  "attendance_manager",
  "recruiter",
  "department_manager",
  "it_support",
];

export const DASHBOARD_REGISTRY: Record<string, DashboardComponent> = {
  employee: EmployeeDashboard,
  super_admin: ManagementDashboard,
  company_admin: ManagementDashboard,
  hr_manager: ManagementDashboard,
  hr_executive: ManagementDashboard,
  payroll_manager: ManagementDashboard,
  attendance_manager: ManagementDashboard,
  recruiter: ManagementDashboard,
  department_manager: DepartmentManagerDashboard,
  it_support: ManagementDashboard,
};

export function getDashboardComponent(roleKey: string): DashboardComponent {
  return DASHBOARD_REGISTRY[roleKey] ?? ManagementDashboard;
}

export function isManagementRole(roleKey: string): roleKey is RoleKey {
  return managementRoles.includes(roleKey as RoleKey);
}
