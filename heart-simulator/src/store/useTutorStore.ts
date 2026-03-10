import { create } from 'zustand';

interface TutorMessage {
  role: 'tutor' | 'learner';
  content: string;
  timestamp: number;
  references: string[];
}

interface TutorState {
  tutorOpen: boolean;
  messages: TutorMessage[];
  isTyping: boolean;
  quizMode: boolean;
  currentQuizId: string | null;
  quizScore: number;
  quizTotal: number;
  suggestedTopics: string[];

  toggleTutor: () => void;
  addMessage: (msg: TutorMessage) => void;
  clearMessages: () => void;
  setTyping: (typing: boolean) => void;
  startQuiz: (quizId: string) => void;
  endQuiz: () => void;
  recordAnswer: (correct: boolean) => void;
  setSuggestedTopics: (topics: string[]) => void;
}

export const useTutorStore = create<TutorState>((set) => ({
  tutorOpen: false,
  messages: [],
  isTyping: false,
  quizMode: false,
  currentQuizId: null,
  quizScore: 0,
  quizTotal: 0,
  suggestedTopics: [],

  toggleTutor: () => set((s) => ({ tutorOpen: !s.tutorOpen })),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
  setTyping: (isTyping) => set({ isTyping }),
  startQuiz: (quizId) => set({ quizMode: true, currentQuizId: quizId, quizScore: 0, quizTotal: 0 }),
  endQuiz: () => set({ quizMode: false, currentQuizId: null }),
  recordAnswer: (correct) => set((s) => ({
    quizScore: s.quizScore + (correct ? 1 : 0),
    quizTotal: s.quizTotal + 1,
  })),
  setSuggestedTopics: (suggestedTopics) => set({ suggestedTopics }),
}));
