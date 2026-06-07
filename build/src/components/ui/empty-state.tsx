import { type ReactNode } from "react";
import { cn } from "@/utils/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { wrap: "py-8",  icon: "text-2xl", title: "text-sm", desc: "text-xs" },
  md: { wrap: "py-12", icon: "text-3xl", title: "text-base", desc: "text-sm" },
  lg: { wrap: "py-16", icon: "text-4xl", title: "text-lg", desc: "text-sm" },
};

export function EmptyState({
  icon,
  emoji,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const s = sizeMap[size];
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", s.wrap, className)}>
      {/* Icon / Emoji */}
      {(emoji || icon) && (
        <div className={cn("mb-4", s.icon)}>
          {emoji ? (
            <span
              className={s.icon}
              style={{
                filter: "drop-shadow(0 4px 12px rgba(99,102,241,0.2))",
              }}
            >
              {emoji}
            </span>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--muted)]">
              {icon}
            </div>
          )}
        </div>
      )}

      {/* Text */}
      <p className={cn("font-semibold text-[var(--text)]", s.title)}>{title}</p>
      {description && (
        <p className={cn("mt-1.5 max-w-xs text-[var(--muted)]", s.desc)}>{description}</p>
      )}

      {/* CTA */}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Pre-built variants for common modules ────────────────

export function NoEmployees({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      emoji="👥"
      title="No employees yet"
      description="Add your first employee to start building your workforce directory."
      action={
        onAdd && (
          <button
            onClick={onAdd}
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Add employee
          </button>
        )
      }
    />
  );
}

export function NoAttendance() {
  return (
    <EmptyState
      emoji="🕐"
      title="No attendance records"
      description="Attendance records will appear here once employees start checking in."
    />
  );
}

export function NoLeaves({ onRequest }: { onRequest?: () => void }) {
  return (
    <EmptyState
      emoji="🌴"
      title="No leave requests"
      description="Leave requests submitted by employees will appear here."
      action={
        onRequest && (
          <button
            onClick={onRequest}
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Request leave
          </button>
        )
      }
    />
  );
}

export function NoPayroll() {
  return (
    <EmptyState
      emoji="💰"
      title="No payroll records"
      description="Generate payroll for a month to see records appear here."
    />
  );
}

export function NoNotifications() {
  return (
    <EmptyState
      emoji="🔔"
      title="All caught up"
      description="No notifications at the moment. Check back later."
      size="sm"
    />
  );
}

export function NoMessages() {
  return (
    <EmptyState
      emoji="💬"
      title="No messages yet"
      description="Select a colleague from the left panel to start a conversation."
      size="sm"
    />
  );
}

export function NoResults({ query }: { query?: string }) {
  return (
    <EmptyState
      emoji="🔍"
      title={query ? `No results for "${query}"` : "No results found"}
      description="Try adjusting your search or filters to find what you're looking for."
      size="sm"
    />
  );
}

export function NoData({ label = "data" }: { label?: string }) {
  return (
    <EmptyState
      emoji="📭"
      title={`No ${label} available`}
      description="Records will appear here once data is added to the system."
      size="sm"
    />
  );
}