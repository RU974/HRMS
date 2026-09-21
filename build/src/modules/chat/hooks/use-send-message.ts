import { useCallback, useRef, useState } from "react";
import { ChatMessage, createChatMessage, sendMessageWithProgress, validateAttachment } from "@/services/chat-service";

export interface PendingMessage {
  tempId: string;
  conversationId: number;
  text: string;
  file: File | null;
  status: "sending" | "failed";
  /** 0..1 upload progress (attachments only). */
  progress: number;
  error?: string;
  createdAt: string;
}

/**
 * Optimistic sending. A message appears in the thread immediately as
 * "sending" (with upload progress for attachments); on failure it stays with
 * the error and a retry, so typed text is never lost.
 */
export function useSendMessage(onSent: (message: ChatMessage) => void) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const counter = useRef(0);
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  const patch = useCallback((tempId: string, changes: Partial<PendingMessage>) => {
    setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, ...changes } : p)));
  }, []);

  const dispatch = useCallback(
    async (item: PendingMessage) => {
      patch(item.tempId, { status: "sending", progress: 0, error: undefined });

      try {
        const sent = item.file
          ? await sendMessageWithProgress(
              { conversation_id: item.conversationId, message: item.text || undefined, file: item.file },
              (progress) => patch(item.tempId, { progress })
            )
          : await createChatMessage({ conversation_id: item.conversationId, message: item.text });

        onSentRef.current(sent);
        setPending((prev) => prev.filter((p) => p.tempId !== item.tempId));
      } catch (err) {
        patch(item.tempId, {
          status: "failed",
          error: err instanceof Error ? err.message : "Could not send message.",
        });
      }
    },
    [patch]
  );

  /** Returns an error string if the message was rejected before sending. */
  const send = useCallback(
    (conversationId: number, text: string, file: File | null): string | null => {
      const trimmed = text.trim();
      if (!trimmed && !file) return null;

      if (file) {
        const problem = validateAttachment(file);
        if (problem) return problem;
      }

      const item: PendingMessage = {
        tempId: `pending-${Date.now()}-${counter.current++}`,
        conversationId,
        text: trimmed,
        file,
        status: "sending",
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      setPending((prev) => [...prev, item]);
      void dispatch(item);
      return null;
    },
    [dispatch]
  );

  const retry = useCallback(
    (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (item) void dispatch(item);
    },
    [pending, dispatch]
  );

  const discard = useCallback((tempId: string) => {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }, []);

  return { pending, send, retry, discard };
}
