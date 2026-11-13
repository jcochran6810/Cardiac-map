import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, answerRead, criticalsFor, perform, review, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabStentThrombosis as sc } from '@/lib/sim/scenario/scenarios/cathlabStentThrombosis';
import type { SimState } from '@/lib/sim/scenario/types';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const lastSaid = (s: SimState) => s.log.at(-1)!.text;

/** A correct run for every role the case is written for (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: calls out the change, runs the ACT, hands the aspiration catheter, the IVUS, the non-compliant balloon and the IVUS again
  3: ['callout', 'act', 'aspiration', 'ivus', 'balloon-nc', 'ivus', 'ecg12', 'hemostasis'],
  // the nurse: calls out the change, an IV platelet blocker, the ticagrelor, the heparin top-up and fentanyl, as ordered
  4: ['callout', 'cangrelor', 'p2y12', 'heparin', 'fentanyl', 'ecg12', 'reassess', 'reassess', 'hemostasis', 'handoff'],
  // the cardiologist: the ACT and the heparin, the platelets IV and by mouth, reopen, image, post-dilate, image again, finish
  5: ['act', 'heparin', 'cangrelor', 'p2y12', 'aspiration', 'ivus', 'balloon-nc', 'ivus', 'final-angio', 'ecg12', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
/** The cardiologist with the drugs fixed, up to the moment the flow is back */
const MD_TO_OPEN = MD.slice(0, MD.indexOf('aspiration') + 1);
/** The cardiologist up to the first imaging run (the under-expansion found) */
const MD_TO_IMAGE = MD.slice(0, MD.indexOf('ivus') + 1);
/** After the post-dilation: confirm, the final pictures, the 12-lead, the hand-off */
const MD_FINISH = ['ivus', 'final-angio', 'ecg12', 'handoff'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
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

describe('stent thrombosis in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc).toMatchObject({ id: 'stent-thrombosis-cathlab', setting: 'cathlab', roles: [3, 4, 5] });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-stent-thrombosis', 'reperfused-anterior', 'stemi-anterior']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // nothing he has makes a transfusion, calcium or bicarbonate right
    expect(sc.problems ?? []).toEqual([]);
  });

  it('shows a real angiogram of an LAD shut at its stent, and it exists', () => {
    expect(Object.values(sc.images ?? {})).toEqual(['stent-thrombosis']);
    expect(CATH_IMAGES['stent-thrombosis']).toBeDefined();
  });

  it('every role has its own briefing, critical items and points', () => {
    for (const role of ROLES) {
      expect(sc.briefing[role], `role ${role}`).toBeDefined();
      const items = criticalsFor(sc, role);
      expect(items.length, `role ${role}`).toBeGreaterThanOrEqual(6);
      expect(items.every((c) => (c.points ?? 10) > 0)).toBe(true);
    }
    expect(criticalsFor(sc, 3).map((c) => c.id)).toEqual(expect.arrayContaining(['callout', 'ask-act', 'ask-aspiration', 'ask-imaging', 'ask-nc', 'ask-confirm', 'hemostasis']));
    expect(criticalsFor(sc, 4).map((c) => c.id)).toEqual(expect.arrayContaining(['callout', 'ask-rn-platelets', 'ask-rn-heparin', 'ask-rn-ticagrelor', 'ask-rn-pain', 'hemostasis', 'handoff']));
    expect(criticalsFor(sc, 5).map((c) => c.id)).toEqual(expect.arrayContaining(['md-act', 'md-anticoag', 'md-platelets', 'md-ticagrelor', 'md-reopen', 'md-image', 'md-optimize', 'md-confirm', 'md-final', 'handoff']));
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('stent thrombosis in the cath lab: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
      expect(s.reads.map((r) => r.answer)).toEqual(['clin-stent-thrombosis', 'reperfused-anterior']);
      // the learner did their part: the operator never had to do it for them, and the stent never clotted again
      expect(s.fired.some((id) => id.endsWith('-fallback')), `role ${role}`).toBe(false);
      expect(s.fired.some((id) => id.startsWith('reocclusion')), `role ${role}`).toBe(false);
      expect(s.fired).not.toContain('pressure-falls');
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs = [
      ...ROLES.map((role) => [role, IDEAL[role]] as const),
      // the untreated patient: the pressure falls, then VF and a shock
      [5, [...R(4), 'defib']] as const,
      // the clot comes back with the drugs missing
      [5, ['p2y12', 'aspiration', 'reassess']] as const,
    ];
    for (const [role, steps] of runs) {
      const s = run(sc, role, [...steps], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(GIVEAWAY);
    }
  });

  it('nothing names what is happening before the learner reads it', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/thromb|clot/i);
    // the story is there for whoever listens: the emergency department's heparin dose, and the ticagrelor held
    expect(opening).toMatch(/heparin 4,000 units/);
    expect(opening).toMatch(/ticagrelor was held/);
    for (const role of ROLES) {
      const s = run(sc, role, [], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-stent-thrombosis', prompt: 'What is happening?', run: 1 });
      expect(s.pendingRead?.partial ?? []).toEqual([]);
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(/thromb|clot/i);
    }
  });
});

