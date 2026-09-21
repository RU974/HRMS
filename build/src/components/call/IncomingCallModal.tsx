import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import type { Call } from "@/services/call-service";

interface IncomingCallModalProps {
  call: Call;
  /** Answer/decline request in flight — disables both buttons. */
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function IncomingCallModal({ call, busy, onAccept, onDecline }: IncomingCallModalProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  const isVideo = call.type === "video";
  const callerName = call.initiator?.name ?? "Someone";
  const others = call.participants.filter((p) => p.user_id !== call.initiated_by).length;
  const subtitle =
    call.call_type === "group"
      ? `Group ${isVideo ? "video" : "voice"} call · ${others + 1} people`
      : `Incoming ${isVideo ? "video" : "voice"} call`;

  // Move focus to the primary action so Enter answers and Escape declines.
  useEffect(() => {
    acceptRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDecline();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onDecline]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
      aria-describedby="incoming-call-subtitle"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-24 backdrop-blur-sm sm:items-center sm:pt-0"
    >
      <div className="w-full max-w-sm rounded-3xl bg-gray-900 p-6 text-center shadow-2xl ring-1 ring-white/10">
        <div className="relative mx-auto mb-4 h-20 w-20">
          <span className="absolute inset-0 animate-ping rounded-full bg-green-500/30" aria-hidden="true" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">
            {initials(callerName)}
          </div>
        </div>

        <p id="incoming-call-title" className="text-lg font-semibold text-white">
          {callerName}
        </p>
        <p id="incoming-call-subtitle" className="mt-1 flex items-center justify-center gap-1.5 text-sm text-gray-400">
          {isVideo ? <Video className="h-4 w-4" aria-hidden="true" /> : <Phone className="h-4 w-4" aria-hidden="true" />}
          {subtitle}
        </p>

        <div className="mt-6 flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onDecline}
              disabled={busy}
              aria-label="Decline call"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <span className="text-xs text-gray-400">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              ref={acceptRef}
              type="button"
              onClick={onAccept}
              disabled={busy}
              aria-label="Accept call"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-60"
            >
              {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
            </button>
            <span className="text-xs text-gray-400">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
