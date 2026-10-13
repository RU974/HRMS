import { SortableTh, useTableSort, type SortState } from "@/components/tables/use-table-sort";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrencyStore, CURRENCY_OPTIONS } from "@/store/currency-store";
import { useAuthStore } from "@/store/auth-store";
import { Package, Tag, ClipboardList, Plus, Edit2, Trash2, RotateCcw, CornerDownLeft, Eye, QrCode, Printer, Search, Download, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormInput } from "@/components/forms/form-input";
import { LoadingSpinner } from "@/components/loaders/loading-spinner";
import { toast } from "@/components/notifications/toast";
import {
  listInventoryCategories,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
  listInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restoreInventoryItem,
  importInventoryItems,
  importInventoryCategories,
  type InventoryImportResult,
  listInventoryAssignments,
  createInventoryAssignment,
  returnInventoryAssignment,
  updateInventoryAssignment,
  type InventoryCategoryItem,
  type InventoryItem,
  type InventoryAssignment,
} from "@/services/inventory-service";
import { getEmployeesPage } from "@/services/employee-service";
import { downloadCsv } from "@/modules/reports/report-utils";
import { INVENTORY_CSV_HEADERS, CATEGORY_CSV_HEADERS, csvToInventoryRows, csvToCategoryRows, safeCsvCell } from "./inventory-csv";

type Tab = "items" | "categories" | "assignments";

const CONDITIONS = ["new", "good", "fair", "poor"] as const;
const CONDITION_LABELS: Record<string, string> = { new: "New", good: "Good", fair: "Fair", poor: "Poor" };
const CONDITION_COLORS: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-700",
  good: "bg-blue-100 text-blue-700",
  fair: "bg-yellow-100 text-yellow-700",
  poor: "bg-red-100 text-red-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>{label}</span>;
}

function StatusBadge({ status }: { status: "assigned" | "returned" }) {
  return (
    <Badge
      label={status === "assigned" ? "Assigned" : "Returned"}
      colorClass={status === "assigned" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}
    />
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">{children}</section>;
}

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return <tr><td colSpan={cols} className="p-6 text-center text-[var(--muted)]">{message}</td></tr>;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function usePagination<T>(rows: T[], resetKey: unknown) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => { setPage(1); }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return { page: safePage, setPage, pageSize, setPageSize, totalPages, paged, total: rows.length };
}

function Pagination({
  page,
  setPage,
  pageSize,
  setPageSize,
  totalPages,
  total,
}: {
  page: number;
  setPage: (updater: (p: number) => number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalPages: number;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
        Rows per page
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(() => 1); }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages}</p>
        <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← Prev
        </Button>
        <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next →
        </Button>
      </div>
    </div>
  );
}

function TableHead({ cols, sortKeys, sort, onSort }: { cols: string[]; sortKeys?: (string | null)[]; sort?: SortState; onSort?: (key: string) => void }) {
  return (
    <thead>
      <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {cols.map((c, i) => {
          const cls = `p-3 ${i === cols.length - 1 ? "text-right" : ""}`;
          const key = sortKeys?.[i];
          return key && sort && onSort
            ? <SortableTh key={i} label={c} sortKey={key} sort={sort} onSort={onSort} className={cls} />
            : <th key={i} className={cls}>{c}</th>;
        })}
      </tr>
    </thead>
  );
}

// ─── QR Code ─────────────────────────────────────────────────────────────────

function buildQRPayload(item: InventoryItem, companyId: string | null | undefined) {
  return JSON.stringify({
    cid: companyId ?? null,
    iid: item.id,
    n: item.name,
    ...(item.sku ? { sku: item.sku } : {}),
    ...(item.location ? { loc: item.location } : {}),
    cond: item.condition,
    qty: item.quantity,
    ...(item.assigned_to_name ? { assigned: item.assigned_to_name } : {}),
  });
}

function QRLabel({ item, companyId }: { item: InventoryItem; companyId: string | null | undefined }) {
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <QRCodeSVG
        value={buildQRPayload(item, companyId)}
        size={180}
        level="M"
        includeMargin
      />
      <div className="w-full text-center space-y-0.5">
        <p className="font-semibold text-sm">{item.name}</p>
        {item.sku && <p className="text-xs text-[var(--muted)]">SKU: {item.sku}</p>}
        {item.location && <p className="text-xs text-[var(--muted)]">Location: {item.location}</p>}
        <p className="text-xs text-[var(--muted)] capitalize">Condition: {item.condition}</p>
        <p className="text-xs text-[var(--muted)]">Qty: {item.quantity}</p>
        {item.assigned_to_name && <p className="text-xs text-[var(--muted)]">Assigned to: {item.assigned_to_name}</p>}
      </div>
    </div>
  );
}

