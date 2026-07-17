import { useState } from "react";
import { Phone, Video } from "lucide-react";
import { ChatConversation } from "@/services/chat-service";
import { initiateCall } from "@/services/call-service";
import { startRingtone } from "@/lib/ringtone";
import { useCallContext } from "./CallProvider";
import { toast } from "@/components/notifications/toast";

interface CallButtonProps {
  conversation: ChatConversation;
  currentUserId: number;
}

export function CallButton({ conversation, currentUserId }: CallButtonProps) {
  const { activeCall, startCall } = useCallContext();
  const [loading, setLoading] = useState<"audio" | "video" | null>(null);

  const participantIds = conversation.participants
    .filter((p) => p.id !== currentUserId)
    .map((p) => p.id);

  const noParticipants = participantIds.length === 0;

  async function handleCall(type: "audio" | "video") {
    if (loading || activeCall || noParticipants) return;
    setLoading(type);
    try {
      const call = await initiateCall({
        conversation_id: conversation.id,
        participant_ids: participantIds,
        type,
      });
      // Play outgoing ringback so the caller knows it's ringing
      startRingtone("outgoing").catch(() => {});
      startCall(call);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again in a moment.";
      toast.error("Could not start call", message);
    } finally {
      setLoading(null);
    }
  }

  const disabled = !!activeCall || !!loading || noParticipants;
  const title = noParticipants
    ? "No one to call in this conversation"
    : undefined;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleCall("audio")}
        disabled={disabled}
        title={title ?? "Voice call"}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading === "audio" ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
      </button>

      <button
        onClick={() => handleCall("video")}
        disabled={disabled}
        title={title ?? "Video call"}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading === "video" ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Video className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
