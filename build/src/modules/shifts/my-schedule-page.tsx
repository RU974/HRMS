import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";
import { ScheduleCell, ShiftSwapItem, cancelSwap, getMySchedule, listColleagues, requestSwap, respondToSwap } from "@/services/shift-schedule-service";
import { SwapStatusBadge, swapSummary } from "./swaps-tab";
import { SOURCE_LABEL, addDays, cellClass, cellLabel, formatDay, formatLongDate, toIsoDate } from "./schedule-utils";

const DAYS = 14;

/** Self-service: my next two weeks, and my shift swaps (ask a colleague, answer a request). */
export function MySchedulePage() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => toIsoDate(new Date()));
  const [asking, setAsking] = useState<string | null>(null);
  const to = addDays(from, DAYS - 1);
  const myEmployeeId = useAuthStore((s) => (s.user as { employee?: { id: number } | null } | null)?.employee?.id);
  const scheduleQuery = useQuery({ queryKey: ["my-schedule", from, to], queryFn: () => getMySchedule({ from, to }) });
  const grid = scheduleQuery.data;
  const row = grid?.employees[0];
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["my-schedule"] }); void queryClient.invalidateQueries({ queryKey: ["shift-swaps"] }); };

  const respondMutation = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) => respondToSwap(id, accept),
    onSuccess: (_, vars) => { toast.success(vars.accept ? "Accepted — it now goes for approval" : "Declined"); refresh(); },
    onError: (e: Error) => toast.error("Could not answer", e.message)
  });
  const cancelMutation = useMutation({
    mutationFn: cancelSwap,
    onSuccess: () => { toast.success("Swap request withdrawn"); refresh(); },
    onError: (e: Error) => toast.error("Could not cancel", e.message)
  });

  const swaps = grid?.swaps ?? [];
  const incoming = swaps.filter((s) => s.status === "pending_peer" && s.counterpart_id === myEmployeeId);
  const others = swaps.filter((s) => !incoming.includes(s));
  const today = toIsoDate(new Date());

  return <div className="space-y-6">
    <PageHeader title="My schedule" subtitle="Your shifts for the next two weeks. Ask a colleague to swap a day from here." />
    {scheduleQuery.isError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{(scheduleQuery.error as Error).message}</p>}

    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" aria-label="Previous two weeks" onClick={() => setFrom(addDays(from, -DAYS))}>←</Button>
        <Button variant="outline" onClick={() => setFrom(today)}>Today</Button>
        <Button variant="outline" aria-label="Next two weeks" onClick={() => setFrom(addDays(from, DAYS))}>→</Button>
        <span className="text-sm text-[var(--muted)]">{formatLongDate(from)} – {formatLongDate(to)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {(grid?.dates ?? []).map((date) => {
          const cell: ScheduleCell | undefined = row?.days[date];
          const d = formatDay(date);
          const holiday = grid?.holidays?.[date];
          if (!cell) return null;
          return <div key={date} className={`rounded-xl border border-[var(--border)] p-3 text-sm ${cellClass(cell)} ${date === today ? "ring-2 ring-[var(--primary)]" : ""}`}>
            <div className="flex items-baseline justify-between"><span className="font-semibold">{d.weekday} {d.day}</span><span className="text-xs opacity-70">{d.month}</span></div>
            <div className="mt-1 font-medium">{cellLabel(cell)}</div>
            {cell.working && cell.start_time && <div className="text-xs opacity-80">{cell.start_time} – {cell.end_time}{cell.overnight ? " (+1 day)" : ""}</div>}
            {holiday && <div className="text-xs text-rose-500">{holiday}</div>}
            <div className="mt-1 text-[10px] uppercase tracking-wide opacity-60">{SOURCE_LABEL[cell.source]}</div>
            {cell.working && date >= today && !cell.on_leave && <button type="button" className="mt-2 text-xs font-medium underline" onClick={() => setAsking(date)}>Ask to swap</button>}
          </div>;
        })}
      </div>
    </section>

    {incoming.length > 0 && <section className="space-y-2">
      <h2 className="text-sm font-semibold">Asked of you</h2>
      {incoming.map((swap) => <article key={swap.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{swapSummary(swap)}</p>{swap.reason && <p className="text-xs text-[var(--muted)]">“{swap.reason}”</p>}</div>
        <div className="flex gap-2">
          <Button disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: swap.id, accept: true })}>Accept</Button>
          <Button variant="outline" disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: swap.id, accept: false })}>Decline</Button>
        </div>
      </article>)}
    </section>}

    <section className="space-y-2">
      <h2 className="text-sm font-semibold">My swaps</h2>
      {others.map((swap: ShiftSwapItem) => <article key={swap.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{swapSummary(swap)}</p>{swap.decision_notes && <p className="text-xs text-[var(--muted)]">Note: {swap.decision_notes}</p>}</div>
        <SwapStatusBadge status={swap.status} />
        {swap.requester_id === myEmployeeId && (swap.status === "pending_peer" || swap.status === "pending_approval") &&
          <Button variant="outline" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(swap.id)}>Withdraw</Button>}
      </article>)}
      {others.length === 0 && <p className="text-sm text-[var(--muted)]">You have no swaps.</p>}
    </section>

    {asking && <AskSwapModal date={asking} onClose={() => setAsking(null)} onSaved={() => { setAsking(null); refresh(); }} />}
  </div>;
}

function AskSwapModal({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const colleagues = useQuery({ queryKey: ["shift-swaps", "colleagues"], queryFn: () => listColleagues(false) });
  const [colleagueId, setColleagueId] = useState(0);
  const [otherDate, setOtherDate] = useState("");
  const [reason, setReason] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => requestSwap({ counterpart_id: colleagueId, requester_date: date, counterpart_date: otherDate || date, reason: reason || null }),
    onSuccess: () => { toast.success("Swap requested", "Your colleague has been asked. A manager approves it after they accept."); onSaved(); },
    onError: (e: Error) => toast.error("Could not request the swap", e.message)
  });

  return <Modal title={`Swap ${formatLongDate(date)}`} onClose={onClose}>
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (colleagueId > 0) void saveMutation.mutateAsync(); }}>
      <div><label className="mb-1 block font-medium">Colleague</label>
        <select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={colleagueId} onChange={(e) => setColleagueId(Number(e.target.value))}>
          <option value={0}>Select a colleague</option>{(colleagues.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div><label className="mb-1 block font-medium">Their day you will cover (optional)</label><FormInput type="date" min={toIsoDate(new Date())} value={otherDate} onChange={(e) => setOtherDate(e.target.value)} />
        <p className="mt-1 text-xs text-[var(--muted)]">Leave empty to exchange shifts on the same day. Pick another date if they cover your day and you cover theirs — you both need to be off on the other's day.</p></div>
      <div><label className="mb-1 block font-medium">Reason (optional)</label><FormInput value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={colleagueId === 0 || saveMutation.isPending}>Send request</Button></div>
    </form>
  </Modal>;
}
