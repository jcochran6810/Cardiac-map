import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabNoReflow as sc } from '@/lib/sim/scenario/scenarios/cathlabNoReflow';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: the ACT, the stent as ordered, calls out the change, epinephrine and adenosine drawn up as ordered, IVUS set up, the pause called out
  3: ['act', 'stent-des', 'callout', 'ic-epinephrine', 'ivus', 'ic-adenosine', 'callout', 'ecg12', 'hemostasis'],
  // the nurse: the ACT and the heparin top-up, calls out the change, chooses intracoronary epinephrine for the low pressure, adenosine as ordered, calls out the pause
  4: ['act', 'heparin', 'reassess', 'callout', 'ic-epinephrine', 'ecg12', 'ic-adenosine', 'callout', 'ecg12-repeat', 'hemostasis', 'handoff'],
  // the cardiologist: ACT and heparin before the stent; then epinephrine for the pressure, IVUS to rule out a dissection, adenosine until the flow is back
  5: ['act', 'heparin', 'stent-des', 'ic-epinephrine', 'ivus', 'ic-adenosine', 'final-angio', 'ecg12', 'echo', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
/** The cardiologist up to the no-reflow: the ACT, the top-up and the stent */
const MD_TO_STENT = MD.slice(0, MD.indexOf('stent-des') + 1);
/** The same with the first read given by hand, so the no-reflow read stays open */
const MANUAL_TO_STENT: Record<3 | 4 | 5, string[]> = {
  3: ['read:angio-lad-prox-occlusion', 'act', 'stent-des'],
  4: ['read:angio-lad-prox-occlusion', 'act', 'heparin', 'reassess'],
  5: ['read:angio-lad-prox-occlusion', ...MD_TO_STENT],
};

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

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

describe('no-reflow in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('no-reflow-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-no-reflow', 'angio-lad-prox-occlusion', 'angio-thrombus']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
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

  it('shows real images from one patient\'s article: the clot-filled LAD before, and the runs after the stent', () => {
    const keys = Object.values(sc.images ?? {});
    expect(keys).toEqual(['lad-occlusion-thrombus', 'lad-no-reflow-pci']);
    const sources = keys.map((k) => CATH_IMAGES[k!]?.source);
    for (const src of sources) expect(src).toBeDefined();
    expect(new Set(sources).size).toBe(1);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('no-reflow in the cath lab: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
      expect(s.reads.map((r) => r.answer)).toEqual(expect.arrayContaining(['angio-lad-prox-occlusion', 'clin-no-reflow', 'reperfused-anterior']));
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nothing names what is happening before the learner reads it', () => {
    for (const role of ROLES) {
      const s = run(sc, role, MANUAL_TO_STENT[role], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-no-reflow' });
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(/no-reflow|slow flow|small vessels|microvasc/i);
    }
  });

  it('pressor support and two doses of adenosine is correct care too: full marks', () => {
    expectFullMarks(run(sc, 5, [...MD_TO_STENT, 'pressor', 'ivus', 'ic-adenosine', 'ic-adenosine', 'final-angio', 'ecg12', 'echo', 'handoff']));
  });

  it('a second projection of the stent rules out a dissection as well as IVUS does: full marks', () => {
    expectFullMarks(run(sc, 5, MD.map((id) => (id === 'ivus' ? 'view-rao-cranial' : id))));
  });

  it('eptifibatide as a bail-out costs nothing, and with it running an ACT of 212 needs no top-up: full marks', () => {
    const s = run(sc, 5, ['gp2b3a', 'act', 'stent-des', 'ic-epinephrine', 'ivus', 'ic-adenosine', 'final-angio', 'ecg12', 'echo', 'handoff']);
    expect(s.log.some((l) => l.text === 'ACT 212 s, with eptifibatide running.')).toBe(true);
    expectFullMarks(s);
  });
});

describe('no-reflow in the cath lab: recognizing it', () => {
  it('the stent brings it: an open stent with stalled flow, the pain and the ST elevation back, the pressure down', () => {
    const s = run(sc, 5, MANUAL_TO_STENT[5], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-no-reflow', prompt: 'What is happening?' });
    expect(s.pendingRead?.partial ?? []).toEqual([]);
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 108 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([86, 54, 8]);
    expect(s.log.some((l) => /stent segment looks open, but the contrast creeps/.test(l.text))).toBe(true);
  });

  it('calling it a dissection is a misread, and the feedback says what it was', () => {
    let s = run(sc, 5, MANUAL_TO_STENT[5], undefined, 'manual');
    s = answerRead(sc, s, 'clin-dissection');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'clin-no-reflow', verdict: 'wrong' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 5 });
    // the feedback comes first; what waited on the read follows it at once
    expect(s.log.filter((l) => l.who === 'feedback').at(-1)!.text).toMatch(/^Not quite — this is No-reflow\./);
  });

  it('the real post-stent runs (labeled with the finding) reach the Imaging screen only after the read', () => {
    let s = run(sc, 5, MANUAL_TO_STENT[5], undefined, 'manual');
    expect(s.images.map((r) => r.id)).toEqual(['angio']);
    s = answerRead(sc, s, 'clin-no-reflow');
    // they wait for the read, then come with it (no case time passes), not after the next action
    expect(s.images.map((r) => r.id)).toEqual(['angio', 'no-reflow']);
    expect(s.images.at(-1)).toMatchObject({ id: 'no-reflow', image: 'lad-no-reflow-pci' });
    s = perform(sc, s, 'ic-epinephrine');
    expect(s.images.map((r) => r.id)).toEqual(['angio', 'no-reflow']);
    // nothing waits on that run, so its caption shows at once
    expect(s.pendingRead).toBeNull();
  });

  it('the first run is a real image to read, with the clot as a half-right read', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    expect(s.images[0]).toMatchObject({ id: 'angio', image: 'lad-occlusion-thrombus' });
    expect(s.pendingRead).toMatchObject({ kind: 'angio', answer: 'angio-lad-prox-occlusion', run: 1 });
    s = answerRead(sc, s, 'angio-thrombus');
    expect(s.reads.at(-1)).toMatchObject({ verdict: 'partial' });
  });
});

