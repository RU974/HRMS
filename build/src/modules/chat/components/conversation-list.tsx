import { useMemo } from "react";
import { MessageCircle, Phone, Plus, Search, X } from "lucide-react";
import { ChatConversation, ChatUser } from "@/services/chat-service";
import { formatTime } from "../lib/format";
import { Avatar, GroupAvatar } from "./avatar";

export function conversationLabel(conversation: ChatConversation, currentUserId: number) {
  if (conversation.type === "group") return conversation.name ?? "Group chat";
  return conversation.participants.find((p) => p.id !== currentUserId)?.name ?? "Unknown";
}

interface ConversationListProps {
  conversations: ChatConversation[];
  users: ChatUser[];
  currentUserId: number;
  selectedId: number | null;
  searchQuery: string;
  showNewChat: boolean;
  isLoading: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onToggleNewChat: () => void;
  onSelect: (id: number) => void;
  onRetry: () => void;
  /** Rendered between the header and the list (new-chat form, notification prompt…). */
  children?: React.ReactNode;
}

function PresenceBadge({ user }: { user: ChatUser | undefined }) {
  if (user?.is_in_call) {
    return (
      <span
        title="On a call"
        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--card)] bg-blue-500 text-white"
      >
        <Phone className="h-2 w-2" />
      </span>
    );
  }
  if (user?.is_online) {
    return (
      <span
        title="Online"
        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--card)] bg-green-500"
      />
    );
  }
  return null;
}

export function ConversationList({
  conversations,
  users,
  currentUserId,
  selectedId,
  searchQuery,
  showNewChat,
  isLoading,
  error,
  onSearchChange,
  onToggleNewChat,
  onSelect,
  onRetry,
  children,
}: ConversationListProps) {
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations
      .filter((c) => !q || conversationLabel(c, currentUserId).toLowerCase().includes(q))
      .sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.created_at;
        const bTime = b.last_message?.created_at ?? b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
  }, [conversations, searchQuery, currentUserId]);

  return (
    <>
      <div className="space-y-3 border-b border-[var(--border)] px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[var(--primary)]" />
            <span className="text-sm font-semibold text-[var(--text)]">Messages</span>
          </div>
          <button
            type="button"
            onClick={onToggleNewChat}
            aria-label={showNewChat ? "Close new conversation" : "New conversation"}
            aria-expanded={showNewChat}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
              showNewChat
                ? "bg-[var(--primary)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            }`}
            title="New conversation"
          >
            {showNewChat ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-8 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {children}

      <nav className="flex-1 overflow-y-auto py-1" aria-label="Conversations">
        {isLoading && (
          <div className="space-y-1 px-3 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 px-1 py-2">
                <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--border)]" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-2.5 w-3/4 animate-pulse rounded bg-[var(--border)]" />
                  <div className="h-2 w-1/2 animate-pulse rounded bg-[var(--border)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" role="alert">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--border)]/30"
            >
              Retry
            </button>
          </div>
        )}

        {!error && visible.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--border)]/50">
              <MessageCircle className="h-4 w-4 text-[var(--muted)]" />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {searchQuery ? `No results for "${searchQuery}"` : "No conversations yet"}
            </p>
          </div>
        )}

        {visible.map((conversation) => {
          const label = conversationLabel(conversation, currentUserId);
          const last = conversation.last_message;
          const isActive = selectedId === conversation.id;
          const other = conversation.type === "direct" ? conversation.participants.find((p) => p.id !== currentUserId) : undefined;
          const unread = conversation.unread_count;

          return (
            <button
              type="button"
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              aria-current={isActive ? "true" : undefined}
              className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-all ${
                isActive
                  ? "border-r-[3px] border-[var(--primary)] bg-[var(--primary)]/10"
                  : "border-r-[3px] border-transparent hover:bg-[var(--border)]/20"
              }`}
            >
              <div className="relative shrink-0">
                {conversation.type === "group" ? <GroupAvatar /> : <Avatar name={label} />}
                {other && <PresenceBadge user={usersById.get(other.id)} />}
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[9px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                    <span className="sr-only"> unread messages</span>
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <p className={`truncate text-xs text-[var(--text)] ${unread > 0 ? "font-bold" : "font-semibold"}`}>{label}</p>
                  {last && <span className="shrink-0 text-[10px] text-[var(--muted)]">{formatTime(last.created_at)}</span>}
                </div>
                {last && (
                  <p className={`mt-0.5 truncate text-[11px] ${unread > 0 ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}`}>
                    {last.sender_id === currentUserId ? "You: " : ""}
                    {last.message || last.attachment_name || ""}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </nav>
    </>
  );
}
