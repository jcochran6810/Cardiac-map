import { describe, expect, it } from 'vitest';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edVfArrest as sc } from '@/lib/sim/scenario/scenarios/edVfArrest';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { runScenario } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  6: ['call-help', 'cpr', 'defib', 'iv', 'cpr', 'defib', 'epinephrine', 'bvm', 'cpr', 'defib', 'amio-arrest', 'epinephrine', 'capno', 'cpr', 'defib',
    'cpr', 'pulse-check', 'pressor', 'bvm', 'ecg12', 'notify-physician', 'neuro', ...R(5), 'handoff'],
  // the second epinephrine 3.5 minutes after the first (every 3–5 minutes), as the tube goes in during the compressions
  7: ['defib', 'cpr', 'defib', 'epinephrine', 'airway', 'epinephrine', 'capno', 'cpr', 'defib', 'amio-arrest', 'hs-ts', 'cpr', 'defib',
    'cpr', 'pulse-check', 'pressor', 'bvm', 'ecg12', 'cath-lab-activate', 'neuro', 'temp-control', ...R(5), 'handoff'],
};

/** Each ideal run up to ROSC (the pulse check at the rhythm check after the converting shock) */
const TO_ROSC = { 6: IDEAL[6].slice(0, IDEAL[6].indexOf('pulse-check') + 1), 7: IDEAL[7].slice(0, IDEAL[7].indexOf('pulse-check') + 1) };

/** Each ideal run up to the converting (fourth) shock */
const TO_CONVERSION = { 6: TO_ROSC[6].slice(0, -2), 7: TO_ROSC[7].slice(0, -2) };

const nurse = (steps: string[]) => runScenario(sc, 6, steps);
const doctor = (steps: string[]) => runScenario(sc, 7, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const fix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState, label: RegExp) => fix(s).some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => fix(s).some((t) => t.kind === 'late' && label.test(t.label));

/** The voices whose lines are events or the monitor: none of them may name the rhythm or the diagnosis */
const EVENT_VOICES: Speaker[] = ['monitor', 'physician', 'nurse', 'team', 'consultant', 'hospital'];
const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bVF\b|infarct|occlu/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;

/** Every run the tests below play, for the whole-text checks */
const RUNS: [6 | 7, string[]][] = [
  [6, IDEAL[6]], [7, IDEAL[7]],
  [6, ['cpr', 'call-help', 'pads', 'defib']],
  [6, ['call-help', 'cpr', 'iv', 'cpr']],
  [7, ['cpr', 'cpr', 'defib']],
  [7, ['airway', 'defib', 'cpr', 'pulse-check', 'pulse-check', 'reassess', 'defib', 'defib']],
  [7, [...TO_CONVERSION[7], 'cpr', 'cpr', 'pressor', 'ecg12', 'reassess', 'reassess', 'reassess', 'admit']],
  [6, [...TO_ROSC[6], 'bvm', 'ecg12', 'neuro', ...R(7)]],
  [6, [...TO_ROSC[6], 'pressor', 'bvm', 'neuro', ...R(7)]],
  // the charge nurse calls the code; the physician shocks for a nurse who only compresses
  [6, ['cpr', 'cpr', 'cpr', 'cpr', 'cpr', 'cpr']],
  // a shock straight after the physician's, the doses the charge nurse gives
  [6, ['call-help', 'cpr', 'iv', 'capno', 'defib', 'cpr', 'defib', 'bvm', 'cpr', 'hs-ts', 'cpr', 'cpr', 'amio-arrest']],
  // bag-mask through the arrest, RSI after ROSC with the fast bagging still going, then the lab
  [7, ['defib', 'cpr', 'defib', 'epinephrine', 'bvm', 'cpr', 'defib', 'amio-arrest', 'capno', 'cpr', 'defib', 'cpr', 'pulse-check', 'pressor', 'rsi', 'bvm', 'ecg12', 'cath-lab-activate', 'reassess']],
  // a shock at the organized check
  [7, [...TO_CONVERSION[7], 'cpr', 'defib', 'pulse-check']],
];

