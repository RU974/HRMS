import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Send, X } from "lucide-react";
import { OrbitIcon } from "@/components/orbit/orbit-icon";
import { sendOrbitMessage } from "@/services/orbit-service";
import type { OrbitAction, OrbitMessage } from "@/services/orbit-service";
import { useAuthStore } from "@/store/auth-store";

interface ChatEntry extends OrbitMessage {
  actions?: OrbitAction[];
  error?: boolean;
}

const SUGGESTIONS = [
  "How many leaves do I have left?",
  "Show my attendance this month",
  "When is the next holiday?",
  "How do I raise a ticket?",
];

// The API accepts at most 20 messages; keep the most recent turns.
const MAX_HISTORY = 12;

export function OrbitWidget() {
  const navigate = useNavigate();
  const firstName = useAuthStore((s) => s.user?.name?.split(" ")[0]);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, busy, open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const next: ChatEntry[] = [...entries, { role: "user", content }];
    setEntries(next);
    setInput("");
    setBusy(true);

    try {
      const history = next
        .filter((e) => !e.error)
        .slice(-MAX_HISTORY)
        .map(({ role, content: c }) => ({ role, content: c }));
      // History must begin with a user turn.
      while (history.length > 0 && history[0].role !== "user") history.shift();

      const res = await sendOrbitMessage(history);
      setEntries((prev) => [...prev, { role: "assistant", content: res.reply, actions: res.actions }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setEntries((prev) => [...prev, { role: "assistant", content: message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function go(path: string) {
    navigate(path);
    setOpen(false);
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="orbit-panel"
            role="dialog"
            aria-label="Orbit assistant"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-24 right-4 z-50 flex h-[min(560px,calc(100vh-8rem))] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl md:right-8"
          >
            <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-[var(--border)]">
                <OrbitIcon size={32} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">Orbit</p>
                <p className="text-xs text-[var(--muted)]">Your HRMS assistant</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Orbit"
                className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--border)]/40"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {entries.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text)]">
                    Hi{firstName ? ` ${firstName}` : ""}! I am Orbit. Ask me about your leaves, attendance, tickets, or
                    where to find something.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--border)]/40"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {entries.map((entry, i) => (
                <div key={i} className={`flex flex-col gap-2 ${entry.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                      entry.role === "user"
                        ? "bg-[var(--primary)] text-white"
                        : entry.error
                          ? "border border-red-500/40 bg-red-500/10 text-red-600"
                          : "bg-[var(--border)]/40 text-[var(--text)]"
                    }`}
                  >
                    {entry.content}
                  </div>
                  {entry.actions?.map((a) => (
                    <button
                      key={a.path}
                      type="button"
                      onClick={() => go(a.path)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/10"
                    >
                      {a.label}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-1 px-1" aria-live="polite" aria-label="Orbit is thinking">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]"
                      style={{ animationDelay: `${d * 120}ms` }}
                    />
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={2000}
                placeholder="Ask Orbit anything…"
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />
              <button
                type="submit"
                disabled={busy || input.trim() === ""}
                aria-label="Send message"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:opacity-90 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Orbit" : "Open Orbit assistant"}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-[var(--border)] transition hover:scale-105 md:right-8"
      >
        {open ? <X size={24} className="text-slate-700" /> : <OrbitIcon size={44} />}
      </button>
    </>
  );
}
