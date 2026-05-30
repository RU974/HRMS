import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Candidate,
  Interview,
  InterviewPayload,
  createInterview,
  deleteInterview,
  listCandidates,
  listInterviews,
  updateInterview,
} from "@/services/recruitment-service";
import { RecruitmentSubnav, formatRecruitmentDate } from "./shared";

const defaultInterviewForm: InterviewPayload = {
  candidate_id: 0,
  interviewer_name: "",
  interview_type: "technical",
  scheduled_at: "",
  result: "pending",
  feedback: "",
};

export function InterviewsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [interviewForm, setInterviewForm] = useState<InterviewPayload>(defaultInterviewForm);

  const interviewsQuery = useQuery({
    queryKey: ["recruitment", "interviews", search],
    queryFn: () => listInterviews(search),
  });
  const candidatesQuery = useQuery({
    queryKey: ["recruitment", "candidates", "interview-options"],
    queryFn: () => listCandidates(),
  });

  const createMutation = useMutation({
    mutationFn: createInterview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] });
      closeModal();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<InterviewPayload> }) => updateInterview(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] });
      closeModal();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInterview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const interviews = interviewsQuery.data?.data ?? [];
  const candidates = (candidatesQuery.data?.data ?? []).filter((candidate: Candidate) => candidate.stage !== "rejected");

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingInterview(null);
    setInterviewForm(defaultInterviewForm);
  }

  function openCreate() {
    closeModal();
    setModalOpen(true);
  }

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!interviewForm.candidate_id || !interviewForm.interviewer_name.trim() || !interviewForm.scheduled_at) {
      setError("Candidate, interviewer, and schedule are required.");
      return;
    }

    const payload: InterviewPayload = {
      ...interviewForm,
      interviewer_name: interviewForm.interviewer_name.trim(),
      feedback: interviewForm.feedback?.trim() || "",
    };

    if (editingInterview) {
      updateMutation.mutate({ id: editingInterview.id, payload });
      return;
    }

    createMutation.mutate(payload);
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this interview record?")) return;
    setError(null);
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Interviews" subtitle="Schedule interview sessions and keep outcomes attached to each candidate." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput placeholder="Search interviews..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Button className="ml-auto" onClick={openCreate}>New Interview</Button>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Total</p><p className="mt-2 text-3xl font-semibold">{interviews.length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Pending</p><p className="mt-2 text-3xl font-semibold">{interviews.filter((interview) => interview.result === "pending").length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Passed</p><p className="mt-2 text-3xl font-semibold">{interviews.filter((interview) => interview.result === "pass").length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Failed</p><p className="mt-2 text-3xl font-semibold">{interviews.filter((interview) => interview.result === "fail").length}</p></Card>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Candidate</th>
                <th className="p-3">Interviewer</th>
                <th className="p-3">Type</th>
                <th className="p-3">Schedule</th>
                <th className="p-3">Result</th>
                <th className="p-3">Feedback</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {interviewsQuery.isLoading && (
                <tr>
                  <td className="p-4 text-[var(--muted)]" colSpan={7}>Loading interviews...</td>
                </tr>
              )}
              {!interviewsQuery.isLoading && interviews.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium">{item.candidate?.full_name ?? "-"}</td>
                  <td className="p-3">{item.interviewer_name}</td>
                  <td className="p-3 capitalize">{item.interview_type}</td>
                  <td className="p-3">{formatRecruitmentDate(item.scheduled_at, true)}</td>
                  <td className="p-3 capitalize">{item.result}</td>
                  <td className="max-w-[260px] truncate p-3 text-[var(--muted)]">{item.feedback ?? "-"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingInterview(item);
                          setInterviewForm({
                            candidate_id: item.candidate_id,
                            interviewer_name: item.interviewer_name,
                            interview_type: item.interview_type,
                            scheduled_at: item.scheduled_at.slice(0, 16),
                            result: item.result,
                            feedback: item.feedback ?? "",
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
              {!interviewsQuery.isLoading && interviews.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-[var(--muted)]" colSpan={7}>No interviews found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editingInterview ? "Edit Interview" : "Create Interview"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Candidate</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={interviewForm.candidate_id || ""}
                  onChange={(e) => setInterviewForm((prev) => ({ ...prev, candidate_id: Number(e.target.value) }))}
                >
                  <option value="">Select candidate</option>
                  {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Interviewer</label>
                <FormInput value={interviewForm.interviewer_name} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewer_name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={interviewForm.interview_type ?? "technical"} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interview_type: e.target.value as InterviewPayload["interview_type"] }))}>
                  <option value="screening">Screening</option>
                  <option value="technical">Technical</option>
                  <option value="behavioral">Behavioral</option>
                  <option value="managerial">Managerial</option>
                  <option value="hr">HR</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Scheduled At</label>
                <FormInput type="datetime-local" value={interviewForm.scheduled_at} onChange={(e) => setInterviewForm((prev) => ({ ...prev, scheduled_at: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Result</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={interviewForm.result ?? "pending"} onChange={(e) => setInterviewForm((prev) => ({ ...prev, result: e.target.value as InterviewPayload["result"] }))}>
                  <option value="pending">Pending</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="hold">Hold</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Feedback</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={interviewForm.feedback ?? ""}
                onChange={(e) => setInterviewForm((prev) => ({ ...prev, feedback: e.target.value }))}
                placeholder="Capture interview notes and next-step decisions."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">{editingInterview ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
