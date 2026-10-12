import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  Candidate,
  Interview,
  Offer,
  addCandidateNote,
  candidateResumePath,
  deleteCandidateNote,
  deleteCandidateResume,
  fetchRecruitmentFile,
  getCandidate,
  reparseCandidateResume,
  saveBlob,
  uploadCandidateResume,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { BulkActionModal } from "./bulk-components";
import { CandidateFormModal, HireModal, RejectModal } from "./candidate-components";
import { ChecksTab, PipelineStepper, ScreeningAnswersPanel, SourcePanel, StageMover } from "./candidate-pipeline-parts";
import { DocumentsTab, DuplicatesPanel, ErasePanel, MessagesTab, PortalLinkModal, RescheduleRequestsPanel, TalentPoolPanel } from "./candidate-extras";
import { FitBadge, FitPanel, ResumeReviewNotice } from "./fit-components";
import { InterviewFormModal } from "./interview-components";
import { OfferActions, OfferFormModal, OfferSummary } from "./offer-components";
import { Badge, ConfirmModal, RecruitmentSubnav, StageBadge, formatMoney, formatRecruitmentDate, textareaClass } from "./shared";

type Tab = "overview" | "resume" | "interviews" | "documents" | "checks" | "messages" | "notes" | "offer" | "timeline";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "resume", label: "Resume" },
  { id: "interviews", label: "Interviews" },
  { id: "documents", label: "Documents" },
  { id: "checks", label: "Checks" },
  { id: "messages", label: "Messages" },
  { id: "notes", label: "Notes" },
  { id: "offer", label: "Offers" },
  { id: "timeline", label: "Timeline" },
];

