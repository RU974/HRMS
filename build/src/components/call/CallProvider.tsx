import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { echo } from "@/lib/echo";
import { CALL_EVENT_NAMES, callEvents, type CallEventMap } from "@/lib/call-events";
import { startIncomingRingtone, stopRingtone } from "@/lib/ringtone";
import {
  answerCall,
  rejectCall,
  getCallConfig,
  getCurrentCall,
  pingPresence,
  Call,
  CallConfig,
  DEFAULT_CALL_CONFIG,
} from "@/services/call-service";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "@/components/notifications/toast";
import { ActiveCallWindow } from "./ActiveCallWindow";
import { IncomingCallModal } from "./IncomingCallModal";

interface CallContextValue {
  activeCall: Call | null;
  incomingCall: Call | null;
  config: CallConfig;
  /** Call startCall when the local user initiates a call. */
  startCall: (call: Call) => void;
}

const CallContext = createContext<CallContextValue>({
  activeCall: null,
  incomingCall: null,
  config: DEFAULT_CALL_CONFIG,
  startCall: () => {},
});

export function useCallContext() {
  return useContext(CallContext);
}

/** An unanswered call is expired server-side after ~60s; drop the modal shortly after regardless. */
const INCOMING_SAFETY_TIMEOUT_MS = 75_000;
const PRESENCE_INTERVAL_MS = 60_000;

type PusherLike = {
  connection: {
    state: string;
    bind: (event: string, cb: (payload: { previous: string; current: string }) => void) => void;
    unbind: (event: string, cb: (payload: { previous: string; current: string }) => void) => void;
  };
};

function showDesktopNotification(call: Call) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  try {
    const name = call.initiator?.name ?? "Someone";
    const n = new Notification(`Incoming ${call.type} call`, {
      body: `${name} is calling you`,
      tag: `call-${call.id}`,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* notifications are best effort */
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;

  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [responding, setResponding] = useState(false);

  const activeCallRef = useRef<Call | null>(null);
  const incomingRef = useRef<Call | null>(null);
  activeCallRef.current = activeCall;
  incomingRef.current = incomingCall;

  const configQuery = useQuery({
    queryKey: ["call-config"],
    queryFn: getCallConfig,
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  });
  const config = configQuery.data ?? DEFAULT_CALL_CONFIG;

  const startCall = useCallback((call: Call) => {
    stopRingtone();
    setIncomingCall(null);
    setActiveCall(call);
  }, []);

  const dismissIncoming = useCallback(() => {
    stopRingtone();
    setIncomingCall(null);
    setResponding(false);
  }, []);

  const presentIncoming = useCallback((call: Call) => {
    // The server already refuses to ring someone who is busy; this is belt and braces.
    if (activeCallRef.current || incomingRef.current) return;

    setIncomingCall(call);
    setResponding(false);
    void startIncomingRingtone();
    showDesktopNotification(call);
  }, []);

  // ── Single websocket subscription, fanned out through the event bus ────────
  useEffect(() => {
    if (userId === null) return;

    const channel = echo.private(`call.${userId}`);
    const bindings = CALL_EVENT_NAMES.map((name) => {
      const handler = (payload: CallEventMap[typeof name]) => {
        (callEvents.emit as (n: string, p: unknown) => void)(name, payload);
      };
      // Leading dot: the name is exactly the server's broadcastAs(), no namespace prefix.
      channel.listen(`.${name}`, handler);
      return { name, handler };
    });

    return () => {
      bindings.forEach(({ name, handler }) => channel.stopListening(`.${name}`, handler));
      echo.leave(`call.${userId}`);
    };
  }, [userId]);

  // ── Incoming-call lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    const offInitiated = callEvents.on("call.initiated", ({ call }) => presentIncoming(call));

    const offEnded = callEvents.on("call.ended", ({ call_id }) => {
      const incoming = incomingRef.current;
      if (incoming && incoming.id === call_id) {
        dismissIncoming();
        toast.info("Missed call", `${incoming.initiator?.name ?? "Someone"} stopped calling.`);
      }
    });

    // Answered/declined on another tab or device: stop ringing here.
    const offElsewhere = callEvents.on("call.handled_elsewhere", ({ call_id }) => {
      if (incomingRef.current?.id === call_id) dismissIncoming();
    });

    return () => {
      offInitiated();
      offEnded();
      offElsewhere();
    };
  }, [presentIncoming, dismissIncoming]);

  // Safety net in case the "ended" event is lost.
  useEffect(() => {
    if (!incomingCall) return;
    const id = window.setTimeout(dismissIncoming, INCOMING_SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [incomingCall, dismissIncoming]);

  // ── Resync after page load and after every websocket reconnect ────────────
  const resync = useCallback(async () => {
    try {
      const current = await getCurrentCall();

      if (!current) {
        // Server says we have no live call: make sure no stale ring is showing.
        if (incomingRef.current) dismissIncoming();
        return;
      }

      const me = current.participants.find((p) => p.user_id === userId);
      if (me?.status === "invited" && current.status !== "ended" && !activeCallRef.current && !incomingRef.current) {
        presentIncoming(current);
      }
    } catch {
      /* offline — the next reconnect will retry */
    }
  }, [userId, presentIncoming, dismissIncoming]);

  useEffect(() => {
    if (userId === null) return;
    void resync();

    const pusher = (echo.connector as unknown as { pusher?: PusherLike }).pusher;
    if (!pusher) return;

    let wasDisconnected = pusher.connection.state !== "connected";
    const onState = ({ current }: { previous: string; current: string }) => {
      if (current === "connected") {
        if (wasDisconnected) {
          callEvents.emit("connection.restored", {});
          void resync();
        }
        wasDisconnected = false;
      } else {
        wasDisconnected = true;
      }
    };

    pusher.connection.bind("state_change", onState);
    return () => pusher.connection.unbind("state_change", onState);
  }, [userId, resync]);

  // ── Presence: keep "online" accurate for idle-but-open tabs ───────────────
  useEffect(() => {
    if (userId === null) return;

    const ping = () => {
      if (document.visibilityState === "visible") pingPresence().catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, PRESENCE_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [userId]);

  // Ringtone must never outlive the ringing state.
  useEffect(() => () => stopRingtone(), []);

  // ── Answer / decline ──────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || responding) return;
    setResponding(true);
    try {
      const joined = await answerCall(call.id);
      startCall(joined);
    } catch (err) {
      dismissIncoming();
      toast.error("Could not join the call", err instanceof Error ? err.message : "The call may have ended.");
    }
  }, [responding, startCall, dismissIncoming]);

  const handleDecline = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || responding) return;
    setResponding(true);
    try {
      await rejectCall(call.id);
    } catch {
      /* already ended — nothing to decline */
    }
    dismissIncoming();
  }, [responding, dismissIncoming]);

  const handleCallEnded = useCallback(() => {
    stopRingtone();
    setActiveCall(null);
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({ activeCall, incomingCall, config, startCall }),
    [activeCall, incomingCall, config, startCall]
  );

  return (
    <CallContext.Provider value={value}>
      {children}

      {incomingCall && !activeCall && (
        <IncomingCallModal call={incomingCall} busy={responding} onAccept={handleAccept} onDecline={handleDecline} />
      )}

      {activeCall && user && (
        <ActiveCallWindow
          key={activeCall.id}
          call={activeCall}
          currentUserId={user.id}
          config={config}
          onEnded={handleCallEnded}
        />
      )}
    </CallContext.Provider>
  );
}
