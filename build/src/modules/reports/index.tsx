import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { createReport, deleteReport, getReports, type Report, type ReportStatus, type ReportType, updateReport } from "@/services/report-service";

const reportTypes: ReportType[] = ["attendance", "employee", "leave", "payroll", "custom"];
const reportStatuses: ReportStatus[] = ["active", "inactive"];

interface ReportFormState {
  name: string;
  type: ReportType;
  description: string;
  status: ReportStatus;
}

const defaultForm: ReportFormState = {
  name: "",
  type: "employee",
  description: "",
  status: "active",
};

export function ReportsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReportType | "">("");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "">("");
  const [editing, setEditing] = useState<Report | null>(null);
  const [form, setForm] = useState<ReportFormState>(defaultForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: listError } = useQuery({
    queryKey: ["reports", search, typeFilter, statusFilter],
    queryFn: () => getReports({ q: search || undefined, type: typeFilter, status: statusFilter }),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ReportFormState) => {
      if (editing) return updateReport(editing.id, payload);
      return createReport(payload);
    },
    onSuccess: async () => {
      setError(null);
      setEditing(null);
      setForm(defaultForm);
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReport,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const totalReports = useMemo(() => data?.total ?? 0, [data?.total]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Report name is required.");
      return;
    }
    saveMutation.mutate(form);
  };

  const startEdit = (report: Report) => {
    setEditing(report);
    setError(null);
    setForm({
      name: report.name,
      type: report.type,
      description: report.description ?? "",
      status: report.status,
    });
  };

  const resetForm = () => {
    setEditing(null);
    setError(null);
    setForm(defaultForm);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Manage reports with enterprise-grade workflows." />
      <Card>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={onSubmit}>
          <FormInput
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Report name"
          />
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ReportType }))}
          >
            {reportTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ReportStatus }))}
          >
            {reportStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <FormInput
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
          />
          <div className="flex gap-2">
            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>{editing ? "Update" : "Create"}</Button>
            {editing && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>
        {(error || listError) && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error ?? (listError as Error).message}
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <FormInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports..." />
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ReportType | "")}
          >
            <option value="">All types</option>
            {reportTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "")}
          >
            <option value="">All statuses</option>
            {reportStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Updated</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-3 text-[var(--muted)]" colSpan={5}>Loading reports...</td></tr>}
              {data?.data.map((report) => (
                <tr key={report.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3">
                    <p className="font-medium">{report.name}</p>
                    <p className="text-xs text-[var(--muted)]">{report.description || "-"}</p>
                  </td>
                  <td className="p-3 capitalize">{report.type}</td>
                  <td className="p-3 capitalize">{report.status}</td>
                  <td className="p-3">{new Date(report.updated_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => startEdit(report)}>Edit</Button>
                      <Button
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(report.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && data?.data.length === 0 && <tr><td className="p-3 text-[var(--muted)]" colSpan={5}>No reports found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-[var(--muted)]">{totalReports} reports</div>
      </Card>
    </div>
  );
}


