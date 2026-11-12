'use client';

import React, { useEffect, useRef } from 'react';
import { useDrillStore } from '@/store/useDrillStore';
import { useECGStore } from '@/store/useECGStore';
import { useAppStore } from '@/store/useAppStore';
import { DRILL_SETS, DRILL_SET_BY_ID, MASTERED, labelOf, mastery, statKey } from '@/lib/drill';
import { closeTrainer, leaveSet, nextTracing, startSet } from '@/lib/drillRun';
import { CONDITION_TO_PROFILE, ECG_PROFILES } from '@/lib/ecg/profiles';
import { openById } from '@/lib/actions';
import { goBack, useBackNavStore } from '@/lib/backNav';
import { IconBack, IconCheck, IconChevron, IconClose, IconPlay } from '@/components/ui/icons';

const PAGE_OF: Record<string, string> = Object.fromEntries(Object.entries(CONDITION_TO_PROFILE).map(([condition, profile]) => [profile, condition]));

/** Leave for the main menu, like the Back button when the trainer was opened from it */
function leave() {
  const prev = useBackNavStore.getState().previous;
  if (prev && !prev.lesson && prev.mode === 'home') goBack();
  else closeTrainer();
}

/**
 * Rhythm trainer: a tracing, "what is this?", an answer, why — again and again, with the rhythms
 * you get wrong coming back more often. Sits beside the tracing on wide screens, above it on upright ones.
 */
