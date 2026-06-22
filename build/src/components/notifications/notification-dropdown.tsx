import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, CheckCheck, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { listAnnouncements } from "@/services/announcement-service";
import { listNotifications, updateNotification } from "@/services/notification-service";

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
}

export function NotificationDropdown() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => listNotifications({ read: "unread" })
  });

  const announcementsQuery = useQuery({
    queryKey: ["announcements", "dropdown"],
    queryFn: () => listAnnouncements({ published: "published" })
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => updateNotification(id, { is_read: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const unreadNotifications = notificationsQuery.data ?? [];
  const recentAnnouncements = useMemo(() => (announcementsQuery.data ?? []).slice(0, 5), [announcementsQuery.data]);
  const badgeCount = unreadNotifications.length;

  async function handleMarkAsRead(id: number) {
    await markReadMutation.mutateAsync(id);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-0 text-[var(--text)]"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open notifications"
      >
        <Bell className="h-5 w-5" />
        {badgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {badgeCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/10">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-[var(--muted)]">
                {badgeCount > 0 ? `${badgeCount} unread item${badgeCount === 1 ? "" : "s"}` : "You're all caught up"}
              </p>
            </div>
            {badgeCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={async () => {
                  await Promise.all(unreadNotifications.map((item) => updateNotification(item.id, { is_read: true })));
                  await queryClient.invalidateQueries({ queryKey: ["notifications"] });
                }}
              >
                Mark all as read
              </Button>
            ) : null}
          </div>

          <div className="max-h-[34rem] overflow-y-auto">
            <section className="border-b border-[var(--border)]/70 px-4 py-3">
              <div className="mb-3 flex items-center gap-2">
                <CheckCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Unread notifications</h3>
              </div>
              <div className="space-y-2">
                {notificationsQuery.isLoading ? (
                  <p className="text-sm text-[var(--muted)]">Loading notifications...</p>
                ) : unreadNotifications.length > 0 ? (
                  unreadNotifications.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--border)]/20 p-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
                          <Bell className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {item.link ? (
                                <Link
                                  to={item.link}
                                  className="truncate text-sm font-semibold hover:underline"
                                  onClick={() => setOpen(false)}
                                >
                                  {item.title}
                                </Link>
                              ) : (
                                <p className="truncate text-sm font-semibold">{item.title}</p>
                              )}
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.message}</p>
                            </div>
                            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              {item.type}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-[var(--muted)]">{formatRelativeTime(item.created_at)}</span>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 px-3 text-xs"
                              onClick={() => void handleMarkAsRead(item.id)}
                              disabled={markReadMutation.isPending}
                            >
                              Mark as read
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">No unread notifications.</p>
                )}
              </div>
            </section>

            <section className="px-4 py-3">
              <div className="mb-3 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-sky-600" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Announcements</h3>
              </div>
              <div className="space-y-2">
                {announcementsQuery.isLoading ? (
                  <p className="text-sm text-[var(--muted)]">Loading announcements...</p>
                ) : recentAnnouncements.length > 0 ? (
                  recentAnnouncements.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-sky-500/10 p-2 text-sky-600">
                          <Megaphone className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.body}</p>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                              {item.target}
                            </span>
                            <span className="text-[11px] text-[var(--muted)]">
                              {item.published_at ? formatRelativeTime(item.published_at) : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">No announcements available.</p>
                )}
              </div>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
            <Link
              to="/notifications"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)] transition hover:opacity-80"
              onClick={() => setOpen(false)}
            >
              View all notifications
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/announcements"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)] transition hover:opacity-80"
              onClick={() => setOpen(false)}
            >
              View announcements
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
