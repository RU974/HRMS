import { PageHeader } from "@/components/page-header/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function PayrollPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" subtitle="Manage payroll with enterprise-grade workflows." />
      <EmptyState title="Payroll Module" description="This module shell is ready for API integration and business workflows." />
    </div>
  );
}


