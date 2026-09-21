import { create } from "zustand";

/**
 * Which conversation the user is looking at right now. The global inbox
 * listener uses it to avoid pinging (sound / desktop notification) for a
 * conversation that is already open in the foreground.
 */
interface ChatViewState {
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
}

export const useChatViewStore = create<ChatViewState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
