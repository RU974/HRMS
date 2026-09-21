import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Bell, MessageCircle, X } from "lucide-react";
import { PageHeader } from "@/components/page-header/page-header";
import { ChatConversation, createConversation, listChatUsers, listConversations } from "@/services/chat-service";
import { useAuthStore } from "@/store/auth-store";
import { useChatViewStore } from "@/store/chat-view-store";
import { ConversationList } from "./components/conversation-list";
import { GroupManagePanel } from "./components/group-manage-panel";
import { MessageThread } from "./components/message-thread";
import { NewChatPanel } from "./components/new-chat-panel";
import { desktopNotificationPermission, requestDesktopNotifications } from "./lib/notify";

const NOTIFY_PROMPT_DISMISSED_KEY = "chat.notifyPromptDismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(NOTIFY_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function ChatPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? 0;
  const currentUserName = currentUser?.name ?? "Someone";
  const params = useParams<{ conversationId?: string }>();
  const setActiveConversationId = useChatViewStore((s) => s.setActiveConversationId);

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const fromUrl = Number(params.conversationId);
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : null;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [notifyPermission, setNotifyPermission] = useState(desktopNotificationPermission);
  const [notifyPromptDismissed, setNotifyPromptDismissed] = useState(readDismissed);

  const usersQuery = useQuery({
    queryKey: ["chat-users"],
    queryFn: listChatUsers,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Realtime pings (ChatInboxListener) keep this fresh; the interval only
  // backstops read receipts, which have no push event.
  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: listConversations,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const conversations: ChatConversation[] = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  // Follow the URL when it changes while the page is already open.
  useEffect(() => {
    const fromUrl = Number(params.conversationId);
    if (Number.isFinite(fromUrl) && fromUrl > 0) setSelectedId(fromUrl);
  }, [params.conversationId]);

  // Tell the global listener what is open, so it does not ping for it.
  useEffect(() => {
    setActiveConversationId(selectedConversation?.id ?? null);
    return () => setActiveConversationId(null);
  }, [selectedConversation?.id, setActiveConversationId]);

  // Drop the panel when switching or leaving a conversation.
  useEffect(() => {
    setShowGroupPanel(false);
  }, [selectedId]);

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      setSelectedId(conversation.id);
      setShowNewChat(false);
      setNewChatError(null);
    },
    onError: (e: Error) => setNewChatError(e.message),
  });

  async function enableNotifications() {
    setNotifyPermission(await requestDesktopNotifications());
  }

  function dismissNotifyPrompt() {
    setNotifyPromptDismissed(true);
    try {
      localStorage.setItem(NOTIFY_PROMPT_DISMISSED_KEY, "1");
    } catch {
      /* not persisted */
    }
  }

  const showNotifyPrompt = notifyPermission === "default" && !notifyPromptDismissed;

  return (
    <div className="space-y-4">
      <PageHeader title="Chat" subtitle="Internal messaging — direct messages and group conversations." />

      {showNotifyPrompt && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-[var(--text)]">
            <Bell className="h-4 w-4 text-[var(--primary)]" />
            Get desktop notifications for new messages and incoming calls when this tab is in the background.
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void enableNotifications()}
              className="rounded-lg bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={dismissNotifyPrompt}
              aria-label="Dismiss"
              className="rounded p-1 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="flex h-[calc(100vh-200px)] min-h-[560px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {/* Conversation sidebar */}
        <div
          className={`w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--background)]/50 md:flex md:w-72 ${
            selectedConversation ? "hidden md:flex" : "flex"
          }`}
        >
          <ConversationList
            conversations={conversations}
            users={usersQuery.data ?? []}
            currentUserId={currentUserId}
            selectedId={selectedId}
            searchQuery={searchQuery}
            showNewChat={showNewChat}
            isLoading={conversationsQuery.isLoading}
            error={conversationsQuery.isError ? (conversationsQuery.error as Error).message : null}
            onSearchChange={setSearchQuery}
            onToggleNewChat={() => {
              setShowNewChat((v) => !v);
              setNewChatError(null);
            }}
            onSelect={setSelectedId}
            onRetry={() => void conversationsQuery.refetch()}
          >
            {showNewChat && (
              <NewChatPanel
                users={usersQuery.data ?? []}
                currentUserId={currentUserId}
                loading={usersQuery.isLoading}
                submitting={createMutation.isPending}
                error={newChatError}
                onSubmit={({ type, name, participantIds }) =>
                  createMutation.mutate({ type, name, participant_ids: participantIds })
                }
              />
            )}
          </ConversationList>
        </div>

        {/* Thread */}
        <div className={`relative min-w-0 flex-1 flex-col overflow-hidden md:flex ${selectedConversation ? "flex" : "hidden md:flex"}`}>
          {!selectedConversation ? (
            <div className="hidden flex-1 flex-col items-center justify-center gap-4 md:flex">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)]/10">
                <MessageCircle className="h-7 w-7 text-[var(--primary)]" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-[var(--text)]">
                  {selectedId && !conversationsQuery.isLoading ? "Conversation not found" : "Select a conversation"}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {selectedId && !conversationsQuery.isLoading
                    ? "You may no longer be a member of it."
                    : "Choose from the left, or start a new one."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <MessageThread
                key={selectedConversation.id}
                conversation={selectedConversation}
                users={usersQuery.data ?? []}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                draft={drafts[selectedConversation.id] ?? ""}
                onDraftChange={(value) => setDrafts((prev) => ({ ...prev, [selectedConversation.id]: value }))}
                onBack={() => setSelectedId(null)}
                onOpenGroup={() => setShowGroupPanel(true)}
              />
              {showGroupPanel && selectedConversation.type === "group" && (
                <GroupManagePanel
                  conversation={selectedConversation}
                  users={usersQuery.data ?? []}
                  currentUserId={currentUserId}
                  onClose={() => setShowGroupPanel(false)}
                  onLeft={() => {
                    setShowGroupPanel(false);
                    setSelectedId(null);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
