import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-[var(--border)] p-8 text-center", className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-[var(--muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}


