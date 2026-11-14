'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { attached, useSimStore } from '@/store/useSimStore';
import { LEVEL_LABELS } from '@/store/useAppStore';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { HINT_POINTS, clockText, interventionsForScenario, unavailableReason } from '@/lib/sim/scenario/engine';
import { CATEGORY_ORDER, INTERVENTION_BY_ID, categoryLabel } from '@/lib/sim/scenario/interventions';
import type { Category, Intervention, LogEntry, Scenario, SimState } from '@/lib/sim/scenario/types';
import { IconClose, IconSearch } from '@/components/ui/icons';
import { matches } from '@/lib/device';
import { SETTING_LABEL, SPEAKER_STYLE, TONE_STYLE, durationText, gradeStyle, speakerName } from './simStyles';
import { ReadBar, ReadList } from './ReadPanel';
import ImagingPanel from './ImagingPanel';
import { endedSummary, twelveLeadNote } from './runnerText';
import { groupActions } from './actionGroups';
import { monitorKeys, noTracingNote, type MonitorKey, type MonitorKeyKind, type NoTracingNote } from './monitorKeys';

/** A phone on its side (the Tailwind `short:` variant) */
const SHORT_QUERY = '(max-height: 500px)';

const MonitorDisplay = dynamic(() => import('@/components/monitor/MonitorDisplay'), { ssr: false });
const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });

