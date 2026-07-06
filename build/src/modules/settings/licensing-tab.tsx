import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Key, Users, Building2, Zap, Check, Copy,
  AlertTriangle, Clock, Crown, Star, Rocket, ChevronDown,
  X, Edit2, Plus, CheckCircle2, XCircle, Calendar, RefreshCw,
  TrendingUp, Ban, History, Trash2,
} from "lucide-react";
import {
  LicenseEdition,
  LicenseStatus,
  LicenseItem,
  LicenseUsage,
  LicensePagination,
  CompanyItem,
  CompanyLicenseUsage,
  AllCompanyUsageResponse,
  EditionConfig,
  activateLicense,
  createLicense,
  deleteLicense,
  getAllCompanyUsage,
  getEditionConfig,
  getLicenseUsage,
  listCompanies,
  renewLicense,
  suspendLicense,
  unsuspendLicense,
  updateLicense,
} from "@/services/settings-service";
import { useAuthStore } from "@/store/auth-store";
import { isSuperAdminRole } from "@/config/rbac";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 placeholder:text-[var(--muted)]";
const labelCls = "text-xs font-semibold uppercase tracking-widest text-[var(--muted)]";

function fmtDate(s?: string | null) {
  if (!s) return "Never";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Raw percentage, intentionally NOT clamped to 100 so over-limit usage (e.g.
// stale seat counts after a plan downgrade) stays visible instead of reading
// as a deceptively-healthy 100%. Callers that draw a fixed-size ring should
// clamp the drawn arc separately while still showing the true percentage.
function usagePct(used: number, max: number | null) {
  return max != null && max > 0 ? Math.round((used / max) * 100) : 0;
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
  const cfgMap: Record<string, { icon: typeof CheckCircle2; cls: string; label: string }> = {
    active:    { icon: CheckCircle2,  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Active"    },
    trial:     { icon: Clock,         cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",             label: "Trial"     },
    expired:   { icon: XCircle,       cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",             label: "Expired"   },
    suspended: { icon: AlertTriangle, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",         label: "Suspended" },
  };
  const cfg = cfgMap[status] ?? { icon: AlertTriangle, cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", label: status };
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

// ─── Edition seat + feature defaults ─────────────────────────────────────────
const EDITION_DEFAULTS: Record<LicenseEdition, {
  max_employees: string; // "" = unlimited (sends null to API)
  max_users: string;
  features: string[];
}> = {
  Starter:      { max_employees: "20",  max_users: "", features: ["attendance", "leaves"] },
  Professional: { max_employees: "200", max_users: "", features: ["attendance", "leaves", "payroll", "performance", "communication", "approvals"] },
  Enterprise:   { max_employees: "",    max_users: "", features: ["attendance", "leaves", "payroll", "performance", "communication", "approvals", "recruitment"] },
};

const FEATURE_LABEL: Record<string, string> = {};
const FEATURE_OPTIONS: { value: string; label: string; minEdition: LicenseEdition }[] = [
  { value: "attendance",    label: "Attendance",          minEdition: "Starter"      },
  { value: "leaves",        label: "Leave Management",    minEdition: "Starter"      },
  { value: "payroll",       label: "Payroll",             minEdition: "Professional" },
  { value: "performance",   label: "Performance Reviews", minEdition: "Professional" },
  { value: "communication", label: "Communication",       minEdition: "Professional" },
  { value: "approvals",     label: "Approvals & Workflows", minEdition: "Professional" },
  { value: "recruitment",   label: "Recruitment",         minEdition: "Enterprise"   },
];
FEATURE_OPTIONS.forEach(({ value, label }) => { FEATURE_LABEL[value] = label; });

// ─── Usage ring SVG ───────────────────────────────────────────────────────────
function UsageRing({ used, max, label, color }: { used: number; max: number | null; label: string; color: string }) {
  const unlimited = max == null;
  const pct   = usagePct(used, max);
  const r     = 30;
  const circ  = 2 * Math.PI * r;
  const dash  = (Math.min(100, pct) / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-20 w-20">
        <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
          {!unlimited && (
            <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7"
              stroke={color} strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: "stroke-dasharray 0.8s ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-base font-black text-white">{unlimited ? "∞" : `${pct}%`}</p>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-white">{used.toLocaleString()} / {unlimited ? "∞" : max!.toLocaleString()}</p>
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

  const TRIAL_DAYS = 14;
  const maxDays = license.status === "trial"
    ? TRIAL_DAYS
    : (() => {
        const start = license.activated_at ?? license.issued_at;
        const end   = license.expires_at;
        if (start && end) {
          return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
        }
        return 365;
      })();

  const daysColor = license.days_remaining == null ? "#10b981"
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
                  {license.status === "trial"
                    ? `${license.days_remaining} trial day${license.days_remaining !== 1 ? "s" : ""} remaining`
                    : `${license.days_remaining} days remaining`}
                </span>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border ${cfg.border} bg-white/10 px-4 py-3 backdrop-blur-sm`}>
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
          {license.max_users !== null && (
            <>
              <div className="h-16 w-px bg-white/10" />
              <UsageRing used={usage.active_users} max={license.max_users} label="Admin seats"
                color={userPct >= 90 ? "#ef4444" : userPct >= 70 ? "#f59e0b" : "#10b981"} />
            </>
          )}
          <div className="h-16 w-px bg-white/10" />
          <div className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-20">
              <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
                {license.days_remaining != null && (
                  <circle cx="40" cy="40" r="30" fill="none" strokeWidth="7"
                    stroke={daysColor} strokeLinecap="round"
                    strokeDasharray={`${(Math.min(license.days_remaining, maxDays) / maxDays) * (2 * Math.PI * 30)} ${2 * Math.PI * 30}`}
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
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                  <Check className="h-2.5 w-2.5 text-emerald-400" /> {FEATURE_LABEL[f] ?? f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edition tier ranking (Starter=0, Professional=1, Enterprise=2) ──────────
const TIER_RANK: Record<LicenseEdition, number> = { Starter: 0, Professional: 1, Enterprise: 2 };

// ─── Edition plan cards ───────────────────────────────────────────────────────
const PLANS: Array<{
  edition: LicenseEdition;
  price: string;
  yearlyPrice: string;
  period: string;
  yearlyPeriod: string;
  yearlyMonthly: string;
  tagline: string;
  limits: string;
  trial: string;
  features: string[];
  highlighted?: boolean;
}> = [
  {
    edition: "Starter",
    price: "$7",
    yearlyPrice: "$67.20",
    period: "/ employee / month",
    yearlyPeriod: "/ employee / year",
    yearlyMonthly: "$5.60",
    tagline: "For small teams getting started",
    limits: "Up to 20 employees · min. 5 seats",
    trial: "14-day free trial",
    features: ["Employee records", "Basic attendance", "Leave management", "Email support"],
  },
  {
    edition: "Professional",
    price: "$14",
    yearlyPrice: "$134.40",
    period: "/ employee / month",
    yearlyPeriod: "/ employee / year",
    yearlyMonthly: "$11.20",
    tagline: "For growing organizations",
    limits: "Up to 200 employees · min. 5 seats",
    trial: "14-day free trial",
    features: ["Everything in Starter", "Payroll processing", "Performance reviews", "Approvals & workflows", "Chat & announcements", "Priority support"],
    highlighted: true,
  },
  {
    edition: "Enterprise",
    price: "Custom",
    yearlyPrice: "Custom",
    period: "",
    yearlyPeriod: "",
    yearlyMonthly: "",
    tagline: "For large enterprises",
    limits: "Unlimited employees",
    trial: "Custom onboarding",
    features: ["Everything in Professional", "Recruitment module", "Custom roles & permissions", "Multi-branch & company", "Audit logs", "Dedicated support", "SLA guarantee"],
  },
];

function PlanCard({ plan, current, onSelect, ctaLabel, yearly }: {
  plan: typeof PLANS[0];
  current: boolean;
  onSelect?: () => void;
  ctaLabel?: string;
  yearly?: boolean;
}) {
  const cfg = EDITION_CFG[plan.edition];
  const Icon = cfg.icon;
  const defaultCta = plan.edition === "Enterprise" ? "Contact Sales" : "Start Free Trial";
  const cta = ctaLabel ?? defaultCta;

  const displayPrice  = yearly ? plan.yearlyPrice  : plan.price;
  const displayPeriod = yearly ? plan.yearlyPeriod : plan.period;
  const savingsLabel  = yearly && plan.yearlyMonthly ? `${plan.yearlyMonthly} / employee / month` : null;

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

        <div className="mb-1.5">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-3xl font-black text-[var(--text)]">{displayPrice}</span>
            {displayPeriod && <span className="text-xs text-[var(--muted)]">{displayPeriod}</span>}
            {yearly && plan.edition !== "Enterprise" && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                Save 20%
              </span>
            )}
          </div>
          {savingsLabel && (
            <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">≈ {savingsLabel}</p>
          )}
          <p className="mt-0.5 text-xs text-[var(--muted)]">{plan.limits}</p>
        </div>

        {/* Trial badge */}
        <div className="mb-4 flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-blue-500" />
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">{plan.trial}</span>
        </div>

        {current ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Current Plan
          </div>
        ) : (
          <button
            onClick={onSelect}
            className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
              plan.highlighted
                ? "bg-[var(--primary)] text-white hover:opacity-90"
                : "border border-[var(--border)] text-[var(--text)] hover:bg-[var(--background)]"
            }`}
          >
            {cta}
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

// ─── Suspend / Unsuspend confirm modal ────────────────────────────────────────
function SuspendModal({
  open, onClose, onSuccess, license,
}: {
  open: boolean; onClose: () => void; onSuccess: () => void; license: LicenseItem;
}) {
  const isSuspended = license.status === "suspended";
  const [errMsg, setErrMsg] = React.useState("");

  const mutation = useMutation({
    mutationFn: () => isSuspended ? unsuspendLicense(license.id) : suspendLicense(license.id),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (e: Error) => setErrMsg(e.message || "Action failed. Please try again."),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-amber-500" />
            <h3 className="text-base font-semibold text-[var(--text)]">
              {isSuspended ? "Unsuspend License" : "Suspend License"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--border)]/40">
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`rounded-xl border px-4 py-3 text-sm ${isSuspended ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"}`}>
            {isSuspended ? (
              <>Unsuspending will restore this license to its previous status. The company will regain access to all licensed features.</>
            ) : (
              <>Suspending this license will immediately block the company from activating it. This can be reversed at any time.</>
            )}
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-[var(--muted)]">License</p>
            <code className="text-sm font-mono font-semibold text-[var(--text)]">{license.license_key}</code>
            <p className="text-xs text-[var(--muted)]">{license.licensee_name} · {license.edition}</p>
          </div>
          {errMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--background)]">
              Cancel
            </button>
            <button
              onClick={() => { setErrMsg(""); void mutation.mutate(); }}
              disabled={mutation.isPending}
              className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${isSuspended ? "bg-blue-600" : "bg-amber-500"}`}
            >
              {mutation.isPending
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Processing…</>
                : isSuspended ? <><CheckCircle2 className="h-3.5 w-3.5" /> Unsuspend</> : <><Ban className="h-3.5 w-3.5" /> Suspend</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Revoke confirm modal ──────────────────────────────────────────────────────
function RevokeModal({
  open, onClose, onSuccess, license,
}: {
  open: boolean; onClose: () => void; onSuccess: () => void; license: LicenseItem;
}) {
  const [errMsg, setErrMsg]       = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);

  const mutation = useMutation({
    mutationFn: () => deleteLicense(license.id),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (e: Error) => setErrMsg(e.message || "Failed to revoke license. Please try again."),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-500" />
            <h3 className="text-base font-semibold text-[var(--text)]">Permanently Revoke License</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--border)]/40">
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Revoke vs Suspend comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="font-bold text-amber-700 dark:text-amber-400 mb-1">Suspend (reversible)</p>
              <p className="text-amber-600 dark:text-amber-300 leading-relaxed">Temporarily blocks access. Can be lifted at any time. The key remains valid.</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20">
              <p className="font-bold text-rose-700 dark:text-rose-400 mb-1">Revoke ← you are here</p>
              <p className="text-rose-600 dark:text-rose-300 leading-relaxed">Permanent. The key is blacklisted and can never be re-activated. This cannot be undone.</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-[var(--muted)]">License to be permanently revoked</p>
            <code className="text-sm font-mono font-semibold text-[var(--text)]">{license.license_key}</code>
            <p className="text-xs text-[var(--muted)]">{license.licensee_name} · {license.edition}</p>
          </div>

          {/* Explicit confirmation checkbox */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-rose-600"
            />
            <span className="text-xs text-[var(--text)]">
              I understand this is <strong>permanent and irreversible</strong>. The license key will be permanently disabled.
            </span>
          </label>

          {errMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--background)]">
              Cancel — Keep License
            </button>
            <button
              onClick={() => { setErrMsg(""); void mutation.mutate(); }}
              disabled={mutation.isPending || !confirmed}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Revoking…</>
                : <><Trash2 className="h-3.5 w-3.5" /> Permanently Revoke</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activate key modal ───────────────────────────────────────────────────────
function ActivateModal({ open, onClose, onSuccess, hint }: { open: boolean; onClose: () => void; onSuccess: () => void; hint?: string }) {
  const [key, setKey]   = useState("");
  const [errMsg, setErrMsg] = useState("");

  // Reset form state each time the modal is opened
  React.useEffect(() => {
    if (open) { setKey(""); setErrMsg(""); }
  }, [open]);

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
          {hint && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
              {hint}
            </div>
          )}
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            Enter the license key provided by Slingshotteck. Format: <code className="font-mono font-bold">HRMS-XXXXX-XXXXX-XXXXX-XXXXX</code>
            <span className="mt-1 block text-blue-500/80">No key yet? Every plan includes a <strong>14-day free trial</strong> — contact <a href="mailto:sales@slingshotteck.com" className="underline">sales@slingshotteck.com</a></span>
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
  open, onClose, onSuccess, license, isSuperAdmin = false,
  prefillCompanyId = "", prefillCompanyName = "", prefillEdition,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  license?: LicenseItem;
  isSuperAdmin?: boolean;
  prefillCompanyId?: string;
  prefillCompanyName?: string;
  prefillEdition?: LicenseEdition;
}) {
  // NOTE: This component is mounted with a `key` prop at the call site so that
  // React remounts it fresh whenever the target license or prefill company changes.
  // That means useState here always runs with the correct initial values.
  const defaultEdition = (license?.edition ?? prefillEdition ?? "Professional") as LicenseEdition;
  const [form, setForm] = useState({
    licensee_name:  license?.licensee_name  ?? prefillCompanyName,
    licensee_email: license?.licensee_email ?? "",
    edition:        defaultEdition,
    // When editing: preserve existing values (null → "" means unlimited for Enterprise)
    // When creating: use edition defaults
    max_employees:  license
      ? (license.max_employees != null ? String(license.max_employees) : "")
      : EDITION_DEFAULTS[defaultEdition].max_employees,
    max_users:      license
      ? (license.max_users != null ? String(license.max_users) : "")
      : EDITION_DEFAULTS[defaultEdition].max_users,
    expires_at:     license?.expires_at?.slice(0, 10) ?? "",
    issued_by:      license?.issued_by      ?? "",
    support_email:  license?.support_email  ?? "",
    // Store features as string[] for checkbox binding; fall back to edition defaults
    features:       Array.isArray(license?.features) && license.features.length > 0
      ? license.features as string[]
      : EDITION_DEFAULTS[defaultEdition].features,
    // Prefer license's own company when editing, otherwise use prefill from row
    company_id: license?.company?.id ?? prefillCompanyId,
  });
  const [errMsg, setErrMsg] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  // Fetch the company list only when the modal is open and the caller is Super Admin
  // and we are issuing a new license (not editing an existing one).
  const companiesQuery = useQuery({
    queryKey: ["settings", "companies"],
    queryFn:  listCompanies,
    enabled:  open && isSuperAdmin && !license,
    staleTime: 60_000,
  });

  // Edition defaults from backend so the form stays in sync with server-side config.
  const editionConfigQuery = useQuery({
    queryKey: ["settings", "license-editions"],
    queryFn:  getEditionConfig,
    enabled:  open,
    staleTime: 5 * 60_000,
  });
  const editionConfigMap: Record<string, EditionConfig> = editionConfigQuery.data ?? {};

  const companies: CompanyItem[] = companiesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        licensee_name:  form.licensee_name,
        licensee_email: form.licensee_email,
        edition:        form.edition,
        // Empty string means unlimited (Enterprise) → send null so backend skips enforcement
        max_employees:  form.max_employees === "" ? null : Number(form.max_employees),
        max_users:      form.max_users     === "" ? null : Number(form.max_users),
        expires_at:     form.expires_at || null,
        issued_by:      form.issued_by  || null,
        support_email:  form.support_email || null,
        features:       form.features,
      };

      // Only attach company_id when issuing a new license as Super Admin
      if (!license && isSuperAdmin && form.company_id) {
        payload.company_id = form.company_id;
      }

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

  const set = (k: Exclude<keyof typeof form, "features">) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  // Changing edition auto-fills seat limits and module features.
  // Uses backend config when available, falls back to static EDITION_DEFAULTS.
  const handleEditionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const edition = e.target.value as LicenseEdition;
    const serverCfg = editionConfigMap[edition];
    const fallback  = EDITION_DEFAULTS[edition];
    const maxEmp = serverCfg
      ? (serverCfg.max_employees == null ? "" : String(serverCfg.max_employees))
      : fallback.max_employees;
    const maxUsr = serverCfg
      ? (serverCfg.max_users == null ? "" : String(serverCfg.max_users))
      : fallback.max_users;
    const features = serverCfg?.features ?? fallback.features;
    setForm((p) => ({ ...p, edition, max_employees: maxEmp, max_users: maxUsr, features }));
  };

  const toggleFeature = (value: string, checked: boolean) =>
    setForm((p) => ({
      ...p,
      features: checked ? [...p.features, value] : p.features.filter((f) => f !== value),
    }));

  // Super Admin must pick a company before issuing
  const missingCompany = isSuperAdmin && !license && !form.company_id;
  const canSubmit = !!form.licensee_name && !!form.licensee_email && !missingCompany && !mutation.isPending;

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

          {/* ── Company picker — Super Admin only, new licenses only ── */}
          {isSuperAdmin && !license && (
            <div className="space-y-1.5">
              <label className={labelCls}>
                Company <span className="text-rose-500">*</span>
              </label>
              {companiesQuery.isLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
                  Loading companies…
                </div>
              ) : (
                <select
                  className={inputCls}
                  value={form.company_id}
                  onChange={set("company_id")}
                >
                  <option value="">— Select a company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {missingCompany && (
                <p className="text-[11px] text-rose-500">Please select a company before issuing a license.</p>
              )}
            </div>
          )}

          {/* ── Licensee name + email ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Licensee Name</label>
              <input className={inputCls} placeholder="Acme Corp" value={form.licensee_name} onChange={set("licensee_name")} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Licensee Email</label>
              <input className={inputCls} type="email" placeholder="billing@acme.com" value={form.licensee_email} onChange={set("licensee_email")} />
            </div>
          </div>

          {/* ── Edition + seat limits ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Edition</label>
              <select className={inputCls} value={form.edition} onChange={handleEditionChange}>
                {(["Starter", "Professional", "Enterprise"] as LicenseEdition[]).map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Max Employees</label>
              <input
                className={inputCls}
                type="number"
                min="1"
                max="100000"
                placeholder="Unlimited"
                value={form.max_employees}
                onChange={set("max_employees")}
              />
              {form.max_employees === "" && (
                <p className="text-[10px] text-[var(--muted)]">No limit (Enterprise)</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Max Users</label>
              <input
                className={inputCls}
                type="number"
                min="1"
                max="10000"
                placeholder="Unlimited"
                value={form.max_users}
                onChange={set("max_users")}
              />
              {form.max_users === "" && (
                <p className="text-[10px] text-[var(--muted)]">Unlimited — enter a number to cap admin seats</p>
              )}
            </div>
          </div>

          {/* ── Expiry + issued by ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Expires</label>
              <input className={inputCls} type="date" value={form.expires_at} onChange={set("expires_at")} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Issued By</label>
              <input className={inputCls} value={form.issued_by} onChange={set("issued_by")} />
            </div>
          </div>

          {/* ── Support email ── */}
          <div className="space-y-1.5">
            <label className={labelCls}>Support Email</label>
            <input className={inputCls} type="email" value={form.support_email} onChange={set("support_email")} />
          </div>

          {/* ── Module access (features) ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Module Access</label>
              <span className="text-[10px] text-[var(--muted)]">Auto-set by edition · customisable</span>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FEATURE_OPTIONS.map(({ value, label, minEdition }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.features.includes(value)}
                    onChange={(e) => toggleFeature(value, e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                  />
                  <span className="text-sm text-[var(--text)]">{label}</span>
                  <span className="ml-auto text-[10px] text-[var(--muted)] shrink-0">{minEdition}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Overwrite confirmation (editing an existing license only) ── */}
          {license && confirmOverwrite && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              These changes will take effect immediately for <strong>{license.licensee_name}</strong>. Click "Confirm & Save" to apply them.
            </div>
          )}

          {/* ── Error ── */}
          {errMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errMsg}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--background)]">
              Cancel
            </button>
            <button
              onClick={() => {
                if (license && !confirmOverwrite) {
                  setConfirmOverwrite(true);
                  return;
                }
                void mutation.mutate();
              }}
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
                : license ? (confirmOverwrite ? "Confirm & Save" : "Save Changes") : "Issue License"
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
function NoLicensePlaceholder({ onActivate, onIssue, isSuperAdmin = false }: { onActivate: () => void; onIssue: () => void; isSuperAdmin?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--border)]/50">
        <Key className="h-6 w-6 text-[var(--muted)]" />
      </div>
      <p className="mb-1 text-base font-bold text-[var(--text)]">No license configured</p>
      <p className="mb-6 max-w-sm text-sm text-[var(--muted)]">
        Activate an existing license key or issue a new license to unlock all HRMS features.
        All plans include a <strong className="text-[var(--text)]">14-day free trial</strong>.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onActivate}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--card)]"
        >
          <Key className="h-4 w-4" /> Activate Key
        </button>
        {isSuperAdmin && (
          <button
            onClick={onIssue}
            className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Issue License
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Super Admin — summary stat card ─────────────────────────────────────────
function SummaryCard({
  label, value, color, icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-xl font-black text-[var(--text)]">{value}</p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">{label}</p>
      </div>
    </div>
  );
}

// ─── Super Admin — company row in the overview table ─────────────────────────
function CompanyLicenseRow({
  row,
  onIssue,
  onEdit,
  onSuspend,
  onRevoke,
}: {
  row: CompanyLicenseUsage;
  onIssue:   (companyId: string, companyName: string) => void;
  onEdit:    (license: LicenseItem) => void;
  onSuspend: (license: LicenseItem) => void;
  onRevoke:  (license: LicenseItem) => void;
}) {
  const { license } = row;
  const [showHistory, setShowHistory] = useState(false);

  const empPct  = license ? usagePct(row.total_employees, license.max_employees) : 0;
  const userPct = license ? usagePct(row.total_users,     license.max_users)     : 0;

  const barColor = (pct: number) =>
    pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/30 hover:shadow-sm space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-4">
        {/* Left: company info + license detail */}
        <div className="min-w-0 space-y-3">
          {/* Company name + status */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10">
              <Building2 className="h-3.5 w-3.5 text-[var(--primary)]" />
            </div>
            <span className="text-sm font-bold text-[var(--text)] truncate">{row.company_name}</span>
            {license
              ? <StatusBadge status={license.status} />
              : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]">No License</span>
            }
            {license?.days_remaining != null && license.days_remaining <= 30 && license.status === "active" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <AlertTriangle className="h-2.5 w-2.5" /> {license.days_remaining}d left
              </span>
            )}
          </div>

          {/* License key + edition */}
          {license && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${(EDITION_CFG[license.edition] ?? EDITION_CFG.Starter).badge}`}>
                {license.edition}
              </span>
              <code className="font-mono tracking-wider opacity-70">{license.license_key}</code>
              {license.expires_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Expires {fmtDate(license.expires_at)}
                </span>
              )}
            </div>
          )}

          {/* Suspended notice */}
          {license?.status === "suspended" && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <Ban className="h-3.5 w-3.5 shrink-0" />
              License suspended — access to all features is blocked until reinstated by the platform team.
            </div>
          )}

          {/* Seat usage bars */}
          {license && license.status !== "suspended" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Employees",   used: row.total_employees, max: license.max_employees, pct: empPct },
                ...(license.max_users !== null
                  ? [{ label: "Admin seats", used: row.total_users, max: license.max_users, pct: userPct }]
                  : []),
              ].map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-[var(--muted)]">{s.label}</span>
                    <span className="text-[var(--muted)]">
                      <strong className="text-[var(--text)]">{s.used}</strong>
                      {s.max == null ? " / ∞" : ` / ${s.max.toLocaleString()} (${s.pct}%)`}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${barColor(s.pct)}`}
                      style={{ width: `${Math.min(100, s.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No license — seat counts only */}
          {!license && (
            <p className="text-xs text-[var(--muted)]">
              {row.total_employees} active employee{row.total_employees !== 1 ? "s" : ""} · {row.total_users} user{row.total_users !== 1 ? "s" : ""} · No license assigned
            </p>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-col items-end justify-start gap-2 pt-0.5">
          {license ? (
            <>
              <button
                onClick={() => onEdit(license)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]"
              >
                <Edit2 className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={() => onSuspend(license)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  license.status === "suspended"
                    ? "border-blue-300 text-blue-600 hover:border-blue-400 dark:border-blue-700 dark:text-blue-400"
                    : "border-amber-300 text-amber-600 hover:border-amber-400 dark:border-amber-700 dark:text-amber-400"
                }`}
              >
                <Ban className="h-3 w-3" />
                {license.status === "suspended" ? "Unsuspend" : "Suspend"}
              </button>
              <button
                onClick={() => onRevoke(license)}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:border-rose-400 dark:border-rose-800 dark:text-rose-400"
              >
                <Trash2 className="h-3 w-3" /> Revoke
              </button>
            </>
          ) : (
            <button
              onClick={() => onIssue(row.company_id, row.company_name)}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-3 w-3" /> Issue
            </button>
          )}
        </div>
      </div>

      {/* License history */}
      {row.license_history && row.license_history.length > 0 && (
        <div className="border-t border-[var(--border)] pt-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            <History className="h-3 w-3" />
            {row.license_history.length} previous license{row.license_history.length !== 1 ? "s" : ""}
            <ChevronDown className={`h-3 w-3 transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {row.license_history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)]">
                  {h.is_active
                    ? <StatusBadge status={h.status} />
                    : <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"><XCircle className="h-3 w-3" /> Revoked</span>
                  }
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${(EDITION_CFG[h.edition] ?? EDITION_CFG.Starter).badge}`}>{h.edition}</span>
                  <code className="font-mono opacity-60">{h.license_key}</code>
                  {h.issued_at && <span>Issued {fmtDate(h.issued_at)}</span>}
                  {h.expires_at && <span>· Expired {fmtDate(h.expires_at)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Super Admin — full company overview dashboard ────────────────────────────
function SuperAdminDashboard({
  data,
  isLoading,
  error,
  onRefresh,
  onIssueFor,
  onEdit,
  onSuspend,
  onRevoke,
  pagination,
  onPageChange,
  search,
  onSearch,
}: {
  data:         AllCompanyUsageResponse | undefined;
  isLoading:    boolean;
  error:        Error | null;
  onRefresh:    () => void;
  onIssueFor:   (companyId: string, companyName: string) => void;
  onEdit:       (license: LicenseItem) => void;
  onSuspend:    (license: LicenseItem) => void;
  onRevoke:     (license: LicenseItem) => void;
  pagination?:  LicensePagination;
  onPageChange: (page: number) => void;
  search:       string;
  onSearch:     (s: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "trial" | "expiring" | "expired" | "suspended" | "none">("all");

  const summary   = data?.summary;
  const companies = data?.companies ?? [];

  // Status filter only — search is handled server-side
  const visible = companies.filter((row) => {
    if (filter === "all")       return true;
    if (filter === "none")      return !row.license;
    if (filter === "active")    return row.license?.status === "active";
    if (filter === "trial")     return row.license?.status === "trial";
    if (filter === "expired")   return row.license?.status === "expired";
    if (filter === "suspended") return row.license?.status === "suspended";
    if (filter === "expiring") {
      return (
        row.license?.status === "active" &&
        row.license.days_remaining != null &&
        row.license.days_remaining <= 30
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text)]">Company License Overview</h2>
          <p className="text-xs text-[var(--muted)]">
            Track licenses issued across all companies. Issue, edit, or renew from here.
          </p>
        </div>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--text)]"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Error ── */}
      {error && !isLoading && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Could not load company data</p>
            <p className="text-xs mt-0.5 opacity-80">{error.message}</p>
          </div>
        </div>
      )}

      {/* ── Summary stat cards skeleton ── */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--border)]/40" />
          ))}
        </div>
      )}

      {/* ── Summary stat cards ── */}
      {!isLoading && summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <SummaryCard label="Companies"    value={summary.total_companies}     color="bg-slate-500"   icon={Building2}     />
          <SummaryCard label="Licensed"     value={summary.licensed}            color="bg-emerald-500" icon={CheckCircle2}  />
          <SummaryCard label="Trial"        value={summary.trial}               color="bg-blue-500"    icon={Clock}         />
          <SummaryCard label="Expiring"     value={summary.expiring_soon}       color="bg-amber-500"   icon={AlertTriangle} />
          <SummaryCard label="Expired"      value={summary.expired}             color="bg-rose-500"    icon={XCircle}       />
          <SummaryCard label="Suspended"    value={summary.suspended ?? 0}      color="bg-orange-500"  icon={Ban}           />
          <SummaryCard label="No License"   value={summary.no_license}          color="bg-zinc-400"    icon={TrendingUp}    />
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-8 pr-3 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 placeholder:text-[var(--muted)]"
            placeholder="Search companies…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        {(["all", "active", "trial", "expiring", "expired", "suspended", "none"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition ${
              filter === f
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
            }`}
          >
            {f === "none" ? "No License" : f === "expiring" ? "Expiring Soon" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Company rows skeleton ── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--border)]/40" />
          ))}
        </div>
      )}

      {/* ── Company rows ── */}
      {!isLoading && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] py-12 text-center">
          <Building2 className="mb-3 h-8 w-8 text-[var(--muted)]" />
          <p className="text-sm font-semibold text-[var(--text)]">No companies match</p>
          <p className="text-xs text-[var(--muted)]">Try a different search or filter.</p>
        </div>
      )}

      {!isLoading && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((row) => (
            <CompanyLicenseRow
              key={row.company_id}
              row={row}
              onIssue={onIssueFor}
              onEdit={onEdit}
              onSuspend={onSuspend}
              onRevoke={onRevoke}
            />
          ))}
        </div>
      )}

      {/* ── Pagination controls ── */}
      {pagination && pagination.last_page > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--muted)]">
            Page <strong className="text-[var(--text)]">{pagination.current_page}</strong> of{" "}
            <strong className="text-[var(--text)]">{pagination.last_page}</strong>
            {" "}· {pagination.total} companies total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(pagination.current_page - 1)}
              disabled={pagination.current_page <= 1 || isLoading}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(pagination.last_page, 5) }, (_, i) => {
              const p = pagination.last_page <= 5
                ? i + 1
                : pagination.current_page <= 3
                  ? i + 1
                  : pagination.current_page >= pagination.last_page - 2
                    ? pagination.last_page - 4 + i
                    : pagination.current_page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  disabled={isLoading}
                  className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                    p === pagination.current_page
                      ? "bg-[var(--primary)] text-white"
                      : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--text)]"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(pagination.current_page + 1)}
              disabled={pagination.current_page >= pagination.last_page || isLoading}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────
