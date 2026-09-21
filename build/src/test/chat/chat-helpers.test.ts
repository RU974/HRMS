import { describe, it, expect } from "vitest";
import { formatBytes, formatTyping, getInitials } from "@/modules/chat/lib/format";
import { MAX_ATTACHMENT_BYTES, validateAttachment } from "@/services/chat-service";

function file(name: string, size: number, type = "application/octet-stream"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateAttachment", () => {
  it("accepts an allowed file", () => {
    expect(validateAttachment(file("report.pdf", 1024))).toBeNull();
    expect(validateAttachment(file("PHOTO.JPG", 1024))).toBeNull();
  });

  it("rejects disallowed extensions before any upload happens", () => {
    expect(validateAttachment(file("virus.exe", 1024))).toMatch(/not allowed/i);
    expect(validateAttachment(file("script.php", 1024))).toMatch(/not allowed/i);
  });

  it("rejects files with no extension", () => {
    expect(validateAttachment(file("README", 1024))).toMatch(/not allowed/i);
  });

  it("rejects files over the size limit", () => {
    expect(validateAttachment(file("big.zip", MAX_ATTACHMENT_BYTES + 1))).toMatch(/larger than 10 MB/);
  });

  it("accepts a file exactly at the limit", () => {
    expect(validateAttachment(file("edge.zip", MAX_ATTACHMENT_BYTES))).toBeNull();
  });

  it("rejects empty files", () => {
    expect(validateAttachment(file("empty.pdf", 0))).toMatch(/empty/i);
  });
});

describe("formatTyping", () => {
  it("is empty when nobody is typing", () => {
    expect(formatTyping([])).toBe("");
  });

  it("handles one, two and many people", () => {
    expect(formatTyping(["Alice"])).toBe("Alice is typing…");
    expect(formatTyping(["Alice", "Bob"])).toBe("Alice and Bob are typing…");
    expect(formatTyping(["Alice", "Bob", "Carol"])).toBe("Alice, Bob and 1 other are typing…");
    expect(formatTyping(["Alice", "Bob", "Carol", "Dan"])).toBe("Alice, Bob and 2 others are typing…");
  });
});

describe("formatting helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("derives initials safely from awkward names", () => {
    expect(getInitials("Alice Johnson")).toBe("AJ");
    expect(getInitials("  Bob   ")).toBe("B");
    expect(getInitials("")).toBe("");
  });
});
