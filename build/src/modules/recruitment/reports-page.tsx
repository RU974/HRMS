import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { PageHeader } from "@/components/page-header/page-header";
import { candidateStageLabels, getRecruitmentAnalytics, listJobOpenings } from "@/services/recruitment-service";
import { RecruitmentSubnav, StatCard, formatRecruitmentDate, selectClass } from "./shared";

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const percent = (value: number | null | undefined) => (value == null ? "-" : `${value}%`);

export function RecruitmentReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [jobId, setJobId] = useState<number | "">("");

  const rangeValid = !from || !to || from <= to;

  const analyticsQuery = useQuery({
    queryKey: ["recruitment", "analytics", { from, to, jobId }],
    queryFn: () => getRecruitmentAnalytics({ from, to, job_opening_id: jobId }),
    enabled: rangeValid,
    placeholderData: (previous) => previous,
  });
  const jobsQuery = useQuery({ queryKey: ["recruitment", "jobs", "candidate-options"], queryFn: () => listJobOpenings() });

  const data = analyticsQuery.data;
  const maxFunnel = Math.max(1, ...(data?.funnel.map((step) => step.count) ?? [1]));
  const maxSource = Math.max(1, ...(data?.sources.map((source) => source.candidates) ?? [1]));

  return (
    <div className="space-y-6">
      <PageHeader title="Recruitment reports" subtitle="How well hiring is going: conversion, speed, sources and offers." />
      <RecruitmentSubnav />

      <section className="flex flex-wrap items-end gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="rep-from">Applied from</label>
          <FormInput id="rep-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="rep-to">Applied to</label>
          <FormInput id="rep-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="rep-job">Job</label>
          <select id="rep-job" className={`${selectClass} min-w-48`} value={jobId} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All jobs</option>
            {(jobsQuery.data?.data ?? []).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </div>
        {!rangeValid && <p role="alert" className="text-sm text-red-700">The start date must be before the end date.</p>}
      </section>

      {analyticsQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">Could not load reports. {(analyticsQuery.error as Error).message}</div>
      )}

      {analyticsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading reports...</p>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Applicants" value={data.total_candidates} hint={`${formatRecruitmentDate(data.range.from)} – ${formatRecruitmentDate(data.range.to)}`} />
            <StatCard label="Hires" value={data.time_to_hire.hires} />
            <StatCard label="Avg. time to hire" value={data.time_to_hire.average_days == null ? "-" : `${data.time_to_hire.average_days} d`} hint={data.time_to_hire.hires ? `Fastest ${data.time_to_hire.fastest_days} d · slowest ${data.time_to_hire.slowest_days} d` : "No hires in range"} />
            <StatCard label="Offer acceptance" value={percent(data.offers.acceptance_rate)} hint={`${data.offers.accepted} accepted · ${data.offers.declined} declined · ${data.offers.expired} expired`} />
          </div>

          <Section title="Hiring funnel">
            {data.total_candidates === 0 ? (
              <p className="text-sm text-[var(--muted)]">No applicants in this period.</p>
            ) : (
              <ul className="space-y-3">
                {data.funnel.map((step) => (
                  <li key={step.stage} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{candidateStageLabels[step.stage]}</span>
                      <span>
                        <strong>{step.count}</strong>
                        {step.conversion_from_previous != null && <span className="ml-2 text-xs text-[var(--muted)]">{step.conversion_from_previous}% of previous stage</span>}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(step.count / maxFunnel) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-[var(--muted)]">A candidate counts for every stage up to the one they are in now.</p>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Where candidates come from">
              {data.sources.length === 0 ? <p className="text-sm text-[var(--muted)]">No data.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[var(--muted)]"><th className="pb-2">Source</th><th className="pb-2">Candidates</th><th className="pb-2">Hired</th><th className="pb-2">Hire rate</th></tr></thead>
                  <tbody>
                    {data.sources.map((source) => (
                      <tr key={source.source} className="border-t border-[var(--border)]/60">
                        <td className="py-2">{source.source}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full bg-[var(--primary)]" style={{ width: `${(source.candidates / maxSource) * 100}%` }} /></div>
                            {source.candidates}
                          </div>
                        </td>
                        <td className="py-2">{source.hired}</td>
                        <td className="py-2">{percent(source.hire_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Why candidates were rejected">
              {data.rejection_reasons.length === 0 ? <p className="text-sm text-[var(--muted)]">No rejections in this period.</p> : (
                <ul className="space-y-2 text-sm">
                  {data.rejection_reasons.map((item) => (
                    <li key={item.reason} className="flex justify-between gap-3 border-b border-[var(--border)]/60 pb-2"><span>{item.reason}</span><strong>{item.count}</strong></li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title={jobId ? "Job progress" : "Open jobs"}>
            {data.jobs.length === 0 ? <p className="text-sm text-[var(--muted)]">No jobs to show.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[var(--muted)]"><th className="pb-2">Job</th><th className="pb-2">Candidates</th><th className="pb-2">Hired / positions</th></tr></thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={job.id} className="border-t border-[var(--border)]/60">
                      <td className="py-2">{job.title}</td>
                      <td className="py-2">{job.candidates}</td>
                      <td className="py-2">{job.hired} / {job.open_positions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
