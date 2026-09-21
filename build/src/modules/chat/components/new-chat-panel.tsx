import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { ChatUser } from "@/services/chat-service";

const MAX_GROUP_MEMBERS = 50;

interface NewChatPanelProps {
  users: ChatUser[];
  currentUserId: number;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: { type: "direct" | "group"; name?: string; participantIds: number[] }) => void;
}

export function NewChatPanel({ users, currentUserId, loading, submitting, error, onSubmit }: NewChatPanelProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [filter, setFilter] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return users
      .filter((u) => u.id !== currentUserId)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, currentUserId, filter]);

  const isGroup = selected.length > 1;

  function toggle(id: number) {
    setLocalError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_GROUP_MEMBERS - 1) {
        setLocalError(`A group can have at most ${MAX_GROUP_MEMBERS} members.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function submit() {
    if (selected.length === 0) return;
    if (isGroup && !groupName.trim()) {
      setLocalError("Please provide a group name.");
      return;
    }
    setLocalError(null);
    onSubmit({ type: isGroup ? "group" : "direct", name: isGroup ? groupName.trim() : undefined, participantIds: selected });
  }

  const shownError = localError ?? error;

  return (
    <div className="space-y-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Start a conversation</p>

      {isGroup && (
        <input
          type="text"
          value={groupName}
          maxLength={255}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Group name…"
          aria-label="Group name"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
        />
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find people…"
          aria-label="Find people"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-2 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
        />
      </div>

      <div className="max-h-44 space-y-0.5 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label="People">
        {loading && <p className="px-2 py-1.5 text-xs text-[var(--muted)]">Loading people…</p>}
        {!loading && candidates.length === 0 && <p className="px-2 py-1.5 text-xs text-[var(--muted)]">No one found.</p>}
        {candidates.map((u) => {
          const checked = selected.includes(u.id);
          return (
            <button
              type="button"
              key={u.id}
              role="option"
              aria-selected={checked}
              onClick={() => toggle(u.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                checked ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-[var(--text)] hover:bg-[var(--border)]/30"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                  checked ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)]"
                }`}
              >
                {checked && <Check className="h-2.5 w-2.5 text-white" />}
              </span>
              <span className="flex-1 truncate font-medium">{u.name}</span>
              {u.is_online && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Online" />}
            </button>
          );
        })}
      </div>

      {shownError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {shownError}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={selected.length === 0 || submitting}
        className="w-full rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
      >
        {submitting
          ? "Creating…"
          : isGroup
          ? `Create group (${selected.length + 1})`
          : selected.length === 1
          ? "Start chat"
          : "Select people to start"}
      </button>
    </div>
  );
}
