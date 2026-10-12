import { FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { bonusStatusLabels, listMyReferrals, listReferableJobs, submitReferral } from "@/services/recruitment-service";
import { Badge, FormError, formatMoney, formatRecruitmentDate, selectClass, textareaClass } from "./shared";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Employee self-service: put someone forward for an open job and follow what happens to the referral. */
export function ReferSomeonePage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const jobsQuery = useQuery({ queryKey: ["recruitment", "referable-jobs"], queryFn: listReferableJobs });
  const mineQuery = useQuery({ queryKey: ["recruitment", "my-referrals"], queryFn: listMyReferrals });

  const [jobId, setJobId] = useState<number | "">("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const jobs = jobsQuery.data ?? [];
  const selectedJob = jobs.find((job) => job.id === jobId);

  const mutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("job_opening_id", String(jobId));
      form.append("full_name", fullName.trim());
      form.append("email", email.trim());
      if (phone.trim()) form.append("phone", phone.trim());
      if (note.trim()) form.append("note", note.trim());
      if (resume) form.append("resume", resume);
      return submitReferral(form);
    },
    onSuccess: async () => {
      toast.success("Referral submitted", `${fullName.trim()} has been passed to the hiring team.`);
      setFullName("");
      setEmail("");
      setPhone("");
      setNote("");
      setResume(null);
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["recruitment", "my-referrals"] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function onFile(file: File | null) {
    setError(null);
    if (file && !/\.(pdf|docx?|jpe?g|png)$/i.test(file.name)) {
      setError("Upload the resume as a PDF, Word file, JPG or PNG.");
      if (fileRef.current) fileRef.current.value = "";
      return setResume(null);
    }
    if (file && file.size > MAX_RESUME_BYTES) {
      setError("The resume is larger than 5 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return setResume(null);
    }
    setResume(file);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!jobId) return setError("Choose the job you are referring them for.");
    if (!fullName.trim() || !email.trim()) return setError("Enter their name and email address.");
    mutation.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Refer someone" subtitle="Know someone who would be great here? Put them forward for an open job." />

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">New referral</h2>
        {jobsQuery.isError && <FormError message={`Could not load open jobs. ${(jobsQuery.error as Error).message}`} />}
        {jobsQuery.isSuccess && jobs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">There are no open jobs to refer someone for right now.</p>
        ) : (
          <form className="space-y-4" onSubmit={submit} noValidate>
            <FormError message={error} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium" htmlFor="ref-job">Job *</label>
                <select id="ref-job" className={selectClass} value={jobId} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Choose a job</option>
                  {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}{job.department ? ` — ${job.department}` : ""}{job.location ? ` (${job.location})` : ""}</option>)}
                </select>
                {selectedJob?.bonus != null && <p className="mt-1 text-xs text-emerald-800">Referral bonus for this job: {formatMoney(selectedJob.bonus, selectedJob.currency)}, paid if they are hired and stay through the waiting period.</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="ref-name">Their full name *</label>
                <FormInput id="ref-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="ref-email">Their email *</label>
                <FormInput id="ref-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="ref-phone">Their phone</label>
                <FormInput id="ref-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="ref-resume">Resume (PDF, Word, JPG or PNG, max 5 MB)</label>
                <input id="ref-resume" ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="ref-note">Why would they be a good fit?</label>
              <textarea id="ref-note" className={textareaClass} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="text-xs text-[var(--muted)]">Only refer people who know you are doing so. The hiring team may contact them.</p>
            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Submitting..." : "Submit referral"}</Button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">My referrals</h2>
        <div className="overflow-x-auto">
          <table className="rtable w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Person</th>
                <th className="p-3">Job</th>
                <th className="p-3">Referred</th>
                <th className="p-3">Status</th>
                <th className="p-3">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {mineQuery.isLoading && <tr><td className="p-4 text-[var(--muted)]" colSpan={5}>Loading...</td></tr>}
              {mineQuery.isError && <tr><td className="p-4 text-red-700" colSpan={5}>Could not load your referrals. {(mineQuery.error as Error).message}</td></tr>}
              {(mineQuery.data ?? []).map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60">
                  <td className="p-3 font-medium" data-label="Person">{item.name}</td>
                  <td className="p-3" data-label="Job">{item.job_title ?? "-"}</td>
                  <td className="p-3" data-label="Referred">{formatRecruitmentDate(item.referred_on)}</td>
                  <td className="p-3" data-label="Status"><Badge tone={item.status === "Hired" ? "emerald" : item.status === "Not progressing" ? "slate" : "blue"}>{item.status}</Badge></td>
                  <td className="p-3" data-label="Bonus">
                    {item.bonus_status && item.bonus_status !== "tracking" ? (
                      <>
                        <Badge tone={item.bonus_status === "paid" ? "emerald" : item.bonus_status === "cancelled" ? "red" : "amber"}>{bonusStatusLabels[item.bonus_status]}</Badge>
                        {item.bonus_amount != null && <span className="ml-2 text-xs">{formatMoney(item.bonus_amount, item.bonus_currency)}</span>}
                        {item.bonus_status === "pending" && item.bonus_eligible_on && <span className="block text-xs text-[var(--muted)]">Payable from {formatRecruitmentDate(item.bonus_eligible_on)}</span>}
                      </>
                    ) : <span className="text-[var(--muted)]">{item.bonus_amount != null ? `${formatMoney(item.bonus_amount, item.bonus_currency)} if hired` : "-"}</span>}
                  </td>
                </tr>
              ))}
              {mineQuery.isSuccess && mineQuery.data.length === 0 && <tr><td className="p-6 text-center text-[var(--muted)]" colSpan={5}>You have not referred anyone yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
