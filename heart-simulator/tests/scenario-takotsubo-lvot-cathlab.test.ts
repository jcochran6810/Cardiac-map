import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabTakotsubo as sc } from '@/lib/sim/scenario/scenarios/cathlabTakotsubo';
import type { SimState } from '@/lib/sim/scenario/types';
import { readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const said = (s: SimState, re: RegExp) => s.log.some((l) => re.test(l.text));
const bp = (s: SimState) => [s.vitals.sbp, s.vitals.dbp];

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: set-up and the time-out, the Tiger as asked, calls out the fall, the pigtail and the pullback recording as asked,
  // calls out the gradient, the LV gram once the nurse's fluid and phenylephrine have the pressure back, then the 12-lead and the radial band
  3: ['prep', 'transducer', 'pads', 'timeout', 'cath-tiger', 'callout', 'cath-pigtail', 'lvedp', 'callout', 'lv-gram', 'ecg12', 'hemostasis'],
  // the nurse: consent, heparin as ordered, the time-out, a baseline look and pressure, the fall and the murmur called out, the
  // heart and lungs listened to, saline and phenylephrine as ordered, fentanyl for the pain, the 12-lead, the radial band and the hand-off
  4: ['consent', 'heparin', 'timeout', 'perfusion', 'nibp', 'callout', 'lungs', 'fluid', 'phenylephrine', 'reassess', 'fentanyl', 'ecg12', 'hemostasis', 'handoff'],
  // the cardiologist: consent, heparin and the time-out before access; the diagnostic run (clean); then, as the pressure
  // falls, the pigtail and the pullback, saline and phenylephrine, the LV gram, the 12-lead and the hand-off
  5: ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'angio', 'cath-pigtail', 'lvedp', 'fluid', 'phenylephrine', 'lv-gram', 'ecg12', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
const RN = IDEAL[4];
const TECH = IDEAL[3];
/** Up to the diagnostic run (the pressure falls as it ends) */
const MD_TO_ANGIO = MD.slice(0, MD.indexOf('angio') + 1);
const RN_TO_DROP = RN.slice(0, RN.indexOf('nibp') + 1);
const TECH_TO_DROP = TECH.slice(0, TECH.indexOf('cath-tiger') + 1);
/** The cardiologist with the pigtail in the ventricle, the pressure down and the gradient measured */
const MD_TO_GRADIENT = MD.slice(0, MD.indexOf('lvedp') + 1);

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const naming = /takotsubo|outflow|obstruct|ballooning|SAM\b|systolic anterior motion/i;
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

describe('Takotsubo with outflow obstruction in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('takotsubo-lvot-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('takotsubo');
    for (const key of Object.values(sc.images ?? {})) expect(CATH_IMAGES[key!], key).toBeDefined();
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['angio-normal', 'hemo-lvoto', 'clin-lvoto', 'takotsubo']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    // a case rule that stands in for a built-in one names a rule that exists
    const builtIn = new Set(BUILT_IN_HARMS.map((h) => h.id));
    for (const h of sc.harms) for (const id of h.replaces ?? []) expect(builtIn.has(id), `${h.id} replaces ${id}`).toBe(true);
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // every harm aimed at a role can be committed by it
      for (const h of sc.harms.filter((x) => x.roles?.includes(role))) expect(h.actions.some((id) => scope.has(id)), `role ${role}: harm ${h.id}`).toBe(true);
      // every role has its own part: a briefing that names it, and critical items of its own
      expect(sc.briefing[role]?.at(-1)?.[1], `briefing ${role}`).toMatch(/^You are the /);
      expect(sc.critical.filter((c) => c.roles?.length === 1 && c.roles[0] === role).length, `role ${role}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('uses US spelling everywhere a learner reads', () => {
    const texts = [JSON.stringify(sc), ...sc.critical.flatMap((c) => [c.label, c.why]), ...sc.harms.map((h) => h.text)];
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) texts.push(l.text);
    for (const t of texts) expect(t).not.toMatch(BRITISH);
  });
});

describe('ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      // every role ends with the same patient: the obstruction relieved, the diagnosis on the screen, nothing stented
      expect(s.flags).toEqual(expect.objectContaining({ obstructed: expect.any(Number), relieved: expect.any(Number), ballooning: expect.any(Number) }));
      expect(s.flags.pci).toBeUndefined();
      expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      run(sc, role, IDEAL[role], (s) => expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile));
      for (const l of run(sc, role, IDEAL[role]).log) if (l.who === 'monitor') expect(l.text, `role ${role}: ${l.text}`).not.toMatch(giveaway);
    }
  });

  it('nothing names the diagnosis before the learner has measured or seen it, for every role', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role]);
      // the first read of the pressures (or the echo) is where the obstruction is named
      const first = s.log.findIndex((l) => l.who === 'you' && /^My read: (Dynamic LV outflow|Dynamic left)/.test(l.text));
      expect(first, `role ${role}`).toBeGreaterThan(0);
      for (const l of s.log.slice(0, first)) expect(l.text, `role ${role}: ${l.who} "${l.text}"`).not.toMatch(naming);
    }
  });
});

describe('the clean coronaries and the fall', () => {
  it('the diagnostic run is clean, on the real image, and the pressure falls with a new murmur as it ends', () => {
    const s = run(sc, 5, MD_TO_ANGIO);
    expect(s.images.at(-1)).toMatchObject({ id: 'angio', image: 'normal-left-rao-caudal' });
    expect(s.reads.at(-1)).toMatchObject({ kind: 'angio', answer: 'angio-normal', verdict: 'correct' });
    expect(s.flags.obstructed).toBe(s.flags['normal-coronaries']);
    expect(bp(s)).toEqual([79, 53]);
    expect(s.rhythm).toEqual({ profile: 'takotsubo', hr: 120 });
    // a gradient's murmur rises and falls through systole; a holosystolic one there would mean a septal rupture
    expect(said(s, /new murmur: loud and harsh, rising and falling in systole/)).toBe(true);
    expect(said(s, /all through systole|holosystolic/)).toBe(false);
  });

  it('the run read as "open artery with TIMI 3 flow" is half right; a thrombus is wrong', () => {
    const half = run(sc, 5, readAfter(MD_TO_ANGIO, 'angio', 'angio-timi3'), undefined, 'manual');
    expect(half.reads.at(-1)?.verdict).toBe('partial');
    const wrong = run(sc, 5, readAfter(MD_TO_ANGIO, 'angio', 'angio-thrombus'), undefined, 'manual');
    expect(wrong.reads.at(-1)?.verdict).toBe('wrong');
  });

  it('the pullback shows the gradient below the valve, and the read is dynamic LV outflow tract obstruction', () => {
    const s = run(sc, 5, MD_TO_GRADIENT);
    const pressures = s.log.filter((l) => l.who === 'monitor' && /at the apex/.test(l.text)).at(-1)!.text;
    expect(pressures).toMatch(/^LV 164\/14 mmHg at the apex \(LVEDP 14\)\. Pulling back, the systolic pressure falls to 79 while the catheter is still below the aortic valve/);
    expect(s.reads.at(-1)).toMatchObject({ kind: 'hemo', answer: 'hemo-lvoto', verdict: 'correct' });
    const as = run(sc, 5, readAfter(readAfter(MD_TO_GRADIENT, 'angio', 'angio-normal'), 'lvedp', 'hemo-as'), undefined, 'manual');
    expect(as.reads.at(-1)?.verdict).toBe('wrong');
    expect(as.log.at(-1)?.text).toMatch(/not across the valve as it would in aortic stenosis/);
  });

  it('a left view instead of the diagnostic run shows the left system (RAO caudal on the real image); a right view describes the right', () => {
    const left = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'view-rao-caudal']);
    expect(left.images.at(-1)).toMatchObject({ id: 'view-rao-caudal', image: 'normal-left-rao-caudal' });
    expect(left.reads.at(-1)?.answer).toBe('angio-normal');
    // she holds on until the pictures are done: a second view (or a minute)
    expect(left.flags.obstructed).toBeUndefined();
    const second = perform(sc, left, 'view-lao-cranial');
    expect(second.flags.obstructed).toBeDefined();
    expect(said(second, /^As the last run clears/)).toBe(true);
    const waited = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'view-rao-caudal', 'cath-pigtail', 'nibp']);
    expect(waited.flags.obstructed).toBeDefined();
    expect(said(waited, /^A minute after the run, she groans/)).toBe(true);
    const right = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-jr4', 'view-rca-lao']);
    expect(right.log.at(-1)?.text).toMatch(/^Right coronary, LAO view of the right coronary: smooth/);
    expect(right.flags.obstructed).toBeUndefined();
    // a JR4 alone cannot show the left system
    expect(run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-jr4', 'view-rao-cranial']).log.at(-1)?.who).toBe('system');
  });

  it('the pullback needs a pigtail in the ventricle', () => {
    const s = run(sc, 5, [...MD_TO_ANGIO, 'lvedp']);
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/pigtail/) });
    expect(s.counts.lvedp).toBeUndefined();
  });

  it('untreated, the pressure keeps falling: gray at 4 minutes, drowsy and mottled at 8', () => {
    let s = run(sc, 5, [...MD_TO_ANGIO, 'reassess', 'reassess']);
    expect(s.fired).toContain('worse');
    expect(s.vitals.sbp).toBe(70);
    s = run(sc, 5, [...MD_TO_ANGIO, ...R(4)]);
    expect(s.fired).toContain('worse-2');
    expect([s.vitals.sbp, s.vitals.gcs]).toEqual([61, 12]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 132. BP 61/44.')).toBe(true);
    // help since the fall stops the decline
    const helped = run(sc, 5, [...MD_TO_ANGIO, 'reassess', 'fluid', ...R(4)]);
    expect(helped.fired).not.toContain('worse');
    expect(helped.fired).toContain('not-enough');
    expect(helped.log.some((l) => l.who === 'team' && /^Nurse: "Still 91 over 59, doctor/.test(l.text))).toBe(true);
  });
});

describe('right care works as it would', () => {
  it('fluid helps but is not enough; phenylephrine on top brings the pressure back, softens the murmur and slows the rate', () => {
    let s = run(sc, 5, [...MD_TO_GRADIENT, 'fluid']);
    expect(bp(s)).toEqual([91, 59]);
    expect(s.flags.relieved).toBeUndefined();
    s = perform(sc, s, 'phenylephrine');
    expect(bp(s)).toEqual([109, 68]);
    expect(s.rhythm.hr).toBe(100);
    expect(s.flags.relieved).toBeDefined();
    expect(said(s, /murmur is softer/)).toBe(true);
    expect(s.penalties).toEqual([]);
  });

  it('phenylephrine before the fluid works the same way, and is no mistake with a systolic of 79', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'phenylephrine', 'fluid', 'lv-gram', 'ecg12', 'handoff']);
    expectFullMarks(s);
  });

  it('an echo instead of the pullback and the LV gram is correct care too: full marks, and the echo is read', () => {
    const steps = ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'angio', 'echo', 'fluid', 'phenylephrine', 'ecg12', 'handoff'];
    const s = run(sc, 5, steps);
    expect(s.reads.find((r) => r.kind === 'clinical')).toMatchObject({ answer: 'clin-lvoto', verdict: 'correct' });
    expect(said(s, /late-peaking, dagger-shaped signal, peak gradient about 85 mmHg/)).toBe(true);
    expectFullMarks(s);
  });

  it('a pullback before the angiogram already shows the resting gradient; the fall is then timed from there', () => {
    const steps = ['consent', 'heparin', 'timeout', 'access', 'cath-pigtail', 'lvedp', 'lv-gram', 'cath-tiger', 'angio', 'fluid', 'phenylephrine', 'ecg12', 'handoff'];
    const s = run(sc, 5, steps);
    expect(s.reads.find((r) => r.kind === 'hemo')?.answer).toBe('hemo-lvoto');
    expect(said(s, /^LV 146\/14 mmHg at the apex/)).toBe(true);
    expectFullMarks(s);
  });

  it('raised legs bridge to the bolus (once); after a liter more saline adds nothing and wets the lungs', () => {
    let s = run(sc, 5, [...MD_TO_GRADIENT, 'legs-up']);
    expect(s.vitals.sbp).toBe(85);
    s = run(sc, 5, [...MD_TO_GRADIENT, 'fluid', 'fluid']);
    expect([s.timers.gradient, s.vitals.spo2]).toEqual([45, 94]);
    s = run(sc, 5, [...MD_TO_GRADIENT, 'fluid', 'fluid', 'fluid', 'fluid', 'lungs']);
    expect(s.timers.gradient).toBe(45);
    expect(s.vitals.spo2).toBe(90);
    expect(s.flags.relieved).toBeUndefined();
    expect(said(s, /crackles at both bases now/)).toBe(true);
    expect(s.log.at(-1)?.text).toMatch(/^Fine crackles at both bases now\. Over the heart/);
    expect(s.penalties).toEqual([]);
    // the hand-off warns the unit off more volume
    const out = run(sc, 5, [...MD_TO_GRADIENT, 'fluid', 'fluid', 'fluid', 'phenylephrine', 'lv-gram', 'ecg12', 'handoff']);
    expect(out.log.find((l) => /^SBAR hand-off/.test(l.text))?.text).toMatch(/She has had 1500 mL of saline and has crackles at both bases.*If she drops again: phenylephrine and an echo/);
  });

  it('raised legs and a liter of saline can be enough: fluid-responsive, she needs no phenylephrine (and the review asks for none)', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'legs-up', 'fluid', 'fluid', 'lv-gram', 'ecg12', 'handoff']);
    expect(s.counts.phenylephrine).toBeUndefined();
    expectFullMarks(s);
  });

  it('metoprolol once the pressure is back is no mistake: the rate slows and the gradient falls further', () => {
    const before = run(sc, 5, MD.slice(0, MD.indexOf('phenylephrine') + 1));
    const s = perform(sc, before, 'metoprolol');
    expect(s.penalties).toEqual([]);
    expect(s.rhythm.hr).toBeLessThan(before.rhythm.hr - 10);
    expect(s.vitals.sbp).toBeGreaterThan(before.vitals.sbp);
  });

  it('metoprolol while she is still in shock (a systolic of 91 after a bolus) costs points and does not bring the pressure up', () => {
    const before = run(sc, 5, [...MD_TO_GRADIENT, 'fluid']);
    expect(bp(before)).toEqual([91, 59]);
    const s = perform(sc, before, 'metoprolol');
    expect(penalties(s)).toEqual(['bb-hypotension']);
    expect(bp(s)).toEqual([91, 59]);
    expect(s.rhythm.hr).toBe(before.rhythm.hr - 12);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'The rate slows, but the pressure does not come up.')).toBe(true);
    // more fluid does not finish the job: the afterload still has to come up
    const more = perform(sc, s, 'fluid');
    expect(more.flags.relieved).toBeUndefined();
    expect(missed(more)).toContain('Raise the afterload: phenylephrine');
  });

  it('an Impella is for refractory shock: right once fluid and phenylephrine have failed, penalized before them or once the pressure is back', () => {
    // eight minutes untreated: one bolus and one dose of phenylephrine leave her still down
    const refractory = run(sc, 5, [...MD_TO_GRADIENT, ...R(4), 'fluid', 'phenylephrine']);
    expect(refractory.flags.relieved).toBeUndefined();
    const pumped = perform(sc, refractory, 'impella');
    expect(pumped.penalties).toEqual([]);
    expect(pumped.flags.relieved).toBeDefined();
    expect(said(pumped, /past the narrowed outflow tract/)).toBe(true);
    const early = run(sc, 5, [...MD_TO_GRADIENT, 'impella']);
    expect(penalties(early)).toEqual(['mcs-first']);
    expect(early.flags.relieved).toBeDefined();
    expect(missed(early)).toEqual(expect.arrayContaining(['Fill the ventricle: a fluid bolus']));
    const late = perform(sc, run(sc, 5, MD.slice(0, MD.indexOf('phenylephrine') + 1)), 'impella');
    expect(penalties(late)).toEqual(['mcs-first']);
    // placed before anyone measured, it does not name what it treats
    const blind = run(sc, 5, [...MD_TO_ANGIO, 'impella']);
    expect(said(blind, /outflow/)).toBe(false);
  });

  it('the hand-off says what was found, what never to give her and the QT', () => {
    const s = run(sc, 5, MD);
    const text = s.log.find((l) => l.who === 'you' && /^SBAR hand-off/.test(l.text))!.text;
    expect(text).toMatch(/gradient of 85 mmHg inside the ventricle/);
    expect(text).toMatch(/no inotropes, no nitrates, no diuretics, no balloon pump/);
    expect(text).toMatch(/acquired long QT/);
    expect(text).toMatch(/Treated with saline and phenylephrine; the gradient is now about 35 and her pressure 109\/68/);
  });

  it('the hand-off waits for the pressure and the diagnosis', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'handoff']);
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/procedure is not over/) });
  });

  it('the 12-lead read in the lab is the Takotsubo pattern; an anterior STEMI read is not the full read', () => {
    const s = run(sc, 5, MD);
    expect(s.reads.find((r) => r.kind === 'ecg')).toMatchObject({ answer: 'takotsubo', verdict: 'correct' });
    expect(s.log.some((l) => l.who === 'feedback' && /no reciprocal depression in the inferior leads; QTc about 480 ms/.test(l.text))).toBe(true);
    // the engine marks it wrong today; reads.ts could make it half right (the ECG alone cannot tell them apart): either way not correct
    const steps = readAfter(readAfter(readAfter(MD, 'angio', 'angio-normal'), 'lvedp', 'hemo-lvoto'), 'ecg12', 'stemi-anterior');
    const stemi = run(sc, 5, steps, undefined, 'manual');
    expect(stemi.reads.find((r) => r.kind === 'ecg')?.verdict).not.toBe('correct');
  });
});

describe('the traps: wrong care does what it would, and costs points', () => {
  it('a catecholamine raises the gradient and drops the pressure: norepinephrine and push-dose epinephrine cost points', () => {
    for (const id of ['pressor', 'push-epi']) {
      const s = run(sc, 5, [...MD_TO_GRADIENT, id]);
      expect(s.vitals.sbp, id).toBeLessThan(79);
      expect(penalties(s), id).toEqual(['catecholamine-lvoto']);
    }
    const nurse = run(sc, 4, [...RN_TO_DROP, 'callout', 'pressor']);
    expect(penalties(nurse)).toEqual(['catecholamine-lvoto']);
    expect(nurse.log.some((l) => l.who === 'operator' && /Turn it off/.test(l.text))).toBe(true);
  });

  it('1 mg of epinephrine with a pulse is the built-in critical error, scored once', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'epinephrine']);
    expect(penalties(s)).toEqual(['arrest-epi-with-pulse']);
    expect(s.vitals.sbp).toBeLessThan(65);
  });

  it('nitroglycerin with the obstruction drops the pressure and costs points once (not also the low-pressure rule)', () => {
    for (const id of ['nitro', 'nitro-high', 'ic-nitro']) {
      const s = run(sc, 5, [...MD_TO_GRADIENT, id]);
      expect(s.vitals.sbp, id).toBeLessThan(79);
      expect(penalties(s), id).toEqual([id === 'ic-nitro' ? 'nitrate-lvoto-ic' : 'nitrate-lvoto']);
    }
    // once relieved, a nitrate brings the obstruction straight back
    const back = run(sc, 5, [...MD.slice(0, MD.indexOf('phenylephrine') + 1), 'nitro-high']);
    expect(back.flags.relieved).toBeUndefined();
    expect(penalties(back)).toEqual(['nitrate-lvoto']);
  });

  it('a balloon pump makes the obstruction worse and is a critical error; the tech who readies one is stopped', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'iabp']);
    expect(s.vitals.sbp).toBeLessThan(79);
    expect(s.penalties[0]).toMatchObject({ id: 'iabp-lvoto', severity: 'critical' });
    expect(review(sc, stop(s)).toFix[0]).toMatchObject({ kind: 'harm', severity: 'critical' });
    const tech = run(sc, 3, [...TECH.slice(0, TECH.indexOf('lvedp') + 1), 'iabp']);
    expect(penalties(tech)).toEqual(['tech-iabp']);
    expect(tech.log.some((l) => l.who === 'operator' && /balloon pump drops her afterload/.test(l.text))).toBe(true);
    // before the gradient is known the operator only holds it, at no cost
    const early = run(sc, 3, [...TECH_TO_DROP, 'iabp']);
    expect(early.penalties).toEqual([]);
  });

  it('a beta-blocker before anyone knows why, or with a systolic under 90, costs points', () => {
    const before = run(sc, 5, ['consent', 'heparin', 'timeout', 'metoprolol']);
    expect(penalties(before)).toEqual(['bb-before-diagnosis']);
    expect(before.log.some((l) => /before we know what her heart is doing/.test(l.text))).toBe(true);
    const low = run(sc, 5, [...MD_TO_GRADIENT, 'metoprolol']);
    expect(penalties(low)).toEqual(['bb-hypotension']);
    const nurse = run(sc, 4, [...RN_TO_DROP, 'callout', 'metoprolol']);
    expect(penalties(nurse)).toEqual(['bb-hypotension']);
  });

  it('diltiazem widens the gradient and costs points, with the pressure down or before the fall (a compensating sinus rate)', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'diltiazem']);
    expect(s.vitals.sbp).toBeLessThan(79);
    expect(penalties(s)).toEqual(['diltiazem-takotsubo']);
    expect(penalties(run(sc, 5, ['consent', 'heparin', 'timeout', 'diltiazem']))).toEqual(['diltiazem-takotsubo']);
  });

  it('no stent for clean arteries: a guide or a wire costs the cardiologist points; the tech who opens one is refused', () => {
    const md = run(sc, 5, [...MD_TO_ANGIO, 'guide-ebu', 'wire-workhorse']);
    expect(penalties(md)).toEqual(['no-culprit-pci']);
    const tech = run(sc, 3, [...TECH_TO_DROP, 'stent-des']);
    expect(penalties(tech)).toEqual(['tech-unasked-device']);
    expect(tech.log.some((l) => l.who === 'operator' && /nothing in these arteries to treat/.test(l.text))).toBe(true);
    // before the pictures, a guide opened ahead is no mistake of this case
    expect(run(sc, 3, ['prep', 'guide-ebu']).penalties).toEqual([]);
  });

  it('a P2Y12 or GP IIb/IIIa inhibitor after clean coronaries costs points; before the pictures it does not', () => {
    expect(penalties(run(sc, 5, [...MD_TO_ANGIO, 'cangrelor']))).toEqual(['antiplatelet-no-acs']);
    expect(penalties(run(sc, 5, ['consent', 'heparin', 'p2y12']))).toEqual([]);
  });

  it('a pericardiocentesis finds no fluid and is a critical error; a fibrinolytic is too', () => {
    const tap = run(sc, 5, [...MD_TO_ANGIO, 'pericardiocentesis']);
    expect(said(tap, /no fluid comes back — there is no effusion/)).toBe(true);
    expect(tap.penalties[0]).toMatchObject({ id: 'pericardiocentesis-no-effusion', severity: 'critical' });
    expect(run(sc, 5, ['consent', 'tnk']).penalties[0]).toMatchObject({ id: 'lytic-lab', severity: 'critical' });
  });

  it('sedation or midazolam with the pressure down makes it worse and costs points', () => {
    const sed = run(sc, 5, [...MD_TO_GRADIENT, 'sedation']);
    expect(penalties(sed)).toEqual(['sedation-low-pressure']);
    expect(sed.vitals.sbp).toBeLessThan(79);
    const midaz = run(sc, 4, [...RN_TO_DROP, 'callout', 'midazolam']);
    expect(penalties(midaz)).toEqual(['midazolam-unsafe']);
  });

  it('oxygen with an SpO₂ of 94 % costs a little; a unit of blood is volume but there is no bleeding', () => {
    expect(penalties(run(sc, 4, [...RN_TO_DROP, 'o2-nrb']))).toEqual(['oxygen-normoxic']);
    const blood = run(sc, 5, [...MD_TO_GRADIENT, 'transfuse']);
    expect(penalties(blood)).toEqual(['transfuse-no-bleeding']);
    expect(blood.vitals.sbp).toBeGreaterThan(79);
  });

  it('a nitrate before the fall costs only the built-in rate rule (102, no heart failure), but the pressure dips and the fall is deeper', () => {
    const s = run(sc, 5, ['consent', 'heparin', 'timeout', 'nitro', 'access', 'cath-tiger', 'angio']);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-tachycardia']);
    expect(s.vitals.sbp).toBeLessThan(79);
  });
});

describe('the nurse', () => {
  it('calls out the fall: the operator goes straight in; silence costs the callout and a minute', () => {
    const called = run(sc, 4, [...RN_TO_DROP, 'callout']);
    expect(called.flags['lvoto-known']).toBe(called.flags.obstructed! + 0.1);
    expect(called.reads.at(-1)).toMatchObject({ kind: 'hemo', answer: 'hemo-lvoto' });
    const silent = run(sc, 4, [...RN_TO_DROP, 'reassess']);
    expect(silent.log.some((l) => l.who === 'operator' && /Who's watching her pressure/.test(l.text))).toBe(true);
    expect(missed(silent)).toContain('Call out the falling pressure at once');
  });

  it('hears the murmur: the lungs and the heart before and after the fall', () => {
    const before = run(sc, 4, ['consent', 'lungs']);
    expect(before.log.at(-1)?.text).toBe('Clear on both sides.');
    const after = run(sc, 4, [...RN_TO_DROP, 'callout', 'lungs']);
    expect(after.log.find((l) => l.who === 'you' && /^Clear on both sides\. Over the heart/.test(l.text))?.text).toMatch(/new loud, harsh crescendo–decrescendo systolic murmur/);
  });

  it('chooses the pressor: anything that drives the heart gets a word and its own penalty, phenylephrine does the job', () => {
    const steps = [...RN.slice(0, RN.indexOf('fluid') + 1), 'push-epi'];
    const s = run(sc, 4, steps);
    expect(s.log.some((l) => l.who === 'operator' && /it drives the heart harder/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['catecholamine-lvoto']);
    const fixed = perform(sc, s, 'phenylephrine');
    expect(fixed.fired).toContain('rn-vaso-got');
  });

  it('a nitrate or midazolam for the pain gets a word; the nitrate costs its own penalty, midazolam the order\'s', () => {
    const toPain = RN.slice(0, RN.indexOf('fentanyl'));
    const nitro = run(sc, 4, [...toPain, 'nitro']);
    expect(nitro.log.some((l) => l.who === 'operator' && /a nitrate empties the ventricle/.test(l.text))).toBe(true);
    expect(penalties(nitro)).toEqual(['nitrate-lvoto']);
    const midaz = run(sc, 4, [...toPain, 'midazolam']);
    expect(penalties(midaz)).toEqual(['wrong-rn-pain']);
  });

  it('an intracoronary drug drawn up unasked during the fall is refused, at a small cost', () => {
    const s = run(sc, 4, [...RN_TO_DROP, 'callout', 'ic-nitro']);
    expect(s.log.some((l) => l.who === 'operator' && /I didn't ask for that/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['unasked-ic-drug']);
    expect(s.vitals.sbp).toBe(79);
  });

  it('the heparin order: another anticoagulant gets a word and costs points', () => {
    const s = run(sc, 4, ['consent', 'bivalirudin']);
    expect(s.log.some((l) => l.who === 'operator' && /unfractionated heparin, 4,300 units/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['wrong-rn-heparin']);
  });

  it('a slow nurse: the fall goes on, one round is not enough, and the operator asks for more phenylephrine', () => {
    const s = run(sc, 4, [...RN_TO_DROP, 'callout', 'reassess', 'reassess', 'reassess', 'phenylephrine', 'phenylephrine']);
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'rn-fluid-fallback', 'rn-vaso-got', 'rn-more-ask', 'rn-more-got']));
    expect(s.flags.relieved).toBeDefined();
    expect(s.penalties).toEqual([]);
    expect(missed(s)).toContain('Fluid bolus for the obstruction, as ordered');
  });

  it('when the nurse never answers, the team gives the fluid and the phenylephrine — and the procedure still ends', () => {
    let s = run(sc, 4, [...RN_TO_DROP, 'callout']);
    for (let i = 0; i < 8 && !s.flags['proc-over']; i++) s = perform(sc, s, 'reassess');
    expect(s.fired).toEqual(expect.arrayContaining(['rn-fluid-fallback', 'rn-vaso-fallback', 'md-done']));
    expect(s.flags.relieved).toBeDefined();
    expect(missed(s)).toEqual(expect.arrayContaining(['Fluid bolus for the obstruction, as ordered', 'Phenylephrine for the obstruction, as ordered']));
  });
});

describe('the tech', () => {
  it('hands what was asked for, records the pullback (and reads it), and the procedure moves on with each step', () => {
    const s = run(sc, 3, TECH);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-setup-for-tech', 'md-access', 'diag-got', 'md-angio', 'drop', 'pigtail-got', 'md-pigtail', 'pullback-got', 'rn-treats-for-tech', 'lvgram-got', 'md-done']));
    expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
    expect(s.reads.map((r) => r.answer)).toEqual(['angio-normal', 'hemo-lvoto', 'takotsubo']);
  });

  it('the wrong catheter gets a word and costs points', () => {
    const diag = run(sc, 3, [...TECH.slice(0, TECH.indexOf('cath-tiger')), 'cath-jl4']);
    expect(penalties(diag)).toEqual(['wrong-diag']);
    const pig = run(sc, 3, [...TECH_TO_DROP, 'cath-jr4']);
    expect(pig.log.some((l) => l.who === 'operator' && /A pigtail, for the ventricle/.test(l.text))).toBe(true);
    expect(penalties(pig)).toEqual(['wrong-pigtail']);
  });

  it('the operator names the obstruction and orders the treatment only once the tech has read the pullback', () => {
    const read = run(sc, 3, readAfter(readAfter(TECH.slice(0, TECH.indexOf('lvedp') + 1), 'cath-tiger', 'angio-normal'), 'lvedp', 'hemo-lvoto'), undefined, 'manual');
    expect(read.fired).not.toContain('rn-treats-for-tech');
    expect(perform(sc, read, 'callout').fired).toContain('rn-treats-for-tech');
  });

  it('a tech who skips the gradient call-out misses only that; the LV gram waits for the operator\'s call', () => {
    const toPullback = TECH.slice(0, TECH.indexOf('lvedp') + 1);
    // contrast into a ventricle in shock, unasked: the operator stops it, and no time passes
    const early = run(sc, 3, [...toPullback, 'lv-gram']);
    expect(early.counts['lv-gram']).toBeUndefined();
    expect(early.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/^Not while she's this low/) });
    const s = run(sc, 3, [...toPullback, 'reassess', 'lv-gram', 'ecg12', 'hemostasis']);
    // the call-out still waits to be made (it counts late), so the case goes on
    expect(s.ended).toBeNull();
    expect(review(sc, stop(s)).toFix.map((t) => t.label)).toEqual(['Call out the gradient']);
    expect(s.fired).toContain('lvgram-got');
    expect(perform(sc, s, 'callout').ended?.reason).toBe('complete');
  });

  it('when the tech never records the pullback, the operator does — late, and the item is missed', () => {
    let s = run(sc, 3, [...TECH_TO_DROP, 'callout', 'cath-pigtail']);
    for (let i = 0; i < 3 && !s.flags['lvoto-known']; i++) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('pullback-fallback');
    expect(missed(s)).toContain('Record the LV pressure and the pullback, as asked');
  });

  it('a hint names the next thing missing', () => {
    const s = takeHint(sc, run(sc, 3, TECH_TO_DROP));
    expect(s.log.at(-1)?.text).toMatch(/^Hint: Call out the falling pressure at once/);
  });
});

describe('every role', () => {
  it('ends with the same patient, and only the cardiologist chooses the treatment', () => {
    const ends = ROLES.map((role) => run(sc, role, IDEAL[role]));
    for (const s of ends) expect(s.flags['lvoto-known']).toBeDefined();
    expect(ends.map((s) => s.counts.phenylephrine ?? 0)).toEqual([0, 1, 1]);
  });

  it('the review lists a 12-lead once she is stable for every role, after the pressure is back', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role].filter((id) => id !== 'ecg12'));
      expect(missed(s), `role ${role}`).toContain('12-lead once she is stable: the QTc');
    }
  });

  it('a hand-off that skips steps ends the case, counting what is missing (nurse and cardiologist)', () => {
    const nurse = run(sc, 4, RN.filter((id) => id !== 'hemostasis'));
    expect(nurse.ended?.reason).toBe('complete');
    expect(review(sc, nurse).missed).toBe(1);
    const md = run(sc, 5, MD.filter((id) => id !== 'ecg12'));
    expect(md.ended?.reason).toBe('complete');
    expect(review(sc, md).outcome).toMatch(/^Care handed over at \d+:\d\d with 1 critical item not done\.$/);
  });
});

describe('second review: scope, order and physiology', () => {
  it('the labs give the admission troponin without calling it low (it rises as in an infarct; its peak stays low)', () => {
    expect(sc.facts.labs).not.toMatch(/modest/);
    expect(sc.facts.labs).toMatch(/Potassium 3\.6, magnesium 1\.8/);
    const text = run(sc, 5, MD).log.find((l) => /^SBAR hand-off/.test(l.text))!.text;
    expect(text).toMatch(/potassium \(3\.6\) and magnesium \(1\.8\) brought up to 4 or more and 2 or more/);
  });

  it('no second heparin bolus after the operator gave it, and no second aspirin after EMS: refused, at no cost', () => {
    const late = run(sc, 4, ['ecg12', 'consent', 'heparin']);
    expect(late.fired).toContain('rn-heparin-fallback');
    expect(late.counts.heparin).toBeUndefined();
    expect(late.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/already in: a second bolus would double the dose/) });
    for (const role of [4, 5] as const) {
      const s = run(sc, role, ['aspirin']);
      expect(s.counts.aspirin, `role ${role}`).toBeUndefined();
      expect(s.minute).toBe(0);
      expect(s.log.at(-1)?.text).toMatch(/aspirin 324 mg with EMS an hour ago: no second dose/);
    }
  });

  it('the nurse gives the pressor on the operator\'s order: unordered it costs a little (and the operator says so); ordered, nothing', () => {
    const own = run(sc, 4, [...RN_TO_DROP, 'callout', 'phenylephrine']);
    expect(penalties(own)).toEqual(['rn-no-order-phenylephrine']);
    expect(own.log.some((l) => l.who === 'operator' && /Tell me before you push a pressor/.test(l.text))).toBe(true);
    expect(run(sc, 4, RN).penalties).toEqual([]);
    // before the fall her 106 needs no vasoconstrictor: one penalty for it, not two
    expect(penalties(run(sc, 4, ['consent', 'heparin', 'phenylephrine']))).toEqual(['phenylephrine-no-hypotension']);
    expect(penalties(run(sc, 5, ['consent', 'heparin', 'phenylephrine']))).toEqual(['phenylephrine-no-hypotension']);
  });

  it('the nurse\'s metoprolol, nitroglycerin and antiplatelet without an order cost a little, where no other rule scores them', () => {
    expect(penalties(run(sc, 4, [...RN.slice(0, RN.indexOf('phenylephrine') + 1), 'metoprolol']))).toEqual(['rn-no-order-metoprolol']);
    expect(penalties(run(sc, 4, ['consent', 'heparin', 'nitro']))).toEqual(['rn-no-order-nitro']);
    expect(penalties(run(sc, 4, ['consent', 'heparin', 'p2y12']))).toEqual(['rn-no-order-antiplatelet']);
    // the cardiologist decides these: metoprolol once the pressure is back is the cardiologist's call
    expect(perform(sc, run(sc, 5, MD.slice(0, MD.indexOf('phenylephrine') + 1)), 'metoprolol').penalties).toEqual([]);
  });

  it('sedation while she is still down costs points even with a systolic over 90', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'fluid', 'sedation']);
    expect(penalties(s)).toEqual(['sedation-low-pressure']);
    expect(s.vitals.sbp).toBeLessThan(91);
  });

  it('a long QT is on her problem list: ondansetron costs points', () => {
    expect(sc.problems).toContain('long-qt');
    expect(penalties(run(sc, 5, ['ondansetron']))).toEqual(['ondansetron-long-qt']);
  });

  it('the nurse who already gave fentanyl for her chest pain has answered the operator\'s request', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('reassess')), 'fentanyl', 'reassess', 'ecg12', 'hemostasis', 'handoff']);
    expect(s.fired).toContain('rn-pain-got');
    expectFullMarks(s);
  });

  it('the team pushes no phenylephrine for the order\'s sake once her pressure is back (raised legs and saline)', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('fluid') + 1), 'legs-up', 'fluid', 'reassess', 'reassess']);
    expect(s.flags.relieved).toBeDefined();
    expect(s.fired).toContain('rn-vaso-fallback');
    expect(s.timers.phenyl).toBeUndefined();
    expect(s.log.some((l) => l.who === 'operator' && l.text === 'Never mind — her pressure is back. Hold it.')).toBe(true);
    // the order was not carried out: the review says so (and nothing else)
    expect(missed(s)).toContain('Phenylephrine for the obstruction, as ordered');
    expect(s.penalties).toEqual([]);
  });

  it('the hand-off says what made her worse', () => {
    const s = run(sc, 5, [...MD_TO_GRADIENT, 'push-epi', 'fluid', 'phenylephrine', 'phenylephrine', 'lv-gram', 'ecg12', 'handoff']);
    expect(s.log.find((l) => /^SBAR hand-off/.test(l.text))?.text).toMatch(/She was also given a catecholamine, and the gradient climbed with it\./);
    expect(run(sc, 5, MD).log.find((l) => /^SBAR hand-off/.test(l.text))?.text).not.toMatch(/also given/);
  });
});

describe('second review: the team moves on, in order', () => {
  it('a tech or nurse who never runs the time-out: the operator leads it at 6 minutes, and the review counts it missed', () => {
    const tech = run(sc, 3, R(3));
    expect(tech.fired).toContain('team-timeout');
    expect(tech.flags.access).toBeDefined();
    expect(missed(tech)).toContain('Procedural time-out before access');
    const nurse = run(sc, 4, ['heparin', ...R(3)]);
    expect(nurse.log.some((l) => l.who === 'operator' && /confirmed her consent and allergies with her myself/.test(l.text))).toBe(true);
    expect(nurse.flags.access).toBeDefined();
    expect(missed(nurse)).toEqual(expect.arrayContaining(['Consent, contrast allergy and anticoagulants checked', 'Procedural time-out before access']));
  });

  it('a nurse who treats the fall before anyone measured: the operator still measures, then films the ventricle, then ends', () => {
    const steps = ['consent', 'heparin', 'timeout', 'fluid', 'phenylephrine'];
    let s = run(sc, 4, steps);
    expect(s.flags.relieved).toBeDefined();
    expect(s.flags['lvoto-known']).toBeUndefined();
    // the band waits for the sheath to come out
    s = run(sc, 4, [...steps, 'hemostasis']);
    expect(s.counts.hemostasis).toBeUndefined();
    s = run(sc, 4, [...steps, 'hemostasis', 'reassess']);
    expect(s.log.some((l) => l.who === 'operator' && /^Her pressure is back — but I want to know why it fell/.test(l.text))).toBe(true);
    expect(s.flags['lvoto-known']).toBeDefined();
    expect(s.flags.ballooning).toBeUndefined();
    s = run(sc, 4, [...steps, 'hemostasis', 'reassess', 'reassess']);
    expect(s.flags.ballooning).toBeGreaterThan(s.flags['lvoto-known']);
    expect(s.flags['proc-over']).toBeGreaterThanOrEqual(s.flags.ballooning);
    expect(penalties(s)).toEqual(['rn-no-order-phenylephrine']);
  });

  it('the tech fires the LV gram only when called for, and repeats nothing the operator already recorded', () => {
    // the operator records the pullback and shoots the LV gram when the tech never does
    let s = run(sc, 3, [...TECH_TO_DROP, 'callout', 'cath-pigtail', ...R(2)]);
    expect(s.fired).toContain('pullback-fallback');
    s = perform(sc, s, 'lvedp');
    expect(s.counts.lvedp).toBeUndefined();
    expect(s.log.at(-1)?.text).toMatch(/already recorded/);
    for (let i = 0; i < 3 && !s.flags.ballooning; i++) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('lvgram-fallback');
    s = perform(sc, s, 'lv-gram');
    expect(s.counts['lv-gram']).toBeUndefined();
    expect(s.log.at(-1)?.text).toMatch(/The LV gram is done: no more contrast/);
  });
});
