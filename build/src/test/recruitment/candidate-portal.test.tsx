import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PortalView } from "@/services/recruitment-service";

const service = vi.hoisted(() => ({
  getPortal: vi.fn(),
  sendPortalSigningCode: vi.fn(),
  respondToPortalOffer: vi.fn(),
  requestPortalReschedule: vi.fn(),
  withdrawPortalApplication: vi.fn(),
  sendPortalMessage: vi.fn(),
  answerPortalTalentPool: vi.fn(),
  erasePortalData: vi.fn(),
}));

vi.mock("@/services/recruitment-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/recruitment-service")>()),
  ...service,
}));

import { CandidatePortalPage } from "@/modules/careers/candidate-portal-page";

function view(overrides: Partial<PortalView> = {}): PortalView {
  return {
    company: { name: "Acme HR" },
    candidate: { full_name: "Ayesha Malik", email: "ayesha@example.com" },
    job: { title: "Backend Engineer" },
    status: { key: "interview", label: "Interviewing", message: "You are in the interview stage." },
    timeline: [],
    interviews: [{ id: 5, reschedule_requested: false, type: "technical", scheduled_at: "2030-01-10T10:00:00Z", duration_minutes: 60 }],
    offer: null,
    documents: [],
    can_upload: true,
    can_withdraw: true,
    can_message: true,
    messages: [],
    unread_messages: 0,
    talent_pool: null,
    ...overrides,
  };
}

function renderPortal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/candidate-portal/abc"]}>
        <Routes><Route path="/candidate-portal/:token" element={<CandidatePortalPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// These drive real typing in jsdom; allow for a busy machine.
vi.setConfig({ testTimeout: 20000 });

beforeEach(() => Object.values(service).forEach((mock) => mock.mockReset()));

describe("candidate portal", () => {
  it("accepting an offer needs the emailed code, the typed name and the consent box", async () => {
    service.getPortal.mockResolvedValue(
      view({
        offer: { id: 1, status: "sent", salary: "150000", currency: "PKR", benefits: [], can_respond: true, consent_statement: "I agree to sign this offer electronically." },
      }),
    );
    service.sendPortalSigningCode.mockResolvedValue({ email: "ay••••@example.com" });
    service.respondToPortalOffer.mockResolvedValue({});

    renderPortal();
    await userEvent.click(await screen.findByRole("button", { name: "Accept offer" }));

    // Nothing is sent until every step is done.
    await userEvent.click(screen.getByRole("button", { name: "Sign and accept" }));
    expect(await screen.findByText("Type your full name to accept the offer.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Step 3/), "Ayesha Malik");
    await userEvent.click(screen.getByRole("button", { name: "Sign and accept" }));
    expect(await screen.findByText("Send yourself the code first, then enter it below.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByText(/Sent to ay••••@example.com/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Step 2/), "12ab34"); // letters are dropped
    await userEvent.click(screen.getByRole("button", { name: "Sign and accept" }));
    expect(await screen.findByText("Enter the 6-digit code from your email.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Step 2/), "56");
    await userEvent.click(screen.getByRole("button", { name: "Sign and accept" }));
    expect(await screen.findByText("Tick the box to agree to sign electronically.")).toBeInTheDocument();
    expect(service.respondToPortalOffer).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("I agree to sign this offer electronically."));
    await userEvent.click(screen.getByRole("button", { name: "Sign and accept" }));

    await waitFor(() =>
      expect(service.respondToPortalOffer).toHaveBeenCalledWith("abc", "accepted", { name: "Ayesha Malik", reason: "", code: "123456", consent: true }),
    );
  });

  it("asks to reschedule an interview with a reason", async () => {
    service.getPortal.mockResolvedValue(view());
    service.requestPortalReschedule.mockResolvedValue(null);

    renderPortal();
    await userEvent.click(await screen.findByRole("button", { name: "Ask to reschedule" }));

    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Tell us why, or suggest a better time.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Why do you need to move it?"), "Clash with my current job");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(service.requestPortalReschedule).toHaveBeenCalledWith("abc", 5, "Clash with my current job", []));
  });

  it("shows a pending reschedule request instead of the button", async () => {
    service.getPortal.mockResolvedValue(view({ interviews: [{ id: 5, reschedule_requested: true, type: "technical", scheduled_at: "2030-01-10T10:00:00Z" }] }));

    renderPortal();

    expect(await screen.findByText(/You asked to reschedule/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to reschedule" })).not.toBeInTheDocument();
  });

  it("withdraws only after the candidate confirms", async () => {
    service.getPortal.mockResolvedValue(view());
    service.withdrawPortalApplication.mockResolvedValue(view());

    renderPortal();
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw my application" }));
    expect(service.withdrawPortalApplication).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Reason (optional)"), "Took another job");
    await userEvent.click(screen.getByRole("button", { name: "Yes, withdraw" }));

    await waitFor(() => expect(service.withdrawPortalApplication).toHaveBeenCalledWith("abc", "Took another job"));
  });

  it("hides withdraw once it is not possible", async () => {
    service.getPortal.mockResolvedValue(view({ can_withdraw: false, status: { key: "withdrawn", label: "Application withdrawn", message: "You withdrew this application." } }));

    renderPortal();

    expect(await screen.findByTestId("portal-status")).toHaveTextContent("Application withdrawn");
    expect(screen.queryByRole("button", { name: "Withdraw my application" })).not.toBeInTheDocument();
  });

  it("shows the conversation and sends a message to the team", async () => {
    service.getPortal.mockResolvedValue(
      view({
        unread_messages: 1,
        messages: [{ id: 1, from: "team", author: "Sana Recruiter", body: "Can you do Tuesday?", at: "2030-01-01T10:00:00Z" }],
      }),
    );
    service.sendPortalMessage.mockResolvedValue(view());

    renderPortal();

    expect(await screen.findByText("Can you do Tuesday?")).toBeInTheDocument();
    expect(screen.getByText("1 new from the team")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Write to the hiring team"), "Yes, Tuesday works");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(service.sendPortalMessage).toHaveBeenCalledWith("abc", "Yes, Tuesday works"));
  });

  it("lets the candidate refuse to stay on file and erase their data", async () => {
    service.getPortal.mockResolvedValue(view({ talent_pool: { status: "pending", can_respond: true, expires_at: "2031-01-01T00:00:00Z" } }));
    service.answerPortalTalentPool.mockResolvedValue(view());
    service.erasePortalData.mockResolvedValue(null);

    renderPortal();

    await userEvent.click(await screen.findByRole("button", { name: "No, do not keep my details" }));
    await waitFor(() => expect(service.answerPortalTalentPool).toHaveBeenCalledWith("abc", false));

    await userEvent.click(screen.getByRole("button", { name: "Erase my data" }));
    await userEvent.click(screen.getByRole("button", { name: "Erase everything" }));

    await waitFor(() => expect(service.erasePortalData).toHaveBeenCalledWith("abc"));
    expect(await screen.findByText(/Your data has been erased/)).toBeInTheDocument();
  });
});
