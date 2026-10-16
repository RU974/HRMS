import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { TimeInput24 } from "@/components/forms/time-input-24";
import {
  getAttendancePolicy,
  updateAttendancePolicy,
  type AttendancePolicy,
  type AttendancePolicyInput,
} from "@/services/hr-management-service";

/** Form state: numbers are kept as strings while typing; empty means "off". */
type Draft = {
  late_after_time: string;
  allow_manual_status_override: boolean;
  early_leave_enabled: boolean;
  early_leave_grace_minutes: string;
  early_leave_before_time: string;
  early_leave_counts_as_late: boolean;
  full_day_hours: string;
  half_day_hours: string;
  count_short_as_absent: boolean;
  half_day_after_late_minutes: string;
  absent_after_late_minutes: string;
  lates_per_absent: string;
  auto_mark_absent: boolean;
  missing_punch_as_absent: boolean;
  apply_from: string;
};

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const orNull = (v: string) => (v.trim() === "" ? null : Number(v));

function toDraft(p: AttendancePolicy): Draft {
  return {
    late_after_time: p.late_after_time.slice(0, 5),
    allow_manual_status_override: p.allow_manual_status_override,
    early_leave_enabled: p.early_leave_enabled,
    early_leave_grace_minutes: num(p.early_leave_grace_minutes),
    early_leave_before_time: p.early_leave_before_time?.slice(0, 5) ?? "",
    early_leave_counts_as_late: p.early_leave_counts_as_late,
    full_day_hours: num(p.full_day_hours),
    half_day_hours: num(p.half_day_hours),
    count_short_as_absent: p.count_short_as_absent,
    half_day_after_late_minutes: num(p.half_day_after_late_minutes),
    absent_after_late_minutes: num(p.absent_after_late_minutes),
    lates_per_absent: num(p.lates_per_absent),
    auto_mark_absent: p.auto_mark_absent,
    missing_punch_as_absent: p.missing_punch_as_absent,
    apply_from: "",
  };
}

/** Same relations the server enforces, so mistakes show before saving. */
function validate(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const full = orNull(d.full_day_hours);
  const half = orNull(d.half_day_hours);
  const halfLate = orNull(d.half_day_after_late_minutes);
  const absentLate = orNull(d.absent_after_late_minutes);

  if (!d.late_after_time) e.late_after_time = "Choose the time after which a check-in is late.";
  if (full !== null && (full < 0.5 || full > 24)) e.full_day_hours = "Between 0.5 and 24 hours.";
  if (half !== null && full === null) e.half_day_hours = "Set the full-day hours first.";
  else if (half !== null && full !== null && half >= full) e.half_day_hours = "Must be less than the full-day hours.";
  if (d.count_short_as_absent && half === null) e.count_short_as_absent = "Needs the half-day hours.";
  if (halfLate !== null && (!Number.isInteger(halfLate) || halfLate < 1)) e.half_day_after_late_minutes = "Whole minutes, at least 1.";
  if (absentLate !== null && (!Number.isInteger(absentLate) || absentLate < 1)) e.absent_after_late_minutes = "Whole minutes, at least 1.";
  else if (halfLate !== null && absentLate !== null && absentLate <= halfLate) e.absent_after_late_minutes = "Must be later than the half-day limit.";
  const lates = orNull(d.lates_per_absent);
  if (lates !== null && (!Number.isInteger(lates) || lates < 0 || lates > 31)) e.lates_per_absent = "Whole number from 0 to 31.";
  const grace = orNull(d.early_leave_grace_minutes);
  if (grace !== null && (!Number.isInteger(grace) || grace < 0 || grace > 240)) e.early_leave_grace_minutes = "Whole minutes from 0 to 240.";
  return e;
}

function toPayload(d: Draft): AttendancePolicyInput & { apply_from?: string | null } {
  return {
    late_after_time: d.late_after_time,
    allow_manual_status_override: d.allow_manual_status_override,
    early_leave_enabled: d.early_leave_enabled,
    early_leave_grace_minutes: orNull(d.early_leave_grace_minutes) ?? 0,
    early_leave_before_time: d.early_leave_before_time || null,
    early_leave_counts_as_late: d.early_leave_counts_as_late,
    full_day_hours: orNull(d.full_day_hours),
    half_day_hours: orNull(d.half_day_hours),
    count_short_as_absent: d.count_short_as_absent,
    half_day_after_late_minutes: orNull(d.half_day_after_late_minutes),
    absent_after_late_minutes: orNull(d.absent_after_late_minutes),
    lates_per_absent: orNull(d.lates_per_absent) ?? 0,
    auto_mark_absent: d.auto_mark_absent,
    missing_punch_as_absent: d.missing_punch_as_absent,
    apply_from: d.apply_from || null,
  };
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="mb-4 mt-1 text-sm text-[var(--muted)]">{hint}</p>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </Card>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--text)]">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)]/60 p-3">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-[var(--text)]">{label}</span>
        {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      </span>
    </label>
  );
}

