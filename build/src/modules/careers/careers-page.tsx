import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import { PublicJob, PublicQuestion, applyToPublicJob, getPublicCareers, getPublicJob, requestPortalLink } from "@/services/recruitment-service";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function formatSalary(job: Pick<PublicJob, "salary_min" | "salary_max" | "salary_currency">) {
  const { salary_min: min, salary_max: max, salary_currency: currency } = job;
  if (min == null && max == null) return null;
  const fmt = (value: string | number) => Number(value).toLocaleString();
  const range = min != null && max != null ? `${fmt(min)} – ${fmt(max)}` : fmt((min ?? max) as string | number);
  return `${currency ?? ""} ${range}`.trim();
}

function PageShell({ company, children }: { company?: { name: string; logo_url?: string | null }; children: React.ReactNode }) {
  useEffect(() => {
    if (company?.name) document.title = `Careers at ${company.name}`;
  }, [company?.name]);

  return (
    <div className="min-h-screen bg-[var(--bg,#f8fafc)] text-[var(--text,#0f172a)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          {company?.logo_url && <img src={company.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" />}
          <h1 className="text-xl font-semibold">{company ? `Careers at ${company.name}` : "Careers"}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">{children}</main>
    </div>
  );
}

function Unavailable() {
  return (
    <PageShell>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
        <h2 className="text-lg font-semibold">This careers page is not available</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">The link may be wrong, or the company is not hiring through this page right now.</p>
      </div>
    </PageShell>
  );
}

export function CareersPage() {
  const { slug = "" } = useParams();
  const query = useQuery({ queryKey: ["public-careers", slug], queryFn: () => getPublicCareers(slug), retry: false });

  if (query.isLoading) return <PageShell><p className="text-sm text-[var(--muted)]">Loading open positions...</p></PageShell>;
  if (query.isError || !query.data) return <Unavailable />;

  const { company, jobs } = query.data;

  return (
    <PageShell company={company}>
      {company.intro && <p className="whitespace-pre-wrap text-[var(--muted)]">{company.intro}</p>}
      <h2 className="text-lg font-semibold">Open positions ({jobs.length})</h2>
      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">There are no open positions at the moment. Please check back soon.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link to={`/careers/${slug}/jobs/${job.id}`} className="block rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/50">
                <h3 className="font-semibold">{job.title}</h3>
                <p className="mt-1 text-sm capitalize text-[var(--muted)]">
                  {[job.department, job.location, job.employment_type.replace("_", " "), formatSalary(job)].filter(Boolean).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <FindMyApplication slug={slug} />
    </PageShell>
  );
}

/** Applicants who lost their private link can have a new one emailed. */
function FindMyApplication({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => requestPortalLink(slug, email.trim()),
    onSuccess: () => setMessage("If we have an application for that email address, a link is on its way. Check your inbox."),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim()) return setError("Enter the email address you applied with.");
    mutation.mutate();
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="font-semibold">Already applied?</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Enter your email and we will send you a link to check your application, answer an offer or upload documents.</p>
      <form className="mt-3 flex flex-wrap items-start gap-2" onSubmit={submit} noValidate>
        <FormInput aria-label="Email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Sending..." : "Send me the link"}</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-emerald-800">{message}</p>}
    </section>
  );
}

export function CareersJobPage() {
  const { slug = "", jobId = "" } = useParams();
  const id = Number(jobId);
  const query = useQuery({ queryKey: ["public-careers", slug, "job", id], queryFn: () => getPublicJob(slug, id), retry: false, enabled: Number.isFinite(id) && id > 0 });

  if (query.isLoading) return <PageShell><p className="text-sm text-[var(--muted)]">Loading...</p></PageShell>;
  if (query.isError || !query.data) return <Unavailable />;

  const { company, job } = query.data;
  const salary = formatSalary(job);

  return (
    <PageShell company={company}>
      <Link to={`/careers/${slug}`} className="text-sm text-[var(--muted)] hover:underline">← All positions</Link>
      <div>
        <h2 className="text-2xl font-semibold">{job.title}</h2>
        <p className="mt-1 text-sm capitalize text-[var(--muted)]">{[job.department, job.location, job.employment_type.replace("_", " "), salary].filter(Boolean).join(" · ")}</p>
      </div>
      {job.description && (<section><h3 className="mb-1 font-semibold">About the role</h3><p className="whitespace-pre-wrap text-sm">{job.description}</p></section>)}
      {job.requirements && (<section><h3 className="mb-1 font-semibold">Requirements</h3><p className="whitespace-pre-wrap text-sm">{job.requirements}</p></section>)}
      <ApplyForm slug={slug} jobId={id} questions={job.questions ?? []} />
    </PageShell>
  );
}

type AnswerValue = string | string[];

