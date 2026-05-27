import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  Candidate,
  CandidatePayload,
  CandidateStage,
  Interview,
  InterviewPayload,
  JobOpening,
  JobOpeningPayload,
  OnboardingPayload,
  createCandidate,
  createInterview,
  createJobOpening,
  createOnboarding,
  deleteCandidate,
  deleteInterview,
  deleteJobOpening,
  deleteOnboarding,
  listCandidates,
  listInterviews,
  listJobOpenings,
  listOnboarding,
  updateCandidate,
  updateInterview,
  updateJobOpening,
  updateOnboarding,
} from "@/services/recruitment-service";

type RecruitmentTab = "jobs" | "candidates" | "interviews" | "onboarding";

const defaultJobForm: JobOpeningPayload = { title: "", employment_type: "full_time", status: "open", open_positions: 1, location: "", description: "" };
const defaultCandidateForm: CandidatePayload = { job_opening_id: 0, full_name: "", email: "", phone: "", source: "", stage: "applied", status: "active", notes: "" };
const defaultInterviewForm: InterviewPayload = { candidate_id: 0, interviewer_name: "", interview_type: "technical", scheduled_at: "", result: "pending", feedback: "" };
const defaultOnboardingForm: OnboardingPayload = { candidate_id: 0, onboarding_status: "pending", onboarding_start_date: null, onboarding_notes: "" };

