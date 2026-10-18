import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { SCENARIOS, SCENARIO_BY_ID, scenariosFor } from '@/lib/sim/scenario/scenarios';
import type { LearningLevel } from '@/store/useAppStore';
import { CATH_IMAGES } from '@/data/cathImages';
import { UNTIL_ARRIVED, readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');

/** A correct run for every scenario and every role it is written for */
const IDEAL: Record<string, Partial<Record<LearningLevel, string[]>>> = {
  'stemi-anterior-field': {
    1: ['primary', 'opqrst', 'sample', 'vitals', 'als', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', ...R(2), 'aed', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'pads', 'aspirin', 'iv', 'stemi-alert', 'ask-pde5', 'nitro', 'transport-pci', ...R(2), 'defib', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  },
  'stemi-inferior-rv-field': {
    1: ['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'ecg-right', 'aspirin', 'iv', 'stemi-alert', 'atropine', 'fluid', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'complete-heart-block-field': {
    2: ['primary', 'pads', 'nibp', 'iv', 'atropine', 'pace', 'pulse-check', 'fentanyl', 'sample', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'svt-unstable-field': {
    2: ['primary', 'pads', 'nibp', 'iv', 'sedation', 'cardiovert', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff'],
  },
  'vf-arrest-field': {
    1: ['als', 'cpr', 'aed', 'cpr', 'bvm', 'aed', 'bvm', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
    2: ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'capno', 'bvm', 'cpr', 'defib',
      'bvm', 'ecg12', 'pressor', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'stemi-inferior-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-jl4', 'cath-jr4', 'guide-jr4', 'view-rca-lao', 'wire-workhorse', 'balloon-predil',
      'callout', 'temp-wire', 'stent-des', 'ecg12', 'hemostasis'],
    4: ['consent', 'iv', 'heparin', 'p2y12', 'timeout', 'act', ...R(4), 'callout', 'atropine', 'fluid', 'reassess', 'ecg12', 'hemostasis', 'handoff'],
    5: ['consent', 'heparin', 'p2y12', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'guide-jr4', 'view-rca-lao', 'wire-workhorse',
      'balloon-predil', 'atropine', 'fluid', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'ffr-cathlab': {
    3: ['prep', 'transducer', 'monitor', 'timeout', 'cath-tiger', 'view-lao-caudal', 'view-rao-cranial', 'view-rao-caudal', 'view-rca-lao',
      'radial-cocktail', 'act', 'guide-ebu', 'ffr-equalize', 'ffr', 'ivus', 'stent-des', 'balloon-nc', 'hemostasis'],
    4: ['consent', 'iv', 'timeout', 'sedation', 'reassess', 'radial-cocktail', 'heparin', 'act', 'ic-nitro', 'adenosine-iv-ffr', 'reassess', 'p2y12',
      ...R(2), 'hemostasis', 'handoff'],
    5: ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'radial-cocktail', 'heparin', 'guide-ebu', 'ffr-equalize', 'ic-nitro', 'adenosine-iv-ffr',
      'ffr', 'ivus', 'p2y12', 'stent-des', 'balloon-nc', 'final-angio', 'handoff'],
  },
  'shock-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'rhc', 'impella', 'perfusion', 'guide-ebu', 'stent-des', 'ecg12'],
    4: ['iv', 'pressor', 'o2-nrb', 'consent', 'timeout', 'reassess', 'heparin', 'act', 'cangrelor', 'perfusion', ...R(4), 'ecg12', 'handoff'],
    5: ['consent', 'o2-nrb', 'pressor', 'timeout', 'access-femoral', 'access-venous', 'rhc', 'heparin', 'impella', 'cangrelor', 'cath-jl4', 'angio',
      'guide-ebu', 'view-rao-cranial', 'wire-workhorse', 'balloon-predil', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'perforation-cathlab': {
    3: ['callout', 'pericardiocentesis', 'stent-covered', 'hemostasis'],
    4: ['callout', 'fluid', 'call-surgery', ...R(2), 'act', 'hemostasis', 'handoff'],
    5: ['balloon-tamponade', 'call-surgery', 'fluid', 'echo', 'pericardiocentesis', 'stent-covered', 'final-angio', 'handoff'],
  },
  'contrast-cathlab': {
    3: ['prep', 'transducer', 'monitor', 'timeout', 'cath-tiger', 'stop-contrast', 'callout', 'o2-nrb', 'call-help', 'hemostasis'],
    4: ['consent', 'iv', 'timeout', 'reassess', 'callout', 'epi-im', 'fluid', 'o2-nrb', 'albuterol', 'diphenhydramine', 'steroid', 'hemostasis', 'handoff'],
    5: ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'stop-contrast', 'epi-im', 'fluid', 'o2-nrb', 'albuterol', 'diphenhydramine', 'steroid',
      'handoff'],
  },
  'stemi-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger', 'guide-ebu', 'callout', 'view-rao-cranial', 'wire-workhorse',
      'balloon-predil', 'stent-des', 'defib', 'balloon-nc', 'ecg12', 'hemostasis'],
    4: ['consent', 'iv', 'heparin', 'p2y12', 'fentanyl', 'timeout', 'radial-cocktail', 'act', ...R(2), 'callout', ...R(2), 'fentanyl',
      'reassess', 'defib', 'ecg12', 'ic-nitro', 'hemostasis', 'handoff'],
    5: ['consent', 'heparin', 'p2y12', 'fentanyl', 'timeout', 'access', 'cath-tiger', 'angio', 'guide-ebu', 'reposition', 'view-rao-cranial',
      'wire-workhorse', 'balloon-predil', 'stent-des', 'defib', 'balloon-nc', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
};

describe('scenario library', () => {
  it('registers every scenario once, each with an ideal run for every role it is written for', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const sc of SCENARIOS) {
      expect(SCENARIO_BY_ID[sc.id]).toBe(sc);
      for (const role of sc.roles) expect(IDEAL[sc.id]?.[role], `${sc.id} role ${role}`).toBeDefined();
    }
    for (const role of [1, 2, 3, 4, 5] as LearningLevel[]) expect(scenariosFor(role).length).toBeGreaterThan(0);
  });

  it('only refers to interventions, rhythms and conditions that exist', () => {
    for (const sc of SCENARIOS) {
      if (sc.conditionId) expect(CONDITIONS[sc.conditionId], sc.conditionId).toBeDefined();
      expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
      for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `${sc.id} respond ${id}`).toBeDefined();
      for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `${sc.id} harm ${id}`).toBeDefined();
      for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `${sc.id} timing ${id}`).toBeDefined();
      for (const role of sc.roles) {
        const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
        for (const c of criticalsFor(sc, role)) {
          if (typeof c.done === 'function') continue;
          // at least one way to satisfy each critical item must be in the learner's scope
          expect(c.done.some((id) => scope.has(id)), `${sc.id} role ${role}: ${c.id}`).toBe(true);
        }
      }
    }
  });

  it('every rhythm a scenario can reach is a real ECG profile', () => {
    for (const sc of SCENARIOS) {
      for (const [role, steps] of Object.entries(IDEAL[sc.id])) {
        run(sc, Number(role) as LearningLevel, steps!, (s) => {
          expect(resolveProfile(s.rhythm.profile).id, `${sc.id}: ${s.rhythm.profile}`).toBe(s.rhythm.profile);
        });
      }
    }
  });
});

describe('the learner reads the tracings', () => {
  it('no monitor or event line names the rhythm or the diagnosis', () => {
    const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
    for (const sc of SCENARIOS) {
      for (const [role, steps] of Object.entries(IDEAL[sc.id])) {
        const s = run(sc, Number(role) as LearningLevel, steps!);
        for (const l of s.log) if (l.who === 'monitor') expect(l.text, `${sc.id}: ${l.text}`).not.toMatch(giveaway);
      }
    }
  });
});

describe('ideal runs end by themselves with full marks', () => {
  for (const sc of SCENARIOS) {
    for (const role of sc.roles) {
      it(`${sc.id} — role ${role}`, () => {
        const s = run(sc, role, IDEAL[sc.id]![role]!);
        expect(s.ended?.reason).toBe('complete');
        expect(s.pulse).toBe(true);
        const r = review(sc, s);
        expect(r.toFix).toEqual([]);
        expect(r.penaltyPoints).toBe(0);
        expect(r.percent).toBe(100);
        expect(r.grade).toBe('Excellent');
        for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      });
    }
  }
});

describe('inferior STEMI with RV infarction', () => {
  const sc = SCENARIO_BY_ID['stemi-inferior-rv-field'];

  it('nitroglycerin crashes the blood pressure and is a critical error', () => {
    const s = run(sc, 2, ['primary', 'vitals', 'iv', 'nitro']);
    expect(s.vitals.sbp).toBe(74);
    expect(s.penalties.map((p) => p.id)).toContain('nitro-rv');
    expect(s.log.some((l) => l.who === 'monitor' && /74\/44/.test(l.text))).toBe(true);
  });

  it('V4R reports the measurement, not the diagnosis', () => {
    const s = run(sc, 2, ['ecg12', 'ecg-right']);
    expect(s.log.at(-1)!.text).toBe('V4R: 1.5 mm ST elevation.');
  });

  it('complete heart block develops if the crew lingers, and atropine reverses it', () => {
    let s = run(sc, 2, ['primary', 'vitals', 'iv', 'opqrst', 'sample', 'ecg12', 'lungs', 'perfusion']);
    expect(s.rhythm.profile).toBe('inferior-stemi-chb');
    expect(s.rhythm.hr).toBe(40);
    expect(s.vitals.sbp).toBeLessThan(90);
    s = perform(sc, s, 'atropine');
    expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 66 });
  });

  it('for an EMT, the paramedic intercept treats the block', () => {
    const s = run(sc, 1, IDEAL['stemi-inferior-rv-field'][1]!);
    expect(s.fired).toEqual(expect.arrayContaining(['chb', 'als-arrives', 'als-treats-block']));
    expect(s.rhythm.profile).toBe('inferior-stemi');
  });

  it('an EMT who helps with her own nitroglycerin is penalised', () => {
    const s = run(sc, 1, ['primary', 'nitro-assist']);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-assist-rv']);
    expect(s.vitals.sbp).toBe(74);
  });
});

describe('complete heart block', () => {
  const sc = SCENARIO_BY_ID['complete-heart-block-field'];

  it('atropine does not work; pacing does', () => {
    let s = run(sc, 2, ['pads', 'iv', 'atropine']);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 34 });
    s = perform(sc, s, 'pace');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
  });

  it('lidocaine suppresses the escape rhythm and is a critical error', () => {
    const s = run(sc, 2, ['iv', 'lidocaine']);
    expect(s.rhythm.hr).toBe(22);
    expect(s.penalties[0]).toMatchObject({ id: 'lidocaine-escape', severity: 'critical' });
    expect(review(sc, stop(s)).grade).toBe('Unsafe');
  });

  it('mechanical capture must be confirmed after pacing starts', () => {
    const s = run(sc, 2, ['pulse-check', 'pace']);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /mechanical capture/.test(t.label))).toBe(true);
  });
});

