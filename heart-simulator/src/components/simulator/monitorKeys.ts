/**
 * The hard keys by the case simulator's patient monitor, like the 12-LEAD and NIBP keys of a monitor-defibrillator: one
 * tap records a 12-lead or takes a blood pressure, without going through the action menu. A key only picks which of the
 * menu's own actions to run (and how to label it); the action then goes through the same path as a menu choice, so its
 * case time, scoring, harms, blocks and story line are the same. The menu keeps these actions too.
 */
import { has, interventionsForScenario, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import type { Scenario, SimState } from '@/lib/sim/scenario/types';
import { durationText } from './simStyles';

export type MonitorKeyKind = 'ecg' | 'bp';

const KINDS: MonitorKeyKind[] = ['ecg', 'bp'];

export interface MonitorKey {
  kind: MonitorKeyKind;
  /** the action the key runs (an ordinary action of the menu) */
  id: string;
  /** what the key says: '12-lead', 'Repeat 12-lead', 'NIBP' or 'Manual BP' */
  label: string;
  /** the case time the action takes, as the action list shows it ("30 s", "2 min") */
  time: string;
  /** the key's full name, for screen readers and the tooltip: it starts with the key's own label */
  name: string;
  /** why the key cannot be pressed now (the engine's reason), or null */
  disabled: string | null;
}

/** The actions each key may run, first choice first: the first in the learner's scope is the one */
function candidates(kind: MonitorKeyKind, state: SimState): { id: string; label: string }[] {
  if (kind === 'ecg') {
    // a 12-lead is on record once one is (the learner's own or a teammate's): the engine's own rule for a repeat
    return has(state, 'ecg12') ? [{ id: 'ecg12-repeat', label: 'Repeat 12-lead' }] : [{ id: 'ecg12', label: '12-lead' }];
  }
  // the monitor's cuff once the monitor is on (the engine refuses an NIBP without it), else a manual set by hand
  const manual = { id: 'vitals', label: 'Manual BP' };
  return has(state, 'monitor') ? [{ id: 'nibp', label: 'NIBP' }, manual] : [manual];
}

const scopeOf = (sc: Scenario, state: SimState) => new Set(interventionsForScenario(sc, state.role).map((i) => i.id));

/**
 * The key of one kind as it stands, whether or not the strip is showing now (a read open, the case over: its `disabled`
 * then gives the engine's reason), or null when its action is outside the learner's scope in this case. `scope`: the ids
 * of the learner's actions in this case (interventionsForScenario), when the caller already has them.
 */
export function monitorKey(sc: Scenario, state: SimState, kind: MonitorKeyKind, scope?: ReadonlySet<string>): MonitorKey | null {
  const inScope = scope ?? scopeOf(sc, state);
  const pick = candidates(kind, state).find((c) => inScope.has(c.id));
  if (!pick) return null;
  const iv = INTERVENTION_BY_ID[pick.id];
  const time = durationText(iv.minutes);
  return {
    kind, id: pick.id, label: pick.label, time,
    name: `${pick.label} key: ${iv.label} — ${time} of case time`,
    disabled: unavailableReason(sc, state, pick.id),
  };
}

/**
 * The keys to show now: the 12-lead, then the blood pressure. None while a read is waiting (every action is locked until
 * it is given) or once the case has ended. A key whose action is outside the learner's scope in this case is left out;
 * one the engine would refuse now is disabled, with the engine's reason.
 */
export function monitorKeys(sc: Scenario, state: SimState, scope?: ReadonlySet<string>): MonitorKey[] {
  if (state.ended || state.pendingRead) return [];
  const inScope = scope ?? scopeOf(sc, state);
  return KINDS.map((kind) => monitorKey(sc, state, kind, inScope)).filter((k): k is MonitorKey => k !== null);
}

/**
 * What the 12-lead tab says while it has no tracing, in the words of the key that would record one (the key the strip
 * offers, so the tab never names a key that is not there, or the wrong one):
 * - `ended`: the case ended before a 12-lead was recorded (no instruction);
 * - `arrest`: no pulse: the engine records no 12-lead in an arrest, so no key or menu item would bring a tracing;
 * - `none`: recording a 12-lead is not among the learner's actions in this case;
 * - `press`: press `key` (or choose its action in the menu); `afterRead`: once the read open now is given (the strip
 *   steps aside until then);
 * - `refused`: the key is there but disabled (`key.disabled` says why).
 * A 12-lead counted with no tracing (the pulse was lost while it was being recorded) is offered as the repeat, as the
 * key and the menu both do.
 */
export type NoTracingNote =
  | { kind: 'ended' }
  | { kind: 'arrest' }
  | { kind: 'none' }
  | { kind: 'press'; key: MonitorKey; afterRead: boolean }
  | { kind: 'refused'; key: MonitorKey };

export function noTracingNote(sc: Scenario, state: SimState, scope?: ReadonlySet<string>): NoTracingNote {
  if (state.ended) return { kind: 'ended' };
  if (!state.pulse) return { kind: 'arrest' };
  const key = monitorKey(sc, state, 'ecg', scope);
  if (!key) return { kind: 'none' };
  if (state.pendingRead) return { kind: 'press', key, afterRead: true };
  return key.disabled ? { kind: 'refused', key } : { kind: 'press', key, afterRead: false };
}
