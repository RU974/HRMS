import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  clearLogs, createBranch, createCompany, createRole, createTheme, createUser, deleteBranch, deleteCompany, deleteLog, deleteRole, deleteTheme, deleteUser,
  listBranches, listCompanies, listLogs, listPermissions, listRoles, listThemes, listUsers, updateBranch, updateCompany, updateRole, updateTheme, updateUser
} from "@/services/settings-service";

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as "users" | "roles" | "company" | "branches" | "theme" | "logs" | null) ?? "users";
  const [tab, setTab] = useState<"users" | "roles" | "company" | "branches" | "theme" | "logs">(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [themes, setThemes] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  async function loadAll() {
    setBusy(true);
    setError(null);
    try {
      const [u, r, p, c, b, t, l] = await Promise.all([listUsers(), listRoles(), listPermissions(), listCompanies(), listBranches(), listThemes(), listLogs()]);
      setUsers(u); setRoles(r); setPermissions(p); setCompanies(c); setBranches(b); setThemes(t); setLogs(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  async function withReload(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await loadAll(); } catch (e) { setError(e instanceof Error ? e.message : "Operation failed."); setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage settings with enterprise-grade workflows." />
      <div className="flex flex-wrap gap-2">
        {["users", "roles", "company", "branches", "theme", "logs"].map((key) => (
          <Button key={key} variant={tab === key ? "primary" : "outline"} onClick={() => { setTab(key as any); setSearchParams({ tab: key }); }}>{key}</Button>
        ))}
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {busy && <div className="text-sm text-[var(--muted)]">Loading...</div>}

      {tab === "users" && (
        <section className="space-y-3 rounded border border-[var(--border)] p-4">
          <h3 className="font-semibold">User Management</h3>
          <div className="overflow-auto text-sm"><table className="min-w-full"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td className="space-x-2"><Button variant="outline" onClick={() => withReload(() => updateUser(u.id, { name: `${u.name}` }))}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete user?") && withReload(() => deleteUser(u.id))}>Delete</Button></td></tr>)}</tbody></table></div>
          <Button onClick={() => withReload(() => createUser({ name: "New User", email: `user${Date.now()}@example.com`, password: "Password123!", role: "Employee" }))}>Create User</Button>
        </section>
      )}

      {tab === "roles" && (
        <section className="space-y-3 rounded border border-[var(--border)] p-4">
          <h3 className="font-semibold">Role & Permission Management</h3>
          <div className="text-xs text-[var(--muted)]">Permissions loaded: {permissions.reduce((acc, g) => acc + g.permissions.length, 0)}</div>
          <div className="overflow-auto text-sm"><table className="min-w-full"><thead><tr><th>Name</th><th>Description</th><th /></tr></thead><tbody>{roles.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.description}</td><td className="space-x-2"><Button variant="outline" onClick={() => withReload(() => updateRole(r.id, { name: r.name, description: r.description ?? "", permission_ids: (r.permissions ?? []).map((p: any) => p.id) }))}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete role?") && withReload(() => deleteRole(r.id))}>Delete</Button></td></tr>)}</tbody></table></div>
          <Button onClick={() => withReload(() => createRole({ name: `Custom Role ${roles.length + 1}`, description: "Custom settings role", permission_ids: permissions.flatMap((g) => g.permissions).slice(0, 1).map((p) => p.id) }))}>Create Role</Button>
        </section>
      )}

      {tab === "company" && (
        <section className="space-y-3 rounded border border-[var(--border)] p-4">
          <h3 className="font-semibold">Company Settings</h3>
          <div className="overflow-auto text-sm"><table className="min-w-full"><thead><tr><th>Name</th><th>Email</th><th>Timezone</th><th /></tr></thead><tbody>{companies.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.email}</td><td>{c.timezone}</td><td className="space-x-2"><Button variant="outline" onClick={() => withReload(() => updateCompany(c.id, { name: c.name }))}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete company?") && withReload(() => deleteCompany(c.id))}>Delete</Button></td></tr>)}</tbody></table></div>
          <Button onClick={() => withReload(() => createCompany({ name: `Company ${companies.length + 1}`, email: `company${Date.now()}@example.com`, timezone: "UTC" }))}>Create Company</Button>
        </section>
      )}

      {tab === "branches" && (
        <section className="space-y-3 rounded border border-[var(--border)] p-4">
          <h3 className="font-semibold">Branch Management</h3>
          <div className="overflow-auto text-sm"><table className="min-w-full"><thead><tr><th>Name</th><th>Company</th><th>Code</th><th /></tr></thead><tbody>{branches.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.company_id}</td><td>{b.code}</td><td className="space-x-2"><Button variant="outline" onClick={() => withReload(() => updateBranch(b.id, { name: b.name }))}>Edit</Button><Button variant="outline" onClick={() => window.confirm("Delete branch?") && withReload(() => deleteBranch(b.id))}>Delete</Button></td></tr>)}</tbody></table></div>
          <Button disabled={companies.length === 0} onClick={() => withReload(() => createBranch({ company_id: companies[0].id, name: `Branch ${branches.length + 1}`, code: `BR-${branches.length + 1}` }))}>Create Branch</Button>
        </section>
      )}

      {tab === "theme" && (
        <section className="space-y-3 rounded border border-[var(--border)] p-4">
          <h3 className="font-semibold">Theme Settings</h3>
          <div className="overflow-auto text-sm"><table className="min-w-full"><thead><tr><th>ID</th><th>Theme</th><th /></tr></thead><tbody>{themes.map((t) => <tr key={t.id}><td>{t.id}</td><td>{t.theme}</td><td className="space-x-2"><Button variant="outline" onClick={() => withReload(() => updateTheme(t.id, { theme: t.theme === "dark" ? "light" : "dark" }))}>Toggle</Button><Button variant="outline" onClick={() => window.confirm("Delete theme row?") && withReload(() => deleteTheme(t.id))}>Delete</Button></td></tr>)}</tbody></table></div>
          <Button onClick={() => withReload(() => createTheme({ theme: "light", preferences: { density: "comfortable" } }))}>Create Theme Setting</Button>
        </section>
      )}

      {tab === "logs" && (
        <section className="space-y-3 rounded border border-[var(--border)] p-4">
          <h3 className="font-semibold">System Logs</h3>
          <div className="overflow-auto text-sm"><table className="min-w-full"><thead><tr><th>Method</th><th>Path</th><th>Status</th><th>Time</th><th /></tr></thead><tbody>{logs.map((l) => <tr key={l.id}><td>{l.method}</td><td>{l.path}</td><td>{l.status_code}</td><td>{l.created_at}</td><td><Button variant="outline" onClick={() => window.confirm("Delete log?") && withReload(() => deleteLog(l.id))}>Delete</Button></td></tr>)}</tbody></table></div>
          <Button variant="outline" onClick={() => window.confirm("Clear all logs?") && withReload(() => clearLogs())}>Clear Logs</Button>
        </section>
      )}
    </div>
  );
}


