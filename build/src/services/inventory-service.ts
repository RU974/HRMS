import { apiClient } from "./api-client";

export interface InventoryCategoryItem {
  id: number;
  name: string;
  description?: string | null;
  items_count?: number;
}

export interface InventoryItem {
  id: number;
  company_id: number;
  category_id?: number | null;
  category?: { id: number; name: string } | null;
  name: string;
  sku?: string | null;
  quantity: number;
  quantity_available: number;
  unit_cost: number;
  location?: string | null;
  condition: "new" | "good" | "fair" | "poor";
  description?: string | null;
  deleted_at?: string | null;
  active_assignments_count?: number;
  assigned_to_name?: string | null;
  assignments?: InventoryAssignment[];
}

export interface InventoryAssignment {
  id: number;
  item_id: number;
  employee_id: number;
  quantity: number;
  assigned_date: string;
  returned_date?: string | null;
  status: "assigned" | "returned";
  notes?: string | null;
  item?: { id: number; name: string; sku?: string | null } | null;
  employee?: { id: number; name: string } | null;
}

// ── Categories ────────────────────────────────────────────────────────────────

export const listInventoryCategories = () =>
  apiClient<InventoryCategoryItem[]>("/inventory/categories");

export const createInventoryCategory = (payload: { name: string; description?: string }) =>
  apiClient<InventoryCategoryItem>("/inventory/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateInventoryCategory = (id: number, payload: { name: string; description?: string }) =>
  apiClient<InventoryCategoryItem>(`/inventory/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteInventoryCategory = (id: number) =>
  apiClient<null>(`/inventory/categories/${id}`, { method: "DELETE" });

// ── Items ─────────────────────────────────────────────────────────────────────

export const listInventoryItems = (params?: { category_id?: number; include_archived?: boolean }) => {
  const qs = new URLSearchParams();
  if (params?.category_id) qs.set("category_id", String(params.category_id));
  if (params?.include_archived) qs.set("include_archived", "1");
  const query = qs.toString();
  return apiClient<InventoryItem[]>(`/inventory/items${query ? `?${query}` : ""}`);
};

export const getInventoryItem = (id: number) =>
  apiClient<InventoryItem>(`/inventory/items/${id}`);

export const createInventoryItem = (payload: {
  name: string;
  category_id?: number | null;
  sku?: string;
  quantity: number;
  unit_cost?: number;
  location?: string;
  condition?: string;
  description?: string;
}) =>
  apiClient<InventoryItem>("/inventory/items", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateInventoryItem = (
  id: number,
  payload: {
    name: string;
    category_id?: number | null;
    sku?: string;
    quantity: number;
    unit_cost?: number;
    location?: string;
    condition?: string;
    description?: string;
  }
) =>
  apiClient<InventoryItem>(`/inventory/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export interface InventoryImportResult {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export const importInventoryItems = (rows: Record<string, string>[]) =>
  apiClient<InventoryImportResult>("/inventory/items/import", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });

export const deleteInventoryItem =(id: number) =>
  apiClient<null>(`/inventory/items/${id}`, { method: "DELETE" });

export const restoreInventoryItem = (id: number) =>
  apiClient<InventoryItem>(`/inventory/items/${id}/restore`, { method: "POST" });

// ── Assignments ───────────────────────────────────────────────────────────────

export const listInventoryAssignments = (params?: {
  status?: "assigned" | "returned";
  item_id?: number;
  employee_id?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.item_id) qs.set("item_id", String(params.item_id));
  if (params?.employee_id) qs.set("employee_id", String(params.employee_id));
  const query = qs.toString();
  return apiClient<InventoryAssignment[]>(`/inventory/assignments${query ? `?${query}` : ""}`);
};

export const createInventoryAssignment = (payload: {
  item_id: number;
  employee_id: number;
  quantity: number;
  assigned_date: string;
  notes?: string;
}) =>
  apiClient<InventoryAssignment>("/inventory/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const returnInventoryAssignment = (id: number, payload: { returned_date: string; notes?: string }) =>
  apiClient<InventoryAssignment>(`/inventory/assignments/${id}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
