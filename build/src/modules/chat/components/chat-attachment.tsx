import { useEffect, useState } from "react";
import { Download, Paperclip } from "lucide-react";
import { ChatMessage, downloadChatAttachment, fetchChatAttachment } from "@/services/chat-service";
import { formatBytes } from "../lib/format";

export function ChatAttachment({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = (message.attachment_mime ?? "").startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    fetchChatAttachment(message.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, isImage]);

  if (isImage) {
    if (failed) return <p className="text-xs opacity-70">Unable to load image.</p>;
    if (!url) return <div className="h-32 w-44 animate-pulse rounded-xl bg-black/10" />;
    return <img src={url} alt={message.attachment_name ?? "attachment"} className="max-h-64 max-w-full rounded-xl" />;
  }

  return (
    <button
      type="button"
      onClick={() => void downloadChatAttachment(message.id, message.attachment_name ?? "attachment")}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs transition hover:opacity-80 ${
        isMine ? "border-white/20 bg-white/10" : "border-[var(--border)] bg-[var(--background)]"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isMine ? "bg-white/20" : "bg-[var(--primary)]/10"
        }`}
      >
        <Paperclip className={`h-3.5 w-3.5 ${isMine ? "text-white" : "text-[var(--primary)]"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{message.attachment_name ?? "Attachment"}</p>
        {message.attachment_size ? <p className="opacity-60">{formatBytes(message.attachment_size)}</p> : null}
      </div>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </button>
  );
}
