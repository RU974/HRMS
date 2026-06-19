import { useState } from "react";
import { Phone, Video } from "lucide-react";
import { ChatConversation } from "@/services/chat-service";
import { initiateCall } from "@/services/call-service";
import { useCallContext } from "./CallProvider";

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

  if (participantIds.length === 0) return null;

  async function handleCall(type: "audio" | "video") {
    if (loading || activeCall) return;
    setLoading(type);
    try {
      const call = await initiateCall({
        conversation_id: conversation.id,
        participant_ids: participantIds,
        type,
      });
      startCall(call, true);
    } catch {
      // ignore — could show toast here
    } finally {
      setLoading(null);
    }
  }

  const disabled = !!activeCall || !!loading;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleCall("audio")}
        disabled={disabled}
        title="Voice call"
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
        title="Video call"
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
