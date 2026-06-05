import { isSuperAdminRole } from "@/config/rbac";

type PermissionLike = string | { key?: string | null; name?: string | null; module?: string | null; action?: string | null };
type RoleLike = { permissions?: PermissionLike[] | null };
type AuthLike = {
  permissions?: PermissionLike[] | null;
  roles?: RoleLike[] | null;
  rolesRelation?: RoleLike[] | null;
  roles_relation?: RoleLike[] | null;
};

export function normalizePermissionKey(permission: PermissionLike): string {
  if (typeof permission === "string") {
    return permission.trim().toLowerCase().replaceAll(":", ".");
  }

  const key = permission.key ?? permission.name ?? (permission.module && permission.action ? `${permission.module}.${permission.action}` : "");
  return key.trim().toLowerCase().replaceAll(":", ".");
}

export function collectPermissionKeys(user?: AuthLike | null): string[] {
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

export function hasPermission(user: AuthLike | null | undefined, permission: string): boolean {
  // Super admin bypass
  try {
    if (isSuperAdminRole(user as any)) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  const normalized = normalizePermissionKey(permission);
  const permissions = collectPermissionKeys(user);

  return permissions.includes("*") || permissions.includes("*.*") || permissions.includes(normalized);
}

export function hasAnyPermission(user: AuthLike | null | undefined, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasAllPermissions(user: AuthLike | null | undefined, permissions: string[]): boolean {
  return permissions.every((permission) => hasPermission(user, permission));
}