describe('no-reflow in the cath lab: what works', () => {
  it('intracoronary epinephrine lifts the pressure and improves the flow; a second drug brings it back', () => {
    let s = run(sc, 5, [...MD_TO_STENT, 'ic-epinephrine']);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([102, 62, 116]);
    expect(s.flags['micro-1']).toBeDefined();
    expect(s.flags.reflow).toBeUndefined();
    expect(s.vitals.pain).toBe(6);
    s = perform(sc, s, 'ic-adenosine');
    expect(s.flags.reflow).toBeDefined();
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi-reperfused', hr: 92 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(112);
    expect(s.vitals.pain).toBe(2);
    expect(s.penalties).toEqual([]);
  });

  it('adenosine brings seconds of AV block: the monitor gives only the numbers, and the nurse says it aloud', () => {
    const s = run(sc, 5, [...MD_TO_STENT, 'ic-epinephrine', 'ic-adenosine']);
    const pause = s.log.find((l) => l.who === 'monitor' && /Heart rate falls to about 30 for 8 seconds/.test(l.text))!;
    expect(pause.text).toMatch(/then back to 116 on its own/);
    expect(pause.text).not.toMatch(giveaway);
    // what the tracing showed during the pause is the learner's to see: no P waves, QRS or block in the monitor's words
    expect(pause.text).not.toMatch(/P wave|QRS|block/i);
    expect(s.log.some((l) => l.who === 'team' && /Pause/.test(l.text))).toBe(true);
  });

  it('a drug given through the aspiration catheter beyond the stent brings the flow back at once — and the aspiration costs nothing', () => {
    const s = run(sc, 5, [...MD_TO_STENT, 'aspiration', 'ic-adenosine']);
    expect(s.flags.reflow).toBeDefined();
    expect(s.log.some((l) => /Adenosine 200 mcg through the aspiration catheter, beyond the stent/.test(l.text))).toBe(true);
    expect(s.penalties).toEqual([]);
  });

  it('nitroprusside and verapamil open the microvessels too, without penalty once the pressure is held up', () => {
    for (const drug of ['ic-nitroprusside', 'ic-verapamil']) {
      const s = run(sc, 5, [...MD_TO_STENT, 'ic-epinephrine', drug]);
      expect(s.flags.reflow, drug).toBeDefined();
      expect(s.penalties, drug).toEqual([]);
    }
  });

  it('a norepinephrine infusion holds the pressure up but does not open the microvessels by itself', () => {
    const s = run(sc, 5, [...MD_TO_STENT, 'pressor']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([96, 58]);
    expect(s.flags.supported).toBeDefined();
    expect(s.flags['micro-1']).toBeUndefined();
  });

  it('the ACT has drifted to 212 until the heparin is topped up; then it is 268', () => {
    let s = run(sc, 5, ['act']);
    expect(s.log.at(-1)!.text).toBe('ACT 212 s.');
    expect(s.flags['act-low']).toBeDefined();
    s = perform(sc, perform(sc, s, 'heparin'), 'act');
    expect(s.log.at(-1)!.text).toBe('ACT 268 s.');
    // checking the ACT and leaving it low misses the top-up
    expect(missed(run(sc, 5, ['act', 'stent-des']))).toContain('Top up the heparin for an ACT under 250');
  });

  it('final pictures wait until the flow is back', () => {
    const s = run(sc, 5, [...MD_TO_STENT, 'final-angio']);
    expect(s.counts['final-angio']).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/flow is not back/);
  });
});

