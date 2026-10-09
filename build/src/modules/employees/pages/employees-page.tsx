import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormInput } from "@/components/forms/form-input";
import { SortableTh, type SortState } from "@/components/tables/use-table-sort";
import { useAuthStore } from "@/store/auth-store";
import { isSuperAdminRole } from "@/config/rbac";
import { listCompanies } from "@/services/settings-service";
import {
  type Employee,
  type EmployeeImportResult,
  listEmployeesPaginated,
  exportEmployeesCsv,
  importEmployeesCsv,
} from "@/services/employee-service";

const CSV_TEMPLATE_HEADER = "name,email,phone,cnic,gender,date_of_birth,department,designation,joining_date,employment_type,basic_salary,allowances,address\n";
const CSV_TEMPLATE_ROW    = "John Doe,john@example.com,03001234567,12345-6789012-3,male,1990-01-15,Engineering,Software Engineer,2024-01-01,full_time,80000,20000,123 Main St\n";

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE_HEADER + CSV_TEMPLATE_ROW], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await importEmployeesCsv(file);
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Import Employees from CSV" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-medium">Step 1 — Download template</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Download the CSV template and fill it with employee data. Required columns: name, email.</p>
          <Button variant="outline" className="mt-3 text-xs" onClick={downloadTemplate}>Download Template CSV</Button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-medium">Step 2 — Upload filled CSV</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="mt-2 text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {file && <p className="mt-1 text-xs text-[var(--muted)]">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 space-y-2">
            <div className="flex gap-4 text-sm">
              <span className="font-medium text-emerald-600">✓ {result.imported} imported</span>
              {result.skipped > 0 && <span className="font-medium text-amber-600">⚠ {result.skipped} skipped</span>}
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {result.errors.map((err, i) => <li key={i} className="text-xs text-red-600">• {err}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => void handleImport()} disabled={!file || loading}>
            {loading ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </Modal>
  );
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
  const canManage = useAuthStore((s) => s.hasPermission("employees:edit"));
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminRole(user);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search")?.trim() ?? "";
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [companyId, setCompanyId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statusTab, setStatusTab] = useState<"active" | "inactive">("active");

  const companiesQuery = useQuery({
    queryKey: ["settings", "companies"],
    queryFn: listCompanies,
    enabled: isSuperAdmin,
  });

  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const toggleSort = useCallback((key: string) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", page, search, companyId, sort.key, sort.dir, statusTab],
    queryFn: () => listEmployeesPaginated(page, search, companyId || undefined, sort.key, sort.dir, statusTab),
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
      await exportEmployeesCsv();
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
        subtitle={total > 0 ? `${total} ${statusTab} employees` : "Manage your workforce"}
      />

      <Card>
        <div className="mb-4 flex gap-1 border-b border-[var(--border)]" role="tablist">
          {(["active", "inactive"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={statusTab === tab}
              onClick={() => { setStatusTab(tab); setPage(1); }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                statusTab === tab
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {tab} Employees
            </button>
          ))}
        </div>

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

          {isSuperAdmin && (
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm shrink-0"
            >
              <option value="">All companies</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="shrink-0">
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)} className="shrink-0">Import CSV</Button>
                <Link to="/employees/new">
                  <Button className="shrink-0">+ Add Employee</Button>
                </Link>
              </>
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
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <SortableTh label="Employee" sortKey="name" sort={sort} onSort={toggleSort} />
                <th className="p-3">Department</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Type</th>
                <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                <SortableTh label="Joined" sortKey="created_at" sort={sort} onSort={toggleSort} />
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
                        {search ? "No employees match your search" : statusTab === "inactive" ? "No inactive employees" : "No employees yet"}
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        {search ? "Try a different name or department." : statusTab === "inactive" ? "Deactivated employees will appear here." : "Add your first employee to get started."}
                      </p>
                      {!search && statusTab === "active" && canManage && (
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
                  <td className="p-3" data-label="Employee">
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
                  <td className="p-3 text-[var(--muted)]" data-label="Department">{emp.department?.name ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)]" data-label="Designation">{emp.designation ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)] capitalize" data-label="Type">{emp.employment_type?.replace("_", " ") ?? "—"}</td>
                  <td className="p-3" data-label="Status"><StatusBadge status={emp.status} /></td>
                  <td className="p-3 text-[var(--muted)]" data-label="Joined">{emp.joining_date ?? "—"}</td>
                  {canManage && (
                    <td className="p-3 text-right" data-label="Action" onClick={(e) => e.stopPropagation()}>
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
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["employees"] })}
        />
      )}
    </div>
  );
}