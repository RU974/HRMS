import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { createTicket } from "@/services/ticket-service";
import { listDepartments } from "@/services/hr-management-service";

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

export function CreateTicketModal({ onClose, onCreated }: Props) {
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: listDepartments,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: "General", priority: "medium" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => createTicket({ ...data, department_id: parseInt(data.department_id, 10) }),
    onSuccess: () => {
      toast.success("Ticket created", "Your ticket has been submitted.");
      onCreated();
    },
    onError: (e: Error) => {
      toast.error("Failed to create ticket", e.message);
    },
  });

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
