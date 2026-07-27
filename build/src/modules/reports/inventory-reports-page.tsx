import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { getInventoryReportSummary } from "@/services/report-service";
import { listInventoryAssignments } from "@/services/inventory-service";
import { ReportCrudSection } from "@/modules/reports/report-crud-section";
import { ReportDrillDownPanel } from "@/modules/reports/report-drilldown";
import { ReportExportButtons } from "@/modules/reports/report-export-buttons";
import { Chart } from "@/lib/chart-setup";

const CATEGORY_COLORS = ["#22c55e", "#0ea5e9", "#f59e0b", "#6366f1", "#ef4444", "#14b8a6", "#a855f7"];
const CONDITION_COLORS: Record<string, string> = {
  new: "#22c55e",
  good: "#0ea5e9",
  fair: "#f59e0b",
  poor: "#ef4444",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function CategoryValueChart({ rows }: { rows: { category: string; total_value: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current || !rows.length) return;
    if (instanceRef.current) instanceRef.current.destroy();
    instanceRef.current = new Chart(ref.current, {
      type: "doughnut",
      data: {
        labels: rows.map((r) => r.category),
        datasets: [{ data: rows.map((r) => r.total_value), backgroundColor: CATEGORY_COLORS, borderWidth: 2, hoverOffset: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: { position: "right", labels: { font: { size: 11 }, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}` } },
        },
      },
    });
    return () => { if (instanceRef.current) instanceRef.current.destroy(); };
  }, [rows]);

  if (!rows.length) return <p className="text-sm text-[var(--muted)]">No data.</p>;
  return <div className="h-56"><canvas ref={ref} /></div>;
}

export function InventoryReportsPage() {
  const [threshold, setThreshold] = useState(5);
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "inventory", "summary", threshold],
    queryFn: () => getInventoryReportSummary(threshold),
  });

  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const byCategory = data?.by_category ?? [];
  const byCondition = data?.by_condition ?? [];
  const lowStock = data?.low_stock ?? [];
  const assignmentStatus = data?.assignment_status ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Inventory Reports" subtitle="Stock levels, valuation, and assignment status across all categories." />
        <ReportExportButtons path="/reports/inventory" filename="inventory-report" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Total Items</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading ? "—" : totals?.total_items ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Total Quantity</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading ? "—" : totals?.total_quantity ?? 0}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {isLoading ? "" : `${totals?.total_available ?? 0} available · ${totals?.total_assigned ?? 0} assigned`}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Total Value</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading ? "—" : formatCurrency(totals?.total_value ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Low Stock Items</p>
          <p className="mt-2 text-2xl font-semibold text-amber-500">{isLoading ? "—" : lowStock.length}</p>
          <label className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
            Threshold ≤
            <input
              type="number"
              min={0}
              value={threshold}
              onChange={(event) => setThreshold(Math.max(0, Number(event.target.value) || 0))}
              className="h-7 w-16 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
            />
          </label>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold">Value by Category</h3>
          {isLoading && <div className="h-56 animate-pulse rounded-xl bg-[var(--border)]" />}
          {!isLoading && <CategoryValueChart rows={byCategory} />}
        </Card>

        <Card>
          <h3 className="mb-4 text-base font-semibold">Stock by Condition</h3>
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Condition</th>
                  <th className="p-3 text-right">Items</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    {[1, 2, 3, 4].map((j) => <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>)}
                  </tr>
                ))}
                {!isLoading && byCondition.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--muted)]">No data available.</td></tr>
                )}
                {byCondition.map((row) => (
                  <tr key={row.condition} className="border-b border-[var(--border)]/50">
                    <td className="p-3" data-label="Condition">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CONDITION_COLORS[row.condition] ?? "#94a3b8" }} />
                        <span className="capitalize font-medium">{row.condition}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right" data-label="Items">{row.item_count}</td>
                    <td className="p-3 text-right" data-label="Quantity">{row.total_quantity}</td>
                    <td className="p-3 text-right" data-label="Value">{formatCurrency(row.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-base font-semibold">Stock Summary by Category</h3>
        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Items</th>
                <th className="p-3 text-right">Total Qty</th>
                <th className="p-3 text-right">Available</th>
                <th className="p-3 text-right">Assigned</th>
                <th className="p-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50">
                  {[1, 2, 3, 4, 5, 6].map((j) => <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>)}
                </tr>
              ))}
              {!isLoading && byCategory.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--muted)]">No data available.</td></tr>
              )}
              {byCategory.map((row, i) => (
                <tr
                  key={row.category}
                  className="cursor-pointer border-b border-[var(--border)]/50 hover:bg-[var(--border)]/20"
                  onClick={() => setDrillCategory(row.category)}
                >
                  <td className="p-3" data-label="Category">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      <span className="font-medium">{row.category}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right" data-label="Items">{row.item_count}</td>
                  <td className="p-3 text-right" data-label="Total Qty">{row.total_quantity}</td>
                  <td className="p-3 text-right" data-label="Available">{row.total_available}</td>
                  <td className="p-3 text-right" data-label="Assigned">{row.total_assigned}</td>
                  <td className="p-3 text-right font-semibold" data-label="Value">{formatCurrency(row.total_value)}</td>
                </tr>
              ))}
              {byCategory.length > 0 && totals && (
                <tr className="font-semibold">
                  <td className="p-3" data-label="Category">Total</td>
                  <td className="p-3 text-right" data-label="Items">{totals.total_items}</td>
                  <td className="p-3 text-right" data-label="Total Qty">{totals.total_quantity}</td>
                  <td className="p-3 text-right" data-label="Available">{totals.total_available}</td>
                  <td className="p-3 text-right" data-label="Assigned">{totals.total_assigned}</td>
                  <td className="p-3 text-right" data-label="Value">{formatCurrency(totals.total_value)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold">Assignment Status</h3>
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Records</th>
                  <th className="p-3 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && assignmentStatus.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-sm text-[var(--muted)]">No assignments recorded.</td></tr>
                )}
                {assignmentStatus.map((row) => (
                  <tr key={row.status} className="border-b border-[var(--border)]/50">
                    <td className="p-3 capitalize font-medium" data-label="Status">{row.status}</td>
                    <td className="p-3 text-right" data-label="Records">{row.count}</td>
                    <td className="p-3 text-right" data-label="Quantity">{row.total_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            Low Stock Alerts
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">≤ {threshold}</span>
          </h3>
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Item</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && lowStock.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-sm text-[var(--muted)]">Nothing running low.</td></tr>
                )}
                {lowStock.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/50">
                    <td className="p-3" data-label="Item">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-[var(--muted)]">{item.category?.name ?? "Uncategorized"}</p>
                    </td>
                    <td className="p-3 text-[var(--muted)]" data-label="SKU">{item.sku ?? "—"}</td>
                    <td className="p-3 text-right font-semibold text-amber-500" data-label="Available">{item.quantity_available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {drillCategory && (
        <ReportDrillDownPanel
          title={`${drillCategory} — Assignments`}
          queryKey={["reports", "inventory", "drilldown", drillCategory]}
          queryFn={async () => listInventoryAssignments({ status: "assigned" })}
          rowKey={(row) => row.id}
          viewAllHref="/inventory"
          onClose={() => setDrillCategory(null)}
          columns={[
            { header: "Item", render: (row) => row.item?.name ?? "—" },
            { header: "Employee", render: (row) => row.employee?.name ?? "—" },
            { header: "Quantity", render: (row) => row.quantity },
            { header: "Status", render: (row) => <span className="capitalize">{row.status}</span> },
          ]}
        />
      )}

      <ReportCrudSection reportType="inventory" moduleKey="inventory" />
    </div>
  );
}
