import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import {
  listPerformanceAppraisals,
  listPerformanceGoals,
  listPerformanceKpis,
  listPerformanceReviews,
} from "@/services/performance-service";
import { performanceSections } from "./shared";

export function PerformancePage() {
  const [reviewsQuery, kpisQuery, goalsQuery, appraisalsQuery] = useQueries({
    queries: [
      { queryKey: ["performance", "reviews", "overview"], queryFn: () => listPerformanceReviews(), staleTime: 30_000 },
      { queryKey: ["performance", "kpis", "overview"], queryFn: () => listPerformanceKpis(), staleTime: 30_000 },
      { queryKey: ["performance", "goals", "overview"], queryFn: () => listPerformanceGoals(), staleTime: 30_000 },
      { queryKey: ["performance", "appraisals", "overview"], queryFn: () => listPerformanceAppraisals(), staleTime: 30_000 },
    ],
  });

  const stats = [
    { label: "Reviews", value: reviewsQuery.data?.length ?? 0 },
    { label: "KPIs", value: kpisQuery.data?.length ?? 0 },
    { label: "Goals", value: goalsQuery.data?.length ?? 0 },
    { label: "Appraisals", value: appraisalsQuery.data?.length ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Performance" subtitle="Choose a focused page for reviews, KPIs, goals, or appraisals." />

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="border-[var(--border)]/70 bg-gradient-to-br from-[var(--card)] to-[var(--border)]/15">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Performance workspace</p>
            <h2 className="mt-3 text-2xl font-semibold">Dedicated pages keep each performance workflow clean.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Reviews, KPIs, goals, and appraisals are now split into separate CRUD screens so users can move through each workflow without mixing data or losing context.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {performanceSections.map((section) => (
                <Link
                  key={section.key}
                  to={section.path}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/40 hover:shadow-sm"
                >
                  <p className="text-sm font-semibold">{section.title}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">{section.description}</p>
                </Link>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {stats.map((item) => (
              <Card key={item.label} className="border-[var(--border)]/70">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">Loaded from the live CRUD endpoint.</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
