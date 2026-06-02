import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, BadgeCheck, Building2, LockKeyhole, MapPinned, Palette, RefreshCw, Search, ScrollText, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import {
  BranchItem,
  CompanyItem,
  PermissionGroup,
  RoleItem,
  ThemeItem,
  UserItem,
  createBranch,
  createCompany,
  createRole,
  createTheme,
  createUser,
  deleteBranch,
  deleteCompany,
  deleteRole,
  deleteTheme,
  deleteUser,
  listBranches,
  listCompanies,
  listLogs,
  listPermissions,
  listRoles,
  listThemes,
  listUsers,
  updateBranch,
  updateCompany,
  updateRole,
  updateTheme,
  updateUser,
  LogItem,
} from "@/services/settings-service";
import { useThemeStore } from "@/store/theme-store";
import { hasAllPermissions, hasAnyPermission, hasPermission } from "@/utils/permissions";

type SettingsTab = "users" | "roles" | "company" | "branches" | "theme" | "logs";

type SettingsSection = {
  key: SettingsTab;
  label: string;
  description: string;
  permissions: string[];
  requireAllPermissions?: boolean;
  icon: LucideIcon;
};

const tabs: SettingsSection[] = [
  {
    key: "users",
    label: "User Management",
    description: "Create user accounts, connect them to roles, and keep company assignments consistent.",
    permissions: ["manage users", "user.manage"],
    icon: Users,
  },
  {
    key: "roles",
    label: "Roles & Permissions",
    description: "Review access bundles, edit permissions, and keep locked system roles visible.",
    permissions: ["manage roles"],
    icon: ShieldCheck,
  },
  {
    key: "company",
    label: "Company Settings",
    description: "Maintain the organization profile, contact details, and operating timezone.",
    permissions: ["manage settings"],
    icon: Building2,
  },
  {
    key: "branches",
    label: "Branches",
    description: "Manage branch records, codes, and company mapping from one place.",
    permissions: ["manage settings"],
    icon: MapPinned,
  },
  {
    key: "theme",
    label: "Theme",
    description: "Save user or company theme preferences and preview stored theme settings.",
    permissions: ["manage settings"],
    icon: Palette,
  },
  {
    key: "logs",
    label: "System Logs",
    description: "Inspect the audit trail for requests, payloads, and response metadata.",
    permissions: ["manage settings", "view audit logs"],
    requireAllPermissions: true,
    icon: ScrollText,
  },
];

const fieldClass = "w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]";
const panelClass = "rounded-2xl border border-[var(--border)] bg-white/95 shadow-sm";
const subtleLabelClass = "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
const emptyClass = "rounded-2xl border border-dashed border-[var(--border)] bg-[var(--border)]/15 p-6 text-sm text-[var(--muted)]";

function methodTone(method?: string | null) {
  const normalized = (method ?? "").toUpperCase();
  if (normalized === "POST") return "bg-emerald-50 text-emerald-700";
  if (normalized === "PUT" || normalized === "PATCH") return "bg-amber-50 text-amber-700";
  if (normalized === "DELETE") return "bg-rose-50 text-rose-700";
  return "bg-slate-50 text-slate-700";
}

