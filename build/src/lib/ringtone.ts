// Web Audio API telephone ring synthesizer — no external audio files needed

let audioCtx: AudioContext | null = null;
let stopFn: (() => void) | null = null;

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

  const ctx = ensureContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return;
  }

  // Soft ringback tone for the caller: 400 Hz + 450 Hz, 1 s on / 3 s off
  stopFn = createPattern(ctx, [400, 450], 1000, 3000, 0.12);
}

export function stopRingtone() {
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
}
