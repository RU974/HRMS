import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Minimize2,
  Maximize2,
  RefreshCw,
  ScreenShare,
  ScreenShareOff,
  Users,
  UserPlus,
  UserMinus,
  X,
} from "lucide-react";
import { Call, endCall, addCallParticipant, removeCallParticipant, muteCallParticipant } from "@/services/call-service";
import { listConversations } from "@/services/chat-service";
import { useWebRTC, PeerStream } from "@/hooks/use-webrtc";
import { VideoTile } from "./VideoTile";
import { stopRingtone } from "@/lib/ringtone";
import { toast } from "@/components/notifications/toast";
import { echo } from "@/lib/echo";

interface ActiveCallWindowProps {
  call: Call;
  currentUserId: number;
  onEnded: () => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Renders a hidden <audio> element that plays a remote peer's audio stream. */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    // Chrome may block autoplay — try resuming on first user interaction
    const play = () => el.play().catch(() => {});
    el.play().catch(() => {
      document.addEventListener("click", play, { once: true });
    });
    return () => {
      document.removeEventListener("click", play);
      el.srcObject = null;
    };
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

export function ActiveCallWindow({ call: initialCall, currentUserId, onEnded }: ActiveCallWindowProps) {
  const [call, setCall] = useState<Call>(initialCall);
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "failed">("connecting");
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantActionId, setParticipantActionId] = useState<number | null>(null);

  const isHost = call.initiated_by === currentUserId;

  // Refs so Echo listeners always read current values without re-subscribing
  const cleanupRef = useRef<() => void>(() => {});
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const isMutedRef = useRef(false);
  const toggleMuteRef = useRef<() => void>(() => {});

  // Derive joined participant IDs from call state — passed to useWebRTC so it
  // can create peer connections reactively instead of polling /calls/{id}.
  const joinedParticipantIds = call.participants
    .filter((p) => p.user_id !== currentUserId && p.status === "joined")
    .map((p) => p.user_id);

  const webrtc = useWebRTC({
    callId: call.id,
    localUserId: currentUserId,
    callType: call.type,
    enabled: true,
    joinedParticipantIds,
    onPeerConnected: () => setConnectionStatus("connected"),
    onPeerFailed: () => setConnectionStatus("failed"),
  });

  const {
    localStream,
    peerStreams,
    isMuted,
    isCameraOff,
    isScreenSharing,
    peerQuality,
    cleanup,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    reconnectAllFailed,
  } = webrtc;
  cleanupRef.current = cleanup;
  isMutedRef.current = isMuted;
  toggleMuteRef.current = toggleMute;

