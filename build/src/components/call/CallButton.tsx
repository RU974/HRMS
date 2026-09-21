import { useEffect, useRef, useState } from "react";
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

type CallKind = "audio" | "video";

export function CallButton({ conversation, currentUserId }: CallButtonProps) {
  const { activeCall, incomingCall, startCall, config } = useCallContext();
  const [loading, setLoading] = useState<CallKind | null>(null);
  /** Set while the "who do you want to call?" picker is open. */
  const [picking, setPicking] = useState<CallKind | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const others = conversation.participants.filter((p) => p.id !== currentUserId);

  // Calls are peer-to-peer, so the server caps how many people can be on one.
  const maxInvitees = Math.max(1, config.max_participants - 1);
  const noParticipants = others.length === 0;
  // A big group chat cannot all join one call, so let the caller choose who to ring.
  const needsPicker = others.length > maxInvitees;
  const inCall = !!activeCall || !!incomingCall;
  const busy = inCall || !!loading;

  // Switching conversation, or being pulled into a call, closes the picker.
  useEffect(() => {
    setPicking(null);
    setSelected([]);
  }, [conversation.id, inCall]);

  useEffect(() => {
    if (!picking) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPicking(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking]);

  async function place(type: CallKind, participantIds: number[]) {
    if (busy || participantIds.length === 0) return;
    setLoading(type);
    try {
      const call = await initiateCall({
        conversation_id: conversation.id,
        participant_ids: participantIds,
        type,
      });
      // Play outgoing ringback so the caller knows it's ringing
      startRingtone().catch(() => {});
      setPicking(null);
      startCall(call);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again in a moment.";
      toast.error("Could not start call", message);
    } finally {
      setLoading(null);
    }
  }

  function handleClick(type: CallKind) {
    if (busy || noParticipants) return;
    if (needsPicker) {
      setSelected([]);
      setPicking((current) => (current === type ? null : type));
      return;
    }
    void place(
      type,
      others.map((p) => p.id)
    );
  }

  function toggleSelected(id: number) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      return current.length >= maxInvitees ? current : [...current, id];
    });
  }

  const blockedReason = noParticipants
    ? "No one to call in this conversation"
    : incomingCall
    ? "You have an incoming call"
    : activeCall
    ? "You are already on a call"
    : undefined;

  const disabled = busy || noParticipants;
  const buttonClass =
    "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40";
  const spinner = <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleClick("audio")}
        disabled={disabled}
        aria-label="Start voice call"
        aria-haspopup={needsPicker ? "dialog" : undefined}
        aria-expanded={needsPicker ? picking === "audio" : undefined}
        title={blockedReason ?? "Voice call"}
        className={buttonClass}
      >
        {loading === "audio" ? spinner : <Phone className="h-4 w-4" />}
      </button>

      {config.video_enabled && (
        <button
          type="button"
          onClick={() => handleClick("video")}
          disabled={disabled}
          aria-label="Start video call"
          aria-haspopup={needsPicker ? "dialog" : undefined}
          aria-expanded={needsPicker ? picking === "video" : undefined}
          title={blockedReason ?? "Video call"}
          className={buttonClass}
        >
          {loading === "video" ? spinner : <Video className="h-4 w-4" />}
        </button>
      )}

      {picking && (
        <div
          role="dialog"
          aria-label={`Choose who to ${picking === "video" ? "video" : "voice"} call`}
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl"
        >
          <p className="text-sm font-semibold text-[var(--text)]">Who do you want to call?</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Calls hold up to {config.max_participants} people including you. Pick up to {maxInvitees}.
          </p>

          <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            {others.map((p) => {
              const checked = selected.includes(p.id);
              const full = !checked && selected.length >= maxInvitees;
              return (
                <li key={p.id}>
                  <label
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--hover)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={full}
                      onChange={() => toggleSelected(p.id)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[var(--text)]">{p.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => void place(picking, selected)}
            disabled={selected.length === 0 || !!loading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {picking === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            {selected.length === 0
              ? "Select people to call"
              : `Call ${selected.length} ${selected.length === 1 ? "person" : "people"}`}
          </button>
        </div>
      )}
    </div>
  );
}
