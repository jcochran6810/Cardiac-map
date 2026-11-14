import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { ECG_PROFILES, resolveProfile, stLevel } from '@/lib/ecg/profiles';
import { LEAD_VECTORS } from '@/lib/ecg/vector';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { dissectionField as sc } from '@/lib/sim/scenario/scenarios/dissectionField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const last = (s: SimState) => s.log.at(-1)!.text;
const R = (n: number) => Array<string>(n).fill('reassess');
const toFix = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label));

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'opqrst', 'vitals', 'als', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'opqrst', 'vitals', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'iv', 'fentanyl', 'med-control', 'metoprolol', 'transport-pci', 'notify',
    UNTIL_ARRIVED, 'handoff'],
};

/** The assessment both crews do first: by now they know the pain tears through to the back and the arms differ */
const ASSESSED = ['primary', 'opqrst', 'vitals', 'bp-both-arms'];
/** The same with the monitor on, as it is before any IV rate drug */
const MONITORED = [...ASSESSED, 'monitor'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|hypertroph|LVH|dissect|aort|tamponade/i;
const DIAGNOSIS = /dissect|aort|tamponade/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;

describe('aortic dissection in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and conditions that exist', () => {
    expect(sc).toMatchObject({ id: 'aortic-dissection-field', setting: 'field', roles: [1, 2], conditionId: 'aortic-dissection' });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('aortic-dissection');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      // every rule can be broken by someone the case is written for
      expect(h.actions.some((id) => sc.roles.some((r) => interventionsFor(r, 'field').some((i) => i.id === id))), h.id).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // the built-in antithrombotic and fibrinolytic rules read it
    expect(sc.problems).toEqual(['aortic-dissection']);
  });

  it('each role has its own briefing and its own part', () => {
    expect(start(sc, 1).log.some((l) => /You are the BLS crew; a paramedic unit can meet you as an intercept/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
    expect(criticalsFor(sc, 1).map((c) => c.id)).toEqual(['vitals', 'history', 'both-arms', 'pulses', 'als', 'ecg', 'transmit', 'destination', 'notify', 'handoff']);
    expect(criticalsFor(sc, 2).map((c) => c.id)).toEqual(['vitals', 'history', 'both-arms', 'pulses', 'ecg', 'iv', 'analgesia', 'consult', 'destination', 'notify', 'handoff']);
  });

  it('nothing the learner sees before the assessment names the diagnosis', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/dissect|aort|tear|rip|arm/i);
    // the story is there for whoever looks: the sudden onset, and a hand reaching round to his back
    expect(opening).toMatch(/all at once/);
    expect(opening).toMatch(/reaching around to his back/);
  });

  it('no event line names the diagnosis, whatever state it fires in', () => {
    const states = [start(sc, 1), medic([...ASSESSED, 'aspirin', 'ecg12', 'nitro-high']), emt(['als', 'aspirin', 'nitro-assist', ...R(3)])];
    for (const s of states) {
      for (const ev of sc.events) {
        const probe: SimState = { ...structuredClone(s), flags: { ...s.flags, als: 0, arrived: 30, 'dest-pci': 20, 'dest-near': 20, tamponade: 22 } };
        for (const l of ev.effect(probe).say ?? []) expect(l[1], ev.id).not.toMatch(DIAGNOSIS);
      }
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('aortic dissection in the field — the ideal runs', () => {
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
      // off the scene in time: the tear never spread, and the call ahead had the scanner and the surgeon waiting
      expect(s.fired).not.toContain('extension');
      expect(s.fired).not.toContain('tamponade');
      expect(s.fired).toContain('arrive-center');
      expect(said(s)).toMatch(/Your call ahead set it up/);
      expect(said(s)).toMatch(/He goes straight to the operating room\.$/m);
    });
  }

  it('the paramedic reads the 12-lead as LVH, at no cost; a STEMI read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'lvh'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'lvh', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus rhythm 96 with left ventricular hypertrophy: .*No ST elevation anywhere, so it does not meet STEMI criteria/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const wrong = medic(readAfter(IDEAL[2], 'ecg12', 'stemi-anterior'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('the 12-lead explanation describes what the profile draws: no ST shift, and the T waves where it puts them', () => {
    const p = ECG_PROFILES['aortic-dissection'];
    const t = p.t!;
    const unit = Math.hypot(...t.dir);
    const tWave = (lead: keyof typeof LEAD_VECTORS) => (t.dir[0] * LEAD_VECTORS[lead][0] + t.dir[1] * LEAD_VECTORS[lead][1] + t.dir[2] * LEAD_VECTORS[lead][2]) / unit * t.mag;
    for (const lead of ['I', 'II', 'aVF', 'V5', 'V6'] as const) expect(tWave(lead), lead).toBeLessThan(-0.08);
    for (const lead of ['III', 'aVL'] as const) expect(tWave(lead), lead).toBeLessThan(0);
    expect(Math.abs(tWave('V4'))).toBeLessThan(0.03);
    for (const lead of ['V1', 'V2', 'V3'] as const) expect(tWave(lead), lead).toBeGreaterThan(0);
    for (const lead of Object.keys(LEAD_VECTORS) as (keyof typeof LEAD_VECTORS)[]) expect(Math.abs(stLevel(p, lead)), lead).toBeLessThan(0.1);
    expect(String((sc.facts.ecg12 as (s: SimState) => string)(start(sc, 2)))).toMatch(/T waves inverted in I, II, aVF, V5 and V6 \(shallow in III and aVL, flat in V4\)/);
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it; the physician keeps the cath lab down', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/12-lead acquired\. You can't interpret it/);
    expect(said(s)).toMatch(/ECG received\. The physician: "No ST elevation that meets STEMI criteria/);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic(['monitor', 'nibp', 'iv', 'nitro', 'nitro-high', 'fluid', 'push-epi', 'pressor', 'legs-up', 'ecg12', 'stemi-alert', 'metoprolol', 'diltiazem']),
      medic(['monitor', ...R(11), 'nibp', 'fluid', 'pressor', 'metoprolol', ...R(6)]),
      emt(['monitor', 'aspirin', 'nitro-assist', 'als', ...R(4), 'cpap', 'nibp']),
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

describe('aortic dissection in the field — finding it', () => {
  it('opens hypertensive and in severe pain, with the tracing of years of high blood pressure', () => {
    const s = start(sc, 2);
    expect(s.rhythm).toEqual({ profile: 'aortic-dissection', hr: 96 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([190, 100, 10]);
  });

  it('the history tells of a sudden ripping pain through to the back, and untreated blood pressure', () => {
    const s = emt(['opqrst', 'sample']);
    expect(said(s)).toMatch(/like something ripping inside my chest and going straight through to between my shoulder blades/);
    expect(said(s)).toMatch(/I ran out a couple of weeks ago/);
  });

  it('both arms: 190/100 on the right, 150/86 on the left, and a weaker left radial pulse', () => {
    const s = emt(['bp-both-arms']);
    expect(last(s)).toBe('Right arm 190/100 · left arm 150/86: 40 mmHg lower on the left. The left radial pulse is weaker than the right, and a beat behind it.');
    expect(s.flags['bp-arms']).toBeDefined();
    expect(s.flags.bp).toBeDefined();
  });

  it('the manual set is the right arm; the monitor cuff reads the falsely low left arm', () => {
    expect(last(emt(['vitals']))).toBe('BP 190/100 in the right arm · pulse 96 · RR 22 · SpO₂ 96%');
    expect(last(medic(['monitor', 'nibp']))).toBe('NIBP 150/86 mmHg — the monitor\'s cuff is on his left arm.');
    // no monitor, no NIBP: refused, no time passes
    const none = medic(['nibp']);
    expect(none.minute).toBe(0);
    expect(none.counts.nibp).toBeUndefined();
  });

  it('the pulses show the deficit; the legs and the neuro check are normal until the tear spreads', () => {
    expect(last(emt(['perfusion']))).toMatch(/left radial pulse weak and a beat behind it; femoral and foot pulses present and equal/);
    expect(last(emt(['neuro']))).toMatch(/strength and sensation normal in all four limbs/);
  });

  it('the arm pressures count as the first vital signs', () => {
    const s = medic(['primary', 'bp-both-arms', 'opqrst', 'sample', 'perfusion', 'ecg12', 'iv', 'fentanyl', 'med-control', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).percent).toBe(100);
  });

  it('a hint before the arm pressures names them, at a cost', async () => {
    const { takeHint } = await import('@/lib/sim/scenario/engine');
    const s = takeHint(sc, emt(['primary', 'vitals', 'opqrst', 'sample']));
    expect(last(s)).toMatch(/^Hint: Blood pressure in both arms\./);
    expect(s.penalties).toEqual([expect.objectContaining({ points: 2 })]);
  });
});

describe('aortic dissection in the field — other good orders score full marks', () => {
  it('the EMT who finishes the assessment before calling for the intercept is on time', () => {
    const s = emt(['primary', 'opqrst', 'vitals', 'bp-both-arms', 'perfusion', 'lungs', 'sample', 'als', 'ecg12', 'ecg-transmit', 'med-control', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(s.performed.find((p) => p.id === 'als')?.minute).toBe(6);
    expect(review(sc, s).percent).toBe(100);
  });

  for (const role of [1, 2] as const) {
    it(`role ${role}: loading early and finding the arm pressures on the way still makes the call ahead in time`, () => {
      const steps = role === 1
        ? ['primary', 'als', 'opqrst', 'transport-pci', 'vitals', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'ecg-transmit', 'notify', UNTIL_ARRIVED, 'handoff']
        : ['primary', 'opqrst', 'vitals', 'transport-pci', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'iv', 'fentanyl', 'med-control', 'notify', UNTIL_ARRIVED, 'handoff'];
      const s = runScenario(sc, role, steps);
      expect(s.ended?.reason).toBe('complete');
      expect(said(s)).toMatch(/Your call ahead set it up/);
      expect(review(sc, s).toFix).toEqual([]);
      expect(review(sc, s).percent).toBe(100);
    });
  }

  it('the paramedic who never gives the beta-blocker loses nothing: it is optional in the field', () => {
    const s = medic(IDEAL[2].filter((id) => id !== 'metoprolol'));
    expect(review(sc, s).percent).toBe(100);
  });

  it('the hand-off reports only what the crew found', () => {
    const s = emt(['primary', 'vitals', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(said(s)).toMatch(/SBAR hand-off: the sudden tearing pain and when it began, what was given and what was held, and how he changed\./);
    expect(said(emt(IDEAL[1]))).toMatch(/SBAR hand-off: the sudden tearing pain and when it began, the pressure in each arm and the pulses, the 12-lead, what was given/);
  });

  it('a call ahead with the arms but no 12-lead does not invent one', () => {
    const s = emt([...ASSESSED, 'transport-pci', 'notify']);
    expect(last(s)).toMatch(/a weak left radial pulse\. We are clearing the CT scanner/);
    expect(last(s)).not.toMatch(/12-lead/);
  });
});

describe('aortic dissection in the field — the traps', () => {
  it('aspirin costs 10 points once, for the EMT and the paramedic — the built-in rule does not add to it', () => {
    for (const s of [emt([...ASSESSED, 'aspirin']), medic(['aspirin'])]) {
      expect(s.penalties).toEqual([expect.objectContaining({ id: 'antithrombotic-dissection', points: 10, severity: 'major' })]);
    }
    // given early, it costs the same: the tearing pain is the reason to hold it, before anything else is found
    expect(penalties(emt(['aspirin']))).toEqual(['antithrombotic-dissection']);
  });

  it('the EMT helping with his own nitroglycerin: no relief, a racing heart, 5 points', () => {
    const s = emt([...ASSESSED, 'monitor', 'nitro-assist']);
    expect(said(s)).toMatch(/He puts one of his own nitroglycerin tablets under his tongue/);
    expect(said(s)).toMatch(/It's not touching the pain — and now my heart is pounding/);
    expect(s.rhythm).toEqual({ profile: 'aortic-dissection', hr: 108 });
    expect(s.vitals.pain).toBe(10);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'nitro-dissection', points: 5, severity: 'major' })]);
  });

  it('the paramedic\'s nitroglycerin on its own does the same; after the beta-blocker it races nothing, but medical control said no', () => {
    const alone = medic([...ASSESSED, 'iv', 'nitro']);
    expect(alone.rhythm.hr).toBe(108);
    expect(penalties(alone)).toEqual(['nitro-dissection']);
    // after the ordered beta-blocker it no longer races the heart: the only mistake left is going against the order
    const blocked = medic([...MONITORED, 'iv', 'med-control', 'metoprolol', 'nitro']);
    expect(blocked.rhythm.hr).toBe(82);
    expect(blocked.penalties).toEqual([expect.objectContaining({ id: 'nitro-against-order', points: 2, severity: 'minor' })]);
    // diltiazem slows the heart too: the guideline's vasodilator comes after a beta-blocker or a calcium-channel blocker
    const dilt = medic([...MONITORED, 'iv', 'diltiazem', 'ask-pde5', 'nitro']);
    expect(penalties(dilt)).toEqual(['diltiazem-not-ordered']);
    expect(dilt.rhythm.hr).toBe(86);
  });

  it('repeated nitroglycerin does not race the heart past 120', () => {
    const s = medic([...ASSESSED, 'iv', 'nitro', 'nitro', 'nitro']);
    expect(s.rhythm.hr).toBe(120);
    expect(penalties(s)).toEqual(['nitro-dissection']);
  });

  it('high-dose nitroglycerin on its own is one penalty, not two', () => {
    const s = medic([...ASSESSED, 'nitro-high', 'nitro-high', 'nitro-high']);
    expect(penalties(s)).toEqual(['nitro-high-dissection']);
  });

  it('a STEMI alert for his 12-lead is declined and costs 5 points (the built-in rule does not add to it)', () => {
    const s = medic([...ASSESSED, 'ecg12', 'stemi-alert']);
    expect(last(s)).toMatch(/the cath lab is not activated/);
    expect(s.flags.alert).toBeUndefined();
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'stemi-alert-dissection', points: 5, severity: 'major' })]);
  });

  it('a fluid bolus, a pressor and raised legs push a high pressure higher, and each costs', () => {
    let s = medic([...ASSESSED, 'iv', 'fluid']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([198, 104]);
    expect(last(s)).toBe('Right arm BP 198/104.');
    expect(said(s)).toMatch(/The ripping is worse again/);
    expect(penalties(s)).toEqual(['fluid-hypertensive']);
    s = perform(sc, s, 'pressor');
    expect(s.vitals.sbp).toBe(218);
    expect(penalties(s)).toEqual(['fluid-hypertensive', 'pressor-hypertensive']);
    s = perform(sc, s, 'legs-up');
    expect(penalties(s)).toEqual(['fluid-hypertensive', 'pressor-hypertensive', 'legs-up-hypertensive']);
  });

  it('the nearest emergency department: no surgeon there, a transfer, 8 points and the destination item missed', () => {
    const s = medic([...ASSESSED, 'perfusion', 'sample', 'ecg12', 'iv', 'fentanyl', 'med-control', 'transport-near', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(penalties(s)).toEqual(['nearest-ed']);
    expect(said(s)).toMatch(/We have no cardiac surgeon here — we will start a transfer/);
    expect(said(s)).toMatch(/He needs a cardiac surgeon, and there is none here/);
    expect(s.ended?.reason).toBe('complete');
    expect(toFix(s, /^Leave the scene for the heart center/)?.kind).toBe('missed');
    expect(review(sc, s).percent).toBeLessThan(80);
  });

  it('a rate drug without an order costs 2 points; on the order, nothing', () => {
    expect(penalties(medic([...MONITORED, 'iv', 'metoprolol']))).toEqual(['rate-drug-no-order']);
    expect(penalties(medic([...MONITORED, 'iv', 'med-control', 'metoprolol']))).toEqual([]);
    // asked before the arms were measured, medical control asks for them first and gives no order
    const early = medic(['primary', 'monitor', 'iv', 'med-control', 'metoprolol']);
    expect(said(early)).toMatch(/what is his pressure in each arm\? Call me back with both/);
    expect(penalties(early)).toEqual(['rate-drug-no-order']);
  });

  it('diltiazem is never the order here: it costs 2 points with or without the call', () => {
    expect(penalties(medic([...MONITORED, 'iv', 'diltiazem']))).toEqual(['diltiazem-not-ordered']);
    expect(penalties(medic([...MONITORED, 'iv', 'med-control', 'diltiazem']))).toEqual(['diltiazem-not-ordered']);
  });

  it('a second AV-nodal blocker on top of the first is a major error, either way round', () => {
    const s = medic([...MONITORED, 'iv', 'med-control', 'diltiazem', 'metoprolol']);
    expect(penalties(s)).toEqual(['diltiazem-not-ordered', 'rate-drug-double']);
    expect(s.penalties[1]).toMatchObject({ points: 5, severity: 'major' });
    expect(penalties(medic([...MONITORED, 'iv', 'med-control', 'metoprolol', 'diltiazem']))).toEqual(['rate-drug-double']);
  });

  it('an IV rate drug without the monitor costs 3 points, order or not', () => {
    const s = medic([...ASSESSED, 'iv', 'med-control', 'metoprolol']);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'rate-drug-unmonitored', points: 3, severity: 'minor' })]);
    // the 12-lead puts the monitor on: the ideal run gives metoprolol on it
    expect(penalties(medic([...ASSESSED, 'ecg12', 'iv', 'med-control', 'metoprolol']))).toEqual([]);
  });

  it('high-dose nitroglycerin after the beta-blocker is still a mistake: medical control did not order it', () => {
    const s = medic([...MONITORED, 'iv', 'med-control', 'metoprolol', 'nitro-high']);
    expect(penalties(s)).toEqual(['nitro-high-dissection']);
  });

  it('CPAP for his clear lungs is a minor error', () => {
    expect(emt(['lungs', 'cpap']).penalties).toEqual([expect.objectContaining({ id: 'cpap-no-distress', points: 3, severity: 'minor' })]);
  });

  it('a case with traps taken scores below Excellent', () => {
    const s = emt(IDEAL[1].flatMap((id) => (id === 'bp-both-arms' ? [id, 'aspirin'] : [id])));
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).percent).toBeLessThan(90);
  });
});

