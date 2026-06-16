import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { RichTextEditor } from "@/components/forms/rich-text-editor";
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
  getAnnouncementReads,
  listAnnouncements,
  markAnnouncementRead,
  updateAnnouncement,
  uploadAnnouncementImage,
} from "@/services/announcement-service";
import { useAuthStore } from "@/store/auth-store";

type FilterState = "all" | "published" | "draft";
type PublishMode = "now" | "schedule" | "draft";

const CATEGORIES = ["General", "Policy", "Event", "Urgent"] as const;

const defaultForm: AnnouncementPayload = {
  title: "",
  body: "",
  target: "all",
  category: "",
  tags: [],
  is_published: true,
};

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

function formatDateTime(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocalValue(ts: string | null) {
  if (!ts) return "";
  const date = new Date(ts);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function publishModeFor(item: Pick<Announcement, "is_published" | "published_at">): PublishMode {
  if (item.is_published) return "now";
  if (item.published_at) return "schedule";
  return "draft";
}

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission("announcement:edit"));

  const [search, setSearch]                       = useState("");
  const [publishedFilter, setPublishedFilter]     = useState<FilterState>("published");
  const [categoryFilter, setCategoryFilter]       = useState<string>("");
  const [modalOpen, setModalOpen]                 = useState(false);
  const [editing, setEditing]                     = useState<Announcement | null>(null);
  const [form, setForm]                           = useState<AnnouncementPayload>(defaultForm);
  const [publishMode, setPublishMode]             = useState<PublishMode>("now");
  const [scheduleAt, setScheduleAt]               = useState("");
  const [tagInput, setTagInput]                   = useState("");
  const [error, setError]                         = useState<string | null>(null);
  const [viewingPost, setViewingPost]             = useState<Announcement | null>(null);

  const queryKey = useMemo(
    () => ["announcements", search, publishedFilter, categoryFilter],
    [search, publishedFilter, categoryFilter]
  );

  const announcementsQuery = useQuery({
    queryKey,
    queryFn: () => listAnnouncements({ q: search, published: publishedFilter, category: categoryFilter }),
  });

  const announcements: Announcement[] = announcementsQuery.data ?? [];

  const readsQuery = useQuery({
    queryKey: ["announcement-reads", viewingPost?.id],
    queryFn: () => getAnnouncementReads(viewingPost!.id),
    enabled: !!viewingPost && canManage,
  });

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

  const markReadMutation = useMutation({
    mutationFn: markAnnouncementRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }),
  });

  useEffect(() => {
    if (viewingPost && !viewingPost.read_by_me) {
      markReadMutation.mutate(viewingPost.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingPost?.id]);

  function openCreate() {
    setEditing(null); setForm(defaultForm); setPublishMode("now"); setScheduleAt(""); setTagInput(""); setError(null); setModalOpen(true);
  }

  function openEdit(item: Announcement) {
    setEditing(item);
    setForm({
      title: item.title,
      body: item.body,
      target: item.target,
      category: item.category ?? "",
      tags: item.tags ?? [],
      is_published: item.is_published,
      published_at: item.published_at,
    });
    setPublishMode(publishModeFor(item));
    setScheduleAt(toDatetimeLocalValue(item.published_at));
    setTagInput("");
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false); setEditing(null); setForm(defaultForm); setError(null);
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    setForm((p) => ({ ...p, tags: Array.from(new Set([...(p.tags ?? []), tag])) }));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setForm((p) => ({ ...p, tags: (p.tags ?? []).filter((t) => t !== tag) }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { setError("Title and body are required."); return; }
    if (publishMode === "schedule" && !scheduleAt) { setError("Pick a date and time to schedule this announcement."); return; }

    const payload: AnnouncementPayload = {
      ...form,
      is_published: publishMode === "now",
      published_at: publishMode === "schedule" ? new Date(scheduleAt).toISOString() : publishMode === "now" ? null : null,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
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
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
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
            const mode = publishModeFor(item);
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
                  {item.category && (
                    <span className="rounded-full border border-[var(--border)] bg-[var(--border)]/20 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                      {item.category}
                    </span>
                  )}
                  {mode === "draft" && (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
                      Draft
                    </span>
                  )}
                  {mode === "schedule" && (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                      Scheduled · {formatDateTime(item.published_at)}
                    </span>
                  )}
                  {item.read_by_me && (
                    <span className="ml-auto text-[10px] font-semibold text-emerald-600">✓ Read</span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold leading-snug text-[var(--text)] line-clamp-2 mb-2">
                  {item.title}
                </h3>

                {/* Body preview */}
                <div
                  className="flex-1 text-xs leading-relaxed text-[var(--muted)] line-clamp-3 mb-3 [&_*]:inline"
                  dangerouslySetInnerHTML={{ __html: item.body }}
                />

                {item.tags && item.tags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[var(--border)]/30 px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

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
                  <div className="flex items-center gap-2">
                    {canManage && typeof item.reads_count === "number" && (
                      <span className="text-[11px] text-[var(--muted)]">👁 {item.reads_count}</span>
                    )}
                    {date && <span className="text-[11px] text-[var(--muted)]">{date}</span>}
                  </div>
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
              {viewingPost.category && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--border)]/20 px-2.5 py-0.5 text-xs text-[var(--muted)]">
                  {viewingPost.category}
                </span>
              )}
              {!viewingPost.is_published && (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">Draft</span>
              )}
            </div>
            <div className="prose prose-sm max-w-none text-sm leading-relaxed text-[var(--text)]" dangerouslySetInnerHTML={{ __html: viewingPost.body }} />
            {viewingPost.tags && viewingPost.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {viewingPost.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-[var(--border)]/30 px-2 py-0.5 text-[11px] text-[var(--muted)]">#{tag}</span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              <span>By {viewingPost.creator?.name ?? "System"}</span>
              <span>{formatDate(viewingPost.published_at ?? viewingPost.created_at)}</span>
            </div>
            {canManage && (
              <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--border)]/10 p-3 text-xs text-[var(--muted)]">
                <p className="mb-1 font-semibold">Seen by {readsQuery.data?.length ?? viewingPost.reads_count ?? 0}</p>
                {readsQuery.data && readsQuery.data.length > 0 && (
                  <p className="line-clamp-2">
                    {readsQuery.data.map((r) => r.user?.name).filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            )}
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
              <RichTextEditor
                value={form.body}
                onChange={(html) => setForm((p) => ({ ...p, body: html }))}
                onUploadImage={async (file) => (await uploadAnnouncementImage(file)).url}
                placeholder="Write your announcement here…"
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
              <div>
                <label className="mb-1 block text-sm font-medium">Category</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.category ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                >
                  <option value="">None</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(form.tags ?? []).map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-[var(--border)]/30 px-2.5 py-1 text-xs text-[var(--muted)]">
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-[var(--muted)] hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <FormInput
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag and press Enter"
                />
                <Button type="button" variant="outline" onClick={addTag}>Add</Button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Publishing</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {([
                  { mode: "now", label: "Publish now" },
                  { mode: "schedule", label: "Schedule for later" },
                  { mode: "draft", label: "Save as draft" },
                ] as { mode: PublishMode; label: string }[]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPublishMode(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      publishMode === mode
                        ? "bg-[var(--primary)] text-white"
                        : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)]/30"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {publishMode === "schedule" && (
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Update" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
