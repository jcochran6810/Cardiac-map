'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTutorStore } from '@/store/useTutorStore';
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useLearningStore } from '@/store/useLearningStore';
import { localTutorAnswer, suggestedQuestions, describeContext, contextReference, type TutorContextInfo } from '@/lib/tutor/tutorEngine';
import { LEVEL_LABELS } from '@/data/navigation';
import tutorPrompts from '@/data/tutor-prompts.json';
import type { QuizQuestion } from '@/types/tutor';

const QUIZ_QUESTIONS = (tutorPrompts as { quizQuestions: QuizQuestion[] }).quizQuestions;
const WELCOME = (tutorPrompts as { welcomeMessages: Record<string, string> }).welcomeMessages;

/** Very small markdown renderer: **bold**, *italic*, bullets and line breaks. */
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={j} className="text-slate-100">{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={j} className="text-slate-400">{part.slice(1, -1)}</em>;
      return <React.Fragment key={j}>{part}</React.Fragment>;
    });
    const isBullet = /^\s*[•\-]\s/.test(line);
    const isNumbered = /^\s*\d+\.\s/.test(line);
    return (
      <div key={i} className={`${isBullet || isNumbered ? 'pl-3 -indent-3' : ''} ${line.trim() === '' ? 'h-2' : ''}`}>
        {parts}
      </div>
    );
  });
}

type ApiStatus = 'unknown' | 'available' | 'unavailable';

