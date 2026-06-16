import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/modals/modal";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header/page-header";
import {
  listWorkflows,
  createWorkflow,
  deleteWorkflow,
  type WorkflowItem,
  type WorkflowStepPayload,
  type ConditionOperator,
} from "@/services/approval-service";

const OPERATORS: ConditionOperator[] = [">", ">=", "<", "<=", "==", "!="];
const CONDITION_FIELDS = ["salary", "amount", "days", "leave_days", "grade"];

type StepDraft = Omit<WorkflowStepPayload, "approvers" | "conditions"> & {
  approvers: { approver_type: string; approver_identifier: string }[];
  conditions: { field: string; operator: ConditionOperator; value: string }[];
};

const blankApprover = { approver_type: "role", approver_identifier: "" };

function newStep(order: number): StepDraft {
  return {
    step_order: order,
    approver_type: "role",
    approver_identifier: "",
    approvers: [{ ...blankApprover }],
    conditions: [],
    required_approvals: 1,
    approval_mode: "first_n",
    escalation_hours: null,
  };
}

export function WorkflowsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [module, setModule] = useState("");
  const [workflowEscalation, setWorkflowEscalation] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([newStep(1)]);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        module: module.trim(),
        definition: { description: `${name.trim()} workflow` },
        escalation_hours: workflowEscalation ? Number(workflowEscalation) : null,
        steps: steps.map((step, index) => ({
          step_order: index + 1,
          approver_type: step.approvers[0]?.approver_type ?? "role",
          approver_identifier: step.approvers[0]?.approver_identifier ?? "",
          approvers: step.approvers,
          conditions: step.conditions.map((c) => ({ ...c, value: isNaN(Number(c.value)) ? c.value : Number(c.value) })),
          required_approvals: step.required_approvals,
          approval_mode: step.approval_mode,
          escalation_hours: step.escalation_hours,
        })),
      };

      return createWorkflow(payload);
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to create workflow.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : "Unable to delete workflow.");
    },
  });

  const workflows = workflowsQuery.data ?? [];
  const isLoading = workflowsQuery.isLoading;
  const error = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;

  function resetForm() {
    setModalOpen(false);
    setName("");
    setModule("");
    setWorkflowEscalation("");
    setSteps([newStep(1)]);
    setFormError(null);
    setMutationError(null);
  }

  function addStep() {
    setSteps((current) => [...current, newStep(current.length + 1)]);
  }

  function removeStep(index: number) {
    setSteps((current) => current.filter((_, i) => i !== index).map((step, i) => ({ ...step, step_order: i + 1 })));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((step, i) => ({ ...step, step_order: i + 1 }));
    });
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function addApprover(stepIndex: number) {
    updateStep(stepIndex, { approvers: [...steps[stepIndex].approvers, { ...blankApprover }] });
  }

  function updateApprover(stepIndex: number, approverIndex: number, patch: Partial<{ approver_type: string; approver_identifier: string }>) {
    const approvers = steps[stepIndex].approvers.map((a, i) => (i === approverIndex ? { ...a, ...patch } : a));
    updateStep(stepIndex, { approvers });
  }

  function removeApprover(stepIndex: number, approverIndex: number) {
    const approvers = steps[stepIndex].approvers.filter((_, i) => i !== approverIndex);
    updateStep(stepIndex, { approvers, required_approvals: Math.min(steps[stepIndex].required_approvals ?? 1, Math.max(approvers.length, 1)) });
  }

  function addCondition(stepIndex: number) {
    updateStep(stepIndex, { conditions: [...steps[stepIndex].conditions, { field: CONDITION_FIELDS[0], operator: ">", value: "" }] });
  }

  function updateCondition(stepIndex: number, condIndex: number, patch: Partial<{ field: string; operator: ConditionOperator; value: string }>) {
    const conditions = steps[stepIndex].conditions.map((c, i) => (i === condIndex ? { ...c, ...patch } : c));
    updateStep(stepIndex, { conditions });
  }

  function removeCondition(stepIndex: number, condIndex: number) {
    updateStep(stepIndex, { conditions: steps[stepIndex].conditions.filter((_, i) => i !== condIndex) });
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!name.trim() || !module.trim()) {
      setFormError("Workflow name and module are required.");
      return;
    }

    if (steps.some((step) => step.approvers.some((a) => !a.approver_type.trim() || !a.approver_identifier.trim()))) {
      setFormError("Every approver needs a type and identifier.");
      return;
    }

    if (steps.some((step) => step.conditions.some((c) => c.value === ""))) {
      setFormError("Every condition needs a value.");
      return;
    }

    try {
      await createMutation.mutateAsync();
    } catch {
      // Error is handled by onError.
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Approval Workflows" subtitle="Define and manage approval workflows for your organization." />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="space-y-4 border-[var(--border)]/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Workflow configuration</h2>
              <p className="text-sm text-[var(--muted)]">
                Create workflows, track steps, and manage approval behavior for HR processes.
              </p>
            </div>
            <Button onClick={() => setModalOpen(true)}>New Workflow</Button>
          </div>

          <div className="grid gap-3">
            <p className="text-sm text-[var(--muted)]">Use the table to inspect active workflows and step assignments. Deleting a workflow will only succeed when no approvals depend on it.</p>
          </div>
        </Card>

        <Card className="space-y-4 border-[var(--border)]/70 p-5">
          <h2 className="text-lg font-semibold">Next actions</h2>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => navigate("/approvals")}>Browse pending approvals</Button>
            <Button variant="outline" onClick={() => navigate("/approvals/delegations")}>My delegations</Button>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </div>
        </Card>
      </div>

      {(error || mutationError) ? (
        <Card className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-700">
          {mutationError || error}
        </Card>
      ) : null}

      <Card className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">Name</th>
              <th className="p-3">Module</th>
              <th className="p-3">Steps</th>
              <th className="p-3">Escalation</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">
                  Loading workflows...
                </td>
              </tr>
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">
                  No workflows configured yet.
                </td>
              </tr>
            ) : (
              workflows.map((workflow: WorkflowItem) => (
                <tr key={workflow.id} className="border-b border-[var(--border)]/60 align-top">
                  <td className="p-3 font-medium text-[var(--text)]">{workflow.name}</td>
                  <td className="p-3">{workflow.module}</td>
                  <td className="p-3">
                    <div className="space-y-2">
                      {workflow.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-start gap-2">
                          {idx > 0 && <span className="text-[var(--muted)]">→</span>}
                          <div>
                            <div className="font-medium text-[var(--text)]">Step {step.step_order}</div>
                            <div className="text-[var(--muted)]">
                              {(step.approvers && step.approvers.length > 0
                                ? step.approvers.map((a) => `${a.approver_type}:${a.approver_identifier}`).join(" + ")
                                : `${step.approver_type}:${step.approver_identifier}`)}
                              {step.required_approvals && step.required_approvals > 1 && (
                                <span> ({step.approval_mode === "all" ? "all" : `${step.required_approvals}-of-N`})</span>
                              )}
                            </div>
                            {step.conditions && step.conditions.length > 0 && (
                              <div className="text-[10px] text-indigo-600">
                                if {step.conditions.map((c) => `${c.field} ${c.operator} ${c.value}`).join(" and ")}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">{workflow.escalation_hours ? `${workflow.escalation_hours}h` : "Default"}</td>
                  <td className="p-3">{workflow.created_at?.slice(0, 10) ?? "-"}</td>
                  <td className="p-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        disabled={deleteMutation.status === "pending"}
                        onClick={() => {
                          if (window.confirm(`Delete workflow ${workflow.name}? This cannot be undone.`)) {
                            deleteMutation.mutate(workflow.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {modalOpen && (
        <Modal title="Create Workflow" onClose={resetForm}>
          <form onSubmit={handleCreate} className="max-h-[75vh] space-y-4 overflow-y-auto p-1">
            {formError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700">{formError}</div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--text)]">
                Module
                <input
                  value={module}
                  onChange={(event) => setModule(event.target.value)}
                  placeholder="leave, payroll, etc."
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-[var(--text)]">
              Default escalation (hours)
              <input
                type="number"
                min={1}
                value={workflowEscalation}
                onChange={(event) => setWorkflowEscalation(event.target.value)}
                placeholder="e.g. 48"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Approval Steps</h3>
                <Button type="button" variant="outline" onClick={addStep}>Add step</Button>
              </div>

              {steps.map((step, index) => (
                <div key={index}>
                  {index > 0 && <div className="mx-auto h-4 w-px bg-[var(--border)]" />}
                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Step {step.step_order}</div>
                      <div className="flex gap-1">
                        <Button type="button" variant="outline" onClick={() => moveStep(index, -1)} disabled={index === 0}>↑</Button>
                        <Button type="button" variant="outline" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}>↓</Button>
                        <Button type="button" variant="outline" onClick={() => removeStep(index)} disabled={steps.length === 1}>Remove</Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[var(--muted)]">Approvers</p>
                      {step.approvers.map((approver, aIdx) => (
                        <div key={aIdx} className="flex flex-wrap items-center gap-2">
                          <select
                            value={approver.approver_type}
                            onChange={(e) => updateApprover(index, aIdx, { approver_type: e.target.value })}
                            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                          >
                            <option value="role">Role</option>
                            <option value="user">User</option>
                            <option value="dynamic">Dynamic (manager)</option>
                          </select>
                          <input
                            value={approver.approver_identifier}
                            onChange={(e) => updateApprover(index, aIdx, { approver_identifier: e.target.value })}
                            placeholder={approver.approver_type === "user" ? "User ID" : approver.approver_type === "dynamic" ? "manager" : "Role name"}
                            className="h-9 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                          />
                          <button type="button" onClick={() => removeApprover(index, aIdx)} className="text-xs text-[var(--muted)] hover:text-red-500" disabled={step.approvers.length === 1}>×</button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={() => addApprover(index)}>+ Add another approver</Button>
                    </div>

                    {step.approvers.length > 1 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-[var(--text)]">
                          Required approvals
                          <input
                            type="number"
                            min={1}
                            max={step.approvers.length}
                            value={step.required_approvals}
                            onChange={(e) => updateStep(index, { required_approvals: Number(e.target.value) })}
                            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[var(--text)]">
                          Mode
                          <select
                            value={step.approval_mode}
                            onChange={(e) => updateStep(index, { approval_mode: e.target.value as "first_n" | "all" })}
                            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs"
                          >
                            <option value="first_n">First N to respond</option>
                            <option value="all">All must approve</option>
                          </select>
                        </label>
                      </div>
                    )}

                    <label className="block text-xs font-medium text-[var(--text)]">
                      Escalate after (hours, optional override)
                      <input
                        type="number"
                        min={1}
                        value={step.escalation_hours ?? ""}
                        onChange={(e) => updateStep(index, { escalation_hours: e.target.value ? Number(e.target.value) : null })}
                        className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs"
                      />
                    </label>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[var(--muted)]">Conditions (only run this step if...)</p>
                      {step.conditions.map((condition, cIdx) => (
                        <div key={cIdx} className="flex flex-wrap items-center gap-2">
                          <select
                            value={condition.field}
                            onChange={(e) => updateCondition(index, cIdx, { field: e.target.value })}
                            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                          >
                            {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                          <select
                            value={condition.operator}
                            onChange={(e) => updateCondition(index, cIdx, { operator: e.target.value as ConditionOperator })}
                            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                          >
                            {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                          </select>
                          <input
                            value={condition.value}
                            onChange={(e) => updateCondition(index, cIdx, { value: e.target.value })}
                            placeholder="value"
                            className="h-9 w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                          />
                          <button type="button" onClick={() => removeCondition(index, cIdx)} className="text-xs text-[var(--muted)] hover:text-red-500">×</button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={() => addCondition(index)}>+ Add condition</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.status === "pending"}>
                {createMutation.status === "pending" ? "Creating…" : "Create Workflow"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
