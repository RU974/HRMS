import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export interface DrillDownColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
}

export function ReportDrillDownPanel<T>({
  title,
  queryKey,
  queryFn,
  columns,
  rowKey,
  onClose,
  viewAllHref,
}: {
  title: string;
  queryKey: unknown[];
  queryFn: () => Promise<T[]>;
  columns: DrillDownColumn<T>[];
  rowKey: (row: T) => string | number;
  onClose: () => void;
  viewAllHref?: string;
}) {
  const { data, isLoading, error } = useQuery({ queryKey, queryFn });
  const rows = data ?? [];

  return (
    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="flex items-center gap-2">
          {viewAllHref && (
            <a href={viewAllHref} className="text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline">
              View all in module
            </a>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
      {isLoading && <p className="text-sm text-[var(--muted)]">Loading records...</p>}
      {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No matching records.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                {columns.map((column) => (
                  <th key={column.header} className="p-2">{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-[var(--border)]/50">
                  {columns.map((column) => (
                    <td key={column.header} className="p-2" data-label={column.header}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
