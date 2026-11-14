import { describe, expect, it } from 'vitest';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { nitrateUnits, scapeField as sc } from '@/lib/sim/scenario/scenarios/scapeField';
import type { SimState } from '@/lib/sim/scenario/types';
import { CONDITIONS } from '@/data/content';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const R = (n: number) => Array<string>(n).fill('reassess');
const toFix = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.find((t) => label.test(t.label));

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'als', 'vitals', 'lungs', 'cpap', 'ask-pde5', 'nitro-assist', 'ecg12', 'ecg-transmit', 'vitals', 'notify', 'transport-near', UNTIL_ARRIVED, 'handoff'],
  // the second high dose 5 minutes or more after the first, with a fresh pressure before it (the IV fits in between)
  2: ['primary', 'vitals', 'lungs', 'cpap', 'ask-pde5', 'nitro-high', 'monitor', 'ecg12', 'iv', 'nibp', 'nitro-high', 'notify', 'transport-near', UNTIL_ARRIVED, 'handoff'],
};

/** The paramedic's ideal run until she has turned the corner (CPAP, the IV, two high doses, the radio report, a reassessment) */
const TO_BETTER = [...IDEAL[2].slice(0, IDEAL[2].indexOf('notify') + 1), 'reassess'];

/** The paramedic who never puts CPAP on: assessment, monitor, IV and a 12-lead — 7.5 minutes in, she is tiring */
const NO_CPAP = ['primary', 'vitals', 'lungs', 'monitor', 'iv', 'ecg12'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|edema|\bPEA\b|asystole|hypox|SCAPE|heart failure/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;

describe('hypertensive pulmonary edema in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and conditions that exist', () => {
    expect(sc).toMatchObject({ id: 'scape-field', setting: 'field', roles: [1, 2] });
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('sinus-tachycardia');
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // fluid on the lungs (the built-in rules charge a bolus and raised legs) — and not 'heart-failure', which means a reduced
    // ejection fraction: her heart squeezes normally
    expect(sc.problems).toEqual(['pulmonary-edema']);
  });

  it('nothing the learner sees before treating her names what she has', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/edema|SCAPE|heart failure|hypertensive/i);
    // the clues are there for whoever looks: bolt upright at 3 am, sweating, pink froth
    expect(opening).toMatch(/bolt upright/);
    expect(opening).toMatch(/pink froth/);
    expect(opening).toMatch(/heart center/i);
  });

  it('the EMT is the BLS crew with a CPAP kit and no paramedic sent yet; the paramedic has an EMT partner and the drug box', () => {
    expect(start(sc, 1).log.some((l) => /no paramedic unit has been sent yet/.test(l.text) && /CPAP kit/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
  });

  it('each role has its own part: CPAP, the intercept and the transmitted 12-lead for the EMT; the nitrate, the IV and the read for the paramedic', () => {
    const ids = (role: 1 | 2) => criticalsFor(sc, role).map((c) => c.id);
    expect(ids(1)).toEqual(expect.arrayContaining(['cpap', 'als', 'transmit']));
    expect(ids(1)).not.toEqual(expect.arrayContaining(['nitro']));
    expect(ids(1)).not.toContain('iv');
    expect(ids(2)).toEqual(expect.arrayContaining(['cpap', 'nitro', 'iv']));
    expect(ids(2)).not.toContain('als');
    expect(ids(2)).not.toContain('transmit');
    // the IV-before-CPAP trap is the paramedic's to fall into
    expect(sc.harms.find((h) => h.id === 'iv-before-cpap')?.roles).toEqual([2]);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('hypertensive pulmonary edema in the field — the ideal runs', () => {
  for (const role of [1, 2] as const) {
    it(`role ${role}: ends by itself with full marks`, () => {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      expect(r.outcome).toMatch(/^Every critical intervention done/);
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      // she turned the corner, and never tired
      expect(s.fired).toContain('better');
      expect(s.fired).not.toContain('tiring');
      expect(s.fired).not.toContain('too-low');
    });
  }

  it('the paramedic reads the 12-lead as sinus tachycardia, at no cost; a STEMI read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'sinus-tach', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 118.*no ST elevation/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const wrong = medic(readAfter(IDEAL[2], 'ecg12', 'stemi-anterior'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('once she has turned the corner a repeat 12-lead shows the slower rate, and is read as such', () => {
    const s = medic([...TO_BETTER, 'ecg12-repeat']);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 96 });
    expect(s.reads.at(-1)).toMatchObject({ answer: 'nsr', verdict: 'correct' });
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it; the physician sees no STEMI', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/12-lead acquired\. You can't interpret it/);
    expect(said(s)).toMatch(/ECG received\. The emergency physician reviews it: no ST elevation/);
  });

  it('the regional heart center is no mistake either', () => {
    for (const role of [1, 2] as const) {
      const s = runScenario(sc, role, IDEAL[role].map((id) => (id === 'transport-near' ? 'transport-pci' : id)));
      expect(s.ended?.reason, `role ${role}`).toBe('complete');
      expect(review(sc, s).percent, `role ${role}`).toBe(100);
      expect(said(s)).toMatch(/transporting to the regional heart center \(16 min\)/);
    }
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) runScenario(sc, role, IDEAL[role], (s) => runs.push(s));
    runs.push(
      medic([...NO_CPAP, ...R(6), 'bvm', 'cpr', 'cpr', 'reassess', 'ecg12-repeat']),
      medic([...NO_CPAP, ...R(2), 'bvm', ...R(3)]),
      medic([...TO_BETTER, 'nibp', 'nitro-high', 'nibp', 'reassess', 'nitro', 'nibp', 'reassess', 'nitro', ...R(3)]),
      medic(['cpap', 'iv', 'fluid', 'metoprolol', 'diltiazem', 'push-epi', 'pressor', 'epi-im', 'albuterol', 'atropine', 'adenosine6', 'fentanyl', 'midazolam', 'legs-up']),
      emt(['primary', 'als', 'vitals', 'lungs', 'ecg12', 'ecg-transmit', ...R(6)]),
      emt(['legs-up', 'o2-nrb', 'aspirin', 'aed', 'bvm', ...R(6), 'bvm', ...R(2)]),
      medic([...NO_CPAP, 'cpap', 'fentanyl', 'midazolam', ...R(5), 'bvm', 'cpr', 'cpr']),
      medic([...NO_CPAP, ...R(4), 'atropine', 'pace', 'ecg12-repeat', 'push-epi', 'metoprolol', ...R(2)]),
      emt(['primary', 'vitals', 'lungs', 'cpap', 'ask-pde5', 'als', 'reassess', 'reassess', 'nitro-assist', 'ecg12', 'ecg-transmit', 'notify', 'transport-near', ...R(4)]),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('the paramedic\'s ideal run doses as it teaches: 5 minutes or more apart, a fresh pressure before the second, 0.8 mg only at 160 or more', () => {
    const doses: { minute: number; sbp: number }[] = [];
    let prev: SimState | null = null;
    runScenario(sc, 2, IDEAL[2], (s) => {
      const last = s.performed.at(-1);
      if (prev && last?.id === 'nitro-high' && s.performed.length > prev.performed.length) doses.push({ minute: last.minute, sbp: prev.vitals.sbp });
      prev = s;
    });
    expect(doses).toHaveLength(2);
    expect(doses[1].minute - doses[0].minute).toBeGreaterThanOrEqual(5);
    for (const d of doses) expect(d.sbp).toBeGreaterThanOrEqual(160);
  });

  it('is deterministic', () => {
    expect(medic(IDEAL[2])).toEqual(medic(IDEAL[2]));
    expect(emt(IDEAL[1])).toEqual(emt(IDEAL[1]));
  });
});

describe('hypertensive pulmonary edema in the field — what turns her around', () => {
  it('starts sitting bolt upright: 224/122, 118, RR 34, SpO₂ 82 %, crackles to the apices with pink froth', () => {
    const s = medic(['vitals', 'lungs']);
    expect(said(s)).toMatch(/BP 224\/122 · pulse 118 · RR 34 · SpO₂ 82%/);
    expect(said(s)).toMatch(/crackles from the bases to the apices.*no wheeze; pink frothy sputum/);
  });

  it('CPAP at 5 titrated to 10 lifts her SpO₂ at once and takes a little off the pressure; after 4 minutes it eases her breathing', () => {
    let s = medic(['vitals', 'cpap']);
    expect(said(s)).toMatch(/started at 5 cmH₂O and turned up to 10/);
    expect(s.vitals).toMatchObject({ spo2: 90, rr: 30, sbp: 212, dbp: 116 });
    expect(s.flags['cpap-own']).toBeDefined();
    s = medic(['vitals', 'cpap', ...R(2)]);
    expect(s.fired).toContain('cpap-working');
    expect(s.vitals.spo2).toBe(93);
    // CPAP alone does not bring the pressure down: that is the nitrate's job, and she does not turn the corner without it
    expect(s.vitals.sbp).toBeGreaterThan(200);
    expect(medic(['vitals', 'cpap', ...R(8)]).fired).not.toContain('better');
  });

  it('CPAP plus two high doses of nitroglycerin: pink, talking in sentences, the rate and the pressure down', () => {
    const s = medic(TO_BETTER);
    expect(nitrateUnits(s)).toBe(4);
    expect(s.fired).toContain('better');
    expect(s.vitals).toMatchObject({ spo2: 96, rr: 20, gcs: 15, sbp: 152, dbp: 90 });
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 96 });
    expect(said(s)).toMatch(/pink again, and talking in full sentences/);
  });

  it('each high dose takes 28 off the systolic while the surge lasts; she needs no IV for it', () => {
    const s = medic(['vitals', 'ask-pde5', 'nitro-high']);
    expect(s.vitals.sbp).toBe(196);
    expect(s.flags.iv).toBeUndefined();
    expect(penalties(s)).toEqual([]);
  });

  it('nitrates alone slow the tiring but do not hold it off: positive pressure is what she cannot do without', () => {
    const steps = ['vitals', 'ask-pde5', 'nitro-high', 'reassess', 'vitals', 'nitro-high', 'reassess'];
    // without them she tires from minute 7; 0.8 mg or more on board buys her until minute 11 (high-dose nitrate trials)
    expect(medic(steps).minute).toBeGreaterThan(7);
    expect(medic(steps).fired).not.toContain('tiring');
    expect(medic(['vitals', 'lungs', 'monitor', 'iv', 'ecg12', 'reassess']).fired).toContain('tiring');
    const s = medic([...steps, ...R(2)]);
    expect(nitrateUnits(s)).toBe(4);
    expect(s.flags.tiring).toBeGreaterThanOrEqual(11);
    expect(s.fired).not.toContain('better');
  });

  it('the EMT helps her take her own spray once (with a pressure and the PDE-5 question first), at no cost', () => {
    const s = emt(['vitals', 'cpap', 'ask-pde5', 'nitro-assist']);
    expect(said(s)).toMatch(/One spray of her own nitroglycerin \(0\.4 mg\)/);
    expect(s.vitals.sbp).toBe(198);
    expect(penalties(s)).toEqual([]);
    // the patient's own nitroglycerin may be repeated every 5 minutes, up to 3 (the button allows it; the case decides)
    expect(unavailableReason(sc, s, 'nitro-assist')).toBeNull();
  });

  it('the EMT cannot help a drowsy patient take a spray: refused, no time passes, nothing scored', () => {
    const tiring = emt(['primary', 'vitals', 'lungs', 'ecg12', 'ecg-transmit', 'reassess']);
    expect(tiring.fired).toContain('tiring');
    const s = perform(sc, tiring, 'nitro-assist');
    expect(s.minute).toBe(tiring.minute);
    expect(s.counts['nitro-assist']).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/too drowsy to take a spray/);
  });

  it('for the EMT the intercept paramedic gives the high-dose nitroglycerin and the IV, and she turns the corner', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toEqual(expect.arrayContaining(['als-arrives', 'better']));
    expect(s.flags['als-nitro-1-high']).toBeDefined();
    expect(s.flags.iv).toBeDefined();
    expect(said(s)).toMatch(/The paramedics arrive and take over the medications/);
  });

  it('the intercept paramedic never doubles up on her own spray: their first dose comes 5 minutes after it', () => {
    const s = emt(['primary', 'vitals', 'lungs', 'cpap', 'ask-pde5', 'als', 'reassess', 'reassess', 'nitro-assist', 'ecg12', 'ecg-transmit', 'notify', 'transport-near', ...R(2)]);
    const spray = s.performed.find((p) => p.id === 'nitro-assist')!.minute;
    expect(s.flags['als-here']).toBeLessThan(spray + 5);
    expect(s.flags['team-nitro'] - spray).toBeGreaterThanOrEqual(5);
    expect(s.fired).toContain('better');
  });

  it('an intercept called too late to meet her before the hospital does not turn up after the hand-over', () => {
    const s = emt(['primary', 'vitals', 'lungs', 'cpap', 'transport-near', ...R(3), 'als', UNTIL_ARRIVED, ...R(2)]);
    expect(s.flags.arrived).toBeLessThan(s.flags.als + 6);
    expect(s.minute).toBeGreaterThan(s.flags.als + 6);
    expect(s.fired).not.toContain('als-arrives');
  });

  it('an EMT who never puts CPAP on: the intercept paramedic does — and the EMT still misses the CPAP item', () => {
    const s = emt(['primary', 'als', 'vitals', 'lungs', 'ecg12', 'ecg-transmit', 'reassess']);
    expect(s.flags['cpap-team']).toBeDefined();
    expect(s.fired).not.toContain('tiring');
    expect(said(s)).toMatch(/Why is she not on CPAP\?/);
    expect(toFix(s, /^CPAP early/)?.kind).toBe('missed');
  });
});

