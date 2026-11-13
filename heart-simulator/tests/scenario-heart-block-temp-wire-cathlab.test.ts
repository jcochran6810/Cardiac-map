import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabTempWire as sc } from '@/lib/sim/scenario/scenarios/cathlabTempWire';
import type { SimState } from '@/lib/sim/scenario/types';
import { readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: the 12-lead before the pacing hides the block, pads (the nurse paces through them), the capture checked on the
  // pleth, the wire and the box, the groins, the time-out; the threshold called out; the loss of capture called out; the
  // tray when the effusion is seen; the falling pressure called out
  3: ['ecg12', 'pads', 'nibp', 'temp-wire', 'prep', 'timeout', 'reassess', 'callout', 'ecg12-repeat', 'reassess', 'callout', 'reassess',
    'pericardiocentesis', 'callout', 'reassess'],
  // the nurse: pads and pacing for the operator's "get her rate up", fentanyl and midazolam, the femoral pulse; consent and the
  // time-out; the paced 12-lead; the loss of capture called out (and the pads pacing again); the falling pressure called
  // out and fluid for it; the hand-off
  4: ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'consent', 'timeout', 'reassess', 'ecg12-repeat', 'reassess', 'callout',
    ...R(3), 'callout', 'fluid', 'handoff'],
  // the cardiologist: pads and pacing, analgesia and sedation, the femoral pulse, the medicines; consent, time-out, the femoral
  // vein and the wire; the paced 12-lead; the wire pulled back and an echo when it moves; the tamponade drained; the hand-off
  5: ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat',
    'reassess', 'reposition', 'echo', 'reassess', 'pericardiocentesis', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
/** The cardiologist up to the wire pacing */
const MD_TO_WIRE = MD.slice(0, MD.indexOf('temp-wire') + 1);
/** …and on until the wire moves (the next reassessment) */
const MD_TO_PERFORATION = MD.slice(0, MD.indexOf('reposition'));

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;

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

describe('temporary wire for complete heart block: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('heart-block-temp-wire-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['chb', 'tcp', 'paced', 'clin-tamponade']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
  });

  it('shows the real fluoroscopy frame of a wire at the RV apex when the wire goes in', () => {
    expect(Object.values(sc.images ?? {})).toEqual(['temp-pacing-wire-rv-apex']);
    expect(CATH_IMAGES['temp-pacing-wire-rv-apex']).toBeDefined();
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role]);
      expect(s.images, `role ${role}`).toEqual([expect.objectContaining({ id: 'wire-position', image: 'temp-pacing-wire-rv-apex' })]);
    }
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });

  it('teaches the output margin, atropine below the node, and what a moving wire looks like', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/2–3 times the threshold/);
    expect(text).toMatch(/unlikely to help a block below/);
    expect(text).toMatch(/hiccups/);
    expect(text).toMatch(/cannot speed up/);
  });
});

describe('temporary wire for complete heart block: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
      expect(s.flags).toEqual(expect.objectContaining({ 'wire-paced': expect.any(Number), perforated: expect.any(Number), tamponade: expect.any(Number), drained: expect.any(Number) }));
      expect(s.reads.map((r) => `${r.answer}:${r.verdict}`)).toEqual(['chb:correct', 'paced:correct', 'clin-tamponade:correct']);
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('an epinephrine drip is a bridge as good as the pads: full marks (with the pads on)', () => {
    expectFullMarks(run(sc, 5, ['pads', 'pressor', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat', 'reassess',
      'reposition', 'echo', 'reassess', 'pericardiocentesis', 'handoff']));
  });

  it('one dose of atropine on the way to the pacer is no mistake (it simply does nothing): full marks', () => {
    const s = run(sc, 5, ['pads', 'atropine', ...MD.slice(1)]);
    expect(s.penalties).toEqual([]);
    expectFullMarks(s);
  });

  it('an echo before the wire is no mistake: the look for the effusion drops out, and the drain is still guided', () => {
    const s = run(sc, 5, ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'echo', 'access-venous',
      'temp-wire', 'ecg12-repeat', 'reassess', 'reposition', ...R(3), 'pericardiocentesis', 'handoff']);
    expect(criticalsFor(sc, 5).find((c) => c.id === 'md-echo')!.applies!(s)).toBe(false);
    expectFullMarks(s);
  });

  it('a tech who puts the pads on first records the paced 12-lead instead: full marks', () => {
    const s = run(sc, 3, ['pads', 'temp-wire', 'nibp', 'ecg12', ...IDEAL[3].slice(4)]);
    expect(s.reads[0]).toMatchObject({ answer: 'tcp', verdict: 'correct' });
    expectFullMarks(s);
  });
});

