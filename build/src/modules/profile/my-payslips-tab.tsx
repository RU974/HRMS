import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/notifications/toast";
import { downloadPayslipPdf, listPayslips, type Payslip } from "@/services/payroll-service";

function StatusBadge({ status }: { status: Payslip["status"] }) {
  const tone =
    status === "issued"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "cancelled"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-100 text-slate-700";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

export function MyPayslipsTab() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const payslipsQ = useQuery({
    queryKey: ["my-payslips"],
    queryFn: async () => (await listPayslips()).data ?? [],
  });

  const payslips = payslipsQ.data ?? [];

  async function handleDownload(item: Payslip) {
    setDownloadingId(item.id);
    try {
      await downloadPayslipPdf(item.id, item.slip_number, "classic");
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold">My Payslips</h3>
      <p className="mb-4 text-sm text-[var(--muted)]">View and download your own payslips.</p>

      {payslipsQ.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : payslips.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No payslips have been issued to you yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="p-3">Slip #</th>
                <th className="p-3">Period</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/50">
                  <td className="p-3 font-medium" data-label="Slip #">{item.slip_number}</td>
                  <td className="p-3" data-label="Period">
                    {item.payroll ? `${item.payroll.month}/${item.payroll.year}` : `#${item.payroll_id}`}
                  </td>
                  <td className="p-3" data-label="Issue Date">{item.issue_date.slice(0, 10)}</td>
                  <td className="p-3" data-label="Status"><StatusBadge status={item.status} /></td>
                  <td className="p-3 text-right" data-label="Actions">
                    <Button
                      variant="outline"
                      className="text-xs px-2 py-1"
                      disabled={item.status !== "issued" || downloadingId === item.id}
                      onClick={() => void handleDownload(item)}
                    >
                      {downloadingId === item.id ? "Preparing…" : "Download PDF"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
