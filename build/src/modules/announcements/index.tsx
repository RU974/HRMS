import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Announcement,
  AnnouncementPayload,
  AnnouncementTarget,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "@/services/announcement-service";
import { useAuthStore } from "@/store/auth-store";

type FilterState = "all" | "published" | "draft";

const defaultForm: AnnouncementPayload = { title: "", body: "", target: "all", is_published: true };

const TARGET_META: Record<AnnouncementTarget, { label: string; color: string }> = {
  all:       { label: "Everyone",  color: "bg-blue-50 text-blue-700 border-blue-200" },
  hr:        { label: "HR Team",   color: "bg-purple-50 text-purple-700 border-purple-200" },
  managers:  { label: "Managers", color: "bg-amber-50 text-amber-700 border-amber-200" },
  employees: { label: "Employees",color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function formatDate(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission("manage announcements"));

  const [search, setSearch]                       = useState("");
  const [publishedFilter, setPublishedFilter]     = useState<FilterState>("published");
  const [modalOpen, setModalOpen]                 = useState(false);
  const [editing, setEditing]                     = useState<Announcement | null>(null);
  const [form, setForm]                           = useState<AnnouncementPayload>(defaultForm);
  const [error, setError]                         = useState<string | null>(null);
  const [viewingPost, setViewingPost]             = useState<Announcement | null>(null);

  const queryKey = useMemo(
    () => ["announcements", search, publishedFilter],
    [search, publishedFilter]
  );

  const announcementsQuery = useQuery({
    queryKey,
    queryFn: () => listAnnouncements({ q: search, published: publishedFilter }),
  });

  const announcements: Announcement[] = announcementsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["announcements"] }); closeModal(); },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<AnnouncementPayload> }) =>
      updateAnnouncement(id, payload),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["announcements"] }); closeModal(); },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }),
    onError: (e: Error) => setError(e.message),
  });

  function openCreate() {
    setEditing(null); setForm(defaultForm); setError(null); setModalOpen(true);
  }

  function openEdit(item: Announcement) {
    setEditing(item);
    setForm({ title: item.title, body: item.body, target: item.target, is_published: item.is_published });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false); setEditing(null); setForm(defaultForm); setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { setError("Title and body are required."); return; }
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
          title="Announcements"
          subtitle="Company-wide notices, updates, and important communications."
        />
        {canManage && (
          <Button onClick={openCreate}>+ New Announcement</Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <FormInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search announcements…"
          className="max-w-xs"
        />
        <div className="flex gap-2">
          {(["published", "all", "draft"] as FilterState[]).map((f) => (
            <button
              key={f}
              onClick={() => setPublishedFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                publishedFilter === f
                  ? "bg-[var(--primary)] text-white"
                  : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)]/30"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {announcementsQuery.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] p-5 space-y-3">
              <div className="h-3 w-1/4 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-3 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--border)]" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!announcementsQuery.isLoading && announcements.length === 0 && (
        <Card>
          <div className="py-14 text-center">
            <p className="text-3xl">📋</p>
            <p className="mt-3 font-medium text-[var(--text)]">No announcements</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {publishedFilter === "published"
                ? "No published announcements yet."
                : "Nothing matches your filters."}
            </p>
            {canManage && (
              <Button className="mt-4" onClick={openCreate}>Create first announcement</Button>
            )}
          </div>
        </Card>
      )}

      {/* Notice board grid */}
      {!announcementsQuery.isLoading && announcements.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map((item) => {
            const targetMeta = TARGET_META[item.target] ?? TARGET_META.all;
            const date = formatDate(item.published_at ?? item.created_at);

            return (
              <div
                key={item.id}
                className={`group relative flex flex-col rounded-2xl border p-5 transition hover:shadow-md cursor-pointer ${
                  item.is_published
                    ? "border-[var(--border)] bg-[var(--card)]"
                    : "border-dashed border-[var(--border)] bg-[var(--border)]/10 opacity-70"
                }`}
                onClick={() => setViewingPost(item)}
              >
                {/* Top badges */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${targetMeta.color}`}>
                    {targetMeta.label}
                  </span>
                  {!item.is_published && (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
                      Draft
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold leading-snug text-[var(--text)] line-clamp-2 mb-2">
                  {item.title}
                </h3>

                {/* Body preview */}
                <p className="flex-1 text-xs leading-relaxed text-[var(--muted)] line-clamp-3 mb-4">
                  {item.body}
                </p>

                {/* Footer: author + date */}
                <div className="flex items-center justify-between gap-2 border-t border-[var(--border)]/50 pt-3">
                  <div className="flex items-center gap-2">
                    {item.creator ? (
                      <>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[9px] font-bold text-[var(--primary)]">
                          {getInitials(item.creator.name)}
                        </div>
                        <span className="text-[11px] text-[var(--muted)]">{item.creator.name}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-[var(--muted)]">System</span>
                    )}
                  </div>
                  {date && <span className="text-[11px] text-[var(--muted)]">{date}</span>}
                </div>

                {/* Admin actions */}
                {canManage && (
                  <div
                    className="absolute right-3 top-3 hidden gap-1 group-hover:flex"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--primary)]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this announcement?")) void deleteMutation.mutateAsync(item.id); }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--muted)] hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full post view modal */}
      {viewingPost && (
        <Modal title={viewingPost.title} onClose={() => setViewingPost(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TARGET_META[viewingPost.target].color}`}>
                {TARGET_META[viewingPost.target].label}
              </span>
              {!viewingPost.is_published && (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">Draft</span>
              )}
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text)]">{viewingPost.body}</p>
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              <span>By {viewingPost.creator?.name ?? "System"}</span>
              <span>{formatDate(viewingPost.published_at ?? viewingPost.created_at)}</span>
            </div>
            {canManage && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setViewingPost(null); openEdit(viewingPost); }}>Edit</Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create/Edit modal */}
      {modalOpen && (
        <Modal title={editing ? "Edit Announcement" : "New Announcement"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div>
              <label className="mb-1 block text-sm font-medium">Title</label>
              <FormInput
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Announcement title"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Body</label>
              <textarea
                className="h-32 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="Write your announcement here…"
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Audience</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.target}
                  onChange={(e) => setForm((p) => ({ ...p, target: e.target.value as AnnouncementTarget }))}
                >
                  {(Object.keys(TARGET_META) as AnnouncementTarget[]).map((t) => (
                    <option key={t} value={t}>{TARGET_META[t].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm((p) => ({ ...p, is_published: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Publish immediately
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Update" : "Publish"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}