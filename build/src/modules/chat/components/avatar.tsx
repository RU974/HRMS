import { Users } from "lucide-react";
import { getAvatarColor, getInitials } from "../lib/format";

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

export function Avatar({ name, size = "md" }: { name: string; size?: Size }) {
  return (
    <div
      aria-hidden="true"
      className={`${SIZE_CLASS[size]} ${getAvatarColor(name)} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
    >
      {getInitials(name)}
    </div>
  );
}

export function GroupAvatar({ size = "md" }: { size?: Size }) {
  const dimension = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <div
      aria-hidden="true"
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)]`}
    >
      <Users className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}
