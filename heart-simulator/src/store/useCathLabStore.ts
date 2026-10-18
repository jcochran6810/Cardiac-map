import { create } from 'zustand';

/** The cath lab catalog item open in the info panel */
export const useCathLabStore = create<{ selectedId: string | null; select: (id: string | null) => void }>((set) => ({
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}));
