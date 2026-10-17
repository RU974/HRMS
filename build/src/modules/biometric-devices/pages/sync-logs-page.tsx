import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listBiometricDevices,
  listSyncLogs,
  SyncLogFilters,
  SyncLogStatus,
} from "@/services/biometric-device-service";

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

const statusStyles: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  in_progress: "bg-blue-50 text-blue-700",
};

export function SyncLogsPage() {
  const [filters, setFilters] = useState<SyncLogFilters>({ page: 1 });

  const devicesQuery = useQuery({ queryKey: ["biometric-devices"], queryFn: listBiometricDevices });

  const logsQuery = useQuery({
    queryKey: ["biometric-sync-logs", filters],
    queryFn: () => listSyncLogs(filters),
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasInProgress = data?.data?.some((log) => log.status === "in_progress");
      return hasInProgress ? 5000 : false;
    },
  });

  const { sorted: logs, sort, toggle: toggleSort } = useTableSort(logsQuery.data?.data ?? [], "device", {
    device: (l) => l.device_name,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Biometric Sync Logs" subtitle="History of attendance synchronization runs from biometric devices" />
        <Link to="/attendance/biometric-devices">
          <Button variant="outline">Back to Devices</Button>
        </Link>
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select
            className={inputClass}
            value={filters.device_id ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, device_id: e.target.value ? Number(e.target.value) : undefined }))}
          >
            <option value="">All Devices</option>
            {(devicesQuery.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            className={inputClass}
            value={filters.status ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, status: (e.target.value || undefined) as SyncLogStatus | undefined }))}
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
            <option value="in_progress">In Progress</option>
          </select>
          <input
            type="date"
            className={inputClass}
            value={filters.date_from ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, date_from: e.target.value || undefined }))}
          />
          <input
            type="date"
            className={inputClass}
            value={filters.date_to ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, date_to: e.target.value || undefined }))}
          />
        </div>
      </Card>

      <Card>
        {logsQuery.isLoading ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">Loading sync logs...</div>
        ) : logsQuery.isError ? (
          <div className="py-10 text-center text-sm text-red-600">
            Failed to load sync logs.{" "}
            <button className="underline" onClick={() => logsQuery.refetch()}>Retry</button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">No sync logs found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <SortableTh label="Timestamp" sortKey="started_at" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Device" sortKey="device" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Fetched" sortKey="records_fetched" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Matched" sortKey="records_matched" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Unmatched" sortKey="records_unmatched" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Closed month" sortKey="records_locked" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4" data-label="Timestamp">{new Date(log.started_at).toLocaleString()}</td>
                    <td className="py-3 pr-4" data-label="Device">{log.device_name ?? `Device #${log.device_id}`}</td>
                    <td className="py-3 pr-4" data-label="Fetched">{log.records_fetched}</td>
                    <td className="py-3 pr-4" data-label="Matched">{log.records_matched}</td>
                    <td className="py-3 pr-4" data-label="Unmatched">{log.records_unmatched}</td>
                    <td className="py-3 pr-4" data-label="Closed month" title="Punches not applied because their month is closed">{log.records_locked ?? 0}</td>
                    <td className="py-3 pr-4" data-label="Status">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyles[log.status] ?? "bg-gray-50 text-gray-700"}`}>
                        {log.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right" data-label="Actions">
                      {log.records_unmatched > 0 && (
                        <Link to={`/attendance/biometric-devices/${log.device_id}/mapping`}>
                          <Button variant="outline">Resolve Unmatched</Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
