import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  EmailTemplate,
  addStarterEmailTemplates,
  createEmailTemplate,
  deleteEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
} from "@/services/recruitment-service";
import { FormError, textareaClass } from "./shared";

export const TEMPLATE_PLACEHOLDERS = ["{{name}}", "{{first_name}}", "{{job}}", "{{company}}"];

const templatesKey = ["recruitment", "email-templates"] as const;

export function useEmailTemplates() {
  return useQuery({ queryKey: templatesKey, queryFn: listEmailTemplates, staleTime: 60_000 });
}

/** Choose one of the saved templates to fill an email form. */
export function EmailTemplatePicker({ onPick, disabled }: { onPick: (template: EmailTemplate) => void; disabled?: boolean }) {
  const templatesQuery = useEmailTemplates();
  const templates = templatesQuery.data ?? [];

  if (templatesQuery.isLoading) return <p className="text-xs text-[var(--muted)]">Loading templates...</p>;
  if (templates.length === 0) return <p className="text-xs text-[var(--muted)]">No saved templates yet. Write an email below and save it as one.</p>;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="email-template-picker">Saved template</label>
      <select
        id="email-template-picker"
        disabled={disabled}
        className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
        value=""
        onChange={(e) => {
          const template = templates.find((item) => item.id === Number(e.target.value));
          if (template) onPick(template);
        }}
      >
        <option value="">Start from a template...</option>
        {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select>
    </div>
  );
}

/** Save the email being written as a template. */
export function SaveTemplateButton({ subject, body }: { subject: string; body: string }) {
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () => createEmailTemplate({ name: name.trim(), subject: subject.trim(), body: body.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templatesKey });
      toast.success("Template saved", `"${name.trim()}" is now available when you write an email.`);
      setNaming(false);
      setName("");
    },
    onError: (error: Error) => toast.error("Could not save the template", error.message),
  });

  if (!naming) {
    return (
      <Button type="button" variant="outline" disabled={!subject.trim() || !body.trim()} onClick={() => setNaming(true)}>
        Save as template
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormInput aria-label="Template name" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} className="w-52" autoFocus />
      <Button type="button" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving..." : "Save"}</Button>
      <Button type="button" variant="outline" onClick={() => setNaming(false)}>Cancel</Button>
    </div>
  );
}

/** Add, edit and delete the company's saved candidate emails. */
export function EmailTemplatesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const templatesQuery = useEmailTemplates();
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: templatesKey });

  function open(template: EmailTemplate | "new") {
    setEditing(template);
    setError(null);
    setName(template === "new" ? "" : template.name);
    setSubject(template === "new" ? "" : template.subject);
    setBody(template === "new" ? "" : template.body);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), subject: subject.trim(), body: body.trim() };
      return editing && editing !== "new" ? updateEmailTemplate(editing.id, payload) : createEmailTemplate(payload);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Template saved");
      setEditing(null);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEmailTemplate(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Template deleted");
    },
    onError: (mutationError: Error) => toast.error("Could not delete the template", mutationError.message),
  });

  const starterMutation = useMutation({
    mutationFn: addStarterEmailTemplates,
    onSuccess: async () => {
      await refresh();
      toast.success("Starter templates added");
    },
    onError: (mutationError: Error) => toast.error("Could not add the starters", mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !subject.trim() || !body.trim()) return setError("A template needs a name, a subject and a message.");
    saveMutation.mutate();
  }

  const templates = templatesQuery.data ?? [];

  return (
    <Modal title="Email templates" onClose={onClose}>
      {editing ? (
        <form className="space-y-4" onSubmit={submit}>
          <FormError message={error} />
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="template-name">Name</label>
            <FormInput id="template-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="template-subject">Subject</label>
            <FormInput id="template-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="template-body">Message</label>
            <textarea id="template-body" className={`${textareaClass} min-h-40`} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Filled in for each candidate: {TEMPLATE_PLACEHOLDERS.map((placeholder) => <code key={placeholder} className="mr-1">{placeholder}</code>)}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Back</Button>
            <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save template"}</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 text-sm">
          {templatesQuery.isError && <FormError message={(templatesQuery.error as Error).message} />}
          {templatesQuery.isLoading && <p className="text-[var(--muted)]">Loading...</p>}
          {!templatesQuery.isLoading && templates.length === 0 && <p className="text-[var(--muted)]">No templates yet. Add the ready-made ones or write your own.</p>}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{template.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{template.subject}</p>
                </div>
                <Button variant="outline" onClick={() => open(template)}>Edit</Button>
                <Button variant="outline" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(template.id)}>Delete</Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" disabled={starterMutation.isPending} onClick={() => starterMutation.mutate()}>
              {starterMutation.isPending ? "Adding..." : "Add ready-made templates"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => open("new")}>New template</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
