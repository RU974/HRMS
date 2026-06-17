import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { apiClient } from "@/services/api-client";
import { toast } from "@/components/notifications/toast";
import {
  AppraisalStatus,
  GoalStatus,
  PerformanceAppraisal,
  PerformanceAppraisalPayload,
  PerformanceGoal,
  PerformanceGoalPayload,
  PerformanceKpi,
  PerformanceKpiPayload,
  PerformanceReview,
  PerformanceReviewPayload,
  PerformanceReviewTemplate,
  PerformanceReviewTemplatePayload,
  PerformanceTrendPoint,
  bulkApproveAppraisals,
  createPerformanceAppraisal,
  createPerformanceGoal,
  createPerformanceKpi,
  createPerformanceReview,
  createPerformanceReviewTemplate,
  deletePerformanceAppraisal,
  deletePerformanceGoal,
  deletePerformanceKpi,
  deletePerformanceReview,
  deletePerformanceReviewTemplate,
  downloadAppraisalExport,
  getPerformanceTrend,
  listPerformanceAppraisals,
  listPerformanceGoals,
  listPerformanceKpis,
  listPerformanceReviewTemplates,
  listPerformanceReviews,
  updatePerformanceAppraisal,
  updatePerformanceGoal,
  updatePerformanceKpi,
  updatePerformanceReview,
  updatePerformanceReviewTemplate,
} from "@/services/performance-service";
import { createSalaryIncrement } from "@/services/payroll-service";
import { PerformanceSectionKey, PerformanceSubnav } from "./shared";

type EmployeeOption = { id: number; label: string };

const reviewDefaults: PerformanceReviewPayload = { employee_id: 0, reviewer_id: null, template_id: null, period: "", rating: 3, summary: "" };
const kpiDefaults: PerformanceKpiPayload = { employee_id: 0, name: "", target_value: 0, current_value: 0, unit: "%" };
const goalDefaults: PerformanceGoalPayload = { employee_id: 0, title: "", description: "", due_date: null, status: "not_started", progress: 0 };
const appraisalDefaults: PerformanceAppraisalPayload = { employee_id: 0, reviewer_id: null, template_id: null, cycle: "", overall_score: 3, status: "draft", strengths: "", improvements: "" };
const templateDefaults: PerformanceReviewTemplatePayload = { name: "", scale_min: 1, scale_max: 5, criteria: [], is_active: true, notes: "" };
const incrementDefaults = { employee_id: 0, appraisal_id: null as number | null, effective_date: "", old_salary: 0, new_salary: 0, reason: "", notes: "" };

const sectionMeta: Record<
  PerformanceSectionKey,
  { entityLabel: string; title: string; subtitle: string; createLabel: string; emptyMessage: string; formSpan: number }
> = {
  reviews: {
    entityLabel: "review",
    title: "Performance Reviews",
    subtitle: "Track review periods, ratings, and summary notes for each employee.",
    createLabel: "review",
    emptyMessage: "No performance reviews found.",
    formSpan: 5,
  },
  kpis: {
    entityLabel: "KPI",
    title: "Performance KPIs",
    subtitle: "Track employee targets, current values, and units in a dedicated workspace.",
    createLabel: "KPI",
    emptyMessage: "No KPIs found.",
    formSpan: 6,
  },
  goals: {
    entityLabel: "goal",
    title: "Performance Goals",
    subtitle: "Manage progress, status, and due dates without mixing it with reviews or appraisals.",
    createLabel: "goal",
    emptyMessage: "No goals found.",
    formSpan: 6,
  },
  appraisals: {
    entityLabel: "appraisal",
    title: "Performance Appraisals",
    subtitle: "Capture cycle-based appraisals with scores, strengths, and improvements.",
    createLabel: "appraisal",
    emptyMessage: "No appraisals found.",
    formSpan: 7,
  },
  templates: {
    entityLabel: "template",
    title: "Review Templates",
    subtitle: "Configure rating scales and criteria instead of freehand 1-5 scoring.",
    createLabel: "template",
    emptyMessage: "No review templates found.",
    formSpan: 5,
  },
  trend: {
    entityLabel: "trend",
    title: "Performance Trend",
    subtitle: "See how an employee's review and appraisal scores changed over time.",
    createLabel: "trend",
    emptyMessage: "No history found for this employee.",
    formSpan: 3,
  },
};