  // Candidates for "add participant": other members of the same chat
  // conversation who aren't already invited/joined/on-the-call.
  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => listConversations(),
    enabled: isHost && showParticipants && !!call.conversation_id,
  });

  const addableUsers = useMemo(() => {
    if (!call.conversation_id || !conversationsQuery.data) return [];
    const conversation = conversationsQuery.data.find((c) => c.id === call.conversation_id);
    if (!conversation) return [];
    const currentIds = new Set(call.participants.map((p) => p.user_id));
    currentIds.add(currentUserId);
    return conversation.participants.filter((p) => !currentIds.has(p.id));
  }, [conversationsQuery.data, call.conversation_id, call.participants, currentUserId]);

  const handleAddParticipant = useCallback(
    async (userId: number) => {
      setParticipantActionId(userId);
      try {
        const updated = await addCallParticipant(call.id, userId);
        setCall(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Please try again.";
        toast.error("Could not add participant", message);
      } finally {
        setParticipantActionId(null);
      }
    },
    [call.id]
  );

  const handleRemoveParticipant = useCallback(
    async (userId: number) => {
      setParticipantActionId(userId);
      try {
        const updated = await removeCallParticipant(call.id, userId);
        setCall(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Please try again.";
        toast.error("Could not remove participant", message);
      } finally {
        setParticipantActionId(null);
      }
    },
    [call.id]
  );

  const handleMuteParticipant = useCallback(
    async (userId: number) => {
      setParticipantActionId(userId);
      try {
        await muteCallParticipant(call.id, userId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Please try again.";
        toast.error("Could not mute participant", message);
      } finally {
        setParticipantActionId(null);
      }
    },
    [call.id]
  );

  const handleReconnect = useCallback(() => {
    setConnectionStatus("connecting");
    reconnectAllFailed();
  }, [reconnectAllFailed]);

  // Stop any playing ringtone the moment we enter the call window
  useEffect(() => { stopRingtone(); }, []);

  // Mark connected once we receive any remote stream
  useEffect(() => {
    if (peerStreams.length > 0) setConnectionStatus("connected");
  }, [peerStreams.length]);

  // Count-up timer (only when call is active)
  useEffect(() => {
    if (call.status !== "active") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [call.status]);

  // Real-time call state updates via WebSocket (replaces 2 s polling)
  useEffect(() => {
    const channel = echo.private(`call.${currentUserId}`);

    // Remote participant answered — update call state so the timer and UI flip to active
    channel.listen(".CallAnswered", (data: { call: Call }) => {
      if (data.call.id === call.id) {
        setCall(data.call);
      }
    });

    // Any participant (or the system) ended the call
    channel.listen(".CallEnded", (data: { call_id: number }) => {
      if (data.call_id !== call.id) return;
      cleanupRef.current();
      onEndedRef.current();
    });

    // A participant declined (group calls: others still in call; direct calls get
    // CallEnded instead, so this only fires when there are remaining participants)
    channel.listen(".CallRejected", (data: { call_id: number; rejected_by: number }) => {
      if (data.call_id !== call.id) return;
      setCall((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.user_id === data.rejected_by ? { ...p, status: "rejected" } : p
        ),
      }));
    });

    // Host asked us to mute — honor it locally (mesh calls have no
    // server-side media path to force-mute from the other end).
    channel.listen(".CallMuteRequested", (data: { call_id: number }) => {
      if (data.call_id !== call.id) return;
      if (!isMutedRef.current) {
        toggleMuteRef.current();
        toast.info("You've been muted", "The host muted your microphone.");
      }
    });

    return () => {
      channel.stopListening(".CallAnswered");
      channel.stopListening(".CallEnded");
      channel.stopListening(".CallRejected");
      channel.stopListening(".CallMuteRequested");
      // CallProvider owns the channel lifetime — only stopListening here
    };
  // call.id and currentUserId never change while the window is mounted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, currentUserId]);

  const handleEnd = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    try { await endCall(call.id); } catch { /* ignore */ }
    cleanup();
    onEnded();
  }, [call.id, cleanup, ending, onEnded]);

  const otherParticipant = call.participants.find((p) => p.user_id !== currentUserId);
  const callName =
    call.call_type === "group"
      ? `Group Call (${call.participants.length})`
      : (otherParticipant?.user.name ?? "Call");

  function statusLine() {
    if (connectionStatus === "failed") return "Connection failed";
    if (connectionStatus === "connected") return formatDuration(elapsed);
    if (call.status === "ringing") {
      const anyInvited = call.participants.some(
        (p) => p.user_id !== currentUserId && p.status === "invited"
      );
      return anyInvited ? "Ringing…" : "Calling…";
    }
    return "Connecting…";
  }

  // Worst quality across all peers — shown as a single indicator in the header.
  const overallQuality = (() => {
    const values = Array.from(peerQuality.values());
    if (values.includes("poor")) return "poor";
    if (values.includes("fair")) return "fair";
    if (values.length > 0) return "good";
    return null;
  })();

  const qualityColor = { good: "bg-green-400", fair: "bg-yellow-400", poor: "bg-red-400" };
  const qualityLabel = { good: "Good connection", fair: "Fair connection", poor: "Poor connection" };

  // ── Minimised PiP ──────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <>
        {/* Keep audio alive even when minimised */}
        {peerStreams.map((ps) => <RemoteAudio key={ps.userId} stream={ps.stream} />)}

        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl ring-1 ring-white/10">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-400 animate-pulse"
                : connectionStatus === "failed"
                ? "bg-red-400"
                : "bg-yellow-400 animate-ping"
            }`}
          />
          <span className="text-sm font-medium text-white">{callName}</span>
          <span className="min-w-[3.5rem] text-center text-xs text-gray-400">{statusLine()}</span>
          <button
            onClick={() => setMinimized(false)}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleEnd}
            className="rounded-lg bg-red-500 p-1.5 text-white transition hover:bg-red-600"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </>
    );
  }

  // ── Full-screen call window ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/*
        Hidden <audio> elements for EVERY peer stream.
        This is the primary fix: audio-only calls never had output elements.
        Video calls also need this so audio continues when a camera is turned off.
      */}
      {peerStreams.map((ps) => <RemoteAudio key={ps.userId} stream={ps.stream} />)}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-white">{callName}</p>
          <p className={`flex items-center gap-1.5 text-sm ${connectionStatus === "failed" ? "text-red-400" : "text-gray-400"}`}>
            {statusLine()}
            {connectionStatus === "connected" && overallQuality && (
              <span
                className={`inline-block h-2 w-2 rounded-full ${qualityColor[overallQuality]}`}
                title={qualityLabel[overallQuality]}
              />
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticipants((v) => !v)}
            className={`rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white ${
              showParticipants ? "bg-white/10 text-white" : ""
            }`}
            title="Participants"
          >
            <Users className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6">
        {call.type === "video" ? (
          <VideoContent peerStreams={peerStreams} call={call} currentUserId={currentUserId} connectionStatus={connectionStatus} />
        ) : (
          <AudioContent peerStreams={peerStreams} call={call} currentUserId={currentUserId} connectionStatus={connectionStatus} />
        )}

        {showParticipants && (
          <ParticipantsPanel
            call={call}
            currentUserId={currentUserId}
            isHost={isHost}
            addableUsers={addableUsers}
            actionInFlightId={participantActionId}
            onClose={() => setShowParticipants(false)}
            onAdd={handleAddParticipant}
            onRemove={handleRemoveParticipant}
            onMute={handleMuteParticipant}
          />
        )}
      </div>

      {/* Local video PiP (video calls only) */}
      {call.type === "video" && localStream && (
        <div className="absolute bottom-28 right-6">
          <VideoTile stream={localStream} name="You" muted noVideo={isCameraOff} isLocal size="sm" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-5 pb-8 pt-4">
        {connectionStatus === "failed" && (
          <button
            onClick={handleReconnect}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500 text-white transition hover:bg-yellow-600"
            title="Reconnect"
          >
            <RefreshCw className="h-6 w-6" />
          </button>
        )}

        <button
          onClick={toggleMute}
          className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
            isMuted ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-700 text-white hover:bg-gray-600"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        {call.type === "video" && (
          <button
            onClick={toggleCamera}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              isCameraOff ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
            title={isCameraOff ? "Turn on camera" : "Turn off camera"}
          >
            {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        )}

        {call.type === "video" && (
          <button
            onClick={toggleScreenShare}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              isScreenSharing ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
            title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          >
            {isScreenSharing ? <ScreenShareOff className="h-6 w-6" /> : <ScreenShare className="h-6 w-6" />}
          </button>
        )}

        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600 disabled:opacity-60"
          title="End call"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ParticipantsPanel({
  call,
  currentUserId,
  isHost,
  addableUsers,
  actionInFlightId,
  onClose,
  onAdd,
  onRemove,
  onMute,
}: {
  call: Call;
  currentUserId: number;
  isHost: boolean;
  addableUsers: { id: number; name: string; email: string }[];
  actionInFlightId: number | null;
  onClose: () => void;
  onAdd: (userId: number) => void;
  onRemove: (userId: number) => void;
  onMute: (userId: number) => void;
}) {
  const others = call.participants.filter((p) => p.user_id !== currentUserId);

  return (
    <div className="absolute right-0 top-0 flex h-full w-72 flex-col border-l border-white/10 bg-gray-900/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold text-white">Participants ({call.participants.length})</p>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isHost && addableUsers.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Add to call</p>
            <div className="space-y-1">
              {addableUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <span className="truncate text-sm text-gray-200">{u.name}</span>
                  <button
                    onClick={() => onAdd(u.id)}
                    disabled={actionInFlightId === u.id}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    title="Add to call"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">On this call</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <span className="truncate text-sm text-gray-200">You{isHost ? " (Host)" : ""}</span>
          </div>
          {others.map((p) => (
            <div key={p.user_id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-200">
                  {p.user.name}
                  {call.initiated_by === p.user_id ? " (Host)" : ""}
                </p>
                <p className="text-xs text-gray-500 capitalize">{p.status}</p>
              </div>
              {isHost && (p.status === "invited" || p.status === "joined") && (
                <div className="flex shrink-0 items-center gap-1">
                  {p.status === "joined" && (
                    <button
                      onClick={() => onMute(p.user_id)}
                      disabled={actionInFlightId === p.user_id}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-white transition hover:bg-gray-600 disabled:opacity-50"
                      title="Mute participant"
                    >
                      <MicOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(p.user_id)}
                    disabled={actionInFlightId === p.user_id}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-500 disabled:opacity-50"
                    title="Remove from call"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WaitingAvatar({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-full bg-gray-600/40" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">
          {name.slice(0, 2).toUpperCase()}
        </div>
      </div>
      <p className="text-gray-400">{status}</p>
    </div>
  );
}

function AudioContent({
  peerStreams,
  call,
  currentUserId,
  connectionStatus,
}: {
  peerStreams: PeerStream[];
  call: Call;
  currentUserId: number;
  connectionStatus: "connecting" | "connected" | "failed";
}) {
  const joinedParticipants = call.participants.filter(
    (p) => p.user_id !== currentUserId && (p.status === "joined" || p.status === "invited")
  );

  if (connectionStatus !== "connected" || peerStreams.length === 0) {
    const name = joinedParticipants[0]?.user.name ?? "...";
    const label =
      connectionStatus === "failed"
        ? "Connection failed — check your network"
        : call.status === "ringing"
        ? "Ringing…"
        : "Connecting…";
    return <WaitingAvatar name={name} status={label} />;
  }

  return (
    <div className="flex flex-wrap justify-center gap-10">
      {joinedParticipants.map((p) => {
        const hasStream = peerStreams.some((ps) => ps.userId === p.user_id);
        return (
          <div key={p.user_id} className="flex flex-col items-center gap-3">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">
              {p.user.name.slice(0, 2).toUpperCase()}
              {hasStream && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 ring-2 ring-gray-950">
                  <Mic className="h-2.5 w-2.5 text-white" />
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-200">{p.user.name}</p>
          </div>
        );
      })}
    </div>
  );
}

function VideoContent({
  peerStreams,
  call,
  currentUserId,
  connectionStatus,
}: {
  peerStreams: PeerStream[];
  call: Call;
  currentUserId: number;
  connectionStatus: "connecting" | "connected" | "failed";
}) {
  if (peerStreams.length === 0) {
    const name =
      call.participants.find((p) => p.user_id !== currentUserId)?.user.name ?? "...";
    const label =
      connectionStatus === "failed"
        ? "Connection failed"
        : call.status === "ringing"
        ? "Ringing…"
        : "Connecting…";
    return <WaitingAvatar name={name} status={label} />;
  }

  return (
    <div
      className={`grid h-full w-full gap-3 ${
        peerStreams.length === 1 ? "grid-cols-1" : "grid-cols-2"
      }`}
    >
      {peerStreams.map((ps) => {
        const p = call.participants.find((x) => x.user_id === ps.userId);
        return (
          <VideoTile
            key={ps.userId}
            stream={ps.stream}
            name={p?.user.name ?? String(ps.userId)}
            size="lg"
          />
        );
      })}
    </div>
  );
}
