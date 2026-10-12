import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Candidate, PipelineConfig } from "@/services/recruitment-service";

const service = vi.hoisted(() => ({
  getPublicJob: vi.fn(),
  applyToPublicJob: vi.fn(),
  getPipeline: vi.fn(),
  savePipeline: vi.fn(),
  resetPipeline: vi.fn(),
  moveCandidateToPipelineStage: vi.fn(),
  changeCandidateStage: vi.fn(),
  getReferenceForm: vi.fn(),
  submitReferenceForm: vi.fn(),
}));

vi.mock("@/services/recruitment-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/recruitment-service")>()),
  ...service,
}));

import { CareersJobPage } from "@/modules/careers/careers-page";
import { ReferenceFormPage } from "@/modules/careers/reference-form-page";
import { PipelineEditor } from "@/modules/recruitment/hiring-setup";
import { PipelineStepper, ScreeningAnswersPanel, StageMover } from "@/modules/recruitment/candidate-pipeline-parts";

vi.setConfig({ testTimeout: 20000 });

beforeEach(() => Object.values(service).forEach((mock) => mock.mockReset()));

function withProviders(node: React.ReactNode, path = "/", route = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={node} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const stages = [
  { id: 1, name: "Applied", category: "applied", is_skippable: false, sort_order: 0 },
  { id: 2, name: "Phone screen", category: "screening", is_skippable: true, sort_order: 1 },
  { id: 3, name: "Technical test", category: "interview", is_skippable: false, sort_order: 2 },
  { id: 4, name: "Panel interview", category: "interview", is_skippable: false, sort_order: 3 },
  { id: 5, name: "Offer", category: "offer", is_skippable: false, sort_order: 4 },
] as const;

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 7,
    job_opening_id: 1,
    full_name: "Ayesha Malik",
    email: "ayesha@example.com",
    stage: "screening",
    status: "active",
    pipeline: { scope: "job", stages: [...stages], current_index: 1, current: stages[1], reopen_to: null },
    ...overrides,
  } as Candidate;
}

describe("careers application form", () => {
  const job = {
    id: 3,
    title: "Backend Engineer",
    employment_type: "full_time",
    questions: [
      { id: 11, label: "Are you authorised to work in Pakistan?", type: "yes_no", options: [], required: true },
      { id: 12, label: "Notice period", type: "single_choice", options: ["Immediate", "1 month"], required: false },
      { id: 13, label: "Which databases?", type: "multi_choice", options: ["MySQL", "Postgres"], required: false },
    ],
  };

  function renderJob() {
    service.getPublicJob.mockResolvedValue({ company: { name: "Acme HR" }, job });
    return withProviders(<CareersJobPage />, "/careers/acme/jobs/3", "/careers/:slug/jobs/:jobId");
  }

  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/Full name/), "Zara Applicant");
    await user.type(screen.getByLabelText(/^Email/), "zara@example.com");
    await user.upload(screen.getByLabelText(/Resume/), new File(["cv"], "cv.pdf", { type: "application/pdf" }));
  }

  it("shows the screening questions and will not submit without a required answer", async () => {
    const user = userEvent.setup();
    renderJob();
    await fillBasics(user);

    expect(screen.getByText(/A few questions about you/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Submit application/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please answer: Are you authorised to work in Pakistan?");
    expect(service.applyToPublicJob).not.toHaveBeenCalled();
  });

  it("sends each answer under answers[<question id>]", async () => {
    const user = userEvent.setup();
    service.applyToPublicJob.mockResolvedValue({ portal_path: "/candidate-portal/abc" });
    renderJob();
    await fillBasics(user);

    await user.click(screen.getByLabelText("Yes"));
    await user.click(screen.getByLabelText("1 month"));
    await user.click(screen.getByLabelText("MySQL"));
    await user.click(screen.getByLabelText("Postgres"));
    await user.click(screen.getByRole("button", { name: /Submit application/ }));

    await waitFor(() => expect(service.applyToPublicJob).toHaveBeenCalled());
    const form = service.applyToPublicJob.mock.calls[0][2] as FormData;
    expect(form.get("answers[11]")).toBe("yes");
    expect(form.get("answers[12]")).toBe("1 month");
    expect(form.getAll("answers[13][]")).toEqual(["MySQL", "Postgres"]);
    expect(await screen.findByText("Application received")).toBeInTheDocument();
  });
});

