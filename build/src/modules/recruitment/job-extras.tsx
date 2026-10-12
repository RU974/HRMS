import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { Button } from "@/components/ui/button";
import {
  BudgetCheck,
  JobOpening,
  checkRequisitionBudget,
  considerForJob,
  deleteHeadcountBudget,
  getCurrencySettings,
  getHeadcountBudgets,
  getSuggestedCandidates,
  listBudgetDepartments,
  saveCurrencySettings,
  saveHeadcountBudget,
} from "@/services/recruitment-service";
import { fitTone } from "./fit-components";
import { Badge, FormError, formatMoney, selectClass } from "./shared";

// ---------------------------------------------------------------------------
// Budget check shown while a role is being requested
// ---------------------------------------------------------------------------

export function budgetWarnings(check: BudgetCheck): string[] {
  const warnings: string[] = [];
  const money = (amount: number | null) => formatMoney(amount, check.currency);

  if (check.over_headcount) {
    warnings.push(`Over the approved headcount: ${check.used_headcount ?? 0} already used or open, ${check.requested_headcount} more asked, ${check.approved_headcount} approved this year.`);
  }
  if (check.over_budget) {
    warnings.push(`Over the approved budget: ${money(check.used_cost)} already committed plus ${money(check.estimated_cost)} for this role, against ${money(check.approved_budget)}.`);
  }
  if (check.high_cost) {
    warnings.push(`This role costs ${money(check.estimated_cost)}, which is at or above the ${money(check.cost_threshold)} limit for HR-only approval.`);
  }
  if (check.unconverted_currencies?.length) {
    warnings.push(`No exchange rate is set for ${check.unconverted_currencies.join(", ")}, so its cost could not be counted. Add the rate under Headcount budgets > Currency.`);
  }

  return warnings;
}

export function BudgetCheckPanel({ departmentId, openPositions, salaryMin, salaryMax, jobId }: {
  departmentId: number | null | undefined;
  openPositions: number;
  salaryMin: number | null | undefined;
  salaryMax: number | null | undefined;
  jobId?: number;
}) {
  const [debounced, setDebounced] = useState({ departmentId, openPositions, salaryMin, salaryMax });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced({ departmentId, openPositions, salaryMin, salaryMax }), 400);
    return () => window.clearTimeout(timer);
  }, [departmentId, openPositions, salaryMin, salaryMax]);

  const query = useQuery({
    queryKey: ["recruitment", "budget-check", debounced, jobId],
    queryFn: () =>
      checkRequisitionBudget({
        department_id: debounced.departmentId ?? null,
        open_positions: debounced.openPositions || 1,
        salary_min: debounced.salaryMin ?? null,
        salary_max: debounced.salaryMax ?? null,
        job_id: jobId,
      }),
    placeholderData: (previous) => previous,
  });

  const check = query.data;
  if (!check || (!check.has_budget && !check.high_cost)) return null;

  const warnings = budgetWarnings(check);

  if (warnings.length === 0) {
    return (
      <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        Within the {check.fiscal_year} budget: {check.used_headcount} of {check.approved_headcount} positions used or open
        {check.approved_budget != null ? `, ${formatMoney(check.used_cost, check.currency)} of ${formatMoney(check.approved_budget, check.currency)}` : ""}.
      </p>
    );
  }

  return (
    <div role="alert" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-medium">This request needs the Company Admin's approval as well as HR's.</p>
      <ul className="list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </div>
  );
}

/** Small note under a job's status when its budget check matters. */
export function JobBudgetNote({ job }: { job: JobOpening }) {
  const check = job.budget_check;
  if (!check?.requires_executive) return null;

  return (
    <span className="mt-1 block max-w-48 text-xs text-amber-800" title={budgetWarnings(check).join(" ")}>
      Over budget: needs the Company Admin too
    </span>
  );
}

// ---------------------------------------------------------------------------
// Headcount budgets
// ---------------------------------------------------------------------------

