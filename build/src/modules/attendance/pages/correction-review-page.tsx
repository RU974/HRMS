import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import {
  listAttendanceCorrections,
  reviewAttendanceCorrection,
  type AttendanceItem,
} from "@/services/hr-management-service";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "@/components/notifications/toast";

type CorrectionStatus = "pending" | "approved" | "rejected";

function CorrectionBadge({ status }: { status: CorrectionStatus | null | undefined }) {
  const map: Record<string, string> = {
    pending:  "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
  };
  const s = status ?? "pending";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[s] ?? "bg-gray-50 text-gray-700"}`}>
      {s}
    </span>
  );
}

interface ReviewModalProps {
  item: AttendanceItem;
  action: "approved" | "rejected";
  onClose: () => void;
  onDone: () => void;
}

function ReviewModal({ item, action, onClose, onDone }: ReviewModalProps) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      reviewAttendanceCorrection(item.id, {
        correction_status: action,
        correction_response_notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(
        action === "approved" ? "Approved" : "Rejected",
        `Correction request has been ${action}.`
      );
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title={action === "approved" ? "Approve Correction" : "Reject Correction"} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm space-y-1">
          <p><span className="text-[var(--muted)]">Employee:</span> <span className="font-medium">{item.employee?.name ?? `#${item.employee_id}`}</span></p>
          <p><span className="text-[var(--muted)]">Date:</span> {item.date?.slice(0, 10)}</p>
          <p><span className="text-[var(--muted)]">Employee's reason:</span> {item.correction_request_notes ?? "—"}</p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <FormField label="Response notes (optional)">
          <textarea
            className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={action === "approved" ? "Add any notes for the employee..." : "Explain why the request is being rejected..."}
          />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={mutation.isPending}
            className={action === "approved" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"}
            onClick={() => { setError(null); void mutation.mutateAsync(); }}
          >
            {mutation.isPending ? "Submitting..." : action === "approved" ? "Approve" : "Reject"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const statusOptions: Array<{ value: CorrectionStatus | ""; label: string }> = [
  { value: "",         label: "All" },
  { value: "pending",  label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export function CorrectionReviewPage() {
  const queryClient = useQueryClient();
  const canApprove = useAuthStore(s => s.hasPermission("attendance:approve"));

  const [statusFilter, setStatusFilter] = useState<CorrectionStatus | "">("pending");
  const [page, setPage] = useState(1);
  const [reviewTarget, setReviewTarget] = useState<{ item: AttendanceItem; action: "approved" | "rejected" } | null>(null);

  const query = useQuery({
    queryKey: ["attendance", "corrections", statusFilter, page],
    queryFn: () =>
      listAttendanceCorrections({
        status: statusFilter || undefined,
        page,
      }),
  });

  const records: AttendanceItem[] = query.data?.data ?? [];
  const totalPages = query.data?.last_page ?? 1;
  const total = query.data?.total ?? 0;
  const pendingCount = statusFilter === "pending" ? total : undefined;

  function handleDone() {
    setReviewTarget(null);
    void queryClient.invalidateQueries({ queryKey: ["attendance", "corrections"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance"] });
  }

  const colCount = canApprove ? 7 : 6;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correction Requests"
        subtitle="Review and action employee attendance correction requests."
      />

      {/* Filter bar */}
      <Card className="border-[var(--border)]/70 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Correction queue</h2>
            <p className="text-sm text-[var(--muted)]">
              {statusFilter === "pending" && total > 0
                ? `${total} pending request${total !== 1 ? "s" : ""} awaiting review`
                : "Filter by status to narrow results"}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <select
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as CorrectionStatus | ""); setPage(1); }}
            >
              {statusOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {/* Error state */}
      {query.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {query.error instanceof Error ? query.error.message : "Failed to load correction requests."}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <th className="p-3">Employee</th>
              <th className="p-3">Date</th>
              <th className="p-3">Check In / Out</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Requested</th>
              <th className="p-3">Status</th>
              {canApprove && <th className="p-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50">
                  {[...Array(colCount)].map((__, j) => (
                    <td key={j} className="p-3">
                      <div className="h-4 animate-pulse rounded bg-[var(--border)]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-10 text-center text-sm text-[var(--muted)]">
                  {statusFilter === "pending"
                    ? "No pending correction requests — all caught up."
                    : "No correction requests found for the selected filter."}
                </td>
              </tr>
            ) : (
              records.map(item => (
                <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                  <td className="p-3 font-medium text-[var(--text)]">
                    {item.employee?.name ?? `Employee #${item.employee_id}`}
                  </td>
                  <td className="p-3 tabular-nums">{item.date?.slice(0, 10) ?? "—"}</td>
                  <td className="p-3 tabular-nums text-[var(--muted)]">
                    {item.check_in ? item.check_in.slice(11, 16) : "—"}
                    {" / "}
                    {item.check_out ? item.check_out.slice(11, 16) : "—"}
                  </td>
                  <td className="p-3 max-w-[240px]">
                    <p className="truncate text-[var(--text)]" title={item.correction_request_notes ?? undefined}>
                      {item.correction_request_notes ?? <span className="text-[var(--muted)]">—</span>}
                    </p>
                    {item.correction_response_notes && (
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={item.correction_response_notes}>
                        Reply: {item.correction_response_notes}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-[var(--muted)]">
                    {item.correction_requested_at
                      ? new Date(item.correction_requested_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-3">
                    <CorrectionBadge status={item.correction_status} />
                    {item.correction_reviewed_at && (
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {new Date(item.correction_reviewed_at).toLocaleDateString()}
                      </p>
                    )}
                  </td>
                  {canApprove && (
                    <td className="p-3 text-right">
                      {item.correction_status === "pending" ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            className="text-xs px-2.5 py-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => setReviewTarget({ item, action: "approved" })}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            className="text-xs px-2.5 py-1 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setReviewTarget({ item, action: "rejected" })}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">Reviewed</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                ← Prev
              </Button>
              <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Review modal */}
      {reviewTarget && (
        <ReviewModal
          item={reviewTarget.item}
          action={reviewTarget.action}
          onClose={() => setReviewTarget(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
