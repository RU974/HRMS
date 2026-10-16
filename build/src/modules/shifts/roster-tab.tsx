import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/notifications/toast";
import { listDepartments } from "@/services/hr-management-service";
import {
  ScheduleCell,
  ScheduleGrid,
  ScheduleRow,
  createAssignment,
  createOverride,
  deleteOverride,
  getRoster,
  listRotations,
  type WriteResult
} from "@/services/shift-schedule-service";
import { addDays, cellClass, cellLabel, formatDay, formatLongDate, SOURCE_LABEL, startOfWeek, toIsoDate } from "./schedule-utils";

const DAYS_SHOWN = 14;

const showWarnings = (title: string, result: WriteResult | undefined) => {
  const notes = [...(result?.skipped ?? []), ...(result?.warnings ?? [])];
  if (notes.length > 0) toast.warning(title, notes.slice(0, 4).join(" "));
  else toast.success(title);
};

type CellTarget = { employee: ScheduleRow; date: string; cell: ScheduleCell };

export function RosterTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => startOfWeek(toIsoDate(new Date())));
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [cellTarget, setCellTarget] = useState<CellTarget | null>(null);
  const [assigning, setAssigning] = useState(false);

  const to = addDays(from, DAYS_SHOWN - 1);
  const departmentsQuery = useQuery({ queryKey: ["hr", "departments"], queryFn: listDepartments });
  const rosterQuery = useQuery({
    queryKey: ["shift-roster", from, to, search, departmentId, page],
    queryFn: () => getRoster({ from, to, search: search || undefined, department_id: departmentId || undefined, page, per_page: 50 })
  });
  const grid = rosterQuery.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["shift-roster"] });

  const allIds = useMemo(() => (grid?.employees ?? []).map((e) => e.id), [grid]);
  const toggle = (id: number) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return <section className="space-y-3">
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1">
        <Button variant="outline" aria-label="Previous two weeks" onClick={() => { setFrom(addDays(from, -DAYS_SHOWN)); setPage(1); }}>←</Button>
        <Button variant="outline" onClick={() => { setFrom(startOfWeek(toIsoDate(new Date()))); setPage(1); }}>Today</Button>
        <Button variant="outline" aria-label="Next two weeks" onClick={() => { setFrom(addDays(from, DAYS_SHOWN)); setPage(1); }}>→</Button>
      </div>
      <p className="text-sm text-[var(--muted)]">{formatLongDate(from)} – {formatLongDate(to)}</p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <FormInput className="w-44" placeholder="Search employee" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={departmentId} onChange={(e) => { setDepartmentId(Number(e.target.value)); setPage(1); }}>
          <option value={0}>All departments</option>
          {(departmentsQuery.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {canEdit && <Button disabled={selected.length === 0} onClick={() => setAssigning(true)}>Assign roster{selected.length > 0 ? ` (${selected.length})` : ""}</Button>}
      </div>
    </div>

    <Legend />

    {rosterQuery.isError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{(rosterQuery.error as Error).message}</p>}

    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="sticky left-0 z-10 bg-[var(--card)] p-2 text-left">
              {canEdit && <input type="checkbox" aria-label="Select all on this page" checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))} onChange={(e) => setSelected(e.target.checked ? allIds : [])} />}
              <span className="ml-2 font-semibold">Employee</span>
            </th>
            {(grid?.dates ?? []).map((date) => {
              const d = formatDay(date);
              const holiday = grid?.holidays?.[date];
              return <th key={date} title={holiday ?? undefined} className={`min-w-[72px] p-2 text-center font-medium ${holiday ? "text-rose-500" : "text-[var(--muted)]"}`}>
                <div>{d.weekday}</div><div className="text-sm text-[var(--text)]">{d.day} {d.month}</div>{holiday && <div className="truncate text-[10px]">{holiday}</div>}
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {(grid?.employees ?? []).map((employee) => <tr key={employee.id} className="border-b border-[var(--border)]/60">
            <td className="sticky left-0 z-10 bg-[var(--card)] p-2">
              <div className="flex items-center gap-2">
                {canEdit && <input type="checkbox" aria-label={`Select ${employee.name}`} checked={selected.includes(employee.id)} onChange={() => toggle(employee.id)} />}
                <div><div className="font-medium">{employee.name}</div>{employee.department && <div className="text-[10px] text-[var(--muted)]">{employee.department}</div>}</div>
              </div>
            </td>
            {(grid?.dates ?? []).map((date) => {
              const cell = employee.days[date];
              if (!cell) return <td key={date} />;
              return <td key={date} className="p-1">
                <button type="button" disabled={!canEdit} onClick={() => setCellTarget({ employee, date, cell })} title={`${SOURCE_LABEL[cell.source]}${cell.start_time ? ` · ${cell.start_time}–${cell.end_time}` : ""}`}
                  className={`h-12 w-full rounded-md px-1 text-center leading-tight ${cellClass(cell)} ${canEdit ? "hover:ring-2 hover:ring-[var(--primary)]" : "cursor-default"}`}>
                  <div className="truncate font-medium">{cellLabel(cell)}</div>
                  {cell.working && cell.start_time && <div className="text-[10px] opacity-80">{cell.start_time}{cell.overnight ? " ☾" : ""}</div>}
                </button>
              </td>;
            })}
          </tr>)}
          {grid && grid.employees.length === 0 && <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={(grid.dates.length || 1) + 1}>No employees match.</td></tr>}
        </tbody>
      </table>
    </div>

    {grid?.pagination && grid.pagination.last_page > 1 && <div className="flex items-center justify-end gap-2 text-sm">
      <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span>Page {grid.pagination.page} of {grid.pagination.last_page}</span>
      <Button variant="outline" disabled={page >= grid.pagination.last_page} onClick={() => setPage(page + 1)}>Next</Button>
    </div>}

    {cellTarget && grid && <DayModal target={cellTarget} grid={grid} onClose={() => setCellTarget(null)} onSaved={() => { setCellTarget(null); void refresh(); }} />}
    {assigning && grid && <AssignModal employeeIds={selected} grid={grid} defaultStart={from} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); setSelected([]); void refresh(); }} />}
  </section>;
}

