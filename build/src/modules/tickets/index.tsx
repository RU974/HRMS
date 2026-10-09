import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X, ChevronLeft, ChevronRight, Ticket as TicketIcon, Inbox, Filter, AlertCircle, Clock, CheckCircle2, Timer } from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loaders/loading-spinner";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";
import { listTickets, getTicketStats, type Ticket as TicketType } from "@/services/ticket-service";
import { listDepartments, type DepartmentItem } from "@/services/hr-management-service";
import { SummaryCard } from "@/modules/dashboard/dashboard-widgets";
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

const PRIORITY_BAR: Record<string, string> = {
  low:      "bg-gray-300",
  medium:   "bg-blue-400",
  high:     "bg-orange-400",
  critical: "bg-red-500",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-semibold text-white">
      {initials(name)}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUSES   = ["open", "in_progress", "resolved", "closed", "reopened"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const CATEGORIES = ["IT", "HR", "Finance", "Admin", "General"] as const;

// ─── Paginator ────────────────────────────────────────────────────────────────

function Paginator({ current, last, onChange }: { current: number; last: number; onChange: (p: number) => void }) {
  if (last <= 1) return null;

  const pages: (number | "…")[] = [];

  if (last <= 7) {
    for (let i = 1; i <= last; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("…");
    for (let i = Math.max(2, current - 1); i <= Math.min(last - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < last - 2) pages.push("…");
    pages.push(last);
  }

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] disabled:opacity-40 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
      >
        <ChevronLeft size={14} />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-sm text-[var(--muted)]">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
              p === current
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(current + 1)}
        disabled={current === last}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] disabled:opacity-40 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  searchInput,
  status, priority, category, departmentId,
  departments,
  hasFilters,
  onSearchChange,
  onStatus, onPriority, onCategory, onDepartment,
  onClear,
}: {
  searchInput: string;
  status: string; priority: string; category: string; departmentId: string;
  departments: DepartmentItem[];
  hasFilters: boolean;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStatus: (v: string) => void;
  onPriority: (v: string) => void;
  onCategory: (v: string) => void;
  onDepartment: (v: string) => void;
  onClear: () => void;
}) {
  const selectClass = "h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-[var(--muted)]" />
        <input
          type="text"
          placeholder="Search tickets…"
          value={searchInput}
          onChange={onSearchChange}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-48"
        />
      </div>

      <select value={status} onChange={e => onStatus(e.target.value)} className={selectClass}>
        <option value="">All Statuses</option>
        {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>

      <select value={priority} onChange={e => onPriority(e.target.value)} className={selectClass}>
        <option value="">All Priorities</option>
        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <select value={category} onChange={e => onCategory(e.target.value)} className={selectClass}>
        <option value="">All Categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {departments.length > 0 && (
        <select value={departmentId} onChange={e => onDepartment(e.target.value)} className={selectClass}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>
      )}

      {hasFilters && (
        <button
          onClick={onClear}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted)] hover:border-red-300 hover:text-red-500 transition-colors"
        >
          <X size={13} />
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Ticket Table ─────────────────────────────────────────────────────────────

function TicketTable({ tickets: ticketList }: { tickets: TicketType[] }) {
  const navigate = useNavigate();
  const { sorted: tickets, sort, toggle: toggleSort } = useTableSort(ticketList, "title", {
    department: (t) => t.department?.name,
    assigned: (t) => t.assignedTo?.name,
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <table className="rtable w-full">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
            <SortableTh label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
            <SortableTh label="Priority" sortKey="priority" sort={sort} onSort={toggleSort} />
            <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
            <SortableTh label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
            <SortableTh label="Assigned To" sortKey="assigned" sort={sort} onSort={toggleSort} />
            <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => (
            <tr
              key={ticket.id}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
              className="relative cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--background)] last:border-0"
            >
              <td className="max-w-xs p-3" data-label="Title">
                <span className="flex items-center gap-2">
                  <span className={`h-6 w-1 shrink-0 rounded-full ${PRIORITY_BAR[ticket.priority] ?? "bg-gray-300"}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--text)]">{ticket.title}</span>
                    <span className="block text-xs text-[var(--muted)]">{ticket.createdBy?.name}</span>
                  </span>
                </span>
              </td>
              <td className="p-3 text-sm text-[var(--muted)]" data-label="Category">{ticket.category}</td>
              <td className="p-3" data-label="Priority">
                <Badge label={ticket.priority} colorClass={PRIORITY_COLORS[ticket.priority] ?? ""} />
              </td>
              <td className="p-3" data-label="Status">
                <Badge label={ticket.status.replace("_", " ")} colorClass={STATUS_COLORS[ticket.status] ?? ""} />
              </td>
              <td className="p-3 text-sm text-[var(--muted)]" data-label="Department">{ticket.department?.name ?? "—"}</td>
              <td className="p-3" data-label="Assigned To">
                {ticket.assignedTo ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={ticket.assignedTo.name} />
                    <span className="text-sm text-[var(--text)]">{ticket.assignedTo.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Unassigned
                  </span>
                )}
              </td>
              <td className="p-3 text-sm text-[var(--muted)]" data-label="Created">{fmtDate(ticket.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({
  icon, title, subtitle, action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--background)] text-[var(--muted)]">
        {icon}
      </div>
      <p className="mb-1 text-base font-semibold text-[var(--text)]">{title}</p>
      {subtitle && <p className="mb-4 max-w-xs text-sm text-[var(--muted)]">{subtitle}</p>}
      {action}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TicketsPage() {
  const canCreate = useAuthStore(s => s.hasPermission("tickets.create"));
  const canManage = useAuthStore(s => s.hasPermission("tickets.manage_settings"));
  const canAssign = useAuthStore(s => s.hasPermission("tickets.assign") || canManage);

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab]           = useState<"mine" | "assigned" | "queue">("mine");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [showCreate, setShowCreate]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status       = searchParams.get("status")        ?? "";
  const priority     = searchParams.get("priority")      ?? "";
  const category     = searchParams.get("category")      ?? "";
  const departmentId = searchParams.get("department_id") ?? "";
  const search       = searchParams.get("search")        ?? "";
  const page         = Number(searchParams.get("page")   ?? "1");

  const hasFilters = Boolean(search || status || priority || category || departmentId);

  function updateParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      if (key !== "page") next.delete("page");
      return next;
    });
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("search", val), 300);
  }

  function clearFilters() {
    setSearchInput("");
    setSearchParams({});
  }

  function changePage(p: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (p > 1) { next.set("page", String(p)); } else { next.delete("page"); }
      return next;
    });
  }

  // Keep searchInput in sync if URL param is cleared externally
  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  const filters = {
    ...(search       ? { search }                : {}),
    ...(status       ? { status }                : {}),
    ...(priority     ? { priority }              : {}),
    ...(category     ? { category }              : {}),
    ...(departmentId ? { department_id: departmentId } : {}),
    ...(tab === "mine" && (canManage || canAssign) ? { mine: "1" } : {}),
    ...(tab === "assigned" ? { assigned_to_me: "1" } : {}),
    page,
  };

  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ["tickets", filters, tab],
    queryFn: () => listTickets(filters),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: listDepartments,
    enabled: canManage,
  });

  const { data: stats } = useQuery({
    queryKey: ["ticket-stats"],
    queryFn: getTicketStats,
  });

  useEffect(() => {
    if (error) toast.error("Failed to load tickets", (error as Error).message);
  }, [error]);

  const tickets = result?.data ?? [];
  const meta    = result?.meta;

  function renderEmpty() {
    if (hasFilters) {
      return (
        <EmptyState
          icon={<Filter size={28} />}
          title="No tickets match your filters"
          subtitle="Try adjusting or clearing your search and filters."
          action={
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              <X size={13} /> Clear Filters
            </button>
          }
        />
      );
    }

    if (tab === "queue") {
      return (
        <EmptyState
          icon={<Inbox size={28} />}
          title="All clear!"
          subtitle="No pending tickets in your department."
        />
      );
    }

    if (tab === "assigned") {
      return (
        <EmptyState
          icon={<Inbox size={28} />}
          title="Nothing assigned to you"
          subtitle="Tickets assigned to you will show up here."
        />
      );
    }

    return (
      <EmptyState
        icon={<TicketIcon size={28} />}
        title="No tickets yet"
        subtitle={canCreate ? "Raise your first ticket to get started." : "No tickets have been created yet."}
        action={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
              <Plus size={14} /> New Ticket
            </Button>
          ) : undefined
        }
      />
    );
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

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            title="Open"
            value={String(stats.open)}
            icon={<AlertCircle className="h-5 w-5" />}
            accent="amber"
          />
          <SummaryCard
            title="In Progress"
            value={String(stats.in_progress)}
            icon={<Clock className="h-5 w-5" />}
            accent="blue"
          />
          {canManage || canAssign ? (
            <SummaryCard
              title="Resolved This Month"
              value={String(stats.resolved_this_month)}
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="emerald"
            />
          ) : (
            <SummaryCard
              title="My Open"
              value={String(stats.my_open)}
              icon={<TicketIcon className="h-5 w-5" />}
              accent="emerald"
            />
          )}
          <SummaryCard
            title="Avg Resolution"
            value={`${stats.avg_resolution_days}d`}
            icon={<Timer className="h-5 w-5" />}
            accent="violet"
          />
        </div>
      )}

      {(canManage || canAssign) && (
        <div className="mb-4 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 w-fit">
          {(canManage ? (["mine", "assigned", "queue"] as const) : (["mine", "assigned"] as const)).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); changePage(1); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {t === "mine" ? "My Tickets" : t === "assigned" ? "Assigned to Me" : "Department Queue"}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <FilterBar
          searchInput={searchInput}
          status={status} priority={priority} category={category} departmentId={departmentId}
          departments={departments}
          hasFilters={hasFilters}
          onSearchChange={handleSearchChange}
          onStatus={v => updateParam("status", v)}
          onPriority={v => updateParam("priority", v)}
          onCategory={v => updateParam("category", v)}
          onDepartment={v => updateParam("department_id", v)}
          onClear={clearFilters}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : tickets.length === 0 ? (
        renderEmpty()
      ) : (
        <>
          <TicketTable tickets={tickets} />
          {meta && (
            <Paginator
              current={meta.current_page}
              last={meta.last_page}
              onChange={changePage}
            />
          )}
          {meta && meta.total > 0 && (
            <p className="text-center text-xs text-[var(--muted)]">
              Showing {tickets.length} of {meta.total} tickets
            </p>
          )}
        </>
      )}

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
