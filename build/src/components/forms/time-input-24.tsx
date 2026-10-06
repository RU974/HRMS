import { cn } from "@/utils/cn";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const selectClass = "h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

/** 24-hour time picker. Value is "HH:MM" (or "" when unset), regardless of browser locale. */
export function TimeInput24({ value, onChange, className, clearable = false }: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  clearable?: boolean;
}) {
  const [hh = "", mm = ""] = value ? value.slice(0, 5).split(":") : [];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <select
        aria-label="Hour"
        className={selectClass}
        value={hh}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${mm || "00"}` : "")}
      >
        {(clearable || !hh) && <option value="">--</option>}
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-[var(--muted)]">:</span>
      <select
        aria-label="Minute"
        className={selectClass}
        value={mm}
        onChange={(e) => onChange(`${hh || "00"}:${e.target.value}`)}
      >
        {!mm && <option value="">--</option>}
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
