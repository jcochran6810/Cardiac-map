/**
 * Hypertensive acute pulmonary edema in the emergency department ('scape-ed'), played as the ER nurse (6) and the ER doctor
 * (7): the ideal runs, the department's timings, each trap (taking him off positive pressure, the crew's cylinder running
 * out, a fluid bolus, laying him flat, an opioid, low-dose nitroglycerin only, intubating before a trial of BiPAP and
 * high-dose nitrates, drugs without an order, a beta-blocker, a pressor, the cath lab for strain) and the responders behind
 * them (the department's BiPAP, the high dose and its infusion, the turnaround, the pressure falling as the surge breaks,
 * the physician's orders and fallbacks, the computer nurse, tiring, failing, the tube, the arrest and ROSC). The last block
 * holds the independent review's regressions: the order timed from the mask swap, the BiPAP's end-expiratory pressure, a
 * tube once he is drowsy, procedural sedation on the mask, the drowsy report, epinephrine in the arrest, findings that
 * agree with each other and with the tracing, the history once he cannot talk, and the evidence as cited.
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile, stLevel } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, answerRead, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edScape as sc } from '@/lib/sim/scenario/scenarios/edScape';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { monitorVitals, staleEtco2 } from '@/store/useSimStore';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState, who: Speaker) => s.log.filter((l) => l.who === who).map((l) => l.text);
const toFix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState) => toFix(s).filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => toFix(s).filter((t) => t.kind === 'late').map((t) => t.label);
const rn = (steps: string[]) => run(sc, 6, steps);
const md = (steps: string[]) => run(sc, 7, steps);

/** A correct run for each role (the lead copies these into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  // the ER nurse: the crew's report, onto the department's BiPAP without a gap, the physician to the bedside, the monitor and
  // a pressure, the ordered 0.8 mg, a line (the infusion follows), a pressure after the dose, the 12-lead, labs, his mental
  // status; the pressure falls as the surge breaks — reported at once — and the hand-off once the ICU has accepted him
  6: ['ems-handoff', 'cpap', 'notify-physician', 'monitor', 'nibp', 'nitro-high', 'iv', 'nibp', 'ecg12', 'labs', 'neuro', 'reassess',
    'notify-physician', 'reassess', 'handoff'],
  // the ER doctor: the crew's report, BiPAP without a gap, the lungs, high-dose nitroglycerin with the infusion to follow
  // (the nurse's 12-lead is read on the way), the trigger, the ultrasound, a reassessment, the ICU and the hand-off
  7: ['ems-handoff', 'cpap', 'lungs', 'nitro-high', 'sample', 'pocus', 'reassess', 'admit', 'handoff'],
};
const ROLES = [6, 7] as const;

/** The ER doctor who leaves him on the crew's CPAP and does nothing: the cylinder runs out, he tires, then fails */
const MD_TO_FAILING = R(7);
/** …and nobody breathes for him: his heart slows, then stops */
const MD_TO_ARREST = R(11);

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|edema|\bPEA\b|asystole|hypox|SCAPE|heart failure|hypertroph|strain/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|titratis|favour/i;

function expectFullMarks(s: SimState) {
  expect(s.ended?.reason).toBe('complete');
  expect(s.pulse).toBe(true);
  const r = review(sc, s);
  expect(r.toFix).toEqual([]);
  expect(r.penaltyPoints).toBe(0);
  expect(r.percent).toBe(100);
  expect(r.grade).toBe('Excellent');
  expect(r.outcome).toMatch(/^Every critical intervention done in \d+:\d\d\.$/);
  for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
}