describe('temporary wire: the bridge', () => {
  it('atropine leaves the rate at 32: the block is below the node', () => {
    const s = run(sc, 5, ['atropine']);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 32 });
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'No change in heart rate: 32.' });
  });

  it('a second lab dose of atropine with no pacer is the repeated-atropine trap', () => {
    const s = run(sc, 5, ['atropine', 'atropine']);
    expect(penalties(s)).toEqual(['atropine-repeat']);
    expect(s.rhythm.hr).toBe(32);
  });

  it('the nurse who answers "get her rate up" with atropine is corrected and loses points; pacing then counts', () => {
    const s = run(sc, 4, ['atropine', 'pads', 'pace']);
    expect(penalties(s)).toEqual(['wrong-rn-rate']);
    expect(said(s)).toMatch(/Atropine didn't touch it downstairs/);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
  });

  it('transcutaneous pacing takes over at 70 and lifts the pressure; it hurts until she has analgesia', () => {
    const s = run(sc, 5, ['pads', 'pace']);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(104);
    expect(s.vitals.pain).toBeGreaterThanOrEqual(6);
    const comfy = perform(sc, perform(sc, s, 'fentanyl'), 'midazolam');
    expect(comfy.vitals.pain).toBeLessThanOrEqual(3);
    expect(missed(run(sc, 5, ['pads', 'pace', ...R(3)]))).toContain('Analgesia and sedation for the pads pacing');
  });

  it('an epinephrine drip speeds the escape to 44 and lifts the pressure', () => {
    const s = run(sc, 5, ['pressor']);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 44 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(98);
  });

  it('with nothing to raise the rate she gets worse, the escape stops, and CPR with epinephrine brings it back', () => {
    let s = run(sc, 5, R(2));
    expect(s.fired).toContain('worse');
    expect(s.rhythm.hr).toBe(28);
    s = run(sc, 5, R(6));
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('asystole');
    s = perform(sc, perform(sc, s, 'cpr'), 'epinephrine');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 30 });
  });

  it('in the tech\'s run the nurse paces once the pads are on — or puts them on herself, and the tech loses the pads points', () => {
    const s = run(sc, 3, ['pads']);
    expect(s.rhythm.profile).toBe('tcp');
    expect(s.flags).toEqual(expect.objectContaining({ analgesia: expect.any(Number), sedation: expect.any(Number) }));
    const late = run(sc, 3, ['ecg12', 'monitor', 'reassess']);
    expect(late.rhythm.profile).toBe('tcp');
    expect(missed(late)).toContain('Pads on at once');
  });

  it('suppressing the escape with lidocaine drops the rate to 22 and is a critical error; paced, the rate holds but it still costs', () => {
    const s = run(sc, 5, ['lidocaine']);
    expect(s.rhythm.hr).toBe(22);
    expect(s.penalties[0]).toMatchObject({ id: 'escape-suppressant', severity: 'critical' });
    expect(review(sc, stop(s)).grade).toBe('Unsafe');
    const p = run(sc, 5, ['pads', 'pace', 'procainamide']);
    expect(p.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    // one mistake, one penalty: the case rule stands in for the built-in procainamide rule
    expect(penalties(p)).toEqual(['escape-suppressant']);
  });

  it('AV-nodal blockers and adenosine make it worse and cost points', () => {
    expect(run(sc, 5, ['metoprolol']).rhythm.hr).toBe(22);
    expect(penalties(run(sc, 5, ['diltiazem']))).toEqual(['av-blocker']);
    const a = run(sc, 5, ['adenosine6']);
    expect(a.rhythm.hr).toBe(30);
    expect(penalties(a)).toEqual(['adenosine-block']);
  });
});

