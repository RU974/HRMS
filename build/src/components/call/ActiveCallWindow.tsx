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
import {
  Call,
  CallConfig,
  CallMediaState,
  endCall,
  getCall,
  addCallParticipant,
  removeCallParticipant,
  muteCallParticipant,
  sendHeartbeat,
  sendMediaState,
  getCallConfig,
  leaveCallOnUnload,
} from "@/services/call-service";
import { listConversations } from "@/services/chat-service";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useActiveSpeaker } from "@/hooks/use-active-speaker";
import { callEvents } from "@/lib/call-events";
import { VideoTile } from "./VideoTile";
import { DeviceSettings } from "./DeviceSettings";
import { stopRingtone } from "@/lib/ringtone";
import { toast } from "@/components/notifications/toast";

interface ActiveCallWindowProps {
  call: Call;
  currentUserId: number;
  config: CallConfig;
  onEnded: () => void;
}

type ConnectionStatus = "connecting" | "connected" | "failed";

const OUTPUT_STORAGE_KEY = "call.audioOutput";

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
}

function readOutput(): string | null {
  try {
    return localStorage.getItem(OUTPUT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Plays one remote peer's audio. The only place remote audio is rendered. */
function RemoteAudio({ stream, sinkId }: { stream: MediaStream; sinkId: string | null }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;

    // Autoplay can be blocked until the user interacts with the page.
    const resume = () => el.play().catch(() => {});
    el.play().catch(() => document.addEventListener("click", resume, { once: true }));

    return () => {
      document.removeEventListener("click", resume);
      el.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && sinkId) el.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

export function ActiveCallWindow({ call: initialCall, currentUserId, config, onEnded }: ActiveCallWindowProps) {
  const [call, setCall] = useState<Call>(initialCall);
  const [minimized, setMinimized] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantActionId, setParticipantActionId] = useState<number | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<Record<number, CallMediaState>>({});
  const [iceServers, setIceServers] = useState<RTCIceServer[] | null>(null);
  const [audioOutput, setAudioOutput] = useState<string | null>(readOutput);

  const isHost = call.host_id === currentUserId;
  const callRef = useRef(call);
  callRef.current = call;
  /** Set once the local user hangs up, so the server's echo of that is not reported as "no answer". */
  const hangingUpRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // TURN credentials are short-lived, so fetch a fresh set for every call.
  useEffect(() => {
    let cancelled = false;
    getCallConfig()
      .then((c) => !cancelled && setIceServers(c.ice_servers))
      .catch(() => !cancelled && setIceServers(config.ice_servers));
    return () => {
      cancelled = true;
    };
  }, [config.ice_servers]);

  const joinedParticipantIds = useMemo(
    () => call.participants.filter((p) => p.user_id !== currentUserId && p.status === "joined").map((p) => p.user_id),
    [call.participants, currentUserId]
  );

  const webrtc = useWebRTC({
    callId: call.id,
    localUserId: currentUserId,
    callType: call.type,
    enabled: iceServers !== null,
    iceServers: iceServers ?? [],
    screenShareAllowed: config.screen_share_enabled,
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
    isReady,
    hasMic,
    hasCamera,
    canScreenShare,
    peerQuality,
    devices,
    selectedAudioInput,
    selectedVideoInput,
    cleanup,
    setMuted,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    switchDevice,
    reconnectAllFailed,
  } = webrtc;

  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  const setMutedRef = useRef(setMuted);
  setMutedRef.current = setMuted;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const closeWindow = useCallback(() => {
    cleanupRef.current();
    onEndedRef.current();
  }, []);

  // ── Server events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const offAnswered = callEvents.on("call.answered", ({ call: c }) => {
      if (c.id === callRef.current.id) setCall(c);
    });
    const offUpdated = callEvents.on("call.updated", ({ call: c }) => {
      if (c.id === callRef.current.id) setCall(c);
    });
    const offEnded = callEvents.on("call.ended", ({ call_id, reason }) => {
      if (call_id !== callRef.current.id) return;

      if (!hangingUpRef.current) {
        const current = callRef.current;
        const others = current.participants.filter((p) => p.user_id !== currentUserId);
        const who = current.call_type === "group" ? "Everyone" : (others[0]?.user.name ?? "They");

        if (reason === "declined") toast.info("Call declined", `${who} declined the call.`);
        else if (reason === "missed" && current.status === "ringing") toast.info("No answer", "Nobody picked up.");
        else if (reason === "removed") toast.info("Removed from call", "The host removed you from this call.");
      }

      closeWindow();
    });
    const offRejected = callEvents.on("call.rejected", ({ call_id, rejected_by }) => {
      if (call_id !== callRef.current.id) return;
      setCall((prev) => ({
        ...prev,
        participants: prev.participants.map((p) => (p.user_id === rejected_by ? { ...p, status: "rejected" } : p)),
      }));
    });
    // Host asked us to mute. A mesh call has no server-side media path to force
    // it, so our own client honours the request.
    const offMute = callEvents.on("call.mute_requested", ({ call_id }) => {
      if (call_id !== callRef.current.id || isMutedRef.current) return;
      void setMutedRef.current(true);
      toast.info("You've been muted", "The host muted your microphone.");
    });
    const offMedia = callEvents.on("call.media_state", ({ call_id, user_id, muted, camera_off, screen_sharing }) => {
      if (call_id !== callRef.current.id) return;
      setRemoteMedia((prev) => ({ ...prev, [user_id]: { muted, camera_off, screen_sharing } }));
    });
    // Websocket dropped and came back: we may have missed events, so re-read the call.
    const offRestored = callEvents.on("connection.restored", () => {
      getCall(callRef.current.id)
        .then((fresh) => {
          if (fresh.status === "ended" || fresh.status === "missed" || fresh.status === "declined") closeWindow();
          else setCall(fresh);
        })
        .catch(() => {});
    });

    return () => {
      offAnswered();
      offUpdated();
      offEnded();
      offRejected();
      offMute();
      offMedia();
      offRestored();
    };
  }, [closeWindow, currentUserId]);

  // ── Heartbeat: lets the server detect a dead client and tells us if we were dropped ──
  useEffect(() => {
    let stopped = false;

    const beat = () => {
      sendHeartbeat(callRef.current.id)
        .then((res) => {
          if (stopped) return;
          const over = res.call_status !== "ringing" && res.call_status !== "active";
          if (over || res.participant_status !== "joined") {
            toast.info("Call ended", over ? "The call has ended." : "You are no longer in this call.");
            closeWindow();
          }
        })
        .catch(() => {
          /* transient network error — the next beat retries; the server times us out after ~1 min of silence */
        });
    };

    beat();
    const id = window.setInterval(beat, Math.max(5, config.heartbeat_interval_seconds) * 1000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [config.heartbeat_interval_seconds, closeWindow]);

  // Closing or reloading the tab must not leave everyone else in a dead call.
  useEffect(() => {
    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) leaveCallOnUnload(callRef.current.id);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // ── Tell peers our real mic / camera / screen state ───────────────────────
  const joinedKey = joinedParticipantIds.join(",");
  useEffect(() => {
    if (!isReady) return;
    const id = window.setTimeout(() => {
      sendMediaState(call.id, {
        muted: isMuted || !hasMic,
        camera_off: isCameraOff || !hasCamera,
        screen_sharing: isScreenSharing,
      }).catch(() => {});
    }, 150);
    // Re-send when the roster changes so a newcomer learns our current state.
    return () => window.clearTimeout(id);
  }, [call.id, isReady, isMuted, isCameraOff, isScreenSharing, hasMic, hasCamera, joinedKey]);

  // Caller's ringback stops the moment the call is answered.
  useEffect(() => {
    if (call.status !== "ringing") stopRingtone();
  }, [call.status]);
  useEffect(() => () => stopRingtone(), []);

  // Timer, derived from the server's start time so it survives re-renders/reconnects.
  useEffect(() => {
    if (call.status !== "active") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [call.status]);

  useEffect(() => {
    if (peerStreams.length > 0) setConnectionStatus((s) => (s === "failed" ? s : "connected"));
  }, [peerStreams.length]);

  const elapsed =
    call.started_at && call.status === "active"
      ? Math.max(0, Math.floor((now - new Date(call.started_at).getTime()) / 1000))
      : 0;

  // ── Add / remove / mute participants ──────────────────────────────────────
  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => listConversations(),
    enabled: isHost && showParticipants && !!call.conversation_id,
  });

  const occupied = call.participants.filter((p) => p.status === "invited" || p.status === "joined").length;

  const addableUsers = useMemo(() => {
    if (!call.conversation_id || !conversationsQuery.data || occupied >= config.max_participants) return [];
    const conversation = conversationsQuery.data.find((c) => c.id === call.conversation_id);
    if (!conversation) return [];
    const inCall = new Set(
      call.participants.filter((p) => p.status === "invited" || p.status === "joined").map((p) => p.user_id)
    );
    inCall.add(currentUserId);
    return conversation.participants.filter((p) => !inCall.has(p.id));
  }, [conversationsQuery.data, call.conversation_id, call.participants, currentUserId, occupied, config.max_participants]);

  const runParticipantAction = useCallback(
    async (userId: number, action: () => Promise<Call | null>, failTitle: string) => {
      setParticipantActionId(userId);
      try {
        const updated = await action();
        if (updated) setCall(updated);
      } catch (err) {
        toast.error(failTitle, err instanceof Error ? err.message : "Please try again.");
      } finally {
        setParticipantActionId(null);
      }
    },
    []
  );

  const handleAddParticipant = useCallback(
    (userId: number) => runParticipantAction(userId, () => addCallParticipant(call.id, userId), "Could not add participant"),
    [call.id, runParticipantAction]
  );
  const handleRemoveParticipant = useCallback(
    (userId: number) =>
      runParticipantAction(userId, () => removeCallParticipant(call.id, userId), "Could not remove participant"),
    [call.id, runParticipantAction]
  );
  const handleMuteParticipant = useCallback(
    (userId: number) =>
      runParticipantAction(
        userId,
        async () => {
          await muteCallParticipant(call.id, userId);
          return null;
        },
        "Could not mute participant"
      ),
    [call.id, runParticipantAction]
  );

  const handleReconnect = useCallback(() => {
    setConnectionStatus("connecting");
    reconnectAllFailed();
  }, [reconnectAllFailed]);

  const handleEnd = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    hangingUpRef.current = true;
    try {
      await endCall(call.id);
    } catch {
      /* already over on the server */
    }
    closeWindow();
  }, [call.id, ending, closeWindow]);

  const handleAudioOutput = useCallback((deviceId: string) => {
    setAudioOutput(deviceId);
    try {
      localStorage.setItem(OUTPUT_STORAGE_KEY, deviceId);
    } catch {
      /* not persisted */
    }
  }, []);

  // ── Derived view state ────────────────────────────────────────────────────
  const nameOf = useCallback(
    (userId: number) => call.participants.find((p) => p.user_id === userId)?.user.name ?? "Participant",
    [call.participants]
  );

  const speakerId = useActiveSpeaker([
    { id: currentUserId, stream: isMuted ? null : localStream },
    ...peerStreams.map((p) => ({ id: p.userId, stream: remoteMedia[p.userId]?.muted ? null : p.stream })),
  ]);

  const presenter = peerStreams.find((p) => p.screenStream && remoteMedia[p.userId]?.screen_sharing !== false) ?? null;

  const otherParticipant = call.participants.find((p) => p.user_id !== currentUserId);
  const callName =
    call.call_type === "group" ? `Group call (${occupied})` : (otherParticipant?.user.name ?? "Call");

  function statusLine() {
    if (connectionStatus === "failed") return "Connection failed";
    if (call.status === "ringing") {
      const anyInvited = call.participants.some((p) => p.user_id !== currentUserId && p.status === "invited");
      return anyInvited ? "Ringing…" : "Calling…";
    }
    if (connectionStatus === "connected") return formatDuration(elapsed);
    return "Connecting…";
  }

  const overallQuality = (() => {
    const values = Array.from(peerQuality.values());
    if (values.includes("poor")) return "poor" as const;
    if (values.includes("fair")) return "fair" as const;
    if (values.length > 0) return "good" as const;
    return null;
  })();
  const qualityColor = { good: "bg-green-400", fair: "bg-yellow-400", poor: "bg-red-400" };
  const qualityLabel = { good: "Good connection", fair: "Fair connection", poor: "Poor connection" };

  const audioElements = peerStreams.map((ps) => <RemoteAudio key={ps.userId} stream={ps.stream} sinkId={audioOutput} />);

  // ── Minimised ─────────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <>
        {audioElements}
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl ring-1 ring-white/10"
        >
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              connectionStatus === "connected"
                ? "animate-pulse bg-green-400"
                : connectionStatus === "failed"
                ? "bg-red-400"
                : "animate-ping bg-yellow-400"
            }`}
          />
          <span className="text-sm font-medium text-white">{callName}</span>
          <span className="min-w-[3.5rem] text-center text-xs text-gray-400">{statusLine()}</span>
          <button
            onClick={() => setMinimized(false)}
            aria-label="Restore call window"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleEnd}
            aria-label="End call"
            className="rounded-lg bg-red-500 p-1.5 text-white transition hover:bg-red-600"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </>
    );
  }

  // ── Full window ───────────────────────────────────────────────────────────
  const remoteTiles = call.participants.filter((p) => p.user_id !== currentUserId && p.status === "joined");
  const streamFor = (userId: number) => peerStreams.find((p) => p.userId === userId) ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${callName}`}
      className="fixed inset-0 z-50 flex flex-col bg-gray-950"
    >
      {audioElements}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-white">{callName}</p>
          <p
            className={`flex items-center gap-1.5 text-sm ${connectionStatus === "failed" ? "text-red-400" : "text-gray-400"}`}
            aria-live="polite"
          >
            {statusLine()}
            {connectionStatus === "connected" && overallQuality && (
              <span
                className={`inline-block h-2 w-2 rounded-full ${qualityColor[overallQuality]}`}
                title={qualityLabel[overallQuality]}
                aria-label={qualityLabel[overallQuality]}
              />
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticipants((v) => !v)}
            aria-label="Participants"
            aria-pressed={showParticipants}
            className={`rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white ${
              showParticipants ? "bg-white/10 text-white" : ""
            }`}
            title="Participants"
          >
            <Users className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMinimized(true)}
            aria-label="Minimise call window"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isScreenSharing && (
        <div className="mx-6 mb-2 flex items-center justify-between rounded-xl bg-blue-500/15 px-4 py-2 text-sm text-blue-200">
          <span>You are sharing your screen.</span>
          <button onClick={toggleScreenShare} className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-600">
            Stop sharing
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6">
        {presenter ? (
          <div className="flex h-full w-full flex-col gap-3 lg:flex-row">
            <div className="min-h-0 flex-1">
              <VideoTile stream={presenter.screenStream} name={`${nameOf(presenter.userId)} — screen`} fit="contain" />
            </div>
            <div className="flex shrink-0 gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
              {remoteTiles.map((p) => (
                <div key={p.user_id} className="h-28 w-44 shrink-0 lg:w-full">
                  <VideoTile
                    stream={streamFor(p.user_id)?.stream ?? null}
                    name={p.user.name}
                    cameraOff={call.type !== "video" || remoteMedia[p.user_id]?.camera_off}
                    micMuted={remoteMedia[p.user_id]?.muted}
                    speaking={speakerId === p.user_id}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : remoteTiles.length === 0 ? (
          <WaitingAvatar
            name={otherParticipant?.user.name ?? "…"}
            status={
              connectionStatus === "failed"
                ? "Connection failed"
                : call.status === "ringing"
                ? "Ringing…"
                : "Waiting for others to join…"
            }
          />
        ) : call.type === "video" ? (
          <VideoGrid
            tiles={remoteTiles.map((p) => ({
              userId: p.user_id,
              name: p.user.name,
              stream: streamFor(p.user_id)?.stream ?? null,
              media: remoteMedia[p.user_id],
            }))}
            speakerId={speakerId}
          />
        ) : (
          <AudioGrid
            tiles={remoteTiles.map((p) => ({
              userId: p.user_id,
              name: p.user.name,
              connected: !!streamFor(p.user_id),
              media: remoteMedia[p.user_id],
            }))}
            speakerId={speakerId}
          />
        )}

        {showParticipants && (
          <ParticipantsPanel
            call={call}
            currentUserId={currentUserId}
            isHost={isHost}
            remoteMedia={remoteMedia}
            addableUsers={addableUsers}
            actionInFlightId={participantActionId}
            onClose={() => setShowParticipants(false)}
            onAdd={handleAddParticipant}
            onRemove={handleRemoveParticipant}
            onMute={handleMuteParticipant}
          />
        )}
      </div>

      {/* Local preview (video calls only) */}
      {call.type === "video" && localStream && hasCamera && (
        <div className="absolute bottom-28 right-6">
          <VideoTile
            stream={localStream}
            name="You"
            isLocal
            cameraOff={isCameraOff}
            micMuted={isMuted || !hasMic}
            speaking={speakerId === currentUserId}
            size="sm"
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-4 px-4 pb-8 pt-4">
        {connectionStatus === "failed" && (
          <button
            onClick={handleReconnect}
            aria-label="Reconnect"
            title="Reconnect"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500 text-white transition hover:bg-yellow-600"
          >
            <RefreshCw className="h-6 w-6" />
          </button>
        )}

        <button
          onClick={toggleMute}
          aria-label={isMuted ? "Unmute" : "Mute"}
          aria-pressed={isMuted}
          title={!hasMic && isReady ? "No microphone — click to try again" : isMuted ? "Unmute" : "Mute"}
          className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
            isMuted || (!hasMic && isReady)
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-gray-700 text-white hover:bg-gray-600"
          }`}
        >
          {isMuted || (!hasMic && isReady) ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        {call.type === "video" && (
          <button
            onClick={() => void toggleCamera()}
            aria-label={isCameraOff || !hasCamera ? "Turn on camera" : "Turn off camera"}
            aria-pressed={isCameraOff || !hasCamera}
            title={!hasCamera && isReady ? "No camera — click to try again" : isCameraOff ? "Turn on camera" : "Turn off camera"}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              isCameraOff || (!hasCamera && isReady)
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
          >
            {isCameraOff || (!hasCamera && isReady) ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        )}

        {canScreenShare && (
          <button
            onClick={() => void toggleScreenShare()}
            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            aria-pressed={isScreenSharing}
            title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              isScreenSharing ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-gray-700 text-white hover:bg-gray-600"
            }`}
          >
            {isScreenSharing ? <ScreenShareOff className="h-6 w-6" /> : <ScreenShare className="h-6 w-6" />}
          </button>
        )}

        <DeviceSettings
          devices={devices}
          selectedAudioInput={selectedAudioInput}
          selectedVideoInput={selectedVideoInput}
          selectedAudioOutput={audioOutput}
          showCamera={call.type === "video"}
          onAudioInput={(id) => void switchDevice("audio", id)}
          onVideoInput={(id) => void switchDevice("video", id)}
          onAudioOutput={handleAudioOutput}
        />

        <button
          onClick={handleEnd}
          disabled={ending}
          aria-label="End call"
          title="End call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600 disabled:opacity-60"
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
  remoteMedia,
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
  remoteMedia: Record<number, CallMediaState>;
  addableUsers: { id: number; name: string; email: string }[];
  actionInFlightId: number | null;
  onClose: () => void;
  onAdd: (userId: number) => void;
  onRemove: (userId: number) => void;
  onMute: (userId: number) => void;
}) {
  const others = call.participants.filter((p) => p.user_id !== currentUserId);

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full w-72 flex-col border-l border-white/10 bg-gray-900/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold text-white">
          Participants ({call.participants.filter((p) => p.status === "invited" || p.status === "joined").length})
        </p>
        <button
          onClick={onClose}
          aria-label="Close participants"
          className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
        >
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
                    aria-label={`Add ${u.name} to call`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-50"
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
                <p className="flex items-center gap-1.5 truncate text-sm text-gray-200">
                  {p.user.name}
                  {call.host_id === p.user_id ? " (Host)" : ""}
                  {p.status === "joined" && remoteMedia[p.user_id]?.muted && (
                    <MicOff className="h-3 w-3 shrink-0 text-red-400" aria-label="Muted" />
                  )}
                </p>
                <p className="text-xs capitalize text-gray-500">{p.status === "invited" ? "ringing" : p.status}</p>
              </div>
              {isHost && (p.status === "invited" || p.status === "joined") && (
                <div className="flex shrink-0 items-center gap-1">
                  {p.status === "joined" && (
                    <button
                      onClick={() => onMute(p.user_id)}
                      disabled={actionInFlightId === p.user_id}
                      aria-label={`Ask ${p.user.name} to mute`}
                      title="Ask to mute"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-white transition hover:bg-gray-600 disabled:opacity-50"
                    >
                      <MicOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(p.user_id)}
                    disabled={actionInFlightId === p.user_id}
                    aria-label={`Remove ${p.user.name} from call`}
                    title="Remove from call"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-500 disabled:opacity-50"
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
        <span className="absolute inset-0 animate-ping rounded-full bg-gray-600/40" aria-hidden="true" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">
          {name.slice(0, 2).toUpperCase()}
        </div>
      </div>
      <p className="text-gray-400" role="status">
        {status}
      </p>
    </div>
  );
}

function AudioGrid({
  tiles,
  speakerId,
}: {
  tiles: { userId: number; name: string; connected: boolean; media?: CallMediaState }[];
  speakerId: number | null;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-10">
      {tiles.map((t) => (
        <div key={t.userId} className="flex flex-col items-center gap-3">
          <div
            className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white transition-shadow ${
              speakerId === t.userId ? "ring-4 ring-green-400" : ""
            } ${t.connected ? "" : "opacity-60"}`}
          >
            {t.name.slice(0, 2).toUpperCase()}
            <span
              className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-gray-950 ${
                t.media?.muted ? "bg-red-500" : t.connected ? "bg-green-500" : "bg-gray-500"
              }`}
            >
              {t.media?.muted ? <MicOff className="h-3 w-3 text-white" /> : <Mic className="h-3 w-3 text-white" />}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-200">{t.name}</p>
          {!t.connected && <p className="text-xs text-gray-500">Connecting…</p>}
        </div>
      ))}
    </div>
  );
}

function VideoGrid({
  tiles,
  speakerId,
}: {
  tiles: { userId: number; name: string; stream: MediaStream | null; media?: CallMediaState }[];
  speakerId: number | null;
}) {
  const cols = tiles.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";
  return (
    <div className={`grid h-full w-full gap-3 ${cols} ${tiles.length > 2 ? "auto-rows-fr" : ""}`}>
      {tiles.map((t) => (
        <VideoTile
          key={t.userId}
          stream={t.stream}
          name={t.name}
          cameraOff={t.media?.camera_off}
          micMuted={t.media?.muted}
          speaking={speakerId === t.userId}
        />
      ))}
    </div>
  );
}