export function PerformanceWorkspace({ initialTab }: { initialTab: PerformanceSectionKey }) {
  const queryClient = useQueryClient();
  const activeTab = initialTab;
  const meta = sectionMeta[activeTab];
  const [search, setSearch] = useState("");
  const [goalStatus, setGoalStatus] = useState("");
  const [appraisalStatus, setAppraisalStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAppraisalIds, setSelectedAppraisalIds] = useState<number[]>([]);
  const [trendEmployeeId, setTrendEmployeeId] = useState(0);

  const [editingReview, setEditingReview] = useState<PerformanceReview | null>(null);
  const [editingKpi, setEditingKpi] = useState<PerformanceKpi | null>(null);
  const [editingGoal, setEditingGoal] = useState<PerformanceGoal | null>(null);
  const [editingAppraisal, setEditingAppraisal] = useState<PerformanceAppraisal | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PerformanceReviewTemplate | null>(null);

  const [reviewForm, setReviewForm] = useState<PerformanceReviewPayload>(reviewDefaults);
  const [kpiForm, setKpiForm] = useState<PerformanceKpiPayload>(kpiDefaults);
  const [goalForm, setGoalForm] = useState<PerformanceGoalPayload>(goalDefaults);
  const [appraisalForm, setAppraisalForm] = useState<PerformanceAppraisalPayload>(appraisalDefaults);
  const [templateForm, setTemplateForm] = useState<PerformanceReviewTemplatePayload>(templateDefaults);
  const [criteriaText, setCriteriaText] = useState("");

  const [incrementModalOpen, setIncrementModalOpen] = useState(false);
  const [incrementForm, setIncrementForm] = useState(incrementDefaults);
  const [incrementError, setIncrementError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: ["performance", "employees"],
    queryFn: async () => {
      const res = await apiClient<Array<{ id: number; first_name?: string; last_name?: string; name?: string; employee_code?: string }>>("/performance/meta/employees");
      return (res ?? []).map((emp) => ({
        id: emp.id,
        label: `${(emp.first_name ?? emp.name ?? "").trim()} ${(emp.last_name ?? "").trim()}`.trim() + (emp.employee_code ? ` (${emp.employee_code})` : ""),
      })) as EmployeeOption[];
    },
  });

  const reviewsQuery = useQuery({
    queryKey: ["performance", "reviews", search],
    queryFn: () => listPerformanceReviews(search),
    enabled: activeTab === "reviews",
  });
  const kpisQuery = useQuery({
    queryKey: ["performance", "kpis", search],
    queryFn: () => listPerformanceKpis(search),
    enabled: activeTab === "kpis",
  });
  const goalsQuery = useQuery({
    queryKey: ["performance", "goals", search, goalStatus],
    queryFn: () => listPerformanceGoals(search, goalStatus),
    enabled: activeTab === "goals",
  });
  const appraisalsQuery = useQuery({
    queryKey: ["performance", "appraisals", search],
    queryFn: () => listPerformanceAppraisals(search),
    enabled: activeTab === "appraisals",
  });
  const templatesQuery = useQuery({
    queryKey: ["performance", "templates"],
    queryFn: () => listPerformanceReviewTemplates(),
    enabled: activeTab === "templates" || activeTab === "appraisals" || activeTab === "reviews",
  });
  const trendQuery = useQuery({
    queryKey: ["performance", "trend", trendEmployeeId],
    queryFn: () => getPerformanceTrend(trendEmployeeId),
    enabled: activeTab === "trend" && trendEmployeeId > 0,
  });

  const createReviewMutation = useMutation({
    mutationFn: createPerformanceReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "reviews"] });
      toast.success("Review created", "Performance review saved successfully.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const updateReviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceReviewPayload> }) => updatePerformanceReview(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "reviews"] });
      toast.success("Review updated", "Performance review updated.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const deleteReviewMutation = useMutation({
    mutationFn: deletePerformanceReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "reviews"] });
      toast.success("Deleted", "Performance review removed.");
    },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });

  const createKpiMutation = useMutation({
    mutationFn: createPerformanceKpi,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "kpis"] });
      toast.success("KPI created", "KPI saved successfully.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const updateKpiMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceKpiPayload> }) => updatePerformanceKpi(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "kpis"] });
      toast.success("KPI updated", "KPI updated successfully.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const deleteKpiMutation = useMutation({
    mutationFn: deletePerformanceKpi,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "kpis"] });
      toast.success("Deleted", "KPI removed.");
    },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });

  const createGoalMutation = useMutation({
    mutationFn: createPerformanceGoal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "goals"] });
      toast.success("Goal created", "Performance goal saved.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const updateGoalMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceGoalPayload> }) => updatePerformanceGoal(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "goals"] });
      toast.success("Goal updated", "Performance goal updated.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const deleteGoalMutation = useMutation({
    mutationFn: deletePerformanceGoal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "goals"] });
      toast.success("Deleted", "Performance goal removed.");
    },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });

  const createAppraisalMutation = useMutation({
    mutationFn: createPerformanceAppraisal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
      toast.success("Appraisal created", "Appraisal saved successfully.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const updateAppraisalMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceAppraisalPayload> }) => updatePerformanceAppraisal(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
      toast.success("Appraisal updated", "Appraisal updated successfully.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const deleteAppraisalMutation = useMutation({
    mutationFn: deletePerformanceAppraisal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
      toast.success("Deleted", "Appraisal removed.");
    },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });
  const bulkApproveMutation = useMutation({
    mutationFn: bulkApproveAppraisals,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
      toast.success("Appraisals approved", "Selected appraisals have been approved.");
      setSelectedAppraisalIds([]);
    },
    onError: (e: Error) => { toast.error("Approval failed", e.message); setError(e.message); },
  });

  const createTemplateMutation = useMutation({
    mutationFn: createPerformanceReviewTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "templates"] });
      toast.success("Template created", "Review template saved.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceReviewTemplatePayload> }) => updatePerformanceReviewTemplate(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "templates"] });
      toast.success("Template updated", "Review template updated.");
      closeModal();
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });
  const deleteTemplateMutation = useMutation({
    mutationFn: deletePerformanceReviewTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "templates"] });
      toast.success("Deleted", "Review template removed.");
    },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });

  const createIncrementMutation = useMutation({
    mutationFn: createSalaryIncrement,
    onSuccess: () => {
      toast.success("Increment saved", "Salary increment recorded successfully.");
      setIncrementModalOpen(false);
      setIncrementForm(incrementDefaults);
      setIncrementError(null);
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setIncrementError(e.message); },
  });

  const activeData = useMemo(() => {
    if (activeTab === "reviews") return reviewsQuery.data ?? [];
    if (activeTab === "kpis") return kpisQuery.data ?? [];
    if (activeTab === "goals") return goalsQuery.data ?? [];
    if (activeTab === "templates") return templatesQuery.data ?? [];
    if (activeTab === "appraisals") return appraisalsQuery.data ?? [];
    return [];
  }, [activeTab, reviewsQuery.data, kpisQuery.data, goalsQuery.data, appraisalsQuery.data, templatesQuery.data]);

  const filteredAppraisals = useMemo(() => {
    const rows = (appraisalsQuery.data ?? []) as PerformanceAppraisal[];
    if (!appraisalStatus) return rows;
    return rows.filter((row) => row.status === appraisalStatus);
  }, [appraisalsQuery.data, appraisalStatus]);

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingReview(null);
    setEditingKpi(null);
    setEditingGoal(null);
    setEditingAppraisal(null);
    setEditingTemplate(null);
    setReviewForm(reviewDefaults);
    setKpiForm(kpiDefaults);
    setGoalForm(goalDefaults);
    setAppraisalForm(appraisalDefaults);
    setTemplateForm(templateDefaults);
    setCriteriaText("");
  }

  function openCreate() {
    closeModal();
    setModalOpen(true);
  }

  function employeeName(item?: { first_name?: string | null; last_name?: string | null; name?: string | null; employee_code?: string | null; employee_number?: string | null } | null) {
    if (!item) return "-";
    const name = `${item.first_name ?? item.name ?? ""} ${item.last_name ?? ""}`.trim();
    const employeeCode = item.employee_code ?? item.employee_number;
    return employeeCode ? `${name} (${employeeCode})` : name;
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this record?")) return;
    if (activeTab === "reviews") await deleteReviewMutation.mutateAsync(id);
    if (activeTab === "kpis") await deleteKpiMutation.mutateAsync(id);
    if (activeTab === "goals") await deleteGoalMutation.mutateAsync(id);
    if (activeTab === "appraisals") await deleteAppraisalMutation.mutateAsync(id);
    if (activeTab === "templates") await deleteTemplateMutation.mutateAsync(id);
  }

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (activeTab === "reviews") {
      if (!reviewForm.employee_id || !reviewForm.period.trim()) return setError("Employee and period are required.");
      if (editingReview) return void updateReviewMutation.mutate({ id: editingReview.id, payload: reviewForm });
      return void createReviewMutation.mutate(reviewForm);
    }

    if (activeTab === "kpis") {
      if (!kpiForm.employee_id || !kpiForm.name.trim()) return setError("Employee and KPI name are required.");
      if (editingKpi) return void updateKpiMutation.mutate({ id: editingKpi.id, payload: kpiForm });
      return void createKpiMutation.mutate(kpiForm);
    }

    if (activeTab === "goals") {
      if (!goalForm.employee_id || !goalForm.title.trim()) return setError("Employee and goal title are required.");
      if (editingGoal) return void updateGoalMutation.mutate({ id: editingGoal.id, payload: goalForm });
      return void createGoalMutation.mutate(goalForm);
    }

    if (activeTab === "templates") {
      if (!templateForm.name.trim()) return setError("Template name is required.");
      const criteria = criteriaText.split(",").map((c) => c.trim()).filter(Boolean);
      const payload = { ...templateForm, criteria };
      if (editingTemplate) return void updateTemplateMutation.mutate({ id: editingTemplate.id, payload });
      return void createTemplateMutation.mutate(payload);
    }

    if (!appraisalForm.employee_id || !appraisalForm.cycle.trim()) return setError("Employee and cycle are required.");
    if (editingAppraisal) return void updateAppraisalMutation.mutate({ id: editingAppraisal.id, payload: appraisalForm });
    return void createAppraisalMutation.mutate(appraisalForm);
  }

  function toggleAppraisalSelection(id: number) {
    setSelectedAppraisalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openIncrementModal(appraisal: PerformanceAppraisal) {
    setIncrementError(null);
    setIncrementForm({ ...incrementDefaults, employee_id: appraisal.employee_id, appraisal_id: appraisal.id, reason: `Appraisal: ${appraisal.cycle}` });
    setIncrementModalOpen(true);
  }

  function submitIncrement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIncrementError(null);
    if (!incrementForm.effective_date || incrementForm.new_salary <= 0) {
      setIncrementError("Effective date and a positive new salary are required.");
      return;
    }
    createIncrementMutation.mutate(incrementForm);
  }

  const label = meta.entityLabel;
  const rows = activeData as Array<PerformanceReview | PerformanceKpi | PerformanceGoal | PerformanceAppraisal | PerformanceReviewTemplate>;
  const showCreateButton = activeTab !== "trend";

  return (
    <div className="space-y-6">
      <PageHeader title={meta.title} subtitle={meta.subtitle} />
      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <PerformanceSubnav />

        {activeTab !== "trend" && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {activeTab !== "templates" && (
              <FormInput className="max-w-xl lg:flex-1" placeholder={`Search ${label}s...`} value={search} onChange={(e) => setSearch(e.target.value)} />
            )}
            {activeTab === "goals" && (
              <select
                className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={goalStatus}
                onChange={(e) => setGoalStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            )}
            {activeTab === "appraisals" && (
              <>
                <select
                  className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={appraisalStatus}
                  onChange={(e) => setAppraisalStatus(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                </select>
                <Button
                  variant="outline"
                  disabled={selectedAppraisalIds.length === 0 || bulkApproveMutation.isPending}
                  onClick={() => bulkApproveMutation.mutate(selectedAppraisalIds)}
                >
                  Approve Selected ({selectedAppraisalIds.length})
                </Button>
                <Button variant="outline" onClick={() => void downloadAppraisalExport().catch((e: Error) => setError(e.message))}>
                  Export CSV
                </Button>
              </>
            )}
            {showCreateButton && <Button onClick={openCreate}>New {meta.createLabel}</Button>}
          </div>
        )}

        {activeTab === "trend" && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <select
              className="h-11 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={trendEmployeeId}
              onChange={(e) => setTrendEmployeeId(Number(e.target.value))}
            >
              <option value={0}>Select employee</option>
              {(employeesQuery.data ?? []).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {activeTab === "trend" ? (
          <div className="space-y-3">
            {trendEmployeeId === 0 && <p className="text-sm text-[var(--muted)]">Select an employee to view their performance history.</p>}
            {trendEmployeeId > 0 && (trendQuery.data ?? []).length === 0 && <p className="text-sm text-[var(--muted)]">{meta.emptyMessage}</p>}
            {(trendQuery.data ?? []).map((point: PerformanceTrendPoint, idx: number) => (
              <div key={`${point.type}-${idx}`} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3">
                <div className="w-24 text-xs text-[var(--muted)]">{point.date}</div>
                <div className="w-24 text-xs uppercase text-[var(--muted)]">{point.type}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{point.label}</div>
                  <div className="mt-1 h-2 w-full rounded-full bg-[var(--border)]">
                    <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${Math.min(100, (point.score / 5) * 100)}%` }} />
                  </div>
                </div>
                <div className="w-12 text-right text-sm font-semibold">{point.score}/5</div>
              </div>
            ))}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {activeTab === "reviews" && (
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Period</th>
                  <th className="p-3">Rating</th>
                  <th className="p-3">Summary</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              )}
              {activeTab === "kpis" && (
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3">Employee</th>
                  <th className="p-3">KPI</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Current</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              )}
              {activeTab === "goals" && (
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Goal</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Progress</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              )}
              {activeTab === "appraisals" && (
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3"></th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Cycle</th>
                  <th className="p-3">Score</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Strengths</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              )}
              {activeTab === "templates" && (
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3">Name</th>
                  <th className="p-3">Scale</th>
                  <th className="p-3">Criteria</th>
                  <th className="p-3">Active</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {activeTab === "reviews" &&
                (rows as PerformanceReview[]).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">{employeeName(item.employee)}</td>
                    <td className="p-3">{item.period}</td>
                    <td className="p-3">{item.rating}/5</td>
                    <td className="p-3">{item.summary ?? "-"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingReview(item);
                            setReviewForm({ employee_id: item.employee_id, reviewer_id: item.reviewer_id, template_id: item.template_id ?? null, period: item.period, rating: item.rating, summary: item.summary ?? "" });
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => void onDelete(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {activeTab === "kpis" &&
                (rows as PerformanceKpi[]).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">{employeeName(item.employee)}</td>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3">{item.target_value}</td>
                    <td className="p-3">{item.current_value}</td>
                    <td className="p-3">{item.unit}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingKpi(item);
                            setKpiForm({ employee_id: item.employee_id, name: item.name, target_value: Number(item.target_value), current_value: Number(item.current_value), unit: item.unit });
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => void onDelete(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {activeTab === "goals" &&
                (rows as PerformanceGoal[]).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">{employeeName(item.employee)}</td>
                    <td className="p-3">{item.title}</td>
                    <td className="p-3">{item.status.replace("_", " ")}</td>
                    <td className="p-3">{item.progress}%</td>
                    <td className="p-3">{item.due_date ?? "-"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingGoal(item);
                            setGoalForm({ employee_id: item.employee_id, title: item.title, description: item.description ?? "", due_date: item.due_date, status: item.status, progress: item.progress });
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => void onDelete(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {activeTab === "appraisals" &&
                filteredAppraisals.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">
                      <input type="checkbox" checked={selectedAppraisalIds.includes(item.id)} onChange={() => toggleAppraisalSelection(item.id)} />
                    </td>
                    <td className="p-3">{employeeName(item.employee)}</td>
                    <td className="p-3">{item.cycle}</td>
                    <td className="p-3">{item.overall_score}/5</td>
                    <td className="p-3">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (item.status === "approved" ? "bg-green-100 text-green-700" : item.status === "submitted" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3">{item.strengths ?? "-"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={() => openIncrementModal(item)}>
                          To Increment
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingAppraisal(item);
                            setAppraisalForm({
                              employee_id: item.employee_id,
                              reviewer_id: item.reviewer_id,
                              template_id: item.template_id ?? null,
                              cycle: item.cycle,
                              overall_score: item.overall_score,
                              status: item.status,
                              strengths: item.strengths ?? "",
                              improvements: item.improvements ?? "",
                            });
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => void onDelete(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {activeTab === "templates" &&
                (rows as PerformanceReviewTemplate[]).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">{item.name}</td>
                    <td className="p-3">{item.scale_min} - {item.scale_max}</td>
                    <td className="p-3">{(item.criteria ?? []).join(", ") || "-"}</td>
                    <td className="p-3">{item.is_active ? "Yes" : "No"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingTemplate(item);
                            setTemplateForm({ name: item.name, scale_min: item.scale_min, scale_max: item.scale_max, criteria: item.criteria ?? [], is_active: item.is_active, notes: item.notes ?? "" });
                            setCriteriaText((item.criteria ?? []).join(", "));
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => void onDelete(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {((activeTab === "appraisals" && filteredAppraisals.length === 0) || (activeTab !== "appraisals" && rows.length === 0)) && (
                <tr>
                  <td className="p-6 text-center text-sm text-[var(--muted)]" colSpan={sectionMeta[activeTab].formSpan}>
                    {meta.emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {modalOpen && (
        <Modal title={`${editingReview || editingKpi || editingGoal || editingAppraisal || editingTemplate ? "Edit" : "Create"} ${label}`} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            {activeTab !== "templates" && (
              <div>
                <label className="mb-1 block text-sm font-medium">Employee</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={
                    activeTab === "reviews"
                      ? reviewForm.employee_id
                      : activeTab === "kpis"
                        ? kpiForm.employee_id
                        : activeTab === "goals"
                          ? goalForm.employee_id
                          : appraisalForm.employee_id
                  }
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (activeTab === "reviews") setReviewForm((prev) => ({ ...prev, employee_id: value }));
                    if (activeTab === "kpis") setKpiForm((prev) => ({ ...prev, employee_id: value }));
                    if (activeTab === "goals") setGoalForm((prev) => ({ ...prev, employee_id: value }));
                    if (activeTab === "appraisals") setAppraisalForm((prev) => ({ ...prev, employee_id: value }));
                  }}
                >
                  <option value={0}>Select employee</option>
                  {(employeesQuery.data ?? []).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(activeTab === "reviews" || activeTab === "appraisals") && (
              <FormField label="Review Template (optional)">
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={(activeTab === "reviews" ? reviewForm.template_id : appraisalForm.template_id) ?? 0}
                  onChange={(e) => {
                    const value = Number(e.target.value) || null;
                    if (activeTab === "reviews") setReviewForm((prev) => ({ ...prev, template_id: value }));
                    if (activeTab === "appraisals") setAppraisalForm((prev) => ({ ...prev, template_id: value }));
                  }}
                >
                  <option value={0}>No template (freehand)</option>
                  {(templatesQuery.data ?? []).map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.scale_min}-{tpl.scale_max})
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {activeTab === "reviews" && (
              <>
                <FormField label="Review Period">
                  <FormInput value={reviewForm.period} onChange={(e) => setReviewForm((prev) => ({ ...prev, period: e.target.value }))} />
                </FormField>
                <FormField label="Rating (1-5)">
                  <FormInput type="number" min={1} max={5} value={reviewForm.rating} onChange={(e) => setReviewForm((prev) => ({ ...prev, rating: Number(e.target.value) }))} />
                </FormField>
                <FormField label="Summary">
                  <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={reviewForm.summary ?? ""} onChange={(e) => setReviewForm((prev) => ({ ...prev, summary: e.target.value }))} />
                </FormField>
              </>
            )}

            {activeTab === "kpis" && (
              <>
                <FormField label="KPI Name">
                  <FormInput value={kpiForm.name} onChange={(e) => setKpiForm((prev) => ({ ...prev, name: e.target.value }))} />
                </FormField>
                <FormField label="Target Value">
                  <FormInput type="number" step="0.01" min={0} value={kpiForm.target_value} onChange={(e) => setKpiForm((prev) => ({ ...prev, target_value: Number(e.target.value) }))} />
                </FormField>
                <FormField label="Current Value">
                  <FormInput type="number" step="0.01" min={0} value={kpiForm.current_value} onChange={(e) => setKpiForm((prev) => ({ ...prev, current_value: Number(e.target.value) }))} />
                </FormField>
                <FormField label="Unit">
                  <FormInput value={kpiForm.unit} onChange={(e) => setKpiForm((prev) => ({ ...prev, unit: e.target.value }))} />
                </FormField>
              </>
            )}

            {activeTab === "goals" && (
              <>
                <FormField label="Goal Title">
                  <FormInput value={goalForm.title} onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))} />
                </FormField>
                <FormField label="Description">
                  <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={goalForm.description ?? ""} onChange={(e) => setGoalForm((prev) => ({ ...prev, description: e.target.value }))} />
                </FormField>
                <FormField label="Due Date">
                  <FormInput type="date" value={goalForm.due_date ?? ""} onChange={(e) => setGoalForm((prev) => ({ ...prev, due_date: e.target.value || null }))} />
                </FormField>
                <FormField label="Status">
                  <select
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                    value={goalForm.status}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, status: e.target.value as GoalStatus }))}
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </FormField>
                <FormField label="Progress %">
                  <FormInput type="number" min={0} max={100} value={goalForm.progress} onChange={(e) => setGoalForm((prev) => ({ ...prev, progress: Number(e.target.value) }))} />
                </FormField>
              </>
            )}

            {activeTab === "appraisals" && (
              <>
                <FormField label="Cycle">
                  <FormInput value={appraisalForm.cycle} onChange={(e) => setAppraisalForm((prev) => ({ ...prev, cycle: e.target.value }))} />
                </FormField>
                <FormField label="Overall Score (1-5)">
                  <FormInput type="number" min={1} max={5} value={appraisalForm.overall_score} onChange={(e) => setAppraisalForm((prev) => ({ ...prev, overall_score: Number(e.target.value) }))} />
                </FormField>
                <FormField label="Status">
                  <select
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                    value={appraisalForm.status}
                    onChange={(e) => setAppraisalForm((prev) => ({ ...prev, status: e.target.value as AppraisalStatus }))}
                  >
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                  </select>
                </FormField>
                <FormField label="Strengths">
                  <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={appraisalForm.strengths ?? ""} onChange={(e) => setAppraisalForm((prev) => ({ ...prev, strengths: e.target.value }))} />
                </FormField>
                <FormField label="Improvements">
                  <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={appraisalForm.improvements ?? ""} onChange={(e) => setAppraisalForm((prev) => ({ ...prev, improvements: e.target.value }))} />
                </FormField>
              </>
            )}

            {activeTab === "templates" && (
              <>
                <FormField label="Template Name">
                  <FormInput value={templateForm.name} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} />
                </FormField>
                <FormField label="Scale Min">
                  <FormInput type="number" min={0} max={99} value={templateForm.scale_min} onChange={(e) => setTemplateForm((prev) => ({ ...prev, scale_min: Number(e.target.value) }))} />
                </FormField>
                <FormField label="Scale Max">
                  <FormInput type="number" min={1} max={100} value={templateForm.scale_max} onChange={(e) => setTemplateForm((prev) => ({ ...prev, scale_max: Number(e.target.value) }))} />
                </FormField>
                <FormField label="Criteria (comma separated)">
                  <FormInput value={criteriaText} onChange={(e) => setCriteriaText(e.target.value)} placeholder="Communication, Quality, Ownership" />
                </FormField>
                <FormField label="Active">
                  <input type="checkbox" checked={templateForm.is_active} onChange={(e) => setTemplateForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                </FormField>
                <FormField label="Notes">
                  <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={templateForm.notes ?? ""} onChange={(e) => setTemplateForm((prev) => ({ ...prev, notes: e.target.value }))} />
                </FormField>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {incrementModalOpen && (
        <Modal title="Create Salary Increment from Appraisal" onClose={() => setIncrementModalOpen(false)}>
          <form className="space-y-4" onSubmit={submitIncrement}>
            {incrementError && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{incrementError}</div>}
            <FormField label="Effective Date">
              <FormInput type="date" value={incrementForm.effective_date} onChange={(e) => setIncrementForm((prev) => ({ ...prev, effective_date: e.target.value }))} />
            </FormField>
            <FormField label="Old Salary">
              <FormInput type="number" min={0} step="0.01" value={incrementForm.old_salary} onChange={(e) => setIncrementForm((prev) => ({ ...prev, old_salary: Number(e.target.value) }))} />
            </FormField>
            <FormField label="New Salary">
              <FormInput type="number" min={0} step="0.01" value={incrementForm.new_salary} onChange={(e) => setIncrementForm((prev) => ({ ...prev, new_salary: Number(e.target.value) }))} />
            </FormField>
            <FormField label="Reason">
              <FormInput value={incrementForm.reason} onChange={(e) => setIncrementForm((prev) => ({ ...prev, reason: e.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={incrementForm.notes} onChange={(e) => setIncrementForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIncrementModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createIncrementMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