describe('stent thrombosis in the cath lab: recognizing it', () => {
  it('six minutes after the stent the LAD is shut again: the pain, the ST elevation and a lower pressure, and the run to read', () => {
    const s = run(sc, 5, [], undefined, 'manual');
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 104 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([104, 66, 8]);
    expect(s.images[0]).toMatchObject({ id: 'thrombosis', image: 'stent-thrombosis' });
    expect(s.flags.occluded).toBe(0);
  });

  it('calling it no-reflow is a misread, and the feedback says what it was', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    s = answerRead(sc, s, 'clin-no-reflow');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'clin-stent-thrombosis', verdict: 'wrong' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 5 });
    expect(lastSaid(s)).toMatch(/^Not quite — this is Acute stent thrombosis\./);
  });

  it('a 12-lead while the stent is shut shows the anterior ST elevation back', () => {
    const s = run(sc, 5, ['ecg12']);
    expect(s.reads.at(-1)).toMatchObject({ answer: 'stemi-anterior', verdict: 'correct' });
    expect(said(s)).toMatch(/are back up, with reciprocal depression in III and aVF/);
  });

  it('a hint names the first step that is missing: the ACT', () => {
    const s = takeHint(sc, run(sc, 5, []));
    expect(lastSaid(s)).toMatch(/^Hint: Check the ACT\./);
  });
});

describe('stent thrombosis in the cath lab: other correct care also earns full marks', () => {
  it('eptifibatide instead of cangrelor — with the smaller heparin top-up it calls for', () => {
    const s = run(sc, 5, ['act', 'gp2b3a', 'heparin', 'act', 'p2y12', 'aspiration', 'ivus', 'balloon-nc', ...MD_FINISH]);
    expect(said(s)).toMatch(/Heparin 2,000 units IV, flushed — a smaller top-up with eptifibatide running\./);
    expect(said(s)).toMatch(/ACT 238 s, with eptifibatide running\./);
    expectFullMarks(s);
  });

  it('bivalirudin instead of the heparin top-up', () => {
    const s = run(sc, 5, ['act', 'bivalirudin', 'cangrelor', 'p2y12', 'aspiration', 'act', 'ivus', 'balloon-nc', ...MD_FINISH]);
    expect(said(s)).toMatch(/ACT 338 s, with bivalirudin running\./);
    expectFullMarks(s);
  });

  it('a balloon instead of aspiration to reopen it, and OCT instead of IVUS', () => {
    expectFullMarks(run(sc, 5, ['act', 'heparin', 'cangrelor', 'p2y12', 'balloon-predil', 'oct', 'balloon-nc', 'oct', 'final-angio', 'ecg12', 'handoff']));
  });

  it('reopening first while the drugs follow within two minutes: it stays open', () => {
    const s = run(sc, 5, ['aspiration', 'act', 'heparin', 'cangrelor', 'p2y12', 'ivus', 'balloon-nc', ...MD_FINISH]);
    expect(s.fired.some((id) => id.startsWith('reocclusion'))).toBe(false);
    expectFullMarks(s);
  });

  it('the non-compliant balloon straight into the shut stent reopens and expands it; one IVUS run then both finds and confirms', () => {
    const s = run(sc, 5, ['act', 'heparin', 'cangrelor', 'p2y12', 'balloon-nc', 'ivus', 'final-angio', 'ecg12', 'handoff']);
    expect(said(s)).toMatch(/the clot is squeezed aside and the waist on the balloon opens out/);
    expect(said(s)).toMatch(/well expanded now — minimum stent area 7\.4 mm²/);
    expectFullMarks(s);
  });

  it('both IV platelet drugs, fentanyl for the pain and intracoronary nitroglycerin with a normal pressure cost nothing', () => {
    const s = run(sc, 5, ['act', 'heparin', 'cangrelor', 'gp2b3a', 'p2y12', 'aspiration', 'fentanyl', 'ic-nitro', 'ivus', 'balloon-nc', ...MD_FINISH]);
    expect(s.penalties).toEqual([]);
    expectFullMarks(s);
  });
});

