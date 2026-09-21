import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { ATTACHMENT_ACCEPT, validateAttachment } from "@/services/chat-service";
import { formatBytes } from "../lib/format";

const MAX_LENGTH = 5000;
const COUNTER_THRESHOLD = 4500;

export interface ComposerHandle {
  /** Attach a file from outside (drag-and-drop on the thread). Returns an error string if rejected. */
  addFile: (file: File) => string | null;
  focus: () => void;
}

interface ComposerProps {
  placeholder: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string, file: File | null) => string | null;
  onTyping: () => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { placeholder, draft, onDraftChange, onSend, onTyping },
  ref
) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function acceptFile(candidate: File): string | null {
    const problem = validateAttachment(candidate);
    if (problem) {
      setError(problem);
      return problem;
    }
    setError(null);
    setFile(candidate);
    inputRef.current?.focus();
    return null;
  }

  useImperativeHandle(ref, () => ({
    addFile: acceptFile,
    focus: () => inputRef.current?.focus(),
  }));

  // Grow with the content, up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  function submit() {
    if (!draft.trim() && !file) return;
    const problem = onSend(draft, file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setFile(null);
    onDraftChange("");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files)[0];
    if (pasted) {
      e.preventDefault();
      acceptFile(pasted);
    }
  }

  const canSend = draft.trim().length > 0 || file !== null;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
      {error && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--primary)]/10">
            <Paperclip className="h-3 w-3 text-[var(--primary)]" />
          </div>
          <span className="flex-1 truncate font-medium text-[var(--text)]">{file.name}</span>
          <span className="text-[var(--muted)]">{formatBytes(file.size)}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove attachment"
            className="text-[var(--muted)] transition-colors hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) acceptFile(chosen);
            e.target.value = ""; // allow picking the same file again
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          title="Attach a file"
          aria-label="Attach a file"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <textarea
          ref={inputRef}
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            onDraftChange(e.target.value);
            if (e.target.value) onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={handlePaste}
          placeholder={placeholder}
          aria-label="Message"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm text-[var(--text)] transition placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          style={{ maxHeight: "120px", overflowY: "auto" }}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:opacity-90 disabled:opacity-40"
          title="Send (Enter)"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span>Enter to send &middot; Shift+Enter for new line &middot; drop or paste files to attach</span>
        {draft.length >= COUNTER_THRESHOLD && (
          <span className={draft.length >= MAX_LENGTH ? "font-semibold text-red-500" : ""}>
            {draft.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
});
