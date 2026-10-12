import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  type Agency,
  type BonusStatus,
  type ReferralBonusItem,
  approveReferralBonus,
  bonusStatusLabels,
  cancelReferralBonus,
  createAgency,
  deleteAgency,
  listAgencies,
  listReferralBonuses,
  payReferralBonus,
  updateAgency,
  updateReferralBonus,
} from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/utils/cn";
import { Badge, ConfirmModal, FormError, NoteModal, RecruitmentSubnav, StatCard, formatMoney, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

type Tab = "bonuses" | "agencies";

const statusTone: Record<BonusStatus, "slate" | "blue" | "amber" | "emerald" | "red" | "violet"> = {
  tracking: "slate",
  pending: "blue",
  eligible: "amber",
  approved: "violet",
  paid: "emerald",
  cancelled: "red",
};

export function ReferralsPage() {
  const [tab, setTab] = useState<Tab>("bonuses");

  return (
    <div className="space-y-6">
      <PageHeader title="Referrals" subtitle="Employee referral bonuses and the agencies that supply candidates." />
      <RecruitmentSubnav />
      <div role="tablist" aria-label="Referral sections" className="flex gap-1 border-b border-[var(--border)]">
        {([["bonuses", "Referral bonuses"], ["agencies", "Agencies"]] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", tab === id ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "bonuses" ? <BonusesTab /> : <AgenciesTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BonusesTab() {
  const queryClient = useQueryClient();
  const canDecide = useAuthStore((state) => state.hasPermission("recruitment:manage_settings"));
  const [status, setStatus] = useState<BonusStatus | "">("");
  const [type, setType] = useState<"referral" | "agency" | "">("");
  const [editing, setEditing] = useState<ReferralBonusItem | null>(null);
  const [cancelling, setCancelling] = useState<ReferralBonusItem | null>(null);

  const query = useQuery({ queryKey: ["recruitment", "referral-bonuses", { status, type }], queryFn: () => listReferralBonuses({ status, type }) });
  const bonuses = query.data?.bonuses ?? [];
  const totals = query.data?.totals ?? {};

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recruitment"] });

  const approve = useMutation({
    mutationFn: (id: number) => approveReferralBonus(id),
    onSuccess: async () => { await refresh(); toast.success("Bonus approved", "A payroll bonus was created for the referrer."); },
    onError: (error: Error) => toast.error("Could not approve", error.message),
  });
  const pay = useMutation({
    mutationFn: (id: number) => payReferralBonus(id),
    onSuccess: async () => { await refresh(); toast.success("Marked as paid"); },
    onError: (error: Error) => toast.error("Could not update", error.message),
  });
  const cancel = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) => cancelReferralBonus(id, notes),
    onSuccess: async () => { setCancelling(null); await refresh(); toast.success("Bonus cancelled"); },
    onError: (error: Error) => toast.error("Could not cancel", error.message),
  });

  const money = (key: BonusStatus) => totals[key]?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Waiting period" value={money("pending")} hint="Hired, not yet payable" />
        <StatCard label="Ready to approve" value={money("eligible")} />
        <StatCard label="Approved" value={money("approved")} hint="Awaiting payment" />
        <StatCard label="Paid" value={money("paid")} />
      </div>

      <div className="flex flex-wrap gap-3">
        <select aria-label="Filter by status" className={cn(selectClass, "w-48")} value={status} onChange={(e) => setStatus(e.target.value as BonusStatus | "")}>
          <option value="">All statuses</option>
          {(Object.keys(bonusStatusLabels) as BonusStatus[]).map((item) => <option key={item} value={item}>{bonusStatusLabels[item]}</option>)}
        </select>
        <select aria-label="Filter by source" className={cn(selectClass, "w-48")} value={type} onChange={(e) => setType(e.target.value as "referral" | "agency" | "")}>
          <option value="">Employees and agencies</option>
          <option value="referral">Employee referrals</option>
          <option value="agency">Agencies</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">Candidate</th>
              <th className="p-3">Credited to</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Payable from</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={6}>Loading...</td></tr>}
            {query.isError && <tr><td className="p-4 text-red-700" colSpan={6}>Could not load referrals. {(query.error as Error).message}</td></tr>}
            {bonuses.map((bonus) => (
              <tr key={bonus.id} className="border-b border-[var(--border)]/60">
                <td className="p-3" data-label="Candidate">
                  <Link className="font-medium hover:underline" to={`/recruitment/candidates/${bonus.candidate_id}`}>{bonus.candidate?.full_name ?? `Candidate #${bonus.candidate_id}`}</Link>
                  <span className="block text-xs text-[var(--muted)]">{bonus.candidate?.job_opening?.title ?? "-"} · {bonus.candidate?.stage}</span>
                </td>
                <td className="p-3" data-label="Credited to">
                  {bonus.employee ? <>{bonus.employee.name}<span className="block text-xs text-[var(--muted)]">Employee referral</span></> : bonus.agency ? <>{bonus.agency.name}<span className="block text-xs text-[var(--muted)]">Agency fee</span></> : "-"}
                </td>
                <td className="p-3" data-label="Amount">{bonus.amount != null ? formatMoney(bonus.amount, bonus.currency) : <span className="text-[var(--muted)]">Not set</span>}</td>
                <td className="p-3" data-label="Status"><Badge tone={statusTone[bonus.status]}>{bonusStatusLabels[bonus.status]}</Badge></td>
                <td className="p-3" data-label="Payable from">{formatRecruitmentDate(bonus.eligible_on)}{bonus.paid_on ? <span className="block text-xs text-[var(--muted)]">Paid {formatRecruitmentDate(bonus.paid_on)}</span> : null}</td>
                <td className="p-3" data-label="Actions">
                  {canDecide && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {!["approved", "paid", "cancelled"].includes(bonus.status) && <Button variant="outline" onClick={() => setEditing(bonus)}>Edit</Button>}
                      {bonus.status === "eligible" && <Button disabled={approve.isPending} onClick={() => approve.mutate(bonus.id)}>Approve</Button>}
                      {bonus.status === "approved" && <Button disabled={pay.isPending} onClick={() => pay.mutate(bonus.id)}>Mark paid</Button>}
                      {!["paid", "cancelled"].includes(bonus.status) && <Button variant="outline" onClick={() => setCancelling(bonus)}>Cancel</Button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {query.isSuccess && bonuses.length === 0 && <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={6}>Nothing here yet. Credit a candidate to an employee or agency when you add or edit them.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted)]">
        A bonus is tracked from the moment a candidate is credited, becomes payable {query.data ? `${query.data.wait_days} days` : "after the waiting period"} after the hire starts, and is dropped if the hire leaves first. Approving creates a payroll bonus for the employee. Agency fees are a percentage of the offer salary.
      </p>

      {editing && <BonusEditModal bonus={editing} onClose={() => setEditing(null)} />}
      {cancelling && (
        <NoteModal
          title="Cancel this bonus?"
          label="Reason"
          submitLabel="Cancel bonus"
          busy={cancel.isPending}
          onCancel={() => setCancelling(null)}
          onSubmit={(notes) => cancel.mutate({ id: cancelling.id, notes })}
        />
      )}
    </div>
  );
}

function BonusEditModal({ bonus, onClose }: { bonus: ReferralBonusItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number | "">(bonus.amount != null ? Number(bonus.amount) : "");
  const [notes, setNotes] = useState(bonus.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateReferralBonus(bonus.id, { amount: amount === "" ? null : Number(amount), notes: notes.trim() || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Bonus updated");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <Modal title={`Bonus for ${bonus.candidate?.full_name ?? "this candidate"}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); setError(null); mutation.mutate(); }}>
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="bonus-amount">Amount{bonus.currency ? ` (${bonus.currency})` : ""}</label>
          <FormInput id="bonus-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="bonus-notes">Notes</label>
          <textarea id="bonus-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function AgenciesTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore((state) => state.hasPermission("recruitment:manage_settings"));
  const query = useQuery({ queryKey: ["recruitment", "agencies"], queryFn: listAgencies });
  const [editing, setEditing] = useState<Agency | "new" | null>(null);
  const [removing, setRemoving] = useState<Agency | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recruitment", "agencies"] });

  const toggle = useMutation({
    mutationFn: (agency: Agency) => updateAgency(agency.id, { is_active: !agency.is_active }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error("Could not update the agency", error.message),
  });
  const remove = useMutation({
    mutationFn: (agency: Agency) => deleteAgency(agency.id),
    onSuccess: async () => { setRemoving(null); await refresh(); toast.success("Agency deleted"); },
    onError: (error: Error) => { setRemoving(null); toast.error("Could not delete the agency", error.message); },
  });

  const agencies = query.data ?? [];

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setEditing("new")}>Add agency</Button></div>}
      <div className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">Agency</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Fee</th>
              <th className="p-3">Candidates</th>
              <th className="p-3">Hired</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={7}>Loading...</td></tr>}
            {query.isError && <tr><td className="p-4 text-red-700" colSpan={7}>Could not load agencies. {(query.error as Error).message}</td></tr>}
            {agencies.map((agency) => (
              <tr key={agency.id} className="border-b border-[var(--border)]/60">
                <td className="p-3 font-medium" data-label="Agency">{agency.name}{agency.terms && <span className="block max-w-64 truncate text-xs font-normal text-[var(--muted)]" title={agency.terms}>{agency.terms}</span>}</td>
                <td className="p-3" data-label="Contact">{agency.contact_name ?? "-"}<span className="block text-xs text-[var(--muted)]">{[agency.email, agency.phone].filter(Boolean).join(" · ")}</span></td>
                <td className="p-3" data-label="Fee">{agency.fee_percent != null ? `${Number(agency.fee_percent)}%` : "-"}</td>
                <td className="p-3" data-label="Candidates">{agency.candidates_count ?? 0}</td>
                <td className="p-3" data-label="Hired">{agency.hired_count ?? 0}</td>
                <td className="p-3" data-label="Status"><Badge tone={agency.is_active ? "emerald" : "slate"}>{agency.is_active ? "active" : "inactive"}</Badge></td>
                <td className="p-3" data-label="Actions">
                  {canManage && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="outline" onClick={() => setEditing(agency)}>Edit</Button>
                      <Button variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(agency)}>{agency.is_active ? "Deactivate" : "Activate"}</Button>
                      <Button variant="outline" onClick={() => setRemoving(agency)}>Delete</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {query.isSuccess && agencies.length === 0 && <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={7}>No agencies yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <AgencyModal agency={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title="Delete this agency?"
          message={`${removing.name} will be removed. An agency that has supplied candidates cannot be deleted; deactivate it instead.`}
          confirmLabel="Delete"
          busy={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function AgencyModal({ agency, onClose }: { agency: Agency | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: agency?.name ?? "",
    contact_name: agency?.contact_name ?? "",
    email: agency?.email ?? "",
    phone: agency?.phone ?? "",
    fee_percent: agency?.fee_percent != null ? String(Number(agency.fee_percent)) : "",
    terms: agency?.terms ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        fee_percent: form.fee_percent.trim() === "" ? null : Number(form.fee_percent),
        terms: form.terms.trim() || null,
      };
      return agency ? updateAgency(agency.id, payload) : createAgency(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "agencies"] });
      toast.success(agency ? "Agency updated" : "Agency added");
      onClose();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError("Enter the agency's name.");
    mutation.mutate();
  }

  return (
    <Modal title={agency ? "Edit agency" : "Add agency"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="agency-name">Name</label>
          <FormInput id="agency-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="agency-contact">Contact person</label>
            <FormInput id="agency-contact" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="agency-fee">Fee (% of offer salary)</label>
            <FormInput id="agency-fee" type="number" min={0} max={100} step="0.01" value={form.fee_percent} onChange={(e) => set("fee_percent", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="agency-email">Email</label>
            <FormInput id="agency-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="agency-phone">Phone</label>
            <FormInput id="agency-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="agency-terms">Terms</label>
          <textarea id="agency-terms" className={textareaClass} value={form.terms} onChange={(e) => set("terms", e.target.value)} placeholder="Replacement guarantee, exclusivity, payment terms..." />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}
