import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { echo } from "@/lib/echo";
import { callEvents } from "@/lib/call-events";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";
import { useChatViewStore } from "@/store/chat-view-store";
import { playMessageTone, showMessageNotification } from "@/modules/chat/lib/notify";

interface InboxUpdate {
  conversation_id: number;
  message_id: number;
  sender_id: number;
  sender_name: string;
  conversation_name: string | null;
  preview: string;
}

interface ConversationChange {
  conversation_id: number;
  action: "created" | "renamed" | "member_added" | "member_removed" | "removed" | "left";
}

/**
 * Global (mounted once) listener on the user's personal chat channel. It
 * keeps unread badges and the conversation list live without polling, and
 * pings the user (sound + desktop notification) for messages they cannot see
 * because the tab is in the background or another conversation is open.
 */
export function ChatInboxListener() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (userId === null) return;

    const channel = echo.private(`chat.user.${userId}`);

    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });

    const onInbox = (data: InboxUpdate) => {
      refresh();

      const viewing = useChatViewStore.getState().activeConversationId === data.conversation_id;
      const foreground = document.visibilityState === "visible" && document.hasFocus();
      if (viewing && foreground) return;

      const title = data.conversation_name ? `${data.sender_name} in ${data.conversation_name}` : data.sender_name;
      playMessageTone();
      // Foreground but elsewhere: a toast is enough. Background: a desktop notification.
      if (foreground) {
        toast.info(title, data.preview);
      } else {
        showMessageNotification(title, data.preview, `chat-${data.conversation_id}`, () => {
          // Navigate inside the SPA: a full page load would hang up any call in progress.
          // Imported lazily because this listener sits above the router in the tree.
          void import("@/app/routes/app-routes").then(({ appRouter }) => appRouter.navigate(`/chat/${data.conversation_id}`));
        });
      }
    };

    const onChanged = (data: ConversationChange) => {
      refresh();

      if (data.action === "removed") {
        // Stop listening to a conversation we are no longer part of.
        echo.leave(`chat.${data.conversation_id}`);
        void queryClient.removeQueries({ queryKey: ["chat-thread", data.conversation_id] });
        toast.info("Removed from group", "You were removed from a group conversation.");
      }
    };

    channel.listen(".chat.inbox.updated", onInbox);
    channel.listen(".chat.conversation.changed", onChanged);

    // Missed pushes while the websocket was down: re-read the list.
    const offRestored = callEvents.on("connection.restored", refresh);

    return () => {
      offRestored();
      channel.stopListening(".chat.inbox.updated", onInbox);
      channel.stopListening(".chat.conversation.changed", onChanged);
      echo.leave(`chat.user.${userId}`);
    };
  }, [userId, queryClient]);

  return null;
}
