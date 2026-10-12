import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  OnboardingTask,
  TaskLinkType,
  createOnboardingTask,
  deleteOnboardingTask,
  listOnboardingTasks,
  setOnboardingTaskStatus,
  updateOnboardingTask,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, FormError, PersonSelect, formatRecruitmentDate, selectClass } from "./shared";

function isOverdue(task: OnboardingTask) {
  return task.status === "pending" && !!task.due_date && task.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

const linkLabels: Record<TaskLinkType, { label: string; to: string } | null> = {
  none: null,
  inventory: { label: "Assign equipment", to: "/inventory" },
  document: { label: "Collect documents", to: "/employee-documents" },
};

// ---------------------------------------------------------------------------
// One task row (also used by the "My tasks" list)
// ---------------------------------------------------------------------------

export function TaskRow({ task, canManage, showCandidate = false, onEdit }: { task: OnboardingTask; canManage: boolean; showCandidate?: boolean; onEdit?: (task: OnboardingTask) => void }) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const isAssignee = task.assignee_id != null && String(task.assignee_id) === String(userId);
  const canToggle = canManage || isAssignee;
  const link = linkLabels[task.link_type];
  const done = task.status !== "pending";

  // Reflect the click immediately; the server's answer replaces it (or reverts it on error).
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);

  const statusMutation = useMutation({
    mutationFn: (status: "completed" | "skipped" | "pending") => setOnboardingTaskStatus(task.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recruitment"] }),
    onError: (error: Error) => toast.error("Could not update task", error.message),
    onSettled: () => setOptimisticDone(null),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOnboardingTask(task.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recruitment"] }),
    onError: (error: Error) => toast.error("Could not delete task", error.message),
  });

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--border)] p-3 text-sm">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={optimisticDone ?? task.status === "completed"}
        disabled={!canToggle || statusMutation.isPending || task.status === "skipped"}
        aria-label={`Mark "${task.title}" as ${task.status === "completed" ? "not done" : "done"}`}
        onChange={(e) => {
          setOptimisticDone(e.target.checked);
          statusMutation.mutate(e.target.checked ? "completed" : "pending");
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={done ? "text-[var(--muted)] line-through" : "font-medium"}>{task.title}</p>
        {task.description && <p className="text-xs text-[var(--muted)]">{task.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          {showCandidate && task.candidate && <span>For {task.candidate.full_name}</span>}
          <span>{task.assignee ? `Assigned to ${task.assignee.name}` : "Unassigned"}</span>
          {task.due_date && <span className={isOverdue(task) ? "font-medium text-red-700" : ""}>Due {formatRecruitmentDate(task.due_date)}{isOverdue(task) ? " (overdue)" : ""}</span>}
          {task.status === "skipped" && <Badge>skipped</Badge>}
          {link && !done && <Link className="text-[var(--primary)] hover:underline" to={link.to}>{link.label} →</Link>}
        </div>
      </div>
      {canManage && (
        <div className="flex gap-2">
          {task.status === "pending" && <Button variant="outline" onClick={() => statusMutation.mutate("skipped")} disabled={statusMutation.isPending}>Skip</Button>}
          {task.status === "skipped" && <Button variant="outline" onClick={() => statusMutation.mutate("pending")} disabled={statusMutation.isPending}>Reopen</Button>}
          {onEdit && <Button variant="outline" onClick={() => onEdit(task)}>Edit</Button>}
          <Button variant="outline" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>Delete</Button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add / edit a task
// ---------------------------------------------------------------------------

function TaskFormModal({ candidateId, task, onClose }: { candidateId: number; task: OnboardingTask | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assigneeId, setAssigneeId] = useState<number | null>(task?.assignee_id ?? null);
  const [dueDate, setDueDate] = useState(task?.due_date?.slice(0, 10) ?? "");
  const [linkType, setLinkType] = useState<TaskLinkType>(task?.link_type ?? "none");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), description: description.trim() || null, assignee_id: assigneeId, due_date: dueDate || null, link_type: linkType };
      return task ? updateOnboardingTask(task.id, payload) : createOnboardingTask({ ...payload, candidate_id: candidateId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the task a title.");
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal title={task ? "Edit task" : "Add task"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="task-title">Title</label>
          <FormInput id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="task-desc">Description</label>
          <FormInput id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <PersonSelect label="Assignee" value={assigneeId} currentName={task?.assignee?.name} onChange={setAssigneeId} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="task-due">Due date</label>
            <FormInput id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="task-link">Related to</label>
            <select id="task-link" className={selectClass} value={linkType} onChange={(e) => setLinkType(e.target.value as TaskLinkType)}>
              <option value="none">Nothing</option>
              <option value="inventory">Equipment (Inventory)</option>
              <option value="document">Documents</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : task ? "Update" : "Add task"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// All tasks for one new hire
// ---------------------------------------------------------------------------

export function OnboardingTasksModal({ candidateId, name, onClose }: { candidateId: number; name: string; onClose: () => void }) {
  const canManage = useAuthStore((state) => state.hasPermission("recruitment:edit") || state.hasPermission("recruitment:create"));
  const [form, setForm] = useState<{ open: boolean; task: OnboardingTask | null }>({ open: false, task: null });

  const tasksQuery = useQuery({
    queryKey: ["recruitment", "onboarding-tasks", candidateId],
    queryFn: () => listOnboardingTasks({ candidate_id: candidateId }),
  });
  const tasks = tasksQuery.data?.data ?? [];
  const done = tasks.filter((task) => task.status !== "pending").length;

  return (
    <Modal title={`Onboarding — ${name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">{done} of {tasks.length} tasks done</span>
          {canManage && <Button variant="outline" onClick={() => setForm({ open: true, task: null })}>Add task</Button>}
        </div>
        {tasksQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading tasks...</p>}
        {tasksQuery.isError && <FormError message={(tasksQuery.error as Error).message} />}
        {!tasksQuery.isLoading && tasks.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No tasks yet. Pick an onboarding template when hiring, or add tasks manually.</p>
        )}
        <ul className="space-y-2">
          {tasks.map((task) => <TaskRow key={task.id} task={task} canManage={canManage} onEdit={(item) => setForm({ open: true, task: item })} />)}
        </ul>
      </div>
      {form.open && <TaskFormModal candidateId={candidateId} task={form.task} onClose={() => setForm({ open: false, task: null })} />}
    </Modal>
  );
}
