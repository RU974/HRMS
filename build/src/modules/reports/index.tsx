import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Manage reports with enterprise-grade workflows." />
      <EmptyState title="Reports Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


