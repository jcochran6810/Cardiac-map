import { create } from 'zustand';
import type { TutorAnswer } from '@/lib/tutor';

export interface TutorMessage {
  role: 'tutor' | 'learner';
  content: string;
  answer?: TutorAnswer;
  timestamp: number;
}

interface TutorState {
  tutorOpen: boolean;
  messages: TutorMessage[];
  toggleTutor: () => void;
  setTutorOpen: (open: boolean) => void;
  addMessage: (msg: TutorMessage) => void;
  clearMessages: () => void;
}

export const useTutorStore = create<TutorState>((set) => ({
  tutorOpen: false,
  messages: [],
  toggleTutor: () => set((s) => ({ tutorOpen: !s.tutorOpen })),
  setTutorOpen: (tutorOpen) => set({ tutorOpen }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg].slice(-60) })),
  clearMessages: () => set({ messages: [] }),
}));
