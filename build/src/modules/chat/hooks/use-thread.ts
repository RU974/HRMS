import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { echo } from "@/lib/echo";
import { callEvents } from "@/lib/call-events";
import { ChatMessage, ThreadPage, listThreadMessages } from "@/services/chat-service";
import { appendMessage, flattenThread, markMessageDeleted, replaceMessage, ThreadCache } from "../lib/chat-cache";

const TYPING_TTL_MS = 3500;
const TYPING_SEND_INTERVAL_MS = 2000;

interface TypingWhisper {
  user_id: number;
  name: string;
}

export const threadKey = (conversationId: number | null) => ["chat-thread", conversationId] as const;

/**
 * One conversation's messages: cursor-paginated history (older pages load on
 * demand), live updates (new / edited / deleted messages) over the
 * conversation's private channel, and typing indicators over client whispers.
 */
export function useThread(conversationId: number | null, currentUserId: number, currentUserName: string) {
  const queryClient = useQueryClient();
  const enabled = conversationId !== null;

  const query = useInfiniteQuery<ThreadPage, Error, ThreadCache, ReturnType<typeof threadKey>, number | undefined>({
    queryKey: threadKey(conversationId),
    queryFn: ({ pageParam }) => listThreadMessages({ conversation_id: conversationId!, before_id: pageParam }),
    initialPageParam: undefined,
    // Older pages: continue from the oldest message we have.
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.data[0]?.id : undefined),
    enabled,
  });

  const messages = useMemo(() => flattenThread(query.data), [query.data]);

  const [typing, setTyping] = useState<Record<number, { name: string; expires: number }>>({});
  const channelRef = useRef<ReturnType<typeof echo.private> | null>(null);
  const lastTypingSentRef = useRef(0);

  // Live events for the open conversation.
  useEffect(() => {
    if (conversationId === null) return;

    const key = threadKey(conversationId);
    const channel = echo.private(`chat.${conversationId}`);
    channelRef.current = channel;

    const onSent = ({ message }: { message: ChatMessage }) => {
      queryClient.setQueryData<ThreadCache>(key, (cache) => appendMessage(cache, message));
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      // Their message arrived, so they are no longer "typing".
      setTyping((prev) => {
        if (!(message.sender_id in prev)) return prev;
        const next = { ...prev };
        delete next[message.sender_id];
        return next;
      });
    };
    const onUpdated = ({ message }: { message: ChatMessage }) => {
      queryClient.setQueryData<ThreadCache>(key, (cache) => replaceMessage(cache, message));
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    };
    const onDeleted = ({ message_id }: { message_id: number }) => {
      queryClient.setQueryData<ThreadCache>(key, (cache) => markMessageDeleted(cache, message_id, new Date().toISOString()));
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    };
    const onTyping = (data: TypingWhisper) => {
      if (!data || data.user_id === currentUserId) return;
      setTyping((prev) => ({ ...prev, [data.user_id]: { name: data.name, expires: Date.now() + TYPING_TTL_MS } }));
    };

    channel.listen(".chat.message.sent", onSent);
    channel.listen(".chat.message.updated", onUpdated);
    channel.listen(".chat.message.deleted", onDeleted);
    channel.listenForWhisper("typing", onTyping);

    // Anything sent while the websocket was down is fetched again.
    const offRestored = callEvents.on("connection.restored", () => {
      void queryClient.invalidateQueries({ queryKey: key });
    });

    return () => {
      offRestored();
      channel.stopListening(".chat.message.sent", onSent);
      channel.stopListening(".chat.message.updated", onUpdated);
      channel.stopListening(".chat.message.deleted", onDeleted);
      channel.stopListeningForWhisper("typing", onTyping);
      echo.leave(`chat.${conversationId}`);
      channelRef.current = null;
      setTyping({});
    };
  }, [conversationId, currentUserId, queryClient]);

  // Expire stale "is typing" entries.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const entries = Object.entries(prev).filter(([, v]) => v.expires > now);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [typing]);

  /** Call on every keystroke; throttled so we whisper at most every couple of seconds. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL_MS) return;
    lastTypingSentRef.current = now;
    try {
      channelRef.current?.whisper("typing", { user_id: currentUserId, name: currentUserName } satisfies TypingWhisper);
    } catch {
      /* typing is cosmetic */
    }
  }, [currentUserId, currentUserName]);

  const typingNames = Object.values(typing).map((t) => t.name);

  const addSent = useCallback(
    (message: ChatMessage) => {
      if (conversationId === null) return;
      queryClient.setQueryData<ThreadCache>(threadKey(conversationId), (cache) => appendMessage(cache, message));
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    [conversationId, queryClient]
  );

  return {
    messages,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasOlder: query.hasNextPage,
    isLoadingOlder: query.isFetchingNextPage,
    loadOlder: query.fetchNextPage,
    typingNames,
    notifyTyping,
    addSent,
  };
}
