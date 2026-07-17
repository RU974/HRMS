import { useCallback, useEffect, useRef, useState } from "react";
import { sendSignal, CallSignal } from "@/services/call-service";
import { echo } from "@/lib/echo";
import { toast } from "@/components/notifications/toast";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // TURN server required for symmetric NAT / enterprise firewalls.
  // Set these env vars before deploying to production.
  // Recommended: self-hosted coturn OR Twilio TURN (https://www.twilio.com/stun-turn)
  ...(import.meta.env.VITE_TURN_URL ? [{
    urls: import.meta.env.VITE_TURN_URL as string,
    username: (import.meta.env.VITE_TURN_USERNAME ?? "") as string,
    credential: (import.meta.env.VITE_TURN_CREDENTIAL ?? "") as string,
  }] : []),
];

export type PeerStream = { userId: number; stream: MediaStream };
export type ConnectionQuality = "good" | "fair" | "poor";

interface UseWebRTCOptions {
  callId: number | null;
  localUserId: number;
  callType: "audio" | "video";
  enabled: boolean;
  /** IDs of remote participants who have joined — passed in from parent so we
   *  react to changes instead of polling the backend every 1.5 s. */
  joinedParticipantIds: number[];
  onPeerConnected?: () => void;
  onPeerFailed?: () => void;
  onSignalingError?: () => void;
}

