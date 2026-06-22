import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loaders/loading-spinner";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";
import { listTickets, type Ticket as TicketType } from "@/services/ticket-service";
import { CreateTicketModal } from "./create-ticket";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUSES = ["open", "in_progress", "resolved", "closed", "reopened"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const CATEGORIES = ["IT", "HR", "Finance", "Admin", "General"] as const;

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  status, priority, category,
  onStatus, onPriority, onCategory,
}: {
  status: string; priority: string; category: string;
  onStatus: (v: string) => void;
  onPriority: (v: string) => void;
  onCategory: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={status}
        onChange={e => onStatus(e.target.value)}
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">All Statuses</option>
        {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
      <select
        value={priority}
        onChange={e => onPriority(e.target.value)}
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">All Priorities</option>
        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select
        value={category}
        onChange={e => onCategory(e.target.value)}
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">All Categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

// ─── Ticket Table ─────────────────────────────────────────────────────────────

function TicketTable({ tickets }: { tickets: TicketType[] }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="p-3">Title</th>
            <th className="p-3">Category</th>
            <th className="p-3">Priority</th>
            <th className="p-3">Status</th>
            <th className="p-3">Department</th>
            <th className="p-3">Assigned To</th>
            <th className="p-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-[var(--muted)]">No tickets found.</td>
            </tr>
          )}
          {tickets.map(ticket => (
            <tr
              key={ticket.id}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
              className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--background)] last:border-0"
            >
              <td className="max-w-xs p-3">
                <span className="block truncate font-medium text-[var(--text)]">{ticket.title}</span>
                <span className="block text-xs text-[var(--muted)]">{ticket.createdBy?.name}</span>
              </td>
              <td className="p-3 text-sm text-[var(--muted)]">{ticket.category}</td>
              <td className="p-3">
                <Badge label={ticket.priority} colorClass={PRIORITY_COLORS[ticket.priority] ?? ""} />
              </td>
              <td className="p-3">
                <Badge label={ticket.status.replace("_", " ")} colorClass={STATUS_COLORS[ticket.status] ?? ""} />
              </td>
              <td className="p-3 text-sm text-[var(--muted)]">{ticket.department?.name ?? "—"}</td>
              <td className="p-3 text-sm text-[var(--muted)]">{ticket.assignedTo?.name ?? "Unassigned"}</td>
              <td className="p-3 text-sm text-[var(--muted)]">{fmtDate(ticket.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TicketsPage() {
  const canCreate = useAuthStore(s => s.hasPermission("tickets.create"));
  const canManage = useAuthStore(s => s.hasPermission("tickets.manage_settings"));

  const [tab, setTab] = useState<"mine" | "queue">("mine");
  const [status, setStatus]     = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const filters = {
    ...(status   ? { status }   : {}),
    ...(priority ? { priority } : {}),
    ...(category ? { category } : {}),
  };

  const { data: allTickets = [], isLoading, error, refetch } = useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => listTickets(filters),
  });

  const user = useAuthStore(s => s.user);

  const myTickets    = allTickets.filter(t => t.created_by === user?.id);
  const queueTickets = allTickets;

  const displayed = tab === "mine" ? myTickets : queueTickets;

  if (error) {
    toast.error("Failed to load tickets", (error as Error).message);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader title="Tickets" subtitle="Track and manage support tickets" />
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2 shrink-0">
            <Plus size={15} />
            New Ticket
          </Button>
        )}
      </div>

      {canManage && (
        <div className="mb-4 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 w-fit">
          {(["mine", "queue"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {t === "mine" ? "My Tickets" : "Department Queue"}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <FilterBar
          status={status} priority={priority} category={category}
          onStatus={setStatus} onPriority={setPriority} onCategory={setCategory}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <TicketTable tickets={displayed} />
      )}

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