/** One screening question of the job, rendered by its type. */
function QuestionField({ question, value, onChange }: { question: PublicQuestion; value: AnswerValue | undefined; onChange: (value: AnswerValue) => void }) {
  const id = `question-${question.id}`;
  const label = <>{question.label}{question.required ? " *" : ""}</>;
  const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

  if (question.type === "yes_no" || question.type === "single_choice") {
    const options = question.type === "yes_no" ? [["yes", "Yes"], ["no", "No"]] : question.options.map((option) => [option, option]);
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{label}</legend>
        {question.help_text && <p className="mb-1 text-xs text-[var(--muted)]">{question.help_text}</p>}
        <div className="flex flex-wrap gap-4">
          {options.map(([optionValue, optionLabel]) => (
            <label key={optionValue} className="flex items-center gap-2 text-sm">
              <input type="radio" name={id} value={optionValue} checked={value === optionValue} onChange={() => onChange(optionValue)} /> {optionLabel}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === "multi_choice") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{label}</legend>
        {question.help_text && <p className="mb-1 text-xs text-[var(--muted)]">{question.help_text}</p>}
        <div className="flex flex-wrap gap-4">
          {question.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.includes(option)} onChange={(e) => onChange(e.target.checked ? [...picked, option] : picked.filter((item) => item !== option))} /> {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>{label}</label>
      {question.help_text && <p className="mb-1 text-xs text-[var(--muted)]">{question.help_text}</p>}
      {question.type === "textarea" ? (
        <textarea id={id} className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={3000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={inputClass} type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"} maxLength={question.type === "text" ? 255 : undefined} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ApplyForm({ slug, jobId, questions }: { slug: string; jobId: number; questions: PublicQuestion[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [portalPath, setPortalPath] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("full_name", fullName.trim());
      form.append("email", email.trim());
      if (phone.trim()) form.append("phone", phone.trim());
      if (coverNote.trim()) form.append("cover_note", coverNote.trim());
      if (resume) form.append("resume", resume);
      questions.forEach((question) => {
        const answer = answers[question.id];
        if (Array.isArray(answer)) answer.forEach((item) => form.append(`answers[${question.id}][]`, item));
        else if (answer !== undefined && answer !== "") form.append(`answers[${question.id}]`, answer);
      });
      form.append("website", honeypot);
      return applyToPublicJob(slug, jobId, form);
    },
    onSuccess: (data) => {
      setPortalPath(data?.portal_path ?? null);
      setDone(true);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function onFile(file: File | null) {
    setError(null);
    if (file && !/\.(pdf|docx?|jpe?g|png)$/i.test(file.name)) {
      setError("Please upload your resume as a PDF, Word file, JPG or PNG.");
      if (fileRef.current) fileRef.current.value = "";
      return setResume(null);
    }
    if (file && file.size > MAX_RESUME_BYTES) {
      setError("Your resume is larger than 5 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return setResume(null);
    }
    setResume(file);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim()) return setError("Please enter your name and email address.");
    if (!resume) return setError("Please attach your resume.");
    const missing = questions.find((question) => {
      const answer = answers[question.id];
      return question.required && (answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0));
    });
    if (missing) return setError(`Please answer: ${missing.label}`);
    mutation.mutate();
  }

  if (done) {
    return (
      <section role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900">
        <h3 className="font-semibold">Application received</h3>
        <p className="mt-1 text-sm">Thank you for applying. Our team will review your application and get in touch if there is a match.</p>
        {portalPath && (
          <p className="mt-3 text-sm">
            <Link className="font-medium underline" to={portalPath}>Follow your application</Link>
            {" "}or use the link we emailed you. Keep it private: it is how you check progress, answer an offer and upload documents.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="mb-3 text-lg font-semibold">Apply for this role</h3>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="apply-name">Full name *</label>
            <FormInput id="apply-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="apply-email">Email *</label>
            <FormInput id="apply-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="apply-phone">Phone</label>
            <FormInput id="apply-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="apply-resume">Resume * (PDF, DOC, DOCX, JPG or PNG, max 5 MB)</label>
            <input id="apply-resume" ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="apply-note">Cover note</label>
          <textarea id="apply-note" className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" maxLength={3000} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />
        </div>

        {questions.length > 0 && (
          <div className="space-y-4 border-t border-[var(--border)] pt-4">
            <h4 className="text-sm font-semibold">A few questions about you</h4>
            {questions.map((question) => (
              <QuestionField key={question.id} question={question} value={answers[question.id]} onChange={(value) => setAnswers((previous) => ({ ...previous, [question.id]: value }))} />
            ))}
          </div>
        )}

        {/* Honeypot: invisible to people and assistive tech, tempting to bots. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="apply-website">Leave this field empty</label>
          <input id="apply-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Submitting..." : "Submit application"}</Button>
        </div>
      </form>
    </section>
  );
}