describe("candidate pipeline", () => {
  it("lists the job's own stages and marks the current one", () => {
    render(<PipelineStepper candidate={candidate()} />);

    expect(screen.getByText("Technical test")).toBeInTheDocument();
    expect(screen.getByText("Phone screen")).toHaveAttribute("aria-current", "step");
  });

  it("offers later stages and sideways moves, and moves by the stage id", async () => {
    const user = userEvent.setup();
    service.moveCandidateToPipelineStage.mockResolvedValue({});
    withProviders(<StageMover candidate={candidate()} />);

    const select = screen.getByLabelText("Move to stage");
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.text);
    expect(options).toEqual(["Technical test", "Panel interview", "Offer"]);

    await user.selectOptions(select, "Panel interview");
    await user.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(service.moveCandidateToPipelineStage).toHaveBeenCalledWith(7, 4));
  });

  it("reopens a rejected candidate to where they were or earlier only", async () => {
    const user = userEvent.setup();
    service.moveCandidateToPipelineStage.mockResolvedValue({});
    withProviders(
      <StageMover candidate={candidate({ stage: "rejected", pipeline: { scope: "job", stages: [...stages], current_index: null, current: null, reopen_to: stages[2] } })} />,
    );

    const select = screen.getByLabelText("Reopen to stage") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual(["Applied", "Phone screen (optional)", "Technical test"]);
    // Defaults to the stage they were rejected from.
    expect(select.selectedOptions[0].text).toBe("Technical test");

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(service.moveCandidateToPipelineStage).toHaveBeenCalledWith(7, 3));
  });

  it("shows screening answers and flags the ones that failed a knockout", () => {
    render(
      <ScreeningAnswersPanel
        candidate={candidate({
          knockout_failed: true,
          stage: "rejected",
          answers: [
            { id: 1, question: "Authorised to work?", type: "yes_no", answer: ["no"], knocked_out: true },
            { id: 2, question: "Notice period", type: "single_choice", answer: ["Immediate"], knocked_out: false },
          ],
        })}
      />,
    );

    expect(screen.getByText("Authorised to work?")).toBeInTheDocument();
    expect(screen.getAllByText("did not meet requirement")).toHaveLength(1);
    expect(screen.getByText(/rejected automatically/)).toBeInTheDocument();
  });
});

describe("pipeline editor", () => {
  const config: PipelineConfig = {
    scope: "job",
    job_opening_id: 1,
    stages: stages.map((stage) => ({ ...stage })),
    categories: ["applied", "screening", "interview", "offer"],
    candidate_counts: { "2": 3 },
  };

  it("will not save a pipeline that loses a group, and saves a valid one", async () => {
    const user = userEvent.setup();
    service.getPipeline.mockResolvedValue({ ...config, stages: config.stages.slice(0, 4) });
    service.savePipeline.mockResolvedValue(config);
    withProviders(<PipelineEditor jobId={1} canEdit />);

    // Applied, Phone screen, Technical test, Panel interview: no Offer stage.
    await screen.findByLabelText("Stage 1 name");
    await user.type(screen.getByLabelText("Stage 2 name"), " 2");
    await user.click(screen.getByRole("button", { name: "Save pipeline" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep at least one stage in each of: Offer");
    expect(service.savePipeline).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Offer" }));
    const names = screen.getAllByLabelText(/Stage \d name/);
    await user.type(names[names.length - 1], "Offer");
    await user.click(screen.getByRole("button", { name: "Save pipeline" }));

    await waitFor(() => expect(service.savePipeline).toHaveBeenCalled());
    const [jobId, sent] = service.savePipeline.mock.calls[0];
    expect(jobId).toBe(1);
    expect(sent.map((stage: { name: string }) => stage.name)).toEqual(["Applied", "Phone screen 2", "Technical test", "Panel interview", "Offer"]);
  });

  it("keeps stage groups in order", async () => {
    const user = userEvent.setup();
    service.getPipeline.mockResolvedValue(config);
    withProviders(<PipelineEditor jobId={1} canEdit />);

    await screen.findByLabelText("Stage 1 name");
    await user.selectOptions(screen.getByLabelText("Stage 4 group"), "screening");
    await user.click(screen.getByRole("button", { name: "Save pipeline" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Stages must stay in order");
    expect(service.savePipeline).not.toHaveBeenCalled();
  });
});

describe("referee questionnaire", () => {
  const form = {
    candidate_name: "Zoya Candidate",
    job_title: "Backend Engineer",
    company: "Acme HR",
    referee_name: "Hina Rao",
    already_submitted: false,
    questions: [
      { key: "strengths", label: "What are their main strengths?", type: "textarea", required: true },
      { key: "overall", label: "Overall, how would you rate their performance?", type: "rating", required: true },
      { key: "comments", label: "Anything else?", type: "textarea", required: false },
    ],
  };

  it("needs the required answers and then sends them with the link's token", async () => {
    const user = userEvent.setup();
    service.getReferenceForm.mockResolvedValue(form);
    service.submitReferenceForm.mockResolvedValue(null);
    withProviders(<ReferenceFormPage />, "/reference/tok123", "/reference/:token");

    expect(await screen.findByText(/Zoya Candidate/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send reference" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please answer: What are their main strengths?");

    await user.type(screen.getByLabelText(/main strengths/), "Reliable and kind");
    await user.click(screen.getByLabelText("4"));
    await user.click(screen.getByRole("button", { name: "Send reference" }));

    await waitFor(() => expect(service.submitReferenceForm).toHaveBeenCalledWith("tok123", { strengths: "Reliable and kind", overall: "4" }));
    expect(await screen.findByText("Thank you")).toBeInTheDocument();
  });

  it("says the link is unavailable when it has expired", async () => {
    service.getReferenceForm.mockRejectedValue(new Error("This link is not valid or has expired."));
    withProviders(<ReferenceFormPage />, "/reference/old", "/reference/:token");

    expect(await screen.findByText("This link is not available")).toBeInTheDocument();
  });
});
