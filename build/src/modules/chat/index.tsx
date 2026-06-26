import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { echo } from "@/lib/echo";
import {
  MessageCircle,
  Search,
  X,
  Plus,
  Paperclip,
  Send,
  Edit2,
  Trash2,
  Users,
  Check,
  CheckCheck,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { CallButton } from "@/components/call/CallButton";
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

type ChatUser = { id: number; name: string; email: string; is_online?: boolean; is_in_call?: boolean };

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const color = getAvatarColor(name);
  const sizeClass = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";
  return (
    <div className={`${sizeClass} ${color} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}>
      {getInitials(name)}
    </div>
  );
}

function GroupAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)]`}>
      <Users className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}

function ChatAttachment({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
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
    if (failed) return <p className="text-xs opacity-70">Unable to load image.</p>;
    if (!url) return <div className="h-32 w-44 animate-pulse rounded-xl bg-black/10" />;
    return <img src={url} alt={message.attachment_name ?? "attachment"} className="max-h-64 max-w-full rounded-xl" />;
  }

  return (
    <button
      onClick={() => void downloadChatAttachment(message.id, message.attachment_name ?? "attachment")}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs transition hover:opacity-80 ${
        isMine ? "border-white/20 bg-white/10" : "border-[var(--border)] bg-[var(--background)]"
      }`}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isMine ? "bg-white/20" : "bg-[var(--primary)]/10"}`}>
        <Paperclip className={`h-3.5 w-3.5 ${isMine ? "text-white" : "text-[var(--primary)]"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{message.attachment_name ?? "Attachment"}</p>
        {message.attachment_size && <p className="opacity-60">{formatBytes(message.attachment_size)}</p>}
      </div>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
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
  });

  useEffect(() => {
    if (!selectedConversationId) return;
    const channel = echo.private(`chat.${selectedConversationId}`);
    channel.listen('ChatMessageSent', () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-messages-thread", selectedConversationId] });
    });
    return () => {
      echo.leave(`chat.${selectedConversationId}`);
    };
  }, [selectedConversationId, queryClient]);

  const thread: ChatMessage[] = (threadQuery.data?.data ?? [])
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
        setError("Please provide a group name.");
        return;
      }
      createConversationMutation.mutate({ type: "group", name: newChatGroupName.trim(), participant_ids: newChatUserIds });
    }
  }

  function conversationLabel(conversation: ChatConversation) {
    if (conversation.type === "group") return conversation.name ?? "Group chat";
    return conversation.participants.find((p) => p.id !== currentUserId)?.name ?? "Unknown";
  }

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

      <div className="flex h-[calc(100vh-200px)] min-h-[560px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">

        {/* ── Conversation sidebar ── */}
        <div className="flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--background)]/50">

          {/* Sidebar header */}
          <div className="border-b border-[var(--border)] px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[var(--primary)]" />
                <span className="text-sm font-semibold text-[var(--text)]">Messages</span>
              </div>
              <button
                onClick={() => { setShowNewChat((v) => !v); setError(null); }}
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-8 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* New chat panel */}
          {showNewChat && (
            <div className="border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Start a conversation</p>
              {newChatUserIds.length > 1 && (
                <input
                  type="text"
                  value={newChatGroupName}
                  onChange={(e) => setNewChatGroupName(e.target.value)}
                  placeholder="Group name…"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
                />
              )}
              <div className="max-h-36 space-y-0.5 overflow-y-auto">
                {(usersQuery.data ?? []).filter((u) => u.id !== currentUserId).map((u) => {
                  const checked = newChatUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      onClick={() =>
                        setNewChatUserIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition ${
                        checked ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-[var(--text)] hover:bg-[var(--border)]/30"
                      }`}
                    >
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        checked ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)]"
                      }`}>
                        {checked && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <span className="flex-1 truncate font-medium">{u.name}</span>
                    </label>
                  );
                })}
              </div>
              <button
                onClick={handleStartNewChat}
                disabled={newChatUserIds.length === 0 || createConversationMutation.isPending}
                className="w-full rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {createConversationMutation.isPending
                  ? "Creating…"
                  : newChatUserIds.length > 1
                  ? "Create group"
                  : newChatUserIds.length === 1
                  ? "Start chat"
                  : "Select people to start"}
              </button>
            </div>
          )}

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-1">
            {conversationsQuery.isLoading && (
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

            {visibleConversations.length === 0 && !conversationsQuery.isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--border)]/50">
                  <MessageCircle className="h-4 w-4 text-[var(--muted)]" />
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {searchQuery ? `No results for "${searchQuery}"` : "No conversations yet"}
                </p>
              </div>
            )}

            {visibleConversations.map((conversation) => {
              const label = conversationLabel(conversation);
              const last = conversation.last_message;
              const isActive = selectedConversationId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  onClick={() => {
                    setSelectedConversationId(conversation.id);
                    setThreadSearchOpen(false);
                    setThreadSearch("");
                    setError(null);
                  }}
                  className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-all ${
                    isActive
                      ? "bg-[var(--primary)]/10 border-r-[3px] border-[var(--primary)]"
                      : "border-r-[3px] border-transparent hover:bg-[var(--border)]/20"
                  }`}
                >
                  <div className="relative shrink-0">
                    {conversation.type === "group" ? <GroupAvatar /> : <Avatar name={label} />}
                    {/* Online / in-call indicator for direct chats */}
                    {conversation.type === "direct" && (() => {
                      const other = conversation.participants.find((p) => p.id !== currentUserId);
                      const chatUser = (usersQuery.data ?? []).find((u) => u.id === other?.id);
                      if (chatUser?.is_in_call) {
                        return (
                          <span
                            title="On a call"
                            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--card)] bg-blue-500 text-white"
                          >
                            <svg className="h-2 w-2" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                            </svg>
                          </span>
                        );
                      }
                      return chatUser?.is_online ? (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--card)] bg-green-500" />
                      ) : null;
                    })()}
                    {conversation.unread_count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[9px] font-bold text-white">
                        {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className={`truncate text-xs ${conversation.unread_count > 0 ? "font-bold text-[var(--text)]" : "font-semibold text-[var(--text)]"}`}>
                        {label}
                      </p>
                      {last && (
                        <span className="shrink-0 text-[10px] text-[var(--muted)]">{formatTime(last.created_at)}</span>
                      )}
                    </div>
                    {last && (
                      <p className={`mt-0.5 truncate text-[11px] ${conversation.unread_count > 0 ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}`}>
                        {last.sender_id === currentUserId ? "You: " : ""}
                        {last.message || (last.attachment_name ? last.attachment_name : "")}
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
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)]/10">
                <MessageCircle className="h-7 w-7 text-[var(--primary)]" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-[var(--text)]">Select a conversation</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Choose from the left, or start a new one.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3.5">
                <div className="shrink-0">
                  {selectedConversation.type === "group"
                    ? <GroupAvatar size="md" />
                    : <Avatar name={conversationLabel(selectedConversation)} size="md" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">{conversationLabel(selectedConversation)}</p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {selectedConversation.type === "group"
                      ? `${selectedConversation.participants.length} members`
                      : selectedConversation.participants.find((p) => p.id !== currentUserId)?.email ?? ""}
                  </p>
                </div>
                <CallButton conversation={selectedConversation} currentUserId={currentUserId} />
                <button
                  onClick={() => setThreadSearchOpen((v) => !v)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    threadSearchOpen
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  }`}
                  title="Search in conversation"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Thread search bar */}
              {threadSearchOpen && (
                <div className="border-b border-[var(--border)] bg-[var(--background)]/60 px-5 py-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      autoFocus
                      type="text"
                      value={threadSearch}
                      onChange={(e) => setThreadSearch(e.target.value)}
                      placeholder="Search this conversation…"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-9 pr-8 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
                    />
                    {threadSearch && (
                      <button
                        onClick={() => setThreadSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {threadSearch.trim() && (
                    <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                      {filteredThread.length} match{filteredThread.length === 1 ? "" : "es"}
                    </p>
                  )}
                </div>
              )}

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
                {threadQuery.isLoading && (
                  <div className="flex flex-col gap-3 pt-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className={`flex gap-2 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                        <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--border)]" />
                        <div className={`h-10 w-40 animate-pulse rounded-2xl bg-[var(--border)] ${i % 2 === 0 ? "rounded-br-sm" : "rounded-bl-sm"}`} />
                      </div>
                    ))}
                  </div>
                )}

                {filteredThread.length === 0 && !threadQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--border)]/50">
                      {threadSearch.trim()
                        ? <Search className="h-5 w-5 text-[var(--muted)]" />
                        : <MessageCircle className="h-5 w-5 text-[var(--muted)]" />
                      }
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--text)]">
                      {threadSearch.trim() ? "No matches found" : "No messages yet"}
                    </p>
                    {!threadSearch.trim() && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Send the first message to {conversationLabel(selectedConversation)}.
                      </p>
                    )}
                  </div>
                )}

                {filteredThread.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUserId;
                  const sender = selectedConversation.participants.find((p) => p.id === msg.sender_id);
                  const senderName = sender?.name ?? msg.sender?.name ?? "Unknown";
                  const prev = filteredThread[idx - 1];
                  const showDayDivider =
                    !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                  const isGrouped =
                    !showDayDivider &&
                    prev?.sender_id === msg.sender_id &&
                    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

                  return (
                    <div key={msg.id} className={isGrouped ? "mt-0.5" : "mt-3"}>
                      {showDayDivider && (
                        <div className="my-4 flex items-center gap-3">
                          <div className="h-px flex-1 bg-[var(--border)]" />
                          <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {formatDayDivider(msg.created_at)}
                          </span>
                          <div className="h-px flex-1 bg-[var(--border)]" />
                        </div>
                      )}

                      <div className={`group flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                        {/* Avatar */}
                        <div className={`shrink-0 ${isGrouped ? "opacity-0 pointer-events-none" : ""}`}>
                          {isMine
                            ? <Avatar name={currentUser?.name ?? "Me"} size="sm" />
                            : senderName
                            ? <Avatar name={senderName} size="sm" />
                            : <GroupAvatar size="sm" />
                          }
                        </div>

                        {/* Bubble + meta */}
                        <div className={`flex max-w-[60%] flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
                          {selectedConversation.type === "group" && !isMine && !isGrouped && (
                            <span className="px-1 text-[11px] font-semibold text-[var(--muted)]">{senderName}</span>
                          )}

                          {editingMsg?.id === msg.id ? (
                            <div className="flex gap-2 rounded-2xl border border-[var(--primary)]/30 bg-[var(--card)] p-3 shadow-sm">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="min-w-[200px] resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
                                rows={2}
                              />
                              <div className="flex flex-col gap-1.5">
                                <button
                                  onClick={() => editMutation.mutate({ id: msg.id, text: editText })}
                                  className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setEditingMsg(null); setEditText(""); }}
                                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--border)]/30"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                                isMine
                                  ? "bg-[var(--primary)] text-white rounded-br-md"
                                  : "bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-md"
                              }`}
                            >
                              {msg.attachment_path && <ChatAttachment message={msg} isMine={isMine} />}
                              {msg.message && (
                                <span className="whitespace-pre-wrap break-words">{msg.message}</span>
                              )}
                            </div>
                          )}

                          {/* Timestamp + receipt + actions */}
                          <div className={`flex items-center gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                            <span className="text-[10px] text-[var(--muted)]">{formatTime(msg.created_at)}</span>

                            {isMine && readReceipt?.messageId === msg.id && (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--primary)]" title={readReceipt.names?.join(", ")}>
                                <CheckCheck className="h-3 w-3" />
                                {readReceipt.label}
                              </span>
                            )}

                            {isMine && editingMsg?.id !== msg.id && (
                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  onClick={() => { setEditingMsg(msg); setEditText(msg.message); }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
                                  title="Edit message"
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  onClick={() => { if (confirm("Delete this message?")) deleteMutation.mutate(msg.id); }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-red-500 transition-colors"
                                  title="Delete message"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Compose bar */}
              <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
                {error && (
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
                  </div>
                )}
                {pendingFile && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--primary)]/10">
                      <Paperclip className="h-3 w-3 text-[var(--primary)]" />
                    </div>
                    <span className="flex-1 truncate font-medium text-[var(--text)]">{pendingFile.name}</span>
                    <span className="text-[var(--muted)]">{formatBytes(pendingFile.size)}</span>
                    <button
                      onClick={() => setPendingFile(null)}
                      className="text-[var(--muted)] hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    title="Attach a file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${conversationLabel(selectedConversation)}…`}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 transition"
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:opacity-90 disabled:opacity-40"
                    title="Send (Enter)"
                  >
                    {sendMutation.isPending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                  Enter to send &middot; Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
