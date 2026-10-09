import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
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
import { toast } from "@/components/notifications/toast";

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
      toast.success("Interview scheduled", "Interview has been scheduled successfully.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<InterviewPayload> }) => updateInterview(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] });
      toast.success("Interview updated", "Interview details saved.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInterview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "interviews"] });
      toast.success("Deleted", "Interview removed.");
    },
    onError: (mutationError: Error) => { toast.error("Delete failed", mutationError.message); setError(mutationError.message); },
  });

  const { sorted: interviews, sort, toggle: toggleSort } = useTableSort(interviewsQuery.data?.data ?? [], "candidate", {
    candidate: (i) => i.candidate?.full_name,
  });
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
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <SortableTh label="Candidate" sortKey="candidate" sort={sort} onSort={toggleSort} />
                <SortableTh label="Interviewer" sortKey="interviewer_name" sort={sort} onSort={toggleSort} />
                <SortableTh label="Type" sortKey="interview_type" sort={sort} onSort={toggleSort} />
                <SortableTh label="Schedule" sortKey="scheduled_at" sort={sort} onSort={toggleSort} />
                <SortableTh label="Result" sortKey="result" sort={sort} onSort={toggleSort} />
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
                  <td className="p-3 font-medium" data-label="Candidate">{item.candidate?.full_name ?? "-"}</td>
                  <td className="p-3" data-label="Interviewer">{item.interviewer_name}</td>
                  <td className="p-3 capitalize" data-label="Type">{item.interview_type}</td>
                  <td className="p-3" data-label="Schedule">{formatRecruitmentDate(item.scheduled_at, true)}</td>
                  <td className="p-3 capitalize" data-label="Result">{item.result}</td>
                  <td className="max-w-[260px] truncate p-3 text-[var(--muted)]" data-label="Feedback">{item.feedback ?? "-"}</td>
                  <td className="p-3" data-label="Actions">
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
