/**
 * A bare patient for testing the built-in safety rules (rules/*.ts) and the engine's rule semantics: no events, no
 * critical items and no case rules unless given, so every penalty comes from the rule under test. It never ends by
 * itself (completeWhen is false): a run ends when the steps run out, or with a hand-off.
 *
 *   const sc = fixture({ setting: 'ed', role: 6, rhythm: { profile: 'normal-sinus', hr: 80 }, vitals: { sbp: 84 } });
 *   expect(penaltyIds(sc, 6, ['iv', 'nitro'])).toEqual(['nitro-hypotension']);
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { Harm, Problem, Scenario, Setting, Vitals } from '@/lib/sim/scenario/types';
import { runScenario } from './helpers';

/** A calm adult: what a fixture has unless the test says otherwise */
export const FIXTURE_VITALS: Vitals = { sbp: 128, dbp: 78, spo2: 97, rr: 16, etco2: 36, pain: 0, gcs: 15, glucose: 110, temp: 36.8 };

export interface FixtureSpec {
  setting: Setting;
  /** the role the case is written for (the test plays it) */
  role: LearningLevel;
  rhythm: { profile: string; hr: number };
  vitals?: Partial<Vitals>;
  /** false: the case opens in cardiac arrest */
  pulse?: boolean;
  problems?: Problem[];
  /** a continuous-flow LVAD (give `vitals` a narrow pulse pressure around the MAP) */
  lvad?: boolean;
  harms?: Harm[];
  /** anything else a test needs from the case: events, respond, facts, arrival, critical items… */
  extra?: Partial<Scenario>;
}

export function fixture(spec: FixtureSpec): Scenario {
  const { setting, role, rhythm, vitals = {}, pulse, problems, lvad, harms = [], extra = {} } = spec;
  return {
    id: 'rule-fixture', title: 'Rule fixture', summary: 'A bare patient for the safety-rule tests.', setting, roles: [role], difficulty: 'beginner',
    briefing: { default: [['team', 'A test patient.']] },
    initial: {
      rhythm: { ...rhythm }, vitals: { ...FIXTURE_VITALS, ...vitals },
      ...(pulse === false ? { pulse: false } : {}), ...(lvad ? { lvad: true } : {}),
    },
    ...(problems ? { problems } : {}),
    facts: {}, respond: {}, events: [], critical: [], harms, teaching: [],
    completeWhen: () => false,
    ...extra,
  };
}

/** The ids of the penalties a run of these steps earns (runScenario: every step must be available) */
export function penaltyIds(sc: Scenario, role: LearningLevel, steps: string[]): string[] {
  return runScenario(sc, role, steps).penalties.map((p) => p.id);
}
