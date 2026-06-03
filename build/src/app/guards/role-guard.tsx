import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStore } from "@/store/auth-store";
import { isSuperAdminRole } from "@/config/rbac";

type RoleGuardProps = {
  children: ReactNode;
  title?: string;
  description?: string;
};

export function SuperAdminGuard({
  children,
  title = "Access restricted",
  description = "This section is available to super admins only.",
}: RoleGuardProps) {
  const user = useAuthStore((state) => state.user);

  if (isSuperAdminRole(user)) {
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
