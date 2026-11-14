/**
 * Pulmonary embolism with shock in the emergency department (setting 'ed'): the ER nurse carries out the computer ED
 * physician's orders and watches the lytic; the ER doctor scans, anticoagulates, holds the pressure up, lyses and admits.
 * The case is imported from its own file: it is registered in scenarios/index.ts by the lead.
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edPeLysis as sc } from '@/lib/sim/scenario/scenarios/edPeLysis';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { ROLE_SETTING } from '@/store/useAppStore';
import { monitorVitals, staleEtco2 } from '@/store/useSimStore';
import { readAfter, runScenario } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const rn = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 6, steps, undefined, reads);
const md = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 7, steps, undefined, reads);
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const has = (s: SimState, flag: string) => flag in s.flags;
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const fix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState, label: RegExp) => fix(s).some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => fix(s).find((t) => label.test(t.label))?.kind === 'late';
const done = (s: SimState, label: RegExp) => review(sc, s.ended ? s : stop(s)).wentWell.some((t) => label.test(t.label));
/** Reassess until a condition holds (or the case ends) */
function until(s: SimState, ok: (x: SimState) => boolean, max = 30): SimState {
  for (let i = 0; i < max && !ok(s) && !s.ended; i++) s = perform(sc, s, 'reassess');
  return s;
}

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  6: ['ems-handoff', 'triage', 'monitor', 'o2-nrb', 'notify-physician', 'iv', 'labs', 'ecg12', 'perfusion', 'heparin', 'pressor', 'sample', 'neuro',
    'stop-antithrombotics', 'alteplase', 'reassess', 'reassess', 'notify-physician', ...R(5), 'handoff'],
  7: ['ems-handoff', 'pocus', 'heparin', 'pressor', 'sample', 'alteplase', 'consult-cardiology', 'admit', ...R(5), 'handoff'],
};

/** The nurse's run up to the physician's alteplase order (heparin and norepinephrine given on his orders) */
const RN_TO_LYTIC_ORDER = IDEAL[6].slice(0, IDEAL[6].indexOf('sample'));
/** The doctor's run up to the lytic: scanned, anticoagulated, pressure held, contraindications checked */
const MD_TO_LYTIC = IDEAL[7].slice(0, IDEAL[7].indexOf('alteplase'));

/** The doctor gives three boluses: the right ventricle fails on the second, and she arrests on the third */
const MD_FLUID_ARREST = ['ems-handoff', 'fluid', 'fluid', 'fluid'];
/** …and the arrest worked: compressions, epinephrine, the lytic as a push, compressions until ROSC */
const MD_ARREST_LYSED = [...MD_FLUID_ARREST, 'cpr', 'epinephrine', 'alteplase', 'cpr', 'cpr'];
/** The nurse's three boluses, the arrest worked with the physician's orders, and the norepinephrine he orders after ROSC */
const RN_ARREST = ['ems-handoff', 'monitor', 'iv', 'fluid', 'fluid', 'fluid', 'cpr', 'epinephrine', 'alteplase', 'cpr', 'cpr', 'pressor'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bPEA\b|asystole|pulseless electrical|embol|\bclot|strain|S1Q3|right heart/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis|favour/i;
const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];

/** Every run the tests play, for the checks on voices, spelling and the monitor */
const RUNS: [6 | 7, string[]][] = [
  [6, IDEAL[6]], [7, IDEAL[7]], [7, MD_ARREST_LYSED], [6, RN_ARREST],
  [7, ['ems-handoff', 'rsi']], [7, ['ems-handoff', 'ct-urgent']], [7, ['ems-handoff', 'pocus', 'nitro', 'cpap', 'metoprolol', 'midazolam', ...R(8)]],
  [6, ['ems-handoff', 'monitor', 'iv', 'nitro', 'metoprolol', 'midazolam', 'fentanyl', 'vagal', ...R(4)]],
  // the review's runs: a nurse who does nothing, one who hangs the lytic herself, one who calls for help; a doctor who
  // sedates, scans after the pressure is held, or waits until she arrests
  [6, R(14)], [6, ['ems-handoff', 'triage', 'monitor', 'o2-nrb', 'iv', 'alteplase', ...R(8)]], [6, ['ems-handoff', 'call-help', 'monitor', 'o2-nrb', 'iv', 'labs', 'ecg12', 'neuro', 'sample', ...R(4)]],
  [7, ['ems-handoff', 'pocus', 'pressor', 'procedural-sedation', 'sample', 'neuro', 'cpap', ...R(4)]],
  [7, ['ems-handoff', 'pocus', 'heparin', 'pressor', 'ct-urgent', 'sample', 'tnk', 'consult-cardiology', 'admit', ...R(6), 'handoff']],
  [7, ['ems-handoff', 'pocus', 'heparin', 'pressor', 'sample', ...R(13), 'cpr', 'epinephrine', 'alteplase', 'cpr', 'capno', 'opqrst', 'neuro', 'admit', ...R(6)]],
];

