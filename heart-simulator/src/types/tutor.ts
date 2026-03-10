export interface TutorContext {
  selectedAnatomy: string | null;
  selectedCondition: string | null;
  selectedProcedure: string | null;
  currentMode: string;
  learningLevel: number;
  conversationHistory: TutorMessage[];
  quizHistory: QuizAttempt[];
  misconceptions: string[];
  suggestedLessons: string[];
}

export interface TutorMessage {
  role: 'tutor' | 'learner';
  content: string;
  timestamp: number;
  references: string[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
  topic: string;
}

export interface QuizAttempt {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
  timestamp: number;
}

export interface TutorPromptsDataset {
  schemaVersion: string;
  description: string;
  welcomeMessages: Record<string, string>;
  topicPrompts: Record<string, string[]>;
  quizQuestions: QuizQuestion[];
}
