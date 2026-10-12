import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { candidateStageLabels, getRecruitmentOverview } from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { RecruitmentSubnav, StatCard, recruitmentSections } from "./shared";

const stageBar: Record<string, string> = {
  applied: "bg-slate-400",
  screening: "bg-blue-500",
  interview: "bg-violet-500",
  offer: "bg-amber-500",
  hired: "bg-emerald-500",
  rejected: "bg-red-500",
};

const sectionCopy: Record<string, string> = {
  "/recruitment/jobs": "Publish openings, set owners and hiring capacity.",
  "/recruitment/candidates": "Board and table of every candidate, with resumes and history.",
  "/recruitment/referrals": "Employee referral bonuses and recruitment agencies.",
  "/recruitment/interviews": "Schedule, avoid clashes, and collect scorecards.",
  "/recruitment/offers": "Draft, approve, send and track offers.",
  "/recruitment/onboarding": "New-hire task lists with owners and due dates.",
  "/recruitment/reports": "Funnel, time-to-hire, sources and offer acceptance.",
};

export function RecruitmentPage() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const overviewQuery = useQuery({ queryKey: ["recruitment", "overview"], queryFn: getRecruitmentOverview });
  const data = overviewQuery.data;
  const pipelineTotal = data?.pipeline.reduce((sum, item) => sum + item.count, 0) ?? 0;

  const attention = data
    ? [
        { count: data.attention.scorecards_overdue, text: "interviews are waiting for a scorecard", to: "/recruitment/interviews" },
        { count: data.attention.offers_awaiting_approval, text: "offers are waiting for approval", to: "/recruitment/offers" },
        { count: data.attention.offers_expiring_soon, text: "sent offers expire within 3 days", to: "/recruitment/offers" },
        { count: data.attention.onboarding_tasks_due, text: "onboarding tasks are due or overdue", to: "/recruitment/onboarding" },
      ].filter((item) => item.count > 0)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Recruitment" subtitle="Jobs, candidates, interviews, offers and onboarding in one hiring workflow." />
      <RecruitmentSubnav />

      {overviewQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Could not load the overview. {(overviewQuery.error as Error).message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Open jobs" value={data?.open_jobs ?? "-"} />
        <StatCard label="Active candidates" value={data?.active_candidates ?? "-"} hint="Not yet hired or rejected" />
        <StatCard label="Interviews this week" value={data?.interviews_this_week ?? "-"} />
        <StatCard label="Offers in progress" value={data?.offers_pending ?? "-"} hint="Pending, approved or sent" />
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-base font-semibold">Pipeline</h2>
        {pipelineTotal === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No candidates yet. Add one from the Candidates page, or publish a job on your careers page.</p>
        ) : (
          <>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--border)]" role="img" aria-label="Candidates by stage">
              {data?.pipeline.filter((item) => item.count > 0).map((item) => (
                <div key={item.stage} className={stageBar[item.stage]} style={{ width: `${(item.count / pipelineTotal) * 100}%` }} title={`${candidateStageLabels[item.stage]}: ${item.count}`} />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {data?.pipeline.map((item) => (
                <li key={item.stage} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${stageBar[item.stage]}`} aria-hidden />
                  {candidateStageLabels[item.stage]} <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-base font-semibold">Needs attention</h2>
        {overviewQuery.isLoading ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Loading...</p>
        ) : attention.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Nothing is waiting on you right now.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {attention.map((item) => (
              <li key={item.text}>
                <Link className="hover:underline" to={item.to}><strong>{item.count}</strong> {item.text} →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {recruitmentSections
          .filter((section) => section.path !== "/recruitment" && section.permissions.some((permission) => hasPermission(permission)))
          .map((section) => (
            <Link key={section.path} to={section.path} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/50">
              <h3 className="font-semibold">{section.label}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{sectionCopy[section.path]}</p>
            </Link>
          ))}
      </section>
    </div>
  );
}
