// Web Audio API telephone ring synthesizer — no external audio files needed

let audioCtx: AudioContext | null = null;
let stopFn: (() => void) | null = null;

/**
 * Bumped by every start and stop. Resuming a suspended AudioContext can stay
 * pending until the user interacts with the page, so by the time it resolves the
 * call may already be over. A start only goes ahead if nothing has stopped or
 * replaced it in the meantime; otherwise a ring could begin after the fact and
 * never stop.
 */
let generation = 0;

/** Resume the context, giving up (rather than hanging) when the browser will not allow audio yet. */
async function resumeContext(ctx: AudioContext): Promise<boolean> {
  // A function, not a property read: `state` changes asynchronously, which TypeScript cannot see.
  const isRunning = () => ctx.state === "running";
  if (isRunning()) return true;
  try {
    await Promise.race([ctx.resume(), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
  } catch {
    return false;
  }
  return isRunning();
}

function ensureContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function createPattern(
  ctx: AudioContext,
  freqs: number[],
  ringMs: number,
  silenceMs: number,
  volume: number
): () => void {
  let active = true;
  let timerId: ReturnType<typeof setTimeout>;
  const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  function tick() {
    if (!active) return;

    // Create master gain for this ring burst
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    const burst: { osc: OscillatorNode; gain: GainNode } = { osc: null!, gain: masterGain };

    const oscs = freqs.map((f) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(masterGain);
      osc.start();
      return osc;
    });

    // Fade in
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
    // Fade out before end of ring
    masterGain.gain.setValueAtTime(volume, ctx.currentTime + ringMs / 1000 - 0.05);
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + ringMs / 1000);

    timerId = setTimeout(() => {
      oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
      masterGain.disconnect();

      if (active) {
        timerId = setTimeout(tick, silenceMs);
      }
    }, ringMs);

    nodes.push(burst);
    void burst;
  }

  tick();

  return () => {
    active = false;
    clearTimeout(timerId);
    nodes.forEach(({ gain }) => {
      try { gain.disconnect(); } catch { /* ignore */ }
    });
  };
}

export async function startRingtone() {
  stopRingtone();
  const mine = generation;

  const ctx = ensureContext();
  if (!ctx) return;

  const running = await resumeContext(ctx);
  if (!running || mine !== generation) return;

  // Soft ringback tone for the caller: 400 Hz + 450 Hz, 1 s on / 3 s off
  stopFn = createPattern(ctx, [400, 450], 1000, 3000, 0.12);
}

/**
 * Ring for the person being called. Distinct from the caller's ringback so the
 * two are never confused: 440 Hz + 480 Hz, 2 s on / 4 s off.
 *
 * Browsers only allow audio after a user gesture; if the context is still
 * suspended (user has not interacted with the page yet) this resolves to
 * false so the caller can fall back to a visual/desktop notification.
 */
export async function startIncomingRingtone(): Promise<boolean> {
  stopRingtone();
  const mine = generation;

  const ctx = ensureContext();
  if (!ctx) return false;

  const running = await resumeContext(ctx);
  if (!running || mine !== generation) return false;

  stopFn = createPattern(ctx, [440, 480], 2000, 4000, 0.2);
  return true;
}

export function stopRingtone() {
  generation += 1;
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
}
