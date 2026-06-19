import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Call, getIncomingCalls } from "@/services/call-service";
import { useAuthStore } from "@/store/auth-store";
import { IncomingCallModal } from "./IncomingCallModal";
import { ActiveCallWindow } from "./ActiveCallWindow";

interface CallContextValue {
  activeCall: Call | null;
  startCall: (call: Call, asInitiator: boolean) => void;
}

const CallContext = createContext<CallContextValue>({ activeCall: null, startCall: () => {} });

export function useCallContext() {
  return useContext(CallContext);
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthStore();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenCallIds = useRef<Set<number>>(new Set());

  const startCall = useCallback((call: Call, asInitiator: boolean) => {
    setActiveCall(call);
    setIsInitiator(asInitiator);
    seenCallIds.current.add(call.id);
  }, []);

  // Poll for incoming calls
  useEffect(() => {
    if (!token || !user) return;

    const poll = async () => {
      try {
        const calls = await getIncomingCalls();
        const newCall = calls.find((c) => !seenCallIds.current.has(c.id));
        if (newCall && !activeCall && !incomingCall) {
          seenCallIds.current.add(newCall.id);
          setIncomingCall(newCall);
        }
      } catch {
        // ignore
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, user, activeCall, incomingCall]);

  const handleAnswer = useCallback((answeredCall: Call) => {
    setIncomingCall(null);
    setActiveCall(answeredCall);
    setIsInitiator(false);
  }, []);

  const handleReject = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const handleCallEnded = useCallback(() => {
    setActiveCall(null);
    setIsInitiator(false);
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
          isInitiator={isInitiator}
          onEnded={handleCallEnded}
        />
      )}
    </CallContext.Provider>
  );
}
