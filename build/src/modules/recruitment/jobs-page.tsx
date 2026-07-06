import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listDepartments } from "@/services/hr-management-service";
import {
  JobOpening,
  JobOpeningPayload,
  createJobOpening,
  deleteJobOpening,
  listJobOpenings,
  updateJobOpening,
} from "@/services/recruitment-service";
import { RecruitmentSubnav, formatRecruitmentDate } from "./shared";
import { toast } from "@/components/notifications/toast";

const defaultJobForm: JobOpeningPayload = {
  title: "",
  department_id: null,
  employment_type: "full_time",
  status: "open",
  open_positions: 1,
  location: "",
  description: "",
  posted_at: null,
  closed_at: null,
};

export function JobsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
  const [jobForm, setJobForm] = useState<JobOpeningPayload>(defaultJobForm);

  const jobsQuery = useQuery({
    queryKey: ["recruitment", "jobs", search],
    queryFn: () => listJobOpenings(search),
  });
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: listDepartments,
  });

  const createMutation = useMutation({
    mutationFn: createJobOpening,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] });
      toast.success("Job posted", "Job opening created successfully.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<JobOpeningPayload> }) => updateJobOpening(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] });
      toast.success("Job updated", "Job opening updated successfully.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJobOpening,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "jobs"] });
      toast.success("Deleted", "Job opening removed.");
    },
    onError: (mutationError: Error) => { toast.error("Delete failed", mutationError.message); setError(mutationError.message); },
  });

  const jobs = jobsQuery.data?.data ?? [];
  const departments = departmentsQuery.data ?? [];

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingJob(null);
    setJobForm(defaultJobForm);
  }

  function openCreate() {
    closeModal();
    setModalOpen(true);
  }

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!jobForm.title.trim()) {
      setError("Job title is required.");
      return;
    }

    const payload: JobOpeningPayload = {
      ...jobForm,
      title: jobForm.title.trim(),
      location: jobForm.location?.trim() || "",
      description: jobForm.description?.trim() || "",
      department_id: jobForm.department_id ?? null,
      posted_at: jobForm.posted_at || null,
      closed_at: jobForm.closed_at || null,
    };

    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, payload });
      return;
    }

    createMutation.mutate(payload);
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this job opening?")) return;
    setError(null);
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" subtitle="Manage openings, departments, and hiring capacity in a dedicated workflow." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput placeholder="Search job openings..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Button className="ml-auto" onClick={openCreate}>New Job</Button>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-3">
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Total</p><p className="mt-2 text-3xl font-semibold">{jobs.length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Open</p><p className="mt-2 text-3xl font-semibold">{jobs.filter((job) => job.status === "open").length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">On hold</p><p className="mt-2 text-3xl font-semibold">{jobs.filter((job) => job.status === "on_hold").length}</p></Card>
        </div>

        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Title</th>
                <th className="p-3">Department</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Positions</th>
                <th className="p-3">Location</th>
                <th className="p-3">Posted</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobsQuery.isLoading && (
                <tr>
                  <td className="p-4 text-[var(--muted)]" colSpan={8}>Loading job openings...</td>
                </tr>
              )}
              {!jobsQuery.isLoading && jobs.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium" data-label="Title">{item.title}</td>
                  <td className="p-3" data-label="Department">{item.department?.name ?? "-"}</td>
                  <td className="p-3 capitalize" data-label="Type">{item.employment_type.replace("_", " ")}</td>
                  <td className="p-3 capitalize" data-label="Status">{item.status.replace("_", " ")}</td>
                  <td className="p-3" data-label="Positions">{item.open_positions}</td>
                  <td className="p-3" data-label="Location">{item.location ?? "-"}</td>
                  <td className="p-3" data-label="Posted">{formatRecruitmentDate(item.posted_at)}</td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingJob(item);
                          setJobForm({
                            title: item.title,
                            department_id: item.department_id ?? null,
                            employment_type: item.employment_type,
                            location: item.location ?? "",
                            description: item.description ?? "",
                            status: item.status,
                            open_positions: item.open_positions,
                            posted_at: item.posted_at ?? null,
                            closed_at: item.closed_at ?? null,
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
              {!jobsQuery.isLoading && jobs.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-[var(--muted)]" colSpan={8}>No job openings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editingJob ? "Edit Job Opening" : "Create Job Opening"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Title</label>
                <FormInput value={jobForm.title} onChange={(e) => setJobForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Department</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={jobForm.department_id ?? ""}
                  onChange={(e) => setJobForm((prev) => ({ ...prev, department_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">No department</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={jobForm.employment_type} onChange={(e) => setJobForm((prev) => ({ ...prev, employment_type: e.target.value }))}>
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={jobForm.status} onChange={(e) => setJobForm((prev) => ({ ...prev, status: e.target.value as JobOpeningPayload["status"] }))}>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Open Positions</label>
                <FormInput type="number" min={1} value={jobForm.open_positions ?? 1} onChange={(e) => setJobForm((prev) => ({ ...prev, open_positions: Number(e.target.value) || 1 }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Location</label>
                <FormInput value={jobForm.location ?? ""} onChange={(e) => setJobForm((prev) => ({ ...prev, location: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Posted At</label>
                <FormInput type="date" value={jobForm.posted_at ?? ""} onChange={(e) => setJobForm((prev) => ({ ...prev, posted_at: e.target.value || null }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Closed At</label>
                <FormInput type="date" value={jobForm.closed_at ?? ""} onChange={(e) => setJobForm((prev) => ({ ...prev, closed_at: e.target.value || null }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={jobForm.description ?? ""}
                onChange={(e) => setJobForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the role, team, and hiring expectations."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">{editingJob ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
