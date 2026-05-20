import { cn } from "@/utils/cn";

export function SelectDropdown({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm", className)} {...props}>{children}</select>;
}