export default function TutorPanel() {
  const { tutorOpen, toggleTutor, messages, addMessage, clearMessages, isTyping, setTyping, quizMode, startQuiz, endQuiz, recordAnswer, quizScore, quizTotal } = useTutorStore();
  const { learningLevel } = useAppStore();
  const { selectedStructureId } = useSceneStore();
  const { selectedConditionId } = useConditionStore();
  const { selectedProcedureId } = useProcedureStore();
  const { selectedMedicationId } = usePharmacologyStore();
  const { activeCaseId } = useCaseStore();
  const { activeProfileId } = useECGStore();
  const heartRate = useTimelineStore((s) => s.heartRate);
  const { recordQuizAttempt } = useLearningStore();

  const [input, setInput] = useState('');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('unknown');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ctx: TutorContextInfo = useMemo(() => ({
    learningLevel, selectedStructureId, selectedConditionId, selectedProcedureId, selectedMedicationId, activeCaseId, activeProfileId, heartRate,
  }), [learningLevel, selectedStructureId, selectedConditionId, selectedProcedureId, selectedMedicationId, activeCaseId, activeProfileId, heartRate]);

  const suggestions = useMemo(() => suggestedQuestions(ctx), [ctx]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, quizIndex, quizPick]);

  // Probe once whether a Claude backend is configured
  useEffect(() => {
    if (!tutorOpen || apiStatus !== 'unknown') return;
    fetch('/api/tutor', { method: 'GET' })
      .then((r) => r.json())
      .then((j) => setApiStatus(j?.available ? 'available' : 'unavailable'))
      .catch(() => setApiStatus('unavailable'));
  }, [tutorOpen, apiStatus]);

  if (!tutorOpen) return null;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || isTyping) return;
    addMessage({ role: 'learner', content: q, timestamp: Date.now(), references: [] });
    setInput('');
    setTyping(true);

    const references = [selectedConditionId, selectedProcedureId, selectedMedicationId, selectedStructureId, activeCaseId].filter(Boolean) as string[];
    const local = localTutorAnswer(q, ctx);

    let answer: string | null = null;
    if (apiStatus === 'available') {
      try {
        const history = messages.slice(-8).map((m) => ({ role: m.role === 'learner' ? 'user' : 'assistant', content: m.content }));
        const res = await fetch('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, context: describeContext(ctx), reference: contextReference(ctx), level: learningLevel, history }),
        });
        if (res.ok) {
          const j = await res.json();
          if (j?.answer) answer = j.answer as string;
        } else if (res.status === 501) {
          setApiStatus('unavailable');
        }
      } catch {
        // fall through to the local engine
      }
    }

    // Keep the "thinking" indicator visible briefly for the local engine so the reply feels natural
    if (!answer) await new Promise((r) => setTimeout(r, 350));
    addMessage({ role: 'tutor', content: answer ?? local, timestamp: Date.now(), references });
    setTyping(false);
  };

  // ─── Quiz mode ───
  const beginQuiz = () => {
    startQuiz('general');
    setQuizIndex(Math.floor(Math.random() * QUIZ_QUESTIONS.length));
    setQuizPick(null);
  };
  const question = QUIZ_QUESTIONS[quizIndex];
  const answerQuiz = (i: number) => {
    if (quizPick !== null) return;
    setQuizPick(i);
    const correct = i === question.correctIndex;
    recordAnswer(correct);
    recordQuizAttempt(question.id, correct);
  };
  const nextQuiz = () => {
    setQuizIndex((quizIndex + 1 + Math.floor(Math.random() * (QUIZ_QUESTIONS.length - 1))) % QUIZ_QUESTIONS.length);
    setQuizPick(null);
  };

  return (
    <div className="fixed right-0 top-10 bottom-0 w-96 bg-cardiac-panel border-l border-slate-700 flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-cardiac-accent flex items-center justify-center text-xs shrink-0">🎓</div>
          <span className="text-sm font-semibold text-white">AI Tutor</span>
          <span className="text-[10px] text-slate-500 truncate">({LEVEL_LABELS[learningLevel - 1]})</span>
          <span
            className={`text-[9px] px-1 rounded shrink-0 ${apiStatus === 'available' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-cardiac-surface text-slate-500'}`}
            title={apiStatus === 'available' ? 'Answers generated by Claude with the app\'s knowledge base as reference' : 'Answers come from the built-in knowledge base. Add ANTHROPIC_API_KEY to enable Claude.'}
          >
            {apiStatus === 'available' ? 'Claude' : 'offline'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={quizMode ? endQuiz : beginQuiz} className={`text-[10px] px-2 py-0.5 rounded ${quizMode ? 'bg-cardiac-red/20 text-cardiac-red' : 'bg-cardiac-accent/20 text-cardiac-accent hover:bg-cardiac-accent/30'}`}>
            {quizMode ? 'End quiz' : 'Quiz me'}
          </button>
          {messages.length > 0 && !quizMode && <button onClick={clearMessages} className="text-[10px] text-slate-500 hover:text-white" title="Clear conversation">clear</button>}
          <button onClick={toggleTutor} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
        </div>
      </div>

      {/* Quiz mode */}
      {quizMode && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Topic: <span className="text-slate-300 capitalize">{question.topic}</span> · difficulty {question.difficulty}</span>
            <span>Score <span className="text-emerald-400">{quizScore}</span>/{quizTotal}</span>
          </div>
          <p className="text-sm text-white leading-relaxed">{question.question}</p>
          <div className="space-y-1.5">
            {question.options.map((opt, i) => {
              const revealed = quizPick !== null;
              const cls = revealed
                ? i === question.correctIndex ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                  : i === quizPick ? 'border-red-500/60 bg-red-500/10 text-red-200' : 'border-slate-700 text-slate-500'
                : 'border-slate-700 bg-cardiac-dark text-slate-300 hover:border-cardiac-accent/50 hover:text-white';
              return (
                <button key={i} onClick={() => answerQuiz(i)} disabled={revealed} className={`w-full text-left p-2 rounded border text-xs leading-relaxed transition-colors ${cls}`}>
                  <span className="text-slate-500 mr-1">{String.fromCharCode(65 + i)}.</span>{opt}
                </button>
              );
            })}
          </div>
          {quizPick !== null && (
            <div className="p-2 rounded bg-cardiac-dark border border-slate-700">
              <p className={`text-xs font-semibold ${quizPick === question.correctIndex ? 'text-emerald-300' : 'text-red-300'}`}>
                {quizPick === question.correctIndex ? 'Correct!' : 'Not quite.'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">{question.explanation}</p>
              <button onClick={nextQuiz} className="mt-2 w-full py-1 rounded bg-cardiac-accent/20 text-cardiac-accent text-xs hover:bg-cardiac-accent/30">Next question ▶</button>
            </div>
          )}
        </div>
      )}

      {/* Chat mode */}
      {!quizMode && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="py-4">
                <p className="text-sm text-slate-300 mb-1">{WELCOME[String(learningLevel)] ?? 'Welcome!'}</p>
                <p className="text-[11px] text-slate-500 mb-3">
                  I know what you have selected in the app, so you can ask things like “explain this” or “treatment?”. Answers adapt to your learning level.
                </p>
                <div className="space-y-1">
                  {suggestions.map((q) => (
                    <button key={q} onClick={() => ask(q)} className="block w-full text-left text-xs text-cardiac-accent/80 hover:text-cardiac-accent px-2 py-1 rounded hover:bg-cardiac-surface transition-colors">
                      → {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'learner' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${msg.role === 'learner' ? 'bg-cardiac-accent/20 text-cardiac-accent' : 'bg-cardiac-dark text-slate-300'}`}>
                  {msg.role === 'learner' ? <div className="whitespace-pre-wrap">{msg.content}</div> : <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-cardiac-dark rounded-lg px-3 py-2 text-xs text-slate-400">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Follow-up suggestions once a conversation has started */}
          {messages.length > 0 && !isTyping && (
            <div className="px-3 pb-1 flex gap-1 overflow-x-auto shrink-0">
              {suggestions.slice(0, 3).map((q) => (
                <button key={q} onClick={() => ask(q)} className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-cardiac-surface text-slate-400 hover:text-cardiac-accent whitespace-nowrap">{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-700 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ask(input)}
                placeholder="Ask about anatomy, conditions, drugs, ECG..."
                className="flex-1 bg-cardiac-dark text-xs text-slate-200 rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
              />
              <button onClick={() => ask(input)} disabled={isTyping} className="px-3 py-2 bg-cardiac-accent text-cardiac-dark text-xs font-semibold rounded-lg hover:bg-cardiac-accent/80 transition-colors disabled:opacity-50">
                Send
              </button>
            </div>
            <p className="text-[9px] text-slate-600 mt-1">Educational only — not medical advice.</p>
          </div>
        </>
      )}
    </div>
  );
}
