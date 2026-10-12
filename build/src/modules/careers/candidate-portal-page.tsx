import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import {
  PortalOffer,
  PortalView,
  answerPortalTalentPool,
  erasePortalData,
  fetchPortalFile,
  getPortal,
  requestPortalReschedule,
  respondToPortalOffer,
  saveBlob,
  sendPortalMessage,
  sendPortalSigningCode,
  uploadPortalDocument,
  withdrawPortalApplication,
} from "@/services/recruitment-service";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const card = "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5";

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return withTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}

function formatMoney(amount: string | number, currency: string) {
  const value = Number(amount);
  return `${currency} ${Number.isNaN(value) ? amount : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
}

function Shell({ company, children }: { company?: { name?: string | null; logo_url?: string | null }; children: React.ReactNode }) {
  useEffect(() => {
    document.title = company?.name ? `Your application at ${company.name}` : "Your application";
  }, [company?.name]);

  return (
    <div className="min-h-screen bg-[var(--bg,#f8fafc)] text-[var(--text,#0f172a)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          {company?.logo_url && <img src={company.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" />}
          <h1 className="text-xl font-semibold">{company?.name ? `${company.name}` : "Your application"}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">{children}</main>
    </div>
  );
}

export function CandidatePortalPage() {
  const { token = "" } = useParams();
  const query = useQuery({ queryKey: ["candidate-portal", token], queryFn: () => getPortal(token), retry: false, enabled: token.length > 0 });

  if (query.isLoading) return <Shell><p className="text-sm text-[var(--muted)]">Loading your application...</p></Shell>;

  if (query.isError || !query.data) {
    return (
      <Shell>
        <div className={`${card} text-center`}>
          <h2 className="text-lg font-semibold">This link is not valid</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            It may have expired or been replaced by a newer one. Ask for a new link from the company's careers page ("Already applied?") or from the hiring team.
          </p>
        </div>
      </Shell>
    );
  }

  const view = query.data;

  return (
    <Shell company={view.company}>
      <section className={card}>
        <p className="text-sm text-[var(--muted)]">Hello {view.candidate.full_name.split(" ")[0]}, here is where your application for</p>
        <h2 className="text-2xl font-semibold">{view.job.title ?? "the role"}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{[view.job.department, view.job.location, view.applied_at ? `applied ${formatDate(view.applied_at)}` : null].filter(Boolean).join(" · ")}</p>
        <div className="mt-4 rounded-xl bg-[var(--border)]/25 p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</p>
          <p className="text-lg font-semibold" data-testid="portal-status">{view.status.label}</p>
          <p className="text-sm text-[var(--muted)]">{view.status.message}</p>
        </div>
      </section>

      {view.offer && <OfferSection token={token} offer={view.offer} candidateName={view.candidate.full_name} />}

      {view.interviews.length > 0 && (
        <section className={card}>
          <h3 className="mb-3 font-semibold">Upcoming interviews</h3>
          <ul className="space-y-3 text-sm">
            {view.interviews.map((interview, index) => (
              <li key={`${interview.id}-${index}`} className="rounded-xl border border-[var(--border)] p-3">
                <p className="font-medium capitalize">{interview.type} interview</p>
                <p>{formatDate(interview.scheduled_at, true)}{interview.duration_minutes ? ` · ${interview.duration_minutes} minutes` : ""}</p>
                {interview.location && <p className="text-[var(--muted)]">Where: {interview.location}</p>}
                {interview.meeting_link && (
                  <p>
                    <a className="text-[var(--primary)] underline" href={interview.meeting_link} target="_blank" rel="noreferrer noopener">Join online</a>
                  </p>
                )}
                <RescheduleControl token={token} interview={interview} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DocumentsSection token={token} view={view} />

      <MessagesSection token={token} view={view} />

      {view.talent_pool && <TalentPoolSection token={token} pool={view.talent_pool} />}

      {view.timeline.length > 0 && (
        <section className={card}>
          <h3 className="mb-3 font-semibold">Progress</h3>
          <ol className="space-y-2 text-sm">
            {view.timeline.map((event, index) => (
              <li key={`${event.status}-${index}`} className="flex justify-between gap-4 border-b border-[var(--border)]/60 pb-2 last:border-0">
                <span>{event.label}</span>
                <span className="text-[var(--muted)]">{formatDate(event.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <PrivacySection token={token} view={view} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

function OfferSection({ token, offer, candidateName }: { token: string; offer: PortalOffer; candidateName: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"accept" | "decline" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (response: "accepted" | "declined") => respondToPortalOffer(token, response, { name, reason, code, consent }),
    onSuccess: async () => {
      setMode(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const codeMutation = useMutation({
    mutationFn: () => sendPortalSigningCode(token),
    onSuccess: (data) => {
      setSentTo(data.email);
      setError(null);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  async function downloadLetter() {
    try {
      saveBlob(await fetchPortalFile(token, "/offer-pdf"), "offer-letter.pdf");
    } catch (downloadError) {
      setError((downloadError as Error).message);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "accept") {
      if (!name.trim()) return setError("Type your full name to accept the offer.");
      if (!sentTo) return setError("Send yourself the code first, then enter it below.");
      if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your email.");
      if (!consent) return setError("Tick the box to agree to sign electronically.");
      mutation.mutate("accepted");
    } else if (mode === "decline") {
      mutation.mutate("declined");
    }
  }

  const answered = offer.status === "accepted" || offer.status === "declined";

  return (
    <section className={`${card} space-y-4`} aria-labelledby="offer-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="offer-heading" className="font-semibold">Your offer</h3>
        {answered && (
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${offer.status === "accepted" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
            {offer.status === "accepted" ? "You accepted" : "You declined"} on {formatDate(offer.responded_at)}
          </span>
        )}
        {offer.status === "expired" && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Expired</span>}
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Compensation</dt><dd className="mt-1 text-lg font-semibold">{formatMoney(offer.salary, offer.currency)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Start date</dt><dd className="mt-1">{formatDate(offer.start_date)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Please answer by</dt><dd className="mt-1">{offer.expires_at ? formatDate(offer.expires_at) : "No deadline"}</dd></div>
        {offer.benefits.length > 0 && (
          <div className="md:col-span-3"><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Benefits</dt><dd className="mt-1">{offer.benefits.join(" · ")}</dd></div>
        )}
      </dl>
      {offer.terms && <p className="whitespace-pre-wrap rounded-xl bg-[var(--border)]/25 p-3 text-sm">{offer.terms}</p>}
      {offer.additional_notes && <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{offer.additional_notes}</p>}
      {offer.signature && (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Signed electronically by {offer.signature.name} on {formatDate(offer.signature.signed_at, true)}. Document fingerprint: <code className="break-all">{offer.signature.document_hash}</code>
        </p>
      )}

      {error && !mode && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void downloadLetter()}>Download offer letter (PDF)</Button>
        {offer.can_respond && !mode && (
          <>
            <Button onClick={() => { setError(null); setMode("accept"); }}>Accept offer</Button>
            <Button variant="outline" onClick={() => { setError(null); setMode("decline"); }}>Decline offer</Button>
          </>
        )}
      </div>

      {offer.can_respond && mode && (
        <form className="space-y-3 rounded-xl border border-[var(--border)] p-4" onSubmit={submit} noValidate>
          {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {mode === "accept" ? (
            <>
              <p className="text-sm">
                You are accepting this offer of <strong>{formatMoney(offer.salary, offer.currency)}</strong>
                {offer.start_date ? <> starting <strong>{formatDate(offer.start_date)}</strong></> : null}. To make sure it is really you, we email you a one-time code first.
              </p>
              <div className="rounded-xl bg-[var(--border)]/25 p-3 text-sm">
                <p className="font-medium">Step 1. Get your code</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" disabled={codeMutation.isPending} onClick={() => codeMutation.mutate()}>
                    {codeMutation.isPending ? "Sending..." : sentTo ? "Send a new code" : "Email me a code"}
                  </Button>
                  {sentTo && <span className="text-[var(--muted)]">Sent to {sentTo}. It is valid for 15 minutes.</span>}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="accept-code">Step 2. Enter the 6-digit code</label>
                <FormInput id="accept-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="accept-name">Step 3. Type your full name ({candidateName})</label>
                <FormInput id="accept-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{offer.consent_statement ?? "I agree to sign this offer electronically."}</span>
              </label>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="decline-reason">Reason (optional)</label>
              <textarea id="decline-reason" className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { setMode(null); setError(null); }}>Back</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Sending..." : mode === "accept" ? "Sign and accept" : "Confirm decline"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const statusText: Record<PortalView["documents"][number]["status"], string> = {
  requested: "Waiting for you",
  uploaded: "Received, under review",
  verified: "Verified",
  rejected: "Please upload again",
};

function DocumentsSection({ token, view }: { token: string; view: PortalView }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ file, documentId, name }: { file: File; documentId?: number; name?: string }) => uploadPortalDocument(token, file, { documentId, label: name }),
    onSuccess: async () => {
      setLabel("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function choose(documentId: number | null) {
    setError(null);

    if (documentId === null && !label.trim()) {
      setError("Type what the document is first, for example \"National ID\".");
      return;
    }

    setTarget(documentId);
    inputRef.current?.click();
  }

  function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    if (!/\.(pdf|jpe?g|png|docx?)$/i.test(file.name)) return setError("Upload a PDF, image (JPG or PNG) or Word file.");
    if (file.size > MAX_FILE_BYTES) return setError("Files can be at most 5 MB.");

    mutation.mutate(target === null ? { file, name: label.trim() } : { file, documentId: target });
  }

  async function download(documentId: number, name?: string | null) {
    try {
      saveBlob(await fetchPortalFile(token, `/documents/${documentId}/download`), name ?? "document");
    } catch (downloadError) {
      setError((downloadError as Error).message);
    }
  }

  const waiting = view.documents.filter((document) => document.status === "requested" || document.status === "rejected").length;

  return (
    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Documents</h3>
        {waiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">{waiting} waiting for you</span>}
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" aria-label="Choose a file to upload" onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {view.documents.length === 0 && <p className="text-sm text-[var(--muted)]">The team has not asked for any documents yet.</p>}

      <ul className="space-y-2">
        {view.documents.map((document) => (
          <li key={document.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{document.label}</span>
              <span className="text-[var(--muted)]">{statusText[document.status]}</span>
              <div className="ml-auto flex gap-2">
                {document.has_file && <Button variant="outline" onClick={() => void download(document.id, document.original_name)}>Download</Button>}
                {view.can_upload && (document.status === "requested" || document.status === "rejected") && (
                  <Button disabled={mutation.isPending} onClick={() => choose(document.id)}>{document.status === "rejected" ? "Upload again" : "Upload"}</Button>
                )}
              </div>
            </div>
            {document.review_note && <p className="mt-1 text-red-700">{document.review_note}</p>}
          </li>
        ))}
      </ul>

      {view.can_upload ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm font-medium" htmlFor="extra-label">Send another document</label>
            <FormInput id="extra-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Reference letter" />
          </div>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => choose(null)}>{mutation.isPending ? "Uploading..." : "Choose file"}</Button>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">Uploads are closed for this application.</p>
      )}
      <p className="text-xs text-[var(--muted)]">PDF, JPG, PNG or Word files up to 5 MB.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ask to move an interview
// ---------------------------------------------------------------------------

function RescheduleControl({ token, interview }: { token: string; interview: PortalView["interviews"][number] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [proposed, setProposed] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => requestPortalReschedule(token, interview.id, note.trim(), proposed ? [new Date(proposed).toISOString()] : []),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  if (interview.reschedule_requested) {
    return <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">You asked to reschedule. The team will get back to you; the current time stands until they confirm a new one.</p>;
  }

  if (!open) {
    return <div className="mt-2"><Button variant="outline" onClick={() => setOpen(true)}>Ask to reschedule</Button></div>;
  }

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-[var(--border)] p-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!note.trim() && !proposed) return setError("Tell us why, or suggest a better time.");
        mutation.mutate();
      }}
    >
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <label className="block text-xs font-medium" htmlFor={`reschedule-note-${interview.id}`}>Why do you need to move it?</label>
      <textarea id={`reschedule-note-${interview.id}`} className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="block text-xs font-medium" htmlFor={`reschedule-time-${interview.id}`}>A time that suits you (optional)</label>
      <input id={`reschedule-time-${interview.id}`} type="datetime-local" className="h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={proposed} onChange={(e) => setProposed(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Sending..." : "Send request"}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function MessagesSection({ token, view }: { token: string; view: PortalView }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => sendPortalMessage(token, body.trim()),
    onSuccess: async () => {
      setBody("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <section className={`${card} space-y-4`} aria-labelledby="messages-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="messages-heading" className="font-semibold">Messages</h3>
        {view.unread_messages > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">{view.unread_messages} new from the team</span>}
      </div>

      {view.messages.length === 0 && <p className="text-sm text-[var(--muted)]">No messages yet. Write to the hiring team if you have a question.</p>}
      <ul className="space-y-2">
        {view.messages.map((message) => (
          <li key={message.id} className={`max-w-xl rounded-xl border p-3 text-sm ${message.from === "you" ? "ml-auto border-[var(--primary)]/40 bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
            <p className="text-xs text-[var(--muted)]">{message.from === "you" ? "You" : message.author ?? "The hiring team"} · {formatDate(message.at, true)}</p>
            <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ul>

      {view.can_message && (
        <form
          className="space-y-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (body.trim()) mutation.mutate();
          }}
        >
          {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <label className="block text-sm font-medium" htmlFor="portal-message">Write to the hiring team</label>
          <textarea id="portal-message" className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end"><Button type="submit" disabled={mutation.isPending || !body.trim()}>{mutation.isPending ? "Sending..." : "Send message"}</Button></div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Staying on file for future roles
// ---------------------------------------------------------------------------

function TalentPoolSection({ token, pool }: { token: string; pool: NonNullable<PortalView["talent_pool"]> }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (consent: boolean) => answerPortalTalentPool(token, consent),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const text = {
    unconfirmed: "We may keep your details on file to contact you about future roles.",
    pending: "We would like to keep your details on file to contact you about future roles. Is that all right?",
    granted: "You agreed to stay on file for future roles.",
    declined: "You asked us not to keep your details for other roles.",
  }[pool.status];

  return (
    <section className={`${card} space-y-3`} aria-labelledby="pool-heading">
      <h3 id="pool-heading" className="font-semibold">Future roles</h3>
      <p className="text-sm">{text}</p>
      {pool.expires_at && pool.status !== "declined" && <p className="text-xs text-[var(--muted)]">Your details are kept until {formatDate(pool.expires_at)} unless you agree to stay longer.</p>}
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {pool.can_respond && (
        <div className="flex flex-wrap gap-2">
          {pool.status !== "granted" && <Button disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>Yes, keep me on file</Button>}
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>No, do not keep my details</Button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Withdraw and erase
// ---------------------------------------------------------------------------

function PrivacySection({ token, view }: { token: string; view: PortalView }) {
  const queryClient = useQueryClient();
  const [withdrawing, setWithdrawing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [reason, setReason] = useState("");
  const [erased, setErased] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawPortalApplication(token, reason.trim()),
    onSuccess: async () => {
      setWithdrawing(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate-portal", token] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const eraseMutation = useMutation({
    mutationFn: () => erasePortalData(token),
    onSuccess: () => setErased(true),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  if (erased) {
    return <section className={card}><p className="text-sm">Your data has been erased. This link no longer works.</p></section>;
  }

  return (
    <section className={`${card} space-y-4`} aria-labelledby="privacy-heading">
      <h3 id="privacy-heading" className="font-semibold">Your application and your data</h3>
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {view.can_withdraw && !withdrawing && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="min-w-48 flex-1 text-[var(--muted)]">Changed your mind? You can withdraw. Interviews are cancelled and any offer is withdrawn.</p>
          <Button variant="outline" onClick={() => setWithdrawing(true)}>Withdraw my application</Button>
        </div>
      )}
      {withdrawing && (
        <form
          className="space-y-2 rounded-xl border border-[var(--border)] p-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            withdrawMutation.mutate();
          }}
        >
          <label className="block text-sm font-medium" htmlFor="withdraw-reason">Reason (optional)</label>
          <textarea id="withdraw-reason" className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-[var(--muted)]">This closes your application. You can apply again later.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={withdrawMutation.isPending} onClick={() => setWithdrawing(false)}>Keep my application</Button>
            <Button type="submit" disabled={withdrawMutation.isPending}>{withdrawMutation.isPending ? "Withdrawing..." : "Yes, withdraw"}</Button>
          </div>
        </form>
      )}

      {view.status.key !== "hired" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4 text-sm">
          <p className="min-w-48 flex-1 text-[var(--muted)]">You can ask us to erase your name, contact details, resume, documents and messages.</p>
          {!erasing ? (
            <Button variant="outline" onClick={() => setErasing(true)}>Erase my data</Button>
          ) : (
            <div className="flex items-center gap-2">
              <span>This cannot be undone.</span>
              <Button variant="outline" disabled={eraseMutation.isPending} onClick={() => setErasing(false)}>Cancel</Button>
              <Button disabled={eraseMutation.isPending} onClick={() => eraseMutation.mutate()}>{eraseMutation.isPending ? "Erasing..." : "Erase everything"}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