type Tab = 'story' | 'ecg' | 'imaging';

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
  const [newRun, setNewRun] = useState(false);
  // the action menu's open category: kept here so the phone's sheet reopens where the learner was (null = the menu)
  const [actionCat, setActionCat] = useState<Category | null>(null);
  useEffect(() => setActionCat(null), [state.scenarioId, state.role]);
  const seen = useRef({ log: state.log.length, performed: state.performed.length, images: state.images.length });
  // the cath lab films every run; a case elsewhere shows the tab only once it has a picture to show (the emergency
  // department's X-ray, CT and ultrasound are told in words)
  const imagingTab = sc.setting === 'cathlab' || state.images.length > 0;

  // A new 12-lead to read opens the 12-lead tab and an image to read (an angiogram, a pressure-wire
  // screen) the imaging tab; any other read needs the story. On a phone on its side the action column has no
  // "After …" panel and the 12-lead tab hides the monitor, so any other action brings back the story (and the
  // monitor) to show what it did; the read and its verdict stay on their tab until then. Anything said (or filmed)
  // while another tab is open marks that tab with a dot.
  useEffect(() => {
    const prev = seen.current;
    const last = state.performed.at(-1);
    const fresh = state.performed.length > prev.performed;
    const kind = state.pendingRead?.kind;
    // a read of a recorded run looks at its picture; a read in words alone (an angiogram described, not filmed) is on the story
    const onImage = imagingTab && !!state.pendingRead?.run;
    if (fresh && last && (last.id === 'ecg12' || last.id === 'ecg12-repeat') && kind === 'ecg') setTab('ecg');
    else if (onImage && tab !== 'imaging') setTab('imaging');
    else if (kind && kind !== 'ecg' && !onImage && tab !== 'story') setTab('story');
    else if (fresh && tab !== 'story' && matches(SHORT_QUERY)) {
      setTab('story');
      if (state.images.length > prev.images) setNewRun(true);
    } else {
      if (state.log.length > prev.log && tab !== 'story') setUnread(true);
      if (state.images.length > prev.images && tab !== 'imaging') setNewRun(true);
    }
    seen.current = { log: state.log.length, performed: state.performed.length, images: state.images.length };
  }, [state, tab, imagingTab]);
  useEffect(() => {
    if (tab === 'story') setUnread(false);
    if (tab === 'imaging') setNewRun(false);
  }, [tab]);

  const ended = !!state.ended;
  const reading = !!state.pendingRead && !ended;
  // the monitor's keys: a 12-lead or a blood pressure in one tap (none while a read is open or once the case is over)
  const scope = useMemo(() => new Set(interventionsForScenario(sc, state.role).map((i) => i.id)), [sc, state.role]);
  const keys = monitorKeys(sc, state, scope);
  // A phone on its side (short) has about 300 px under the headers: the 12-lead tab then takes the whole patient column,
  // or the 12 leads squash into a strip too thin to read (the monitor comes back on the other tabs)
  const tracingOnly = tab === 'ecg' && !!state.lastEcg;
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
          {/* while you read a 12-lead on a phone held upright, the monitor shrinks so the tracing gets the room; on its side it steps
              aside. Its keys sit in a row under it, or beside it on a phone on its side (there the height is the monitor's) */}
          <div className={`shrink-0 max-h-[300px] lg:h-[38%] lg:max-h-[340px] short:h-[48%] short:min-h-0 p-1.5 short:gap-1.5 ${reading ? 'h-[15dvh] min-h-[92px]' : 'h-[27dvh] min-h-[140px]'} ${tracingOnly ? 'short:hidden' : 'short:flex'}`}>
            {/* On its side the waveforms share the width with the keys, and the monitor always draws 6 s across what is left:
                there its numbers column (MonitorDisplay's last column, 112-144 px) narrows to 96 px, so a 568-667 px wide
                phone keeps about two-thirds of the monitor for the traces */}
            <div data-monitor className="h-full min-w-0 short:flex-1 short:[&>div>div:last-child]:w-24 short:[&>div>div:last-child]:p-1">
              <MonitorDisplay channels={attached(state)} showRhythmName={false} />
            </div>
            {keys.length > 0 && <MonitorKeys keys={keys} side />}
          </div>
          {keys.length > 0 && <MonitorKeys keys={keys} />}
          <div className="flex shrink-0 border-y border-slate-700 bg-cardiac-panel" role="tablist" aria-label="Patient views">
            <TabButton active={tab === 'story'} onClick={() => setTab('story')} dot={unread}>Case story</TabButton>
            <TabButton active={tab === 'ecg'} onClick={() => setTab('ecg')}>12-lead ECG</TabButton>
            {imagingTab && (
              <TabButton active={tab === 'imaging'} onClick={() => setTab('imaging')} dot={newRun}>
                Imaging{state.images.length > 0 && <span className="ml-1 text-slate-500 tabular-nums">{state.images.length}</span>}
              </TabButton>
            )}
          </div>
          <div className="flex-1 min-h-0 relative">
            {tab === 'story' ? <CaseLog state={state} /> : tab === 'imaging' ? <ImagingPanel state={state} /> : <TwelveLead sc={sc} state={state} note={noTracingNote(sc, state, scope)} />}
          </div>
        </div>

        {/* Actions: a column on large screens */}
        <aside className="hidden lg:flex short:flex w-[400px] xl:w-[440px] short:w-[44%] shrink-0 flex-col min-h-0 border-l border-slate-700 bg-cardiac-panel">
          {ended ? <EndedCard state={state} percent={review?.percent} outcome={review?.outcome} onReview={onReview} /> : reading ? <ReadList key={`${state.pendingRead!.kind}-${state.pendingRead!.minute}-${state.reads.length}`} kind={state.pendingRead!.kind} prompt={state.pendingRead!.prompt} /> : <ActionList sc={sc} state={state} cat={actionCat} setCat={setActionCat} showLatest />}
        </aside>
      </div>

      {/* Phones and tablets: one big button opens the action list */}
      <div className="lg:hidden short:hidden shrink-0 p-2 border-t border-slate-700 bg-cardiac-panel flex gap-2">
        {ended ? (
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <EndedNote state={state} percent={review?.percent} outcome={review?.outcome} />
            <button onClick={onReview} className="w-full h-12 rounded-xl bg-cardiac-accent text-slate-950 font-semibold text-[15px]">
              See your score and review →
            </button>
          </div>
        ) : reading ? (
          <ReadBar key={`${state.pendingRead!.kind}-${state.pendingRead!.minute}-${state.reads.length}`} kind={state.pendingRead!.kind} prompt={state.pendingRead!.prompt} />
        ) : (
          <>
            <button onClick={() => setSheet(true)} className="flex-1 h-12 rounded-xl bg-cardiac-accent text-slate-950 font-semibold text-[15px]">
              What do you do next?
            </button>
            <button onClick={stopNow} aria-label="End case" title="End case" className="xs:hidden px-3 h-12 rounded-xl border border-red-500/40 text-xs text-red-200">End</button>
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
          <ActionList sc={sc} state={state} cat={actionCat} setCat={setActionCat} onDone={() => setSheet(false)} />
        </div>
      )}
    </div>
  );
}