function Legend() {
  const items: [string, string][] = [
    ["Default shift", "border border-[var(--border)] bg-[var(--card)]"],
    ["Roster / rotation", "bg-emerald-500/15"],
    ["One-off change", "bg-sky-500/15"],
    ["Swap", "bg-fuchsia-500/15"],
    ["Off", "bg-[var(--bg)] border border-[var(--border)]"],
    ["Leave", "bg-amber-500/15"]
  ];
  return <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">{items.map(([label, cls]) => <span key={label} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded ${cls}`} />{label}</span>)}</div>;
}

/** Change one person's one day: a different shift, or a day off. */
function DayModal({ target, grid, onClose, onSaved }: { target: CellTarget; grid: ScheduleGrid; onClose: () => void; onSaved: () => void }) {
  const { employee, date, cell } = target;
  const [choice, setChoice] = useState<string>(cell.working && cell.shift_id ? String(cell.shift_id) : "off");
  const [reason, setReason] = useState("");
  const saveMutation = useMutation({
    mutationFn: () => createOverride({ employee_ids: [employee.id], dates: [date], shift_id: choice === "off" ? null : Number(choice), day_off: choice === "off", reason: reason || null }),
    onSuccess: (result) => { showWarnings("Day updated", result); onSaved(); },
    onError: (e: Error) => toast.error("Could not change the day", e.message)
  });
  const removeMutation = useMutation({
    mutationFn: () => deleteOverride(cell.source_id as number),
    onSuccess: () => { toast.success("Back to the usual schedule"); onSaved(); },
    onError: (e: Error) => toast.error("Could not remove the change", e.message)
  });

  return <Modal title={`${employee.name} · ${formatLongDate(date)}`} onClose={onClose}>
    <div className="space-y-3 text-sm">
      <p className="text-[var(--muted)]">Currently: {cellLabel(cell)} ({SOURCE_LABEL[cell.source]}). This changes this one day only.</p>
      {cell.source === "swap" ? <p className="rounded-lg bg-fuchsia-500/10 px-3 py-2 text-fuchsia-600">This day comes from a shift swap. Cancel the swap on the Swaps tab to change it.</p> : <>
        <div>
          <label className="mb-1 block font-medium">Shift</label>
          <select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="off">Day off</option>
            {grid.shifts.filter((s) => s.is_active || String(s.id) === choice).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>)}
          </select>
        </div>
        <div><label className="mb-1 block font-medium">Reason (optional)</label><FormInput value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} /></div>
        {new Date(date) < new Date(toIsoDate(new Date())) && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600">This day is in the past: the attendance record of that day will be judged against this shift.</p>}
        <div className="flex justify-between gap-2">
          <div>{cell.source === "override" && <Button type="button" variant="outline" disabled={removeMutation.isPending} onClick={() => void removeMutation.mutateAsync()}>Remove change</Button>}</div>
          <Button disabled={saveMutation.isPending} onClick={() => void saveMutation.mutateAsync()}>Save</Button>
        </div>
      </>}
    </div>
  </Modal>;
}

