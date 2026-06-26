import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Minimize2, Maximize2 } from "lucide-react";
import { Call, endCall } from "@/services/call-service";
import { useWebRTC, PeerStream } from "@/hooks/use-webrtc";
import { VideoTile } from "./VideoTile";
import { stopRingtone } from "@/lib/ringtone";
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

  // Refs so Echo listeners always read current values without re-subscribing
  const cleanupRef = useRef<() => void>(() => {});
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

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

  const { localStream, peerStreams, isMuted, isCameraOff, cleanup, toggleMute, toggleCamera } = webrtc;
  cleanupRef.current = cleanup;

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

    return () => {
      channel.stopListening(".CallAnswered");
      channel.stopListening(".CallEnded");
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
          <p className={`text-sm ${connectionStatus === "failed" ? "text-red-400" : "text-gray-400"}`}>
            {statusLine()}
          </p>
        </div>
        <button
          onClick={() => setMinimized(true)}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-6">
        {call.type === "video" ? (
          <VideoContent peerStreams={peerStreams} call={call} currentUserId={currentUserId} connectionStatus={connectionStatus} />
        ) : (
          <AudioContent peerStreams={peerStreams} call={call} currentUserId={currentUserId} connectionStatus={connectionStatus} />
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
