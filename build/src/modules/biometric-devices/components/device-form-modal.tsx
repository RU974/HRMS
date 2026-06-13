import { useState } from "react";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import {
  BiometricDevice,
  ConnectionType,
  CreateBiometricDevicePayload,
  SyncMode,
} from "@/services/biometric-device-service";

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

const DEVICE_MODELS = ["ZKTeco", "eSSL", "Hikvision", "Suprema", "Anviz", "Other"];
const TIMEZONES = ["Asia/Karachi", "UTC", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata"];

export interface DeviceFormModalProps {
  initial?: BiometricDevice | null;
  onClose: () => void;
  onSubmit: (payload: CreateBiometricDevicePayload) => void;
  submitting?: boolean;
}

export function DeviceFormModal({ initial, onClose, onSubmit, submitting }: DeviceFormModalProps) {
  const [form, setForm] = useState<CreateBiometricDevicePayload>({
    name: initial?.name ?? "",
    branch_id: initial?.branch_id ?? null,
    connection_type: initial?.connection_type ?? "tcp",
    ip_address: initial?.ip_address ?? "",
    port: initial?.port ?? 4370,
    comm_key: initial?.comm_key ?? "",
    device_model: initial?.device_model ?? DEVICE_MODELS[0],
    api_endpoint: initial?.api_endpoint ?? "",
    api_key: initial?.api_key ?? "",
    sync_mode: initial?.sync_mode ?? "scheduled",
    sync_interval_minutes: initial?.sync_interval_minutes ?? 15,
    timezone: initial?.timezone ?? "Asia/Karachi",
  });

  const isTcp = form.connection_type === "tcp";

  function update<K extends keyof CreateBiometricDevicePayload>(key: K, value: CreateBiometricDevicePayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <Modal title={initial ? "Edit Device" : "Add Biometric Device"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Device Name">
          <FormInput
            className={inputClass}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </FormField>

        <FormField label="Connection Type">
          <div className="flex gap-3">
            {(["tcp", "cloud_api"] as ConnectionType[]).map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="connection_type"
                  checked={form.connection_type === type}
                  onChange={() => update("connection_type", type)}
                />
                {type === "tcp" ? "TCP/IP Device" : "Cloud API"}
              </label>
            ))}
          </div>
        </FormField>

        {isTcp ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="IP Address">
                <FormInput
                  className={inputClass}
                  value={form.ip_address ?? ""}
                  onChange={(e) => update("ip_address", e.target.value)}
                  placeholder="192.168.1.201"
                  required
                />
              </FormField>
              <FormField label="Port">
                <FormInput
                  className={inputClass}
                  type="number"
                  value={form.port ?? 4370}
                  onChange={(e) => update("port", Number(e.target.value))}
                />
              </FormField>
            </div>
            <FormField label="Communication Key">
              <FormInput
                className={inputClass}
                value={form.comm_key ?? ""}
                onChange={(e) => update("comm_key", e.target.value)}
                placeholder="Optional comm key / password"
              />
            </FormField>
            <FormField label="Device Model">
              <select
                className={inputClass}
                value={form.device_model ?? DEVICE_MODELS[0]}
                onChange={(e) => update("device_model", e.target.value)}
              >
                {DEVICE_MODELS.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </FormField>
          </>
        ) : (
          <>
            <FormField label="API Endpoint URL">
              <FormInput
                className={inputClass}
                value={form.api_endpoint ?? ""}
                onChange={(e) => update("api_endpoint", e.target.value)}
                placeholder="https://device-cloud.example.com/api"
                required
              />
            </FormField>
            <FormField label="API Key">
              <FormInput
                className={inputClass}
                type="password"
                value={form.api_key ?? ""}
                onChange={(e) => update("api_key", e.target.value)}
                required
              />
            </FormField>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Sync Mode">
            <select
              className={inputClass}
              value={form.sync_mode}
              onChange={(e) => update("sync_mode", e.target.value as SyncMode)}
            >
              <option value="realtime">Real-time</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </FormField>
          {form.sync_mode === "scheduled" && (
            <FormField label="Sync Interval (minutes)">
              <FormInput
                className={inputClass}
                type="number"
                min={1}
                value={form.sync_interval_minutes ?? 15}
                onChange={(e) => update("sync_interval_minutes", Number(e.target.value))}
              />
            </FormField>
          )}
        </div>

        <FormField label="Device Timezone">
          <select
            className={inputClass}
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Saving..." : initial ? "Save Changes" : "Add Device"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
