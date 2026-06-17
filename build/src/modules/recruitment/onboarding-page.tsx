import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Candidate,
  OnboardingPayload,
  createOnboarding,
  deleteOnboarding,
  listCandidates,
  listOnboarding,
  updateOnboarding,
} from "@/services/recruitment-service";
import { RecruitmentSubnav, formatRecruitmentDate } from "./shared";
import { toast } from "@/components/notifications/toast";

const defaultOnboardingForm: OnboardingPayload = {
  candidate_id: 0,
  onboarding_status: "pending",
  onboarding_start_date: null,
  onboarding_notes: "",
};

export function OnboardingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOnboarding, setEditingOnboarding] = useState<Candidate | null>(null);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingPayload>(defaultOnboardingForm);

  const onboardingQuery = useQuery({
    queryKey: ["recruitment", "onboarding", search],
    queryFn: () => listOnboarding(search),
  });
  const candidatesQuery = useQuery({
    queryKey: ["recruitment", "candidates", "onboarding-options"],
    queryFn: () => listCandidates(),
  });

  const createMutation = useMutation({
    mutationFn: createOnboarding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] });
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "candidates"] });
      toast.success("Onboarding started", "Onboarding record created successfully.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Omit<OnboardingPayload, "candidate_id">> }) => updateOnboarding(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] });
      toast.success("Onboarding updated", "Onboarding record saved.");
      closeModal();
    },
    onError: (mutationError: Error) => { toast.error("Save failed", mutationError.message); setError(mutationError.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOnboarding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "onboarding"] });
      toast.success("Deleted", "Onboarding record removed.");
    },
    onError: (mutationError: Error) => { toast.error("Delete failed", mutationError.message); setError(mutationError.message); },
  });

  const onboardings = onboardingQuery.data?.data ?? [];
  const hiredCandidates = (candidatesQuery.data?.data ?? []).filter((candidate) => candidate.stage === "hired");

  function closeModal() {
    setModalOpen(false);
    setError(null);
    setEditingOnboarding(null);
    setOnboardingForm(defaultOnboardingForm);
  }

  function openCreate() {
    closeModal();
    setModalOpen(true);
  }

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!onboardingForm.candidate_id) {
      setError("Candidate is required.");
      return;
    }

    const payload: OnboardingPayload = {
      ...onboardingForm,
      onboarding_notes: onboardingForm.onboarding_notes?.trim() || "",
      onboarding_start_date: onboardingForm.onboarding_start_date || null,
    };

    if (editingOnboarding) {
      updateMutation.mutate({
        id: editingOnboarding.id,
        payload: {
          onboarding_status: payload.onboarding_status,
          onboarding_start_date: payload.onboarding_start_date,
          onboarding_notes: payload.onboarding_notes,
        },
      });
      return;
    }

    createMutation.mutate(payload);
  }

  async function onDelete(id: number) {
    if (!window.confirm("Clear onboarding information for this candidate?")) return;
    setError(null);
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Onboarding" subtitle="Track hired candidates and their onboarding progress separately from candidate intake." />
      <RecruitmentSubnav />

      <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <FormInput placeholder="Search onboarding records..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Button className="ml-auto" onClick={openCreate}>New Onboarding</Button>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Total</p><p className="mt-2 text-3xl font-semibold">{onboardings.length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Pending</p><p className="mt-2 text-3xl font-semibold">{onboardings.filter((item) => item.onboarding_status === "pending" || !item.onboarding_status).length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">In progress</p><p className="mt-2 text-3xl font-semibold">{onboardings.filter((item) => item.onboarding_status === "in_progress").length}</p></Card>
          <Card><p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Completed</p><p className="mt-2 text-3xl font-semibold">{onboardings.filter((item) => item.onboarding_status === "completed").length}</p></Card>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Candidate</th>
                <th className="p-3">Job</th>
                <th className="p-3">Status</th>
                <th className="p-3">Start Date</th>
                <th className="p-3">Notes</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {onboardingQuery.isLoading && (
                <tr>
                  <td className="p-4 text-[var(--muted)]" colSpan={6}>Loading onboarding records...</td>
                </tr>
              )}
              {!onboardingQuery.isLoading && onboardings.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20">
                  <td className="p-3 font-medium">{item.full_name}</td>
                  <td className="p-3">{item.jobOpening?.title ?? "-"}</td>
                  <td className="p-3 capitalize">{item.onboarding_status ?? "pending"}</td>
                  <td className="p-3">{formatRecruitmentDate(item.onboarding_start_date)}</td>
                  <td className="max-w-[280px] truncate p-3 text-[var(--muted)]">{item.onboarding_notes ?? "-"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingOnboarding(item);
                          setOnboardingForm({
                            candidate_id: item.id,
                            onboarding_status: item.onboarding_status ?? "pending",
                            onboarding_start_date: item.onboarding_start_date ?? null,
                            onboarding_notes: item.onboarding_notes ?? "",
                          });
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!onboardingQuery.isLoading && onboardings.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-[var(--muted)]" colSpan={6}>No onboarding records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editingOnboarding ? "Edit Onboarding" : "Create Onboarding"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Candidate</label>
                <select
                  disabled={Boolean(editingOnboarding)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  value={onboardingForm.candidate_id || ""}
                  onChange={(e) => setOnboardingForm((prev) => ({ ...prev, candidate_id: Number(e.target.value) }))}
                >
                  <option value="">Select hired candidate</option>
                  {hiredCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" value={onboardingForm.onboarding_status} onChange={(e) => setOnboardingForm((prev) => ({ ...prev, onboarding_status: e.target.value as OnboardingPayload["onboarding_status"] }))}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="deferred">Deferred</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Start Date</label>
                <FormInput type="date" value={onboardingForm.onboarding_start_date ?? ""} onChange={(e) => setOnboardingForm((prev) => ({ ...prev, onboarding_start_date: e.target.value || null }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={onboardingForm.onboarding_notes ?? ""}
                onChange={(e) => setOnboardingForm((prev) => ({ ...prev, onboarding_notes: e.target.value }))}
                placeholder="Add checklist items, welcome tasks, and onboarding handoff details."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">{editingOnboarding ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
