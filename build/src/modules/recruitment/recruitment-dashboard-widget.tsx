import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChartCard } from "@/modules/dashboard/dashboard-widgets";
import { candidateStageLabels, getRecruitmentOverview } from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";

const stageBar: Record<string, string> = {
  applied: "bg-slate-400",
  screening: "bg-blue-500",
  interview: "bg-violet-500",
  offer: "bg-amber-500",
  hired: "bg-emerald-500",
  rejected: "bg-red-500",
};

/** Compact hiring snapshot for the management dashboard. Renders nothing without access or when the module is unlicensed. */
export function RecruitmentDashboardWidget() {
  const canView = useAuthStore((state) => state.hasPermission("recruitment:view"));
  const query = useQuery({
    queryKey: ["recruitment", "overview"],
    queryFn: getRecruitmentOverview,
    enabled: canView,
    retry: false,
  });

  if (!canView || query.isError || !query.data) return null;

  const data = query.data;
  const total = data.pipeline.reduce((sum, item) => sum + item.count, 0);
  const attention = Object.values(data.attention).reduce((sum, count) => sum + count, 0);

  return (
    <ChartCard
      title="Recruitment"
      subtitle="Hiring pipeline at a glance"
      action={<Link to="/recruitment" className="text-xs font-semibold text-[var(--primary)] hover:underline">Open →</Link>}
    >
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-2xl font-bold">{data.open_jobs}</p><p className="text-xs text-[var(--muted)]">Open jobs</p></div>
        <div><p className="text-2xl font-bold">{data.active_candidates}</p><p className="text-xs text-[var(--muted)]">Active candidates</p></div>
        <div><p className="text-2xl font-bold">{data.interviews_this_week}</p><p className="text-xs text-[var(--muted)]">Interviews this week</p></div>
        <div><p className="text-2xl font-bold">{data.offers_pending}</p><p className="text-xs text-[var(--muted)]">Offers in progress</p></div>
      </div>

      {total > 0 && (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-[var(--border)]" role="img" aria-label="Candidates by stage">
            {data.pipeline.filter((item) => item.count > 0).map((item) => (
              <div key={item.stage} className={stageBar[item.stage]} style={{ width: `${(item.count / total) * 100}%` }} title={`${candidateStageLabels[item.stage]}: ${item.count}`} />
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {data.pipeline.filter((item) => item.count > 0).map((item) => `${candidateStageLabels[item.stage]} ${item.count}`).join(" · ")}
          </p>
        </>
      )}

      {attention > 0 && (
        <p className="mt-3 text-xs">
          <Link to="/recruitment" className="font-medium text-amber-700 hover:underline">{attention} item{attention === 1 ? "" : "s"} need attention →</Link>
        </p>
      )}
    </ChartCard>
  );
}
