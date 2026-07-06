import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { getEmployeesPage } from "@/services/employee-service";
import {
  bulkImportEmployeeMappings,
  deleteEmployeeMapping,
  getAutoMatchSuggestions,
  getBiometricDevice,
  listDeviceUsers,
  listEmployeeMappings,
  saveEmployeeMapping,
  DeviceUser,
} from "@/services/biometric-device-service";
import { EmployeeMappingRow, EmployeeMappingTable } from "../components/employee-mapping-table";
import { toast } from "@/components/notifications/toast";

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

type Tab = "employees" | "device-users";

export function DeviceMappingPage() {
  const params = useParams<{ id: string }>();
  const deviceId = Number(params.id);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("employees");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [savingEmployeeId, setSavingEmployeeId] = useState<number | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<number, { device_user_id: string; card_number: string }>>({});
  const [importFile, setImportFile] = useState<File | null>(null);

  // Device-user tab: inline employee assign
  const [assigningDeviceUserId, setAssigningDeviceUserId] = useState<string | null>(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState<string>("");

  const deviceQuery = useQuery({
    queryKey: ["biometric-device", deviceId],
    queryFn: () => getBiometricDevice(deviceId),
    enabled: !!deviceId,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees-for-mapping"],
    queryFn: () => getEmployeesPage({ per_page: 500 }),
  });

  const mappingsQuery = useQuery({
    queryKey: ["biometric-mappings", deviceId],
    queryFn: () => listEmployeeMappings(deviceId),
    enabled: !!deviceId,
  });

  // Always fetch device users so the tab badge count is available
  const deviceUsersQuery = useQuery({
    queryKey: ["biometric-device-users", deviceId],
    queryFn: () => listDeviceUsers(deviceId),
    enabled: !!deviceId,
  });

  const saveMutation = useMutation({
    mutationFn: saveEmployeeMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-mappings", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["biometric-device-users", deviceId] });
      toast.success("Mapping saved", "Employee device mapping saved successfully.");
      setSuccessMsg("Mapping saved.");
      setSavingEmployeeId(null);
      setAssigningDeviceUserId(null);
      setAssignEmployeeId("");
    },
    onError: (e: Error) => {
      toast.error("Save failed", e.message);
      setError(e.message);
      setSavingEmployeeId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmployeeMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-mappings", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["biometric-device-users", deviceId] });
      toast.success("Deleted", "Mapping removed.");
      setSuccessMsg("Mapping removed.");
    },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });

  const autoMatchMutation = useMutation({
    mutationFn: () => getAutoMatchSuggestions(deviceId),
    onSuccess: (suggestions) => {
      const edits: Record<number, { device_user_id: string; card_number: string }> = {};
      suggestions.forEach((s) => {
        edits[s.employee_id] = { device_user_id: s.device_user_id, card_number: "" };
      });
      setLocalEdits((prev) => ({ ...prev, ...edits }));
      const msg = `Found ${suggestions.length} suggested match(es). Review and click Save for each.`;
      toast.info("Auto-match complete", msg);
      setSuccessMsg(msg);
    },
    onError: (e: Error) => { toast.error("Auto-match failed", e.message); setError(e.message); },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => bulkImportEmployeeMappings(deviceId, file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["biometric-mappings", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["biometric-device-users", deviceId] });
      const msg = `Imported ${result.imported} mapping(s). Skipped ${result.skipped}.`;
      toast.success("Import complete", msg);
      setSuccessMsg(msg);
      setImportFile(null);
    },
    onError: (e: Error) => { toast.error("Import failed", e.message); setError(e.message); },
  });

  const fetchFromDeviceMutation = useMutation({
    mutationFn: () => listDeviceUsers(deviceId),
    onSuccess: (deviceUsers) => {
      queryClient.setQueryData(["biometric-device-users", deviceId], deviceUsers);
      if (deviceUsers.length === 0) {
        toast.info(
          "No device users found",
          "Run:  python agent.py --sync-users  on the LAN PC, then click Fetch from Device again."
        );
        setSuccessMsg(
          "No enrolled users found. Run  python agent.py --sync-users  on the agent PC first, then click Fetch from Device again."
        );
        return;
      }
      // Pre-fill employee tab edits from already-mapped device users
      const edits: Record<number, { device_user_id: string; card_number: string }> = {};
      deviceUsers.forEach((du) => {
        if (du.employee_id) {
          edits[du.employee_id] = { device_user_id: du.device_user_id, card_number: "" };
        }
      });
      setLocalEdits((prev) => ({ ...prev, ...edits }));
      const already = deviceUsers.filter((d) => d.mapped).length;
      const unmapped = deviceUsers.filter((d) => !d.mapped).length;
      toast.info(
        "Device users loaded",
        `${deviceUsers.length} user(s) on device — ${already} mapped, ${unmapped} unmapped. Check the "Device Users" tab.`
      );
      // Auto-switch to device users tab so HR sees the unmapped list
      if (unmapped > 0) setActiveTab("device-users");
    },
    onError: (e: Error) => {
      toast.error("Fetch failed", e.message);
      setError(e.message);
    },
  });

  const employees = employeesQuery.data?.data ?? [];
  const mappings = mappingsQuery.data ?? [];
  const deviceUsers = deviceUsersQuery.data ?? [];

  const rows: EmployeeMappingRow[] = useMemo(() => {
    return employees
      .filter((emp) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return emp.name.toLowerCase().includes(q) || (emp.employee_number ?? "").toLowerCase().includes(q);
      })
      .map((emp) => {
        const existing = mappings.find((m) => m.employee_id === emp.id);
        const edit = localEdits[emp.id];
        return {
          employee_id: emp.id,
          employee_name: emp.name,
          employee_code: emp.employee_number ?? "-",
          device_user_id: edit?.device_user_id ?? existing?.device_user_id ?? "",
          card_number: edit?.card_number ?? existing?.card_number ?? "",
          mapping_id: existing?.id,
        };
      });
  }, [employees, mappings, localEdits, search]);

  const mappedCount = rows.filter((r) => r.device_user_id).length;
  const unmappedDeviceUsers = deviceUsers.filter((du) => !du.mapped);
  const isTcp = deviceQuery.data?.connection_type === "tcp";

  useEffect(() => {
    if (successMsg || error) {
      const timer = setTimeout(() => { setSuccessMsg(null); setError(null); }, 6000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, error]);

  function handleChange(employeeId: number, field: "device_user_id" | "card_number", value: string) {
    setLocalEdits((prev) => ({
      ...prev,
      [employeeId]: {
        device_user_id: field === "device_user_id" ? value : prev[employeeId]?.device_user_id ?? rows.find((r) => r.employee_id === employeeId)?.device_user_id ?? "",
        card_number: field === "card_number" ? value : prev[employeeId]?.card_number ?? rows.find((r) => r.employee_id === employeeId)?.card_number ?? "",
      },
    }));
  }

  function handleSave(row: EmployeeMappingRow) {
    setSavingEmployeeId(row.employee_id);
    setError(null);
    saveMutation.mutate({
      employee_id: row.employee_id,
      device_id: deviceId,
      device_user_id: row.device_user_id,
      card_number: row.card_number || null,
    });
  }

  function handleImport() {
    if (!importFile) return;
    setError(null);
    importMutation.mutate(importFile);
  }

  function handleAssignDeviceUser(du: DeviceUser) {
    const empId = Number(assignEmployeeId);
    if (!empId) return;
    saveMutation.mutate({
      employee_id: empId,
      device_id: deviceId,
      device_user_id: du.device_user_id,
      card_number: null,
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader
          title="Employee Mapping"
          subtitle={`Map HRMS employees to device user IDs for ${deviceQuery.data?.name ?? "this device"}`}
        />
        <Link to="/attendance/biometric-devices">
          <Button variant="outline">Back to Devices</Button>
        </Link>
      </div>

      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {successMsg && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMsg}</div>}

      {/* UX-3 setup hint for TCP devices */}
      {isTcp && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] px-4 py-3 text-sm text-[var(--text)]">
          <p className="font-semibold">First-time setup for TCP/IP device:</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
            <li>Run <code className="rounded bg-[var(--border)] px-1 py-0.5">python agent.py --sync-users</code> on the LAN PC to import enrolled fingerprint users.</li>
            <li>Click <strong>Fetch from Device</strong> below — enrolled users appear in the <strong>Device Users</strong> tab.</li>
            <li>Assign each device user to an HRMS employee and save.</li>
          </ol>
        </div>
      )}

      {/* Toolbar */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">
            Mapping progress: {mappedCount}/{rows.length} employees mapped
            {deviceUsers.length > 0 && (
              <span className="ml-3 text-xs text-[var(--muted)]">
                · {unmappedDeviceUsers.length} device user{unmappedDeviceUsers.length !== 1 ? "s" : ""} unmapped
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => fetchFromDeviceMutation.mutate()}
              disabled={fetchFromDeviceMutation.isPending}
            >
              {fetchFromDeviceMutation.isPending ? "Fetching..." : "Fetch from Device"}
            </Button>
            <Button
              variant="outline"
              onClick={() => autoMatchMutation.mutate()}
              disabled={autoMatchMutation.isPending}
            >
              {autoMatchMutation.isPending ? "Matching..." : "Auto-match by Employee Code"}
            </Button>
            <input
              type="file"
              accept=".csv"
              className="text-sm"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" onClick={handleImport} disabled={!importFile || importMutation.isPending}>
              {importMutation.isPending ? "Importing..." : "Bulk Import CSV"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "employees"
              ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
          onClick={() => setActiveTab("employees")}
        >
          Map by Employee ({mappedCount}/{rows.length})
        </button>
        <button
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "device-users"
              ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
          onClick={() => setActiveTab("device-users")}
        >
          Device Users ({deviceUsers.length})
          {unmappedDeviceUsers.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
              {unmappedDeviceUsers.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab: Map by Employee */}
      {activeTab === "employees" && (
        <>
          <Card className="mb-4">
            <FormInput
              className={inputClass}
              placeholder="Search by employee name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card>
          <Card>
            {employeesQuery.isLoading || mappingsQuery.isLoading ? (
              <div className="py-10 text-center text-sm text-[var(--muted)]">Loading employees...</div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--muted)]">No employees found.</div>
            ) : (
              <EmployeeMappingTable
                rows={rows}
                onChange={handleChange}
                onSave={handleSave}
                onDelete={(mappingId) => {
                  if (confirm("Remove this mapping?")) deleteMutation.mutate(mappingId);
                }}
                savingEmployeeId={savingEmployeeId}
              />
            )}
          </Card>
        </>
      )}

      {/* Tab: Device Users — UX-4 */}
      {activeTab === "device-users" && (
        <Card>
          {deviceUsersQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-[var(--muted)]">Loading device users...</div>
          ) : deviceUsers.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-sm font-medium text-[var(--text)]">No device users synced yet.</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Run <code className="rounded bg-[var(--border)] px-1 py-0.5">python agent.py --sync-users</code> on the agent PC,
                then click <strong>Fetch from Device</strong> above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="rtable w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-2 pr-4">Device User ID</th>
                    <th className="py-2 pr-4">Name on Device</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Mapped Employee</th>
                    <th className="py-2 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceUsers.map((du) => (
                    <tr key={du.device_user_id} className="border-b border-[var(--border)] last:border-0">
                      <td data-label="Device User ID" className="py-3 pr-4 font-mono text-xs">{du.device_user_id}</td>
                      <td data-label="Name on Device" className="py-3 pr-4">{du.name ?? <span className="text-[var(--muted)]">—</span>}</td>
                      <td data-label="Status" className="py-3 pr-4">
                        {du.mapped ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Mapped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            Unmapped
                          </span>
                        )}
                      </td>
                      <td data-label="Mapped Employee" className="py-3 pr-4">
                        {du.employee_name ?? <span className="text-xs text-[var(--muted)]">Not assigned</span>}
                      </td>
                      <td data-label="Action" className="py-3 pr-4 text-right">
                        {du.mapped ? (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              const mapping = mappings.find(
                                (m) => m.device_user_id === du.device_user_id
                              );
                              if (mapping && confirm("Remove this mapping?")) {
                                deleteMutation.mutate(mapping.id);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        ) : assigningDeviceUserId === du.device_user_id ? (
                          <div className="flex items-center justify-end gap-2">
                            <select
                              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                              value={assignEmployeeId}
                              onChange={(e) => setAssignEmployeeId(e.target.value)}
                            >
                              <option value="">Select employee…</option>
                              {employees
                                .filter((emp) => !mappings.find((m) => m.employee_id === emp.id))
                                .map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name} {emp.employee_number ? `(${emp.employee_number})` : ""}
                                  </option>
                                ))}
                            </select>
                            <Button
                              variant="primary"
                              onClick={() => handleAssignDeviceUser(du)}
                              disabled={!assignEmployeeId || saveMutation.isPending}
                            >
                              {saveMutation.isPending ? "Saving..." : "Assign"}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => { setAssigningDeviceUserId(null); setAssignEmployeeId(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setAssigningDeviceUserId(du.device_user_id);
                              setAssignEmployeeId("");
                            }}
                          >
                            Assign Employee
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
