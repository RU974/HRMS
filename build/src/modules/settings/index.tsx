import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  BranchItem,
  CompanyItem,
  PermissionGroup,
  RoleItem,
  ThemeItem,
  UserItem,
  clearLogs,
  createBranch,
  createCompany,
  createRole,
  createTheme,
  createUser,
  deleteBranch,
  deleteCompany,
  deleteLog,
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
} from "@/services/settings-service";

type SettingsTab = "users" | "roles" | "company" | "branches" | "theme" | "logs";
type LogItem = { id: number; method: string; path: string; status_code: number; created_at: string };

const tabs: Array<{ key: SettingsTab; label: string }> = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "company", label: "Company" },
  { key: "branches", label: "Branches" },
  { key: "theme", label: "Theme" },
  { key: "logs", label: "System Logs" },
];

const fieldClass = "w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]";
const panelClass = "rounded-2xl border border-[var(--border)] bg-white/95 shadow-sm";

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as SettingsTab | null) ?? "users";
  const [tab, setTab] = useState<SettingsTab>(tabs.some((item) => item.key === initialTab) ? initialTab : "users");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionGroup[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role_ids: [] as string[], company_id: "", branch_id: "" });

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", permission_ids: [] as string[] });

  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", email: "", phone: "", website: "", address: "", timezone: "UTC", is_active: true });

  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ company_id: "", name: "", code: "", email: "", phone: "", address: "", is_active: true });

  const [themeForm, setThemeForm] = useState({ theme: "light", company_scope: false });

  const allPermissions = useMemo(() => permissions.flatMap((group) => group.permissions), [permissions]);

  const filteredUsers = useMemo(() => users.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const filteredRoles = useMemo(() => roles.filter((item) => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [roles, query]);
  const filteredCompanies = useMemo(() => companies.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [companies, query]);
  const filteredBranches = useMemo(() => branches.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [branches, query]);
  const filteredLogs = useMemo(() => logs.filter((item) => `${item.method} ${item.path} ${item.status_code}`.toLowerCase().includes(query.toLowerCase())), [logs, query]);

  async function loadAll() {
    setBusy(true);
    setError(null);
    try {
      const [u, r, p, c, b, t, l] = await Promise.all([listUsers(), listRoles(), listPermissions(), listCompanies(), listBranches(), listThemes(), listLogs()]);
      setUsers(u);
      setRoles(r);
      setPermissions(p);
      setCompanies(c);
      setBranches(b);
      setThemes(t);
      setLogs(l);
      if (!branchForm.company_id && c.length > 0) {
        setBranchForm((prev) => ({ ...prev, company_id: c[0].id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

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

  function toggleArrayValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  function resetUserForm() {
    setEditingUserId(null);
    setUserForm({ name: "", email: "", password: "", role_ids: [], company_id: "", branch_id: "" });
  }

  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleForm({ name: "", description: "", permission_ids: [] });
  }

  function resetCompanyForm() {
    setEditingCompanyId(null);
    setCompanyForm({ name: "", email: "", phone: "", website: "", address: "", timezone: "UTC", is_active: true });
  }

  function resetBranchForm() {
    setEditingBranchId(null);
    setBranchForm({ company_id: companies[0]?.id ?? "", name: "", code: "", email: "", phone: "", address: "", is_active: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Modern admin controls for users, access, and system configuration." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-slate-50 to-white p-4"><p className="text-xs text-[var(--muted)]">Users</p><p className="mt-1 text-2xl font-semibold">{users.length}</p></article>
        <article className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-emerald-50 to-white p-4"><p className="text-xs text-[var(--muted)]">Roles</p><p className="mt-1 text-2xl font-semibold">{roles.length}</p></article>
        <article className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-amber-50 to-white p-4"><p className="text-xs text-[var(--muted)]">Branches</p><p className="mt-1 text-2xl font-semibold">{branches.length}</p></article>
        <article className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-rose-50 to-white p-4"><p className="text-xs text-[var(--muted)]">Permissions</p><p className="mt-1 text-2xl font-semibold">{allPermissions.length}</p></article>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <Button key={item.key} variant={tab === item.key ? "primary" : "outline"} onClick={() => { setTab(item.key); setSearchParams({ tab: item.key }); }}>
              {item.label}
            </Button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className={`${fieldClass} max-w-md`} placeholder="Search current section..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="outline" onClick={() => void loadAll()}>Refresh</Button>
      </div>

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {busy && <div className="text-sm text-[var(--muted)]">Loading...</div>}

      {tab === "users" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <aside className={`${panelClass} p-4 space-y-3`}>
            <h3 className="font-semibold">{editingUserId ? "Edit User" : "Create User"}</h3>
            <input className={fieldClass} placeholder="Full Name" value={userForm.name} onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))} />
            <input className={fieldClass} placeholder="Email" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
            <input className={fieldClass} type="password" placeholder={editingUserId ? "Password (optional)" : "Password"} value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} />
            <select className={fieldClass} value={userForm.company_id} onChange={(e) => setUserForm((p) => ({ ...p, company_id: e.target.value }))}><option value="">No Company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className={fieldClass} value={userForm.branch_id} onChange={(e) => setUserForm((p) => ({ ...p, branch_id: e.target.value }))}><option value="">No Branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <div className="rounded-xl border border-[var(--border)] p-3"><p className="mb-2 text-xs text-[var(--muted)]">Assign Roles</p><div className="max-h-40 space-y-1 overflow-auto">{roles.map((r) => <label key={r.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={userForm.role_ids.includes(r.id)} onChange={() => setUserForm((p) => ({ ...p, role_ids: toggleArrayValue(p.role_ids, r.id) }))} /><span>{r.name}</span></label>)}</div></div>
            <div className="flex gap-2"><Button disabled={!userForm.name || !userForm.email || userForm.role_ids.length === 0 || (!editingUserId && userForm.password.length < 8)} onClick={() => withReload(async () => {
              if (editingUserId) {
                await updateUser(editingUserId, { name: userForm.name, email: userForm.email, password: userForm.password || undefined, role_ids: userForm.role_ids, company_id: userForm.company_id || null, branch_id: userForm.branch_id || null });
              } else {
                await createUser({ name: userForm.name, email: userForm.email, password: userForm.password, role_ids: userForm.role_ids, company_id: userForm.company_id || null, branch_id: userForm.branch_id || null });
              }
              resetUserForm();
            })}>{editingUserId ? "Update" : "Create"}</Button><Button variant="outline" onClick={resetUserForm}>Reset</Button></div>
          </aside>
          <div className={`${panelClass} overflow-auto p-4`}>
            <table className="min-w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left">Name</th><th className="pb-2 text-left">Email</th><th className="pb-2 text-left">Roles</th><th /></tr></thead><tbody>{filteredUsers.map((u) => <tr key={u.id} className="border-b last:border-0"><td className="py-2">{u.name}</td><td>{u.email}</td><td>{(u.rolesRelation ?? []).map((r) => r.name).join(", ") || "Unassigned"}</td><td className="space-x-2 text-right"><Button variant="outline" onClick={() => { setEditingUserId(u.id); setUserForm({ name: u.name, email: u.email, password: "", role_ids: (u.rolesRelation ?? []).map((r) => r.id), company_id: u.company_id ?? "", branch_id: u.branch_id ?? "" }); }}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete user?") && withReload(() => deleteUser(u.id))}>Delete</Button></td></tr>)}</tbody></table>
          </div>
        </section>
      )}

      {tab === "roles" && (
        <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <aside className={`${panelClass} p-4 space-y-3`}>
            <h3 className="font-semibold">{editingRoleId ? "Edit Role" : "Create Role"}</h3>
            <input className={fieldClass} placeholder="Role Name" value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} />
            <input className={fieldClass} placeholder="Description" value={roleForm.description} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} />
            <div className="max-h-72 overflow-auto rounded-xl border border-[var(--border)] p-3 space-y-3">
              {permissions.map((group) => <div key={group.module}><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{group.module}</p><div className="space-y-1">{group.permissions.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roleForm.permission_ids.includes(p.id)} onChange={() => setRoleForm((prev) => ({ ...prev, permission_ids: toggleArrayValue(prev.permission_ids, p.id) }))} /><span>{p.key}</span></label>)}</div></div>)}
            </div>
            <div className="flex gap-2"><Button disabled={!roleForm.name || roleForm.permission_ids.length === 0} onClick={() => withReload(async () => { if (editingRoleId) { await updateRole(editingRoleId, roleForm); } else { await createRole(roleForm); } resetRoleForm(); })}>{editingRoleId ? "Update" : "Create"}</Button><Button variant="outline" onClick={resetRoleForm}>Reset</Button></div>
          </aside>
          <div className={`${panelClass} overflow-auto p-4`}>
            <table className="min-w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left">Role</th><th className="pb-2 text-left">Description</th><th className="pb-2 text-left">Permissions</th><th /></tr></thead><tbody>{filteredRoles.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="py-2">{r.name}</td><td>{r.description ?? "-"}</td><td>{(r.permissions ?? []).length}</td><td className="space-x-2 text-right"><Button variant="outline" onClick={() => { setEditingRoleId(r.id); setRoleForm({ name: r.name, description: r.description ?? "", permission_ids: (r.permissions ?? []).map((p) => p.id) }); }}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete role?") && withReload(() => deleteRole(r.id))}>Delete</Button></td></tr>)}</tbody></table>
          </div>
        </section>
      )}

      {tab === "company" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <aside className={`${panelClass} p-4 space-y-3`}>
            <h3 className="font-semibold">{editingCompanyId ? "Edit Company" : "Create Company"}</h3>
            <input className={fieldClass} placeholder="Name" value={companyForm.name} onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))} />
            <input className={fieldClass} placeholder="Email" value={companyForm.email} onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))} />
            <input className={fieldClass} placeholder="Phone" value={companyForm.phone} onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))} />
            <input className={fieldClass} placeholder="Website" value={companyForm.website} onChange={(e) => setCompanyForm((p) => ({ ...p, website: e.target.value }))} />
            <input className={fieldClass} placeholder="Timezone" value={companyForm.timezone} onChange={(e) => setCompanyForm((p) => ({ ...p, timezone: e.target.value }))} />
            <textarea className={fieldClass} rows={2} placeholder="Address" value={companyForm.address} onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={companyForm.is_active} onChange={(e) => setCompanyForm((p) => ({ ...p, is_active: e.target.checked }))} />Active</label>
            <div className="flex gap-2"><Button disabled={!companyForm.name} onClick={() => withReload(async () => { if (editingCompanyId) { await updateCompany(editingCompanyId, companyForm); } else { await createCompany(companyForm); } resetCompanyForm(); })}>{editingCompanyId ? "Update" : "Create"}</Button><Button variant="outline" onClick={resetCompanyForm}>Reset</Button></div>
          </aside>
          <div className={`${panelClass} overflow-auto p-4`}><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left">Name</th><th className="pb-2 text-left">Email</th><th className="pb-2 text-left">Timezone</th><th /></tr></thead><tbody>{filteredCompanies.map((c) => <tr key={c.id} className="border-b last:border-0"><td className="py-2">{c.name}</td><td>{c.email ?? "-"}</td><td>{c.timezone ?? "-"}</td><td className="space-x-2 text-right"><Button variant="outline" onClick={() => { setEditingCompanyId(c.id); setCompanyForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", website: "", address: "", timezone: c.timezone ?? "UTC", is_active: true }); }}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete company?") && withReload(() => deleteCompany(c.id))}>Delete</Button></td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === "branches" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <aside className={`${panelClass} p-4 space-y-3`}>
            <h3 className="font-semibold">{editingBranchId ? "Edit Branch" : "Create Branch"}</h3>
            <select className={fieldClass} value={branchForm.company_id} onChange={(e) => setBranchForm((p) => ({ ...p, company_id: e.target.value }))}><option value="">Select Company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input className={fieldClass} placeholder="Branch Name" value={branchForm.name} onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))} />
            <input className={fieldClass} placeholder="Code" value={branchForm.code} onChange={(e) => setBranchForm((p) => ({ ...p, code: e.target.value }))} />
            <input className={fieldClass} placeholder="Email" value={branchForm.email} onChange={(e) => setBranchForm((p) => ({ ...p, email: e.target.value }))} />
            <input className={fieldClass} placeholder="Phone" value={branchForm.phone} onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))} />
            <textarea className={fieldClass} rows={2} placeholder="Address" value={branchForm.address} onChange={(e) => setBranchForm((p) => ({ ...p, address: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={branchForm.is_active} onChange={(e) => setBranchForm((p) => ({ ...p, is_active: e.target.checked }))} />Active</label>
            <div className="flex gap-2"><Button disabled={!branchForm.company_id || !branchForm.name} onClick={() => withReload(async () => { if (editingBranchId) { await updateBranch(editingBranchId, branchForm); } else { await createBranch(branchForm); } resetBranchForm(); })}>{editingBranchId ? "Update" : "Create"}</Button><Button variant="outline" onClick={resetBranchForm}>Reset</Button></div>
          </aside>
          <div className={`${panelClass} overflow-auto p-4`}><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left">Branch</th><th className="pb-2 text-left">Company</th><th className="pb-2 text-left">Code</th><th /></tr></thead><tbody>{filteredBranches.map((b) => <tr key={b.id} className="border-b last:border-0"><td className="py-2">{b.name}</td><td>{companies.find((c) => c.id === b.company_id)?.name ?? b.company_id}</td><td>{b.code ?? "-"}</td><td className="space-x-2 text-right"><Button variant="outline" onClick={() => { setEditingBranchId(b.id); setBranchForm({ company_id: b.company_id, name: b.name, code: b.code ?? "", email: b.email ?? "", phone: b.phone ?? "", address: "", is_active: true }); }}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete branch?") && withReload(() => deleteBranch(b.id))}>Delete</Button></td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === "theme" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <aside className={`${panelClass} p-4 space-y-3`}>
            <h3 className="font-semibold">Theme Preferences</h3>
            <select className={fieldClass} value={themeForm.theme} onChange={(e) => setThemeForm((p) => ({ ...p, theme: e.target.value }))}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={themeForm.company_scope} onChange={(e) => setThemeForm((p) => ({ ...p, company_scope: e.target.checked }))} />Company Scope</label>
            <Button onClick={() => withReload(() => createTheme({ theme: themeForm.theme, preferences: {}, company_scope: themeForm.company_scope }))}>Save Theme</Button>
          </aside>
          <div className={`${panelClass} overflow-auto p-4`}><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left">ID</th><th className="pb-2 text-left">Theme</th><th /></tr></thead><tbody>{themes.map((t) => <tr key={t.id} className="border-b last:border-0"><td className="py-2">{t.id}</td><td>{t.theme}</td><td className="space-x-2 text-right"><Button variant="outline" onClick={() => withReload(() => updateTheme(t.id, { theme: t.theme === "dark" ? "light" : "dark" }))}>Toggle</Button><Button variant="outline" onClick={() => window.confirm("Delete theme setting?") && withReload(() => deleteTheme(t.id))}>Delete</Button></td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === "logs" && (
        <section className={panelClass}>
          <div className="flex items-center justify-between border-b border-[var(--border)] p-4"><h3 className="font-semibold">System Logs</h3><Button variant="outline" onClick={() => window.confirm("Clear all logs?") && withReload(() => clearLogs())}>Clear Logs</Button></div>
          <div className="overflow-auto p-4"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left">Method</th><th className="pb-2 text-left">Path</th><th className="pb-2 text-left">Status</th><th className="pb-2 text-left">Time</th><th /></tr></thead><tbody>{filteredLogs.map((log) => <tr key={log.id} className="border-b last:border-0"><td className="py-2">{log.method}</td><td>{log.path}</td><td>{log.status_code}</td><td>{log.created_at}</td><td className="text-right"><Button variant="outline" onClick={() => window.confirm("Delete log?") && withReload(() => deleteLog(log.id))}>Delete</Button></td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}
