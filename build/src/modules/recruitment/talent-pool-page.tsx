import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Candidate, CandidateListParams, listCandidates, removeFromTalentPool, requestTalentPoolConsent } from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { ConsentBadge, ConsiderForJobModal } from "./candidate-extras";
import { Badge, ConfirmModal, RecruitmentSubnav, StageBadge, formatRecruitmentDate, selectClass } from "./shared";

const PAGE_SIZE = 15;

export function TalentPoolPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canEdit = hasPermission("recruitment:edit") || hasPermission("recruitment:create");
  const canCreate = hasPermission("recruitment:create");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pool, setPool] = useState<NonNullable<CandidateListParams["talent_pool"]>>("any");
  const [minExperience, setMinExperience] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const [considering, setConsidering] = useState<Candidate | null>(null);
  const [removing, setRemoving] = useState<Candidate | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["recruitment", "talent-pool", { search, pool, minExperience, page }],
    queryFn: () => listCandidates({ resume_q: search, talent_pool: pool, min_experience: minExperience, page, per_page: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const consentMutation = useMutation({
    mutationFn: (candidate: Candidate) => requestTalentPoolConsent(candidate.id),
    onSuccess: async (_data, candidate) => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Request sent", `${candidate.full_name} can answer from their candidate page.`);
    },
    onError: (error: Error) => toast.error("Could not send the request", error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (candidate: Candidate) => removeFromTalentPool(candidate.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Removed from the talent pool");
      setRemoving(null);
    },
    onError: (error: Error) => {
      toast.error("Could not remove from the pool", error.message);
      setRemoving(null);
    },
  });

  const data = query.data;
  const people = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Talent pool" subtitle="Strong people you did not hire this time. Search their skills and put them forward for new roles." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput aria-label="Search the talent pool" placeholder='Search skills or keywords, e.g. laravel "team lead"' value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="max-w-md" />
          <select aria-label="Pool" className={`${selectClass} w-auto min-w-44`} value={pool} onChange={(e) => { setPool(e.target.value as typeof pool); setPage(1); }}>
            <option value="any">Everyone in a pool</option>
            <option value="silver_medalist">Silver medalists</option>
            <option value="general">General pool</option>
          </select>
          <FormInput
            aria-label="Minimum years of experience"
            type="number"
            min={0}
            placeholder="Min. years"
            value={minExperience}
            onChange={(e) => { setMinExperience(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}
            className="w-32"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Name</th>
                <th className="p-3">Pool</th>
                <th className="p-3">Last applied for</th>
                <th className="p-3">Experience</th>
                <th className="p-3">Skills</th>
                <th className="p-3">Consent</th>
                <th className="p-3">Kept until</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={8}>Loading the talent pool...</td></tr>}
              {query.isError && <tr><td className="p-4 text-red-700" colSpan={8}>Could not load the talent pool. {(query.error as Error).message}</td></tr>}
              {people.map((person) => (
                <tr key={person.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium" data-label="Name">
                    <Link to={`/recruitment/candidates/${person.id}`} className="hover:underline">{person.full_name}</Link>
                    <span className="block text-xs font-normal text-[var(--muted)]">{person.email}</span>
                    {person.talent_pool_note && <span className="mt-1 block max-w-xs text-xs font-normal italic text-[var(--muted)]">{person.talent_pool_note}</span>}
                    {person.resume_snippet && <span className="mt-1 block max-w-xs text-xs font-normal italic text-[var(--muted)]">{person.resume_snippet}</span>}
                  </td>
                  <td className="p-3" data-label="Pool"><Badge tone="violet">{person.talent_pool === "silver_medalist" ? "silver medalist" : "talent pool"}</Badge></td>
                  <td className="p-3" data-label="Last applied for">
                    {person.job_opening?.title ?? "-"}
                    <span className="mt-1 block"><StageBadge stage={person.stage} /></span>
                  </td>
                  <td className="p-3" data-label="Experience">{person.experience_years != null ? `${person.experience_years} yrs` : "-"}</td>
                  <td className="p-3" data-label="Skills">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {(person.skills ?? []).slice(0, 5).map((skill) => <Badge key={skill} tone="blue">{skill}</Badge>)}
                      {!person.skills?.length && "-"}
                    </div>
                  </td>
                  <td className="p-3" data-label="Consent"><ConsentBadge consent={person.pool_consent} /></td>
                  <td className="p-3" data-label="Kept until">
                    {person.talent_pool_expires_at ? formatRecruitmentDate(person.talent_pool_expires_at) : "No limit"}
                    <span className="block text-xs text-[var(--muted)]">since {formatRecruitmentDate(person.talent_pool_added_at)}</span>
                  </td>
                  <td className="p-3" data-label="Actions">
                    <div className="flex justify-end gap-2">
                      {canCreate && person.pool_consent !== "declined" && <Button onClick={() => setConsidering(person)}>Consider for a job</Button>}
                      {canEdit && person.pool_consent !== "declined" && person.pool_consent !== "granted" && (
                        <Button variant="outline" disabled={consentMutation.isPending} onClick={() => consentMutation.mutate(person)}>
                          {person.pool_consent === "pending" ? "Ask again" : "Ask to stay on file"}
                        </Button>
                      )}
                      {canEdit && <Button variant="outline" onClick={() => setRemoving(person)}>Remove</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!query.isLoading && !query.isError && people.length === 0 && (
                <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={8}>Nobody is in the talent pool yet. Keep strong candidates when you reject them, or add them from their profile.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
            <span>Page {data.current_page} of {data.last_page} · {data.total} {data.total === 1 ? "person" : "people"}</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
              <Button variant="outline" disabled={page >= data.last_page} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </section>

      {considering && <ConsiderForJobModal candidate={considering} onClose={() => setConsidering(null)} />}
      {removing && (
        <ConfirmModal
          title="Remove from the talent pool"
          message={`Stop keeping ${removing.full_name} in the talent pool? Their applications are not changed.`}
          confirmLabel="Remove"
          busy={removeMutation.isPending}
          onConfirm={() => removeMutation.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