describe('unstable SVT', () => {
  const sc = SCENARIO_BY_ID['svt-unstable-field'];

  it('an unsynchronised shock with a pulse causes VF and is penalised once', () => {
    const s = run(sc, 2, ['pads', 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.penalties.map((p) => p.id)).toEqual(['shock-with-pulse']);
    expect(s.penalties[0].points).toBe(20);
  });

  it('adenosine 12 mg converts it too, with no sedation item needed', () => {
    const s = run(sc, 2, ['primary', 'pads', 'nibp', 'iv', 'adenosine6', 'adenosine12', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.rhythm.profile).toBe('normal-sinus');
    const r = review(sc, s);
    expect(r.percent).toBe(100);
    expect(r.toFix).toEqual([]);
  });

  it('cardioverting an awake patient without sedation costs points', () => {
    const s = run(sc, 2, ['pads', 'cardiovert']);
    expect(s.penalties.map((p) => p.id)).toEqual(['no-sedation']);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /Sedation/.test(t.label))).toBe(true);
  });
});

describe('VF cardiac arrest', () => {
  const sc = SCENARIO_BY_ID['vf-arrest-field'];

  it('dies without defibrillation', () => {
    let s = start(sc, 2);
    for (let i = 0; i < 15 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('epinephrine before the first shock is a minor error', () => {
    const s = run(sc, 2, ['cpr', 'io', 'epinephrine']);
    expect(s.penalties.map((p) => p.id)).toEqual(['epi-before-shock']);
  });

  it('a 12-lead is not possible during CPR', () => {
    const s = run(sc, 2, ['ecg12']);
    expect(s.minute).toBe(0);
    expect(s.counts.ecg12).toBeUndefined();
  });

  it('the 12-lead after ROSC shows the STEMI that caused the arrest', () => {
    const steps = IDEAL['vf-arrest-field'][2]!;
    const s = run(sc, 2, steps.slice(0, steps.indexOf('ecg12') + 1));
    expect(s.pulse).toBe(true);
    expect(s.log.some((l) => l.who === 'fto' && /^Correct\..*anterior STEMI/.test(l.text))).toBe(true);
  });
});

describe('STEMI in the cath lab', () => {
  const sc = SCENARIO_BY_ID['stemi-cathlab'];
  const TECH_TO_GUIDE = ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger'];

  it('the tech hands what the cardiologist asks for, and the procedure moves on with each device', () => {
    const s = run(sc, 3, IDEAL['stemi-cathlab'][3]!);
    expect(s.fired).toEqual(expect.arrayContaining([
      'rn-setup-for-tech', 'md-access', 'diag-ask', 'diag-got', 'md-angio', 'guide-got', 'md-guide', 'damped', 'md-reposition',
      'view-got', 'md-wire', 'md-predil', 'md-stent', 'reperfusion-vf', 'nc-got', 'md-postdil', 'md-final',
    ]));
    expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
    expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
    expect(s.reads.map((r) => r.answer)).toEqual(['angio-lad-prox-occlusion', 'hemo-damped', 'angio-timi3', 'reperfused-anterior']);
  });

  it('the wrong device gets a word from the operator and costs points; the right one moves things on', () => {
    let s = run(sc, 3, [...TECH_TO_GUIDE, 'guide-jr4']);
    expect(s.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/right-coronary guide/) });
    expect(s.penalties.map((p) => p.id)).toEqual(['wrong-guide']);
    expect(s.flags.guide).toBeUndefined();
    s = perform(sc, s, 'guide-ebu');
    expect(s.flags.guide).toBeDefined();
  });

  it('a guide opened ahead of the request counts at once', () => {
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'guide-ebu', 'timeout', 'act', 'cath-tiger']);
    expect(s.fired).toContain('guide-got');
    expect(s.flags.damped).toBeDefined();
  });

  it('when the tech never hands it, the operator gets it after 3 minutes and the item is missed', () => {
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'act', 'reassess', 'reassess']);
    expect(s.fired).toContain('diag-fallback');
    expect(s.fired).toContain('md-angio');
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /Tiger/.test(t.label))).toBe(true);
  });

  it('opening a stent before there is a wire is a minor error', () => {
    const s = run(sc, 3, ['prep', 'stent-des']);
    expect(s.penalties.map((p) => p.id)).toEqual(['opened-early']);
  });

  it('the tech and the nurse read the damped pressure; a tech who misses it loses the callout points', () => {
    const s = run(sc, 3, [...TECH_TO_GUIDE, 'guide-ebu', 'reassess']);
    expect(s.reads.find((r) => r.kind === 'hemo')).toMatchObject({ answer: 'hemo-damped' });
    expect(s.log.some((l) => /who's watching the waveform/.test(l.text))).toBe(true);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /damped/.test(t.label))).toBe(true);
  });

  it('the nurse chooses the drugs the cardiologist asks for', () => {
    const s = run(sc, 4, ['consent', 'iv', 'heparin', 'p2y12', 'timeout', 'ic-verapamil']);
    expect(s.log.at(-1)!.text).toMatch(/radial cocktail through the sheath/);
    expect(s.penalties.map((p) => p.id)).toEqual(['wrong-cocktail']);
  });

  it('the cardiologist needs access, a catheter, a guide and a wire, in that order', () => {
    let s = run(sc, 5, ['consent', 'timeout', 'stent-des']);
    expect(s.counts['stent-des']).toBeUndefined();
    s = run(sc, 5, ['consent', 'timeout', 'access', 'angio']);
    expect(s.counts.angio).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/diagnostic catheter/);
    s = run(sc, 5, ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'wire-workhorse']);
    expect(s.counts['wire-workhorse']).toBeUndefined();
    s = perform(sc, s, 'guide-ebu');
    s = perform(sc, s, 'wire-workhorse');
    expect(s.counts['wire-workhorse']).toBeUndefined(); // the guide is wedged: back it out first
    s = perform(sc, s, 'reposition');
    s = perform(sc, s, 'wire-workhorse');
    expect(s.flags.wired).toBeDefined();
    expect(s.penalties.map((p) => p.id)).toContain('pci-no-heparin');
  });

  it('a right guide for an LAD culprit costs points', () => {
    const s = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'angio', 'guide-jr4']);
    expect(s.penalties.map((p) => p.id)).toEqual(['right-guide-for-lad']);
  });

  it('the cardiologist sizes the stent from the measurements', () => {
    const steps = IDEAL['stemi-cathlab'][5]!;
    const toPredil = readAfter(steps.slice(0, steps.indexOf('balloon-predil') + 1), 'angio', 'angio-lad-prox-occlusion');
    const s = run(sc, 5, [...toPredil, 'read:stent-3.5x23'], undefined, 'manual');
    expect(s.reads.at(-1)).toMatchObject({ kind: 'sizing', answer: 'stent-3.5x28', verdict: 'partial' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 2, text: expect.stringMatching(/^Stent sizing at/) });
  });

  it('reperfusion VF kills the patient if nobody shocks it', () => {
    const steps = IDEAL['stemi-cathlab'][5]!;
    let s = run(sc, 5, steps.slice(0, steps.indexOf('stent-des') + 1));
    expect(s.pulse).toBe(false);
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });
});

