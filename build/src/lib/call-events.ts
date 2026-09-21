import type { Call, CallMediaState, CallSignal } from "@/services/call-service";

/**
 * Payloads of the websocket events the backend sends on `call.{userId}`.
 * The wire names come from each event's `broadcastAs()` on the server.
 */
export type CallEndReason = "ended" | "missed" | "declined" | "removed";

export interface CallEventMap {
  "call.initiated": { call: Call };
  "call.answered": { call: Call };
  "call.updated": { call: Call };
  /** `reason` says why it closed; older servers omit it. `removed` means the host removed you. */
  "call.ended": { call_id: number; reason?: CallEndReason };
  "call.rejected": { call_id: number; rejected_by: number };
  "call.mute_requested": { call_id: number };
  "call.handled_elsewhere": { call_id: number };
  "call.media_state": ({ call_id: number; user_id: number } & CallMediaState);
  "call.signal": { signal: CallSignal & { call_id: number } };
  /** Not a server event: emitted locally when the websocket reconnects, so clients can resync. */
  "connection.restored": Record<string, never>;
}

export type CallEventName = keyof CallEventMap;

/** Server events CallProvider binds from the websocket (excludes the local-only ones). */
export const CALL_EVENT_NAMES: Exclude<CallEventName, "connection.restored">[] = [
  "call.initiated",
  "call.answered",
  "call.updated",
  "call.ended",
  "call.rejected",
  "call.mute_requested",
  "call.handled_elsewhere",
  "call.media_state",
  "call.signal",
];

type Handler<K extends CallEventName> = (payload: CallEventMap[K]) => void;

/**
 * Tiny typed pub/sub between the single websocket subscription owned by
 * CallProvider and the components that care about call events.
 *
 * Laravel Echo's `stopListening(event)` removes *every* listener for that
 * event on the channel, so letting several components attach their own
 * listeners would let one unmount silently break another. Funnelling
 * everything through one subscription avoids that class of bug.
 */
export class CallEventBus {
  private handlers = new Map<CallEventName, Set<(payload: never) => void>>();

  on<K extends CallEventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as (payload: never) => void);

    return () => {
      set?.delete(handler as (payload: never) => void);
    };
  }

  emit<K extends CallEventName>(name: K, payload: CallEventMap[K]): void {
    // Copy so a handler that unsubscribes while we iterate cannot skip a sibling.
    for (const handler of [...(this.handlers.get(name) ?? [])]) {
      try {
        (handler as Handler<K>)(payload);
      } catch (err) {
        console.error(`[call-events] handler for ${name} threw`, err);
      }
    }
  }
}

export const callEvents = new CallEventBus();