export default function RhythmTrainer({ style, side = false }: { style?: React.CSSProperties; side?: boolean }) {
  const d = useDrillStore();
  const role = useAppStore((s) => s.learningLevel);
  const set = d.setId ? DRILL_SET_BY_ID[d.setId] : null;
  const q = d.question;
  const answered = d.picked !== null;
  const nextRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // while the question is open nothing else on screen may name the rhythm
  const asking = !!q && !answered;
  useEffect(() => {
    useECGStore.getState().setBlind('drill', asking);
    return () => useECGStore.getState().setBlind('drill', false);
  }, [asking]);

  // after an answer: show why from the top, with Next ready under the thumb / the Enter key
  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [answered, q]);

  const shell = `h-full min-h-0 min-w-0 flex flex-col bg-cardiac-panel ${side ? 'border-r border-slate-700 shrink-0' : 'w-full'}`;

  // ── choosing a set ──
  if (!set || !q) {
    return (
      <aside style={style} className={shell} aria-label="Rhythm trainer">
        <Header title="Rhythm trainer" sub="Choose what to practice" />
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
          <p className="text-sm text-slate-300 leading-snug">
            You get a live tracing and name it. You are told at once whether you were right and how to recognize it — and the ones you miss come back more often.
          </p>
          {role === 1 && (
            <p className="mt-3 text-[13px] leading-snug rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100 p-2.5">
              Reading rhythms is outside the EMT scope of practice: on a call the AED analyzes the rhythm, and you acquire and transmit the 12-lead. Practice here to understand what you are seeing and to prepare for the next level.
            </p>
          )}
          <div className="mt-3 grid gap-2.5">
            {DRILL_SETS.map((s) => {
              const m = mastery(s, d.stats);
              return (
                <button key={s.id} onClick={() => startSet(s.id)} className="text-left p-3 rounded-xl bg-cardiac-dark/60 border border-slate-600 hover:border-cardiac-accent/70 transition-colors">
                  <span className="flex items-center gap-2">
                    <span className="flex-1 text-[15px] font-semibold text-white leading-tight">{s.title}</span>
                    <span className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg bg-cardiac-accent text-slate-950 text-xs font-semibold"><IconPlay size={14} />{m.seen ? 'Continue' : 'Start'}</span>
                  </span>
                  <span className="block mt-1 text-xs text-slate-400 leading-snug">{s.text}</span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-cardiac-dark overflow-hidden">
                      <span className="block h-full bg-emerald-500/80" style={{ width: `${(m.mastered / m.total) * 100}%` }} />
                    </span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {m.mastered}/{m.total} mastered{m.seen > 0 ? ` · ${Math.round((m.right / m.seen) * 100)}% right` : ''}{(d.best[s.id] ?? 0) > 1 ? ` · best run ${d.best[s.id]}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-slate-500 leading-snug">
            A rhythm counts as mastered after you have named it correctly several times in a row. Tracings are synthesized for teaching; real ones are messier.
          </p>
        </div>
      </aside>
    );
  }

  // ── a set in play ──
  const right = answered && d.picked === q.profile;
  const m = mastery(set, d.stats);
  const profile = ECG_PROFILES[q.profile];
  const page = PAGE_OF[q.profile];
  const box = d.stats[statKey(set.id, q.profile)]?.box ?? 0;

  return (
    <aside style={style} className={shell} aria-label={`Rhythm trainer: ${set.title}`}>
      <Header
        title={set.title}
        sub={<>
          <span className="phone:hidden">Rhythm trainer</span>
          {/* phones: the score takes the place of the trainer's name (the top bar shows it) instead of a row of its own */}
          <span className="hidden phone:inline normal-case tracking-normal text-[11px] text-slate-400">
            <b className="text-slate-100 tabular-nums">{d.right}</b> / {d.asked} right · run <b className={`tabular-nums ${d.streak >= 3 ? 'text-cardiac-accent' : 'text-slate-100'}`}>{d.streak}</b> · {m.mastered}/{m.total} mastered
          </span>
        </>}
        onBack={leaveSet}
      />
      <div className="shrink-0 px-3 py-1.5 flex phone:hidden items-center gap-3 border-b border-slate-700/80 text-[11px] text-slate-400">
        <span><b className="text-slate-100 tabular-nums">{d.right}</b> / {d.asked} right</span>
        <span>Run <b className={`tabular-nums ${d.streak >= 3 ? 'text-cardiac-accent' : 'text-slate-100'}`}>{d.streak}</b></span>
        <span className="ml-auto flex items-center gap-1.5 min-w-0">
          <span className="w-16 h-1.5 rounded-full bg-cardiac-dark overflow-hidden"><span className="block h-full bg-emerald-500/80" style={{ width: `${(m.mastered / m.total) * 100}%` }} /></span>
          <span className="whitespace-nowrap">{m.mastered}/{m.total} mastered</span>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 phone:py-2" aria-live="polite">
        {!answered ? (
          <div className="flex flex-col">
            <h2 className="text-lg phone:text-[15px] font-semibold text-white leading-snug">What is this {set.layout === 'monitor' ? 'rhythm' : '12-lead'}?</h2>
            {/* (a phone on its side has the least height: the reminder goes under the answers there) */}
            <p className="mt-1 phone:mt-0 short:order-last short:mt-2 text-[13px] phone:text-xs text-slate-400 leading-snug">
              {set.layout === 'monitor'
                ? 'Work through it: rate, regular or not, P waves, PR interval, QRS width.'
                : 'Work through it: rhythm, axis, intervals, then the ST segments and T waves, lead group by lead group.'}
            </p>
            {/* phones: three narrower columns, so that every answer and "not sure" are in view above the tracing */}
            <div className="mt-3 phone:mt-2 grid gap-1.5 phone:gap-1 grid-cols-2 phone:grid-cols-3">
              {q.options.map((p) => (
                <button
                  key={p}
                  onClick={() => d.answer(p)}
                  className="text-left px-2.5 py-2.5 phone:px-2 phone:py-1 min-h-[44px] rounded-lg border border-slate-600 text-sm phone:text-xs leading-snug phone:leading-tight text-slate-100 hover:border-slate-400 hover:bg-cardiac-surface/60 transition-colors"
                >
                  {labelOf(set, p)}
                </button>
              ))}
            </div>
            <button
              onClick={() => d.answer('unsure')}
              className="mt-3 phone:mt-2 w-full min-h-[44px] px-3 rounded-lg border border-dashed border-slate-500 text-[13px] text-slate-300 hover:text-white hover:border-slate-300 hover:bg-cardiac-surface/60 transition-colors"
            >
              I am not sure — show me
            </button>
          </div>
        ) : (
          <>
            <div className={`p-3 rounded-xl border ${right ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40'}`}>
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${right ? 'text-emerald-300' : 'text-rose-300'}`}>
                {right ? <IconCheck size={16} /> : <IconClose size={16} />}
                {right ? 'Correct' : d.picked === 'unsure' ? 'This one is' : 'Not quite'}
              </div>
              <div className="mt-1 text-lg font-semibold text-white leading-snug">{labelOf(set, q.profile)}</div>
              {!right && d.picked !== 'unsure' && <div className="mt-0.5 text-[13px] text-rose-100/90">You answered: {labelOf(set, d.picked ?? '')}</div>}
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">How to recognize it</div>
            <ul className="mt-1 space-y-1.5">
              {profile.findings.map((f) => (
                <li key={f} className="flex gap-2 text-[14px] text-slate-200 leading-snug"><span className="text-cardiac-accent shrink-0">•</span><span>{f}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-slate-500">
              {box >= MASTERED ? 'Mastered — it will come up less often.' : right ? 'It will come back a few more times before it counts as mastered.' : 'It will come back soon.'}
            </p>
            {page && (
              <button
                onClick={() => { closeTrainer('stay'); openById(page); }}
                className="mt-2 px-2.5 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-200 hover:border-sky-400 hover:text-white"
              >
                Read its page in the library →
              </button>
            )}
          </>
        )}
      </div>

      {answered && (
        <footer className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-slate-700/80">
          <span className="flex-1 text-[11px] text-slate-500 truncate">Look at the tracing again with the answer in mind.</span>
          {/* (Space presses it too, after an answer given with the mouse: AppShell's shortcut leaves it alone) */}
          <button ref={nextRef} onClick={nextTracing} data-space-presses className="h-10 px-4 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold hover:bg-amber-400 flex items-center gap-1">
            Next tracing <IconChevron size={16} />
          </button>
        </footer>
      )}
    </aside>
  );
}

function Header({ title, sub, onBack }: { title: string; sub: React.ReactNode; onBack?: () => void }) {
  return (
    <header className="shrink-0 px-3 py-2 short:py-1 flex items-center gap-2 border-b border-slate-700/80">
      {/* named, so that it is not mistaken for the top bar's Back arrow above it */}
      {onBack && (
        <button onClick={onBack} className="shrink-0 h-8 touch:h-10 -ml-1 pl-1 pr-2 flex items-center gap-0.5 rounded-md text-[13px] font-medium text-slate-300 hover:text-white hover:bg-cardiac-surface" aria-label="Back to the sets" title="Back to the list of sets">
          <IconBack size={18} />Sets
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-cardiac-accent truncate">{sub}</div>
        <div className="text-[13px] font-semibold text-white leading-tight truncate">{title}</div>
      </div>
      <button onClick={leave} className="shrink-0 w-8 h-8 touch:w-10 touch:h-10 -mr-1 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-cardiac-surface" aria-label="Leave the rhythm trainer" title="Leave the rhythm trainer">
        <IconClose size={18} />
      </button>
    </header>
  );
}
