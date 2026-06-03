import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { useAuthStore } from "@/store/auth-store";
import { createReport, deleteReport, getReports, type Report, type ReportStatus, type ReportType, updateReport } from "@/services/report-service";

const reportStatuses: ReportStatus[] = ["active", "inactive"];

interface ReportFormState {
  name: string;
  description: string;
  status: ReportStatus;
}

const defaultForm: ReportFormState = {
  name: "",
  description: "",
  status: "active",
};

export function ReportCrudSection({ reportType, moduleKey }: { reportType: ReportType; moduleKey?: string }) {
  const queryClient = useQueryClient();
  const canManageReports = useAuthStore((state) => state.hasPermission("export reports"));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "">("");
  const [editing, setEditing] = useState<Report | null>(null);
  const [form, setForm] = useState<ReportFormState>(defaultForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: listError } = useQuery({
    queryKey: ["reports", reportType, moduleKey, search, statusFilter],
    queryFn: () => getReports({ q: search || undefined, type: reportType, status: statusFilter, module: moduleKey }),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ReportFormState) => {
      const body = {
        name: payload.name.trim(),
        type: reportType,
        description: payload.description.trim(),
        status: payload.status,
        filters: moduleKey ? { module: moduleKey } : undefined,
      };
      if (editing) return updateReport(editing.id, body);
      return createReport(body);
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
    onError: (err: Error) => setError(err.message),
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
      description: report.description ?? "",
      status: report.status,
    });
  };

  return (
    <Card>
      {canManageReports ? (
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={onSubmit}>
          <FormInput
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Report name"
          />
          <FormInput
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
          />
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ReportStatus }))}
          >
            {reportStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <div className="flex gap-2">
            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>{editing ? "Update" : "Create"}</Button>
            {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(defaultForm); }}>Cancel</Button>}
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--border)]/15 px-4 py-3 text-sm text-[var(--muted)]">
          You can view the report list, but report creation and editing require the export reports permission.
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <FormInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports..." />
        <select
          className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "")}
        >
          <option value="">All statuses</option>
          {reportStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>

      {(error || listError) && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error ?? (listError as Error).message}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Updated</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3 text-[var(--muted)]" colSpan={4}>Loading reports...</td></tr>}
            {data?.data.map((report) => (
              <tr key={report.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                <td className="p-3">
                  <p className="font-medium">{report.name}</p>
                  <p className="text-xs text-[var(--muted)]">{report.description || "-"}</p>
                </td>
                <td className="p-3 capitalize">{report.status}</td>
                <td className="p-3">{new Date(report.updated_at).toLocaleDateString()}</td>
                <td className="p-3">
                  {canManageReports ? (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => startEdit(report)}>Edit</Button>
                      <Button variant="ghost" onClick={() => deleteMutation.mutate(report.id)} disabled={deleteMutation.isPending}>Delete</Button>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Read only</span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && data?.data.length === 0 && <tr><td className="p-3 text-[var(--muted)]" colSpan={4}>No reports found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-xs text-[var(--muted)]">{totalReports} reports</div>
    </Card>
  );
}
