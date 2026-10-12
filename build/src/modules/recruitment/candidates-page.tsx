import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  BulkAction,
  Candidate,
  CandidateListParams,
  CandidateStage,
  candidateStageLabels,
  deleteCandidate,
  getCandidateStats,
  listCandidates,
  listJobOpenings,
  toFilterParams,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { BulkActionBar, BulkActionModal, ImportCandidatesModal } from "./bulk-components";
import { CandidateBoard } from "./candidate-board";
import { CandidateFormModal, HireModal, RejectModal } from "./candidate-components";
import { EmailTemplatesModal } from "./email-templates";
import { FitBadge } from "./fit-components";
import { Selection, emptySelection, isSelected, selectAllMatching, selectionAfterRun, selectionCount, toBulkScope, toggleOne, togglePage } from "./selection";
import { Badge, ConfirmModal, FormError, RecruitmentSubnav, StageBadge, StatCard, formatRecruitmentDate, selectClass } from "./shared";

const PAGE_SIZE = 15;
const VIEW_KEY = "recruitment.candidates.view";

type ViewMode = "board" | "table";

function readView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "table" ? "table" : "board";
  } catch {
    return "board";
  }
}

export function CandidatesPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canCreate = hasPermission("recruitment:create");
  const canEdit = hasPermission("recruitment:edit") || canCreate;
  const canDelete = hasPermission("recruitment:delete");

  const [view, setView] = useState<ViewMode>(readView);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stageFilter, setStageFilter] = useState<CandidateStage | "">("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "">("");
  const [jobFilter, setJobFilter] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const [hireTargetId, setHireTargetId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Candidate | null>(null);
  const [resumeInput, setResumeInput] = useState("");
  const [resumeSearch, setResumeSearch] = useState("");
  const [minExperience, setMinExperience] = useState<number | "">("");
  const [poolFilter, setPoolFilter] = useState<CandidateListParams["talent_pool"]>("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [fitFirst, setFitFirst] = useState(false);
  const [minFit, setMinFit] = useState<number | "">("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setResumeSearch(resumeInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [resumeInput]);

  function chooseView(mode: ViewMode) {
    setView(mode);
    setSelection(emptySelection);
    try {
      window.localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // Remembering the view is a convenience only.
    }
  }

  // The same filters feed the list and "select everything matching", so they can never disagree.
  const tableFilters: CandidateListParams = {
    q: search,
    stage: stageFilter,
    status: statusFilter,
    job_opening_id: jobFilter,
    resume_q: resumeSearch,
    min_experience: minExperience,
    talent_pool: poolFilter,
    duplicates: duplicatesOnly || undefined,
    min_fit: minFit,
  };

  const candidatesQuery = useQuery({
    queryKey: ["recruitment", "candidates", { search, page, stageFilter, statusFilter, jobFilter, resumeSearch, minExperience, poolFilter, duplicatesOnly, fitFirst, minFit }],
    queryFn: () => listCandidates({ ...tableFilters, page, per_page: PAGE_SIZE, sort: fitFirst ? "fit" : undefined }),
    placeholderData: (previous) => previous,
    enabled: view === "table",
  });
  const statsQuery = useQuery({ queryKey: ["recruitment", "stats", jobFilter], queryFn: () => getCandidateStats(jobFilter) });
  const jobsQuery = useQuery({ queryKey: ["recruitment", "jobs", "candidate-options"], queryFn: () => listJobOpenings() });

  const deleteMutation = useMutation({
    mutationFn: deleteCandidate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Deleted", "Candidate removed.");
      setDeleteTarget(null);
    },
    onError: (mutationError: Error) => {
      toast.error("Delete failed", mutationError.message);
      setError(mutationError.message);
      setDeleteTarget(null);
    },
  });

  const pageData = candidatesQuery.data;
  const { sorted: candidates, sort, setSort, toggle: toggleSort } = useTableSort(pageData?.data ?? [], "full_name", {
    job: (c) => c.job_opening?.title,
    employee: (c) => c.employee?.name,
  });
  const jobs = jobsQuery.data?.data ?? [];
  const stats = statsQuery.data;
  const lastPage = pageData?.last_page ?? 1;

  function resetFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  const pageIds = candidates.map((candidate) => candidate.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => isSelected(selection, id));
  const selectedCount = selectionCount(selection);

  // Offer to widen the selection to everyone matching the filter once the whole page is ticked.
  const matchingTotal = pageData?.total ?? 0;
  const offerAllMatching =
    view === "table" && allOnPageSelected && !selection.all && matchingTotal > pageIds.length
      ? { total: matchingTotal, onSelect: () => setSelection(selectAllMatching(toFilterParams(tableFilters), matchingTotal)) }
      : null;

  function chooseFitFirst(enabled: boolean) {
    setFitFirst(enabled);
    setPage(1);
    setSort(enabled ? { key: "fit_score", dir: "desc" } : { key: "full_name", dir: "asc" });
  }

  const hasAdvancedFilters = Boolean(resumeSearch || minExperience !== "" || poolFilter || duplicatesOnly || minFit !== "");

  function openForm(candidate: Candidate | null) {
    setEditing(candidate);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Candidates" subtitle="Move candidates through the hiring stages, on a board or in a table." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput aria-label="Search candidates" placeholder="Search candidates..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="max-w-sm" />
          <select aria-label="Filter by job" className={`${selectClass} w-auto min-w-40`} value={jobFilter} onChange={(e) => resetFilter(setJobFilter, e.target.value ? Number(e.target.value) : "")}>
            <option value="">All jobs</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
          {view === "table" && (
            <select aria-label="Filter by stage" className={`${selectClass} w-auto min-w-36`} value={stageFilter} onChange={(e) => resetFilter(setStageFilter, e.target.value as CandidateStage | "")}>
              <option value="">All stages</option>
              {(Object.keys(candidateStageLabels) as CandidateStage[]).map((stage) => <option key={stage} value={stage}>{candidateStageLabels[stage]}</option>)}
            </select>
          )}
          <select aria-label="Filter by status" className={`${selectClass} w-auto min-w-36`} value={statusFilter} onChange={(e) => resetFilter(setStatusFilter, e.target.value as "active" | "inactive" | "")}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-[var(--border)]" role="group" aria-label="View">
              {(["board", "table"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => chooseView(mode)}
                  className={`px-3 py-2 text-sm capitalize ${view === mode ? "bg-[var(--primary)] text-white" : "bg-[var(--card)]"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {canEdit && <Button variant="outline" onClick={() => setTemplatesOpen(true)}>Email templates</Button>}
            {canCreate && <Button variant="outline" onClick={() => setImportOpen(true)}>Import CSV</Button>}
            {canCreate && <Button onClick={() => openForm(null)}>New Candidate</Button>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fitFirst} onChange={(e) => chooseFitFirst(e.target.checked)} />
            Best fit first
          </label>
          <FormInput
            aria-label="Minimum fit score"
            type="number"
            min={0}
            max={100}
            placeholder="Min. fit %"
            value={minFit}
            onChange={(e) => resetFilter(setMinFit, e.target.value === "" ? "" : Math.min(100, Math.max(0, Number(e.target.value))))}
            className="w-32"
          />
        </div>

        {view === "table" && (
          <div className="flex flex-wrap items-center gap-3">
            <FormInput
              aria-label="Search resumes"
              placeholder='Search resumes: skills or keywords, e.g. laravel "team lead"'
              value={resumeInput}
              onChange={(e) => setResumeInput(e.target.value)}
              className="max-w-md"
            />
            <FormInput
              aria-label="Minimum years of experience"
              type="number"
              min={0}
              placeholder="Min. years"
              value={minExperience}
              onChange={(e) => resetFilter(setMinExperience, e.target.value === "" ? "" : Number(e.target.value))}
              className="w-32"
            />
            <select aria-label="Filter by talent pool" className={`${selectClass} w-auto min-w-44`} value={poolFilter} onChange={(e) => resetFilter(setPoolFilter, e.target.value as CandidateListParams["talent_pool"])}>
              <option value="">Any pool status</option>
              <option value="any">In a talent pool</option>
              <option value="silver_medalist">Silver medalists</option>
              <option value="general">General pool</option>
              <option value="none">Not in a pool</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={duplicatesOnly} onChange={(e) => resetFilter(setDuplicatesOnly, e.target.checked)} />
              Applied more than once
            </label>
            {hasAdvancedFilters && (
              <Button
                variant="outline"
                onClick={() => {
                  setResumeInput("");
                  setMinExperience("");
                  setPoolFilter("");
                  setDuplicatesOnly(false);
                  setMinFit("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        <BulkActionBar
          count={selectedCount}
          canEdit={canEdit}
          onClear={() => setSelection(emptySelection)}
          onChoose={setBulkAction}
          offerAllMatching={offerAllMatching}
          allMatching={selection.all ? { excluded: selection.excluded.size } : null}
        />

        <FormError message={error} />

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total" value={stats?.total ?? "-"} />
          <StatCard label="Active" value={stats?.active ?? "-"} />
          <StatCard label="Hired" value={stats?.hired ?? "-"} />
          <StatCard label="Interview" value={stats?.interview ?? "-"} />
        </div>

        {view === "board" ? (
          <CandidateBoard
            jobOpeningId={jobFilter}
            search={search}
            status={statusFilter}
            minFit={minFit}
            sort={fitFirst ? "fit" : ""}
            canMove={canEdit}
            selection={selection}
            onSelectionChange={setSelection}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="rtable w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                    <th className="w-10 p-3">
                      <input type="checkbox" aria-label="Select all candidates on this page" checked={allOnPageSelected} onChange={() => setSelection((previous) => togglePage(previous, pageIds))} />
                    </th>
                    <SortableTh label="Name" sortKey="full_name" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Job" sortKey="job" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Stage" sortKey="stage" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Fit" sortKey="fit_score" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Score" sortKey="score" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Applied" sortKey="applied_at" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatesQuery.isLoading && (
                    <tr><td className="p-4 text-[var(--muted)]" colSpan={11}>Loading candidates...</td></tr>
                  )}
                  {candidatesQuery.isError && (
                    <tr><td className="p-4 text-red-700" colSpan={11}>Could not load candidates. {(candidatesQuery.error as Error).message}</td></tr>
                  )}
                  {!candidatesQuery.isLoading && candidates.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                      <td className="p-3" data-label="Select">
                        <input type="checkbox" aria-label={`Select ${item.full_name}`} checked={isSelected(selection, item.id)} onChange={() => setSelection((previous) => toggleOne(previous, item.id))} />
                      </td>
                      <td className="p-3 font-medium" data-label="Name">
                        <Link to={`/recruitment/candidates/${item.id}`} className="hover:underline">{item.full_name}</Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.talent_pool && <Badge tone="violet">{item.talent_pool === "silver_medalist" ? "silver medalist" : "talent pool"}</Badge>}
                          {item.withdrawn_at && <Badge tone="slate">withdrew</Badge>}
                          {item.anonymized_at && <Badge tone="slate">data erased</Badge>}
                          {item.resume_review_reason && item.has_resume && <span title="The resume could not be read automatically"><Badge tone="amber">check resume</Badge></span>}
                          {(item.duplicate_count ?? 0) > 0 && (
                            <Link to={`/recruitment/candidates/${item.id}`} title="Same email or phone on other applications">
                              <Badge tone="amber">{item.duplicate_count} other application{item.duplicate_count === 1 ? "" : "s"}</Badge>
                            </Link>
                          )}
                          {item.experience_years != null && <Badge tone="slate">{item.experience_years} yrs</Badge>}
                          {(item.skills ?? []).slice(0, 4).map((skill) => <Badge key={skill} tone="blue">{skill}</Badge>)}
                        </div>
                        {item.resume_snippet && <p className="mt-1 max-w-md text-xs font-normal italic text-[var(--muted)]">{item.resume_snippet}</p>}
                      </td>
                      <td className="p-3" data-label="Email">{item.email}</td>
                      <td className="p-3" data-label="Job">{item.job_opening?.title ?? "-"}</td>
                      <td className="p-3" data-label="Stage"><StageBadge stage={item.stage} /></td>
                      <td className="p-3 capitalize" data-label="Status">{item.status}</td>
                      <td className="p-3" data-label="Fit">{item.fit_score != null ? <FitBadge score={item.fit_score} breakdown={item.fit_breakdown} /> : "-"}</td>
                      <td className="p-3" data-label="Score">{item.score ?? "-"}</td>
                      <td className="p-3" data-label="Applied">{formatRecruitmentDate(item.applied_at)}</td>
                      <td className="p-3" data-label="Employee">
                        {item.employee ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">{item.employee.name}</span>
                        ) : "-"}
                      </td>
                      <td className="p-3" data-label="Actions">
                        <div className="flex justify-end gap-2">
                          {canEdit && item.stage === "offer" && <Button onClick={() => setHireTargetId(item.id)}>Hire</Button>}
                          {canEdit && item.stage !== "hired" && item.stage !== "rejected" && (
                            <Button variant="outline" onClick={() => setRejectTarget(item)}>Reject</Button>
                          )}
                          {canEdit && <Button variant="outline" onClick={() => openForm(item)}>Edit</Button>}
                          {canDelete && item.stage !== "hired" && !item.employee_id && (
                            <Button variant="outline" onClick={() => setDeleteTarget(item)}>Delete</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!candidatesQuery.isLoading && !candidatesQuery.isError && candidates.length === 0 && (
                    <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={11}>No candidates found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {pageData && pageData.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
                <span>Page {pageData.current_page} of {lastPage} · {pageData.total} candidate{pageData.total === 1 ? "" : "s"}</span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                  <Button variant="outline" disabled={page >= lastPage} onClick={() => setPage((current) => Math.min(lastPage, current + 1))}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {importOpen && <ImportCandidatesModal onClose={() => setImportOpen(false)} />}
      {templatesOpen && <EmailTemplatesModal onClose={() => setTemplatesOpen(false)} />}
      {bulkAction && (
        <BulkActionModal
          action={bulkAction}
          scope={toBulkScope(selection)}
          onClose={() => setBulkAction(null)}
          onDone={(result) => setSelection(selectionAfterRun(result.failed.map((failure) => failure.id)))}
        />
      )}
      {formOpen && <CandidateFormModal candidate={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />}
      {hireTargetId !== null && <HireModal candidateId={hireTargetId} onClose={() => setHireTargetId(null)} />}
      {rejectTarget && <RejectModal candidate={rejectTarget} onClose={() => setRejectTarget(null)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Delete candidate"
          message={`Delete ${deleteTarget.full_name}? This also removes their interviews and resume and cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
