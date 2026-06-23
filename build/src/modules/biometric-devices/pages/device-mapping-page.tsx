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
} from "@/services/biometric-device-service";
import { EmployeeMappingRow, EmployeeMappingTable } from "../components/employee-mapping-table";
import { toast } from "@/components/notifications/toast";

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

export function DeviceMappingPage() {
  const params = useParams<{ id: string }>();
  const deviceId = Number(params.id);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [savingEmployeeId, setSavingEmployeeId] = useState<number | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<number, { device_user_id: string; card_number: string }>>({});
  const [importFile, setImportFile] = useState<File | null>(null);

  const deviceQuery = useQuery({
    queryKey: ["biometric-device", deviceId],
    queryFn: () => getBiometricDevice(deviceId),
    enabled: !!deviceId,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees-for-mapping"],
    queryFn: () => getEmployeesPage({ per_page: 100 }),
  });

  const mappingsQuery = useQuery({
    queryKey: ["biometric-mappings", deviceId],
    queryFn: () => listEmployeeMappings(deviceId),
    enabled: !!deviceId,
  });

  const saveMutation = useMutation({
    mutationFn: saveEmployeeMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-mappings", deviceId] });
      toast.success("Mapping saved", "Employee device mapping saved successfully.");
      setSuccessMsg("Mapping saved.");
      setSavingEmployeeId(null);
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
      const edits: Record<number, { device_user_id: string; card_number: string }> = {};
      deviceUsers.forEach((du) => {
        if (du.employee_id) {
          edits[du.employee_id] = { device_user_id: du.device_user_id, card_number: "" };
        }
      });
      setLocalEdits((prev) => ({ ...prev, ...edits }));
      const already = deviceUsers.filter((d) => d.mapped).length;
      const filled = Object.keys(edits).length;
      toast.info(
        "Device users loaded",
        `${deviceUsers.length} user(s) on device. ${already} already mapped, ${filled} pre-filled. Review and save.`
      );
    },
    onError: (e: Error) => {
      toast.error("Fetch failed", e.message);
      setError(e.message);
    },
  });

  const employees = employeesQuery.data?.data ?? [];
  const mappings = mappingsQuery.data ?? [];

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

  useEffect(() => {
    if (successMsg || error) {
      const timer = setTimeout(() => { setSuccessMsg(null); setError(null); }, 5000);
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

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">
            Mapping progress: {mappedCount}/{rows.length} employees mapped
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
    </div>
  );
}
