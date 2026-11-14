/**
 * The built-in rhythm rules (rules/rhythm.ts): the rate and AV-nodal drugs, the arrest drugs, lidocaine, procainamide,
 * magnesium, atropine, the shocks, pacing and the transvenous wire, and the cath lab's AV-nodal drugs. For each newer rule:
 * it fires; it does not fire in the nearest correct state; a case rule with its id replaces it; and the gate gives one dose
 * one penalty (the highest-ranked rule that applies, LADDERS).
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS } from '@/lib/sim/scenario/engine';
import { INDICATION_RULES } from '@/lib/sim/scenario/rules/scope';
import { LADDERS, RATE_DRUGS, RHYTHM_RULES } from '@/lib/sim/scenario/rules/rhythm';
import type { Harm, Problem, Scenario, Setting, Vitals } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { fixture, penaltyIds } from './ruleFixture';

const SINUS = { profile: 'normal-sinus', hr: 80 };
const CHB = { profile: 'third-degree-avb', hr: 38 };
const AF = { profile: 'atrial-fibrillation', hr: 150 };
const VT = { profile: 'vt', hr: 170 };
const PREEXCITED = { profile: 'af-wpw', hr: 210 };

interface Patient {
  rhythm?: { profile: string; hr: number };
  vitals?: Partial<Vitals>;
  problems?: Problem[];
  pulse?: boolean;
  harms?: Harm[];
  extra?: Partial<Scenario>;
}
const patient = (setting: Setting, role: LearningLevel) => (p: Patient = {}) => fixture({ setting, role, rhythm: p.rhythm ?? SINUS, ...p });
const field = patient('field', 2);

/** The penalties a run earns, played by the role the fixture is written for */
const pen = (sc: Scenario, steps: string[]) => penaltyIds(sc, sc.roles[0], steps);
const rule = (id: string) => RHYTHM_RULES.find((r) => r.id === id)!;

describe('the gate: one dose, one penalty', () => {
  it('every rule of the file on a laddered action is ranked in that action\'s ladder, and every ladder names real rules', () => {
    for (const [action, ladder] of Object.entries(LADDERS)) {
      for (const r of RHYTHM_RULES.filter((h) => h.actions.includes(action))) expect(ladder, `${action}: ${r.id}`).toContain(r.id);
      for (const id of ladder) expect(RHYTHM_RULES.some((r) => r.id === id), `${action}: ${id}`).toBe(true);
    }
    for (const action of RATE_DRUGS) expect(LADDERS[action]).toBe(LADDERS.metoprolol);
  });

  it('the indication rules come last in every ladder, so a missing order that covers one never hides a contraindication', () => {
    for (const [action, ladder] of Object.entries(LADDERS)) {
      const own = ladder.filter((id) => rule(id).actions.includes(action));
      const first = own.findIndex((id) => INDICATION_RULES.includes(id));
      if (first < 0) continue;
      expect(own.slice(first).every((id) => INDICATION_RULES.includes(id)), action).toBe(true);
    }
  });

  it('every built-in id is still unique', () => {
    const ids = BUILT_IN_HARMS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the older rules, ranked', () => {
  it('pre-excited AF: amiodarone 300 mg with a pulse is the pre-excitation rule\'s, once', () => {
    expect(pen(field({ rhythm: PREEXCITED, vitals: { sbp: 110 } }), ['iv', 'amio-arrest'])).toEqual(['av-blocker-preexcited-af']);
    expect(pen(field(), ['iv', 'amio-arrest'])).toEqual(['arrest-amio-with-pulse']);
    expect(rule('av-blocker-preexcited-af').text).toMatch(/IV amiodarone and beta-blockers — 3: Harm/);
  });

  it('diltiazem in VT with a failing heart: one penalty, the VT rule\'s', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 }, problems: ['heart-failure'] }), ['iv', 'diltiazem'])).toEqual(['diltiazem-vt']);
  });

  it('procainamide: one dose, one penalty — block, then long QT, low pressure, failing heart, a second antiarrhythmic', () => {
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 80, dbp: 50 } }), ['iv', 'procainamide'])).toEqual(['procainamide-slow']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 82, dbp: 50 }, problems: ['heart-failure'] }), ['iv', 'procainamide'])).toEqual(['procainamide-hypotension']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 }, problems: ['heart-failure', 'long-qt'] }), ['iv', 'procainamide'])).toEqual(['procainamide-long-qt']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 130 }, problems: ['heart-failure'] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['procainamide-heart-failure']);
    // and amiodarone after procainamide with a long QT: the QT rule's
    expect(pen(field({ rhythm: VT, vitals: { sbp: 130 }, problems: ['long-qt'] }), ['iv', 'procainamide', 'amio-infusion'])).toEqual(['procainamide-long-qt', 'amiodarone-long-qt']);
  });

  it('the shock and atropine texts', () => {
    expect(rule('shock-with-pulse').text).toMatch(/An unstable tachycardia with a pulse gets synchronized cardioversion; any other rhythm with a pulse needs no shock at all\.$/);
    expect(rule('atropine-fast').text).toMatch(/^Atropine with no slow heart rate to treat\./);
  });
});
