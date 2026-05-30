import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getRecruitmentPipelineSummary } from "@/services/recruitment-service";
import { RecruitmentSubnav, recruitmentSections } from "./shared";

const sectionCopy = {
  "/recruitment/jobs": {
    title: "Jobs",
    description: "Publish openings, manage departments, and track hiring capacity.",
  },
  "/recruitment/candidates": {
    title: "Candidates",
    description: "Capture applications, move stages forward, and keep candidate records clean.",
  },
  "/recruitment/interviews": {
    title: "Interviews",
    description: "Schedule interviews, record outcomes, and keep recruiter feedback organized.",
  },
  "/recruitment/onboarding": {
    title: "Onboarding",
    description: "Manage hired candidates, start dates, and onboarding progress without mixing it with candidate intake.",
  },
} as const;

export function RecruitmentPage() {
  const pipelineQuery = useQuery({
    queryKey: ["recruitment", "pipeline-summary"],
    queryFn: getRecruitmentPipelineSummary,
  });

  const pipeline = pipelineQuery.data ?? [];
  const pipelineTotal = pipeline.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Recruitment" subtitle="Separate workflows for jobs, candidates, interviews, and onboarding." />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <RecruitmentSubnav />
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="border-[var(--border)]/70 bg-gradient-to-br from-[var(--card)] to-[var(--border)]/15">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Recruitment workspace</p>
            <h2 className="mt-3 text-2xl font-semibold">Build each recruitment page as its own workflow.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              The section is split into dedicated screens so the job, candidate, interview, and onboarding flows do not overlap or confuse users.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {recruitmentSections.filter((section) => section.path !== "/recruitment").map((section) => {
                const copy = sectionCopy[section.path as keyof typeof sectionCopy];
                return (
                  <Link
                    key={section.path}
                    to={section.path}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/40 hover:shadow-sm"
                  >
                    <p className="text-sm font-semibold">{copy.title}</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">{copy.description}</p>
                  </Link>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {[
              { label: "Pipeline total", value: String(pipelineTotal || 0), note: "Candidate counts grouped by stage." },
              { label: "Focus", value: "4 pages", note: "Dedicated CRUD screens instead of one crowded tab view." },
            ].map((item) => (
              <Card key={item.label} className="border-[var(--border)]/70">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{item.note}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
