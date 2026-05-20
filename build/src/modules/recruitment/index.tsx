import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function RecruitmentPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Recruitment" subtitle="Manage recruitment with enterprise-grade workflows." />
      <EmptyState title="Recruitment Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


