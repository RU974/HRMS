import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  BulkAction,
  BulkFailure,
  BulkPayload,
  BulkResult,
  BulkRun,
  CandidateStage,
  ImportResult,
  TalentPool,
  bulkCandidateAction,
  candidateStageLabels,
  csvImportTemplate,
  getBulkRun,
  importCandidatesCsv,
  listJobOpenings,
  saveBlob,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { EmailTemplatePicker, SaveTemplateButton, TEMPLATE_PLACEHOLDERS } from "./email-templates";
import { BulkScope, chunk } from "./selection";
import { Badge, FormError, selectClass, textareaClass } from "./shared";

/** Most ids one request can carry; longer explicit selections are sent in several requests. */
export const BULK_REQUEST_MAX = 200;
const EMAIL_REQUEST_MAX = 100;
/** Most emails one action may send, whichever way the people were chosen. */
export const EMAIL_MAX = 500;
export const RUN_POLL_MS = 1500;

const actionTitles: Record<BulkAction, string> = {
  move: "Move to a stage",
  reject: "Reject",
  tag: "Add tags",
  untag: "Remove tags",
  talent_pool: "Add to talent pool",
  remove_from_pool: "Remove from talent pool",
  email: "Send an email",
};

/** Stages a bulk move may target; hired and rejected have their own, safer, flows. */
const moveStages: CandidateStage[] = ["applied", "screening", "interview", "offer"];

interface BulkActionBarProps {
  count: number;
  canEdit: boolean;
  onClear: () => void;
  onChoose: (action: BulkAction) => void;
  /** Offered when every row on the page is ticked but more people match the filter. */
  offerAllMatching?: { total: number; onSelect: () => void } | null;
  /** Shown while "everything matching" is selected. */
  allMatching?: { excluded: number } | null;
}

export function BulkActionBar({ count, canEdit, onClear, onChoose, offerAllMatching, allMatching }: BulkActionBarProps) {
  if (count === 0 && !offerAllMatching) return null;

  return (
    <div role="region" aria-label="Selection toolbar" className="space-y-2 rounded-2xl border border-[var(--primary)]/40 bg-[var(--primary)]/5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">
          {count} selected{allMatching ? " (everything matching this filter" + (allMatching.excluded ? `, ${allMatching.excluded} left out)` : ")") : ""}
        </span>
        {canEdit && count > 0 && (
          <select
            aria-label="Bulk action"
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value=""
            onChange={(e) => e.target.value && onChoose(e.target.value as BulkAction)}
          >
            <option value="">Choose an action...</option>
            {(Object.keys(actionTitles) as BulkAction[]).map((action) => (
              <option key={action} value={action} disabled={action === "email" && count > EMAIL_MAX}>
                {actionTitles[action]}{action === "email" && count > EMAIL_MAX ? ` (max ${EMAIL_MAX})` : ""}
              </option>
            ))}
          </select>
        )}
        {count > 0 && <Button variant="outline" onClick={onClear}>Clear selection</Button>}
      </div>
      {offerAllMatching && !allMatching && (
        <p>
          All people on this page are selected.{" "}
          <button type="button" className="font-medium text-[var(--primary)] underline" onClick={offerAllMatching.onSelect}>
            Select all {offerAllMatching.total} matching this filter
          </button>
        </p>
      )}
    </div>
  );
}

/** What the action did, whichever way the people were chosen. */
export interface BulkOutcome {
  requested: number;
  succeeded: number;
  failed: BulkFailure[];
}

export function describeScope(scope: BulkScope): number {
  return scope.kind === "ids" ? scope.ids.length : scope.total;
}

function isRun(data: BulkResult | { run: BulkRun }): data is { run: BulkRun } {
  return Boolean((data as { run?: BulkRun | null }).run);
}

