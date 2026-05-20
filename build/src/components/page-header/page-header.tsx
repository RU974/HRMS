export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-6"><h1 className="text-3xl font-bold">{title}</h1><p className="text-sm text-[var(--muted)]">{subtitle}</p></div>;
}


