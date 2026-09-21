import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CallButton } from "@/components/call/CallButton";
import type { ChatConversation } from "@/services/chat-service";
import { DEFAULT_CALL_CONFIG } from "@/services/call-service";

const initiateCall = vi.fn();
const startCall = vi.fn();

vi.mock("@/services/call-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/call-service")>()),
  initiateCall: (...args: unknown[]) => initiateCall(...args),
}));
vi.mock("@/lib/ringtone", () => ({ startRingtone: () => Promise.resolve() }));
vi.mock("@/components/notifications/toast", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/call/CallProvider", () => ({
  useCallContext: () => ({ activeCall: null, incomingCall: null, config: DEFAULT_CALL_CONFIG, startCall }),
}));

function conversation(memberCount: number, type: "direct" | "group" = "group"): ChatConversation {
  return {
    id: 5,
    type,
    name: type === "group" ? "Everyone" : null,
    participants: Array.from({ length: memberCount }, (_, i) => ({
      id: i + 1,
      name: `Person ${i + 1}`,
      email: `p${i + 1}@acme.test`,
    })),
    last_message: null,
    unread_count: 0,
    created_at: "2026-09-18T10:00:00Z",
  };
}

describe("CallButton", () => {
  beforeEach(() => {
    initiateCall.mockReset();
    startCall.mockReset();
    initiateCall.mockResolvedValue({ id: 99 });
  });

  it("rings a small conversation immediately", async () => {
    const user = userEvent.setup();
    render(<CallButton conversation={conversation(3)} currentUserId={1} />);

    await user.click(screen.getByRole("button", { name: "Start voice call" }));

    expect(initiateCall).toHaveBeenCalledWith({ conversation_id: 5, participant_ids: [2, 3], type: "audio" });
    expect(startCall).toHaveBeenCalledWith({ id: 99 });
  });

  it("lets the caller choose who to ring in a group larger than a call can hold", async () => {
    const user = userEvent.setup();
    render(<CallButton conversation={conversation(8)} currentUserId={1} />);

    await user.click(screen.getByRole("button", { name: "Start video call" }));

    expect(initiateCall).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /choose who to video call/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select people to call/i })).toBeDisabled();
  });

  it("caps the selection at the call size and sends exactly the chosen people", async () => {
    const user = userEvent.setup();
    render(<CallButton conversation={conversation(8)} currentUserId={1} />);

    await user.click(screen.getByRole("button", { name: "Start voice call" }));
    for (const name of ["Person 2", "Person 4", "Person 6"]) {
      await user.click(screen.getByLabelText(name));
    }

    // Three invitees is the maximum (four people including the caller): nobody else can be ticked.
    expect(screen.getByLabelText("Person 7")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /call 3 people/i }));

    expect(initiateCall).toHaveBeenCalledWith({ conversation_id: 5, participant_ids: [2, 4, 6], type: "audio" });
    expect(startCall).toHaveBeenCalled();
  });

  it("closes the picker with Escape", async () => {
    const user = userEvent.setup();
    render(<CallButton conversation={conversation(8)} currentUserId={1} />);

    await user.click(screen.getByRole("button", { name: "Start voice call" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
