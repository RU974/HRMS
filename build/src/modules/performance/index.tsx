import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function PerformancePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Performance" subtitle="Manage performance with enterprise-grade workflows." />
      <EmptyState title="Performance Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


