'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTutorStore } from '@/store/useTutorStore';
import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useBlind, useECGStore } from '@/store/useECGStore';
import { useContent } from '@/lib/content';
import { answerQuestion, canReadMonitor } from '@/lib/tutor';
import { kindOf, nameOf, openById } from '@/lib/actions';
import { IconChevron, IconClose, IconTutor } from '@/components/ui/icons';
import { useDialogFocus } from '@/components/tutor/useDialogFocus';

const READ_MONITOR = 'What does this ECG show?';
/** a question chip: 12 px text, and at least 40 px tall on a touch screen */
const CHIP = 'px-2 py-1 touch:px-3 touch:min-h-10 rounded-full text-xs';

export default function TutorPanel() {
  const { tutorOpen, setTutorOpen, messages, addMessage, clearMessages } = useTutorStore();
  const level = useAppStore((s) => s.learningLevel);
  const mode = useAppStore((s) => s.mode);
  const selectedStructureId = useSceneStore((s) => s.selectedStructureId);
  const selectedConditionId = useConditionStore((s) => s.selectedConditionId);
  const selectedProcedureId = useProcedureStore((s) => s.selectedProcedureId);
  const selectedMedicationId = usePharmacologyStore((s) => s.selectedMedicationId);
  const profileId = useECGStore((s) => s.activeProfileId);
  // a question about the tracing is open (trainer, lesson check, quiz strip): the rhythm is not named until it is answered
  const blind = useBlind();
  const readable = canReadMonitor({ blind, mode });
  const lib = useContent();
  const [input, setInput] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAskRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // the newest question at the top of the list, so its answer reads from the start (all of it, if it fits)
  useEffect(() => {
    const list = listRef.current;
    const asked = lastAskRef.current;
    if (!tutorOpen || !list || !asked) return;
    list.scrollTo({ top: Math.max(0, Math.min(asked.offsetTop - 12, list.scrollHeight - list.clientHeight)), behavior: 'smooth' });
  }, [messages, tutorOpen]);

  // the tutor waits a moment before taking focus, so the "T" that opened it is not typed into the box
  useDialogFocus(tutorOpen, () => inputRef.current, 50);

  // The tutor and the quiz open in the same place (all of a phone's screen): opening the quiz puts the tutor away
  useEffect(() => useAppStore.subscribe((s, prev) => {
    if (s.quizOpen && !prev.quizOpen && useTutorStore.getState().tutorOpen) useTutorStore.getState().setTutorOpen(false);
  }), []);

  const suggestions = useMemo(() => {
    const s: string[] = [readable ? READ_MONITOR : 'How do I read an ECG systematically?'];
    const focus = selectedConditionId ?? selectedStructureId ?? selectedProcedureId ?? selectedMedicationId;
    if (focus && lib) {
      const n = nameOf(focus);
      if (selectedConditionId) s.push(`How is ${n} treated?`, `What causes ${n}?`);
      else if (selectedProcedureId) s.push(`Walk me through ${n}`, `What are the complications of ${n}?`);
      else if (selectedMedicationId) s.push(`What is the dose of ${n}?`, `What are the contraindications to ${n}?`);
      else s.push(`Tell me about the ${n.toLowerCase()}`, `What is the blood supply of the ${n.toLowerCase()}?`);
    }
    s.push('Explain the cardiac cycle', 'How do I localize a STEMI?', 'Explain preload and afterload', 'How does the conduction system work?');
    return s.slice(0, 6);
  }, [lib, readable, selectedConditionId, selectedStructureId, selectedProcedureId, selectedMedicationId]);

  if (!tutorOpen) return null;

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    addMessage({ role: 'learner', content: q, timestamp: Date.now() });
    setInput('');
    setMoreOpen(false);
    if (!lib) {
      addMessage({ role: 'tutor', content: 'The library is still loading — try again in a moment.', timestamp: Date.now() });
      return;
    }
    const answer = answerQuestion(q, lib, { level, profileId, selectedStructureId, selectedConditionId, selectedProcedureId, selectedMedicationId, blind, mode });
    setTimeout(() => addMessage({ role: 'tutor', content: answer.title, answer, timestamp: Date.now() }), 180);
  };
  // once a conversation has started the suggestions fold away, leaving the room to the answers
  const started = messages.length > 0;
  const lastAsk = messages.map((m) => m.role).lastIndexOf('learner');

  return (
    <div className="fixed right-2 top-16 z-40 w-[min(26rem,calc(100vw-1rem))] max-h-[max(calc(100dvh-var(--dock-h,340px)-5rem),min(70dvh,520px))] min-h-[260px] bg-cardiac-panel/95 border border-slate-600 rounded-xl flex flex-col shadow-2xl backdrop-blur phone:inset-x-0 phone:top-12 short:top-11 phone:bottom-0 phone:w-full phone:max-h-none phone:min-h-0 phone:rounded-none phone:border-x-0 phone:border-b-0 phone:animate-slide-in-up" role="dialog" aria-labelledby="tutor-title">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded-full bg-cardiac-accent/20 text-cardiac-accent flex items-center justify-center"><IconTutor size={14} /></div>
          <div className="leading-tight min-w-0">
            <h2 id="tutor-title" className="text-sm font-semibold text-white">Tutor</h2>
            <div className="text-xs text-slate-400">Answers from the CardioSim library · {LEVEL_LABELS[level].long}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {started && <button onClick={clearMessages} className="text-xs text-slate-300 hover:text-white px-2 py-1 touch:min-h-10 rounded">Clear</button>}
          <button onClick={() => setTutorOpen(false)} className="p-1 touch:p-3 text-slate-400 hover:text-white" aria-label="Close tutor"><IconClose size={16} /></button>
        </div>
      </div>

      <div ref={listRef} className="relative flex-1 overflow-y-auto p-3 space-y-3 min-h-0" aria-live="polite">
        {!started && (
          <div className="text-[13px] text-slate-400">
            <p className="mb-2">Ask about any structure, rhythm, condition, procedure or drug. I know what is on the monitor and what you have selected.</p>
            {blind && <p>A question about the tracing is open: I will name the rhythm once you have answered it.</p>}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} ref={i === lastAsk ? (el) => { lastAskRef.current = el; } : undefined} className={`flex ${m.role === 'learner' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'learner' ? (
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] bg-cardiac-accent/20 text-amber-100">{m.content}</div>
            ) : (
              <div className="max-w-[95%] rounded-lg px-3 py-2 text-[13px] bg-cardiac-dark text-slate-300 border border-slate-700">
                <div className="font-semibold text-white mb-1">{m.answer?.title ?? m.content}</div>
                {m.answer?.text && <p className="leading-relaxed mb-1.5 text-slate-300">{m.answer.text}</p>}
                {m.answer && m.answer.bullets.length > 0 && (
                  <ul className="space-y-1">
                    {m.answer.bullets.map((b, k) => (
                      <li key={k} className="flex gap-1.5 leading-relaxed"><span className="text-cardiac-accent shrink-0">•</span><span>{b}</span></li>
                    ))}
                  </ul>
                )}
                {m.answer && m.answer.links.filter((id) => kindOf(id)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Array.from(new Set(m.answer.links)).filter((id) => kindOf(id)).map((id) => (
                      <button key={id} onClick={() => openById(id)} className="px-2 py-1 touch:px-3 touch:min-h-10 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs hover:bg-sky-500/20">
                        Open {nameOf(id)}
                      </button>
                    ))}
                  </div>
                )}
                {m.answer && m.answer.followUps.length > 0 && i === messages.length - 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.answer.followUps.filter((f) => readable || f !== READ_MONITOR).slice(0, 3).map((f) => (
                      <button key={f} onClick={() => ask(f)} className={`${CHIP} border border-slate-600 text-slate-300 hover:text-white hover:border-cardiac-accent/60`}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="px-3 pt-1.5 pb-1 border-t border-slate-700/60">
        {started && (
          <button
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white py-1 touch:min-h-10"
          >
            <IconChevron size={12} className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`} />
            Suggested questions
          </button>
        )}
        {(!started || moreOpen) && (
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)} className={`${CHIP} bg-cardiac-dark border border-slate-700 text-slate-300 hover:text-white hover:border-cardiac-accent/50`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form className="p-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setTutorOpen(false); }}
          placeholder="e.g. “amiodarone dose”, “why does RBBB widen the QRS?”"
          className="flex-1 min-w-0 bg-cardiac-dark text-[13px] touch:text-base text-slate-100 rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
          aria-label="Ask the tutor"
        />
        <button type="submit" className="px-3 py-2 bg-cardiac-accent text-slate-950 text-sm font-semibold rounded-lg hover:bg-amber-400">Ask</button>
      </form>
    </div>
  );
}
