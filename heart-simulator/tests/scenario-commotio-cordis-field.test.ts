import { describe, expect, it } from 'vitest';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, clockText, criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { commotioField as sc } from '@/lib/sim/scenario/scenarios/commotioField';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const missed = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label))?.kind === 'late';

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['als', 'aed', 'cpr', 'bvm', 'vitals', 'ecg12', 'ecg-transmit', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  2: ['defib', 'cpr', 'bvm', 'capno', 'iv', 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
};

/** Each role's ideal run up to ROSC */
const TO_ROSC: Record<1 | 2, string[]> = { 1: ['als', 'aed', 'cpr'], 2: ['defib', 'cpr'] };

/** The paramedic who treats it as trauma first: a line and an airway before the defibrillator, so the first shock comes at minute 5 */
const LATE_SHOCK = ['iv', 'airway', 'defib'];

/** Correct care for VF that outlasts that late first shock: CPR between shocks, epinephrine after the second, amiodarone after the third */
const LATE_TO_ROSC = [...LATE_SHOCK, 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'cpr', 'defib', 'cpr'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bVF\b|\bPEA\b|asystole|pulseless electrical|commotio|organized/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis/i;

describe('commotio cordis in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions and rhythms that exist', () => {
    expect(sc).toMatchObject({ id: 'commotio-cordis-field', setting: 'field', roles: [1, 2] });
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('vf');
    expect(sc.initial.pulse).toBe(false);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      // a harm meant for one role names only actions that role can take
      for (const role of h.roles ?? []) {
        const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
        expect(h.actions.some((id) => scope.has(id)), `harm ${h.id} role ${role}`).toBe(true);
      }
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // a healthy heart: nothing he has makes calcium, bicarbonate or insulin right
    expect(sc.problems ?? []).toEqual([]);
  });

  it('nothing the learner sees before the arrest is worked names the rhythm or the cause — but the story is there, and so is the trauma lure', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/\bVF\b|fibrillation|commotio|ventricular/i);
    expect(opening).toMatch(/line drive/);
    expect(opening).toMatch(/coach is doing CPR/);
    expect(opening).toMatch(/Don't move his neck/);
  });

  it('the EMT is told no paramedic was sent (a sports injury); the paramedic has an EMT partner and the defibrillator', () => {
    expect(start(sc, 1).log.some((l) => /dispatched as a sports injury, no paramedic unit has been sent/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor-defibrillator and the drug box/.test(l.text))).toBe(true);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    expect(sc.teaching.join(' ')).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
    for (const l of medic([...LATE_TO_ROSC, 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('commotio cordis in the field — the ideal runs', () => {
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
      // one early shock did it: the drugs for VF that persists never came into play, and the breaths were in hand in time
      expect(s.flags.refractory).toBeUndefined();
      expect(r.wentWell.map((w) => w.label).join(' ')).not.toMatch(/Epinephrine|Amiodarone|Breaths during CPR/);
      expect(s.fired).not.toContain('refib');
      expect(s.fired).not.toContain('hyperventilated');
    });
  }

  it('the paramedic reads the 12-lead after ROSC as sinus tachycardia, at no cost; a STEMI read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'sinus-tach', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 118: .*no ST elevation.*commotio cordis/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const wrong = medic(readAfter(IDEAL[2], 'ecg12', 'stemi-anterior'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(s.log.some((l) => /12-lead acquired\. You can't interpret it/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'hospital' && /ECG received.*cardiac arrest center/.test(l.text))).toBe(true);
  });

  it('correct alternatives score full marks too: the AED from the paramedic, CPR first while the pads go on, an airway after ROSC', () => {
    const runs = [
      medic(['aed', 'cpr', 'bvm', 'capno', 'iv', 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']),
      medic(['cpr', 'defib', 'cpr', 'bvm', 'capno', 'io', 'pressor', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']),
      medic(['pads', 'defib', 'cpr', 'airway', 'iv', 'push-epi', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']),
      emt(['aed', 'cpr', 'als', 'bvm', 'nibp', 'ecg12', 'ecg-transmit', 'transport-pci', UNTIL_ARRIVED, 'handoff']),
      emt(['als', 'aed', 'cpr', 'bvm', 'nibp', 'ecg12', 'ecg-transmit', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff']),
    ];
    for (const s of runs) {
      expect(s.ended?.reason, said(s)).toBe('complete');
      const r = review(sc, s);
      expect(r.toFix, JSON.stringify(s.performed.map((p) => p.id))).toEqual([]);
      expect(r.percent).toBe(100);
    }
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the cause', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic([...LATE_TO_ROSC, 'reassess', 'reassess', 'capno', 'bvm', 'nibp', 'fluid', 'ecg12']),
      medic(['defib', 'pulse-check', 'aed', 'reassess', 'cpr', 'defib', 'cardiovert', 'pace']),
      medic(['defib', 'iv', 'reassess', 'defib', 'cpr', 'reassess', 'reassess', 'capno', 'amio-arrest', 'epinephrine', 'nitro', 'metoprolol']),
      emt(['primary', 'opqrst', 'sample', 'als', 'cpr', 'aed', 'cpr', 'aed', 'cpr', 'aed', 'cpr', 'aed', 'cpr', 'aed', 'cpr', 'vitals']),
      emt(['aed', 'aed', 'pulse-check', 'cpr', 'o2-nrb', 'cpap', 'epi-im', 'reassess', 'reassess', 'cpr', 'aed']),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('is deterministic', () => {
    expect(medic(IDEAL[2])).toEqual(medic(IDEAL[2]));
    expect(emt(IDEAL[1])).toEqual(emt(IDEAL[1]));
  });
});

describe('commotio cordis in the field — what brings him back', () => {
  it('starts pulseless in VF with the coach compressing; no 12-lead in the arrest', () => {
    const s = start(sc, 2);
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'vf', hr: 0 });
    expect(s.flags.arrest).toBe(0);
    expect(sc.status!(s)).toMatch(/the coach is still doing compressions/);
    const ecg = perform(sc, s, 'ecg12');
    expect(ecg.counts.ecg12).toBeUndefined();
    expect(ecg.minute).toBe(0);
  });

  it('an early shock stops the VF — a stunned heart with no pulse yet — and the CPR after it brings ROSC', () => {
    for (const role of [1, 2] as const) {
      const shocked = runScenario(sc, role, TO_ROSC[role].slice(0, -1));
      expect(shocked.pulse).toBe(false);
      expect(shocked.rhythm).toEqual({ profile: 'pea', hr: 56 });
      expect(shocked.flags.converted).toBeDefined();
      // the line is the same as for a shock that fails: the monitor is the learner's to read
      expect(shocked.log.at(-1)!.text).toMatch(role === 1 ? /^AED: "Shock advised\." Shock delivered\. Resume CPR\.$/ : /^Shock delivered: 200 J\. Resume CPR immediately\.$/);
      const s = perform(sc, shocked, 'cpr');
      expect(s.pulse).toBe(true);
      expect(s.flags.rosc).toBeCloseTo(shocked.minute + 2, 5);
      expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 118 });
      expect([s.vitals.sbp, s.vitals.dbp, s.vitals.rr, s.vitals.gcs]).toEqual([86, 50, 8, 6]);
      expect(s.log.some((l) => /a carotid pulse — ROSC/.test(l.text))).toBe(true);
      expect(s.log.at(-1)).toMatchObject({ who: 'partner', text: expect.stringMatching(/I've got the bag on him/) });
      // the case waits for the care after ROSC
      expect(s.ended).toBeNull();
    }
  });

  it('a first shock within 3 minutes of arrival works; after that the VF outlasts it', () => {
    // CPR first while the pads go on, then the shock at minute 2: it works
    expect(medic(['cpr', 'defib']).rhythm.profile).toBe('pea');
    // a line and an airway first: the shock at minute 5 does not
    const s = medic(LATE_SHOCK);
    expect(s.performed.at(-1)).toEqual({ id: 'defib', minute: 5 });
    expect(s.rhythm.profile).toBe('vf');
    expect(s.flags.refractory).toBeDefined();
    expect(s.flags.converted).toBeUndefined();
  });

  it('VF that outlasts the first shock needs what refractory VF needs: CPR between shocks, epinephrine and amiodarone — then ROSC', () => {
    const steps = LATE_TO_ROSC;
    let s = medic(steps.slice(0, -2));
    // three shocks, epinephrine after the second: still VF until amiodarone is in
    expect(s.rhythm.profile).toBe('vf');
    expect(s.flags.refractory2).toBeDefined();
    s = medic(steps.slice(0, -1));
    expect(s.rhythm.profile).toBe('pea');
    s = medic(steps);
    expect(s.pulse).toBe(true);
    // the paramedic's drug items now apply, and are done; the airway placed in the arrest counts for the breaths
    const done = medic([...steps, 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    const r = review(sc, done);
    expect(r.wentWell.map((w) => w.label)).toEqual(expect.arrayContaining([
      'Epinephrine 1 mg IV/IO once VF has outlasted the shocks', 'Amiodarone 300 mg (or lidocaine) for VF that persists', 'Breaths during CPR: bag-mask 30:2 (or an advanced airway)',
      'After ROSC: take his breaths in hand — 1 every 6 seconds, SpO₂ 90–98 %',
    ]));
    // the cost is the delay: the two harms, and half the points of a late first shock — nothing for the correct drugs
    expect(penalties(done)).toEqual(['iv-before-shock', 'airway-before-shock']);
    expect(late(done, /^Shock at once/)).toBe(true);
    expect(r.toFix.filter((t) => t.kind === 'missed')).toEqual([]);
  });

  it('without the antiarrhythmic the fourth shock works, and the item is missed; without any drugs, the fifth', () => {
    const noAmio = medic([...LATE_SHOCK, 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'cpr', 'defib', 'cpr']);
    expect(noAmio.pulse).toBe(true);
    expect(missed(noAmio, /^Amiodarone 300 mg/)).toBe(true);
    // four shocks and no drugs: still VF; the fifth works
    const noDrugs = medic([...LATE_SHOCK, 'cpr', 'defib', 'cpr', 'defib', 'cpr', 'defib']);
    expect(noDrugs.rhythm.profile).toBe('vf');
    const fifth = perform(sc, perform(sc, noDrugs, 'cpr'), 'defib');
    expect(fifth.rhythm.profile).toBe('pea');
    expect(missed(fifth, /^Epinephrine 1 mg/)).toBe(true);
  });

  it('no compressions after the shock that stopped the VF: within 2 minutes it fibrillates again — and the next shock stops it again', () => {
    let s = medic(['defib', 'iv']);
    expect(s.fired).toContain('refib');
    expect(s.rhythm.profile).toBe('vf');
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Monitor alarm.')).toBe(true);
    expect(s.log.some((l) => /nobody has been on his chest since the shock/.test(l.text))).toBe(true);
    s = perform(sc, s, 'defib');
    expect(s.rhythm.profile).toBe('pea');
    // shocking the VF that came back is right, not a stacked shock (the missing CPR has already cost)
    expect(s.penalties).toEqual([]);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(late(medic(['defib', 'iv', 'defib', 'cpr', 'bvm']), /^Compressions again at once/)).toBe(true);
    // the EMT's AED, put back on the VF that came back, analyzes and shocks at no cost
    const e = emt(['aed', 'primary', 'opqrst', 'aed']);
    expect(e.fired).toContain('refib');
    expect(e.penalties).toEqual([]);
    expect(e.rhythm.profile).toBe('pea');
  });

  it('no shock at all: he dies at 20 minutes, scored as no ROSC', () => {
    let s = medic(['cpr']);
    for (let i = 0; i < 12 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(s.ended?.minute).toBeGreaterThanOrEqual(20);
    expect(s.log.at(-1)!.text).toMatch(/Despite resuscitation there is no return of circulation/);
    const r = review(sc, s);
    expect(r.percent).toBeLessThanOrEqual(40);
    expect(r.toFix.some((t) => t.kind === 'missed' && /^Shock at once/.test(t.label))).toBe(true);
  });

  it('for the EMT the medics arrive 6 minutes after the call; with VF that outlasts the shocks they give epinephrine and amiodarone', () => {
    let s = emt(['primary', 'opqrst', 'als', 'cpr', 'aed']);
    expect(s.flags.refractory).toBeDefined();
    for (let i = 0; i < 3; i++) s = perform(sc, perform(sc, s, 'cpr'), 'aed');
    expect(s.fired).toEqual(expect.arrayContaining(['als-arrives', 'als-epi', 'als-amio']));
    expect(s.flags['als-here'] - s.flags.als).toBeGreaterThanOrEqual(6);
    expect(s.rhythm.profile).toBe('pea');
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    // the EMT never had the drugs to give: no item asks for them
    expect(criticalsFor(sc, 1).some((c) => /Epinephrine|Amiodarone/.test(c.label))).toBe(false);
    expect(missed(s, /^Breaths during CPR/)).toBe(true);
  });

  it('medics who find him not yet shocked tell the EMT to put the AED on — they do not shock for the EMT', () => {
    let s = emt(['als', 'cpr', 'cpr', 'cpr', 'cpr']);
    expect(s.fired).toContain('als-arrives');
    expect(s.log.some((l) => l.who === 'team' && /has not been shocked yet\? Get the AED on him/.test(l.text))).toBe(true);
    expect(s.rhythm.profile).toBe('vf');
    s = perform(sc, s, 'aed');
    expect(s.flags.refractory).toBeDefined();
  });

  it('after ROSC the medics treat the EMT\'s low pressure; the EMT measures and reports it', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toContain('als-post-rosc');
    expect(s.log.some((l) => l.who === 'team' && /fluid bolus for his pressure: BP 98\/58, MAP 71/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /BP 86\/50 · pulse 118/.test(l.text))).toBe(true);
  });
});

describe('commotio cordis in the field — after ROSC', () => {
  it('left to bag alone, the partner hyperventilates him: EtCO₂ falls, the pressure falls; taking the bag in hand fixes both, late', () => {
    const rosc = medic([...TO_ROSC[2], 'capno']);
    expect(rosc.vitals.etco2).toBe(44);
    let s = perform(sc, rosc, 'reassess');
    expect(s.fired).toContain('hyperventilated');
    expect([s.vitals.rr, s.vitals.etco2, s.vitals.spo2]).toEqual([30, 24, 100]);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([78, 44]);
    // the capnograph on: it alarms; put on only now, it shows the rate too
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'EtCO₂ 24 mmHg.')).toBe(true);
    expect(perform(sc, perform(sc, medic(TO_ROSC[2]), 'reassess'), 'capno').log.at(-1)!.text).toBe('EtCO₂ 24 mmHg, 30 breaths a minute.');
    expect(sc.status!(s)).toMatch(/bagging him fast/);
    s = perform(sc, s, 'bvm');
    expect([s.vitals.rr, s.vitals.etco2, s.vitals.spo2, s.vitals.sbp, s.vitals.dbp]).toEqual([10, 38, 97, 86, 50]);
    expect(s.log.at(-2)!.text).toMatch(/^You take the bag from your partner and slow it down: 1 breath every 6 seconds/);
    expect(s.log.at(-1)!.text).toBe('SpO₂ 97%. EtCO₂ 38 mmHg.');
    expect(sc.status!(s)).toMatch(/ventilated at 10\/min/);
    const done = medic([...TO_ROSC[2], 'capno', 'reassess', 'bvm', 'iv', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(late(done, /^After ROSC: take his breaths in hand/)).toBe(true);
    // the EMT has no capnograph: the partner's pace is what tells
    const e = perform(sc, emt(TO_ROSC[1]), 'reassess');
    expect(e.fired).toContain('hyperventilated');
    expect(e.log.some((l) => l.who === 'monitor' && /EtCO₂/.test(l.text))).toBe(false);
  });

  it('the bag taken in hand at once: 10 breaths a minute, SpO₂ 97 %, EtCO₂ 40 — no hyperventilation', () => {
    const s = medic([...TO_ROSC[2], 'capno', 'bvm', 'reassess', 'reassess']);
    expect(s.fired).not.toContain('hyperventilated');
    expect([s.vitals.rr, s.vitals.spo2, s.vitals.etco2]).toEqual([10, 97, 40]);
  });

  it('an airway after ROSC ventilates him as the bag does; one placed in the arrest goes on from the moment of ROSC', () => {
    const after = medic([...TO_ROSC[2], 'airway']);
    expect([after.vitals.rr, after.vitals.etco2]).toEqual([10, 40]);
    expect(after.flags.capno).toBeDefined();
    expect(after.penalties).toEqual([]);
    const during = medic(LATE_TO_ROSC);
    expect(during.vitals.rr).toBe(10);
    expect(during.log.some((l) => /Still ventilating through the airway/.test(l.text))).toBe(true);
    expect(perform(sc, perform(sc, during, 'reassess'), 'reassess').fired).not.toContain('hyperventilated');
  });

  it('fluid or a vasopressor bring the MAP to 65 or more — and never lower a higher pressure; only after ROSC do they count', () => {
    const rosc = medic([...TO_ROSC[2], 'bvm', 'iv']);
    const fl = perform(sc, rosc, 'fluid');
    expect(fl.log.at(-1)!.text).toBe('Bolus in. BP 98/58, MAP 71.');
    const pr = perform(sc, rosc, 'pressor');
    expect([pr.vitals.sbp, pr.vitals.dbp]).toEqual([104, 64]);
    expect(penalties(pr)).toEqual([]);
    let high = rosc;
    for (let i = 0; i < 4; i++) high = perform(sc, high, 'fluid');
    for (const id of ['pressor', 'push-epi']) {
      const s = perform(sc, high, id);
      expect(s.vitals.sbp, id).toBeGreaterThanOrEqual(high.vitals.sbp);
    }
    expect(missed(rosc, /^After ROSC: treat the low pressure/)).toBe(true);
    // a fluid bolus in the arrest is not the treatment of the low pressure after it
    const arrestFluid = medic(['iv', 'fluid', 'defib', 'cpr']);
    expect(arrestFluid.pulse).toBe(true);
    expect(missed(arrestFluid, /^After ROSC: treat the low pressure/)).toBe(true);
  });

  it('a mask or a cannula does not ventilate him after ROSC; CPAP costs points', () => {
    const rosc = medic(TO_ROSC[2]);
    expect(perform(sc, rosc, 'o2-nrb').log.at(-1)!.text).toMatch(/a mask alone will not ventilate him/);
    expect(perform(sc, rosc, 'o2-nc').log.at(-1)!.text).toMatch(/A cannula does not ventilate/);
    expect(penalties(perform(sc, rosc, 'cpap'))).toEqual(['cpap-unresponsive']);
    expect(penalties(perform(sc, emt(['aed']), 'cpap'))).toEqual(['cpap-unresponsive']);
    expect(missed(perform(sc, rosc, 'o2-nrb'), /^After ROSC: take his breaths in hand/)).toBe(true);
  });

  it('the nearest emergency department after ROSC is no harm, but it is not the cardiac arrest center: the item is missed', () => {
    const s = medic(['defib', 'cpr', 'bvm', 'capno', 'iv', 'fluid', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.penalties).toEqual([]);
    expect(review(sc, s).toFix.map((t) => t.label)).toEqual(['After ROSC: transport to the cardiac arrest center']);
  });

  it('after ROSC he does not wake: no aspirin by mouth and no vagal maneuver (no time, no cost)', () => {
    const rosc = medic(TO_ROSC[2]);
    for (const id of ['aspirin', 'vagal']) {
      const s = perform(sc, rosc, id);
      expect(s.counts[id], id).toBeUndefined();
      expect(s.minute, id).toBe(rosc.minute);
      expect(s.penalties, id).toEqual([]);
    }
    const nitro = perform(sc, emt(TO_ROSC[1]), 'nitro-assist');
    expect(nitro.counts['nitro-assist']).toBeUndefined();
  });
});

describe('commotio cordis in the field — the traps', () => {
  it('a pulse check straight after the shock finds no pulse and costs once; one after the 2 minutes of CPR does not', () => {
    let s = medic(['defib', 'pulse-check']);
    expect(s.log.at(-1)!.text).toBe('No carotid pulse (checked for less than 10 seconds).');
    expect(penalties(s)).toEqual(['pulse-check-after-shock']);
    s = perform(sc, perform(sc, s, 'pulse-check'), 'cpr');
    expect(penalties(s)).toEqual(['pulse-check-after-shock']);
    // the shock that worked still brings ROSC with the CPR after it
    expect(s.pulse).toBe(true);
    expect(late(medic(['defib', 'pulse-check', 'cpr', 'bvm']), /^Compressions again at once/)).toBe(false);
    // in refractory VF a pulse check after the CPR cycle is part of the rhythm check, and costs nothing
    expect(penalties(medic([...LATE_SHOCK, 'cpr', 'pulse-check']))).toEqual(['iv-before-shock', 'airway-before-shock']);
    // the EMT too
    expect(penalties(emt(['aed', 'pulse-check']))).toEqual(['pulse-check-after-shock']);
  });

  it('an AED analysis straight after the shock is a pause and costs; the AED says no shock for the stunned heart', () => {
    const s = emt(['aed', 'aed']);
    expect(penalties(s)).toEqual(['reanalyze-after-shock']);
    expect(s.log.at(-1)!.text).toBe('AED: "No shock advised. Start CPR."');
    // in VF that persists, a second analysis with no CPR stacks the shock
    const stacked = medic([...LATE_SHOCK, 'aed']);
    expect(penalties(stacked)).toContain('reanalyze-after-shock');
    // after 2 minutes of CPR the next analysis is right
    expect(penalties(emt(['aed', 'cpr', 'als', 'aed']))).toEqual([]);
  });

  it('a second manual shock with no CPR after the first is stacking; after a CPR cycle it is right', () => {
    expect(penalties(medic([...LATE_SHOCK, 'defib']))).toEqual(['iv-before-shock', 'airway-before-shock', 'stacked-shock']);
    expect(penalties(medic([...LATE_SHOCK, 'cpr', 'defib']))).toEqual(['iv-before-shock', 'airway-before-shock']);
    // and it gains nothing: a stacked shock does not count toward the ones refractory VF needs
    const spaced = medic([...LATE_SHOCK, 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'cpr', 'defib']);
    expect(spaced.rhythm.profile).toBe('pea');
    const stacked = medic([...LATE_SHOCK, 'cpr', 'defib', 'defib', 'epinephrine', 'cpr', 'defib']);
    expect(stacked.counts.defib).toBe(spaced.counts.defib);
    expect(stacked.rhythm.profile).toBe('vf');
    // a manual shock on the stunned heart is the built-in error (a rhythm a shock does not treat)
    expect(penalties(medic(['defib', 'defib']))).toEqual(['shock-nonshockable']);
  });

  it('an IV, an IO or an airway before the first shock costs; after the shock, during the CPR, it is right', () => {
    expect(penalties(medic(['iv']))).toEqual(['iv-before-shock']);
    expect(penalties(medic(['io']))).toEqual(['iv-before-shock']);
    expect(penalties(medic(['airway']))).toEqual(['airway-before-shock']);
    expect(penalties(medic(['defib', 'cpr', 'iv']))).toEqual([]);
    // a line and a look first, so the shock comes late and fails: the airway in the CPR after it costs nothing more
    expect(penalties(medic(['iv', 'primary', 'hs-ts', 'defib', 'cpr', 'airway']))).toEqual(['iv-before-shock']);
  });

  it('epinephrine or an antiarrhythmic before the VF has outlasted a shock costs a little; after a failed shock they are right', () => {
    expect(penalties(medic(['iv', 'epinephrine']))).toEqual(['iv-before-shock', 'epi-not-yet']);
    expect(penalties(medic(['defib', 'io', 'epinephrine']))).toEqual(['epi-not-yet']);
    expect(penalties(medic(['defib', 'io', 'amio-arrest']))).toEqual(['antiarrhythmic-not-yet']);
    expect(penalties(medic(['defib', 'io', 'lidocaine']))).toEqual(['antiarrhythmic-not-yet']);
    expect(penalties(medic([...LATE_SHOCK, 'epinephrine', 'cpr', 'defib', 'amio-arrest']))).toEqual(['iv-before-shock', 'airway-before-shock']);
    // lidocaine is the alternative to amiodarone, and counts as it
    const lido = medic([...LATE_SHOCK, 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'lidocaine', 'cpr', 'defib', 'cpr']);
    expect(lido.pulse).toBe(true);
    expect(missed(lido, /^Amiodarone 300 mg/)).toBe(false);
  });

  it('epinephrine again within 3 minutes is a minor error', () => {
    const s = medic([...LATE_SHOCK, 'cpr', 'defib', 'epinephrine', 'epinephrine']);
    expect(penalties(s)).toEqual(['iv-before-shock', 'airway-before-shock', 'epi-too-soon']);
  });

  it('loading him in the arrest — the trauma reflex — costs once, in the case\'s own words', () => {
    for (const id of ['transport-near', 'transport-pci']) {
      const s = medic(['cpr', id]);
      expect(penalties(s), id).toEqual(['transport-in-arrest']);
      expect(s.penalties[0].text).toMatch(/It looks like a trauma arrest, but the blow set off VF/);
    }
    expect(penalties(emt(['transport-pci']))).toEqual(['transport-in-arrest']);
    // the transport item counts only from ROSC
    const s = medic(['transport-pci', 'defib', 'cpr']);
    expect(s.pulse).toBe(true);
    expect(s.flags['dest-pci']).toBeLessThan(s.flags.rosc);
    expect(review(sc, stop(s)).wentWell.find((w) => /cardiac arrest center/.test(w.label))?.detail).toBe(`at ${clockText(s.flags.rosc)}`);
    // two minutes on the stretcher with nobody on his chest after a shock that worked: he fibrillates again
    expect(medic(['defib', 'transport-pci']).fired).toContain('refib');
  });

  it('medical control backs the crew: a cardiac arrest worked on scene, no collar or board before the shock — at no cost', () => {
    const s = emt(['cpr', 'med-control']);
    expect(s.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/not a trauma call.*no collar or board before the shock/) });
    expect(s.penalties).toEqual([]);
    expect(perform(sc, medic(TO_ROSC[2]), 'med-control').log.at(-1)!.text).toMatch(/cardiac arrest center.*SpO₂ 90 to 98.*MAP under 65/);
  });

  it('after ROSC: compressions, arrest-dose drugs, a rate-control drug, nitroglycerin or a sedative are errors', () => {
    const rosc = perform(sc, medic([...TO_ROSC[2], 'bvm']), 'iv');
    const cpr = perform(sc, rosc, 'cpr');
    expect(penalties(cpr)).toEqual(['cpr-with-pulse']);
    expect(cpr.log.at(-1)).toMatchObject({ who: 'partner', text: expect.stringMatching(/^Stop — there is a pulse/) });
    expect(penalties(perform(sc, rosc, 'epinephrine'))).toEqual(['arrest-epi-with-pulse']);
    const amio = perform(sc, rosc, 'amio-arrest');
    expect(penalties(amio)).toEqual(['arrest-amio-with-pulse']);
    expect(amio.vitals.sbp).toBeLessThan(rosc.vitals.sbp);
    for (const id of ['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide', 'adenosine6']) expect(penalties(perform(sc, rosc, id)), id).toEqual(['rate-drug-post-rosc']);
    for (const id of ['nitro', 'nitro-high']) expect(penalties(perform(sc, perform(sc, rosc, 'fluid'), id)), id).toEqual(['nitro-post-rosc']);
    for (const id of ['fentanyl', 'sedation', 'midazolam']) expect(penalties(perform(sc, rosc, id)), id).toEqual(['sedation-unresponsive']);
    expect(penalties(perform(sc, rosc, 'defib'))).toEqual(['shock-with-pulse']);
    // the AED is not put on a patient with a pulse: refused, no time, no cost
    const aed = perform(sc, rosc, 'aed');
    expect([aed.minute, aed.counts.aed, aed.penalties]).toEqual([rosc.minute, rosc.counts.aed, []]);
  });

  it('drugs for a tachycardia with a pulse, IM epinephrine and drugs with no indication cost a little in the arrest', () => {
    for (const id of ['adenosine6', 'metoprolol', 'diltiazem', 'procainamide', 'amio-infusion']) {
      expect(penalties(medic(['defib', 'io', id])), id).toEqual(['rate-drug-arrest']);
    }
    const infusion = medic([...LATE_SHOCK, 'amio-infusion']);
    expect(infusion.flags.amiodarone).toBeUndefined();
    expect(penalties(emt(['aed', 'cpr', 'epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
    expect(penalties(medic(['defib', 'io', 'glucagon']))).toEqual(['no-indication']);
    for (const id of ['calcium-chloride', 'sodium-bicarbonate', 'magnesium-sulfate']) {
      expect(penalties(medic(['defib', 'io', id]))[0], id).toMatch(/no-indication|routine-arrest/);
    }
    expect(penalties(medic(['cardiovert']))).toEqual(['sync-in-arrest']);
    expect(penalties(medic(['pace']))).toEqual(['pace-in-arrest']);
    // fentanyl in the arrest is refused: no time, no cost
    const f = perform(sc, medic(['defib', 'io']), 'fentanyl');
    expect(f.counts.fentanyl).toBeUndefined();
  });

  it('the hint names the shock first, and costs points', () => {
    for (const role of [1, 2] as const) {
      const s = takeHint(sc, start(sc, role));
      expect(s.log.at(-1)!.text).toMatch(/^Hint: Shock at once: AED or manual defibrillator\./);
      expect(s.penalties).toEqual([expect.objectContaining({ points: 2 })]);
    }
  });

  it('every action in scope, from the arrest, the stunned heart and after ROSC, keeps a real rhythm and never names it on the monitor', () => {
    for (const role of [1, 2] as LearningLevel[]) {
      const from = [start(sc, role), runScenario(sc, role, TO_ROSC[role as 1 | 2].slice(0, -1)), runScenario(sc, role, [...TO_ROSC[role as 1 | 2], 'bvm'])];
      for (const base of from) {
        for (const iv of interventionsFor(role, 'field')) {
          let s = perform(sc, base, iv.id);
          while (s.pendingRead) s = { ...s, pendingRead: null };
          expect(resolveProfile(s.rhythm.profile).id, `${role} ${iv.id}`).toBe(s.rhythm.profile);
          for (const l of s.log) if (l.who === 'monitor') expect(l.text, `${role} ${iv.id}`).not.toMatch(GIVEAWAY);
          expect(Number.isFinite(s.minute)).toBe(true);
        }
      }
    }
  });
});

describe('commotio cordis in the field — review fixes', () => {
  it('VF that came back after a shock that worked: epinephrine in the CPR after the second shock is the algorithm, not an error', () => {
    // no CPR after the first shock (the error), VF back at 2:18, shocked again at once: epinephrine where the algorithm puts it
    const s = medic(['defib', 'iv', 'defib', 'epinephrine', 'cpr']);
    expect(s.fired).toContain('refib');
    expect(s.counts.defib).toBe(2);
    expect(penalties(s)).toEqual([]);
    expect(s.pulse).toBe(true);
    // the whole run: the only thing to fix is the late compressions after the first shock
    const done = medic(['defib', 'iv', 'defib', 'epinephrine', 'cpr', 'bvm', 'capno', 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(done.penalties).toEqual([]);
    expect(review(sc, done).toFix.map((t) => [t.kind, t.label])).toEqual([['late', 'Compressions again at once after the shock']]);
    // epinephrine into the VF that came back, before shocking it again, is still early
    expect(penalties(medic(['defib', 'iv', 'epinephrine']))).toEqual(['epi-not-yet']);
    // an antiarrhythmic for VF that came back after a shock is no error (ALPS: persistent or recurrent VF after one shock)
    expect(penalties(medic(['defib', 'iv', 'amio-arrest']))).toEqual([]);
    expect(penalties(medic(['defib', 'iv', 'lidocaine']))).toEqual([]);
  });

  it('VF that came back and is left unshocked for more than 3 minutes outlasts the next shock', () => {
    const s = medic(['defib', 'iv', 'cpr', 'cpr', 'defib']);
    expect(s.fired).toContain('refib');
    expect(s.rhythm.profile).toBe('vf');
    expect(s.flags.refractory).toBeDefined();
    // shocked within 3 minutes of coming back, it stops again
    expect(medic(['defib', 'iv', 'cpr', 'defib']).rhythm.profile).toBe('pea');
  });

  it('with no shock at all, the compressions "after the shock" are not counted as missed — the missing shock is', () => {
    const r = review(sc, stop(medic(['cpr'])));
    expect(r.toFix.some((t) => /^Shock at once/.test(t.label))).toBe(true);
    expect(r.toFix.some((t) => /^Compressions again at once/.test(t.label))).toBe(false);
  });

  it('after a shock with nobody on his chest, no line says compressions go on', () => {
    const shocked = medic(['defib']);
    expect(sc.status!(shocked)).toBe('Unresponsive, no pulse; nobody has been on his chest since the shock.');
    const airway = medic(['defib', 'airway']);
    expect(said(airway)).toMatch(/Supraglottic airway placed with nobody on his chest since the shock/);
    expect(said(airway)).not.toMatch(/while compressions go on/);
    expect(medic(['defib', 'bvm']).log.at(-1)!.text).toMatch(/2 breaths, each over 1 second; chest rising — but nobody is on his chest/);
    const capno = medic(['defib', 'bvm', 'capno']);
    expect(capno.log.some((l) => l.who === 'monitor' && l.text === 'EtCO₂ 6 mmHg.')).toBe(true);
    expect(said(capno)).not.toMatch(/the coach's compressions/);
    // the compressions after a shock that failed are the crew's: the coach stood clear for it
    expect(medic([...LATE_SHOCK, 'cpr']).log.at(-1)!.text).toMatch(/^Back on his chest: 2 minutes of compressions/);
    // before any shock the coach is still compressing
    expect(sc.status!(start(sc, 2))).toMatch(/the coach is still doing compressions/);
    expect(medic(['airway']).log.at(-1)!.text).toMatch(/while compressions go on/);
  });

  it('pads put on first are not put on again by the AED or the defibrillator — and the run still scores full marks', () => {
    const e = emt(['pads', 'aed']);
    expect(e.log.some((l) => l.text === 'Pads already on; the coach keeps pushing; everyone clear for the analysis.')).toBe(true);
    expect(said(e)).not.toMatch(/AED pads on his bare chest/);
    expect(medic(['pads', 'defib']).log.some((l) => l.text === 'Pads already on; the coach keeps pushing; charged to 200 J; everyone clear.')).toBe(true);
    const full = emt(['pads', 'aed', 'cpr', 'als', 'bvm', 'vitals', 'ecg12', 'ecg-transmit', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, full).percent).toBe(100);
  });

  it('the Hs and Ts name no rhythm and no treatment, and rule nothing out flat', () => {
    const before = medic(['hs-ts']).log.at(-1)!.text;
    expect(before).not.toMatch(/defibrillat|shock|\bVF\b|fibrillation|ventricular/i);
    expect(before).toMatch(/Tamponade: .* unlikely/);
    expect(before).toMatch(/no breath given yet/);
    expect(medic(['bvm', 'hs-ts']).log.at(-1)!.text).toMatch(/rises evenly with each breath/);
  });

  it('on the way to the nearest department the hospital says nothing of the heart center', () => {
    const s = emt(['aed', 'cpr', 'bvm', 'ecg12', 'transport-near', 'ecg-transmit', 'notify']);
    const after = s.log.filter((l) => l.who === 'hospital' && l.minute > s.flags.enroute);
    expect(after.map((l) => l.text)).toEqual([
      'ECG received; the physician is reviewing it.',
      'Copy: 19-year-old, a pulse back after a cardiac arrest on the baseball field. We will be ready in the resuscitation bay.',
    ]);
  });

  it('midazolam in the arrest is refused like the other sedatives: no time, no cost', () => {
    const base = medic(['defib', 'io']);
    const s = perform(sc, base, 'midazolam');
    expect([s.minute, s.counts.midazolam, s.penalties]).toEqual([base.minute, undefined, []]);
  });

  it('an airway placed in the arrest has his breaths in hand from ROSC — in the times as in the score', () => {
    const r = review(sc, medic(LATE_TO_ROSC));
    expect(r.timings.find((t) => t.label === 'Breaths taken in hand after ROSC')?.minute).toBe(0);
  });

  it('the went-well list does not claim "no pulse check" when there was one (the check is its own harm)', () => {
    const s = medic(['defib', 'pulse-check', 'cpr', 'bvm', 'capno', 'iv', 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    const r = review(sc, s);
    expect(r.wentWell.map((w) => w.label)).toContain('Compressions again at once after the shock');
    expect(r.wentWell.some((w) => /no pulse check/.test(w.label))).toBe(false);
    expect(r.toFix.map((t) => t.label)).toEqual(['A pulse check straight after the shock.']);
  });
});

describe('commotio cordis in the field — teaching', () => {
  it('teaches current practice: 2025 AHA post-arrest targets, the mechanism, and the shock before anything else', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why), ...sc.harms.map((h) => h.text)].join(' ');
    expect(text).toMatch(/SpO₂ 90–98 %/);
    expect(text).toMatch(/MAP (of )?(≥ )?65|MAP at 65 mmHg or more/);
    expect(text).not.toMatch(/92–98|SBP ≥ 90/);
    expect(text).toMatch(/upstroke of the T wave \(in the animal model, 10–30 ms before its peak\)/);
    expect(text).toMatch(/1 breath every 6 seconds/);
    expect(text).toMatch(/32–37\.5 °C for at least 36 hours/);
    expect(text).toMatch(/IV first/);
    expect(text).not.toMatch(/double sequential|vasopressin/i);
    // each role is scored on its own part: the EMT calls for ALS and transmits the 12-lead; the paramedic reads it and treats
    expect(criticalsFor(sc, 1).map((c) => c.id)).toEqual(['shock', 'cpr-after-shock', 'als', 'arrest-vent', 'post-vent', 'post-bp-check', 'post-ecg-transmit', 'transport', 'handoff']);
    expect(criticalsFor(sc, 2).map((c) => c.id)).toEqual(['shock', 'cpr-after-shock', 'access', 'epi', 'antiarrhythmic', 'arrest-vent', 'capno', 'post-vent', 'post-bp', 'post-ecg', 'transport', 'handoff']);
  });
});
