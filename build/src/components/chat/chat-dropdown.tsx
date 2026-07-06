import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, ArrowRight, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listConversations, markConversationRead } from "@/services/chat-service";
import { useAuthStore } from "@/store/auth-store";

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
}

export function ChatDropdown() {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);

  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations", user?.id],
    queryFn: () => listConversations(),
    enabled: Boolean(user?.id)
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markConversationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    }
  });

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const unreadConversations = (conversationsQuery.data ?? []).filter((c) => c.unread_count > 0);
  const badgeCount = unreadConversations.reduce((sum, c) => sum + c.unread_count, 0);

  function conversationLabel(conversation: (typeof unreadConversations)[number]) {
    if (conversation.type === "group") {
      return conversation.name ?? "Group chat";
    }
    const other = conversation.participants.find((p) => p.id !== user?.id);
    return other?.name ?? "Unknown sender";
  }

  async function markAllAsRead() {
    await Promise.all(unreadConversations.map((c) => markConversationRead(c.id)));
    await queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
  }

  if (!user) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-0 text-[var(--text)]"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open chat messages"
      >
        <MessageCircle className="h-5 w-5" />
        {badgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {badgeCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="fixed inset-x-4 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-96">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Messages</p>
              <p className="text-xs text-[var(--muted)]">
                {badgeCount > 0 ? `${badgeCount} unread message${badgeCount === 1 ? "" : "s"}` : "No new messages"}
              </p>
            </div>
            {badgeCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={async () => await markAllAsRead()}
              >
                Mark all read
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(34rem,calc(100vh-12rem))] overflow-y-auto px-4 py-3">
            {conversationsQuery.isLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading messages...</p>
            ) : unreadConversations.length > 0 ? (
              <div className="space-y-2">
                {unreadConversations.slice(0, 5).map((conversation) => (
                  <div key={conversation.id} className="rounded-2xl border border-[var(--border)] bg-[var(--border)]/20 p-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
                        {conversation.type === "group" ? <Users className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{conversationLabel(conversation)}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                              {conversation.last_message?.message || "Sent an attachment"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {conversation.unread_count}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[var(--muted)]">
                            {conversation.last_message ? formatRelativeTime(conversation.last_message.created_at) : ""}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={async () => {
                              await markReadMutation.mutateAsync(conversation.id);
                            }}
                            disabled={markReadMutation.isPending}
                          >
                            Mark read
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No unread chat messages.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)] transition hover:opacity-80"
              onClick={() => setOpen(false)}
            >
              View full chat
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
