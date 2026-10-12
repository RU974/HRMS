import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  Candidate,
  CandidatePayload,
  CandidateStage,
  HireResult,
  SourceType,
  TalentPool,
  candidateStageLabels,
  candidateStageOptions,
  changeCandidateStage,
  createCandidate,
  getCandidate,
  hireCandidate,
  listAgencies,
  listJobOpenings,
  listOnboardingTemplates,
  sourceTypeLabels,
  parseResumeFile,
  updateCandidate,
  uploadCandidateResume,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { FormError, PersonSelect, formatMoney, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

function useRefreshRecruitment() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });
}

// ---------------------------------------------------------------------------
// Reject with a reason
// ---------------------------------------------------------------------------

export function RejectModal({ candidate, onClose, onDone }: { candidate: Pick<Candidate, "id" | "full_name">; onClose: () => void; onDone?: () => void }) {
  const refresh = useRefreshRecruitment();
  const [reason, setReason] = useState("");
  const [pool, setPool] = useState<TalentPool | "">("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => changeCandidateStage(candidate.id, "rejected", reason.trim(), pool || undefined),
    onSuccess: async () => {
      await refresh();
      toast.success("Candidate rejected", pool ? `${candidate.full_name} was rejected and kept in the talent pool.` : `${candidate.full_name} was moved to Rejected.`);
      onDone?.();
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Enter a reason. It helps with reporting and any future reopening.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal title={`Reject ${candidate.full_name}?`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="reject-reason">Reason</label>
          <textarea id="reject-reason" className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Salary expectations above budget" autoFocus />
          <p className="mt-1 text-xs text-[var(--muted)]">Any open offer for this candidate will be withdrawn.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="reject-pool">Keep for future roles?</label>
          <select id="reject-pool" className={selectClass} value={pool} onChange={(e) => setPool(e.target.value as TalentPool | "")}>
            <option value="">No, just reject</option>
            <option value="silver_medalist">Yes, as a silver medalist (a strong finalist)</option>
            <option value="general">Yes, in the general talent pool</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Rejecting..." : "Reject candidate"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Hire
// ---------------------------------------------------------------------------

export function HireModal({ candidateId, onClose }: { candidateId: number; onClose: () => void }) {
  const refresh = useRefreshRecruitment();
  const canSkipOffer = useAuthStore((state) => state.hasPermission("recruitment:manage_settings"));
  const [salary, setSalary] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [skipOffer, setSkipOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HireResult | null>(null);

  const candidateQuery = useQuery({ queryKey: ["recruitment", "candidate", candidateId], queryFn: () => getCandidate(candidateId) });
  const templatesQuery = useQuery({ queryKey: ["recruitment", "onboarding-templates"], queryFn: listOnboardingTemplates });

  const candidate = candidateQuery.data;
  const acceptedOffer = candidate?.offers?.find((offer) => offer.status === "accepted");
  const templates = templatesQuery.data ?? [];

  useEffect(() => {
    if (templateId === "" && templates.length > 0) {
      const preferred = templates.find((template) => template.is_default);
      if (preferred) setTemplateId(preferred.id);
    }
  }, [templates, templateId]);

  useEffect(() => {
    if (acceptedOffer?.start_date && !joiningDate) setJoiningDate(acceptedOffer.start_date.slice(0, 10));
  }, [acceptedOffer, joiningDate]);

  const mutation = useMutation({
    mutationFn: () =>
      hireCandidate(candidateId, {
        joining_date: joiningDate || null,
        template_id: templateId === "" ? null : templateId,
        ...(acceptedOffer ? {} : { salary: Number(salary), skip_offer: true }),
      }),
    onSuccess: async (data) => {
      await refresh();
      toast.success("Candidate hired", `${data.employee.name} is now an employee.`);
      setResult(data);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!acceptedOffer) {
      const value = Number(salary);
      if (!skipOffer) {
        setError("This candidate has no accepted offer. Accept an offer first, or confirm hiring without one.");
        return;
      }
      if (salary.trim() === "" || Number.isNaN(value) || value < 0) {
        setError("Enter a valid salary.");
        return;
      }
    }

    mutation.mutate();
  }

  if (result) {
    return (
      <Modal title="Candidate hired" onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>{result.employee.name} is now an employee and onboarding has been opened.</p>
          {result.temp_password ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">Temporary password (shown only once)</p>
              <p className="mt-1 select-all font-mono text-base">{result.temp_password}</p>
              <p className="mt-2 text-xs">Share it securely with {result.employee.email}. They can sign in with it and then change it.</p>
            </div>
          ) : (
            <p className="text-[var(--muted)]">This person already had a login, so no new password was created.</p>
          )}
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Hire ${candidate?.full_name ?? "candidate"}?`} onClose={onClose}>
      {candidateQuery.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--border)]/20 p-3 text-sm">
            <p className="font-medium">This will create:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>An employee record as "{candidate?.job_opening?.title ?? "the job title"}" in the job's department</li>
              <li>A login account for {candidate?.email} (temporary password shown once)</li>
              <li>An onboarding record{templateId !== "" ? " with the tasks from the selected template" : ""}</li>
            </ul>
          </div>
          <FormError message={error} />

          {acceptedOffer ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">Accepted offer</p>
              <p>Salary {formatMoney(acceptedOffer.salary, acceptedOffer.currency)} · starts {formatRecruitmentDate(acceptedOffer.start_date)}</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">No accepted offer on file</p>
              {canSkipOffer ? (
                <>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={skipOffer} onChange={(e) => setSkipOffer(e.target.checked)} />
                    Hire without an accepted offer
                  </label>
                  {skipOffer && (
                    <div>
                      <label className="mb-1 block font-medium" htmlFor="hire-salary">Salary</label>
                      <FormInput id="hire-salary" type="number" min={0} step="any" value={salary} onChange={(e) => setSalary(e.target.value)} />
                    </div>
                  )}
                </>
              ) : (
                <p>Create an offer, get it approved, send it and record its acceptance before hiring.</p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="hire-date">Joining date</label>
              <FormInput id="hire-date" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="hire-template">Onboarding template</label>
              <select id="hire-template" className={selectClass} value={templateId} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">No template</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (default)" : ""}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || (!acceptedOffer && !canSkipOffer)}>
              {mutation.isPending ? "Hiring..." : "Confirm hire"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

const emptyForm: CandidatePayload = {
  job_opening_id: 0,
  full_name: "",
  email: "",
  phone: "",
  source: "",
  stage: "applied",
  rejection_reason: "",
  rating: null,
  status: "active",
  applied_at: null,
  notes: "",
  tags: [],
  source_type: null,
  referrer_employee_id: null,
  agency_id: null,
};

export function CandidateFormModal({ candidate, onClose }: { candidate?: Candidate | null; onClose: () => void }) {
  const refresh = useRefreshRecruitment();
  const [form, setForm] = useState<CandidatePayload>(() =>
    candidate
      ? {
          job_opening_id: candidate.job_opening_id,
          full_name: candidate.full_name,
          email: candidate.email,
          phone: candidate.phone ?? "",
          source: candidate.source ?? "",
          stage: candidate.stage,
          rejection_reason: "",
          rating: candidate.rating ?? null,
          status: candidate.status,
          applied_at: candidate.applied_at ? candidate.applied_at.slice(0, 10) : null,
          notes: candidate.notes ?? "",
          tags: candidate.tags ?? [],
          source_type: candidate.source_type ?? null,
          referrer_employee_id: candidate.referrer_employee_id ?? null,
          agency_id: candidate.agency_id ?? null,
        }
      : emptyForm
  );
  const [tagsText, setTagsText] = useState((candidate?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsedNote, setParsedNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const jobsQuery = useQuery({ queryKey: ["recruitment", "jobs", "candidate-options"], queryFn: () => listJobOpenings() });
  const agenciesQuery = useQuery({ queryKey: ["recruitment", "agencies"], queryFn: listAgencies, enabled: form.source_type === "agency" });
  const agencies = (agenciesQuery.data ?? []).filter((agency) => agency.is_active || agency.id === form.agency_id);
  const jobs = (jobsQuery.data?.data ?? []).filter((job) => job.status === "open" || job.id === form.job_opening_id);
  const stageChoices: CandidateStage[] = candidate ? candidateStageOptions[candidate.stage] : ["applied", "screening"];
  const rejecting = candidate ? form.stage === "rejected" && candidate.stage !== "rejected" : false;

  const mutation = useMutation({
    mutationFn: async (payload: CandidatePayload) => {
      if (candidate) return updateCandidate(candidate.id, payload);

      const created = await createCandidate(payload);

      // The profile exists now; a failed resume upload must not make the user create it twice.
      if (resumeFile) {
        try {
          await uploadCandidateResume(created.id, resumeFile);
        } catch (uploadError) {
          toast.error("Resume not saved", `${created.full_name} was added, but the resume could not be uploaded: ${(uploadError as Error).message}`);
        }
      }

      return created;
    },
    onSuccess: async (saved) => {
      await refresh();
      const others = !candidate ? saved.duplicates ?? [] : [];

      if (others.length > 0) {
        toast.info("Candidate added", `${saved.full_name} has also applied for ${others.map((other) => other.job_title ?? "another job").join(", ")}.`);
      } else {
        toast.success(candidate ? "Candidate updated" : "Candidate added", candidate ? "Candidate details saved successfully." : "Candidate profile created successfully.");
      }
      onClose();
    },
    onError: (mutationError: Error) => {
      toast.error("Save failed", mutationError.message);
      setError(mutationError.message);
    },
  });

  function set<K extends keyof CandidatePayload>(key: K, value: CandidatePayload[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  /** Read the CV and fill only the fields the recruiter has not typed yet. */
  async function chooseResume(file: File | null) {
    setResumeFile(file);
    setParsedNote(null);
    if (!file) return;

    setReading(true);
    try {
      const parsed = await parseResumeFile(file);
      const filled: string[] = [];

      setForm((previous) => {
        const next = { ...previous };
        if (!previous.full_name.trim() && parsed.name) { next.full_name = parsed.name; filled.push("name"); }
        if (!previous.email.trim() && parsed.email) { next.email = parsed.email; filled.push("email"); }
        if (!previous.phone?.trim() && parsed.phone) { next.phone = parsed.phone; filled.push("phone"); }
        return next;
      });

      const extras = [
        parsed.skills.length > 0 ? `${parsed.skills.length} skills` : null,
        parsed.experience_years != null ? `${parsed.experience_years} years of experience` : null,
      ].filter(Boolean);

      setParsedNote(
        filled.length === 0 && extras.length === 0
          ? "Nothing could be read from this file. Fill in the details by hand."
          : `Read from the resume: ${[...filled, ...extras].join(", ")}. Check the details, then save.`
      );
    } catch (parseError) {
      setParsedNote(`The resume could not be read (${(parseError as Error).message}). You can still fill in the details by hand.`);
    } finally {
      setReading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.job_opening_id || !form.full_name.trim() || !form.email.trim()) {
      setError("Job, full name, and email are required.");
      return;
    }
    if (rejecting && !form.rejection_reason?.trim()) {
      setError("Enter a reason for rejecting this candidate.");
      return;
    }
    if (form.source_type === "referral" && !form.referrer_employee_id) {
      setError("Choose the employee who referred this candidate.");
      return;
    }
    if (form.source_type === "agency" && !form.agency_id) {
      setError("Choose the agency that supplied this candidate.");
      return;
    }

    const tags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);

    mutation.mutate({
      ...form,
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone?.trim() || "",
      source: form.source?.trim() || "",
      notes: form.notes?.trim() || "",
      applied_at: form.applied_at || null,
      source_type: form.source_type || null,
      referrer_employee_id: form.source_type === "referral" ? form.referrer_employee_id : null,
      agency_id: form.source_type === "agency" ? form.agency_id : null,
      tags,
      rejection_reason: rejecting ? form.rejection_reason?.trim() : undefined,
    });
  }

  return (
    <Modal title={candidate ? "Edit Candidate" : "Create Candidate"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        {!candidate && (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3">
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-resume">Resume (PDF or Word, optional)</label>
            <input
              id="cand-resume"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="block w-full text-sm"
              onChange={(e) => void chooseResume(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              {reading ? "Reading the resume..." : parsedNote ?? "Pick a resume and the name, email and phone are filled in for you. Skills and experience are saved with it."}
            </p>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-job">Job Opening</label>
            <select id="cand-job" className={selectClass} value={form.job_opening_id || ""} onChange={(e) => set("job_opening_id", Number(e.target.value))}>
              <option value="">Select job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-name">Full Name</label>
            <FormInput id="cand-name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-email">Email</label>
            <FormInput id="cand-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-phone">Phone</label>
            <FormInput id="cand-phone" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-source">Source</label>
            <FormInput id="cand-source" value={form.source ?? ""} onChange={(e) => set("source", e.target.value)} placeholder="Referral, LinkedIn, website..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-source-type">Where did they come from?</label>
            <select
              id="cand-source-type"
              className={selectClass}
              value={form.source_type ?? ""}
              onChange={(e) => setForm((previous) => ({ ...previous, source_type: (e.target.value || null) as SourceType | null, referrer_employee_id: null, agency_id: null }))}
            >
              <option value="">Not recorded</option>
              {(Object.keys(sourceTypeLabels) as SourceType[]).map((type) => <option key={type} value={type}>{sourceTypeLabels[type]}</option>)}
            </select>
          </div>
          {form.source_type === "referral" && (
            <PersonSelect
              label="Referred by"
              valueKey="employee_id"
              value={form.referrer_employee_id ?? null}
              currentName={candidate?.referrer?.name}
              placeholder="Choose the employee"
              onChange={(value) => set("referrer_employee_id", value)}
            />
          )}
          {form.source_type === "agency" && (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="cand-agency">Agency</label>
              <select id="cand-agency" className={selectClass} value={form.agency_id ?? ""} onChange={(e) => set("agency_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choose an agency</option>
                {candidate?.agency && !agencies.some((agency) => agency.id === candidate.agency?.id) && <option value={candidate.agency.id}>{candidate.agency.name}</option>}
                {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
              </select>
              {agenciesQuery.isSuccess && agencies.length === 0 && <p className="mt-1 text-xs text-[var(--muted)]">No agencies yet. Add them on the Referrals page.</p>}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-tags">Tags</label>
            <FormInput id="cand-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="php, senior, remote" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-stage">Stage</label>
            <select id="cand-stage" className={selectClass} disabled={candidate?.stage === "hired"} value={form.stage ?? "applied"} onChange={(e) => set("stage", e.target.value as CandidateStage)}>
              {stageChoices.map((stage) => <option key={stage} value={stage}>{candidateStageLabels[stage]}</option>)}
            </select>
            {candidate?.stage === "offer" && <p className="mt-1 text-xs text-[var(--muted)]">Use the Hire button to hire this candidate.</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-status">Status</label>
            <select id="cand-status" className={selectClass} value={form.status ?? "active"} onChange={(e) => set("status", e.target.value as "active" | "inactive")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-rating">Rating (1-5)</label>
            <FormInput id="cand-rating" type="number" min={1} max={5} value={form.rating ?? ""} onChange={(e) => set("rating", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-applied">Applied At</label>
            <FormInput id="cand-applied" type="date" value={form.applied_at ?? ""} onChange={(e) => set("applied_at", e.target.value || null)} />
          </div>
        </div>
        {rejecting && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cand-reject">Rejection reason</label>
            <textarea id="cand-reject" className={textareaClass} value={form.rejection_reason ?? ""} onChange={(e) => set("rejection_reason", e.target.value)} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="cand-notes">Notes</label>
          <textarea id="cand-notes" className={textareaClass} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Screening notes, feedback, or next-step details." />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : candidate ? "Update" : "Create"}</Button>
        </div>
      </form>
    </Modal>
  );
}
