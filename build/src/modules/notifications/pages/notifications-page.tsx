import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  NotificationItem,
  NotificationPayload,
  NotificationType,
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification,
} from "@/services/notification-service";
import { useAuthStore } from "@/store/auth-store";

type ReadFilter = "all" | "read" | "unread";
type GroupFilter = "all" | "info" | "warning" | "success" | "error";

const defaultForm: NotificationPayload = { title: "", message: "", type: "info", is_read: false };

const TYPE_META: Record<NotificationType, { label: string; color: string; bg: string; dot: string }> = {
  info:    { label: "Info",    color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-500" },
  warning: { label: "Warning", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  success: { label: "Success", color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  error:   { label: "Error",   color: "text-red-700",    bg: "bg-red-50 border-red-200",     dot: "bg-red-500" },
};

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission("manage notifications"));

  const [search, setSearch]           = useState("");
  const [readFilter, setReadFilter]   = useState<ReadFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [editing, setEditing]         = useState<NotificationItem | null>(null);
  const [modalOpen, setModalOpen]     = useState(false);
  const [form, setForm]               = useState<NotificationPayload>(defaultForm);
  const [error, setError]             = useState<string | null>(null);

  const queryKey = useMemo(() => ["notifications", search, readFilter], [search, readFilter]);

  const notificationsQuery = useQuery({
    queryKey,
    queryFn: () => listNotifications({ q: search, read: readFilter }),
    refetchInterval: 30000, // refresh badge count every 30s
  });

  const allItems: NotificationItem[] = notificationsQuery.data ?? [];

  // Filter by group
  const items = groupFilter === "all"
    ? allItems
    : allItems.filter((n) => n.type === groupFilter);

  const unreadCount = allItems.filter((n) => !n.is_read).length;

  // Group counts for tabs
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allItems.length };
    allItems.forEach((n) => { counts[n.type] = (counts[n.type] ?? 0) + 1; });
    return counts;
  }, [allItems]);

  // Mark single as read
  const markReadMutation = useMutation({
    mutationFn: (id: number) => updateNotification(id, { is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = allItems.filter((n) => !n.is_read);
      await Promise.all(unread.map((n) => updateNotification(n.id, { is_read: true })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const createMutation = useMutation({
    mutationFn: createNotification,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["notifications"] }); closeModal(); },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<NotificationPayload> }) =>
      updateNotification(id, payload),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["notifications"] }); closeModal(); },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => setError(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: NotificationItem) {
    setEditing(item);
    setForm({ title: item.title, message: item.message, type: item.type, is_read: item.is_read });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(defaultForm);
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) { setError("Title and message are required."); return; }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Notifications"
          subtitle={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up"}
        />
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? "Marking…" : "✓ Mark all read"}
            </Button>
          )}
          {canManage && (
            <Button onClick={openCreate}>+ New Notification</Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <FormInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="max-w-xs"
          />
          <div className="flex gap-2">
            {(["all", "unread", "read"] as ReadFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setReadFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                  readFilter === f
                    ? "bg-[var(--primary)] text-white"
                    : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)]/30"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Type group tabs */}
        <div className="mt-4 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
          {(["all", "info", "warning", "success", "error"] as GroupFilter[]).map((g) => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                groupFilter === g
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {g !== "all" && (
                <span className={`h-2 w-2 rounded-full ${TYPE_META[g as NotificationType].dot}`} />
              )}
              {g === "all" ? "All" : TYPE_META[g as NotificationType].label}
              <span className="rounded-full bg-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {groupCounts[g] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div className="mt-4 space-y-2">
          {notificationsQuery.isLoading && (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-[var(--border)] p-4">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--border)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--border)]" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--border)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!notificationsQuery.isLoading && items.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-2xl">🔔</p>
              <p className="mt-2 font-medium text-[var(--text)]">No notifications</p>
              <p className="text-sm text-[var(--muted)]">
                {readFilter === "unread" ? "You've read everything." : "Nothing to show here."}
              </p>
            </div>
          )}

          {items.map((item) => {
            const meta = TYPE_META[item.type];
            return (
              <div
                key={item.id}
                className={`flex gap-3 rounded-xl border p-4 transition ${
                  !item.is_read
                    ? `${meta.bg} shadow-sm`
                    : "border-[var(--border)] bg-[var(--card)] opacity-70"
                }`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bg} border`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.bg} ${meta.color}`}>
                        {meta.label}
                      </span>
                      <p className="mt-1 text-sm font-semibold text-[var(--text)]">{item.title}</p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--muted)]">{formatTime(item.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.message}</p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {!item.is_read && (
                      <button
                        onClick={() => markReadMutation.mutate(item.id)}
                        disabled={markReadMutation.isPending}
                        className="text-xs font-medium text-[var(--primary)] hover:underline"
                      >
                        Mark as read
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          onClick={() => openEdit(item)}
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { if (confirm("Delete this notification?")) void deleteMutation.mutateAsync(item.id); }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!item.is_read && (
                  <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {modalOpen && (
        <Modal title={editing ? "Edit Notification" : "Create Notification"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <FormField label="Title">
              <FormInput value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
            </FormField>
            <FormField label="Message">
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                required
              />
            </FormField>
            <FormField label="Type">
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as NotificationType }))}
              >
                {(["info", "warning", "success", "error"] as NotificationType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_META[t].label}</option>
                ))}
              </select>
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}