describe('stent thrombosis in the cath lab: what each step does', () => {
  it('the ACT is 186 on the emergency department\'s heparin, 276 after the top-up', () => {
    let s = run(sc, 5, ['act']);
    expect(lastSaid(s)).toBe('ACT 186 s.');
    expect(s.flags['act-low']).toBeDefined();
    s = perform(sc, perform(sc, s, 'heparin'), 'act');
    expect(said(s)).toMatch(/Heparin 4,000 units IV, flushed: 8,000 units in all, about 90 units\/kg\./);
    expect(lastSaid(s)).toBe('ACT 276 s.');
  });

  it('aspiration with the drugs on board brings the flow back for good, with the ST elevation coming down', () => {
    let s = run(sc, 5, MD_TO_OPEN);
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi-reperfused', hr: 92 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([116, 72]);
    expect(s.vitals.pain).toBe(4);
    expect(s.flags.occluded).toBeUndefined();
    for (let i = 0; i < 5; i++) s = perform(sc, s, 'reassess');
    expect(s.flags.open).toBeDefined();
    expect(s.fired.some((id) => id.startsWith('reocclusion'))).toBe(false);
  });

  it('IVUS shows nothing through a shut stent, OCT only blood — neither counts as the imaging', () => {
    const ivus = run(sc, 5, ['ivus']);
    expect(lastSaid(ivus)).toMatch(/packed with clot .* the lumen and the edges cannot be judged.* Get flow back first/);
    expect(ivus.flags.imaged).toBeUndefined();
    const oct = run(sc, 5, ['oct']);
    expect(lastSaid(oct)).toMatch(/all blood\. Get flow back first/);
    expect(missed(run(sc, 5, ['act', 'heparin', 'cangrelor', 'ivus', 'aspiration']))).toContain('Image the stent once the flow is back (IVUS or OCT)');
  });

  it('with flow back, IVUS finds the cause: an under-expanded stent over calcium, no edge dissection', () => {
    const s = run(sc, 5, MD_TO_IMAGE);
    expect(lastSaid(s)).toMatch(/under-expanded — minimum stent area 4\.6 mm² .*\(58 %\).* no dissection at either edge/);
    expect(s.flags.underexpansion).toBeDefined();
  });

  it('the non-compliant balloon opens it out: pain nearly gone, and IVUS confirms 94 % of the reference', () => {
    let s = run(sc, 5, [...MD_TO_IMAGE, 'balloon-nc']);
    expect(s.flags.expanded).toBeDefined();
    expect(s.vitals.pain).toBe(2);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([122, 76]);
    s = perform(sc, s, 'ivus');
    expect(lastSaid(s)).toMatch(/94 % of the distal reference/);
    expect(s.flags.confirmed).toBeDefined();
  });

  it('a compliant balloon at nominal pressure does not open an under-expanded stent', () => {
    const s = run(sc, 5, [...MD_TO_IMAGE, 'balloon-predil']);
    expect(lastSaid(s)).toMatch(/does not change/);
    expect(s.flags.expanded).toBeUndefined();
    expect(s.penalties).toEqual([]);
  });

  it('the wire is still across: rewiring is refused and takes no time', () => {
    const before = run(sc, 5, ['act']);
    const s = perform(sc, before, 'wire-workhorse');
    expect(s.minute).toBe(before.minute);
    expect(s.counts['wire-workhorse']).toBeUndefined();
    expect(lastSaid(s)).toMatch(/still across the stent/);
  });

  it('another view of the LAD shows what is there now, in words', () => {
    expect(lastSaid(run(sc, 5, ['view-rao-cranial']))).toMatch(/stops inside the stent at a rounded filling defect/);
    expect(lastSaid(run(sc, 5, [...MD_TO_OPEN, 'view-rao-cranial']))).toMatch(/hazy, narrow segment in the middle of the stent/);
  });

  it('the final pictures wait until the stent is fixed', () => {
    const s = run(sc, 5, [...MD_TO_OPEN, 'final-angio']);
    expect(s.counts['final-angio']).toBeUndefined();
    expect(lastSaid(s)).toMatch(/the stent is not fixed/);
  });

  it('the hand-off waits until the procedure is over', () => {
    const s = run(sc, 5, [...MD_TO_OPEN, 'handoff']);
    expect(s.counts.handoff).toBeUndefined();
    expect(s.ended).toBeNull();
  });
});