describe('temporary wire: the wire', () => {
  it('needs a venous sheath first; then it paces at 70 from the RV apex, with the threshold and a margin', () => {
    const before = run(sc, 5, ['pads', 'pace']);
    expect(unavailableReason(sc, before, 'temp-wire')).toBeNull();
    const blocked = perform(sc, before, 'temp-wire');
    expect(blocked.counts['temp-wire']).toBeUndefined();
    expect(blocked.log.at(-1)!.text).toMatch(/femoral venous access first/);
    const s = run(sc, 5, MD_TO_WIRE);
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expect(said(s)).toMatch(/Threshold 0\.8 mA\. Output set to 3 mA/);
    expect(said(s)).toMatch(/pads pacer goes to standby, the pads stay on/);
  });

  it('a wire with no pads on is the trap', () => {
    const s = run(sc, 5, ['pressor', 'access-venous', 'temp-wire']);
    expect(penalties(s)).toEqual(['wire-without-pads']);
    expect(missed(s)).toContain('Pads on at once');
  });

  it('the operator will not go in without pads: in the nurse\'s run he has them put on, and she misses the item', () => {
    const s = run(sc, 4, ['pressor', 'consent', 'timeout', 'reassess']);
    expect(said(s)).toMatch(/Pads on her before I go in/);
    expect(s.flags['wire-paced']).toBeDefined();
    expect(missed(s)).toContain('Pads on at once');
  });

  it('the tech hands the wire and the box, and calls out the threshold when asked; without it, the operator runs it', () => {
    const s = run(sc, 3, IDEAL[3].slice(0, IDEAL[3].indexOf('callout') + 1));
    expect(s.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/Threshold 0\.8, output 3/) });
    const none = run(sc, 3, [...IDEAL[3].slice(0, IDEAL[3].indexOf('callout')), 'ecg12-repeat', 'reassess']);
    expect(none.fired).toContain('threshold-fallback');
    expect(missed(none)).toContain('Threshold test and output called out');
  });

  it('the venous sheath stays with the wire: no hemostasis', () => {
    const s = run(sc, 5, MD_TO_WIRE);
    expect(perform(sc, s, 'reassess').counts.hemostasis).toBeUndefined();
    const r = run(sc, 4, IDEAL[4].slice(0, IDEAL[4].indexOf('ecg12-repeat')));
    const tried = perform(sc, r, 'hemostasis');
    expect(tried.counts.hemostasis).toBeUndefined();
    expect(tried.log.at(-1)!.text).toMatch(/stays in with the pacing wire/);
  });
});

describe('temporary wire: the wire moves', () => {
  it('capture is lost: the rate falls to 30, the box still fires, she hiccups — and nothing on the monitor names it', () => {
    const s = run(sc, 5, MD_TO_PERFORATION);
    expect(s.fired).toContain('perforation');
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 30 });
    expect(s.vitals.sbp).toBeLessThanOrEqual(70);
    expect(said(s)).toMatch(/hiccups with every tick of the pacing box/);
    expect(said(s)).toMatch(/still flashes at 70/);
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
  });

  it('the cardiologist pulls it back and it paces again; the nurse restarts the pads if he waits', () => {
    const s = perform(sc, run(sc, 5, MD_TO_PERFORATION), 'reposition');
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expect(said(s)).toMatch(/through the wall/);
    const waits = run(sc, 5, [...MD_TO_PERFORATION, 'echo']);
    expect(waits.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(waits.fired).toContain('team-repaces');
    expect(missed(run(sc, 5, [...MD_TO_PERFORATION, 'echo', ...R(1)]))).toContain('Pull the wire back into the RV and get it pacing again');
  });

  it('a tech or nurse who misses the loss of capture loses the call-out; a teammate restarts the pads and the operator fixes the wire', () => {
    for (const role of [3, 4] as const) {
      const steps = IDEAL[role];
      const upTo = steps.indexOf('callout', role === 3 ? steps.indexOf('ecg12-repeat') : 0);
      const s = run(sc, role, [...steps.slice(0, upTo), ...R(2)]);
      expect(s.fired, `role ${role}`).toEqual(expect.arrayContaining(['team-repaces', 'md-rewire']));
      expect(s.rhythm, `role ${role}`).toEqual({ profile: 'paced', hr: 70 });
      expect(missed(s), `role ${role}`).toContain('Call out the loss of capture at once');
    }
  });

  it('the nurse\'s call-out gets the pads pacing again at once', () => {
    const steps = IDEAL[4];
    const s = run(sc, 4, steps.slice(0, steps.indexOf('callout') + 1));
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.log.some((l) => l.who === 'you' && /^Pads pacing back on at 70/.test(l.text))).toBe(true);
  });

  it('nitroglycerin for the new chest pain is the perforation trap — one penalty, not two', () => {
    const s = run(sc, 5, [...MD_TO_PERFORATION, 'nitro']);
    expect(penalties(s)).toEqual(['nitro-after-wire']);
  });

  it('heparin after the wire has come through the wall costs points', () => {
    expect(penalties(run(sc, 5, [...MD_TO_PERFORATION, 'heparin']))).toEqual(['anticoagulant-perforation']);
  });
});

