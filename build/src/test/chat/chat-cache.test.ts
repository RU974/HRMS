import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@/services/chat-service";
import {
  appendMessage,
  flattenThread,
  markMessageDeleted,
  replaceMessage,
  type ThreadCache,
} from "@/modules/chat/lib/chat-cache";

function msg(id: number, text = `message ${id}`): ChatMessage {
  return {
    id,
    conversation_id: 1,
    sender_id: 1,
    receiver_id: 2,
    message: text,
    is_read: false,
    created_at: "2026-09-18T10:00:00Z",
    updated_at: "2026-09-18T10:00:00Z",
    attachment_path: id === 3 ? "chat-attachments/x.pdf" : null,
    attachment_name: id === 3 ? "x.pdf" : null,
  };
}

/** pages[0] is the NEWEST page, as the infinite query stores them. */
function cache(): ThreadCache {
  return {
    pageParams: [undefined, 3],
    pages: [
      { data: [msg(3), msg(4)], has_more: true },
      { data: [msg(1), msg(2)], has_more: false },
    ],
  };
}

describe("chat thread cache helpers", () => {
  it("flattens pages oldest-first", () => {
    expect(flattenThread(cache()).map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("flattening nothing gives an empty list", () => {
    expect(flattenThread(undefined)).toEqual([]);
  });

  it("appends a new message to the newest page", () => {
    const next = appendMessage(cache(), msg(5))!;
    expect(flattenThread(next).map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
    expect(next.pages[0].data.map((m) => m.id)).toEqual([3, 4, 5]);
  });

  it("never duplicates a message that arrives twice (send response + realtime event)", () => {
    const once = appendMessage(cache(), msg(5))!;
    const twice = appendMessage(once, msg(5))!;
    expect(flattenThread(twice).filter((m) => m.id === 5)).toHaveLength(1);
  });

  it("a duplicate arrival updates the existing message instead of dropping the newer data", () => {
    const once = appendMessage(cache(), msg(5, "old"))!;
    const twice = appendMessage(once, msg(5, "new"))!;
    expect(flattenThread(twice).find((m) => m.id === 5)?.message).toBe("new");
  });

  it("does not mutate the original cache", () => {
    const original = cache();
    appendMessage(original, msg(9));
    markMessageDeleted(original, 1, "2026-09-18T11:00:00Z");
    expect(flattenThread(original).map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect(original.pages[1].data[0].deleted_at).toBeUndefined();
  });

  it("leaves an unloaded cache alone", () => {
    expect(appendMessage(undefined, msg(1))).toBeUndefined();
    expect(replaceMessage(undefined, msg(1))).toBeUndefined();
    expect(markMessageDeleted(undefined, 1, "x")).toBeUndefined();
  });

  it("replaces an edited message in an older page", () => {
    const next = replaceMessage(cache(), { ...msg(1), message: "edited", edited_at: "2026-09-18T12:00:00Z" })!;
    const edited = flattenThread(next).find((m) => m.id === 1)!;
    expect(edited.message).toBe("edited");
    expect(edited.edited_at).toBe("2026-09-18T12:00:00Z");
  });

  it("ignores an edit for a message that is not loaded", () => {
    const next = replaceMessage(cache(), msg(99))!;
    expect(flattenThread(next).map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("turns a deleted message into a blank placeholder and drops its attachment", () => {
    const next = markMessageDeleted(cache(), 3, "2026-09-18T11:00:00Z")!;
    const deleted = flattenThread(next).find((m) => m.id === 3)!;

    expect(deleted.deleted_at).toBe("2026-09-18T11:00:00Z");
    expect(deleted.message).toBe("");
    expect(deleted.attachment_path).toBeNull();
    expect(deleted.attachment_name).toBeNull();
    // Its neighbours are untouched.
    expect(flattenThread(next).find((m) => m.id === 4)?.message).toBe("message 4");
  });
});
