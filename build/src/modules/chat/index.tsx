import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { apiClient } from "@/services/api-client";
import {
  ChatMessage,
  createChatMessage,
  deleteChatMessage,
  listChatMessages,
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

export function ChatPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? 0;

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [draft, setDraft]   = useState("");
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [editText, setEditText]     = useState("");
  const [error, setError]   = useState<string | null>(null);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLTextAreaElement>(null);

  // Load all users you can message
  const usersQuery = useQuery({
    queryKey: ["chat-users"],
    queryFn: () => apiClient<ChatUser[]>("/chat-messages/users"),
  });

  // Load all messages (poll every 5 s)
  const allQuery = useQuery({
    queryKey: ["chat-messages-all"],
    queryFn: () => listChatMessages({}),
    refetchInterval: 5000,
  });

  const allMessages: ChatMessage[] = (allQuery.data ?? []);

  // Build conversation list: one entry per unique other user
  const conversations = (usersQuery.data ?? []).map((user) => {
    const msgs = allMessages.filter(
      (m) =>
        (m.sender_id === currentUserId && m.receiver_id === user.id) ||
        (m.receiver_id === currentUserId && m.sender_id === user.id)
    );
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((m) => m.sender_id === user.id && !m.is_read).length;
    return { user, last, unread, msgs };
  }).sort((a, b) => {
    if (!a.last && !b.last) return 0;
    if (!a.last) return 1;
    if (!b.last) return -1;
    return new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime();
  });

  // Thread for selected user
  const thread = selectedUserId
    ? allMessages.filter(
        (m) =>
          (m.sender_id === currentUserId && m.receiver_id === selectedUserId) ||
          (m.receiver_id === currentUserId && m.sender_id === selectedUserId)
      ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];

  const selectedUser = (usersQuery.data ?? []).find((u) => u.id === selectedUserId) ?? null;

  // Auto-scroll to bottom when thread changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedUserId]);

  const sendMutation = useMutation({
    mutationFn: createChatMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages-all"] });
      setDraft("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      updateChatMessage(id, { message: text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages-all"] });
      setEditingMsg(null);
      setEditText("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-messages-all"] }),
    onError: (e: Error) => setError(e.message),
  });

  function handleSend() {
    const text = draft.trim();
    if (!text || !selectedUserId) return;
    sendMutation.mutate({ receiver_id: selectedUserId, message: text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Chat" subtitle="Internal messaging — select a colleague to start a conversation." />

      <div className="flex h-[calc(100vh-200px)] min-h-[500px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">

        {/* ── Conversation sidebar ── */}
        <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Conversations</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {usersQuery.isLoading && (
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

            {conversations.length === 0 && !usersQuery.isLoading && (
              <p className="p-4 text-center text-xs text-[var(--muted)]">No colleagues found.</p>
            )}

            {conversations.map(({ user, last, unread }) => (
              <button
                key={user.id}
                onClick={() => { setSelectedUserId(user.id); setError(null); }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                  selectedUserId === user.id
                    ? "bg-[var(--primary)]/10 border-r-2 border-[var(--primary)]"
                    : "hover:bg-[var(--border)]/30"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
                    {getInitials(user.name)}
                  </div>
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs font-semibold">{user.name}</p>
                    {last && <span className="shrink-0 text-[10px] text-[var(--muted)]">{formatTime(last.created_at)}</span>}
                  </div>
                  {last && (
                    <p className="truncate text-[11px] text-[var(--muted)]">
                      {last.sender_id === currentUserId ? "You: " : ""}{last.message}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Message thread ── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {!selectedUserId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10 text-2xl">💬</div>
              <p className="font-medium text-[var(--text)]">Select a conversation</p>
              <p className="text-sm text-[var(--muted)]">Choose a colleague from the left to start chatting.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
                  {selectedUser ? getInitials(selectedUser.name) : "?"}
                </div>
                <div>
                  <p className="text-sm font-semibold">{selectedUser?.name}</p>
                  <p className="text-xs text-[var(--muted)]">{selectedUser?.email}</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-[var(--muted)]">Polling every 5s</span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {allQuery.isLoading && (
                  <p className="text-center text-sm text-[var(--muted)]">Loading messages…</p>
                )}
                {thread.length === 0 && !allQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-2xl">👋</p>
                    <p className="mt-2 text-sm font-medium">No messages yet</p>
                    <p className="text-xs text-[var(--muted)]">Send the first message to {selectedUser?.name}.</p>
                  </div>
                )}

                {thread.map((msg) => {
                  const isMine = msg.sender_id === currentUserId;
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isMine ? "bg-[var(--primary)] text-white" : "bg-[var(--border)] text-[var(--muted)]"
                      }`}>
                        {isMine
                          ? getInitials(currentUser?.name ?? "Me")
                          : getInitials(selectedUser?.name ?? "?")}
                      </div>

                      <div className={`group relative max-w-[65%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
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
                          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isMine
                              ? "bg-[var(--primary)] text-white rounded-br-sm"
                              : "bg-[var(--border)]/40 text-[var(--text)] rounded-bl-sm"
                          }`}>
                            {msg.message}
                          </div>
                        )}

                        <span className="mt-0.5 text-[10px] text-[var(--muted)]">{formatTime(msg.created_at)}</span>

                        {/* Actions on hover — only own messages */}
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
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Compose bar */}
              <div className="border-t border-[var(--border)] px-4 py-3">
                {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${selectedUser?.name ?? ""}… (Enter to send, Shift+Enter for new line)`}
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
                    disabled={!draft.trim() || sendMutation.isPending}
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