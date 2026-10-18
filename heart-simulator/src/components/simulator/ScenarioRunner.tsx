'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { attached, useSimStore } from '@/store/useSimStore';
import { LEVEL_LABELS } from '@/store/useAppStore';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { HINT_POINTS, clockText, interventionsForScenario, unavailableReason } from '@/lib/sim/scenario/engine';
import { CATEGORY_LABELS, CATEGORY_ORDER, INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import type { Category, Intervention, LogEntry, Scenario, SimState } from '@/lib/sim/scenario/types';
import { IconClose, IconSearch } from '@/components/ui/icons';
import { SETTING_LABEL, SPEAKER_STYLE, TONE_STYLE, durationText, gradeStyle, speakerName } from './simStyles';
import { ReadBar, ReadList } from './ReadPanel';

const MonitorDisplay = dynamic(() => import('@/components/monitor/MonitorDisplay'), { ssr: false });
const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });

type Tab = 'story' | 'ecg';

/** A case in progress: the patient (monitor, 12-lead, story) and everything you can do */
export default function ScenarioRunner({ onReview }: { onReview: () => void }) {
  const state = useSimStore((s) => s.state)!;
  const review = useSimStore((s) => s.review);
  const hint = useSimStore((s) => s.hint);
  const endScenario = useSimStore((s) => s.endScenario);
  const closeScenario = useSimStore((s) => s.closeScenario);
  const sc = SCENARIO_BY_ID[state.scenarioId];
  const [tab, setTab] = useState<Tab>('story');
  const sheet = useSimStore((s) => s.sheetOpen);
  const setSheet = useSimStore((s) => s.setSheetOpen);
  const [unread, setUnread] = useState(false);
  const seen = useRef({ log: state.log.length, performed: state.performed.length });

  // A new 12-lead opens the 12-lead tab; anything else said while it is open marks the story unread
  useEffect(() => {
    const prev = seen.current;
    const last = state.performed.at(-1);
    if (state.performed.length > prev.performed && last && (last.id === 'ecg12' || last.id === 'ecg12-repeat')) setTab('ecg');
    else if (state.log.length > prev.log && tab === 'ecg') setUnread(true);
    seen.current = { log: state.log.length, performed: state.performed.length };
  }, [state, tab]);
  useEffect(() => {
    if (tab === 'story') setUnread(false);
  }, [tab]);

  const ended = !!state.ended;
  const reading = !!state.pendingRead && !ended;
  const fto = state.role <= 2 ? 'FTO' : 'preceptor';
  const leave = () => {
    if (ended || window.confirm('Leave this case? Your progress in it will be lost.')) closeScenario();
  };
  const stopNow = () => {
    if (window.confirm('End the case now and see your review? Anything not done yet counts as missed.')) endScenario();
  };

  return (
    <div className="absolute inset-0 flex flex-col min-h-0">
      {/* Case header */}
      <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 border-b border-slate-700 bg-cardiac-panel shrink-0">
        <button onClick={leave} className="px-2 py-1.5 rounded-md text-xs text-slate-300 hover:text-white hover:bg-cardiac-surface shrink-0" title="Back to the list of cases">
          ← Cases
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white truncate leading-tight">{sc.title}</div>
          <div className="text-[11px] text-slate-400 truncate">{SETTING_LABEL[sc.setting]} · you are the {LEVEL_LABELS[state.role].short}</div>
        </div>
        <div className="text-right shrink-0" title="Scenario time since you reached the patient. Every action takes time.">
          <div className="font-mono text-lg leading-none tabular-nums text-amber-300">{clockText(state.minute)}</div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500">case time</div>
        </div>
        {!ended && (
          <>
            <button onClick={hint} className="px-2.5 py-1.5 rounded-md border border-slate-600 text-xs text-slate-200 hover:bg-cardiac-surface shrink-0" title={`Show the next critical step (costs ${HINT_POINTS} points)`}>
              Hint
            </button>
            <button onClick={stopNow} className="hidden xs:block px-2.5 py-1.5 rounded-md border border-red-500/40 text-xs text-red-200 hover:bg-red-500/15 shrink-0">
              End case
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row short:flex-row">
        {/* The patient */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* while you read a 12-lead on a phone, the monitor shrinks so the tracing gets the room */}
          <div className={`shrink-0 max-h-[300px] lg:h-[38%] lg:max-h-[340px] short:h-[48%] short:min-h-0 p-1.5 ${reading ? 'h-[15dvh] min-h-[92px]' : 'h-[27dvh] min-h-[140px]'}`}>
            <MonitorDisplay channels={attached(state)} showRhythmName={false} />
          </div>
          <div className="flex shrink-0 border-y border-slate-700 bg-cardiac-panel" role="tablist" aria-label="Patient views">
            <TabButton active={tab === 'story'} onClick={() => setTab('story')} dot={unread}>Case story</TabButton>
            <TabButton active={tab === 'ecg'} onClick={() => setTab('ecg')}>12-lead ECG</TabButton>
          </div>
          <div className="flex-1 min-h-0 relative">
            {tab === 'story' ? <CaseLog state={state} /> : <TwelveLead state={state} />}
          </div>
        </div>

        {/* Actions: a column on large screens */}
        <aside className="hidden lg:flex short:flex w-[400px] xl:w-[440px] short:w-[44%] shrink-0 flex-col min-h-0 border-l border-slate-700 bg-cardiac-panel">
          {ended ? <EndedCard state={state} percent={review?.percent} onReview={onReview} /> : reading ? <ReadList who={fto} /> : <ActionList sc={sc} state={state} showLatest />}
        </aside>
      </div>

      {/* Phones and tablets: one big button opens the action list */}
      <div className="lg:hidden short:hidden shrink-0 p-2 border-t border-slate-700 bg-cardiac-panel flex gap-2">
        {ended ? (
          <button onClick={onReview} className="flex-1 h-12 rounded-xl bg-cardiac-accent text-slate-950 font-semibold text-[15px]">
            See your score and review →
          </button>
        ) : reading ? (
          <ReadBar who={fto} />
        ) : (
          <>
            <button onClick={() => setSheet(true)} className="flex-1 h-12 rounded-xl bg-cardiac-accent text-slate-950 font-semibold text-[15px]">
              What do you do next?
            </button>
            <button onClick={stopNow} className="xs:hidden px-3 h-12 rounded-xl border border-red-500/40 text-xs text-red-200">End</button>
          </>
        )}
      </div>

      {sheet && !ended && !reading && (
        <div className="lg:hidden short:hidden absolute inset-0 z-30 flex flex-col bg-cardiac-panel animate-slide-in-up" role="dialog" aria-label="Choose your next action">
          <div className="flex items-center gap-2 pl-3 pr-1 py-1 border-b border-slate-700 shrink-0">
            <span className="text-sm font-semibold text-white flex-1">What do you do next?</span>
            <span className="font-mono text-sm text-amber-300 tabular-nums">{clockText(state.minute)}</span>
            <button onClick={() => setSheet(false)} className="p-2.5 text-slate-300 hover:text-white" aria-label="Close the action list"><IconClose size={18} /></button>
          </div>
          <ActionList sc={sc} state={state} onDone={() => setSheet(false)} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative flex-1 sm:flex-none sm:px-5 py-2 text-xs font-medium transition-colors ${active ? 'text-cardiac-accent shadow-[inset_0_-2px_0_#f59e0b]' : 'text-slate-300 hover:text-white'}`}
    >
      {children}
      {dot && <span className="absolute top-1.5 ml-1 w-2 h-2 rounded-full bg-cardiac-accent" aria-label="new" />}
    </button>
  );
}

// ─── The story so far ──────────────────────────────────────────────────────

function CaseLog({ state }: { state: SimState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [state.log.length]);
  return (
    <div ref={ref} className="absolute inset-0 overflow-y-auto px-3 py-2.5 space-y-1.5" aria-live="polite">
      {state.log.map((l, i) => <LogLine key={i} l={l} role={state.role} />)}
    </div>
  );
}

function LogLine({ l, role }: { l: LogEntry; role: SimState['role'] }) {
  const time = <span className="font-mono text-[10px] text-slate-500 tabular-nums">{clockText(l.minute)}</span>;
  if (l.who === 'you') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5 bg-cyan-500/15 border border-cyan-500/30">
          <div className="flex items-center justify-end gap-2 text-[10px] text-cyan-300">{time}<span className="font-semibold">You</span></div>
          <div className="text-[13px] text-slate-100 leading-snug">{l.text}</div>
        </div>
      </div>
    );
  }
  if (l.who === 'system') {
    return (
      <div className={`text-center text-[12px] leading-snug px-2 py-1 rounded-md border animate-fade-in ${l.tone ? TONE_STYLE[l.tone] : 'border-transparent'} ${l.tone === 'good' ? 'text-emerald-200' : l.tone === 'bad' ? 'text-red-200' : 'text-slate-300'}`}>
        {l.text}
      </div>
    );
  }
  return (
    <div className={`max-w-[92%] rounded-lg rounded-bl-sm px-2.5 py-1.5 border bg-cardiac-panel/80 animate-fade-in ${TONE_STYLE[l.tone ?? 'info']}`}>
      <div className={`flex items-center gap-2 text-[10px] ${SPEAKER_STYLE[l.who]}`}><span className="font-semibold uppercase tracking-wide">{speakerName(l.who, role)}</span>{time}</div>
      <div className={`text-[13px] leading-snug ${l.who === 'monitor' ? 'font-mono text-emerald-100 text-[12.5px]' : l.who === 'scene' ? 'text-slate-300 italic' : 'text-slate-100'}`}>{l.text}</div>
    </div>
  );
}

// ─── 12-lead ───────────────────────────────────────────────────────────────

function TwelveLead({ state }: { state: SimState }) {
  const last = state.lastEcg;
  if (!last) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-sm font-semibold text-white">No 12-lead yet</div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Choose <b className="text-slate-200">Acquire a 12-lead ECG</b> under Monitoring &amp; ECG. It takes 2 minutes, then the tracing appears here.
          </p>
        </div>
      </div>
    );
  }
  const changed = last.profile !== state.rhythm.profile && state.pulse;
  const read = state.reads.at(-1);
  // the FTO's verdict on the read of this tracing
  const verdictLine = read && read.minute === last.minute
    ? [...state.log].reverse().find((l) => l.who === 'fto' && l.minute === read.minute && /^(Correct|Partly right|Not quite)/.test(l.text))
    : undefined;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="shrink-0 px-3 py-1.5 border-b border-slate-700/60 text-[12px] leading-snug max-h-[45%] overflow-y-auto">
        <span className="text-slate-400">12-lead recorded at {clockText(last.minute)}. </span>
        {state.role === 1 ? (
          <span className="text-slate-300">Reading it is outside EMT scope — transmit it to the hospital.</span>
        ) : state.pendingRead ? (
          <span className="text-amber-200 font-medium">What does it show? Give your read{state.role <= 2 ? ' to your FTO' : ' to your preceptor'}.</span>
        ) : read && read.minute === last.minute ? (
          <span className={read.verdict === 'correct' ? 'text-emerald-300' : read.verdict === 'partial' ? 'text-amber-200' : 'text-red-300'}>
            {read.verdict === 'correct' ? '✓ ' : read.verdict === 'partial' ? '½ ' : '✗ '}
            {verdictLine ? verdictLine.text : ''}
          </span>
        ) : (
          <span className="text-slate-300">Unchanged from your earlier read.</span>
        )}
        {changed && (
          <div className="mt-1 px-2 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200">
            The patient has changed since then — the tracing below is live. Repeat the 12-lead to record it.
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        <ECGRenderer scrub={false} />
      </div>
      <div className="shrink-0 px-3 py-1 text-[10px] text-slate-500 border-t border-slate-700/60">Double-tap a lead to enlarge it · tap again to go back</div>
    </div>
  );
}

// ─── Actions ───────────────────────────────────────────────────────────────

function ActionList({ sc, state, onDone, showLatest = false }: { sc: Scenario; state: SimState; onDone?: () => void; showLatest?: boolean }) {
  const act = useSimStore((s) => s.act);
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => interventionsForScenario(sc, state.role), [sc, state.role]);
  const f = q.trim().toLowerCase();
  const groups = CATEGORY_ORDER
    .map((c) => ({ c, items: all.filter((i) => i.category === c && (!f || `${i.label} ${i.detail ?? ''}`.toLowerCase().includes(f))) }))
    .filter((g) => g.items.length > 0);

  const jump = (c: Category) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cat="${c}"]`);
    if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' });
  };
  const choose = (id: string) => {
    act(id);
    onDone?.();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {showLatest && <Latest state={state} />}
      <div className="shrink-0 px-3 pt-2 pb-2 border-b border-slate-700 space-y-2">
        {!onDone && <div className="text-sm font-semibold text-white">What do you do next?</div>}
        <p className="short:hidden text-[11px] text-slate-400 leading-snug">
          All {all.length} actions in your scope as {LEVEL_LABELS[state.role].short} — some help, some harm. Each one takes case time.
        </p>
        <div className="relative">
          <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Find an action (e.g. aspirin, 12-lead, pads)"
            className="w-full h-9 bg-cardiac-dark text-[13px] text-slate-100 rounded-lg pl-8 pr-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
            aria-label="Find an action"
          />
        </div>
        {!f && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
            {groups.map((g) => (
              <button key={g.c} onClick={() => jump(g.c)} className="px-2 py-1 rounded-full border border-slate-600 text-[11px] text-slate-300 hover:text-white hover:bg-cardiac-surface whitespace-nowrap shrink-0">
                {CATEGORY_LABELS[g.c]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-4 relative">
        {groups.map((g) => (
          <section key={g.c} data-cat={g.c} className="pt-2">
            <h3 className="sticky top-0 z-10 px-1 py-1 text-[10px] uppercase tracking-wider text-slate-400 bg-cardiac-panel">{CATEGORY_LABELS[g.c]}</h3>
            <div className="grid gap-1">
              {g.items.map((iv) => <ActionButton key={iv.id} iv={iv} sc={sc} state={state} onChoose={choose} />)}
            </div>
          </section>
        ))}
        {groups.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-500">No action matches “{q}”.</p>}
      </div>
    </div>
  );
}

function ActionButton({ iv, sc, state, onChoose }: { iv: Intervention; sc: Scenario; state: SimState; onChoose: (id: string) => void }) {
  const reason = unavailableReason(sc, state, iv.id);
  const n = state.counts[iv.id] ?? 0;
  const done = reason === 'Already done';
  return (
    <button
      onClick={() => onChoose(iv.id)}
      disabled={!!reason}
      title={reason ?? undefined}
      className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
        reason ? 'border-slate-700/60 bg-cardiac-dark/30 cursor-not-allowed' : 'border-slate-600/80 bg-cardiac-dark/60 hover:border-cardiac-accent/70 hover:bg-cardiac-surface/60 active:bg-cardiac-surface'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] leading-snug ${reason ? 'text-slate-500' : 'text-slate-100'}`}>{iv.label}</div>
          {iv.detail && <div className={`text-[11px] leading-snug ${reason ? 'text-slate-600' : 'text-slate-400'}`}>{iv.detail}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[10px] text-slate-500">{durationText(iv.minutes)}</div>
          {done && <div className="text-[10px] text-emerald-400">✓ done</div>}
          {!done && n > 0 && <div className="text-[10px] text-sky-300">×{n}</div>}
          {reason && !done && reason !== 'The scenario has ended' && <div className="text-[10px] text-slate-500">{reason}</div>}
        </div>
      </div>
    </button>
  );
}

/** Large screens: what just happened, next to where you clicked */
function Latest({ state }: { state: SimState }) {
  const last = state.performed.at(-1);
  if (!last) return null;
  // everything said since your last action
  const label = INTERVENTION_BY_ID[last.id].label;
  let from = state.log.length - 1;
  while (from > 0 && !(state.log[from].who === 'you' && state.log[from].text.startsWith(label))) from--;
  const lines = state.log.slice(from + 1).slice(-4);
  if (!lines.length) return null;
  return (
    <div className="shrink-0 px-3 py-2 border-b border-slate-700 bg-cardiac-dark/50 space-y-1 max-h-48 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">After “{label}”</div>
      {lines.map((l, i) => (
        <div key={`${state.log.length}-${i}`} className="text-[12px] leading-snug animate-fade-in">
          <span className={`font-semibold ${SPEAKER_STYLE[l.who]}`}>{speakerName(l.who, state.role)}: </span>
          <span className={l.tone === 'bad' ? 'text-red-200' : l.tone === 'good' ? 'text-emerald-200' : 'text-slate-200'}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

function EndedCard({ state, percent, onReview }: { state: SimState; percent?: number; onReview: () => void }) {
  const reason = state.ended!.reason;
  const g = gradeStyle(percent ?? 0);
  return (
    <div className="p-4">
      <div className={`rounded-xl border p-4 ${reason === 'death' ? 'border-red-500/50 bg-red-500/10' : g.box}`}>
        <div className="text-lg font-semibold text-white">
          {reason === 'complete' ? 'Case complete' : reason === 'death' ? 'The patient died' : 'Case ended'}
        </div>
        <p className="mt-1 text-xs text-slate-300 leading-relaxed">
          {reason === 'complete' ? 'Every critical step for your role is done.' : reason === 'death' ? 'There was no return of circulation.' : 'You ended the case early.'}
          {' '}Your review shows your score, your times and what to fix.
        </p>
        <button onClick={onReview} className="mt-3 w-full h-11 rounded-lg bg-cardiac-accent text-slate-950 font-semibold">
          See your score and review →
        </button>
      </div>
    </div>
  );
}
