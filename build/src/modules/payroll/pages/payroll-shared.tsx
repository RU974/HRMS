import { useCurrencyStore } from "@/store/currency-store";

export const sel = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

export function fmt(v: number) {
  return useCurrencyStore.getState().formatAmount(v);
}

export function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${tone}`}>{label}</span>;
}

export function payrollBadge(status: string) {
  const map: Record<string, string> = {
    paid:      "border-emerald-200 bg-emerald-50 text-emerald-700",
    approved:  "border-blue-200 bg-blue-50 text-blue-700",
    reviewed:  "border-indigo-200 bg-indigo-50 text-indigo-700",
    pending:   "border-amber-200 bg-amber-50 text-amber-700",
    draft:     "border-slate-200 bg-slate-100 text-slate-700",
    processed: "border-cyan-200 bg-cyan-50 text-cyan-700",
    cancelled: "border-red-200 bg-red-50 text-red-700",
  };
  return map[status] ?? "border-slate-200 bg-slate-100 text-slate-700";
}

export function loanBadge(status: string) {
  const map: Record<string, string> = {
    active:    "border-amber-200 bg-amber-50 text-amber-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-red-200 bg-red-50 text-red-700",
  };
  return map[status] ?? "border-slate-200 bg-slate-100 text-slate-700";
}
