export function SkeletonLoader({ className = "h-4 w-full" }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-[var(--border)]/70 ${className}`} />; }


