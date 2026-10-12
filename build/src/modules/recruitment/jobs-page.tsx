import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { listDepartments } from "@/services/hr-management-service";
import {
  JobOpening,
  JobOpeningPayload,
  JobStatus,
  approveJobRequisition,
  createJobOpening,
  createRequisition,
  deleteJobOpening,
  getCareersSettings,
  listJobOpenings,
  listMyRequisitions,
  listRequisitionDepartments,
  rejectJobRequisition,
  resubmitRequisition,
  submitJobRequisition,
  updateCareersSettings,
  updateJobOpening,
  updateRequisition,
  withdrawRequisition,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { HiringSetupModal, PipelineEditor, WideModal } from "./hiring-setup";
import { BudgetCheckPanel, HeadcountBudgetsModal, JobBudgetNote, SuggestedCandidatesModal } from "./job-extras";
import { Badge, ConfirmModal, FormError, NoteModal, PersonSelect, RecruitmentSubnav, StatCard, formatMoney, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

const defaultForm: JobOpeningPayload = {
  title: "",
  department_id: null,
  employment_type: "full_time",
  location: "",
  description: "",
  requirements: "",
  status: "open",
  open_positions: 1,
  posted_at: null,
  closed_at: null,
  hiring_manager_id: null,
  recruiter_id: null,
  salary_min: null,
  salary_max: null,
  salary_currency: "PKR",
  is_public: false,
  justification: "",
};

const statusTone: Record<JobStatus, "emerald" | "slate" | "amber" | "red"> = {
  open: "emerald",
  closed: "slate",
  on_hold: "amber",
  pending_approval: "amber",
  rejected: "red",
};

export function JobsPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canCreate = hasPermission("recruitment:create") || hasPermission("recruitment:request");
  const canEdit = hasPermission("recruitment:edit");
  const canDelete = hasPermission("recruitment:delete");
  const canManageSettings = hasPermission("recruitment:manage_settings");
  const canView = hasPermission("recruitment:view");
  const canRequest = hasPermission("recruitment:request");
  const canApprove = hasPermission("approvals:approve");
  const currentUserId = useAuthStore((state) => state.user?.id);
  // Hiring managers without recruitment access can only raise and follow their own requisitions.
  const requesterOnly = !canView && canRequest;

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
  const [jobForm, setJobForm] = useState<JobOpeningPayload>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<JobOpening | null>(null);
  const [careersOpen, setCareersOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<JobOpening | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [suggestFor, setSuggestFor] = useState<JobOpening | null>(null);
  const [setupFor, setSetupFor] = useState<JobOpening | null>(null);
  const [defaultPipelineOpen, setDefaultPipelineOpen] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ["recruitment", "jobs", requesterOnly ? "mine" : search],
    queryFn: () => (requesterOnly ? listMyRequisitions() : listJobOpenings(search)),
  });
  // Requesters cannot read the full department list, so they get a minimal one of their own.
  const departmentsQuery = useQuery({
    queryKey: ["departments", requesterOnly ? "requisition" : "all"],
    queryFn: () => (requesterOnly ? listRequisitionDepartments() : listDepartments()),
  });
  const careersQuery = useQuery({ queryKey: ["recruitment", "careers-settings"], queryFn: getCareersSettings, enabled: canView });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });

  const saveMutation = useMutation({
    mutationFn: (payload: JobOpeningPayload) => {
      if (requesterOnly) return editingJob ? updateRequisition(editingJob.id, payload) : createRequisition(payload);
      return editingJob ? updateJobOpening(editingJob.id, payload) : createJobOpening(payload);
    },
    onSuccess: async (job) => {
      await refresh();
      if (!editingJob && job.status === "pending_approval") {
        toast.success("Requisition submitted", "It will go live once it has been approved.");
      } else {
        toast.success(editingJob ? "Job updated" : "Job posted", editingJob ? "Job opening saved." : "Job opening created successfully.");
      }
      closeModal();
    },
    onError: (mutationError: Error) => {
      toast.error("Save failed", mutationError.message);
      setError(mutationError.message);
    },
  });

  const requisitionMutation = useMutation({
    mutationFn: ({ job, action, note }: { job: JobOpening; action: "approve" | "reject" | "submit" | "withdraw"; note?: string }) => {
      switch (action) {
        case "approve": return approveJobRequisition(job.id, note);
        case "reject": return rejectJobRequisition(job.id, note ?? "");
        case "withdraw": return withdrawRequisition(job.id);
        default: return requesterOnly ? resubmitRequisition(job.id) : submitJobRequisition(job.id);
      }
    },
    onSuccess: async (_job, { action }) => {
      await refresh();
      const done = { approve: "Requisition approved. The job is now open.", reject: "Requisition rejected.", withdraw: "Requisition withdrawn.", submit: "Submitted for approval." }[action];
      toast.success("Done", done);
      setRejectTarget(null);
    },
    onError: (mutationError: Error) => toast.error("Could not update the requisition", mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJobOpening,
    onSuccess: async () => {
      await refresh();
      toast.success("Deleted", "Job opening removed.");
      setDeleteTarget(null);
    },
    onError: (mutationError: Error) => {
      toast.error("Delete failed", mutationError.message);
      setError(mutationError.message);
      setDeleteTarget(null);
    },
  });

  const { sorted: jobs, sort, toggle: toggleSort } = useTableSort(jobsQuery.data?.data ?? [], "title", {
    department: (j) => j.department?.name,
    progress: (j) => j.hired_count ?? 0,
    owner: (j) => j.hiring_manager?.name ?? j.recruiter?.name,
  });
  const departments = departmentsQuery.data ?? [];
  const careers = careersQuery.data;

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingJob(null);
    setJobForm(defaultForm);
  }

  function openEdit(job: JobOpening) {
    setEditingJob(job);
    setJobForm({
      title: job.title,
      department_id: job.department_id ?? null,
      employment_type: job.employment_type,
      location: job.location ?? "",
      description: job.description ?? "",
      requirements: job.requirements ?? "",
      status: job.status,
      open_positions: job.open_positions,
      posted_at: job.posted_at ? job.posted_at.slice(0, 10) : null,
      closed_at: job.closed_at ? job.closed_at.slice(0, 10) : null,
      hiring_manager_id: job.hiring_manager_id ?? null,
      recruiter_id: job.recruiter_id ?? null,
      salary_min: job.salary_min != null ? Number(job.salary_min) : null,
      salary_max: job.salary_max != null ? Number(job.salary_max) : null,
      salary_currency: job.salary_currency ?? "PKR",
      is_public: Boolean(job.is_public),
      justification: job.justification ?? "",
    });
    setModalOpen(true);
  }

  // A new job from a requester, or from anyone when the company enforces approval, is a requisition.
  const approvalEnforced = requesterOnly || Boolean(careers?.requisition_approval_required);
  const editingRejected = editingJob?.status === "rejected";
  const submitsRequisition = !editingJob && approvalEnforced;
  const statusLocked = submitsRequisition || editingRejected;

  function set<K extends keyof JobOpeningPayload>(key: K, value: JobOpeningPayload[K]) {
    setJobForm((previous) => ({ ...previous, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!jobForm.title.trim()) return setError("Job title is required.");
    if (jobForm.salary_min != null && jobForm.salary_max != null && jobForm.salary_max < jobForm.salary_min) {
      return setError("The maximum salary cannot be lower than the minimum.");
    }

    saveMutation.mutate({
      ...jobForm,
      // A requisition's status is decided by its approval, never by the form.
      status: statusLocked ? undefined : jobForm.status,
      justification: jobForm.justification?.trim() || null,
      title: jobForm.title.trim(),
      location: jobForm.location?.trim() || null,
      description: jobForm.description?.trim() || null,
      requirements: jobForm.requirements?.trim() || null,
      open_positions: Number(jobForm.open_positions) || 1,
      // closed_at is derived by the server from the status.
      closed_at: undefined,
    });
  }

  const awaitingCount = jobs.filter((job) => job.status === "pending_approval").length;
  const openCount = jobs.filter((job) => job.status === "open").length;
  const totalPositions = jobs.filter((job) => job.status === "open").reduce((sum, job) => sum + job.open_positions, 0);
  const hiredTotal = jobs.reduce((sum, job) => sum + (job.hired_count ?? 0), 0);
  const careersUrl = careers?.path ? `${window.location.origin}${careers.path}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={requesterOnly ? "Job requisitions" : "Jobs"}
        subtitle={requesterOnly ? "Request a new role. It goes live once HR approves it." : "Manage openings, owners and hiring capacity, and publish them on your careers page."}
      />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {canView && <FormInput aria-label="Search jobs" placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />}
          <div className="ml-auto flex gap-2">
            {canView && <Button variant="outline" onClick={() => setBudgetsOpen(true)}>Headcount budgets</Button>}
            {canView && <Button variant="outline" onClick={() => setDefaultPipelineOpen(true)}>Default pipeline</Button>}
            {canView && <Button variant="outline" onClick={() => setCareersOpen(true)}>Careers page</Button>}
            {canCreate && <Button onClick={() => setModalOpen(true)}>{approvalEnforced ? "Request Job" : "New Job"}</Button>}
          </div>
        </div>

        <FormError message={error} />

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard label="Jobs" value={jobs.length} />
          <StatCard label="Awaiting approval" value={awaitingCount} />
          <StatCard label="Open" value={openCount} />
          <StatCard label="Open positions" value={totalPositions} />
          <StatCard label="Hired" value={hiredTotal} />
        </div>

        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
                <SortableTh label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
                <SortableTh label="Owner" sortKey="owner" sort={sort} onSort={toggleSort} />
                <SortableTh label="Type" sortKey="employment_type" sort={sort} onSort={toggleSort} />
                <SortableTh label="Hired / Positions" sortKey="progress" sort={sort} onSort={toggleSort} />
                <th className="p-3">Candidates</th>
                <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                <th className="p-3">Careers</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobsQuery.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={9}>Loading jobs...</td></tr>}
              {jobsQuery.isError && <tr><td className="p-4 text-red-700" colSpan={9}>Could not load jobs. {(jobsQuery.error as Error).message}</td></tr>}
              {!jobsQuery.isLoading && jobs.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium" data-label="Title">
                    {item.title}
                    <span className="block text-xs font-normal text-[var(--muted)]">{item.location || "-"} · posted {formatRecruitmentDate(item.posted_at)}</span>
                  </td>
                  <td className="p-3" data-label="Department">{item.department?.name ?? "-"}</td>
                  <td className="p-3" data-label="Owner">
                    {item.hiring_manager?.name ?? "-"}
                    {item.recruiter && <span className="block text-xs text-[var(--muted)]">Recruiter: {item.recruiter.name}</span>}
                  </td>
                  <td className="p-3 capitalize" data-label="Type">{item.employment_type.replace("_", " ")}</td>
                  <td className="p-3" data-label="Hired / Positions">{item.hired_count ?? 0} / {item.open_positions}</td>
                  <td className="p-3" data-label="Candidates">
                    <Link className="hover:underline" to="/recruitment/candidates" title="Open the candidates board">{item.candidates_count ?? 0}</Link>
                  </td>
                  <td className="p-3" data-label="Status">
                    <Badge tone={statusTone[item.status]}>{item.status.replace("_", " ")}</Badge>
                    {item.status === "pending_approval" && item.requester && <span className="mt-1 block text-xs text-[var(--muted)]">Requested by {item.requester.name}</span>}
                    {(item.status === "pending_approval" || item.status === "rejected") && <JobBudgetNote job={item} />}
                    {item.status === "rejected" && item.approval_note && <span className="mt-1 block max-w-48 text-xs text-red-700">{item.approval_note}</span>}
                  </td>
                  <td className="p-3" data-label="Careers">{item.is_public ? <Badge tone="blue">public</Badge> : <span className="text-[var(--muted)]">-</span>}</td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-2">
                      {item.status === "pending_approval" && canApprove && item.requested_by !== currentUserId && (
                        <>
                          <Button disabled={requisitionMutation.isPending} onClick={() => requisitionMutation.mutate({ job: item, action: "approve" })}>Approve</Button>
                          <Button variant="outline" disabled={requisitionMutation.isPending} onClick={() => setRejectTarget(item)}>Reject</Button>
                        </>
                      )}
                      {item.status === "pending_approval" && item.requested_by === currentUserId && (
                        <Button variant="outline" disabled={requisitionMutation.isPending} onClick={() => requisitionMutation.mutate({ job: item, action: "withdraw" })}>Withdraw</Button>
                      )}
                      {item.status === "rejected" && (canEdit || (requesterOnly && item.requested_by === currentUserId)) && (
                        <Button disabled={requisitionMutation.isPending} onClick={() => requisitionMutation.mutate({ job: item, action: "submit" })}>Resubmit</Button>
                      )}
                      {canView && item.status === "open" && <Button variant="outline" onClick={() => setSuggestFor(item)}>Pool matches</Button>}
                      {canView && item.status !== "pending_approval" && <Button variant="outline" onClick={() => setSetupFor(item)}>Hiring setup</Button>}
                      {canEdit && item.status === "open" && (
                        <Button variant="outline" onClick={() => updateJobOpening(item.id, { status: "closed" }).then(refresh).catch((closeError: Error) => toast.error("Could not close job", closeError.message))}>Close</Button>
                      )}
                      {item.status !== "pending_approval" && (canEdit || (requesterOnly && item.status === "rejected" && item.requested_by === currentUserId)) && (
                        <Button variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                      )}
                      {canDelete && item.status !== "pending_approval" && <Button variant="outline" onClick={() => setDeleteTarget(item)}>Delete</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!jobsQuery.isLoading && !jobsQuery.isError && jobs.length === 0 && <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={9}>No job openings found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editingJob ? "Edit Job" : submitsRequisition ? "Request a new job" : "Create Job"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submit}>
            <FormError message={error} />
            {(submitsRequisition || editingRejected) && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {editingRejected
                  ? "This requisition was not approved. Fix it here, then use Resubmit to send it again."
                  : "This job needs approval from HR before it goes live and can receive candidates."}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium" htmlFor="job-title">Title</label>
                <FormInput id="job-title" value={jobForm.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-dept">Department</label>
                <select id="job-dept" className={selectClass} value={jobForm.department_id ?? ""} onChange={(e) => set("department_id", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">No department</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-[var(--muted)]">A department is required before anyone can be hired into this job.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-type">Employment type</label>
                <select id="job-type" className={selectClass} value={jobForm.employment_type} onChange={(e) => set("employment_type", e.target.value)}>
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-location">Location</label>
                <FormInput id="job-location" value={jobForm.location ?? ""} onChange={(e) => set("location", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-positions">Open positions</label>
                <FormInput id="job-positions" type="number" min={1} max={1000} value={jobForm.open_positions ?? 1} onChange={(e) => set("open_positions", Number(e.target.value))} />
                <p className="mt-1 text-xs text-[var(--muted)]">The job closes itself when this many people are hired.</p>
              </div>
              {!statusLocked && (
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="job-status">Status</label>
                  <select id="job-status" className={selectClass} value={jobForm.status} onChange={(e) => set("status", e.target.value as JobStatus)}>
                    <option value="open">Open</option>
                    <option value="on_hold">On hold</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              )}
              {!statusLocked && (
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="job-posted">Posted on</label>
                  <FormInput id="job-posted" type="date" value={jobForm.posted_at ?? ""} onChange={(e) => set("posted_at", e.target.value || null)} />
                </div>
              )}
              {!requesterOnly && (
                <>
                  <PersonSelect label="Hiring manager" value={jobForm.hiring_manager_id} currentName={editingJob?.hiring_manager?.name} onChange={(value) => set("hiring_manager_id", value)} />
                  <PersonSelect label="Recruiter" value={jobForm.recruiter_id} currentName={editingJob?.recruiter?.name} onChange={(value) => set("recruiter_id", value)} />
                </>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-min">Salary from</label>
                <FormInput id="job-min" type="number" min={0} value={jobForm.salary_min ?? ""} onChange={(e) => set("salary_min", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-max">Salary to</label>
                <FormInput id="job-max" type="number" min={0} value={jobForm.salary_max ?? ""} onChange={(e) => set("salary_max", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-currency">Currency</label>
                <FormInput id="job-currency" maxLength={10} value={jobForm.salary_currency ?? ""} onChange={(e) => set("salary_currency", e.target.value.toUpperCase())} />
              </div>
            </div>
            {(approvalEnforced || canView) && (
              <BudgetCheckPanel
                departmentId={jobForm.department_id}
                openPositions={Number(jobForm.open_positions) || 1}
                salaryMin={jobForm.salary_min}
                salaryMax={jobForm.salary_max}
                jobId={editingJob?.id}
              />
            )}
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="job-desc">Description</label>
              <textarea id="job-desc" className={textareaClass} value={jobForm.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="job-req">Requirements</label>
              <textarea id="job-req" className={textareaClass} value={jobForm.requirements ?? ""} onChange={(e) => set("requirements", e.target.value)} />
            </div>
            {(approvalEnforced || Boolean(editingJob?.justification) || editingRejected) && (
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="job-justification">Why is this role needed?</label>
                <textarea id="job-justification" className={textareaClass} value={jobForm.justification ?? ""} onChange={(e) => set("justification", e.target.value)} placeholder="Business case, team growth, replacement..." />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(jobForm.is_public)} onChange={(e) => set("is_public", e.target.checked)} />
              Show on the public careers page (while the job is open)
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editingJob ? "Update" : submitsRequisition ? "Submit for approval" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {budgetsOpen && <HeadcountBudgetsModal canManage={canManageSettings} onClose={() => setBudgetsOpen(false)} />}
      {defaultPipelineOpen && (
        <WideModal title="Default pipeline stages" onClose={() => setDefaultPipelineOpen(false)}>
          <PipelineEditor jobId={null} canEdit={canManageSettings} />
          <div className="mt-5 flex justify-end"><Button type="button" variant="outline" onClick={() => setDefaultPipelineOpen(false)}>Close</Button></div>
        </WideModal>
      )}
      {setupFor && <HiringSetupModal job={setupFor} canEdit={canEdit} onClose={() => setSetupFor(null)} />}
      {suggestFor && <SuggestedCandidatesModal job={suggestFor} canPutForward={hasPermission("recruitment:create")} onClose={() => setSuggestFor(null)} />}

      {careersOpen && (
        careers ? (
          <CareersSettingsModal canManage={canManageSettings} url={careersUrl} initial={careers} onClose={() => setCareersOpen(false)} />
        ) : (
          // Never show an editable form before the saved settings arrive, or saving could overwrite them with blanks.
          <Modal title="Public careers page" onClose={() => setCareersOpen(false)}>
            {careersQuery.isError ? (
              <FormError message={`Could not load the careers page settings. ${(careersQuery.error as Error).message}`} />
            ) : (
              <p className="text-sm text-[var(--muted)]">Loading settings...</p>
            )}
            <div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => setCareersOpen(false)}>Close</Button></div>
          </Modal>
        )
      )}

      {rejectTarget && (
        <NoteModal
          title={`Reject "${rejectTarget.title}"`}
          label="Reason"
          placeholder="Tell the requester why, so they can fix it and resubmit."
          submitLabel="Reject requisition"
          required
          busy={requisitionMutation.isPending}
          onSubmit={(note) => requisitionMutation.mutate({ job: rejectTarget, action: "reject", note })}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete job opening"
          message={`Delete "${deleteTarget.title}"? Jobs that already have candidates cannot be deleted; close them instead.`}
          confirmLabel="Delete"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function CareersSettingsModal({ canManage, url, initial, onClose }: {
  canManage: boolean;
  url: string | null;
  initial: {
    slug: string | null;
    enabled: boolean;
    intro: string | null;
    requisition_approval_required: boolean;
    email_delivery: boolean;
    requisition_cost_threshold: number | null;
    talent_pool_retention_months: number | null;
    candidate_retention_months: number | null;
    referral_bonus_amount: number | null;
    referral_bonus_wait_days: number;
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [intro, setIntro] = useState(initial.intro ?? "");
  const [requireApproval, setRequireApproval] = useState(initial.requisition_approval_required);
  const [costThreshold, setCostThreshold] = useState<number | "">(initial.requisition_cost_threshold ?? "");
  const [poolMonths, setPoolMonths] = useState<number | "">(initial.talent_pool_retention_months ?? "");
  const [candidateMonths, setCandidateMonths] = useState<number | "">(initial.candidate_retention_months ?? "");
  const [referralBonus, setReferralBonus] = useState<number | "">(initial.referral_bonus_amount ?? "");
  const [referralDays, setReferralDays] = useState<number | "">(initial.referral_bonus_wait_days ?? 90);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateCareersSettings({
        slug: slug.trim().toLowerCase() || null,
        enabled,
        intro: intro.trim() || null,
        requisition_approval_required: requireApproval,
        requisition_cost_threshold: costThreshold === "" ? null : Number(costThreshold),
        talent_pool_retention_months: poolMonths === "" ? null : Number(poolMonths),
        candidate_retention_months: candidateMonths === "" ? null : Number(candidateMonths),
        referral_bonus_amount: referralBonus === "" ? null : Number(referralBonus),
        referral_bonus_wait_days: referralDays === "" ? 0 : Number(referralDays),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "careers-settings"] });
      toast.success("Settings saved", enabled ? "Your public careers page is live." : "The careers page is switched off.");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (enabled && !slug.trim()) return setError("Choose a page address before enabling the careers page.");
    mutation.mutate();
  }

  return (
    <Modal title="Public careers page" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <p className="text-sm text-[var(--muted)]">Open jobs marked "public" appear on your careers page, where anyone can apply without signing in.</p>
        {!initial.email_delivery && (
          <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Email is not set up on the server (it only writes messages to a log). Offer links, signing codes, consent requests and candidate emails will not reach anyone until a real mail driver is configured in the backend <code>.env</code>.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} disabled={!canManage} onChange={(e) => setEnabled(e.target.checked)} /> Careers page is live
        </label>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="careers-slug">Page address</label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">{window.location.origin}/careers/</span>
            <FormInput id="careers-slug" value={slug} disabled={!canManage} onChange={(e) => setSlug(e.target.value)} placeholder="your-company" />
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Lowercase letters, numbers and hyphens.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="careers-intro">Introduction</label>
          <textarea id="careers-intro" className={textareaClass} value={intro} disabled={!canManage} onChange={(e) => setIntro(e.target.value)} placeholder="A short welcome shown above the job list." />
        </div>
        <div className="rounded-xl border border-[var(--border)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={requireApproval} disabled={!canManage} onChange={(e) => setRequireApproval(e.target.checked)} />
            New jobs need approval before they go live
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">When on, every new job is sent to an HR Manager or Company Admin first. Hiring managers can also request roles themselves.</p>
        </div>
        <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cost-threshold">Extra approval above this cost</label>
            <FormInput id="cost-threshold" type="number" min={0} disabled={!canManage} value={costThreshold} onChange={(e) => setCostThreshold(e.target.value === "" ? "" : Number(e.target.value))} placeholder="No limit" />
            <p className="mt-1 text-xs text-[var(--muted)]">A request whose positions cost this much or more (salary to x positions) also needs the Company Admin, on top of HR. Requests over a department's approved headcount or budget need them too.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="pool-months">Keep talent pool entries for (months)</label>
              <FormInput id="pool-months" type="number" min={1} max={120} disabled={!canManage} value={poolMonths} onChange={(e) => setPoolMonths(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Forever" />
              <p className="mt-1 text-xs text-[var(--muted)]">Entries then leave the pool unless the person agrees to stay.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="candidate-months">Erase rejected candidates after (months)</label>
              <FormInput id="candidate-months" type="number" min={1} max={240} disabled={!canManage} value={candidateMonths} onChange={(e) => setCandidateMonths(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Never" />
              <p className="mt-1 text-xs text-[var(--muted)]">Their name, contact details, resume and notes are erased. People in the talent pool are kept.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 rounded-xl border border-[var(--border)] p-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="referral-bonus">Default employee referral bonus</label>
            <FormInput id="referral-bonus" type="number" min={0} disabled={!canManage} value={referralBonus} onChange={(e) => setReferralBonus(e.target.value === "" ? "" : Number(e.target.value))} placeholder="No bonus" />
            <p className="mt-1 text-xs text-[var(--muted)]">A job can set its own amount in its Hiring setup.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="referral-days">Pay after the hire has stayed (days)</label>
            <FormInput id="referral-days" type="number" min={0} max={730} disabled={!canManage} value={referralDays} onChange={(e) => setReferralDays(e.target.value === "" ? "" : Number(e.target.value))} />
            <p className="mt-1 text-xs text-[var(--muted)]">The bonus is cancelled if the referred hire leaves before this.</p>
          </div>
        </div>
        {url && initial.enabled && (
          <p className="text-sm">Live at <a className="text-[var(--primary)] underline" href={url} target="_blank" rel="noreferrer noopener">{url}</a></p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {canManage && <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>}
        </div>
        {!canManage && <p className="text-xs text-[var(--muted)]">Only users who manage recruitment settings can change these.</p>}
      </form>
    </Modal>
  );
}
