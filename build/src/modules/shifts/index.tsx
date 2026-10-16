import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { TimeInput24 } from "@/components/forms/time-input-24";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { ShiftItem, createShift, deleteShift, listDepartments, listShifts, updateShift } from "@/services/hr-management-service";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";
import { RosterTab } from "./roster-tab";
import { RotationsTab } from "./rotations-tab";
import { SwapsTab } from "./swaps-tab";

export { MySchedulePage } from "./my-schedule-page";

type DeptGrace = { department_id: number; grace_minutes: number };

// ISO weekday numbers: 1 = Monday ... 7 = Sunday.
const WEEK_DAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" }
];
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const formatWorkingDays = (days?: number[] | null) => {
  const list = days && days.length > 0 ? days : DEFAULT_WORKING_DAYS;
  return WEEK_DAYS.filter((d) => list.includes(d.value)).map((d) => d.short).join(", ");
};

type TabKey = "shifts" | "roster" | "rotations" | "swaps";

/** Shifts, rosters, rotations and swaps. `teamView` is the read-mostly version for line managers. */
export function ShiftsPage({ teamView = false }: { teamView?: boolean }) {
  const canEdit = useAuthStore((s) => s.hasPermission("attendance:edit"));
  const tabs: { key: TabKey; label: string }[] = teamView
    ? [{ key: "roster", label: "Team roster" }, { key: "swaps", label: "Swaps" }]
    : [{ key: "shifts", label: "Shifts" }, { key: "roster", label: "Roster" }, { key: "rotations", label: "Rotations" }, { key: "swaps", label: "Swaps" }];
  const [tab, setTab] = useState<TabKey>(tabs[0].key);

  return <div className="space-y-6">
    <PageHeader title={teamView ? "Team schedule" : "Shifts & rosters"} subtitle={teamView ? "Who works which shift, and the swap requests of your team." : "Shift times, who works them and when: rosters, rotations, one-day changes and swaps."} />
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {tabs.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${tab === t.key ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}>{t.label}</button>)}
    </div>
    {tab === "shifts" && <ShiftListTab />}
    {tab === "roster" && <RosterTab canEdit={canEdit && !teamView} />}
    {tab === "rotations" && <RotationsTab canEdit={canEdit} />}
    {tab === "swaps" && <SwapsTab canEdit={canEdit && !teamView} />}
  </div>;
}

export function TeamSchedulePage() {
  return <ShiftsPage teamView />;
}

