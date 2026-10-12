import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/notifications/toast";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import {
  type Candidate,
  type CandidateCheckItem,
  type CheckList,
  type CheckPayload,
  type CheckStatus,
  type CheckType,
  type PipelineStageItem,
  bonusStatusLabels,
  changeCandidateStage,
  checkStatusLabels,
  checkTypeLabels,
  createCandidateCheck,
  deleteCandidateCheck,
  moveCandidateToPipelineStage,
  sendReferenceRequest,
  sourceTypeLabels,
  updateCandidateCheck,
  waiveCandidateCheck,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/utils/cn";
import { Badge, ConfirmModal, FormError, NoteModal, formatMoney, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });
}

// ---------------------------------------------------------------------------
// Where the candidate is in the job's pipeline, and moving them
// ---------------------------------------------------------------------------

export function PipelineStepper({ candidate }: { candidate: Candidate }) {
  const pipeline = candidate.pipeline;
  if (!pipeline) return null;

  const closed = candidate.stage === "hired" || candidate.stage === "rejected";

  return (
    <ol aria-label="Pipeline" className="flex flex-wrap items-center gap-1 text-xs">
      {pipeline.stages.map((stage, index) => {
        const current = !closed && index === pipeline.current_index;
        const passed = candidate.stage === "hired" || (!closed && pipeline.current_index !== null && index < pipeline.current_index);
        return (
          <li key={`${stage.id ?? stage.category}-${index}`} className="flex items-center gap-1">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "rounded-full border px-3 py-1",
                current && "border-[var(--primary)] bg-[var(--primary)] font-semibold text-white",
                passed && "border-emerald-300 bg-emerald-50 text-emerald-800",
                !current && !passed && "border-[var(--border)] text-[var(--muted)]",
                stage.is_skippable && !current && "border-dashed"
              )}
              title={stage.is_skippable ? "This stage can be skipped" : undefined}
            >
              {stage.name}
            </span>
            {index < pipeline.stages.length - 1 && <span aria-hidden className="text-[var(--muted)]">›</span>}
          </li>
        );
      })}
      <li className="flex items-center gap-1">
        <span aria-hidden className="text-[var(--muted)]">›</span>
        <span className={cn("rounded-full border px-3 py-1", candidate.stage === "hired" ? "border-emerald-500 bg-emerald-500 font-semibold text-white" : "border-[var(--border)] text-[var(--muted)]")}>Hired</span>
      </li>
      {candidate.stage === "rejected" && <li><span className="rounded-full border border-red-300 bg-red-50 px-3 py-1 font-semibold text-red-700">Rejected</span></li>}
    </ol>
  );
}

