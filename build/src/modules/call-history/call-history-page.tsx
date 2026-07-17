import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing, Clock } from "lucide-react";
import { getCallHistory, Call } from "@/services/call-service";
import { useAuthStore } from "@/store/auth-store";
import { PageHeader } from "@/components/page-header/page-header";

type StatusFilter = "all" | "ended" | "missed";
type TypeFilter = "all" | "audio" | "video";

function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 1) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDateTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

function CallIcon({ call, currentUserId }: { call: Call; currentUserId: number }) {
  const isInitiator = call.initiated_by === currentUserId;
  const isMissed = call.status === "missed";
  const cls = "h-4 w-4";

  if (isMissed) return <PhoneMissed className={`${cls} text-red-500`} />;
  if (call.type === "video") return <Video className={`${cls} text-blue-500`} />;
  if (isInitiator) return <PhoneOutgoing className={`${cls} text-emerald-500`} />;
  return <PhoneIncoming className={`${cls} text-emerald-500`} />;
}

function CallRow({ call, currentUserId }: { call: Call; currentUserId: number }) {
  const isInitiator = call.initiated_by === currentUserId;
  const isMissed = call.status === "missed";

  const otherParticipants = call.participants.filter((p) => p.user_id !== currentUserId);
  const label =
    call.call_type === "group"
      ? `Group call (${call.participants.length} people)`
      : otherParticipants[0]?.user.name ?? "Unknown";

  const direction = isInitiator ? "Outgoing" : isMissed ? "Missed" : "Incoming";

  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] px-4 py-3 transition hover:bg-[var(--hover)]">
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--border)]/40">
        <CallIcon call={call} currentUserId={currentUserId} />
      </div>

      {/* Name + direction */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text)]">{label}</p>
        <p className={`text-xs ${isMissed ? "text-red-500" : "text-[var(--muted)]"}`}>{direction}</p>
      </div>

      {/* Type badge */}
      <span className="hidden shrink-0 rounded-full bg-[var(--border)]/40 px-2 py-0.5 text-[11px] font-medium text-[var(--muted)] sm:inline">
        {call.type === "video" ? "Video" : "Audio"}
      </span>

      {/* Duration */}
      <div className="hidden shrink-0 items-center gap-1 text-xs text-[var(--muted)] sm:flex">
        <Clock className="h-3 w-3" />
        {formatDuration(call.duration)}
      </div>

      {/* Date/time */}
      <p className="shrink-0 text-xs text-[var(--muted)]">{formatDateTime(call.created_at)}</p>
    </div>
  );
}

export function CallHistoryPage() {
  const currentUserId = useAuthStore((s) => s.user?.id ?? 0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<Call[]>([]);
  const [appendedPage, setAppendedPage] = useState(0);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["call-history", statusFilter, typeFilter, page] as const,
    queryFn: ({ queryKey }) => {
      const [, status, type, p] = queryKey;
      return getCallHistory({ status, type, page: p });
    },
  });

  // Filters changing invalidates any previously accumulated pages.
  useEffect(() => {
    setAccumulated([]);
    setAppendedPage(0);
  }, [statusFilter, typeFilter]);

  // Reset/append the accumulated list once per fetched page (guards against
  // re-running on every render since `data` identity changes each fetch).
  useEffect(() => {
    if (!data || data.current_page === appendedPage) return;
    setAccumulated((prev) => (data.current_page === 1 ? data.data : [...prev, ...data.data]));
    setAppendedPage(data.current_page);
  }, [data, appendedPage]);

  const calls = accumulated;
  const hasMore = (data?.current_page ?? 1) < (data?.last_page ?? 1);

  const filtered = search.trim()
    ? calls.filter((c) => {
        const q = search.toLowerCase();
        const names = c.participants.map((p) => p.user.name.toLowerCase()).join(" ");
        return names.includes(q);
      })
    : calls;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader
        title="Call History"
        subtitle="Your last 50 audio and video calls"
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by participant name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
        />

        <div className="flex gap-2">
          {(["all", "ended", "missed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === s
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--border)]/40 text-[var(--muted)] hover:bg-[var(--border)]"
              }`}
            >
              {s === "all" ? "All" : s === "ended" ? "Answered" : "Missed"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(["all", "audio", "video"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                typeFilter === t
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--border)]/40 text-[var(--muted)] hover:bg-[var(--border)]"
              }`}
            >
              {t === "video" ? <Video className="h-3 w-3" /> : t === "audio" ? <Phone className="h-3 w-3" /> : null}
              {t === "all" ? "All types" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[var(--muted)]">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading call history…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--muted)]">
            <PhoneMissed className="h-10 w-10 opacity-30" />
            <p className="text-sm">{calls.length === 0 ? "No calls yet" : "No calls match your filters"}</p>
          </div>
        ) : (
          filtered.map((call) => (
            <CallRow key={call.id} call={call} currentUserId={currentUserId} />
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          Showing {calls.length} of {data?.total ?? calls.length} call{data?.total !== 1 ? "s" : ""}
        </p>
      )}

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={isFetching}
            className="rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {isFetching ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
