import { useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { Call, answerCall, rejectCall } from "@/services/call-service";

interface IncomingCallModalProps {
  call: Call;
  onAnswer: (call: Call) => void;
  onReject: () => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function IncomingCallModal({ call, onAnswer, onReject }: IncomingCallModalProps) {
  const [loading, setLoading] = useState<"answer" | "reject" | null>(null);

  const callerName = call.initiator.name;
  const isGroup = call.call_type === "group";
  const isVideo = call.type === "video";

  async function handleAnswer() {
    if (loading) return;
    setLoading("answer");
    try {
      const answered = await answerCall(call.id);
      onAnswer(answered);
    } catch {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (loading) return;
    setLoading("reject");
    try {
      await rejectCall(call.id);
      onReject();
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 pb-12 backdrop-blur-sm sm:items-center sm:pb-0">
      <div className="w-full max-w-sm rounded-3xl bg-gray-900 p-8 shadow-2xl">
        {/* Pulse ring */}
        <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-green-500/30" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">
            {getInitials(callerName)}
          </div>
        </div>

        <p className="text-center text-lg font-semibold text-white">{callerName}</p>
        <p className="mt-1 text-center text-sm text-gray-400">
          {isGroup ? "Group " : ""}{isVideo ? "Video" : "Audio"} call
        </p>

        <div className="mt-8 flex items-center justify-center gap-12">
          {/* Reject */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleReject}
              disabled={!!loading}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 disabled:opacity-60"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-xs text-gray-400">Decline</span>
          </div>

          {/* Answer */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleAnswer}
              disabled={!!loading}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600 disabled:opacity-60"
            >
              {isVideo ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </button>
            <span className="text-xs text-gray-400">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
