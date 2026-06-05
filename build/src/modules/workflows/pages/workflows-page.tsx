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
} from "@/services/approval-service";

const initialStep = { step_order: 1, approver_type: "role", approver_identifier: "", conditions: "[]" };

export function WorkflowsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [module, setModule] = useState("");
  const [definition, setDefinition] = useState('{ "description": "Describe this workflow." }');
  const [steps, setSteps] = useState([{ ...initialStep }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsedDefinition = JSON.parse(definition);
      const payload = {
        name: name.trim(),
        module: module.trim(),
        definition: parsedDefinition,
        steps: steps.map((step) => ({
          step_order: step.step_order,
          approver_type: step.approver_type.trim(),
          approver_identifier: step.approver_identifier.trim(),
          conditions: JSON.parse(step.conditions),
        })),
      };

      return createWorkflow(payload);
    },
    onSuccess: () => {
      setModalOpen(false);
      setName("");
      setModule("");
      setDefinition('{ "description": "Describe this workflow." }');
      setSteps([{ ...initialStep }]);
      setFormError(null);
      setMutationError(null);
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

  const addStep = () => {
    setSteps((current) => [
      ...current,
      { step_order: current.length + 1, approver_type: "role", approver_identifier: "", conditions: "[]" },
    ]);
  };

  const updateStep = (index: number, field: keyof typeof initialStep, value: string) => {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, [field]: value } : step));
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index).map((step, stepIndex) => ({ ...step, step_order: stepIndex + 1 })));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!name.trim() || !module.trim()) {
      setFormError("Workflow name and module are required.");
      return;
    }

    try {
      JSON.parse(definition);
    } catch (error) {
      setFormError(`Invalid workflow definition JSON: ${error instanceof Error ? error.message : "Parse error"}`);
      return;
    }

    if (steps.some((step) => !step.approver_type.trim() || !step.approver_identifier.trim())) {
      setFormError("Each step needs an approver type and identifier.");
      return;
    }

    if (steps.some((step) => {
      try {
        JSON.parse(step.conditions);
        return false;
      } catch {
        return true;
      }
    })) {
      setFormError("One or more step conditions contain invalid JSON.");
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
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">
                  Loading workflows...
                </td>
              </tr>
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-[var(--muted)]">
                  No workflows configured yet.
                </td>
              </tr>
            ) : (
              workflows.map((workflow) => (
                <tr key={workflow.id} className="border-b border-[var(--border)]/60">
                  <td className="p-3 font-medium text-[var(--text)]">{workflow.name}</td>
                  <td className="p-3">{workflow.module}</td>
                  <td className="p-3">
                    <div className="space-y-1 text-[var(--muted)]">
                      {workflow.steps.map((step) => (
                        <div key={step.id}>
                          <span className="font-medium">Step {step.step_order}:</span> {step.approver_type} ({step.approver_identifier})
                        </div>
                      ))}
                    </div>
                  </td>
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

      <Card className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted)]">
        Backend API endpoints for workflows are available at <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-[var(--text)]">/api/v1/workflows</code>.
      </Card>

      {modalOpen && (
        <Modal title="Create Workflow" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleCreate} className="space-y-4 p-4">
            <div>
              <h2 className="text-xl font-semibold">Create Workflow</h2>
              <p className="text-sm text-[var(--muted)]">Provide workflow metadata and at least one approval step.</p>
            </div>

            {formError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700">{formError}</div>
            ) : null}

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
            <label className="block text-sm font-medium text-[var(--text)]">
              Definition (JSON)
              <textarea
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Approval Steps</h3>
                <Button type="button" variant="outline" onClick={addStep}>Add step</Button>
              </div>

              {steps.map((step, index) => (
                <div key={index} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">Step {step.step_order}</div>
                    <Button type="button" variant="outline" onClick={() => removeStep(index)}>
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-[var(--text)]">
                      Approver type
                      <input
                        value={step.approver_type}
                        onChange={(event) => updateStep(index, "approver_type", event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm font-medium text-[var(--text)]">
                      Approver identifier
                      <input
                        value={step.approver_identifier}
                        onChange={(event) => updateStep(index, "approver_identifier", event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-medium text-[var(--text)]">
                    Conditions (JSON array)
                    <textarea
                      value={step.conditions}
                      onChange={(event) => updateStep(index, "conditions", event.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
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
