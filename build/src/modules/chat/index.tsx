import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/services/api-client";
import { ChatMessage, createChatMessage, deleteChatMessage, listChatMessages, updateChatMessage } from "@/services/chat-service";

type ChatUser = { id: number; name: string; email: string };

export function ChatPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [receiverId, setReceiverId] = useState<number | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(() => ["chat-messages", search], [search]);
  const chatQuery = useQuery({
    queryKey,
    queryFn: () => listChatMessages({ q: search })
  });

  const usersQuery = useQuery({
    queryKey: ["chat-users"],
    queryFn: () => apiClient<ChatUser[]>("/chat-messages/users")
  });

  const createMutation = useMutation({
    mutationFn: createChatMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => updateChatMessage(id, { message: text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
    onError: (e: Error) => setError(e.message)
  });

  function openCreate() {
    setEditing(null);
    setReceiverId("");
    setMessage("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: ChatMessage) {
    setEditing(item);
    setReceiverId(item.receiver_id);
    setMessage(item.message);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setReceiverId("");
    setMessage("");
    setError(null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    if (!editing && !receiverId) {
      setError("Please select a recipient.");
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, text: message });
      return;
    }

    createMutation.mutate({ receiver_id: Number(receiverId), message });
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this chat message?")) return;
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Chat" subtitle="Manage internal chat messages." />
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FormInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages..." className="max-w-sm" />
          <Button className="ml-auto" onClick={openCreate}>New Message</Button>
        </div>
        {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {chatQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading chat messages...</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="p-3">From</th>
                <th className="p-3">To</th>
                <th className="p-3">Message</th>
                <th className="p-3">Time</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(chatQuery.data ?? []).map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)]/60">
                  <td className="p-3">{item.sender?.name ?? item.sender_id}</td>
                  <td className="p-3">{item.receiver?.name ?? item.receiver_id}</td>
                  <td className="p-3">{item.message}</td>
                  <td className="p-3">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => openEdit(item)}>Edit</Button>
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
        <Modal title={editing ? "Edit Message" : "Send Message"} onClose={closeModal}>
          <form className="space-y-4" onSubmit={submit}>
            {!editing && (
              <div>
                <label className="mb-1 block text-sm font-medium">Recipient</label>
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Select user</option>
                  {(usersQuery.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">Message</label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit">{editing ? "Update" : "Send"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
