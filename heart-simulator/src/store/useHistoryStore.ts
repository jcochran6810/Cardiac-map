import { create } from 'zustand';

/** Items opened in the info panel, newest last, so "Back" can return to the previous one */
interface HistoryState {
  stack: string[];
  push: (id: string) => void;
  /** drop the current item and return the previous one (null if there is none) */
  back: () => string | null;
}

const MAX = 40;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  stack: [],
  push: (id) => set((s) => (s.stack.at(-1) === id ? s : { stack: [...s.stack, id].slice(-MAX) })),
  back: () => {
    const stack = get().stack;
    if (stack.length < 2) return null;
    const rest = stack.slice(0, -1);
    set({ stack: rest });
    return rest[rest.length - 1];
  },
}));
