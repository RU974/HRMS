import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import {
  listDelegations,
  createDelegation,
  deleteDelegation,
} from "@/services/approval-service";

function toDatetimeLocal(ts: string) {
  return new Date(ts).toISOString().slice(0, 16);
}

export function DelegationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [delegateUserId, setDelegateUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const delegationsQuery = useQuery({
    queryKey: ["approval-delegations"],
    queryFn: listDelegations,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: createDelegation,
    onSuccess: () => {
      setDelegateUserId("");
      setStartsAt("");
      setEndsAt("");
      setNotes("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to create delegation."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDelegation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approval-delegations"] }),
  });

  const delegations = delegationsQuery.data ?? [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const userId = Number(delegateUserId);
    if (!userId || !startsAt || !endsAt) {
      setFormError("Delegate user, start date, and end date are required.");
      return;
    }

    createMutation.mutate({
      delegate_user_id: userId,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Delegations" subtitle="Hand off approval duties to a colleague while you're out of office." />

      <Card className="space-y-4 border-[var(--border)]/70 p-5">
        <h2 className="text-lg font-semibold">New delegation</h2>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[var(--text)]">
            Delegate to (user ID)
            <FormInput
              value={delegateUserId}
              onChange={(e) => setDelegateUserId(e.target.value)}
              placeholder="User ID"
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text)]">
            Notes
            <FormInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="mt-1" />
          </label>
          <label className="block text-sm font-medium text-[var(--text)]">
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text)]">
            Ends at
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={createMutation.status === "pending"}>
              {createMutation.status === "pending" ? "Saving…" : "Create delegation"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">Delegate</th>
              <th className="p-3">Starts</th>
              <th className="p-3">Ends</th>
              <th className="p-3">Notes</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {delegationsQuery.isLoading ? (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
            ) : delegations.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">No delegations set up.</td></tr>
            ) : (
              delegations.map((d) => (
                <tr key={d.id} className="border-b border-[var(--border)]/60">
                  <td className="p-3">{d.delegate?.name ?? `User #${d.delegate_user_id}`}</td>
                  <td className="p-3">{toDatetimeLocal(d.starts_at).replace("T", " ")}</td>
                  <td className="p-3">{toDatetimeLocal(d.ends_at).replace("T", " ")}</td>
                  <td className="p-3 text-[var(--muted)]">{d.notes ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button
                      variant="outline"
                      disabled={deleteMutation.status === "pending"}
                      onClick={() => { if (window.confirm("Remove this delegation?")) deleteMutation.mutate(d.id); }}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Button variant="outline" onClick={() => navigate("/approvals")}>Back to approvals</Button>
    </div>
  );
}
