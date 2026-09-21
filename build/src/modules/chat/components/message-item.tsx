import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCheck, Edit2, RotateCw, Trash2, X } from "lucide-react";
import { ChatMessage } from "@/services/chat-service";
import { PendingMessage } from "../hooks/use-send-message";
import { formatBytes, formatTime } from "../lib/format";
import { ChatAttachment } from "./chat-attachment";
import { Avatar, GroupAvatar } from "./avatar";

interface CommonProps {
  isMine: boolean;
  isGroup: boolean;
  senderName: string;
  /** Continuation of the previous message from the same sender. */
  isGrouped: boolean;
}

function AvatarSlot({ isGrouped, name }: { isGrouped: boolean; name: string }) {
  return (
    <div className={`shrink-0 ${isGrouped ? "pointer-events-none opacity-0" : ""}`}>
      {name ? <Avatar name={name} size="sm" /> : <GroupAvatar size="sm" />}
    </div>
  );
}

const ACTION_VISIBILITY =
  "opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100";

export function MessageItem({
  message,
  isMine,
  isGroup,
  senderName,
  isGrouped,
  receipt,
  editing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: CommonProps & {
  message: ChatMessage;
  receipt: { label: string; names?: string[] } | null;
  editing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const [editText, setEditText] = useState(message.message);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isDeleted = !!message.deleted_at;

  useEffect(() => {
    if (editing) {
      setEditText(message.message);
      editRef.current?.focus();
    }
  }, [editing, message.message]);

  const bubbleClass = isMine
    ? "bg-[var(--primary)] text-white rounded-br-md"
    : "bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-md";

  return (
    <div className={`group flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      <AvatarSlot isGrouped={isGrouped} name={senderName} />

      <div className={`flex max-w-[85%] flex-col gap-1 sm:max-w-[75%] md:max-w-[60%] ${isMine ? "items-end" : "items-start"}`}>
        {isGroup && !isMine && !isGrouped && (
          <span className="px-1 text-[11px] font-semibold text-[var(--muted)]">{senderName}</span>
        )}

        {editing ? (
          <div className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--primary)]/30 bg-[var(--card)] p-3 shadow-sm sm:w-80">
            <textarea
              ref={editRef}
              value={editText}
              maxLength={5000}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelEdit();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editText.trim()) onSaveEdit(editText);
                }
              }}
              aria-label="Edit message"
              className="resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
              rows={2}
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--border)]/30"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!editText.trim()}
                onClick={() => onSaveEdit(editText)}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        ) : isDeleted ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-2 text-sm italic text-[var(--muted)]">
            This message was deleted
          </div>
        ) : (
          <div className={`relative space-y-2 rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${bubbleClass}`}>
            {message.attachment_path && <ChatAttachment message={message} isMine={isMine} />}
            {message.message && <p className="whitespace-pre-wrap break-words">{message.message}</p>}
          </div>
        )}

        <div className={`flex items-center gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
          <time className="text-[10px] text-[var(--muted)]" dateTime={message.created_at}>
            {formatTime(message.created_at)}
          </time>

          {message.edited_at && !isDeleted && <span className="text-[10px] italic text-[var(--muted)]">edited</span>}

          {isMine && receipt && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--primary)]" title={receipt.names?.join(", ")}>
              <CheckCheck className="h-3 w-3" />
              {receipt.label}
            </span>
          )}

          {isMine && !editing && !isDeleted && (
            <div className={`flex items-center gap-1 ${ACTION_VISIBILITY}`}>
              {message.message && (
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-colors hover:text-red-500"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A message the user just sent that the server has not confirmed yet (or that failed). */
export function PendingMessageItem({
  item,
  onRetry,
  onDiscard,
}: {
  item: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const failed = item.status === "failed";

  return (
    <div className="flex flex-row-reverse items-end gap-2">
      <div className="w-7 shrink-0" />
      <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[75%] md:max-w-[60%]">
        <div
          className={`space-y-2 rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
            failed ? "border border-red-300 bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200" : "bg-[var(--primary)]/70 text-white"
          }`}
        >
          {item.file && (
            <div className="flex items-center gap-2 text-xs">
              <span className="truncate font-medium">{item.file.name}</span>
              <span className="opacity-70">{formatBytes(item.file.size)}</span>
            </div>
          )}
          {item.file && !failed && (
            <div
              className="h-1.5 w-40 overflow-hidden rounded-full bg-white/30"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(item.progress * 100)}
              aria-label="Upload progress"
            >
              <div className="h-full bg-white transition-all" style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
          )}
          {item.text && <p className="whitespace-pre-wrap break-words">{item.text}</p>}
        </div>

        {failed ? (
          <div className="flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400" role="alert">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span className="max-w-[16rem] truncate" title={item.error}>
              {item.error ?? "Failed to send"}
            </span>
            <button type="button" onClick={onRetry} className="flex items-center gap-1 font-semibold underline">
              <RotateCw className="h-3 w-3" /> Retry
            </button>
            <button type="button" onClick={onDiscard} aria-label="Discard message" className="hover:text-red-800">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-[var(--muted)]">Sending…</span>
        )}
      </div>
    </div>
  );
}
