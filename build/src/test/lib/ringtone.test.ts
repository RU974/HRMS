import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A browser will not start audio until the user has interacted with the page, and
 * AudioContext.resume() simply stays pending until then. By the time it settles the
 * call may be long gone, so a ring that was cancelled must never begin afterwards.
 */
class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
}

let oscillatorsStarted = 0;
let releaseResume: (() => void) | null = null;
let contextState: "suspended" | "running" = "suspended";

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  get state() {
    return contextState;
  }
  resume() {
    return new Promise<void>((resolve) => {
      releaseResume = () => {
        contextState = "running";
        resolve();
      };
    });
  }
  createGain() {
    return { gain: new FakeParam(), connect() {}, disconnect() {} };
  }
  createOscillator() {
    return {
      frequency: new FakeParam(),
      connect() {},
      start: () => {
        oscillatorsStarted += 1;
      },
      stop() {},
    };
  }
}

describe("ringtone", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    oscillatorsStarted = 0;
    releaseResume = null;
    contextState = "suspended";
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not start ringing after it was stopped while the browser was still blocking audio", async () => {
    const { startIncomingRingtone, stopRingtone } = await import("@/lib/ringtone");

    const started = startIncomingRingtone();
    stopRingtone(); // the call ended / was answered elsewhere before the browser allowed audio
    releaseResume?.();

    expect(await started).toBe(false);
    expect(oscillatorsStarted).toBe(0);
  });

  it("gives up on a context the browser never unblocks instead of hanging", async () => {
    const { startIncomingRingtone } = await import("@/lib/ringtone");

    const started = startIncomingRingtone();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await started).toBe(false);
    expect(oscillatorsStarted).toBe(0);
  });

  it("rings once audio is allowed, and stops on request", async () => {
    contextState = "running";
    const { startIncomingRingtone, stopRingtone } = await import("@/lib/ringtone");

    expect(await startIncomingRingtone()).toBe(true);
    expect(oscillatorsStarted).toBeGreaterThan(0);

    const before = oscillatorsStarted;
    stopRingtone();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(oscillatorsStarted).toBe(before);
  });
});
