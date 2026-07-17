import { isSuperAdminRole } from "@/config/rbac";
import type { AuthUser } from "@/store/auth-store";

type PermissionLike = string | { key?: string | null; name?: string | null; module?: string | null; action?: string | null };

export function normalizePermissionKey(permission: PermissionLike): string {
  if (typeof permission === "string") {
    return permission.trim().toLowerCase().replaceAll(":", ".");
  }

  const key = permission.key ?? permission.name ?? (permission.module && permission.action ? `${permission.module}.${permission.action}` : "");
  return key.trim().toLowerCase().replaceAll(":", ".");
}

export function collectPermissionKeys(user?: AuthUser | null): string[] {
  if (!user) {
    return [];
  }

  const directPermissions = user.permissions ?? [];
  const roles = user.roles ?? user.rolesRelation ?? user.roles_relation ?? [];

  return [
    ...directPermissions.map(normalizePermissionKey),
    ...roles.flatMap((role) => (role.permissions ?? []).map(normalizePermissionKey)),
  ].filter(Boolean);
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  // Super admin bypass
  if (isSuperAdminRole(user)) {
    return true;
  }

  const normalized = normalizePermissionKey(permission);
  const permissions = collectPermissionKeys(user);

  return permissions.includes("*") || permissions.includes("*.*") || permissions.includes(normalized);
}

export function hasAnyPermission(user: AuthUser | null | undefined, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasAllPermissions(user: AuthUser | null | undefined, permissions: string[]): boolean {
  return permissions.every((permission) => hasPermission(user, permission));
}
