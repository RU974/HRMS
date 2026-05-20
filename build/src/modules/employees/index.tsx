import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { Link } from "react-router-dom";
import { getEmployees } from "@/services/employee-service";

export function EmployeesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["employees"],
    queryFn: getEmployees,
    retry: false
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Employees" subtitle="Manage employees with enterprise-grade workflows." />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FormInput placeholder="Search employees..." className="max-w-sm" />
          <Button variant="outline">Export</Button>
          <Link to="/employees/new" className="ml-auto inline-flex">
            <Button>Add Employee</Button>
          </Link>
        </div>
        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">Unable to load employees. Confirm your logged-in user has an HR manager/admin role.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Department</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-3 text-[var(--muted)]" colSpan={5}>Loading employees...</td></tr>}
              {data?.data.map((employee) => (
                <tr key={employee.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium">{employee.name}</td>
                  <td className="p-3">{employee.email}</td>
                  <td className="p-3">{employee.department?.name ?? "-"}</td>
                  <td className="p-3">{employee.designation ?? "-"}</td>
                  <td className="p-3 capitalize">{employee.status}</td>
                </tr>
              ))}
              {!isLoading && data?.data.length === 0 && <tr><td className="p-3 text-[var(--muted)]" colSpan={5}>No employees found.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <div className="mt-4 text-xs text-[var(--muted)]">Page {data.current_page} of {data.last_page} - {data.total} employees</div>}
      </Card>
    </div>
  );
}


