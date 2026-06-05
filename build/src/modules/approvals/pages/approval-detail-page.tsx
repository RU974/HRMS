import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getApproval,
  approveApproval,
  rejectApproval,
  type ApprovalItem,
} from "@/services/approval-service";
import { useAuthStore } from "@/store/auth-store";

export function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canApprove = useAuthStore((state) => state.hasPermission("approvals:approve"));
  const [actionError, setActionError] = useState<string | null>(null);

  const approvalId = id ? parseInt(id, 10) : null;

  const approvalQuery = useQuery({
    queryKey: ["approvals", approvalId],
    queryFn: () => (approvalId ? getApproval(approvalId) : Promise.reject(new Error("Invalid approval ID"))),
    enabled: approvalId !== null,
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: ({ notes }: { notes?: string | null }) => approveApproval(approvalId!, { notes }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["approvals", approvalId] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to approve.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ notes }: { notes?: string | null }) => rejectApproval(approvalId!, { notes }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["approvals", approvalId] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to reject.");
    },
  });

  if (approvalQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approval" subtitle="View and manage approval requests." />
        <Card className="p-6 text-center text-sm text-[var(--muted)]">Loading approval details...</Card>
      </div>
    );
  }

  if (!approvalQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approval" subtitle="View and manage approval requests." />
        <Card className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-700">
          {approvalQuery.error instanceof Error ? approvalQuery.error.message : "Approval not found."}
        </Card>
        <Button variant="outline" onClick={() => navigate("/approvals")}>Back to approvals</Button>
      </div>
    );
  }

  const approval = approvalQuery.data;

  const handleAction = async (action: "approve" | "reject") => {
    setActionError(null);
    const notes = window.prompt(`Add notes for ${action}ing this approval (optional):`);
    if (notes === null) {
      return;
    }

    try {
      if (action === "approve") {
        await approveMutation.mutateAsync({ notes: notes.trim() || undefined });
      } else {
        await rejectMutation.mutateAsync({ notes: notes.trim() || undefined });
      }
    } catch {
      // Error is handled by mutation onError.
    }
  };

  const statusColor = {
    pending: "text-yellow-600",
    approved: "text-green-600",
    rejected: "text-red-600",
    cancelled: "text-gray-600",
  }[approval.status] || "text-[var(--text)]";

  return (
    <div className="space-y-6">
      <PageHeader title="Approval" subtitle="View and manage approval requests." />

      {actionError && (
        <Card className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-700">
          {actionError}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Approval Details */}
          <Card className="space-y-6 border-[var(--border)]/70 p-5">
            <div>
              <h2 className="text-xl font-semibold">Approval Details</h2>
              <p className="text-sm text-[var(--muted)]">Request ID #{approval.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-[var(--muted)]">Module</p>
                <p className="text-[var(--text)]">{approval.module}</p>
              </div>
              <div>
                <p className="font-medium text-[var(--muted)]">Module ID</p>
                <p className="text-[var(--text)]">{approval.module_id}</p>
              </div>
              <div>
                <p className="font-medium text-[var(--muted)]">Status</p>
                <p className={`font-semibold uppercase ${statusColor}`}>{approval.status}</p>
              </div>
              <div>
                <p className="font-medium text-[var(--muted)]">Workflow</p>
                <p className="text-[var(--text)]">{approval.workflow?.name || "N/A"}</p>
              </div>
              <div>
                <p className="font-medium text-[var(--muted)]">Created</p>
                <p className="text-[var(--text)]">{approval.created_at?.slice(0, 19).replace("T", " ") ?? "-"}</p>
              </div>
              <div>
                <p className="font-medium text-[var(--muted)]">Updated</p>
                <p className="text-[var(--text)]">{approval.updated_at?.slice(0, 19).replace("T", " ") ?? "-"}</p>
              </div>
            </div>
          </Card>

          {/* Current Step */}
          {approval.currentStep && (
            <Card className="space-y-4 border-[var(--border)]/70 p-5">
              <div>
                <h3 className="text-lg font-semibold">Current Step</h3>
                <p className="text-sm text-[var(--muted)]">Workflow approval progression</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-[var(--muted)]">Step Order</p>
                  <p className="text-[var(--text)]">#{approval.currentStep.step_order}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--muted)]">Approver Type</p>
                  <p className="text-[var(--text)]">{approval.currentStep.approver_type}</p>
                </div>
                <div className="col-span-2">
                  <p className="font-medium text-[var(--muted)]">Approver Identifier</p>
                  <p className="text-[var(--text)]">{approval.currentStep.approver_identifier}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Metadata */}
          {approval.metadata && Object.keys(approval.metadata).length > 0 && (
            <Card className="space-y-4 border-[var(--border)]/70 p-5">
              <div>
                <h3 className="text-lg font-semibold">Metadata</h3>
                <p className="text-sm text-[var(--muted)]">Additional context</p>
              </div>
              <div className="space-y-2 text-sm">
                {Object.entries(approval.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 border-b border-[var(--border)]/30 pb-2 last:border-0">
                    <span className="font-medium text-[var(--muted)]">{key}</span>
                    <span className="text-[var(--text)] text-right max-w-xs truncate">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          <Card className="space-y-4 border-[var(--border)]/70 p-5">
            <div>
              <h3 className="text-lg font-semibold">Actions</h3>
              <p className="text-sm text-[var(--muted)]">Manage this approval</p>
            </div>
            {approval.status === "pending" && canApprove ? (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={approveMutation.status === "pending"}
                  onClick={() => void handleAction("approve")}
                >
                  {approveMutation.status === "pending" ? "Approving…" : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={rejectMutation.status === "pending"}
                  onClick={() => void handleAction("reject")}
                >
                  {rejectMutation.status === "pending" ? "Rejecting…" : "Reject"}
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--card)]/50 p-3 text-sm text-[var(--muted)]">
                {!canApprove
                  ? "You do not have permission to approve requests."
                  : `This approval has been ${approval.status}.`}
              </div>
            )}
          </Card>

          <Card className="space-y-4 border-[var(--border)]/70 p-5">
            <Button variant="outline" className="w-full" onClick={() => navigate("/approvals")}>
              Back to approvals
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate(`/workflows`)}
            >
              View workflows
            </Button>
          </Card>

          <Card className="rounded-2xl border border-[var(--border)]/50 bg-[var(--card)]/50 p-3 text-xs text-[var(--muted)]">
            Approval ID: <code className="font-mono">{approval.id}</code>
          </Card>
        </div>
      </div>
    </div>
  );
}