describe('no-reflow in the cath lab: the traps', () => {
  it('intracoronary nitroglycerin with a pressure of 86 is a major error, drops it further and does nothing for the flow — one penalty', () => {
    const s = run(sc, 5, [...MD_TO_STENT, 'ic-nitro']);
    expect(penalties(s)).toEqual(['nitro-low-pressure']);
    expect(s.vitals.sbp).toBe(76);
    expect(s.flags['micro-1']).toBeUndefined();
    expect(s.log.some((l) => /no change — the contrast still creeps/.test(l.text))).toBe(true);
  });

  it('nitroprusside or verapamil with a pressure of 86 cost points and drop it further', () => {
    const np = run(sc, 5, [...MD_TO_STENT, 'ic-nitroprusside']);
    expect(penalties(np)).toEqual(['nitroprusside-hypotension']);
    expect(np.vitals.sbp).toBe(74);
    const vp = run(sc, 5, [...MD_TO_STENT, 'ic-verapamil']);
    expect(penalties(vp)).toEqual(['verapamil-low-pressure']);
    expect(vp.vitals.sbp).toBe(78);
  });

  it('another stent or more balloon inflations for slow flow cost points and make it no better', () => {
    const stent = run(sc, 5, [...MD_TO_STENT, 'stent-des']);
    expect(penalties(stent)).toEqual(['stent-for-no-reflow']);
    expect(stent.flags['micro-1']).toBeUndefined();
    expect(stent.vitals.pain).toBe(9);
    const balloon = run(sc, 5, [...MD_TO_STENT, 'balloon-nc']);
    expect(penalties(balloon)).toEqual(['balloon-for-no-reflow']);
    // the tech who opens a stent or a balloon once the flow has stalled gets a word and a smaller penalty: the operator
    // refuses it, so nothing reaches the patient
    for (const device of ['stent-des', 'balloon-nc']) {
      const tech = run(sc, 3, ['act', 'stent-des', device]);
      expect(penalties(tech), device).toEqual(['tech-unasked-metal']);
      expect(tech.penalties[0].points).toBe(3);
      expect(tech.log.some((l) => l.who === 'operator' && /More metal won't fix this/.test(l.text)), device).toBe(true);
    }
  });

  it('treating without looking at the stent misses the search for a dissection', () => {
    const s = run(sc, 5, MD.filter((id) => id !== 'ivus'));
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.missed).toBe(1);
    expect(r.toFix.find((t) => t.kind === 'missed')?.label).toMatch(/dissection/);
  });

  it('protamine during a thrombotic PCI is a major error', () => {
    const s = run(sc, 5, [...MD_TO_STENT, 'protamine']);
    expect(penalties(s)).toEqual(['protamine-in-thrombus']);
  });

  it('intracoronary adenosine is fair at the no-reflow pressure; below 85 — the pressure falling, or after the VF — it is the low-pressure mistake', () => {
    let s = run(sc, 5, MD_TO_STENT);
    expect(penalties(perform(sc, s, 'ic-adenosine'))).toEqual([]);
    while (!s.fired.includes('pressure-falls')) s = perform(sc, s, 'reassess');
    expect(penalties(perform(sc, s, 'ic-adenosine'))).toEqual(['ic-vasodilator-hypotension']);
    while (s.pulse) s = perform(sc, s, 'reassess');
    s = perform(sc, s, 'defib');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([82, 50]);
    expect(penalties(perform(sc, s, 'ic-adenosine'))).toEqual(['ic-vasodilator-hypotension']);
  });

  it('left untreated the pressure falls, then VF; a shock brings him back to the same stalled flow — no shock and he dies', () => {
    let s = run(sc, 5, MD_TO_STENT);
    while (!s.fired.includes('pressure-falls')) s = perform(sc, s, 'reassess');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([74, 46]);
    while (s.pulse) s = perform(sc, s, 'reassess');
    expect(s.rhythm.profile).toBe('vf');
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    const shocked = perform(sc, s, 'defib');
    expect(shocked.pulse).toBe(true);
    expect(shocked.rhythm.profile).toBe('anterior-stemi');
    expect(shocked.flags.reflow).toBeUndefined();
    expect(penalties(shocked)).toEqual([]);
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });
});

describe('no-reflow in the cath lab: the tech and the nurse', () => {
  const TECH = IDEAL[3];
  const RN = IDEAL[4];

  it('adenosine handed up for the epinephrine asked for: the wrong answer at 86; with the pressure fallen under 85, the low-pressure mistake alone', () => {
    const asked = run(sc, 4, RN.slice(0, RN.indexOf('ic-epinephrine')));
    expect(penalties(perform(sc, asked, 'ic-adenosine'))).toEqual(['wrong-rn-epi']);
    // procainamide dropped him to 76 with the request still open: the heavier mistake speaks for the dose, once
    const low = perform(sc, asked, 'procainamide');
    expect(low.vitals.sbp).toBeLessThan(85);
    expect(penalties(perform(sc, low, 'ic-adenosine'))).toEqual(['procainamide-hypotension', 'ic-vasodilator-hypotension']);
  });

  it('the nurse who reaches for nitroglycerin gets a word from the operator and one penalty, not two', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('ic-epinephrine')), 'ic-nitro']);
    expect(s.log.some((l) => l.who === 'operator' && /lowers his pressure, it doesn't raise it/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['nitro-low-pressure']);
  });

  it('adenosine when the operator asks for a drug that raises the pressure gets a word and a small penalty (nurse and tech)', () => {
    const rn = run(sc, 4, [...RN.slice(0, RN.indexOf('ic-epinephrine')), 'ic-adenosine']);
    expect(penalties(rn)).toEqual(['wrong-rn-epi']);
    expect(rn.log.some((l) => l.who === 'operator' && /lowers his pressure, it doesn't raise it/.test(l.text))).toBe(true);
    const tech = run(sc, 3, [...TECH.slice(0, TECH.indexOf('ic-epinephrine')), 'ic-adenosine']);
    expect(penalties(tech)).toEqual(['wrong-epi']);
    expect(tech.log.some((l) => l.who === 'operator' && /That's not what I asked for/.test(l.text))).toBe(true);
    // and epinephrine handed when the operator asked for adenosine is the wrong syringe too
    const swap = run(sc, 3, [...TECH.slice(0, TECH.indexOf('ic-adenosine')), 'ic-epinephrine']);
    expect(penalties(swap)).toEqual(['wrong-adenosine']);
  });

  it('the nurse gives adenosine into the coronary, not an IV dose', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('ic-adenosine')), 'adenosine6']);
    expect(penalties(s)).toEqual(['wrong-rn-adenosine']);
    expect(s.log.some((l) => l.who === 'operator' && /Not an IV dose/.test(l.text))).toBe(true);
  });

  it('a nurse who stays silent through the pause misses the callout', () => {
    const s = run(sc, 4, RN.slice(0, RN.indexOf('ic-adenosine') + 1));
    expect(s.flags['adenosine-pause']).toBeDefined();
    expect(missed(s)).toContain('Call out the pause after the adenosine');
  });

  it('protamine for a low ACT gets a word from the operator', () => {
    const s = run(sc, 4, ['act', 'protamine']);
    expect(s.log.some((l) => l.who === 'operator' && /protamine reverses it/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['protamine-in-thrombus']);
  });

  it('the tech hands what was asked for: the wrong syringe gets a word and costs points', () => {
    const s = run(sc, 3, [...TECH.slice(0, TECH.indexOf('ic-adenosine')), 'ic-verapamil']);
    expect(penalties(s)).toEqual(['wrong-adenosine']);
    expect(s.log.some((l) => l.who === 'operator' && /not what I asked for/.test(l.text))).toBe(true);
  });

  it('the tech who opens the wrong device for the stent costs points', () => {
    const s = run(sc, 3, ['act', 'stent-covered']);
    expect(penalties(s)).toEqual(expect.arrayContaining(['wrong-stent', 'covered-no-perforation']));
  });

  it('a tech who never calls out the change loses those points', () => {
    const s = run(sc, 3, TECH.filter((id) => id !== 'callout'));
    expect(missed(s)).toEqual(expect.arrayContaining(['Call out the falling pressure and the returning pain at once', 'Call out the pause after the adenosine']));
  });

  it('when the tech never answers, the operator does it all — and the flow still comes back in time', () => {
    const s = run(sc, 3, ['act', 'stent-des', ...R(8)]);
    expect(s.fired).toEqual(expect.arrayContaining(['epi-fallback', 'imaging-fallback', 'adenosine-fallback', 'md-final']));
    expect(s.fired).not.toContain('vf');
    expect(s.flags.reflow).toBeDefined();
    expect(s.pulse).toBe(true);
  });

  it('when the nurse never answers, the operator gives the drugs — and the flow still comes back in time', () => {
    const s = run(sc, 4, ['act', 'heparin', ...R(8)]);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-epi-fallback', 'md-ivus-for-rn', 'rn-adenosine-fallback', 'md-final']));
    expect(s.fired).not.toContain('vf');
    expect(s.flags.reflow).toBeDefined();
  });

  it('from the very start the procedure goes on without the learner: ACT, top-up and stent', () => {
    for (const role of [3, 4] as LearningLevel[]) {
      // the operator waits 3 minutes for the ACT, 3 for the top-up, then puts the stent in
      const s = run(sc, role, R(6));
      expect(s.fired, `role ${role}`).toContain(role === 3 ? 'act-fallback' : 'rn-act-fallback');
      expect(s.flags['heparin-topup'], `role ${role}`).toBeDefined();
      expect(s.flags['no-reflow'], `role ${role}`).toBeDefined();
    }
  });
});

