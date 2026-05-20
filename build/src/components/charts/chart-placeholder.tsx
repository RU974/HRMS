import { Card } from "@/components/ui/card";

export function ChartPlaceholder({ title }: { title: string }) {
  return <Card className="h-64"><p className="mb-3 font-semibold">{title}</p><div className="h-[calc(100%-2rem)] rounded-xl bg-gradient-to-br from-[var(--primary)]/20 to-transparent" /></Card>;
}