describe('stent thrombosis in the cath lab: the traps', () => {
  it('ticagrelor alone is too slow: the nurse says so, and the reopened stent clots again two minutes later', () => {
    const s = run(sc, 5, ['act', 'heparin', 'p2y12', 'aspiration', 'reassess']);
    expect(said(s)).toMatch(/It won't work for an hour or more, though/);
    expect(s.fired).toContain('reocclusion-1');
    expect(s.flags.occluded).toBeDefined();
    expect(s.rhythm.profile).toBe('anterior-stemi');
    expect(s.vitals.pain).toBe(8);
    expect(missed(s)).toContain('Block the platelets IV: cangrelor or a GP IIb/IIIa inhibitor');
  });

  it('with the ACT still low it clots again too; once both are fixed, a balloon reopens it for good', () => {
    let s = run(sc, 5, ['cangrelor', 'p2y12', 'aspiration', 'reassess']);
    expect(s.fired).toContain('reocclusion-1');
    s = run(sc, 5, ['cangrelor', 'p2y12', 'aspiration', 'reassess', 'heparin', 'balloon-predil', ...R(3)]);
    expect(s.fired).not.toContain('reocclusion-2');
    expect(s.flags.open).toBeDefined();
  });

  it('forgetting the IV platelet drug altogether: the stent keeps clotting, and the item is missed', () => {
    const s = run(sc, 5, ['act', 'heparin', 'aspiration', 'reassess', 'balloon-nc', 'reassess']);
    expect(s.fired).toEqual(expect.arrayContaining(['reocclusion-1', 'reocclusion-2']));
    expect(missed(s)).toEqual(expect.arrayContaining(['Block the platelets IV: cangrelor or a GP IIb/IIIa inhibitor', 'Give the missed P2Y12 load (ticagrelor 180 mg)']));
  });

  it('never checking the ACT is a missed item, even with the heparin topped up', () => {
    const s = run(sc, 5, MD.filter((id) => id !== 'act'));
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.missed).toBe(1);
    expect(r.toFix.find((t) => t.kind === 'missed')?.label).toBe('Check the ACT');
  });

  it('another stent before imaging is a major error: it squeezes the clot downstream and fixes nothing', () => {
    const s = run(sc, 5, ['act', 'heparin', 'cangrelor', 'stent-des']);
    expect(penalties(s)).toEqual(['stent-without-imaging']);
    expect(said(s)).toMatch(/clot squeezed downstream/);
    // it does not count as reopening the stent, and the stent is still under-expanded
    expect(missed(s)).toContain('Reopen the stent: aspiration or a balloon');
    expect(lastSaid(perform(sc, s, 'ivus'))).toMatch(/under-expanded .* Two layers of stent now/);
  });

  it('another stent once imaging has shown the under-expansion is a major error too, and leaves it under-expanded', () => {
    const s = run(sc, 5, [...MD_TO_IMAGE, 'stent-des']);
    expect(penalties(s)).toEqual(['stent-for-underexpansion']);
    expect(s.flags.expanded).toBeUndefined();
    expect(said(s)).toMatch(/no better — the middle of the segment still looks narrow and hazy, now under two layers of metal/);
  });

  it('protamine is a critical error: the ACT falls further and the reopened stent clots again', () => {
    const s = run(sc, 5, [...MD_TO_OPEN, 'protamine', 'act', 'reassess']);
    expect(penalties(s)).toEqual(['protamine-in-thrombosis']);
    expect(s.penalties[0].severity).toBe('critical');
    expect(said(s)).toMatch(/ACT 132 s\./);
    expect(s.fired).toContain('reocclusion-1');
    // bivalirudin rescues it then, with no penalty for stacking anticoagulants
    const rescued = perform(sc, s, 'bivalirudin');
    expect(penalties(rescued)).toEqual(['protamine-in-thrombosis']);
  });

  it('a systemic fibrinolytic in the lab is a critical error', () => {
    expect(penalties(run(sc, 5, ['tnk']))).toEqual(['lytic-in-lab']);
  });

  it('heparin and bivalirudin on top of each other cost points once', () => {
    expect(penalties(run(sc, 5, ['act', 'heparin', 'bivalirudin']))).toEqual(['double-anticoagulant']);
    expect(penalties(run(sc, 5, ['act', 'bivalirudin', 'heparin']))).toEqual(['double-anticoagulant']);
  });

  it('an IV beta-blocker, intracoronary epinephrine or oxygen he does not need cost points', () => {
    expect(penalties(run(sc, 5, ['metoprolol']))).toEqual(['beta-blocker']);
    expect(penalties(run(sc, 5, ['ic-epinephrine']))).toEqual(['ic-epi-no-indication']);
    expect(penalties(run(sc, 5, ['o2-nrb']))).toEqual(['oxygen-normoxic']);
  });

  it('left shut, the pressure falls at 4 minutes and VF follows at 7; a shock brings him back to the same shut stent — no shock and he dies', () => {
    let s = run(sc, 5, R(2));
    expect(s.fired).toContain('pressure-falls');
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([88, 56, 112]);
    s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(true);
    s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(false);
    expect(s.flags.arrest).toBe(8);
    expect(s.rhythm.profile).toBe('vf');
    const shocked = perform(sc, s, 'defib');
    expect(shocked.pulse).toBe(true);
    expect(shocked.rhythm).toEqual({ profile: 'anterior-stemi', hr: 112 });
    expect(shocked.flags.occluded).toBeDefined();
    expect(penalties(shocked)).toEqual([]);
    expect(review(sc, stop(shocked)).toFix.some((t) => t.label === 'Defibrillate VF within 1 minute')).toBe(false);
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });

  it('nothing for the clot can be done during the arrest: shock first', () => {
    const s = run(sc, 5, R(4));
    expect(s.pulse).toBe(false);
    for (const id of ['aspiration', 'balloon-predil', 'balloon-nc', 'stent-des', 'ivus']) {
      const t = perform(sc, s, id);
      expect(t.counts[id], id).toBeUndefined();
      expect(lastSaid(t), id).toMatch(/Not during the arrest/);
    }
  });
});

