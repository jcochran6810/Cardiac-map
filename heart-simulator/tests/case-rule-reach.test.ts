/**
 * No case rule is dead: every case rule that steps aside for a heavier built-in rule (rules/rhythm.ts yieldToHeavier) still
 * charges in at least one state its case reaches. A rule that always yields teaches nothing in its own words: raise it to
 * the built-in's weight, or delete it (lead decision 6).
 *
 * The search, deterministic: for each such rule and each role it is written for, the case's ideal run, and after every
 * step of it each of the rule's actions (once, and twice); then the witnesses below, for rules only a detour reaches.
 */
import { describe, expect, it } from 'vitest';
import { answerRead, perform, start, unavailableReason } from '@/lib/sim/scenario/engine';
import { yieldsToHeavier } from '@/lib/sim/scenario/rules/rhythm';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import type { Harm, Scenario, SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED } from './helpers';
import { IDEAL } from './idealRuns';

/**
 * Rules only a detour from the ideal run reaches: `${case}|${rule}` → [role, steps], played as written (each read answered
 * as the step 'read:<option>' says). Found by the diff harness's random sweep; replace one that stops charging with another
 */
const WITNESSES: Record<string, [LearningLevel, string[]]> = {
  'af-rvr-field|antiarrhythmic-unstable': [2, ['iv', 'albuterol-hyperk', 'sedation', 'amio-arrest', 'procainamide']],
  'aortic-dissection-field|rate-drug-low': [2, ['iv', 'restrain', 'airway', 'opqrst', 'sodium-bicarbonate', 'sedation', 'cardiovert', 'sodium-bicarbonate', 'poison-control', 'diphenhydramine', 'magnesium-sulfate', 'poison-control', 'pressor', 'bp-both-arms', 'notify', 'lungs', 'atropine', 'monitor', 'legs-up', 'calm', 'ecg12', 'read:nsr', 'smr', 'metoprolol']],
  'beta-blocker-overdose-field|antiarrhythmic-pea': [2, ['iv', 'handoff', 'nitro-high', 'airway', 'oral-glucose', 'vitals', 'amio-infusion', 'sodium-bicarbonate', 'diphenhydramine', 'amio-arrest']],
  'commotio-cordis-field|antiarrhythmic-not-yet': [2, ['iv', 'lidocaine']],
  'commotio-cordis-field|epi-not-yet': [2, ['iv', 'epinephrine']],
  'commotio-cordis-field|rate-drug-arrest': [2, ['iv', 'adenosine12']],
  'heart-block-temp-wire-cathlab|wire-without-pads': [5, ['read:chb', 'consent', 'timeout', 'access-venous', 'temp-wire']],
  'hyperkalemia-dialysis-field|atropine-arrest': [2, ['iv', 'cpap', 'vagal', 'cool', 'nitro', 'handoff', 'legs-up', 'sedation', 'diltiazem', 'call-help', 'opqrst', 'ondansetron', 'albuterol-hyperk', 'adenosine6', 'pace', 'atropine']],
  'pulmonary-embolism-field|antiarrhythmic-pea': [2, ['amio-infusion', 'notify', 'nitro', 'io', 'call-help', 'reassess', 'med-control', 'cpap', 'airway', 'sodium-bicarbonate', 'diltiazem']],
  'pulmonary-embolism-lysis-ed|antiarrhythmic-pea': [7, ['iv', 'inotrope', 'read:nsr', 'rsi', 'lvad-check', 'reassess', 'amio-arrest']],
  'pulmonary-embolism-lysis-ed|antiarrhythmic-pea-rn': [6, ['iv', 'call-vad', 'diltiazem', 'adenosine12', 'lvad-check', 'diphenhydramine', 'neuro', 'nitro', 'io', 'cxr', 'lvad-check', 'ecg-posterior', 'adenosine12']],
  'scad-cathlab|beta-blocker-shock-risk': [5, ['consent', 'heparin', 'timeout', 'access', 'cath-jl4', 'reposition', 'angio', 'read:angio-scad', 'view-rca-cranial', 'tnk', 'ic-nitro', 'view-lao-cranial', 'dextrose', 'stop-antithrombotics', 'metoprolol']],
  'stable-vt-field|adenosine-unstable': [2, ['iv', 'diltiazem', 'adenosine6']],
  'stable-vt-field|drug-while-unstable': [2, ['iv', 'diltiazem', 'adenosine6', 'lidocaine']],
  'tamponade-ed|antiarrhythmic-pea': [7, ['ecg12-repeat', 'cpap', 'nitro-iv', 'legs-up', 'diltiazem']],
  'torsades-field|delay-shock': [2, ['pace', 'io', 'restrain', 'amio-arrest', 'magnesium-sulfate']],
  'vf-arrest-ed|antiarrhythmic-before-shock': [6, ['iv', 'lidocaine']],
  'wpw-af-field|delay-shock': [2, ['iv', 'amio-arrest', 'bvm', 'diphenhydramine', 'ecg-posterior', 'defib', 'airway']],
  'wpw-af-field|drug-while-unstable': [2, ['io', 'nitro-high', 'albuterol-hyperk', 'cpr', 'ondansetron', 'o2-nc', 'procainamide']],
};

