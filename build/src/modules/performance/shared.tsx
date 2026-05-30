import { NavLink } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";

export type PerformanceSectionKey = "reviews" | "kpis" | "goals" | "appraisals";

export const performanceSections: Array<{
  key: PerformanceSectionKey;
  title: string;
  description: string;
  path: string;
}> = [
  {
    key: "reviews",
    title: "Reviews",
    description: "Track review periods, ratings, and reviewer notes in one place.",
    path: "/performance/reviews",
  },
  {
    key: "kpis",
    title: "KPIs",
    description: "Monitor target values, current progress, and performance units.",
    path: "/performance/kpis",
  },
  {
    key: "goals",
    title: "Goals",
    description: "Manage goal status, progress, and due dates without mixing it with other records.",
    path: "/performance/goals",
  },
  {
    key: "appraisals",
    title: "Appraisals",
    description: "Capture cycle-based appraisals, overall scores, strengths, and improvements.",
    path: "/performance/appraisals",
  },
];

export function PerformanceSubnav() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <NavLink
        to="/performance"
        end
        className={({ isActive }) =>
          cn(
            "rounded-2xl border px-4 py-3 transition",
            isActive
              ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 shadow-sm"
              : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/30"
          )
        }
      >
        <p className="text-sm font-semibold">Overview</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Open the performance workspace.</p>
      </NavLink>

      {performanceSections.map((section) => (
        <NavLink
          key={section.key}
          to={section.path}
          className={({ isActive }) =>
            cn(
              "rounded-2xl border px-4 py-3 transition",
              isActive
                ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/30"
            )
          }
        >
          <p className="text-sm font-semibold">{section.title}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{section.description}</p>
        </NavLink>
      ))}
    </div>
  );
}
