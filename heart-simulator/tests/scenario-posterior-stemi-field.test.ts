import { describe, expect, it } from 'vitest';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { posteriorStemiField as sc } from '@/lib/sim/scenario/scenarios/posteriorStemiField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const lastText = (s: SimState) => s.log.at(-1)!.text;
const missed = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && label.test(t.label));
const reassessUntil = (s: SimState, done: (x: SimState) => boolean) => {
  for (let i = 0; i < 20 && !done(s) && !s.ended; i++) s = perform(sc, s, 'reassess');
  return s;
};

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'pads', 'aspirin', 'ecg-posterior', 'stemi-alert', 'iv', 'ask-pde5', 'nitro', 'transport-pci',
    'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
};

/** The paramedic with the 12-lead read and the pads on, still on scene */
const MEDIC_START = ['primary', 'vitals', 'ecg12', 'pads'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|posterior|isch/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis/i;

describe('posterior STEMI in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions and rhythms that exist', () => {
    expect(sc).toMatchObject({ id: 'posterior-stemi-field', setting: 'field', roles: [1, 2] });
    expect(sc.initial.rhythm).toEqual({ profile: 'posterior-stemi', hr: 84 });
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('posterior-stemi');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      // a harm limited to roles only names actions those roles have
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
    // nothing she has makes a problem-specific drug right: she has an acute coronary syndrome, nothing more
    expect(sc.problems ?? []).toEqual(['acs']);
    // every role has its own briefing for its own crew
    expect(start(sc, 1).log.some((l) => /You are the BLS crew/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /You are the ALS crew/.test(l.text))).toBe(true);
  });

  it('the paramedic carries 100 points and the EMT 75: each role is scored on its own part', () => {
    const pts = (role: 1 | 2) => criticalsFor(sc, role).filter((c) => !c.applies).reduce((a, c) => a + (c.points ?? 10), 0);
    expect(pts(2)).toBe(100);
    expect(pts(1)).toBe(75);
    const emtItems = criticalsFor(sc, 1).map((c) => c.id);
    expect(emtItems).toEqual(expect.arrayContaining(['als', 'transmit', 'aspirin', 'ecg', 'pci']));
    expect(emtItems).not.toContain('posterior');
    expect(emtItems).not.toContain('alert');
    expect(criticalsFor(sc, 2).map((c) => c.id)).toEqual(expect.arrayContaining(['posterior', 'alert', 'pads', 'iv', 'nitro']));
  });

  it('nothing the learner sees before the 12-lead names the diagnosis', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/STEMI|posterior|circumflex|V7|isch/i);
    // the destinations are named the way every field case names them
    expect(opening).toMatch(/heart center/);
    expect(opening).toMatch(/no cath lab/);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    expect(sc.teaching.join(' ')).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('posterior STEMI in the field — the ideal runs', () => {
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
      // the crew left in time: she never got worse, and her heart never fibrillated
      expect(s.fired).not.toContain('worse');
      expect(s.fired).not.toContain('vf');
      expect(s.flags.alert).toBeDefined();
      expect(s.flags['dest-pci']).toBeDefined();
      expect(s.log.some((l) => /Straight to the lab/.test(l.text))).toBe(true);
    });
  }

  it('the paramedic reads the 12-lead as a posterior STEMI, at no cost; the feedback explains the mirror image and V7–V9', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'stemi-posterior'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'stemi-posterior', verdict: 'correct' })]);
    const fb = s.log.find((l) => l.who === 'feedback')!.text;
    expect(fb).toMatch(/^Correct\. Sinus rhythm 84 with horizontal ST depression of about 2 mm in V1–V3/);
    expect(fb).toMatch(/tall R waves in V1–V2/);
    expect(fb).toMatch(/record V7–V9/);
    expect(review(sc, s).percent).toBe(100);
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/12-lead acquired\. You can't interpret it/);
    expect(said(s)).toMatch(/Take her straight to the heart center, not the community hospital/);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) runScenario(sc, role, IDEAL[role], (s) => runs.push(s));
    runs.push(
      medic([...MEDIC_START, 'ecg-posterior', 'iv', 'nitro', 'metoprolol', 'atropine', 'pressor', 'cardiovert', 'pace']),
      medic([...MEDIC_START, 'defib', 'defib', 'ecg12-repeat', 'ecg-posterior']),
      medic([...MEDIC_START, 'opqrst', 'sample', 'iv', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'defib']),
      emt(['primary', 'vitals', 'ecg12', ...Array<string>(10).fill('reassess'), 'aed', 'cpr', 'aed']),
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

describe('posterior STEMI in the field — the posterior leads and the alert', () => {
  it('V7–V9 report the ST elevation as a measurement', () => {
    const s = medic(['ecg12', 'ecg-posterior']);
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'V7–V9: ST elevation 1 mm in V7, 1.5 mm in V8, 1.5 mm in V9.' });
    expect(s.flags['ecg-posterior']).toBeDefined();
  });

  it('with the posterior leads in hand, the STEMI alert activates the cath lab at once', () => {
    const s = medic([...MEDIC_START, 'ecg-posterior', 'stemi-alert']);
    expect(s.flags.alert).toBe(s.minute);
    expect(lastText(s)).toMatch(/ST elevation in V7–V9 — a posterior STEMI\. Cath lab activated/);
    expect(s.penalties).toEqual([]);
  });

  it('without them the interventional cardiologist asks for V7–V9 first — no penalty — and activates once they come', () => {
    let s = medic([...MEDIC_START, 'stemi-alert']);
    expect(s.flags.alert).toBeUndefined();
    expect(s.flags['alert-asked']).toBeDefined();
    expect(lastText(s)).toMatch(/send me V7–V9/);
    expect(s.penalties).toEqual([]);
    // the call was made: it is not offered again, and the posterior leads complete it
    expect(unavailableReason(sc, s, 'stemi-alert')).toBe('Already done');
    s = perform(sc, s, 'ecg-posterior');
    expect(s.fired).toContain('posterior-confirms');
    expect(s.flags.alert).toBe(s.minute);
    expect(s.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/ST elevation in V7–V9 — that confirms it\. Cath lab activated/) });
  });

  it('the paramedic\'s transmission does the same: without V7–V9 the physician asks for them; with them the lab is activated', () => {
    let s = medic([...MEDIC_START, 'ecg-transmit']);
    expect(lastText(s)).toMatch(/record V7 to V9 and send them/);
    expect(s.flags.alert).toBeUndefined();
    s = perform(sc, s, 'ecg-posterior');
    expect(s.flags.alert).toBeDefined();
    const withLeads = medic([...MEDIC_START, 'ecg-posterior', 'ecg-transmit']);
    expect(lastText(withLeads)).toMatch(/Cath lab activated: bring her straight to the heart center/);
    expect(withLeads.flags.alert).toBeDefined();
  });

  it('no 12-lead yet: the alert waits for one (no time passes)', () => {
    const s = medic(['primary', 'stemi-alert']);
    expect(s.counts['stemi-alert']).toBeUndefined();
    expect(s.minute).toBe(1);
  });

  it('the trap: no posterior leads means no activation — both items are missed and the ED calls the lab only on arrival', () => {
    const s = medic(['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'pads', 'aspirin', 'stemi-alert', 'iv', 'ask-pde5', 'nitro', 'transport-pci', 'ecg12-repeat',
      UNTIL_ARRIVED, 'handoff']);
    expect(s.flags.alert).toBeUndefined();
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label).sort())
      .toEqual(['Posterior leads V7–V9 for ST depression in V1–V3', 'STEMI alert from the field'].sort());
    expect(r.percent).toBe(70);
    expect(said(s)).toMatch(/records V7–V9 at once: ST elevation\. "Posterior STEMI — call the cath lab\."/);
  });
});

