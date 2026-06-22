import { useCallback, useEffect, useRef, useState } from "react";
import { sendSignal, getSignals, getCall, CallSignal } from "@/services/call-service";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // TURN server required for symmetric NAT / enterprise firewalls.
  // Set these env vars before deploying to production.
  // Recommended: self-hosted coturn OR Twilio TURN (https://www.twilio.com/stun-turn)
  ...(import.meta.env.VITE_TURN_URL ? [{
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME ?? "",
    credential: import.meta.env.VITE_TURN_CREDENTIAL ?? "",
  }] : []),
];

export type PeerStream = { userId: number; stream: MediaStream };

interface UseWebRTCOptions {
  callId: number | null;
  localUserId: number;
  callType: "audio" | "video";
  enabled: boolean;
  onPeerConnected?: () => void;
  onPeerFailed?: () => void;
}

export function useWebRTC({ callId, localUserId, callType, enabled, onPeerConnected, onPeerFailed }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Refs are stable across re-renders — safe to use inside intervals
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
        } else if (pc.connectionState === "disconnected") {
          // Briefly disconnected (network blip) — don't remove stream yet
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

          // Perfect-negotiation: if collision, polite peer (lower id) rolls back.
          const collision =
            pc.signalingState !== "stable" || handledPeers.current.has(fromId);
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
        // ignore signaling errors silently
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
      .catch(() => {
        if (!cancelled) setIsReady(true); // continue without local media
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, callId, callType]);

  // Main polling loop: detect newly-joined peers and process signals.
  // Runs every 1.5 s once media is ready.
  //
  // Role assignment (prevents offer collisions):
  //   Higher user_id → sends offer (offerer)
  //   Lower  user_id → waits for offer (answerer)
  useEffect(() => {
    if (!isReady || !callId || !enabled) return;

    const intervalId = setInterval(async () => {
      try {
        // 1. Fetch call state and handle newly-joined participants
        const callData = await getCall(callId);

        const joinedIds = callData.participants
          .filter((p) => p.user_id !== localUserId && p.status === "joined")
          .map((p) => p.user_id);

        for (const remoteId of joinedIds) {
          if (handledPeers.current.has(remoteId)) continue;
          handledPeers.current.add(remoteId);

          if (localUserId > remoteId) {
            // We are the offerer (higher id) — create PC and send offer
            const pc = getOrCreatePC(remoteId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(callId, {
              to_user_id: remoteId,
              type: "offer",
              payload: { type: offer.type, sdp: offer.sdp ?? "" },
            });
          } else {
            // We are the answerer (lower id) — pre-create PC and wait for their offer
            getOrCreatePC(remoteId);
          }
        }

        // 2. Fetch and process pending signals for us
        const signals = await getSignals(callId);
        for (const signal of signals) {
          await processSignal(signal);
        }
      } catch {
        // ignore — might be network hiccup
      }
    }, 1500);

    return () => clearInterval(intervalId);
  }, [isReady, callId, enabled, localUserId, getOrCreatePC, processSignal]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
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
