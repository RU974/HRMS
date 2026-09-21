import { describe, it, expect, vi } from "vitest";
import { CallEventBus } from "@/lib/call-events";

describe("CallEventBus", () => {
  it("delivers an event to every subscriber", () => {
    const bus = new CallEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("call.ended", a);
    bus.on("call.ended", b);

    bus.emit("call.ended", { call_id: 7 });

    expect(a).toHaveBeenCalledWith({ call_id: 7 });
    expect(b).toHaveBeenCalledWith({ call_id: 7 });
  });

  it("only delivers events to subscribers of that event", () => {
    const bus = new CallEventBus();
    const ended = vi.fn();
    bus.on("call.ended", ended);

    bus.emit("call.handled_elsewhere", { call_id: 1 });

    expect(ended).not.toHaveBeenCalled();
  });

  it("unsubscribing one listener does not affect another on the same event", () => {
    // This is the bug the bus exists to prevent: Echo's stopListening(event)
    // removes EVERY listener for the event, so one component unmounting used to
    // silently break another.
    const bus = new CallEventBus();
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = bus.on("call.updated", first);
    bus.on("call.updated", second);

    offFirst();
    bus.emit("call.updated", { call: {} as never });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a throwing handler does not stop the others", () => {
    const bus = new CallEventBus();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    bus.on("call.ended", () => {
      throw new Error("boom");
    });
    bus.on("call.ended", after);

    bus.emit("call.ended", { call_id: 1 });

    expect(after).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("a handler that unsubscribes during emit does not make a sibling miss the event", () => {
    const bus = new CallEventBus();
    const sibling = vi.fn();
    const off = bus.on("call.ended", () => off());
    bus.on("call.ended", sibling);

    bus.emit("call.ended", { call_id: 1 });

    expect(sibling).toHaveBeenCalledTimes(1);
  });

  it("emitting with no subscribers is a no-op", () => {
    const bus = new CallEventBus();
    expect(() => bus.emit("connection.restored", {})).not.toThrow();
  });
});
