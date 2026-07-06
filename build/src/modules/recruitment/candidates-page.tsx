import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listJobOpenings } from "@/services/recruitment-service";
import {
  Candidate,
  CandidatePayload,
  createCandidate,
  deleteCandidate,
  listCandidates,
  updateCandidate,
} from "@/services/recruitment-service";
import { RecruitmentSubnav, formatRecruitmentDate } from "./shared";
import { toast } from "@/components/notifications/toast";

const defaultCandidateForm: CandidatePayload = {
  job_opening_id: 0,
  full_name: "",
  email: "",
  phone: "",
  source: "",
  stage: "applied",
  rating: null,
  status: "active",
  applied_at: null,
  notes: "",
};

export function CandidatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [candidateForm, setCandidateForm] = useState<CandidatePayload>(defaultCandidateForm);

  const candidatesQuery = useQuery({
    queryKey: ["recruitment", "candidates", search],
    queryFn: () => listCandidates(search),
  });
  const jobsQuery = useQuery({
    queryKey: ["recruitment", "jobs", "candidate-options"],
    queryFn: () => listJobOpenings(),
  });

  const createMutation = useMutation({
    mutationFn: createCandidate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] });
      toast.success("Candidate added", "Candidate profile created successfully.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CandidatePayload> }) => updateCandidate(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] });
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] });
      toast.success("Candidate updated", "Candidate details saved successfully.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCandidate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] });
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] });
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] });
      toast.success("Deleted", "Candidate removed.");
    },
    onError: (mutationError: Error) => { toast.error("Delete failed", mutationError.message); setError(mutationError.message); },
  });

  const candidates = candidatesQuery.data?.data ?? [];
  const jobs = jobsQuery.data?.data ?? [];

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingCandidate(null);
    setCandidateForm(defaultCandidateForm);
  }

  function openCreate() {
    closeModal();
    setModalOpen(true);
  }

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!candidateForm.job_opening_id || !candidateForm.full_name.trim() || !candidateForm.email.trim()) {
      setError("Job, full name, and email are required.");
      return;
    }

    const payload: CandidatePayload = {
      ...candidateForm,
      full_name: candidateForm.full_name.trim(),
      email: candidateForm.email.trim(),
      phone: candidateForm.phone?.trim() || "",
      source: candidateForm.source?.trim() || "",
      notes: candidateForm.notes?.trim() || "",
      applied_at: candidateForm.applied_at || null,
    };

    if (editingCandidate) {
      updateMutation.mutate({ id: editingCandidate.id, payload });
      return;
    }

    createMutation.mutate(payload);
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this candidate?")) return;
    setError(null);
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Candidates" subtitle="Keep applications clean and move candidates through the hiring stages." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput placeholder="Search candidates..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Button className="ml-auto" onClick={openCreate}>New Candidate</Button>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Total</p><p className="mt-2 text-3xl font-semibold">{candidates.length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Active</p><p className="mt-2 text-3xl font-semibold">{candidates.filter((candidate) => candidate.status === "active").length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Hired</p><p className="mt-2 text-3xl font-semibold">{candidates.filter((candidate) => candidate.stage === "hired").length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Interview</p><p className="mt-2 text-3xl font-semibold">{candidates.filter((candidate) => candidate.stage === "interview").length}</p></Card>
        </div>

        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Job</th>
                <th className="p-3">Stage</th>
                <th className="p-3">Status</th>
                <th className="p-3">Rating</th>
                <th className="p-3">Applied</th>
                <th className="p-3">Employee</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidatesQuery.isLoading && (
                <tr>
                  <td className="p-4 text-[var(--muted)]" colSpan={9}>Loading candidates...</td>
                </tr>
              )}
              {!candidatesQuery.isLoading && candidates.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium" data-label="Name">{item.full_name}</td>
                  <td className="p-3" data-label="Email">{item.email}</td>
                  <td className="p-3" data-label="Job">{item.jobOpening?.title ?? "-"}</td>
                  <td className="p-3 capitalize" data-label="Stage">{item.stage}</td>
                  <td className="p-3 capitalize" data-label="Status">{item.status}</td>
                  <td className="p-3" data-label="Rating">{item.rating ?? "-"}</td>
                  <td className="p-3" data-label="Applied">{formatRecruitmentDate(item.applied_at)}</td>
                  <td className="p-3" data-label="Employee">
                    {item.employee ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        {item.employee.name}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingCandidate(item);
                          setCandidateForm({
                            job_opening_id: item.job_opening_id,
                            full_name: item.full_name,
                            email: item.email,
                            phone: item.phone ?? "",
                            source: item.source ?? "",
                            stage: item.stage,
                            rating: item.rating ?? null,
                            status: item.status,
                            applied_at: item.applied_at ?? null,
                            notes: item.notes ?? "",
                          });
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!candidatesQuery.isLoading && candidates.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-[var(--muted)]" colSpan={9}>No candidates found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editingCandidate ? "Edit Candidate" : "Create Candidate"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Job Opening</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={candidateForm.job_opening_id || ""}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, job_opening_id: Number(e.target.value) }))}
                >
                  <option value="">Select job</option>
                  {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Full Name</label>
                <FormInput value={candidateForm.full_name} onChange={(e) => setCandidateForm((prev) => ({ ...prev, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <FormInput type="email" value={candidateForm.email} onChange={(e) => setCandidateForm((prev) => ({ ...prev, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Phone</label>
                <FormInput value={candidateForm.phone ?? ""} onChange={(e) => setCandidateForm((prev) => ({ ...prev, phone: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Source</label>
                <FormInput value={candidateForm.source ?? ""} onChange={(e) => setCandidateForm((prev) => ({ ...prev, source: e.target.value }))} placeholder="Referral, LinkedIn, website..." />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Stage</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={candidateForm.stage ?? "applied"}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, stage: e.target.value as CandidatePayload["stage"] }))}
                >
                  <option value="applied">Applied</option>
                  <option value="screening">Screening</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="hired">Hired</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={candidateForm.status ?? "active"}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, status: e.target.value as CandidatePayload["status"] }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Rating</label>
                <FormInput type="number" min={1} max={5} value={candidateForm.rating ?? ""} onChange={(e) => setCandidateForm((prev) => ({ ...prev, rating: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Applied At</label>
                <FormInput type="date" value={candidateForm.applied_at ?? ""} onChange={(e) => setCandidateForm((prev) => ({ ...prev, applied_at: e.target.value || null }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={candidateForm.notes ?? ""}
                onChange={(e) => setCandidateForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Add screening notes, feedback, or next-step details."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">{editingCandidate ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