const ACTIVE_OFFER = ["draft", "pending_approval", "approved", "sent", "accepted"];
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export function CandidateDetailPage() {
  const { id } = useParams();
  const candidateId = Number(id);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canEdit = hasPermission("recruitment:edit") || hasPermission("recruitment:create");
  const canDelete = hasPermission("recruitment:delete");

  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [offerForm, setOfferForm] = useState<{ open: boolean; offer: Offer | null }>({ open: false, offer: null });

  const candidateQuery = useQuery({
    queryKey: ["recruitment", "candidate", candidateId],
    queryFn: () => getCandidate(candidateId),
    enabled: Number.isFinite(candidateId) && candidateId > 0,
  });
  const candidate = candidateQuery.data;

  if (candidateQuery.isLoading) {
    return <div className="space-y-6"><PageHeader title="Candidate" subtitle="Loading..." /><RecruitmentSubnav /></div>;
  }

  if (candidateQuery.isError || !candidate) {
    return (
      <div className="space-y-6">
        <PageHeader title="Candidate" subtitle="This candidate could not be loaded." />
        <RecruitmentSubnav />
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {(candidateQuery.error as Error | null)?.message ?? "Candidate not found."} <Link className="underline" to="/recruitment/candidates">Back to candidates</Link>
        </div>
      </div>
    );
  }

  const open = candidate.stage !== "hired" && candidate.stage !== "rejected";
  const activeOffer = (candidate.offers ?? []).find((offer) => ACTIVE_OFFER.includes(offer.status));

  return (
    <div className="space-y-6">
      <PageHeader title={candidate.full_name} subtitle={`${candidate.job_opening?.title ?? "No job"} · applied ${formatRecruitmentDate(candidate.applied_at)}`} />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/recruitment/candidates" className="text-sm text-[var(--muted)] hover:underline">← Candidates</Link>
          <StageBadge stage={candidate.stage} />
          {candidate.status === "inactive" && <Badge>inactive</Badge>}
          {candidate.score != null && <Badge tone="blue">Score {candidate.score}/100</Badge>}
          <FitBadge score={candidate.fit_score} breakdown={candidate.fit_breakdown} />
          {candidate.withdrawn_at && <Badge>withdrew {formatRecruitmentDate(candidate.withdrawn_at)}</Badge>}
          {candidate.anonymized_at && <Badge>data erased</Badge>}
          {(candidate.unread_messages ?? 0) > 0 && <Badge tone="amber">{candidate.unread_messages} unread message{candidate.unread_messages === 1 ? "" : "s"}</Badge>}
          {candidate.employee && <Badge tone="emerald">Employee: {candidate.employee.name}</Badge>}
          {candidate.talent_pool && <Badge tone="violet">{candidate.talent_pool === "silver_medalist" ? "Silver medalist" : "Talent pool"}</Badge>}
          {candidate.knockout_failed && <Badge tone="red">knockout answer</Badge>}
          {(candidate.duplicates?.length ?? 0) > 0 && <Badge tone="amber">{candidate.duplicates?.length} other application{candidate.duplicates?.length === 1 ? "" : "s"}</Badge>}

          {canEdit && (
            <div className="ml-auto flex flex-wrap gap-2">
              <StageMover candidate={candidate} />
              <Button variant="outline" onClick={() => setPortalOpen(true)}>Candidate link</Button>
              {!candidate.anonymized_at && <Button variant="outline" onClick={() => setEmailOpen(true)}>Email</Button>}
              {open && <Button variant="outline" onClick={() => setInterviewOpen(true)}>Schedule interview</Button>}
              {(candidate.stage === "interview" || candidate.stage === "offer") && !activeOffer && (
                <Button variant="outline" onClick={() => setOfferForm({ open: true, offer: null })}>Make offer</Button>
              )}
              {candidate.stage === "offer" && <Button onClick={() => setHireOpen(true)}>Hire</Button>}
              {open && <Button variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button>}
              <Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
            </div>
          )}
        </div>

        <PipelineStepper candidate={candidate} />

        <div role="tablist" aria-label="Candidate sections" className="flex flex-wrap gap-1 border-b border-[var(--border)]">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === item.id ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              {item.label}
              {item.id === "interviews" && candidate.interviews?.length ? ` (${candidate.interviews.length})` : ""}
              {item.id === "notes" && candidate.candidate_notes?.length ? ` (${candidate.candidate_notes.length})` : ""}
              {item.id === "documents" && candidate.documents?.length ? ` (${candidate.documents.length})` : ""}
              {item.id === "checks" && candidate.checks?.length ? ` (${candidate.checks.length})` : ""}
              {item.id === "checks" && candidate.check_summary && !candidate.check_summary.cleared ? " !" : ""}
              {item.id === "messages" && (candidate.unread_messages ?? 0) > 0 ? ` (${candidate.unread_messages} new)` : ""}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab candidate={candidate} canEdit={canEdit} canDelete={canDelete} />}
        {tab === "resume" && <ResumeTab candidate={candidate} canEdit={canEdit} />}
        {tab === "interviews" && <InterviewsTab interviews={candidate.interviews ?? []} requests={candidate.pending_reschedule_requests ?? []} canEdit={canEdit} />}
        {tab === "documents" && <DocumentsTab candidate={candidate} canEdit={canEdit} />}
        {tab === "checks" && <ChecksTab candidate={candidate} canEdit={canEdit} />}
        {tab === "messages" && <MessagesTab candidate={candidate} canEdit={canEdit} />}
        {tab === "notes" && <NotesTab candidate={candidate} />}
        {tab === "offer" && (
          <OffersTab
            candidate={candidate}
            canEdit={canEdit}
            canCreate={(candidate.stage === "interview" || candidate.stage === "offer") && !activeOffer}
            onCreate={() => setOfferForm({ open: true, offer: null })}
            onEdit={(offer) => setOfferForm({ open: true, offer })}
          />
        )}
        {tab === "timeline" && <TimelineTab candidate={candidate} />}
      </section>

      {editOpen && <CandidateFormModal candidate={candidate} onClose={() => setEditOpen(false)} />}
      {rejectOpen && <RejectModal candidate={candidate} onClose={() => setRejectOpen(false)} />}
      {portalOpen && <PortalLinkModal candidate={candidate} onClose={() => setPortalOpen(false)} />}
      {emailOpen && <BulkActionModal action="email" scope={{ kind: "ids", ids: [candidate.id] }} onClose={() => setEmailOpen(false)} onDone={() => undefined} />}
      {hireOpen && <HireModal candidateId={candidate.id} onClose={() => setHireOpen(false)} />}
      {interviewOpen && <InterviewFormModal candidateId={candidate.id} onClose={() => setInterviewOpen(false)} />}
      {offerForm.open && <OfferFormModal candidate={candidate} offer={offerForm.offer} onClose={() => setOfferForm({ open: false, offer: null })} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-sm">{children || "-"}</dd>
    </div>
  );
}

