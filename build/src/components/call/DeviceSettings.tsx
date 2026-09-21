import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import type { DeviceLists } from "@/hooks/use-webrtc";

interface DeviceSettingsProps {
  devices: DeviceLists;
  selectedAudioInput: string | null;
  selectedVideoInput: string | null;
  selectedAudioOutput: string | null;
  showCamera: boolean;
  onAudioInput: (deviceId: string) => void;
  onVideoInput: (deviceId: string) => void;
  onAudioOutput: (deviceId: string) => void;
}

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <select
        value={value ?? devices[0]?.deviceId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={devices.length === 0}
        className="w-full rounded-lg border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {devices.length === 0 && <option value="">None found</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DeviceSettings({
  devices,
  selectedAudioInput,
  selectedVideoInput,
  selectedAudioOutput,
  showCamera,
  onAudioInput,
  onVideoInput,
  onAudioOutput,
}: DeviceSettingsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Speaker selection needs setSinkId (not available in Safari/Firefox).
  const canChooseOutput = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Audio and video settings"
        title="Audio & video settings"
        className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
          open ? "bg-blue-500 text-white" : "bg-gray-700 text-white hover:bg-gray-600"
        }`}
      >
        <Settings2 className="h-6 w-6" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Audio and video settings"
          className="absolute bottom-full left-1/2 z-10 mb-3 w-72 -translate-x-1/2 space-y-3 rounded-2xl border border-white/10 bg-gray-900 p-4 shadow-2xl"
        >
          <DeviceSelect label="Microphone" devices={devices.audioInputs} value={selectedAudioInput} onChange={onAudioInput} />
          {showCamera && (
            <DeviceSelect label="Camera" devices={devices.videoInputs} value={selectedVideoInput} onChange={onVideoInput} />
          )}
          {canChooseOutput ? (
            <DeviceSelect label="Speaker" devices={devices.audioOutputs} value={selectedAudioOutput} onChange={onAudioOutput} />
          ) : (
            <p className="text-xs text-gray-500">Your browser plays call audio on the system default speaker.</p>
          )}
        </div>
      )}
    </div>
  );
}
