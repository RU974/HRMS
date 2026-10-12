import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children, initial: _i, animate: _a, ...props }: Record<string, unknown> & { children?: ReactNode }) => <div {...(props as object)}>{children}</div> },
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: { hasPermission: (permission: string) => boolean }) => unknown) => selector({ hasPermission: () => true }),
}));

vi.mock("@/components/notifications/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const service = vi.hoisted(() => ({
  bulkCandidateAction: vi.fn(),
  getBulkRun: vi.fn(),
  listEmailTemplates: vi.fn(),
  createEmailTemplate: vi.fn(),
}));

vi.mock("@/services/recruitment-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/recruitment-service")>()),
  ...service,
}));

import { BulkActionBar, BulkActionModal } from "@/modules/recruitment/bulk-components";

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// These drive real typing in jsdom; allow for a busy machine.
vi.setConfig({ testTimeout: 20000 });

beforeEach(() => {
  Object.values(service).forEach((mock) => mock.mockReset());
  service.listEmailTemplates.mockResolvedValue([]);
});

describe("BulkActionBar", () => {
  it("shows nothing when there is no selection and nothing to offer", () => {
    const { container } = render(<BulkActionBar count={0} canEdit onClear={vi.fn()} onChoose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers to select everything matching the filter once the page is selected", async () => {
    const onSelect = vi.fn();
    render(<BulkActionBar count={15} canEdit onClear={vi.fn()} onChoose={vi.fn()} offerAllMatching={{ total: 240, onSelect }} />);

    await userEvent.click(screen.getByRole("button", { name: "Select all 240 matching this filter" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("says when everything matching is selected and how many were left out", () => {
    render(<BulkActionBar count={238} canEdit onClear={vi.fn()} onChoose={vi.fn()} allMatching={{ excluded: 2 }} />);

    expect(screen.getByText(/238 selected \(everything matching this filter, 2 left out\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Select all/ })).not.toBeInTheDocument();
  });

  it("lets viewers see the selection but not act on it, and disables email beyond the limit", async () => {
    const { rerender } = render(<BulkActionBar count={3} canEdit={false} onClear={vi.fn()} onChoose={vi.fn()} />);
    expect(screen.queryByLabelText("Bulk action")).not.toBeInTheDocument();

    rerender(<BulkActionBar count={600} canEdit onClear={vi.fn()} onChoose={vi.fn()} />);
    expect(screen.getByRole("option", { name: /Send an email \(max 500\)/ })).toBeDisabled();
  });
});

describe("BulkActionModal", () => {
  it("sends a long explicit selection in request-sized groups and adds up the result", async () => {
    service.bulkCandidateAction.mockImplementation(async (payload: { ids: number[] }) => ({ action: "tag", requested: payload.ids.length, succeeded: payload.ids, failed: [] }));
    const onDone = vi.fn();
    const ids = Array.from({ length: 250 }, (_, index) => index + 1);

    renderWithClient(<BulkActionModal action="tag" scope={{ kind: "ids", ids }} onClose={vi.fn()} onDone={onDone} />);

    await userEvent.type(screen.getByLabelText("Tags"), "shortlist");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await screen.findByText(/of 250 candidates updated/);
    expect(service.bulkCandidateAction).toHaveBeenCalledTimes(2);
    expect(service.bulkCandidateAction.mock.calls[0][0].ids).toHaveLength(200);
    expect(service.bulkCandidateAction.mock.calls[1][0].ids).toHaveLength(50);
    expect(onDone).toHaveBeenCalledWith({ requested: 250, succeeded: 250, failed: [] });
  });

  it("lists the people an action could not handle", async () => {
    service.bulkCandidateAction.mockResolvedValue({
      action: "move",
      requested: 2,
      succeeded: [1],
      failed: [{ id: 2, name: "Bilal Raza", reason: "Invalid candidate stage transition." }],
    });

    renderWithClient(<BulkActionModal action="move" scope={{ kind: "ids", ids: [1, 2] }} onClose={vi.fn()} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Bilal Raza")).toBeInTheDocument();
    expect(screen.getByText(/Invalid candidate stage transition/)).toBeInTheDocument();
    expect(screen.getByText(/1 could not be/)).toBeInTheDocument();
  });

  it("sends 'everything matching' as a filter and follows a large run until it finishes", async () => {
    service.bulkCandidateAction.mockResolvedValue({ run: { id: 9, status: "queued", total: 260, processed: 0 } });
    service.getBulkRun.mockResolvedValue({ id: 9, status: "done", total: 260, processed: 260, succeeded: 258, failed_count: 2, failed: [{ id: 5, name: "Amna Khan", reason: "Unexpected error." }] });
    const onDone = vi.fn();

    renderWithClient(
      <BulkActionModal action="tag" scope={{ kind: "matching", filters: { stage: "applied", job_opening_id: 4 }, excludeIds: [12], total: 260 }} onClose={vi.fn()} onDone={onDone} />,
    );

    expect(screen.getByText(/everyone who matches the current filter/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Tags"), "picked");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await screen.findByText(/of 260 candidates updated/);
    expect(service.bulkCandidateAction).toHaveBeenCalledOnce();
    expect(service.bulkCandidateAction.mock.calls[0][0]).toMatchObject({
      action: "tag",
      tags: ["picked"],
      select_all: { filters: { stage: "applied", job_opening_id: 4 }, exclude_ids: [12] },
    });
    expect(service.bulkCandidateAction.mock.calls[0][0].ids).toBeUndefined();
    expect(service.getBulkRun).toHaveBeenCalledWith(9);
    expect(screen.getByText("Amna Khan")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith({ requested: 260, succeeded: 258, failed: [{ id: 5, name: "Amna Khan", reason: "Unexpected error." }] });
  });

  it("fills an email from a saved template and can save the email as a new template", async () => {
    service.listEmailTemplates.mockResolvedValue([{ id: 1, name: "Rejection", subject: "About {{job}}", body: "Hi {{first_name}}, thanks." }]);
    service.createEmailTemplate.mockResolvedValue({ id: 2, name: "Mine", subject: "About {{job}}", body: "Hi {{first_name}}, thanks." });

    renderWithClient(<BulkActionModal action="email" scope={{ kind: "ids", ids: [1] }} onClose={vi.fn()} onDone={vi.fn()} />);

    await userEvent.selectOptions(await screen.findByLabelText("Saved template"), "1");
    expect(screen.getByLabelText("Subject")).toHaveValue("About {{job}}");
    expect(screen.getByLabelText("Message")).toHaveValue("Hi {{first_name}}, thanks.");

    await userEvent.click(screen.getByRole("button", { name: "Save as template" }));
    await userEvent.type(screen.getByLabelText("Template name"), "Mine");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(service.createEmailTemplate).toHaveBeenCalledWith({ name: "Mine", subject: "About {{job}}", body: "Hi {{first_name}}, thanks." }));
  });

  it("refuses to email more people than the limit", async () => {
    renderWithClient(<BulkActionModal action="email" scope={{ kind: "matching", filters: {}, excludeIds: [], total: 700 }} onClose={vi.fn()} onDone={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Subject"), "Hello");
    await userEvent.type(screen.getByLabelText("Message"), "Body");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText(/at most 500 people/)).toBeInTheDocument();
    expect(service.bulkCandidateAction).not.toHaveBeenCalled();
  });
});