describe('posterior STEMI in the field — the EMT and the paramedic intercept', () => {
  it('the intercept arrives 6 minutes after the call: pads, an IV and nitroglycerin, then the posterior leads and the alert', () => {
    const s = emt(['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci']);
    expect(s.fired).toEqual(expect.arrayContaining(['als-arrives', 'als-posterior']));
    expect(s.flags['als-here']).toBeGreaterThanOrEqual(s.flags.als + 6);
    expect(s.flags.nitro).toBeDefined();
    expect(s.flags.alert).toBeDefined();
    expect(said(s)).toMatch(/The medic unit meets you on the way/);
    expect(said(s)).toMatch(/records V7–V9: "ST elevation in all three/);
    // the paramedic's nitroglycerin moved the pressure and the pain
    expect(s.vitals.sbp).toBe(132);
    expect(s.vitals.pain).toBe(5);
    // no penalty is the EMT's for the paramedic's drugs
    expect(s.penalties).toEqual([]);
  });

  it('the intercept asks the EMT for what is still missing: the aspirin and the 12-lead', () => {
    let s = emt(['als', 'primary', 'vitals', 'opqrst', 'sample', 'reassess']);
    expect(s.fired).toContain('als-arrives');
    expect(said(s)).toMatch(/Has she had aspirin\? That one is yours/);
    expect(said(s)).toMatch(/Get the 12-lead on her and send it/);
    expect(s.fired).not.toContain('als-posterior');
    s = perform(sc, s, 'ecg12');
    expect(s.fired).toContain('als-posterior');
    expect(s.flags['ecg-posterior']).toBeDefined();
  });

  it('the EMT cannot record posterior leads or call the alert, and has no nitroglycerin of hers to help with', () => {
    const s = emt(['primary', 'vitals']);
    expect(unavailableReason(sc, s, 'ecg-posterior')).toBe('Outside your scope');
    expect(unavailableReason(sc, s, 'stemi-alert')).toBe('Outside your scope');
    const nitro = perform(sc, s, 'nitro-assist');
    expect(nitro.counts['nitro-assist']).toBeUndefined();
    expect(nitro.minute).toBe(s.minute);
    expect(lastText(nitro)).toMatch(/I don't have any nitroglycerin of my own/);
  });

  it('medical control tells the EMT to transmit first, and once it has the 12-lead names the heart center', () => {
    const before = emt(['primary', 'med-control']);
    expect(lastText(before)).toMatch(/Transmit the 12-lead so I can read it/);
    const after = emt(['primary', 'ecg12', 'ecg-transmit', 'med-control']);
    expect(lastText(after)).toMatch(/Take her straight to the heart center/);
  });

  it('without the intercept the EMT still completes the EMT part, but the lab is activated only at the door', () => {
    const s = emt(['primary', 'vitals', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff']);
    expect(s.flags.alert).toBeUndefined();
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(['Request a paramedic intercept']);
    expect(said(s)).toMatch(/minutes a field activation would have saved/);
  });

  it('the EMT who takes her to the nearest emergency department is penalized, and the hand-off says she needs a transfer', () => {
    const s = emt(['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(penalties(s)).toEqual(['nearest-ed-emt']);
    expect(said(s)).toMatch(/It has no cath lab — she will need a transfer/);
    expect(said(s)).toMatch(/we have no cath lab here: she needs a transfer/);
    expect(missed(s, /^Straight to the PCI-capable heart center/)).toBe(true);
  });
});

describe('posterior STEMI in the field — the traps', () => {
  it('reading it as ischemia only costs 5 points; the feedback names the posterior STEMI', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'ischaemia'), 'manual');
    expect(s.reads[0]).toMatchObject({ answer: 'stemi-posterior', chosen: 'ischaemia', verdict: 'wrong' });
    expect(s.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
    expect(s.log.find((l) => l.who === 'feedback')!.text).toMatch(/^Not quite — this is Posterior STEMI\./);
    expect(review(sc, s).percent).toBe(95);
  });

  it('…and taking her to the nearest emergency department is a major error', () => {
    const steps = ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'read:ischaemia', 'pads', 'aspirin', 'iv', 'ask-pde5', 'nitro', 'transport-near', 'ecg12-repeat',
      UNTIL_ARRIVED, 'handoff'];
    const s = medic(steps, 'manual');
    expect(penalties(s)).toEqual(['misread-1', 'nearest-ed']);
    expect(s.penalties.find((p) => p.id === 'nearest-ed')).toMatchObject({ points: 10, severity: 'major' });
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label).sort())
      .toEqual(['Posterior leads V7–V9 for ST depression in V1–V3', 'STEMI alert from the field', 'Straight to the PCI-capable heart center'].sort());
    expect(r.grade).toBe('Unsafe');
  });

  it('nitroglycerin before the pressure and before the PDE-5 question costs points; asked and measured, it costs nothing', () => {
    expect(penalties(medic(['primary', 'iv', 'nitro']))).toEqual(['nitro-no-bp', 'nitro-no-pde5']);
    expect(penalties(medic(['primary', 'vitals', 'iv', 'nitro']))).toEqual(['nitro-no-pde5']);
    const ok = medic(['primary', 'vitals', 'ask-pde5', 'nitro']);
    expect(ok.penalties).toEqual([]);
    expect(said(ok)).toMatch(/I don't take any of those, for anything/);
    // a blood pressure in both arms counts as a pressure
    expect(medic(['primary', 'bp-both-arms', 'ask-pde5', 'nitro']).penalties).toEqual([]);
  });

  it('nitroglycerin eases the pain and lowers the pressure; three doses leave it above 90', () => {
    let s = medic(['primary', 'vitals', 'ask-pde5', 'nitro']);
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([132, 80, 5]);
    expect(s.log.some((l) => l.who === 'patient' && /a little better/.test(l.text))).toBe(true);
    // each repeat at least 3 minutes after the last (Nitrostat: every 5 minutes): two reassessments between doses
    for (const id of ['reassess', 'reassess', 'nitro', 'reassess', 'reassess', 'nitro']) s = perform(sc, s, id);
    expect(s.vitals.sbp).toBe(112);
    expect(s.penalties).toEqual([]);
    expect(unavailableReason(sc, s, 'nitro')).toBe('Maximum 3 doses');
  });

  it('regression: nitroglycerin cannot open the artery — three doses leave her pain at 4, and the third brings no more relief', () => {
    const s = medic(['primary', 'vitals', 'ask-pde5', 'nitro', 'reassess', 'reassess', 'nitro', 'reassess', 'reassess', 'nitro']);
    expect(s.vitals.pain).toBe(4);
    expect(lastText(s)).toBe('BP 112/68.');
    expect(s.log.at(-2)).toMatchObject({ who: 'patient', text: '"It\'s still there — about the same."' });
    // an opioid can take her lower (not a mistake: the case leaves comfort care unscored)
    const opioid = perform(sc, perform(sc, s, 'iv'), 'fentanyl');
    expect(opioid.vitals.pain).toBe(1);
    expect(opioid.penalties).toEqual([]);
    // the high dose eases the pain no further, drops the pressure twice as much, and is scored
    const high = medic(['primary', 'vitals', 'ask-pde5', 'nitro-high']);
    expect([high.vitals.sbp, high.vitals.pain]).toEqual([122, 5]);
    expect(penalties(high)).toEqual(['nitro-high-not-hypertensive']);
  });

  it('the high nitrate dose, oxygen with a normal saturation and CPAP with clear lungs cost points', () => {
    expect(penalties(medic(['primary', 'vitals', 'ask-pde5', 'nitro-high']))).toEqual(['nitro-high-not-hypertensive']);
    expect(penalties(medic(['o2-nrb']))).toEqual(['oxygen-normoxic']);
    expect(penalties(emt(['o2-nc']))).toEqual(['oxygen-normoxic']);
    expect(penalties(emt(['cpap']))).toEqual(['cpap-clear']);
  });

  it('IV metoprolol, a vasopressor and a rate drug for her regular rate cost points', () => {
    expect(penalties(medic(['iv', 'metoprolol']))).toEqual(['beta-blocker']);
    // regression: the 2025 guideline does not support routine IV beta-blockade before PCI, but allows it in a stable patient
    // with ongoing ischemia — off protocol in the field, a minor penalty, not a major one
    expect(medic(['iv', 'metoprolol']).penalties[0]).toMatchObject({ points: 3, severity: 'minor', text: expect.stringMatching(/not supported \(2025 ACC\/AHA ACS guideline\)/) });
    expect(penalties(medic(['iv', 'pressor']))).toEqual(['adrenergic-mi']);
    expect(penalties(medic(['iv', 'push-epi']))).toEqual(['adrenergic-mi']);
    expect(penalties(medic(['iv', 'diltiazem']))).toEqual(['rate-drug-sinus']);
    expect(penalties(medic(['iv', 'adenosine6']))).toEqual(['rate-drug-sinus']);
    expect(penalties(medic(['iv', 'atropine']))).toEqual(['atropine-fast']);
  });

  it('comfort care costs nothing: fentanyl and ondansetron, the glucose, both arms', () => {
    const s = medic(['primary', 'iv', 'fentanyl', 'ondansetron', 'glucose', 'bp-both-arms']);
    expect(s.penalties).toEqual([]);
    expect(said(s)).toMatch(/The sick feeling is going away/);
    expect(lastText(s)).toBe('Right arm 142/86 · left arm 138/84: the same within a few mmHg.');
    expect(said(s)).toMatch(/Blood glucose 188 mg\/dL/);
  });

  it('the history: pressure that built over minutes and goes through to her back, not a tearing pain; no PDE-5 inhibitor, no nitroglycerin of her own', () => {
    const s = medic(['opqrst', 'sample']);
    expect(said(s)).toMatch(/goes straight through to my back, between my shoulder blades/);
    expect(said(s)).toMatch(/nothing ripping or tearing/);
    expect(said(s)).toMatch(/I don't have any nitroglycerin/);
  });

  it('an AED is not applied to her while she has a pulse: refused, no time passes, nothing is scored', () => {
    const s0 = emt(['primary']);
    const s = perform(sc, s0, 'aed');
    expect(s.counts.aed).toBeUndefined();
    expect(s.minute).toBe(s0.minute);
    expect(s.penalties).toEqual([]);
  });

  it('an unsynchronized shock with a pulse throws her into VF and is a critical error; a second shock brings her back', () => {
    let s = medic([...MEDIC_START, 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(penalties(s)).toEqual(['shock-with-pulse']);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'posterior-stemi', hr: 104 });
  });
});

describe('posterior STEMI in the field — delay matters', () => {
  it('still on scene at minute 15 she gets worse; at minute 20 her heart fibrillates', () => {
    let s = reassessUntil(medic(MEDIC_START), (x) => x.fired.includes('worse'));
    expect(s.minute).toBeGreaterThanOrEqual(15);
    expect(s.rhythm.profile).toBe('posterior-stemi');
    expect(s.rhythm.hr).toBe(96);
    expect(s.vitals.pain).toBe(9);
    expect(said(s)).toMatch(/We have been here 15 minutes — we need to be moving/);
    s = reassessUntil(s, (x) => !x.pulse);
    expect(s.fired).toContain('vf');
    expect(s.flags.arrest).toBeGreaterThanOrEqual(20);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Monitor alarm!')).toBe(true);
  });

  it('a crew on the road by minute 15 never sees either', () => {
    let s = medic([...MEDIC_START, 'transport-pci']);
    s = reassessUntil(s, (x) => 'arrived' in x.flags);
    expect(s.fired).not.toContain('worse');
    expect(s.fired).not.toContain('vf');
  });

  it('with the pads on, a shock within 2 minutes brings her back; the arrest items apply, and the 12-lead after ROSC is read again', () => {
    let s = reassessUntil(medic(MEDIC_START), (x) => !x.pulse);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(s.rhythm).toEqual({ profile: 'posterior-stemi', hr: 104 });
    expect(sc.status!(s)).toMatch(/^Awake but drowsy/);
    const items = criticalsFor(sc, 2).filter((c) => !c.applies || c.applies(s)).map((c) => c.id);
    expect(items).toEqual(expect.arrayContaining(['vf-response', 'shock', 'post-ecg']));
    // the rate crossed 100: a new tracing, a new read — the same answer
    s = perform(sc, s, 'ecg12-repeat');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'stemi-posterior', verdict: 'correct' });
    const r = review(sc, stop(s));
    expect(r.toFix.some((t) => /No pulse: CPR or a shock|Defibrillate within 2 minutes/.test(t.label))).toBe(false);
  });

  it('a late shock with no CPR first does not convert; CPR then a shock does', () => {
    let s = reassessUntil(medic(MEDIC_START), (x) => !x.pulse);
    s = perform(sc, perform(sc, s, 'reassess'), 'reassess');
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(false);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'No change on the monitor.')).toBe(true);
    s = perform(sc, perform(sc, s, 'cpr'), 'defib');
    expect(s.pulse).toBe(true);
    const r = review(sc, stop(s));
    expect(r.toFix.find((t) => t.label === 'Defibrillate within 2 minutes')?.kind).toBe('late');
  });

  it('the EMT\'s AED shocks the VF and brings her back', () => {
    let s = reassessUntil(emt(['primary', 'vitals', 'ecg12']), (x) => !x.pulse);
    s = perform(sc, s, 'aed');
    expect(s.pulse).toBe(true);
    expect(said(s)).toMatch(/AED: "Shock advised\." Shock delivered\.\nShe coughs and moves; there is a carotid pulse — ROSC\./);
  });

  it('a late transport counts half', () => {
    const s = medic([...MEDIC_START, 'aspirin', 'ecg-posterior', 'stemi-alert', 'opqrst', 'sample', 'iv', 'ask-pde5', 'nitro', 'reassess', 'reassess', 'reassess', 'transport-pci']);
    expect(s.performed.at(-1)!.minute).toBeGreaterThan(15);
    // she got worse while they stayed, but the crew left before her heart fibrillated
    expect(s.fired).toContain('worse');
    expect(s.fired).not.toContain('vf');
    const r = review(sc, stop(s));
    expect(r.toFix.find((t) => t.label === 'Straight to the PCI-capable heart center')?.kind).toBe('late');
    expect(r.timings.find((t) => t.label === 'Left the scene')?.met).toBe(false);
  });
});

