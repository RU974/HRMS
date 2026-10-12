import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Offer, OfferStatus, deleteOffer, listOffers } from "@/services/recruitment-service";
import { useAuthStore } from "@/store/auth-store";
import { OfferActions, OfferFormModal } from "./offer-components";
import { ConfirmModal, OfferStatusBadge, RecruitmentSubnav, formatMoney, formatRecruitmentDate, selectClass } from "./shared";

const statuses: OfferStatus[] = ["draft", "pending_approval", "approved", "rejected", "sent", "accepted", "declined", "expired", "withdrawn"];
const DELETABLE: OfferStatus[] = ["draft", "rejected", "withdrawn", "declined", "expired"];

export function OffersPage() {
  const queryClient = useQueryClient();
  const canDelete = useAuthStore((state) => state.hasPermission("recruitment:delete"));

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OfferStatus | "">("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Offer | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const offersQuery = useQuery({
    queryKey: ["recruitment", "offers", { search, status, page }],
    queryFn: () => listOffers({ q: search, status, page }),
    placeholderData: (previous) => previous,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOffer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("Deleted", "Offer removed.");
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error("Delete failed", error.message);
      setDeleteTarget(null);
    },
  });

  const data = offersQuery.data;
  const offers = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Offers" subtitle="Draft offers, get them approved, send them, and record the candidate's answer." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput aria-label="Search offers" placeholder="Search by candidate..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="max-w-sm" />
          <select aria-label="Filter by status" className={`${selectClass} w-auto min-w-44`} value={status} onChange={(e) => { setStatus(e.target.value as OfferStatus | ""); setPage(1); }}>
            <option value="">All statuses</option>
            {statuses.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
          </select>
          <p className="ml-auto text-xs text-[var(--muted)]">New offers are created from a candidate's page once they reach the interview stage.</p>
        </div>

        {offersQuery.isError && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">Could not load offers. {(offersQuery.error as Error).message}</div>
        )}

        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Candidate</th>
                <th className="p-3">Job</th>
                <th className="p-3">Compensation</th>
                <th className="p-3">Start date</th>
                <th className="p-3">Valid until</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created by</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offersQuery.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={8}>Loading offers...</td></tr>}
              {!offersQuery.isLoading && offers.map((offer) => (
                <tr key={offer.id} className="border-b border-[var(--border)]/60 align-top hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium" data-label="Candidate">
                    <Link className="hover:underline" to={`/recruitment/candidates/${offer.candidate_id}`}>{offer.candidate?.full_name ?? "-"}</Link>
                  </td>
                  <td className="p-3" data-label="Job">{offer.candidate?.job_opening?.title ?? "-"}</td>
                  <td className="p-3" data-label="Compensation">{formatMoney(offer.salary, offer.currency)}</td>
                  <td className="p-3" data-label="Start date">{formatRecruitmentDate(offer.start_date)}</td>
                  <td className="p-3" data-label="Valid until">{formatRecruitmentDate(offer.expires_at)}</td>
                  <td className="p-3" data-label="Status">
                    <OfferStatusBadge status={offer.status} />
                    {offer.status === "rejected" && offer.approval_note && <span className="mt-1 block max-w-48 text-xs text-red-700">{offer.approval_note}</span>}
                  </td>
                  <td className="p-3" data-label="Created by">{offer.creator?.name ?? "-"}</td>
                  <td className="p-3" data-label="Actions">
                    <OfferActions offer={offer} onEdit={setEditing} />
                    {canDelete && DELETABLE.includes(offer.status) && (
                      <div className="mt-2 flex justify-end"><Button variant="outline" onClick={() => setDeleteTarget(offer)}>Delete</Button></div>
                    )}
                  </td>
                </tr>
              ))}
              {!offersQuery.isLoading && offers.length === 0 && (
                <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={8}>No offers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
            <span>Page {data.current_page} of {data.last_page} · {data.total} offer{data.total === 1 ? "" : "s"}</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
              <Button variant="outline" disabled={page >= data.last_page} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </section>

      {editing && editing.candidate && (
        <OfferFormModal candidate={{ id: editing.candidate.id, full_name: editing.candidate.full_name }} offer={editing} onClose={() => setEditing(null)} />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete offer"
          message={`Delete this offer for ${deleteTarget.candidate?.full_name ?? "the candidate"}? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
