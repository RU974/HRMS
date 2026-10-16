import { apiClient } from "./api-client";

export type ConnectionType = "tcp" | "cloud_api";
export type SyncMode = "realtime" | "scheduled";
export type DeviceStatus = "online" | "offline" | "never_synced";
export type SyncLogStatus = "success" | "partial" | "failed" | "in_progress";
export type AttendanceSource = "biometric" | "manual" | "mobile" | "web";

export interface BiometricDevice {
  id: number;
  name: string;
  branch_id: number | null;
  branch_name?: string;
  connection_type: ConnectionType;
  // TCP/IP device fields
  ip_address?: string | null;
  port?: number | null;
  comm_key?: string | null;
  device_model?: string | null;
  // Cloud API fields
  api_endpoint?: string | null;
  api_key?: string | null;
  // Sync settings
  sync_mode: SyncMode;
  sync_interval_minutes?: number | null;
  timezone: string;
  status: DeviceStatus;
  last_sync_at?: string | null;
  /** False = never alert when this device stops syncing. */
  monitor_sync?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateBiometricDevicePayload {
  name: string;
  branch_id?: number | null;
  connection_type: ConnectionType;
  ip_address?: string | null;
  port?: number | null;
  comm_key?: string | null;
  device_model?: string | null;
  api_endpoint?: string | null;
  api_key?: string | null;
  sync_mode: SyncMode;
  sync_interval_minutes?: number | null;
  timezone: string;
  monitor_sync?: boolean;
}

export type UpdateBiometricDevicePayload = Partial<CreateBiometricDevicePayload>;

export interface TestConnectionResult {
  success: boolean;
  message: string;
  device_time?: string | null;
}

export interface TriggerSyncResult {
  sync_log_id: number;
  status: SyncLogStatus;
}

export interface SyncLog {
  id: number;
  device_id: number;
  device_name?: string;
  started_at: string;
  finished_at?: string | null;
  records_fetched: number;
  records_matched: number;
  records_unmatched: number;
  status: SyncLogStatus;
  error_message?: string | null;
}

export interface SyncLogFilters {
  device_id?: number;
  status?: SyncLogStatus;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export interface EmployeeDeviceMapping {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  device_id: number;
  device_user_id: string;
  card_number?: string | null;
}

export interface SaveMappingPayload {
  employee_id: number;
  device_id: number;
  device_user_id: string;
  card_number?: string | null;
}

export interface AutoMatchSuggestion {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  device_user_id: string;
  confidence: number;
}

export interface PaginatedResult<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

// Device CRUD
export const listBiometricDevices = () =>
  apiClient<BiometricDevice[]>("/biometric-devices");

export const getBiometricDevice = (id: number) =>
  apiClient<BiometricDevice>(`/biometric-devices/${id}`);

export const createBiometricDevice = (payload: CreateBiometricDevicePayload) =>
  apiClient<BiometricDeviceWithToken>("/biometric-devices", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateBiometricDevice = (id: number, payload: UpdateBiometricDevicePayload) =>
  apiClient<BiometricDevice>(`/biometric-devices/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteBiometricDevice = (id: number) =>
  apiClient<null>(`/biometric-devices/${id}`, { method: "DELETE" });

// Connection test & sync
export const testBiometricDeviceConnection = (id: number) =>
  apiClient<TestConnectionResult>(`/biometric-devices/${id}/test-connection`, {
    method: "POST",
  });

export const triggerBiometricDeviceSync = (id: number) =>
  apiClient<TriggerSyncResult>(`/biometric-devices/${id}/sync`, { method: "POST" });

// Sync logs
export const listSyncLogs = (filters: SyncLogFilters = {}) => {
  const query = new URLSearchParams();
  if (filters.device_id) query.set("device_id", String(filters.device_id));
  if (filters.status) query.set("status", filters.status);
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  if (filters.page) query.set("page", String(filters.page));
  const queryString = query.toString();
  return apiClient<PaginatedResult<SyncLog>>(
    `/biometric-devices/sync-logs${queryString ? `?${queryString}` : ""}`
  );
};

// Employee mapping
export const listEmployeeMappings = (deviceId: number) =>
  apiClient<EmployeeDeviceMapping[]>(`/biometric-devices/${deviceId}/mappings`);

export const saveEmployeeMapping = (payload: SaveMappingPayload) =>
  apiClient<EmployeeDeviceMapping>("/biometric-devices/mappings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteEmployeeMapping = (id: number) =>
  apiClient<null>(`/biometric-devices/mappings/${id}`, { method: "DELETE" });

export const getAutoMatchSuggestions = (deviceId: number) =>
  apiClient<AutoMatchSuggestion[]>(`/biometric-devices/${deviceId}/mappings/auto-match`);

export const bulkImportEmployeeMappings = (deviceId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient<{ imported: number; skipped: number; errors: string[] }>(
    `/biometric-devices/${deviceId}/mappings/bulk-import`,
    { method: "POST", body: formData }
  );
};

export interface DeviceUser {
  device_user_id: string;
  name: string | null;
  mapped: boolean;
  employee_id: number | null;
  employee_name: string | null;
}

export const listDeviceUsers = (deviceId: number) =>
  apiClient<DeviceUser[]>(`/biometric-devices/${deviceId}/device-users`);

export interface AddDeviceUserPayload {
  device_user_id: string;
  name?: string;
  employee_id?: number | null;
  card_number?: string | null;
}

export interface DeviceCommand {
  id: number;
  device_id: number;
  type: "add_user" | "remove_user";
  device_user_id: string;
  payload?: { name?: string | null } | null;
  status: "pending" | "sent" | "done" | "failed";
  result_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export const addDeviceUser = (deviceId: number, payload: AddDeviceUserPayload) =>
  apiClient<DeviceCommand>(`/biometric-devices/${deviceId}/device-users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const removeDeviceUser = (deviceId: number, deviceUserId: string) =>
  apiClient<DeviceCommand>(
    `/biometric-devices/${deviceId}/device-users/${encodeURIComponent(deviceUserId)}`,
    { method: "DELETE" }
  );

export const listDeviceCommands = (deviceId: number) =>
  apiClient<DeviceCommand[]>(`/biometric-devices/${deviceId}/commands`);

// Auto-discovery
export interface DiscoveredDevice {
  id: number;
  name: string;
  ip_address: string;
  port: number;
  device_model: string | null;
  status: DeviceStatus;
  company_id: string | null;
}

export const listUnconfiguredDevices = () =>
  apiClient<DiscoveredDevice[]>("/biometric-devices/unconfigured");

export const claimDiscoveredDevice = (
  id: number,
  payload: {
    name: string;
    timezone: string;
    comm_key?: string | null;
    sync_interval_minutes?: number;
  }
) =>
  apiClient<BiometricDeviceWithToken>(`/biometric-devices/${id}/claim`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

// Agent token — shown once by the API right after create/claim/regenerate.
export interface BiometricDeviceWithToken extends BiometricDevice {
  agent_token?: string;
}

export const regenerateAgentToken = (id: number) =>
  apiClient<BiometricDeviceWithToken>(`/biometric-devices/${id}/regenerate-token`, {
    method: "POST",
  });
