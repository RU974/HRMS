import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Key, Users, Building2, Zap, Check, Copy,
  AlertTriangle, Clock, Crown, Star, Rocket, ChevronDown,
  X, Edit2, Plus, CheckCircle2, XCircle, Calendar, RefreshCw,
} from "lucide-react";
import {
  LicenseEdition,
  LicenseStatus,
  LicenseItem,
  LicenseUsage,
  activateLicense,
  createLicense,
  getLicenseUsage,
  listLicenses,
  updateLicense,
} from "@/services/settings-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 placeholder:text-[var(--muted)]";
const labelCls = "text-xs font-semibold uppercase tracking-widest text-[var(--muted)]";

function fmtDate(s?: string | null) {
  if (!s) return "Never";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function usagePct(used: number, max: number) {
  return max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} title="Copy"
      className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: LicenseStatus }) {
  const cfg = {
    active:    { icon: CheckCircle2,  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Active"    },
    trial:     { icon: Clock,         cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",             label: "Trial"     },
    expired:   { icon: XCircle,       cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",             label: "Expired"   },
    suspended: { icon: AlertTriangle, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",         label: "Suspended" },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {cfg.label}
    </span>
  );
}

// ─── Edition config ───────────────────────────────────────────────────────────
const EDITION_CFG: Record<LicenseEdition, {
  icon: typeof Star; gradient: string; border: string; badge: string; label: string;
}> = {
  Starter:      { icon: Zap,    gradient: "from-slate-700 to-slate-900",    border: "border-slate-500/30",  badge: "bg-slate-100 text-slate-700",    label: "Starter"      },
  Professional: { icon: Star,   gradient: "from-blue-700 to-indigo-900",    border: "border-blue-400/30",   badge: "bg-blue-100 text-blue-700",      label: "Professional" },
  Enterprise:   { icon: Crown,  gradient: "from-violet-700 to-purple-900",  border: "border-violet-400/30", badge: "bg-violet-100 text-violet-700",  label: "Enterprise"   },
};

// ─── Usage ring SVG ───────────────────────────────────────────────────────────
function UsageRing({ used, max, label, color }: { used: number; max: number; label: string; color: string }) {
  const pct   = usagePct(used, max);
  const r     = 30;
  const circ  = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-20 w-20">
        <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7"
            stroke={color} strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-base font-black text-white">{pct}%</p>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-white">{used.toLocaleString()} / {max.toLocaleString()}</p>
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">{label}</p>
      </div>
    </div>
  );
}

// ─── Active license hero ──────────────────────────────────────────────────────
function ActiveLicenseHero({ license, usage }: { license: LicenseItem; usage: LicenseUsage }) {
  const cfg = EDITION_CFG[license.edition] ?? EDITION_CFG.Starter;
  const Icon = cfg.icon;
  const empPct  = usagePct(usage.active_employees, license.max_employees);
  const userPct = usagePct(usage.active_users, license.max_users);

  const daysColor = !license.days_remaining ? "#10b981"
    : license.days_remaining < 30  ? "#ef4444"
    : license.days_remaining < 90  ? "#f59e0b"
    : "#10b981";

  const features: string[] = Array.isArray(license.features)
    ? license.features
    : typeof license.features === "string"
      ? (license.features as string).split(",").map((f) => f.trim()).filter(Boolean)
      : [];

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${cfg.gradient} p-6 shadow-xl`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="relative">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Current License</p>
                <h2 className="text-lg font-black text-white">{license.edition} Edition</h2>
              </div>
            </div>
            <p className="text-sm text-white/60">{license.licensee_name} · {license.licensee_email}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={license.status} />
              {license.days_remaining != null && (
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
                  {license.days_remaining} days remaining
                </span>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border ${cfg.border} bg-white/8 px-4 py-3 backdrop-blur-sm`}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">License Key</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm font-semibold tracking-wider text-white">
                {license.license_key}
              </code>
              <CopyButton value={license.license_key} />
            </div>
            {license.issued_at && (
              <p className="mt-1.5 text-[10px] text-white/35">
                Issued {fmtDate(license.issued_at)}{license.issued_by ? ` by ${license.issued_by}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-around gap-6 rounded-2xl border border-white/10 bg-white/5 py-5 backdrop-blur-sm">
          <UsageRing used={usage.active_employees} max={license.max_employees} label="Employees"
            color={empPct >= 90 ? "#ef4444" : empPct >= 70 ? "#f59e0b" : "#10b981"} />
          <div className="h-16 w-px bg-white/10" />
          <UsageRing used={usage.active_users} max={license.max_users} label="Users"
            color={userPct >= 90 ? "#ef4444" : userPct >= 70 ? "#f59e0b" : "#10b981"} />
          <div className="h-16 w-px bg-white/10" />
          <div className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-20">
              <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
                {license.days_remaining != null && license.expires_at && (
                  <circle cx="40" cy="40" r="30" fill="none" strokeWidth="7"
                    stroke={daysColor} strokeLinecap="round"
                    strokeDasharray={`${(Math.min(license.days_remaining, 365) / 365) * (2 * Math.PI * 30)} ${2 * Math.PI * 30}`}
                    style={{ transition: "stroke-dasharray 0.8s ease" }}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-base font-black text-white">{license.days_remaining ?? "∞"}</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-white">
                {license.expires_at ? fmtDate(license.expires_at) : "Never"}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">Expiry Date</p>
            </div>
          </div>
        </div>

        {features.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">Included Modules</p>
            <div className="flex flex-wrap gap-1.5">
              {features.map((f) => (
                <span key={f}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium capitalize text-white/80 backdrop-blur-sm">
                  <Check className="h-2.5 w-2.5 text-emerald-400" /> {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edition plan cards ───────────────────────────────────────────────────────
const PLANS: Array<{
  edition: LicenseEdition;
  price: string;
  period: string;
  tagline: string;
  limits: string;
  features: string[];
  highlighted?: boolean;
}> = [
  {
    edition: "Starter",
    price: "Free",
    period: "",
    tagline: "For small teams getting started",
    limits: "Up to 25 employees · 5 users",
    features: ["Employee records", "Basic attendance", "Leave management", "Email support"],
  },
  {
    edition: "Professional",
    price: "$8",
    period: "/ user / month",
    tagline: "For growing organizations",
    limits: "Up to 200 employees · 50 users",
    features: ["Everything in Starter", "Payroll processing", "Performance reviews", "Approvals & workflows", "Chat & announcements", "Priority support"],
    highlighted: true,
  },
  {
    edition: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "For large enterprises",
    limits: "Unlimited employees & users",
    features: ["Everything in Professional", "Recruitment module", "Custom roles & permissions", "Multi-branch & company", "Audit logs", "Dedicated support", "SLA guarantee"],
  },
];

function PlanCard({ plan, current }: { plan: typeof PLANS[0]; current: boolean }) {
  const cfg = EDITION_CFG[plan.edition];
  const Icon = cfg.icon;

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
      plan.highlighted
        ? "border-[var(--primary)] shadow-md shadow-[var(--primary)]/10"
        : "border-[var(--border)]"
    } bg-[var(--card)]`}>
      {plan.highlighted && (
        <div className="absolute inset-x-0 top-0 flex justify-center">
          <span className="rounded-b-xl bg-[var(--primary)] px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
            Most Popular
          </span>
        </div>
      )}

      <div className={`p-5 ${plan.highlighted ? "pt-8" : ""}`}>
        <div className="mb-3 flex items-center gap-2.5">
          <div className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${cfg.gradient}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text)]">{plan.edition}</p>
            <p className="text-[10px] text-[var(--muted)]">{plan.tagline}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-[var(--text)]">{plan.price}</span>
            {plan.period && <span className="text-xs text-[var(--muted)]">{plan.period}</span>}
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{plan.limits}</p>
        </div>

        {current ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Current Plan
          </div>
        ) : (
          <button className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
            plan.highlighted
              ? "bg-[var(--primary)] text-white hover:opacity-90"
              : "border border-[var(--border)] text-[var(--text)] hover:bg-[var(--background)]"
          }`}>
            {plan.edition === "Enterprise" ? "Contact Sales" : "Upgrade"}
          </button>
        )}
      </div>

      <div className="flex-1 border-t border-[var(--border)] p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Includes</p>
        <ul className="space-y-2">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-[var(--text)]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Activate key modal ───────────────────────────────────────────────────────
function ActivateModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [key, setKey]   = useState("");
  const [errMsg, setErrMsg] = useState("");

  const mutation = useMutation({
    mutationFn: () => activateLicense(key.trim()),
    onSuccess: () => {
      onSuccess();
      onClose();
      setKey("");
      setErrMsg("");
    },
    onError: (e: Error) => setErrMsg(e.message || "License activation failed."),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-[var(--primary)]" />
            <h3 className="text-base font-semibold text-[var(--text)]">Activate License Key</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--border)]/40">
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            Enter the license key provided by Slingshottech. Format: <code className="font-mono font-bold">HRMS-XXXXX-XXXXX-XXXXX-XXXXX</code>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>License Key</label>
            <input
              className={`${inputCls} font-mono tracking-wider`}
              placeholder="HRMS-XXXXX-XXXXX-XXXXX-XXXXX"
              value={key}
              onChange={(e) => { setKey(e.target.value.toUpperCase()); setErrMsg(""); }}
            />
          </div>
          {errMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--background)]">
              Cancel
            </button>
            <button
              onClick={() => void mutation.mutate()}
              disabled={!key.trim() || mutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Activating…</>
                : <><Key className="h-3.5 w-3.5" /> Activate</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Issue / Edit modal ───────────────────────────────────────────────────────
function IssueModal({
  open, onClose, onSuccess, license,
}: {
  open: boolean; onClose: () => void; onSuccess: () => void; license?: LicenseItem;
}) {
  const [form, setForm] = useState({
    licensee_name:  license?.licensee_name  ?? "",
    licensee_email: license?.licensee_email ?? "",
    edition:        license?.edition        ?? "Professional" as LicenseEdition,
    max_employees:  String(license?.max_employees ?? 50),
    max_users:      String(license?.max_users     ?? 20),
    expires_at:     license?.expires_at?.slice(0, 10) ?? "",
    issued_by:      license?.issued_by      ?? "Slingshottech",
    support_email:  license?.support_email  ?? "support@slingshottech.com",
    features:       Array.isArray(license?.features)
      ? license.features.join(", ")
      : (license?.features as string | undefined) ?? "",
  });
  const [errMsg, setErrMsg] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        licensee_name:  form.licensee_name,
        licensee_email: form.licensee_email,
        edition:        form.edition,
        max_employees:  Number(form.max_employees),
        max_users:      Number(form.max_users),
        expires_at:     form.expires_at || null,
        issued_by:      form.issued_by || null,
        support_email:  form.support_email || null,
        features:       form.features.split(",").map((f) => f.trim()).filter(Boolean),
      };
      return license
        ? updateLicense(license.id, payload)
        : createLicense(payload);
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (e: Error) => setErrMsg(e.message || "Failed to save license."),
  });

  if (!open) return null;

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--text)]">{license ? "Edit License" : "Issue New License"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--border)]/40">
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Licensee Name</label>
              <input className={inputCls} placeholder="Acme Corp" value={form.licensee_name} onChange={set("licensee_name")} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Licensee Email</label>
              <input className={inputCls} type="email" placeholder="billing@acme.com" value={form.licensee_email} onChange={set("licensee_email")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Edition</label>
              <select className={inputCls} value={form.edition} onChange={set("edition")}>
                {(["Starter", "Professional", "Enterprise"] as LicenseEdition[]).map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Max Employees</label>
              <input className={inputCls} type="number" min="1" value={form.max_employees} onChange={set("max_employees")} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Max Users</label>
              <input className={inputCls} type="number" min="1" value={form.max_users} onChange={set("max_users")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Expires</label>
              <input className={inputCls} type="date" value={form.expires_at} onChange={set("expires_at")} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Issued By</label>
              <input className={inputCls} value={form.issued_by} onChange={set("issued_by")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Support Email</label>
            <input className={inputCls} type="email" value={form.support_email} onChange={set("support_email")} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Features (comma-separated)</label>
            <textarea className={inputCls} rows={2} placeholder="payroll, attendance, leaves, performance" value={form.features} onChange={set("features")} />
          </div>
          {errMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--background)]">Cancel</button>
            <button
              onClick={() => void mutation.mutate()}
              disabled={!form.licensee_name || !form.licensee_email || mutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
                : license ? "Save Changes" : "Issue License"
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <div className="text-sm font-medium text-[var(--text)]">{value}</div>
    </div>
  );
}

// ─── No license placeholder ───────────────────────────────────────────────────
function NoLicensePlaceholder({ onActivate, onIssue }: { onActivate: () => void; onIssue: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--border)]/50">
        <Key className="h-6 w-6 text-[var(--muted)]" />
      </div>
      <p className="mb-1 text-base font-bold text-[var(--text)]">No license configured</p>
      <p className="mb-6 max-w-sm text-sm text-[var(--muted)]">
        Activate an existing license key or issue a new license to unlock all HRMS features.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onActivate}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--card)]"
        >
          <Key className="h-4 w-4" /> Activate Key
        </button>
        <button
          onClick={onIssue}
          className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Issue License
        </button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────
export function LicensingTab() {
  const qc = useQueryClient();
  const [activateOpen, setActivateOpen] = useState(false);
  const [issueOpen, setIssueOpen]       = useState(false);
  const [editOpen, setEditOpen]         = useState(false);
  const [showPlans, setShowPlans]       = useState(false);

  // Real API calls — replaces MOCK_LICENSE / MOCK_USAGE
  const usageQuery = useQuery({
    queryKey: ["settings", "license-usage"],
    queryFn: getLicenseUsage,
    retry: 1,
  });

  const licensesQuery = useQuery({
    queryKey: ["settings", "licenses"],
    queryFn: listLicenses,
    retry: 1,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["settings", "license-usage"] });
    void qc.invalidateQueries({ queryKey: ["settings", "licenses"] });
  }

  const isLoading = usageQuery.isLoading || licensesQuery.isLoading;
  const error = usageQuery.error || licensesQuery.error;

  // Prefer the license from the usage endpoint (includes live usage counts),
  // fall back to the first item in the licenses list.
  const license: LicenseItem | null =
    usageQuery.data?.license ?? licensesQuery.data?.[0] ?? null;

  const usage: LicenseUsage = {
    active_employees: usageQuery.data?.active_employees ?? 0,
    active_users:     usageQuery.data?.active_users     ?? 0,
    license,
  };

  return (
    <div className="space-y-6">
      <ActivateModal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        onSuccess={invalidate}
      />
      <IssueModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onSuccess={invalidate}
      />
      {license && (
        <IssueModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={invalidate}
          license={license}
        />
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text)]">License Management</h2>
          <p className="text-xs text-[var(--muted)]">Manage your HRMS license, usage limits, and edition features.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={invalidate}
            title="Refresh"
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--text)]"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setActivateOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--background)]"
          >
            <Key className="h-4 w-4" /> Activate Key
          </button>
          <button
            onClick={() => setIssueOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Issue License
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Could not load license data</p>
            <p className="text-xs mt-0.5 opacity-80">
              {(error as Error).message ?? "Check your connection or contact your administrator."}
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <div className="h-48 animate-pulse rounded-3xl bg-[var(--border)]/40" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--border)]/40" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--border)]/40" />
          </div>
        </div>
      )}

      {/* No license */}
      {!isLoading && !license && (
        <NoLicensePlaceholder
          onActivate={() => setActivateOpen(true)}
          onIssue={() => setIssueOpen(true)}
        />
      )}

      {/* Active license */}
      {!isLoading && license && (
        <>
          <ActiveLicenseHero license={license} usage={usage} />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Details card */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
                  <p className="text-sm font-bold text-[var(--text)]">License Details</p>
                </div>
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--primary)]"
                >
                  <Edit2 className="h-3 w-3" /> Edit
                </button>
              </div>
              <DetailRow
                label="Edition"
                value={
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${(EDITION_CFG[license.edition] ?? EDITION_CFG.Starter).badge}`}>
                    {license.edition}
                  </span>
                }
              />
              <DetailRow label="Status"    value={<StatusBadge status={license.status} />} />
              <DetailRow label="Licensee"  value={license.licensee_name} />
              <DetailRow label="Email"     value={license.licensee_email} />
              {license.issued_at    && <DetailRow label="Issued"    value={fmtDate(license.issued_at)} />}
              {license.activated_at && <DetailRow label="Activated" value={fmtDate(license.activated_at)} />}
              <DetailRow label="Expires"   value={fmtDate(license.expires_at)} />
              {license.issued_by    && <DetailRow label="Issued By" value={license.issued_by} />}
              {license.support_email && (
                <DetailRow
                  label="Support"
                  value={
                    <a href={`mailto:${license.support_email}`} className="text-[var(--primary)] hover:underline">
                      {license.support_email}
                    </a>
                  }
                />
              )}
            </div>

            {/* Usage breakdown */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--primary)]" />
                <p className="text-sm font-bold text-[var(--text)]">Usage Breakdown</p>
              </div>

              {[
                { label: "Employees", used: usage.active_employees, max: license.max_employees, icon: Users },
                { label: "Users",     used: usage.active_users,     max: license.max_users,     icon: Building2 },
              ].map((row) => {
                const pct = usagePct(row.used, row.max);
                const barColor = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
                const Icon = row.icon;
                return (
                  <div key={row.label} className="mb-5">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
                        <Icon className="h-3.5 w-3.5 text-[var(--muted)]" /> {row.label}
                      </div>
                      <span className="text-[var(--muted)]">
                        <strong className="text-[var(--text)]">{row.used.toLocaleString()}</strong> / {row.max.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    {pct >= 80 && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {pct >= 90 ? "Critical — approaching limit" : "Nearing limit — consider upgrading"}
                      </p>
                    )}
                  </div>
                );
              })}

              {license.expires_at && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      License expires in{" "}
                      <strong className="text-[var(--text)]">{license.days_remaining ?? "?"} days</strong>{" "}
                      — {fmtDate(license.expires_at)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-700"
                      style={{ width: `${Math.min(100, ((license.days_remaining ?? 0) / 365) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {(() => {
                const features: string[] = Array.isArray(license.features)
                  ? license.features
                  : typeof license.features === "string"
                    ? (license.features as string).split(",").map((f) => f.trim()).filter(Boolean)
                    : [];
                return features.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Licensed Modules</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {features.map((f) => (
                        <div key={f} className="flex items-center gap-2 rounded-lg bg-[var(--background)] px-2.5 py-1.5 text-xs font-medium capitalize text-[var(--text)]">
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" /> {f}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </>
      )}

      {/* Edition plans toggle */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <button
          onClick={() => setShowPlans((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[var(--background)] rounded-2xl"
        >
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[var(--primary)]" />
            <p className="text-sm font-bold text-[var(--text)]">Edition Plans & Pricing</p>
            <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--primary)]">Compare</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-[var(--muted)] transition-transform ${showPlans ? "rotate-180" : ""}`} />
        </button>
        {showPlans && (
          <div className="border-t border-[var(--border)] p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              {PLANS.map((p) => (
                <PlanCard key={p.edition} plan={p} current={p.edition === license?.edition} />
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-[var(--muted)]">
              Need a custom plan? Contact{" "}
              <a href="mailto:sales@slingshottech.com" className="text-[var(--primary)] hover:underline">
                sales@slingshottech.com
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}