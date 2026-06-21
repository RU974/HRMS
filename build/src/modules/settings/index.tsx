import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle, BadgeCheck, Building2, ChevronRight, Globe, LockKeyhole,
  MapPinned, Palette, Plus, RefreshCw, Search, ScrollText, ShieldCheck,
  Trash2, Users, X, Eye, EyeOff, Check, Shield, Clock, Activity,
  Edit2, Server, Layers, Key,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import {
  BranchItem, CompanyItem, PermissionGroup, PermissionItem, RoleItem, ThemeItem, UserItem,
  createBranch, createCompany, createRole, createTheme, createUser,
  deleteBranch, deleteCompany, deleteRole, deleteTheme, deleteUser,
  listBranches, listCompanies, listLogs, listPermissions, listRoles,
  listThemes, listUsers, updateBranch, updateCompany, updateRole,
  updateTheme, updateUser, LogItem,
} from "@/services/settings-service";
import { useThemeStore } from "@/store/theme-store";
import { useCurrencyStore, CURRENCY_OPTIONS } from "@/store/currency-store";
import type { CurrencyCode } from "@/store/currency-store";
import { hasAllPermissions, hasAnyPermission, hasPermission } from "@/utils/permissions";
import { LicensingTab } from "./licensing-tab";

/** Resolve display label for a permission regardless of which fields the API returns */
function permLabel(p: PermissionItem): string {
  if (p.display_name) return p.display_name;
  if (p.key) return p.key;
  if (p.module && p.action) return `${p.module}.${p.action}`;
  if (p.name) return p.name;
  if (p.action) return p.action;
  return String(p.id);
}

// ─────────────────────── types ───────────────────────
type SettingsTab = "users" | "roles" | "company" | "branches" | "theme" | "logs" | "licensing";

type SettingsSection = {
  key: SettingsTab;
  label: string;
  description: string;
  permissions: string[];
  requireAllPermissions?: boolean;
  icon: LucideIcon;
  color: string;
};

// ─────────────────────── constants ───────────────────────
const TABS: SettingsSection[] = [
  { key: "users",    label: "User Management",    icon: Users,     color: "text-blue-500",   description: "Manage user accounts, roles, and company assignments.",    permissions: ["users.view", "users.create", "users.edit", "users.delete"] },
  { key: "roles",    label: "Roles & Permissions",icon: ShieldCheck,color: "text-violet-500",description: "Define access roles and fine-grained permission bundles.",   permissions: ["settings.manage_settings"] },
  { key: "company",  label: "Company",            icon: Building2, color: "text-emerald-500",description: "Company profile, contact details, and status.",             permissions: ["settings.manage_settings"] },
  { key: "branches", label: "Branches",           icon: MapPinned, color: "text-amber-500",  description: "Branch locations tied to companies and users.",             permissions: ["settings.manage_settings"] },
  { key: "theme",    label: "Appearance",         icon: Palette,   color: "text-pink-500",   description: "User and company theme preferences.",                       permissions: ["settings.manage_settings"] },
  { key: "logs",      label: "Audit Logs",         icon: ScrollText,color: "text-slate-500",  description: "Immutable audit trail for every system action.",            permissions: ["settings.manage_settings", "audit_logs.view"], requireAllPermissions: true },
  { key: "licensing", label: "Licensing",           icon: Key,       color: "text-amber-500",  description: "Manage license keys, edition limits, and module access.",   permissions: ["settings.manage_settings"] },
];

// ─────────────────────── tiny helpers ───────────────────────
const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 placeholder:text-[var(--muted)]";
const labelCls = "text-xs font-semibold uppercase tracking-widest text-[var(--muted)]";

function methodBadge(m?: string | null) {
  const v = (m ?? "").toUpperCase();
  if (v === "POST")   return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";
  if (v === "PUT" || v === "PATCH") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  if (v === "DELETE") return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
}

