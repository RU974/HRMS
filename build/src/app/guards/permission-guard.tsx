import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStore } from "@/store/auth-store";
import { hasAnyPermission, hasAllPermissions } from "@/utils/permissions";

type PermissionGuardProps = {
  permissions: string[];
  children: ReactNode;
  requireAll?: boolean;
  title?: string;
  description?: string;
};

export function PermissionGuard({
  permissions,
  children,
  requireAll = false,
  title = "Access restricted",
  description = "You do not have permission to open this section.",
}: PermissionGuardProps) {
  const user = useAuthStore((state) => state.user);

  const allowed = requireAll
    ? hasAllPermissions(user, permissions)
    : hasAnyPermission(user, permissions);

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <EmptyState
      title={title}
      description={description}
      action={(
        <Link to="/dashboard" className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--border)]/35">
          Back to dashboard
        </Link>
      )}
    />
  );
}
