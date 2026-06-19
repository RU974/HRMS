import { useCallback, useEffect, useRef, useState } from "react";
import { sendSignal, getSignals, CallSignal } from "@/services/call-service";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type PeerStream = { userId: number; stream: MediaStream };

interface UseWebRTCOptions {
  callId: number | null;
  localUserId: number;
  remoteUserIds: number[];
  callType: "audio" | "video";
  enabled: boolean;
  onCallEnded?: () => void;
}

export function useWebRTC({ callId, localUserId, remoteUserIds, callType, enabled, onCallEnded }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const peerConnections = useRef<Map<number, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitiatorRef = useRef(false);

  const createPeerConnection = useCallback(
    (remoteUserId: number): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (event) => {
        if (event.candidate && callId) {
          sendSignal(callId, {
            to_user_id: remoteUserId,
            type: "ice-candidate",
            payload: event.candidate.toJSON() as Record<string, unknown>,
          }).catch(() => {});
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setPeerStreams((prev) => {
          const existing = prev.find((p) => p.userId === remoteUserId);
          if (existing) {
            return prev.map((p) => (p.userId === remoteUserId ? { ...p, stream: remoteStream } : p));
          }
          return [...prev, { userId: remoteUserId, stream: remoteStream }];
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPeerStreams((prev) => prev.filter((p) => p.userId !== remoteUserId));
        }
      };

      // Add local tracks
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      peerConnections.current.set(remoteUserId, pc);
      return pc;
    },
    [callId]
  );

  const processSignals = useCallback(
    async (signals: CallSignal[]) => {
      for (const signal of signals) {
        const fromId = signal.from_user_id;
        let pc = peerConnections.current.get(fromId);
        if (!pc) {
          pc = createPeerConnection(fromId);
        }

        try {
          if (signal.type === "offer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit)
            );
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
            if (pc.signalingState !== "stable") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit)
              );
            }
          } else if (signal.type === "ice-candidate") {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload as unknown as RTCIceCandidateInit));
          }
        } catch {
          // Silently ignore stale signals
        }
      }
    },
    [callId, createPeerConnection]
  );

  // Acquire media and set up peer connections
  useEffect(() => {
    if (!enabled || !callId) return;

    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsReady(true);
      } catch {
        setIsReady(true); // proceed without media if permission denied
      }
    }

    setup();

    return () => {
      cancelled = true;
    };
  }, [enabled, callId, callType]);

  // As initiator: create offers for all remote users once ready
  useEffect(() => {
    if (!isReady || !callId || !enabled || remoteUserIds.length === 0) return;
    if (!isInitiatorRef.current) return;

    async function sendOffers() {
      for (const remoteId of remoteUserIds) {
        if (peerConnections.current.has(remoteId)) continue;
        const pc = createPeerConnection(remoteId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(callId!, {
          to_user_id: remoteId,
          type: "offer",
          payload: { type: offer.type, sdp: offer.sdp ?? "" },
        });
      }
    }

    sendOffers().catch(() => {});
  }, [isReady, callId, enabled, remoteUserIds, createPeerConnection]);

  // Poll for signals
  useEffect(() => {
    if (!enabled || !callId || !isReady) return;

    signalPollRef.current = setInterval(async () => {
      try {
        const signals = await getSignals(callId);
        if (signals && signals.length > 0) {
          await processSignals(signals);
        }
      } catch {
        // ignore
      }
    }, 1500);

    return () => {
      if (signalPollRef.current) clearInterval(signalPollRef.current);
    };
  }, [enabled, callId, isReady, processSignals]);

  const markAsInitiator = useCallback(() => {
    isInitiatorRef.current = true;
  }, []);

  const cleanup = useCallback(() => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    setLocalStream(null);
    setPeerStreams([]);
    setIsReady(false);
    isInitiatorRef.current = false;
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = !isMuted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !enabled));
    setIsMuted(enabled);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const off = !isCameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !off));
    setIsCameraOff(off);
  }, [isCameraOff]);

  return {
    localStream,
    peerStreams,
    isMuted,
    isCameraOff,
    isReady,
    markAsInitiator,
    cleanup,
    toggleMute,
    toggleCamera,
  };
}