describe('stent thrombosis in the cath lab: the tech', () => {
  const TECH = IDEAL[3];

  it('a stent opened unasked gets a word from the operator and a small penalty — it never reaches the patient', () => {
    const s = run(sc, 3, ['callout', 'stent-des']);
    expect(penalties(s)).toEqual(['tech-unasked-stent']);
    expect(s.penalties[0].points).toBe(3);
    expect(s.log.some((l) => l.who === 'operator' && /nobody puts a second stent in/.test(l.text))).toBe(true);
    expect(s.flags['more-metal']).toBeUndefined();
  });

  it('a compliant balloon when the operator asks for a non-compliant one costs points', () => {
    const s = run(sc, 3, [...TECH.slice(0, TECH.indexOf('balloon-nc')), 'balloon-predil']);
    expect(penalties(s)).toEqual(['wrong-nc']);
    expect(s.log.some((l) => l.who === 'operator' && /No — non-compliant/.test(l.text))).toBe(true);
  });

  it('a balloon when the operator asks for the aspiration catheter gets a word, not a penalty', () => {
    const s = run(sc, 3, ['callout', 'act', 'balloon-nc']);
    expect(penalties(s)).toEqual([]);
    expect(s.log.some((l) => l.who === 'operator' && /Not a balloon yet/.test(l.text))).toBe(true);
  });

  it('the IVUS opened before the flow is back is kept ready, and counts once the operator asks for it', () => {
    const s = run(sc, 3, ['callout', 'act', 'ivus', ...TECH.slice(TECH.indexOf('aspiration'))]);
    expect(s.log.some((l) => l.who === 'operator' && /Keep it ready/.test(l.text))).toBe(true);
    expect(missed(s)).not.toContain('IVUS or OCT set up to find the cause');
  });

  it('a tech who never calls out the change loses those points', () => {
    expect(missed(run(sc, 3, TECH.filter((id) => id !== 'callout')))).toContain('Call out the returning pain, the ST segments and the falling pressure at once');
  });

  it('when the tech never answers, the operator does it all — late, but the flow comes back and VF never comes', () => {
    const s = run(sc, 3, R(10));
    expect(s.fired).toEqual(expect.arrayContaining(['act-fallback', 'aspiration-fallback', 'imaging-fallback', 'nc-fallback', 'confirm-fallback', 'md-final']));
    expect(s.fired).not.toContain('vf');
    expect(s.flags['final-angio']).toBeDefined();
    expect(s.pulse).toBe(true);
    expect(missed(s)).toEqual(expect.arrayContaining(['ACT at once', 'Aspiration catheter, as ordered']));
  });
});