describe('posterior STEMI in the field — help and hand-off', () => {
  it('a hint names the next item, and none names the diagnosis before the 12-lead is read', () => {
    const s = takeHint(sc, start(sc, 2));
    expect(lastText(s)).toMatch(/^Hint: Vital signs\./);
    const ecg = takeHint(sc, medic(['primary', 'vitals']));
    expect(lastText(ecg)).toMatch(/^Hint: 12-lead ECG within 10 minutes/);
    expect(lastText(ecg)).not.toMatch(/posterior|back wall|V1–V3/i);
    const emtHint = takeHint(sc, emt(['primary', 'vitals']));
    expect(lastText(emtHint)).toMatch(/^Hint: 12-lead ECG within 10 minutes/);
  });

  it('the hand-off waits for arrival', () => {
    const s = medic([...MEDIC_START, 'transport-pci']);
    const h = perform(sc, s, 'handoff');
    expect(h.counts.handoff).toBeUndefined();
    expect(lastText(h)).toMatch(/^Hand off on arrival/);
  });
});

describe('posterior STEMI in the field — regressions from the independent check', () => {
  const TRACING = /V1|V7|V9|posterior|back wall|ST depression|STEMI/i;

  it('before the 12-lead, medical control and the radio report know nothing about the tracing (the read comes first)', () => {
    const mc = medic(['primary', 'med-control']);
    expect(lastText(mc)).toMatch(/^Medical control: "Get a 12-lead on her/);
    expect(lastText(mc)).not.toMatch(TRACING);
    const radio = medic(['primary', 'notify']);
    expect(lastText(radio)).toMatch(/Send us her 12-lead as soon as you have it/);
    expect(lastText(radio)).not.toMatch(TRACING);
    // once the paramedic has recorded (and read) it, the hospital asks about the posterior leads
    expect(lastText(medic([...MEDIC_START, 'notify']))).toMatch(/Do you have posterior leads on her\?/);
  });

  it('the EMT\'s radio report: the hospital knows the tracing only once it has been transmitted', () => {
    const before = emt(['primary', 'ecg12', 'notify']);
    expect(lastText(before)).not.toMatch(TRACING);
    expect(lastText(emt(['primary', 'ecg12', 'ecg-transmit', 'notify']))).toMatch(/ST depression in V1–V3/);
  });

  it('the hand-off item names no hospital: after the community hospital the review does not say "at the heart center"', () => {
    expect(sc.critical.find((c) => c.id === 'handoff')!.label).toBe('Hand-off on arrival (SBAR)');
    const s = emt(['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    const r = review(sc, s);
    for (const t of [...r.wentWell, ...r.toFix]) expect(t.label, t.label).not.toMatch(/Hand-off at the heart center/);
  });

  it('on the way to the community hospital the intercept\'s alert does not promise a team at the door', () => {
    const s = emt(['primary', 'vitals', 'als', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-near', 'reassess']);
    expect(s.fired).toContain('als-posterior');
    expect(said(s)).not.toMatch(/Cath lab activated — the team will meet you at the door/);
    expect(said(s)).toMatch(/the team will wait for the transfer/);
  });

  it('a failed AED shock gives the AED\'s own prompt (an EMT has no monitor screen), and nothing says "again"', () => {
    let s = reassessUntil(emt(['primary', 'vitals', 'ecg12']), (x) => !x.pulse);
    s = perform(sc, perform(sc, perform(sc, s, 'reassess'), 'reassess'), 'aed');
    expect(s.pulse).toBe(false);
    expect(s.log.slice(-2).map((l) => l.text)).toEqual(['AED: "Start CPR."', 'No pulse: on the chest, compressions now.']);
    expect(said(s)).not.toMatch(/compressions again|No change on the monitor/);
  });

  it('more than 4 minutes with neither compressions nor a shock: the heart comes back, she does not wake', () => {
    let s = reassessUntil(emt(['primary', 'vitals', 'ecg12']), (x) => !x.pulse);
    // 6 minutes of untreated VF, then CPR and the AED
    s = perform(sc, perform(sc, perform(sc, s, 'reassess'), 'reassess'), 'reassess');
    s = perform(sc, perform(sc, s, 'cpr'), 'aed');
    expect(s.pulse).toBe(true);
    expect(s.vitals.gcs).toBeLessThanOrEqual(8);
    expect(lastText(s)).toMatch(/^She does not wake/);
    expect(sc.status!(s)).toMatch(/^Unresponsive: no response to her name/);
    // she cannot talk: her husband answers, and nothing goes in her mouth
    expect(lastText(perform(sc, s, 'opqrst'))).toMatch(/^She cannot answer\. Her husband/);
    expect(perform(sc, s, 'aspirin').counts.aspirin).toBeUndefined();
    const after = s.log.findIndex((l) => /She does not wake/.test(l.text));
    expect(perform(sc, s, 'reassess').log.slice(after).some((l) => l.who === 'patient' && /"/.test(l.text))).toBe(false);
    // the shock within the minute (and CPR at once) still brings her back awake
    const early = perform(sc, reassessUntil(emt(['primary', 'vitals', 'ecg12']), (x) => !x.pulse), 'aed');
    expect(early.vitals.gcs).toBe(14);
  });

  it('a shock at exactly 2:00 with no CPR first converts (the minutes are rounded as the review rounds them)', () => {
    let s = reassessUntil(medic([...MEDIC_START, 'iv']), (x) => !x.pulse);
    s = perform(sc, s, 'reassess');
    expect(Math.round((s.minute - s.timers.arrestAt!) * 10) / 10).toBe(2);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(review(sc, stop(s)).toFix.some((t) => t.label === 'Defibrillate within 2 minutes')).toBe(false);
  });

  it('the intercept still comes in an arrest: the paramedic starts the line and leaves the compressions and the AED to the EMT', () => {
    let s = emt(['primary', 'vitals', 'ecg12', 'ecg-transmit', 'aspirin', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'opqrst', 'als']);
    s = reassessUntil(s, (x) => !x.pulse);
    expect(s.fired).not.toContain('als-arrives');
    s = perform(sc, s, 'cpr');
    expect(s.fired).toContain('als-arrives');
    expect(said(s)).toMatch(/Keep compressing, and let your AED shock her when it advises/);
    expect(s.flags.nitro).toBeUndefined();
    s = perform(sc, s, 'aed');
    expect(s.pulse).toBe(true);
    // with a pulse back, the paramedic records the posterior leads and calls the alert
    expect(s.fired).toContain('als-posterior');
    expect(s.flags.alert).toBeDefined();
  });

  it('when she fibrillates with the intercept beside her, the paramedic calls for compressions and the AED, naming no rhythm', () => {
    const s = reassessUntil(emt(['primary', 'vitals', 'als', 'ecg12', 'ecg-transmit', 'aspirin']), (x) => !x.pulse);
    expect(s.fired).toEqual(expect.arrayContaining(['als-arrives', 'vf']));
    const line = s.log.find((l) => /Start compressions — and analyze with your AED/.test(l.text))!;
    expect(line.who).toBe('team');
    expect(line.text).not.toMatch(GIVEAWAY);
  });

  it('the teaching cites the 2025 ACS guideline for V7–V9 and says chest pain is the main symptom in women too', () => {
    const t = sc.teaching.join(' ');
    expect(t).toMatch(/Record them for ST depression in V1–V3, and with ongoing symptoms and a nondiagnostic 12-lead \(2025 ACC\/AHA ACS guideline\)/);
    expect(t).toMatch(/Chest pain or pressure is the main symptom in women as in men/);
    expect(t).toMatch(/Mission: Lifeline/);
    expect(t).not.toMatch(/rather than crushing pain/);
  });
});