function statusTone(statusCode?: number) {
  if (!statusCode) return "bg-slate-50 text-slate-700";
  if (statusCode >= 500) return "bg-rose-50 text-rose-700";
  if (statusCode >= 400) return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function scopeLabel(item: ThemeItem) {
  if (item.user_id) return "User";
  if (item.company_id) return "Company";
  return "Global";
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const hasPermissionFor = useAuthStore((state) => state.hasPermission);
  const setTheme = useThemeStore((state) => state.setTheme);

  const initialTab = (searchParams.get("tab") as SettingsTab | null) ?? "users";
  const [tab, setTab] = useState<SettingsTab>(tabs.some((item) => item.key === initialTab) ? initialTab : "users");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionGroup[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role_ids: [] as string[], company_id: "", branch_id: "" });

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", permission_ids: [] as string[] });

  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", email: "", phone: "", website: "", address: "", timezone: "UTC", is_active: true });

  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ company_id: "", name: "", code: "", email: "", phone: "", address: "", is_active: true });

  const [themeForm, setThemeForm] = useState({ theme: "light", company_scope: false });

  const visibleTabs = useMemo(
    () =>
      tabs.filter((item) => (item.requireAllPermissions ? hasAllPermissions(user, item.permissions) : hasAnyPermission(user, item.permissions))),
    [user]
  );

  const selectedTabMeta = useMemo(
    () => visibleTabs.find((item) => item.key === tab) ?? visibleTabs[0] ?? tabs[0],
    [tab, visibleTabs]
  );

  const allPermissions = useMemo(() => permissions.flatMap((group) => group.permissions), [permissions]);
  const filteredPermissionGroups = useMemo(() => {
    const term = permissionQuery.trim().toLowerCase();
    if (!term) {
      return permissions;
    }

    return permissions
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((permission) => `${permission.key} ${permission.id}`.toLowerCase().includes(term)),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [permissions, permissionQuery]);

  const filteredUsers = useMemo(() => users.filter((item) => `${item.name} ${item.email} ${item.company?.name ?? ""} ${item.branch?.name ?? ""}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const filteredRoles = useMemo(() => roles.filter((item) => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [roles, query]);
  const filteredCompanies = useMemo(() => companies.filter((item) => `${item.name} ${item.email ?? ""} ${item.timezone ?? ""}`.toLowerCase().includes(query.toLowerCase())), [companies, query]);
  const filteredBranches = useMemo(() => branches.filter((item) => `${item.name} ${item.code ?? ""} ${item.company?.name ?? ""}`.toLowerCase().includes(query.toLowerCase())), [branches, query]);
  const filteredLogs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return logs;
    }

    return logs.filter((item) => {
      const method = item.http_method ?? item.method;
      const path = item.endpoint ?? item.path;
      return `${method} ${path} ${item.module ?? ""} ${item.action ?? ""} ${item.description ?? ""} ${item.status_code}`.toLowerCase().includes(term);
    });
  }, [logs, query]);
  const selectedLog = useMemo(() => filteredLogs.find((item) => item.id === selectedLogId) ?? filteredLogs[0] ?? null, [filteredLogs, selectedLogId]);

  const canManageUsers = hasAnyPermission(user, ["manage users", "user.manage"]);
  const canManageRoles = hasPermissionFor("manage roles");
  const canManageSettings = hasPermissionFor("manage settings");
  const canViewLogs = hasAllPermissions(user, ["manage settings", "view audit logs"]);
  const canSaveCompanyTheme = Boolean(user?.company_id);

  const userCompanyBranches = useMemo(() => {
    if (!userForm.company_id) {
      return [];
    }

    return branches.filter((branch) => branch.company_id === userForm.company_id);
  }, [branches, userForm.company_id]);

  async function loadAll() {
    setBusy(true);
    setError(null);

    try {
      const [loadedUsers, loadedRoles, loadedPermissions, loadedCompanies, loadedBranches, loadedThemes, loadedLogs] = await Promise.all([
        canManageUsers ? listUsers() : Promise.resolve([] as UserItem[]),
        canManageRoles ? listRoles() : Promise.resolve([] as RoleItem[]),
        canManageRoles ? listPermissions() : Promise.resolve([] as PermissionGroup[]),
        canManageSettings ? listCompanies() : Promise.resolve([] as CompanyItem[]),
        canManageSettings ? listBranches() : Promise.resolve([] as BranchItem[]),
        canManageSettings ? listThemes() : Promise.resolve([] as ThemeItem[]),
        canViewLogs ? listLogs() : Promise.resolve([] as LogItem[]),
      ]);

      setUsers(loadedUsers);
      setRoles(loadedRoles);
      setPermissions(loadedPermissions);
      setCompanies(loadedCompanies);
      setBranches(loadedBranches);
      setThemes(loadedThemes);
      setLogs(loadedLogs);
      setSelectedLogId((current) => (current !== null && loadedLogs.some((item) => item.id === current) ? current : loadedLogs[0]?.id ?? null));

      if (!branchForm.company_id && loadedCompanies.length > 0) {
        setBranchForm((prev) => ({ ...prev, company_id: loadedCompanies[0].id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [canManageRoles, canManageSettings, canManageUsers, canViewLogs]);

  useEffect(() => {
    const nextTab = (searchParams.get("tab") as SettingsTab | null) ?? "users";
    if (tabs.some((item) => item.key === nextTab) && nextTab !== tab) {
      setTab(nextTab);
    }
  }, [searchParams, tab]);

  useEffect(() => {
    if (visibleTabs.length === 0) {
      return;
    }

    if (!visibleTabs.some((item) => item.key === tab)) {
      const fallbackTab = visibleTabs[0].key;
      setTab(fallbackTab);
      setSearchParams({ tab: fallbackTab });
    }
  }, [setSearchParams, tab, visibleTabs]);

  function toggleArrayValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  function getUserRoles(target: UserItem) {
    return target.roles ?? target.rolesRelation ?? target.roles_relation ?? [];
  }

  function getUserRoleIds(target: UserItem) {
    if (target.role_ids && target.role_ids.length > 0) {
      return target.role_ids;
    }

    const assignedRoles = getUserRoles(target);
    if (assignedRoles.length > 0) {
      return assignedRoles.map((role) => role.id);
    }

    if (target.role) {
      const matchedRole = roles.find((role) => role.name === target.role);
      if (matchedRole) {
        return [matchedRole.id];
      }
    }

    return [];
  }

  function resetUserForm() {
    setEditingUserId(null);
    setUserForm({ name: "", email: "", password: "", role_ids: [], company_id: "", branch_id: "" });
  }

  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleForm({ name: "", description: "", permission_ids: [] });
    setPermissionQuery("");
  }

  function resetCompanyForm() {
    setEditingCompanyId(null);
    setCompanyForm({ name: "", email: "", phone: "", website: "", address: "", timezone: "UTC", is_active: true });
  }

  function resetBranchForm() {
    setEditingBranchId(null);
    setBranchForm({ company_id: companies[0]?.id ?? "", name: "", code: "", email: "", phone: "", address: "", is_active: true });
  }

  async function withReload(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
      setBusy(false);
    }
  }

  function syncUserCompany(companyId: string) {
    setUserForm((prev) => {
      const branchIsValid = branches.some((branch) => branch.id === prev.branch_id && branch.company_id === companyId);
      return {
        ...prev,
        company_id: companyId,
        branch_id: branchIsValid ? prev.branch_id : "",
      };
    });
  }

  function renderEmptyState(title: string, description: string) {
    return (
      <div className={emptyClass}>
        <p className="font-medium text-[var(--text)]">{title}</p>
        <p className="mt-1">{description}</p>
      </div>
    );
  }

  const summaryCards = [
    { label: "Users", value: users.length, icon: Users, tone: "from-slate-50 to-white" },
    { label: "Roles", value: roles.length, icon: ShieldCheck, tone: "from-emerald-50 to-white" },
    { label: "Branches", value: branches.length, icon: MapPinned, tone: "from-amber-50 to-white" },
    { label: "Permissions", value: allPermissions.length, icon: LockKeyhole, tone: "from-rose-50 to-white" },
  ];

  if (visibleTabs.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
        You do not have access to administrative settings.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <PageHeader title="Settings" subtitle="Manage the core controls that shape access, company structure, and the look of the app." />
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--text)] shadow-sm">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                Secure configuration
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--text)] shadow-sm">
                <LockKeyhole className="h-3.5 w-3.5 text-amber-600" />
                Permission aware
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--text)] shadow-sm">
                <AlertCircle className="h-3.5 w-3.5 text-sky-600" />
                Delete safety checks
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.label} className={`rounded-2xl border border-[var(--border)] bg-gradient-to-br ${card.tone} p-4 shadow-sm`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{card.label}</p>
                      <p className="mt-2 text-3xl font-bold text-[var(--text)]">{card.value}</p>
                    </div>
                    <span className="rounded-2xl bg-white p-2 shadow-sm">
                      <Icon className="h-5 w-5 text-[var(--primary)]" />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          const count =
            item.key === "users"
              ? users.length
              : item.key === "roles"
                ? roles.length
                : item.key === "company"
                  ? companies.length
                  : item.key === "branches"
                    ? branches.length
                    : item.key === "theme"
                      ? themes.length
                      : logs.length;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setSearchParams({ tab: item.key });
              }}
              className={`rounded-3xl border p-4 text-left transition ${
                active
                  ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm"
                  : "border-[var(--border)] bg-white hover:border-[var(--primary)]/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-xl p-2 ${active ? "bg-[var(--primary)] text-white" : "bg-[var(--border)]/35 text-[var(--text)]"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-[var(--text)]">{item.label}</span>
                  </div>
                  <p className="max-w-md text-sm text-[var(--muted)]">{item.description}</p>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--text)]">{count}</span>
              </div>
            </button>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Current Section</p>
            <div className="flex items-center gap-2">
              <selectedTabMeta.icon className="h-4 w-4 text-[var(--primary)]" />
              <p className="text-sm font-semibold text-[var(--text)]">{selectedTabMeta.label}</p>
            </div>
            <p className="text-sm text-[var(--muted)]">{selectedTabMeta.description}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                className={`${fieldClass} pl-9`}
                placeholder={`Search ${selectedTabMeta.label.toLowerCase()}...`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <Button variant="outline" onClick={() => void loadAll()} disabled={busy}>
              <span className="inline-flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                {busy ? "Refreshing" : "Refresh"}
              </span>
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {busy && <div className="text-sm text-[var(--muted)]">Loading settings...</div>}

      {tab === "users" && (
        <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <aside className={`${panelClass} space-y-4 p-4`}>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">{editingUserId ? "Edit User" : "Create User"}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">User accounts should always map to the correct role, company, and branch.</p>
            </div>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Full Name</span>
              <input className={fieldClass} placeholder="Ayesha Khan" value={userForm.name} onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Email</span>
              <input className={fieldClass} type="email" placeholder="ayesha@company.com" value={userForm.email} onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>{editingUserId ? "Password" : "Password"}</span>
              <input
                className={fieldClass}
                type="password"
                placeholder={editingUserId ? "Leave blank to keep the current password" : "Minimum 8 characters"}
                value={userForm.password}
                onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Company</span>
              <select className={fieldClass} value={userForm.company_id} onChange={(event) => syncUserCompany(event.target.value)}>
                <option value="">No company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Branch</span>
              <select
                className={fieldClass}
                value={userForm.branch_id}
                onChange={(event) => setUserForm((prev) => ({ ...prev, branch_id: event.target.value }))}
                disabled={!userForm.company_id}
              >
                <option value="">{userForm.company_id ? "Select a branch" : "Choose a company first"}</option>
                {userCompanyBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--muted)]">
                Branches are filtered by company to prevent mismatched assignments.
              </p>
            </label>

            <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--border)]/15 p-3">
              <div className="flex items-center justify-between">
                <p className={subtleLabelClass}>Assign Roles</p>
                <span className="text-xs text-[var(--muted)]">{userForm.role_ids.length} selected</span>
              </div>
              <div className="max-h-44 space-y-2 overflow-auto pr-1">
                {roles.length === 0
                  ? renderEmptyState("No roles available yet.", "Create at least one role before adding a new user.")
                  : roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={userForm.role_ids.includes(role.id)}
                        onChange={() => setUserForm((prev) => ({ ...prev, role_ids: toggleArrayValue(prev.role_ids, role.id) }))}
                      />
                      <span>{role.name}</span>
                      {role.is_system ? <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">System</span> : null}
                    </label>
                  ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                disabled={!userForm.name || !userForm.email || userForm.role_ids.length === 0 || (!editingUserId && userForm.password.length < 8) || busy}
                onClick={() =>
                  void withReload(async () => {
                    if (editingUserId) {
                      await updateUser(editingUserId, {
                        name: userForm.name,
                        email: userForm.email,
                        password: userForm.password || undefined,
                        role_ids: userForm.role_ids.length > 0 ? userForm.role_ids : undefined,
                        company_id: userForm.company_id || null,
                        branch_id: userForm.branch_id || null,
                      });
                    } else {
                      await createUser({
                        name: userForm.name,
                        email: userForm.email,
                        password: userForm.password,
                        role_ids: userForm.role_ids,
                        company_id: userForm.company_id || null,
                        branch_id: userForm.branch_id || null,
                      });
                    }
                    resetUserForm();
                  })
                }
              >
                {editingUserId ? "Update User" : "Create User"}
              </Button>
              <Button variant="outline" onClick={resetUserForm}>
                Reset
              </Button>
            </div>
          </aside>

          <div className={`${panelClass} overflow-hidden`}>
            <div className="border-b border-[var(--border)] p-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Users</h3>
              <p className="text-sm text-[var(--muted)]">Review account assignments and quickly edit the owner, role, or organization links.</p>
            </div>

            <div className="overflow-auto p-4">
              {filteredUsers.length === 0 ? (
                renderEmptyState("No users match this filter.", "Try a different search or create a new user account.")
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="pb-2 text-left font-semibold">Name</th>
                      <th className="pb-2 text-left font-semibold">Company</th>
                      <th className="pb-2 text-left font-semibold">Branch</th>
                      <th className="pb-2 text-left font-semibold">Roles</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium text-[var(--text)]">{item.name}</div>
                          <div className="text-xs text-[var(--muted)]">{item.email}</div>
                        </td>
                        <td>{item.company?.name ?? item.company_id ?? "-"}</td>
                        <td>{item.branch?.name ?? item.branch_id ?? "-"}</td>
                        <td>{getUserRoles(item).map((role) => role.name).join(", ") || item.role || "Unassigned"}</td>
                        <td className="space-x-2 py-3 text-right">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingUserId(item.id);
                              setUserForm({
                                name: item.name,
                                email: item.email,
                                password: "",
                                role_ids: getUserRoleIds(item),
                                company_id: item.company_id ?? "",
                                branch_id: item.branch_id ?? "",
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="outline" onClick={() => window.confirm("Delete user?") && void withReload(() => deleteUser(item.id))}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "roles" && (
        <section className="grid gap-4 xl:grid-cols-[440px_1fr]">
          <aside className={`${panelClass} space-y-4 p-4`}>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">{editingRoleId ? "Edit Role" : "Create Role"}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">System roles stay locked. Custom roles can be created and adjusted here.</p>
            </div>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Role Name</span>
              <input className={fieldClass} placeholder="HR Manager" value={roleForm.name} onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Description</span>
              <textarea
                className={fieldClass}
                rows={2}
                placeholder="A short note about what this role can do."
                value={roleForm.description}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--border)]/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={subtleLabelClass}>Permissions</p>
                <span className="text-xs text-[var(--muted)]">{roleForm.permission_ids.length} selected</span>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  className={`${fieldClass} pl-9`}
                  placeholder="Filter permissions..."
                  value={permissionQuery}
                  onChange={(event) => setPermissionQuery(event.target.value)}
                />
              </label>
              <div className="max-h-80 space-y-4 overflow-auto pr-1">
                {filteredPermissionGroups.length === 0 ? (
                  renderEmptyState("No permissions matched the search.", "Clear the filter to view the full permission catalog.")
                ) : (
                  filteredPermissionGroups.map((group) => (
                    <div key={group.module} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{group.module}</p>
                      <div className="space-y-2">
                        {group.permissions.map((permission) => (
                          <label key={permission.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={roleForm.permission_ids.includes(permission.id)}
                              onChange={() =>
                                setRoleForm((prev) => ({
                                  ...prev,
                                  permission_ids: toggleArrayValue(prev.permission_ids, permission.id),
                                }))
                              }
                            />
                            <span className="font-medium text-[var(--text)]">{permission.key}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                disabled={!roleForm.name || roleForm.permission_ids.length === 0 || busy}
                onClick={() =>
                  void withReload(async () => {
                    if (editingRoleId) {
                      await updateRole(editingRoleId, roleForm);
                    } else {
                      await createRole(roleForm);
                    }
                    resetRoleForm();
                  })
                }
              >
                {editingRoleId ? "Update Role" : "Create Role"}
              </Button>
              <Button variant="outline" onClick={resetRoleForm}>
                Reset
              </Button>
            </div>
          </aside>

          <div className={`${panelClass} overflow-hidden`}>
            <div className="border-b border-[var(--border)] p-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Roles</h3>
              <p className="text-sm text-[var(--muted)]">System roles are locked to avoid breaking seed data and permission templates.</p>
            </div>

            <div className="overflow-auto p-4">
              {filteredRoles.length === 0 ? (
                renderEmptyState("No roles match this filter.", "Try another search or create a new custom role.")
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="pb-2 text-left font-semibold">Role</th>
                      <th className="pb-2 text-left font-semibold">Description</th>
                      <th className="pb-2 text-left font-semibold">Permissions</th>
                      <th className="pb-2 text-left font-semibold">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoles.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium text-[var(--text)]">{item.name}</div>
                        </td>
                        <td>{item.description ?? "-"}</td>
                        <td>{(item.permissions ?? []).length}</td>
                        <td>
                          {item.is_system ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              System
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Custom
                            </span>
                          )}
                        </td>
                        <td className="space-x-2 py-3 text-right">
                          <Button
                            variant="outline"
                            disabled={item.is_system || busy}
                            title={item.is_system ? "System roles cannot be edited." : undefined}
                            onClick={() => {
                              setEditingRoleId(item.id);
                              setRoleForm({
                                name: item.name,
                                description: item.description ?? "",
                                permission_ids: (item.permissions ?? []).map((permission) => permission.id),
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            disabled={item.is_system || busy}
                            title={item.is_system ? "System roles cannot be deleted." : undefined}
                            onClick={() => window.confirm("Delete role?") && void withReload(() => deleteRole(item.id))}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "company" && (
        <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <aside className={`${panelClass} space-y-4 p-4`}>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">{editingCompanyId ? "Edit Company" : "Create Company"}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Company records drive branch ownership, user assignment, and theme scoping.</p>
            </div>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Company Name</span>
              <input className={fieldClass} placeholder="Northwind Pvt Ltd" value={companyForm.name} onChange={(event) => setCompanyForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Email</span>
              <input className={fieldClass} type="email" placeholder="hello@northwind.com" value={companyForm.email} onChange={(event) => setCompanyForm((prev) => ({ ...prev, email: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Phone</span>
              <input className={fieldClass} placeholder="+92 300 0000000" value={companyForm.phone} onChange={(event) => setCompanyForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Website</span>
              <input className={fieldClass} type="url" placeholder="https://northwind.com" value={companyForm.website} onChange={(event) => setCompanyForm((prev) => ({ ...prev, website: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Timezone</span>
              <input className={fieldClass} placeholder="UTC" value={companyForm.timezone} onChange={(event) => setCompanyForm((prev) => ({ ...prev, timezone: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Address</span>
              <textarea className={fieldClass} rows={3} placeholder="Head office address" value={companyForm.address} onChange={(event) => setCompanyForm((prev) => ({ ...prev, address: event.target.value }))} />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--border)]/15 px-3 py-2 text-sm">
              <input type="checkbox" checked={companyForm.is_active} onChange={(event) => setCompanyForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
              Active
            </label>

            <div className="flex gap-2">
              <Button
                disabled={!companyForm.name || busy}
                onClick={() =>
                  void withReload(async () => {
                    if (editingCompanyId) {
                      await updateCompany(editingCompanyId, companyForm);
                    } else {
                      await createCompany(companyForm);
                    }
                    resetCompanyForm();
                  })
                }
              >
                {editingCompanyId ? "Update Company" : "Create Company"}
              </Button>
              <Button variant="outline" onClick={resetCompanyForm}>
                Reset
              </Button>
            </div>
          </aside>

          <div className={`${panelClass} overflow-hidden`}>
            <div className="border-b border-[var(--border)] p-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Companies</h3>
              <p className="text-sm text-[var(--muted)]">Deleting a company is blocked until its related users and branches are moved elsewhere.</p>
            </div>

            <div className="overflow-auto p-4">
              {filteredCompanies.length === 0 ? (
                renderEmptyState("No companies match this filter.", "Try another search or create the first company record.")
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="pb-2 text-left font-semibold">Name</th>
                      <th className="pb-2 text-left font-semibold">Contact</th>
                      <th className="pb-2 text-left font-semibold">Usage</th>
                      <th className="pb-2 text-left font-semibold">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium text-[var(--text)]">{item.name}</div>
                          <div className="text-xs text-[var(--muted)]">{item.website ?? "-"}</div>
                        </td>
                        <td>
                          <div>{item.email ?? "-"}</div>
                          <div className="text-xs text-[var(--muted)]">{item.phone ?? "-"}</div>
                        </td>
                        <td>
                          <div>{item.branches_count ?? 0} branches</div>
                          <div className="text-xs text-[var(--muted)]">{item.users_count ?? 0} users</div>
                        </td>
                        <td>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.is_active === false ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {item.is_active === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td className="space-x-2 py-3 text-right">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingCompanyId(item.id);
                              setCompanyForm({
                                name: item.name,
                                email: item.email ?? "",
                                phone: item.phone ?? "",
                                website: item.website ?? "",
                                address: item.address ?? "",
                                timezone: item.timezone ?? "UTC",
                                is_active: item.is_active ?? true,
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            disabled={(item.branches_count ?? 0) > 0 || busy}
                            title={(item.branches_count ?? 0) > 0 ? "Move branches and users first." : undefined}
                            onClick={() => window.confirm("Delete company?") && void withReload(() => deleteCompany(item.id))}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "branches" && (
        <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <aside className={`${panelClass} space-y-4 p-4`}>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">{editingBranchId ? "Edit Branch" : "Create Branch"}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Branches must belong to a company so user assignment and reporting stay clean.</p>
            </div>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Company</span>
              <select className={fieldClass} value={branchForm.company_id} onChange={(event) => setBranchForm((prev) => ({ ...prev, company_id: event.target.value }))}>
                <option value="">Select a company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Branch Name</span>
              <input className={fieldClass} placeholder="Islamabad Office" value={branchForm.name} onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Code</span>
              <input className={fieldClass} placeholder="ISB-01" value={branchForm.code} onChange={(event) => setBranchForm((prev) => ({ ...prev, code: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Email</span>
              <input className={fieldClass} type="email" placeholder="islamabad@company.com" value={branchForm.email} onChange={(event) => setBranchForm((prev) => ({ ...prev, email: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Phone</span>
              <input className={fieldClass} placeholder="+92 300 0000000" value={branchForm.phone} onChange={(event) => setBranchForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Address</span>
              <textarea className={fieldClass} rows={3} placeholder="Branch address" value={branchForm.address} onChange={(event) => setBranchForm((prev) => ({ ...prev, address: event.target.value }))} />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--border)]/15 px-3 py-2 text-sm">
              <input type="checkbox" checked={branchForm.is_active} onChange={(event) => setBranchForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
              Active
            </label>

            <div className="flex gap-2">
              <Button
                disabled={!branchForm.company_id || !branchForm.name || busy}
                onClick={() =>
                  void withReload(async () => {
                    if (editingBranchId) {
                      await updateBranch(editingBranchId, branchForm);
                    } else {
                      await createBranch(branchForm);
                    }
                    resetBranchForm();
                  })
                }
              >
                {editingBranchId ? "Update Branch" : "Create Branch"}
              </Button>
              <Button variant="outline" onClick={resetBranchForm}>
                Reset
              </Button>
            </div>
          </aside>

          <div className={`${panelClass} overflow-hidden`}>
            <div className="border-b border-[var(--border)] p-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Branches</h3>
              <p className="text-sm text-[var(--muted)]">Branch delete actions are blocked while employees are still assigned to that location.</p>
            </div>

            <div className="overflow-auto p-4">
              {filteredBranches.length === 0 ? (
                renderEmptyState("No branches match this filter.", "Try a different search or create the first branch.")
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="pb-2 text-left font-semibold">Branch</th>
                      <th className="pb-2 text-left font-semibold">Company</th>
                      <th className="pb-2 text-left font-semibold">Code</th>
                      <th className="pb-2 text-left font-semibold">Usage</th>
                      <th className="pb-2 text-left font-semibold">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBranches.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium text-[var(--text)]">{item.name}</div>
                          <div className="text-xs text-[var(--muted)]">{item.email ?? "-"}</div>
                        </td>
                        <td>{item.company?.name ?? item.company_id}</td>
                        <td>{item.code ?? "-"}</td>
                        <td>{item.users_count ?? 0} users</td>
                        <td>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.is_active === false ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {item.is_active === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td className="space-x-2 py-3 text-right">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingBranchId(item.id);
                              setBranchForm({
                                company_id: item.company_id,
                                name: item.name,
                                code: item.code ?? "",
                                email: item.email ?? "",
                                phone: item.phone ?? "",
                                address: item.address ?? "",
                                is_active: item.is_active ?? true,
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            disabled={(item.users_count ?? 0) > 0 || busy}
                            title={(item.users_count ?? 0) > 0 ? "Move assigned users first." : undefined}
                            onClick={() => window.confirm("Delete branch?") && void withReload(() => deleteBranch(item.id))}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "theme" && (
        <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <aside className={`${panelClass} space-y-4 p-4`}>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">Theme Preferences</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Saved preferences apply at the user or company level depending on scope.</p>
            </div>

            <label className="space-y-2 text-sm">
              <span className={subtleLabelClass}>Theme</span>
              <select className={fieldClass} value={themeForm.theme} onChange={(event) => setThemeForm((prev) => ({ ...prev, theme: event.target.value }))}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--border)]/15 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={themeForm.company_scope}
                disabled={!canSaveCompanyTheme}
                onChange={(event) => setThemeForm((prev) => ({ ...prev, company_scope: event.target.checked }))}
              />
              Company scope
            </label>

            <p className="text-xs text-[var(--muted)]">
              {canSaveCompanyTheme
                ? "Company-scoped themes apply to the active company only."
                : "Assign your account to a company before saving company-scoped theme preferences."}
            </p>

            <Button
              disabled={busy || (themeForm.company_scope && !canSaveCompanyTheme)}
              onClick={() =>
                void withReload(async () => {
                  const setting = await createTheme({ theme: themeForm.theme, preferences: {}, company_scope: themeForm.company_scope });
                  setTheme(setting.theme === "system" ? "system" : setting.theme === "dark" ? "dark" : "light");
                })
              }
            >
              Save Theme
            </Button>
          </aside>

          <div className={`${panelClass} overflow-hidden`}>
            <div className="border-b border-[var(--border)] p-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Stored Themes</h3>
              <p className="text-sm text-[var(--muted)]">These records show the persisted user, company, and global theme settings.</p>
            </div>

            <div className="overflow-auto p-4">
              {themes.length === 0 ? (
                renderEmptyState("No theme records yet.", "Save a theme preference to create the first record.")
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="pb-2 text-left font-semibold">Scope</th>
                      <th className="pb-2 text-left font-semibold">Theme</th>
                      <th className="pb-2 text-left font-semibold">Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {themes.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{scopeLabel(item)}</span>
                        </td>
                        <td className="capitalize">{item.theme}</td>
                        <td>{item.updated_at ? new Date(item.updated_at).toLocaleString() : "-"}</td>
                        <td className="space-x-2 py-3 text-right">
                          <Button
                            variant="outline"
                            onClick={() =>
                              void withReload(async () => {
                                const updated = await updateTheme(item.id, { theme: item.theme === "dark" ? "light" : "dark" });
                                setTheme(updated.theme === "system" ? "system" : updated.theme === "dark" ? "dark" : "light");
                              })
                            }
                          >
                            Toggle
                          </Button>
                          <Button variant="outline" onClick={() => window.confirm("Delete theme setting?") && void withReload(() => deleteTheme(item.id))}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "logs" && (
        <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">System Logs</h3>
                <p className="text-sm text-[var(--muted)]">Read-only audit trail with filters and a detail pane for payload inspection.</p>
              </div>
              <p className="text-xs text-[var(--muted)]">Latest events first</p>
            </div>

            <div className="overflow-auto p-4">
              {filteredLogs.length === 0 ? (
                renderEmptyState("No logs match this filter.", "Search by method, path, module, action, or description.")
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="pb-2 text-left font-semibold">Method</th>
                      <th className="pb-2 text-left font-semibold">Path</th>
                      <th className="pb-2 text-left font-semibold">Module</th>
                      <th className="pb-2 text-left font-semibold">Status</th>
                      <th className="pb-2 text-left font-semibold">Time</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => {
                      const method = log.http_method ?? log.method;
                      const path = log.endpoint ?? log.path;
                      const selected = selectedLog?.id === log.id;

                      return (
                        <tr key={log.id} className={`border-b last:border-0 ${selected ? "bg-[var(--border)]/15" : ""}`}>
                          <td className="py-3">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${methodTone(method)}`}>{method}</span>
                          </td>
                          <td className="max-w-[20rem] truncate">{path}</td>
                          <td>{log.module ?? "-"}</td>
                          <td>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(log.status_code)}`}>{log.status_code}</span>
                          </td>
                          <td>{log.created_at}</td>
                          <td className="py-3 text-right">
                            <Button variant="outline" onClick={() => setSelectedLogId(log.id)}>
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <aside className={`${panelClass} space-y-4 p-4`}>
            <div>
              <h4 className="text-lg font-semibold text-[var(--text)]">Log Details</h4>
              <p className="text-sm text-[var(--muted)]">Inspect the selected request, its payload, and the actor behind it.</p>
            </div>

            {selectedLog ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className={subtleLabelClass}>Action</p>
                  <p className="font-medium text-[var(--text)]">{selectedLog.action ?? "-"}</p>
                </div>
                <div>
                  <p className={subtleLabelClass}>Description</p>
                  <p>{selectedLog.description ?? "-"}</p>
                </div>
                <div>
                  <p className={subtleLabelClass}>Request</p>
                  <p>
                    {selectedLog.http_method ?? selectedLog.method} {selectedLog.endpoint ?? selectedLog.path}
                  </p>
                </div>
                <div>
                  <p className={subtleLabelClass}>Actor</p>
                  <p>{selectedLog.user?.name ?? "System"}</p>
                </div>
                <div>
                  <p className={subtleLabelClass}>Status</p>
                  <p>{selectedLog.status_code}</p>
                </div>
                <div>
                  <p className={subtleLabelClass}>Payload</p>
                  <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                    {typeof selectedLog.payload === "string" ? selectedLog.payload || "{}" : JSON.stringify(selectedLog.payload ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              renderEmptyState("Select a log row.", "The detail panel shows the request payload and metadata for the chosen entry.")
            )}
          </aside>
        </section>
      )}
    </div>
  );
}
