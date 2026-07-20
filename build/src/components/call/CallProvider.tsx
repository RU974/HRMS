import { createContext, useCallback, useContext, useState } from "react";
import { Call } from "@/services/call-service";
import { useAuthStore } from "@/store/auth-store";
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
  const { user } = useAuthStore();
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  const startCall = useCallback((call: Call) => {
    setActiveCall(call);
  }, []);

  const handleCallEnded = useCallback(() => {
    setActiveCall(null);
  }, []);

  return (
    <CallContext.Provider value={{ activeCall, startCall }}>
      {children}

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
