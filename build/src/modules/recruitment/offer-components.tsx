import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  Offer,
  OfferPayload,
  approveOffer,
  createOffer,
  fetchRecruitmentFile,
  offerPdfPath,
  rejectOffer,
  respondToOffer,
  saveBlob,
  sendOffer,
  submitOffer,
  updateOffer,
  verifyOfferSignature,
  withdrawOffer,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmModal, FormError, OfferStatusBadge, formatMoney, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });
}

const currencies = ["PKR", "USD", "EUR", "GBP", "AED", "SAR"];

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export function OfferFormModal({ candidate, offer, onClose }: { candidate: { id: number; full_name: string }; offer?: Offer | null; onClose: () => void }) {
  const refresh = useRefresh();
  const [salary, setSalary] = useState(offer ? String(Number(offer.salary)) : "");
  const [currency, setCurrency] = useState(offer?.currency ?? "PKR");
  const [startDate, setStartDate] = useState(offer?.start_date?.slice(0, 10) ?? "");
  const [expiresAt, setExpiresAt] = useState(offer?.expires_at?.slice(0, 10) ?? "");
  const [benefits, setBenefits] = useState<string[]>(offer?.benefits ?? []);
  const [benefitInput, setBenefitInput] = useState("");
  const [terms, setTerms] = useState(offer?.terms ?? "");
  const [notes, setNotes] = useState(offer?.additional_notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: OfferPayload) => (offer ? updateOffer(offer.id, payload) : createOffer({ ...payload, candidate_id: candidate.id })),
    onSuccess: async () => {
      await refresh();
      toast.success(offer ? "Offer updated" : "Offer created", "Submit it for approval when it is ready.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function addBenefit() {
    const value = benefitInput.trim();
    if (value && !benefits.includes(value)) setBenefits((previous) => [...previous, value]);
    setBenefitInput("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = Number(salary);
    if (salary.trim() === "" || Number.isNaN(amount) || amount <= 0) {
      setError("Enter a salary greater than zero.");
      return;
    }

    mutation.mutate({
      salary: amount,
      currency,
      start_date: startDate || null,
      expires_at: expiresAt || null,
      benefits,
      terms: terms.trim() || null,
      additional_notes: notes.trim() || null,
    });
  }

  return (
    <Modal title={`${offer ? "Edit" : "New"} offer — ${candidate.full_name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="offer-salary">Salary</label>
            <FormInput id="offer-salary" type="number" min={0} step="any" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="offer-currency">Currency</label>
            <select id="offer-currency" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="offer-start">Start date</label>
            <FormInput id="offer-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="offer-expires">Offer valid until</label>
            <FormInput id="offer-expires" type="date" value={expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="offer-benefit">Benefits</label>
          <div className="flex gap-2">
            <FormInput
              id="offer-benefit"
              value={benefitInput}
              placeholder="e.g. Health insurance"
              onChange={(e) => setBenefitInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBenefit();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addBenefit}>Add</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {benefits.map((benefit) => (
              <span key={benefit} className="inline-flex items-center gap-1 rounded-full bg-[var(--border)]/50 px-3 py-1 text-xs">
                {benefit}
                <button type="button" aria-label={`Remove ${benefit}`} onClick={() => setBenefits((previous) => previous.filter((item) => item !== benefit))}>×</button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="offer-terms">Terms and conditions</label>
          <textarea id="offer-terms" className={textareaClass} value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="offer-notes">Additional notes</label>
          <textarea id="offer-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : offer ? "Update offer" : "Create offer"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Note prompt (reject / decline)
// ---------------------------------------------------------------------------

function NoteModal({ title, label, required, confirmLabel, busy, onSubmit, onClose }: {
  title: string;
  label: string;
  required: boolean;
  confirmLabel: string;
  busy: boolean;
  onSubmit: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (required && !note.trim()) {
      setError(`${label} is required.`);
      return;
    }
    onSubmit(note.trim());
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="offer-note">{label}</label>
          <textarea id="offer-note" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Working..." : confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Status-aware actions
// ---------------------------------------------------------------------------

type PendingAction = "reject" | "accept" | "decline" | "withdraw" | null;

export function OfferActions({ offer, candidateName, onEdit }: { offer: Offer; candidateName?: string; onEdit?: (offer: Offer) => void }) {
  const refresh = useRefresh();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canEdit = hasPermission("recruitment:edit");
  const canDecide = hasPermission("approvals:approve");
  const [pending, setPending] = useState<PendingAction>(null);

  function run<T>(fn: () => Promise<T>, success: string) {
    return {
      mutationFn: fn,
      onSuccess: async () => {
        await refresh();
        toast.success("Offer updated", success);
        setPending(null);
      },
      onError: (error: Error) => {
        toast.error("Action failed", error.message);
        setPending(null);
      },
    };
  }

  const submitMutation = useMutation(run(() => submitOffer(offer.id), "Submitted for approval."));
  const approveMutation = useMutation(run(() => approveOffer(offer.id), "Offer approved."));
  const sendMutation = useMutation({
    mutationFn: () => sendOffer(offer.id),
    onSuccess: async (sent) => {
      await refresh();
      toast.success(
        "Offer sent",
        sent.candidate_emailed
          ? "The candidate was emailed a private link to read and answer it online."
          : "The email could not be sent. Open the candidate and use Candidate link to share the portal page with them."
      );
    },
    onError: (error: Error) => toast.error("Action failed", error.message),
  });
  const acceptMutation = useMutation(run(() => respondToOffer(offer.id, "accepted"), "Recorded that the candidate accepted."));
  const withdrawMutation = useMutation(run(() => withdrawOffer(offer.id), "Offer withdrawn."));

  const rejectWith = useMutation({
    mutationFn: (note: string) => rejectOffer(offer.id, note),
    onSuccess: async () => {
      await refresh();
      toast.success("Offer rejected", "The creator has been notified.");
      setPending(null);
    },
    onError: (error: Error) => toast.error("Action failed", error.message),
  });

  const declineWith = useMutation({
    mutationFn: (reason: string) => respondToOffer(offer.id, "declined", reason),
    onSuccess: async () => {
      await refresh();
      toast.success("Offer declined", "Recorded that the candidate declined.");
      setPending(null);
    },
    onError: (error: Error) => toast.error("Action failed", error.message),
  });

  async function downloadPdf() {
    try {
      const blob = await fetchRecruitmentFile(offerPdfPath(offer.id));
      saveBlob(blob, `offer-${(candidateName ?? offer.candidate?.full_name ?? "candidate").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
    } catch (error) {
      toast.error("Download failed", (error as Error).message);
    }
  }

  const busy = [submitMutation, approveMutation, sendMutation, acceptMutation, withdrawMutation].some((mutation) => mutation.isPending);
  const status = offer.status;
  const withdrawable = ["draft", "pending_approval", "approved", "rejected", "sent", "accepted"].includes(status) && offer.candidate?.stage !== "hired";

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canEdit && (status === "draft" || status === "rejected") && (
        <>
          {onEdit && <Button variant="outline" disabled={busy} onClick={() => onEdit(offer)}>Edit</Button>}
          <Button disabled={busy} onClick={() => submitMutation.mutate()}>Submit for approval</Button>
        </>
      )}
      {canDecide && status === "pending_approval" && (
        <>
          <Button disabled={busy} onClick={() => approveMutation.mutate()}>Approve</Button>
          <Button variant="outline" disabled={busy} onClick={() => setPending("reject")}>Reject</Button>
        </>
      )}
      {canEdit && status === "approved" && <Button disabled={busy} onClick={() => sendMutation.mutate()}>Send to candidate</Button>}
      {canEdit && status === "sent" && (
        <>
          <span className="self-center text-xs text-[var(--muted)]">Waiting for the candidate to answer online.</span>
          <Button variant="outline" disabled={busy} title="Use only when the candidate answered by phone or on paper" onClick={() => setPending("accept")}>Record acceptance</Button>
          <Button variant="outline" disabled={busy} title="Use only when the candidate answered by phone or on paper" onClick={() => setPending("decline")}>Record decline</Button>
        </>
      )}
      <Button variant="outline" onClick={() => void downloadPdf()}>PDF</Button>
      {canEdit && withdrawable && <Button variant="outline" disabled={busy} onClick={() => setPending("withdraw")}>Withdraw</Button>}

      {pending === "reject" && (
        <NoteModal title="Reject offer" label="Reason" required confirmLabel="Reject offer" busy={rejectWith.isPending} onSubmit={(note) => rejectWith.mutate(note)} onClose={() => setPending(null)} />
      )}
      {pending === "accept" && (
        <ConfirmModal
          title="Record acceptance"
          message="The candidate is meant to accept online. Only record this if they accepted by phone, email or on paper."
          confirmLabel="Record acceptance"
          busy={acceptMutation.isPending}
          onConfirm={() => acceptMutation.mutate()}
          onCancel={() => setPending(null)}
        />
      )}
      {pending === "decline" && (
        <NoteModal title="Candidate declined" label="Reason (optional)" required={false} confirmLabel="Record decline" busy={declineWith.isPending} onSubmit={(note) => declineWith.mutate(note)} onClose={() => setPending(null)} />
      )}
      {pending === "withdraw" && (
        <ConfirmModal
          title="Withdraw offer"
          message="Withdraw this offer? Any pending approval is cancelled. You can create a new offer afterwards."
          confirmLabel="Withdraw"
          busy={withdrawMutation.isPending}
          onConfirm={() => withdrawMutation.mutate()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact summary
// ---------------------------------------------------------------------------

/** Checks the signed offer, its record and its stored letter against the server's seal. */
export function SignatureVerifier({ offerId }: { offerId: number }) {
  const mutation = useMutation({ mutationFn: () => verifyOfferSignature(offerId) });
  const result = mutation.data;

  return (
    <div className="mt-2 space-y-1">
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Checking..." : "Verify signature"}
      </Button>
      {mutation.isError && <p role="alert" className="text-xs text-red-700">{(mutation.error as Error).message}</p>}
      {result && (
        <p role="status" className={`text-xs ${result.valid ? "text-emerald-800" : "font-medium text-red-700"}`}>
          {result.valid
            ? "Verified: the terms, the signature record and the stored letter are exactly as they were when signed."
            : `Not verified. ${result.problems.join(" ")}`}
        </p>
      )}
    </div>
  );
}

export function OfferSummary({ offer }: { offer: Offer }) {
  return (
    <dl className="grid gap-3 text-sm md:grid-cols-3">
      <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</dt><dd className="mt-1"><OfferStatusBadge status={offer.status} /></dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Compensation</dt><dd className="mt-1 font-medium">{formatMoney(offer.salary, offer.currency)}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Start date</dt><dd className="mt-1">{formatRecruitmentDate(offer.start_date)}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Valid until</dt><dd className="mt-1">{formatRecruitmentDate(offer.expires_at)}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Created by</dt><dd className="mt-1">{offer.creator?.name ?? "-"}</dd></div>
      <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Sent</dt><dd className="mt-1">{formatRecruitmentDate(offer.sent_at)}</dd></div>
      {offer.responded_at && (
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Answered</dt>
          <dd className="mt-1">
            {formatRecruitmentDate(offer.responded_at, true)}
            <span className="block text-xs text-[var(--muted)]">
              {offer.responded_via === "portal" ? `Online${offer.response_name ? `, signed by ${offer.response_name}` : ""}` : "Recorded by staff"}
            </span>
          </dd>
        </div>
      )}
      {offer.benefits && offer.benefits.length > 0 && (
        <div className="md:col-span-3"><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Benefits</dt><dd className="mt-1">{offer.benefits.join(" · ")}</dd></div>
      )}
      {offer.signature_record && (
        <div className="md:col-span-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
          <dt className="text-xs font-semibold uppercase tracking-wide">Electronic signature</dt>
          <dd className="mt-1 space-y-0.5 text-xs">
            <p>
              Signed by <strong>{offer.signature_record.name}</strong> on {formatRecruitmentDate(offer.signature_record.signed_at, true)}, after confirming the code emailed to {offer.signature_record.email ?? "their address"}.
            </p>
            <p>IP address {offer.signature_record.ip ?? "unknown"} · document fingerprint <code className="break-all">{offer.signature_record.document_hash}</code></p>
            <p className="italic">"{offer.signature_record.consent}"</p>
            {offer.signature_record.seal && <SignatureVerifier offerId={offer.id} />}
          </dd>
        </div>
      )}
      {offer.approval_note && offer.status === "rejected" && (
        <div className="md:col-span-3 rounded-xl border border-red-300 bg-red-50 p-3 text-red-800"><strong>Rejected:</strong> {offer.approval_note}</div>
      )}
      {offer.decline_reason && (
        <div className="md:col-span-3 rounded-xl border border-[var(--border)] p-3"><strong>Decline reason:</strong> {offer.decline_reason}</div>
      )}
    </dl>
  );
}
