import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { FeatureWorkspace } from "@/components/workspace/feature-workspace";
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
      <FeatureWorkspace
        nav={<RecruitmentSubnav />}
        workspaceLabel="Recruitment workspace"
        heading="Build each recruitment page as its own workflow."
        body="The section is split into dedicated screens so the job, candidate, interview, and onboarding flows do not overlap or confuse users."
        links={recruitmentSections
          .filter((section) => section.path !== "/recruitment")
          .map((section) => {
            const copy = sectionCopy[section.path as keyof typeof sectionCopy];
            return {
              key: section.path,
              path: section.path,
              title: copy.title,
              description: copy.description,
            };
          })}
        stats={[
          { label: "Pipeline total", value: String(pipelineTotal || 0), note: "Candidate counts grouped by stage." },
          { label: "Focus", value: "4 pages", note: "Dedicated CRUD screens instead of one crowded tab view." },
        ]}
      />
    </div>
  );
}
