import { Link, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";

export const recruitmentSections = [
  { label: "Overview", path: "/recruitment" },
  { label: "Jobs", path: "/recruitment/jobs" },
  { label: "Candidates", path: "/recruitment/candidates" },
  { label: "Interviews", path: "/recruitment/interviews" },
  { label: "Onboarding", path: "/recruitment/onboarding" },
] as const;

export function RecruitmentSubnav() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-wrap gap-2">
      {recruitmentSections.map((section) => {
        const active = pathname === section.path;
        return (
          <Link
            key={section.path}
            to={section.path}
            className={cn(
              "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--primary)]/40 hover:bg-[var(--border)]/25"
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}

export function formatRecruitmentDate(value?: string | null, includeTime = false) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return includeTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}