export function HeadcountBudgetsModal({ canManage, onClose }: { canManage: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [headcount, setHeadcount] = useState<number | "">("");
  const [money, setMoney] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const budgetsQuery = useQuery({ queryKey: ["recruitment", "headcount", year], queryFn: () => getHeadcountBudgets(year) });
  const departmentsQuery = useQuery({ queryKey: ["recruitment", "headcount-departments"], queryFn: listBudgetDepartments, enabled: canManage });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });

  const saveMutation = useMutation({
    mutationFn: () => saveHeadcountBudget({ department_id: Number(departmentId), fiscal_year: year, approved_headcount: Number(headcount), approved_budget: money === "" ? null : Number(money) }),
    onSuccess: async () => {
      await refresh();
      toast.success("Budget saved");
      setDepartmentId("");
      setHeadcount("");
      setMoney("");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteHeadcountBudget(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Budget removed");
    },
    onError: (mutationError: Error) => toast.error("Could not remove the budget", mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!departmentId) return setError("Choose a department.");
    if (headcount === "" || Number(headcount) < 0) return setError("Enter how many new positions are approved.");
    saveMutation.mutate();
  }

  const rows = budgetsQuery.data?.budgets ?? [];
  const currency = budgetsQuery.data?.currency ?? "";
  const unconverted = [...new Set(rows.flatMap((row) => row.unconverted_currencies ?? []))];

  return (
    <Modal title="Headcount and hiring budget" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-[var(--muted)]">
          New positions and new-hire salary budget approved for each department. Hires this year, open jobs and requests waiting for approval count against them.
          Budgets are in <strong>{currency || "the base currency"}</strong>; jobs and offers in other currencies are converted with the rates below (a position costs its "salary to").
        </p>
        {unconverted.length > 0 && (
          <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
            No exchange rate is set for {unconverted.join(", ")}, so those jobs or offers are not counted in the money totals. Add a rate under Currency below.
          </p>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="budget-year" className="font-medium">Year</label>
          <select id="budget-year" className={`${selectClass} w-auto`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        {budgetsQuery.isError && <FormError message={(budgetsQuery.error as Error).message} />}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="p-2">Department</th>
                <th className="p-2">Positions</th>
                <th className="p-2">Budget</th>
                <th className="p-2">Remaining</th>
                {canManage && <th className="p-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]/60">
                  <td className="p-2 font-medium">{row.department}</td>
                  <td className="p-2">{row.used_headcount} / {row.approved_headcount}<span className="block text-[var(--muted)]">{row.hired} hired, {row.open_slots} open</span></td>
                  <td className="p-2">{row.approved_budget != null ? <>{formatMoney(row.used_cost, currency)} / {formatMoney(row.approved_budget, currency)}</> : "No money limit"}</td>
                  <td className="p-2">
                    <Badge tone={row.over ? "red" : "emerald"}>{row.remaining_headcount} position{Math.abs(row.remaining_headcount) === 1 ? "" : "s"}</Badge>
                    {row.remaining_budget != null && <span className="ml-1">{formatMoney(row.remaining_budget, currency)}</span>}
                  </td>
                  {canManage && <td className="p-2 text-right"><Button variant="outline" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(row.id)}>Remove</Button></td>}
                </tr>
              ))}
              {!budgetsQuery.isLoading && rows.length === 0 && (
                <tr><td className="p-3 text-center text-[var(--muted)]" colSpan={canManage ? 5 : 4}>No budgets set for {year}. Roles are then only checked against the cost limit, if one is set.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {canManage && (
          <form className="space-y-3 rounded-xl border border-[var(--border)] p-3" onSubmit={submit}>
            <p className="font-medium">Set or change a department's budget for {year}</p>
            <FormError message={error} />
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block font-medium" htmlFor="budget-department">Department</label>
                <select id="budget-department" className={selectClass} value={departmentId} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Choose...</option>
                  {(departmentsQuery.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium" htmlFor="budget-headcount">New positions</label>
                <FormInput id="budget-headcount" type="number" min={0} value={headcount} onChange={(e) => setHeadcount(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block font-medium" htmlFor="budget-money">Salary budget{currency ? ` in ${currency}` : ""} (optional)</label>
                <FormInput id="budget-money" type="number" min={0} value={money} onChange={(e) => setMoney(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>
            <div className="flex justify-end"><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save budget"}</Button></div>
          </form>
        )}

        <CurrencyRatesForm canManage={canManage} />

        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}

/** The base currency budgets are in, and how many of it one unit of each other currency is worth. */
export function CurrencyRatesForm({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["recruitment", "currency"], queryFn: getCurrencySettings });
  const [base, setBase] = useState("");
  const [rates, setRates] = useState<Array<{ currency: string; rate: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setBase(settingsQuery.data.base_currency);
      setRates(settingsQuery.data.rates.map((row) => ({ currency: row.currency, rate: String(row.rate) })));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveCurrencySettings({
        base_currency: base.trim().toUpperCase(),
        rates: rates.filter((row) => row.currency.trim() || row.rate.trim()).map((row) => ({ currency: row.currency.trim().toUpperCase(), rate: Number(row.rate) })),
      }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Currency settings saved");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[A-Za-z]{2,10}$/.test(base.trim())) return setError("Enter the base currency code, for example PKR.");
    if (rates.some((row) => (row.currency.trim() || row.rate.trim()) && (!/^[A-Za-z]{2,10}$/.test(row.currency.trim()) || !(Number(row.rate) > 0)))) {
      return setError("Each rate needs a currency code and a rate above zero.");
    }
    saveMutation.mutate();
  }

  if (settingsQuery.isLoading) return null;

  return (
    <form className="space-y-3 rounded-xl border border-[var(--border)] p-3" onSubmit={submit} aria-label="Currency">
      <p className="font-medium">Currency</p>
      <FormError message={error ?? (settingsQuery.isError ? (settingsQuery.error as Error).message : null)} />
      <div className="max-w-40">
        <label className="mb-1 block font-medium" htmlFor="base-currency">Base currency</label>
        <FormInput id="base-currency" maxLength={10} value={base} disabled={!canManage} onChange={(e) => setBase(e.target.value.toUpperCase())} />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-[var(--muted)]">How much {base || "the base currency"} one unit of another currency is worth.</p>
        {rates.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <FormInput aria-label={`Currency ${index + 1}`} className="w-28" maxLength={10} placeholder="USD" value={row.currency} disabled={!canManage} onChange={(e) => setRates((previous) => previous.map((item, position) => (position === index ? { ...item, currency: e.target.value.toUpperCase() } : item)))} />
            <span>=</span>
            <FormInput aria-label={`Rate ${index + 1}`} className="w-36" type="number" min={0} step="any" placeholder="280" value={row.rate} disabled={!canManage} onChange={(e) => setRates((previous) => previous.map((item, position) => (position === index ? { ...item, rate: e.target.value } : item)))} />
            <span>{base}</span>
            {canManage && <Button type="button" variant="outline" onClick={() => setRates((previous) => previous.filter((_, position) => position !== index))}>Remove</Button>}
          </div>
        ))}
        {canManage && <Button type="button" variant="outline" onClick={() => setRates((previous) => [...previous, { currency: "", rate: "" }])}>Add a currency</Button>}
      </div>
      {canManage && <div className="flex justify-end"><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save currency settings"}</Button></div>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Talent pool suggestions for an opening
// ---------------------------------------------------------------------------

export function SuggestedCandidatesModal({ job, canPutForward, onClose }: { job: JobOpening; canPutForward: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const suggestionsQuery = useQuery({ queryKey: ["recruitment", "suggestions", job.id], queryFn: () => getSuggestedCandidates(job.id) });

  const forwardMutation = useMutation({
    mutationFn: (candidateId: number) => considerForJob(candidateId, job.id),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Put forward", `${created.full_name} now has an application for ${job.title}.`);
    },
    onError: (mutationError: Error) => toast.error("Could not put them forward", mutationError.message),
  });

  const people = suggestionsQuery.data ?? [];

  return (
    <Modal title={`Talent pool matches for ${job.title}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-[var(--muted)]">People you kept from earlier hiring whose resume fits this role's requirements. People who declined to stay on file or whose time in the pool ended are never shown.</p>
        {suggestionsQuery.isLoading && <p className="text-[var(--muted)]">Looking through the pool...</p>}
        {suggestionsQuery.isError && <FormError message={(suggestionsQuery.error as Error).message} />}
        {!suggestionsQuery.isLoading && people.length === 0 && !suggestionsQuery.isError && <p>Nobody in the talent pool matches yet.</p>}
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {people.map((person) => (
            <li key={person.id} className="rounded-xl border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link className="font-medium hover:underline" to={`/recruitment/candidates/${person.id}`}>{person.full_name}</Link>
                <Badge tone={fitTone(person.fit_score)}>{person.fit_score}% fit</Badge>
                <Badge tone="violet">{person.talent_pool === "silver_medalist" ? "silver medalist" : "talent pool"}</Badge>
                {person.pool_consent === "granted" && <Badge tone="emerald">agreed to stay on file</Badge>}
                {canPutForward && (
                  <Button className="ml-auto" disabled={forwardMutation.isPending} onClick={() => forwardMutation.mutate(person.id)}>Put forward</Button>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Previously applied for {person.previous_job_title ?? "another role"}
                {person.experience_years != null ? ` · ${person.experience_years} years` : ""}
                {person.matched_skills.length ? ` · matches ${person.matched_skills.join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}