describe('no-reflow in the cath lab: fair scoring and a consistent patient (independent review)', () => {
  /** The cardiologist up to the stent, then the no-reflow read answered by the runner */
  const NO_REFLOW = MD_TO_STENT;
  const FINISH = ['final-angio', 'ecg12', 'echo', 'handoff'];

  it('flow brought back within 3 minutes brings the pressure back too: no missed support for that learner', () => {
    // the aspiration catheter beyond the stent, then adenosine through it: the flow (and the pressure) back in about a minute
    const fast = run(sc, 5, [...NO_REFLOW, 'aspiration', 'ic-adenosine', 'ivus', ...FINISH]);
    expect(fast.vitals.sbp).toBeGreaterThanOrEqual(112);
    expectFullMarks(fast);
    // adenosine twice with the second dose bringing the flow back inside the 3 minutes: the same
    expectFullMarks(run(sc, 5, [...NO_REFLOW, 'ic-adenosine', 'ivus', 'ic-adenosine', ...FINISH]));
    // but leaving the pressure at 86 while the flow stays stalled is still a miss: it falls to 74 at 3 minutes
    const slow = run(sc, 5, [...NO_REFLOW, 'ivus', 'ic-adenosine', 'reassess', 'ic-adenosine', ...FINISH]);
    expect(slow.fired).toContain('pressure-falls');
    expect(missed(slow)).toContain('Support the pressure (intracoronary epinephrine or a pressor)');
  });

  it('a drug counts from when it was started, as everywhere in the simulator', () => {
    // epinephrine started exactly 4:00 after the no-reflow: the microvascular drug is on time, the support is late
    const s = run(sc, 5, [...NO_REFLOW, 'reassess', 'reassess', 'ic-epinephrine', 'ivus', 'ic-adenosine', ...FINISH]);
    const r = review(sc, s);
    expect(r.toFix.map((t) => `${t.kind}:${t.label}`)).toEqual(['late:Support the pressure (intracoronary epinephrine or a pressor)']);
    // perfused again after the fall to 74, he is fully awake
    expect(s.vitals.gcs).toBe(15);
  });

  it('an ACT of 212 with eptifibatide started is in range: no heparin top-up is missed', () => {
    const s = run(sc, 5, ['act', 'gp2b3a', 'stent-des', 'ic-epinephrine', 'ivus', 'ic-adenosine', ...FINISH]);
    expect(s.flags['act-low']).toBeDefined();
    expectFullMarks(s);
  });

  it('a stent put in while the ACT is still 212 costs points, checked or not', () => {
    const blind = run(sc, 5, ['stent-des']);
    expect(penalties(blind)).toEqual(['stent-act-low']);
    const ignored = run(sc, 5, ['act', 'stent-des']);
    expect(penalties(ignored)).toEqual(['stent-act-low']);
    // topped up (or bivalirudin or eptifibatide running) first: no penalty
    for (const first of ['heparin', 'bivalirudin', 'gp2b3a']) expect(penalties(run(sc, 5, ['act', first, 'stent-des'])), first).toEqual([]);
  });

  it('another diagnostic angiogram after the stent is a look at the stent in standard views — not the first run\'s occluded artery again', () => {
    const s = run(sc, 5, [...NO_REFLOW, 'ic-epinephrine', 'angio', 'ic-adenosine', ...FINISH]);
    const run2 = s.images.find((r) => r.id === 'angio' && r.minute > 0)!;
    expect(run2.image).toBeUndefined();
    expect(s.log.some((l) => /the stent edges are smooth/.test(l.text))).toBe(true);
    expectFullMarks(s);
    // with no pulse there is no angiogram to take
    let vf = run(sc, 5, NO_REFLOW);
    while (vf.pulse) vf = perform(sc, vf, 'reassess');
    expect(perform(sc, vf, 'angio').counts.angio).toBeUndefined();
  });

  it('a balloon pump holds the pressure once it is in (late support), but opens no microvessels: VF still comes', () => {
    const s = run(sc, 5, [...NO_REFLOW, 'iabp']);
    expect(s.fired).not.toContain('pressure-falls');
    expect(s.log.some((l) => /IABP in from the right femoral artery/.test(l.text))).toBe(true);
    expect(s.fired).toContain('vf');
    const r = review(sc, stop(s));
    expect(r.toFix.find((t) => t.label.startsWith('Support the pressure'))?.kind).toBe('late');
  });

  it('an intracoronary drug pushed during VF treats nothing and is not the microvascular drug', () => {
    let s = run(sc, 5, NO_REFLOW);
    while (s.pulse) s = perform(sc, s, 'reassess');
    for (const drug of ['ic-adenosine', 'ic-verapamil']) {
      const t = perform(sc, s, drug);
      expect(t.log.at(-1)!.text, drug).toMatch(/it has no place in cardiac arrest and changes nothing on the monitor/);
      expect(t.flags['micro-1'], drug).toBeUndefined();
      expect(missed(t), drug).toContain('An intracoronary drug for the microvessels');
    }
  });

  it('intracoronary epinephrine with normal flow and pressure has no indication: a small penalty, for every role', () => {
    for (const role of ROLES) expect(penalties(run(sc, role, ['ic-epinephrine'])), `role ${role}`).toEqual(['epi-no-indication']);
    // after the flow is back too
    expect(penalties(run(sc, 5, [...NO_REFLOW, 'ic-epinephrine', 'ic-adenosine', 'ic-epinephrine']))).toEqual(['epi-no-indication']);
  });

  it('the LV gram, LVEDP and right heart numbers match a large anterior infarct, not a normal heart', () => {
    const s = run(sc, 5, [...NO_REFLOW, 'lv-gram', 'lvedp']);
    const text = s.log.map((l) => l.text).join('\n');
    expect(text).toMatch(/EF about 35 %/);
    expect(text).not.toMatch(/normal wall motion|LVEDP 10/);
    expect(text).toMatch(new RegExp(`LV ${s.vitals.sbp}/30 mmHg: LVEDP 30 mmHg`));
    const rhc = run(sc, 5, [...NO_REFLOW, 'access-venous', 'rhc']);
    expect(rhc.log.some((l) => /PCWP 26 · CO 3.9 L\/min, CI 1.9/.test(l.text))).toBe(true);
  });
});
