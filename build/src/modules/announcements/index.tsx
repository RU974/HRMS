import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import {
  Announcement,
  AnnouncementPayload,
  AnnouncementTarget,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement
} from "@/services/announcement-service";

type FilterState = "all" | "published" | "draft";

const defaultForm: AnnouncementPayload = {
  title: "",
  body: "",
  target: "all",
  is_published: true
};

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [publishedFilter, setPublishedFilter] = useState<FilterState>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementPayload>(defaultForm);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(() => ["announcements", search, publishedFilter], [search, publishedFilter]);

  const announcementsQuery = useQuery({
    queryKey,
    queryFn: () => listAnnouncements({ q: search, published: publishedFilter })
  });

  const createMutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      closeModal();
    },
    onError: (mutationError: Error) => setError(mutationError.message)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<AnnouncementPayload> }) => updateAnnouncement(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      closeModal();
    },
    onError: (mutationError: Error) => setError(mutationError.message)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (mutationError: Error) => setError(mutationError.message)
  });

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: Announcement) {
    setEditing(item);
    setForm({
      title: item.title,
      body: item.body,
      target: item.target,
      is_published: item.is_published
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

  function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setError("Title and message are required.");
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
      return;
    }

    createMutation.mutate(form);
  }

  async function onTogglePublish(item: Announcement) {
    setError(null);
    await updateMutation.mutateAsync({
      id: item.id,
      payload: { is_published: !item.is_published }
    });
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this announcement?")) return;
    setError(null);
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Broadcast and manage internal communication." />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FormInput
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={publishedFilter}
            onChange={(e) => setPublishedFilter(e.target.value as FilterState)}
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <Button className="ml-auto" onClick={openCreate}>New Announcement</Button>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {announcementsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading announcements...</p>}
        {announcementsQuery.isError && <p className="text-sm text-red-600">{(announcementsQuery.error as Error).message}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">Title</th>
                <th className="p-3">Target</th>
                <th className="p-3">Status</th>
                <th className="p-3">Published</th>
                <th className="p-3">Author</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(announcementsQuery.data ?? []).map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60 align-top">
                  <td className="p-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 max-w-xl whitespace-pre-wrap text-xs text-[var(--muted)]">{item.body}</p>
                  </td>
                  <td className="p-3 capitalize">{item.target}</td>
                  <td className="p-3">{item.is_published ? "Published" : "Draft"}</td>
                  <td className="p-3">{item.published_at ? new Date(item.published_at).toLocaleString() : "-"}</td>
                  <td className="p-3">{item.creator?.name ?? "System"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                      <Button variant="outline" onClick={() => void onTogglePublish(item)}>
                        {item.is_published ? "Unpublish" : "Publish"}
                      </Button>
                      <Button variant="outline" onClick={() => void onDelete(item.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!announcementsQuery.isLoading && (announcementsQuery.data?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-6 text-center text-sm text-[var(--muted)]" colSpan={6}>
                    No announcements found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editing ? "Edit Announcement" : "Create Announcement"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submitForm}>
            <div>
              <label className="mb-1 block text-sm font-medium">Title</label>
              <FormInput value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Message</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Audience</label>
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={form.target}
                onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value as AnnouncementTarget }))}
              >
                <option value="all">All Employees</option>
                <option value="hr">HR Team</option>
                <option value="managers">Managers</option>
                <option value="employees">Employees</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((prev) => ({ ...prev, is_published: e.target.checked }))}
              />
              Publish immediately
            </label>
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