export function BulkActionModal({ action, scope, onClose, onDone }: { action: BulkAction; scope: BulkScope; onClose: () => void; onDone: (result: BulkOutcome) => void }) {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canSaveTemplates = hasPermission("recruitment:create") || hasPermission("recruitment:edit");
  const total = describeScope(scope);

  const [stage, setStage] = useState<CandidateStage>("screening");
  const [reason, setReason] = useState("");
  const [pool, setPool] = useState<TalentPool | "">("");
  const [note, setNote] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [result, setResult] = useState<BulkOutcome | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: Omit<BulkPayload, "ids" | "select_all">): Promise<BulkOutcome | { runId: number; total: number }> => {
      if (scope.kind === "matching") {
        const data = await bulkCandidateAction({ ...payload, select_all: { filters: scope.filters, exclude_ids: scope.excludeIds } });
        if (isRun(data)) return { runId: data.run.id, total: data.run.total };
        return { requested: data.requested, succeeded: data.succeeded.length, failed: data.failed };
      }

      // Long explicit selections are sent in request-sized groups, one after another.
      const groups = chunk(scope.ids, action === "email" ? EMAIL_REQUEST_MAX : BULK_REQUEST_MAX);
      const outcome: BulkOutcome = { requested: 0, succeeded: 0, failed: [] };
      setProgress({ done: 0, total: scope.ids.length });

      for (const ids of groups) {
        const data = await bulkCandidateAction({ ...payload, ids });
        if (isRun(data)) throw new Error("Unexpected response from the server.");
        outcome.requested += data.requested;
        outcome.succeeded += data.succeeded.length;
        outcome.failed.push(...data.failed);
        setProgress({ done: outcome.requested, total: scope.ids.length });
      }

      return outcome;
    },
    onSuccess: async (data) => {
      if ("runId" in data) {
        setRunId(data.runId);
        return;
      }
      await finish(data);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  async function finish(outcome: BulkOutcome) {
    await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
    setResult(outcome);
    onDone(outcome);
  }

  // A large filter-wide action finishes after the response; follow it until it is done.
  const runQuery = useQuery({
    queryKey: ["recruitment", "bulk-run", runId],
    queryFn: () => getBulkRun(runId as number),
    enabled: runId !== null && result === null,
    refetchInterval: (query) => (query.state.data && ["done", "failed"].includes(query.state.data.status) ? false : RUN_POLL_MS),
  });
  const run = runQuery.data;

  useEffect(() => {
    if (!run || result) return;

    if (run.status === "done") {
      void finish({ requested: run.processed, succeeded: run.succeeded, failed: run.failed });
    } else if (run.status === "failed") {
      setError("The action stopped unexpectedly. Some candidates may already have been updated.");
      setRunId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: Omit<BulkPayload, "ids" | "select_all"> = { action };

    if (action === "move") payload.stage = stage;

    if (action === "reject") {
      if (!reason.trim()) return setError("Enter a reason. It is recorded on every rejected candidate.");
      payload.reason = reason.trim();
      if (pool) payload.talent_pool = pool;
    }

    if (action === "tag" || action === "untag") {
      const tags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
      if (tags.length === 0) return setError("Enter at least one tag, separated by commas.");
      payload.tags = tags;
    }

    if (action === "talent_pool") {
      if (!pool) return setError("Choose which pool to add them to.");
      payload.pool = pool;
      if (note.trim()) payload.note = note.trim();
    }

    if (action === "email") {
      if (!subject.trim() || !body.trim()) return setError("Write a subject and a message.");
      if (total > EMAIL_MAX) return setError(`You can email at most ${EMAIL_MAX} people at a time.`);
      payload.subject = subject.trim();
      payload.body = body.trim();
    }

    mutation.mutate(payload);
  }

  if (result) {
    const failed = result.failed;
    return (
      <Modal title={actionTitles[action]} onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>
            <span className="font-medium">{result.succeeded}</span> of {result.requested} candidate{result.requested === 1 ? "" : "s"} updated
            {failed.length > 0 ? `, ${Math.max(result.requested - result.succeeded, failed.length)} could not be.` : "."}
          </p>
          {failed.length > 0 && (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
              {failed.map((item) => (
                <li key={item.id}>
                  <span className="font-medium">{item.name ?? `Candidate #${item.id}`}</span>
                  <span className="text-[var(--muted)]"> — {item.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  if (runId !== null) {
    const processed = run?.processed ?? 0;
    const runTotal = run?.total || total;
    return (
      <Modal title={actionTitles[action]} onClose={onClose}>
        <div className="space-y-4 text-sm" role="status">
          <p>Working on {runTotal} candidates. You can close this window; the action keeps running.</p>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${runTotal ? Math.min(100, Math.round((processed / runTotal) * 100)) : 0}%` }} />
          </div>
          <p className="text-[var(--muted)]">{processed} of {runTotal} done</p>
          <FormError message={error} />
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${actionTitles[action]} (${total} candidate${total === 1 ? "" : "s"})`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        {scope.kind === "matching" && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--border)]/20 p-3 text-xs">
            This applies to everyone who matches the current filter, not only the people on screen.
            {total > BULK_REQUEST_MAX ? " Large actions keep running in the background." : ""}
          </p>
        )}

        {action === "move" && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-stage">Move to</label>
            <select id="bulk-stage" className={selectClass} value={stage} onChange={(e) => setStage(e.target.value as CandidateStage)}>
              {moveStages.map((option) => <option key={option} value={option}>{candidateStageLabels[option]}</option>)}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">Candidates that cannot make this move (for example skipping a stage) are skipped and listed afterwards.</p>
          </div>
        )}

        {action === "reject" && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="bulk-reason">Reason</label>
              <textarea id="bulk-reason" className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Position filled" autoFocus />
              <p className="mt-1 text-xs text-[var(--muted)]">Open offers for these candidates are withdrawn.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="bulk-reject-pool">Keep for future roles?</label>
              <select id="bulk-reject-pool" className={selectClass} value={pool} onChange={(e) => setPool(e.target.value as TalentPool | "")}>
                <option value="">No, just reject</option>
                <option value="silver_medalist">Yes, as silver medalists</option>
                <option value="general">Yes, in the general talent pool</option>
              </select>
            </div>
          </>
        )}

        {(action === "tag" || action === "untag") && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-tags">Tags</label>
            <FormInput id="bulk-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="senior, remote" />
            <p className="mt-1 text-xs text-[var(--muted)]">Separate tags with commas.</p>
          </div>
        )}

        {action === "talent_pool" && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="bulk-pool">Pool</label>
              <select id="bulk-pool" className={selectClass} value={pool} onChange={(e) => setPool(e.target.value as TalentPool | "")}>
                <option value="">Choose a pool</option>
                <option value="silver_medalist">Silver medalist</option>
                <option value="general">General talent pool</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="bulk-pool-note">Note (optional)</label>
              <FormInput id="bulk-pool-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        )}

        {action === "remove_from_pool" && <p className="text-sm text-[var(--muted)]">These candidates will no longer appear in the talent pool. Their applications are not changed.</p>}

        {action === "email" && (
          <>
            <EmailTemplatePicker
              disabled={mutation.isPending}
              onPick={(template) => {
                setSubject(template.subject);
                setBody(template.body);
              }}
            />
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="bulk-subject">Subject</label>
              <FormInput id="bulk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="An update on your application for {{job}}" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="bulk-body">Message</label>
              <textarea id="bulk-body" className={`${textareaClass} min-h-40`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hi {{first_name}},\n\n..."} />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Personalise with {TEMPLATE_PLACEHOLDERS.map((placeholder) => <code key={placeholder} className="mr-1">{placeholder}</code>)}
                A note is added to each candidate's profile.
              </p>
            </div>
            {canSaveTemplates && <SaveTemplateButton subject={subject} body={body} />}
          </>
        )}

        {progress && mutation.isPending && <p className="text-xs text-[var(--muted)]" role="status">{progress.done} of {progress.total} done...</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Working..." : "Apply"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const rowTone = { created: "emerald", skipped: "amber", error: "red" } as const;

export function ImportCandidatesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);

  const jobsQuery = useQuery({ queryKey: ["recruitment", "jobs", "candidate-options"], queryFn: () => listJobOpenings() });
  const openJobs = (jobsQuery.data?.data ?? []).filter((job) => job.status === "open");

  const run = useMutation({
    mutationFn: ({ dryRun }: { dryRun: boolean }) => importCandidatesCsv(Number(jobId), file as File, dryRun),
    onSuccess: async (data) => {
      if (data.dry_run) {
        setPreview(data);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Import finished", `${data.created} candidate${data.created === 1 ? "" : "s"} imported.`);
      setDone(data);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function start(dryRun: boolean) {
    setError(null);
    if (!jobId) return setError("Choose the job these candidates are applying for.");
    if (!file) return setError("Choose a CSV file.");
    run.mutate({ dryRun });
  }

  function downloadTemplate() {
    saveBlob(new Blob([csvImportTemplate], { type: "text/csv" }), "candidates-template.csv");
  }

  const report = done ?? preview;

  return (
    <Modal title="Import candidates from CSV" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <FormError message={error} />

        {!done && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium" htmlFor="import-job">Job</label>
                <select id="import-job" className={selectClass} value={jobId} onChange={(e) => { setJobId(e.target.value ? Number(e.target.value) : ""); setPreview(null); }}>
                  <option value="">Select an open job</option>
                  {openJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium" htmlFor="import-file">CSV file</label>
                <input id="import-file" type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              </div>
            </div>
            <p className="text-[var(--muted)]">
              Columns: <code>full_name</code> and <code>email</code> are required; <code>phone</code>, <code>source</code>, <code>tags</code>, <code>skills</code>, <code>experience_years</code>,{" "}
              <code>rating</code> and <code>notes</code> are optional. Up to 500 rows. People already on this job are skipped.{" "}
              <button type="button" className="text-[var(--primary)] underline" onClick={downloadTemplate}>Download a template</button>
            </p>
          </>
        )}

        {report && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="emerald">{report.created} {report.dry_run ? "will be imported" : "imported"}</Badge>
              <Badge tone="amber">{report.skipped} skipped</Badge>
              {report.warnings > 0 && <Badge tone="blue">{report.warnings} also applied elsewhere</Badge>}
            </div>
            {report.rows.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--card)] text-[var(--muted)]">
                    <tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Result</th></tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.row} className="border-t border-[var(--border)]/60">
                        <td className="p-2">{row.row}</td>
                        <td className="p-2">{row.full_name ?? "-"}</td>
                        <td className="p-2">{row.email ?? "-"}</td>
                        <td className="p-2"><Badge tone={rowTone[row.status]}>{row.status}</Badge>{row.message && <span className="ml-2 text-[var(--muted)]">{row.message}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
          {!done && (
            <>
              <Button type="button" variant="outline" disabled={run.isPending} onClick={() => start(true)}>{run.isPending && !preview ? "Checking..." : "Preview"}</Button>
              <Button type="button" disabled={run.isPending || !preview || preview.created === 0} onClick={() => start(false)}>
                {run.isPending && preview ? "Importing..." : `Import ${preview?.created ?? ""}`.trim()}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
