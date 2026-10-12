import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  AssigneeType,
  OnboardingTemplate,
  TaskLinkType,
  TemplatePayload,
  TemplateTask,
  createOnboardingTemplate,
  deleteOnboardingTemplate,
  listOnboardingTemplates,
  updateOnboardingTemplate,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, ConfirmModal, FormError, PersonSelect, selectClass } from "./shared";

const assigneeLabels: Record<AssigneeType, string> = {
  unassigned: "Unassigned",
  user: "A specific person",
  hiring_manager: "Job's hiring manager",
  recruiter: "Job's recruiter",
  new_hire: "The new hire",
};

type DraftTask = Omit<TemplateTask, "id" | "assignee"> & { key: number };

let keySeed = 0;
const blankTask = (): DraftTask => ({ key: ++keySeed, title: "", description: "", assignee_type: "unassigned", assignee_user_id: null, due_offset_days: 0, link_type: "none" });

function TemplateFormModal({ template, onClose }: { template: OnboardingTemplate | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [tasks, setTasks] = useState<DraftTask[]>(
    template?.tasks.length
      ? template.tasks.map((task) => ({
          key: ++keySeed,
          title: task.title,
          description: task.description ?? "",
          assignee_type: task.assignee_type,
          assignee_user_id: task.assignee_user_id ?? null,
          due_offset_days: task.due_offset_days,
          link_type: task.link_type,
        }))
      : [blankTask()]
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: TemplatePayload) => (template ? updateOnboardingTemplate(template.id, payload) : createOnboardingTemplate(payload)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success(template ? "Template updated" : "Template created", "It will be offered when hiring candidates.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function patch(key: number, changes: Partial<DraftTask>) {
    setTasks((previous) => previous.map((task) => (task.key === key ? { ...task, ...changes } : task)));
  }

  function move(index: number, direction: -1 | 1) {
    setTasks((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give the template a name.");
    const cleaned = tasks.filter((task) => task.title.trim());
    if (cleaned.length === 0) return setError("Add at least one task.");
    if (cleaned.some((task) => task.assignee_type === "user" && !task.assignee_user_id)) return setError("Choose a person for every task assigned to a specific person.");

    mutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      is_default: isDefault,
      tasks: cleaned.map(({ key: _key, ...task }) => {
        void _key;
        return { ...task, title: task.title.trim(), description: task.description?.trim() || null, assignee_user_id: task.assignee_type === "user" ? task.assignee_user_id : null };
      }),
    });
  }

  return (
    <Modal title={template ? "Edit template" : "New onboarding template"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="tpl-name">Name</label>
          <FormInput id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering new hire" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="tpl-desc">Description</label>
          <FormInput id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Use by default when hiring
        </label>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Tasks</h3>
          {tasks.map((task, index) => (
            <div key={task.key} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
              <div className="flex gap-2">
                <FormInput aria-label={`Task ${index + 1} title`} placeholder="e.g. Prepare laptop" value={task.title} onChange={(e) => patch(task.key, { title: e.target.value })} />
                <Button type="button" variant="outline" aria-label="Move task up" disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                <Button type="button" variant="outline" aria-label="Move task down" disabled={index === tasks.length - 1} onClick={() => move(index, 1)}>↓</Button>
                <Button type="button" variant="outline" aria-label="Remove task" onClick={() => setTasks((previous) => previous.filter((item) => item.key !== task.key))}>×</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor={`tpl-assignee-${task.key}`}>Assigned to</label>
                  <select id={`tpl-assignee-${task.key}`} className={selectClass} value={task.assignee_type} onChange={(e) => patch(task.key, { assignee_type: e.target.value as AssigneeType })}>
                    {(Object.keys(assigneeLabels) as AssigneeType[]).map((type) => <option key={type} value={type}>{assigneeLabels[type]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor={`tpl-due-${task.key}`}>Due (days from joining)</label>
                  <FormInput id={`tpl-due-${task.key}`} type="number" min={-60} max={365} value={task.due_offset_days} onChange={(e) => patch(task.key, { due_offset_days: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor={`tpl-link-${task.key}`}>Related to</label>
                  <select id={`tpl-link-${task.key}`} className={selectClass} value={task.link_type} onChange={(e) => patch(task.key, { link_type: e.target.value as TaskLinkType })}>
                    <option value="none">Nothing</option>
                    <option value="inventory">Equipment (Inventory)</option>
                    <option value="document">Documents</option>
                  </select>
                </div>
              </div>
              {task.assignee_type === "user" && (
                <PersonSelect label="Person" value={task.assignee_user_id} onChange={(value) => patch(task.key, { assignee_user_id: value })} placeholder="Choose a person" />
              )}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setTasks((previous) => [...previous, blankTask()])}>Add task</Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : template ? "Update template" : "Create template"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function OnboardingTemplatesTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore((state) => state.hasPermission("recruitment:manage_settings"));
  const [form, setForm] = useState<{ open: boolean; template: OnboardingTemplate | null }>({ open: false, template: null });
  const [deleteTarget, setDeleteTarget] = useState<OnboardingTemplate | null>(null);

  const templatesQuery = useQuery({ queryKey: ["recruitment", "onboarding-templates"], queryFn: listOnboardingTemplates });

  const deleteMutation = useMutation({
    mutationFn: deleteOnboardingTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Deleted", "Template removed. Existing onboarding tasks are not affected.");
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error("Delete failed", error.message);
      setDeleteTarget(null);
    },
  });

  const templates = templatesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">Templates create a ready-made task list for each new hire, with due dates counted from the joining date.</p>
        {canManage && <Button onClick={() => setForm({ open: true, template: null })}>New template</Button>}
      </div>
      {templatesQuery.isError && <FormError message={(templatesQuery.error as Error).message} />}
      {templatesQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading templates...</p>}
      {!templatesQuery.isLoading && templates.length === 0 && <p className="text-sm text-[var(--muted)]">No templates yet.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => (
          <article key={template.id} className="rounded-2xl border border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{template.name} {template.is_default && <Badge tone="blue">default</Badge>}</h3>
                {template.description && <p className="text-xs text-[var(--muted)]">{template.description}</p>}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm({ open: true, template })}>Edit</Button>
                  <Button variant="outline" onClick={() => setDeleteTarget(template)}>Delete</Button>
                </div>
              )}
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {template.tasks.map((task) => (
                <li key={task.id}>
                  {task.title}
                  <span className="block text-xs text-[var(--muted)]">
                    {task.assignee_type === "user" ? task.assignee?.name ?? "A person" : assigneeLabels[task.assignee_type]} · day {task.due_offset_days >= 0 ? "+" : ""}{task.due_offset_days}
                  </span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>

      {form.open && <TemplateFormModal template={form.template} onClose={() => setForm({ open: false, template: null })} />}
      {deleteTarget && (
        <ConfirmModal
          title="Delete template"
          message={`Delete "${deleteTarget.name}"? Tasks already created from it are kept.`}
          confirmLabel="Delete"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
