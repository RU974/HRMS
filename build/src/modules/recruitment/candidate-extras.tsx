import { FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  Candidate,
  CandidateDocument,
  CandidateMessage,
  DocumentStatus,
  RescheduleRequest,
  TalentPool,
  addToTalentPool,
  declineRescheduleRequest,
  eraseCandidate,
  listCandidateMessages,
  mergeCandidates,
  requestTalentPoolConsent,
  sendCandidateMessage,
  candidateDocumentPath,
  considerForJob,
  createPortalLink,
  deleteCandidateDocument,
  fetchRecruitmentFile,
  listJobOpenings,
  removeFromTalentPool,
  requestCandidateDocuments,
  reviewCandidateDocument,
  saveBlob,
  uploadCandidateDocument,
  PortalLink,
} from "@/services/recruitment-service";
import { Badge, ConfirmModal, FormError, NoteModal, StageBadge, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });
}

// ---------------------------------------------------------------------------
// Candidate portal link
// ---------------------------------------------------------------------------

export function PortalLinkModal({ candidate, onClose }: { candidate: Pick<Candidate, "id" | "full_name">; onClose: () => void }) {
  const [link, setLink] = useState<PortalLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createPortalLink(candidate.id),
    onSuccess: setLink,
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copied", "Paste it into a message to the candidate.");
    } catch {
      toast.error("Could not copy", "Select the link and copy it by hand.");
    }
  }

  return (
    <Modal title={`Candidate link for ${candidate.full_name}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <FormError message={error} />
        <p className="text-[var(--muted)]">
          The link opens a private page where the candidate can follow their application, accept or decline an offer, and upload documents. They need no account.
        </p>
        {link ? (
          <>
            <input readOnly aria-label="Candidate portal link" className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs" value={link.url} onFocus={(e) => e.currentTarget.select()} />
            <p className="text-xs text-[var(--muted)]">Valid until {formatRecruitmentDate(link.expires_at)}. Anyone with the link can open the page, so share it only with the candidate.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => void copy()}>Copy link</Button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">Creating a link replaces any link sent to this candidate earlier, which will stop working.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Creating..." : "Create link"}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Talent pool
// ---------------------------------------------------------------------------

const poolLabels: Record<TalentPool, string> = { silver_medalist: "Silver medalist", general: "Talent pool" };

export function TalentPoolPanel({ candidate, canEdit }: { candidate: Candidate; canEdit: boolean }) {
  const refresh = useRefresh();
  const [adding, setAdding] = useState(false);
  const [considering, setConsidering] = useState(false);
  const [pool, setPool] = useState<TalentPool>("silver_medalist");
  const [note, setNote] = useState("");

  const addMutation = useMutation({
    mutationFn: () => addToTalentPool(candidate.id, pool, note.trim()),
    onSuccess: async () => {
      await refresh();
      toast.success("Added to the talent pool", `${candidate.full_name} will show up when you search the pool.`);
      setAdding(false);
      setNote("");
    },
    onError: (error: Error) => toast.error("Could not add to the pool", error.message),
  });

  const consentMutation = useMutation({
    mutationFn: () => requestTalentPoolConsent(candidate.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Request sent", "They can answer from their candidate page. The link in the email replaces any older link.");
    },
    onError: (error: Error) => toast.error("Could not send the request", error.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeFromTalentPool(candidate.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Removed from the talent pool");
    },
    onError: (error: Error) => toast.error("Could not remove from the pool", error.message),
  });

  if (candidate.stage === "hired") return null;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Talent pool</h3>
        {candidate.talent_pool ? <Badge tone="violet">{poolLabels[candidate.talent_pool]}</Badge> : <span className="text-[var(--muted)]">Not in a pool</span>}
        {candidate.talent_pool_added_at && <span className="text-xs text-[var(--muted)]">since {formatRecruitmentDate(candidate.talent_pool_added_at)}</span>}
        <ConsentBadge consent={candidate.pool_consent} />
      </div>
      {candidate.talent_pool_note && <p className="text-[var(--muted)]">{candidate.talent_pool_note}</p>}
      {candidate.talent_pool && (
        <p className="text-xs text-[var(--muted)]">
          {candidate.talent_pool_expires_at ? `Stays on file until ${formatRecruitmentDate(candidate.talent_pool_expires_at)} unless they agree to stay longer.` : "No retention limit is set for this company."}
        </p>
      )}
      {candidate.pool_consent === "declined" && <p className="text-xs text-red-700">This person asked not to be kept on file or contacted about other roles.</p>}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {candidate.talent_pool ? (
            <>
              <Button variant="outline" onClick={() => setConsidering(true)}>Consider for another job</Button>
              {candidate.pool_consent !== "granted" && (
                <Button variant="outline" disabled={consentMutation.isPending} onClick={() => consentMutation.mutate()}>
                  {consentMutation.isPending ? "Sending..." : candidate.pool_consent === "pending" ? "Ask again" : "Ask to stay on file"}
                </Button>
              )}
              <Button variant="outline" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate()}>Remove from pool</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setAdding(true)}>Add to talent pool</Button>
          )}
        </div>
      )}

      {adding && (
        <Modal title={`Add ${candidate.full_name} to the talent pool`} onClose={() => setAdding(false)}>
          <form
            className="space-y-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              addMutation.mutate();
            }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="pool-kind">Pool</label>
              <select id="pool-kind" className={selectClass} value={pool} onChange={(e) => setPool(e.target.value as TalentPool)}>
                <option value="silver_medalist">Silver medalist (a strong finalist who just missed out)</option>
                <option value="general">General talent pool</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="pool-note">Why keep them? (optional)</label>
              <FormInput id="pool-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great culture fit, revisit for senior roles" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending}>{addMutation.isPending ? "Adding..." : "Add"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {considering && <ConsiderForJobModal candidate={candidate} onClose={() => setConsidering(false)} />}
    </div>
  );
}

const consentText = { unconfirmed: "Consent not confirmed", pending: "Waiting for their answer", granted: "Agreed to stay on file", declined: "Declined" } as const;
const consentTone = { unconfirmed: "slate", pending: "amber", granted: "emerald", declined: "red" } as const;

export function ConsentBadge({ consent }: { consent?: Candidate["pool_consent"] }) {
  if (!consent) return null;
  return <Badge tone={consentTone[consent]}>{consentText[consent]}</Badge>;
}

export function ConsiderForJobModal({ candidate, onClose }: { candidate: Pick<Candidate, "id" | "full_name" | "job_opening_id">; onClose: () => void }) {
  const refresh = useRefresh();
  const [jobId, setJobId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const jobsQuery = useQuery({ queryKey: ["recruitment", "jobs", "candidate-options"], queryFn: () => listJobOpenings() });
  const jobs = (jobsQuery.data?.data ?? []).filter((job) => job.status === "open" && job.id !== candidate.job_opening_id);

  const mutation = useMutation({
    mutationFn: () => considerForJob(candidate.id, Number(jobId)),
    onSuccess: async (created) => {
      await refresh();
      toast.success("Put forward", `${candidate.full_name} now has an application for ${created.job_opening?.title ?? "that job"}.`);
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <Modal title={`Put ${candidate.full_name} forward`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!jobId) return setError("Choose a job.");
          setError(null);
          mutation.mutate();
        }}
      >
        <FormError message={error} />
        <p className="text-sm text-[var(--muted)]">A new application starts at "Applied" with their details and resume. The original application is left as it is.</p>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="consider-job">Job</label>
          <select id="consider-job" className={selectClass} value={jobId} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Select an open job</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Working..." : "Put forward"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Other applications by the same person
// ---------------------------------------------------------------------------

export function DuplicatesPanel({ candidate, canMerge = false }: { candidate: Candidate; canMerge?: boolean }) {
  const duplicates = candidate.duplicates ?? [];
  const [merging, setMerging] = useState(false);
  const merged = candidate.merged_from ?? [];

  if (duplicates.length === 0 && merged.length === 0) return null;

  return (
    <div className="space-y-3">
      {duplicates.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Also applied elsewhere</h3>
            {canMerge && <Button variant="outline" className="ml-auto" onClick={() => setMerging(true)}>Merge into this record</Button>}
          </div>
          <p className="text-xs">These applications share this candidate's email address or phone number.</p>
          <ul className="space-y-1">
            {duplicates.map((other) => (
              <li key={other.id} className="flex flex-wrap items-center gap-2">
                <Link className="font-medium underline" to={`/recruitment/candidates/${other.id}`}>{other.job_title ?? "Another job"}</Link>
                <StageBadge stage={other.stage} />
                <span className="text-xs">matched on {other.matched_on} · applied {formatRecruitmentDate(other.applied_at)}</span>
                {other.talent_pool && <Badge tone="violet">{poolLabels[other.talent_pool]}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {merged.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted)]">
          <p className="font-medium text-[var(--text)]">Merged applications</p>
          <ul className="mt-1 space-y-0.5">
            {merged.map((entry) => (
              <li key={`${entry.id}-${entry.merged_at}`}>{entry.job_title ?? "Another job"} ({entry.stage}) merged on {formatRecruitmentDate(entry.merged_at)}</li>
            ))}
          </ul>
        </div>
      )}
      {merging && <MergeCandidatesModal candidate={candidate} onClose={() => setMerging(false)} />}
    </div>
  );
}

export function MergeCandidatesModal({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const refresh = useRefresh();
  const mergeable = (candidate.duplicates ?? []).filter((other) => other.stage !== "hired");
  const [chosen, setChosen] = useState<Set<number>>(new Set(mergeable.map((other) => other.id)));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => mergeCandidates(candidate.id, [...chosen]),
    onSuccess: async () => {
      await refresh();
      toast.success("Applications merged", "Their interviews, notes, documents and history now sit on this record.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function toggle(id: number) {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal title={`Merge duplicates into ${candidate.full_name}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <FormError message={error} />
        <p>
          The applications you tick are folded into <strong>this</strong> record ({candidate.job_opening?.title ?? "this job"}) and then removed. Their interviews, notes, documents, offers and history move here; missing contact details,
          tags and skills are filled in. This cannot be undone.
        </p>
        {mergeable.length === 0 && <p className="text-[var(--muted)]">Hired applications cannot be merged away.</p>}
        <ul className="space-y-2">
          {mergeable.map((other) => (
            <li key={other.id}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={chosen.has(other.id)} onChange={() => toggle(other.id)} />
                <span className="font-medium">{other.job_title ?? "Another job"}</span>
                <StageBadge stage={other.stage} />
                <span className="text-xs text-[var(--muted)]">matched on {other.matched_on}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="button" disabled={chosen.size === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Merging..." : `Merge ${chosen.size} application${chosen.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Messages with the candidate
// ---------------------------------------------------------------------------

export function MessagesTab({ candidate, canEdit }: { candidate: Candidate; canEdit: boolean }) {
  const refresh = useRefresh();
  const [body, setBody] = useState("");

  const messagesQuery = useQuery({
    queryKey: ["recruitment", "candidate-messages", candidate.id],
    queryFn: () => listCandidateMessages(candidate.id),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendCandidateMessage(candidate.id, body.trim()),
    onSuccess: async () => {
      setBody("");
      await refresh();
      toast.success("Message sent", "The candidate was emailed and can reply from their candidate page.");
    },
    onError: (error: Error) => toast.error("Could not send the message", error.message),
  });

  const messages: CandidateMessage[] = messagesQuery.data ?? [];

  return (
    <div className="space-y-4">
      {messagesQuery.isError && <FormError message={(messagesQuery.error as Error).message} />}
      {messagesQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading messages...</p>}
      {!messagesQuery.isLoading && messages.length === 0 && <p className="text-sm text-[var(--muted)]">No messages yet. Candidates can write to the team from their candidate page.</p>}

      <ul className="space-y-3">
        {messages.map((message) => (
          <li key={message.id} className={`max-w-xl rounded-xl border p-3 text-sm ${message.direction === "candidate" ? "border-[var(--border)]" : "ml-auto border-[var(--primary)]/40 bg-[var(--primary)]/5"}`}>
            <p className="text-xs text-[var(--muted)]">
              {message.direction === "candidate" ? candidate.full_name : message.author?.name ?? "The team"} · {formatRecruitmentDate(message.created_at, true)}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ul>

      {canEdit && !candidate.anonymized_at && (
        <form
          className="space-y-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (body.trim()) sendMutation.mutate();
          }}
        >
          <label className="text-sm font-medium" htmlFor="candidate-message">Write to {candidate.full_name.split(" ")[0]}</label>
          <textarea id="candidate-message" className={textareaClass} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="They are emailed this message and can reply from their candidate page." />
          <div className="flex justify-end"><Button type="submit" disabled={sendMutation.isPending || !body.trim()}>{sendMutation.isPending ? "Sending..." : "Send message"}</Button></div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reschedule requests
// ---------------------------------------------------------------------------

export function RescheduleRequestsPanel({ requests, canEdit }: { requests: RescheduleRequest[]; canEdit: boolean }) {
  const refresh = useRefresh();
  const [declining, setDeclining] = useState<RescheduleRequest | null>(null);

  const declineMutation = useMutation({
    mutationFn: ({ request, note }: { request: RescheduleRequest; note: string }) => declineRescheduleRequest(request.id, note),
    onSuccess: async () => {
      await refresh();
      toast.success("Request declined", "The candidate was told the original time stands.");
      setDeclining(null);
    },
    onError: (error: Error) => toast.error("Could not decline the request", error.message),
  });

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <h3 className="font-semibold">The candidate asked to move an interview</h3>
      <ul className="space-y-3">
        {requests.map((request) => (
          <li key={request.id} className="space-y-1">
            <p>
              <span className="font-medium capitalize">{request.interview?.interview_type ?? "Interview"}</span> on {formatRecruitmentDate(request.interview?.scheduled_at, true)}
            </p>
            {request.note && <p>"{request.note}"</p>}
            {request.proposed_times && request.proposed_times.length > 0 && (
              <p className="text-xs">Suggested: {request.proposed_times.map((time) => formatRecruitmentDate(time, true)).join(" · ")}</p>
            )}
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs">Change the interview time to approve this request.</span>
                <Button variant="outline" onClick={() => setDeclining(request)}>Decline</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {declining && (
        <NoteModal
          title="Decline the request"
          label="Message to the candidate"
          placeholder="The panel is only available then."
          submitLabel="Decline"
          busy={declineMutation.isPending}
          onSubmit={(note) => declineMutation.mutate({ request: declining, note })}
          onCancel={() => setDeclining(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Erase personal data
// ---------------------------------------------------------------------------

export function ErasePanel({ candidate }: { candidate: Candidate }) {
  const refresh = useRefresh();
  const [confirming, setConfirming] = useState(false);

  const eraseMutation = useMutation({
    mutationFn: () => eraseCandidate(candidate.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Data erased", "Everything that identifies this person was removed.");
      setConfirming(false);
    },
    onError: (error: Error) => {
      toast.error("Could not erase the data", error.message);
      setConfirming(false);
    },
  });

  if (candidate.anonymized_at) {
    return <p className="rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--muted)]">This person's data was erased on {formatRecruitmentDate(candidate.anonymized_at)}. Only anonymous pipeline records remain.</p>;
  }

  if (candidate.stage === "hired" || candidate.employee_id) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Privacy</p>
        <p className="text-xs text-[var(--muted)]">Erase their name, contact details, resume, documents, notes and messages when they ask to be forgotten. Pipeline counts are kept without any personal data.</p>
      </div>
      <Button variant="outline" onClick={() => setConfirming(true)}>Erase personal data</Button>
      {confirming && (
        <ConfirmModal
          title="Erase personal data"
          message={`Permanently erase everything that identifies ${candidate.full_name}? This cannot be undone.`}
          confirmLabel="Erase"
          busy={eraseMutation.isPending}
          onConfirm={() => eraseMutation.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const documentTone: Record<DocumentStatus, "slate" | "blue" | "emerald" | "red"> = { requested: "slate", uploaded: "blue", verified: "emerald", rejected: "red" };

export function DocumentsTab({ candidate, canEdit }: { candidate: Candidate; canEdit: boolean }) {
  const refresh = useRefresh();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<CandidateDocument | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [rejecting, setRejecting] = useState<CandidateDocument | null>(null);
  const [removing, setRemoving] = useState<CandidateDocument | null>(null);
  const [labelFor, setLabelFor] = useState<File | null>(null);

  const documents = candidate.documents ?? [];

  const uploadMutation = useMutation({
    mutationFn: ({ file, document, label }: { file: File; document: CandidateDocument | null; label?: string }) =>
      uploadCandidateDocument(candidate.id, file, { documentId: document?.id, label }),
    onSuccess: async () => {
      await refresh();
      toast.success("Document uploaded");
      setLabelFor(null);
    },
    onError: (error: Error) => toast.error("Upload failed", error.message),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ document, status, note }: { document: CandidateDocument; status: "verified" | "rejected"; note?: string }) =>
      reviewCandidateDocument(candidate.id, document.id, status, note),
    onSuccess: async (_data, { status }) => {
      await refresh();
      toast.success(status === "verified" ? "Document verified" : "Document rejected", status === "rejected" ? "The candidate can upload a replacement." : undefined);
      setRejecting(null);
    },
    onError: (error: Error) => toast.error("Could not review the document", error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (document: CandidateDocument) => deleteCandidateDocument(candidate.id, document.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Document removed");
      setRemoving(null);
    },
    onError: (error: Error) => {
      toast.error("Could not remove the document", error.message);
      setRemoving(null);
    },
  });

  function pickFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    if (!/\.(pdf|jpe?g|png|docx?)$/i.test(file.name)) return toast.error("Unsupported file", "Upload a PDF, image or Word file.");
    if (file.size > MAX_FILE_BYTES) return toast.error("File too large", "Documents can be at most 5 MB.");

    if (uploadFor) {
      uploadMutation.mutate({ file, document: uploadFor });
      setUploadFor(null);
    } else {
      setLabelFor(file);
    }
  }

  async function download(document: CandidateDocument) {
    try {
      saveBlob(await fetchRecruitmentFile(candidateDocumentPath(candidate.id, document.id)), document.original_name ?? document.label);
    } catch (error) {
      toast.error("Download failed", (error as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" aria-label="Upload document" onChange={(e) => pickFile(e.target.files?.[0])} />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[var(--muted)]">Ask for documents (ID, degree, references) and review what the candidate uploads from their portal.</p>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => { setUploadFor(null); inputRef.current?.click(); }}>Upload a document</Button>
            <Button onClick={() => setRequestOpen(true)}>Request documents</Button>
          </div>
        )}
      </div>

      {documents.length === 0 && <p className="text-sm text-[var(--muted)]">No documents requested or uploaded yet.</p>}

      <ul className="space-y-2">
        {documents.map((document) => (
          <li key={document.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{document.label}</span>
              <Badge tone={documentTone[document.status]}>{document.status}</Badge>
              {document.has_file && (
                <span className="text-xs text-[var(--muted)]">
                  {document.original_name} · {document.uploaded_by_type === "candidate" ? "uploaded by the candidate" : "uploaded by staff"} {formatRecruitmentDate(document.uploaded_at, true)}
                </span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                {document.has_file && <Button variant="outline" onClick={() => void download(document)}>Download</Button>}
                {canEdit && document.status === "uploaded" && (
                  <>
                    <Button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ document, status: "verified" })}>Verify</Button>
                    <Button variant="outline" disabled={reviewMutation.isPending} onClick={() => setRejecting(document)}>Reject</Button>
                  </>
                )}
                {canEdit && (document.status === "requested" || document.status === "rejected") && (
                  <Button variant="outline" onClick={() => { setUploadFor(document); inputRef.current?.click(); }}>Upload for them</Button>
                )}
                {canEdit && <Button variant="outline" onClick={() => setRemoving(document)}>Remove</Button>}
              </div>
            </div>
            {document.review_note && <p className="mt-1 text-xs text-[var(--muted)]">Review note: {document.review_note}</p>}
          </li>
        ))}
      </ul>

      {requestOpen && <RequestDocumentsModal candidate={candidate} onClose={() => setRequestOpen(false)} />}
      {labelFor && <LabelModal file={labelFor} busy={uploadMutation.isPending} onSubmit={(label) => uploadMutation.mutate({ file: labelFor, document: null, label })} onCancel={() => setLabelFor(null)} />}
      {rejecting && (
        <NoteModal
          title={`Reject "${rejecting.label}"`}
          label="What is wrong with it?"
          placeholder="The candidate sees this and can upload a replacement."
          submitLabel="Reject document"
          required
          busy={reviewMutation.isPending}
          onSubmit={(note) => reviewMutation.mutate({ document: rejecting, status: "rejected", note })}
          onCancel={() => setRejecting(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          title="Remove document"
          message={`Remove "${removing.label}"${removing.has_file ? " and delete its file" : ""}? This cannot be undone.`}
          confirmLabel="Remove"
          busy={removeMutation.isPending}
          onConfirm={() => removeMutation.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function LabelModal({ file, busy, onSubmit, onCancel }: { file: File; busy: boolean; onSubmit: (label: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(file.name.replace(/\.[^.]+$/, ""));

  return (
    <Modal title="What is this document?" onClose={onCancel}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (label.trim()) onSubmit(label.trim());
        }}
      >
        <p className="text-sm text-[var(--muted)]">{file.name}</p>
        <FormInput aria-label="Document name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="National ID" autoFocus />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !label.trim()}>{busy ? "Uploading..." : "Upload"}</Button>
        </div>
      </form>
    </Modal>
  );
}

const suggestions = ["National ID", "Degree certificate", "Experience letter", "Reference letter", "Passport photo"];

function RequestDocumentsModal({ candidate, onClose }: { candidate: Pick<Candidate, "id" | "full_name">; onClose: () => void }) {
  const refresh = useRefresh();
  const [chosen, setChosen] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (labels: string[]) => requestCandidateDocuments(candidate.id, labels, notify),
    onSuccess: async (data) => {
      await refresh();
      if (data.created === 0) toast.info("Nothing new to request", "Those documents were already requested.");
      else toast.success("Documents requested", data.emailed ? `${candidate.full_name} was emailed a link to upload them.` : "Share the candidate link so they can upload them.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function toggle(label: string) {
    setChosen((previous) => (previous.includes(label) ? previous.filter((item) => item !== label) : [...previous, label]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const labels = [...chosen, ...custom.split(",").map((item) => item.trim()).filter(Boolean)];
    if (labels.length === 0) return setError("Choose or type at least one document.");
    if (labels.length > 10) return setError("Request at most 10 documents at a time.");
    setError(null);
    mutation.mutate(labels);
  }

  return (
    <Modal title={`Request documents from ${candidate.full_name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={chosen.includes(label)}
              onClick={() => toggle(label)}
              className={`rounded-full border px-3 py-1 text-sm ${chosen.includes(label) ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="doc-custom">Others (comma separated)</label>
          <FormInput id="doc-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Police clearance, Salary slips" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email the candidate a link to upload them (replaces any earlier link)
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Requesting..." : "Request"}</Button>
        </div>
      </form>
    </Modal>
  );
}
