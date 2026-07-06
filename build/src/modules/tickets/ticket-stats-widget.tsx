import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Ticket } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { getTicketStats } from "@/services/ticket-service";
import { SummaryCard, ChartCard } from "@/modules/dashboard/dashboard-widgets";

declare const Chart: any;

// ─── Chart.js CDN loader ──────────────────────────────────────────────────────

function useChartJs(cb: () => void, deps: unknown[]) {
  useEffect(() => {
    if (typeof Chart !== "undefined") { cb(); return; }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="chart.umd.min.js"]'
    );
    if (existing) {
      existing.addEventListener("load", cb);
      return () => existing.removeEventListener("load", cb);
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    s.onload = cb;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Department bar chart ─────────────────────────────────────────────────────

function DeptBarChart({ items }: { items: { name: string; count: number }[] }) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

  useChartJs(() => {
    if (!ref.current || !items.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, {
      type: "bar",
      data: {
        labels: items.map(i => i.name),
        datasets: [{
          label: "Tickets",
          data: items.map(i => i.count),
          backgroundColor: items.map((_, idx) => COLORS[idx % COLORS.length] + "cc"),
          borderColor:     items.map((_, idx) => COLORS[idx % COLORS.length]),
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#94a3b8", padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: { ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { color: "rgba(0,0,0,0.04)" } },
          y: { ticks: { font: { size: 11 }, color: "#6b7280" }, grid: { display: false } },
        },
      },
    });
  }, [items]);

  useEffect(() => () => { if (inst.current) inst.current.destroy(); }, []);

  if (!items.length) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-[var(--muted)]">
        No department data yet.
      </div>
    );
  }
  return <div className="h-36"><canvas ref={ref} /></div>;
}

// ─── Priority donut chart ─────────────────────────────────────────────────────

function PriorityDonut({ items }: { items: { priority: string; count: number }[] }) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);
  const PRIORITY_COLORS: Record<string, string> = {
    low:      "#6b7280",
    medium:   "#3b82f6",
    high:     "#f97316",
    critical: "#ef4444",
  };

  useChartJs(() => {
    if (!ref.current || !items.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, {
      type: "doughnut",
      data: {
        labels: items.map(i => i.priority.charAt(0).toUpperCase() + i.priority.slice(1)),
        datasets: [{
          data: items.map(i => i.count),
          backgroundColor: items.map(i => PRIORITY_COLORS[i.priority] ?? "#6b7280"),
          borderWidth: 3,
          borderColor: "#fff",
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11 }, padding: 12, usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#94a3b8", padding: 10, cornerRadius: 8 },
        },
      },
    });
  }, [items]);

  useEffect(() => () => { if (inst.current) inst.current.destroy(); }, []);

  if (!items.length) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-[var(--muted)]">
        No priority data yet.
      </div>
    );
  }
  return <div className="h-44"><canvas ref={ref} /></div>;
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function TicketStatsWidget() {
  const canManage = useAuthStore(s =>
    s.hasPermission("tickets.manage_settings")
  );
  const canView = useAuthStore(s =>
    s.hasPermission("tickets.view") ||
    s.hasPermission("tickets.create") ||
    s.hasPermission("tickets.manage_settings")
  );

  const { data: stats, isLoading } = useQuery({
    queryKey: ["ticket-stats"],
    queryFn: getTicketStats,
    enabled: canView,
  });

  if (!canView) return null;

  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
        ))}
      </div>
    );
  }

  // ── Mini version for employees (tickets.view only) ────────────────────────
  if (!canManage) {
    return (
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
          My Tickets
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard
            title="My Open Tickets"
            value={String(stats.my_open)}
            hint="Awaiting resolution"
            icon={<Ticket className="h-5 w-5" />}
            accent="amber"
          />
          <SummaryCard
            title="My Resolved"
            value={String(stats.my_resolved)}
            hint="Tickets resolved"
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="emerald"
          />
        </div>
      </section>
    );
  }

  // ── Full version for managers / admins ────────────────────────────────────
  return (
    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        Ticket Overview
      </p>
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Left column — stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            title="Open"
            value={String(stats.open)}
            hint="Awaiting response"
            icon={<AlertCircle className="h-5 w-5" />}
            accent="amber"
          />
          <SummaryCard
            title="In Progress"
            value={String(stats.in_progress)}
            hint="Being handled"
            icon={<Clock className="h-5 w-5" />}
            accent="blue"
          />
          <SummaryCard
            title="Resolved This Month"
            value={String(stats.resolved_this_month)}
            hint={new Date().toLocaleString("default", { month: "long" })}
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="emerald"
          />
          <SummaryCard
            title="Avg Resolution"
            value={`${stats.avg_resolution_days}d`}
            hint="Average days to resolve"
            icon={<Ticket className="h-5 w-5" />}
            accent="violet"
          />
        </div>

        {/* Right column — charts */}
        <div className="flex flex-col gap-4">
          <ChartCard title="Tickets by Department" subtitle="All statuses">
            <DeptBarChart items={stats.by_department} />
          </ChartCard>
          <ChartCard title="Tickets by Priority" subtitle="Distribution">
            <PriorityDonut items={stats.by_priority} />
          </ChartCard>
        </div>

      </div>
    </section>
  );
}