describe('inferior STEMI in the cath lab', () => {
  const sc = SCENARIO_BY_ID['stemi-inferior-cathlab'];
  const MD_TO_BALLOON = IDEAL['stemi-inferior-cathlab'][5]!.slice(0, IDEAL['stemi-inferior-cathlab'][5]!.indexOf('balloon-predil') + 1);

  it('nitroglycerin crashes the pressure of an RV infarct', () => {
    const s = run(sc, 5, ['nitro']);
    expect(s.vitals.sbp).toBe(72);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-rv']);
  });

  it('a left guide for the RCA costs points; reflow brings the reflex, and the learner must name it', () => {
    let s = run(sc, 5, ['consent', 'heparin', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'guide-ebu']);
    expect(s.penalties.map((p) => p.id)).toEqual(['left-guide-for-rca']);
    s = run(sc, 5, readAfter(MD_TO_BALLOON, 'angio', 'angio-rca-occlusion'), undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-bezold' });
    expect(s.rhythm.hr).toBe(38);
    expect(s.vitals.sbp).toBe(68);
  });

  it('atropine brings the rate back, fluid the pressure; untreated, it gets worse', () => {
    let s = run(sc, 5, [...MD_TO_BALLOON, 'atropine']);
    expect(s.rhythm.hr).toBe(72);
    expect(s.flags.recovered).toBeUndefined();
    s = perform(sc, s, 'fluid');
    expect(s.flags.recovered).toBeDefined();
    const untreated = run(sc, 5, [...MD_TO_BALLOON, 'reassess', 'reassess']);
    expect(untreated.fired).toContain('reflex-worse');
    expect(untreated.vitals.sbp).toBe(58);
  });

  it('the nurse must choose the drug: adenosine for a rate of 38 is wrong', () => {
    const steps = IDEAL['stemi-inferior-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('callout') + 1), 'adenosine6']);
    expect(s.penalties.map((p) => p.id)).toContain('wrong-atropine');
    expect(s.log.some((l) => l.who === 'operator' && /Atropine, 1 milligram/.test(l.text))).toBe(true);
  });
});

describe('FFR-guided PCI', () => {
  const sc = SCENARIO_BY_ID['ffr-cathlab'];
  const MD = IDEAL['ffr-cathlab'][5]!;
  const upTo = (id: string) => MD.slice(0, MD.indexOf(id));

  it('no reading before the wire is equalised; without hyperaemia the reading is a resting value', () => {
    let s = run(sc, 5, [...upTo('ffr-equalize'), 'ffr']);
    expect(s.counts.ffr).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/Equalise the pressure wire/);
    s = perform(sc, run(sc, 5, upTo('adenosine-iv-ffr')), 'ffr');
    expect(s.pendingRead).toMatchObject({ kind: 'physiology', answer: 'ffr-no-hyperemia' });
  });

  it('a stent before the physiology is a major error', () => {
    const s = run(sc, 5, [...upTo('ffr-equalize'), 'wire-workhorse', 'stent-des']);
    expect(s.penalties.map((p) => p.id)).toContain('stent-before-ffr');
  });

  it('the radial spasm must be treated before the guide will pass', () => {
    let s = run(sc, 5, [...upTo('radial-cocktail'), 'heparin', 'guide-ebu']);
    expect(s.counts['guide-ebu']).toBeUndefined();
    s = perform(sc, s, 'radial-cocktail');
    s = perform(sc, s, 'guide-ebu');
    expect(s.flags.guide).toBeDefined();
  });

  it('the nurse who pushes the SVT dose of adenosine for hyperaemia is corrected', () => {
    const steps = IDEAL['ffr-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('adenosine-iv-ffr')), 'adenosine6']);
    expect(s.penalties.map((p) => p.id)).toEqual(expect.arrayContaining(['svt-adenosine', 'wrong-hyperemia']));
    expect(s.log.some((l) => /Not the SVT dose/.test(l.text))).toBe(true);
  });
});

describe('cardiogenic shock in the cath lab', () => {
  const sc = SCENARIO_BY_ID['shock-cathlab'];

  it('fluid floods the lungs; the right heart numbers ask for a read', () => {
    let s = run(sc, 5, ['fluid']);
    expect(s.penalties.map((p) => p.id)).toEqual(['fluid-in-shock']);
    expect(s.vitals.spo2).toBe(85);
    s = run(sc, 5, ['consent', 'timeout', 'access-femoral', 'access-venous', 'rhc'], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'hemo', answer: 'hemo-cardiogenic' });
  });

  it('support after the stent misses the support item', () => {
    const steps = IDEAL['shock-cathlab'][5]!.filter((id) => id !== 'impella');
    const s = stop(run(sc, 5, [...steps.slice(0, steps.indexOf('final-angio')), 'impella']));
    expect(review(sc, s).toFix.some((t) => t.kind === 'missed' && /Mechanical support/.test(t.label))).toBe(true);
  });

  it('the nurse gives IV cangrelor, not tablets, to a drowsy shocked patient', () => {
    const steps = IDEAL['shock-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('cangrelor')), 'p2y12']);
    expect(s.penalties.map((p) => p.id)).toContain('wrong-p2y12');
  });
});

describe('coronary perforation', () => {
  const sc = SCENARIO_BY_ID['perforation-cathlab'];

  it('opens with the perforation to read, and a tamponade follows', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-perforation' });
    s = run(sc, 5, ['read:clin-perforation', 'balloon-tamponade', 'call-surgery', 'fluid'], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-tamponade' });
    expect(s.vitals.sbp).toBe(76);
  });

  it('no needle without the echo; left alone, the tamponade arrests the heart', () => {
    let s = run(sc, 5, ['balloon-tamponade', 'pericardiocentesis']);
    expect(s.counts.pericardiocentesis).toBeUndefined();
    s = run(sc, 5, ['balloon-tamponade', ...R(4)]);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    s = perform(sc, perform(sc, s, 'echo'), 'pericardiocentesis');
    expect(s.pulse).toBe(true);
  });

  it('a drug-eluting stent does not seal a hole', () => {
    const s = run(sc, 5, ['balloon-tamponade', 'stent-des']);
    expect(s.penalties.map((p) => p.id)).toEqual(['des-for-perforation']);
  });
});

describe('contrast reaction', () => {
  const sc = SCENARIO_BY_ID['contrast-cathlab'];
  const MD = IDEAL['contrast-cathlab'][5]!;
  const toReaction = MD.slice(0, MD.indexOf('angio') + 1);

  it('the first injection brings the reaction, and the learner must name it', () => {
    const s = run(sc, 5, toReaction, undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-contrast' });
    expect(s.vitals.sbp).toBe(76);
  });

  it('antihistamine before epinephrine is a major error; more contrast during the reaction too', () => {
    const s = run(sc, 5, [...toReaction, 'diphenhydramine', 'view-rao-caudal']);
    expect(s.penalties.map((p) => p.id)).toEqual(['antihistamine-first', 'contrast-during-reaction']);
  });

  it('without epinephrine she arrests', () => {
    const s = run(sc, 5, [...toReaction, ...R(3)]);
    expect(s.pulse).toBe(false);
  });

  it('premedicating for a shellfish allergy is a minor error', () => {
    const s = run(sc, 5, ['steroid']);
    expect(s.penalties.map((p) => p.id)).toEqual(['premed-for-shellfish']);
  });
});

describe('the cath lab monitor', () => {
  it('shows the arterial line once the sheath is in and zeroed, damped while the guide is wedged', async () => {
    const { attached } = await import('@/store/useSimStore');
    const sc = SCENARIO_BY_ID['stemi-cathlab'];
    let s = run(sc, 3, ['prep', 'transducer', 'pads']);
    expect(attached(s).art).toBe(false);
    s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger', 'guide-ebu']);
    expect(attached(s).art).toBe('damped');
    expect(s.vitals.sbp).toBe(82);
    s = perform(sc, s, 'callout');
    expect(attached(s).art).toBe(true);
    expect(s.vitals.sbp).toBe(136);
  });
});

describe('real angiograms in the cath lab cases', () => {
  const CULPRIT_READS = {
    'stemi-cathlab': 'angio-lad-prox-occlusion', 'stemi-inferior-cathlab': 'angio-rca-occlusion',
    'ffr-cathlab': 'angio-lad-intermediate', 'shock-cathlab': 'angio-lad-prox-occlusion',
  } as const;

  it('the run shows the image, says what the image does not show, and waits for the read', () => {
    for (const [id, answer] of Object.entries(CULPRIT_READS)) {
      const sc = SCENARIO_BY_ID[id];
      const steps = IDEAL[id][5]!;
      let s = run(sc, 5, steps.slice(0, steps.indexOf('angio')));
      s = perform(sc, s, 'angio');
      expect(s.images.at(-1), id).toMatchObject({ id: 'angio', image: sc.images!.angio });
      expect(s.pendingRead, id).toMatchObject({ kind: 'angio', answer, prompt: expect.stringMatching(/coronary run/), run: s.images.length });
      expect(s.log.some((l) => /coronary: .*Imaging screen/.test(l.text)), id).toBe(true);
    }
  });

  it('the final run shows the same patient\'s artery opened up, and is read too', () => {
    for (const id of ['stemi-cathlab', 'stemi-inferior-cathlab', 'shock-cathlab']) {
      const sc = SCENARIO_BY_ID[id];
      const pre = CATH_IMAGES[sc.images!.angio!]!;
      const post = CATH_IMAGES[sc.images!['final-angio']!]!;
      expect(post.source, `${id}: before and after come from the same article`).toBe(pre.source);
      const s = run(sc, 5, IDEAL[id][5]!);
      expect(s.images.find((r) => r.id === 'final-angio'), id).toMatchObject({ image: sc.images!['final-angio'] });
      expect(s.reads.find((r) => r.answer === 'angio-timi3'), id).toMatchObject({ kind: 'angio', verdict: 'correct' });
    }
  });

  it('the tech and the nurse read the run the operator records', () => {
    for (const role of [3, 4] as const) {
      const sc = SCENARIO_BY_ID['stemi-cathlab'];
      const s = run(sc, role, IDEAL['stemi-cathlab'][role]!);
      expect(s.reads.find((r) => r.kind === 'angio'), `role ${role}`).toMatchObject({ answer: 'angio-lad-prox-occlusion', verdict: 'correct' });
    }
  });

  it('the FFR case shows the real console screen and asks what it means', () => {
    const sc = SCENARIO_BY_ID['ffr-cathlab'];
    for (const role of [3, 5] as const) {
      const steps = IDEAL['ffr-cathlab'][role]!;
      const s = perform(sc, run(sc, role, steps.slice(0, steps.indexOf('ffr'))), 'ffr');
      expect(s.images.at(-1), `role ${role}`).toMatchObject({ id: 'ffr', image: 'ffr-significant' });
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'physiology', answer: 'ffr-significant', run: s.images.length });
      // the arterial line reads the same aortic pressure as the console: mean 98
      expect(Math.round((s.vitals.sbp + 2 * s.vitals.dbp) / 3), `role ${role}`).toBe(98);
    }
  });

  it('a thrombus read of the anterior STEMI run is partly right', () => {
    const sc = SCENARIO_BY_ID['stemi-cathlab'];
    const steps = IDEAL['stemi-cathlab'][5]!;
    let s = perform(sc, run(sc, 5, steps.slice(0, steps.indexOf('angio'))), 'angio');
    while (s.pendingRead && s.pendingRead.kind !== 'angio') s = answerRead(sc, s, s.pendingRead.answer);
    s = answerRead(sc, s, 'angio-thrombus');
    expect(s.reads.at(-1)).toMatchObject({ kind: 'angio', verdict: 'partial' });
  });
});
