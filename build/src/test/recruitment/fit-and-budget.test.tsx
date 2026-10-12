import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BudgetCheck } from "@/services/recruitment-service";

vi.mock("framer-motion", () => ({ motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> } }));

import { FitBadge, FitPanel, ResumeReviewNotice, fitSummary, fitTone } from "@/modules/recruitment/fit-components";
import { budgetWarnings } from "@/modules/recruitment/job-extras";
import type { Candidate } from "@/services/recruitment-service";

describe("fit score display", () => {
  it("colours scores from weak to strong", () => {
    expect([10, 30, 60, 90].map(fitTone)).toEqual(["red", "amber", "blue", "emerald"]);
  });

  it("explains a score in words and shows nothing for people who could not be scored", () => {
    expect(fitSummary({ matched_skills: ["PHP"], missing_skills: ["Docker"], required_years: 5, candidate_years: 2 })).toBe("Matches: PHP · Missing: Docker · Experience 2 of 5 years asked");
    expect(fitSummary({ reason: "no_resume" })).toBe("No readable resume to score");
    expect(fitSummary(null)).toBe("Not scored");

    const { container, rerender } = render(<FitBadge score={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<FitBadge score={82} breakdown={{ matched_skills: ["PHP"] }} />);
    expect(screen.getByText("82% fit")).toBeInTheDocument();
  });

  it("lists what the candidate has and lacks", () => {
    render(
      <FitPanel
        candidate={{ fit_score: 40, fit_breakdown: { matched_skills: ["PHP"], missing_skills: ["Docker", "Redis"], required_years: 5, candidate_years: null } } as Candidate}
      />,
    );

    expect(screen.getByText("40% fit")).toBeInTheDocument();
    expect(screen.getByText("PHP")).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.getByText(/no stated experience/)).toBeInTheDocument();
  });

  it("flags scanned resumes for a human instead of silently showing nothing", () => {
    const { container, rerender } = render(<ResumeReviewNotice candidate={{ has_resume: true, resume_review_reason: null }} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ResumeReviewNotice candidate={{ has_resume: true, resume_review_reason: "no_text_layer" }} />);
    expect(screen.getByRole("status")).toHaveTextContent(/looks like a scan/);
  });
});

describe("budget warnings", () => {
  const base: BudgetCheck = {
    fiscal_year: 2026,
    currency: "PKR",
    unconverted_currencies: [],
    requested_headcount: 3,
    estimated_cost: 360000,
    has_budget: true,
    approved_headcount: 2,
    approved_budget: 300000,
    used_headcount: 0,
    used_cost: 0,
    over_headcount: false,
    over_budget: false,
    high_cost: false,
    cost_threshold: null,
    requires_executive: false,
  };

  it("has no warnings inside the budget", () => {
    expect(budgetWarnings(base)).toEqual([]);
  });

  it("explains each way a request goes over", () => {
    const warnings = budgetWarnings({ ...base, over_headcount: true, over_budget: true, high_cost: true, cost_threshold: 100000, requires_executive: true });

    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toMatch(/approved headcount.*2 approved/);
    expect(warnings[1]).toMatch(/approved budget/);
    expect(warnings[2]).toMatch(/limit for HR-only approval/);
    // Amounts carry the company's base currency.
    expect(warnings[1]).toMatch(/PKR 300,000/);
  });

  it("says when a currency has no exchange rate instead of hiding its cost", () => {
    const warnings = budgetWarnings({ ...base, unconverted_currencies: ["EUR"], requires_executive: true });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/No exchange rate is set for EUR/);
  });
});
