import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, UserMinus, UserPlus, X } from "lucide-react";
import {
  ChatConversation,
  ChatUser,
  addConversationParticipant,
  leaveConversation,
  removeConversationParticipant,
  renameConversation,
} from "@/services/chat-service";
import { toast } from "@/components/notifications/toast";
import { Avatar } from "./avatar";

interface GroupManagePanelProps {
  conversation: ChatConversation;
  users: ChatUser[];
  currentUserId: number;
  onClose: () => void;
  onLeft: () => void;
}

export function GroupManagePanel({ conversation, users, currentUserId, onClose, onLeft }: GroupManagePanelProps) {
  const queryClient = useQueryClient();
  const canManage = !!conversation.can_manage;
  const [name, setName] = useState(conversation.name ?? "");
  const [editingName, setEditingName] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
  const fail = (title: string) => (e: Error) => toast.error(title, e.message);

  const rename = useMutation({
    mutationFn: () => renameConversation(conversation.id, name.trim()),
    onSuccess: async () => {
      await refresh();
      setEditingName(false);
    },
    onError: fail("Could not rename group"),
  });

  const add = useMutation({
    mutationFn: (userId: number) => addConversationParticipant(conversation.id, userId),
    onSuccess: refresh,
    onError: fail("Could not add member"),
  });

  const remove = useMutation({
    mutationFn: (userId: number) => removeConversationParticipant(conversation.id, userId),
    onSuccess: refresh,
    onError: fail("Could not remove member"),
  });

  const leave = useMutation({
    mutationFn: () => leaveConversation(conversation.id),
    onSuccess: async () => {
      await refresh();
      onLeft();
    },
    onError: fail("Could not leave group"),
  });

  const memberIds = useMemo(() => new Set(conversation.participants.map((p) => p.id)), [conversation.participants]);
  const addable = useMemo(() => users.filter((u) => !memberIds.has(u.id)), [users, memberIds]);

  return (
    <aside
      aria-label="Group details"
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-xs flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text)]">Group details</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close group details"
          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--border)]/30 hover:text-[var(--text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Name</p>
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) rename.mutate();
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={name}
                maxLength={255}
                onChange={(e) => setName(e.target.value)}
                aria-label="Group name"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
              />
              <button
                type="submit"
                disabled={!name.trim() || rename.isPending}
                className="rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-[var(--text)]">{conversation.name ?? "Group chat"}</p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  aria-label="Rename group"
                  className="rounded p-1 text-[var(--muted)] hover:text-[var(--primary)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Members ({conversation.participants.length})
          </p>
          <ul className="space-y-1">
            {conversation.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                <Avatar name={p.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--text)]">
                    {p.name}
                    {p.id === currentUserId ? " (you)" : ""}
                  </p>
                  {conversation.created_by === p.id && <p className="text-[10px] text-[var(--muted)]">Group admin</p>}
                </div>
                {canManage && p.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(p.id)}
                    disabled={remove.isPending}
                    aria-label={`Remove ${p.name}`}
                    className="rounded p-1 text-[var(--muted)] hover:text-red-500 disabled:opacity-40"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {canManage && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Add people</p>
            {addable.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Everyone is already in this group.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {addable.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1">
                    <span className="truncate text-sm text-[var(--text)]">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => add.mutate(u.id)}
                      disabled={add.isPending}
                      aria-label={`Add ${u.name}`}
                      className="rounded p-1 text-[var(--muted)] hover:text-[var(--primary)] disabled:opacity-40"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Leave this group? You will stop receiving its messages.")) leave.mutate();
          }}
          disabled={leave.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" />
          Leave group
        </button>
      </div>
    </aside>
  );
}