function statusBadge(s?: number) {
  if (!s) return "bg-slate-100 text-slate-600";
  if (s >= 500) return "bg-rose-100 text-rose-700";
  if (s >= 400) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function getUserRoles(u: UserItem) {
  return u.roles ?? u.rolesRelation ?? u.roles_relation ?? [];
}

function getUserRoleIds(u: UserItem, roles: RoleItem[]): number[] {
  if (u.role_ids && u.role_ids.length > 0) return u.role_ids.map(Number);
  const assigned = getUserRoles(u);
  if (assigned.length > 0) return assigned.map(r => Number(r.id));
  if (u.role) { const m = roles.find(r => r.name === u.role); if (m) return [Number(m.id)]; }
  return [];
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const sz = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={`${sz} grid shrink-0 place-items-center rounded-full font-bold text-white`}
         style={{ background: `hsl(${hue},60%,45%)` }}>
      {initials}
    </div>
  );
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "success" | "danger" | "warning" | "system" }) {
  const cls = {
    default: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    danger:  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    system:  "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300",
  }[variant];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Modal({ open, title, onClose, children, width = "max-w-lg" }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl`}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 transition hover:bg-[var(--border)]/40">
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)] py-12 text-center">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <Icon className="h-6 w-6 text-[var(--muted)]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="text-xs text-[var(--muted)]">{body}</p>
      </div>
    </div>
  );
}

// ═══════════════════ USER MANAGEMENT ═══════════════════
function UserModal({ open, onClose, user, roles, companies, branches, onSave, busy }:
  { open: boolean; onClose: () => void; user: UserItem | null; roles: RoleItem[]; companies: CompanyItem[]; branches: BranchItem[]; onSave: (data: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const isEdit = Boolean(user);
  const [form, setForm] = useState({ name: "", email: "", password: "", role_ids: [] as number[], company_id: "", branch_id: "", is_active: true });
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(user ? {
        name: user.name, email: user.email, password: "",
        role_ids: getUserRoleIds(user, roles),
        company_id: user.company_id ?? "",
        branch_id: user.branch_id ?? "",
        is_active: user.is_active ?? true,
      } : { name: "", email: "", password: "", role_ids: [] as number[], company_id: "", branch_id: "", is_active: true });
    }
  }, [open, user, roles]); // roles included so pre-selection resolves after async load

  const availBranches = branches.filter(b => b.company_id === form.company_id);
  const valid = form.name && form.email && form.role_ids.length > 0 && (isEdit || form.password.length >= 8);

  function toggle(id: number) {
    setForm(p => ({ ...p, role_ids: p.role_ids.includes(id) ? p.role_ids.filter(x => x !== id) : [...p.role_ids, id] }));
  }

  async function handleSave() {
    const payload: Record<string, unknown> = {
      name: form.name, email: form.email,
      role_ids: form.role_ids,
      company_id: form.company_id || null,
      branch_id: form.branch_id || null,
      is_active: form.is_active,
    };
    if (!isEdit || form.password) payload.password = form.password;
    await onSave(payload);
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit — ${user?.name}` : "Create User"} width="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Full Name">
            <input className={inputCls} placeholder="Ali Raza" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FormField>
          <FormField label="Email">
            <input className={inputCls} type="email" placeholder="ali@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </FormField>
        </div>

        <FormField label={isEdit ? "New Password (leave blank to keep)" : "Password"}>
          <div className="relative">
            <input className={`${inputCls} pr-10`} type={showPw ? "text" : "password"}
              placeholder={isEdit ? "••••••••" : "Min. 8 characters"}
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Company">
            <select className={inputCls} value={form.company_id}
              onChange={e => setForm(p => ({ ...p, company_id: e.target.value, branch_id: "" }))}>
              <option value="">No company</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Branch">
            <select className={inputCls} value={form.branch_id} disabled={!form.company_id}
              onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}>
              <option value="">{form.company_id ? "Select branch" : "Company first"}</option>
              {availBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label={`Assign Roles — ${form.role_ids.length} selected`}>
          <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-2">
            {roles.length === 0
              ? <p className="py-3 text-center text-xs text-[var(--muted)]">No roles available yet</p>
              : roles.map(r => (
                <button key={r.id} type="button" onClick={() => toggle(Number(r.id))}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition text-left ${form.role_ids.includes(Number(r.id)) ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "hover:bg-[var(--border)]/40 text-[var(--text)]"}`}>
                  <div className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${form.role_ids.includes(Number(r.id)) ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)]"}`}>
                    {form.role_ids.includes(Number(r.id)) && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="font-medium">{r.name}</span>
                  {r.is_system && <Badge variant="system">System</Badge>}
                </button>
              ))}
          </div>
        </FormField>

        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <div className={`relative h-5 w-9 rounded-full transition ${form.is_active ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
               onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Active</p>
            <p className="text-xs text-[var(--muted)]">Inactive users cannot log in</p>
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={() => void handleSave()}>
            {busy ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function UsersTab({ users, roles, companies, branches, onReload, busy }: {
  users: UserItem[]; roles: RoleItem[]; companies: CompanyItem[]; branches: BranchItem[];
  onReload: () => Promise<void>; busy: boolean;
}) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => users.filter(u =>
    `${u.name} ${u.email} ${u.company?.name ?? ""} ${u.branch?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())
  ), [users, q]);

  async function handleSave(data: Record<string, unknown>) {
    try {
      if (editing) await updateUser(editing.id, data);
      else await createUser(data);
      setModalOpen(false);
      setEditing(null);
      await onReload();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(u: UserItem) {
    if (!window.confirm(`Delete ${u.name}?`)) return;
    try { await deleteUser(u.id); await onReload(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-4">
      <UserModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }}
        user={editing} roles={roles} companies={companies} branches={branches}
        onSave={handleSave} busy={busy} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className={`${inputCls} pl-9`} placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {filtered.length === 0
        ? <EmptyState icon={Users} title="No users found" body="Create a user or adjust your search." />
        : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                  {["User", "Company / Branch", "Roles", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(u => (
                  <tr key={u.id} className="bg-[var(--card)] transition hover:bg-[var(--background)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <div>
                          <p className="font-semibold text-[var(--text)]">{u.name}</p>
                          <p className="text-xs text-[var(--muted)]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[var(--text)]">{u.company?.name ?? "—"}</p>
                      <p className="text-xs text-[var(--muted)]">{u.branch?.name ?? "No branch"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {getUserRoles(u).length > 0
                          ? getUserRoles(u).map(r => <Badge key={r.id}>{r.name}</Badge>)
                          : <Badge variant="warning">Unassigned</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.is_active === false ? "danger" : "success"}>
                        {u.is_active === false ? "Inactive" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(u); setModalOpen(true); }}
                          className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--border)]/40 hover:text-[var(--primary)]">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => void handleDelete(u)}
                          className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ═══════════════════ ROLES & PERMISSIONS ═══════════════════
function RoleModal({ open, onClose, role, permissions, onSave, busy }:
  { open: boolean; onClose: () => void; role: RoleItem | null; permissions: PermissionGroup[]; onSave: (data: { name: string; description: string; permission_ids: string[] }) => Promise<void>; busy: boolean }) {
  const [form, setForm] = useState({ name: "", description: "", permission_ids: [] as string[] });
  const [pq, setPq] = useState("");

  useEffect(() => {
    if (open) setForm(role ? { name: role.name, description: role.description ?? "", permission_ids: (role.permissions ?? []).map(p => p.id) } : { name: "", description: "", permission_ids: [] });
    if (!open) setPq("");
  }, [open, role]);

  const filtered = useMemo(() => {
    const t = pq.toLowerCase();
    const safePermissions = Array.isArray(permissions) ? permissions : [];
    if (!t) return safePermissions;
    return safePermissions
      .map(g => ({ ...g, permissions: (g.permissions ?? []).filter(p => permLabel(p).toLowerCase().includes(t)) }))
      .filter(g => g.permissions.length > 0);
  }, [permissions, pq]);

  function toggle(id: string) {
    setForm(p => ({ ...p, permission_ids: p.permission_ids.includes(id) ? p.permission_ids.filter(x => x !== id) : [...p.permission_ids, id] }));
  }

  function toggleGroup(group: PermissionGroup) {
    const ids = (group.permissions ?? []).map(p => p.id);
    const allSelected = ids.every(id => form.permission_ids.includes(id));
    setForm(p => ({ ...p, permission_ids: allSelected ? p.permission_ids.filter(id => !ids.includes(id)) : [...new Set([...p.permission_ids, ...ids])] }));
  }

  const allPermissionIds = Array.isArray(permissions) ? permissions.flatMap(g => (g.permissions ?? []).map(p => p.id)) : [];

  return (
    <Modal open={open} onClose={onClose} title={role ? `Edit Role — ${role.name}` : "Create Role"} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Role Name">
            <input className={inputCls} placeholder="HR Manager" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <input className={inputCls} placeholder="Brief description…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </FormField>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
              placeholder="Filter permissions…" value={pq} onChange={e => setPq(e.target.value)} />
            <span className="text-xs text-[var(--muted)]">{form.permission_ids.length}/{allPermissionIds.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto p-2 space-y-3">
            {filtered.length === 0
              ? <p className="py-4 text-center text-xs text-[var(--muted)]">No permissions match</p>
              : filtered.map(group => {
                const ids = (group.permissions ?? []).map(p => p.id);
                const allSel = ids.every(id => form.permission_ids.includes(id));
                const someSel = ids.some(id => form.permission_ids.includes(id));
                return (
                  <div key={group.module}>
                    <button type="button" onClick={() => toggleGroup(group)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--border)]/40">
                      <div className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${allSel ? "border-[var(--primary)] bg-[var(--primary)]" : someSel ? "border-[var(--primary)] bg-[var(--primary)]/30" : "border-[var(--border)]"}`}>
                        {allSel && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{group.module}</span>
                      <span className="ml-auto text-xs text-[var(--muted)]">{ids.filter(id => form.permission_ids.includes(id)).length}/{ids.length}</span>
                    </button>
                    <div className="ml-6 mt-1 grid grid-cols-2 gap-1">
                      {(group.permissions ?? []).map(p => (
                        <button key={p.id} type="button" onClick={() => toggle(p.id)}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition text-left ${form.permission_ids.includes(p.id) ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "hover:bg-[var(--border)]/40 text-[var(--text)]"}`}>
                          <div className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition ${form.permission_ids.includes(p.id) ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)]"}`}>
                            {form.permission_ids.includes(p.id) && <Check className="h-2 w-2 text-white" />}
                          </div>
                          <span className="truncate text-xs">{permLabel(p)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name || form.permission_ids.length === 0 || busy} onClick={() => void onSave(form)}>
            {busy ? "Saving…" : role ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RolesTab({ roles, permissions, onReload, busy }: {
  roles: RoleItem[]; permissions: PermissionGroup[]; onReload: () => Promise<void>; busy: boolean;
}) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = useMemo(() => roles.filter(r =>
    `${r.name} ${r.description ?? ""}`.toLowerCase().includes(q.toLowerCase())
  ), [roles, q]);

  const allPermissions = useMemo(() => Array.isArray(permissions) ? permissions.flatMap(g => g.permissions ?? []) : [], [permissions]);

  async function handleSave(data: { name: string; description: string; permission_ids: string[] }) {
    try {
      if (editing) await updateRole(editing.id, data);
      else await createRole(data);
      setModalOpen(false); setEditing(null);
      await onReload();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(r: RoleItem) {
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    try { await deleteRole(r.id); await onReload(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-4">
      <RoleModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }}
        role={editing} permissions={permissions} onSave={handleSave} busy={busy} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className={`${inputCls} pl-9`} placeholder="Search roles…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Create Role
        </Button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {filtered.length === 0
        ? <EmptyState icon={ShieldCheck} title="No roles found" body="Create a role or refine your search." />
        : (
          <div className="space-y-2">
            {filtered.map(r => {
              const perms = r.permissions ?? [];
              const expanded = expandedId === Number(r.id);
              const coverage = allPermissions.length > 0 ? Math.round((perms.length / allPermissions.length) * 100) : 0;
              return (
                <div key={r.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${r.is_system ? "bg-slate-100 dark:bg-slate-700" : "bg-violet-100 dark:bg-violet-900/40"}`}>
                      <Shield className={`h-4 w-4 ${r.is_system ? "text-slate-500" : "text-violet-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--text)]">{r.name}</p>
                        {r.is_system && <Badge variant="system">System</Badge>}
                      </div>
                      {r.description && <p className="text-xs text-[var(--muted)]">{r.description}</p>}
                    </div>
                    <div className="hidden items-center gap-4 text-xs text-[var(--muted)] sm:flex">
                      <span>{perms.length} permissions</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
                          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${coverage}%` }} />
                        </div>
                        <span>{coverage}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setExpandedId(expanded ? null : Number(r.id))}
                        className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--border)]/40">
                        <Layers className="h-4 w-4" />
                      </button>
                      <button disabled={r.is_system} onClick={() => { setEditing(r); setModalOpen(true); }}
                        className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--border)]/40 hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-30">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button disabled={r.is_system} onClick={() => void handleDelete(r)}
                        className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {expanded && perms.length > 0 && (
                    <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {perms.map(p => (
                          <span key={p.id} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                            {permLabel(p)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ═══════════════════ COMPANY ═══════════════════
function CompanyModal({ open, onClose, company, onSave, busy }:
  { open: boolean; onClose: () => void; company: CompanyItem | null; onSave: (data: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", website: "", address: "", timezone: "Asia/Karachi", is_active: true });

  useEffect(() => {
    if (open) setForm(company ? { name: company.name, email: company.email ?? "", phone: company.phone ?? "", website: company.website ?? "", address: company.address ?? "", timezone: company.timezone ?? "Asia/Karachi", is_active: company.is_active ?? true }
      : { name: "", email: "", phone: "", website: "", address: "", timezone: "Asia/Karachi", is_active: true });
  }, [open, company]);

  const timezones = [
    "UTC",
    "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
    "America/Anchorage", "America/Argentina/Buenos_Aires", "America/Bogota",
    "America/Chicago", "America/Denver", "America/Halifax", "America/Los_Angeles",
    "America/Mexico_City", "America/New_York", "America/Phoenix", "America/Santiago",
    "America/Sao_Paulo", "America/St_Johns", "America/Toronto", "America/Vancouver",
    "Asia/Bangkok", "Asia/Colombo", "Asia/Dhaka", "Asia/Dubai", "Asia/Hong_Kong",
    "Asia/Jakarta", "Asia/Kabul", "Asia/Karachi", "Asia/Kathmandu", "Asia/Kolkata",
    "Asia/Kuala_Lumpur", "Asia/Kuwait", "Asia/Manila", "Asia/Riyadh", "Asia/Seoul",
    "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei", "Asia/Tehran", "Asia/Tokyo",
    "Asia/Tashkent", "Asia/Yekaterinburg",
    "Atlantic/Azores", "Atlantic/Cape_Verde",
    "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin",
    "Australia/Perth", "Australia/Sydney",
    "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels",
    "Europe/Bucharest", "Europe/Dublin", "Europe/Helsinki", "Europe/Istanbul",
    "Europe/Kiev", "Europe/Lisbon", "Europe/London", "Europe/Madrid",
    "Europe/Moscow", "Europe/Paris", "Europe/Prague", "Europe/Rome",
    "Europe/Stockholm", "Europe/Warsaw", "Europe/Zurich",
    "Pacific/Auckland", "Pacific/Fiji", "Pacific/Guam", "Pacific/Honolulu",
    "Pacific/Midway", "Pacific/Port_Moresby",
  ];

  return (
    <Modal open={open} onClose={onClose} title={company ? `Edit — ${company.name}` : "Create Company"}>
      <div className="space-y-4">
        <FormField label="Company Name">
          <input className={inputCls} placeholder="Acme Corp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Email">
            <input className={inputCls} type="email" placeholder="hello@acme.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </FormField>
          <FormField label="Phone">
            <input className={inputCls} placeholder="+92 300 0000000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Website">
            <input className={inputCls} type="url" placeholder="https://acme.com" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
          </FormField>
          <FormField label="Timezone">
            <select className={inputCls} value={form.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}>
              {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Address">
          <textarea className={inputCls} rows={2} placeholder="Head office address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
        </FormField>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <div className={`relative h-5 w-9 rounded-full transition ${form.is_active ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
               onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Active</p>
            <p className="text-xs text-[var(--muted)]">Inactive companies are hidden from assignments</p>
          </div>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name || busy} onClick={() => void onSave(form)}>
            {busy ? "Saving…" : company ? "Save Changes" : "Create Company"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CompanyTab({ companies, onReload, busy }: { companies: CompanyItem[]; onReload: () => Promise<void>; busy: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => companies.filter(c => `${c.name} ${c.email ?? ""} ${c.timezone ?? ""}`.toLowerCase().includes(q.toLowerCase())), [companies, q]);

  async function handleSave(data: Record<string, unknown>) {
    try {
      if (editing) await updateCompany(editing.id, data);
      else await createCompany(data);
      setModalOpen(false); setEditing(null);
      await onReload();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(c: CompanyItem) {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await deleteCompany(c.id); await onReload(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-4">
      <CompanyModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }}
        company={editing} onSave={handleSave} busy={busy} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className={`${inputCls} pl-9`} placeholder="Search companies…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Company
        </Button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {filtered.length === 0
        ? <EmptyState icon={Building2} title="No companies found" body="Create a company or adjust your search." />
        : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(c => (
              <div key={c.id} className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:shadow-md">
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => { setEditing(c); setModalOpen(true); }}
                    className="rounded-lg p-1.5 transition hover:bg-[var(--border)]/40 hover:text-[var(--primary)]">
                    <Edit2 className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </button>
                  <button disabled={(c.branches_count ?? 0) > 0} onClick={() => void handleDelete(c)}
                    className="rounded-lg p-1.5 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30">
                    <Trash2 className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text)]">{c.name}</p>
                    <Badge variant={c.is_active === false ? "danger" : "success"}>
                      {c.is_active === false ? "Inactive" : "Active"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-xs text-[var(--muted)]">
                  {c.email && <div className="flex items-center gap-2"><span className="font-medium">Email</span><span className="truncate">{c.email}</span></div>}
                  {c.phone && <div className="flex items-center gap-2"><span className="font-medium">Phone</span><span>{c.phone}</span></div>}
                  {c.timezone && <div className="flex items-center gap-2"><Globe className="h-3 w-3" /><span>{c.timezone}</span></div>}
                </div>
                <div className="mt-3 flex gap-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                  <span><strong className="text-[var(--text)]">{c.branches_count ?? 0}</strong> branches</span>
                  <span><strong className="text-[var(--text)]">{c.users_count ?? 0}</strong> users</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ═══════════════════ BRANCHES ═══════════════════
function BranchModal({ open, onClose, branch, companies, onSave, busy }:
  { open: boolean; onClose: () => void; branch: BranchItem | null; companies: CompanyItem[]; onSave: (data: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [form, setForm] = useState({ company_id: "", name: "", code: "", email: "", phone: "", address: "", is_active: true });

  useEffect(() => {
    if (open) setForm(branch ? { company_id: branch.company_id, name: branch.name, code: branch.code ?? "", email: branch.email ?? "", phone: branch.phone ?? "", address: branch.address ?? "", is_active: branch.is_active ?? true }
      : { company_id: companies[0]?.id ?? "", name: "", code: "", email: "", phone: "", address: "", is_active: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={branch ? `Edit — ${branch.name}` : "Create Branch"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Company">
            <select className={inputCls} value={form.company_id} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))}>
              <option value="">Select company</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Branch Code">
            <input className={inputCls} placeholder="HQ-01" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
          </FormField>
        </div>
        <FormField label="Branch Name">
          <input className={inputCls} placeholder="Lahore Head Office" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Email">
            <input className={inputCls} type="email" placeholder="branch@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </FormField>
          <FormField label="Phone">
            <input className={inputCls} placeholder="+92 42 0000000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </FormField>
        </div>
        <FormField label="Address">
          <textarea className={inputCls} rows={2} placeholder="Branch address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
        </FormField>
        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <div className={`relative h-5 w-9 rounded-full transition ${form.is_active ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
               onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <span className="text-sm font-medium text-[var(--text)]">Active</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.company_id || !form.name || busy} onClick={() => void onSave(form)}>
            {busy ? "Saving…" : branch ? "Save Changes" : "Create Branch"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BranchesTab({ branches, companies, onReload, busy }: { branches: BranchItem[]; companies: CompanyItem[]; onReload: () => Promise<void>; busy: boolean }) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BranchItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => branches.filter(b => `${b.name} ${b.code ?? ""} ${b.company?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())), [branches, q]);

  async function handleSave(data: Record<string, unknown>) {
    try {
      if (editing) await updateBranch(editing.id, data);
      else await createBranch(data);
      setModalOpen(false); setEditing(null);
      await onReload();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDelete(b: BranchItem) {
    if (!window.confirm(`Delete branch "${b.name}"?`)) return;
    try { await deleteBranch(b.id); await onReload(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-4">
      <BranchModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }}
        branch={editing} companies={companies} onSave={handleSave} busy={busy} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className={`${inputCls} pl-9`} placeholder="Search branches…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Branch
        </Button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {filtered.length === 0
        ? <EmptyState icon={MapPinned} title="No branches found" body="Create a branch or refine your search." />
        : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                  {["Branch", "Company", "Code", "Contact", "Users", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(b => (
                  <tr key={b.id} className="bg-[var(--card)] transition hover:bg-[var(--background)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                          <MapPinned className="h-4 w-4 text-amber-600" />
                        </div>
                        <p className="font-semibold text-[var(--text)]">{b.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text)]">{b.company?.name ?? "—"}</td>
                    <td className="px-4 py-3"><code className="rounded bg-[var(--background)] px-2 py-0.5 text-xs">{b.code ?? "—"}</code></td>
                    <td className="px-4 py-3">
                      <p className="text-[var(--text)]">{b.email ?? "—"}</p>
                      <p className="text-xs text-[var(--muted)]">{b.phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{b.users_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={b.is_active === false ? "danger" : "success"}>
                        {b.is_active === false ? "Inactive" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(b); setModalOpen(true); }}
                          className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--border)]/40 hover:text-[var(--primary)]">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button disabled={(b.users_count ?? 0) > 0} onClick={() => void handleDelete(b)}
                          className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                          title={(b.users_count ?? 0) > 0 ? "Move users first" : undefined}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ═══════════════════ APPEARANCE ═══════════════════
function AppearanceTab({ themes, onReload, busy }: { themes: ThemeItem[]; onReload: () => Promise<void>; busy: boolean }) {
  const setThemeStore = useThemeStore(s => s.setTheme);
  const { user } = useAuthStore();
  const [form, setForm] = useState({ theme: "light", company_scope: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currency, setCurrency } = useCurrencyStore();

  const canCompanyScope = Boolean(user?.company_id);
  const options = [
    { value: "light", label: "Light", icon: "☀️", desc: "Bright, clear UI" },
    { value: "dark",  label: "Dark",  icon: "🌙", desc: "Easy on the eyes" },
    { value: "system",label: "System",icon: "💻", desc: "Follows OS setting" },
  ];

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const saved = await createTheme({ theme: form.theme, preferences: {}, company_scope: form.company_scope });
      setThemeStore(saved.theme === "dark" ? "dark" : saved.theme === "system" ? "system" : "light");
      await onReload();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(t: ThemeItem) {
    if (!window.confirm("Remove this theme preference?")) return;
    try { await deleteTheme(t.id); await onReload(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  function scopeLabel(t: ThemeItem) {
    if (t.user_id) return "User";
    if (t.company_id) return "Company";
    return "Global";
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="mb-4 text-sm font-semibold text-[var(--text)]">Select Theme</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => setForm(p => ({ ...p, theme: o.value }))}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${form.theme === o.value ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)] hover:border-[var(--primary)]/40"}`}>
              <span className="text-2xl">{o.icon}</span>
              <p className="text-sm font-semibold text-[var(--text)]">{o.label}</p>
              <p className="text-xs text-[var(--muted)]">{o.desc}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Apply to entire company</p>
            <p className="text-xs text-[var(--muted)]">{canCompanyScope ? "All users in this company will inherit this theme" : "Assign your account to a company first"}</p>
          </div>
          <div className={`relative h-5 w-9 cursor-pointer rounded-full transition ${form.company_scope && canCompanyScope ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
               onClick={() => canCompanyScope && setForm(p => ({ ...p, company_scope: !p.company_scope }))}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.company_scope && canCompanyScope ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
        </div>

        <Button className="mt-4" disabled={saving || busy} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save Preference"}
        </Button>
      </div>

      {/* ── Currency ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="mb-1 text-sm font-semibold text-[var(--text)]">Currency</p>
        <p className="mb-4 text-xs text-[var(--muted)]">Monetary values across Payroll, Employees, and Dashboard will be converted and displayed in the selected currency.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CURRENCY_OPTIONS.map(opt => (
            <button
              key={opt.code}
              type="button"
              onClick={() => setCurrency(opt.code as CurrencyCode)}
              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${currency === opt.code ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)] hover:border-[var(--primary)]/40"}`}
            >
              <span className="text-lg font-bold text-[var(--text)]">{opt.symbol}</span>
              <div>
                <p className="text-xs font-semibold text-[var(--text)]">{opt.code}</p>
                <p className="text-xs text-[var(--muted)]">{opt.label.split(" – ")[1]}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Exchange rates are approximate. Stored values remain in PKR; display is converted automatically.
        </p>
      </div>

      {themes.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Stored Preferences</p>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                  {["Scope", "Theme", "Updated", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {themes.map(t => (
                  <tr key={t.id} className="bg-[var(--card)] hover:bg-[var(--background)]">
                    <td className="px-4 py-3"><Badge>{scopeLabel(t)}</Badge></td>
                    <td className="px-4 py-3 capitalize text-[var(--text)]">{t.theme}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{t.updated_at ? new Date(t.updated_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => void handleDelete(t)}
                        className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ AUDIT LOGS ═══════════════════
function LogsTab({ logs: rawLogs, page, totalPages, onPageChange }: { logs: LogItem[]; page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const logs = Array.isArray(rawLogs) ? rawLogs : [];
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [selected, setSelected] = useState<LogItem | null>(logs[0] ?? null);

  useEffect(() => { if (!selected && logs.length > 0) setSelected(logs[0]); }, [logs, selected]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return logs.filter(l => {
      const method = l.http_method ?? l.method;
      const path = l.endpoint ?? l.path;
      if (methodFilter && method !== methodFilter) return false;
      return `${method} ${path} ${l.module ?? ""} ${l.action ?? ""} ${l.description ?? ""} ${l.status_code}`.toLowerCase().includes(t);
    });
  }, [logs, q, methodFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className={`${inputCls} pl-9`} placeholder="Search logs…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto`} value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
          <option value="">All methods</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          {filtered.length === 0
            ? <div className="p-8"><EmptyState icon={Activity} title="No logs match" body="Adjust your search or method filter." /></div>
            : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                      {["Method", "Path", "Module", "Actor", "Status", "Time"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filtered.map(l => {
                      const method = l.http_method ?? l.method;
                      const path = l.endpoint ?? l.path;
                      const isSel = selected?.id === l.id;
                      return (
                        <tr key={l.id} onClick={() => setSelected(l)}
                          className={`cursor-pointer transition ${isSel ? "bg-[var(--primary)]/5" : "bg-[var(--card)] hover:bg-[var(--background)]"}`}>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${methodBadge(method)}`}>{method}</span>
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-[var(--text)]">{path}</td>
                          <td className="px-4 py-3 text-[var(--muted)]">{l.module ?? "—"}</td>
                          <td className="px-4 py-3 text-[var(--muted)]">{l.user?.name ?? "System"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge(l.status_code)}`}>{l.status_code}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--muted)]">
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Log Detail</p>
          {selected ? (
            <div className="space-y-3 text-sm">
              {[
                { label: "Action", value: selected.action ?? "—" },
                { label: "Description", value: selected.description ?? "—" },
                { label: "Request", value: `${selected.http_method ?? selected.method} ${selected.endpoint ?? selected.path}` },
                { label: "Actor", value: selected.user ? `${selected.user.name} (${selected.user.email ?? ""})` : "System" },
                { label: "Status", value: String(selected.status_code) },
                { label: "Time", value: new Date(selected.created_at).toLocaleString() },
              ].map(row => (
                <div key={row.label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{row.label}</p>
                  <p className="mt-0.5 text-[var(--text)]">{row.value}</p>
                </div>
              ))}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Payload</p>
                <pre className="max-h-60 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200 dark:bg-black">
                  {typeof selected.payload === "string" ? selected.payload || "{}" : JSON.stringify(selected.payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Click a row to inspect</p>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-[var(--muted)]">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const hasPermissionFor = useAuthStore(s => s.hasPermission);

  const initialTab = (searchParams.get("tab") as SettingsTab | null) ?? "users";
  const [tab, setTab] = useState<SettingsTab>(TABS.some(t => t.key === initialTab) ? initialTab : "users");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionGroup[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);

  const canManageUsers    = hasAnyPermission(user, ["users.view", "users.create", "users.edit", "users.delete"]);
  const canManageRoles    = hasPermissionFor("settings.manage_settings");
  const canManageSettings = hasPermissionFor("settings.manage_settings");
  const canViewLogs       = hasAllPermissions(user, ["settings.manage_settings", "audit_logs.view"]);

  const visibleTabs = useMemo(() =>
    TABS.filter(t => t.requireAllPermissions ? hasAllPermissions(user, t.permissions) : hasAnyPermission(user, t.permissions)),
  [user]);

  const activeTab = visibleTabs.find(t => t.key === tab) ?? visibleTabs[0];

  const stats = [
    { label: "Users",       value: (users ?? []).length,       icon: Users,      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" },
    { label: "Roles",       value: (roles ?? []).length,        icon: ShieldCheck, color: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400" },
    { label: "Branches",    value: (branches ?? []).length,     icon: MapPinned,  color: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" },
    { label: "Permissions", value: Array.isArray(permissions) ? permissions.flatMap(g => g.permissions ?? []).length : 0, icon: LockKeyhole, color: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400" },
  ];

  async function loadAll() {
    setBusy(true); setError(null);
    try {
      const [u, r, p, c, b, th, lg] = await Promise.all([
        canManageUsers    ? listUsers()        : Promise.resolve([] as UserItem[]),
        canManageRoles    ? listRoles()        : Promise.resolve([] as RoleItem[]),
        canManageRoles    ? listPermissions()  : Promise.resolve([] as PermissionGroup[]),
        canManageSettings ? listCompanies()    : Promise.resolve([] as CompanyItem[]),
        canManageSettings ? listBranches()     : Promise.resolve([] as BranchItem[]),
        canManageSettings ? listThemes()       : Promise.resolve([] as ThemeItem[]),
        canViewLogs       ? listLogs(logsPage) : Promise.resolve({ data: [] as LogItem[], current_page: 1, last_page: 1, total: 0 }),
      ]);
      setUsers(Array.isArray(u) ? u : []); setRoles(Array.isArray(r) ? r : []); setPermissions(Array.isArray(p) ? p : []); setCompanies(Array.isArray(c) ? c : []); setBranches(Array.isArray(b) ? b : []); setThemes(Array.isArray(th) ? th : []);
      setLogs(Array.isArray(lg.data) ? lg.data : Array.isArray(lg) ? (lg as unknown as LogItem[]) : []); setLogsTotalPages(lg.last_page ?? 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load settings."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canViewLogs) return;
    setBusy(true);
    listLogs(logsPage)
      .then(lg => { setLogs(lg.data); setLogsTotalPages(lg.last_page); })
      .catch(() => {/* silently ignore page fetch errors */})
      .finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsPage]);

  useEffect(() => {
    const nextTab = (searchParams.get("tab") as SettingsTab | null) ?? "users";
    if (TABS.some(t => t.key === nextTab) && nextTab !== tab) setTab(nextTab);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some(t => t.key === tab)) {
      const fb = visibleTabs[0].key;
      setTab(fb); setSearchParams({ tab: fb });
    }
  }, [visibleTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeTab(key: SettingsTab) { setTab(key); setSearchParams({ tab: key }); }

  if (visibleTabs.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
        <EmptyState icon={LockKeyhole} title="Access restricted" body="You don't have permission to view administrative settings." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header banner ── */}
      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary)] to-blue-600 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-white/80" />
              <p className="text-sm font-semibold uppercase tracking-widest text-white/80">System Settings</p>
            </div>
            <h1 className="text-2xl font-bold text-white">Administration</h1>
            <p className="text-sm text-blue-200">Manage users, roles, organizations, and system configuration.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            {stats.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <div className={`mb-2 grid h-7 w-7 place-items-center rounded-xl ${s.color} bg-white`}>
                    <Icon className={`h-3.5 w-3.5`} />
                  </div>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-blue-200">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          {activeTab && <>
            <activeTab.icon className={`h-4 w-4 ${activeTab.color}`} />
            <span className="font-medium text-[var(--text)]">{activeTab.label}</span>
            <ChevronRight className="h-3 w-3" />
            <span>{activeTab.description}</span>
          </>}
        </div>
        <Button variant="outline" onClick={() => void loadAll()} disabled={busy} className="gap-2 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* ── Main two-column layout ── */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Sidebar nav */}
        <nav className="space-y-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 lg:self-start">
          {visibleTabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            const count = t.key === "users" ? (users ?? []).length : t.key === "roles" ? (roles ?? []).length : t.key === "company" ? (companies ?? []).length : t.key === "branches" ? (branches ?? []).length : t.key === "theme" ? (themes ?? []).length : (logs ?? []).length;
            return (
              <button key={t.key} type="button" onClick={() => changeTab(t.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text)] hover:bg-[var(--background)]"}`}>
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : t.color}`} />
                <span className="flex-1 text-left font-medium">{t.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-white/20 text-white" : "bg-[var(--background)] text-[var(--muted)]"}`}>{count}</span>
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          {busy && !(users ?? []).length && !(roles ?? []).length
            ? <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
            : (
              <>
                {tab === "users"    && <UsersTab    users={users} roles={roles} companies={companies} branches={branches} onReload={loadAll} busy={busy} />}
                {tab === "roles"    && <RolesTab    roles={roles} permissions={permissions} onReload={loadAll} busy={busy} />}
                {tab === "company"  && <CompanyTab  companies={companies} onReload={loadAll} busy={busy} />}
                {tab === "branches" && <BranchesTab branches={branches} companies={companies} onReload={loadAll} busy={busy} />}
                {tab === "theme"    && <AppearanceTab themes={themes} onReload={loadAll} busy={busy} />}
                {tab === "logs"      && <LogsTab      logs={logs} page={logsPage} totalPages={logsTotalPages} onPageChange={setLogsPage} />}
                {tab === "licensing" && <LicensingTab />}
              </>
            )}
        </div>
      </div>
    </div>
  );
}