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
}

export function useWebRTC({
  callId,
  localUserId,
  callType,
  enabled,
  joinedParticipantIds,
  onPeerConnected,
  onPeerFailed,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Refs are stable across re-renders — safe to use inside callbacks
  const pcs = useRef<Map<number, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
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
      } catch {
        // ignore transient signaling errors
      }
    },
    [callId, localUserId, getOrCreatePC, flushPendingICE]
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

  // React to newly joined participants and initiate peer connections.
  //
  // Role assignment (prevents offer collisions):
  //   Higher user_id → sends offer (offerer)
  //   Lower  user_id → waits for offer (answerer)
  useEffect(() => {
    if (!isReady || !callId || !enabled) return;

    (async () => {
      for (const remoteId of joinedParticipantIds) {
        if (handledPeers.current.has(remoteId)) continue;
        handledPeers.current.add(remoteId);

        if (localUserId > remoteId) {
          // We are the offerer (higher id) — create PC and send offer
          const pc = getOrCreatePC(remoteId);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(callId, {
              to_user_id: remoteId,
              type: "offer",
              payload: { type: offer.type, sdp: offer.sdp ?? "" },
            });
          } catch {
            // ignore — will retry when signals arrive
          }
        } else {
          // We are the answerer (lower id) — pre-create PC and wait for their offer
          getOrCreatePC(remoteId);
        }
      }
    })();
  // joinedParticipantIds changes drive this effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, callId, enabled, localUserId, JSON.stringify(joinedParticipantIds), getOrCreatePC]);

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

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    icePending.current.clear();
    handledPeers.current.clear();
    setLocalStream(null);
    setPeerStreams([]);
    setIsReady(false);
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

  return { localStream, peerStreams, isMuted, isCameraOff, isReady, cleanup, toggleMute, toggleCamera };
}
