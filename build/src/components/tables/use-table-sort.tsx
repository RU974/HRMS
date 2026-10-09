import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

/** Compare two values: numbers numerically, everything else alphabetically (case/number aware). Empty values go last. */
export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/**
 * Client-side sorting for tables. Defaults to ascending (alphabetical) on `defaultKey`.
 * `accessors` maps a column key to the value used for sorting; unmapped keys read `row[key]`.
 */
export function useTableSort<T>(
  rows: T[],
  defaultKey: string,
  accessors: Record<string, (row: T) => unknown> = {},
) {
  const [sort, setSort] = useState<SortState>({ key: defaultKey, dir: "asc" });

  const sorted = useMemo(() => {
    const get = (row: T) =>
      accessors[sort.key] ? accessors[sort.key](row) : (row as Record<string, unknown>)[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((x, y) => factor * compareValues(get(x), get(y)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  function toggle(key: string) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return { sorted, sort, toggle };
}

interface SortableThProps {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  className?: string;
}

/** Clickable <th> that shows the current sort direction (ascending / descending). */
export function SortableTh({ label, sortKey, sort, onSort, className = "p-3" }: SortableThProps) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-[var(--text)]"
        title={active ? (sort.dir === "asc" ? "Sorted A→Z (click for Z→A)" : "Sorted Z→A (click for A→Z)") : "Click to sort"}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-[var(--primary)]" : "opacity-40"}`} />
      </button>
    </th>
  );
}