function OverviewTab({ candidate, canEdit, canDelete }: { candidate: Candidate; canEdit: boolean; canDelete: boolean }) {
  return (
    <div className="space-y-4">
      <ResumeReviewNotice candidate={candidate} />
      <RescheduleRequestsPanel requests={candidate.pending_reschedule_requests ?? []} canEdit={canEdit} />
      <DuplicatesPanel candidate={candidate} canMerge={canDelete} />
      <dl className="grid gap-4 md:grid-cols-3">
        <Field label="Email"><a className="hover:underline" href={`mailto:${candidate.email}`}>{candidate.email}</a></Field>
        <Field label="Phone">{candidate.phone}</Field>
        <Field label="Source">{candidate.source}</Field>
        <Field label="Job">{candidate.job_opening?.title}</Field>
        <Field label="Rating">{candidate.rating ? `${"★".repeat(candidate.rating)} (${candidate.rating}/5)` : null}</Field>
        <Field label="Onboarding">{candidate.onboarding_status ? <Badge>{candidate.onboarding_status.replace("_", " ")}</Badge> : null}</Field>
        <Field label="Tags">
          {candidate.tags && candidate.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">{candidate.tags.map((tag) => <Badge key={tag} tone="blue">{tag}</Badge>)}</span>
          ) : null}
        </Field>
        <Field label="Experience">{candidate.experience_years != null ? `${candidate.experience_years} years (from the resume)` : null}</Field>
        <div className="md:col-span-2">
          <Field label="Skills (from the resume)">
            {candidate.skills && candidate.skills.length > 0 ? (
              <span className="flex flex-wrap gap-1">{candidate.skills.map((skill) => <Badge key={skill} tone="slate">{skill}</Badge>)}</span>
            ) : null}
          </Field>
        </div>
      </dl>
      <SourcePanel candidate={candidate} />
      <ScreeningAnswersPanel candidate={candidate} />
      <FitPanel candidate={candidate} />
      <TalentPoolPanel candidate={candidate} canEdit={canEdit} />
      {candidate.rejection_reason && candidate.stage === "rejected" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>Rejected:</strong> {candidate.rejection_reason}</div>
      )}
      {candidate.notes && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Screening notes</h3>
          <p className="whitespace-pre-wrap rounded-xl border border-[var(--border)] p-3 text-sm">{candidate.notes}</p>
        </div>
      )}
      {canDelete && <ErasePanel candidate={candidate} />}
    </div>
  );
}