describe('hypertensive pulmonary edema in the field — without CPAP she tires', () => {
  it('7 minutes in she is tiring: drowsy, bluer, CO₂ rising', () => {
    const s = medic(NO_CPAP);
    expect(s.fired).toContain('tiring');
    expect(s.vitals).toMatchObject({ gcs: 12, spo2: 78, etco2: 56 });
    expect(medic([...NO_CPAP, 'capno']).log.at(-1)!.text).toBe('EtCO₂ 56 mmHg.');
    expect(review(sc, stop(medic(NO_CPAP))).toFix.find((t) => /^CPAP early/.test(t.label))?.kind).toBe('missed');
  });

  it('CPAP while she is only drowsy still works, more slowly — late, at half the points', () => {
    let s = medic([...NO_CPAP, 'cpap']);
    expect(penalties(s)).not.toContain('cpap-unable');
    expect(s.vitals.spo2).toBe(86);
    expect(said(s)).toMatch(/watch that she keeps breathing/);
    s = medic([...NO_CPAP, 'cpap', ...R(2)]);
    expect(s.fired).toContain('cpap-working');
    expect(s.vitals.gcs).toBe(14);
    expect(toFix(s, /^CPAP early/)).toMatchObject({ kind: 'late', points: 10 });
  });

  it('four minutes later she stops protecting her airway: CPAP is wrong now and does nothing', () => {
    const failing = medic([...NO_CPAP, ...R(2)]);
    expect(failing.fired).toContain('failing');
    expect(failing.vitals).toMatchObject({ gcs: 7, rr: 8, spo2: 70, etco2: 74 });
    const s = perform(sc, failing, 'cpap');
    expect(penalties(s)).toContain('cpap-unable');
    expect(s.flags.cpap).toBeUndefined();
    expect(s.vitals.spo2).toBe(70);
  });

  it('a bag-mask with a PEEP valve brings her oxygen up and her CO₂ down, and keeps her heart going', () => {
    const s = medic([...NO_CPAP, ...R(2), 'bvm', ...R(3)]);
    expect(said(s)).toMatch(/Bag-mask with oxygen and a PEEP valve/);
    expect(s.fired).toContain('bagging-works');
    expect(s.fired).not.toContain('slowing');
    expect(s.vitals).toMatchObject({ spo2: 92, etco2: 46 });
    expect(review(sc, s).wentWell.some((w) => /bag-mask ventilation/.test(w.label))).toBe(true);
  });

  it('an advanced airway once she is unresponsive is no mistake', () => {
    const s = medic([...NO_CPAP, ...R(2), 'airway']);
    expect(s.flags.airway).toBeDefined();
    expect(penalties(s)).not.toContain('airway-before-cpap');
    expect(penalties(s)).not.toContain('airway-awake');
  });

  it('nobody breathes for her: the heart slows, then stops; CPR with breaths brings her back after two cycles', () => {
    let s = medic([...NO_CPAP, ...R(4)]);
    expect(s.fired).toContain('slowing');
    expect(s.rhythm).toEqual({ profile: 'sinus-bradycardia', hr: 46 });
    s = medic([...NO_CPAP, ...R(6)]);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    // compressions alone carry no oxygen to a heart that stopped for want of it
    expect(perform(sc, perform(sc, s, 'cpr'), 'cpr').pulse).toBe(false);
    s = medic([...NO_CPAP, ...R(6), 'bvm', 'cpr', 'cpr']);
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(said(s)).toMatch(/a carotid pulse — ROSC/);
    const r = review(sc, s);
    expect(r.wentWell.some((w) => /CPR at once/.test(w.label))).toBe(true);
    expect(r.toFix.find((t) => /bag-mask ventilation/.test(t.label))?.kind).toBe('late');
  });

  it('sedated below a GCS of 9 on the mask: CPAP comes off, she needs breaths given, and without them she slows', () => {
    const drowsy = medic([...NO_CPAP, 'cpap', 'fentanyl', 'midazolam']);
    expect(drowsy.fired).toContain('cpap-fails');
    expect(drowsy.flags['cpap-off']).toBeDefined();
    expect(drowsy.vitals).toMatchObject({ gcs: 7, rr: 8 });
    expect(said(drowsy)).toMatch(/the CPAP can't breathe for her, and she can't protect her airway\. Mask off!/);
    // the status and the primary survey say what she has now: no "32 shallow breaths" on a mask that cannot help
    expect(perform(sc, drowsy, 'reassess').log.at(-1)!.text).toBe('No answer to her name; a shallow breath only 8 times a minute.');
    const primary = medic(['vitals', 'lungs', 'monitor', 'iv', 'ecg12', 'reassess', 'cpap', 'fentanyl', 'midazolam', 'primary']);
    expect(primary.log.at(-1)!.text).toMatch(/^No answer to her name; froth gurgling in her airway; a shallow breath only 8 times a minute/);
    // breaths given at once: on time, and her color comes back
    const bagged = medic([...NO_CPAP, 'cpap', 'fentanyl', 'midazolam', 'bvm', ...R(2)]);
    expect(bagged.fired).toContain('bagging-works');
    expect(review(sc, bagged).wentWell.some((w) => /bag-mask ventilation/.test(w.label))).toBe(true);
    // nobody breathes for her: the heart slows, then stops
    const left = medic([...NO_CPAP, 'cpap', 'fentanyl', 'midazolam', ...R(5)]);
    expect(left.fired).toEqual(expect.arrayContaining(['slowing', 'arrest']));
    expect(toFix(left, /bag-mask ventilation/)?.kind).toBe('missed');
  });

  it('a heart slowing for want of oxygen: atropine lifts it for a moment only, and a beta-blocker slows it further — never faster', () => {
    const slow = medic([...NO_CPAP, ...R(4)]);
    expect(slow.rhythm.hr).toBe(46);
    const atropine = perform(sc, slow, 'atropine');
    expect(atropine.rhythm).toEqual({ profile: 'sinus-bradycardia', hr: 46 });
    expect(atropine.log.find((l) => l.who === 'monitor')?.text).not.toMatch(/sinus|brady/i);
    expect(penalties(atropine)).not.toContain('atropine-fast');
    expect(medic([...NO_CPAP, ...R(4), 'atropine', ...R(2)]).pulse).toBe(false);
    const beta = perform(sc, slow, 'metoprolol');
    expect(beta.rhythm.hr).toBeLessThan(46);
    expect(penalties(beta)).toContain('negative-inotrope');
  });

  it('a pressor in the hypoxic slowing is not charged as one for a high pressure — the missing breaths are', () => {
    const s = perform(sc, medic([...NO_CPAP, ...R(4)]), 'push-epi');
    expect(s.vitals.sbp).toBeLessThan(140);
    expect(penalties(s)).not.toContain('pressor-hypertensive');
    expect(penalties(s)).not.toContain('pressor-not-hypotensive');
  });

  it('a 12-lead while the pads pace her is explained as paced, with the hypoxia beneath it', () => {
    const s = medic([...NO_CPAP, ...R(4), 'pace', 'ecg12-repeat']);
    expect(s.reads.at(-1)).toMatchObject({ verdict: 'correct' });
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Paced at 70 by the pads/.test(l.text))).toBe(true);
    expect(said(s)).not.toMatch(/No 12-lead in cardiac arrest/);
  });

  it('a hint in the crisis names the breaths she needs', () => {
    const s = takeHint(sc, medic([...NO_CPAP, ...R(2)]));
    expect(s.log.at(-1)!.text).toMatch(/^Hint: She stopped protecting her airway: bag-mask ventilation/);
  });
});

