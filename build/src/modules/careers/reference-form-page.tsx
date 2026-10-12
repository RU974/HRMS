import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import { type ReferenceQuestion, getReferenceForm, submitReferenceForm } from "@/services/recruitment-service";

const card = "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5";
const areaClass = "min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm";

function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.title = "Reference request";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg,#f8fafc)] text-[var(--text,#0f172a)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-2xl px-4 py-5"><h1 className="text-xl font-semibold">Reference request</h1></div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">{children}</main>
    </div>
  );
}

function Field({ question, value, onChange }: { question: ReferenceQuestion; value: string; onChange: (value: string) => void }) {
  const id = `ref-${question.key}`;
  const label = <>{question.label}{question.required ? " *" : ""}</>;

  if (question.type === "rating" || question.type === "yes_no") {
    const options = question.type === "rating" ? [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]] : [["yes", "Yes"], ["no", "No"]];
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{label}</legend>
        {question.type === "rating" && <p className="mb-1 text-xs text-[var(--muted)]">1 = poor, 5 = excellent</p>}
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

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>{label}</label>
      {question.type === "textarea"
        ? <textarea id={id} className={areaClass} maxLength={3000} value={value} onChange={(e) => onChange(e.target.value)} />
        : <FormInput id={id} maxLength={255} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

export function ReferenceFormPage() {
  const { token = "" } = useParams();
  const query = useQuery({ queryKey: ["public-reference", token], queryFn: () => getReferenceForm(token), retry: false });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => submitReferenceForm(token, answers),
    onSuccess: () => setDone(true),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  if (query.isLoading) return <Shell><p className="text-sm text-[var(--muted)]">Loading...</p></Shell>;

  if (query.isError || !query.data) {
    return (
      <Shell>
        <section className={card}>
          <h2 className="font-semibold">This link is not available</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">It may have expired, or the reference has already been submitted. If you still want to help, please reply to the email you received.</p>
        </section>
      </Shell>
    );
  }

  const form = query.data;

  if (done || form.already_submitted) {
    return (
      <Shell>
        <section role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900">
          <h2 className="font-semibold">Thank you</h2>
          <p className="mt-1 text-sm">Your reference for {form.candidate_name} has been sent to the hiring team.</p>
        </section>
      </Shell>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const missing = form.questions.find((question) => question.required && !(answers[question.key] ?? "").trim());
    if (missing) return setError(`Please answer: ${missing.label}`);
    mutation.mutate();
  }

  return (
    <Shell>
      <section className={card}>
        <p className="text-sm">
          {form.referee_name ? `Hello ${form.referee_name}, ` : "Hello, "}
          <strong>{form.candidate_name}</strong> has applied for {form.job_title ?? "a role"}{form.company ? ` at ${form.company}` : ""} and named you as a reference. Your honest answers help us make a fair decision. They are shared only with the hiring team.
        </p>
      </section>
      <form className={`${card} space-y-4`} onSubmit={submit} noValidate>
        {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {form.questions.map((question) => (
          <Field key={question.key} question={question} value={answers[question.key] ?? ""} onChange={(value) => setAnswers((previous) => ({ ...previous, [question.key]: value }))} />
        ))}
        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Sending..." : "Send reference"}</Button>
        </div>
      </form>
    </Shell>
  );
}
