import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { listRecruitmentPeople, type CandidateStage, type OfferStatus, type Person } from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/utils/cn";

interface Section {
  label: string;
  path: string;
  /** Visible to users holding any one of these permissions. */
  permissions: string[];
}

export const recruitmentSections: Section[] = [
  { label: "Overview", path: "/recruitment", permissions: ["recruitment:view"] },
  { label: "Jobs", path: "/recruitment/jobs", permissions: ["recruitment:view", "recruitment:request"] },
  { label: "Candidates", path: "/recruitment/candidates", permissions: ["recruitment:view"] },
  { label: "Talent pool", path: "/recruitment/talent-pool", permissions: ["recruitment:view"] },
  { label: "Referrals", path: "/recruitment/referrals", permissions: ["recruitment:view"] },
  { label: "Interviews", path: "/recruitment/interviews", permissions: ["recruitment:view", "recruitment:interview"] },
  { label: "Offers", path: "/recruitment/offers", permissions: ["recruitment:view"] },
  { label: "Onboarding", path: "/recruitment/onboarding", permissions: ["recruitment:view", "recruitment:onboarding_task"] },
  { label: "Reports", path: "/recruitment/reports", permissions: ["recruitment:view"] },
];

export function RecruitmentSubnav() {
  const { pathname } = useLocation();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const visible = recruitmentSections.filter((section) => section.permissions.some((permission) => hasPermission(permission)));

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((section) => {
        const active = pathname === section.path || (section.path === "/recruitment/candidates" && pathname.startsWith("/recruitment/candidates/"));
        return (
          <Link
            key={section.path}
            to={section.path}
            className={cn(
              "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--primary)]/40 hover:bg-[var(--border)]/25"
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}

export function formatRecruitmentDate(value?: string | null, includeTime = false) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return includeTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}

export function formatMoney(amount?: string | number | null, currency?: string | null) {
  if (amount === null || amount === undefined || amount === "") return "-";
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  return `${currency ?? ""} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
}

/** Convert a datetime-local input value to the "YYYY-MM-DD HH:mm:ss" form the API expects. */
export function toApiDateTime(local: string) {
  return local.replace("T", " ") + (local.length === 16 ? ":00" : "");
}

/** Convert an API datetime to a datetime-local input value. */
export function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const selectClass =
  "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60";

export const textareaClass =
  "min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60";

const tones = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-800",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
} as const;

export function Badge({ tone = "slate", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-medium capitalize", tones[tone])}>{children}</span>;
}

const stageTone: Record<CandidateStage, keyof typeof tones> = {
  applied: "slate",
  screening: "blue",
  interview: "violet",
  offer: "amber",
  hired: "emerald",
  rejected: "red",
};

/** `label` is the name of a custom pipeline stage; the colour still follows the stage's group. */
export function StageBadge({ stage, label }: { stage: CandidateStage; label?: string | null }) {
  return <Badge tone={stageTone[stage]}>{label && label.toLowerCase() !== stage ? label : stage}</Badge>;
}

const offerTone: Record<OfferStatus, keyof typeof tones> = {
  draft: "slate",
  pending_approval: "amber",
  approved: "blue",
  rejected: "red",
  sent: "violet",
  accepted: "emerald",
  declined: "red",
  expired: "slate",
  withdrawn: "slate",
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <Badge tone={offerTone[status]}>{status.replace("_", " ")}</Badge>;
}

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = "Confirm", busy = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-[var(--muted)]">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="button" onClick={onConfirm} disabled={busy}>{busy ? "Working..." : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

interface NoteModalProps {
  title: string;
  label: string;
  placeholder?: string;
  submitLabel?: string;
  /** When true the note must be filled in before it can be submitted. */
  required?: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}

/** Asks for a short note (a reason, a comment) before an action goes ahead. */
export function NoteModal({ title, label, placeholder, submitLabel = "Submit", required = false, busy = false, error, onSubmit, onCancel }: NoteModalProps) {
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const fieldId = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (required && !note.trim()) return setLocalError(`${label} is required.`);
    setLocalError(null);
    onSubmit(note.trim());
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={localError ?? error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor={fieldId}>{label}{required ? "" : " (optional)"}</label>
          <textarea id={fieldId} className={textareaClass} value={note} placeholder={placeholder} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Working..." : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

type PersonValueKey = "user_id" | "employee_id";

interface PersonSelectProps {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  valueKey?: PersonValueKey;
  /** Name to show for the current value when it is not among the loaded people. */
  currentName?: string | null;
  placeholder?: string;
  disabled?: boolean;
}

/** Searchable select over the company's active people (recruitment:view only, company scoped). */
export function PersonSelect({ label, value, onChange, valueKey = "user_id", currentName, placeholder = "Not assigned", disabled }: PersonSelectProps) {
  const selectId = useId();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const peopleQuery = useQuery({
    queryKey: ["recruitment", "people", debounced],
    queryFn: () => listRecruitmentPeople(debounced),
    staleTime: 60_000,
  });

  const people: Person[] = peopleQuery.data ?? [];
  const hasCurrent = value != null && people.some((person) => person[valueKey] === value);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={selectId}>{label}</label>
      <FormInput aria-label={`Search ${label.toLowerCase()}`} placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" disabled={disabled} />
      <select
        id={selectId}
        className={selectClass}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{placeholder}</option>
        {value != null && !hasCurrent && <option value={value}>{currentName ?? `User #${value}`}</option>}
        {people.map((person) => (
          <option key={person.employee_id} value={person[valueKey]}>
            {person.name}{person.designation ? ` — ${person.designation}` : ""}
          </option>
        ))}
      </select>
      {peopleQuery.isError && <p className="mt-1 text-xs text-red-700">Could not load people.</p>}
    </div>
  );
}