describe('stent thrombosis in the cath lab: the nurse', () => {
  const RN = IDEAL[4];
  const TO_PLATELETS = RN.slice(0, RN.indexOf('cangrelor'));

  it('eptifibatide answers the order for an IV platelet blocker as well as cangrelor does', () => {
    expectFullMarks(run(sc, 4, RN.map((id) => (id === 'cangrelor' ? 'gp2b3a' : id))));
  });

  it('the tablet when the order was for something IV: no penalty — he needs it too — but the operator says it is too slow', () => {
    const s = run(sc, 4, [...TO_PLATELETS, 'p2y12']);
    expect(penalties(s)).toEqual([]);
    expect(s.log.some((l) => l.who === 'operator' && /a tablet takes an hour or more to work/.test(l.text))).toBe(true);
    // given early, the operator never orders it again (the order would ask for a tablet he has had), and nothing is lost
    const later = run(sc, 4, [...TO_PLATELETS, 'p2y12', 'cangrelor', 'heparin', 'fentanyl', 'ecg12', 'reassess', 'reassess', 'hemostasis', 'handoff']);
    expectFullMarks(later);
  });

  it('bivalirudin for the platelets gets a word and a small penalty', () => {
    const s = run(sc, 4, [...TO_PLATELETS, 'bivalirudin']);
    expect(penalties(s)).toEqual(['wrong-rn-platelets']);
    expect(s.log.some((l) => l.who === 'operator' && /That's an anticoagulant, not a platelet drug/.test(l.text))).toBe(true);
  });

  it('protamine for the low ACT: the operator stops it, and it costs one penalty, not two', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('heparin')), 'protamine']);
    expect(s.log.some((l) => l.who === 'operator' && /protamine reverses it/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['protamine-in-thrombosis']);
  });

  it('midazolam for the pain gets a word and a small penalty', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('fentanyl')), 'midazolam']);
    expect(penalties(s)).toEqual(['wrong-rn-pain']);
    expect(s.log.some((l) => l.who === 'operator' && /That's a sedative/.test(l.text))).toBe(true);
  });

  it('the tech runs the ACT for the nurse, and the operator orders the top-up from it', () => {
    const s = run(sc, 4, ['callout', 'reassess']);
    expect(s.log.some((l) => l.who === 'team' && l.text === 'Tech: "ACT 186 s."')).toBe(true);
    expect(s.flags['asked-rn-heparin']).toBeDefined();
  });

  it('a nurse who stays silent through the change misses the callout', () => {
    expect(missed(run(sc, 4, RN.filter((id) => id !== 'callout')))).toContain('Call out the returning pain, the ST segments and the falling pressure at once');
  });

  it('when the nurse never answers, the operator gives the drugs — late, but the flow comes back and VF never comes', () => {
    const s = run(sc, 4, R(10));
    expect(s.fired).toEqual(expect.arrayContaining(['rn-platelets-fallback', 'rn-heparin-fallback', 'rn-ticagrelor-fallback', 'rn-pain-fallback', 'md-reopen', 'md-final']));
    expect(s.fired).not.toContain('vf');
    expect(s.fired.some((id) => id.startsWith('reocclusion'))).toBe(false);
    expect(s.flags['final-angio']).toBeDefined();
  });
});

