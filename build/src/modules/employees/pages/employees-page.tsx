import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { apiClient, API_BASE_URL } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import type { Employee } from "@/services/employee-service";

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

function fetchEmployees(page: number, search: string) {
  const params = new URLSearchParams({ page: String(page), per_page: "15" });
  if (search.trim()) params.set("search", search.trim());
  return apiClient<PaginatedResponse<Employee>>(`/employees?${params.toString()}`);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    inactive: "bg-red-50 text-red-700",
    on_leave: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${colors[status] ?? "bg-gray-50 text-gray-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function EmployeesPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const canManage = useAuthStore((s) => s.hasPermission("employees:edit"));

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", page, search],
    queryFn: () => fetchEmployees(page, search),
    retry: false,
    placeholderData: (prev) => prev,
  });

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleSearchClear = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/employees/export/csv`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const employees = data?.data ?? [];
  const totalPages = data?.last_page ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        subtitle={`${total > 0 ? `${total} employees` : "Manage your workforce"}`}
      />

      <Card>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
            <FormInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, department..."
              className="max-w-sm"
            />
            <Button type="submit" variant="outline" className="shrink-0">Search</Button>
            {search && (
              <Button type="button" variant="ghost" onClick={handleSearchClear} className="shrink-0 text-xs text-[var(--muted)]">
                Clear
              </Button>
            )}
          </form>

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="shrink-0">
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
            {canManage && (
              <Link to="/employees/new">
                <Button className="shrink-0">+ Add Employee</Button>
              </Link>
            )}
          </div>
        </div>

        {search && (
          <p className="mb-3 text-sm text-[var(--muted)]">
            Showing results for <span className="font-medium text-[var(--text)]">"{search}"</span>
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Unable to load employees. Check your connection and permissions.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="p-3">Employee</th>
                <th className="p-3">Department</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Joined</th>
                {canManage && <th className="p-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    {[...Array(canManage ? 7 : 6)].map((__, j) => (
                      <td key={j} className="p-3">
                        <div className="h-4 animate-pulse rounded bg-[var(--border)]" />
                      </td>
                    ))}
                  </tr>
                ))
              )}

              {!isLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="p-10 text-center">
                    <div className="mx-auto max-w-xs space-y-2">
                      <p className="text-2xl">👥</p>
                      <p className="font-medium text-[var(--text)]">
                        {search ? "No employees match your search" : "No employees yet"}
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        {search ? "Try a different name or department." : "Add your first employee to get started."}
                      </p>
                      {!search && canManage && (
                        <Link to="/employees/new">
                          <Button className="mt-3">Add Employee</Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && employees.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => navigate(`/employees/${emp.id}`)}
                  className="cursor-pointer border-b border-[var(--border)]/50 transition hover:bg-[var(--border)]/15"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {emp.profile_image ? (
                        <img src={emp.profile_image} alt={emp.name} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
                          {(emp.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{emp.name}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-[var(--muted)]">{emp.department?.name ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)]">{emp.designation ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)] capitalize">{emp.employment_type?.replace("_", " ") ?? "—"}</td>
                  <td className="p-3"><StatusBadge status={emp.status} /></td>
                  <td className="p-3 text-[var(--muted)]">{emp.joining_date ?? "—"}</td>
                  {canManage && (
                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/employees/${emp.id}`}>
                        <Button variant="outline" className="text-xs px-3 py-1.5">View</Button>
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--muted)]">
              Page {data?.current_page ?? 1} of {totalPages} · {total} total employees
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="text-xs px-3 py-1.5"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "primary" : "outline"}
                    className="text-xs px-3 py-1.5"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                className="text-xs px-3 py-1.5"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}