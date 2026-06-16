import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listApprovals,
  approveApproval,
  rejectApproval,
  type ApprovalItem,
  type ApprovalStatus,
} from "@/services/approval-service";
import { useAuthStore } from "@/store/auth-store";

const approvalStatuses = ["", "pending", "approved", "rejected", "cancelled"] as const;

export function ApprovalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canApprove = useAuthStore((state) => state.hasPermission("approvals:approve"));
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "">("pending");
  const [moduleFilter, setModuleFilter] = useState("");

  const [mutationError, setMutationError] = useState<string | null>(null);

  const approvalsQuery = useQuery({
    queryKey: ["approvals", statusFilter, moduleFilter],
    queryFn: () => listApprovals({
      status: statusFilter || undefined,
      module: moduleFilter.trim() || undefined,
    }),
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string | null }) => approveApproval(id, { notes }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : "Unable to approve request.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string | null }) => rejectApproval(id, { notes }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : "Unable to reject request.");
    },
  });

  const approvals = approvalsQuery.data ?? [];
  const isLoading = approvalsQuery.isLoading;
  const error = approvalsQuery.error instanceof Error ? approvalsQuery.error.message : null;

  const handleAction = async (approval: ApprovalItem, action: "approve" | "reject") => {
    setMutationError(null);
    const notes = window.prompt(`Add notes for ${action}ing approval #${approval.id} (optional):`);
    if (notes === null) {
      return;
    }

    try {
      if (action === "approve") {
        await approveMutation.mutateAsync({ id: approval.id, notes: notes.trim() || undefined });
      } else {
        await rejectMutation.mutateAsync({ id: approval.id, notes: notes.trim() || undefined });
      }
    } catch {
      // Mutation errors are set in onError.
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" subtitle="Review pending approvals and update workflow requests." />

      <Card className="space-y-4 border-[var(--border)]/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Approval queue</h2>
            <p className="text-sm text-[var(--muted)]">Filter approvals by status or module, then approve or reject requests.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span>Status</span>
              <select
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ApprovalStatus | "")}
              >
                <option value="">All</option>
                {approvalStatuses.filter((value) => value !== "").map((status) => (
                  <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span>Module</span>
              <input
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
                placeholder="Leave, payroll, etc."
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
      </Card>

      {(error || mutationError) ? (
        <Card className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-700">
          {mutationError || error}
        </Card>
      ) : null}

      <Card className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">ID</th>
              <th className="p-3">Workflow</th>
              <th className="p-3">Module</th>
              <th className="p-3">Module ID</th>
              <th className="p-3">Current step</th>
              <th className="p-3">Status</th>
              <th className="p-3">Requested</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm text-[var(--muted)]">
                  Loading approvals...
                </td>
              </tr>
            ) : approvals.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm text-[var(--muted)]">
                  No approvals found for the current filters.
                </td>
              </tr>
            ) : (
              approvals.map((approval) => (
                <tr key={approval.id} className="border-b border-[var(--border)]/60">
                  <td className="p-3 font-medium text-[var(--text)]"><button onClick={() => navigate(`/approvals/${approval.id}`)} className="text-blue-600 hover:underline">#{approval.id}</button></td>
                  <td className="p-3">{approval.workflow?.name ?? approval.workflow?.module}</td>
                  <td className="p-3">{approval.module}</td>
                  <td className="p-3">{approval.module_id}</td>
                  <td className="p-3">
                    {approval.currentStep ? `#${approval.currentStep.step_order} ${approval.currentStep.approver_type}` : "N/A"}
                  </td>
                  <td className="p-3 uppercase text-[var(--muted)]">
                    {approval.status}
                    {approval.escalated_at && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">ESCALATED</span>
                    )}
                  </td>
                  <td className="p-3">{approval.created_at?.slice(0, 10) ?? "-"}</td>
                  <td className="p-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        disabled={approval.status !== "pending" || !canApprove || approveMutation.status === "pending"}
                        onClick={() => void handleAction(approval, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        disabled={approval.status !== "pending" || !canApprove || rejectMutation.status === "pending"}
                        onClick={() => void handleAction(approval, "reject")}
                      >
                        Reject
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
        Backend API endpoints for approvals are available at <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-[var(--text)]">/api/v1/approvals</code>.
      </Card>
    </div>
  );
}
