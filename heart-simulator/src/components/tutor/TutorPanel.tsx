'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTutorStore } from '@/store/useTutorStore';
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';

const SUGGESTED_QUESTIONS = [
  'Explain the cardiac cycle',
  'What happens during a STEMI?',
  'How does the conduction system work?',
  'Explain the difference between systole and diastole',
  'What is ejection fraction?',
  'How do beta-blockers work?',
  'Walk me through a right heart catheterization',
  'What is the significance of ST elevation?',
  'Explain preload and afterload',
  'What causes atrial fibrillation?',
];

const TUTOR_RESPONSES: Record<string, string> = {
  'cardiac cycle': `The cardiac cycle consists of two main phases:

**Systole** (contraction): The ventricles contract, ejecting blood into the aorta and pulmonary artery. This has sub-phases:
- Isovolumetric contraction (all valves closed, pressure building)
- Rapid ejection (aortic/pulmonary valves open)
- Reduced ejection (pressure gradient decreasing)

**Diastole** (relaxation): The ventricles relax and fill with blood:
- Isovolumetric relaxation (all valves closed, pressure dropping)
- Rapid filling (AV valves open, passive filling)
- Diastasis (slow filling)
- Atrial systole (atrial kick, final ~20% of filling)

The whole cycle takes about 0.8 seconds at 75 bpm.`,

  'stemi': `A **STEMI** (ST-Elevation Myocardial Infarction) occurs when a coronary artery is completely occluded, usually by a ruptured atherosclerotic plaque with overlying thrombus.

**What happens:**
1. Complete coronary artery occlusion
2. Transmural ischemia (full-thickness) of the supplied territory
3. Without reperfusion, myocardial necrosis begins within 20 minutes
4. "Time is muscle" — every minute of delay loses cardiac tissue

**ECG findings:** ST elevation in contiguous leads corresponding to the affected territory:
- Anterior: V1-V4 (LAD)
- Inferior: II, III, aVF (RCA)
- Lateral: I, aVL, V5-V6 (LCx)

**Treatment:** Emergent reperfusion via primary PCI (preferred) or fibrinolysis.`,

  'conduction': `The cardiac conduction system ensures coordinated electrical activation:

1. **SA Node** (right atrium) — the "pacemaker" fires at 60-100 bpm
2. **Atrial conduction** — wave spreads across atria (P wave on ECG)
3. **AV Node** — deliberate delay (PR interval) to allow atrial emptying
4. **Bundle of His** — crosses the fibrous skeleton
5. **Bundle branches** — right and left (left splits into anterior and posterior fascicles)
6. **Purkinje fibers** — rapid spread through ventricles (QRS complex)

The delay at the AV node is critical — it allows the atria to finish contracting before the ventricles begin.`,

  'default': `That's a great question! In this educational simulation, I can help you understand cardiac anatomy, physiology, ECG interpretation, conditions, medications, and procedures.

Try selecting a structure or condition from the left panel, and I'll provide context-aware explanations at your learning level.

You can also ask me about specific topics like:
- "Explain aortic stenosis"
- "What does this ECG show?"
- "Walk me through a PCI procedure"`,
};

export default function TutorPanel() {
  const { tutorOpen, toggleTutor, messages, addMessage, isTyping, setTyping } = useTutorStore();
  const { learningLevel } = useAppStore();
  const { selectedStructureId } = useSceneStore();
  const { selectedConditionId } = useConditionStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!tutorOpen) return null;

  const handleSend = () => {
    if (!input.trim()) return;

    addMessage({
      role: 'learner',
      content: input,
      timestamp: Date.now(),
      references: [],
    });

    setTyping(true);
    const query = input.toLowerCase();
    setInput('');

    // Simulate AI response
    setTimeout(() => {
      let response = TUTOR_RESPONSES['default'];
      for (const [key, val] of Object.entries(TUTOR_RESPONSES)) {
        if (query.includes(key)) {
          response = val;
          break;
        }
      }

      const levelLabel = ['', 'EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'][learningLevel];
      response = `*[Explaining at ${levelLabel} level]*\n\n${response}`;

      addMessage({
        role: 'tutor',
        content: response,
        timestamp: Date.now(),
        references: selectedStructureId ? [selectedStructureId] : [],
      });
      setTyping(false);
    }, 800);
  };

  return (
    <div className="fixed right-0 top-12 bottom-0 w-96 bg-cardiac-panel border-l border-slate-700 flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-cardiac-accent flex items-center justify-center text-xs">🎓</div>
          <span className="text-sm font-semibold text-white">AI Tutor</span>
          <span className="text-[10px] text-slate-500">
            ({['', 'EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'][learningLevel]})
          </span>
        </div>
        <button onClick={toggleTutor} className="text-slate-400 hover:text-white text-lg">×</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-slate-400 mb-4">
              Welcome! Ask me anything about cardiac anatomy, physiology, or conditions.
            </p>
            <div className="space-y-1">
              {SUGGESTED_QUESTIONS.slice(0, 5).map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                  }}
                  className="block w-full text-left text-xs text-cardiac-accent/80 hover:text-cardiac-accent px-2 py-1 rounded hover:bg-cardiac-surface transition-colors"
                >
                  → {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'learner' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'learner'
                  ? 'bg-cardiac-accent/20 text-cardiac-accent'
                  : 'bg-cardiac-dark text-slate-300'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
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

      {/* Input */}
      <div className="p-3 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about anatomy, conditions, ECG..."
            className="flex-1 bg-cardiac-dark text-xs text-slate-200 rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
          />
          <button
            onClick={handleSend}
            className="px-3 py-2 bg-cardiac-accent text-cardiac-dark text-xs font-semibold rounded-lg hover:bg-cardiac-accent/80 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