describe('stent thrombosis in the cath lab: what each role cannot do out of turn', () => {
  it('nothing goes by mouth in the arrest: the ticagrelor is refused in VF and taken once he is shocked back', () => {
    const s = run(sc, 5, R(4));
    expect(s.pulse).toBe(false);
    const t = perform(sc, s, 'p2y12');
    expect(t.counts.p2y12).toBeUndefined();
    expect(t.flags.p2y12).toBeUndefined();
    expect(lastSaid(t)).toMatch(/^Not in cardiac arrest/);
    const back = perform(sc, perform(sc, s, 'defib'), 'p2y12');
    expect(back.flags.p2y12).toBeDefined();
  });

  it('the radial band waits for the final pictures: refused mid-procedure for the tech and the nurse, at no cost in time', () => {
    for (const role of [3, 4] as const) {
      const before = run(sc, role, ['callout']);
      const s = perform(sc, before, 'hemostasis');
      expect(s.minute, `role ${role}`).toBe(before.minute);
      expect(s.counts.hemostasis, `role ${role}`).toBeUndefined();
      expect(lastSaid(s), `role ${role}`).toMatch(/still working through the radial sheath/);
    }
    // put on after the final pictures, it counts (the ideal runs end with it)
    expect(missed(run(sc, 4, IDEAL[4]))).toEqual([]);
  });

  it('the tech takes the final pictures only once the operator has the imaging after the balloon', () => {
    const TECH = IDEAL[3];
    const s = run(sc, 3, TECH.slice(0, TECH.indexOf('balloon-nc') + 1));
    expect(s.flags.expanded).toBeDefined();
    const t = perform(sc, s, 'final-angio');
    expect(t.counts['final-angio']).toBeUndefined();
    expect(lastSaid(t)).toMatch(/the imaging after the balloon comes first/);
  });

  it('intracoronary nitroglycerin from the tech is drawn up and handed to the operator, who injects it', () => {
    const s = run(sc, 3, ['callout', 'ic-nitro']);
    expect(said(s)).toMatch(/drawn up, labeled and handed to the operator/);
    expect(s.log.some((l) => l.who === 'operator' && /Injecting/.test(l.text))).toBe(true);
    expect(s.penalties).toEqual([]);
  });
});