describe('SCAPE in the ED: the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to things that exist', () => {
    expect(sc).toMatchObject({ id: 'scape-ed', setting: 'ed', roles: [6, 7] });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('hfpef');
    // fluid on the lungs (the built-in rules charge a bolus and raised legs) — not 'heart-failure': his heart squeezes normally
    expect(sc.problems).toEqual(['pulmonary-edema']);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of ROLES) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      expect(criticalsFor(sc, role).length).toBeGreaterThan(5);
      for (const c of criticalsFor(sc, role)) {
        const used = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of used) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(used.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // every harm a role can be scored for is one it can commit
      for (const h of sc.harms.filter((x) => !x.roles || x.roles.includes(role))) {
        expect(h.actions.some((id) => scope.has(id)), `role ${role}: harm ${h.id}`).toBe(true);
      }
    }
  });

  it('keeps each role in its scope: the nurse never intubates, scans, admits or activates; the doctor does not triage', () => {
    const nurse = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    const doctor = new Set(interventionsFor(7, 'ed').map((i) => i.id));
    for (const id of ['rsi', 'airway', 'pocus', 'admit', 'transfer', 'cath-lab-activate', 'tnk', 'ct-urgent', 'procedural-sedation']) expect(nurse.has(id), id).toBe(false);
    for (const id of ['triage', 'notify-physician']) expect(doctor.has(id), id).toBe(false);
    expect(IDEAL[6].every((id) => nurse.has(id))).toBe(true);
    expect(IDEAL[7].every((id) => doctor.has(id))).toBe(true);
  });

  it('nothing the learner sees before treating him names what he has', () => {
    const opening = [sc.title, sc.summary, ...Object.values(sc.briefing).flat().map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/edema|SCAPE|heart failure|hypertensive|crashing/i);
    // the clues are there for whoever looks: bolt upright, on CPAP, a pressure over 200, tiring
    expect(opening).toMatch(/bolt upright/);
    expect(opening).toMatch(/over 200/);
  });

  it('speaks with the department\'s voices: the physician in the nurse\'s run, the nurse in the doctor\'s, never the lab or the field', () => {
    const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
    for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(line[0]);
    const nurse = rn(IDEAL[6]);
    const doctor = md(IDEAL[7]);
    for (const s of [nurse, doctor]) for (const l of s.log) expect(NOT_IN_ED, `${l.who}: ${l.text}`).not.toContain(l.who);
    expect(said(nurse, 'nurse')).toEqual([]);
    expect(said(doctor, 'physician')).toEqual([]);
    expect(said(nurse, 'physician').length).toBeGreaterThan(2);
    expect(said(doctor, 'nurse').length).toBeGreaterThan(2);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const t of [...sc.teaching, ...sc.critical.map((c) => `${c.label} ${c.why}`), ...sc.harms.map((h) => h.text)]) expect(t).not.toMatch(BRITISH);
    const runs: [6 | 7, string[]][] = [[6, IDEAL[6]], [7, IDEAL[7]], [7, MD_TO_ARREST], [6, ['o2-nrb', 'midazolam', ...R(2), 'midazolam', ...R(2), 'bvm', 'reassess']]];
    for (const [role, steps] of runs) for (const l of run(sc, role, steps).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('SCAPE in the ED: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      // on the department's machine, the high dose and its infusion, turned around, admitted to the ICU
      for (const f of ['niv-since', 'niv-own', 'nitro-high', 'drip', 'better', 'admit', 'dispo', 'handoff']) expect(s.flags[f], f).toBeDefined();
      expect(s.vitals.spo2).toBe(96);
      expect(s.reads.map((r) => r.answer)).toEqual(['lvh']);
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      expect(s.log.some((l) => l.text === 'SBAR hand-off to the admitting team; they take over.')).toBe(true);
      // never off positive pressure, no tube, no opioid, no fluid
      for (const f of ['off-niv', 'tiring', 'airway', 'opioid', 'fluid']) expect(s.flags[f], f).toBeUndefined();
    });
  }

  it('times the department: BiPAP at once, the high dose within 6 minutes, the 12-lead within 10', () => {
    for (const role of ROLES) {
      const t = Object.fromEntries(review(sc, run(sc, role, IDEAL[role])).timings.map((x) => [x.label, x]));
      expect(t['Door to 12-lead'].minute, `role ${role}`).toBeLessThanOrEqual(7);
      expect(t['On the department\'s BiPAP, without a gap'].minute).toBe(1);
      expect(t['First high-dose nitroglycerin'].minute).toBeLessThanOrEqual(4);
      expect(t['Breathing easier (SpO₂ in the mid-90s, full sentences)'].minute).toBeLessThanOrEqual(7);
    }
  });

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: [6 | 7, string[]][] = [[6, IDEAL[6]], [7, IDEAL[7]], [7, [...MD_TO_ARREST, 'bvm', 'cpr', 'cpr']], [6, [...IDEAL[6].slice(0, 12), ...R(3)]]];
    for (const [role, steps] of runs) {
      const s = run(sc, role, steps, (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(GIVEAWAY);
    }
  });

  it('the 12-lead is LVH with strain, read by both roles — no ST elevation, and the explanation says why there is no cath lab', () => {
    const s = run(sc, 7, IDEAL[7].slice(0, 4), undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'ecg', answer: 'lvh' });
    expect(s.pendingRead!.explain).toMatch(/no ST elevation[^.]*\. The strain is a thick, pressure-loaded ventricle, not an occluded artery: no cath lab/);
    expect(s.flags['ecg-stemi']).toBeUndefined();
  });
});

