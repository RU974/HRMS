import { create } from "zustand";

interface PreferencesState {
  compactTable: boolean;
  toggleCompactTable: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  compactTable: false,
  toggleCompactTable: () => set((s) => ({ compactTable: !s.compactTable }))
}));