/** Put the ticked employees on a shift or rotation for a stretch of dates. */
function AssignModal({ employeeIds, grid, defaultStart, onClose, onSaved }: { employeeIds: number[]; grid: ScheduleGrid; defaultStart: string; onClose: () => void; onSaved: () => void }) {
  const rotationsQuery = useQuery({ queryKey: ["shift-rotations"], queryFn: listRotations });
  const [kind, setKind] = useState<"shift" | "rotation">("shift");
  const [shiftId, setShiftId] = useState(0);
  const [rotationId, setRotationId] = useState(0);
  const [startsOn, setStartsOn] = useState(defaultStart);
  const [endsOn, setEndsOn] = useState("");
  const [anchor, setAnchor] = useState("");
  const [applyToPast, setApplyToPast] = useState(false);
  const [notes, setNotes] = useState("");
  const valid = (kind === "shift" ? shiftId > 0 : rotationId > 0) && startsOn !== "" && (endsOn === "" || endsOn >= startsOn);

  const saveMutation = useMutation({
    mutationFn: () => createAssignment({
      employee_ids: employeeIds,
      shift_id: kind === "shift" ? shiftId : null,
      shift_rotation_id: kind === "rotation" ? rotationId : null,
      rotation_anchor_date: kind === "rotation" && anchor ? anchor : null,
      starts_on: startsOn,
      ends_on: endsOn || null,
      notes: notes || null,
      apply_to_past: applyToPast
    }),
    onSuccess: (result) => { showWarnings(`Roster saved for ${employeeIds.length} ${employeeIds.length === 1 ? "person" : "people"}`, result); onSaved(); },
    onError: (e: Error) => toast.error("Could not save the roster", e.message)
  });

  return <Modal title={`Assign roster to ${employeeIds.length} ${employeeIds.length === 1 ? "employee" : "employees"}`} onClose={onClose}>
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (valid) void saveMutation.mutateAsync(); }}>
      <div className="flex gap-2">
        {(["shift", "rotation"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-10 flex-1 rounded-lg border px-3 font-medium ${kind === k ? "border-transparent bg-[var(--primary,#2563eb)] text-white" : "border-[var(--border)] text-[var(--muted)]"}`}>{k === "shift" ? "A fixed shift" : "A rotation"}</button>)}
      </div>
      {kind === "shift"
        ? <div><label className="mb-1 block font-medium">Shift</label><select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={shiftId} onChange={(e) => setShiftId(Number(e.target.value))}><option value={0}>Select shift</option>{grid.shifts.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>)}</select></div>
        : <div><label className="mb-1 block font-medium">Rotation</label><select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={rotationId} onChange={(e) => setRotationId(Number(e.target.value))}><option value={0}>Select rotation</option>{(rotationsQuery.data ?? []).filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.cycle_days}-day cycle)</option>)}</select></div>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1 block font-medium">From</label><FormInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></div>
        <div><label className="mb-1 block font-medium">Until (optional)</label><FormInput type="date" min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></div>
      </div>
      {kind === "rotation" && <div><label className="mb-1 block font-medium">Day 1 of the cycle falls on</label><FormInput type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} /><p className="mt-1 text-xs text-[var(--muted)]">Leave empty to start the cycle on the "From" date. Give the same date to a whole team to keep them in step, or different dates to stagger them.</p></div>}
      <div><label className="mb-1 block font-medium">Note (optional)</label><FormInput value={notes} maxLength={255} onChange={(e) => setNotes(e.target.value)} /></div>
      <p className="text-xs text-[var(--muted)]">Anything already rostered for these dates is replaced; the rest of it stays. Days that already happened keep the shift they were recorded with.</p>
      {startsOn !== "" && startsOn < toIsoDate(new Date()) && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={applyToPast} onChange={(e) => setApplyToPast(e.target.checked)} /><span>Also re-judge attendance already recorded from {startsOn} (late, absent and overtime are worked out again against this shift).</span></label>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || saveMutation.isPending}>Save roster</Button></div>
    </form>
  </Modal>;
}