describe('SCAPE in the ED: both roles', () => {
  it('an oxygen mask instead of the crew\'s CPAP: off positive pressure, the saturation falls, the crew takes their CPAP — BiPAP brings him back', () => {
    for (const role of ROLES) {
      for (const mask of ['o2-nrb', 'o2-nc']) {
        const s = run(sc, role, [mask]);
        expect(ids(s), `${role} ${mask}`).toEqual(['niv-off']);
        expect(s.flags['off-niv']).toBeDefined();
        expect(s.flags['on-niv']).toBeUndefined();
        expect(s.vitals.spo2).toBe(80);
        expect(said(s, 'ems').at(-1)).toMatch(/take our CPAP back to the truck/);
        const back = run(sc, role, [mask, 'cpap']);
        expect(back.flags['on-niv']).toBeDefined();
        expect(back.flags['off-niv']).toBeUndefined();
        expect(back.vitals.spo2).toBe(86);
      }
    }
  });

  it('an oxygen mask instead of the department\'s BiPAP: penalized, and respiratory therapy puts the mask straight back', () => {
    for (const role of ROLES) {
      const s = run(sc, role, ['cpap', 'o2-nrb']);
      expect(ids(s)).toEqual(['niv-off']);
      expect(s.flags['on-niv']).toBeDefined();
      expect(s.log.some((l) => l.who === 'team' && /straight back on/.test(l.text))).toBe(true);
      // off positive pressure already (the crew took their CPAP), an oxygen mask is no mistake — just not enough
      expect(ids(run(sc, role, ['o2-nrb', 'o2-nc']))).toEqual(['niv-off']);
    }
  });

  it('the crew\'s cylinder runs out if he is not switched to the department\'s machine: a warning at 3 minutes, off at 5', () => {
    for (const role of ROLES) {
      const s = run(sc, role, ['ems-handoff', 'lungs', ...R(2)]);
      expect(s.fired).toEqual(expect.arrayContaining(['ems-tank', 'ems-off']));
      expect(s.flags['off-niv']).toBeDefined();
      expect(said(s, 'ems').some((t) => /cylinder is empty/.test(t))).toBe(true);
      // switched in time, it never runs out
      expect(run(sc, role, ['ems-handoff', 'cpap', ...R(3)]).fired).not.toContain('ems-off');
    }
  });

  it('a fluid bolus and laying him flat are scored by the built-in rules, and make him worse', () => {
    for (const role of ROLES) {
      const before = run(sc, role, ['cpap', 'iv']);
      const fluid = run(sc, role, ['cpap', 'iv', 'fluid']);
      expect(ids(fluid)).toEqual(['fluid-pulmonary-edema']);
      expect(fluid.vitals.spo2).toBeLessThan(before.vitals.spo2);
      const flat = run(sc, role, ['cpap', 'legs-up']);
      expect(ids(flat)).toEqual(['legs-up-pulmonary-edema']);
      expect(flat.log.some((l) => /claws his way back up to sitting/.test(l.text))).toBe(true);
      expect(run(sc, role, ['cpap', 'legs-up', 'lungs']).log.at(-1)!.text).toMatch(/louder than before/);
    }
  });

  it('a pressor, IM epinephrine and albuterol raise a pressure and a rate that are already too high', () => {
    const doc = md(['cpap', 'iv', 'pressor']);
    expect(ids(doc)).toEqual(['pressor-hypertensive']);
    expect(doc.vitals.sbp).toBeGreaterThan(md(['cpap', 'iv']).vitals.sbp);
    // one penalty for the nurse: the drug is wrong for him, and it was never ordered
    expect(ids(rn(['cpap', 'iv', 'pressor']))).toEqual(['rn-pressor-hypertensive']);
    expect(ids(rn(['cpap', 'iv', 'push-epi']))).toEqual(['rn-pressor-hypertensive']);
    expect(ids(md(['cpap', 'epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
    expect(ids(md(['cpap', 'albuterol']))).toEqual(['albuterol-crackles']);
  });

  it('BiPAP on a patient who can no longer protect his airway is a mistake, and does not count as the move onto the mask', () => {
    const s = md([...MD_TO_FAILING, 'cpap']);
    expect(s.fired).toContain('failing');
    expect(ids(s)).toEqual(['niv-unprotected']);
    expect(s.flags['niv-own']).toBeUndefined();
    expect(missed(s)).toContain('Non-invasive ventilation without a gap: the department\'s BiPAP straight from the crew\'s CPAP');
  });

  it('nitroglycerin without knowing his pressure or about PDE-5 inhibitors (no crew report) is scored; with the report it is not', () => {
    // the doctor sees the pressure on the nurse's monitor, but without the crew's report nobody has asked about PDE-5 inhibitors
    expect(ids(md(['nitro-high']))).toEqual(['nitro-no-pde5']);
    expect(ids(md(['ask-pde5', 'nitro-high']))).toEqual([]);
    expect(ids(rn(['cpap', 'notify-physician', 'nitro-high']))).toEqual(['nitro-no-bp', 'nitro-no-pde5']);
    expect(ids(rn(['ems-handoff', 'cpap', 'notify-physician', 'nitro-high']))).toEqual([]);
  });
});

describe('SCAPE in the ED: the ER nurse', () => {
  it('never calls the physician: the physician comes at 4 minutes, asking why, and the item is missed', () => {
    const s = rn(['ems-handoff', 'cpap', 'monitor', 'nibp', 'reassess']);
    expect(s.fired).toContain('md-uncalled');
    expect(said(s, 'physician')[0]).toMatch(/I should have been called the moment he came through the door/);
    expect(missed(s)).toContain('Bring the ED physician to the bedside now');
    // the order follows the physician to the bedside
    expect(s.flags['asked-nitro-high']).toBeDefined();
  });

  it('high-dose nitroglycerin needs the order: given before it, it costs points (the 0.4 mg dose does not)', () => {
    expect(ids(rn(['ems-handoff', 'nitro-high']))).toEqual(['rn-without-order-nitro-high']);
    expect(ids(rn(['ems-handoff', 'nitro']))).toEqual([]);
    // given on the order, nothing is scored
    expect(ids(rn(IDEAL[6].slice(0, 6)))).toEqual([]);
  });

  it('0.4 mg when 0.8 mg was ordered: the physician corrects it, one minor penalty, and the right dose still counts', () => {
    const s = rn(['ems-handoff', 'cpap', 'notify-physician', 'monitor', 'nibp', 'nitro']);
    expect(ids(s)).toEqual(['wrong-nitro-high']);
    expect(said(s, 'physician').at(-1)).toMatch(/That's 0\.4 — I asked for 0\.8/);
    const fixed = rn(['ems-handoff', 'cpap', 'notify-physician', 'monitor', 'nibp', 'nitro', 'nitro-high']);
    expect(fixed.flags['nitro-order-given']).toBeDefined();
    // the correction straight after the wrong dose is what the physician asked for: no "repeat too soon" on top
    expect(ids(fixed)).toEqual(['wrong-nitro-high']);
  });

  it('the ordered dose never given: the physician gives it 3 minutes later, he still turns around, and the item is missed', () => {
    const s = rn(['ems-handoff', 'cpap', 'notify-physician', 'monitor', 'nibp', 'iv', 'reassess', 'reassess']);
    expect(s.fired).toContain('nitro-high-fallback');
    expect(said(s, 'physician').some((t) => /I'm giving the 0\.8 myself/.test(t))).toBe(true);
    expect(s.flags['nitro-high']).toBeDefined();
    expect(s.fired).toContain('better');
    expect(missed(s)).toContain('High-dose nitroglycerin (0.8 mg sublingual) on the physician\'s order');
  });

  it('never moves him onto the department\'s machine: respiratory therapy does on the physician\'s word, and the item is missed', () => {
    const s = rn(['ems-handoff', 'notify-physician', ...R(2)]);
    expect(s.fired).toContain('rn-niv-fallback');
    expect(s.flags['on-niv']).toBeDefined();
    expect(s.flags['niv-own']).toBeUndefined();
    expect(missed(s)).toContain('Keep him on positive pressure: onto the department\'s BiPAP straight from the crew\'s mask, sitting upright');
  });

  it('the falling pressure, reported at once: the physician turns the infusion down, it steadies, and the ICU accepts him', () => {
    const s = rn(IDEAL[6].slice(0, 13));
    expect(s.fired).toContain('dropping');
    expect(said(s, 'physician').at(-1)).toMatch(/turn the nitroglycerin down to 40/);
    expect(s.flags['drip-down']).toBeDefined();
    const after = rn(IDEAL[6].slice(0, 14));
    expect(after.vitals.sbp).toBe(128);
    expect(after.flags.dispo).toBeDefined();
    expect(said(after, 'physician').at(-1)).toMatch(/^The ICU has accepted him/);
  });

  it('the falling pressure, not reported: it falls further, the physician finds it on the central monitor, and the item is missed', () => {
    const s = rn([...IDEAL[6].slice(0, 12), ...R(3), 'handoff']);
    expect(s.fired).toEqual(expect.arrayContaining(['dropping', 'still-dropping', 'md-sees-drop', 'steady', 'md-dispo']));
    expect(said(s, 'physician').some((t) => /nobody told me/.test(t))).toBe(true);
    expect(missed(s)).toContain('Report the falling pressure to the physician at once');
    // more nitroglycerin into that falling pressure is a mistake of its own
    const more = rn([...IDEAL[6].slice(0, 12), 'reassess', 'nitro']);
    expect(ids(more)).toEqual(['nitro-below-target']);
  });

  it('the hand-off waits for the physician to decide where he goes', () => {
    const s = rn(['ems-handoff', 'handoff']);
    expect(s.ended).toBeNull();
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/until the ED physician decides where they go/) });
  });

  it('an opioid, a beta-blocker or a sedative with no order: one penalty each, and he gets worse', () => {
    const opioid = rn(['cpap', 'iv', 'fentanyl']);
    expect(ids(opioid)).toEqual(['rn-opioid-air-hunger']);
    expect(opioid.vitals.gcs).toBe(12);
    expect(ids(rn(['cpap', 'iv', 'metoprolol']))).toEqual(['rn-negative-inotrope']);
    expect(ids(rn(['cpap', 'iv', 'diltiazem']))).toEqual(['rn-negative-inotrope']);
    expect(ids(rn(['cpap', 'midazolam']))).toEqual(['rn-sedative-no-order']);
    expect(ids(rn(['cpap', 'iv', 'adenosine6']))).toEqual(['rn-antiarrhythmic-no-arrhythmia']);
    // it stands for the missing order too: at the order's weight
    expect(rn(['cpap', 'iv', 'adenosine6']).penalties[0]).toMatchObject({ points: 5, severity: 'major' });
  });

  it('when he stops protecting his airway: the nurse bags him, and the physician intubates', () => {
    // off the mask and sedated twice, without an order: the safety nets cannot reach him in time
    const steps = ['o2-nrb', 'midazolam', ...R(2), 'midazolam', ...R(2)];
    const failing = rn(steps);
    expect(failing.fired).toContain('failing');
    const bagged = rn([...steps, 'bvm', 'reassess']);
    expect(bagged.fired).toContain('md-intubates');
    expect(bagged.flags.airway).toBeDefined();
    expect(review(sc, stop(bagged)).wentWell.map((w) => w.label)).toContain('He stopped protecting his airway: bag-mask breaths with a PEEP valve until the tube');
    expect(missed(rn([...steps, 'reassess']))).toContain('He stopped protecting his airway: bag-mask breaths with a PEEP valve until the tube');
  });
});

describe('SCAPE in the ED: the ER doctor', () => {
  it('the computer nurse puts him on the monitor, records the 12-lead and starts the line; the doctor reads it', () => {
    const s = md(['ems-handoff', 'cpap', 'lungs', 'nitro-high', 'sample']);
    expect(s.fired).toEqual(expect.arrayContaining(['md-on-monitor', 'md-nurse-ecg', 'md-nurse-iv']));
    expect(s.reads).toHaveLength(1);
    expect(s.flags.iv).toBeDefined();
    // the high dose comes with the order for the infusion that follows it
    expect(s.log.some((l) => l.who === 'you' && /nitroglycerin infusion to follow/.test(l.text))).toBe(true);
  });

  it('BiPAP not called for: the computer nurse asks, the cylinder runs out, and the item is missed', () => {
    const s = md(['ems-handoff', ...R(3)]);
    expect(said(s, 'nurse').some((t) => /do you want him on it\?/.test(t))).toBe(true);
    expect(s.flags['off-niv']).toBeDefined();
    expect(missed(s)).toContain('Non-invasive ventilation without a gap: the department\'s BiPAP straight from the crew\'s CPAP');
  });

  it('low-dose nitroglycerin only: no turnaround — he tires, and the high dose is missed', () => {
    const s = md(['ems-handoff', 'cpap', 'nitro', ...R(2), 'nitro', ...R(3)]);
    expect(ids(s)).toEqual([]);
    expect(s.fired).toContain('tiring');
    expect(s.fired).not.toContain('better');
    expect(missed(s)).toContain('High-dose nitroglycerin early: 0.8 mg sublingual now, an infusion to follow');
  });

  it('the high dose late: he still turns around, and the item counts half', () => {
    const s = md(['ems-handoff', 'cpap', 'lungs', 'sample', 'pocus', 'nitro-high', ...R(2)]);
    expect(s.fired).toContain('better');
    expect(late(s)).toContain('High-dose nitroglycerin early: 0.8 mg sublingual now, an infusion to follow');
  });

  it('a second 0.8 mg while the systolic is still 160 or more, 3 minutes on, with a pressure since: right care, no penalty', () => {
    const s = md(['ask-pde5', 'nitro-high', 'nibp', 'vitals', 'nibp', 'lungs', 'nitro-high']);
    expect(s.counts['nitro-high']).toBe(2);
    expect(ids(s)).toEqual([]);
    // too soon, with no pressure since: a minor penalty
    expect(ids(md(['ask-pde5', 'nitro-high', 'nitro-high']))).toEqual(['nitro-repeat-unsafe']);
  });

  it('0.8 mg once the systolic is under 160, or any nitrate under 120, is scored in the case\'s own words', () => {
    const below160 = md([...IDEAL[7].slice(0, 7), 'nitro-high']);
    expect(ids(below160)).toEqual(['nitro-high-below-160']);
    const below120 = md([...IDEAL[7].slice(0, 7), ...R(2), 'nitro']);
    expect(below120.fired).toContain('dropping');
    expect(ids(below120)).toEqual(['nitro-below-target']);
    // the computer nurse titrated the infusion down to the doctor's target, and the pressure steadies
    expect(said(below120, 'nurse').some((t) => /turned the nitroglycerin down to 40/.test(t))).toBe(true);
  });

  it('intubating before a trial of BiPAP and high-dose nitroglycerin is a major error; once he is failing it is right', () => {
    const early = md(['ems-handoff', 'iv', 'rsi']);
    expect(ids(early)).toEqual(['rsi-before-niv']);
    expect(early.flags.airway).toBeDefined();
    expect(early.vitals.sbp).toBeLessThan(sc.initial.vitals.sbp - 30);
    // with a tube in, the crew's empty cylinder takes nothing off his face
    const tubed = md(['ems-handoff', 'iv', 'rsi', 'reassess']);
    expect(tubed.fired).not.toContain('ems-off');
    expect(tubed.vitals.spo2).toBe(94);
    // still tiring on the department's BiPAP with the high dose on board: a failed trial, and the tube is no mistake
    const tiring = md(['ems-handoff', 'iv', 'nitro', ...R(4), 'cpap', 'nitro-high', 'rsi']);
    expect(tiring.fired).toContain('tiring');
    expect(ids(tiring)).not.toContain('rsi-before-niv');
    const failing = md([...MD_TO_FAILING, 'rsi']);
    expect(ids(failing)).toEqual([]);
    expect(review(sc, stop(failing)).wentWell.map((w) => w.label)).toContain('He stopped protecting his airway: intubate (RSI)');
    // an advanced airway on an awake man: he gags it out (the built-in rule)
    expect(ids(md(['airway']))).toEqual(['airway-awake']);
  });

  it('no ventilation once he fails: his heart slows, then stops; compressions with breaths bring him back', () => {
    const s = md(MD_TO_ARREST);
    expect(s.fired).toEqual(expect.arrayContaining(['ems-off', 'tiring', 'failing', 'slowing', 'arrest']));
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    // compressions alone carry no oxygen to a heart that stopped from hypoxia
    expect(md([...MD_TO_ARREST, 'cpr', 'cpr']).pulse).toBe(false);
    const back = md([...MD_TO_ARREST, 'bvm', 'cpr', 'cpr']);
    expect(back.pulse).toBe(true);
    expect(back.flags.rosc).toBeDefined();
    expect(back.rhythm.profile).toBe('hfpef');
  });

  it('in the arrest the case monitor and the capnography line show the same EtCO₂ (as tests/sim-monitor.test.ts checks for every case)', () => {
    // the store's monitor, step by step, as tests/sim-monitor.test.ts plays it
    const THEN = [['capno'], ['cpr', 'capno'], ['bvm', 'capno'], ['bvm', 'cpr', 'capno'], ['cpr', 'bvm', 'capno'], ['cpr', 'airway', 'capno']];
    for (const then of THEN) {
      let s = start(sc, 7);
      let stale = false;
      let etco2 = 0;
      const act = (id: string) => {
        let next = perform(sc, s, id);
        while (next.pendingRead) next = answerRead(sc, next, next.pendingRead.answer);
        stale = staleEtco2(s, next, stale);
        s = next;
        etco2 = monitorVitals(s, stale).etco2;
      };
      for (let i = 0; i < 40 && s.pulse; i++) act('reassess');
      for (const id of then) act(id);
      expect(s.pulse, then.join(', ')).toBe(false);
      const line = [...s.log].reverse().find((x) => /^EtCO₂ \d+ mmHg/.test(x.text))!;
      expect(Number(line.text.match(/\d+(?= mmHg)/g)!.at(-1)), then.join(', ')).toBe(etco2);
    }
  });

  it('an opioid or a negative inotrope makes him worse and is a major error', () => {
    const opioid = md(['cpap', 'iv', 'fentanyl']);
    expect(ids(opioid)).toEqual(['opioid-air-hunger']);
    expect(opioid.vitals.etco2).toBeGreaterThan(md(['cpap', 'iv']).vitals.etco2);
    expect(ids(md(['cpap', 'iv', 'metoprolol']))).toEqual(['negative-inotrope']);
  });

  it('a small dose of midazolam for a man awake and fighting the mask is a fair choice; off the mask it is not', () => {
    const calm = md(['ems-handoff', 'cpap', 'iv', 'midazolam']);
    expect(ids(calm)).toEqual([]);
    expect(said(calm, 'nurse').some((t) => /relaxes into the mask/.test(t))).toBe(true);
    expect(ids(md(['o2-nrb', 'midazolam']))).toEqual(['niv-off', 'sedative-unsupported']);
  });

  it('aspirin hurts no one here: the mask comes off for a moment, and nothing is scored', () => {
    const s = md(['cpap', 'aspirin']);
    expect(ids(s)).toEqual([]);
    expect(s.flags['on-niv']).toBeDefined();
  });

  it('the cath lab for a strain pattern, a lytic, a CT or a transfer are mistakes', () => {
    const lab = md(['ems-handoff', 'cpap', 'reassess', 'cath-lab-activate']);
    expect(ids(lab)).toEqual(['cath-lab-strain']);
    expect(lab.flags['alert-declined']).toBeDefined();
    expect(lab.flags.dispo).toBeUndefined();
    expect(ids(md(['iv', 'tnk']))).toEqual(['lytic-no-indication']);
    expect(ids(md(['ct-urgent']))).toEqual(['ct-unneeded']);
    expect(ids(md(['transfer']))).toEqual(['transfer-unneeded']);
  });

  it('the ultrasound shows no body overloaded with fluid, and the consultant says no diuretic for now', () => {
    expect(md(['pocus']).log.some((l) => l.who === 'you' && /no sign of a body overloaded with fluid/.test(l.text))).toBe(true);
    const s = md([...IDEAL[7].slice(0, 7), 'consult-cardiology']);
    expect(said(s, 'consultant').at(-1)).toMatch(/No diuretic unless he turns out to be carrying extra fluid/);
  });
});

describe('SCAPE in the ED: the independent review\'s fixes', () => {
  it('the physician orders the nitrate once he is on the department\'s machine: a nurse who calls first is not timed from the doorway', () => {
    // calling the physician before anything else is right: the order waits for the mask swap, so the nurse is not late
    const callFirst = rn(['notify-physician', 'ems-handoff', 'cpap', 'monitor', 'nibp', 'nitro-high', 'iv', 'ecg12', 'labs', 'nibp', 'neuro',
      'reassess', 'notify-physician', 'reassess', 'handoff']);
    expectFullMarks(callFirst);
    expect(callFirst.flags['asked-nitro-high']).toBe(callFirst.flags['niv-since']);
    // never swapped: the order still comes, 2 minutes after the physician reached the bedside
    expect(rn(['ems-handoff', 'notify-physician', 'monitor']).flags['asked-nitro-high']).toBeUndefined();
    const noSwap = rn(['ems-handoff', 'notify-physician', 'monitor', 'nibp', 'reassess']);
    expect(noSwap.flags['asked-nitro-high']).toBeGreaterThanOrEqual(noSwap.flags['md-here'] + 2);
    // the order gives the infusion's target and when to call
    expect(said(callFirst, 'physician').find((t) => /0\.8 milligrams/.test(t))).toMatch(/between 120 and 160 — tell me at once if it goes under 120/);
  });

  it('the department\'s BiPAP keeps at least the crew\'s CPAP of 10 at the end of each breath', () => {
    for (const role of ROLES) expect(run(sc, role, ['cpap']).log.some((l) => l.who === 'you' && /BiPAP at 16 over 10 cmH₂O/.test(l.text))).toBe(true);
    expect(rn(['ems-handoff', 'notify-physician', ...R(2)]).log.some((l) => /BiPAP at 16 over 10/.test(l.text))).toBe(true);
  });

  it('a tube once he is drowsy with a rising CO₂ is a defensible call, not a penalty; an awake man still gets the trial first', () => {
    const tiring = md(['ems-handoff', 'lungs', 'sample', 'iv', ...R(3), 'rsi']);
    expect(tiring.fired).toContain('tiring');
    expect(tiring.fired).not.toContain('failing');
    expect(ids(tiring)).toEqual([]);
    expect(ids(md(['ems-handoff', 'iv', 'reassess', 'rsi']))).toEqual(['rsi-before-niv']);
  });

  it('procedural sedation on the mask stops his breathing: a major error, the tube that rescues him earns no credit, and without it he arrests', () => {
    const steps = ['ems-handoff', 'cpap', 'nitro-high', 'lungs', 'sample', 'procedural-sedation'];
    const s = md(steps);
    expect(ids(s)).toEqual(['deep-sedation-niv']);
    expect(s.vitals.gcs).toBeLessThanOrEqual(8);
    expect(s.flags.failing).toBeDefined();
    // sedating first and intubating the apnea costs as much as the tube before a trial
    expect(sc.harms.find((h) => h.id === 'deep-sedation-niv')!.points).toBe(sc.harms.find((h) => h.id === 'rsi-before-niv')!.points);
    const tubed = md([...steps, 'rsi', 'pocus', 'admit', 'handoff']);
    const r = review(sc, tubed);
    expect(r.wentWell.map((w) => w.label)).not.toContain('He stopped protecting his airway: intubate (RSI)');
    expect(r.percent).toBeLessThan(90);
    expect(md([...steps, ...R(5)]).pulse).toBe(false);
    // on the ventilator, sedation is ordinary care
    const vent = md([...MD_TO_FAILING, 'rsi', 'procedural-sedation']);
    expect(ids(vent)).toEqual([]);
    expect(vent.log.some((l) => /Propofol started for sedation on the ventilator/.test(l.text))).toBe(true);
  });

  it('the nurse who reports him getting drowsy gets a physician who acts on it, and the report is scored', () => {
    const steps = ['o2-nrb', ...R(2)];
    const s = rn([...steps, 'notify-physician']);
    expect(s.fired).toContain('tiring');
    expect(said(s, 'physician').at(-1)).toMatch(/he's tiring and holding on to his CO₂\. Back on our BiPAP now/);
    expect(review(sc, stop(s)).wentWell.map((w) => w.label)).toContain('He is getting drowsy: tell the physician at once');
    expect(missed(rn([...steps, 'reassess']))).toContain('He is getting drowsy: tell the physician at once');
    // no drowsiness, no item
    expect(review(sc, rn(IDEAL[6])).toFix).toEqual([]);
  });

  it('a nitrate in the arrest is not scored as a missing pressure or PDE-5 question', () => {
    const s = md([...MD_TO_ARREST, 'nitro']);
    expect(ids(s)).not.toContain('nitro-no-pde5');
    expect(ids(s)).not.toContain('nitro-no-bp');
  });

  it('in the arrest, epinephrine as soon as possible is expected alongside the breaths', () => {
    const label = 'No pulse: epinephrine 1 mg IV as soon as possible';
    const withEpi = md([...MD_TO_ARREST, 'bvm', 'cpr', 'epinephrine', 'cpr']);
    expect(withEpi.pulse).toBe(true);
    expect(review(sc, stop(withEpi)).wentWell.map((w) => w.label)).toContain(label);
    expect(missed(md([...MD_TO_ARREST, 'bvm', 'cpr', 'cpr']))).toContain(label);
    // no arrest, no item
    expect(review(sc, md(IDEAL[7])).toFix.map((t) => t.label)).not.toContain(label);
  });

  it('the findings agree with each other and with the tracing: no distended neck veins, no effusion, no ST depression the 12-lead does not draw', () => {
    expect(md(['perfusion']).log.at(-1)!.text).toMatch(/neck veins not distended/);
    expect(md(['cxr']).log.find((l) => /^Portable chest film/.test(l.text))!.text).toMatch(/no pleural effusion/);
    const read = run(sc, 7, IDEAL[7].slice(0, 4), undefined, 'manual').pendingRead!;
    expect(read.explain).toMatch(/T-wave inversion in I, aVL, II, aVF, V5 and V6/);
    if (stLevel(resolveProfile('hfpef'), 'V6') > -0.5) expect(read.explain).not.toMatch(/ST depression/);
  });

  it('the ultrasound says what it shows now: in the arrest no heart squeezing hard, and fewer B-lines once he has turned around', () => {
    const arrest = md([...MD_TO_ARREST, 'pocus']);
    expect(arrest.log.at(-1)!.text).toMatch(/10-second pulse check/);
    expect(arrest.log.at(-1)!.text).not.toMatch(/squeezing hard/);
    const scans = md([...IDEAL[7].slice(0, 7), 'pocus']).log.filter((l) => /^Bedside ultrasound/.test(l.text));
    expect(scans.map((l) => /B-lines in every zone/.test(l.text))).toEqual([true, false]);
    expect(scans[1].text).toMatch(/B-lines now only at both bases/);
  });

  it('once he cannot talk, the history comes from the crew and the chart, not from him', () => {
    expect(md(['sample']).log.at(-1)!.text).toMatch(/^Through the mask/);
    for (const id of ['sample', 'opqrst', 'ask-pde5']) expect(md([...MD_TO_FAILING, id]).log.at(-1)!.text, id).toMatch(/^He cannot answer now/);
  });

  it('cites the evidence as it stands: ACEP 2022 Level C for high-dose nitroglycerin, the HF guideline\'s 2b only as an add-on to diuretics', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why), ...sc.harms.map((h) => h.text)].join(' ');
    expect(text).not.toMatch(/ACEP 2022[^)]*safe and effective/);
    expect(text).toMatch(/Level C/);
    expect(text).toMatch(/add-on to diuretics[^.]*\(2b\)/);
    expect(text).toMatch(/2026 meta-analysis/);
  });
});
