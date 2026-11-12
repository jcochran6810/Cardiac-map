import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sim } from '@/lib/sim/simulation';
import { resetCode, vitalsAt } from '@/lib/sim/defib';
import { answerRead, perform, start, unavailableReason } from '@/lib/sim/scenario/engine';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { ARREST_ETCO2, arrestEtco2, caseBaseline, enterSimulator, leaveSimulator, monitorVitals, staleEtco2, useSimStore } from '@/store/useSimStore';
import { run, runScenario } from './helpers';

/** A step that reassesses until the patient arrests (a case whose arrest comes with time) */
const UNTIL_ARREST = 'until-arrest';

interface Seen { s: SimState; etco2: number; stale: boolean }

/**
 * Play a run as the case simulator's store does and keep what its monitor shows after each step: the EtCO₂ (with
 * the store's "left from before the arrest" bookkeeping, which starts from the case's first state) and the state
 */
function monitored(id: string, role: LearningLevel, steps: string[]): Seen[] {
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

const ventilated = (s: SimState) => 'ventilated' in s.flags || 'airway' in s.flags;

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
  /** How each case with an arrest gets there (paramedic): from the start, or from a pulse */
  const ARRESTS: [string, string[]][] = [
    ['vf-arrest-field', []],
    ['pea-arrest-field', []],
    // an unsynchronized shock on a rhythm with a pulse: VF
    ['stable-vt-field', ['primary', 'pads', 'defib']],
    ['svt-unstable-field', ['primary', 'pads', 'defib']],
    ['af-rvr-field', ['primary', 'pads', 'defib']],
    ['stemi-anterior-field', ['primary', 'pads', 'transport-pci', UNTIL_ARREST]],
    ['hyperkalemia-dialysis-field', ['primary', 'monitor', UNTIL_ARREST]],
    ['beta-blocker-overdose-field', ['primary', 'monitor', UNTIL_ARREST]],
  ];
  /** Then capnography: before anything else, after compressions, breaths, both (either order), an advanced airway */
  const THEN = [['capno'], ['cpr', 'capno'], ['bvm', 'capno'], ['bvm', 'cpr', 'capno'], ['cpr', 'bvm', 'capno'], ['cpr', 'airway', 'capno']];

  /**
   * Where they still disagree, and the file each fix is in (none of them in this test's files). Each is checked to
   * disagree still, so a fix that lands fails this test until its entry here is removed.
   */
  const KNOWN_GAPS: { id: string; matches: (id: string, x: Seen) => boolean; fix: string }[] = [
    {
      id: 'default line without breaths',
      matches: (_, x) => x.stale && !ventilated(x.s),
      fix: 'engine.ts, default capnography line: still 16 (or 6) with no breaths; it should follow arrestEtco2 (3 with no breaths)',
    },
    {
      id: 'VF case',
      matches: (id) => id === 'vf-arrest-field',
      fix: 'vfArrest.ts: its capnography line says 18 or 9 while its vitals keep the 14 it starts with; it should set its arrest EtCO₂ in its vitals and report that',
    },
    {
      id: '12 when the pulse goes',
      matches: (id) => id === 'hyperkalemia-dialysis-field' || id === 'beta-blocker-overdose-field',
      fix: 'hyperkalemiaField.ts and betaBlockerField.ts set EtCO₂ 12 when the pulse goes, which the default capnography line never says',
    },
  ];

  it('each case, each order of compressions, breaths and capnography', () => {
    const gaps = new Map(KNOWN_GAPS.map((g) => [g.id, [] as { steps: string; agrees: boolean }[]]));
    for (const [id, path] of ARRESTS) {
      for (const then of THEN) {
        const steps = `${id}: ${[...path, ...then].join(', ')}`;
        const x = monitored(id, 2, [...path, ...then]).at(-1)!;
        expect(x.s.pulse, steps).toBe(false);
        const agrees = capnoLine(x.s) === x.etco2;
        const gap = KNOWN_GAPS.find((g) => g.matches(id, x));
        if (gap) gaps.get(gap.id)!.push({ steps, agrees });
        else expect(`monitor ${x.etco2}, capnography line ${capnoLine(x.s)}`, steps).toBe(`monitor ${x.etco2}, capnography line ${x.etco2}`);
      }
    }
    for (const g of KNOWN_GAPS) {
      const runs = gaps.get(g.id)!;
      expect(runs.length, `known gap "${g.id}" no longer happens: remove it`).toBeGreaterThan(0);
      const fixed = runs.filter((r) => r.agrees).map((r) => r.steps);
      expect(fixed, `known gap "${g.id}" (${g.fix}) now agrees in these runs: narrow or remove it`).toEqual([]);
    }
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