export function RecruitmentPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<RecruitmentTab>("candidates");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [editingOnboarding, setEditingOnboarding] = useState<Candidate | null>(null);

  const [jobForm, setJobForm] = useState<JobOpeningPayload>(defaultJobForm);
  const [candidateForm, setCandidateForm] = useState<CandidatePayload>(defaultCandidateForm);
  const [interviewForm, setInterviewForm] = useState<InterviewPayload>(defaultInterviewForm);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingPayload>(defaultOnboardingForm);

  const jobsQuery = useQuery({ queryKey: ["recruitment", "jobs", search], queryFn: () => listJobOpenings(search) });
  const candidatesQuery = useQuery({ queryKey: ["recruitment", "candidates", search], queryFn: () => listCandidates(search) });
  const interviewsQuery = useQuery({ queryKey: ["recruitment", "interviews", search], queryFn: () => listInterviews(search) });
  const onboardingQuery = useQuery({ queryKey: ["recruitment", "onboarding", search], queryFn: () => listOnboarding(search) });

  const createJobMutation = useMutation({ mutationFn: createJobOpening, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const updateJobMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<JobOpeningPayload> }) => updateJobOpening(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const deleteJobMutation = useMutation({ mutationFn: deleteJobOpening, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] }); }, onError: (mutationError: Error) => setError(mutationError.message) });

  const createCandidateMutation = useMutation({ mutationFn: createCandidate, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const updateCandidateMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<CandidatePayload> }) => updateCandidate(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] }); await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const deleteCandidateMutation = useMutation({ mutationFn: deleteCandidate, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] }); await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] }); await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] }); }, onError: (mutationError: Error) => setError(mutationError.message) });

  const createInterviewMutation = useMutation({ mutationFn: createInterview, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const updateInterviewMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<InterviewPayload> }) => updateInterview(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const deleteInterviewMutation = useMutation({ mutationFn: deleteInterview, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] }); }, onError: (mutationError: Error) => setError(mutationError.message) });

  const createOnboardingMutation = useMutation({ mutationFn: createOnboarding, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] }); await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const updateOnboardingMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<Omit<OnboardingPayload, "candidate_id">> }) => updateOnboarding(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] }); closeModal(); }, onError: (mutationError: Error) => setError(mutationError.message) });
  const deleteOnboardingMutation = useMutation({ mutationFn: deleteOnboarding, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] }); }, onError: (mutationError: Error) => setError(mutationError.message) });

  const jobs = jobsQuery.data?.data ?? [];
  const candidates = candidatesQuery.data?.data ?? [];
  const interviews = interviewsQuery.data?.data ?? [];
  const onboardings = onboardingQuery.data?.data ?? [];

  const hiredCandidates = useMemo(() => candidates.filter((c) => c.stage === "hired"), [candidates]);

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingJob(null);
    setEditingCandidate(null);
    setEditingInterview(null);
    setEditingOnboarding(null);
    setJobForm(defaultJobForm);
    setCandidateForm(defaultCandidateForm);
    setInterviewForm(defaultInterviewForm);
    setOnboardingForm(defaultOnboardingForm);
  }

  function openCreate() {
    closeModal();
    setModalOpen(true);
  }

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (activeTab === "jobs") {
      if (!jobForm.title.trim()) return setError("Job title is required.");
      if (editingJob) return updateJobMutation.mutate({ id: editingJob.id, payload: jobForm });
      return createJobMutation.mutate(jobForm);
    }
    if (activeTab === "candidates") {
      if (!candidateForm.job_opening_id || !candidateForm.full_name.trim() || !candidateForm.email.trim()) return setError("Job, full name and email are required.");
      if (editingCandidate) return updateCandidateMutation.mutate({ id: editingCandidate.id, payload: candidateForm });
      return createCandidateMutation.mutate(candidateForm);
    }
    if (activeTab === "interviews") {
      if (!interviewForm.candidate_id || !interviewForm.interviewer_name.trim() || !interviewForm.scheduled_at) return setError("Candidate, interviewer and schedule are required.");
      if (editingInterview) return updateInterviewMutation.mutate({ id: editingInterview.id, payload: interviewForm });
      return createInterviewMutation.mutate(interviewForm);
    }
    if (!onboardingForm.candidate_id) return setError("Candidate is required.");
    if (editingOnboarding) return updateOnboardingMutation.mutate({ id: editingOnboarding.id, payload: { onboarding_status: onboardingForm.onboarding_status, onboarding_start_date: onboardingForm.onboarding_start_date, onboarding_notes: onboardingForm.onboarding_notes } });
    return createOnboardingMutation.mutate(onboardingForm);
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this record?")) return;
    setError(null);
    if (activeTab === "jobs") return deleteJobMutation.mutateAsync(id);
    if (activeTab === "candidates") return deleteCandidateMutation.mutateAsync(id);
    if (activeTab === "interviews") return deleteInterviewMutation.mutateAsync(id);
    return deleteOnboardingMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Recruitment" subtitle="Manage jobs, candidates, interviews and onboarding with separate clean workflows." />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["candidates", "interviews", "jobs", "onboarding"] as RecruitmentTab[]).map((tab) => (
            <Button key={tab} variant={activeTab === tab ? "primary" : "outline"} onClick={() => { setActiveTab(tab); setError(null); }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Button>
          ))}
          <FormInput placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="ml-auto max-w-sm" />
          <Button onClick={openCreate}>New</Button>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                {activeTab === "jobs" && <><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Positions</th><th className="p-3">Location</th><th className="p-3 text-right">Actions</th></>}
                {activeTab === "candidates" && <><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Job</th><th className="p-3">Stage</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></>}
                {activeTab === "interviews" && <><th className="p-3">Candidate</th><th className="p-3">Interviewer</th><th className="p-3">Type</th><th className="p-3">Schedule</th><th className="p-3">Result</th><th className="p-3 text-right">Actions</th></>}
                {activeTab === "onboarding" && <><th className="p-3">Candidate</th><th className="p-3">Job</th><th className="p-3">Status</th><th className="p-3">Start Date</th><th className="p-3">Notes</th><th className="p-3 text-right">Actions</th></>}
              </tr>
            </thead>
            <tbody>
              {activeTab === "jobs" && jobs.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3 font-medium">{item.title}</td><td className="p-3">{item.employment_type}</td><td className="p-3">{item.status}</td><td className="p-3">{item.open_positions}</td><td className="p-3">{item.location ?? "-"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingJob(item); setJobForm({ title: item.title, employment_type: item.employment_type, location: item.location ?? "", description: item.description ?? "", status: item.status, open_positions: item.open_positions, posted_at: item.posted_at ?? null, closed_at: item.closed_at ?? null }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button></div></td></tr>)}
              {activeTab === "candidates" && candidates.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3 font-medium">{item.full_name}</td><td className="p-3">{item.email}</td><td className="p-3">{item.jobOpening?.title ?? "-"}</td><td className="p-3">{item.stage}</td><td className="p-3">{item.status}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingCandidate(item); setCandidateForm({ job_opening_id: item.job_opening_id, full_name: item.full_name, email: item.email, phone: item.phone ?? "", source: item.source ?? "", stage: item.stage, status: item.status, rating: item.rating ?? null, notes: item.notes ?? "" }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button></div></td></tr>)}
              {activeTab === "interviews" && interviews.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3 font-medium">{item.candidate?.full_name ?? "-"}</td><td className="p-3">{item.interviewer_name}</td><td className="p-3">{item.interview_type}</td><td className="p-3">{new Date(item.scheduled_at).toLocaleString()}</td><td className="p-3">{item.result}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingInterview(item); setInterviewForm({ candidate_id: item.candidate_id, interviewer_name: item.interviewer_name, interview_type: item.interview_type, scheduled_at: item.scheduled_at.slice(0, 16), result: item.result, feedback: item.feedback ?? "" }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button></div></td></tr>)}
              {activeTab === "onboarding" && onboardings.map((item) => <tr key={item.id} className="border-b border-[var(--border)]/60"><td className="p-3 font-medium">{item.full_name}</td><td className="p-3">{item.jobOpening?.title ?? "-"}</td><td className="p-3">{item.onboarding_status ?? "pending"}</td><td className="p-3">{item.onboarding_start_date ?? "-"}</td><td className="p-3">{item.onboarding_notes ?? "-"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditingOnboarding(item); setOnboardingForm({ candidate_id: item.id, onboarding_status: item.onboarding_status ?? "pending", onboarding_start_date: item.onboarding_start_date ?? null, onboarding_notes: item.onboarding_notes ?? "" }); setModalOpen(true); }}>Edit</Button><Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button></div></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={`${activeTab === "jobs" ? (editingJob ? "Edit Job" : "Create Job") : activeTab === "candidates" ? (editingCandidate ? "Edit Candidate" : "Create Candidate") : activeTab === "interviews" ? (editingInterview ? "Edit Interview" : "Create Interview") : (editingOnboarding ? "Edit Onboarding" : "Create Onboarding")}`} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            {activeTab === "jobs" && (
              <>
                <div><label className="mb-1 block text-sm font-medium">Title</label><FormInput value={jobForm.title} onChange={(e) => setJobForm((prev) => ({ ...prev, title: e.target.value }))} /></div>
                <div><label className="mb-1 block text-sm font-medium">Type</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={jobForm.employment_type} onChange={(e) => setJobForm((prev) => ({ ...prev, employment_type: e.target.value }))}><option value="full_time">Full Time</option><option value="part_time">Part Time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></div>
                <div><label className="mb-1 block text-sm font-medium">Status</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={jobForm.status} onChange={(e) => setJobForm((prev) => ({ ...prev, status: e.target.value as "open" | "closed" | "on_hold" }))}><option value="open">Open</option><option value="closed">Closed</option><option value="on_hold">On Hold</option></select></div>
                <div><label className="mb-1 block text-sm font-medium">Open Positions</label><FormInput type="number" min={1} value={jobForm.open_positions} onChange={(e) => setJobForm((prev) => ({ ...prev, open_positions: Number(e.target.value) || 1 }))} /></div>
                <div><label className="mb-1 block text-sm font-medium">Location</label><FormInput value={jobForm.location ?? ""} onChange={(e) => setJobForm((prev) => ({ ...prev, location: e.target.value }))} /></div>
              </>
            )}
            {activeTab === "candidates" && (
              <>
                <div><label className="mb-1 block text-sm font-medium">Job</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={candidateForm.job_opening_id || ""} onChange={(e) => setCandidateForm((prev) => ({ ...prev, job_opening_id: Number(e.target.value) }))}><option value="">Select Job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium">Full Name</label><FormInput value={candidateForm.full_name} onChange={(e) => setCandidateForm((prev) => ({ ...prev, full_name: e.target.value }))} /></div>
                <div><label className="mb-1 block text-sm font-medium">Email</label><FormInput type="email" value={candidateForm.email} onChange={(e) => setCandidateForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
                <div><label className="mb-1 block text-sm font-medium">Stage</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={candidateForm.stage} onChange={(e) => setCandidateForm((prev) => ({ ...prev, stage: e.target.value as CandidateStage }))}><option value="applied">Applied</option><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="hired">Hired</option><option value="rejected">Rejected</option></select></div>
              </>
            )}
            {activeTab === "interviews" && (
              <>
                <div><label className="mb-1 block text-sm font-medium">Candidate</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={interviewForm.candidate_id || ""} onChange={(e) => setInterviewForm((prev) => ({ ...prev, candidate_id: Number(e.target.value) }))}><option value="">Select Candidate</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium">Interviewer</label><FormInput value={interviewForm.interviewer_name} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewer_name: e.target.value }))} /></div>
                <div><label className="mb-1 block text-sm font-medium">Type</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={interviewForm.interview_type} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interview_type: e.target.value as "screening" | "technical" | "behavioral" | "managerial" | "hr" }))}><option value="screening">Screening</option><option value="technical">Technical</option><option value="behavioral">Behavioral</option><option value="managerial">Managerial</option><option value="hr">HR</option></select></div>
                <div><label className="mb-1 block text-sm font-medium">Scheduled At</label><FormInput type="datetime-local" value={interviewForm.scheduled_at} onChange={(e) => setInterviewForm((prev) => ({ ...prev, scheduled_at: e.target.value }))} /></div>
              </>
            )}
            {activeTab === "onboarding" && (
              <>
                <div><label className="mb-1 block text-sm font-medium">Candidate</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={onboardingForm.candidate_id || ""} onChange={(e) => setOnboardingForm((prev) => ({ ...prev, candidate_id: Number(e.target.value) }))}><option value="">Select Hired Candidate</option>{hiredCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium">Onboarding Status</label><select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={onboardingForm.onboarding_status} onChange={(e) => setOnboardingForm((prev) => ({ ...prev, onboarding_status: e.target.value as "pending" | "in_progress" | "completed" | "deferred" }))}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="deferred">Deferred</option></select></div>
                <div><label className="mb-1 block text-sm font-medium">Start Date</label><FormInput type="date" value={onboardingForm.onboarding_start_date ?? ""} onChange={(e) => setOnboardingForm((prev) => ({ ...prev, onboarding_start_date: e.target.value || null }))} /></div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