describe('temporary wire: the effusion', () => {
  it('the echo shows the new effusion once the wire has moved — and none before', () => {
    expect(run(sc, 5, ['echo']).log.at(-1)!.text).toMatch(/no pericardial effusion/);
    const s = run(sc, 5, [...MD_TO_PERFORATION, 'reposition', 'echo']);
    expect(s.log.at(-1)!.text).toMatch(/new pericardial effusion, about 1 cm/);
    expect(s.flags.effusion).toBeDefined();
  });

  it('no needle without an echo, and none into a pericardium with nothing in it', () => {
    const noEcho = perform(sc, run(sc, 5, [...MD_TO_PERFORATION, 'reposition']), 'pericardiocentesis');
    expect(noEcho.counts.pericardiocentesis).toBeUndefined();
    expect(noEcho.log.at(-1)!.text).toMatch(/Get the echo first/);
    const empty = perform(sc, run(sc, 5, ['echo']), 'pericardiocentesis');
    expect(empty.counts.pericardiocentesis).toBeUndefined();
    expect(empty.log.at(-1)!.text).toMatch(/nothing to drain/);
  });

  it('the tamponade: the pressure falls while the paced rate stays at 70, and nothing names it before the learner does', () => {
    const steps = MD.slice(0, MD.indexOf('pericardiocentesis'));
    const s = run(sc, 5, ['read:chb', ...readAfter(steps, 'ecg12-repeat', 'paced')], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-tamponade' });
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expect(s.vitals.sbp).toBeLessThanOrEqual(74);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === `BP ${s.vitals.sbp}/${s.vitals.dbp}; the heart rate stays at 70; respirations 26.`)).toBe(true);
    for (const l of s.log) expect(l.text).not.toMatch(/tamponade/i);
  });

  it('left undrained, the squeezed heart stops filling; the drain brings the circulation back', () => {
    let s = run(sc, 5, [...MD.slice(0, MD.indexOf('pericardiocentesis')), ...R(3)]);
    expect(s.pulse).toBe(false);
    expect(s.fired).toContain('pea');
    expect(perform(sc, s, 'cpr').log.at(-1)!.text).toMatch(/barely moves a pressure/);
    s = perform(sc, s, 'pericardiocentesis');
    expect(s.pulse).toBe(true);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    // the drain that brings her back from the arrest earns nothing: the item is to drain before the heart stops filling
    const r = review(sc, stop(s));
    expect(r.toFix.some((t) => t.kind === 'missed' && /Drain the tamponade before her heart stops filling/.test(t.label))).toBe(true);
    expect(r.timings.find((t) => t.label === 'Tamponade drained')!.met).toBe(false);
  });

  it('a drain started before the heart stops (even late in the window) counts in full', () => {
    const steps = MD.slice(0, MD.indexOf('pericardiocentesis'));
    const s = run(sc, 5, [...steps, 'pulse-check', 'pericardiocentesis', 'handoff']);
    expect(s.fired).not.toContain('pea');
    expectFullMarks(s);
  });

  it('a cardiologist who never drains it loses the patient', () => {
    let s = run(sc, 5, MD.slice(0, MD.indexOf('pericardiocentesis')));
    for (let i = 0; i < 12 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('the tech opens the tray when the effusion is seen; the nurse supports the pressure — and a nitrate is refused', () => {
    const t = run(sc, 3, IDEAL[3].slice(0, IDEAL[3].indexOf('pericardiocentesis')));
    expect(t.flags['asked-tray']).toBeDefined();
    expect(t.log.some((l) => /Open the pericardiocentesis tray/.test(l.text))).toBe(true);
    const steps = IDEAL[4];
    const n = run(sc, 4, [...steps.slice(0, steps.indexOf('fluid')), 'nitro', 'fluid']);
    expect(said(n)).toMatch(/That drops it further/);
    expect(penalties(n)).toEqual(['nitro-after-wire']);
  });

  it('the hand-off waits for the end of the procedure', () => {
    const steps = IDEAL[4];
    const s = run(sc, 4, steps.slice(0, steps.indexOf('ecg12-repeat')));
    const tried = perform(sc, s, 'handoff');
    expect(tried.counts.handoff).toBeUndefined();
    expect(tried.log.at(-1)!.text).toMatch(/The procedure is not over yet/);
  });
});

describe('temporary wire: review fixes (fair scoring, a coherent story)', () => {
  it('analgesia and sedation given before the pacer is switched on (premedication) count: full marks for the nurse and the cardiologist', () => {
    expectFullMarks(run(sc, 5, ['pads', 'fentanyl', 'midazolam', 'pace', ...MD.slice(MD.indexOf('pulse-check'))]));
    const rn = IDEAL[4];
    expectFullMarks(run(sc, 4, ['pads', 'fentanyl', 'midazolam', 'pace', ...rn.slice(rn.indexOf('pulse-check'))]));
  });

  it('a reassessment that counts the pulse at the paced rate confirms mechanical capture', () => {
    const s = run(sc, 5, ['pads', 'pace', 'fentanyl', 'reassess']);
    expect(said(s)).toMatch(/pulse 70/);
    expect(missed(s)).not.toContain('Confirm the pads pacing makes a pulse (mechanical capture)');
  });

  it('an echo first and then the wire pulled back (the pads pacing her meanwhile) is still on time', () => {
    const s = run(sc, 5, [...MD_TO_PERFORATION, 'pulse-check', 'echo', 'reposition', 'reassess', 'pericardiocentesis', 'handoff']);
    expect(s.fired).toContain('team-repaces');
    expectFullMarks(s);
  });

  it('nitroglycerin with a systolic of 84 before the wire costs points (the case rule must not switch the built-in one off)', () => {
    expect(penalties(run(sc, 5, ['nitro']))).toEqual(['nitro-hypotension']);
    expect(penalties(run(sc, 5, ['nitro-high']))).toEqual(['nitro-hypotension']);
    expect(penalties(run(sc, 3, ['ic-nitro']))).toEqual(['nitro-hypotension']);
    // paced at 104, the high dose with no high pressure is the minor built-in mistake
    expect(penalties(run(sc, 5, ['pads', 'pace', 'nitro-high']))).toEqual(['nitro-high-not-hypertensive']);
    // after the perforation one rule, the case's own: one mistake, one penalty — and the pleuritic pain does not ease
    const after = run(sc, 5, [...MD_TO_PERFORATION, 'reposition', 'nitro']);
    expect(penalties(after)).toEqual(['nitro-after-wire']);
    expect(said(after)).toMatch(/It still hurts when I breathe in/);
    expect(said(after)).not.toMatch(/The pressure is easing/);
    // a nurse who answers the falling pressure with a nitrate, however good the rest, is not "Excellent"
    const rn = IDEAL[4];
    const n = run(sc, 4, [...rn.slice(0, rn.indexOf('callout', rn.indexOf('callout') + 1)), 'nitro', 'callout', 'fluid', 'handoff']);
    expect(penalties(n)).toEqual(['nitro-after-wire']);
    expect(review(sc, n).grade).not.toBe('Excellent');
  });

  it('a call-out made once the pads are already pacing says what happened, not "she\'s at 70"', () => {
    const s = run(sc, 4, ['pads', 'pressor', 'consent', 'timeout', 'reassess', 'ecg12-repeat', 'reassess', 'pace', 'callout']);
    expect(s.log.at(-2)!.text).toMatch(/dropped to 30 with the box still firing at 70/);
    expect(said(s)).not.toMatch(/No capture — she's at 70/);
    expect(missed(s)).not.toContain('Call out the loss of capture at once');
  });

  it('a call-out once the operator has the wire pacing again, or the pressure back, is no call-out', () => {
    const rn = IDEAL[4];
    // the loss of capture missed: the teammate and the operator fix it, and a late "callout" earns nothing
    const lost = run(sc, 4, [...rn.slice(0, rn.indexOf('callout')), ...R(2), 'callout']);
    expect(lost.flags.recaptured).toBeDefined();
    expect(missed(lost)).toContain('Call out the loss of capture at once');
    // the tamponade missed: the operator drains it, and neither a late call-out nor late fluid counts as the support
    const tamp = run(sc, 4, [...rn.slice(0, rn.indexOf('callout', rn.indexOf('callout') + 1)), 'reassess', 'callout', 'fluid']);
    expect(tamp.flags.drained).toBeDefined();
    const m = missed(tamp);
    expect(m).toContain('Call out the falling pressure at a fixed paced rate');
    expect(m).toContain('Support the pressure in the tamponade (fluid wide open)');
    // and nobody shouts for fluid after the heart is already drained
    const idle = run(sc, 4, [...rn.slice(0, rn.indexOf('callout', rn.indexOf('callout') + 1)), ...R(3)]);
    expect(idle.fired).not.toContain('rn-support-fallback');
    expect(said(idle)).not.toMatch(/Open the fluids/);
  });

  it('a tech who turns the pacer on herself: the nurse still gives the fentanyl and midazolam', () => {
    const s = run(sc, 3, ['pace', 'reassess']);
    expect(s.rhythm.profile).toBe('tcp');
    expect(said(s)).toMatch(/Fentanyl 25 and midazolam 1 in for the pacer/);
    expect(s.vitals.pain).toBeLessThanOrEqual(3);
    expect(said(s)).not.toMatch(/that thumping hurts/);
  });

  it('pads pacing switched on during the arrest still costs points, and the pacer left running captures once CPR and epinephrine bring her back', () => {
    const s = run(sc, 5, [...R(6), 'pace', 'cpr', 'epinephrine']);
    expect(penalties(s)).toEqual(['pace-in-arrest']);
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    // just after the arrest she cannot talk; a few minutes perfused and she wakes
    const drowsy = perform(sc, s, 'reassess');
    expect(drowsy.log.at(-1)).toMatchObject({ who: 'patient', text: expect.stringMatching(/^Drowsy|^She groans/) });
    const awakeAgain = run(sc, 5, [...R(6), 'pace', 'cpr', 'epinephrine', ...R(2)]);
    expect(awakeAgain.vitals.gcs).toBeGreaterThanOrEqual(13);
    expect(awakeAgain.fired).toContain('wakes');
  });

  it('a drowsy patient gives no history or consent of her own: the chart, her daughter and emergency consent do', () => {
    const s = run(sc, 5, [...R(6), 'cpr', 'epinephrine', 'consent', 'sample']);
    expect(s.vitals.gcs).toBeLessThan(13);
    expect(said(s)).toMatch(/emergency consent for the wire/);
    expect(said(s)).toMatch(/From the ED chart and her daughter/);
    expect(s.log.some((l) => l.who === 'patient' && /anything to stop me fainting/.test(l.text))).toBe(false);
  });

  it('in the arrest from tamponade the needle goes in under fluoroscopy without waiting for an echo', () => {
    // no echo at all: reposition, then nothing until the squeezed heart stops
    let s = run(sc, 5, [...MD_TO_PERFORATION, 'reposition', ...R(6)]);
    expect(s.pulse).toBe(false);
    expect(s.flags.echo).toBeUndefined();
    s = perform(sc, s, 'pericardiocentesis');
    expect(s.pulse).toBe(true);
    expect(said(s)).toMatch(/Emergency pericardiocentesis under fluoroscopy/);
  });

  it('sedation with a falling pressure once the wire paces is a mistake; sedation for the pads pacing at 84 is not', () => {
    const steps = MD.slice(0, MD.indexOf('pericardiocentesis'));
    expect(penalties(run(sc, 5, [...steps, 'midazolam']))).toEqual(['sedation-low-pressure']);
    expect(penalties(run(sc, 5, ['pads', 'midazolam', 'pace']))).toEqual([]);
  });

  it('diltiazem barely touches an escape this low but drops the pressure; a beta-blocker slows the escape', () => {
    const d = run(sc, 5, ['diltiazem']);
    expect(d.rhythm).toEqual({ profile: 'third-degree-avb', hr: 32 });
    expect(d.vitals.sbp).toBeLessThan(84);
    expect(run(sc, 5, ['metoprolol']).rhythm.hr).toBe(22);
  });

  it('teammates who step in say what they see, not what it is: no event line names the loss of capture or the tamponade', () => {
    for (const role of [3, 4] as const) {
      const steps = IDEAL[role];
      const upTo = steps.indexOf('callout', role === 3 ? steps.indexOf('ecg12-repeat') : 0);
      const s = run(sc, role, [...steps.slice(0, upTo), ...R(6)]);
      for (const l of s.log) if (l.who !== 'you' && l.who !== 'feedback') expect(l.text, `role ${role}: ${l.who}`).not.toMatch(/capture|tamponade/i);
    }
  });

  it('the RBBB teaching says "raises concern", and the reversible-cause item explains amlodipine', () => {
    expect(sc.teaching.join(' ')).toMatch(/right bundle pattern raises concern/);
    expect(sc.critical.find((c) => c.id === 'md-meds')!.why).toMatch(/amlodipine does not slow AV conduction/);
  });
});
