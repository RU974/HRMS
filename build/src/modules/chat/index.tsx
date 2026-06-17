import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { apiClient } from "@/services/api-client";
import {
  ChatConversation,
  ChatMessage,
  createChatMessage,
  createConversation,
  deleteChatMessage,
  downloadChatAttachment,
  fetchChatAttachment,
  listChatMessages,
  listConversations,
  markConversationRead,
  updateChatMessage,
} from "@/services/chat-service";
import { useAuthStore } from "@/store/auth-store";

type ChatUser = { id: number; name: string; email: string };

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDayDivider(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ChatAttachment({ message }: { message: ChatMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = (message.attachment_mime ?? "").startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let objectUrl: string | null = null;
    fetchChatAttachment(message.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, isImage]);

  if (isImage) {
    if (failed) return <p className="text-xs text-red-400">Unable to load image.</p>;
    if (!url) return <div className="h-32 w-44 animate-pulse rounded-lg bg-[var(--border)]" />;
    return <img src={url} alt={message.attachment_name ?? "attachment"} className="max-h-60 max-w-full rounded-lg" />;
  }

  return (
    <button
      onClick={() => void downloadChatAttachment(message.id, message.attachment_name ?? "attachment")}
      className="flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-left text-xs hover:opacity-80"
    >
      <span aria-hidden>📎</span>
      <span className="flex-1 truncate">{message.attachment_name ?? "Attachment"}</span>
      <span className="opacity-70">{formatBytes(message.attachment_size)}</span>
    </button>
  );
}

export function ChatPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? 0;

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatUserIds, setNewChatUserIds] = useState<number[]>([]);
  const [newChatGroupName, setNewChatGroupName] = useState("");
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usersQuery = useQuery({
    queryKey: ["chat-users"],
    queryFn: () => apiClient<ChatUser[]>("/chat-messages/users"),
  });

  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => listConversations(),
    refetchInterval: 5000,
  });

  const conversations: ChatConversation[] = conversationsQuery.data ?? [];
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null;

  const threadQuery = useQuery({
    queryKey: ["chat-messages-thread", selectedConversationId],
    queryFn: () => listChatMessages({ conversation_id: selectedConversationId! }),
    enabled: Boolean(selectedConversationId),
    refetchInterval: 5000,
  });

  const thread: ChatMessage[] = (threadQuery.data ?? [])
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const filteredThread = threadSearch.trim()
    ? thread.filter((m) => m.message.toLowerCase().includes(threadSearch.trim().toLowerCase()))
    : thread;

  const visibleConversations = conversations
    .filter((c) => {
      const label = c.type === "group" ? c.name ?? "Group chat" : c.participants.find((p) => p.id !== currentUserId)?.name ?? "";
      return label.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at;
      const bTime = b.last_message?.created_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedConversationId]);

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markConversationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });

  useEffect(() => {
    if (selectedConversationId) {
      markReadMutation.mutate(selectedConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, thread.length]);

  const sendMutation = useMutation({
    mutationFn: createChatMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages-thread", selectedConversationId] });
      await queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      setDraft("");
      setPendingFile(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => updateChatMessage(id, { message: text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages-thread", selectedConversationId] });
      setEditingMsg(null);
      setEditText("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-messages-thread", selectedConversationId] }),
    onError: (e: Error) => setError(e.message),
  });

  const createConversationMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      setSelectedConversationId(conversation.id);
      setShowNewChat(false);
      setNewChatUserIds([]);
      setNewChatGroupName("");
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSend() {
    const text = draft.trim();
    if ((!text && !pendingFile) || !selectedConversationId) return;
    sendMutation.mutate({ conversation_id: selectedConversationId, message: text, file: pendingFile });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleStartNewChat() {
    if (newChatUserIds.length === 0) return;
    if (newChatUserIds.length === 1) {
      createConversationMutation.mutate({ type: "direct", participant_ids: newChatUserIds });
    } else {
      if (!newChatGroupName.trim()) {
        setError("Please name your group.");
        return;
      }
      createConversationMutation.mutate({ type: "group", name: newChatGroupName.trim(), participant_ids: newChatUserIds });
    }
  }

  function conversationLabel(conversation: ChatConversation) {
    if (conversation.type === "group") return conversation.name ?? "Group chat";
    return conversation.participants.find((p) => p.id !== currentUserId)?.name ?? "Unknown";
  }

  // Read-receipt info for the last message I sent in the open thread
  const lastMine = [...thread].reverse().find((m) => m.sender_id === currentUserId);
  const readReceipt = useMemo(() => {
    if (!lastMine || !selectedConversation) return null;
    const others = selectedConversation.participants.filter((p) => p.id !== currentUserId);
    const readBy = others.filter(
      (p) => p.pivot?.last_read_at && new Date(p.pivot.last_read_at).getTime() >= new Date(lastMine.created_at).getTime()
    );
    if (readBy.length === 0) return null;
    if (selectedConversation.type === "direct") {
      return { label: `Seen ${formatTime(readBy[0].pivot!.last_read_at!)}`, messageId: lastMine.id };
    }
    return { label: `Seen by ${readBy.length}/${others.length}`, messageId: lastMine.id, names: readBy.map((p) => p.name) };
  }, [lastMine, selectedConversation, currentUserId]);

  return (
    <div className="space-y-4">
      <PageHeader title="Chat" subtitle="Internal messaging — direct messages and group conversations." />

      <div className="flex h-[calc(100vh-200px)] min-h-[500px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">

        {/* ── Conversation sidebar ── */}
        <div className="flex w-72 shrink-0 flex-col border-r border-[var(--border)]">
          <div className="border-b border-[var(--border)] px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Conversations</p>
              <button
                onClick={() => { setShowNewChat(true); setError(null); }}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/10"
              >
                + New
              </button>
            </div>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* New chat panel */}
          {showNewChat && (
            <div className="border-b border-[var(--border)] bg-[var(--background)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Start a conversation</p>
                <button onClick={() => setShowNewChat(false)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">✕</button>
              </div>
              {newChatUserIds.length > 1 && (
                <input
                  type="text"
                  value={newChatGroupName}
                  onChange={(e) => setNewChatGroupName(e.target.value)}
                  placeholder="Group name"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs focus:outline-none"
                />
              )}
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {(usersQuery.data ?? []).filter((u) => u.id !== currentUserId).map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-[var(--border)]/30">
                    <input
                      type="checkbox"
                      checked={newChatUserIds.includes(u.id)}
                      onChange={(e) => {
                        setNewChatUserIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id));
                      }}
                    />
                    {u.name}
                  </label>
                ))}
              </div>
              <button
                onClick={handleStartNewChat}
                disabled={newChatUserIds.length === 0 || createConversationMutation.isPending}
                className="w-full rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {newChatUserIds.length > 1 ? "Create group" : "Start chat"}
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {conversationsQuery.isLoading && (
              <div className="space-y-2 p-3">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="flex gap-2">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--border)]" />
                    <div className="flex-1 space-y-1 pt-1">
                      <div className="h-3 animate-pulse rounded bg-[var(--border)]" />
                      <div className="h-2 w-2/3 animate-pulse rounded bg-[var(--border)]" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {visibleConversations.length === 0 && !conversationsQuery.isLoading && (
              <p className="p-4 text-center text-xs text-[var(--muted)]">
                {searchQuery ? `No results for "${searchQuery}"` : "No conversations yet. Start one above."}
              </p>
            )}

            {visibleConversations.map((conversation) => {
              const label = conversationLabel(conversation);
              const last = conversation.last_message;
              return (
                <button
                  key={conversation.id}
                  onClick={() => { setSelectedConversationId(conversation.id); setThreadSearchOpen(false); setThreadSearch(""); setError(null); }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                    selectedConversationId === conversation.id
                      ? "bg-[var(--primary)]/10 border-r-2 border-[var(--primary)]"
                      : "hover:bg-[var(--border)]/30"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
                      {conversation.type === "group" ? "👥" : getInitials(label)}
                    </div>
                    {conversation.unread_count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-xs font-semibold">{label}</p>
                      {last && <span className="shrink-0 text-[10px] text-[var(--muted)]">{formatTime(last.created_at)}</span>}
                    </div>
                    {last && (
                      <p className="truncate text-[11px] text-[var(--muted)]">
                        {last.sender_id === currentUserId ? "You: " : ""}{last.message || (last.attachment_name ? `📎 ${last.attachment_name}` : "")}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Message thread ── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {!selectedConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10 text-2xl">💬</div>
              <p className="font-medium text-[var(--text)]">Select a conversation</p>
              <p className="text-sm text-[var(--muted)]">Choose a chat from the left, or start a new one.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
                  {selectedConversation.type === "group" ? "👥" : getInitials(conversationLabel(selectedConversation))}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{conversationLabel(selectedConversation)}</p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {selectedConversation.type === "group"
                      ? `${selectedConversation.participants.length} members`
                      : selectedConversation.participants.find((p) => p.id !== currentUserId)?.email}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setThreadSearchOpen((v) => !v)}
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] hover:text-[var(--primary)]"
                    title="Search in conversation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                    </svg>
                  </button>
                </div>
              </div>

              {threadSearchOpen && (
                <div className="border-b border-[var(--border)] px-5 py-2">
                  <input
                    autoFocus
                    type="text"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Search this conversation…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                  {threadSearch.trim() && (
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {filteredThread.length} match{filteredThread.length === 1 ? "" : "es"}
                    </p>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {threadQuery.isLoading && (
                  <p className="text-center text-sm text-[var(--muted)]">Loading messages…</p>
                )}
                {filteredThread.length === 0 && !threadQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-2xl">{threadSearch.trim() ? "🔍" : "👋"}</p>
                    <p className="mt-2 text-sm font-medium">{threadSearch.trim() ? "No matches" : "No messages yet"}</p>
                    {!threadSearch.trim() && (
                      <p className="text-xs text-[var(--muted)]">Send the first message to {conversationLabel(selectedConversation)}.</p>
                    )}
                  </div>
                )}

                {filteredThread.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUserId;
                  const sender = selectedConversation.participants.find((p) => p.id === msg.sender_id);
                  const prev = filteredThread[idx - 1];
                  const showDayDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                  const isGrouped = !showDayDivider && prev?.sender_id === msg.sender_id &&
                    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
                  return (
                    <div key={msg.id}>
                      {showDayDivider && (
                        <div className="my-3 flex items-center gap-3">
                          <div className="h-px flex-1 bg-[var(--border)]" />
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {formatDayDivider(msg.created_at)}
                          </span>
                          <div className="h-px flex-1 bg-[var(--border)]" />
                        </div>
                      )}
                      <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"} ${isGrouped ? "mt-0.5" : ""}`}>
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isGrouped ? "opacity-0" : ""
                      } ${
                        isMine ? "bg-[var(--primary)] text-white" : "bg-[var(--border)] text-[var(--muted)]"
                      }`}>
                        {isMine ? getInitials(currentUser?.name ?? "Me") : getInitials(sender?.name ?? msg.sender?.name ?? "?")}
                      </div>

                      <div className={`group relative max-w-[65%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                        {selectedConversation.type === "group" && !isMine && (
                          <span className="mb-0.5 text-[10px] font-semibold text-[var(--muted)]">{sender?.name ?? msg.sender?.name}</span>
                        )}
                        {editingMsg?.id === msg.id ? (
                          <div className="flex gap-2 rounded-2xl border border-[var(--primary)]/30 bg-[var(--card)] p-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="min-w-[200px] resize-none rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-sm focus:outline-none"
                              rows={2}
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => editMutation.mutate({ id: msg.id, text: editText })}
                                className="rounded-lg bg-[var(--primary)] px-2 py-1 text-xs text-white"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingMsg(null); setEditText(""); }}
                                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`flex flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isMine
                              ? "bg-[var(--primary)] text-white rounded-br-sm"
                              : "bg-[var(--border)]/40 text-[var(--text)] rounded-bl-sm"
                          }`}>
                            {msg.attachment_path && <ChatAttachment message={msg} />}
                            {msg.message && <span>{msg.message}</span>}
                          </div>
                        )}

                        <span className="mt-0.5 text-[10px] text-[var(--muted)]">{formatTime(msg.created_at)}</span>

                        {isMine && readReceipt?.messageId === msg.id && (
                          <span
                            className="mt-0.5 text-[10px] text-[var(--primary)]"
                            title={readReceipt.names?.join(", ")}
                          >
                            {readReceipt.label}
                          </span>
                        )}

                        {isMine && editingMsg?.id !== msg.id && (
                          <div className="absolute -left-16 top-1 hidden gap-1 group-hover:flex">
                            <button
                              onClick={() => { setEditingMsg(msg); setEditText(msg.message); }}
                              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-xs text-[var(--muted)] hover:text-[var(--primary)]"
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => { if (confirm("Delete this message?")) deleteMutation.mutate(msg.id); }}
                              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-xs text-[var(--muted)] hover:text-red-500"
                              title="Delete"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Compose bar */}
              <div className="border-t border-[var(--border)] px-4 py-3">
                {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
                {pendingFile && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs">
                    <span aria-hidden>📎</span>
                    <span className="flex-1 truncate">{pendingFile.name}</span>
                    <button onClick={() => setPendingFile(null)} className="text-[var(--muted)] hover:text-red-500">✕</button>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)]"
                    title="Attach a file"
                  >
                    📎
                  </button>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${conversationLabel(selectedConversation)}… (Enter to send, Shift+Enter for new line)`}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ maxHeight: "120px", overflowY: "auto" }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={(!draft.trim() && !pendingFile) || sendMutation.isPending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:opacity-90 disabled:opacity-40"
                    title="Send"
                  >
                    {sendMutation.isPending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
