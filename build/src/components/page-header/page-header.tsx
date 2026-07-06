export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-6"><h1 className="text-2xl font-bold md:text-3xl">{title}</h1><p className="text-sm text-[var(--muted)]">{subtitle}</p></div>;
}