export function useWebRTC({
  callId,
  localUserId,
  callType,
  enabled,
  joinedParticipantIds,
  onPeerConnected,
  onPeerFailed,
  onSignalingError,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peerQuality, setPeerQuality] = useState<Map<number, ConnectionQuality>>(new Map());

  // Refs are stable across re-renders — safe to use inside callbacks
  const pcs = useRef<Map<number, RTCPeerConnection>>(new Map());
  // Cumulative packet counters from the last poll, per remote user, so we can
  // compute a loss-rate delta instead of a lifetime average.
  const lastStats = useRef<Map<number, { packetsLost: number; packetsReceived: number }>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  // Original camera track, kept so we can restore it after screen share ends
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // ICE candidates received before remote SDP was set
  const icePending = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  // Peers we've already done role assignment for (prevents duplicate offers)
  const handledPeers = useRef<Set<number>>(new Set());

  // Get-or-create a peer connection for remoteUserId.
  const getOrCreatePC = useCallback(
    (remoteUserId: number): RTCPeerConnection => {
      if (pcs.current.has(remoteUserId)) {
        return pcs.current.get(remoteUserId)!;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (e) => {
        if (e.candidate && callId) {
          sendSignal(callId, {
            to_user_id: remoteUserId,
            type: "ice-candidate",
            payload: e.candidate.toJSON() as Record<string, unknown>,
          }).catch(() => {});
        }
      };

      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        setPeerStreams((prev) => {
          const exists = prev.some((p) => p.userId === remoteUserId);
          if (exists) return prev.map((p) => (p.userId === remoteUserId ? { ...p, stream } : p));
          return [...prev, { userId: remoteUserId, stream }];
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          onPeerConnected?.();
        } else if (pc.connectionState === "failed") {
          onPeerFailed?.();
          setPeerStreams((prev) => prev.filter((p) => p.userId !== remoteUserId));
          toast.error(
            "Connection failed",
            "Could not establish a peer-to-peer connection. A TURN server may be required on this network."
          );
        } else if (pc.connectionState === "disconnected") {
          setTimeout(() => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
              setPeerStreams((prev) => prev.filter((p) => p.userId !== remoteUserId));
            }
          }, 5000);
        }
      };

      // Attach existing local tracks
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pcs.current.set(remoteUserId, pc);
      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callId, onPeerConnected, onPeerFailed]
  );

  // Flush queued ICE candidates after remote SDP is set.
  const flushPendingICE = useCallback(async (remoteUserId: number, pc: RTCPeerConnection) => {
    const pending = icePending.current.get(remoteUserId) ?? [];
    if (pending.length === 0) return;
    icePending.current.delete(remoteUserId);
    for (const c of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // stale candidate — ignore
      }
    }
  }, []);

  // Process a single signaling message.
  const processSignal = useCallback(
    async (signal: CallSignal) => {
      const fromId = signal.from_user_id;

      try {
        if (signal.type === "offer") {
          const pc = getOrCreatePC(fromId);

          // Perfect-negotiation: collision only when signaling is already in-flight.
          const collision = pc.signalingState !== "stable";
          const isPolite = localUserId < fromId;

          if (collision && !isPolite) return; // impolite peer ignores colliding offer

          await pc.setRemoteDescription(
            new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit)
          );
          await flushPendingICE(fromId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (callId) {
            await sendSignal(callId, {
              to_user_id: fromId,
              type: "answer",
              payload: { type: answer.type, sdp: answer.sdp ?? "" },
            });
          }
        } else if (signal.type === "answer") {
          const pc = pcs.current.get(fromId);
          if (!pc || pc.signalingState === "stable") return;
          await pc.setRemoteDescription(
            new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit)
          );
          await flushPendingICE(fromId, pc);
        } else if (signal.type === "ice-candidate") {
          const pc = pcs.current.get(fromId);
          const init = signal.payload as unknown as RTCIceCandidateInit;
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(init));
          } else {
            // Queue until after setRemoteDescription
            const q = icePending.current.get(fromId) ?? [];
            q.push(init);
            icePending.current.set(fromId, q);
          }
        }
      } catch (err) {
        console.error("[webrtc] failed to process signal", signal.type, "from", fromId, err);
        onSignalingError?.();
      }
    },
    [callId, localUserId, getOrCreatePC, flushPendingICE, onSignalingError]
  );

  // Acquire camera/mic.
  useEffect(() => {
    if (!enabled || !callId) return;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: callType === "video" })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setIsReady(true); // continue so the call can still receive remote audio

        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          toast.error(
            callType === "video" ? "Camera & microphone blocked" : "Microphone blocked",
            "Allow access in your browser settings, then rejoin the call."
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          toast.error(
            callType === "video" ? "No camera or microphone found" : "No microphone found",
            "Check that your device is connected and not in use by another app."
          );
        } else if (name === "NotReadableError") {
          toast.error(
            "Media device unavailable",
            "Your camera or microphone is already in use by another application."
          );
        } else {
          toast.error("Could not access media devices", "Your audio/video will not be sent.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, callId, callType]);

  // Initiate (or re-initiate) a peer connection with remoteId, following the
  // same role assignment used on first join:
  //   Higher user_id → sends offer (offerer)
  //   Lower  user_id → waits for offer (answerer)
  const connectToPeer = useCallback(
    async (remoteId: number, iceRestart = false) => {
      if (!callId) return;

      if (localUserId > remoteId) {
        // We are the offerer (higher id) — create PC and send offer
        const pc = getOrCreatePC(remoteId);
        try {
          const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
          await pc.setLocalDescription(offer);
          await sendSignal(callId, {
            to_user_id: remoteId,
            type: "offer",
            payload: { type: offer.type, sdp: offer.sdp ?? "" },
          });
        } catch (err) {
          console.error("[webrtc] failed to create/send offer to", remoteId, err);
          toast.error(
            "Call connection error",
            "Could not connect to a participant. Try leaving and rejoining the call."
          );
          onPeerFailed?.();
        }
      } else {
        // We are the answerer (lower id) — pre-create PC and wait for their offer
        getOrCreatePC(remoteId);
      }
    },
    [callId, localUserId, getOrCreatePC, onPeerFailed]
  );

  // React to newly joined participants and initiate peer connections.
  useEffect(() => {
    if (!isReady || !callId || !enabled) return;

    (async () => {
      for (const remoteId of joinedParticipantIds) {
        if (handledPeers.current.has(remoteId)) continue;
        handledPeers.current.add(remoteId);
        await connectToPeer(remoteId);
      }
    })();
  // joinedParticipantIds changes drive this effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, callId, enabled, localUserId, JSON.stringify(joinedParticipantIds), connectToPeer]);

  // Manually retry a failed peer connection: close the stale connection and
  // re-run the offer/answer flow (with ICE restart when we're the offerer).
  const reconnectPeer = useCallback(
    (remoteId: number) => {
      const existing = pcs.current.get(remoteId);
      existing?.close();
      pcs.current.delete(remoteId);
      setPeerStreams((prev) => prev.filter((p) => p.userId !== remoteId));
      connectToPeer(remoteId, true).catch(() => {});
    },
    [connectToPeer]
  );

  const reconnectAllFailed = useCallback(() => {
    pcs.current.forEach((pc, remoteId) => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        reconnectPeer(remoteId);
      }
    });
  }, [reconnectPeer]);

  // Receive WebRTC signals via WebSocket (replaces 1.5 s polling).
  useEffect(() => {
    if (!isReady || !callId || !enabled) return;

    const channel = echo.private(`call.${localUserId}`);

    channel.listen(
      ".CallSignalSent",
      (data: { signal: CallSignal & { call_id: number } }) => {
        if (data.signal.call_id !== callId) return;
        processSignal(data.signal).catch(() => {});
      }
    );

    return () => {
      channel.stopListening(".CallSignalSent");
    };
  }, [isReady, callId, enabled, localUserId, processSignal]);

  // Poll RTCPeerConnection stats every 3s to derive a simple good/fair/poor
  // signal per peer, from round-trip time and inbound packet loss rate.
  useEffect(() => {
    if (!isReady || !enabled) return;

    const poll = async () => {
      const next = new Map<number, ConnectionQuality>();

      for (const [remoteId, pc] of pcs.current) {
        if (pc.connectionState !== "connected") continue;

        try {
          const report = await pc.getStats();
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

          if (rtt === null) {
            continue; // no usable stats yet this round
          }

          const rttMs = rtt * 1000;
          if (rttMs < 150 && lossRate < 0.02) {
            next.set(remoteId, "good");
          } else if (rttMs < 400 && lossRate < 0.08) {
            next.set(remoteId, "fair");
          } else {
            next.set(remoteId, "poor");
          }
        } catch {
          // stats unavailable this round — skip, keep previous value
        }
      }

      setPeerQuality(next);
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [isReady, enabled]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    icePending.current.clear();
    handledPeers.current.clear();
    lastStats.current.clear();
    setLocalStream(null);
    setPeerStreams([]);
    setIsReady(false);
    setIsScreenSharing(false);
    setPeerQuality(new Map());
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraOff((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  // Replace the outgoing video track on every peer connection with `track`.
  const replaceOutgoingVideoTrack = useCallback((track: MediaStreamTrack) => {
    pcs.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      sender?.replaceTrack(track).catch(() => {});
    });
  }, []);

  const stopScreenShare = useCallback(() => {
    const cameraTrack = cameraTrackRef.current;
    if (cameraTrack) {
      replaceOutgoingVideoTrack(cameraTrack);
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current!.removeTrack(t));
        localStreamRef.current.addTrack(cameraTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    setIsScreenSharing(false);
  }, [replaceOutgoingVideoTrack]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenStreamRef.current = displayStream;
      cameraTrackRef.current = localStreamRef.current?.getVideoTracks()[0] ?? null;

      replaceOutgoingVideoTrack(screenTrack);

      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current!.removeTrack(t));
        localStreamRef.current.addTrack(screenTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      // Auto-revert when the user stops sharing via the browser's own UI.
      screenTrack.addEventListener("ended", () => stopScreenShare(), { once: true });

      setIsScreenSharing(true);
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        toast.error("Could not start screen share", "Please try again.");
      }
    }
  }, [isScreenSharing, replaceOutgoingVideoTrack, stopScreenShare]);

  return {
    localStream,
    peerStreams,
    isMuted,
    isCameraOff,
    isReady,
    isScreenSharing,
    peerQuality,
    cleanup,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    reconnectAllFailed,
  };
}
