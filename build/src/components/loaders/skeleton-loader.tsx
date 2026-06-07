import { cn } from "@/utils/cn";

// ── Base shimmer block ────────────────────────────────────
function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[var(--border)]",
        className
      )}
    />
  );
}

// ── Simple single skeleton ────────────────────────────────
export function SkeletonLoader({ className = "h-4 w-full" }: { className?: string }) {
  return <Bone className={className} />;
}

// ── Table skeleton ────────────────────────────────────────
export function TableSkeleton({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="p-3">
                <Bone className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-[var(--border)]/50">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="p-3">
                  <Bone
                    className={cn(
                      "h-4",
                      c === 0 ? "w-32" : c === cols - 1 ? "w-16" : "w-full"
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Stat card skeleton ────────────────────────────────────
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
      <Bone className="h-3 w-24" />
      <Bone className="h-8 w-16" />
      <Bone className="h-3 w-32" />
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Card skeleton ─────────────────────────────────────────
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
      <Bone className="h-5 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} className={cn("h-3", i === lines - 1 ? "w-3/4" : "w-full")} />
      ))}
    </div>
  );
}

// ── List item skeleton ────────────────────────────────────
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4">
      <Bone className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Bone className="h-3 w-32" />
        <Bone className="h-3 w-48" />
      </div>
      <Bone className="h-6 w-16 rounded-full shrink-0" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Form skeleton ─────────────────────────────────────────
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Bone className="h-3 w-24" />
          <Bone className="h-11 w-full rounded-xl" />
        </div>
      ))}
      <Bone className="h-11 w-32 rounded-xl" />
    </div>
  );
}

// ── Chart skeleton ────────────────────────────────────────
export function ChartSkeleton({ height = "h-48" }: { height?: string }) {
  return (
    <div className={cn("flex items-end gap-2", height)}>
      {[60, 80, 45, 90, 70, 55, 85, 65, 75, 50].map((h, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t-lg bg-[var(--border)]"
          style={
            {
              height: `${h}%`,
              animationDelay: `${i * 80}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ── Profile skeleton ──────────────────────────────────────
export function ProfileSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Bone className="h-20 w-20 rounded-full shrink-0" />
      <div className="space-y-2 flex-1">
        <Bone className="h-5 w-40" />
        <Bone className="h-3 w-56" />
        <Bone className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

// ── Dashboard page skeleton ───────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bone className="h-7 w-56" />
        <Bone className="h-4 w-72" />
      </div>
      <StatCardsSkeleton count={5} />
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
            <Bone className="h-4 w-32" />
            <ChartSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}