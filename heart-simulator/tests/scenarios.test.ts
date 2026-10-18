import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { SCENARIOS, SCENARIO_BY_ID, scenariosFor } from '@/lib/sim/scenario/scenarios';
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED, runScenario as run } from './helpers';

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
  'stemi-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'act', 'reassess', 'callout', 'reassess', 'defib', 'ecg12', 'hemostasis'],
    4: ['consent', 'iv', 'heparin', 'p2y12', 'timeout', 'act', 'reassess', 'callout', 'reassess', 'defib', 'ecg12', 'hemostasis', 'handoff'],
    5: ['consent', 'heparin', 'p2y12', 'timeout', 'access', 'angio', 'reposition', 'pci', 'defib', 'ecg12', 'echo', 'handoff'],
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

  it('teammates do the other roles: the tech sees the cardiologist open the artery', () => {
    const s = run(sc, 3, IDEAL['stemi-cathlab'][3]!);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-setup-for-tech', 'md-access', 'md-angio', 'damped', 'md-reposition', 'md-pci', 'reperfusion-vf']));
    expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
  });

  it('a tech who misses the damped waveform loses the callout points', () => {
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'act', 'reassess', 'reassess']);
    expect(s.fired).toContain('md-reposition');
    expect(s.log.some((l) => /who's watching the waveform/.test(l.text))).toBe(true);
    const r = review(sc, stop(s));
    expect(r.toFix.some((t) => t.kind === 'missed' && /damped/.test(t.label))).toBe(true);
  });

  it('the cardiologist cannot stent before the angiogram, and PCI without heparin is a critical error', () => {
    let s = run(sc, 5, ['consent', 'timeout', 'pci']);
    expect(s.counts.pci).toBeUndefined();
    s = run(sc, 5, ['consent', 'timeout', 'access', 'angio', 'reposition', 'pci']);
    expect(s.penalties.map((p) => p.id)).toContain('pci-no-heparin');
  });

  it('reperfusion VF kills the patient if nobody shocks it', () => {
    let s = run(sc, 5, ['consent', 'heparin', 'p2y12', 'timeout', 'access', 'angio', 'reposition', 'pci']);
    expect(s.pulse).toBe(false);
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });
});
