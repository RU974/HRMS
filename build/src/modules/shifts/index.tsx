import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function ShiftsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Shifts" subtitle="Manage shifts with enterprise-grade workflows." />
      <EmptyState title="Shifts Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