/** A second press of the same monitor key this soon after the first is taken as a double tap, and ignored */
const REPRESS_MS = 700;

/**
 * The monitor's hard keys (which action each runs: monitorKeys.ts), pressed like a menu choice. `side`: the column beside
 * the monitor on a phone on its side; otherwise the row under it. Both are rendered and CSS shows the one that fits.
 */
function MonitorKeys({ keys, side = false }: { keys: MonitorKey[]; side?: boolean }) {
  const act = useSimStore((s) => s.act);
  // The keys stay on screen after a tap (the menu's sheet closes after one): a quick second tap on the same key, a double
  // tap or a bounce, must not run the action again and cost the case time twice. Another key still answers at once.
  const lastPress = useRef<Partial<Record<MonitorKeyKind, number>>>({});
  const press = (k: MonitorKey) => {
    const now = performance.now();
    if (now - (lastPress.current[k.kind] ?? -Infinity) < REPRESS_MS) return;
    lastPress.current[k.kind] = now;
    act(k.id);
  };
  const buttons = keys.map((k) => (
    <button
      key={k.kind}
      type="button"
      onClick={() => press(k)}
      disabled={!!k.disabled}
      title={k.disabled ?? k.name}
      aria-label={k.name}
      // the hover look only where there is a mouse: on a touch screen it would stay on after the tap, as if the key were lit
      className={`rounded-md border border-slate-600 bg-cardiac-dark text-slate-100 flex items-center justify-center gap-x-2 gap-y-0.5 transition-colors [@media(hover:hover)]:hover:border-cardiac-accent/70 [@media(hover:hover)]:hover:bg-cardiac-surface/60 active:bg-cardiac-surface focus-visible:outline-none focus-visible:border-cardiac-accent focus-visible:ring-1 focus-visible:ring-cardiac-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-600 disabled:hover:bg-cardiac-dark ${
        side ? 'flex-1 min-h-[36px] max-h-16 w-full flex-col px-0.5 text-center' : 'h-9 touch:h-10 px-3 flex-col xs:flex-row sm:w-[11.5rem]'
      }`}
    >
      {/* a narrow key wraps between the words, never inside "12-lead" */}
      <span className={`font-mono font-semibold uppercase tracking-wide leading-tight ${side ? 'text-[11px]' : 'text-[12px]'}`}>
        {k.label.split(' ').map((w, i) => <React.Fragment key={i}>{i > 0 && ' '}<span className="whitespace-nowrap">{w}</span></React.Fragment>)}
      </span>
      <span className="font-mono text-[10px] text-slate-400 leading-tight tabular-nums">{k.time}</span>
    </button>
  ));
  // 64 px: "12-LEAD" and "REPEAT / 12-LEAD" still fit, and the waveforms keep the width
  if (side) return <div role="group" aria-label="Monitor keys" className="hidden short:flex w-16 shrink-0 flex-col justify-center gap-1.5">{buttons}</div>;
  return (
    <div className="short:hidden shrink-0 px-1.5 pb-1.5">
      <div role="group" aria-label="Monitor keys" className="grid grid-cols-2 gap-1.5 sm:flex sm:justify-end">{buttons}</div>
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

/** `note`: what to say while there is no tracing (monitorKeys.ts noTracingNote: in the words of the key on the monitor) */
function TwelveLead({ sc, state, note: empty }: { sc: Scenario; state: SimState; note: NoTracingNote }) {
  const last = state.lastEcg;
  if (!last) return <NoTracing sc={sc} note={empty} />;
  const { note, changed, canRepeat } = twelveLeadNote(state);
  const youRead = note.kind === 'verdict' || note.kind === 'unchanged';
  // the feedback's verdict on the read of this tracing
  const verdictLine = note.kind === 'verdict'
    ? [...state.log].reverse().find((l) => l.who === 'feedback' && l.minute === note.minute && /^(Correct|Partly right|Not quite)/.test(l.text))
    : undefined;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="shrink-0 px-3 py-1.5 border-b border-slate-700/60 text-[12px] leading-snug max-h-[45%] overflow-y-auto">
        <span className="text-slate-400">12-lead recorded at {clockText(last.minute)}. </span>
        {note.kind === 'emt' ? (
          <span className="text-slate-300">Reading it is outside EMT scope — transmit it to the hospital.</span>
        ) : note.kind === 'ask' ? (
          <span className="text-amber-200 font-medium">What does it show? Choose your read — it is checked at once.</span>
        ) : note.kind === 'queued' ? (
          <span className="text-amber-200 font-medium">Answer the question open now; your read of this tracing comes next.</span>
        ) : note.kind === 'unread' ? (
          <span className="text-slate-300">The case ended before you read it.</span>
        ) : note.kind === 'verdict' ? (
          <span className={note.verdict === 'correct' ? 'text-emerald-300' : note.verdict === 'partial' ? 'text-amber-200' : 'text-red-300'}>
            {note.verdict === 'correct' ? '✓ ' : note.verdict === 'partial' ? '½ ' : '✗ '}
            {verdictLine ? verdictLine.text : ''}
          </span>
        ) : note.kind === 'unchanged' ? (
          <span className="text-slate-300">Unchanged from the tracing you read at {clockText(note.readAt)}.</span>
        ) : null}
        {/* the tracing below always draws the live rhythm: say so when it is not the one recorded (after the case too) */}
        {changed && (
          <div className="mt-1 px-2 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200">
            {canRepeat
              ? 'The patient has changed since this one was recorded — the tracing below is live. Repeat the 12-lead to record it.'
              : `The patient has changed since this one was recorded — the tracing below is live, not the one ${youRead ? 'you read' : 'recorded'}.`}
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

/** The 12-lead tab before there is a tracing: how to record one, naming the key the monitor actually shows */
function NoTracing({ sc, note }: { sc: Scenario; note: NoTracingNote }) {
  let text: React.ReactNode;
  if (note.kind === 'ended') text = 'The case ended before a 12-lead was recorded.';
  else if (note.kind === 'arrest') text = 'No 12-lead in cardiac arrest: treat the rhythm on the monitor.';
  else if (note.kind === 'none') text = 'Recording a 12-lead is not one of your actions in this case.';
  else {
    const iv = INTERVENTION_BY_ID[note.key.id];
    const keyCap = <span className="px-1 py-px rounded border border-slate-500 bg-cardiac-dark font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-200 whitespace-nowrap">{note.key.label}</span>;
    text = note.kind === 'refused' ? (
      <>The {keyCap} key on the monitor is not available now ({note.key.disabled}).</>
    ) : (
      <>
        {note.afterRead ? 'Give the read open now first, then press' : 'Press'} the {keyCap} key on the monitor (or choose{' '}
        <b className="text-slate-200 whitespace-nowrap">{iv.label}</b> under {categoryLabel(iv.category, sc.setting)}). It takes {note.key.time} of case
        time, then the tracing appears here.
      </>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <div className="text-sm font-semibold text-white">{note.kind === 'ended' ? 'No 12-lead' : 'No 12-lead yet'}</div>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

// ─── Actions ───────────────────────────────────────────────────────────────

/**
 * Everything the learner may do, as a menu: a grid of categories first (how many actions each holds, how many are
 * done), then one category's actions on a page of their own with a way back. Search finds any action from any
 * category. A long single list was hard to scan, above all on a phone.
 */
function ActionList({ sc, state, cat, setCat, onDone, showLatest = false }: {
  sc: Scenario; state: SimState; cat: Category | null; setCat: (c: Category | null) => void; onDone?: () => void; showLatest?: boolean;
}) {
  const act = useSimStore((s) => s.act);
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const all = useMemo(() => interventionsForScenario(sc, state.role), [sc, state.role]);
  const f = q.trim().toLowerCase();
  const byCat = CATEGORY_ORDER
    .map((c) => {
      const items = all.filter((i) => i.category === c);
      return { c, items, done: items.filter((i) => (state.counts[i.id] ?? 0) > 0).length };
    })
    .filter((g) => g.items.length > 0);
  const found = f ? byCat.map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.detail ?? ''}`.toLowerCase().includes(f)) })).filter((g) => g.items.length > 0) : [];
  const open = !f && cat ? byCat.find((g) => g.c === cat) ?? null : null;
  // a big category opens as a short list of groups, one unfolded at a time
  const groups = open ? groupActions(open.c, open.items) : null;
  const [unfolded, setUnfolded] = useState<string | null>(null);
  useEffect(() => setUnfolded(null), [open?.c]);

  // a new page of the menu starts at its top, and the keyboard and screen readers land on its heading
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    if (open) headRef.current?.focus({ preventScroll: true });
  }, [open?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => {
    act(id);
    // a search is for one action: the next choice starts from the menu (or the category) again
    setQ('');
    onDone?.();
  };

  // A phone on its side (short) leaves the column about 300 px: the header scrolls away with the list there, so every
  // pixel can hold actions, and the "After …" panel stays out (the case story beside it shows the same lines)
  return (
    <div className="flex-1 min-h-0 flex flex-col short:overflow-y-auto">
      {showLatest && <Latest state={state} />}
      <div className="shrink-0 px-3 pt-2 pb-2 border-b border-slate-700 space-y-2">
        {!onDone && <div className="text-sm font-semibold text-white">What do you do next?</div>}
        <div className="relative">
          <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Find an action (e.g. aspirin, 12-lead, pads)"
            className="w-full h-9 touch:h-10 bg-cardiac-dark text-[13px] touch:text-base text-slate-100 rounded-lg pl-8 pr-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
            aria-label="Find an action"
          />
        </div>
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto short:flex-none short:overflow-visible px-2 pb-4">
        {f ? (
          // search: every match, under its category
          found.length ? found.map((g) => (
            <section key={g.c} data-cat={g.c} className="pt-2">
              <h3 className="px-1 py-1 text-[11px] uppercase tracking-wider text-slate-400">{categoryLabel(g.c, sc.setting)}</h3>
              <div className="grid gap-1">{g.items.map((iv) => <ActionButton key={iv.id} iv={iv} sc={sc} state={state} onChoose={choose} />)}</div>
            </section>
          )) : <p className="px-2 py-6 text-center text-xs text-slate-400">No action matches “{q}”.</p>
        ) : open ? (
          // one category: what is still to do first, what is done after
          <section data-cat={open.c} className="pt-1">
            <div className="sticky top-0 z-10 -mx-2 px-2 pb-1 pt-1 bg-cardiac-panel flex items-center gap-2">
              <button
                onClick={() => setCat(null)}
                className="shrink-0 h-9 touch:h-10 px-2.5 rounded-lg border border-slate-600 text-[13px] text-slate-200 hover:bg-cardiac-surface flex items-center gap-1"
                aria-label="Back to all the categories"
              >
                <span aria-hidden>←</span> All
              </button>
              <h3 ref={headRef} tabIndex={-1} className="flex-1 min-w-0 truncate text-sm font-semibold text-white outline-none">{categoryLabel(open.c, sc.setting)}</h3>
              <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">{open.items.length}</span>
            </div>
            {groups ? (
              <div className="grid gap-1.5 pt-1">
                {groups.map((g) => {
                  const isOpen = unfolded === g.label;
                  const done = g.items.filter((i) => (state.counts[i.id] ?? 0) > 0).length;
                  const id = `actions-${open.c}-${g.label.replace(/\W+/g, '-').toLowerCase()}`;
                  return (
                    <div key={g.label} className={`rounded-lg border ${isOpen ? 'border-slate-500 bg-cardiac-dark/40' : 'border-slate-600/80'}`}>
                      <button
                        onClick={() => setUnfolded(isOpen ? null : g.label)}
                        aria-expanded={isOpen}
                        aria-controls={id}
                        className="w-full min-h-[48px] px-2.5 py-2 flex items-center gap-2 text-left rounded-lg hover:bg-cardiac-surface/60"
                      >
                        <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-100 leading-snug">{g.label}</span>
                        <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                          {g.items.length}{done > 0 && <span className="text-emerald-400"> · {done} done</span>}
                        </span>
                        <span aria-hidden className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                      </button>
                      {isOpen && (
                        <div id={id} className="px-1.5 pb-1.5">
                          <ActionGroup items={g.items} sc={sc} state={state} onChoose={choose} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <ActionGroup items={open.items.filter((i) => !doneFor(sc, state, i))} sc={sc} state={state} onChoose={choose} />
                {open.items.some((i) => doneFor(sc, state, i)) && (
                  <>
                    <h4 className="mt-3 px-1 py-1 text-[11px] uppercase tracking-wider text-slate-400">Done</h4>
                    <ActionGroup items={open.items.filter((i) => doneFor(sc, state, i))} sc={sc} state={state} onChoose={choose} />
                  </>
                )}
              </>
            )}
          </section>
        ) : (
          // the menu: one tile per category
          <nav aria-label="Action categories" className="pt-2">
            <p className="short:hidden px-1 pb-2 text-[12px] text-slate-400 leading-snug">
              {all.length} actions in your scope as {LEVEL_LABELS[state.role].short}, in {byCat.length} groups — some help, some harm, each takes case time.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {byCat.map((g) => (
                <button
                  key={g.c}
                  onClick={() => setCat(g.c)}
                  className="min-h-[56px] text-left px-2.5 py-2 rounded-lg border border-slate-600/80 bg-cardiac-dark/60 hover:border-cardiac-accent/70 hover:bg-cardiac-surface/60 active:bg-cardiac-surface flex flex-col justify-between"
                  aria-label={`${categoryLabel(g.c, sc.setting)}: ${g.items.length} actions${g.done ? `, ${g.done} done` : ''}`}
                >
                  <span className="text-[13px] leading-snug font-medium text-slate-100">{categoryLabel(g.c, sc.setting)}</span>
                  <span className="mt-1 text-[11px] text-slate-400 tabular-nums">
                    {g.items.length} action{g.items.length === 1 ? '' : 's'}
                    {g.done > 0 && <span className="text-emerald-400"> · {g.done} done</span>}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

/** Done and cannot be done again (a repeatable action stays with the rest, with its count) */
const doneFor = (sc: Scenario, state: SimState, iv: Intervention) => {
  const reason = unavailableReason(sc, state, iv.id);
  return reason === 'Already done' || (!!reason && reason.startsWith('Maximum'));
};

function ActionGroup({ items, sc, state, onChoose }: { items: Intervention[]; sc: Scenario; state: SimState; onChoose: (id: string) => void }) {
  if (!items.length) return null;
  return <div className="grid gap-1 pt-1">{items.map((iv) => <ActionButton key={iv.id} iv={iv} sc={sc} state={state} onChoose={onChoose} />)}</div>;
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
    <div className="short:hidden shrink-0 px-3 py-2 border-b border-slate-700 bg-cardiac-dark/50 space-y-1 max-h-48 overflow-y-auto">
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

/** The colors of the end card: red for a death, else the grade's */
const endedBox = (state: SimState, percent?: number) => (state.ended!.reason === 'death' ? 'border-red-500/50 bg-red-500/10' : gradeStyle(percent ?? 0).box);

function EndedCard({ state, percent, outcome, onReview }: { state: SimState; percent?: number; outcome?: string; onReview: () => void }) {
  // a hand-off also ends the case as complete: say so plainly when critical steps were still missing
  const { title, text } = endedSummary(state.ended!.reason, outcome);
  return (
    <div className="p-4">
      <div className={`rounded-xl border p-4 ${endedBox(state, percent)}`}>
        <div className="text-lg font-semibold text-white">{title}</div>
        <p className="mt-1 text-xs text-slate-300 leading-relaxed">
          {text}
          {' '}Your review shows your score, your times and what to fix.
        </p>
        <button onClick={onReview} className="mt-3 w-full h-11 rounded-lg bg-cardiac-accent text-slate-950 font-semibold">
          See your score and review →
        </button>
      </div>
    </div>
  );
}

/** Phones and tablets: the same verdict as the end card, in one compact box above the review button */
function EndedNote({ state, percent, outcome }: { state: SimState; percent?: number; outcome?: string }) {
  const { title, text } = endedSummary(state.ended!.reason, outcome);
  return (
    <div className={`rounded-lg border px-3 py-1.5 ${endedBox(state, percent)}`} role="status">
      <div className="text-[13px] font-semibold text-white leading-snug">{title}</div>
      <p className="text-[12px] text-slate-300 leading-snug">{text}</p>
    </div>
  );
}
