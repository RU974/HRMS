export function Toast({ message }: { message: string }) {
  return <div className="fixed right-4 top-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">{message}</div>;
}


