import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "@/components/notifications/toast";
import {
  BiometricDevice,
  CreateBiometricDevicePayload,
  DiscoveredDevice,
  claimDiscoveredDevice,
  createBiometricDevice,
  deleteBiometricDevice,
  listBiometricDevices,
  listUnconfiguredDevices,
  regenerateAgentToken,
  testBiometricDeviceConnection,
  triggerBiometricDeviceSync,
  updateBiometricDevice,
} from "@/services/biometric-device-service";
import { DeviceStatusCard } from "../components/device-status-card";
import { DeviceFormModal } from "../components/device-form-modal";
import { TokenRevealModal } from "../components/token-reveal-modal";

const inputClass = "h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";
const TIMEZONES  = ["Asia/Karachi", "UTC", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata"];

const SETUP_STEPS = [
  { n: 1, title: "Add this device in HRMS",          desc: 'Use "Scan for Devices" below (recommended) or click "Add Device" manually and enter IP, port, timezone.' },
  { n: 2, title: "Install the local agent on a LAN PC", desc: "Copy agent.py to any Windows/Linux machine on the same network as the biometric device. Run: pip install pyzk requests" },
  { n: 3, title: "Configure agent .env",              desc: "Set DEVICE_IP, DEVICE_PORT, API_URL (your HRMS server URL), API_SECRET, and DEVICE_TOKEN (shown once after adding this device — see \"Regenerate Token\" if you missed it) in the .env file next to agent.py." },
  { n: 4, title: "Sync enrolled users from device",   desc: "Run:  python agent.py --sync-users  — imports fingerprint/face users from the device into HRMS so you can map them to employees." },
  { n: 5, title: "Map employees → device users",      desc: 'Open Mapping for this device → click "Fetch from Device" → assign each device user to an HRMS employee → Save.' },
  { n: 6, title: "Schedule agent for attendance",     desc: "Use Windows Task Scheduler or cron to run  python agent.py  every 15 minutes. Attendance punches will sync automatically." },
];

function SetupChecklist() {
  return (
    <div className="space-y-3">
      {SETUP_STEPS.map((step) => (
        <div key={step.n} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
            {step.n}
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{step.title}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ClaimModalProps {
  device: DiscoveredDevice;
  onClose: () => void;
  onClaimed: (token?: string, deviceName?: string) => void;
}

function ClaimModal({ device, onClose, onClaimed }: ClaimModalProps) {
  const [name,     setName]     = useState(device.name);
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [commKey,  setCommKey]  = useState("0");
  const [interval, setInterval] = useState(15);

  const claimMutation = useMutation({
    mutationFn: () => claimDiscoveredDevice(device.id, { name, timezone, comm_key: commKey || "0", sync_interval_minutes: interval }),
    onSuccess: (result) => { toast.success("Device added", `${name} has been added to your account.`); onClaimed(result.agent_token, result.name); },
    onError: (e: Error) => toast.error("Claim failed", e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-bold text-[var(--text)]">Confirm Device</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Found at <span className="font-mono">{device.ip_address}:{device.port}</span>
          {device.device_model ? ` · ${device.device_model}` : ""}
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Device Name</label>
            <FormInput className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Timezone</label>
            <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Comm Key (0 = none)</label>
              <FormInput className={inputClass} value={commKey} onChange={(e) => setCommKey(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Sync every (min)</label>
              <FormInput className={inputClass} type="number" min={1} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => claimMutation.mutate()} disabled={!name || claimMutation.isPending}>
            {claimMutation.isPending ? "Adding…" : "Add to My Devices"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DevicesListPage() {
  const queryClient = useQueryClient();
  const canCreate = useAuthStore((s) => s.hasPermission("biometric.create"));
  const canEdit   = useAuthStore((s) => s.hasPermission("biometric.edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("biometric.delete"));
  const canSync   = useAuthStore((s) => s.hasPermission("biometric.sync"));
  const canMap    = useAuthStore((s) => s.hasPermission("biometric.manage_mapping"));

  const [modalOpen,    setModalOpen]    = useState(false);
  const [editing,      setEditing]      = useState<BiometricDevice | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null);
  const [testingId,    setTestingId]    = useState<number | null>(null);
  const [guideOpen,    setGuideOpen]    = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [claimTarget,  setClaimTarget]  = useState<DiscoveredDevice | null>(null);
  const [revealToken,  setRevealToken]  = useState<{ deviceName: string; token: string } | null>(null);

  const query = useQuery({ queryKey: ["biometric-devices"], queryFn: listBiometricDevices });

  const unconfiguredQuery = useQuery({
    queryKey: ["biometric-devices-unconfigured"],
    queryFn: listUnconfiguredDevices,
    enabled: showDiscover,
  });

  const createMutation = useMutation({
    mutationFn: createBiometricDevice,
    onSuccess: (device) => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setModalOpen(false);
      toast.success("Device added", "Biometric device added successfully.");
      if (device.agent_token) setRevealToken({ deviceName: device.name, token: device.agent_token });
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: regenerateAgentToken,
    onSuccess: (device) => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      if (device.agent_token) setRevealToken({ deviceName: device.name, token: device.agent_token });
    },
    onError: (e: Error) => toast.error("Regenerate failed", e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateBiometricDevicePayload> }) => updateBiometricDevice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setModalOpen(false); setEditing(null);
      toast.success("Device updated", "Biometric device updated successfully.");
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setError(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBiometricDevice,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["biometric-devices"] }); toast.success("Deleted", "Device removed."); },
    onError: (e: Error) => { toast.error("Delete failed", e.message); setError(e.message); },
  });

  const syncMutation = useMutation({
    mutationFn: triggerBiometricDeviceSync,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["biometric-devices"] }); toast.info("Sync started", "Check Sync Logs for progress."); },
    onError: (e: Error) => { toast.error("Sync failed", e.message); setError(e.message); },
  });

  async function handleTestConnection(id: number) {
    setTestingId(id); setError(null);
    try {
      const result = await testBiometricDeviceConnection(id);
      if (result.success) { queryClient.invalidateQueries({ queryKey: ["biometric-devices"] }); setSuccessMsg(result.message || "Connection successful."); }
      else setError(result.message || "Connection failed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally { setTestingId(null); }
  }

  function handleClaimed(token?: string, deviceName?: string) {
    setClaimTarget(null);
    queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
    queryClient.invalidateQueries({ queryKey: ["biometric-devices-unconfigured"] });
    if (token) setRevealToken({ deviceName: deviceName ?? "device", token });
  }

  const { sorted: devices, sort, toggle: toggleSort } = useTableSort(query.data ?? [], "name", {
    connection: (d) => (d.connection_type === "tcp" ? `${d.ip_address}:${d.port}` : "Cloud API"),
  });
  const unconfigured = unconfiguredQuery.data ?? [];
  const hasTcpDevice = devices.some((d) => d.connection_type === "tcp");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Biometric Devices" subtitle="Manage biometric attendance device connections and synchronization" />
        <div className="flex gap-2">
          <Link to="/attendance/biometric-devices/sync-logs">
            <Button variant="outline">Sync Logs</Button>
          </Link>
          {canCreate && (
            <>
              <Button variant="outline" onClick={() => setShowDiscover((v) => !v)}>
                {showDiscover ? "Hide Discovered" : "Scan for Devices"}
              </Button>
              <Button variant="primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
                Add Device
              </Button>
            </>
          )}
        </div>
      </div>

      {error      && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {successMsg && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMsg}</div>}

      {/* Discovered devices panel */}
      {showDiscover && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Devices Found by Agent Scan</p>
              <p className="text-xs text-[var(--muted)]">
                Run <code className="rounded bg-[var(--border)] px-1 py-0.5">python agent.py --discover</code> on the LAN PC first, then click Refresh.
              </p>
            </div>
            <Button variant="ghost" onClick={() => unconfiguredQuery.refetch()}>Refresh</Button>
          </div>
          {unconfiguredQuery.isLoading ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">Loading…</p>
          ) : unconfigured.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center">
              <p className="text-sm font-medium text-[var(--text)]">No discovered devices waiting.</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Run <code className="rounded bg-[var(--border)] px-1 py-0.5">python agent.py --discover</code> on the LAN PC, then click Refresh.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="rtable w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-2 pr-4">IP Address</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Auto Name</th>
                    <th className="py-2 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unconfigured.map((d) => (
                    <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                      <td data-label="IP Address" className="py-2 pr-4 font-mono text-xs">{d.ip_address}:{d.port}</td>
                      <td data-label="Model" className="py-2 pr-4 text-[var(--muted)]">{d.device_model || "—"}</td>
                      <td data-label="Auto Name" className="py-2 pr-4">{d.name}</td>
                      <td data-label="Action" className="py-2 pr-4 text-right">
                        <Button variant="primary" onClick={() => setClaimTarget(d)}>Add to My Devices</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Setup guide banner */}
      {hasTcpDevice && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--text)]"
            onClick={() => setGuideOpen((o) => !o)}
          >
            <span>📋 TCP/IP Device Setup Guide</span>
            <span className="text-[var(--muted)]">{guideOpen ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {guideOpen && <div className="border-t border-[var(--border)] px-4 pb-4 pt-3"><SetupChecklist /></div>}
        </div>
      )}

      {/* Device list */}
      <Card>
        {query.isLoading ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">Loading devices...</div>
        ) : query.isError ? (
          <div className="py-10 text-center text-sm text-red-600">
            Failed to load devices.{" "}<button className="underline" onClick={() => query.refetch()}>Retry</button>
          </div>
        ) : devices.length === 0 ? (
          <div className="py-10 px-6">
            <p className="mb-6 text-center text-sm font-semibold text-[var(--text)]">
              No biometric devices configured yet. Follow the steps below to get started:
            </p>
            <SetupChecklist />
            {canCreate && (
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="outline" onClick={() => setShowDiscover(true)}>Scan for Devices (Recommended)</Button>
                <Button variant="primary" onClick={() => setModalOpen(true)}>Add Device Manually</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Connection" sortKey="connection" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <SortableTh label="Sync Mode" sortKey="sync_mode" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b border-[var(--border)] last:border-0">
                    <td data-label="Name" className="py-3 pr-4 font-medium">{device.name}</td>
                    <td data-label="Connection" className="py-3 pr-4">
                      {device.connection_type === "tcp" ? `${device.ip_address}:${device.port}` : "Cloud API"}
                    </td>
                    <td data-label="Status" className="py-3 pr-4"><DeviceStatusCard device={device} /></td>
                    <td data-label="Sync Mode" className="py-3 pr-4 capitalize">{device.sync_mode}</td>
                    <td data-label="Actions" className="py-3 pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => handleTestConnection(device.id)} disabled={testingId === device.id}>
                          {testingId === device.id ? "Testing..." : "Test"}
                        </Button>
                        {device.connection_type === "tcp" ? (
                          <span className="inline-flex items-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-3 py-1.5 text-xs font-medium text-[var(--primary)]">
                            Agent Managed
                          </span>
                        ) : (
                          canSync && (
                            <Button variant="outline" onClick={() => syncMutation.mutate(device.id)} disabled={syncMutation.isPending}>
                              Sync Now
                            </Button>
                          )
                        )}
                        {canMap && (
                          <Link to={`/attendance/biometric-devices/${device.id}/mapping`}>
                            <Button variant="outline">Mapping</Button>
                          </Link>
                        )}
                        {canEdit && device.connection_type === "tcp" && (
                          <Button
                            variant="outline"
                            onClick={() => { if (confirm(`Regenerate the agent token for "${device.name}"? The old token will stop working immediately.`)) regenerateTokenMutation.mutate(device.id); }}
                            disabled={regenerateTokenMutation.isPending}
                          >
                            Regenerate Token
                          </Button>
                        )}
                        {canEdit && (
                          <Button variant="outline" onClick={() => { setEditing(device); setModalOpen(true); }}>Edit</Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" onClick={() => { if (confirm(`Remove device "${device.name}"?`)) deleteMutation.mutate(device.id); }}>
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
          onSubmit={(payload) => { if (editing) { updateMutation.mutate({ id: editing.id, payload }); } else { createMutation.mutate(payload); } }}
          submitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {claimTarget && (
        <ClaimModal device={claimTarget} onClose={() => setClaimTarget(null)} onClaimed={handleClaimed} />
      )}

      {revealToken && (
        <TokenRevealModal
          deviceName={revealToken.deviceName}
          token={revealToken.token}
          onClose={() => setRevealToken(null)}
        />
      )}
    </div>
  );
}
