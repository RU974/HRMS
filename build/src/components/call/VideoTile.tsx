import { useEffect, useRef } from "react";
import { MicOff, VideoOff } from "lucide-react";

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  /** Silence THIS tile's audio output (use for local preview to prevent echo) */
  muted?: boolean;
  noVideo?: boolean;
  isLocal?: boolean;
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

export function VideoTile({
  stream,
  name,
  muted = false,
  noVideo = false,
  isLocal = false,
  size = "lg",
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Separate audio element so sound keeps playing even when video track is off
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream ?? null;
  }, [stream]);

  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled) && !noVideo;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-gray-900 ${
        size === "sm" ? "h-28 w-44" : "h-full w-full"
      }`}
    >
      {/* Always-on audio output for remote participants — prevents audio loss when camera turns off */}
      {!isLocal && !muted && (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      )}

      {hasVideo ? (
        // Video element is always muted; audio comes from the <audio> element above
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${isLocal ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-700 text-xl font-semibold text-white">
            {getInitials(name)}
          </div>
          <p className="text-sm text-gray-300">{name}</p>
        </div>
      )}

      {/* Name / mute overlay */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">
        {muted && <MicOff className="h-3 w-3" />}
        <span>{isLocal ? "You" : name}</span>
      </div>

      {(noVideo || !hasVideo) && !isLocal && (
        <div className="absolute right-2 top-2 rounded-md bg-black/50 p-1">
          <VideoOff className="h-3.5 w-3.5 text-white/60" />
        </div>
      )}
    </div>
  );
}
