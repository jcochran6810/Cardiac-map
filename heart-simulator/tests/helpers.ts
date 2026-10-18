import { expect } from 'vitest';
import type { Vec3 } from '@/lib/ecg/vector';
import { answerRead, perform, start, unavailableReason } from '@/lib/sim/scenario/engine';
import type { Scenario, SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** Component-wise equality within floating-point noise */
export function expectVec(actual: Vec3, expected: Vec3, digits = 9) {
  actual.forEach((x, i) => expect(x).toBeCloseTo(expected[i], digits));
}

// ─── Scenario simulator ────────────────────────────────────────────────────

/** Reassess until the ambulance arrives at the hospital */
export const UNTIL_ARRIVED = 'until-arrived';

/**
 * Play a list of interventions; fail loudly if one is not available. 12-lead reads are answered
 * correctly unless `reads` is 'manual' — then a step `read:<option id>` gives the read.
 */
export function runScenario(
  sc: Scenario, role: LearningLevel, steps: string[], onStep?: (s: SimState) => void, reads: 'correct' | 'manual' = 'correct',
): SimState {
  let s = start(sc, role);
  // a case can open with something to read (e.g. a complication already under way)
  while (s.pendingRead && reads === 'correct') s = answerRead(sc, s, s.pendingRead.answer);
  const act = (id: string) => {
    if (id.startsWith('read:')) {
      s = answerRead(sc, s, id.slice(5));
      onStep?.(s);
      return;
    }
    const why = unavailableReason(sc, s, id);
    if (why) throw new Error(`${id} unavailable at ${s.minute} min: ${why}`);
    s = perform(sc, s, id);
    onStep?.(s);
    while (s.pendingRead && reads === 'correct') {
      s = answerRead(sc, s, s.pendingRead.answer);
      onStep?.(s);
    }
  };
  for (const id of steps) {
    if (id !== UNTIL_ARRIVED) act(id);
    else for (let i = 0; i < 30 && !('arrived' in s.flags) && !s.ended; i++) act('reassess');
  }
  return s;
}