export function AttendancePolicyPanel() {
  const queryClient = useQueryClient();
  const policy = useQuery({ queryKey: ["attendance-policy"], queryFn: getAttendancePolicy });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (policy.data) setDraft(toDraft(policy.data));
  }, [policy.data]);

  const save = useMutation({
    mutationFn: (d: Draft) => updateAttendancePolicy(toPayload(d)),
    onSuccess: (saved) => {
      queryClient.setQueryData(["attendance-policy"], saved);
      // Statuses, stats and payroll previews all depend on the policy.
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setMessage({
        ok: true,
        text: saved.recalculated_records != null
          ? `Policy saved. ${saved.recalculated_records} existing record(s) were re-judged.`
          : "Policy saved. It applies to punches recorded from now on; use “Apply to past records” to re-judge older ones.",
      });
    },
    onError: (err: unknown) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save the policy." }),
  });

  if (policy.isLoading || !draft) return <Card><div className="h-40 animate-pulse rounded-xl bg-[var(--border)]" /></Card>;
  if (policy.isError) return <Card><p className="text-sm text-red-600">Could not load the attendance policy.</p></Card>;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setMessage(null);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };
  const errors = validate(draft);
  const invalid = Object.keys(errors).length > 0;
  const numInput = (key: keyof Draft, placeholder = "Off", step = "1") => (
    <FormInput type="number" min={0} step={step} placeholder={placeholder}
      value={draft[key] as string} onChange={(e) => set(key, e.target.value as Draft[typeof key])} />
  );

  return (
    <div className="space-y-4 pb-20">
      {policy.data?.inherited && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your company is using the default policy. Saving creates a policy of its own.
        </div>
      )}

      <Section title="Late arrival" hint="When a check-in counts as late. A person on a shift is judged against the shift start plus its grace; this time is used for people without a shift.">
        <Field label="Late after (no shift)" error={errors.late_after_time}>
          <TimeInput24 value={draft.late_after_time} onChange={(v) => set("late_after_time", v)} />
        </Field>
        <Toggle label="Allow manual status override" hint="Absent, leave and half-day statuses set by hand are kept when times are edited."
          checked={draft.allow_manual_status_override} onChange={(v) => set("allow_manual_status_override", v)} />
        <Field label="Half day when more than … minutes late" error={errors.half_day_after_late_minutes} hint="Counted from the late cut-off. Empty = never.">
          {numInput("half_day_after_late_minutes")}
        </Field>
        <Field label="Absent when more than … minutes late" error={errors.absent_after_late_minutes} hint="Must be later than the half-day limit. Empty = never.">
          {numInput("absent_after_late_minutes")}
        </Field>
      </Section>

      <Section title="Early leave" hint="Leaving before the shift ends. It is flagged on the record and can count like a late arrival.">
        <div className="md:col-span-2">
          <Toggle label="Track early leave" checked={draft.early_leave_enabled} onChange={(v) => set("early_leave_enabled", v)} />
        </div>
        {draft.early_leave_enabled && (
          <>
            <Field label="Grace (minutes before shift end)" error={errors.early_leave_grace_minutes} hint="Leaving up to this early is fine.">
              {numInput("early_leave_grace_minutes", "0")}
            </Field>
            <Field label="Leave-before time (no shift)" hint="Used for people without a shift. Empty = not tracked for them.">
              <TimeInput24 clearable value={draft.early_leave_before_time} onChange={(v) => set("early_leave_before_time", v)} />
            </Field>
            <div className="md:col-span-2">
              <Toggle label="Count an early leave as a late" hint="It then adds to the “N lates = 1 absent” total."
                checked={draft.early_leave_counts_as_late} onChange={(v) => set("early_leave_counts_as_late", v)} />
            </div>
          </>
        )}
      </Section>

      <Section title="Minimum hours and half day" hint="Judged when the person checks out. Hours at or above the full-day hours are a normal day.">
        <Field label="Full-day hours" error={errors.full_day_hours} hint="Shorter days are flagged. Empty = no minimum.">
          {numInput("full_day_hours", "Off", "0.25")}
        </Field>
        <Field label="Half-day hours" error={errors.half_day_hours} hint="Between this and the full-day hours = half day. Needs the full-day hours.">
          {numInput("half_day_hours", "Off", "0.25")}
        </Field>
        <div className="md:col-span-2">
          <Toggle label="Below the half-day hours counts as absent" hint="Otherwise a day that short is still a half day."
            checked={draft.count_short_as_absent} onChange={(v) => set("count_short_as_absent", v)} />
          {errors.count_short_as_absent && <p className="mt-1 text-xs text-red-600">{errors.count_short_as_absent}</p>}
        </div>
      </Section>

      <Section title="When someone counts as absent" hint="Together with the limits above, these decide what ends up as an absence and what it costs in payroll.">
        <Field label="N lates = 1 absent" error={errors.lates_per_absent} hint="Every N lates in a month count as one absent day (payroll deducts an absent day for each block). 0 or empty = off; the payroll late rule then applies.">
          {numInput("lates_per_absent", "Off")}
        </Field>
        <div className="space-y-3">
          <Toggle label="Mark absent automatically" hint="A finished working day with no punch and no approved leave becomes absent. Off = HR marks absences by hand."
            checked={draft.auto_mark_absent} onChange={(v) => set("auto_mark_absent", v)} />
          <Toggle label="Missing punch counts as absent in payroll" hint="A day with only one punch is deducted like an absence."
            checked={draft.missing_punch_as_absent} onChange={(v) => set("missing_punch_as_absent", v)} />
        </div>
      </Section>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Apply to past records from" hint="Optional. Re-judges late / half-day / absent on existing records from this date, using the rules above. Hand-set statuses are kept.">
            <FormInput type="date" max={new Date().toISOString().slice(0, 10)} value={draft.apply_from} onChange={(e) => set("apply_from", e.target.value)} />
          </Field>
          <div className="flex items-end justify-end gap-3">
            {policy.data && <Button variant="outline" onClick={() => { setDraft(toDraft(policy.data)); setMessage(null); }}>Reset</Button>}
            <Button disabled={invalid || save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? "Saving..." : "Save policy"}
            </Button>
          </div>
        </div>
        {message && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>
        )}
      </Card>
    </div>
  );
}
