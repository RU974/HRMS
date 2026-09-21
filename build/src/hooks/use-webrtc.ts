import { useCallback, useEffect, useRef, useState } from "react";
import { sendSignal, getSignals, CallSignal } from "@/services/call-service";
import { callEvents } from "@/lib/call-events";
import { toast } from "@/components/notifications/toast";

/**
 * Peer-to-peer (full mesh) WebRTC for a single call.
 *
 * Negotiation follows the "perfect negotiation" pattern: either side may
 * (re)negotiate at any time — when tracks are added (screen share), removed,
 * or ICE needs a restart — and offer collisions ("glare") are resolved
 * deterministically. The peer with the LOWER user id is "polite": it yields on
 * collision.
 */

export type ConnectionQuality = "good" | "fair" | "poor";

export interface PeerStream {
  userId: number;
  /** Microphone (+ camera) stream. */
  stream: MediaStream;
  /** Shared screen, when that peer is presenting. */
  screenStream: MediaStream | null;
  /**
   * Bumps whenever the peer's tracks change. A MediaStream keeps its identity
   * when a track is added or removed (a camera switched on mid-call), so React
   * needs this to know the tiles must be re-evaluated.
   */
  revision: number;
}

export interface DeviceLists {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
}

interface UseWebRTCOptions {
  callId: number | null;
  localUserId: number;
  callType: "audio" | "video";
  enabled: boolean;
  iceServers: RTCIceServer[];
  screenShareAllowed: boolean;
  /** Remote participants currently joined — driven by the server roster. */
  joinedParticipantIds: number[];
  onPeerConnected?: () => void;
  onPeerFailed?: () => void;
}

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
  streams: Map<string, MediaStream>;
  mainStreamId: string | null;
  screenSender: RTCRtpSender | null;
  iceRestarts: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  failureReported: boolean;
}

const MAX_AUTO_ICE_RESTARTS = 2;
const DISCONNECT_GRACE_MS = 4000;
/**
 * Signals normally arrive over the websocket. This HTTP poll is the backstop for
 * one that was lost (websocket blip, an event the realtime server refused), so a
 * call never stalls on a missing offer or answer.
 */
const SIGNAL_POLL_MS = 4000;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

const STORAGE_KEYS = { audioInput: "call.audioInput", videoInput: "call.videoInput" } as const;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable — selection just will not persist */
  }
}

/**
 * Send `track` to a peer: reuse an idle transceiver of the same kind (which
 * left the connection receive-only because we had no device at join time), or
 * add a new one. Either path triggers renegotiation.
 */
function attachTrackToPeer(peer: Peer, track: MediaStreamTrack, stream: MediaStream) {
  const idle = peer.pc
    .getTransceivers()
    .find(
      (t) =>
        t.receiver.track.kind === track.kind &&
        t.sender.track === null &&
        t.sender !== peer.screenSender &&
        t.currentDirection !== "stopped"
    );

  if (idle) {
    idle.direction = "sendrecv";
    void idle.sender.replaceTrack(track);
    try {
      idle.sender.setStreams(stream);
    } catch {
      /* older browsers: the far end still receives the track */
    }
  } else {
    peer.pc.addTrack(track, stream);
  }
}

function describeMediaError(err: unknown, wantsVideo: boolean): { title: string; body: string } {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      title: wantsVideo ? "Camera & microphone blocked" : "Microphone blocked",
      body: "Allow access in your browser's site settings, then rejoin the call.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      title: wantsVideo ? "No camera or microphone found" : "No microphone found",
      body: "Check that your device is connected and not disabled.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      title: "Media device unavailable",
      body: "Your camera or microphone is already in use by another application.",
    };
  }
  return { title: "Could not access media devices", body: "Your audio/video will not be sent." };
}