describe('stent thrombosis in the cath lab: more metal, and what it leaves behind', () => {
  it('another stent once the imaging has shown it fully expanded is metal for nothing: its own penalty, not the under-expansion one', () => {
    const s = run(sc, 5, [...MD_TO_IMAGE, 'balloon-nc', 'ivus', 'stent-des']);
    expect(penalties(s)).toEqual(['stent-no-indication']);
    expect(s.penalties[0].text).toMatch(/nothing left for it to fix/);
    expect(said(s)).toMatch(/there was nothing left for it to fix/);
  });

  it('a stent pushed over the clot squeezes it downstream for good: the final pictures say so, and nothing reads as a clean result', () => {
    const s = run(sc, 5, ['act', 'heparin', 'cangrelor', 'p2y12', 'stent-des', 'ivus', 'balloon-nc', 'ivus', 'final-angio', 'ecg12', 'handoff']);
    expect(penalties(s)).toEqual(['stent-without-imaging']);
    expect(said(s)).toMatch(/the distal LAD still fills a beat late, with a patchy blush at the apex/);
    expect(said(s)).toMatch(/Final angiogram in two views: the stent fully open.*patchy blush at the apex — the clot the second stent squeezed downstream/);
    expect(said(s)).not.toMatch(/fills briskly to the apex \(TIMI 3\) with a good myocardial blush/);
    expect(s.vitals.pain).toBe(3);
  });

  it('a covered stent is another stent, and a worse one: the cardiologist pays as much as for a stent before imaging', () => {
    const s = run(sc, 5, ['act', 'heparin', 'cangrelor', 'p2y12', 'stent-covered']);
    expect(penalties(s)).toEqual(['covered-no-perforation']);
    expect(s.penalties[0]).toMatchObject({ points: 10, severity: 'major' });
    expect(said(s)).toMatch(/A covered stent, 3\.5 × 24, deployed over the clot.*clot squeezed downstream/);
    expect(s.flags.embolized).toBeDefined();
  });

  it('a covered stent opened by the tech is refused by the operator, with a small penalty', () => {
    const s = run(sc, 3, ['callout', 'stent-covered']);
    expect(penalties(s)).toEqual(['tech-unasked-covered']);
    expect(s.log.some((l) => l.who === 'operator' && /there's no perforation/.test(l.text))).toBe(true);
    expect(s.flags['covered-stent']).toBeUndefined();
  });

  it('shocked back with the LAD still shut, he fibrillates again seven minutes later', () => {
    let s = perform(sc, run(sc, 5, R(4)), 'defib');
    expect(s.pulse).toBe(true);
    for (let i = 0; i < 4; i++) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('vf-again');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    // reopened after the first shock, it never comes back
    const fixed = run(sc, 5, [...R(4), 'defib', 'act', 'heparin', 'cangrelor', 'aspiration', ...R(4)]);
    expect(fixed.fired).not.toContain('vf-again');
  });
});

describe('stent thrombosis in the cath lab: the imaging numbers and the words that go with them', () => {
  it('OCT measures its own (smaller) numbers, under its 4.5 mm² threshold, and the operator\'s order does not quote the IVUS figure', () => {
    const s = run(sc, 3, ['callout', 'act', 'aspiration', 'oct']);
    expect(said(s)).toMatch(/OCT: the stent is under-expanded — minimum stent area 4\.1 mm² .* 7\.4 mm² \(55 %\)/);
    expect(said(s)).not.toMatch(/four point six/);
    expect(s.log.some((l) => l.who === 'operator' && /Under-expanded over that calcium/.test(l.text))).toBe(true);
    const md = run(sc, 5, ['act', 'heparin', 'cangrelor', 'p2y12', 'aspiration', 'oct', 'balloon-nc', 'oct']);
    expect(lastSaid(md)).toMatch(/OCT: the stent is well expanded now — minimum stent area 6\.9 mm² \(93 %/);
  });

  it('the beta-blocker penalty says what is true at any point of the case, even after the stent is fixed', () => {
    const s = run(sc, 5, [...MD_TO_IMAGE, 'balloon-nc', 'metoprolol']);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    expect(penalties(s)).toEqual(['beta-blocker']);
    expect(s.penalties[0].text).toMatch(/fell to about 100 when the stent shut/);
    expect(s.penalties[0].text).not.toMatch(/near 100 and a fast rate/);
  });
});

describe('stent thrombosis in the cath lab: the nurse and the anticoagulant', () => {
  const RN = IDEAL[4];
  const TO_HEPARIN = RN.slice(0, RN.indexOf('heparin'));

  it('bivalirudin for the heparin order: the operator lets it stand, stacks no heparin on top, and it costs one small penalty', () => {
    let s = run(sc, 4, [...TO_HEPARIN, 'bivalirudin']);
    expect(penalties(s)).toEqual(['wrong-rn-heparin']);
    expect(s.log.some((l) => l.who === 'operator' && /I asked for heparin.*no heparin on top of it/.test(l.text))).toBe(true);
    for (let i = 0; i < 3; i++) s = perform(sc, s, 'reassess');
    expect(s.fired).not.toContain('rn-heparin-fallback');
    expect(s.flags['heparin-topup']).toBeUndefined();
    // anticoagulated all the same: the operator reopens and it stays open
    expect(s.fired).toContain('md-reopen');
    expect(s.fired.some((id) => id.startsWith('reocclusion'))).toBe(false);
    expect(missed(s)).toContain('Heparin top-up for an ACT of 186');
  });

  it('bivalirudin on top of the heparin with no order for it costs the nurse the stacking penalty', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('fentanyl') + 1), 'bivalirudin']);
    expect(penalties(s)).toEqual(['double-anticoagulant']);
  });

  it('bivalirudin to the platelet order after a heparin she gave unasked: one mistake, one penalty', () => {
    const s = run(sc, 4, ['callout', 'heparin', 'bivalirudin']);
    expect(penalties(s)).toEqual(['wrong-rn-platelets']);
  });

  it('a nurse who gives the tablet before the IV order: no order for it afterwards, and the order for the IV drug does not say he never had it', () => {
    const s = run(sc, 4, ['callout', 'p2y12', 'cangrelor', 'heparin', 'fentanyl', 'ecg12', 'reassess', 'reassess', 'hemostasis', 'handoff']);
    expect(s.flags['asked-rn-ticagrelor']).toBeUndefined();
    expect(said(s)).not.toMatch(/never got his ticagrelor/);
    expect(s.flags['asked-rn-pain']).toBeDefined();
    expectFullMarks(s);
  });
});

describe('stent thrombosis in the cath lab: a pump', () => {
  it('without shock it costs a little (and the minutes it takes); shocked back to 84 systolic it is a defensible choice', () => {
    expect(penalties(run(sc, 5, ['impella']))).toEqual(['pump-no-shock']);
    expect(penalties(run(sc, 5, ['iabp']))).toEqual(['pump-no-shock']);
    const shocked = perform(sc, run(sc, 5, R(4)), 'defib');
    expect(shocked.vitals.sbp).toBeLessThan(90);
    expect(penalties(perform(sc, shocked, 'impella'))).toEqual([]);
  });
});
