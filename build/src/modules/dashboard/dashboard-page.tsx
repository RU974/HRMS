import { getPrimaryRoleKey } from "@/config/rbac";
import { useAuthStore } from "@/store/auth-store";
import { getDashboardComponent } from "./dashboard-registry";

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const roleKey = getPrimaryRoleKey(user);
  const roleName = user?.roles?.[0]?.name ?? "Dashboard";
  const DashboardComponent = getDashboardComponent(roleKey);

  return <DashboardComponent roleName={roleName} />;
}
