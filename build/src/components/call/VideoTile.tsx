import { useEffect, useRef } from "react";
import { MicOff, VideoOff } from "lucide-react";

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  /** This tile is the local user (mirrored, labelled "You"). */
  isLocal?: boolean;
  /** Camera switched off by the participant (their track keeps sending black frames). */
  cameraOff?: boolean;
  /** Microphone muted by the participant. */
  micMuted?: boolean;
  /** Currently the loudest speaker. */
  speaking?: boolean;
  /** Shared screens must not be cropped. */
  fit?: "cover" | "contain";
  size?: "sm" | "lg";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Renders one participant's video. It is deliberately silent: remote audio is
 * played by a single <RemoteAudio> per peer in the call window. Playing it here
 * as well would double the audio in video calls.
 */
export function VideoTile({
  stream,
  name,
  isLocal = false,
  cameraOff = false,
  micMuted = false,
  speaking = false,
  fit = "cover",
  size = "lg",
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasLiveVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");
  const showVideo = hasLiveVideo && !cameraOff;

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = showVideo ? stream : null;
  }, [stream, showVideo]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-gray-900 transition-shadow ${
        size === "sm" ? "h-28 w-44" : "h-full min-h-0 w-full"
      } ${speaking ? "ring-2 ring-green-400" : "ring-1 ring-white/5"}`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${
            isLocal && fit === "cover" ? "scale-x-[-1]" : ""
          }`}
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div
            className={`flex items-center justify-center rounded-full bg-gray-700 font-semibold text-white ${
              size === "sm" ? "h-12 w-12 text-base" : "h-16 w-16 text-xl"
            }`}
          >
            {getInitials(name)}
          </div>
          {size === "lg" && <p className="text-sm text-gray-300">{name}</p>}
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">
        {micMuted && <MicOff className="h-3 w-3 text-red-400" aria-label="Muted" />}
        <span className="max-w-[10rem] truncate">{isLocal ? "You" : name}</span>
      </div>

      {cameraOff && (
        <div className="absolute right-2 top-2 rounded-md bg-black/50 p-1" title="Camera off">
          <VideoOff className="h-3.5 w-3.5 text-white/60" />
        </div>
      )}
    </div>
  );
}