describe('aortic dissection in the field — right care works', () => {
  it('fentanyl eases the pain and brings the rate and the pressure down', () => {
    const s = medic([...ASSESSED, 'iv', 'fentanyl']);
    expect(s.vitals.pain).toBe(6);
    expect(s.rhythm.hr).toBe(90);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([178, 94]);
    expect(s.flags.analgesia).toBeDefined();
    expect(said(s)).toMatch(/That takes the edge off/);
  });

  it('medical control orders the beta-blocker; it brings the rate to 76 and the pressure down', () => {
    let s = medic([...MONITORED, 'iv', 'fentanyl', 'med-control']);
    expect(last(s)).toMatch(/^Medical control: "Hold the aspirin and the nitroglycerin\. Fentanyl for the pain first\./);
    expect(s.flags['rate-order']).toBeDefined();
    s = perform(sc, s, 'metoprolol');
    expect(s.rhythm).toEqual({ profile: 'aortic-dissection', hr: 76 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([162, 86]);
    expect(s.penalties).toEqual([]);
  });

  it('the EMT\'s intercept arrives 6 minutes after the call: an IV and fentanyl', () => {
    const s = emt(['als', ...R(3)]);
    expect(s.fired).toContain('als-arrives');
    expect(said(s)).toMatch(/The paramedic arrives: an IV, and fentanyl 50 mcg for his pain\./);
    expect(s.flags.analgesia).toBeDefined();
    expect(s.vitals.pain).toBe(6);
  });

  it('the intercept meets an EMT already on the way, and flags the aspirin and the nitroglycerin given', () => {
    const s = emt(['als', 'aspirin', 'nitro-assist', 'transport-pci', ...R(2)]);
    expect(said(s)).toMatch(/The medic unit meets you on the way; the paramedic climbs in/);
    expect(said(s)).toMatch(/He had aspirin\? For pain that tears through to the back I hold it/);
    expect(said(s)).toMatch(/no more nitro for him/);
  });

  it('the EMT\'s medical control call, once the arms are known, says hold the aspirin and go to the surgeon', () => {
    expect(last(emt([...ASSESSED, 'med-control']))).toMatch(/Hold the aspirin and the nitroglycerin\. Go straight to the heart center — they have the cardiac surgeon/);
  });

  it('a call ahead without the arm pressures gets an ordinary bed; with them, the scanner and the surgeon', () => {
    const plain = emt(['primary', 'vitals', 'transport-pci', 'notify', UNTIL_ARRIVED]);
    expect(said(plain)).toMatch(/Copy: chest pain, blood pressure 190\/100\. We'll see him in the emergency department\./);
    expect(said(plain)).toMatch(/the physician takes the pressure in both arms before calling for the scanner and the surgeon/);
    const full = emt([...ASSESSED, 'transport-pci', 'notify']);
    expect(last(full)).toMatch(/We are clearing the CT scanner and calling the cardiac surgeon in\.$/);
  });

  it('the hand-off waits for arrival; at the heart center the scan confirms it and he goes to surgery', () => {
    const early = emt(['primary', 'handoff']);
    expect(early.counts.handoff).toBeUndefined();
    expect(last(early)).toMatch(/^Hand off on arrival/);
    const s = medic(IDEAL[2]);
    expect(said(s)).toMatch(/CT angiography 12 minutes later: a tear in the ascending aorta/);
  });
});

describe('aortic dissection in the field — delay matters', () => {
  it('on scene at 16 minutes the tear spreads: belly pain, a numb, pulseless left leg', () => {
    const s = medic(['primary', ...R(8)]);
    expect(s.minute).toBe(17);
    expect(s.fired).toContain('extension');
    expect(said(s)).toMatch(/my left leg has gone numb/);
    expect(last(medic(['primary', ...R(8), 'perfusion']))).toMatch(/the left femoral and foot pulses are gone/);
    expect(last(medic(['primary', ...R(8), 'neuro']))).toMatch(/his left leg is numb and weak/);
  });

  it('at 22 minutes it bleeds around the heart: shock, full neck veins — and then the rate drugs, opioids and nitroglycerin are wrong', () => {
    let s = medic(['primary', 'monitor', 'iv', ...R(10)]);
    expect(s.fired).toContain('tamponade');
    expect(s.vitals.sbp).toBe(84);
    expect(s.rhythm.hr).toBe(120);
    expect(said(s)).toMatch(/his neck veins are standing out/);
    expect(last(perform(sc, s, 'perfusion'))).toMatch(/neck veins distended/);
    expect(last(perform(sc, s, 'bp-both-arms'))).toBe('Right arm 84/62 · left arm too faint to hear. The left radial pulse is barely there.');
    expect(last(perform(sc, s, 'nibp'))).toBe('NIBP: unable to measure — the monitor\'s cuff is on his left arm.');
    expect(last(perform(sc, s, 'med-control'))).toMatch(/He is in shock — no beta-blocker, no nitroglycerin, no more opioid\. Small fluid boluses/);
    expect(penalties(perform(sc, s, 'metoprolol'))).toEqual(['rate-drug-low']);
    expect(penalties(perform(sc, s, 'fentanyl'))).toEqual(['opioid-hypotension']);
    expect(penalties(perform(sc, s, 'nitro'))).toEqual(['nitro-dissection']);
    // a small bolus is the bridge to the surgeon: no penalty, and the pressure comes up a little
    s = perform(sc, s, 'fluid');
    expect(s.penalties).toEqual([]);
    expect(s.vitals.sbp).toBe(94);
    // the EMT hears the same: shock first, whatever has been measured
    expect(last(emt(['primary', ...R(11), 'med-control']))).toMatch(/^Medical control: "He is in shock — no aspirin, no nitroglycerin\./);
  });

  it('left on scene 10 minutes after that, his heart stops, and nothing in the field brings him back', () => {
    let s = medic(['primary', 'monitor', ...R(16)]);
    expect(s.fired).toContain('arrest');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    for (let i = 0; i < 10 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('a late departure counts half; transport stops the clock on the tear', () => {
    // the ideal run is ready to leave at 11:30; three reassessments keep it on scene past 16:00
    const late = medic([...IDEAL[2].slice(0, IDEAL[2].indexOf('transport-pci')), ...R(3), 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(late.fired).toContain('extension');
    expect(late.fired).not.toContain('tamponade');
    expect(toFix(late, /^Leave the scene for the heart center/)?.kind).toBe('late');
    expect(late.ended?.reason).toBe('complete');
    // and the delay itself costs: the tear spread while he waited
    expect(late.penalties).toEqual([expect.objectContaining({ id: 'scene-delay', points: 8, severity: 'major' })]);
  });

  it('leaving only after the shock began is a critical error, and one penalty, not two', () => {
    const s = emt(['primary', 'opqrst', 'vitals', 'als', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'ecg-transmit', ...R(7), 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(s.fired).toContain('tamponade');
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'scene-delay-shock', points: 15, severity: 'critical' })]);
    expect(review(sc, s).grade).not.toBe('Excellent');
    // in time, nothing: the ideal runs leave long before the tear spreads
    for (const role of [1, 2] as const) expect(runScenario(sc, role, IDEAL[role]).penalties).toEqual([]);
  });

  it('in the tamponade, small boluses are the bridge — even once the first has the systolic back over 90', () => {
    let s = medic(['primary', 'monitor', 'iv', ...R(10)]);
    s = perform(sc, s, 'fluid');
    expect(s.vitals.sbp).toBe(94);
    s = perform(sc, s, 'fluid');
    expect(s.vitals.sbp).toBe(104);
    // and no higher: a systolic near 90 to 100 keeps him talking without pushing the tear on
    s = perform(sc, s, 'fluid');
    expect(s.vitals.sbp).toBe(104);
    expect(s.penalties).toEqual([]);
    expect(said(s)).not.toMatch(/The ripping is worse again/);
    // the fluid has not ended the shock: medical control still says so, and the opioid and the rate drug are still wrong
    expect(last(perform(sc, s, 'med-control'))).toMatch(/He is in shock/);
    expect(penalties(perform(sc, s, 'fentanyl'))).toEqual(['opioid-hypotension']);
    expect(penalties(perform(sc, s, 'metoprolol'))).toEqual(['rate-drug-low']);
    // raising his legs in the shock is no mistake either
    expect(penalties(perform(sc, s, 'legs-up'))).toEqual([]);
  });

  it('in the tamponade the call ahead readies the operating room, and the door ultrasound finds it', () => {
    const s = medic(['primary', 'opqrst', 'vitals', 'bp-both-arms', 'monitor', 'iv', ...R(8), 'fluid', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(s.fired).toContain('tamponade');
    expect(said(s)).toMatch(/He is in shock, with full neck veins: the cardiac surgeon and the operating room are being readied/);
    expect(said(s)).toMatch(/Your call ahead set it up: the cardiac surgeon and the operating room are ready for him\./);
    expect(said(s)).toMatch(/Bedside ultrasound at the door: blood around the heart and a flap in the ascending aorta\. He goes straight to the operating room\./);
    expect(said(s)).not.toMatch(/CT angiography/);
  });

  it('an intercept called late finds him in arrest and joins the CPR', () => {
    let s = emt(['primary', ...R(17)]);
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'als');
    for (let i = 0; i < 4 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.fired).toContain('als-arrives');
    expect(said(s)).toMatch(/The paramedic arrives: an IO, epinephrine and an airway, while your compressions go on\./);
  });

  it('a stopped case reports the arm pressures as missed', () => {
    expect(toFix(stop(emt(['primary', 'vitals'])), /^Blood pressure in both arms/)?.kind).toBe('missed');
  });
});
