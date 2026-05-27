import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  NotificationItem,
  NotificationPayload,
  NotificationType,
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification
} from "@/services/notification-service";

type ReadFilter = "all" | "read" | "unread";

const defaultForm: NotificationPayload = {
  title: "",
  message: "",
  type: "info",
  is_read: false
};

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [editing, setEditing] = useState<NotificationItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NotificationPayload>(defaultForm);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(() => ["notifications", search, readFilter], [search, readFilter]);
  const notificationsQuery = useQuery({
    queryKey,
    queryFn: () => listNotifications({ q: search, read: readFilter })
  });

  const createMutation = useMutation({
    mutationFn: createNotification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<NotificationPayload> }) => updateNotification(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => setError(e.message)
  });

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: NotificationItem) {
    setEditing(item);
    setForm({
      title: item.title,
      message: item.message,
      type: item.type,
      is_read: item.is_read,
      user_id: item.user_id
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(defaultForm);
    setError(null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError("Title and message are required.");
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
      return;
    }
    createMutation.mutate(form);
  }

  async function toggleRead(item: NotificationItem) {
    await updateMutation.mutateAsync({ id: item.id, payload: { is_read: !item.is_read } });
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this notification?")) return;
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="Manage in-app notifications and their read state." />
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FormInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notifications..." className="max-w-sm" />
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as ReadFilter)}
          >
            <option value="all">All</option>
            <option value="read">Read</option>
            <option value="unread">Unread</option>
          </select>
          <Button className="ml-auto" onClick={openCreate}>New Notification</Button>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notificationsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading notifications...</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Title</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(notificationsQuery.data ?? []).map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 align-top">
                  <td className="p-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.message}</p>
                  </td>
                  <td className="p-3 capitalize">{item.type}</td>
                  <td className="p-3">{item.is_read ? "Read" : "Unread"}</td>
                  <td className="p-3">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                      <Button variant="outline" onClick={() => void toggleRead(item)}>
                        {item.is_read ? "Mark Unread" : "Mark Read"}
                      </Button>
                      <Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editing ? "Edit Notification" : "Create Notification"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-1 block text-sm font-medium">Title</label>
              <FormInput value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Message</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Type</label>
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as NotificationType }))}
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_read} onChange={(e) => setForm((prev) => ({ ...prev, is_read: e.target.checked }))} />
              Mark as read
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">{editing ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
