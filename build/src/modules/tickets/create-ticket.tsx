import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Paperclip, X } from "lucide-react";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { createTicket, uploadTicketAttachment } from "@/services/ticket-service";
import { listDepartments } from "@/services/hr-management-service";

const MAX_FILE_SIZE  = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_COUNT = 5;
const ACCEPTED_EXTS  = [".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"];

const schema = z.object({
  title:         z.string().min(1, "Title is required").max(255),
  description:   z.string().min(1, "Description is required"),
  category:      z.enum(["IT", "HR", "Finance", "Admin", "General"]),
  priority:      z.enum(["low", "medium", "high", "critical"]),
  department_id: z.string().min(1, "Department is required"),
});

type FormData = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateTicketModal({ onClose, onCreated }: Props) {
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: listDepartments,
  });

  const [files, setFiles]       = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: "General", priority: "medium" },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const ticket = await createTicket({ ...data, department_id: parseInt(data.department_id, 10) });
      if (files.length > 0) {
        await Promise.all(files.map(f => uploadTicketAttachment(ticket.id, f)));
      }
      return ticket;
    },
    onSuccess: () => {
      toast.success("Ticket created", "Your ticket has been submitted.");
      onCreated();
    },
    onError: (e: Error) => {
      toast.error("Failed to create ticket", e.message);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    addFiles(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addFiles(incoming: File[]) {
    setFileError(null);
    const merged = [...files];
    for (const f of incoming) {
      if (merged.length >= MAX_FILE_COUNT) {
        setFileError(`Maximum ${MAX_FILE_COUNT} files allowed.`);
        break;
      }
      if (f.size > MAX_FILE_SIZE) {
        setFileError(`"${f.name}" exceeds 10 MB limit.`);
        continue;
      }
      const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
      if (!ACCEPTED_EXTS.includes(ext)) {
        setFileError(`"${f.name}" is not an accepted file type.`);
        continue;
      }
      merged.push(f);
    }
    setFiles(merged);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFileError(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <Modal title="New Ticket" onClose={onClose}>
      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text)]">Title</label>
          <FormInput {...register("title")} placeholder="Brief summary of the issue" />
          {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text)]">Description</label>
          <textarea
            {...register("description")}
            rows={4}
            placeholder="Describe the issue in detail..."
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
          />
          {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>}
        </div>

        {/* File upload */}
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text)]">
            Attachments <span className="text-[var(--muted)] font-normal">(optional, max 5 files, 10 MB each)</span>
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-5 text-center transition hover:border-[var(--primary)] hover:bg-[var(--primary)]/5"
          >
            <Paperclip className="h-5 w-5 text-[var(--muted)]" />
            <p className="text-sm text-[var(--muted)]">
              Drop files here or <span className="font-medium text-[var(--primary)]">browse</span>
            </p>
            <p className="text-xs text-[var(--muted)]">PDF, JPG, PNG, DOCX, XLSX</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTS.join(",")}
            onChange={handleFileChange}
            className="hidden"
          />
          {fileError && <p className="mt-1 text-xs text-red-500">{fileError}</p>}
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--text)]"
                >
                  <Paperclip className="h-3 w-3 text-[var(--muted)]" />
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <span className="text-[var(--muted)]">({formatBytes(f.size)})</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeFile(i); }}
                    className="ml-1 rounded-full text-[var(--muted)] hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">Category</label>
            <select
              {...register("category")}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              {(["IT", "HR", "Finance", "Admin", "General"] as const).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">Priority</label>
            <select
              {...register("priority")}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              {(["low", "medium", "high", "critical"] as const).map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text)]">Department</label>
          <select
            {...register("department_id")}
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Select department…</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {errors.department_id && <p className="mt-1 text-xs text-red-500">{errors.department_id.message}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting…" : "Submit Ticket"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
