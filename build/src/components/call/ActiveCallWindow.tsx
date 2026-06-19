import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Minimize2, Maximize2 } from "lucide-react";
import { Call, endCall, getCall } from "@/services/call-service";
import { useWebRTC } from "@/hooks/use-webrtc";
import { VideoTile } from "./VideoTile";
import { stopRingtone } from "@/lib/ringtone";

interface ActiveCallWindowProps {
  call: Call;
  currentUserId: number;
  onEnded: () => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export function ActiveCallWindow({ call: initialCall, currentUserId, onEnded }: ActiveCallWindowProps) {
  const [call, setCall] = useState(initialCall);
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [statusText, setStatusText] = useState<string>(
    initialCall.status === "ringing" ? "Ringing…" : "Connecting…"
  );

  const { localStream, peerStreams, isMuted, isCameraOff, cleanup, toggleMute, toggleCamera } =
    useWebRTC({
      callId: call.id,
      localUserId: currentUserId,
      callType: call.type,
      enabled: true,
    });

  // Stop any playing ringtone as soon as we're in the active window
  useEffect(() => { stopRingtone(); }, []);

  // Timer — starts once call is active
  useEffect(() => {
    if (call.status !== "active") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [call.status]);

  // Poll call status — detect remote hang-up, update participant states
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const updated = await getCall(call.id);
        setCall(updated);

        if (updated.status === "ended" || updated.status === "missed") {
          cleanup();
          onEnded();
          return;
        }

        const joined = updated.participants.filter(
          (p) => p.user_id !== currentUserId && p.status === "joined"
        ).length;

        if (updated.status === "active" && joined > 0) {
          setStatusText(""); // connected — timer takes over
        } else if (updated.status === "ringing") {
          const anyOnline = updated.participants.some(
            (p) => p.user_id !== currentUserId && p.status === "invited"
          );
          setStatusText(anyOnline ? "Ringing…" : "Calling…");
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(id);
  }, [call.id, currentUserId, cleanup, onEnded]);

  const handleEnd = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    try {
      await endCall(call.id);
    } catch {
      // ignore
    } finally {
      cleanup();
      onEnded();
    }
  }, [call.id, cleanup, ending, onEnded]);

  const callName =
    call.participants.find((p) => p.user_id !== currentUserId)?.user.name ??
    (call.call_type === "group" ? "Group Call" : "Call");

  const displayStatus = call.status === "active" && peerStreams.length > 0
    ? formatDuration(elapsed)
    : statusText || formatDuration(elapsed);

  // ── Minimized pip ──
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl">
        <div className={`h-2 w-2 rounded-full ${peerStreams.length > 0 ? "bg-green-400 animate-pulse" : "bg-yellow-400 animate-ping"}`} />
        <span className="text-sm font-medium text-white">{callName}</span>
        <span className="min-w-[3rem] text-center text-xs text-gray-400">{displayStatus}</span>
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
    );
  }

  // ── Full screen ──
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-white">{callName}</p>
          <p className="text-sm text-gray-400">{displayStatus}</p>
        </div>
        <button
          onClick={() => setMinimized(true)}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 items-center justify-center gap-4 overflow-hidden px-6">
        {peerStreams.length === 0 ? (
          /* Waiting / ringing state */
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-gray-600/60" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">
                {callName.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <p className="text-gray-300">{statusText || "Connecting…"}</p>
          </div>
        ) : call.type === "video" ? (
          /* Video grid */
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
        ) : (
          /* Audio-only avatars */
          <div className="flex flex-wrap justify-center gap-8">
            {call.participants
              .filter((p) => p.user_id !== currentUserId && p.status === "joined")
              .map((p) => (
                <div key={p.user_id} className="flex flex-col items-center gap-3">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-xl font-bold text-white">
                    {p.user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm text-gray-300">{p.user.name}</p>
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Local video PiP */}
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
