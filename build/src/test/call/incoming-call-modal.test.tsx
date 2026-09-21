import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncomingCallModal } from "@/components/call/IncomingCallModal";
import type { Call } from "@/services/call-service";

function makeCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 10,
    conversation_id: 1,
    initiated_by: 1,
    host_id: 1,
    initiator: { id: 1, name: "Alice Johnson", email: "alice@acme.test" },
    type: "audio",
    call_type: "direct",
    status: "ringing",
    participants: [
      { user_id: 1, user: { id: 1, name: "Alice Johnson", email: "alice@acme.test" }, status: "joined", joined_at: null, left_at: null },
      { user_id: 2, user: { id: 2, name: "Bob", email: "bob@acme.test" }, status: "invited", joined_at: null, left_at: null },
    ],
    started_at: null,
    ended_at: null,
    duration: null,
    created_at: "2026-09-18T10:00:00Z",
    ...overrides,
  };
}

describe("IncomingCallModal", () => {
  it("shows who is calling and what kind of call it is", () => {
    render(<IncomingCallModal call={makeCall()} busy={false} onAccept={() => {}} onDecline={() => {}} />);

    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText(/Incoming voice call/i)).toBeInTheDocument();
  });

  it("labels video and group calls", () => {
    const { rerender } = render(
      <IncomingCallModal call={makeCall({ type: "video" })} busy={false} onAccept={() => {}} onDecline={() => {}} />
    );
    expect(screen.getByText(/Incoming video call/i)).toBeInTheDocument();

    rerender(
      <IncomingCallModal call={makeCall({ call_type: "group" })} busy={false} onAccept={() => {}} onDecline={() => {}} />
    );
    expect(screen.getByText(/Group voice call · 2 people/i)).toBeInTheDocument();
  });

  it("accepts and declines through clearly labelled buttons", async () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const user = userEvent.setup();
    render(<IncomingCallModal call={makeCall()} busy={false} onAccept={onAccept} onDecline={onDecline} />);

    await user.click(screen.getByRole("button", { name: "Accept call" }));
    expect(onAccept).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Decline call" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("puts focus on Accept so keyboard users can answer immediately", () => {
    render(<IncomingCallModal call={makeCall()} busy={false} onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByRole("button", { name: "Accept call" })).toHaveFocus();
  });

  it("Escape declines the call", async () => {
    const onDecline = vi.fn();
    const user = userEvent.setup();
    render(<IncomingCallModal call={makeCall()} busy={false} onAccept={() => {}} onDecline={onDecline} />);

    await user.keyboard("{Escape}");

    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and ignores Escape while a response is in flight", async () => {
    const onDecline = vi.fn();
    const user = userEvent.setup();
    render(<IncomingCallModal call={makeCall()} busy onAccept={() => {}} onDecline={onDecline} />);

    expect(screen.getByRole("button", { name: "Accept call" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline call" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("is announced to assistive tech as an alert dialog", () => {
    render(<IncomingCallModal call={makeCall()} busy={false} onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