function ResumeTab({ candidate, canEdit }: { candidate: Candidate; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const isPdf = (candidate.resume_original_name ?? "").toLowerCase().endsWith(".pdf");

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewError(null);

    if (candidate.has_resume && isPdf) {
      fetchRecruitmentFile(candidateResumePath(candidate.id))
        .then((blob) => {
          if (cancelled) return;
          revoked = URL.createObjectURL(blob);
          setPreviewUrl(revoked);
        })
        .catch((error: Error) => !cancelled && setPreviewError(error.message));
    }

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [candidate.id, candidate.has_resume, candidate.resume_original_name, isPdf]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadCandidateResume(candidate.id, file),
    onSuccess: async () => {
      await refresh();
      toast.success("Resume uploaded", "The resume was saved privately.");
    },
    onError: (error: Error) => toast.error("Upload failed", error.message),
  });

  const reparseMutation = useMutation({
    mutationFn: () => reparseCandidateResume(candidate.id),
    onSuccess: async (updated) => {
      await refresh();
      toast.success("Resume read again", updated.skills?.length ? `${updated.skills.length} skills found.` : "No skills were recognised in this file.");
    },
    onError: (error: Error) => toast.error("Could not read the resume", error.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => deleteCandidateResume(candidate.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Resume removed", "The file was deleted.");
      setRemoveOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Could not remove resume", error.message);
      setRemoveOpen(false);
    },
  });

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!/\.(pdf|docx?|jpe?g|png)$/i.test(file.name)) {
      toast.error("Unsupported file", "Upload a PDF, Word file, JPG or PNG.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      toast.error("File too large", "Resumes can be at most 5 MB.");
      return;
    }
    uploadMutation.mutate(file);
  }

  async function download() {
    try {
      saveBlob(await fetchRecruitmentFile(candidateResumePath(candidate.id, true)), candidate.resume_original_name ?? "resume");
    } catch (error) {
      toast.error("Download failed", (error as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <ResumeReviewNotice candidate={candidate} />
      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={onFile} aria-label="Upload resume" />
        {canEdit && (
          <Button variant="outline" disabled={uploadMutation.isPending} onClick={() => inputRef.current?.click()}>
            {uploadMutation.isPending ? "Uploading..." : candidate.has_resume ? "Replace resume" : "Upload resume"}
          </Button>
        )}
        {candidate.has_resume && (
          <>
            <span className="text-sm text-[var(--muted)]">{candidate.resume_original_name}</span>
            <Button variant="outline" onClick={() => void download()}>Download</Button>
            {canEdit && <Button variant="outline" disabled={reparseMutation.isPending} onClick={() => reparseMutation.mutate()}>{reparseMutation.isPending ? "Reading..." : "Read again"}</Button>}
            {canEdit && <Button variant="outline" onClick={() => setRemoveOpen(true)}>Remove</Button>}
          </>
        )}
        {!candidate.has_resume && <span className="text-sm text-[var(--muted)]">No resume uploaded yet. PDF, Word file, JPG or PNG, up to 5 MB. Scans are read automatically when OCR is installed.</span>}
      </div>

      {candidate.has_resume && isPdf && (
        previewError ? (
          <p className="text-sm text-red-700">Could not load the preview: {previewError}</p>
        ) : previewUrl ? (
          <iframe title="Resume preview" src={previewUrl} className="h-[70vh] w-full rounded-xl border border-[var(--border)]" />
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading preview...</p>
        )
      )}
      {candidate.has_resume && !isPdf && <p className="text-sm text-[var(--muted)]">This file type cannot be previewed here. Use Download to open the file.</p>}

      {removeOpen && (
        <ConfirmModal title="Remove resume" message="Delete the stored resume file? This cannot be undone." confirmLabel="Remove" busy={removeMutation.isPending} onConfirm={() => removeMutation.mutate()} onCancel={() => setRemoveOpen(false)} />
      )}
    </div>
  );
}

function InterviewsTab({ interviews, requests, canEdit }: { interviews: Interview[]; requests: Candidate["pending_reschedule_requests"]; canEdit: boolean }) {
  if (interviews.length === 0) return <p className="text-sm text-[var(--muted)]">No interviews scheduled yet.</p>;

  const sorted = [...interviews].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <div className="space-y-4">
      <RescheduleRequestsPanel requests={requests ?? []} canEdit={canEdit} />
      <InterviewList interviews={sorted} />
    </div>
  );
}

function InterviewList({ interviews: sorted }: { interviews: Interview[] }) {
  return (
    <ul className="space-y-3">
      {sorted.map((interview) => (
        <li key={interview.id} className="rounded-xl border border-[var(--border)] p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium capitalize">{interview.interview_type}</span>
            <span className="text-[var(--muted)]">{formatRecruitmentDate(interview.scheduled_at, true)} · {interview.duration_minutes} min</span>
            <Badge tone={interview.status === "cancelled" ? "slate" : interview.status === "completed" ? "emerald" : "blue"}>{interview.status}</Badge>
            <Badge tone={interview.result === "pass" ? "emerald" : interview.result === "fail" ? "red" : interview.result === "hold" ? "amber" : "slate"}>{interview.result}</Badge>
          </div>
          <p className="mt-1 text-[var(--muted)]">Interviewer: {interview.interviewer_name}{interview.location ? ` · ${interview.location}` : ""}</p>
          {interview.cancel_reason && <p className="mt-1 text-[var(--muted)]">Cancelled: {interview.cancel_reason}</p>}
          {interview.scorecards && interview.scorecards.length > 0 && (
            <div className="mt-3 space-y-2">
              {interview.scorecards.map((card) => (
                <div key={card.id} className="rounded-lg bg-[var(--border)]/25 p-3">
                  <p className="font-medium">
                    {card.submitter?.name ?? "Interviewer"} · <span className="text-amber-500">{"★".repeat(card.rating)}</span> · {card.recommendation.replace("_", " ")}
                  </p>
                  {card.strengths && <p className="mt-1"><strong>Strengths:</strong> {card.strengths}</p>}
                  {card.concerns && <p className="mt-1"><strong>Concerns:</strong> {card.concerns}</p>}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function NotesTab({ candidate }: { candidate: Candidate }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canWrite = hasPermission("recruitment:edit") || hasPermission("recruitment:create");
  const canDeleteAny = hasPermission("recruitment:delete");
  const [body, setBody] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });

  const addMutation = useMutation({
    mutationFn: () => addCandidateNote(candidate.id, body.trim()),
    onSuccess: async () => {
      setBody("");
      await refresh();
    },
    onError: (error: Error) => toast.error("Could not add note", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => deleteCandidateNote(candidate.id, noteId),
    onSuccess: refresh,
    onError: (error: Error) => toast.error("Could not delete note", error.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) addMutation.mutate();
  }

  const notes = candidate.candidate_notes ?? [];

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={submit} className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-note">Add a note</label>
          <textarea id="new-note" className={textareaClass} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Call summary, impressions, next steps..." />
          <div className="flex justify-end"><Button type="submit" disabled={addMutation.isPending || !body.trim()}>Add note</Button></div>
        </form>
      )}
      {notes.length === 0 && <p className="text-sm text-[var(--muted)]">No notes yet.</p>}
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{note.author?.name ?? "Unknown"} · {formatRecruitmentDate(note.created_at, true)}</span>
              {(canDeleteAny || (canWrite && note.user_id === user?.id)) && (
                <button type="button" className="hover:text-red-700" onClick={() => deleteMutation.mutate(note.id)} aria-label="Delete note">Delete</button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OffersTab({ candidate, canEdit, canCreate, onCreate, onEdit }: {
  candidate: Candidate;
  canEdit: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onEdit: (offer: Offer) => void;
}) {
  const offers = candidate.offers ?? [];

  return (
    <div className="space-y-4">
      {canEdit && canCreate && <div className="flex justify-end"><Button onClick={onCreate}>New offer</Button></div>}
      {offers.length === 0 && <p className="text-sm text-[var(--muted)]">No offers yet. Offers can be made once the candidate reaches the interview stage.</p>}
      {offers.map((offer) => (
        <div key={offer.id} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <OfferSummary offer={offer} />
          {offer.terms && <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{offer.terms}</p>}
          <OfferActions offer={{ ...offer, candidate: { id: candidate.id, full_name: candidate.full_name, email: candidate.email, stage: candidate.stage } }} candidateName={candidate.full_name} onEdit={onEdit} />
        </div>
      ))}
      {offers.length > 0 && <p className="text-xs text-[var(--muted)]">Latest offer: {formatMoney(offers[0].salary, offers[0].currency)}</p>}
    </div>
  );
}

function TimelineTab({ candidate }: { candidate: Candidate }) {
  const events = candidate.stage_histories ?? [];

  if (events.length === 0) return <p className="text-sm text-[var(--muted)]">No stage changes recorded yet.</p>;

  return (
    <ol className="relative space-y-4 border-l border-[var(--border)] pl-5">
      {events.map((event) => (
        <li key={event.id} className="text-sm">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-[var(--primary)]" aria-hidden />
          <p>
            {event.from_stage ? <>Moved <StageBadge stage={event.from_stage} label={event.from_label} /> → <StageBadge stage={event.to_stage} label={event.to_label} /></> : <>Added as <StageBadge stage={event.to_stage} label={event.to_label} /></>}
          </p>
          <p className="text-xs text-[var(--muted)]">{formatRecruitmentDate(event.created_at, true)}{event.changed_by ? ` · ${event.changed_by.name}` : " · Careers page / system"}</p>
          {event.reason && <p className="mt-1 text-[var(--muted)]">Reason: {event.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
