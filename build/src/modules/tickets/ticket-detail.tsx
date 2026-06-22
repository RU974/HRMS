import { useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Download, FileText, Paperclip, Send, X } from "lucide-react";
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
  uploadTicketAttachment,
  downloadTicketAttachment,
  type Ticket,
  type TicketAttachment,
  type TicketActivity,
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
const MAX_COMMENT_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"];

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Attachments Section ──────────────────────────────────────────────────────

function AttachmentsSection({ attachments, ticketId }: { attachments: TicketAttachment[]; ticketId: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(a: TicketAttachment) {
    setDownloading(a.id);
    try {
      await downloadTicketAttachment(ticketId, a.id, a.file_name);
    } catch {
      toast.error("Download failed", "Could not download the file.");
    } finally {
      setDownloading(null);
    }
  }

  if (attachments.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="mb-3 text-sm font-semibold text-[var(--muted)]">Attachments ({attachments.length})</h3>
      <div className="flex flex-col gap-2">
        {attachments.map(a => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            <FileText className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text)]">{a.file_name}</p>
              <p className="text-xs text-[var(--muted)]">{formatFileSize(a.file_size)} · {a.user?.name ?? "Unknown"}</p>
            </div>
            <Button
              variant="outline"
              className="h-8 shrink-0 px-3 text-xs"
              onClick={() => void handleDownload(a)}
              disabled={downloading === a.id}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloading === a.id ? "…" : "Download"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
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
        <span className="flex items-center gap-1.5 flex-wrap justify-end">
          <Badge label={ticket.status.replace("_", " ")} colorClass={STATUS_COLORS[ticket.status] ?? ""} />
          {ticket.status === "closed" && ticket.closed_by === null && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              Auto-closed
            </span>
          )}
        </span>
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
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [fileErr, setFileErr]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const comment = await addTicketComment(ticket.id, { body, is_internal: isInternal });
      if (commentFile) {
        await uploadTicketAttachment(ticket.id, commentFile);
      }
      return comment;
    },
    onSuccess: () => {
      setBody("");
      setInternal(false);
      setCommentFile(null);
      setFileErr(null);
      toast.success("Comment added", "Your reply has been posted.");
      onCommentAdded();
    },
    onError: (e: Error) => {
      toast.error("Failed to post comment", e.message);
    },
  });

  function handleCommentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_COMMENT_FILE_SIZE) {
      setFileErr("File exceeds 10 MB limit.");
      return;
    }
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      setFileErr("File type not accepted.");
      return;
    }
    setFileErr(null);
    setCommentFile(f);
    if (fileRef.current) fileRef.current.value = "";
  }

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

          {/* Comment file attachment */}
          <div className="mt-2">
            {commentFile ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs text-[var(--text)]">
                  <Paperclip className="h-3 w-3 text-[var(--muted)]" />
                  <span className="max-w-[160px] truncate">{commentFile.name}</span>
                  <span className="text-[var(--muted)]">({(commentFile.size / 1024).toFixed(1)} KB)</span>
                  <button
                    type="button"
                    onClick={() => setCommentFile(null)}
                    className="ml-1 text-[var(--muted)] hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attach file
              </button>
            )}
            {fileErr && <p className="mt-1 text-xs text-red-500">{fileErr}</p>}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_EXTS.join(",")}
              onChange={handleCommentFile}
              className="hidden"
            />
          </div>

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

// ─── Activity Log ─────────────────────────────────────────────────────────────

function activityLabel(a: TicketActivity): string {
  const actor = a.user?.name ?? "Unknown";
  switch (a.action) {
    case "created":
      return `Ticket raised by ${actor}`;
    case "status_changed": {
      const from = String(a.meta?.from ?? "?").replace("_", " ");
      const to   = String(a.meta?.to   ?? "?").replace("_", " ");
      return `Status changed from ${from} to ${to} by ${actor}`;
    }
    case "assigned":
      return `Assigned to ${String(a.meta?.to_name ?? "Unknown")} by ${actor}`;
    case "commented":
      return a.meta?.is_internal === true
        ? `Internal note added by ${actor}`
        : `Comment added by ${actor}`;
    default:
      return `${a.action} by ${actor}`;
  }
}

function ActivityLog({ activities }: { activities: TicketActivity[] }) {
  if (!activities || activities.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Activity Log</h3>
      <div className="relative flex flex-col">
        {activities.map((a, i) => (
          <div key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < activities.length - 1 && (
              <div className="absolute left-[9px] top-5 h-full w-px bg-[var(--border)]" />
            )}
            <div className="relative mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              <div className="h-2.5 w-2.5 rounded-full border-2 border-[var(--primary)] bg-[var(--card)]" />
            </div>
            <div>
              <p className="text-sm text-[var(--text)]">{activityLabel(a)}</p>
              <p className="text-xs text-[var(--muted)]">{fmtDateShort(a.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const canManage      = useAuthStore(s => s.hasPermission("tickets.manage_settings"));
  const canAssign      = useAuthStore(s => s.hasPermission("tickets.assign") || s.hasPermission("tickets.manage_settings"));
  const canReply       = useAuthStore(s => s.hasPermission("tickets.reply") || s.hasPermission("tickets.create") || s.hasPermission("tickets.manage_settings"));
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ticketQuery.data) setTicket(ticketQuery.data);
  }, [ticketQuery.data]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
        <button
          onClick={copyLink}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">Description</h3>
            <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{ticket.description}</p>
          </div>

          <AttachmentsSection
            attachments={ticket.attachments ?? []}
            ticketId={ticket.id}
          />

          <CommentThread
            ticket={ticket}
            canReply={canReply}
            canSeeInternal={canSeeInternal}
            onCommentAdded={() => queryClient.invalidateQueries({ queryKey: ["tickets", id] })}
          />

          <ActivityLog activities={ticket.activities ?? []} />
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