/** Every available step played (an unavailable one skipped), each read answered correctly; the state after each step */
function play(sc: Scenario, role: LearningLevel, steps: string[], from?: SimState): SimState[] {
  let s = from ?? start(sc, role);
  const settle = () => { while (s.pendingRead && !s.ended) s = answerRead(sc, s, s.pendingRead.answer); };
  settle();
  const states = [s];
  const act = (id: string) => {
    if (s.ended || unavailableReason(sc, s, id)) return;
    s = perform(sc, s, id);
    settle();
    states.push(s);
  };
  for (const id of steps) {
    if (id !== UNTIL_ARRIVED) act(id);
    else for (let i = 0; i < 30 && !('arrived' in s.flags) && !s.ended; i++) act('reassess');
  }
  return states;
}

const chargedBy = (before: SimState, after: SimState, id: string) => after.penalties.slice(before.penalties.length).some((p) => p.id === id);

function reached(sc: Scenario, h: Harm): boolean {
  const roles = sc.roles.filter((r) => !h.roles || h.roles.includes(r));
  for (const role of roles) {
    const states = play(sc, role, IDEAL[sc.id]?.[role] ?? []);
    for (const s of states) {
      for (const a of h.actions) {
        if (s.ended || unavailableReason(sc, s, a)) continue;
        const once = perform(sc, s, a);
        if (chargedBy(s, once, h.id)) return true;
        if (!once.ended && !unavailableReason(sc, once, a) && chargedBy(once, perform(sc, once, a), h.id)) return true;
      }
    }
  }
  const w = WITNESSES[`${sc.id}|${h.id}`];
  return !!w && replay(sc, w[0], w[1], h.id);
}

/** A witness, played as written: true if the rule charged on one of its steps */
function replay(sc: Scenario, role: LearningLevel, steps: string[], ruleId: string): boolean {
  let s = start(sc, role);
  for (const id of steps) {
    const before = s;
    if (id.startsWith('read:')) s = answerRead(sc, s, id.slice(5));
    else if (!s.ended && !unavailableReason(sc, s, id)) s = perform(sc, s, id);
    if (chargedBy(before, s, ruleId)) return true;
  }
  return false;
}

describe('every case rule that steps aside for a heavier rule still charges somewhere', () => {
  for (const sc of SCENARIOS) {
    const yielding = sc.harms.filter((h) => yieldsToHeavier(h));
    if (!yielding.length) continue;
    it(sc.id, () => {
      const dead = yielding.filter((h) => !reached(sc, h)).map((h) => `${sc.id}|${h.id}`);
      expect(dead).toEqual([]);
    });
  }
});