/** Move to any allowed stage of the pipeline, or reopen a rejected candidate. */
export function StageMover({ candidate }: { candidate: Candidate }) {
  const refresh = useRefresh();
  const pipeline = candidate.pipeline;
  const rejected = candidate.stage === "rejected";
  const [choice, setChoice] = useState<string>("");

  const mutation = useMutation({
    mutationFn: (stage: PipelineStageItem) =>
      stage.id !== null ? moveCandidateToPipelineStage(candidate.id, stage.id) : changeCandidateStage(candidate.id, stage.category),
    onSuccess: async (_saved, stage) => {
      setChoice("");
      await refresh();
      toast.success(rejected ? "Candidate reopened" : "Candidate moved", `${candidate.full_name} is now in ${stage.name}.`);
    },
    onError: (error: Error) => toast.error("Could not move candidate", error.message),
  });

  if (!pipeline || candidate.stage === "hired") return null;

  const stages = pipeline.stages;
  const current = pipeline.current_index;
  const reopenIndex = pipeline.reopen_to ? stages.findIndex((stage) => stage.id === pipeline.reopen_to?.id && stage.name === pipeline.reopen_to?.name) : -1;

  // Open candidate: anything ahead, plus other stages in the same group. Rejected: where they were, or earlier.
  const options = stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage, index }) => {
      if (rejected) return reopenIndex >= 0 ? index <= reopenIndex : stage.category === "applied" || stage.category === "screening";
      if (current === null || index === current) return false;
      return index > current || stage.category === stages[current].category;
    })
    // Offer-group stages are for candidates who are ready for an offer; hiring itself has its own button.
    .map(({ stage, index }) => ({ stage, index }));

  if (options.length === 0) return null;

  const fallback = rejected ? options[options.length - 1] : options.find(({ index }) => current !== null && index > current) ?? options[0];
  const selected = options.find(({ index }) => String(index) === choice) ?? fallback;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="stage-mover">{rejected ? "Reopen to stage" : "Move to stage"}</label>
      <select id="stage-mover" className={cn(selectClass, "h-10 w-48")} value={String(selected.index)} onChange={(e) => setChoice(e.target.value)}>
        {options.map(({ stage, index }) => <option key={index} value={index}>{stage.name}{stage.is_skippable ? " (optional)" : ""}</option>)}
      </select>
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(selected.stage)}>
        {rejected ? "Reopen" : "Move"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screening answers
// ---------------------------------------------------------------------------

export function ScreeningAnswersPanel({ candidate }: { candidate: Candidate }) {
  const answers = candidate.answers ?? [];
  if (answers.length === 0 && !candidate.knockout_failed) return null;

  return (
    <section className="space-y-2" aria-label="Screening answers">
      <h3 className="text-sm font-semibold">Screening answers</h3>
      {candidate.knockout_failed && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          An answer did not meet a knockout requirement{candidate.stage === "rejected" ? ", so the application was rejected automatically" : ""}. Check the answers marked below before deciding.
        </p>
      )}
      <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        {answers.map((answer) => (
          <div key={answer.id} className="grid gap-1 p-3 text-sm md:grid-cols-[1fr_1fr]">
            <dt className="text-[var(--muted)]">{answer.question}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="whitespace-pre-wrap">{(answer.answer ?? []).map(String).join(", ") || "-"}</span>
              {answer.knocked_out && <Badge tone="red">did not meet requirement</Badge>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Source, referrer, agency
// ---------------------------------------------------------------------------

export function SourcePanel({ candidate }: { candidate: Candidate }) {
  if (!candidate.source_type || (candidate.source_type !== "referral" && candidate.source_type !== "agency")) return null;
  const bonus = candidate.referral_bonus;

  return (
    <section className="rounded-xl border border-[var(--border)] p-3 text-sm" aria-label="Source">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{sourceTypeLabels[candidate.source_type]}</strong>
        {candidate.source_type === "referral" && <span>Referred by {candidate.referrer?.name ?? "an employee"}</span>}
        {candidate.source_type === "agency" && <span>Supplied by {candidate.agency?.name ?? "an agency"}</span>}
        {bonus && <Badge tone={bonus.status === "paid" ? "emerald" : bonus.status === "cancelled" ? "red" : bonus.status === "eligible" ? "amber" : "blue"}>{bonusStatusLabels[bonus.status]}</Badge>}
      </div>
      {bonus && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          {bonus.amount != null ? `${candidate.source_type === "agency" ? "Agency fee" : "Bonus"} ${formatMoney(bonus.amount, bonus.currency)}` : "Amount not set"}
          {bonus.eligible_on ? ` · payable from ${formatRecruitmentDate(bonus.eligible_on)}` : ""}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reference, background and assessment checks
// ---------------------------------------------------------------------------

const statusTone: Record<CheckStatus, "slate" | "blue" | "emerald" | "red" | "amber"> = {
  requested: "slate",
  in_progress: "blue",
  passed: "emerald",
  failed: "red",
  waived: "amber",
};

export function ChecksTab({ candidate, canEdit }: { candidate: Candidate; canEdit: boolean }) {
  const refresh = useRefresh();
  const canWaive = useAuthStore((state) => state.hasPermission("recruitment:manage_settings"));
  const canDelete = useAuthStore((state) => state.hasPermission("recruitment:delete"));
  const checks = candidate.checks ?? [];
  const summary = candidate.check_summary;
  const [adding, setAdding] = useState(false);
  const [waiving, setWaiving] = useState<CandidateCheckItem | null>(null);
  const [removing, setRemoving] = useState<CandidateCheckItem | null>(null);

  const done = async (result: CheckList, message: string) => {
    await refresh();
    if (result.email_sent === false) toast.error("Email not sent", "The check was saved but the email could not be delivered. Share the request another way.");
    else toast.success(message);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CheckPayload }) => updateCandidateCheck(id, payload),
    onSuccess: (result) => done(result, "Check updated"),
    onError: (error: Error) => toast.error("Could not update the check", error.message),
  });

  const requestMutation = useMutation({
    mutationFn: (id: number) => sendReferenceRequest(id),
    onSuccess: (result) => done(result, "Reference request sent"),
    onError: (error: Error) => toast.error("Could not send the request", error.message),
  });

  const waiveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => waiveCandidateCheck(id, reason),
    onSuccess: async (result) => {
      setWaiving(null);
      await done(result, "Check waived");
    },
    onError: (error: Error) => toast.error("Could not waive the check", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCandidateCheck(id),
    onSuccess: async (result) => {
      setRemoving(null);
      await done(result, "Check removed");
    },
    onError: (error: Error) => toast.error("Could not remove the check", error.message),
  });

  return (
    <div className="space-y-4">
      {summary && summary.required.length > 0 && (
        <div className={cn("rounded-xl border p-3 text-sm", summary.cleared ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900")}>
          {summary.cleared
            ? "Every check this job requires is cleared. This candidate can be hired."
            : <>This job requires {summary.required.map((type) => checkTypeLabels[type].toLowerCase()).join(", ")} before a hire. <strong>Still open:</strong> {summary.unmet.map((item) => item.reason).join(" ")}</>}
        </div>
      )}

      {checks.length === 0 && <p className="text-sm text-[var(--muted)]">No reference checks, background checks or assessments yet.</p>}

      <ul className="space-y-3">
        {checks.map((check) => (
          <li key={check.id} className="space-y-2 rounded-xl border border-[var(--border)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{check.title}</strong>
              <Badge tone="slate">{checkTypeLabels[check.type]}</Badge>
              <Badge tone={statusTone[check.status]}>{checkStatusLabels[check.status]}</Badge>
              {check.score != null && <Badge tone="blue">Score {Number(check.score)}{check.max_score != null ? ` / ${Number(check.max_score)}` : ""}</Badge>}
              {check.document && <Badge tone="violet">{check.document.label}</Badge>}
              {canEdit && (
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {check.status !== "waived" && (
                    <select
                      aria-label={`Status of ${check.title}`}
                      className={cn(selectClass, "h-9 w-36")}
                      value={check.status}
                      disabled={updateMutation.isPending}
                      onChange={(e) => updateMutation.mutate({ id: check.id, payload: { status: e.target.value as Exclude<CheckStatus, "waived"> } })}
                    >
                      {(["requested", "in_progress", "passed", "failed"] as const).map((status) => <option key={status} value={status}>{checkStatusLabels[status]}</option>)}
                    </select>
                  )}
                  {check.type === "reference" && check.contact_email && check.status !== "waived" && check.status !== "passed" && (
                    <Button type="button" variant="outline" disabled={requestMutation.isPending} onClick={() => requestMutation.mutate(check.id)}>
                      {check.requested_at ? "Resend request" : "Email referee"}
                    </Button>
                  )}
                  {canWaive && check.status !== "waived" && check.status !== "passed" && <Button type="button" variant="outline" onClick={() => setWaiving(check)}>Waive</Button>}
                  {canDelete && <Button type="button" variant="ghost" aria-label={`Remove ${check.title}`} onClick={() => setRemoving(check)}>✕</Button>}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              {[
                check.type === "reference" && check.contact_name ? `${check.contact_name}${check.relationship ? ` (${check.relationship})` : ""}` : null,
                check.contact_email,
                check.provider ? `Provider: ${check.provider}` : null,
                check.due_on ? `Due ${formatRecruitmentDate(check.due_on)}` : null,
                check.completed_at ? `Completed ${formatRecruitmentDate(check.completed_at)}` : null,
              ].filter(Boolean).join(" · ") || "No details recorded"}
            </p>
            {check.status === "waived" && check.waive_reason && <p className="text-xs text-amber-800">Waived: {check.waive_reason}</p>}
            {check.result_notes && <p className="whitespace-pre-wrap rounded-lg bg-[var(--border)]/30 p-2 text-xs">{check.result_notes}</p>}
            {check.response && <ReferenceResponse response={check.response} />}
          </li>
        ))}
      </ul>

      {canEdit && <Button type="button" variant="outline" onClick={() => setAdding(true)}>Add a check</Button>}
      {adding && <CheckForm candidate={candidate} onClose={() => setAdding(false)} />}
      {waiving && (
        <NoteModal
          title={`Waive ${waiving.title}?`}
          label="Reason"
          required
          submitLabel="Waive check"
          busy={waiveMutation.isPending}
          onCancel={() => setWaiving(null)}
          onSubmit={(reason) => waiveMutation.mutate({ id: waiving.id, reason })}
        />
      )}
      {removing && (
        <ConfirmModal
          title="Remove this check?"
          message={`${removing.title} and any answers recorded for it will be deleted.`}
          confirmLabel="Remove"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(removing.id)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

const referenceLabels: Record<string, string> = {
  relationship_duration: "Worked together",
  strengths: "Strengths",
  development_areas: "To improve",
  reliability: "Reliability (1-5)",
  overall: "Overall (1-5)",
  would_rehire: "Would work with again",
  comments: "Comments",
};

function ReferenceResponse({ response }: { response: Record<string, string | number> }) {
  const entries = Object.entries(response).filter(([key]) => key !== "submitted_at");
  return (
    <details className="rounded-lg border border-[var(--border)] p-2 text-xs">
      <summary className="cursor-pointer font-medium">Referee's answers</summary>
      <dl className="mt-2 grid gap-1 md:grid-cols-[10rem_1fr]">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-[var(--muted)]">{referenceLabels[key] ?? key}</dt>
            <dd className="whitespace-pre-wrap">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function CheckForm({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const refresh = useRefresh();
  const [type, setType] = useState<CheckType>("reference");
  const [form, setForm] = useState({ title: "", provider: "", contact_name: "", contact_email: "", contact_phone: "", relationship: "", due_on: "", max_score: "", pass_mark: "", score: "", result_notes: "", document_id: "" });
  const [sendNow, setSendNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));
  const documents = (candidate.documents ?? []).filter((document) => document.has_file);

  const mutation = useMutation({
    mutationFn: (payload: CheckPayload) => createCandidateCheck(candidate.id, payload),
    onSuccess: async (result) => {
      await refresh();
      if (result.email_sent === false) toast.error("Email not sent", "The check was added but the email could not be delivered.");
      else toast.success("Check added", result.email_sent ? "The referee has been emailed." : undefined);
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const title = form.title.trim() || (type === "reference" ? `Reference: ${form.contact_name.trim()}` : "");
    if (!title.trim() || title.trim() === "Reference:") return setError("Give the check a title.");
    if (type === "reference" && sendNow && !form.contact_email.trim()) return setError("Enter the referee's email address to send the request.");

    const number = (value: string) => (value.trim() === "" ? null : Number(value));
    mutation.mutate({
      type,
      title,
      provider: form.provider.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      relationship: form.relationship.trim() || null,
      due_on: form.due_on || null,
      max_score: type === "assessment" ? number(form.max_score) : null,
      pass_mark: type === "assessment" ? number(form.pass_mark) : null,
      score: type === "assessment" ? number(form.score) : null,
      result_notes: form.result_notes.trim() || null,
      document_id: form.document_id ? Number(form.document_id) : null,
      send_request: type === "reference" && sendNow,
    });
  }

  return (
    <form className="space-y-3 rounded-xl border border-[var(--border)] p-3" onSubmit={submit} aria-label="Add a check">
      <FormError message={error} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="check-type">Type</label>
          <select id="check-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as CheckType)}>
            {(Object.keys(checkTypeLabels) as CheckType[]).map((item) => <option key={item} value={item}>{checkTypeLabels[item]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="check-title">Title</label>
          <FormInput id="check-title" value={form.title} placeholder={type === "reference" ? "Reference: previous manager" : type === "background" ? "Criminal record check" : "Coding test"} onChange={(e) => set("title", e.target.value)} />
        </div>
        {type === "reference" && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-contact">Referee name</label>
              <FormInput id="check-contact" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-relationship">Relationship</label>
              <FormInput id="check-relationship" value={form.relationship} placeholder="Former line manager" onChange={(e) => set("relationship", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-email">Referee email</label>
              <FormInput id="check-email" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-phone">Referee phone</label>
              <FormInput id="check-phone" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
            </div>
          </>
        )}
        {type !== "reference" && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="check-provider">{type === "background" ? "Vendor" : "Platform"}</label>
            <FormInput id="check-provider" value={form.provider} onChange={(e) => set("provider", e.target.value)} />
          </div>
        )}
        {type === "assessment" && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-max">Maximum score</label>
              <FormInput id="check-max" type="number" min={0} value={form.max_score} onChange={(e) => set("max_score", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-pass">Pass mark</label>
              <FormInput id="check-pass" type="number" min={0} value={form.pass_mark} onChange={(e) => set("pass_mark", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="check-score">Score (if already taken)</label>
              <FormInput id="check-score" type="number" min={0} value={form.score} onChange={(e) => set("score", e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="check-due">Due</label>
          <FormInput id="check-due" type="date" value={form.due_on} onChange={(e) => set("due_on", e.target.value)} />
        </div>
        {documents.length > 0 && type !== "reference" && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="check-document">Report (from Documents)</label>
            <select id="check-document" className={selectClass} value={form.document_id} onChange={(e) => set("document_id", e.target.value)}>
              <option value="">None</option>
              {documents.map((document) => <option key={document.id} value={document.id}>{document.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="check-notes">Notes</label>
        <textarea id="check-notes" className={textareaClass} value={form.result_notes} onChange={(e) => set("result_notes", e.target.value)} />
      </div>
      {type === "reference" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} /> Email the referee a private questionnaire now
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Add check"}</Button>
      </div>
    </form>
  );
}
