import type { InfiniteData } from "@tanstack/react-query";
import type { ChatMessage, ThreadPage } from "@/services/chat-service";

/**
 * Pure helpers for keeping the infinite-scroll thread cache in sync with
 * realtime events and local mutations. Pages are stored newest-first
 * (pages[0] is the newest page); messages inside each page are oldest-first.
 */
export type ThreadCache = InfiniteData<ThreadPage, number | undefined>;

/** All loaded messages, oldest first. */
export function flattenThread(cache: ThreadCache | undefined): ChatMessage[] {
  if (!cache) return [];
  return [...cache.pages].reverse().flatMap((page) => page.data);
}

function hasMessage(cache: ThreadCache, id: number): boolean {
  return cache.pages.some((page) => page.data.some((m) => m.id === id));
}

/** Append a new message to the newest page. Idempotent: the same id never appears twice. */
export function appendMessage(cache: ThreadCache | undefined, message: ChatMessage): ThreadCache | undefined {
  if (!cache || cache.pages.length === 0) return cache;
  if (hasMessage(cache, message.id)) return replaceMessage(cache, message);

  const [newest, ...rest] = cache.pages;
  return { ...cache, pages: [{ ...newest, data: [...newest.data, message] }, ...rest] };
}

/** Replace a message in place (edit, or delete placeholder). No-op if it is not loaded. */
export function replaceMessage(cache: ThreadCache | undefined, message: ChatMessage): ThreadCache | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      data: page.data.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
    })),
  };
}

/** Turn a message into a "message deleted" placeholder. */
export function markMessageDeleted(cache: ThreadCache | undefined, id: number, at: string): ThreadCache | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      data: page.data.map((m) =>
        m.id === id
          ? {
              ...m,
              message: "",
              attachment_path: null,
              attachment_name: null,
              attachment_mime: null,
              attachment_size: null,
              deleted_at: at,
            }
          : m
      ),
    })),
  };
}
