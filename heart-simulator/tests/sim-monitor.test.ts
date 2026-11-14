import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sim } from '@/lib/sim/simulation';
import { resetCode, vitalsAt } from '@/lib/sim/defib';
import { answerRead, perform, start, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { ARREST_ETCO2, arrestEtco2 } from '@/lib/sim/scenario/kit';
import { caseBaseline, enterSimulator, leaveSimulator, monitorVitals, staleEtco2, useSimStore } from '@/store/useSimStore';
import { run, runScenario } from './helpers';

/** A step that reassesses until the patient arrests (a case whose arrest comes with time) */
const UNTIL_ARREST = 'until-arrest';

interface Seen { s: SimState; etco2: number; stale: boolean }

/**
 * Play a run as the case simulator's store does and keep what its monitor shows after each step: the EtCO₂ (with
 * the store's "left from before the arrest" bookkeeping, which starts from the case's first state) and the state
 */
function monitored(id: string, role: LearningLevel, steps: readonly string[]): Seen[] {
  const sc = SCENARIO_BY_ID[id];
  const seen: Seen[] = [];
  let s = start(sc, role);
  let stale = false;
  const show = (next: SimState) => {
    stale = staleEtco2(s, next, stale);
    s = next;
    seen.push({ s, etco2: monitorVitals(s, stale).etco2, stale });
  };
  while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
  const act = (step: string) => {
    const why = unavailableReason(sc, s, step);
    if (why) throw new Error(`${id}: ${step} unavailable at ${s.minute} min: ${why}`);
    show(perform(sc, s, step));
    while (s.pendingRead) show(answerRead(sc, s, s.pendingRead.answer));
  };
  for (const step of steps) {
    if (step !== UNTIL_ARREST) act(step);
    else for (let i = 0; i < 40 && s.pulse && !s.ended; i++) act('reassess');
  }
  return seen;
}

/** The number the last capnography line in the log ends on ("EtCO₂ 58 mmHg on the first breaths, then 26 mmHg …" → 26) */
const capnoLine = (s: SimState) => {
  const l = [...s.log].reverse().find((x) => /^EtCO₂ \d+ mmHg/.test(x.text));
  return l ? Number(l.text.match(/\d+(?= mmHg)/g)!.at(-1)) : null;
};

describe('EtCO₂ on the case monitor in cardiac arrest (follow-up 15)', () => {
  it('a case that runs the arrest is shown its own number: no breaths yet, the first breaths, ventilated CPR', () => {
    // the PEA case: compressions alone carry no breath to measure; the first breaths wash out the CO₂ she could not
    // breathe off; ventilated CPR then reads 26. The monitor used to show 18 as soon as compressions began.
    const seen = monitored('pea-arrest-field', 2, ['cpr', 'pads', 'pulse-check', 'bvm', 'capno', 'cpr']);
    const after = (n: number) => seen[n];
    expect(after(0)).toMatchObject({ etco2: 3, stale: false });
    expect(after(3).etco2).toBe(58);
    expect(after(4).etco2).toBe(26);
    expect(capnoLine(after(4).s)).toBe(26); // "58 on the first breaths, then 26 as compressions go on"
    expect(after(5).etco2).toBe(26);
    for (const x of seen) if (!x.s.pulse) expect(x.etco2, x.s.performed.at(-1)!.id).toBe(x.s.vitals.etco2);
  });

  it('a number the case sets for the arrest, when the pulse goes or later, is the one shown', () => {
    const s = runScenario(SCENARIO_BY_ID['stable-vt-field'], 2, ['primary']);
    // the pulse goes and the case gives the arrest a number of its own
    const own = { ...s, pulse: false, vitals: { ...s.vitals, etco2: 4 } };
    expect(staleEtco2(s, own, false)).toBe(false);
    expect(monitorVitals(own, false).etco2).toBe(4);
    // the pulse goes and the case leaves the number from before: stale, until the case sets one
    const left = { ...s, pulse: false };
    expect(staleEtco2(s, left, false)).toBe(true);
    expect(staleEtco2(left, { ...left, minute: left.minute + 1 }, true)).toBe(true);
    const later = { ...left, vitals: { ...left.vitals, etco2: 20 } };
    expect(staleEtco2(left, later, true)).toBe(false);
    expect(staleEtco2(later, { ...later, minute: later.minute + 1 }, false)).toBe(false);
  });

  it('an arrest from a pulse that the case gives no number for: never the perfusing number from before, which would look like ROSC', () => {
    // stable VT: an unsynchronized shock causes VF, and the case leaves the EtCO₂ at his 36 from before
    const id = 'stable-vt-field';
    const shocked = monitored(id, 2, ['primary', 'pads', 'defib']).at(-1)!;
    expect(shocked.s.pulse).toBe(false);
    expect(shocked.s.vitals.etco2).toBe(36);
    // nobody has given him a breath: there is nothing breathed out to measure
    expect(shocked).toMatchObject({ stale: true, etco2: ARREST_ETCO2.noBreaths });
    // compressions alone move less air than the dead space: still almost nothing, never a number that reads like
    // adequate CPR (10 or more) — the trap would be to take it for good compressions, or the PEA case's for futility
    const compressions = monitored(id, 2, ['primary', 'pads', 'defib', 'cpr']).at(-1)!;
    expect(compressions).toMatchObject({ stale: true, etco2: ARREST_ETCO2.noBreaths });
    expect(compressions.etco2).toBeLessThan(10);
    // breaths without compressions: almost no CO₂ reaches the lungs; breaths with compressions: what the blood carries
    expect(monitored(id, 2, ['primary', 'pads', 'defib', 'bvm']).at(-1)).toMatchObject({ stale: true, etco2: ARREST_ETCO2.noFlow });
    const cpr = monitored(id, 2, ['primary', 'pads', 'defib', 'bvm', 'cpr']).at(-1)!;
    expect(cpr).toMatchObject({ stale: true, etco2: ARREST_ETCO2.cpr });
    expect(monitored(id, 2, ['primary', 'pads', 'defib', 'cpr', 'airway']).at(-1)).toMatchObject({ stale: true, etco2: ARREST_ETCO2.cpr });
    for (const x of [shocked, compressions, cpr]) expect(x.etco2).toBe(arrestEtco2(x.s));
    // with a pulse again the monitor shows the case's numbers
    const back = perform(SCENARIO_BY_ID[id], cpr.s, 'defib');
    expect(back.pulse).toBe(true);
    expect(staleEtco2(cpr.s, back, true)).toBe(false);
    expect(monitorVitals(back, false).etco2).toBe(back.vitals.etco2);
  });

  it('with a pulse the monitor always shows the case\'s number', () => {
    const s = runScenario(SCENARIO_BY_ID['stable-vt-field'], 2, ['primary']);
    expect(monitorVitals(s, true).etco2).toBe(s.vitals.etco2);
    expect(staleEtco2(null, s, true)).toBe(false);
  });
});

describe('the monitor and the capnography line give the same EtCO₂ in every arrest', () => {
  /** How each case with an arrest gets there: from the start, or from a pulse (the cath lab's as the cardiologist) */
  const ARRESTS: [string, LearningLevel, string[]][] = [
    ['vf-arrest-field', 2, []],
    ['pea-arrest-field', 2, []],
    // an unsynchronized shock on a rhythm with a pulse: VF
    ['stable-vt-field', 2, ['primary', 'pads', 'defib']],
    ['svt-unstable-field', 2, ['primary', 'pads', 'defib']],
    ['af-rvr-field', 2, ['primary', 'pads', 'defib']],
    ['stemi-anterior-field', 2, ['primary', 'pads', 'transport-pci', UNTIL_ARREST]],
    ['hyperkalemia-dialysis-field', 2, ['primary', 'monitor', UNTIL_ARREST]],
    ['beta-blocker-overdose-field', 2, ['primary', 'monitor', UNTIL_ARREST]],
    // the cath lab: reperfusion VF, VF with no-reflow left untreated, tamponade and anaphylaxis left untreated (PEA)
    ['stemi-cathlab', 5, ['consent', 'heparin', 'p2y12', 'fentanyl', 'timeout', 'access', 'cath-tiger', 'angio', 'guide-ebu', 'reposition',
      'view-rao-cranial', 'wire-workhorse', 'balloon-predil', 'stent-des']],
    ['no-reflow-cathlab', 5, ['act', 'heparin', 'stent-des', UNTIL_ARREST]],
    ['perforation-cathlab', 5, [UNTIL_ARREST]],
    ['contrast-cathlab', 5, ['consent', 'timeout', 'access', 'cath-tiger', 'angio', UNTIL_ARREST]],
    // the right ventricle that fails on scene (the case gives the arrest no EtCO₂ of its own)
    ['pulmonary-embolism-field', 2, ['primary', UNTIL_ARREST]],
    // the emergency department: the doctor's runs, and the nurse's where the arrest is hers to run
    ['stemi-walk-in-ed', 7, ['primary', UNTIL_ARREST]],
    ['stemi-walk-in-ed', 6, ['triage', 'ecg12', 'notify-physician', UNTIL_ARREST]],
    ['pulmonary-embolism-lysis-ed', 7, ['ems-handoff', UNTIL_ARREST]],
    ['aortic-dissection-ed', 7, [UNTIL_ARREST]],
    ['tamponade-ed', 7, ['perfusion', 'lungs', 'rsi']],
    ['hyperkalemia-ed', 7, ['primary', UNTIL_ARREST]],
    ['vf-arrest-ed', 7, []],
    ['vf-arrest-ed', 6, ['call-help']],
    ['scape-ed', 7, [UNTIL_ARREST]],
    ['unstable-af-cardioversion-ed', 7, ['ems-handoff', 'defib']],
  ];
  /** Then capnography: before anything else, after compressions, breaths, both (either order), an advanced airway */
  const THEN = [['capno'], ['cpr', 'capno'], ['bvm', 'capno'], ['bvm', 'cpr', 'capno'], ['cpr', 'bvm', 'capno'], ['cpr', 'airway', 'capno']];

  it('each case, each order of compressions, breaths and capnography', () => {
    for (const [id, role, path] of ARRESTS) {
      // only the orders the role can play (the ER nurse places no advanced airway)
      for (const then of THEN.filter((t) => t.every((step) => INTERVENTION_BY_ID[step].roles.includes(role)))) {
        const steps = `${id}: ${[...path, ...then].join(', ')}`;
        const x = monitored(id, role, [...path, ...then]).at(-1)!;
        expect(x.s.pulse, steps).toBe(false);
        expect(`monitor ${x.etco2}, capnography line ${capnoLine(x.s)}`, steps).toBe(`monitor ${x.etco2}, capnography line ${x.etco2}`);
      }
    }
  });

  it('the engine\'s own capnography line reads the shared rule: 3 with no breaths, 6 with breaths alone, 16 with breaths and CPR', () => {
    const id = 'stable-vt-field';
    const line = (then: string[]) => capnoLine(monitored(id, 2, ['primary', 'pads', 'defib', ...then]).at(-1)!.s);
    expect(line(['capno'])).toBe(ARREST_ETCO2.noBreaths);
    expect(line(['cpr', 'capno'])).toBe(ARREST_ETCO2.noBreaths);
    expect(line(['bvm', 'capno'])).toBe(ARREST_ETCO2.noFlow);
    expect(line(['bvm', 'cpr', 'capno'])).toBe(ARREST_ETCO2.cpr);
    expect(line(['cpr', 'airway', 'capno'])).toBe(ARREST_ETCO2.cpr);
  });

  it('the hyperkalemia and beta-blocker arrests give no number of their own: the shared rule, never a fixed 12', () => {
    for (const id of ['hyperkalemia-dialysis-field', 'beta-blocker-overdose-field']) {
      const seen = monitored(id, 2, ['primary', 'monitor', UNTIL_ARREST, 'bvm', 'cpr', 'capno']);
      const arrest = seen.find((x) => !x.s.pulse)!;
      expect(arrest, id).toMatchObject({ stale: true, etco2: ARREST_ETCO2.noBreaths });
      for (const x of seen) if (!x.s.pulse) expect(x.etco2, id).not.toBe(12);
      expect(seen.at(-1)!.etco2, id).toBe(ARREST_ETCO2.cpr);
      expect(capnoLine(seen.at(-1)!.s), id).toBe(ARREST_ETCO2.cpr);
    }
  });
});

describe('the VF case\'s EtCO₂ follows the shared rule (bystander compressions, then the crew\'s breaths and CPR)', () => {
  const sc = SCENARIO_BY_ID['vf-arrest-field'];
  const lastMonitorLine = (s: SimState) => [...s.log].reverse().find((l) => l.who === 'monitor')!.text;

  it('starts at 3: compressions with no breaths give nothing breathed out to measure — the line says why, not "push harder"', () => {
    const s = runScenario(sc, 2, ['capno']);
    expect(s.vitals.etco2).toBe(ARREST_ETCO2.noBreaths);
    expect(lastMonitorLine(s)).toBe('EtCO₂ 3 mmHg: almost no waveform.');
    expect(s.log.at(-1)).toMatchObject({ who: 'you', text: expect.stringMatching(/^Nobody has given him a breath yet/) });
    // the crew's compressions alone change nothing
    expect(runScenario(sc, 2, ['cpr']).vitals.etco2).toBe(ARREST_ETCO2.noBreaths);
  });

  it('with breaths it measures CPR quality: low on the bystander\'s compressions, adequate on the crew\'s', () => {
    const bagged = runScenario(sc, 2, ['bvm', 'capno']);
    expect(bagged.vitals.etco2).toBe(ARREST_ETCO2.noFlow);
    expect(lastMonitorLine(bagged)).toMatch(/^EtCO₂ 6 mmHg: the staff member's compressions are moving too little blood — take over: push harder and faster\.$/);
    for (const steps of [['bvm', 'cpr', 'capno'], ['cpr', 'bvm', 'capno'], ['cpr', 'airway', 'capno']]) {
      const s = runScenario(sc, 2, steps);
      expect(s.vitals.etco2, steps.join()).toBe(ARREST_ETCO2.cpr);
      expect(lastMonitorLine(s), steps.join()).toBe('EtCO₂ 16 mmHg during compressions: CPR is adequate.');
    }
  });

  it('the monitor shows the same number at every step of the arrest, and the jump at ROSC', () => {
    const seen = monitored('vf-arrest-field', 2, ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'capno', 'bvm', 'cpr', 'defib']);
    for (const x of seen) if (!x.s.pulse) expect(x.etco2, x.s.performed.at(-1)!.id).toBe(arrestEtco2(x.s));
    expect(seen.at(-1)!.s.pulse).toBe(true);
    expect(seen.at(-1)!.etco2).toBe(38);
  });
});

describe('the heart behind a VT case\'s waveforms follows the case\'s numbers (follow-up 21)', () => {
  it('a VT with a pulse and a systolic of 90 or more is a stable VT: a normal heart, not cardiogenic shock', () => {
    const sc = SCENARIO_BY_ID['stable-vt-field'];
    const s = runScenario(sc, 2, ['primary']);
    expect(caseBaseline(s)).toBe('normal');
    // diltiazem drops him to 76/44: now he is unstable, and the VT's own heart (shock) is right
    const low = runScenario(sc, 2, ['primary', 'iv', 'diltiazem']);
    expect(low.vitals.sbp).toBeLessThan(90);
    expect(caseBaseline(low)).toBeNull();
    // the pulseless VT a delay leads to has no output whatever the baseline
    const pulseless = { ...s, pulse: false, rhythm: { profile: 'pvt', hr: 190 } };
    expect(caseBaseline(pulseless)).toBeNull();
  });

  it('every other rhythm keeps its own heart — a failing ventricle on support is still a failing ventricle', () => {
    const shock = runScenario(SCENARIO_BY_ID['shock-cathlab'], 5, ['consent']);
    expect(caseBaseline({ ...shock, vitals: { ...shock.vitals, sbp: 104 } })).toBeNull();
    const svt = runScenario(SCENARIO_BY_ID['svt-unstable-field'], 2, ['primary']);
    expect(caseBaseline(svt)).toBeNull();
  });
});

describe('the case simulator store drives the shared monitor', () => {
  const store = () => useSimStore.getState();

  beforeEach(() => {
    vi.restoreAllMocks();
    useTimelineStore.setState({ playing: true, speed: 1 });
    resetCode();
    useAppStore.getState().setMode('simulator');
    enterSimulator();
  });
  afterEach(() => {
    leaveSimulator();
    store().closeScenario();
    useAppStore.getState().setMode('learn');
  });

  it('the monitor shows the PEA case\'s EtCO₂ of 3 during compressions without breaths, not a made-up 18', () => {
    store().startScenario('pea-arrest-field', 2);
    store().act('cpr');
    expect(vitalsAt(sim.time).etco2).toBe(3);
    store().act('bvm');
    expect(vitalsAt(sim.time).etco2).toBe(58);
  });

  it('after an arrest from a pulse it shows the engine\'s arrest numbers until the case gives its own', () => {
    store().startScenario('stable-vt-field', 2);
    expect(vitalsAt(sim.time).etco2).toBe(36);
    store().act('pads');
    store().act('defib');
    expect(store().state!.pulse).toBe(false);
    expect(vitalsAt(sim.time).etco2).toBe(ARREST_ETCO2.noBreaths);
    // compressions without a breath: still almost nothing to measure
    store().act('cpr');
    expect(vitalsAt(sim.time).etco2).toBe(ARREST_ETCO2.noBreaths);
    store().act('bvm');
    expect(vitalsAt(sim.time).etco2).toBe(ARREST_ETCO2.cpr);
    // "try again": a fresh case starts from its own numbers
    store().startScenario('stable-vt-field', 2);
    expect(vitalsAt(sim.time).etco2).toBe(36);
  });

  it('a stable VT case runs on a normal heart, an unstable one on the VT\'s failing heart, and closing the case puts it back', () => {
    store().startScenario('stable-vt-field', 2);
    run(12_000);
    expect(sim.hemo.baseline).toBe('normal');
    expect(sim.hemo.summary(sim.time).label).toBe('Normal');
    store().act('iv');
    store().act('diltiazem');
    run(12_000);
    expect(sim.hemo.baseline).toBeNull();
    expect(sim.hemo.summary(sim.time).label).toBe('Cardiogenic shock');
    store().closeScenario();
    expect(sim.hemo.baseline).toBeNull();
  });
});
