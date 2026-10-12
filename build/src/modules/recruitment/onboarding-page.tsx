import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  Candidate,
  OnboardingPayload,
  createOnboarding,
  listOnboarding,
  listOnboardingTasks,
  updateOnboarding,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { OnboardingTemplatesTab } from "./onboarding-templates";
import { OnboardingTasksModal, TaskRow } from "./onboarding-tasks-panel";
import { Badge, FormError, RecruitmentSubnav, StatCard, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

type Tab = "hires" | "mine" | "templates";

const statusTone = { pending: "slate", in_progress: "blue", completed: "emerald", deferred: "amber" } as const;

export function OnboardingPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const viewAll = hasPermission("recruitment:view");
  const canEdit = hasPermission("recruitment:edit") || hasPermission("recruitment:create");

  const [tab, setTab] = useState<Tab>(viewAll ? "hires" : "mine");
  const [search, setSearch] = useState("");
  const [tasksFor, setTasksFor] = useState<Candidate | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; candidate: Candidate | null }>({ open: false, candidate: null });

  const onboardingQuery = useQuery({
    queryKey: ["recruitment", "onboarding", search],
    queryFn: () => listOnboarding(search),
    enabled: viewAll && tab === "hires",
  });
  const myTasksQuery = useQuery({
    queryKey: ["recruitment", "onboarding-tasks", "mine"],
    queryFn: () => listOnboardingTasks({ mine: true }),
    enabled: tab === "mine",
  });

  const hires = onboardingQuery.data?.data ?? [];
  const counts = {
    total: hires.length,
    pending: hires.filter((item) => !item.onboarding_status || item.onboarding_status === "pending").length,
    inProgress: hires.filter((item) => item.onboarding_status === "in_progress").length,
    completed: hires.filter((item) => item.onboarding_status === "completed").length,
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    ...(viewAll ? [{ id: "hires" as Tab, label: "New hires" }] : []),
    { id: "mine", label: "My tasks" },
    ...(viewAll ? [{ id: "templates" as Tab, label: "Templates" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Onboarding" subtitle="Track new hires, their onboarding tasks and who owns each one." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div role="tablist" aria-label="Onboarding sections" className="flex flex-wrap gap-1 border-b border-[var(--border)]">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === item.id ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "hires" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <FormInput aria-label="Search new hires" placeholder="Search new hires..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              <p className="ml-auto text-xs text-[var(--muted)]">Onboarding starts automatically when a candidate is hired.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Total" value={counts.total} />
              <StatCard label="Pending" value={counts.pending} />
              <StatCard label="In progress" value={counts.inProgress} />
              <StatCard label="Completed" value={counts.completed} />
            </div>

            <FormError message={onboardingQuery.isError ? (onboardingQuery.error as Error).message : null} />

            <div className="overflow-x-auto">
              <table className="rtable w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                    <th className="p-3">New hire</th>
                    <th className="p-3">Job</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Start date</th>
                    <th className="p-3">Progress</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {onboardingQuery.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={6}>Loading new hires...</td></tr>}
                  {!onboardingQuery.isLoading && hires.map((item) => {
                    const total = item.tasks_total ?? 0;
                    const done = item.tasks_done ?? 0;
                    const status = item.onboarding_status ?? "pending";
                    return (
                      <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                        <td className="p-3 font-medium" data-label="New hire"><Link className="hover:underline" to={`/recruitment/candidates/${item.id}`}>{item.full_name}</Link></td>
                        <td className="p-3" data-label="Job">{item.job_opening?.title ?? "-"}</td>
                        <td className="p-3" data-label="Status"><Badge tone={statusTone[status]}>{status.replace("_", " ")}</Badge></td>
                        <td className="p-3" data-label="Start date">{formatRecruitmentDate(item.onboarding_start_date)}</td>
                        <td className="p-3" data-label="Progress">
                          {total > 0 ? (
                            <div className="min-w-32">
                              <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                                <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                              </div>
                              <span className="text-xs text-[var(--muted)]">{done}/{total} tasks</span>
                            </div>
                          ) : <span className="text-xs text-[var(--muted)]">No tasks</span>}
                        </td>
                        <td className="p-3" data-label="Actions">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setTasksFor(item)}>Tasks</Button>
                            {canEdit && <Button variant="outline" onClick={() => setEditing({ open: true, candidate: item })}>Edit</Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!onboardingQuery.isLoading && hires.length === 0 && <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={6}>No new hires found.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "mine" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Onboarding tasks assigned to you.</p>
            <FormError message={myTasksQuery.isError ? (myTasksQuery.error as Error).message : null} />
            {myTasksQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading your tasks...</p>}
            {!myTasksQuery.isLoading && (myTasksQuery.data?.data.length ?? 0) === 0 && <p className="text-sm text-[var(--muted)]">Nothing is assigned to you.</p>}
            <ul className="space-y-2">
              {(myTasksQuery.data?.data ?? []).map((task) => <TaskRow key={task.id} task={task} canManage={false} showCandidate />)}
            </ul>
          </div>
        )}

        {tab === "templates" && <OnboardingTemplatesTab />}
      </section>

      {tasksFor && <OnboardingTasksModal candidateId={tasksFor.id} name={tasksFor.full_name} onClose={() => setTasksFor(null)} />}
      {editing.open && editing.candidate && (
        <OnboardingEditModal
          candidate={editing.candidate}
          onClose={() => setEditing({ open: false, candidate: null })}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["recruitment"] })}
        />
      )}
    </div>
  );
}

function OnboardingEditModal({ candidate, onClose, onSaved }: { candidate: Candidate; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<OnboardingPayload["onboarding_status"]>(candidate.onboarding_status ?? "pending");
  const [startDate, setStartDate] = useState(candidate.onboarding_start_date?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(candidate.onboarding_notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { onboarding_status: status, onboarding_start_date: startDate || null, onboarding_notes: notes.trim() };
      return candidate.onboarding_status ? updateOnboarding(candidate.id, payload) : createOnboarding({ candidate_id: candidate.id, ...payload });
    },
    onSuccess: () => {
      onSaved();
      toast.success("Onboarding updated", "Onboarding record saved.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal title={`Onboarding — ${candidate.full_name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <p className="text-xs text-[var(--muted)]">The status moves automatically as tasks are completed. Set it to Deferred to pause onboarding.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="ob-status">Status</label>
            <select id="ob-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as OnboardingPayload["onboarding_status"])}>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="deferred">Deferred</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="ob-start">Start date</label>
            <FormInput id="ob-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ob-notes">Notes</label>
          <textarea id="ob-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}
