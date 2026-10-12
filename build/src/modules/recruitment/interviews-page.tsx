import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Interview, deleteInterview, listInterviews } from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { CancelInterviewModal, InterviewFormModal, ScorecardModal } from "./interview-components";
import { Badge, ConfirmModal, RecruitmentSubnav, formatRecruitmentDate, selectClass } from "./shared";

type View = "calendar" | "list";

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7; // Monday = 0
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - day);
  return result;
}

function isoDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const resultTone = { pass: "emerald", fail: "red", hold: "amber", pending: "slate" } as const;
const statusTone = { scheduled: "blue", completed: "emerald", cancelled: "slate" } as const;

export function InterviewsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const viewAll = hasPermission("recruitment:view");
  const canCreate = hasPermission("recruitment:create");
  const canEdit = hasPermission("recruitment:edit");
  const canDelete = hasPermission("recruitment:delete");

  const [view, setView] = useState<View>("calendar");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [mineOnly, setMineOnly] = useState(!viewAll);
  const [statusFilter, setStatusFilter] = useState<Interview["status"] | "">("");
  const [search, setSearch] = useState("");
  const [formState, setFormState] = useState<{ open: boolean; interview: Interview | null }>({ open: false, interview: null });
  const [cancelTarget, setCancelTarget] = useState<Interview | null>(null);
  const [scorecardTarget, setScorecardTarget] = useState<Interview | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Interview | null>(null);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [weekStart]);

  const interviewsQuery = useQuery({
    queryKey: ["recruitment", "interviews", { view, from: isoDate(weekStart), search, mineOnly, statusFilter }],
    queryFn: () =>
      listInterviews({
        mine: mineOnly,
        status: statusFilter,
        ...(view === "calendar" ? { from: isoDate(weekStart), to: isoDate(weekEnd) } : { q: search || undefined }),
      }),
    placeholderData: (previous) => previous,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInterview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Deleted", "Interview removed.");
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error("Delete failed", error.message);
      setDeleteTarget(null);
    },
  });

  const interviews = useMemo(
    () => [...(interviewsQuery.data?.data ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [interviewsQuery.data]
  );

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    return day;
  });

  function canScore(interview: Interview) {
    if (interview.status === "cancelled" || !interview.interviewer_id) return false;
    if (new Date(interview.scheduled_at) > new Date()) return false;
    // Recruiters see every interview but may only score their own; interviewers only ever receive their own.
    return viewAll ? interview.interviewer?.user_id === user?.id : true;
  }

  function actions(interview: Interview) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {canScore(interview) && (
          <Button variant="outline" onClick={() => setScorecardTarget(interview)}>
            {interview.my_scorecard || interview.scorecards?.some((card) => card.submitted_by === user?.id) ? "Edit scorecard" : "Scorecard"}
          </Button>
        )}
        {canEdit && interview.status === "scheduled" && <Button variant="outline" onClick={() => setCancelTarget(interview)}>Cancel</Button>}
        {canEdit && <Button variant="outline" onClick={() => setFormState({ open: true, interview })}>Edit</Button>}
        {canDelete && <Button variant="outline" onClick={() => setDeleteTarget(interview)}>Delete</Button>}
      </div>
    );
  }

  const candidateLink = (interview: Interview) =>
    viewAll && interview.candidate_id ? (
      <Link className="hover:underline" to={`/recruitment/candidates/${interview.candidate_id}`}>{interview.candidate?.full_name ?? "-"}</Link>
    ) : (
      <>{interview.candidate?.full_name ?? "-"}</>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Interviews" subtitle={viewAll ? "Schedule interviews, avoid clashes, and collect structured feedback." : "Your assigned interviews and scorecards."} />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-xl border border-[var(--border)]" role="group" aria-label="View">
            {(["calendar", "list"] as View[]).map((mode) => (
              <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`px-3 py-2 text-sm capitalize ${view === mode ? "bg-[var(--primary)] text-white" : "bg-[var(--card)]"}`}>
                {mode}
              </button>
            ))}
          </div>

          {view === "list" && viewAll && (
            <FormInput aria-label="Search interviews" placeholder="Search by candidate or interviewer..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          )}
          <select aria-label="Filter by status" className={`${selectClass} w-auto min-w-36`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Interview["status"] | "")}>
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {viewAll && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine
            </label>
          )}
          {canCreate && <Button className="ml-auto" onClick={() => setFormState({ open: true, interview: null })}>Schedule Interview</Button>}
        </div>

        {interviewsQuery.isError && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Could not load interviews. {(interviewsQuery.error as Error).message}
          </div>
        )}

        {view === "calendar" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() - 7); return next; })}>← Previous</Button>
              <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
              <Button variant="outline" onClick={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() + 7); return next; })}>Next →</Button>
              <span className="ml-2 text-sm font-medium">{weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {weekEnd.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-7">
              {days.map((day) => {
                const key = isoDate(day);
                const dayInterviews = interviews.filter((interview) => isoDate(new Date(interview.scheduled_at)) === key);
                const today = key === isoDate(new Date());
                return (
                  <div key={key} className={`rounded-2xl border p-2 ${today ? "border-[var(--primary)]" : "border-[var(--border)]"}`}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</p>
                    <div className="space-y-2">
                      {dayInterviews.map((interview) => (
                        <div key={interview.id} className={`rounded-xl border border-[var(--border)] p-2 text-xs ${interview.status === "cancelled" ? "opacity-60" : ""}`}>
                          <p className="font-semibold">{new Date(interview.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {interview.duration_minutes}m</p>
                          <p className="mt-0.5 font-medium">{candidateLink(interview)}</p>
                          <p className="capitalize text-[var(--muted)]">{interview.interview_type} · {interview.interviewer_name}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge tone={statusTone[interview.status]}>{interview.status}</Badge>
                            {(interview.pending_reschedule_count ?? 0) > 0 && <Badge tone="amber">move requested</Badge>}
                            {interview.result !== "pending" && <Badge tone={resultTone[interview.result]}>{interview.result}</Badge>}
                          </div>
                          {interview.meeting_link && <a className="mt-1 block truncate text-[var(--primary)] hover:underline" href={interview.meeting_link} target="_blank" rel="noreferrer noopener">Join link</a>}
                          <div className="mt-2">{actions(interview)}</div>
                        </div>
                      ))}
                      {dayInterviews.length === 0 && <p className="py-3 text-center text-xs text-[var(--muted)]">—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            {interviewsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading interviews...</p>}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3">When</th>
                  <th className="p-3">Candidate</th>
                  <th className="p-3">Interviewer</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Where</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Result</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {interviewsQuery.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={8}>Loading interviews...</td></tr>}
                {!interviewsQuery.isLoading && [...interviews].reverse().map((interview) => (
                  <tr key={interview.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                    <td className="p-3" data-label="When">{formatRecruitmentDate(interview.scheduled_at, true)}<span className="block text-xs text-[var(--muted)]">{interview.duration_minutes} min</span></td>
                    <td className="p-3 font-medium" data-label="Candidate">{candidateLink(interview)}</td>
                    <td className="p-3" data-label="Interviewer">{interview.interviewer_name}</td>
                    <td className="p-3 capitalize" data-label="Type">{interview.interview_type}</td>
                    <td className="p-3" data-label="Where">
                      {interview.meeting_link ? <a className="text-[var(--primary)] hover:underline" href={interview.meeting_link} target="_blank" rel="noreferrer noopener">{interview.location || "Join link"}</a> : interview.location || "-"}
                    </td>
                    <td className="p-3" data-label="Status">
                      <Badge tone={statusTone[interview.status]}>{interview.status}</Badge>
                      {(interview.pending_reschedule_count ?? 0) > 0 && <span className="ml-1"><Badge tone="amber">candidate asked to move it</Badge></span>}
                    </td>
                    <td className="p-3" data-label="Result"><Badge tone={resultTone[interview.result]}>{interview.result}</Badge></td>
                    <td className="p-3" data-label="Actions">{actions(interview)}</td>
                  </tr>
                ))}
                {!interviewsQuery.isLoading && interviews.length === 0 && (
                  <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={8}>{viewAll ? "No interviews found." : "No interviews are assigned to you."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formState.open && <InterviewFormModal interview={formState.interview} onClose={() => setFormState({ open: false, interview: null })} />}
      {cancelTarget && <CancelInterviewModal interview={cancelTarget} onClose={() => setCancelTarget(null)} />}
      {scorecardTarget && <ScorecardModal interview={scorecardTarget} onClose={() => setScorecardTarget(null)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Delete interview"
          message={`Delete the interview with ${deleteTarget.candidate?.full_name ?? "this candidate"}? Its scorecards are deleted too and this cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
