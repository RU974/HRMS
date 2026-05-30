import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { apiClient } from "@/services/api-client";
import {
  GoalStatus,
  PerformanceAppraisal,
  PerformanceAppraisalPayload,
  PerformanceGoal,
  PerformanceGoalPayload,
  PerformanceKpi,
  PerformanceKpiPayload,
  PerformanceReview,
  PerformanceReviewPayload,
  createPerformanceAppraisal,
  createPerformanceGoal,
  createPerformanceKpi,
  createPerformanceReview,
  deletePerformanceAppraisal,
  deletePerformanceGoal,
  deletePerformanceKpi,
  deletePerformanceReview,
  listPerformanceAppraisals,
  listPerformanceGoals,
  listPerformanceKpis,
  listPerformanceReviews,
  updatePerformanceAppraisal,
  updatePerformanceGoal,
  updatePerformanceKpi,
  updatePerformanceReview,
} from "@/services/performance-service";
import { PerformanceSectionKey, PerformanceSubnav } from "./shared";

type EmployeeOption = { id: number; label: string };

const reviewDefaults: PerformanceReviewPayload = { employee_id: 0, reviewer_id: null, period: "", rating: 3, summary: "" };
const kpiDefaults: PerformanceKpiPayload = { employee_id: 0, name: "", target_value: 0, current_value: 0, unit: "%" };
const goalDefaults: PerformanceGoalPayload = { employee_id: 0, title: "", description: "", due_date: null, status: "not_started", progress: 0 };
const appraisalDefaults: PerformanceAppraisalPayload = { employee_id: 0, reviewer_id: null, cycle: "", overall_score: 3, strengths: "", improvements: "" };

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
    formSpan: 6,
  },
};

export function PerformanceWorkspace({ initialTab }: { initialTab: PerformanceSectionKey }) {
  const queryClient = useQueryClient();
  const activeTab = initialTab;
  const meta = sectionMeta[activeTab];
  const [search, setSearch] = useState("");
  const [goalStatus, setGoalStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingReview, setEditingReview] = useState<PerformanceReview | null>(null);
  const [editingKpi, setEditingKpi] = useState<PerformanceKpi | null>(null);
  const [editingGoal, setEditingGoal] = useState<PerformanceGoal | null>(null);
  const [editingAppraisal, setEditingAppraisal] = useState<PerformanceAppraisal | null>(null);

  const [reviewForm, setReviewForm] = useState<PerformanceReviewPayload>(reviewDefaults);
  const [kpiForm, setKpiForm] = useState<PerformanceKpiPayload>(kpiDefaults);
  const [goalForm, setGoalForm] = useState<PerformanceGoalPayload>(goalDefaults);
  const [appraisalForm, setAppraisalForm] = useState<PerformanceAppraisalPayload>(appraisalDefaults);

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

  const createReviewMutation = useMutation({
    mutationFn: createPerformanceReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "reviews"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const updateReviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceReviewPayload> }) => updatePerformanceReview(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "reviews"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const deleteReviewMutation = useMutation({
    mutationFn: deletePerformanceReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "reviews"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const createKpiMutation = useMutation({
    mutationFn: createPerformanceKpi,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "kpis"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const updateKpiMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceKpiPayload> }) => updatePerformanceKpi(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "kpis"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const deleteKpiMutation = useMutation({
    mutationFn: deletePerformanceKpi,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "kpis"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const createGoalMutation = useMutation({
    mutationFn: createPerformanceGoal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "goals"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const updateGoalMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceGoalPayload> }) => updatePerformanceGoal(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "goals"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const deleteGoalMutation = useMutation({
    mutationFn: deletePerformanceGoal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "goals"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const createAppraisalMutation = useMutation({
    mutationFn: createPerformanceAppraisal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const updateAppraisalMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<PerformanceAppraisalPayload> }) => updatePerformanceAppraisal(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });
  const deleteAppraisalMutation = useMutation({
    mutationFn: deletePerformanceAppraisal,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["performance", "appraisals"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const activeData = useMemo(() => {
    if (activeTab === "reviews") return reviewsQuery.data ?? [];
    if (activeTab === "kpis") return kpisQuery.data ?? [];
    if (activeTab === "goals") return goalsQuery.data ?? [];
    return appraisalsQuery.data ?? [];
  }, [activeTab, reviewsQuery.data, kpisQuery.data, goalsQuery.data, appraisalsQuery.data]);

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingReview(null);
    setEditingKpi(null);
    setEditingGoal(null);
    setEditingAppraisal(null);
    setReviewForm(reviewDefaults);
    setKpiForm(kpiDefaults);
    setGoalForm(goalDefaults);
    setAppraisalForm(appraisalDefaults);
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

    if (!appraisalForm.employee_id || !appraisalForm.cycle.trim()) return setError("Employee and cycle are required.");
    if (editingAppraisal) return void updateAppraisalMutation.mutate({ id: editingAppraisal.id, payload: appraisalForm });
    return void createAppraisalMutation.mutate(appraisalForm);
  }

  const label = meta.entityLabel;
  const rows = activeData as Array<PerformanceReview | PerformanceKpi | PerformanceGoal | PerformanceAppraisal>;

  return (
    <div className="space-y-6">
      <PageHeader title={meta.title} subtitle={meta.subtitle} />
      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <PerformanceSubnav />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <FormInput className="max-w-xl lg:flex-1" placeholder={`Search ${label}s...`} value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <Button onClick={openCreate}>New {meta.createLabel}</Button>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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
                  <th className="p-3">Employee</th>
                  <th className="p-3">Cycle</th>
                  <th className="p-3">Score</th>
                  <th className="p-3">Strengths</th>
                  <th className="p-3">Improvements</th>
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
                            setReviewForm({ employee_id: item.employee_id, reviewer_id: item.reviewer_id, period: item.period, rating: item.rating, summary: item.summary ?? "" });
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
                (rows as PerformanceAppraisal[]).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">{employeeName(item.employee)}</td>
                    <td className="p-3">{item.cycle}</td>
                    <td className="p-3">{item.overall_score}/5</td>
                    <td className="p-3">{item.strengths ?? "-"}</td>
                    <td className="p-3">{item.improvements ?? "-"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingAppraisal(item);
                            setAppraisalForm({ employee_id: item.employee_id, reviewer_id: item.reviewer_id, cycle: item.cycle, overall_score: item.overall_score, strengths: item.strengths ?? "", improvements: item.improvements ?? "" });
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
              {rows.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-sm text-[var(--muted)]" colSpan={sectionMeta[activeTab].formSpan}>
                    {meta.emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={`${editingReview || editingKpi || editingGoal || editingAppraisal ? "Edit" : "Create"} ${label}`} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
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
                <FormField label="Strengths">
                  <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={appraisalForm.strengths ?? ""} onChange={(e) => setAppraisalForm((prev) => ({ ...prev, strengths: e.target.value }))} />
                </FormField>
                <FormField label="Improvements">
                  <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={appraisalForm.improvements ?? ""} onChange={(e) => setAppraisalForm((prev) => ({ ...prev, improvements: e.target.value }))} />
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
