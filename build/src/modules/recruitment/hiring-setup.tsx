import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "@/components/notifications/toast";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import {
  type CheckType,
  type JobOpening,
  type JobQuestionItem,
  type KnockoutOperator,
  type PipelineCategory,
  type PipelineStageInput,
  type QuestionType,
  checkTypeLabels,
  getJobQuestions,
  getPipeline,
  resetPipeline,
  savePipeline,
  saveJobQuestions,
  updateJobOpening,
} from "@/services/recruitment-service";
import { cn } from "@/utils/cn";
import { Badge, FormError, selectClass, textareaClass } from "./shared";

type SetupTab = "pipeline" | "questions" | "checks";

const categoryLabels: Record<PipelineCategory, string> = { applied: "Applied", screening: "Screening", interview: "Interview", offer: "Offer" };
const categoryOrder: PipelineCategory[] = ["applied", "screening", "interview", "offer"];

/** A wider dialog than the shared Modal: the editors below need room. */
export function WideModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-label={title}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        {children}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: pipeline, screening questions, required checks + referral bonus for one job
// ---------------------------------------------------------------------------

export function HiringSetupModal({ job, canEdit, onClose }: { job: JobOpening; canEdit: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SetupTab>("pipeline");
  const tabs: Array<{ id: SetupTab; label: string }> = [
    { id: "pipeline", label: "Pipeline stages" },
    { id: "questions", label: "Screening questions" },
    { id: "checks", label: "Checks & referrals" },
  ];

  return (
    <WideModal title={`Hiring setup: ${job.title}`} onClose={onClose}>
      <div role="tablist" aria-label="Hiring setup sections" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", tab === item.id ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "pipeline" && <PipelineEditor jobId={job.id} canEdit={canEdit} />}
      {tab === "questions" && <QuestionsEditor jobId={job.id} canEdit={canEdit} />}
      {tab === "checks" && <ChecksAndReferralSettings job={job} canEdit={canEdit} />}
      <div className="mt-5 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
      </div>
    </WideModal>
  );
}

// ---------------------------------------------------------------------------
// Pipeline editor (a job, or the company default when jobId is null)
// ---------------------------------------------------------------------------

interface DraftStage extends PipelineStageInput {
  key: string;
}

let draftCounter = 0;
const draftKey = () => `draft-${++draftCounter}`;

export function PipelineEditor({ jobId, canEdit }: { jobId: number | null; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const pipelineQuery = useQuery({ queryKey: ["recruitment", "pipeline", jobId], queryFn: () => getPipeline(jobId) });
  const [stages, setStages] = useState<DraftStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (pipelineQuery.data && !dirty) {
      setStages(pipelineQuery.data.stages.map((stage) => ({ key: draftKey(), id: stage.id, name: stage.name, category: stage.category, is_skippable: stage.is_skippable })));
    }
  }, [pipelineQuery.data, dirty]);

  const scope = pipelineQuery.data?.scope;
  const counts = pipelineQuery.data?.candidate_counts ?? {};
  const inherited = scope !== undefined && ((jobId !== null && scope !== "job") || (jobId === null && scope === "default"));

  const refresh = async () => {
    setDirty(false);
    await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
  };

  const saveMutation = useMutation({
    mutationFn: () => savePipeline(jobId, stages.map(({ key: _key, ...stage }) => ({ ...stage, name: stage.name.trim() }))),
    onSuccess: async () => {
      await refresh();
      toast.success("Pipeline saved", jobId ? "This job now uses its own stages." : "The default stages were saved.");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPipeline(jobId),
    onSuccess: async () => {
      await refresh();
      toast.success("Pipeline reset", jobId ? "This job uses the default stages again." : "The built-in stages are back.");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function change(index: number, patch: Partial<DraftStage>) {
    setDirty(true);
    setStages((current) => current.map((stage, position) => (position === index ? { ...stage, ...patch } : stage)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setDirty(true);
    setStages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function add(category: PipelineCategory) {
    setDirty(true);
    setStages((current) => {
      // Insert after the last stage of this category so the order of categories is kept.
      const lastOfCategory = current.reduce((found, stage, position) => (categoryOrder.indexOf(stage.category) <= categoryOrder.indexOf(category) ? position : found), -1);
      const next = [...current];
      next.splice(lastOfCategory + 1, 0, { key: draftKey(), id: null, name: "", category, is_skippable: true });
      return next;
    });
  }

  function remove(index: number) {
    setDirty(true);
    setStages((current) => current.filter((_, position) => position !== index));
  }

  function validate(): string | null {
    if (stages.some((stage) => !stage.name.trim())) return "Give every stage a name.";
    const names = stages.map((stage) => stage.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return "Stage names must be unique.";
    const missing = categoryOrder.filter((category) => !stages.some((stage) => stage.category === category));
    if (missing.length) return `Keep at least one stage in each of: ${missing.map((category) => categoryLabels[category]).join(", ")}.`;
    let previous = -1;
    for (const stage of stages) {
      const position = categoryOrder.indexOf(stage.category);
      if (position < previous) return "Stages must stay in order: Applied, Screening, Interview, Offer. Move a stage or change its group.";
      previous = position;
    }
    if (stages[0].category !== "applied" || stages[0].is_skippable) return "The first stage must be an Applied stage and cannot be skippable.";
    return null;
  }

  function submit() {
    const problem = validate();
    setError(problem);
    if (!problem) saveMutation.mutate();
  }

  if (pipelineQuery.isLoading) return <p className="text-sm text-[var(--muted)]">Loading...</p>;
  if (pipelineQuery.isError) return <FormError message={`Could not load the pipeline. ${(pipelineQuery.error as Error).message}`} />;

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <p className="text-sm text-[var(--muted)]">
        {jobId
          ? "Add the steps this job really uses, such as a technical test or reference check. Every stage belongs to a group (Applied, Screening, Interview, Offer) so reports and offers keep working."
          : "These stages are used by every job that does not define its own."}
        {" "}Candidates move forward one stage at a time unless the stage in between is marked skippable; going back is only possible within a group. A rejected candidate can be reopened to the stage they were rejected from, or an earlier one.
      </p>
      {inherited && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {scope === "company" ? "This job currently uses the company default stages." : "These are the built-in stages."} Saving creates {jobId ? "a pipeline for this job only" : "your default stages"}.
        </p>
      )}

      <ol className="space-y-2">
        {stages.map((stage, index) => (
          <li key={stage.key} className="grid items-center gap-2 rounded-xl border border-[var(--border)] p-2 md:grid-cols-[2rem_1fr_9rem_auto_auto]">
            <span className="text-center text-xs text-[var(--muted)]">{index + 1}</span>
            <FormInput aria-label={`Stage ${index + 1} name`} value={stage.name} disabled={!canEdit} maxLength={80} placeholder="Stage name" onChange={(e) => change(index, { name: e.target.value })} />
            <select aria-label={`Stage ${index + 1} group`} className={selectClass} value={stage.category} disabled={!canEdit} onChange={(e) => change(index, { category: e.target.value as PipelineCategory })}>
              {categoryOrder.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={stage.is_skippable} disabled={!canEdit || index === 0} onChange={(e) => change(index, { is_skippable: e.target.checked })} />
              Skippable
            </label>
            {canEdit && (
              <div className="flex items-center justify-end gap-1">
                {jobId !== null && counts[String(index)] ? <Badge tone="blue">{counts[String(index)]} here</Badge> : null}
                <Button type="button" variant="ghost" aria-label={`Move stage ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                <Button type="button" variant="ghost" aria-label={`Move stage ${index + 1} down`} disabled={index === stages.length - 1} onClick={() => move(index, 1)}>↓</Button>
                <Button type="button" variant="ghost" aria-label={`Remove stage ${index + 1}`} disabled={stages.length <= 4} onClick={() => remove(index)}>✕</Button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--muted)]">Add a stage to:</span>
          {categoryOrder.map((category) => (
            <Button key={category} type="button" variant="outline" disabled={stages.length >= 15} onClick={() => add(category)}>{categoryLabels[category]}</Button>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">Hired and Rejected always come last and cannot be changed. Removing a stage moves its candidates to the next stage in the same group.</p>

      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          {!inherited && (
            <Button type="button" variant="outline" disabled={resetMutation.isPending} onClick={() => resetMutation.mutate()}>
              {jobId ? "Use default stages" : "Restore built-in stages"}
            </Button>
          )}
          <Button type="button" disabled={saveMutation.isPending || !dirty} onClick={submit}>{saveMutation.isPending ? "Saving..." : "Save pipeline"}</Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screening questions
// ---------------------------------------------------------------------------

const typeLabels: Record<QuestionType, string> = {
  yes_no: "Yes / No",
  number: "Number",
  text: "Short text",
  textarea: "Long text",
  single_choice: "Pick one",
  multi_choice: "Pick several",
  date: "Date",
};

const operatorLabels: Record<KnockoutOperator, string> = {
  eq: "must be",
  neq: "must not be",
  gte: "must be at least",
  lte: "must be at most",
  in: "must be one of",
  not_in: "must not be",
};

const operatorsByType: Partial<Record<QuestionType, KnockoutOperator[]>> = {
  yes_no: ["eq"],
  number: ["gte", "lte", "eq", "neq"],
  date: ["gte", "lte"],
  single_choice: ["in", "not_in"],
  multi_choice: ["in", "not_in"],
};

interface DraftQuestion {
  key: string;
  id?: number;
  label: string;
  help_text: string;
  type: QuestionType;
  options: string;
  required: boolean;
  knockoutOn: boolean;
  operator: KnockoutOperator;
  value: string;
  values: string[];
}

function toDraft(question: JobQuestionItem): DraftQuestion {
  const rule = question.knockout;
  return {
    key: draftKey(),
    id: question.id,
    label: question.label,
    help_text: question.help_text ?? "",
    type: question.type,
    options: (question.options ?? []).join("\n"),
    required: question.required,
    knockoutOn: Boolean(rule),
    operator: rule?.operator ?? operatorsByType[question.type]?.[0] ?? "eq",
    value: rule && !Array.isArray(rule.value) ? String(rule.value) : question.type === "yes_no" ? "yes" : "",
    values: rule && Array.isArray(rule.value) ? rule.value : [],
  };
}

const optionList = (draft: DraftQuestion) => draft.options.split("\n").map((option) => option.trim()).filter(Boolean);

function toPayload(draft: DraftQuestion): JobQuestionItem {
  const choice = draft.type === "single_choice" || draft.type === "multi_choice";
  const knockoutAllowed = Boolean(operatorsByType[draft.type]);
  let knockout: JobQuestionItem["knockout"] = null;

  if (draft.knockoutOn && knockoutAllowed) {
    knockout = choice
      ? { operator: draft.operator, value: draft.values.filter((value) => optionList(draft).includes(value)) }
      : { operator: draft.operator, value: draft.type === "number" ? Number(draft.value) : draft.value };
  }

  return {
    id: draft.id,
    label: draft.label.trim(),
    help_text: draft.help_text.trim() || null,
    type: draft.type,
    options: choice ? optionList(draft) : null,
    required: draft.required || knockout !== null,
    knockout,
  };
}

export function QuestionsEditor({ jobId, canEdit }: { jobId: number; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const questionsQuery = useQuery({ queryKey: ["recruitment", "job-questions", jobId], queryFn: () => getJobQuestions(jobId) });
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [autoReject, setAutoReject] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (questionsQuery.data && !dirty) {
      setDrafts(questionsQuery.data.questions.map(toDraft));
      setAutoReject(questionsQuery.data.auto_reject_knockouts);
    }
  }, [questionsQuery.data, dirty]);

  const saveMutation = useMutation({
    mutationFn: () => saveJobQuestions(jobId, drafts.map(toPayload), autoReject),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "job-questions", jobId] });
      toast.success("Questions saved", "Applicants on the careers page will see them.");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function update(index: number, patch: Partial<DraftQuestion>) {
    setDirty(true);
    setDrafts((current) => current.map((draft, position) => {
      if (position !== index) return draft;
      const next = { ...draft, ...patch };
      // Changing the type resets what depends on it.
      if (patch.type && patch.type !== draft.type) {
        next.operator = operatorsByType[patch.type]?.[0] ?? "eq";
        next.value = patch.type === "yes_no" ? "yes" : "";
        next.values = [];
        next.knockoutOn = false;
      }
      return next;
    }));
  }

  function add() {
    setDirty(true);
    setDrafts((current) => [...current, { key: draftKey(), label: "", help_text: "", type: "yes_no", options: "", required: true, knockoutOn: false, operator: "eq", value: "yes", values: [] }]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= drafts.length) return;
    setDirty(true);
    setDrafts((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function submit() {
    for (const [index, draft] of drafts.entries()) {
      if (!draft.label.trim()) return setError(`Question ${index + 1} needs wording.`);
      if ((draft.type === "single_choice" || draft.type === "multi_choice") && optionList(draft).length < 2) return setError(`Question ${index + 1} needs at least two options, one per line.`);
      if (draft.knockoutOn) {
        const choice = draft.type === "single_choice" || draft.type === "multi_choice";
        if (choice && draft.values.filter((value) => optionList(draft).includes(value)).length === 0) return setError(`Question ${index + 1}: pick the answers that pass.`);
        if (!choice && draft.value === "") return setError(`Question ${index + 1}: enter the value that passes.`);
      }
    }
    setError(null);
    saveMutation.mutate();
  }

  if (questionsQuery.isLoading) return <p className="text-sm text-[var(--muted)]">Loading...</p>;
  if (questionsQuery.isError) return <FormError message={`Could not load the questions. ${(questionsQuery.error as Error).message}`} />;

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <p className="text-sm text-[var(--muted)]">
        Questions appear on the public application form. A knockout rule describes the answer that is <strong>acceptable</strong>; any other answer fails the application. A question with a knockout rule is always required.
      </p>

      <label className="flex items-start gap-2 rounded-xl border border-[var(--border)] p-3 text-sm">
        <input type="checkbox" className="mt-0.5" checked={autoReject} disabled={!canEdit} onChange={(e) => { setDirty(true); setAutoReject(e.target.checked); }} />
        <span>
          <strong>Reject automatically when a knockout rule fails.</strong>
          <span className="block text-xs text-[var(--muted)]">The applicant is moved to Rejected with the question named as the reason, and receives a polite decline. Turn this off to only flag the application for a person to review.</span>
        </span>
      </label>

      <ol className="space-y-3">
        {drafts.map((draft, index) => {
          const choice = draft.type === "single_choice" || draft.type === "multi_choice";
          const operators = operatorsByType[draft.type];
          return (
            <li key={draft.key} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_10rem]">
                <FormInput aria-label={`Question ${index + 1} wording`} value={draft.label} disabled={!canEdit} maxLength={300} placeholder="e.g. Are you authorised to work in Pakistan?" onChange={(e) => update(index, { label: e.target.value })} />
                <select aria-label={`Question ${index + 1} type`} className={selectClass} value={draft.type} disabled={!canEdit} onChange={(e) => update(index, { type: e.target.value as QuestionType })}>
                  {(Object.keys(typeLabels) as QuestionType[]).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
                </select>
              </div>
              <FormInput aria-label={`Question ${index + 1} hint`} value={draft.help_text} disabled={!canEdit} maxLength={300} placeholder="Optional hint shown under the question" onChange={(e) => update(index, { help_text: e.target.value })} />
              {choice && (
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor={`options-${draft.key}`}>Options (one per line)</label>
                  <textarea id={`options-${draft.key}`} className={cn(textareaClass, "min-h-20")} value={draft.options} disabled={!canEdit} onChange={(e) => update(index, { options: e.target.value })} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={draft.required || draft.knockoutOn} disabled={!canEdit || draft.knockoutOn} onChange={(e) => update(index, { required: e.target.checked })} /> Required
                </label>
                {operators && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.knockoutOn} disabled={!canEdit} onChange={(e) => update(index, { knockoutOn: e.target.checked })} /> Knockout question
                  </label>
                )}
                {canEdit && (
                  <span className="ml-auto flex gap-1">
                    <Button type="button" variant="ghost" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                    <Button type="button" variant="ghost" aria-label={`Move question ${index + 1} down`} disabled={index === drafts.length - 1} onClick={() => move(index, 1)}>↓</Button>
                    <Button type="button" variant="ghost" aria-label={`Remove question ${index + 1}`} onClick={() => { setDirty(true); setDrafts((current) => current.filter((_, position) => position !== index)); }}>✕</Button>
                  </span>
                )}
              </div>
              {draft.knockoutOn && operators && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                  <span>The answer</span>
                  {operators.length > 1 ? (
                    <select aria-label={`Question ${index + 1} rule`} className="h-9 rounded-lg border border-amber-300 bg-white px-2" value={draft.operator} disabled={!canEdit} onChange={(e) => update(index, { operator: e.target.value as KnockoutOperator })}>
                      {operators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
                    </select>
                  ) : (
                    <strong>{operatorLabels[operators[0]]}</strong>
                  )}
                  {draft.type === "yes_no" && (
                    <select aria-label={`Question ${index + 1} passing answer`} className="h-9 rounded-lg border border-amber-300 bg-white px-2" value={draft.value} disabled={!canEdit} onChange={(e) => update(index, { value: e.target.value })}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  )}
                  {(draft.type === "number" || draft.type === "date") && (
                    <input aria-label={`Question ${index + 1} passing value`} type={draft.type === "number" ? "number" : "date"} className="h-9 rounded-lg border border-amber-300 bg-white px-2" value={draft.value} disabled={!canEdit} onChange={(e) => update(index, { value: e.target.value })} />
                  )}
                  {choice && (
                    <span className="flex flex-wrap gap-3">
                      {optionList(draft).map((option) => (
                        <label key={option} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={draft.values.includes(option)}
                            disabled={!canEdit}
                            onChange={(e) => update(index, { values: e.target.checked ? [...draft.values, option] : draft.values.filter((value) => value !== option) })}
                          />
                          {option}
                        </label>
                      ))}
                      {optionList(draft).length === 0 && <em>add the options first</em>}
                    </span>
                  )}
                  <span>or the application fails.</span>
                </div>
              )}
            </li>
          );
        })}
        {drafts.length === 0 && <li className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted)]">No questions yet. Work authorisation, notice period, expected salary and years of experience are common ones.</li>}
      </ol>

      {canEdit && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" disabled={drafts.length >= 25} onClick={add}>Add question</Button>
          <Button type="button" disabled={saveMutation.isPending || !dirty} onClick={submit}>{saveMutation.isPending ? "Saving..." : "Save questions"}</Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Required checks and the referral bonus of a job
// ---------------------------------------------------------------------------

function ChecksAndReferralSettings({ job, canEdit }: { job: JobOpening; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [required, setRequired] = useState<CheckType[]>(job.required_checks ?? []);
  const [bonus, setBonus] = useState<number | "">(job.referral_bonus_amount != null && job.referral_bonus_amount !== "" ? Number(job.referral_bonus_amount) : "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateJobOpening(job.id, { required_checks: required, referral_bonus_amount: bonus === "" ? null : Number(bonus) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Saved", "The hiring rules for this job were updated.");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const toggle = (type: CheckType, on: boolean) => setRequired((current) => (on ? [...current, type] : current.filter((item) => item !== type)));

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <fieldset className="space-y-2 rounded-xl border border-[var(--border)] p-3">
        <legend className="px-1 text-sm font-medium">Checks that must be cleared before hiring</legend>
        {(Object.keys(checkTypeLabels) as CheckType[]).map((type) => (
          <label key={type} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required.includes(type)} disabled={!canEdit} onChange={(e) => toggle(type, e.target.checked)} />
            {checkTypeLabels[type]}
          </label>
        ))}
        <p className="text-xs text-[var(--muted)]">A hire is blocked until at least one check of each ticked type exists and every one of them has passed or been waived (waiving needs a reason and recruitment settings access). Add the checks from the candidate's Checks tab.</p>
      </fieldset>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="job-referral-bonus">Employee referral bonus for this job{job.salary_currency ? ` (${job.salary_currency})` : ""}</label>
        <FormInput id="job-referral-bonus" type="number" min={0} disabled={!canEdit} value={bonus} placeholder="Use the company default" onChange={(e) => setBonus(e.target.value === "" ? "" : Number(e.target.value))} />
        <p className="mt-1 text-xs text-[var(--muted)]">Paid to the employee who referred the person who is hired, after the waiting period set in the careers settings.</p>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" disabled={mutation.isPending} onClick={() => { setError(null); mutation.mutate(); }}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
