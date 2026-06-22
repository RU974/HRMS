import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loaders/loading-spinner";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";
import {
  getTicket,
  assignTicket,
  changeTicketStatus,
  addTicketComment,
  type Ticket,
} from "@/services/ticket-service";
import { listUsers } from "@/services/settings-service";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved:    "bg-emerald-100 text-emerald-700",
  closed:      "bg-gray-100 text-gray-500",
  reopened:    "bg-orange-100 text-orange-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  low:      "bg-gray-100 text-gray-500",
  medium:   "bg-blue-100 text-blue-700",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const ALL_STATUSES = ["open", "in_progress", "resolved", "closed", "reopened"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-sm font-medium text-[var(--muted)] shrink-0 w-28">{label}</span>
      <span className="text-sm text-[var(--text)] text-right">{children}</span>
    </div>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Ticket Metadata Panel ────────────────────────────────────────────────────

function TicketMeta({
  ticket,
  canManage,
  canAssign,
  onStatusChange,
  onAssignChange,
  users,
}: {
  ticket: Ticket;
  canManage: boolean;
  canAssign: boolean;
  onStatusChange: (s: string) => void;
  onAssignChange: (userId: number) => void;
  users: { id: string; name: string }[];
}) {
  const user = useAuthStore(s => s.user);
  const isOwner = ticket.created_by === user?.id;
  const canReopen = isOwner && ticket.status === "resolved";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-1">
      <MetaRow label="Status">
        <Badge label={ticket.status.replace("_", " ")} colorClass={STATUS_COLORS[ticket.status] ?? ""} />
      </MetaRow>
      <MetaRow label="Priority">
        <Badge label={ticket.priority} colorClass={PRIORITY_COLORS[ticket.priority] ?? ""} />
      </MetaRow>
      <MetaRow label="Category">{ticket.category}</MetaRow>
      <MetaRow label="Department">{ticket.department?.name ?? "—"}</MetaRow>
      <MetaRow label="Created By">{ticket.createdBy?.name ?? "—"}</MetaRow>
      <MetaRow label="Assigned To">{ticket.assignedTo?.name ?? "Unassigned"}</MetaRow>
      <MetaRow label="Created">{fmtDate(ticket.created_at)}</MetaRow>
      {ticket.resolved_at && <MetaRow label="Resolved">{fmtDate(ticket.resolved_at)}</MetaRow>}
      {ticket.closed_at && <MetaRow label="Closed">{fmtDate(ticket.closed_at)}</MetaRow>}

      {(canManage || canReopen) && (
        <div className="pt-3 border-t border-[var(--border)]">
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Change Status</label>
          <select
            value={ticket.status}
            onChange={e => onStatusChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm text-[var(--text)]"
          >
            {ALL_STATUSES
              .filter(s => canManage || s === "reopened")
              .map(s => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
          </select>
        </div>
      )}

      {canAssign && (
        <div className="pt-2">
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Assign To</label>
          <select
            value={ticket.assignedTo?.id ?? ""}
            onChange={e => onAssignChange(Number(e.target.value))}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm text-[var(--text)]"
          >
            <option value="">Unassigned</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Comment Thread ───────────────────────────────────────────────────────────

function CommentThread({
  ticket,
  canReply,
  canSeeInternal,
  onCommentAdded,
}: {
  ticket: Ticket;
  canReply: boolean;
  canSeeInternal: boolean;
  onCommentAdded: () => void;
}) {
  const [body, setBody]           = useState("");
  const [isInternal, setInternal] = useState(false);

  const mutation = useMutation({
    mutationFn: () => addTicketComment(ticket.id, { body, is_internal: isInternal }),
    onSuccess: () => {
      setBody("");
      setInternal(false);
      toast.success("Comment added", "Your reply has been posted.");
      onCommentAdded();
    },
    onError: (e: Error) => {
      toast.error("Failed to post comment", e.message);
    },
  });

  const visibleComments = canSeeInternal
    ? ticket.comments
    : ticket.comments.filter(c => !c.is_internal);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-[var(--text)]">Thread</h3>

      <div className="flex flex-col gap-3">
        {visibleComments.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No replies yet.</p>
        )}
        {visibleComments.map(comment => (
          <div
            key={comment.id}
            className={`rounded-xl border p-4 ${
              comment.is_internal
                ? "border-amber-200 bg-amber-50"
                : "border-[var(--border)] bg-[var(--card)]"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
                  {initials(comment.user?.name ?? "?")}
                </div>
                <span className="text-sm font-medium text-[var(--text)]">{comment.user?.name}</span>
                {comment.is_internal && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Internal Note
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--muted)]">{fmtDateShort(comment.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{comment.body}</p>
          </div>
        ))}
      </div>

      {canReply && ticket.status !== "closed" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            placeholder="Write a reply…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            {canSeeInternal && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={e => setInternal(e.target.checked)}
                  className="rounded"
                />
                Internal Note
              </label>
            )}
            <div className="ml-auto">
              <Button
                onClick={() => mutation.mutate()}
                disabled={!body.trim() || mutation.isPending}
                className="flex items-center gap-2"
              >
                <Send size={14} />
                {mutation.isPending ? "Posting…" : "Post Reply"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const canManage     = useAuthStore(s => s.hasPermission("tickets.manage_settings"));
  const canAssign     = useAuthStore(s => s.hasPermission("tickets.assign") || s.hasPermission("tickets.manage_settings"));
  const canReply      = useAuthStore(s => s.hasPermission("tickets.reply") || s.hasPermission("tickets.create") || s.hasPermission("tickets.manage_settings"));
  const canSeeInternal = useAuthStore(s => s.hasPermission("tickets.manage_settings") || s.hasPermission("tickets.assign"));

  const ticketQuery = useQuery({
    queryKey: ["tickets", id],
    queryFn: () => getTicket(id!),
    enabled: Boolean(id),
    retry: false,
  });

  const usersQuery = useQuery({
    queryKey: ["users", "list"],
    queryFn: listUsers,
    enabled: canAssign,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => changeTicketStatus(id!, status),
    onSuccess: () => {
      toast.success("Status updated", "Ticket status has been changed.");
      queryClient.invalidateQueries({ queryKey: ["tickets", id] });
    },
    onError: (e: Error) => toast.error("Failed to update status", e.message),
  });

  const assignMutation = useMutation({
    mutationFn: (userId: number) => assignTicket(id!, userId),
    onSuccess: () => {
      toast.success("Ticket assigned", "Ticket has been assigned.");
      queryClient.invalidateQueries({ queryKey: ["tickets", id] });
    },
    onError: (e: Error) => toast.error("Failed to assign ticket", e.message),
  });

  const [ticket, setTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (ticketQuery.data) setTicket(ticketQuery.data);
  }, [ticketQuery.data]);

  if (ticketQuery.isLoading) {
    return <div className="flex justify-center py-24"><LoadingSpinner /></div>;
  }

  if (ticketQuery.error || !ticket) {
    return (
      <div className="py-24 text-center text-[var(--muted)]">
        Ticket not found or you do not have access.
      </div>
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/tickets")}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <PageHeader title={ticket.title} subtitle={`#${ticket.id.slice(0, 8)} · ${ticket.category}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">Description</h3>
            <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{ticket.description}</p>
          </div>

          <CommentThread
            ticket={ticket}
            canReply={canReply}
            canSeeInternal={canSeeInternal}
            onCommentAdded={() => queryClient.invalidateQueries({ queryKey: ["tickets", id] })}
          />
        </div>

        <div className="lg:sticky lg:top-6 self-start">
          <TicketMeta
            ticket={ticket}
            canManage={canManage}
            canAssign={canAssign}
            onStatusChange={status => statusMutation.mutate(status)}
            onAssignChange={userId => assignMutation.mutate(userId)}
            users={users}
          />
        </div>
      </div>
    </div>
  );
}