function ShiftListTab() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["hr", "shifts"], queryFn: listShifts });
  const departmentsQuery = useQuery({ queryKey: ["hr", "departments"], queryFn: listDepartments });
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftItem | null>(null);
  const [applyFrom, setApplyFrom] = useState("");
  const [form, setForm] = useState({ name: "", start_time: "09:00", end_time: "17:00", continues_after_midnight: false, working_days: DEFAULT_WORKING_DAYS, grace_minutes: 0, is_active: true, department_graces: [] as DeptGrace[] });
  const payload = () => ({ ...form, department_graces: form.department_graces.filter((g) => g.department_id > 0), ...(editing && applyFrom ? { apply_from: applyFrom } : {}) });
  const saveMutation = useMutation({
    mutationFn: async () => editing ? updateShift(editing.id, payload()) : createShift(payload()),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "shifts"] }); await queryClient.invalidateQueries({ queryKey: ["shift-roster"] }); toast.success("Saved", editing ? (applyFrom ? `Shift updated; attendance re-judged from ${applyFrom}.` : "Shift updated. Days that already happened keep the shift they were recorded with.") : "Shift created successfully."); setModalOpen(false); },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); }
  });
  const deleteMutation = useMutation({ mutationFn: deleteShift, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr", "shifts"] }); toast.success("Deleted", "Shift removed successfully."); }, onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); } });

  const { sorted: sortedShifts, sort, toggle: toggleSort } = useTableSort(query.data ?? [], "name");
  return <div className="space-y-6">
    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex justify-end"><Button onClick={() => { setEditing(null); setApplyFrom(""); setForm({ name: "", start_time: "09:00", end_time: "17:00", continues_after_midnight: false, working_days: DEFAULT_WORKING_DAYS, grace_minutes: 0, is_active: true, department_graces: [] as DeptGrace[] }); setModalOpen(true); }}>New Shift</Button></div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} /><SortableTh label="Timing" sortKey="start_time" sort={sort} onSort={toggleSort} /><SortableTh label="Grace" sortKey="grace_minutes" sort={sort} onSort={toggleSort} /><SortableTh label="Active" sortKey="is_active" sort={sort} onSort={toggleSort} /><th className="p-3 text-right">Actions</th></tr></thead>
        <tbody>{sortedShifts.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3">{item.name}</td><td className="p-3">{item.start_time} - {item.end_time}{item.continues_after_midnight && <span className="ml-2 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-400">Night +1d</span>}<div className="text-xs text-[var(--muted)]">{formatWorkingDays(item.working_days)}</div></td><td className="p-3">{item.grace_minutes} min{(item.department_graces ?? []).length > 0 && <div className="text-xs text-[var(--muted)]">{(item.department_graces ?? []).map((g) => `${(departmentsQuery.data ?? []).find((d) => d.id === g.department_id)?.name ?? "Dept"}: ${g.grace_minutes}m`).join(", ")}</div>}</td><td className="p-3">{item.is_active ? "Yes" : "No"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(item); setApplyFrom(""); setForm({ name: item.name, start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5), continues_after_midnight: !!item.continues_after_midnight, working_days: item.working_days && item.working_days.length > 0 ? item.working_days : DEFAULT_WORKING_DAYS, grace_minutes: item.grace_minutes, is_active: item.is_active, department_graces: item.department_graces ?? [] }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>Delete</Button></div></td></tr>)}</tbody>
      </table>
    </section>
    {modalOpen && <Modal title={editing ? "Edit Shift" : "New Shift"} onClose={() => setModalOpen(false)}><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}><Field label="Name"><FormInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field><Field label="Start Time"><TimeInput24 value={form.start_time} onChange={(v) => setForm((p) => ({ ...p, start_time: v }))} /></Field><Field label="End Time"><TimeInput24 value={form.end_time} onChange={(v) => setForm((p) => ({ ...p, end_time: v }))} /></Field><Field label="Night shift"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.continues_after_midnight} onChange={(e) => setForm((p) => ({ ...p, continues_after_midnight: e.target.checked }))} />Continues after midnight (ends the next day, e.g. 20:00 - 05:00)</label></Field><Field label={`Working Days (${form.working_days.length} per week)`}><div className="flex flex-wrap gap-2">{WEEK_DAYS.map((d) => { const on = form.working_days.includes(d.value); return <button key={d.value} type="button" title={d.label} aria-pressed={on} onClick={() => setForm((p) => ({ ...p, working_days: on ? p.working_days.filter((x) => x !== d.value) : [...p.working_days, d.value].sort((a, b) => a - b) }))} className={`h-10 min-w-12 rounded-lg border px-3 text-sm font-medium transition ${on ? "border-transparent bg-[var(--primary,#2563eb)] text-white" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"}`}>{d.short}</button>; })}</div>{form.working_days.length === 0 && <p className="mt-1 text-xs text-red-600">Select at least one working day.</p>}</Field><Field label="Default Grace Minutes"><FormInput type="number" min={0} max={180} value={form.grace_minutes} onChange={(e) => setForm((p) => ({ ...p, grace_minutes: Number(e.target.value) }))} /></Field><Field label="Department Grace Overrides"><div className="space-y-2">{form.department_graces.map((g, i) => <div key={i} className="flex items-center gap-2"><select className="h-10 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={g.department_id} onChange={(e) => setForm((p) => ({ ...p, department_graces: p.department_graces.map((x, j) => j === i ? { ...x, department_id: Number(e.target.value) } : x) }))}><option value={0}>Select department</option>{(departmentsQuery.data ?? []).filter((d) => d.id === g.department_id || !form.department_graces.some((x) => x.department_id === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><FormInput className="w-24" type="number" min={0} max={180} value={g.grace_minutes} onChange={(e) => setForm((p) => ({ ...p, department_graces: p.department_graces.map((x, j) => j === i ? { ...x, grace_minutes: Number(e.target.value) } : x) }))} /><span className="text-xs text-[var(--muted)]">min</span><Button type="button" variant="outline" onClick={() => setForm((p) => ({ ...p, department_graces: p.department_graces.filter((_, j) => j !== i) }))}>Remove</Button></div>)}<Button type="button" variant="outline" onClick={() => setForm((p) => ({ ...p, department_graces: [...p.department_graces, { department_id: 0, grace_minutes: 0 }] }))}>Add department grace</Button><p className="text-xs text-[var(--muted)]">Departments without an override use the default grace.</p></div></Field>{editing && <Field label="Re-judge past attendance from (optional)"><FormInput type="date" value={applyFrom} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setApplyFrom(e.target.value)} /><p className="mt-1 text-xs text-[var(--muted)]">Changes apply from today. Days that already happened keep the shift they were recorded with, unless you pick a date here: late, absent and overtime are then worked out again from that date.</p></Field>}<Field label="Active"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} /></Field><div className="flex justify-end"><Button type="submit">Save</Button></div></form></Modal>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }


