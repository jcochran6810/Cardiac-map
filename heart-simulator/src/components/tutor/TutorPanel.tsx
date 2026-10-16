'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTutorStore } from '@/store/useTutorStore';
import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useECGStore } from '@/store/useECGStore';
import { useContent } from '@/lib/content';
import { answerQuestion } from '@/lib/tutor';
import { kindOf, nameOf, openById } from '@/lib/actions';
import { IconClose, IconTutor } from '@/components/ui/icons';

export default function TutorPanel() {
  const { tutorOpen, setTutorOpen, messages, addMessage, clearMessages } = useTutorStore();
  const level = useAppStore((s) => s.learningLevel);
  const selectedStructureId = useSceneStore((s) => s.selectedStructureId);
  const selectedConditionId = useConditionStore((s) => s.selectedConditionId);
  const selectedProcedureId = useProcedureStore((s) => s.selectedProcedureId);
  const selectedMedicationId = usePharmacologyStore((s) => s.selectedMedicationId);
  const profileId = useECGStore((s) => s.activeProfileId);
  const lib = useContent();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (tutorOpen) setTimeout(() => inputRef.current?.focus(), 50); }, [tutorOpen]);

  const suggestions = useMemo(() => {
    const s: string[] = ['What does this ECG show?'];
    const focus = selectedConditionId ?? selectedStructureId ?? selectedProcedureId ?? selectedMedicationId;
    if (focus && lib) {
      const n = nameOf(focus);
      if (selectedConditionId) s.push(`How is ${n} treated?`, `What causes ${n}?`);
      else if (selectedProcedureId) s.push(`Walk me through ${n}`, `What are the complications of ${n}?`);
      else if (selectedMedicationId) s.push(`What is the dose of ${n}?`, `What are the contraindications to ${n}?`);
      else s.push(`Tell me about the ${n.toLowerCase()}`, `What is the blood supply of the ${n.toLowerCase()}?`);
    }
    s.push('Explain the cardiac cycle', 'How do I localise a STEMI?', 'Explain preload and afterload', 'How does the conduction system work?');
    return s.slice(0, 6);
  }, [lib, selectedConditionId, selectedStructureId, selectedProcedureId, selectedMedicationId]);

  if (!tutorOpen) return null;

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    addMessage({ role: 'learner', content: q, timestamp: Date.now() });
    setInput('');
    if (!lib) {
      addMessage({ role: 'tutor', content: 'The library is still loading — try again in a moment.', timestamp: Date.now() });
      return;
    }
    const answer = answerQuestion(q, lib, { level, profileId, selectedStructureId, selectedConditionId, selectedProcedureId, selectedMedicationId });
    setTimeout(() => addMessage({ role: 'tutor', content: answer.title, answer, timestamp: Date.now() }), 180);
  };

  return (
    <div className="fixed right-2 top-14 z-40 w-[min(26rem,calc(100vw-1rem))] max-h-[calc(100vh-var(--dock-h,340px)-4.5rem)] min-h-[260px] bg-cardiac-panel/98 border border-slate-600 rounded-xl flex flex-col shadow-2xl backdrop-blur" role="dialog" aria-label="Tutor">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-cardiac-accent/20 text-cardiac-accent flex items-center justify-center"><IconTutor size={14} /></div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Tutor</div>
            <div className="text-[10px] text-slate-400">Answers from the CardioSim library · {LEVEL_LABELS[level].long}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && <button onClick={clearMessages} className="text-[10px] text-slate-400 hover:text-white px-1.5">Clear</button>}
          <button onClick={() => setTutorOpen(false)} className="p-1 text-slate-400 hover:text-white" aria-label="Close tutor"><IconClose size={16} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-xs text-slate-400">
            <p className="mb-2">Ask about any structure, rhythm, condition, procedure or drug. I know what is on the monitor and what you have selected.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'learner' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'learner' ? (
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-cardiac-accent/20 text-amber-100">{m.content}</div>
            ) : (
              <div className="max-w-[95%] rounded-lg px-3 py-2 text-xs bg-cardiac-dark text-slate-300 border border-slate-700">
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
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Array.from(new Set(m.answer.links)).filter((id) => kindOf(id)).map((id) => (
                      <button key={id} onClick={() => openById(id)} className="px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 text-[10px] hover:bg-sky-500/20">
                        Open {nameOf(id)}
                      </button>
                    ))}
                  </div>
                )}
                {m.answer && m.answer.followUps.length > 0 && i === messages.length - 1 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.answer.followUps.slice(0, 3).map((f) => (
                      <button key={f} onClick={() => ask(f)} className="px-1.5 py-0.5 rounded-full border border-slate-600 text-slate-300 text-[10px] hover:text-white hover:border-cardiac-accent/60">
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="px-3 pt-1 pb-1 flex flex-wrap gap-1 border-t border-slate-700/60">
        {suggestions.map((s) => (
          <button key={s} onClick={() => ask(s)} className="px-1.5 py-0.5 rounded-full bg-cardiac-dark border border-slate-700 text-[10px] text-slate-300 hover:text-white hover:border-cardiac-accent/50">
            {s}
          </button>
        ))}
      </div>
      <form className="p-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setTutorOpen(false); }}
          placeholder="e.g. “amiodarone dose”, “why does RBBB widen the QRS?”"
          className="flex-1 bg-cardiac-dark text-xs text-slate-100 rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
          aria-label="Ask the tutor"
        />
        <button type="submit" className="px-3 py-2 bg-cardiac-accent text-slate-950 text-xs font-semibold rounded-lg hover:bg-amber-400">Ask</button>
      </form>
    </div>
  );
}
