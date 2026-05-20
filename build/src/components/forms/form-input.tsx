import { cn } from "@/utils/cn";

export function FormInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm", className)} {...props} />;
}


