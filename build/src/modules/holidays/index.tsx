import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function HolidaysPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Holidays" subtitle="Manage holidays with enterprise-grade workflows." />
      <EmptyState title="Holidays Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


