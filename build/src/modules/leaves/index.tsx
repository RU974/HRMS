import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function LeavesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Leaves" subtitle="Manage leaves with enterprise-grade workflows." />
      <EmptyState title="Leaves Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


