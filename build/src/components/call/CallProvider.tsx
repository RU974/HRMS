import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Call, sendHeartbeat } from "@/services/call-service";
import { useAuthStore } from "@/store/auth-store";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
import { echo } from "@/lib/echo";
import { IncomingCallModal } from "./IncomingCallModal";
import { ActiveCallWindow } from "./ActiveCallWindow";

interface CallContextValue {
  activeCall: Call | null;
  /** Call startCall when the local user initiates or answers a call. */
  startCall: (call: Call) => void;
}

const CallContext = createContext<CallContextValue>({ activeCall: null, startCall: () => {} });

export function useCallContext() {
  return useContext(CallContext);
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthStore();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  const seenCallIds = useRef<Set<number>>(new Set());
  const incomingRingRef = useRef(false);
  // Ref so WebSocket listeners always see the current value without re-subscribing
  const activeCallRef = useRef<Call | null>(null);
  activeCallRef.current = activeCall;

  // ── Heartbeat: keep last_seen_at fresh every 30 s ──────────────────────────
  useEffect(() => {
    if (!token || !user) return;

    sendHeartbeat().catch(() => {});
    const id = setInterval(() => sendHeartbeat().catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [token, user]);

  // ── Real-time call events via WebSocket (replaces 3 s polling) ─────────────
  useEffect(() => {
    if (!token || !user) return;

    const userId = user.id;
    const channel = echo.private(`call.${userId}`);

    // Incoming call from another user
    channel.listen(".CallInitiated", (data: { call: Call }) => {
      if (activeCallRef.current) return; // never interrupt an ongoing call
      const { call } = data;
      if (seenCallIds.current.has(call.id)) return;
      seenCallIds.current.add(call.id);
      setIncomingCall(call);
      if (!incomingRingRef.current) {
        incomingRingRef.current = true;
        startRingtone("incoming").catch(() => {});
      }
    });

    // Caller cancelled / all participants rejected before we answered — dismiss modal
    channel.listen(".CallEnded", (data: { call_id: number }) => {
      setIncomingCall((prev) => {
        if (prev?.id === data.call_id) {
          stopRingtone();
          incomingRingRef.current = false;
          return null;
        }
        return prev;
      });
    });

    return () => {
      channel.stopListening(".CallInitiated");
      channel.stopListening(".CallEnded");
      // CallProvider is the outermost subscriber — leave the channel on cleanup.
      // Children (ActiveCallWindow, use-webrtc) unmount and stopListening first,
      // so this is safe.
      echo.leave(`call.${userId}`);
    };
  // user.id and token are the only values that should trigger re-subscription
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  const startCall = useCallback((call: Call) => {
    stopRingtone();
    incomingRingRef.current = false;
    setIncomingCall(null);
    setActiveCall(call);
    seenCallIds.current.add(call.id);
  }, []);

  const handleAnswer = useCallback((answeredCall: Call) => {
    stopRingtone();
    incomingRingRef.current = false;
    setIncomingCall(null);
    setActiveCall(answeredCall);
  }, []);

  const handleReject = useCallback(() => {
    stopRingtone();
    incomingRingRef.current = false;
    setIncomingCall(null);
  }, []);

  const handleCallEnded = useCallback(() => {
    stopRingtone();
    setActiveCall(null);
  }, []);

  return (
    <CallContext.Provider value={{ activeCall, startCall }}>
      {children}

      {incomingCall && !activeCall && (
        <IncomingCallModal
          call={incomingCall}
          onAnswer={handleAnswer}
          onReject={handleReject}
        />
      )}

      {activeCall && user && (
        <ActiveCallWindow
          call={activeCall}
          currentUserId={user.id}
          onEnded={handleCallEnded}
        />
      )}
    </CallContext.Provider>
  );
}