describe('hypertensive pulmonary edema in the field — the traps', () => {
  it('a fluid bolus floods her lungs further: the built-in rule, once', () => {
    const s = medic(['vitals', 'cpap', 'iv', 'fluid']);
    expect(penalties(s)).toEqual(['fluid-pulmonary-edema']);
    expect(s.vitals.spo2).toBe(86);
    expect(medic(['vitals', 'cpap', 'iv', 'fluid', 'lungs']).log.at(-1)!.text).toMatch(/louder than before/);
  });

  it('lying her flat with the legs up: she desaturates and claws her way back up — the built-in rule, for either role', () => {
    for (const role of [1, 2] as const) {
      const s = runScenario(sc, role, ['legs-up']);
      expect(penalties(s), `role ${role}`).toEqual(['legs-up-pulmonary-edema']);
      expect(s.vitals.spo2).toBe(76);
      expect(said(s)).toMatch(/claws her way back up/);
    }
  });

  it('an opioid for her breathlessness blunts her breathing and costs 8 points', () => {
    const s = medic(['vitals', 'cpap', 'iv', 'fentanyl']);
    expect(penalties(s)).toEqual(['opioid-dyspnea']);
    expect(s.penalties[0].points).toBe(8);
    expect(s.vitals.gcs).toBe(13);
    expect(s.vitals.etco2).toBeGreaterThan(30);
  });

  it('an advanced airway for an awake patient before a CPAP trial: refused by her gag, charged once in the case\'s words', () => {
    const s = medic(['primary', 'airway']);
    expect(penalties(s)).toEqual(['airway-before-cpap']);
    expect(s.flags.airway).toBeUndefined();
    expect(s.penalties[0].text).toMatch(/CPAP first/);
  });

  it('an IV before CPAP costs the paramedic a little; after CPAP it is right', () => {
    expect(penalties(medic(['vitals', 'iv']))).toEqual(['iv-before-cpap']);
    expect(penalties(medic(['vitals', 'cpap', 'iv']))).toEqual([]);
  });

  it('nitroglycerin needs a pressure and the PDE-5 question first', () => {
    expect(penalties(medic(['ask-pde5', 'nitro-high']))).toEqual(['nitro-no-bp']);
    expect(penalties(medic(['vitals', 'nitro-high']))).toEqual(['nitro-no-pde5']);
    expect(penalties(emt(['cpap', 'nitro-assist']))).toEqual(['nitro-no-bp', 'nitro-no-pde5']);
  });

  it('a repeat dose needs 3 minutes and a fresh pressure', () => {
    expect(penalties(medic(['vitals', 'ask-pde5', 'nitro-high', 'nitro-high']))).toEqual(['nitro-repeat-unsafe']);
    // the time is there, but no pressure since the last dose
    expect(penalties(medic(['vitals', 'ask-pde5', 'nitro-high', 'cpap', 'ecg12', 'nitro-high']))).toEqual(['nitro-repeat-unsafe']);
    // a pressure after the dose, 3 minutes or more: fine
    expect(penalties(medic(['vitals', 'ask-pde5', 'nitro-high', 'cpap', 'vitals', 'lungs', 'nitro-high']))).toEqual([]);
  });

  it('a reassessment reads the pressure too: it counts as the check before a dose and as the recheck', () => {
    // its line shows the full set of vitals, the pressure included
    expect(said(medic(['reassess']))).toMatch(/BP 224\/122/);
    expect(penalties(medic(['vitals', 'ask-pde5', 'nitro-high', 'cpap', 'reassess', 'nitro-high']))).toEqual([]);
    expect(penalties(medic(['reassess', 'ask-pde5', 'nitro-high']))).toEqual([]);
    expect(toFix(medic(['vitals', 'cpap', 'reassess']), /^Recheck the blood pressure/)).toBeUndefined();
    const emtRun = emt(['primary', 'als', 'vitals', 'lungs', 'cpap', 'ecg12', 'ecg-transmit', 'reassess', 'notify', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, emtRun).percent).toBe(100);
  });

  it('nitroglycerin after the pressure has fallen: the high dose below 160 costs a little, any dose below 100 a lot — each once', () => {
    let s = medic([...TO_BETTER, 'nibp', 'nitro-high']);
    expect(penalties(s)).toEqual(['nitro-high-below-160']);
    // once the surge has passed the same dose drops her far more
    expect(s.vitals.sbp).toBe(118);
    s = medic([...TO_BETTER, 'nibp', 'nitro-high', 'nibp', 'reassess', 'nitro']);
    expect(s.vitals.sbp).toBe(96);
    expect(s.fired).toContain('too-low');
    expect(said(s)).toMatch(/feels faint/);
    s = medic([...TO_BETTER, 'nibp', 'nitro-high', 'nibp', 'reassess', 'nitro', 'nibp', 'reassess', 'nitro']);
    expect(penalties(s)).toEqual(['nitro-high-below-160', 'nitro-pressure-fallen']);
    expect(penalties(s)).not.toContain('nitro-hypotension');
  });

  it('with the nitrates held, the pressure comes back by itself — and she stops saying she is light-headed', () => {
    const s = medic([...TO_BETTER, 'nibp', 'nitro-high', 'nibp', 'reassess', 'nitro', ...R(3)]);
    expect(s.fired).toContain('pressure-back');
    expect(s.vitals).toMatchObject({ sbp: 114, dbp: 70, gcs: 15 });
    expect(perform(sc, s, 'reassess').log.at(-1)!.text).not.toMatch(/light-headed/);
  });

  it('a pressor for the dip after the nitrates costs a little (it is not low, and it comes back); one at 160 or more costs a lot', () => {
    const dip = medic([...TO_BETTER, 'nibp', 'nitro-high', 'nibp', 'reassess', 'nitro', 'push-epi']);
    expect(penalties(dip)).toEqual(['nitro-high-below-160', 'pressor-not-hypotensive']);
    expect(dip.penalties.at(-1)).toMatchObject({ points: 3, severity: 'minor' });
    expect(dip.penalties.at(-1)!.text).not.toMatch(/far too high/);
    // she still settles once the nitrates have worn off
    const later = medic([...TO_BETTER, 'nibp', 'nitro-high', 'nibp', 'reassess', 'nitro', 'push-epi', ...R(3)]);
    expect(later.fired).toContain('pressure-back');
    expect(later.vitals.gcs).toBe(15);
  });

  it('a beta-blocker or diltiazem for her fast sinus rate makes her worse', () => {
    for (const drug of ['metoprolol', 'diltiazem']) {
      const s = medic(['vitals', 'cpap', 'iv', drug]);
      // diltiazem in acute pulmonary edema is the built-in label contraindication, at its own weight (15, critical)
      expect(penalties(s), drug).toEqual([drug === 'diltiazem' ? 'diltiazem-heart-failure' : 'negative-inotrope']);
      expect(s.vitals.spo2, drug).toBe(86);
      expect(said(s)).toMatch(/grayer and sweatier, not better/);
    }
  });

  it('antiarrhythmics, pressors, IM epinephrine and albuterol have nothing to treat', () => {
    expect(penalties(medic(['vitals', 'cpap', 'iv', 'adenosine6', 'amio-infusion']))).toEqual(['antiarrhythmic-no-arrhythmia']);
    const pressor = medic(['vitals', 'cpap', 'iv', 'push-epi']);
    expect(penalties(pressor)).toEqual(['pressor-hypertensive']);
    expect(pressor.vitals.sbp).toBe(228);
    expect(penalties(medic(['epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
    expect(penalties(medic(['albuterol']))).toEqual(['albuterol-crackles']);
  });

  it('midazolam before CPAP is a mistake; a small dose for an awake patient fighting the mask is not', () => {
    const before = medic(['midazolam']);
    expect(penalties(before)).toEqual(['sedative-unsupported']);
    expect(before.vitals.gcs).toBe(12);
    const onMask = medic(['vitals', 'cpap', 'iv', 'midazolam']);
    expect(penalties(onMask)).toEqual([]);
    expect(said(onMask)).toMatch(/relaxes into the mask/);
    // once she is tiring it only blunts what breathing she has left: one penalty, in the case's words
    expect(penalties(medic([...NO_CPAP, 'midazolam']))).toEqual(['iv-before-cpap', 'sedative-unsupported']);
  });

  it('a STEMI alert is stood down: her 12-lead shows no ST elevation', () => {
    const s = medic(['ecg12', 'stemi-alert']);
    expect(penalties(s)).toEqual(['stemi-alert-no-ste']);
    expect(s.flags['alert-declined']).toBeDefined();
  });

  it('things that do no harm cost nothing: aspirin while she can chew, oxygen by mask, the AED refused with a pulse', () => {
    expect(penalties(medic(['vitals', 'cpap', 'aspirin']))).toEqual([]);
    const aed = emt(['aed']);
    expect(aed.minute).toBe(0);
    expect(penalties(aed)).toEqual([]);
    const nrb = emt(['o2-nrb']);
    expect(nrb.vitals.spo2).toBe(86);
    expect(penalties(nrb)).toEqual([]);
  });

  it('medical control answers each role within its scope', () => {
    expect(emt(['vitals', 'med-control']).log.at(-1)!.text).toMatch(/help her take one spray of her own nitroglycerin/);
    expect(medic(['vitals', 'med-control']).log.at(-1)!.text).toMatch(/0\.8 mg every 5 minutes while her systolic stays 160 or more/);
    expect(medic(['med-control']).log.at(-1)!.text).toMatch(/blood pressure first/);
    // a reassessment has given the pressure: medical control does not ask for it again
    expect(medic(['reassess', 'med-control']).log.at(-1)!.text).toMatch(/0\.8 mg every 5 minutes/);
  });
});

describe('hypertensive pulmonary edema in the field — the scoring', () => {
  it('a hand-off with CPAP never applied ends the case and says what was missed', () => {
    const s = medic(['primary', 'vitals', 'lungs', 'ask-pde5', 'nitro-high', 'transport-near', ...R(1), 'bvm', ...R(5), 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.toFix.some((t) => t.kind === 'missed' && /^CPAP early/.test(t.label))).toBe(true);
    expect(r.percent).toBeLessThan(75);
  });

  it('the hint at the start names the pressure; after it, CPAP', () => {
    expect(takeHint(sc, start(sc, 2)).log.at(-1)!.text).toMatch(/^Hint: Vital signs, the blood pressure first/);
    // a hint gives no measurement nobody has taken yet, and does not read her 12-lead before it is recorded
    expect(takeHint(sc, start(sc, 2)).log.at(-1)!.text).not.toMatch(/\d{3}\/\d{2,3}/);
    expect(sc.critical.find((c) => c.id === 'ecg')!.why).not.toMatch(/hers shows/i);
    expect(takeHint(sc, medic(['vitals', 'lungs'])).log.at(-1)!.text).toMatch(/^Hint: CPAP early/);
    expect(takeHint(sc, emt(['vitals', 'lungs', 'cpap'])).log.at(-1)!.text).toMatch(/^Hint: Request a paramedic intercept/);
  });

  it('the blood-pressure recheck counts from CPAP or the first nitrate, and is not asked of a crew that gave neither', () => {
    expect(toFix(medic(['vitals', 'cpap', 'vitals']), /^Recheck the blood pressure/)).toBeUndefined();
    expect(toFix(medic(['vitals', 'cpap']), /^Recheck the blood pressure/)?.kind).toBe('missed');
    expect(toFix(medic(['vitals', 'lungs']), /^Recheck the blood pressure/)).toBeUndefined();
  });
});
