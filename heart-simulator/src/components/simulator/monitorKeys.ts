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

/**
 * The keys to show now: the 12-lead, then the blood pressure. None while a read is waiting (every action is locked until
 * it is given) or once the case has ended. A key whose action is outside the learner's scope in this case is left out;
 * one the engine would refuse now is disabled, with the engine's reason. `scope`: the ids of the learner's actions in
 * this case (interventionsForScenario), when the caller already has them.
 */
export function monitorKeys(sc: Scenario, state: SimState, scope?: ReadonlySet<string>): MonitorKey[] {
  if (state.ended || state.pendingRead) return [];
  const inScope = scope ?? new Set(interventionsForScenario(sc, state.role).map((i) => i.id));
  const keys: MonitorKey[] = [];
  for (const kind of ['ecg', 'bp'] as const) {
    const pick = candidates(kind, state).find((c) => inScope.has(c.id));
    if (!pick) continue;
    const iv = INTERVENTION_BY_ID[pick.id];
    const time = durationText(iv.minutes);
    keys.push({
      kind, id: pick.id, label: pick.label, time,
      name: `${pick.label} key: ${iv.label} — ${time} of case time`,
      disabled: unavailableReason(sc, state, pick.id),
    });
  }
  return keys;
}
