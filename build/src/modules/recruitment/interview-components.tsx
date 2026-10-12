import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  Interview,
  InterviewPayload,
  InterviewType,
  Recommendation,
  cancelInterview,
  createInterview,
  listCandidates,
  submitScorecard,
  updateInterview,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { FormError, PersonSelect, selectClass, textareaClass, toApiDateTime, toLocalInput } from "./shared";

export const interviewTypes: InterviewType[] = ["screening", "technical", "behavioral", "managerial", "hr"];

const durations = [15, 30, 45, 60, 90, 120, 180];

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });
}

// ---------------------------------------------------------------------------
// Schedule / edit
// ---------------------------------------------------------------------------

interface InterviewFormProps {
  interview?: Interview | null;
  /** Pre-select (and lock) the candidate, e.g. when opened from a candidate page. */
  candidateId?: number;
  onClose: () => void;
}

export function InterviewFormModal({ interview, candidateId, onClose }: InterviewFormProps) {
  const refresh = useRefresh();
  const editing = Boolean(interview);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    candidate_id: interview?.candidate_id ?? candidateId ?? 0,
    interviewer_id: interview?.interviewer_id ?? (null as number | null),
    interviewer_name: interview?.interviewer_id ? "" : interview?.interviewer_name ?? "",
    interview_type: (interview?.interview_type ?? "technical") as InterviewType,
    scheduled_at: toLocalInput(interview?.scheduled_at),
    duration_minutes: interview?.duration_minutes ?? 60,
    location: interview?.location ?? "",
    meeting_link: interview?.meeting_link ?? "",
    result: interview?.result ?? "pending",
    feedback: interview?.feedback ?? "",
  });

  const candidatesQuery = useQuery({
    queryKey: ["recruitment", "candidates", "interview-options"],
    queryFn: () => listCandidates({ per_page: 100 }),
    enabled: !editing && !candidateId,
  });
  const candidateOptions = (candidatesQuery.data?.data ?? []).filter((candidate) => !["hired", "rejected"].includes(candidate.stage));

  const mutation = useMutation({
    mutationFn: (payload: InterviewPayload) => {
      if (interview) {
        const { candidate_id: _ignored, ...rest } = payload;
        void _ignored;
        return updateInterview(interview.id, rest);
      }
      return createInterview(payload);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(editing ? "Interview updated" : "Interview scheduled", editing ? "Changes saved." : "The interviewer has been notified.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.candidate_id) return setError("Choose a candidate.");
    if (!form.scheduled_at) return setError("Choose a date and time.");
    if (!form.interviewer_id && !form.interviewer_name.trim()) return setError("Choose an interviewer or type an external interviewer's name.");

    mutation.mutate({
      candidate_id: form.candidate_id,
      interviewer_id: form.interviewer_id,
      interviewer_name: form.interviewer_id ? undefined : form.interviewer_name.trim(),
      interview_type: form.interview_type,
      scheduled_at: toApiDateTime(form.scheduled_at),
      duration_minutes: form.duration_minutes,
      location: form.location.trim(),
      meeting_link: form.meeting_link.trim(),
      ...(editing ? { result: form.result, feedback: form.feedback.trim() } : {}),
    });
  }

  return (
    <Modal title={editing ? "Edit Interview" : "Schedule Interview"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />

        {!candidateId && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="int-candidate">Candidate</label>
            <select id="int-candidate" disabled={editing} className={selectClass} value={form.candidate_id || ""} onChange={(e) => set("candidate_id", Number(e.target.value))}>
              <option value="">Select candidate</option>
              {candidateOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}
              {editing && interview && !candidateOptions.some((candidate) => candidate.id === interview.candidate_id) && (
                <option value={interview.candidate_id}>{interview.candidate?.full_name ?? "Candidate"}</option>
              )}
            </select>
          </div>
        )}

        <PersonSelect
          label="Interviewer"
          valueKey="employee_id"
          value={form.interviewer_id}
          currentName={interview?.interviewer?.name ?? interview?.interviewer_name}
          placeholder="External / not listed"
          onChange={(value) => set("interviewer_id", value)}
        />
        {!form.interviewer_id && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="int-name">External interviewer name</label>
            <FormInput id="int-name" value={form.interviewer_name} onChange={(e) => set("interviewer_name", e.target.value)} />
            <p className="mt-1 text-xs text-[var(--muted)]">External interviewers are not notified and cannot submit a scorecard.</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="int-type">Type</label>
            <select id="int-type" className={selectClass} value={form.interview_type} onChange={(e) => set("interview_type", e.target.value as InterviewType)}>
              {interviewTypes.map((type) => <option key={type} value={type} className="capitalize">{type}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="int-duration">Duration</label>
            <select id="int-duration" className={selectClass} value={form.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))}>
              {durations.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="int-when">Date and time</label>
            <FormInput id="int-when" type="datetime-local" value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="int-location">Location</label>
            <FormInput id="int-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room 4 / Head office" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="int-link">Meeting link</label>
            <FormInput id="int-link" type="url" value={form.meeting_link} onChange={(e) => set("meeting_link", e.target.value)} placeholder="https://..." />
          </div>
        </div>

        {editing && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="int-result">Result</label>
              <select id="int-result" className={selectClass} value={form.result} onChange={(e) => set("result", e.target.value as Interview["result"])}>
                <option value="pending">Pending</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="hold">Hold</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium" htmlFor="int-feedback">Feedback</label>
              <textarea id="int-feedback" className={textareaClass} value={form.feedback} onChange={(e) => set("feedback", e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : editing ? "Update" : "Schedule"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export function CancelInterviewModal({ interview, onClose }: { interview: Interview; onClose: () => void }) {
  const refresh = useRefresh();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => cancelInterview(interview.id, reason.trim()),
    onSuccess: async () => {
      await refresh();
      toast.success("Interview cancelled", "The interviewer has been notified.");
      onClose();
    },
    onError: (error: Error) => toast.error("Could not cancel", error.message),
  });

  return (
    <Modal title="Cancel interview" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">Cancel the interview with {interview.candidate?.full_name ?? "this candidate"}? The slot becomes free again.</p>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="cancel-reason">Reason (optional)</label>
          <textarea id="cancel-reason" className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Keep interview</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Cancelling..." : "Cancel interview"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export function ScorecardModal({ interview, onClose }: { interview: Interview; onClose: () => void }) {
  const refresh = useRefresh();
  const userId = useAuthStore((state) => state.user?.id);
  // Interviewers receive their own card as my_scorecard; recruiters get the full list and pick theirs out of it.
  const existing = interview.my_scorecard ?? interview.scorecards?.find((card) => String(card.submitted_by) === String(userId)) ?? null;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [recommendation, setRecommendation] = useState<Recommendation | "">(existing?.recommendation ?? "");
  const [strengths, setStrengths] = useState(existing?.strengths ?? "");
  const [concerns, setConcerns] = useState(existing?.concerns ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => submitScorecard(interview.id, { rating, recommendation: recommendation as Recommendation, strengths: strengths.trim(), concerns: concerns.trim() }),
    onSuccess: async () => {
      await refresh();
      toast.success("Scorecard submitted", "Thank you for the feedback.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Give the candidate a rating from 1 to 5.");
    if (!recommendation) return setError("Choose a recommendation.");
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal title={`Scorecard — ${interview.candidate?.full_name ?? "candidate"}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Rating</legend>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                onClick={() => setRating(value)}
                className={`text-3xl leading-none ${value <= rating ? "text-amber-500" : "text-[var(--border)]"}`}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sc-rec">Recommendation</label>
          <select id="sc-rec" className={selectClass} value={recommendation} onChange={(e) => setRecommendation(e.target.value as Recommendation | "")}>
            <option value="">Select...</option>
            <option value="hire">Hire</option>
            <option value="hold">Hold / undecided</option>
            <option value="no_hire">Do not hire</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sc-strengths">Strengths</label>
          <textarea id="sc-strengths" className={textareaClass} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sc-concerns">Concerns</label>
          <textarea id="sc-concerns" className={textareaClass} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Submitting..." : existing ? "Update scorecard" : "Submit scorecard"}</Button>
        </div>
      </form>
    </Modal>
  );
}
