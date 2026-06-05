import type { ReactNode } from "react";

export function FormField({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </label>
      {children}
    </div>
  );
}
