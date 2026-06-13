import { BiometricDevice } from "@/services/biometric-device-service";

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "Never synced";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const statusStyles: Record<string, string> = {
  online: "bg-emerald-50 text-emerald-700",
  offline: "bg-red-50 text-red-700",
  never_synced: "bg-gray-50 text-gray-600",
};

const statusDot: Record<string, string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  never_synced: "bg-gray-400",
};

const statusLabel: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  never_synced: "Never Synced",
};

export function DeviceStatusCard({ device }: { device: BiometricDevice }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[device.status] ?? statusStyles.never_synced}`}
      >
        <span className={`h-2 w-2 rounded-full ${statusDot[device.status] ?? statusDot.never_synced}`} />
        {statusLabel[device.status] ?? device.status}
      </span>
      <span className="text-xs text-[var(--muted)]">{timeAgo(device.last_sync_at)}</span>
    </div>
  );
}
