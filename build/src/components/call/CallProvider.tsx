import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Call, getIncomingCalls, sendHeartbeat } from "@/services/call-service";
import { useAuthStore } from "@/store/auth-store";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
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

  // ── Heartbeat: keep last_seen_at fresh every 30 s ──────────────────────────
  useEffect(() => {
    if (!token || !user) return;

    // Fire immediately on login so the user appears online right away
    sendHeartbeat().catch(() => {});
    const id = setInterval(() => sendHeartbeat().catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [token, user]);

  // ── Poll for incoming calls every 3 s ──────────────────────────────────────
  useEffect(() => {
    if (!token || !user) return;

    const poll = async () => {
      if (activeCall) return; // don't interrupt an ongoing call
      try {
        const calls = await getIncomingCalls();
        const newCall = calls.find((c) => !seenCallIds.current.has(c.id));
        if (newCall) {
          seenCallIds.current.add(newCall.id);
          setIncomingCall(newCall);
          // Play ringtone (autoplay may be blocked on first page load; silently ignored)
          if (!incomingRingRef.current) {
            incomingRingRef.current = true;
            startRingtone("incoming").catch(() => {});
          }
        }
      } catch {
        // ignore network errors
      }
    };

    poll();
    const id = setInterval(poll, 3_000);
    return () => clearInterval(id);
  }, [token, user, activeCall]);

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
