import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/notifications/toast";
import { listShifts } from "@/services/hr-management-service";
import { RotationItem, createRotation, deleteRotation, listRotations, updateRotation } from "@/services/shift-schedule-service";

type Slot = { shift_id: number | null };

export function RotationsTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const rotationsQuery = useQuery({ queryKey: ["shift-rotations"], queryFn: listRotations });
  const shiftsQuery = useQuery({ queryKey: ["hr", "shifts"], queryFn: listShifts });
  const [editing, setEditing] = useState<RotationItem | "new" | null>(null);
  const shiftName = (id: number | null) => (id === null ? "Off" : (shiftsQuery.data ?? []).find((s) => s.id === id)?.name ?? "?");

  const deleteMutation = useMutation({
    mutationFn: deleteRotation,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["shift-rotations"] }); toast.success("Rotation deleted"); },
    onError: (e: Error) => toast.error("Could not delete", e.message)
  });

  return <section className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-[var(--muted)]">A rotation is a repeating pattern of days — a shift or a day off — that people follow from a start date, e.g. 2 mornings, 2 nights, 3 off.</p>
      {canEdit && <Button onClick={() => setEditing("new")}>New rotation</Button>}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {(rotationsQuery.data ?? []).map((rotation) => <article key={rotation.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div><h3 className="font-semibold">{rotation.name}{!rotation.is_active && <span className="ml-2 rounded-full bg-[var(--border)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">Inactive</span>}</h3>
            <p className="text-xs text-[var(--muted)]">{rotation.cycle_days}-day cycle · {rotation.employee_count} {rotation.employee_count === 1 ? "person follows" : "people follow"} it</p></div>
          {canEdit && <div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(rotation)}>Edit</Button><Button variant="outline" onClick={() => { if (window.confirm(`Delete "${rotation.name}"?`)) void deleteMutation.mutateAsync(rotation.id); }}>Delete</Button></div>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">{rotation.slots.map((slot) => <span key={slot.position} className={`rounded-md px-2 py-1 text-xs ${slot.shift_id === null ? "bg-[var(--bg)] text-[var(--muted)]" : "bg-emerald-500/15 text-emerald-600"}`}><span className="opacity-60">{slot.position + 1}.</span> {shiftName(slot.shift_id)}</span>)}</div>
      </article>)}
      {rotationsQuery.data && rotationsQuery.data.length === 0 && <p className="text-sm text-[var(--muted)]">No rotations yet.</p>}
    </div>
    {editing && <RotationModal rotation={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void queryClient.invalidateQueries({ queryKey: ["shift-rotations"] }); void queryClient.invalidateQueries({ queryKey: ["shift-roster"] }); }} />}
  </section>;
}

function RotationModal({ rotation, onClose, onSaved }: { rotation: RotationItem | null; onClose: () => void; onSaved: () => void }) {
  const shiftsQuery = useQuery({ queryKey: ["hr", "shifts"], queryFn: listShifts });
  const [name, setName] = useState(rotation?.name ?? "");
  const [active, setActive] = useState(rotation?.is_active ?? true);
  const [slots, setSlots] = useState<Slot[]>(rotation ? rotation.slots.map((s) => ({ shift_id: s.shift_id })) : []);
  const [blockShift, setBlockShift] = useState<number | null>(null);
  const [blockDays, setBlockDays] = useState(2);
  const shifts = (shiftsQuery.data ?? []).filter((s) => s.is_active || slots.some((slot) => slot.shift_id === s.id));
  const hasWork = slots.some((s) => s.shift_id !== null);
  const valid = name.trim() !== "" && slots.length > 0 && slots.length <= 84 && hasWork;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), is_active: active, slots };
      return rotation ? updateRotation(rotation.id, payload) : createRotation(payload);
    },
    onSuccess: () => { toast.success(rotation ? "Rotation updated" : "Rotation created", rotation ? "Everyone who follows it moves to the new pattern from today." : undefined); onSaved(); },
    onError: (e: Error) => toast.error("Save failed", e.message)
  });

  const addBlock = () => setSlots((cur) => [...cur, ...Array.from({ length: Math.max(1, Math.min(14, blockDays)) }, () => ({ shift_id: blockShift }))].slice(0, 84));
  const move = (index: number, delta: number) => setSlots((cur) => {
    const next = [...cur];
    const target = index + delta;
    if (target < 0 || target >= next.length) return cur;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  return <Modal title={rotation ? "Edit rotation" : "New rotation"} onClose={onClose}>
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (valid) void saveMutation.mutateAsync(); }}>
      <div><label className="mb-1 block font-medium">Name</label><FormInput value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2 days, 2 nights, 3 off" /></div>
      <div>
        <label className="mb-1 block font-medium">Add days to the cycle</label>
        <div className="flex flex-wrap items-center gap-2">
          <FormInput className="w-20" type="number" min={1} max={14} value={blockDays} onChange={(e) => setBlockDays(Number(e.target.value))} />
          <span>day(s) of</span>
          <select className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={blockShift ?? 0} onChange={(e) => setBlockShift(Number(e.target.value) || null)}>
            <option value={0}>Day off</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button type="button" variant="outline" onClick={addBlock}>Add</Button>
        </div>
      </div>
      <div>
        <label className="mb-1 block font-medium">Cycle ({slots.length} {slots.length === 1 ? "day" : "days"}, then it repeats)</label>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
          {slots.length === 0 && <p className="text-[var(--muted)]">Add at least one working day.</p>}
          {slots.map((slot, index) => <div key={index} className="flex items-center gap-2">
            <span className="w-8 text-right text-xs text-[var(--muted)]">{index + 1}.</span>
            <select className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={slot.shift_id ?? 0} onChange={(e) => setSlots((cur) => cur.map((s, i) => (i === index ? { shift_id: Number(e.target.value) || null } : s)))}>
              <option value={0}>Day off</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>)}
            </select>
            <button type="button" aria-label="Move up" className="px-1" onClick={() => move(index, -1)}>↑</button>
            <button type="button" aria-label="Move down" className="px-1" onClick={() => move(index, 1)}>↓</button>
            <button type="button" aria-label="Remove day" className="px-1 text-red-600" onClick={() => setSlots((cur) => cur.filter((_, i) => i !== index))}>✕</button>
          </div>)}
        </div>
        {slots.length > 0 && !hasWork && <p className="mt-1 text-xs text-red-600">A rotation needs at least one working day.</p>}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active (can be given to people)</label>
      {rotation && rotation.employee_count > 0 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600">{rotation.employee_count} {rotation.employee_count === 1 ? "person follows" : "people follow"} this rotation. Changing the cycle moves them from today; days already recorded keep their shift.</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || saveMutation.isPending}>Save</Button></div>
    </form>
  </Modal>;
}