describe('VF arrest in the emergency department — the case itself', () => {
  it('is an ED case for the ER nurse and the ER doctor, and refers only to actions, rhythms and rules that exist', () => {
    expect(sc).toMatchObject({ id: 'vf-arrest-ed', setting: 'ed', roles: [6, 7], cathLabMinutes: 10 });
    expect(sc.initial.pulse).toBe(false);
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('vf');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // a harm written for a role can be committed by it
      for (const h of sc.harms.filter((x) => x.roles?.includes(role))) expect(h.actions.some((id) => scope.has(id)), `role ${role}: ${h.id}`).toBe(true);
    }
    // nothing he has makes calcium, bicarbonate or magnesium right: the built-in rules judge them as given without an
    // indication. His arrest comes from an acute coronary syndrome
    expect(sc.problems ?? []).toEqual(['acs']);
  });

  it('each role has its own briefing and its own part: the nurse runs the code, the doctor leads it', () => {
    expect(start(sc, 6).log.some((l) => /You are his nurse/.test(l.text))).toBe(true);
    expect(start(sc, 7).log.some((l) => /you lead this code/.test(l.text))).toBe(true);
    const rn = criticalsFor(sc, 6).map((c) => c.id);
    const md = criticalsFor(sc, 7).map((c) => c.id);
    expect(rn).toEqual(expect.arrayContaining(['rn-code', 'rn-cpr', 'rn-shock', 'rn-epi', 'rn-antiarrhythmic', 'rn-capno', 'ask-pressor', 'rn-show', 'post-ventilation', 'post-ecg', 'handoff']));
    expect(md).toEqual(expect.arrayContaining(['md-shock', 'md-epi', 'md-antiarrhythmic', 'md-airway', 'md-hs-ts', 'md-post-bp', 'md-activate', 'md-temperature', 'post-ventilation', 'post-ecg', 'handoff']));
    // the physician's decisions are not the nurse's items, and the nurse's tasks are not the doctor's
    expect(rn.some((id) => id.startsWith('md-'))).toBe(false);
    expect(md.some((id) => id.startsWith('rn-'))).toBe(false);
  });

  it('nothing the learner sees before working the arrest names the rhythm or the cause', () => {
    const opening = [sc.title, sc.summary, ...Object.values(sc.briefing).flat().map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(GIVEAWAY);
    expect(opening).toMatch(/chest pressure/);
  });

  it('speaks with the department\'s voices and US spelling, and never names the rhythm in a monitor or event line', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const [role, steps] of RUNS) {
      const s = runScenario(sc, role, steps);
      for (const l of s.log) {
        expect(['operator', 'dispatch', 'scene', 'partner'], `${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
        expect(l.text, `${role}: ${l.text}`).not.toMatch(BRITISH);
        if (EVENT_VOICES.includes(l.who)) expect(l.text, `${role} ${l.who}: ${l.text}`).not.toMatch(GIVEAWAY);
      }
    }
  });
});

describe('VF arrest in the emergency department — the ideal runs', () => {
  for (const role of [6, 7] as const) {
    it(`role ${role}: ends by itself with full marks`, () => {
      const s = runScenario(sc, role, IDEAL[role], (x) => expect(resolveProfile(x.rhythm.profile).id).toBe(x.rhythm.profile));
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      // the hand-off is to the cath lab team, once the room is ready
      expect(s.log.at(-2)?.text).toMatch(/SBAR hand-off to the cath lab team/);
      expect(s.reads.map((x) => [x.answer, x.verdict])).toEqual([['stemi-inferior', 'correct']]);
      // the model run gives epinephrine every 3–5 minutes
      const epi = s.performed.filter((p) => p.id === 'epinephrine').map((p) => p.minute);
      expect(epi.length).toBe(2);
      expect(epi[1] - epi[0]).toBeGreaterThanOrEqual(3);
      expect(epi[1] - epi[0]).toBeLessThanOrEqual(5);
    });
  }

  it('the VF converts at the fourth shock, with no pulse yet: the pulse is found at the next rhythm check', () => {
    for (const role of [6, 7] as const) {
      const conv = runScenario(sc, role, TO_CONVERSION[role]);
      expect([conv.pulse, conv.rhythm.profile, conv.flags['shock-4'] !== undefined, 'converted' in conv.flags]).toEqual([false, 'inferior-stemi', true, true]);
      const s = runScenario(sc, role, TO_ROSC[role]);
      expect(s.pulse).toBe(true);
      expect(s.vitals).toMatchObject({ sbp: 84, dbp: 50, rr: 28, etco2: 24, gcs: 3 });
      expect('overbagging' in s.flags).toBe(true);
    }
  });
});

describe('the defibrillator and the first shock', () => {
  it('the defibrillator comes with the code: before the nurse calls it, pads and shocks cannot be done (no time passes)', () => {
    for (const id of ['pads', 'defib', 'aed', 'cardiovert', 'pace']) {
      const s = perform(sc, start(sc, 6), id);
      expect([s.minute, s.counts[id]], id).toEqual([0, undefined]);
      expect(s.log.at(-1)?.text).toMatch(/crash cart in the hallway: call the code/);
    }
  });

  it('calling the code brings the physician and the cart; the charge nurse puts the pads on during the first cycle', () => {
    const s = nurse(['call-help', 'cpr']);
    expect(said(s)).toMatch(/Code blue/);
    expect(s.log.some((l) => l.who === 'physician' && /I will lead/.test(l.text))).toBe(true);
    expect(s.flags.pads).toBe(2.2);
    expect(perform(sc, s, 'defib').flags['shock-1']).toBeDefined();
  });

  it('the nurse may also shock first, the moment the cart arrives: full marks for the shock and the compressions', () => {
    const s = nurse(['call-help', 'defib', 'cpr']);
    expect(penalties(s)).toEqual([]);
    expect(late(s, /First shock|compressions at once/)).toBe(false);
  });

  it('compressing alone without calling the code: the cart does not come, and the first shock is late', () => {
    const alone = nurse(['cpr']);
    expect(alone.log.at(-1)?.text).toMatch(/nobody has called the code/);
    expect('cart' in alone.flags).toBe(false);
    const s = nurse(['cpr', 'call-help', 'pads', 'defib']);
    expect(late(s, /First shock/)).toBe(true);
    expect(late(s, /Call the code/)).toBe(true);
  });

  it('a nurse who never calls the code: the charge nurse calls it from the central station at 3 minutes — and the call is not the nurse\'s', () => {
    const s = nurse(['cpr', 'cpr']);
    expect(s.log.some((l) => l.who === 'team' && /Has nobody called this\? Code blue/.test(l.text))).toBe(true);
    expect([s.flags['code-by-team'], 'cart' in s.flags]).toEqual([4, true]);
    // the cart comes: the nurse can shock (late), and a call made after the charge nurse's does not count as the nurse's
    const after = nurse(['cpr', 'cpr', 'call-help', 'defib']);
    expect(after.flags['shock-1']).toBeDefined();
    expect(missed(after, /Call the code/)).toBe(true);
    expect(late(after, /First shock/)).toBe(true);
  });

  it('the doctor who orders another cycle of CPR before the shock: the nurse asks, and the shock is late', () => {
    const s = doctor(['cpr', 'defib']);
    expect(s.log.some((l) => l.who === 'nurse' && /Do you want to shock/.test(l.text))).toBe(true);
    expect(late(s, /Shock at once/)).toBe(true);
  });

  it('a shock left waiting is given by a teammate — and does not count as the learner\'s', () => {
    // the nurse starts a line once the pads are on (a harm), then capnography: after more than 2 minutes the physician shocks
    const rn = nurse(['call-help', 'cpr', 'iv', 'capno']);
    expect(penalties(rn)).toEqual(['line-before-shock']);
    expect(rn.flags['team-shock-1']).toBeDefined();
    expect(rn.log.some((l) => l.who === 'physician' && /Shocking\. Back on the chest!/.test(l.text))).toBe(true);
    expect(missed(perform(sc, rn, 'cpr'), /First shock/)).toBe(true);
    // the doctor who does two more cycles: the nurse shocks per protocol after more than 3 minutes
    const md = doctor(['cpr', 'cpr']);
    expect(md.flags['team-shock-1']).toBeDefined();
    expect(missed(md, /Shock at once/)).toBe(true);
  });

  it('a learner back at the defibrillator after one cycle or one line gets that shock — late, their own, and no teammate\'s shock on top', () => {
    // the nurse puts the pads on herself, then runs a full cycle before shocking: the physician lets her shock at the check
    const pads = nurse(['call-help', 'pads', 'cpr', 'defib']);
    expect(['team-shock-1' in pads.flags, pads.flags['shock-1'], penalties(pads)]).toEqual([false, 3, []]);
    expect(late(pads, /First shock/)).toBe(true);
    expect(missed(pads, /First shock/)).toBe(false);
    // a 2-minute line at the rhythm check: the line is a harm, the shock after it is late — not lost
    const line = nurse(['call-help', 'cpr', 'iv', 'defib']);
    expect(['team-shock-1' in line.flags, penalties(line)]).toEqual([false, ['line-before-shock']]);
    expect(late(line, /First shock/)).toBe(true);
    // the doctor who places the tube before the first shock: the harm, then the shock is still the doctor's (late)
    const tube = doctor(['airway', 'defib']);
    expect(['team-shock-1' in tube.flags, penalties(tube)]).toEqual([false, ['airway-before-shock']]);
    expect(late(tube, /Shock at once/)).toBe(true);
  });

  it('a first shock after 3 minutes of VF: the waves go fine, and it takes one more shock to convert', () => {
    const steps = ['cpr', 'cpr', 'call-help', 'defib', 'iv', 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'cpr', 'defib'];
    const s = nurse(steps);
    expect(s.log.some((l) => l.who === 'monitor' && /getting smaller/.test(l.text))).toBe(true);
    expect([s.flags['shock-4'] !== undefined, s.rhythm.profile]).toEqual([true, 'vf']);
    const fifth = nurse([...steps, 'cpr', 'defib']);
    expect([fifth.rhythm.profile, fifth.pulse]).toEqual(['inferior-stemi', false]);
  });

  it('without an antiarrhythmic the fourth shock does not convert; the fifth does', () => {
    const steps = ['defib', 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'cpr', 'defib'];
    expect(doctor(steps).rhythm.profile).toBe('vf');
    const fifth = doctor([...steps, 'cpr', 'defib']);
    expect(fifth.rhythm.profile).toBe('inferior-stemi');
    // the nurse asks once the antiarrhythmic is 3 minutes overdue
    expect(fifth.log.some((l) => l.who === 'nurse' && /An antiarrhythmic\?/.test(l.text))).toBe(true);
  });
});

describe('the traps of the code', () => {
  it('delaying the shock for the airway: before the first shock, or at a rhythm check — the compressions stop and the shock waits', () => {
    const first = doctor(['airway']);
    expect(penalties(first)).toEqual(['airway-before-shock']);
    expect(first.log.some((l) => /compressions stop for the laryngoscope/.test(l.text))).toBe(true);
    const atCheck = doctor(['defib', 'cpr', 'airway']);
    expect(penalties(atCheck)).toEqual(['airway-before-shock']);
    // after the shock, while the compressions go on: right, and no pause
    const during = doctor(['defib', 'cpr', 'defib', 'airway']);
    expect(penalties(during)).toEqual([]);
    expect(during.log.some((l) => /while the compressions go on — no pause/.test(l.text))).toBe(true);
  });

  it('delaying the shock for an IV: the doctor at the start, the nurse once the pads are on', () => {
    expect(penalties(doctor(['iv']))).toEqual(['line-before-shock']);
    expect(penalties(doctor(['defib', 'cpr', 'pocus']))).toEqual(['line-before-shock']);
    expect(penalties(nurse(['call-help', 'cpr', 'io']))).toContain('line-before-shock');
    // before the defibrillator is there, a line holds nothing up
    expect(penalties(nurse(['call-help', 'iv']))).toEqual([]);
  });

  it('a pulse check right after the shock, and a second one before the next cycle', () => {
    const s = doctor(['defib', 'pulse-check', 'pulse-check']);
    expect(penalties(s)).toEqual(['pulse-check-after-shock', 'second-pulse-check']);
    expect(s.log.some((l) => /nobody was pushing on his chest/.test(l.text))).toBe(true);
    // after the converting shock too: the heart is organized but cannot pump yet
    const conv = perform(sc, doctor(TO_CONVERSION[7]), 'pulse-check');
    expect([penalties(conv), conv.pulse]).toEqual([['pulse-check-after-shock'], false]);
  });

  it('stopping to reassess during the code is a pause', () => {
    expect(penalties(doctor(['defib', 'cpr', 'reassess']))).toEqual(['pause-in-arrest']);
    expect(penalties(nurse(['call-help', 'cpr', 'defib', 'vitals']))).toEqual(['pause-in-arrest']);
  });

  it('another cycle of compressions at the rhythm check instead of the shock', () => {
    expect(penalties(doctor(['defib', 'cpr', 'cpr']))).toEqual(['no-shock-at-rhythm-check']);
    // compressions until the defibrillator is ready, and right after each shock, are right
    expect(penalties(doctor(['defib', 'cpr', 'defib', 'cpr']))).toEqual([]);
  });

  it('stacked shocks: a second shock with no compressions after the first', () => {
    expect(penalties(doctor(['defib', 'defib']))).toEqual(['stacked-shock']);
  });

  it('epinephrine before the second shock, or less than 3 minutes after the last dose; an antiarrhythmic before any shock', () => {
    expect(penalties(doctor(['defib', 'cpr', 'epinephrine']))).toEqual(['epi-before-second-shock']);
    expect(penalties(doctor(['defib', 'cpr', 'defib', 'epinephrine', 'epinephrine']))).toEqual(['epi-too-soon']);
    expect(penalties(nurse(['call-help', 'iv', 'amio-arrest']))).toEqual(['antiarrhythmic-before-shock']);
  });

  it('the wrong dose forms in the arrest: the amiodarone infusion does not count as the antiarrhythmic', () => {
    const s = doctor(['defib', 'cpr', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-infusion']);
    expect(penalties(s)).toEqual(['amio-infusion-in-arrest']);
    expect('amiodarone' in s.flags).toBe(false);
    // the nurse's version: an infusion is on no protocol and was never ordered (one penalty)
    const rn = nurse(['call-help', 'defib', 'iv', 'cpr', 'defib', 'cpr', 'defib', 'amio-infusion']);
    expect(penalties(rn)).toEqual(['rn-without-order-amio-infusion']);
  });

  it('a fibrinolytic: one critical penalty, during the arrest or after ROSC', () => {
    expect(penalties(doctor(['defib', 'cpr', 'tnk']))).toEqual(['lytic-pci-here']);
    expect(penalties(doctor([...TO_ROSC[7], 'pressor', 'ecg12', 'tnk']))).toEqual(['lytic-pci-here']);
  });
});

describe('after ROSC', () => {
  it('the pressure: norepinephrine to a MAP of 65 or more; left untreated, it falls', () => {
    const s = doctor([...TO_ROSC[7], 'pressor']);
    expect(s.vitals).toMatchObject({ sbp: 104, dbp: 64 });
    expect(s.log.some((l) => l.who === 'nurse' && /Norepinephrine running/.test(l.text))).toBe(true);
    const fluid = doctor([...TO_ROSC[7], 'fluid']);
    expect(fluid.log.at(-1)?.text).toBe('500 mL in. BP 94/56, MAP 69.');
    const left = doctor([...TO_ROSC[7], 'bvm', 'ecg12', 'cath-lab-activate', 'neuro', 'reassess']);
    expect(left.log.some((l) => l.who === 'nurse' && /down to 76 over 44/.test(l.text))).toBe(true);
    expect(missed(left, /MAP 65 or more/)).toBe(true);
  });

  it('the nurse starts norepinephrine on the physician\'s order — or the charge nurse does, and the item is missed', () => {
    const rosc = nurse(TO_ROSC[6]);
    expect(rosc.log.some((l) => l.who === 'physician' && /start norepinephrine/.test(l.text))).toBe(true);
    expect('ordered:pressor' in rosc.flags).toBe(true);
    expect(penalties(perform(sc, rosc, 'pressor'))).toEqual([]);
    const slow = nurse([...TO_ROSC[6], 'bvm', 'ecg12', 'reassess']);
    expect(slow.log.some((l) => l.who === 'physician' && /charge nurse, hang it/.test(l.text))).toBe(true);
    expect(slow.vitals.sbp).toBeGreaterThanOrEqual(104);
    expect(missed(slow, /norepinephrine on the physician's order/)).toBe(true);
    // a drug nobody ordered still needs one
    expect(penalties(nurse([...TO_ROSC[6], 'pressor', 'heparin']))).toEqual(['rn-without-order-heparin']);
  });

  it('hyperventilation: the bag going 28 a minute is slowed by taking the bag or reading the capnography; left alone, the EtCO₂ falls', () => {
    const byBag = doctor([...TO_ROSC[7], 'bvm']);
    expect(byBag.vitals).toMatchObject({ rr: 10, etco2: 38, spo2: 96 });
    expect('overbagging' in byBag.flags).toBe(false);
    // capnography is attached once: a doctor whose tube confirmation put it on, and who has not read it yet, reads it now
    const byCapno = doctor([...TO_ROSC[7].filter((id) => id !== 'capno'), 'capno']);
    expect(byCapno.log.some((l) => l.who === 'monitor' && /EtCO₂ 24 mmHg, the waveform coming 28 times a minute/.test(l.text))).toBe(true);
    expect(byCapno.vitals).toMatchObject({ rr: 10, etco2: 38 });
    const left = doctor([...TO_ROSC[7], 'pressor', 'ecg12', 'cath-lab-activate', 'neuro']);
    expect(left.vitals.etco2).toBe(20);
    expect(left.log.some((l) => /still squeezing the bag fast/.test(l.text))).toBe(true);
    expect(missed(left, /slow the breaths/)).toBe(true);
  });

  it('the 12-lead shows the inferior STEMI: the doctor activates the lab and hands off when it is ready', () => {
    const s = doctor([...TO_ROSC[7], 'pressor', 'bvm', 'ecg12']);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\..*inferior STEMI.*not on his triage tracing/.test(l.text))).toBe(true);
    const on = perform(sc, s, 'cath-lab-activate');
    expect(on.timers.cathReady).toBe(on.performed.at(-1)!.minute + 10);
    const early = perform(sc, on, 'handoff');
    expect([early.minute, early.counts.handoff]).toEqual([on.minute, undefined]);
    expect(early.log.at(-1)?.text).toMatch(/still on its way/);
  });

  it('missing the STEMI: admitting him without the lab is a critical error, and so is transferring him out', () => {
    const s = doctor([...TO_ROSC[7], 'pressor', 'bvm', 'admit']);
    expect(penalties(s)).toEqual(['admit-no-cath']);
    const r = review(sc, perform(sc, s, 'handoff'));
    expect(r.toFix.some((t) => t.kind === 'missed' && /activate the cath lab/.test(t.label))).toBe(true);
    expect(penalties(doctor([...TO_ROSC[7], 'pressor', 'ecg12', 'transfer']))).toEqual(['transfer-pci-here']);
    // once the lab is activated, admitting or transferring is refused, not scored
    const on = doctor([...TO_ROSC[7], 'pressor', 'ecg12', 'cath-lab-activate']);
    for (const id of ['admit', 'transfer']) expect(perform(sc, on, id).counts[id]).toBeUndefined();
  });

  it('misreading the post-arrest 12-lead costs points', () => {
    const s = runScenario(sc, 7, [...TO_ROSC[7], 'pressor', 'ecg12', 'read:sinus-tach'], undefined, 'manual');
    expect(penalties(s).some((p) => p.startsWith('misread-'))).toBe(true);
  });

  it('the doctor who forgets the 12-lead is asked at 10 minutes, and the item is late', () => {
    const s = doctor([...TO_ROSC[7], 'pressor', 'bvm', 'neuro', ...R(5), 'ecg12']);
    expect(s.log.some((l) => l.who === 'nurse' && /a 12-lead, now that he has a pulse/.test(l.text))).toBe(true);
    expect(late(s, /12-lead as soon as there is a pulse/)).toBe(true);
  });

  it('the nurse who records the 12-lead but does not show it: the physician finds it and activates the lab', () => {
    const s = nurse([...TO_ROSC[6], 'pressor', 'bvm', 'ecg12', 'neuro', 'reassess', 'reassess']);
    expect(s.log.some((l) => l.who === 'physician' && /sitting on the screen/.test(l.text))).toBe(true);
    expect('alert' in s.flags).toBe(true);
    expect(missed(s, /Show the 12-lead/)).toBe(true);
  });

  it('the nurse who never records one: the physician asks, then records it and activates the lab', () => {
    const s = nurse([...TO_ROSC[6], 'pressor', 'bvm', 'neuro', ...R(7)]);
    expect(s.log.some((l) => l.who === 'physician' && /where is his 12-lead/.test(l.text))).toBe(true);
    expect(['physician-ecg', 'alert', 'dispo'].every((f) => f in s.flags)).toBe(true);
    expect(missed(s, /12-lead as soon as there is a pulse/)).toBe(true);
  });

  it('temperature control for a patient who does not follow commands: the doctor orders it; the nurse\'s exam brings the physician\'s order', () => {
    // the doctor's exam finds the indication; the temperature control is its own order
    const exam = doctor([...TO_ROSC[7], 'neuro']);
    expect(exam.log.at(-1)?.text).toMatch(/does not follow commands: he needs temperature control\.$/);
    expect('temp-control' in exam.flags).toBe(false);
    const md = doctor([...TO_ROSC[7], 'neuro', 'temp-control']);
    expect(md.log.at(-1)?.text).toMatch(/^Temperature control started: a feedback-controlled device set to the chosen target \(36 °C\), to be held at least 36 hours/);
    expect('temp-control' in md.flags).toBe(true);
    expect(penalties(md)).toEqual([]);
    const rn = nurse([...TO_ROSC[6], 'pressor', 'neuro']);
    expect(rn.log.some((l) => l.who === 'physician' && /temperature control/.test(l.text))).toBe(true);
  });

  it('compressing past the rhythm check after the converting shock: a teammate finds the pulse, and the check is missed', () => {
    const s = doctor([...TO_CONVERSION[7], 'cpr', 'cpr']);
    expect([s.pulse, 'rosc-by-team' in s.flags]).toEqual([true, true]);
    expect(missed(s, /a pulse check, 10 seconds or less/)).toBe(true);
  });

  it('drugs that drop the pressure after ROSC: one penalty each, also for the nurse', () => {
    expect(penalties(nurse([...TO_ROSC[6], 'pressor', 'nitro']))).toEqual(['nitrate']);
    expect(penalties(nurse([...TO_ROSC[6], 'pressor', 'metoprolol']))).toEqual(['rate-drug']);
    expect(penalties(doctor([...TO_ROSC[7], 'diltiazem']))).toEqual(['rate-drug']);
  });

  it('a tube after ROSC with the pressure still low: resuscitate before you intubate', () => {
    const noTube = ['defib', 'cpr', 'defib', 'epinephrine', 'bvm', 'cpr', 'defib', 'amio-arrest', 'capno', 'cpr', 'defib', 'cpr', 'pulse-check'];
    const rosc = doctor(noTube);
    expect([rosc.pulse, penalties(rosc)]).toEqual([true, []]);
    expect(penalties(perform(sc, rosc, 'rsi'))).toEqual(['rsi-unresuscitated']);
    expect(penalties(doctor([...noTube, 'pressor', 'rsi']))).toEqual([]);
  });
});

describe('the rest of the team', () => {
  it('in the nurse\'s run the physician places the tube during compressions, thinks through the causes, and covers a missed epinephrine', () => {
    const s = nurse(['call-help', 'cpr', 'defib', 'iv', 'cpr', 'defib', 'cpr', 'defib', 'cpr']);
    expect(s.log.some((l) => l.who === 'physician' && /Tube is in, with the video laryngoscope and no pause/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'physician' && /his heart until proven otherwise/.test(l.text))).toBe(true);
    expect(s.flags['team-epi']).toBeDefined();
    expect(missed(s, /Epinephrine 1 mg after the second shock/)).toBe(true);
  });

  it('in the doctor\'s run the nurse places the IV during the first cycle, and asks once the epinephrine is overdue', () => {
    const s = doctor(['defib', 'cpr']);
    expect(s.log.some((l) => l.who === 'nurse' && /IV in, doctor/.test(l.text))).toBe(true);
    const due = doctor(['defib', 'cpr', 'defib', 'cpr', 'defib', 'cpr']);
    expect(due.log.some((l) => l.who === 'nurse' && /Do you want epinephrine/.test(l.text))).toBe(true);
  });

  it('capnography and the monitor read the same EtCO₂ through the arrest: 3 with no breaths, 16 with breaths and CPR, 34 as ROSC comes', () => {
    const seen: number[] = [];
    runScenario(sc, 7, TO_ROSC[7], (s) => {
      if (s.pulse) return;
      for (const l of s.log) {
        const m = /^EtCO₂ (?:rose to )?(\d+) mmHg/.exec(l.text);
        if (l.who === 'monitor' && m && l === s.log.at(-1)) {
          seen.push(Number(m[1]));
          expect(Number(m[1]), l.text).toBe(s.vitals.etco2);
        }
      }
    });
    expect(seen).toEqual([16, 34]);
    const none = doctor(['capno']);
    expect(none.log.some((l) => /^EtCO₂ 3 mmHg: almost no waveform/.test(l.text))).toBe(true);
    expect(none.vitals.etco2).toBe(3);
  });
});

describe('review fixes: shocks, doses and one-time actions', () => {
  it('a stacked shock is no step of the algorithm: it does not count as the next shock for the drugs or the conversion', () => {
    const s = doctor(['defib', 'defib']);
    expect([penalties(s), s.flags['shock-2'], 'stacked' in s.flags]).toEqual([['stacked-shock'], undefined, true]);
    // epinephrine after a stacked "second" shock is still epinephrine before the second shock
    expect(penalties(doctor(['defib', 'defib', 'iv', 'epinephrine']))).toEqual(['stacked-shock', 'epi-before-second-shock']);
    // the shock at the next rhythm check is the second one
    const next = doctor(['defib', 'defib', 'cpr', 'defib']);
    expect([next.flags['shock-2'], next.flags['shock-3']]).toEqual([2.9, undefined]);
    // a shock after 2 minutes of compressions while the tube went in is a rhythm check's, not a stacked one
    const tube = doctor(['defib', 'airway', 'defib']);
    expect([penalties(tube), tube.flags['shock-2']]).toEqual([[], 3.6]);
  });

  it('a shock straight after a teammate\'s is stacked: one penalty, and it does not count', () => {
    const s = nurse(['call-help', 'cpr', 'iv', 'capno', 'defib']);
    expect(s.flags['team-shock-1']).toBeDefined();
    expect([penalties(s), s.flags['shock-2']]).toEqual([['line-before-shock', 'stacked-shock'], undefined]);
  });

  it('epinephrine the physician had the charge nurse give: the nurse\'s dose right after it is a double dose, and the item is not hers', () => {
    const steps = ['call-help', 'cpr', 'defib', 'iv', 'cpr', 'defib', 'bvm', 'capno', 'cpr', 'defib', 'hs-ts', 'bvm'];
    const s = nurse(steps);
    expect(s.flags['team-epi']).toBe(11.1);
    const twice = perform(sc, s, 'epinephrine');
    expect(penalties(twice)).toEqual(['epi-too-soon']);
    expect(missed(twice, /Epinephrine 1 mg after the second shock/)).toBe(true);
  });

  it('amiodarone the physician had pushed counts toward the doses: the nurse\'s next is 150 mg, and there is no third', () => {
    const steps = ['call-help', 'cpr', 'defib', 'iv', 'cpr', 'defib', 'epinephrine', 'bvm', 'cpr', 'defib', 'capno', 'cpr', 'defib', 'hs-ts', 'cpr'];
    const s = nurse(steps);
    expect(s.log.some((l) => l.who === 'physician' && /amiodarone 300 milligrams — charge nurse, push it now/.test(l.text))).toBe(true);
    const second = perform(sc, s, 'amio-arrest');
    expect(second.log.at(-1)?.text).toMatch(/Amiodarone 150 milligrams going in/);
    expect(missed(second, /Amiodarone 300 mg \(or lidocaine\)/)).toBe(true);
    const third = perform(sc, second, 'amio-arrest');
    expect(third.log.at(-1)?.text).toMatch(/both in: that is the full arrest dose/);
    expect(third.counts['amio-arrest']).toBe(1);
  });

  it('a neuro check or a pressor infusion tried during CPR is refused (no time, nothing spent): both are still there after ROSC', () => {
    const tried = doctor(['defib', 'cpr', 'neuro', 'pressor']);
    expect([tried.minute, tried.counts.neuro, tried.counts.pressor, penalties(tried)]).toEqual([2.3, undefined, undefined, []]);
    expect(tried.log.at(-1)?.text).toMatch(/no pressure to titrate an infusion to/);
    const rosc = doctor([...TO_ROSC[7], 'neuro', 'pressor']);
    expect(['neuro-rosc' in rosc.flags, rosc.vitals.sbp]).toEqual([true, 104]);
    // the nurse's version: no order to answer for during the arrest
    expect(penalties(nurse(['call-help', 'cpr', 'defib', 'iv', 'pressor']))).toEqual([]);
  });

  it('one tube: RSI after the arrest\'s tube, or a tube after RSI, is refused — and a new tube does not slow the fast bagging', () => {
    const tubed = doctor([...TO_ROSC[7], 'pressor']);
    const rsi = perform(sc, tubed, 'rsi');
    expect([rsi.minute, rsi.counts.rsi]).toEqual([tubed.minute, undefined]);
    expect(rsi.log.at(-1)?.text).toMatch(/already has a tube/);
    const noTube = ['defib', 'cpr', 'defib', 'epinephrine', 'bvm', 'cpr', 'defib', 'amio-arrest', 'capno', 'cpr', 'defib', 'cpr', 'pulse-check', 'pressor', 'rsi'];
    const s = doctor(noTube);
    expect(s.log.some((l) => l.who === 'team' && /bags through the new tube — still about 28 breaths a minute/.test(l.text))).toBe(true);
    expect([s.vitals.rr, 'overbagging' in s.flags]).toEqual([28, true]);
    expect(perform(sc, s, 'airway').counts.airway).toBeUndefined();
    // the hyperventilation is still the doctor's to fix
    expect(perform(sc, s, 'bvm').vitals).toMatchObject({ rr: 10, etco2: 38 });
  });

  it('a shock at the rhythm check after the converting shock: its own words (he had a pulse), not "asystole and PEA"', () => {
    const s = doctor([...TO_CONVERSION[7], 'cpr', 'defib']);
    expect(penalties(s)).toEqual(['shock-organized']);
    expect(fix(s).find((t) => t.kind === 'harm')?.label).toMatch(/^A shock for organized complexes\./);
  });

  it('the monitor is already on: attaching it is refused with no time lost', () => {
    const s = perform(sc, start(sc, 6), 'monitor');
    expect([s.minute, s.counts.monitor]).toEqual([0, undefined]);
  });

  it('the interventional cardiologist asks for temperature control only if nobody has ordered it yet', () => {
    const before = doctor([...TO_ROSC[7], 'pressor', 'bvm', 'ecg12', 'cath-lab-activate', 'reassess']);
    expect(before.log.some((l) => l.who === 'consultant' && /if he does not follow commands, start temperature control/.test(l.text))).toBe(true);
    const after = doctor([...TO_ROSC[7], 'pressor', 'bvm', 'ecg12', 'cath-lab-activate', 'neuro', 'temp-control', 'reassess']);
    expect(after.log.some((l) => l.who === 'consultant' && /keep the temperature control going/.test(l.text))).toBe(true);
  });

  it('the evidence is quoted as it was found: an association with the delay, and the refractory-VF options as not established', () => {
    const text = JSON.stringify(sc);
    expect(text).not.toMatch(/halves survival|7–10 %|have not been shown to help/);
    expect(text).toMatch(/22 % vs 39 % to discharge; Chan, NEJM 2008/);
    expect(sc.teaching.join(' ')).toMatch(/vector change\) or double sequential defibrillation: their usefulness is not established \(2025 AHA\)/);
  });
});
