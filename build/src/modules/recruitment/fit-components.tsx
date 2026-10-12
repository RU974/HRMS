import { Candidate, FitBreakdown } from "@/services/recruitment-service";
import { Badge } from "./shared";

type Tone = "emerald" | "blue" | "amber" | "red";

export function fitTone(score: number): Tone {
  if (score >= 75) return "emerald";
  if (score >= 50) return "blue";
  if (score >= 25) return "amber";
  return "red";
}

export function fitSummary(breakdown?: FitBreakdown | null): string {
  if (!breakdown) return "Not scored";
  if (breakdown.reason === "no_resume") return "No readable resume to score";
  if (breakdown.reason === "no_requirements") return "The job lists no skills or years to score against";

  const parts: string[] = [];
  if (breakdown.matched_skills?.length) parts.push(`Matches: ${breakdown.matched_skills.join(", ")}`);
  if (breakdown.missing_skills?.length) parts.push(`Missing: ${breakdown.missing_skills.join(", ")}`);
  if (breakdown.required_years) parts.push(`Experience ${breakdown.candidate_years ?? "unknown"} of ${breakdown.required_years} years asked`);
  return parts.join(" · ");
}

/** Compact fit score for lists and board cards. Shows nothing for people who could not be scored. */
export function FitBadge({ score, breakdown }: { score?: number | null; breakdown?: FitBreakdown | null }) {
  if (score == null) return null;

  return (
    <span title={fitSummary(breakdown)}>
      <Badge tone={fitTone(score)}>{score}% fit</Badge>
    </span>
  );
}

/** Why a candidate got their fit score, and what they lack. */
export function FitPanel({ candidate }: { candidate: Candidate }) {
  const breakdown = candidate.fit_breakdown;
  const score = candidate.fit_score;

  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Fit for this job</h3>
        {score != null ? <Badge tone={fitTone(score)}>{score}% fit</Badge> : <span className="text-[var(--muted)]">{fitSummary(breakdown)}</span>}
      </div>

      {score != null && breakdown && (
        <div className="space-y-2">
          {breakdown.matched_skills && breakdown.matched_skills.length > 0 && (
            <p className="flex flex-wrap items-center gap-1"><span className="text-[var(--muted)]">Has:</span>{breakdown.matched_skills.map((skill) => <Badge key={skill} tone="emerald">{skill}</Badge>)}</p>
          )}
          {breakdown.missing_skills && breakdown.missing_skills.length > 0 && (
            <p className="flex flex-wrap items-center gap-1"><span className="text-[var(--muted)]">Missing:</span>{breakdown.missing_skills.map((skill) => <Badge key={skill} tone="red">{skill}</Badge>)}</p>
          )}
          {breakdown.required_years ? (
            <p className="text-[var(--muted)]">
              Asks for {breakdown.required_years}+ years; the resume shows {breakdown.candidate_years != null ? `${breakdown.candidate_years} years` : "no stated experience"}.
            </p>
          ) : null}
          <p className="text-xs text-[var(--muted)]">
            Skills and years are read from the job's requirements and the resume, so treat the score as a way to sort the pile, not a verdict.
          </p>
        </div>
      )}
    </div>
  );
}

const reviewText: Record<NonNullable<Candidate["resume_review_reason"]>, string> = {
  no_text_layer: "This resume has no readable text (it looks like a scan or an image), so skills, experience and fit could not be read. Read it yourself, or upload a text-based PDF or Word copy.",
  little_text: "Very little text could be read from this resume, so the skills, experience and fit score may be incomplete.",
  unreadable: "This resume could not be read, so skills, experience and fit could not be filled in.",
  name_unclear: "The name could not be read from this resume with confidence, so the candidate's name may be a guess. Check it against the resume.",
  no_details: "No email, phone number or known skills could be found in this resume, so its layout may not have been understood. Check the details yourself.",
};

export function ResumeReviewNotice({ candidate }: { candidate: Pick<Candidate, "resume_review_reason" | "has_resume"> }) {
  if (!candidate.has_resume || !candidate.resume_review_reason) return null;

  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>Check this resume by hand.</strong> {reviewText[candidate.resume_review_reason]}
    </div>
  );
}
