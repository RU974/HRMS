import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2, MessageCircle, Search, X } from "lucide-react";
import { CallButton } from "@/components/call/CallButton";
import { toast } from "@/components/notifications/toast";
import {
  ChatConversation,
  ChatMessage,
  ChatUser,
  deleteChatMessage,
  listThreadMessages,
  markConversationRead,
  updateChatMessage,
} from "@/services/chat-service";
import { useThread, threadKey } from "../hooks/use-thread";
import { useSendMessage } from "../hooks/use-send-message";
import { replaceMessage, markMessageDeleted, ThreadCache } from "../lib/chat-cache";
import { formatDayDivider, formatTime, formatTyping } from "../lib/format";
import { Avatar, GroupAvatar } from "./avatar";
import { Composer, ComposerHandle } from "./composer";
import { conversationLabel } from "./conversation-list";
import { MessageItem, PendingMessageItem } from "./message-item";

interface MessageThreadProps {
  conversation: ChatConversation;
  users: ChatUser[];
  currentUserId: number;
  currentUserName: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onBack: () => void;
  onOpenGroup: () => void;
}

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_THRESHOLD_PX = 100;

export function MessageThread({
  conversation,
  users,
  currentUserId,
  currentUserName,
  draft,
  onDraftChange,
  onBack,
  onOpenGroup,
}: MessageThreadProps) {
  const queryClient = useQueryClient();
  const key = threadKey(conversation.id);
  const isGroup = conversation.type === "group";
  const label = conversationLabel(conversation, currentUserId);

  const thread = useThread(conversation.id, currentUserId, currentUserName);
  const { messages } = thread;
  const { pending, send, retry, discard } = useSendMessage(thread.addSent);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dragging, setDragging] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const stickToBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const initialScrollDone = useRef(false);
  const dragDepth = useRef(0);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const otherUser = !isGroup ? conversation.participants.find((p) => p.id !== currentUserId) : undefined;
  const presence = otherUser ? usersById.get(otherUser.id) : undefined;

  // ── Server-side search across the whole history ───────────────────────────
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchText]);

  const searching = searchOpen && debouncedSearch.length >= 2;
  const searchQuery = useQuery({
    queryKey: ["chat-thread-search", conversation.id, debouncedSearch],
    queryFn: () => listThreadMessages({ conversation_id: conversation.id, q: debouncedSearch, limit: 50 }),
    enabled: searching,
  });

  // A different conversation starts from a clean slate.
  useEffect(() => {
    initialScrollDone.current = false;
    stickToBottom.current = true;
    heightBeforeOlder.current = null;
    setEditingId(null);
    setSearchOpen(false);
    setSearchText("");
  }, [conversation.id]);

  // ── Scroll behaviour ──────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // Older messages were just prepended: keep the reader where they were.
    if (heightBeforeOlder.current !== null && !thread.isLoadingOlder) {
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
      return;
    }

    if (!thread.isLoading && !initialScrollDone.current && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
      return;
    }

    if (stickToBottom.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, pending.length, thread.typingNames.length, thread.isLoading, thread.isLoadingOlder]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;

    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

    if (el.scrollTop < LOAD_OLDER_THRESHOLD_PX && thread.hasOlder && !thread.isLoadingOlder) {
      heightBeforeOlder.current = el.scrollHeight;
      void thread.loadOlder();
    }
  }, [thread]);

  // ── Read state: only while the tab is actually visible ────────────────────
  const markRead = useMutation({
    mutationFn: () => markConversationRead(conversation.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });
  const markedUpTo = useRef(0);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  useEffect(() => {
    markedUpTo.current = 0;
  }, [conversation.id]);

  useEffect(() => {
    if (!lastMessageId) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || markedUpTo.current === lastMessageId) return;
      markedUpTo.current = lastMessageId;
      markRead.mutate();
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("focus", mark);
    return () => {
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("focus", mark);
    };
    // markRead.mutate is stable enough; re-running on every mutation state change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, lastMessageId]);

  // ── Edit / delete ─────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => updateChatMessage(id, { message: text }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ThreadCache>(key, (cache) => replaceMessage(cache, updated));
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (e: Error) => toast.error("Could not edit message", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatMessage,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ThreadCache>(key, (cache) => markMessageDeleted(cache, id, new Date().toISOString()));
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (e: Error) => toast.error("Could not delete message", e.message),
  });

  // ── Read receipt on my latest message ─────────────────────────────────────
  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.sender_id === currentUserId && !m.deleted_at), [messages, currentUserId]);

  const receipt = useMemo(() => {
    if (!lastMine) return null;
    const others = conversation.participants.filter((p) => p.id !== currentUserId);
    const readBy = others.filter(
      (p) => p.pivot?.last_read_at && new Date(p.pivot.last_read_at).getTime() >= new Date(lastMine.created_at).getTime()
    );
    if (readBy.length === 0) return null;
    const label =
      conversation.type === "direct"
        ? `Seen ${formatTime(readBy[0].pivot!.last_read_at!)}`
        : `Seen by ${readBy.length}/${others.length}`;
    return { messageId: lastMine.id, label, names: readBy.map((p) => p.name) };
  }, [lastMine, conversation.participants, conversation.type, currentUserId]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    (text: string, file: File | null) => {
      stickToBottom.current = true;
      return send(conversation.id, text, file);
    },
    [send, conversation.id]
  );

  // ── Drag & drop attachments ───────────────────────────────────────────────
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) composerRef.current?.addFile(file);
    },
  };

  const conversationPending = pending.filter((p) => p.conversationId === conversation.id);
  const typingLine = formatTyping(thread.typingNames);

  function renderMessage(msg: ChatMessage, idx: number, list: ChatMessage[]) {
    const isMine = msg.sender_id === currentUserId;
    const sender = conversation.participants.find((p) => p.id === msg.sender_id);
    const senderName = sender?.name ?? msg.sender?.name ?? "Unknown";
    const prev = list[idx - 1];
    const showDayDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
    const isGrouped =
      !showDayDivider &&
      prev?.sender_id === msg.sender_id &&
      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

    return (
      <div key={msg.id} className={isGrouped ? "mt-0.5" : "mt-3"}>
        {showDayDivider && (
          <div className="my-4 flex items-center gap-3" role="separator">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {formatDayDivider(msg.created_at)}
            </span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
        )}
        <MessageItem
          message={msg}
          isMine={isMine}
          isGroup={isGroup}
          senderName={senderName}
          isGrouped={isGrouped}
          receipt={receipt?.messageId === msg.id ? receipt : null}
          editing={editingId === msg.id}
          onStartEdit={() => setEditingId(msg.id)}
          onCancelEdit={() => setEditingId(null)}
          onSaveEdit={(text) => editMutation.mutate({ id: msg.id, text })}
          onDelete={() => {
            if (window.confirm("Delete this message? This cannot be undone.")) deleteMutation.mutate(msg.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...dragHandlers}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--border)]/30 hover:text-[var(--text)] md:hidden"
          title="Back to conversations"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="shrink-0">{isGroup ? <GroupAvatar size="md" /> : <Avatar name={label} size="md" />}</div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[var(--text)]">{label}</h2>
          <p className="truncate text-xs text-[var(--muted)]">
            {isGroup
              ? `${conversation.participants.length} members`
              : presence?.is_in_call
              ? "On a call"
              : presence?.is_online
              ? "Online"
              : otherUser?.email ?? ""}
          </p>
        </div>
        <CallButton conversation={conversation} currentUserId={currentUserId} />
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-label="Search in conversation"
          aria-pressed={searchOpen}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
            searchOpen
              ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          }`}
          title="Search in conversation"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        {isGroup && (
          <button
            type="button"
            onClick={onOpenGroup}
            aria-label="Group details"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            title="Group details"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {searchOpen && (
        <div className="border-b border-[var(--border)] bg-[var(--background)]/60 px-5 py-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              autoFocus
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search the whole conversation…"
              aria-label="Search this conversation"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-9 pr-8 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {searchText.trim().length === 1 && <p className="mt-1.5 text-[11px] text-[var(--muted)]">Type at least 2 characters.</p>}
        </div>
      )}

      {/* Messages / search results */}
      {searching ? (
        <div className="flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
          {searchQuery.isLoading && <p className="text-xs text-[var(--muted)]">Searching…</p>}
          {searchQuery.isError && <p className="text-xs text-red-600">Search failed. Try again.</p>}
          {searchQuery.data && searchQuery.data.data.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <Search className="h-5 w-5 text-[var(--muted)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--text)]">No matches found</p>
            </div>
          )}
          {searchQuery.data && searchQuery.data.data.length > 0 && (
            <>
              <p className="mb-3 text-[11px] text-[var(--muted)]">
                {searchQuery.data.data.length}
                {searchQuery.data.has_more ? "+" : ""} match{searchQuery.data.data.length === 1 ? "" : "es"}
              </p>
              <ul className="space-y-2">
                {[...searchQuery.data.data].reverse().map((m) => (
                  <li key={m.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2 text-[11px] text-[var(--muted)]">
                      <span className="font-semibold text-[var(--text)]">
                        {m.sender_id === currentUserId ? "You" : m.sender?.name ?? "Unknown"}
                      </span>
                      <time dateTime={m.created_at}>
                        {formatDayDivider(m.created_at)} {formatTime(m.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text)]">{m.message}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-4 sm:px-6"
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${label}`}
        >
          {thread.isLoadingOlder && (
            <div className="flex justify-center py-2" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
              <span className="sr-only">Loading older messages</span>
            </div>
          )}
          {thread.hasOlder === false && messages.length > 0 && (
            <p className="py-2 text-center text-[11px] text-[var(--muted)]">Beginning of the conversation</p>
          )}

          {thread.isLoading && (
            <div className="flex flex-col gap-3 pt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex gap-2 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                  <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--border)]" />
                  <div className={`h-10 w-40 animate-pulse rounded-2xl bg-[var(--border)] ${i % 2 === 0 ? "rounded-br-sm" : "rounded-bl-sm"}`} />
                </div>
              ))}
            </div>
          )}

          {thread.isError && !thread.isLoading && (
            <div className="flex flex-col items-center gap-2 py-16 text-center" role="alert">
              <p className="text-sm text-red-600 dark:text-red-400">{thread.error?.message ?? "Could not load messages."}</p>
              <button
                type="button"
                onClick={() => void thread.refetch()}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--border)]/30"
              >
                Retry
              </button>
            </div>
          )}

          {!thread.isLoading && !thread.isError && messages.length === 0 && conversationPending.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--border)]/50">
                <MessageCircle className="h-5 w-5 text-[var(--muted)]" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--text)]">No messages yet</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Send the first message to {label}.</p>
            </div>
          )}

          {messages.map((msg, idx) => renderMessage(msg, idx, messages))}

          {conversationPending.map((item) => (
            <div key={item.tempId} className="mt-3">
              <PendingMessageItem item={item} onRetry={() => retry(item.tempId)} onDiscard={() => discard(item.tempId)} />
            </div>
          ))}

          <div className="h-5 px-2 pt-1 text-[11px] italic text-[var(--muted)]" aria-live="polite">
            {typingLine}
          </div>
        </div>
      )}

      <Composer
        ref={composerRef}
        placeholder={`Message ${label}…`}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={handleSend}
        onTyping={thread.notifyTyping}
      />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--primary)] bg-[var(--primary)]/10">
          <p className="rounded-lg bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--primary)] shadow">Drop a file to attach</p>
        </div>
      )}
    </div>
  );
}
