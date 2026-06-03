import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth-store";
import { getCurrentPermissionKeys } from "@/store/auth-store";
import { getUserRoleKeys, isSuperAdminRole } from "@/config/rbac";

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const roles = getUserRoleKeys(user);
  const permissions = getCurrentPermissionKeys();
  const showRestrictedCommunicationLinks = isSuperAdminRole(user);

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Your account identity, role bindings, and employee details." />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-semibold">Account</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Name" value={user?.name ?? "-"} />
            <Info label="Email" value={user?.email ?? "-"} />
            <Info label="Company ID" value={user?.company_id ?? "-"} />
            <Info label="Branch ID" value={user?.branch_id ?? "-"} />
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-[var(--text)]">Roles</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.length === 0 ? <span className="text-sm text-[var(--muted)]">No role assigned.</span> : null}
              {roles.map((role) => (
                <span key={role} className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                  {role.replaceAll("_", " ")}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold">Employee Details</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Info label="Employee #" value={user?.employee?.employee_number ?? "-"} />
            <Info label="Department" value={user?.employee?.department?.name ?? "-"} />
            <Info label="Designation" value={user?.employee?.designation?.name ?? "-"} />
            <Info label="Manager" value={user?.employee?.manager?.name ?? "-"} />
            <Info label="Status" value={user?.employee?.status ?? "-"} />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-semibold">Permissions</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {permissions.length === 0 ? <span className="text-sm text-[var(--muted)]">No direct permissions detected.</span> : null}
            {permissions.map((permission) => (
              <span key={permission} className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text)]">
                {permission}
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-base font-semibold">Shortcuts</h3>
          <div className="mt-4 space-y-2">
            <Link to="/dashboard" className="block rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/35">Back to dashboard</Link>
            {showRestrictedCommunicationLinks ? (
              <Link to="/notifications" className="block rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/35">Notifications</Link>
            ) : null}
            <Link to="/leaves" className="block rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)]/35">Leave requests</Link>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
    </div>
  );
}