export function useWebRTC({
  callId,
  localUserId,
  callType,
  enabled,
  iceServers,
  screenShareAllowed,
  joinedParticipantIds,
  onPeerConnected,
  onPeerFailed,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [peerQuality, setPeerQuality] = useState<Map<number, ConnectionQuality>>(new Map());
  const [devices, setDevices] = useState<DeviceLists>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedAudioInput, setSelectedAudioInput] = useState<string | null>(() => readStored(STORAGE_KEYS.audioInput));
  const [selectedVideoInput, setSelectedVideoInput] = useState<string | null>(() => readStored(STORAGE_KEYS.videoInput));

  const peers = useRef<Map<number, Peer>>(new Map());
  const lastStats = useRef<Map<number, { packetsLost: number; packetsReceived: number }>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const seenSignalIds = useRef<Set<number>>(new Set());
  const signalChain = useRef<Promise<void>>(Promise.resolve());
  const readyGate = useRef<{ promise: Promise<void>; resolve: () => void }>(createGate());
  const prevJoined = useRef<Set<number>>(new Set());
  const revisionCounter = useRef(0);
  const isCameraOffRef = useRef(false);
  const selectedAudioRef = useRef<string | null>(null);
  const selectedVideoRef = useRef<string | null>(null);

  // Latest values for use inside long-lived callbacks without re-creating peers.
  const callIdRef = useRef(callId);
  const iceServersRef = useRef(iceServers);
  const onPeerConnectedRef = useRef(onPeerConnected);
  const onPeerFailedRef = useRef(onPeerFailed);
  const callTypeRef = useRef(callType);
  callIdRef.current = callId;
  iceServersRef.current = iceServers;
  onPeerConnectedRef.current = onPeerConnected;
  onPeerFailedRef.current = onPeerFailed;
  callTypeRef.current = callType;
  isCameraOffRef.current = isCameraOff;
  selectedAudioRef.current = selectedAudioInput;
  selectedVideoRef.current = selectedVideoInput;

  const canScreenShare =
    screenShareAllowed && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const isScreenSharing = screenStream !== null;

  // ── Publishing remote streams to React state ───────────────────────────────

  const publishPeer = useCallback((remoteId: number) => {
    const peer = peers.current.get(remoteId);

    setPeerStreams((prev) => {
      const others = prev.filter((p) => p.userId !== remoteId);
      if (!peer || !peer.mainStreamId) return others;

      const main = peer.streams.get(peer.mainStreamId);
      if (!main) return others;

      // Newest non-main stream that still carries a live video track is the screen.
      let screen: MediaStream | null = null;
      for (const [id, stream] of peer.streams) {
        if (id === peer.mainStreamId) continue;
        if (stream.getVideoTracks().some((t) => t.readyState === "live")) screen = stream;
      }

      revisionCounter.current += 1;
      return [...others, { userId: remoteId, stream: main, screenStream: screen, revision: revisionCounter.current }];
    });
  }, []);

  // ── Bandwidth: a full mesh multiplies upload cost by the number of peers ───

  const applyBitrates = useCallback(() => {
    const count = Math.max(1, peers.current.size);
    const cameraBitrate = Math.floor(1_500_000 / count);
    const screenBitrate = Math.floor(2_000_000 / count);

    peers.current.forEach((peer) => {
      peer.pc.getSenders().forEach((sender) => {
        if (sender.track?.kind !== "video") return;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) return;
        params.encodings[0].maxBitrate = sender === peer.screenSender ? screenBitrate : cameraBitrate;
        sender.setParameters(params).catch(() => {});
      });
    });
  }, []);

  // ── Peer connection lifecycle ──────────────────────────────────────────────

  const closePeer = useCallback(
    (remoteId: number) => {
      const peer = peers.current.get(remoteId);
      if (!peer) return;
      if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.onnegotiationneeded = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
      peers.current.delete(remoteId);
      lastStats.current.delete(remoteId);
      publishPeer(remoteId);
      applyBitrates();
    },
    [publishPeer, applyBitrates]
  );

  const getOrCreatePeer = useCallback(
    (remoteId: number): Peer => {
      const existing = peers.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const peer: Peer = {
        pc,
        polite: localUserId < remoteId,
        makingOffer: false,
        ignoreOffer: false,
        pendingIce: [],
        streams: new Map(),
        mainStreamId: null,
        screenSender: null,
        iceRestarts: 0,
        disconnectTimer: null,
        failureReported: false,
      };

      pc.onicecandidate = (e) => {
        const id = callIdRef.current;
        if (!e.candidate || !id) return;
        sendSignal(id, {
          to_user_id: remoteId,
          type: "ice-candidate",
          payload: e.candidate.toJSON() as Record<string, unknown>,
        }).catch(() => {});
      };

      pc.onnegotiationneeded = async () => {
        const id = callIdRef.current;
        if (!id) return;
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          const description = pc.localDescription;
          if (description) {
            await sendSignal(id, {
              to_user_id: remoteId,
              type: description.type === "answer" ? "answer" : "offer",
              payload: { type: description.type, sdp: description.sdp ?? "" },
            });
          }
        } catch (err) {
          console.error("[webrtc] negotiation failed with", remoteId, err);
        } finally {
          peer.makingOffer = false;
        }
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        if (!peer.streams.has(stream.id)) {
          peer.streams.set(stream.id, stream);
          stream.addEventListener("addtrack", () => publishPeer(remoteId));
          stream.addEventListener("removetrack", () => publishPeer(remoteId));
        }
        // The first stream a peer sends is their mic/camera; later ones are screens.
        if (!peer.mainStreamId) peer.mainStreamId = stream.id;
        e.track.addEventListener("ended", () => publishPeer(remoteId));
        publishPeer(remoteId);
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;

        if (state === "connected") {
          if (peer.disconnectTimer) {
            clearTimeout(peer.disconnectTimer);
            peer.disconnectTimer = null;
          }
          peer.iceRestarts = 0;
          peer.failureReported = false;
          onPeerConnectedRef.current?.();
          applyBitrates();
        } else if (state === "disconnected") {
          // Often transient (wifi blip). Give it a moment, then restart ICE.
          if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
          peer.disconnectTimer = setTimeout(() => {
            if (pc.connectionState === "disconnected") pc.restartIce();
          }, DISCONNECT_GRACE_MS);
        } else if (state === "failed") {
          if (peer.iceRestarts < MAX_AUTO_ICE_RESTARTS) {
            peer.iceRestarts += 1;
            pc.restartIce();
          } else if (!peer.failureReported) {
            peer.failureReported = true;
            onPeerFailedRef.current?.();
            toast.error(
              "Connection failed",
              "Could not connect to a participant. Your network may block direct connections — ask your administrator to enable the TURN relay."
            );
          }
        }
      };

      // Send our media. Main stream first so the far end classifies it as camera/mic.
      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) pc.addTrack(track, local);
      }
      const screen = screenStreamRef.current;
      const screenTrack = screen?.getVideoTracks()[0];
      if (screen && screenTrack) peer.screenSender = pc.addTrack(screenTrack, screen);

      // Always be able to RECEIVE, even if our mic/camera is unavailable.
      const senders = pc.getSenders();
      if (!senders.some((s) => s.track?.kind === "audio")) {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }
      if (callTypeRef.current === "video" && !senders.some((s) => s.track?.kind === "video" && s !== peer.screenSender)) {
        pc.addTransceiver("video", { direction: "recvonly" });
      }

      peers.current.set(remoteId, peer);
      applyBitrates();
      return peer;
    },
    [localUserId, publishPeer, applyBitrates]
  );

  const flushPendingIce = useCallback(async (peer: Peer) => {
    const pending = peer.pendingIce;
    peer.pendingIce = [];
    for (const candidate of pending) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {
        // stale candidate from a previous negotiation — safe to drop
      }
    }
  }, []);

  // ── Signalling (perfect negotiation) ───────────────────────────────────────

  const processSignal = useCallback(
    async (signal: CallSignal) => {
      const fromId = signal.from_user_id;

      // Wait for local media so the answer we send actually includes our tracks.
      await readyGate.current.promise;

      const peer = getOrCreatePeer(fromId);
      const pc = peer.pc;

      try {
        if (signal.type === "offer" || signal.type === "answer") {
          const description = signal.payload as unknown as RTCSessionDescriptionInit;
          const collision = description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");

          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;

          await pc.setRemoteDescription(description);
          await flushPendingIce(peer);

          if (description.type === "offer") {
            await pc.setLocalDescription();
            const answer = pc.localDescription;
            const id = callIdRef.current;
            if (answer && id) {
              await sendSignal(id, {
                to_user_id: fromId,
                type: "answer",
                payload: { type: answer.type, sdp: answer.sdp ?? "" },
              });
            }
          }
        } else if (signal.type === "ice-candidate") {
          const candidate = signal.payload as unknown as RTCIceCandidateInit;
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (err) {
              // Candidates that belong to an offer we deliberately ignored are expected to fail.
              if (!peer.ignoreOffer) throw err;
            }
          } else {
            peer.pendingIce.push(candidate);
          }
        }
      } catch (err) {
        console.error("[webrtc] failed to process", signal.type, "from", fromId, err);
      }
    },
    [getOrCreatePeer, flushPendingIce]
  );

  const enqueueSignal = useCallback(
    (signal: CallSignal) => {
      if (seenSignalIds.current.has(signal.id)) return;
      seenSignalIds.current.add(signal.id);
      // Strictly sequential so an ICE candidate never overtakes its offer.
      signalChain.current = signalChain.current.then(() => processSignal(signal)).catch(() => {});
    },
    [processSignal]
  );

  // ── Local media ────────────────────────────────────────────────────────────

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audioInputs: all.filter((d) => d.kind === "audioinput"),
        videoInputs: all.filter((d) => d.kind === "videoinput"),
        audioOutputs: all.filter((d) => d.kind === "audiooutput"),
      });
    } catch {
      /* device list is a nicety */
    }
  }, []);

  const teardown = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    [...peers.current.keys()].forEach((id) => closePeer(id));
    peers.current.clear();
    lastStats.current.clear();
    seenSignalIds.current.clear();
    prevJoined.current = new Set();
    signalChain.current = Promise.resolve();
    readyGate.current = createGate();
    setLocalStream(null);
    setScreenStream(null);
    setPeerStreams([]);
    setIsReady(false);
    setHasMic(false);
    setHasCamera(false);
    setPeerQuality(new Map());
  }, [closePeer]);

  // Acquire mic/camera once per call, then (and only then) open the gate that
  // lets negotiation start. Degrades gracefully: video call without a camera
  // still joins with audio; without any device it joins receive-only.
  useEffect(() => {
    if (!enabled || !callId) return;
    let cancelled = false;
    const wantsVideo = callType === "video";

    async function acquire() {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error(
          "Calls need a secure connection",
          "Your browser blocked microphone access. Open this site over HTTPS to make calls."
        );
        return null;
      }

      const audio: MediaTrackConstraints = {
        ...AUDIO_CONSTRAINTS,
        ...(selectedAudioInput ? { deviceId: { ideal: selectedAudioInput } } : {}),
      };
      const video: MediaTrackConstraints = {
        ...VIDEO_CONSTRAINTS,
        ...(selectedVideoInput ? { deviceId: { ideal: selectedVideoInput } } : {}),
      };

      try {
        return await navigator.mediaDevices.getUserMedia({ audio, video: wantsVideo ? video : false });
      } catch (firstErr) {
        if (wantsVideo) {
          // Camera missing/blocked/busy: keep the call usable with audio only.
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({ audio, video: false });
            const info = describeMediaError(firstErr, true);
            toast.info("Joined without camera", info.body);
            return audioOnly;
          } catch {
            /* fall through to the error toast below */
          }
        }
        const info = describeMediaError(firstErr, wantsVideo);
        toast.error(info.title, info.body);
        return null;
      }
    }

    acquire().then((stream) => {
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) {
        localStreamRef.current = stream;
        setLocalStream(stream);
        setHasMic(stream.getAudioTracks().length > 0);
        setHasCamera(stream.getVideoTracks().length > 0);
      }
      setIsReady(true);
      readyGate.current.resolve();
      void refreshDevices();
    });

    return () => {
      cancelled = true;
      teardown();
    };
    // Device selections apply to *new* acquisitions via setAudioInput/setVideoInput,
    // not by restarting the call, so they are intentionally not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, callId, callType, teardown, refreshDevices]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refreshDevices]);

  // ── Incoming signals: websocket, plus an HTTP catch-up ─────────────────────

  useEffect(() => {
    if (!enabled || !callId) return;

    const offSignal = callEvents.on("call.signal", ({ signal }) => {
      if (signal.call_id === callId) enqueueSignal(signal);
    });

    // Signals sent before this window mounted (the caller can offer before the
    // callee's window is up) or during a websocket gap are stored server-side.
    const catchUp = () => {
      getSignals(callId)
        .then((signals) => signals.forEach(enqueueSignal))
        .catch(() => {});
    };
    catchUp();
    const offRestored = callEvents.on("connection.restored", catchUp);
    const poll = window.setInterval(catchUp, SIGNAL_POLL_MS);

    return () => {
      offSignal();
      offRestored();
      window.clearInterval(poll);
    };
  }, [enabled, callId, enqueueSignal]);

  // ── Roster: open connections to new joiners, drop those who left ──────────

  const joinedKey = [...joinedParticipantIds].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!isReady || !callId || !enabled) return;

    const current = new Set(joinedParticipantIds);

    current.forEach((id) => {
      if (id !== localUserId) getOrCreatePeer(id);
    });

    // Only drop peers that WERE on the roster and no longer are. A peer created
    // by an early signal that our roster has not caught up with must survive.
    prevJoined.current.forEach((id) => {
      if (!current.has(id)) closePeer(id);
    });
    prevJoined.current = current;
    // joinedKey captures joinedParticipantIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, callId, enabled, localUserId, joinedKey, getOrCreatePeer, closePeer]);

  // ── Connection quality ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !enabled) return;

    const poll = async () => {
      const next = new Map<number, ConnectionQuality>();

      for (const [remoteId, peer] of peers.current) {
        if (peer.pc.connectionState !== "connected") continue;

        try {
          const report = await peer.pc.getStats();
          let rtt: number | null = null;
          let packetsLost = 0;
          let packetsReceived = 0;

          report.forEach((stat) => {
            if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.currentRoundTripTime != null) {
              rtt = stat.currentRoundTripTime as number;
            }
            if (stat.type === "inbound-rtp" && !stat.isRemote) {
              packetsLost += (stat.packetsLost as number) ?? 0;
              packetsReceived += (stat.packetsReceived as number) ?? 0;
            }
          });

          const prev = lastStats.current.get(remoteId);
          const lossDelta = prev ? Math.max(0, packetsLost - prev.packetsLost) : 0;
          const receivedDelta = prev ? Math.max(0, packetsReceived - prev.packetsReceived) : 0;
          const lossRate = receivedDelta + lossDelta > 0 ? lossDelta / (receivedDelta + lossDelta) : 0;
          lastStats.current.set(remoteId, { packetsLost, packetsReceived });

          if (rtt === null) continue;

          const rttMs = (rtt as number) * 1000;
          if (rttMs < 150 && lossRate < 0.02) next.set(remoteId, "good");
          else if (rttMs < 400 && lossRate < 0.08) next.set(remoteId, "fair");
          else next.set(remoteId, "poor");
        } catch {
          /* stats unavailable this round */
        }
      }

      setPeerQuality(next);
    };

    void poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [isReady, enabled]);

  // ── Controls ───────────────────────────────────────────────────────────────

  /** Add a fresh track of `kind` (used when it was unavailable at join time). */
  const acquireTrack = useCallback(async (kind: "audio" | "video"): Promise<MediaStreamTrack | null> => {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      const audioId = selectedAudioRef.current;
      const videoId = selectedVideoRef.current;
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "audio"
          ? { audio: { ...AUDIO_CONSTRAINTS, ...(audioId ? { deviceId: { ideal: audioId } } : {}) } }
          : { video: { ...VIDEO_CONSTRAINTS, ...(videoId ? { deviceId: { ideal: videoId } } : {}) } }
      );
      const track = stream.getTracks()[0] ?? null;
      if (!track) return null;

      const local = localStreamRef.current ?? new MediaStream();
      local.addTrack(track);
      localStreamRef.current = local;
      setLocalStream(new MediaStream(local.getTracks()));

      peers.current.forEach((peer) => attachTrackToPeer(peer, track, local));
      applyBitrates();
      return track;
    } catch (err) {
      const info = describeMediaError(err, kind === "video");
      toast.error(info.title, info.body);
      return null;
    }
  }, [applyBitrates]);

  const setMuted = useCallback(
    async (muted: boolean) => {
      let audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
      if (audioTracks.length === 0 && !muted) {
        const track = await acquireTrack("audio");
        if (!track) return;
        setHasMic(true);
        audioTracks = [track];
      }
      audioTracks.forEach((t) => (t.enabled = !muted));
      setIsMuted(muted);
    },
    [acquireTrack]
  );

  const toggleMute = useCallback(() => void setMuted(!isMuted), [setMuted, isMuted]);

  const toggleCamera = useCallback(async () => {
    const local = localStreamRef.current;
    const videoTracks = local?.getVideoTracks() ?? [];

    if (local && videoTracks.length > 0 && !isCameraOff) {
      // Release the device rather than just hiding the picture, so the camera
      // light goes out. The senders keep their slot (replaceTrack(null)), which
      // lets turning it back on swap a new track in without renegotiating.
      peers.current.forEach((peer) => {
        peer.pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === "video" && sender !== peer.screenSender) void sender.replaceTrack(null).catch(() => {});
        });
      });
      videoTracks.forEach((t) => {
        local.removeTrack(t);
        t.stop();
      });
      setLocalStream(new MediaStream(local.getTracks()));
      setIsCameraOff(true);
      return;
    }

    // Turning on: either the camera was released above, or it was never available.
    const track = await acquireTrack("video");
    if (!track) return;
    setHasCamera(true);
    setIsCameraOff(false);
  }, [acquireTrack, isCameraOff]);

  /** Swap the mic or camera to a different device, mid-call, without renegotiating. */
  const switchDevice = useCallback(
    async (kind: "audio" | "video", deviceId: string) => {
      if (!navigator.mediaDevices?.getUserMedia) return;

      // Camera is off: remember the choice for when it is turned back on.
      if (kind === "video" && isCameraOffRef.current) {
        setSelectedVideoInput(deviceId);
        writeStored(STORAGE_KEYS.videoInput, deviceId);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          kind === "audio"
            ? { audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } } }
            : { video: { ...VIDEO_CONSTRAINTS, deviceId: { exact: deviceId } } }
        );
        const track = stream.getTracks()[0];
        if (!track) return;

        const local = localStreamRef.current ?? new MediaStream();
        const old = local.getTracks().filter((t) => t.kind === kind);
        const wasDisabled = old.length > 0 && !old[0].enabled;
        old.forEach((t) => {
          local.removeTrack(t);
          t.stop();
        });
        track.enabled = !wasDisabled;
        local.addTrack(track);
        localStreamRef.current = local;
        setLocalStream(new MediaStream(local.getTracks()));

        peers.current.forEach((peer) => {
          const sender = peer.pc.getSenders().find((s) => s.track?.kind === kind && s !== peer.screenSender);
          if (sender) void sender.replaceTrack(track);
          else attachTrackToPeer(peer, track, local);
        });

        if (kind === "audio") {
          setSelectedAudioInput(deviceId);
          writeStored(STORAGE_KEYS.audioInput, deviceId);
          setHasMic(true);
        } else {
          setSelectedVideoInput(deviceId);
          writeStored(STORAGE_KEYS.videoInput, deviceId);
          setHasCamera(true);
        }
        void refreshDevices();
      } catch (err) {
        const info = describeMediaError(err, kind === "video");
        toast.error(info.title, info.body);
      }
    },
    [refreshDevices]
  );

  const stopScreenShare = useCallback(() => {
    peers.current.forEach((peer) => {
      if (peer.screenSender) {
        try {
          peer.pc.removeTrack(peer.screenSender);
        } catch {
          /* connection already closed */
        }
        peer.screenSender = null;
      }
    });
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    applyBitrates();
  }, [applyBitrates]);

  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }
    if (!canScreenShare) return;

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;

      screenStreamRef.current = display;
      // Also fires when the user clicks the browser's own "Stop sharing" bar.
      track.addEventListener("ended", () => stopScreenShare(), { once: true });

      peers.current.forEach((peer) => {
        peer.screenSender = peer.pc.addTrack(track, display);
      });
      setScreenStream(display);
      applyBitrates();
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError" && err.name !== "AbortError") {
        toast.error("Could not start screen share", "Please try again.");
      }
    }
  }, [canScreenShare, stopScreenShare, applyBitrates]);

  /** Retry connections that failed or dropped. */
  const reconnectAllFailed = useCallback(() => {
    peers.current.forEach((peer) => {
      const state = peer.pc.connectionState;
      if (state === "failed" || state === "disconnected") {
        peer.iceRestarts = 0;
        peer.failureReported = false;
        peer.pc.restartIce();
      }
    });
  }, []);

  return {
    localStream,
    screenStream,
    peerStreams,
    isMuted,
    isCameraOff,
    isReady,
    isScreenSharing,
    hasMic,
    hasCamera,
    canScreenShare,
    peerQuality,
    devices,
    selectedAudioInput,
    selectedVideoInput,
    cleanup: teardown,
    setMuted,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    switchDevice,
    reconnectAllFailed,
  };
}

function createGate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