export function LicensingTab() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = isSuperAdminRole(user);

  const [activateOpen, setActivateOpen]   = useState(false);
  const [activateHint, setActivateHint]   = useState<string | undefined>();
  const [issueOpen, setIssueOpen]       = useState(false);
  const [editOpen, setEditOpen]         = useState(false);
  const [suspendOpen, setSuspendOpen]   = useState(false);
  const [revokeOpen, setRevokeOpen]     = useState(false);
  const [showPlans, setShowPlans]       = useState(false);
  const [billingYearly, setBillingYearly] = useState(false);

  // Pre-filled company when SA clicks "Issue" from a specific company row
  const [prefillCompanyId,   setPrefillCompanyId]   = useState<string>("");
  const [prefillCompanyName, setPrefillCompanyName] = useState<string>("");
  const [prefillEdition,     setPrefillEdition]     = useState<LicenseEdition | undefined>(undefined);

  // License targeted by suspend / unsuspend / revoke actions
  const [actionLicense, setActionLicense] = useState<LicenseItem | undefined>(undefined);

  // Page + search state for the SA company list (server-side pagination + search)
  const [saPage, setSaPage]     = useState(1);
  const [saSearch, setSaSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input — reset to page 1 when search changes
  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(saSearch); setSaPage(1); }, 400);
    return () => clearTimeout(t);
  }, [saSearch]);

  // Reset billing period when plan comparison section is collapsed
  React.useEffect(() => {
    if (!showPlans) setBillingYearly(false);
  }, [showPlans]);

  // ── Super Admin: all-company usage ──────────────────────────────────────────
  const allUsageQuery = useQuery({
    queryKey: ["settings", "licenses-all-usage", saPage, debouncedSearch],
    queryFn:  () => getAllCompanyUsage(saPage, 25, debouncedSearch),
    enabled:  isSuperAdmin,
    retry: 1,
  });

  // ── Company Admin: single-company usage ─────────────────────────────────────
  const usageQuery = useQuery({
    queryKey: ["settings", "license-usage"],
    queryFn:  getLicenseUsage,
    enabled:  !isSuperAdmin,
    retry: 1,
  });

  // License being edited (used by both SA and Company Admin edit flow)
  const [editingLicense, setEditingLicense] = useState<LicenseItem | undefined>(undefined);

  function invalidate() {
    setSaPage(1); // reset to first page after any mutation
    void qc.invalidateQueries({ queryKey: ["settings", "licenses-all-usage"] });
    void qc.invalidateQueries({ queryKey: ["settings", "license-usage"] });
    void qc.invalidateQueries({ queryKey: ["settings", "licenses"] });
  }

  // Open Issue modal pre-filled for a specific company (SA company-row button)
  function handleIssueFor(companyId: string, companyName: string) {
    setPrefillCompanyId(companyId);
    setPrefillCompanyName(companyName);
    setIssueOpen(true);
  }

  // Open Edit modal for a specific license (SA company-row edit button)
  function handleEdit(license: LicenseItem) {
    setEditingLicense(license);
    setEditOpen(true);
  }

  // Open Suspend/Unsuspend modal (SA only)
  function handleSuspend(license: LicenseItem) {
    setActionLicense(license);
    setSuspendOpen(true);
  }

  // Open Revoke modal — SA always; CA only for their own license
  function handleRevoke(license: LicenseItem) {
    setActionLicense(license);
    setRevokeOpen(true);
  }

  // Company Admin paths
  const isLoading = usageQuery.isLoading;
  const error     = usageQuery.error;

  const license: LicenseItem | null = usageQuery.data?.license ?? null;

  const usage: LicenseUsage = {
    active_employees: usageQuery.data?.active_employees ?? 0,
    active_users:     usageQuery.data?.active_users     ?? 0,
    license,
  };

  // ── Super Admin view ────────────────────────────────────────────────────────
  if (isSuperAdmin) {
    return (
      <div className="space-y-6">
        {/* Issue modal — may be pre-filled with a company from the row */}
        <IssueModal
          key={`issue-${prefillCompanyId}-${prefillEdition ?? ""}`}
          open={issueOpen}
          onClose={() => { setIssueOpen(false); setPrefillCompanyId(""); setPrefillCompanyName(""); setPrefillEdition(undefined); }}
          onSuccess={invalidate}
          isSuperAdmin={true}
          prefillCompanyId={prefillCompanyId}
          prefillCompanyName={prefillCompanyName}
          prefillEdition={prefillEdition}
        />

        {/* Edit modal — editing a specific company's license */}
        <IssueModal
          key={`edit-${editingLicense?.id ?? "none"}`}
          open={editOpen}
          onClose={() => { setEditOpen(false); setEditingLicense(undefined); }}
          onSuccess={invalidate}
          license={editingLicense}
          isSuperAdmin={true}
        />

        {/* Suspend / Unsuspend confirm modal */}
        {actionLicense && (
          <SuspendModal
            key={`suspend-${actionLicense.id}`}
            open={suspendOpen}
            onClose={() => { setSuspendOpen(false); setActionLicense(undefined); }}
            onSuccess={invalidate}
            license={actionLicense}
          />
        )}

        {/* Revoke confirm modal */}
        {actionLicense && (
          <RevokeModal
            key={`revoke-${actionLicense.id}`}
            open={revokeOpen}
            onClose={() => { setRevokeOpen(false); setActionLicense(undefined); }}
            onSuccess={invalidate}
            license={actionLicense}
          />
        )}

        <SuperAdminDashboard
          data={allUsageQuery.data}
          isLoading={allUsageQuery.isLoading}
          error={allUsageQuery.error as Error | null}
          onRefresh={invalidate}
          onIssueFor={handleIssueFor}
          onEdit={handleEdit}
          onSuspend={handleSuspend}
          onRevoke={handleRevoke}
          pagination={allUsageQuery.data?.pagination}
          onPageChange={setSaPage}
          search={saSearch}
          onSearch={setSaSearch}
        />

        {/* Issue new license button — floating in action bar */}
        <div className="flex justify-end">
          <button
            onClick={() => { setPrefillCompanyId(""); setPrefillCompanyName(""); setPrefillEdition(undefined); setIssueOpen(true); }}
            className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Issue New License
          </button>
        </div>

        {/* Edition plans — useful for SA to compare plans when advising clients */}
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
              {/* Billing period toggle */}
              <div className="mb-5 flex items-center justify-center gap-3">
                <span className={`text-sm font-semibold ${!billingYearly ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>Monthly</span>
                <button
                  onClick={() => setBillingYearly((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${billingYearly ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${billingYearly ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className={`text-sm font-semibold ${billingYearly ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                  Yearly
                  <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Save 20%
                  </span>
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {PLANS.map((p) => (
                  <PlanCard
                    key={p.edition}
                    plan={p}
                    current={false}
                    yearly={billingYearly}
                    ctaLabel="Issue License"
                    onSelect={() => {
                      setPrefillEdition(p.edition);
                      setPrefillCompanyId("");
                      setPrefillCompanyName("");
                      setIssueOpen(true);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Company Admin view ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ActivateModal
        open={activateOpen}
        onClose={() => { setActivateOpen(false); setActivateHint(undefined); }}
        onSuccess={invalidate}
        hint={activateHint}
      />

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

      {/* In-app license health banner */}
      {!isLoading && license && (() => {
        if (license.status === "expired") {
          return (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Your license has expired</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Access to licensed modules is restricted. Contact your administrator or{" "}
                  {license.support_email
                    ? <a href={`mailto:${license.support_email}`} className="underline">{license.support_email}</a>
                    : "support"}{" "}
                  to renew.
                </p>
              </div>
            </div>
          );
        }
        if (license.status === "suspended") {
          return (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Your license has been suspended</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Feature access is temporarily blocked. Please contact{" "}
                  {license.support_email
                    ? <a href={`mailto:${license.support_email}`} className="underline">{license.support_email}</a>
                    : "support"}{" "}
                  to resolve this.
                </p>
              </div>
            </div>
          );
        }
        if (license.days_remaining != null && license.days_remaining <= 30 && license.days_remaining > 0) {
          const urgent = license.days_remaining <= 7;
          return (
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
              urgent
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            }`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {license.status === "trial"
                    ? `Trial ends in ${license.days_remaining} day${license.days_remaining !== 1 ? "s" : ""}`
                    : `License expires in ${license.days_remaining} day${license.days_remaining !== 1 ? "s" : ""}`}
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                  Renew before {fmtDate(license.expires_at)} to avoid a service interruption.
                  {license.support_email && (
                    <> Contact <a href={`mailto:${license.support_email}`} className="underline">{license.support_email}</a> to renew.</>
                  )}
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}

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
          onIssue={() => {}}
          isSuperAdmin={false}
        />
      )}

      {/* Active license */}
      {!isLoading && license && (
        <>
          <ActiveLicenseHero license={license} usage={usage} />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Details card */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
                <p className="text-sm font-bold text-[var(--text)]">License Details</p>
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
                { label: "Employees",   used: usage.active_employees, max: license.max_employees, icon: Users },
                ...(license.max_users !== null
                  ? [{ label: "Admin seats", used: usage.active_users, max: license.max_users, icon: Building2 }]
                  : []),
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
                        <strong className="text-[var(--text)]">{row.used.toLocaleString()}</strong>
                        {row.max == null ? " / ∞" : ` / ${row.max.toLocaleString()} (${pct}%)`}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    {pct >= 80 && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {pct > 100 ? "Over limit — usage exceeds plan allowance" : pct >= 90 ? "Critical — approaching limit" : "Nearing limit — consider upgrading"}
                      </p>
                    )}
                  </div>
                );
              })}

              {license.days_remaining != null && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {license.status === "trial" ? (
                        <>
                          Trial period ends in{" "}
                          <strong className="text-[var(--text)]">{license.days_remaining} day{license.days_remaining !== 1 ? "s" : ""}</strong>
                        </>
                      ) : (
                        <>
                          License expires in{" "}
                          <strong className="text-[var(--text)]">{license.days_remaining} days</strong>{" "}
                          {license.expires_at && <>— {fmtDate(license.expires_at)}</>}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-700"
                      style={{ width: `${Math.min(100, (license.days_remaining / (license.status === "trial" ? 14 : 365)) * 100)}%` }}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {features.map((f) => (
                        <div key={f} className="flex items-center gap-2 rounded-lg bg-[var(--background)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)]">
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" /> {FEATURE_LABEL[f] ?? f}
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
            {/* Billing period toggle */}
            <div className="mb-5 flex items-center justify-center gap-3">
              <span className={`text-sm font-semibold ${!billingYearly ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>Monthly</span>
              <button
                onClick={() => setBillingYearly((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${billingYearly ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${billingYearly ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className={`text-sm font-semibold ${billingYearly ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                Yearly
                <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Save 20%
                </span>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {PLANS.map((p) => {
                const isCurrent = p.edition === license?.edition;
                const currentRank = license ? TIER_RANK[license.edition] : -1;
                const planRank = TIER_RANK[p.edition];

                let ctaLabel: string | undefined;
                let onSelect: (() => void) | undefined;

                if (!isCurrent) {
                  if (p.edition === "Enterprise") {
                    ctaLabel = "Contact Sales";
                    onSelect = () => { window.location.href = "mailto:sales@slingshotteck.com"; };
                  } else if (license) {
                    ctaLabel = planRank > currentRank ? "Upgrade" : "Downgrade";
                    const direction = planRank > currentRank ? "upgrade" : "downgrade";
                    onSelect = () => {
                      setActivateHint(`To ${direction} to ${p.edition}, enter the new license key provided by your administrator.`);
                      setActivateOpen(true);
                    };
                  } else {
                    ctaLabel = "Start Free Trial";
                    onSelect = () => setActivateOpen(true);
                  }
                }

                return (
                  <PlanCard
                    key={p.edition}
                    plan={p}
                    current={isCurrent}
                    yearly={billingYearly}
                    ctaLabel={ctaLabel}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
            <p className="mt-4 text-center text-xs text-[var(--muted)]">
              Need a custom plan? Contact{" "}
              <a href="mailto:sales@slingshotteck.com" className="text-[var(--primary)] hover:underline">
                sales@slingshotteck.com
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}