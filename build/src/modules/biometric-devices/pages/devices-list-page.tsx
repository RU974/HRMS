import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import {
  BiometricDevice,
  CreateBiometricDevicePayload,
  createBiometricDevice,
  deleteBiometricDevice,
  listBiometricDevices,
  testBiometricDeviceConnection,
  triggerBiometricDeviceSync,
  updateBiometricDevice,
} from "@/services/biometric-device-service";
import { DeviceStatusCard } from "../components/device-status-card";
import { DeviceFormModal } from "../components/device-form-modal";

export function DevicesListPage() {
  const queryClient = useQueryClient();
  const canCreate = useAuthStore((s) => s.hasPermission("biometric.create"));
  const canEdit = useAuthStore((s) => s.hasPermission("biometric.edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("biometric.delete"));
  const canSync = useAuthStore((s) => s.hasPermission("biometric.sync"));
  const canMap = useAuthStore((s) => s.hasPermission("biometric.manage_mapping"));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BiometricDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["biometric-devices"],
    queryFn: listBiometricDevices,
  });

  const createMutation = useMutation({
    mutationFn: createBiometricDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setModalOpen(false);
      setSuccessMsg("Device added successfully.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateBiometricDevicePayload> }) =>
      updateBiometricDevice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setModalOpen(false);
      setEditing(null);
      setSuccessMsg("Device updated successfully.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBiometricDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setSuccessMsg("Device removed.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const syncMutation = useMutation({
    mutationFn: triggerBiometricDeviceSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setSuccessMsg("Sync started. Check Sync Logs for progress.");
    },
    onError: (e: Error) => setError(e.message),
  });

  async function handleTestConnection(id: number) {
    setTestingId(id);
    setError(null);
    try {
      const result = await testBiometricDeviceConnection(id);
      if (result.success) {
        setSuccessMsg(result.message || "Connection successful.");
      } else {
        setError(result.message || "Connection failed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setTestingId(null);
    }
  }

  function handleSubmit(payload: CreateBiometricDevicePayload) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const devices = query.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Biometric Devices" subtitle="Manage biometric attendance device connections and synchronization" />
        <div className="flex gap-2">
          <Link to="/attendance/biometric-devices/sync-logs">
            <Button variant="outline">Sync Logs</Button>
          </Link>
          {canCreate && (
            <Button variant="primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
              Add Device
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMsg}</div>
      )}

      <Card>
        {query.isLoading ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">Loading devices...</div>
        ) : query.isError ? (
          <div className="py-10 text-center text-sm text-red-600">
            Failed to load devices.{" "}
            <button className="underline" onClick={() => query.refetch()}>Retry</button>
          </div>
        ) : devices.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">
            No biometric devices configured yet.
            {canCreate && (
              <div className="mt-3">
                <Button variant="primary" onClick={() => setModalOpen(true)}>Add your first device</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Connection</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Sync Mode</th>
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4 font-medium">{device.name}</td>
                    <td className="py-3 pr-4">
                      {device.connection_type === "tcp"
                        ? `${device.ip_address}:${device.port}`
                        : "Cloud API"}
                    </td>
                    <td className="py-3 pr-4"><DeviceStatusCard device={device} /></td>
                    <td className="py-3 pr-4 capitalize">{device.sync_mode}</td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleTestConnection(device.id)}
                          disabled={testingId === device.id}
                        >
                          {testingId === device.id ? "Testing..." : "Test"}
                        </Button>
                        {canSync && (
                          <Button
                            variant="outline"
                            onClick={() => syncMutation.mutate(device.id)}
                            disabled={syncMutation.isPending}
                          >
                            Sync Now
                          </Button>
                        )}
                        {canMap && (
                          <Link to={`/attendance/biometric-devices/${device.id}/mapping`}>
                            <Button variant="outline">Mapping</Button>
                          </Link>
                        )}
                        {canEdit && (
                          <Button
                            variant="outline"
                            onClick={() => { setEditing(device); setModalOpen(true); }}
                          >
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Remove device "${device.name}"?`)) {
                                deleteMutation.mutate(device.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <DeviceFormModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSubmit={handleSubmit}
          submitting={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}
