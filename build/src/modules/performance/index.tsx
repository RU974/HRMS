import { useQueries } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { FeatureWorkspace } from "@/components/workspace/feature-workspace";
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
      <FeatureWorkspace
        workspaceLabel="Performance workspace"
        heading="Dedicated pages keep each performance workflow clean."
        body="Reviews, KPIs, goals, and appraisals are now split into separate CRUD screens so users can move through each workflow without mixing data or losing context."
        links={performanceSections}
        stats={stats.map((item) => ({
          label: item.label,
          value: item.value,
          note: "Loaded from the live CRUD endpoint.",
        }))}
        layoutClassName="lg:grid-cols-[1.3fr_0.7fr]"
      />
    </div>
  );
}