function QRModal({ item, companyId, onClose }: { item: InventoryItem; companyId: string | null | undefined; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=520");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Label – ${item.name}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: flex-start; padding: 16px; }
            .label { display: flex; flex-direction: column; align-items: center; gap: 10px; border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: 220px; }
            .label svg { width: 180px; height: 180px; }
            .label-name { font-weight: 600; font-size: 13px; text-align: center; }
            .label-meta { font-size: 11px; color: #666; text-align: center; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  function handleDownload() {
    const svg = printRef.current?.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${item.sku ?? item.id}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal title={`QR Code – ${item.name}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div ref={printRef} className="rounded-xl border border-[var(--border)] bg-white">
          <QRLabel item={item} companyId={companyId} />
        </div>

        <p className="text-xs text-[var(--muted)] text-center max-w-xs">
          Scan this QR code to identify the item. It encodes the company, item ID, name, SKU, location and condition.
        </p>

        <div className="flex gap-2 w-full">
          <Button variant="outline" className="flex-1" onClick={handleDownload}>
            <QrCode className="mr-1.5 h-4 w-4" /> Download SVG
          </Button>
          <Button className="flex-1" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" /> Print Label
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkQRSheet({ items, companyId, onClose, label = "All" }: { items: InventoryItem[]; companyId: string | null | undefined; onClose: () => void; label?: string }) {
  const activeItems = items.filter((i) => !i.deleted_at);
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Inventory QR Sheet</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: system-ui, sans-serif; padding: 16px; }
            h2 { margin-bottom: 16px; font-size: 16px; }
            .grid { display: flex; flex-wrap: wrap; gap: 12px; }
            .label { display: flex; flex-direction: column; align-items: center; gap: 6px; border: 1px solid #ccc; border-radius: 6px; padding: 12px; width: 180px; page-break-inside: avoid; }
            .label svg { width: 150px; height: 150px; }
            .label-name { font-weight: 600; font-size: 12px; text-align: center; word-break: break-word; }
            .label-meta { font-size: 10px; color: #555; text-align: center; }
            @media print { body { padding: 8px; } h2 { display: none; } }
          </style>
        </head>
        <body>
          <h2>Inventory QR Code Sheet (${activeItems.length} items)</h2>
          <div class="grid">${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  return (
    <Modal title={`Print ${label} QR Codes (${activeItems.length} items)`} onClose={onClose}>
      <div className="space-y-4">
        {activeItems.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No active items to print.</p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 max-h-64 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {activeItems.map((item) => (
                  <div key={item.id} className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] p-2">
                    <QRCodeSVG value={buildQRPayload(item, companyId)} size={64} level="M" />
                    <p className="text-[10px] text-center font-medium leading-tight line-clamp-2">{item.name}</p>
                    {item.sku && <p className="text-[9px] text-[var(--muted)]">{item.sku}</p>}
                    {item.assigned_to_name && <p className="text-[9px] text-[var(--muted)]">{item.assigned_to_name}</p>}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Opens a printable sheet with {activeItems.length} item QR labels. Each label includes name, SKU, location, quantity, and the assigned person (if any).
            </p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrint} disabled={activeItems.length === 0}>
            <Printer className="mr-1.5 h-4 w-4" /> Print {label} Labels
          </Button>
        </div>

        {/* Off-screen source for printing: real rendered SVGs, no external network dependency */}
        <div ref={printRef} style={{ position: "absolute", left: -99999, top: -99999 }} aria-hidden>
          {activeItems.map((item) => (
            <div className="label" key={item.id}>
              <QRCodeSVG value={buildQRPayload(item, companyId)} size={150} level="M" includeMargin />
              <p className="label-name">{item.name}</p>
              {item.sku && <p className="label-meta">SKU: {item.sku}</p>}
              {item.location && <p className="label-meta">Loc: {item.location}</p>}
              {item.assigned_to_name && <p className="label-meta">Assigned: {item.assigned_to_name}</p>}
              <p className="label-meta">Qty: {item.quantity}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(null);

  const query = useQuery({ queryKey: ["inventory", "categories"], queryFn: listInventoryCategories });
  const { sorted: categories, sort, toggle: toggleSort } = useTableSort(query.data ?? [], "name", {
    items_count: (c) => c.items_count ?? 0,
  });
  const { page, setPage, pageSize, setPageSize, totalPages, paged, total } = usePagination(categories, "categories");

  const saveMutation = useMutation({
    mutationFn: () =>
      editId
        ? updateInventoryCategory(editId, form)
        : createInventoryCategory(form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory", "categories"] });
      toast.success("Saved", editId ? "Category updated." : "Category created.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Error", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInventoryCategory,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory", "categories"] });
      toast.success("Deleted", "Category removed.");
    },
    onError: (e: Error) => toast.error("Cannot delete", e.message),
  });

  const importMutation = useMutation({
    mutationFn: importInventoryCategories,
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["inventory", "categories"] });
      setImportResult(result);
      if (result.created > 0 && result.failed === 0) toast.success("Imported", `${result.created} category(ies) imported.`);
    },
    onError: (e: Error) => toast.error("Import failed", e.message),
  });

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const rows = csvToCategoryRows(await file.text());
      if (rows.length === 0) { toast.error("Import failed", "The file has no data rows."); return; }
      if (rows.length > 1000) { toast.error("Import failed", "A maximum of 1000 rows can be imported at once."); return; }
      importMutation.mutate(rows);
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  function handleExport() {
    const rows = categories.map((c) => [safeCsvCell(c.name), safeCsvCell(c.description)]);
    downloadCsv(`inventory-categories-${new Date().toISOString().slice(0, 10)}.csv`, [...CATEGORY_CSV_HEADERS], rows);
  }

  function handleTemplate() {
    downloadCsv("inventory-categories-template.csv", [...CATEGORY_CSV_HEADERS], [["Electronics", "Laptops, phones and accessories"]]);
  }

  function openNew() { setEditId(null); setForm({ name: "", description: "" }); setOpen(true); }
  function openEdit(c: InventoryCategoryItem) { setEditId(c.id); setForm({ name: c.name, description: c.description ?? "" }); setOpen(true); }

  return (
    <>
      <SectionCard>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-[var(--muted)]">{total} categories</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleImportFile(e)} />
            <Button variant="outline" onClick={handleTemplate} title="Download a sample CSV with the expected columns">
              <Download className="mr-1.5 h-4 w-4" />Template
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
              <Upload className="mr-1.5 h-4 w-4" />{importMutation.isPending ? "Importing…" : "Import"}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={categories.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />Export
            </Button>
            <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />New Category</Button>
          </div>
        </div>
        <table className="rtable w-full text-sm">
          <TableHead cols={["Name", "Description", "Items", "Actions"]} sortKeys={["name", "description", "items_count", null]} sort={sort} onSort={toggleSort} />
          <tbody>
            {query.isLoading && <tr><td colSpan={4} className="p-6 text-center"><LoadingSpinner /></td></tr>}
            {paged.map((cat) => (
              <tr key={cat.id} className="border-b border-[var(--border)]/60 last:border-0 hover:bg-[var(--border)]/10">
                <td className="p-3 font-medium" data-label="Name">{cat.name}</td>
                <td className="p-3 text-[var(--muted)]" data-label="Description">{cat.description ?? "—"}</td>
                <td className="p-3" data-label="Items">{cat.items_count ?? 0}</td>
                <td className="p-3" data-label="Actions">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => openEdit(cat)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" onClick={() => void deleteMutation.mutateAsync(cat.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!query.isLoading && total === 0 && <EmptyRow cols={4} message="No categories yet. Create one to get started." />}
          </tbody>
        </table>
        <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} total={total} />
      </SectionCard>

      {importResult && (
        <Modal title="Import Results" onClose={() => setImportResult(null)}>
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold text-emerald-600">{importResult.created}</span> imported, <span className="font-semibold text-red-600">{importResult.failed}</span> failed.</p>
            {importResult.errors.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
                {importResult.errors.map((er, idx) => (
                  <li key={idx} className="text-[var(--muted)]">Row {er.row}: {er.message}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end"><Button onClick={() => setImportResult(null)}>Close</Button></div>
          </div>
        </Modal>
      )}

      {open && (
        <Modal title={editId ? "Edit Category" : "New Category"} onClose={() => setOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium">Name <span className="text-red-500">*</span></label>
              <FormInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <textarea
                className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Items Tab ────────────────────────────────────────────────────────────────

interface ItemForm {
  name: string;
  category_id: string;
  sku: string;
  quantity: string;
  unit_cost: string;
  location: string;
  condition: string;
  description: string;
}

function ItemsTab() {
  const qc = useQueryClient();
  const { formatAmount, currency } = useCurrencyStore();
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const currencySymbol = CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol ?? currency;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [qrItem, setQrItem] = useState<InventoryItem | null>(null);
  const [showBulkQR, setShowBulkQR] = useState(false);
  const [printSelected, setPrintSelected] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ItemForm>({
    name: "", category_id: "", sku: "", quantity: "0",
    unit_cost: "0", location: "", condition: "good", description: "",
  });

  const categoriesQ = useQuery({ queryKey: ["inventory", "categories"], queryFn: listInventoryCategories });
  const itemsQ = useQuery({
    queryKey: ["inventory", "items", showArchived],
    queryFn: () => listInventoryItems({ include_archived: showArchived }),
  });
  const detailQ = useQuery({
    queryKey: ["inventory", "items", detailId],
    queryFn: () => getInventoryItem(detailId!),
    enabled: detailId !== null,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        category_id: form.category_id ? Number(form.category_id) : null,
        sku: form.sku || undefined,
        quantity: Number(form.quantity),
        unit_cost: Number(form.unit_cost),
        location: form.location || undefined,
        condition: form.condition,
        description: form.description || undefined,
      };
      return editId ? updateInventoryItem(editId, payload) : createInventoryItem(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory", "items"] });
      toast.success("Saved", editId ? "Item updated." : "Item created.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Error", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory", "items"] });
      toast.success("Archived", "Item archived.");
    },
    onError: (e: Error) => toast.error("Cannot archive", e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreInventoryItem,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory", "items"] });
      toast.success("Restored", "Item restored.");
    },
    onError: (e: Error) => toast.error("Error", e.message),
  });

  const importMutation = useMutation({
    mutationFn: importInventoryItems,
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["inventory", "items"] });
      setImportResult(result);
      if (result.created > 0 && result.failed === 0) toast.success("Imported", `${result.created} item(s) imported.`);
    },
    onError: (e: Error) => toast.error("Import failed", e.message),
  });

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const rows = csvToInventoryRows(await file.text());
      if (rows.length === 0) { toast.error("Import failed", "The file has no data rows."); return; }
      if (rows.length > 1000) { toast.error("Import failed", "A maximum of 1000 rows can be imported at once."); return; }
      importMutation.mutate(rows);
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  function handleExport() {
    const rows = filteredItems.map((i) => [
      safeCsvCell(i.name), safeCsvCell(i.sku), safeCsvCell(i.category?.name), i.quantity, i.unit_cost,
      safeCsvCell(i.location), i.condition, safeCsvCell(i.description),
    ]);
    downloadCsv(`inventory-items-${new Date().toISOString().slice(0, 10)}.csv`, [...INVENTORY_CSV_HEADERS], rows);
  }

  function handleTemplate() {
    downloadCsv("inventory-import-template.csv", [...INVENTORY_CSV_HEADERS], [["Dell Laptop", "LAP-001", "Electronics", 5, 1200, "Head Office", "new", "14 inch"]]);
  }

  function openNew() {
    setEditId(null);
    setForm({ name: "", category_id: "", sku: "", quantity: "0", unit_cost: "0", location: "", condition: "good", description: "" });
    setOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditId(item.id);
    setForm({
      name: item.name,
      category_id: item.category_id ? String(item.category_id) : "",
      sku: item.sku ?? "",
      quantity: String(item.quantity),
      unit_cost: String(item.unit_cost),
      location: item.location ?? "",
      condition: item.condition,
      description: item.description ?? "",
    });
    setOpen(true);
  }

  function f(field: keyof ItemForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  const categories = Array.isArray(categoriesQ.data) ? categoriesQ.data : [];
  const items = Array.isArray(itemsQ.data) ? itemsQ.data : [];

  const q = search.trim().toLowerCase();
  const filteredBase = q
    ? items.filter((item) =>
        [item.name, item.sku, item.location, item.category?.name, item.condition, item.assigned_to_name]
          .some((v) => (v ?? "").toString().toLowerCase().includes(q))
      )
    : items;
  const { sorted: filteredItems, sort, toggle: toggleSort } = useTableSort(filteredBase, "name", {
    category: (i) => i.category?.name,
    unit_cost: (i) => Number(i.unit_cost),
  });

  const { page, setPage, pageSize, setPageSize, totalPages, paged, total } = usePagination(filteredItems, `${showArchived}|${q}`);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allPagedSelected = paged.length > 0 && paged.every((item) => selectedIds.has(item.id));

  function toggleSelectAllPaged() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPagedSelected) {
        paged.forEach((item) => next.delete(item.id));
      } else {
        paged.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }

  const selectedItems = items.filter((item) => selectedIds.has(item.id));

  return (
    <>
      <SectionCard>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--muted)]">{total} item{total !== 1 ? "s" : ""}</p>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, location, category…"
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-sm"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
            Show archived
          </label>
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={() => setPrintSelected(true)}>
              <Printer className="mr-1.5 h-4 w-4" />Print Selected ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowBulkQR(true)} disabled={items.length === 0}>
            <QrCode className="mr-1.5 h-4 w-4" />Print All QR
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleImportFile(e)} />
          <Button variant="outline" onClick={handleTemplate} title="Download a sample CSV with the expected columns">
            <Download className="mr-1.5 h-4 w-4" />Template
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
            <Upload className="mr-1.5 h-4 w-4" />{importMutation.isPending ? "Importing…" : "Import"}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={filteredItems.length === 0}>
            <Download className="mr-1.5 h-4 w-4" />Export
          </Button>
          <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />New Item</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                <th className="p-3 w-10">
                  <input type="checkbox" className="rounded" checked={allPagedSelected} onChange={toggleSelectAllPaged} aria-label="Select all on page" />
                </th>
                {([["Name", "name"], ["SKU", "sku"], ["Category", "category"], ["Qty", "quantity"], ["Available", "quantity_available"], ["Cost", "unit_cost"], ["Location", "location"], ["Condition", "condition"]] as const).map(([c, k]) => (
                  <SortableTh key={c} label={c} sortKey={k} sort={sort} onSort={toggleSort} />
                ))}
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {itemsQ.isLoading && <tr><td colSpan={10} className="p-6 text-center"><LoadingSpinner /></td></tr>}
              {paged.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-[var(--border)]/60 last:border-0 hover:bg-[var(--border)]/10 ${item.deleted_at ? "opacity-50" : ""}`}
                >
                  <td className="p-3">
                    <input type="checkbox" className="rounded" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.name}`} />
                  </td>
                  <td className="p-3 font-medium" data-label="Name">{item.name}</td>
                  <td className="p-3 text-[var(--muted)]" data-label="SKU">{item.sku ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)]" data-label="Category">{item.category?.name ?? "—"}</td>
                  <td className="p-3" data-label="Qty">{item.quantity}</td>
                  <td className="p-3" data-label="Available">
                    <span className={item.quantity_available === 0 ? "text-red-500 font-medium" : ""}>
                      {item.quantity_available}
                    </span>
                  </td>
                  <td className="p-3" data-label="Cost">{formatAmount(Number(item.unit_cost))}</td>
                  <td className="p-3 text-[var(--muted)]" data-label="Location">{item.location ?? "—"}</td>
                  <td className="p-3" data-label="Condition">
                    <Badge label={CONDITION_LABELS[item.condition] ?? item.condition} colorClass={CONDITION_COLORS[item.condition] ?? ""} />
                  </td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDetailId(item.id)} title="View Details"><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="outline" onClick={() => setQrItem(item)} title="QR Code"><QrCode className="h-3.5 w-3.5" /></Button>
                      {item.deleted_at ? (
                        <Button variant="outline" onClick={() => void restoreMutation.mutateAsync(item.id)} title="Restore"><RotateCcw className="h-3.5 w-3.5" /></Button>
                      ) : (
                        <>
                          <Button variant="outline" onClick={() => openEdit(item)} title="Edit"><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)} title="Archive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!itemsQ.isLoading && total === 0 && <EmptyRow cols={10} message="No items found." />}
            </tbody>
          </table>
        </div>
        <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} total={total} />
      </SectionCard>

      {/* Create / Edit Modal */}
      {open && (
        <Modal title={editId ? "Edit Item" : "New Item"} onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveMutation.mutateAsync(); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="col-span-1 sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Name <span className="text-red-500">*</span></label>
                <FormInput value={form.name} onChange={f("name")} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Category</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={form.category_id} onChange={f("category_id")}>
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">SKU</label>
                <FormInput value={form.sku} onChange={f("sku")} placeholder="e.g. LAP-001" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Quantity <span className="text-red-500">*</span></label>
                <FormInput type="number" min={0} value={form.quantity} onChange={f("quantity")} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Unit Cost ({currencySymbol})</label>
                <FormInput type="number" min={0} step="0.01" value={form.unit_cost} onChange={f("unit_cost")} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Location</label>
                <FormInput value={form.location} onChange={f("location")} placeholder="e.g. Store Room A" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Condition</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={form.condition} onChange={f("condition")}>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Description</label>
                <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={form.description} onChange={f("description")} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailId !== null && (
        <Modal title="Item Details" onClose={() => setDetailId(null)}>
          {detailQ.isLoading && <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><LoadingSpinner /> Loading…</div>}
          {detailQ.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-[var(--muted)]">Name</span><p className="font-medium">{detailQ.data.name}</p></div>
                <div><span className="text-[var(--muted)]">SKU</span><p className="font-medium">{detailQ.data.sku ?? "—"}</p></div>
                <div><span className="text-[var(--muted)]">Category</span><p className="font-medium">{detailQ.data.category?.name ?? "—"}</p></div>
                <div><span className="text-[var(--muted)]">Condition</span><p><Badge label={CONDITION_LABELS[detailQ.data.condition]} colorClass={CONDITION_COLORS[detailQ.data.condition]} /></p></div>
                <div><span className="text-[var(--muted)]">Total Qty</span><p className="font-medium">{detailQ.data.quantity}</p></div>
                <div><span className="text-[var(--muted)]">Available</span><p className="font-medium">{detailQ.data.quantity_available}</p></div>
                <div><span className="text-[var(--muted)]">Unit Cost</span><p className="font-medium">{formatAmount(Number(detailQ.data.unit_cost))}</p></div>
                <div><span className="text-[var(--muted)]">Location</span><p className="font-medium">{detailQ.data.location ?? "—"}</p></div>
                {detailQ.data.description && <div className="col-span-2"><span className="text-[var(--muted)]">Description</span><p>{detailQ.data.description}</p></div>}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Assignment History</p>
                <div className="overflow-auto rounded-xl border border-[var(--border)]">
                  <table className="rtable w-full text-sm">
                    <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]"><th className="p-2">Employee</th><th className="p-2">Qty</th><th className="p-2">Assigned</th><th className="p-2">Returned</th><th className="p-2">Status</th></tr></thead>
                    <tbody>
                      {(detailQ.data.assignments ?? []).map((a) => (
                        <tr key={a.id} className="border-b border-[var(--border)]/60 last:border-0">
                          <td className="p-2" data-label="Employee">{a.employee?.name ?? "—"}</td>
                          <td className="p-2" data-label="Qty">{a.quantity}</td>
                          <td className="p-2" data-label="Assigned">{a.assigned_date}</td>
                          <td className="p-2" data-label="Returned">{a.returned_date ?? "—"}</td>
                          <td className="p-2" data-label="Status"><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                      {(detailQ.data.assignments ?? []).length === 0 && <tr><td colSpan={5} className="p-4 text-center text-[var(--muted)]">No assignments yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* QR Code Modal */}
      {qrItem && (
        <QRModal item={qrItem} companyId={companyId} onClose={() => setQrItem(null)} />
      )}

      {/* Import result modal */}
      {importResult && (
        <Modal title="Import Results" onClose={() => setImportResult(null)}>
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold text-emerald-600">{importResult.created}</span> imported, <span className="font-semibold text-red-600">{importResult.failed}</span> failed.</p>
            {importResult.errors.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
                {importResult.errors.map((er, idx) => (
                  <li key={idx} className="text-[var(--muted)]">Row {er.row}: {er.message}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end"><Button onClick={() => setImportResult(null)}>Close</Button></div>
          </div>
        </Modal>
      )}

      {/* Bulk QR Sheet Modal */}
      {showBulkQR && (
        <BulkQRSheet items={items} companyId={companyId} onClose={() => setShowBulkQR(false)} />
      )}

      {/* Print Selected QR Sheet Modal */}
      {printSelected && (
        <BulkQRSheet items={selectedItems} companyId={companyId} onClose={() => setPrintSelected(false)} label="Selected" />
      )}
    </>
  );
}

// ─── Assignments Tab ──────────────────────────────────────────────────────────

function AssignmentsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "returned">("all");
  const [search, setSearch] = useState("");
  const [returnModal, setReturnModal] = useState<{ id: number; itemName: string } | null>(null);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnNotes, setReturnNotes] = useState("");
  const [assignForm, setAssignForm] = useState({
    item_id: "",
    employee_id: "",
    quantity: "1",
    assigned_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [editTarget, setEditTarget] = useState<InventoryAssignment | null>(null);
  const [editForm, setEditForm] = useState({ employee_id: "", quantity: "1", assigned_date: "", returned_date: "", notes: "" });

  const openEdit = (a: InventoryAssignment) => {
    setEditTarget(a);
    setEditForm({
      employee_id: String(a.employee_id),
      quantity: String(a.quantity),
      assigned_date: a.assigned_date?.slice(0, 10) ?? "",
      returned_date: a.returned_date?.slice(0, 10) ?? "",
      notes: a.notes ?? "",
    });
  };

  const itemsQ = useQuery({ queryKey: ["inventory", "items", false], queryFn: () => listInventoryItems() });
  const employeesQ = useQuery({ queryKey: ["employees", "all"], queryFn: () => getEmployeesPage({ per_page: 500 }) });
  const assignmentsQ = useQuery({
    queryKey: ["inventory", "assignments", statusFilter],
    queryFn: () => listInventoryAssignments(statusFilter !== "all" ? { status: statusFilter } : undefined),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      createInventoryAssignment({
        item_id: Number(assignForm.item_id),
        employee_id: Number(assignForm.employee_id),
        quantity: Number(assignForm.quantity),
        assigned_date: assignForm.assigned_date,
        notes: assignForm.notes || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Assigned", "Item assigned successfully.");
      setOpen(false);
      setAssignForm({ item_id: "", employee_id: "", quantity: "1", assigned_date: new Date().toISOString().slice(0, 10), notes: "" });
    },
    onError: (e: Error) => toast.error("Assignment failed", e.message),
  });

  const returnMutation = useMutation({
    mutationFn: (id: number) =>
      returnInventoryAssignment(id, { returned_date: returnDate, notes: returnNotes || undefined }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Returned", "Item marked as returned.");
      setReturnModal(null);
    },
    onError: (e: Error) => toast.error("Return failed", e.message),
  });

  const editMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No assignment selected");
      const isReturned = editTarget.status === "returned";
      return updateInventoryAssignment(editTarget.id, {
        assigned_date: editForm.assigned_date,
        notes: editForm.notes || null,
        ...(isReturned
          ? { returned_date: editForm.returned_date }
          : { employee_id: Number(editForm.employee_id), quantity: Number(editForm.quantity) }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Updated", "Assignment updated successfully.");
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Update failed", e.message),
  });

  const assignQuery = search.trim().toLowerCase();
  const filteredAssignments = (Array.isArray(assignmentsQ.data) ? assignmentsQ.data : []).filter((a) =>
    !assignQuery ||
    [a.item?.name, a.item?.sku, a.employee?.name, a.notes, a.status, a.assigned_date, a.returned_date]
      .some((v) => v?.toLowerCase().includes(assignQuery)),
  );
  const { sorted: assignments, sort, toggle: toggleSort } = useTableSort(filteredAssignments, "employee", {
    item: (a) => a.item?.name,
    sku: (a) => a.item?.sku,
    employee: (a) => a.employee?.name,
  });
  const availableItems = (Array.isArray(itemsQ.data) ? itemsQ.data : []).filter((i) => !i.deleted_at);
  const employees = employeesQ.data?.data ?? [];
  const { page, setPage, pageSize, setPageSize, totalPages, paged, total } = usePagination(assignments, `${statusFilter}|${assignQuery}`);

  return (
    <>
      <SectionCard>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="mr-auto flex gap-2">
            {(["all", "assigned", "returned"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${statusFilter === s ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--border)]/40"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by item, SKU, employee, notes…"
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-sm"
            />
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Assign Item</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <TableHead cols={["Item", "SKU", "Employee", "Qty", "Assigned", "Returned", "Status", "Notes", "Actions"]} sortKeys={["item", "sku", "employee", "quantity", "assigned_date", "returned_date", "status", null, null]} sort={sort} onSort={toggleSort} />
            <tbody>
              {assignmentsQ.isLoading && <tr><td colSpan={9} className="p-6 text-center"><LoadingSpinner /></td></tr>}
              {paged.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border)]/60 last:border-0 hover:bg-[var(--border)]/10">
                  <td className="p-3 font-medium" data-label="Item">{a.item?.name ?? "—"}</td>
                  <td className="p-3 text-[var(--muted)]" data-label="SKU">{a.item?.sku ?? "—"}</td>
                  <td className="p-3" data-label="Employee">{a.employee?.name ?? "—"}</td>
                  <td className="p-3" data-label="Qty">{a.quantity}</td>
                  <td className="p-3" data-label="Assigned">{a.assigned_date}</td>
                  <td className="p-3 text-[var(--muted)]" data-label="Returned">{a.returned_date ?? "—"}</td>
                  <td className="p-3" data-label="Status"><StatusBadge status={a.status} /></td>
                  <td className="p-3 text-[var(--muted)] max-w-[150px] truncate" data-label="Notes">{a.notes ?? "—"}</td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => openEdit(a)}>
                        <Edit2 className="mr-1.5 h-3.5 w-3.5" />Edit
                      </Button>
                      {a.status === "assigned" && (
                        <Button
                          variant="outline"
                          onClick={() => { setReturnModal({ id: a.id, itemName: a.item?.name ?? "Item" }); setReturnDate(new Date().toISOString().slice(0, 10)); setReturnNotes(""); }}
                        >
                          <CornerDownLeft className="mr-1.5 h-3.5 w-3.5" />Return
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!assignmentsQ.isLoading && total === 0 && <EmptyRow cols={9} message="No assignments found." />}
            </tbody>
          </table>
        </div>
        <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} total={total} />
      </SectionCard>

      {/* Assign Modal */}
      {open && (
        <Modal title="Assign Item to Employee" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void assignMutation.mutateAsync(); }}>
            <div>
              <label className="mb-1 block text-sm font-medium">Item <span className="text-red-500">*</span></label>
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={assignForm.item_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, item_id: e.target.value }))}
                required
              >
                <option value="">— Select item —</option>
                {availableItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}{i.sku ? ` (${i.sku})` : ""} — {i.quantity_available} available
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Employee <span className="text-red-500">*</span></label>
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={assignForm.employee_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, employee_id: e.target.value }))}
                required
              >
                <option value="">— Select employee —</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Quantity <span className="text-red-500">*</span></label>
                <FormInput type="number" min={1} value={assignForm.quantity} onChange={(e) => setAssignForm((p) => ({ ...p, quantity: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Assigned Date <span className="text-red-500">*</span></label>
                <FormInput type="date" value={assignForm.assigned_date} onChange={(e) => setAssignForm((p) => ({ ...p, assigned_date: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={assignForm.notes} onChange={(e) => setAssignForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={assignMutation.isPending}>{assignMutation.isPending ? "Assigning…" : "Assign"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <Modal title={`Edit Assignment: ${editTarget.item?.name ?? "Item"}`} onClose={() => setEditTarget(null)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void editMutation.mutateAsync(); }}>
            {editTarget.status === "assigned" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Employee <span className="text-red-500">*</span></label>
                  <select
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                    value={editForm.employee_id}
                    onChange={(e) => setEditForm((p) => ({ ...p, employee_id: e.target.value }))}
                    required
                  >
                    {!employees.some((emp) => emp.id === editTarget.employee_id) && (
                      <option value={editTarget.employee_id}>{editTarget.employee?.name ?? "Current employee"}</option>
                    )}
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Quantity <span className="text-red-500">*</span></label>
                  <FormInput type="number" min={1} value={editForm.quantity} onChange={(e) => setEditForm((p) => ({ ...p, quantity: e.target.value }))} required />
                </div>
              </>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Assigned Date <span className="text-red-500">*</span></label>
                <FormInput type="date" value={editForm.assigned_date} onChange={(e) => setEditForm((p) => ({ ...p, assigned_date: e.target.value }))} required />
              </div>
              {editTarget.status === "returned" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Returned Date <span className="text-red-500">*</span></label>
                  <FormInput type="date" value={editForm.returned_date} onChange={(e) => setEditForm((p) => ({ ...p, returned_date: e.target.value }))} required />
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={editMutation.isPending}>{editMutation.isPending ? "Saving…" : "Save Changes"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Return Modal */}
      {returnModal && (
        <Modal title={`Return: ${returnModal.itemName}`} onClose={() => setReturnModal(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void returnMutation.mutateAsync(returnModal.id);
            }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium">Return Date <span className="text-red-500">*</span></label>
              <FormInput type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReturnModal(null)}>Cancel</Button>
              <Button type="submit" disabled={returnMutation.isPending}>{returnMutation.isPending ? "Returning…" : "Confirm Return"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards() {
  const { formatAmount } = useCurrencyStore();
  const itemsQ = useQuery({ queryKey: ["inventory", "items", false], queryFn: () => listInventoryItems() });
  const assignmentsQ = useQuery({ queryKey: ["inventory", "assignments", "all"], queryFn: () => listInventoryAssignments() });

  const items = Array.isArray(itemsQ.data) ? itemsQ.data : [];
  const assignments = Array.isArray(assignmentsQ.data) ? assignmentsQ.data : [];
  const totalItems = items.length;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const activeAssignments = assignments.filter((a) => a.status === "assigned").length;
  const totalValue = items.reduce((s, i) => s + i.quantity * Number(i.unit_cost), 0);

  const cards = [
    { label: "Total Items", value: totalItems, icon: Package, color: "text-blue-500" },
    { label: "Total Units", value: totalQty, icon: ClipboardList, color: "text-emerald-500" },
    { label: "Active Assignments", value: activeAssignments, icon: Tag, color: "text-amber-500" },
    { label: "Inventory Value", value: formatAmount(totalValue), icon: Package, color: "text-purple-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          {itemsQ.isLoading ? <div className="h-7 w-16 animate-pulse rounded bg-[var(--border)]" /> : <p className="text-2xl font-bold">{value}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "items", label: "Items", icon: Package },
  { key: "categories", label: "Categories", icon: Tag },
  { key: "assignments", label: "Assignments", icon: ClipboardList },
];

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>("items");

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Manage assets, equipment, and item assignments." />

      <SummaryCards />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition ${tab === key ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--border)]/40"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "items" && <ItemsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "assignments" && <AssignmentsTab />}
    </div>
  );
}