describe('Pulmonary embolism with shock in the ED — the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to what exists', () => {
    expect(sc).toMatchObject({ id: 'pulmonary-embolism-lysis-ed', setting: 'ed', roles: [6, 7] });
    for (const role of sc.roles) expect(ROLE_SETTING[role]).toBe('ed');
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('pulmonary-embolism');
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      expect(h.roles?.every((r) => sc.roles.includes(r)), h.id).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      expect(criticalsFor(sc, role).length, `role ${role}`).toBeGreaterThan(5);
      for (const c of criticalsFor(sc, role)) {
        const actions = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(actions.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // the built-in fibrinolytic rule reads it (a high-risk PE: shock); nothing else she has makes calcium, bicarbonate or blood right
    expect(sc.problems).toEqual(['pulmonary-embolism', 'pe-high-risk']);
  });

  it('keeps the physician\'s decisions and procedures from the ER nurse', () => {
    const nurse = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    for (const id of ['pocus', 'ct-urgent', 'rsi', 'tnk', 'consult-cardiology', 'admit', 'transfer', 'central-line']) expect(nurse.has(id), id).toBe(false);
    // the nurse runs the alteplase, on the physician's order
    expect(nurse.has('alteplase')).toBe(true);
    expect(unavailableReason(sc, start(sc, 6), 'pocus')).toBe('Outside your scope');
  });

  it('nothing the learner sees before the workup names the diagnosis — but the story is there', () => {
    const opening = [sc.title, sc.summary, ...Object.values(sc.briefing).flat().map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/embol|\bclot|\bPE\b|pulmonary|thromb|S1Q3|strain|obstructive|lytic|alteplase|heparin/i);
    expect(opening).toMatch(/fainted at home/);
    expect(opening).toMatch(/52-year-old woman/);
    // the hints that come before the scan say nothing about what it shows
    for (const role of [6, 7] as const) {
      const first = criticalsFor(sc, role).filter((c) => !c.applies).slice(0, role === 6 ? 6 : 1);
      for (const c of first) expect(`${c.label} ${c.why}`, c.id).not.toMatch(/embol|\bclot|lytic|alteplase|heparin|norepinephrine/i);
    }
  });

  it('each role is briefed for its own part, in the department\'s voices', () => {
    expect(start(sc, 6).log.some((l) => /You are her nurse: .*on the physician's orders/.test(l.text))).toBe(true);
    expect(start(sc, 7).log.some((l) => /You are the ED physician: the diagnosis, the orders and the procedures are yours/.test(l.text))).toBe(true);
    for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(line[0]);
    for (const [role, steps] of RUNS) for (const l of runScenario(sc, role, steps).log) expect(NOT_IN_ED, `role ${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
  });

  it('no monitor line names the rhythm or the diagnosis: the learner reads the tracing', () => {
    for (const [role, steps] of RUNS) {
      for (const l of runScenario(sc, role, steps).log) if (l.who === 'monitor') expect(l.text, `role ${role}: ${l.text}`).not.toMatch(GIVEAWAY);
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    expect(sc.teaching.join(' ')).not.toMatch(BRITISH);
    for (const c of [...criticalsFor(sc, 6), ...criticalsFor(sc, 7)]) expect(`${c.label} ${c.why}`).not.toMatch(BRITISH);
    for (const h of sc.harms) expect(h.text).not.toMatch(BRITISH);
    for (const [role, steps] of RUNS) for (const l of runScenario(sc, role, steps).log) expect(l.text).not.toMatch(BRITISH);
  });

  it('teaches the 2026 AHA/ACC categories, the alteplase regimen, the right ventricle\'s support and the arrest', () => {
    const t = sc.teaching.join(' ');
    expect(t).toMatch(/Clinical Category E1/);
    expect(t).toMatch(/class 2a/);
    expect(t).toMatch(/Alteplase 100 mg IV over 2 hours/);
    expect(t).toMatch(/80 units\/kg, then 18 units\/kg\/h/);
    expect(t).toMatch(/norepinephrine first/);
    expect(t).toMatch(/500 mL or less/);
    expect(t).toMatch(/2025 AHA: systemic thrombolysis may be considered/);
  });
});

describe('the ideal runs end by themselves with full marks', () => {
  for (const role of [6, 7] as const) {
    it(`role ${role}`, () => {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      expect(s.log.some((l) => l.text === 'All critical interventions are done — scenario complete.')).toBe(true);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      // she goes to the ICU better than she came: the lytic has unloaded the right ventricle
      expect(has(s, 'lysis-response')).toBe(true);
      expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
      expect(s.vitals.spo2).toBeGreaterThanOrEqual(94);
    });
  }

  it('the 12-lead is read as right heart strain by both roles: the doctor reads the one the nurse records', () => {
    const nurse = rn(readAfter(IDEAL[6], 'ecg12', 'right-strain'), 'manual');
    expect(nurse.reads).toEqual([expect.objectContaining({ answer: 'right-strain', verdict: 'correct' })]);
    expect(review(sc, nurse).percent).toBe(100);
    const doctor = md(readAfter(IDEAL[7], 'pocus', 'right-strain'), 'manual');
    expect(doctor.reads).toEqual([expect.objectContaining({ answer: 'right-strain', verdict: 'correct' })]);
    expect(review(sc, doctor).timings[0]).toMatchObject({ label: 'Door to 12-lead', met: true });
    // a STEMI read costs points, and the explanation says why it is not one
    const wrong = md(readAfter(IDEAL[7], 'pocus', 'stemi-anterior'), 'manual');
    expect(ids(wrong)).toContain('misread-1');
    expect(said(wrong)).toMatch(/No ST elevation that meets STEMI criteria/);
  });
});

describe('the ER nurse', () => {
  it('the physician comes the moment she calls, scans, and gives the orders three minutes later', () => {
    const s = rn(['ems-handoff', 'triage', 'monitor', 'o2-nrb', 'notify-physician', 'iv', 'labs', 'ecg12', 'perfusion']);
    expect(s.flags['md-bedside']).toBe(4);
    expect(s.log.some((l) => l.who === 'physician' && /right ventricle is bigger than the left/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'physician' && /80 units per kilo IV .*5,600 units/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'physician' && /norepinephrine at 0\.05 micrograms per kilo per minute/.test(l.text))).toBe(true);
    // the triage level from the vitals: shock and an SpO₂ under 90
    expect(has(s, 'esi-1')).toBe(true);
  });

  it('a nurse who never calls him: the charge nurse sends him at minute 8, and the call is missed', () => {
    const s = rn(['ems-handoff', 'triage', 'monitor', 'o2-nrb', 'iv', 'labs', 'ecg12', 'reassess']);
    expect(s.flags['md-bedside']).toBeGreaterThanOrEqual(8);
    expect(said(s)).toMatch(/Next time call me the moment a patient like this rolls in/);
    expect(missed(s, /^Get the ED physician to the bedside now/)).toBe(true);
  });

  it('her report says only what she has found or been told', () => {
    const early = rn(['notify-physician']);
    expect(said(early)).not.toMatch(/neck veins|clear lungs|long flight/);
    const assessed = rn(['ems-handoff', 'perfusion', 'lungs', 'notify-physician']);
    expect(said(assessed)).toMatch(/SBAR: .*clear lungs, distended neck veins, a long flight four days ago and a sore calf/);
  });

  it('gives the heparin and the norepinephrine only once the physician has ordered them', () => {
    const own = rn(['ems-handoff', 'monitor', 'iv', 'heparin', 'pressor']);
    expect(ids(own)).toEqual(['rn-without-order-heparin', 'rn-without-order-pressor']);
    const ordered = rn(RN_TO_LYTIC_ORDER);
    expect(ids(ordered)).toEqual([]);
    expect(done(ordered, /^Heparin, as ordered/)).toBe(true);
    expect(done(ordered, /^Norepinephrine, as ordered/)).toBe(true);
    expect(said(ordered)).toMatch(/Heparin 5,600 units IV push \(80 units\/kg\), then the drip at 1,260 units an hour/);
    expect(ordered.vitals.sbp).toBe(100);
  });

  it('a nurse who never starts the norepinephrine: the physician starts it after 3 minutes, and the order is missed', () => {
    const s = rn([...RN_TO_LYTIC_ORDER.slice(0, RN_TO_LYTIC_ORDER.indexOf('pressor')), ...R(2)]);
    expect(said(s)).toMatch(/I'll start the norepinephrine myself/);
    expect(has(s, 'pressor')).toBe(true);
    expect(missed(s, /^Norepinephrine, as ordered/)).toBe(true);
    // a second start on top of his is a titration, not a second drip
    expect(said(perform(sc, s, 'pressor'))).toMatch(/already running: titrated up/);
  });

  it('the alteplase order: the bleeding checklist and a baseline neuro check first, then 100 mg over 2 hours with the heparin paused', () => {
    const order = rn(RN_TO_LYTIC_ORDER);
    expect(order.log.at(-1)!.text).toMatch(/I'm giving her alteplase, 100 milligrams over 2 hours.*bleeding checklist.*baseline neuro check.*pause the heparin drip/);
    // the nurse pauses the heparin drip herself, as ordered (before it is hung, or as it starts)
    const s = rn([...RN_TO_LYTIC_ORDER, 'sample', 'neuro', 'stop-antithrombotics', 'alteplase']);
    expect(ids(s)).toEqual([]);
    expect(said(s)).toMatch(/I didn't hit my head/);
    expect(said(s)).toMatch(/Heparin drip paused at the pump while the alteplase runs/);
    expect(said(s)).toMatch(/Alteplase 100 mg running over 2 hours on a pump; the heparin drip paused while it runs/);
    expect(has(s, 'heparin-paused')).toBe(true);
    expect(done(s, /^The heparin drip paused while the alteplase runs/)).toBe(true);
    const after = rn([...RN_TO_LYTIC_ORDER, 'sample', 'neuro', 'alteplase', 'stop-antithrombotics']);
    expect(done(after, /^The heparin drip paused while the alteplase runs/)).toBe(true);
    // left running: the item is missed, and the alteplase line does not pretend it was paused
    const running = rn([...RN_TO_LYTIC_ORDER, 'sample', 'neuro', 'alteplase']);
    expect(has(running, 'heparin-paused')).toBe(false);
    expect(said(running)).not.toMatch(/heparin drip paused/);
    expect(missed(running, /^The heparin drip paused while the alteplase runs/)).toBe(true);
    // the history taken early counts: the checks only have to come before the drug
    const early = rn(['ems-handoff', 'sample', ...RN_TO_LYTIC_ORDER.slice(1), 'neuro', 'alteplase']);
    expect(done(early, /^Before the alteplase: the bleeding checklist/)).toBe(true);
    // hung without them: the checks can no longer come first
    const blind = rn([...RN_TO_LYTIC_ORDER, 'alteplase', 'sample', 'neuro']);
    expect(missed(blind, /^Before the alteplase: the bleeding checklist/)).toBe(true);
    expect(ids(blind)).toEqual([]);
  });

  it('a nurse who never hangs it: the physician does the checklist and hangs it 6 minutes later, and the order is missed', () => {
    const s = rn([...RN_TO_LYTIC_ORDER, ...R(3)]);
    expect(said(s)).toMatch(/I'll hang the alteplase myself/);
    expect(has(s, 'lytic')).toBe(true);
    expect(s.flags.lytic - s.flags['asked-rn-alteplase']).toBeGreaterThanOrEqual(6);
    expect(missed(s, /^Alteplase 100 mg over 2 hours, as ordered/)).toBe(true);
    // a second lytic on top of the one he hung is a critical error
    expect(ids(perform(sc, s, 'alteplase'))).toContain('second-lytic');
  });

  it('watches her during the infusion and reports the bleeding she finds; the physician keeps the lytic running', () => {
    const lysed = [...RN_TO_LYTIC_ORDER, 'sample', 'neuro', 'alteplase'];
    const s = rn([...lysed, 'reassess', 'reassess']);
    expect(said(s)).toMatch(/Neuro check unchanged: alert, pupils equal, no drift, no headache/);
    expect(s.log.some((l) => /left-arm IV is oozing/.test(l.text))).toBe(true);
    const reported = perform(sc, s, 'notify-physician');
    expect(reported.log.at(-1)!.text).toMatch(/oozing at a line does not stop the alteplase/);
    expect(done(reported, /^Report the bleeding to the physician/)).toBe(true);
    const silent = rn([...lysed, ...R(6)]);
    expect(missed(silent, /^Report the bleeding to the physician/)).toBe(true);
    const unwatched = rn([...lysed, 'notify-physician']);
    expect(missed(unwatched, /^During the infusion: vital signs and a neuro check/)).toBe(true);
  });

  it('the physician decides where she goes; the hand-off waits for the ICU bed', () => {
    const lysed = rn([...RN_TO_LYTIC_ORDER, 'sample', 'neuro', 'alteplase', 'reassess', 'reassess']);
    expect(has(lysed, 'admit')).toBe(true);
    expect(lysed.log.some((l) => l.who === 'physician' && /PE response team and the ICU/.test(l.text))).toBe(true);
    const tooSoon = perform(sc, lysed, 'handoff');
    expect(tooSoon.counts.handoff).toBeUndefined();
    expect(tooSoon.log.at(-1)!.text).toMatch(/The ICU bed is not ready yet/);
    const ready = until(lysed, (x) => has(x, 'icu-ready'));
    expect(ready.minute - ready.flags.admit).toBeGreaterThanOrEqual(10);
    expect(perform(sc, ready, 'handoff').log.some((l) => /SBAR hand-off to the admitting team/.test(l.text))).toBe(true);
  });

  it('nitroglycerin on the chest pain standing order is still a critical error here: one mistake, one penalty', () => {
    const s = rn(['ems-handoff', 'monitor', 'iv', 'nitro']);
    expect(ids(s)).toEqual(['nitro-pe']);
    expect(s.vitals.sbp).toBe(66);
    expect(has(s, 'rv-failing')).toBe(true);
  });

  it('a rate drug, a sedative or adenosine with no order: the clinical harm, which covers the missing order too', () => {
    expect(ids(rn(['ems-handoff', 'iv', 'metoprolol']))).toEqual(['rate-control-pe-rn']);
    expect(ids(rn(['ems-handoff', 'iv', 'midazolam']))).toEqual(['sedation-pe-rn']);
    // adenosine or lidocaine: the nurse's version, at the missing order's weight; a vagal maneuver needs no order
    expect(ids(rn(['ems-handoff', 'iv', 'adenosine6']))).toEqual(['no-arrhythmia-pe-rn']);
    expect(rn(['ems-handoff', 'iv', 'lidocaine']).penalties).toMatchObject([{ id: 'no-arrhythmia-pe-rn', points: 5, severity: 'major', text: expect.stringMatching(/no order/) }]);
    expect(ids(rn(['ems-handoff', 'vagal']))).toEqual(['no-arrhythmia-pe']);
    expect(ids(md(['ems-handoff', 'iv', 'adenosine6']))).toEqual(['no-arrhythmia-pe']);
    // a drug that is not a trap here still needs the order — and with her systolic under 90 the built-in opioid rule charges
    // beside it (the missing order covers an indication rule, not a contraindication)
    expect(ids(rn(['ems-handoff', 'iv', 'fentanyl']))).toEqual(['opioid-hypotension', 'rn-without-order-fentanyl']);
  });

  it('her arrest: CPR and epinephrine on the ACLS protocol, the lytic push on the physician\'s order — and she comes back', () => {
    const s = rn(RN_ARREST);
    expect(has(s, 'arrest')).toBe(true);
    expect(s.pulse).toBe(true);
    expect(has(s, 'rosc')).toBe(true);
    expect(s.log.some((l) => l.who === 'physician' && /alteplase 50 milligrams IV push, now/.test(l.text))).toBe(true);
    expect(said(s)).toMatch(/Alteplase 50 mg IV push, flushed; compressions go on/);
    // only the fluid was her mistake: the push, the epinephrine and the norepinephrine after ROSC were all ordered or on protocol
    expect(ids(s)).toEqual(['fluid-loading-pe']);
    for (const label of [/^She arrests: high-quality CPR at once/, /^Epinephrine 1 mg IV as soon as possible/, /^Alteplase push in the arrest, as ordered/, /^After ROSC: norepinephrine/]) {
      expect(done(s, label), String(label)).toBe(true);
    }
    // the lytic pushed on her own, before the physician has ordered it, is outside her scope
    const alone = rn(['ems-handoff', 'monitor', 'iv', 'fluid', 'fluid', 'fluid', 'alteplase']);
    expect(ids(alone)).toContain('rn-lytic-without-order');
    expect(ids(alone)).not.toContain('rn-without-order-alteplase');
  });

  it('a rate or rhythm drug in her PEA: one penalty — the nurse\'s version also says it had no order; lidocaine and the arrest amiodarone need none', () => {
    const arrested = rn(['ems-handoff', 'monitor', 'iv', 'fluid', 'fluid', 'fluid']);
    expect(arrested.pulse).toBe(false);
    const added = (id: string) => ids(perform(sc, arrested, id)).slice(arrested.penalties.length);
    for (const drug of ['adenosine6', 'metoprolol', 'diltiazem', 'amio-infusion', 'procainamide']) expect(added(drug), drug).toEqual(['antiarrhythmic-pea-rn']);
    for (const drug of ['amio-arrest', 'lidocaine']) expect(added(drug), drug).toEqual(['antiarrhythmic-pea']);
    expect(sc.harms.find((h) => h.id === 'antiarrhythmic-pea-rn')).toMatchObject({ roles: [6], points: 5, severity: 'major', text: expect.stringMatching(/PEA, with no order/) });
  });

  it('in the arrest, another nurse pushes the epinephrine if she does not, and the item is missed', () => {
    const s = rn(['ems-handoff', 'monitor', 'iv', 'fluid', 'fluid', 'fluid', 'cpr', 'cpr', 'cpr']);
    expect(said(s)).toMatch(/Another nurse pushes epinephrine 1 mg IV/);
    expect(missed(s, /^Epinephrine 1 mg IV as soon as possible/)).toBe(true);
  });
});

describe('the ER doctor', () => {
  it('the bedside ultrasound shows the failing right ventricle, the wide IVC and the clot in the leg', () => {
    const s = md(['ems-handoff', 'pocus']);
    expect(said(s)).toMatch(/the right ventricle is bigger than the left and barely moving at its free wall while the apex still squeezes/);
    expect(said(s)).toMatch(/the septum is pushed flat into the left ventricle/);
    expect(said(s)).toMatch(/IVC is 2\.4 cm and does not narrow/);
    expect(said(s)).toMatch(/left femoral vein does not compress/);
    expect(said(s)).toMatch(/No pericardial effusion/);
    // the computer nurse did the nursing and recorded the 12-lead, which the doctor read
    expect(has(s, 'iv') && has(s, 'monitor') && has(s, 'labs') && has(s, 'ecg12')).toBe(true);
    expect(s.reads).toHaveLength(1);
  });

  it('heparin at the dose for a clot in the lungs, before the lytic', () => {
    const s = md(['ems-handoff', 'pocus', 'heparin']);
    expect(said(s)).toMatch(/80 units\/kg IV — 5,600 units — then 18 units\/kg\/h \(1,260 units an hour\)/);
    // the lytic first: the heparin item is missed, and heparin while it runs only adds bleeding
    const after = md(['ems-handoff', 'pocus', 'pressor', 'sample', 'alteplase', 'heparin']);
    expect(missed(after, /^Heparin at once/)).toBe(true);
    expect(ids(after)).toEqual(['heparin-extra']);
    // no anticoagulation at all is the same miss
    expect(missed(md([...MD_TO_LYTIC.filter((x) => x !== 'heparin'), 'alteplase']), /^Heparin at once/)).toBe(true);
  });

  it('norepinephrine holds the pressure; one small bolus is tolerated, the second is a mistake and the third arrests her', () => {
    expect(md(['ems-handoff', 'pocus', 'pressor']).vitals).toMatchObject({ sbp: 100, dbp: 62 });
    const one = md(['ems-handoff', 'fluid']);
    expect(ids(one)).toEqual([]);
    expect(one.vitals.sbp).toBe(86);
    const two = md(['ems-handoff', 'fluid', 'fluid']);
    expect(ids(two)).toEqual(['fluid-loading-pe']);
    expect(has(two, 'rv-failing')).toBe(true);
    const three = md(MD_FLUID_ARREST);
    expect(three.pulse).toBe(false);
    expect(three.rhythm.profile).toBe('pea-narrow');
    expect(ids(three)).toEqual(['fluid-loading-pe']);
  });

  it('delay matters: unsupported, the right ventricle fails at 14 and she arrests 4 minutes later; norepinephrine buys time only until 24', () => {
    const bare = until(md(['ems-handoff', 'pocus', 'heparin']), (x) => !x.pulse);
    expect(bare.flags['rv-failing']).toBeGreaterThanOrEqual(14);
    expect(bare.flags['rv-failing']).toBeLessThan(17);
    expect(bare.flags.arrest - bare.flags['rv-failing']).toBe(4);
    const held = until(md(['ems-handoff', 'pocus', 'heparin', 'pressor']), (x) => !x.pulse);
    expect(held.flags['rv-failing']).toBeGreaterThanOrEqual(24);
    expect(held.flags.arrest - held.flags['rv-failing']).toBe(6);
    expect(missed(held, /^Systemic thrombolysis/)).toBe(true);
    // the lytic in time: no failure, and the pressure, the oxygen and the rate come back 10 minutes later
    const lysed = until(md([...MD_TO_LYTIC, 'alteplase']), (x) => has(x, 'lysis-response'));
    expect(has(lysed, 'rv-failing') || has(lysed, 'arrest')).toBe(false);
    expect(lysed.flags['lysis-response'] - lysed.flags.lytic).toBeGreaterThanOrEqual(10);
    expect(lysed.rhythm.hr).toBe(104);
  });

  it('the lytic is in scope and indicated here: no built-in "no indication" penalty; the consultant agrees and plans the rescue', () => {
    const s = md([...MD_TO_LYTIC, 'alteplase', 'consult-cardiology']);
    expect(ids(s)).toEqual([]);
    expect(s.log.at(-1)!.text).toMatch(/systemic lysis was the right call.*catheter-directed therapy, and ECMO is on standby/);
    const before = md(['ems-handoff', 'pocus', 'consult-cardiology']);
    expect(before.log.at(-1)!.text).toMatch(/give the alteplase now/);
  });

  it('a lytic without asking about the contraindications misses the check', () => {
    const s = md(['ems-handoff', 'pocus', 'heparin', 'pressor', 'alteplase', 'sample']);
    expect(missed(s, /^Screen for contraindications before the lytic/)).toBe(true);
  });

  it('tenecteplase counts as the lytic (off-label for PE in the US); a second lytic is a critical error', () => {
    const s = md([...MD_TO_LYTIC, 'tnk']);
    expect(said(s)).toMatch(/off-label for a pulmonary embolism in the US/);
    expect(done(s, /^Systemic thrombolysis/)).toBe(true);
    expect(ids(perform(sc, s, 'alteplase'))).toEqual(['second-lytic']);
  });

  it('intubating her: without a vasopressor she arrests around the tube; with one the pressure crashes — a critical error either way', () => {
    const bare = md(['ems-handoff', 'rsi']);
    expect(bare.pulse).toBe(false);
    expect(ids(bare)).toEqual(['intubation-pe']);
    const held = md(['ems-handoff', 'pocus', 'pressor', 'rsi']);
    expect(held.pulse).toBe(true);
    expect(held.vitals).toMatchObject({ sbp: 64, dbp: 38, gcs: 3 });
    expect(has(held, 'rv-failing')).toBe(true);
    expect(ids(held)).toEqual(['intubation-pe']);
  });

  it('the scanner in shock: she arrests on the table; once the pressure is held a scan is no mistake, and the lytic still comes in time', () => {
    const shock = md(['ems-handoff', 'ct-urgent']);
    expect(shock.pulse).toBe(false);
    expect(said(shock)).toMatch(/saddle embolus/);
    expect(ids(shock)).toEqual(['ct-in-shock-pe']);
    const held = md(['ems-handoff', 'pocus', 'heparin', 'pressor', 'ct-urgent', 'sample', 'alteplase', 'consult-cardiology', 'admit', ...R(5), 'handoff']);
    expect(said(held)).toMatch(/saddle embolus/);
    expect(held.ended?.reason).toBe('complete');
    expect(review(sc, held).percent).toBe(100);
  });

  it('nitroglycerin, CPAP, rate control, sedation and an opioid in shock are scored; aspirin only once the cause is known', () => {
    const nitro = md(['ems-handoff', 'nitro']);
    expect(ids(nitro)).toEqual(['nitro-pe']);
    expect(nitro.vitals.sbp).toBe(66);
    const cpap = md(['ems-handoff', 'cpap']);
    expect(ids(cpap)).toEqual(['cpap-pe']);
    expect(cpap.vitals.sbp).toBeLessThan(82);
    expect(ids(md(['ems-handoff', 'diltiazem']))).toEqual(['rate-control-pe']);
    expect(ids(md(['ems-handoff', 'procainamide']))).toEqual(['rate-control-pe']);
    expect(ids(md(['ems-handoff', 'midazolam']))).toEqual(['sedation-pe']);
    expect(ids(md(['ems-handoff', 'fentanyl']))).toEqual(['opioid-hypotension']);
    expect(ids(md(['ems-handoff', 'aspirin']))).toEqual([]);
    expect(ids(md(['ems-handoff', 'pocus', 'aspirin']))).toEqual(['aspirin-pe']);
  });

  it('a transfer out of a hospital that has everything she needs is a minor error', () => {
    expect(ids(md([...MD_TO_LYTIC, 'alteplase', 'transfer']))).toEqual(['transfer-pe']);
  });

  it('the arrest: CPR, epinephrine and the lytic as a push bring her back; without the lytic she dies', () => {
    const s = md(MD_ARREST_LYSED);
    expect(s.pulse).toBe(true);
    expect(has(s, 'rosc')).toBe(true);
    expect(said(s)).toMatch(/Alteplase 50 mg IV push/);
    for (const label of [/^She arrests: high-quality CPR at once/, /^Epinephrine 1 mg IV as soon as possible/, /^A lytic in the arrest/]) {
      expect(done(s, label), String(label)).toBe(true);
    }
    // the push is the arrest's item, not the 2-hour infusion (which the early arrest her boluses brought on never let come)
    expect(fix(s).some((t) => /^Systemic thrombolysis/.test(t.label))).toBe(false);
    expect(done(s, /^Systemic thrombolysis/)).toBe(false);
    // a rhythm drug in PEA is a mistake; after ROSC the vasopressor is the item
    expect(ids(md([...MD_FLUID_ARREST, 'amio-arrest']))).toEqual(['fluid-loading-pe', 'antiarrhythmic-pea']);
    expect(missed(until(s, (x) => x.minute > 30, 4), /^After ROSC: norepinephrine/)).toBe(true);
    let dying = md([...MD_FLUID_ARREST, 'cpr', 'epinephrine', 'hs-ts']);
    expect(said(dying)).toMatch(/Thrombosis, coronary or pulmonary: a long flight four days ago/);
    for (let i = 0; i < 12 && !dying.ended; i++) dying = perform(sc, dying, 'cpr');
    expect(dying.ended?.reason).toBe('death');
    expect(dying.minute - dying.flags.arrest).toBeGreaterThanOrEqual(20);
  });

  it('in the arrest the case monitor and the capnography line read the same EtCO₂ (the shared arrest rule)', () => {
    for (const then of [['capno'], ['cpr', 'capno'], ['bvm', 'capno'], ['bvm', 'cpr', 'capno'], ['cpr', 'airway', 'capno']]) {
      let prev: SimState | null = null;
      let stale = false;
      runScenario(sc, 7, [...MD_FLUID_ARREST, ...then], (s) => { stale = staleEtco2(prev, s, stale); prev = s; });
      const s = prev!;
      expect(s.pulse).toBe(false);
      const line = [...s.log].reverse().find((l) => /^EtCO₂ \d+ mmHg/.test(l.text))!.text;
      expect(Number(line.match(/\d+(?= mmHg)/)![0]), then.join(', ')).toBe(monitorVitals(s, stale).etco2);
    }
  });

  it('admits her to the ICU; the hand-off waits for the bed, and late items are scored as late', () => {
    const s = md([...MD_TO_LYTIC, 'alteplase', 'consult-cardiology', 'admit']);
    expect(s.log.at(-1)!.text).toMatch(/ICU accepts her/);
    expect(perform(sc, s, 'handoff').log.at(-1)!.text).toMatch(/The ICU bed is not ready yet/);
    const slow = md(['ems-handoff', ...R(4), 'pocus', 'heparin', 'pressor']);
    expect(late(slow, /^Point-of-care ultrasound/)).toBe(true);
  });
});

describe('the independent review: other orders, slow and wrong moves', () => {
  it('the nurse reads her 12-lead before the physician says what his scan shows (the read is hers to make)', () => {
    // the 12-lead finishes as his scan does: his result waits for her read, then comes with her next step
    const recorded = rn(IDEAL[6].slice(0, IDEAL[6].indexOf('ecg12') + 1), 'manual');
    expect(recorded.pendingRead).not.toBeNull();
    expect(said(recorded)).not.toMatch(/Bedside ultrasound|pulmonary embolism|clot|right heart/);
    const s = rn(IDEAL[6]);
    const read = s.log.findIndex((l) => l.who === 'feedback');
    const scan = s.log.findIndex((l) => l.who === 'physician' && /^Bedside ultrasound/.test(l.text));
    expect(read).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(read);
    // a 12-lead done earlier is read earlier: his scan comes on time
    expect(rn(['ems-handoff', 'notify-physician', 'ecg12', 'monitor', 'o2-nrb', 'iv']).flags['md-scan']).toBe(4.5);
  });

  it('a call for help into the room brings the physician as surely as the SBAR call', () => {
    const s = rn(['ems-handoff', 'triage', 'call-help', 'monitor', 'o2-nrb']);
    expect(has(s, 'md-bedside')).toBe(true);
    expect(said(s)).not.toMatch(/Next time call me/);
    expect(done(s, /^Get the ED physician to the bedside now/)).toBe(true);
  });

  it('heparin or norepinephrine she gave without an order costs points — and the physician does not order or give them twice', () => {
    const s = rn(['ems-handoff', 'monitor', 'iv', 'heparin', 'pressor', 'notify-physician', ...R(3)]);
    expect(ids(s)).toEqual(['rn-without-order-heparin', 'rn-without-order-pressor']);
    expect(has(s, 'asked-rn-heparin') || has(s, 'asked-rn-pressor')).toBe(false);
    expect(said(s)).not.toMatch(/I'll get the heparin in myself|I'll start the norepinephrine myself/);
    // the decision on the lytic is still his, and it comes
    expect(has(s, 'asked-rn-alteplase')).toBe(true);
  });

  it('a lytic the nurse hangs on her own is a critical error; the physician is fetched, says so, and decides on the rest after his scan', () => {
    const s = rn(['ems-handoff', 'triage', 'monitor', 'o2-nrb', 'iv', 'alteplase', ...R(3)]);
    expect(ids(s)).toEqual(['rn-lytic-without-order']);
    expect(said(s)).toMatch(/Nobody has ordered that — I'm getting the physician in here now/);
    expect(said(s)).toMatch(/A fibrinolytic is my decision/);
    expect(said(s)).not.toMatch(/Keep going with what you're doing/);
    // he admits her only once he has scanned her, and says only what is running
    expect(s.flags.dispo).toBeGreaterThanOrEqual(s.flags['md-scan']);
    expect(s.log.find((l) => /goes up/.test(l.text))!.text).toMatch(/she goes up on the alteplase\./);
    // on his order it is no mistake at all (the order of the checks is scored by its own item)
    expect(ids(rn([...RN_TO_LYTIC_ORDER, 'alteplase']))).toEqual([]);
  });

  it('a bolus after the physician has said no fluid costs points, and he says so; one before his word does not', () => {
    const after = rn([...IDEAL[6].slice(0, IDEAL[6].indexOf('perfusion') + 1), 'fluid']);
    expect(ids(after)).toEqual(['fluid-against-order']);
    expect(after.log.at(-1)!.text).toMatch(/I said no fluid for her/);
    const before = rn(['ems-handoff', 'monitor', 'iv', 'fluid']);
    expect(ids(before)).toEqual([]);
    expect(said(before)).not.toMatch(/I said no fluid/);
  });

  it('the doctor: one bolus before the scan is a fair try; after the scan shows the IVC full it is a minor error', () => {
    expect(ids(md(['ems-handoff', 'fluid']))).toEqual([]);
    expect(ids(md(['ems-handoff', 'pocus', 'fluid']))).toEqual(['fluid-full-ivc']);
    // the second bolus is the major one, whenever it comes
    expect(ids(md(['ems-handoff', 'fluid', 'pocus', 'fluid']))).toEqual(['fluid-loading-pe']);
  });

  it('an arrest closes the open infusion orders: nobody hangs a 2-hour drip during CPR — the lytic comes as the arrest\'s push', () => {
    let s = rn(R(10));
    s = until(s, (x) => !x.pulse);
    expect(has(s, 'asked-rn-alteplase')).toBe(true);
    s = until(s, (x) => has(x, 'lytic'), 5);
    expect(said(s)).not.toMatch(/I'll hang the alteplase myself/);
    expect(said(s)).toMatch(/alteplase 50 milligrams IV push, now/);
    expect(said(s)).toMatch(/I'll push the alteplase myself/);
    expect(missed(s, /^Alteplase 100 mg over 2 hours, as ordered/)).toBe(true);
    // the physician running the code does not name the rhythm for her
    expect(said(rn(RN_ARREST))).not.toMatch(/shockable|\bPEA\b|asystole/i);
  });

  it('in the arrest (or on the ventilator) her husband gives the history, not the patient', () => {
    const arrest = md([...MD_FLUID_ARREST, 'sample']);
    expect(arrest.log.at(-1)).toMatchObject({ who: 'team', text: expect.stringMatching(/^Her husband, at the door: ".*didn't hit her head/) });
    expect(arrest.log.some((l) => l.who === 'patient' && /estrogen/.test(l.text))).toBe(false);
    const tubed = md(['ems-handoff', 'pocus', 'pressor', 'rsi', 'opqrst']);
    expect(tubed.log.at(-1)!.text).toMatch(/^Her husband, at the door/);
    expect(md(['ems-handoff', 'sample']).log.at(-1)).toMatchObject({ who: 'patient' });
  });

  it('the lytic pushed in the arrest is the arrest\'s item: no contraindication screen asked for it, and no infusion credit', () => {
    const early = md(MD_ARREST_LYSED);
    expect(fix(early).some((t) => /^Screen for contraindications/.test(t.label))).toBe(false);
    expect(done(early, /^A lytic in the arrest/)).toBe(true);
    // an arrest from waiting (no lytic in time) leaves the infusion item missed: the wait is the mistake
    let late = until(md(['ems-handoff', 'pocus', 'heparin', 'pressor', 'sample']), (x) => !x.pulse);
    late = perform(sc, perform(sc, perform(sc, late, 'cpr'), 'epinephrine'), 'alteplase');
    expect(missed(late, /^Systemic thrombolysis/)).toBe(true);
    expect(done(late, /^A lytic in the arrest/)).toBe(true);
  });

  it('heparin follows an arrest push or a tenecteplase bolus without penalty; during the alteplase infusion it is a minor error', () => {
    const pushed = md([...MD_ARREST_LYSED, 'heparin']);
    expect(ids(pushed)).toEqual(['fluid-loading-pe']);
    expect(said(pushed)).not.toMatch(/with the alteplase running/);
    // the anticoagulation that follows the push counts (here still inside the goal), not missed
    expect(done(pushed, /^Heparin at once/)).toBe(true);
    expect(ids(md(['ems-handoff', 'pocus', 'pressor', 'sample', 'tnk', 'heparin']))).toEqual([]);
    expect(ids(md(['ems-handoff', 'pocus', 'pressor', 'sample', 'alteplase', 'heparin']))).toEqual(['heparin-extra']);
  });

  it('a lytic before any imaging is a major error (a dissection or tamponade is not ruled out); after CT it is not', () => {
    expect(ids(md(['ems-handoff', 'sample', 'alteplase']))).toEqual(['lytic-before-imaging']);
    expect(ids(md(['ems-handoff', 'pressor', 'ct-urgent', 'sample', 'alteplase']))).toEqual([]);
    // in the arrest the bar is lower: no penalty for a push without a scan
    expect(ids(md(MD_ARREST_LYSED))).toEqual(['fluid-loading-pe']);
  });

  it('deep sedation is scored like midazolam, and drops her pressure and her breathing', () => {
    const s = md(['ems-handoff', 'pocus', 'pressor', 'procedural-sedation']);
    expect(ids(s)).toEqual(['sedation-pe']);
    expect(s.vitals.sbp).toBeLessThan(100);
    expect(s.vitals.gcs).toBeLessThanOrEqual(9);
  });

  it('CPAP with a low pressure is a major error; once norepinephrine holds the pressure, a minor one', () => {
    expect(ids(md(['ems-handoff', 'cpap']))).toEqual(['cpap-pe']);
    const held = md(['ems-handoff', 'pocus', 'pressor', 'cpap']);
    expect(ids(held)).toEqual(['cpap-pe-held']);
    expect(held.vitals.sbp).toBeLessThan(100);
  });

  it('a pericardiocentesis finds no fluid (a dry tap, and the built-in critical error); the Hs and Ts list the facts and conclude only after a scan', () => {
    const tap = md(['ems-handoff', 'pocus', 'pericardiocentesis']);
    expect(tap.log.at(-1)!.text).toMatch(/a dry tap/);
    expect(ids(tap)).toEqual(['pericardiocentesis-no-tamponade']);
    expect(said(rn(['ems-handoff', 'hs-ts']))).not.toMatch(/likeliest cause|clot in the lungs/);
    expect(said(md(['ems-handoff', 'pocus', 'hs-ts']))).toMatch(/a clot in the lungs is the likeliest cause/);
  });

  it('the lysis lowers the dead space: the EtCO₂ comes up with the pressure and the oxygen', () => {
    const s = until(md([...MD_TO_LYTIC, 'alteplase']), (x) => has(x, 'lysis-response'));
    expect(s.vitals.etco2).toBeGreaterThan(sc.initial.vitals.etco2);
    expect(perform(sc, s, 'capno').log.at(-1)!.text).toMatch(/^EtCO₂ 32 mmHg/);
  });
});
