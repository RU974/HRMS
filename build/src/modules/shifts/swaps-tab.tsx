import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/notifications/toast";
import { ShiftSwapItem, cancelSwap, decideSwap, listColleagues, listSwaps, requestSwap } from "@/services/shift-schedule-service";
import { SWAP_STATUS_LABEL, formatLongDate, toIsoDate } from "./schedule-utils";

const STATUS_TONE: Record<string, string> = {
  pending_peer: "bg-amber-500/15 text-amber-600",
  pending_approval: "bg-sky-500/15 text-sky-600",
  approved: "bg-emerald-500/15 text-emerald-600",
  rejected: "bg-red-500/15 text-red-600",
  cancelled: "bg-[var(--border)] text-[var(--muted)]"
};

export function SwapStatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? ""}`}>{SWAP_STATUS_LABEL[status] ?? status}</span>;
}

export function swapSummary(swap: ShiftSwapItem) {
  const same = swap.requester_date === swap.counterpart_date;
  return same
    ? `${swap.requester?.name ?? "?"} and ${swap.counterpart?.name ?? "?"} exchange shifts on ${formatLongDate(swap.requester_date)}`
    : `${swap.counterpart?.name ?? "?"} covers ${formatLongDate(swap.requester_date)} for ${swap.requester?.name ?? "?"}, who covers ${formatLongDate(swap.counterpart_date)}`;
}

/** The review queue for HR / managers: who wants to swap, and the decision. */
export function SwapsTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [arranging, setArranging] = useState(false);
  const swapsQuery = useQuery({ queryKey: ["shift-swaps", "review", filter], queryFn: () => listSwaps(filter) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["shift-swaps"] }); void queryClient.invalidateQueries({ queryKey: ["shift-roster"] }); };

  const decideMutation = useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) => decideSwap(id, approve),
    onSuccess: (_, vars) => { toast.success(vars.approve ? "Swap approved" : "Swap rejected"); refresh(); },
    onError: (e: Error) => toast.error("Could not decide", e.message)
  });
  const cancelMutation = useMutation({
    mutationFn: cancelSwap,
    onSuccess: () => { toast.success("Swap cancelled"); refresh(); },
    onError: (e: Error) => toast.error("Could not cancel", e.message)
  });

  const today = toIsoDate(new Date());
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        {(["pending", "all"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`h-9 rounded-lg border px-3 text-sm ${filter === key ? "border-transparent bg-[var(--primary,#2563eb)] text-white" : "border-[var(--border)] text-[var(--muted)]"}`}>{key === "pending" ? "Waiting for approval" : "All swaps"}</button>)}
      </div>
      {canEdit && <Button onClick={() => setArranging(true)}>Arrange a swap</Button>}
    </div>
    <div className="space-y-2">
      {(swapsQuery.data ?? []).map((swap) => <article key={swap.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{swapSummary(swap)}</p>
          {swap.reason && <p className="text-xs text-[var(--muted)]">“{swap.reason}”</p>}
          {swap.decision_notes && <p className="text-xs text-[var(--muted)]">Note: {swap.decision_notes}</p>}
        </div>
        <SwapStatusBadge status={swap.status} />
        <div className="flex gap-2">
          {swap.status === "pending_approval" && <>
            <Button disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: swap.id, approve: true })}>Approve</Button>
            <Button variant="outline" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: swap.id, approve: false })}>Reject</Button>
          </>}
          {(swap.status === "pending_peer" || (swap.status === "approved" && swap.requester_date >= today && swap.counterpart_date >= today)) &&
            <Button variant="outline" disabled={cancelMutation.isPending} onClick={() => { if (window.confirm("Cancel this swap?")) cancelMutation.mutate(swap.id); }}>Cancel</Button>}
        </div>
      </article>)}
      {swapsQuery.data && swapsQuery.data.length === 0 && <p className="text-sm text-[var(--muted)]">{filter === "pending" ? "Nothing is waiting for approval." : "No swaps yet."}</p>}
      {swapsQuery.isError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{(swapsQuery.error as Error).message}</p>}
    </div>
    {arranging && <ArrangeSwapModal onClose={() => setArranging(false)} onSaved={() => { setArranging(false); refresh(); }} />}
  </section>;
}

/** HR arranges a swap between two people; it is approved straight away. */
function ArrangeSwapModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const people = useQuery({ queryKey: ["shift-swaps", "people"], queryFn: () => listColleagues(true) });
  const [requesterId, setRequesterId] = useState(0);
  const [counterpartId, setCounterpartId] = useState(0);
  const [requesterDate, setRequesterDate] = useState(toIsoDate(new Date()));
  const [counterpartDate, setCounterpartDate] = useState("");
  const [reason, setReason] = useState("");
  const valid = requesterId > 0 && counterpartId > 0 && requesterId !== counterpartId && requesterDate !== "";

  const saveMutation = useMutation({
    mutationFn: () => requestSwap({ requester_id: requesterId, counterpart_id: counterpartId, requester_date: requesterDate, counterpart_date: counterpartDate || requesterDate, reason: reason || null, auto_approve: true }),
    onSuccess: () => { toast.success("Swap arranged"); onSaved(); },
    onError: (e: Error) => toast.error("Could not arrange the swap", e.message)
  });
  const select = (value: number, set: (n: number) => void) => <select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2" value={value} onChange={(e) => set(Number(e.target.value))}><option value={0}>Select employee</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;

  return <Modal title="Arrange a swap" onClose={onClose}>
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (valid) void saveMutation.mutateAsync(); }}>
      <div><label className="mb-1 block font-medium">First person</label>{select(requesterId, setRequesterId)}</div>
      <div><label className="mb-1 block font-medium">Second person</label>{select(counterpartId, setCounterpartId)}</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1 block font-medium">Day the first person gives</label><FormInput type="date" value={requesterDate} onChange={(e) => setRequesterDate(e.target.value)} /></div>
        <div><label className="mb-1 block font-medium">Day the second gives</label><FormInput type="date" value={counterpartDate} onChange={(e) => setCounterpartDate(e.target.value)} /></div>
      </div>
      <p className="text-xs text-[var(--muted)]">Same day (or the second left empty): they exchange shifts that day. Different days: each covers the other's day and must be free on it.</p>
      <div><label className="mb-1 block font-medium">Reason (optional)</label><FormInput value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || saveMutation.isPending}>Arrange</Button></div>
    </form>
  </Modal>;
}
