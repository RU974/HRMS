import { useEffect, useRef, useState } from "react";

export interface SpeakerSource {
  id: number;
  stream: MediaStream | null;
}

const SPEAKING_THRESHOLD = 18; // average frequency-bin magnitude (0-255)
const POLL_MS = 250;

/**
 * Returns the id of whoever is currently speaking loudest, or null if nobody
 * is above the threshold. Uses one AnalyserNode per stream and never connects
 * to the destination, so it adds no audible output.
 */
export function useActiveSpeaker(sources: SpeakerSource[]): number | null {
  const [speakerId, setSpeakerId] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  // Recreate analysers only when the set of audio streams changes.
  const key = sources
    .filter((s) => s.stream && s.stream.getAudioTracks().length > 0)
    .map((s) => `${s.id}:${s.stream!.id}`)
    .join("|");

  useEffect(() => {
    const active = sources.filter((s) => s.stream && s.stream.getAudioTracks().length > 0);
    if (active.length < 2) {
      // With one (or zero) participants there is nothing to highlight.
      setSpeakerId(null);
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = ctxRef.current && ctxRef.current.state !== "closed" ? ctxRef.current : new AudioContext();
      ctxRef.current = ctx;
    } catch {
      return;
    }

    const analysers = active.map((s) => {
      const source = ctx.createMediaStreamSource(s.stream!);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      return { id: s.id, source, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    });

    const timer = setInterval(() => {
      let loudest: { id: number; level: number } | null = null;

      for (const a of analysers) {
        a.analyser.getByteFrequencyData(a.data);
        const level = a.data.reduce((sum, v) => sum + v, 0) / a.data.length;
        if (level > SPEAKING_THRESHOLD && (!loudest || level > loudest.level)) {
          loudest = { id: a.id, level };
        }
      }

      setSpeakerId((prev) => (prev === (loudest?.id ?? null) ? prev : loudest?.id ?? null));
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      analysers.forEach((a) => {
        try {
          a.source.disconnect();
        } catch {
          /* already disconnected */
        }
      });
    };
    // `key` captures the identity of the streams being analysed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    []
  );

  return speakerId;
}
