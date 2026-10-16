import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { echo } from "@/lib/echo";
import { callEvents } from "@/lib/call-events";
import { toast } from "@/components/notifications/toast";
import { useAuthStore } from "@/store/auth-store";

interface NotificationPing {
  id: number;
  type: string;
  title: string;
  link: string | null;
}

/**
 * Global (mounted once) listener on the user's personal notification channel: a new
 * notification refreshes the bell and the notification list at once. The bell's own 60 s
 * poll stays as the backstop for a websocket that is down.
 */
export function NotificationLiveListener() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (userId === null) return;

    const channel = echo.private(`notifications.user.${userId}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["notifications"] });

    const onCreated = (data: NotificationPing) => {
      refresh();
      toast.info(data.title, "You have a new notification.");
    };

    channel.listen(".notification.created", onCreated);
    // Pushes missed while the websocket was down: re-read the list.
    const offRestored = callEvents.on("connection.restored", refresh);

    return () => {
      offRestored();
      channel.stopListening(".notification.created", onCreated);
      echo.leave(`notifications.user.${userId}`);
    };
  }, [userId, queryClient]);

  return null;
}
