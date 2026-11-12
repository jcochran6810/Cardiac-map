import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { STANDARD_PLACEMENT, applyPreset, isStandard, PLACEMENT_PRESETS } from '@/lib/ecg/electrodes';
import { applyPlacement } from '@/lib/ecg/placement';
import { sim } from '@/lib/sim/simulation';
import { newPatient, setRhythm, showRhythm } from '@/lib/rhythm';
import {
  cleanSlate, endQuizStrips, openCase, openCategory, openCondition, openMedication, openProcedure, openStructure, openTool,
  openTreatment, showConditionEcg, showQuizStrip,
} from '@/lib/actions';
import { SCENARIOS, giveDrug, loadScenario, resetCode, toggleCPR, useDefibStore } from '@/lib/sim/defib';
import { drugMods, useMedStore } from '@/store/useMedStore';
import { enterSimulator, leaveSimulator, useSimStore } from '@/store/useSimStore';
import { SCENARIOS as SIM_SCENARIOS } from '@/lib/sim/scenario/scenarios';
import { useAppStore } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { CASE_DATA } from '@/data/caseData';
import { frame, monitor, run } from './helpers';

const med = () => useMedStore.getState();
const defib = () => useDefibStore.getState();
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const reversal = () => applyPreset(PLACEMENT_PRESETS.find((p) => p.id === 'la-ra')!);
/** lead I's view of a dipole pointing to the patient's left: upright with the cables on, upside down with LA and RA swapped */
const leadI = () => sim.engine.project([1, 0, 0], 'I', 0);
const standardLeadI = new ECGEngine('normal-sinus', 72).project([1, 0, 0], 'I', 0);

beforeEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState({ mode: 'learn', compact: false, phone: false, short: false, heart: 'closed', ecg: 'closed', listOpen: true });
  useTimelineStore.setState({ playing: true, speed: 1 });
  useECGStore.setState({ bottomView: 'ecg', electrodeLab: false });
  applyPlacement(STANDARD_PLACEMENT);
  resetCode();
  med().reset(null);
  showRhythm('normal-sinus');
  frame();
});

describe('a new patient starts clean', () => {
  it('a drug given on a condition page does not act on the case study opened next', () => {
    openCondition('avnrt');
    run(5_000);
    med().give('adenosine', 6);
    run(3_000);
    const id = Object.keys(CASE_DATA)[0];
    const c = CASE_DATA[id];
    openCase(id);
    expect(med().next).toBeNull();
    expect(med().given).toHaveLength(0);
    run(80_000);
    expect(monitor()).toBe(`${c.ecgProfile}@${c.heartRate}`);
    expect(med().mods).toBeNull();
    expect(med().log).toHaveLength(0);
  });

  it('an infusion started in Give meds does not convert the defibrillator scenario loaded next', () => {
    openCondition('monomorphic-vt');
    run(5_000);
    // a stable VT (normal blood pressure), whatever the pressure model makes of this rate
    const stable = vi.spyOn(sim.hemo, 'summary').mockReturnValue({ ...sim.hemo.summary(sim.time), sbp: 118, dbp: 76, noOutput: false });
    const plan = med().give('procainamide', 1000);
    stable.mockRestore();
    expect(plan.steps.some((s) => s.profile === 'normal-sinus')).toBe(true);
    run(60_000);
    loadScenario(scenario('vf'));
    for (let i = 0; i < 8 && med().next; i++) { med().skipAhead(); run(2_500); }
    run(40 * 60_000, 500);
    expect(monitor()).toBe('vf@0');
    expect(med().mods).toBeNull();
  });

  it('a rhythm shown for study (a quiz strip, a lesson step) ends the medication session, whoever shows it', () => {
    openCondition('atrial-fibrillation');
    med().give('diltiazem', 20);
    med().give('digoxin', 0.5);
    run(1_000);
    showRhythm('third-degree-avb', 34);
    expect(med().given).toHaveLength(0);
    expect(med().log).toHaveLength(0);
    expect(med().marks).toHaveLength(0);
    expect(med().last).toBeNull();
    expect(med().next).toBeNull();
    // the session still belongs to the page it was opened from
    expect(med().conditionId).toBe('atrial-fibrillation');
    run(3 * 60 * 60_000, 2_000);
    expect(monitor()).toBe('third-degree-avb@34');
    expect(med().mods).toBeNull();
  });

  it('a live change on the same patient is not a new patient', () => {
    openCondition('atrial-fibrillation');
    med().give('diltiazem', 20);
    setRhythm('atrial-fibrillation', 140);
    expect(med().given).toHaveLength(1);
    expect(med().next).not.toBeNull();
  });

  it('the defibrillator\'s delayed drug response does not follow the learner to another condition', () => {
    openCondition('sinus-bradycardia');
    run(5_000);
    giveDrug('atropine');
    run(5_000);
    openCondition('third-degree-av-block');
    run(40_000);
    expect(useECGStore.getState().activeProfileId).toBe('third-degree-avb');
    expect(defib().log.some((l) => /atropine/i.test(l.text))).toBe(false);
  });

  it('a defibrillator scenario\'s heart, vital signs and code record end with its patient', () => {
    loadScenario(scenario('chb'));
    giveDrug('epinephrine');
    run(2_000);
    expect(sim.hemo.baseline).toBe('hfref');
    expect(defib().vitals.spo2).toBe(95);
    openCondition('aortic-stenosis');
    expect(sim.hemo.baseline).toBeNull();
    expect(defib().baseline).toBeNull();
    expect(defib().scenario).toBeNull();
    expect(defib().epiDoses).toBe(0);
    expect(defib().codeStart).toBeNull();
    expect(defib().log).toHaveLength(0);
    expect(defib().vitals.spo2).toBe(97);
    run(10_000);
    // the Wiggers diagram now shows this condition's heart, not the scenario's failing ventricle
    expect(sim.hemo.summary(sim.time).label).toMatch(/aortic stenosis/i);
  });

  it('a scenario is itself a new patient, and keeps what it sets up', () => {
    openCondition('avnrt');
    med().give('adenosine', 6);
    giveDrug('adenosine');
    useDefibStore.setState({ mode: 'manual', energy: 50, sync: true });
    const sc = scenario('chb');
    loadScenario(sc);
    expect(monitor()).toBe('third-degree-avb@34');
    // the trainee gets the device at its defaults, in the mode it was in
    expect(defib()).toMatchObject({ mode: 'manual', energy: 200, sync: false });
    expect(sim.hemo.baseline).toBe('hfref');
    expect(defib().scenario?.id).toBe('chb');
    expect(defib().baseline).toBe('hfref');
    expect(defib().vitals).toEqual({ spo2: sc.spo2, rr: sc.rr, etco2: sc.etco2 });
    expect(defib().adenosineDoses).toBe(0);
    expect(defib().log.map((l) => l.text)).toEqual([`Scenario: ${sc.label}`]);
    expect(med().given).toHaveLength(0);
    run(30_000);
    expect(monitor()).toBe('third-degree-avb@34');
    // an arrest scenario starts its code clock
    loadScenario(scenario('vf'));
    expect(defib().codeStart).toBe(sim.time);
    expect(sim.hemo.baseline).toBeNull();
  });

  it('a simulator case does not inherit a drug response or a failing ventricle from the defibrillator trainer', () => {
    loadScenario(scenario('brady'));
    giveDrug('atropine');
    run(2_000);
    useAppStore.getState().setMode('simulator');
    enterSimulator();
    useSimStore.getState().startScenario('complete-heart-block-field', 2);
    const started = monitor();
    expect(sim.hemo.baseline).toBeNull();
    run(40_000);
    expect(monitor()).toBe(started);
    leaveSimulator();
    useSimStore.getState().closeScenario();
    useAppStore.getState().setMode('learn');
  });

  it('the device stays as it was set (mode, energy, SYNC, trainee view, sound) from one patient to the next', () => {
    useDefibStore.setState({ mode: 'manual', energy: 100, sync: true, trainee: true, sound: true });
    newPatient();
    expect(defib()).toMatchObject({ mode: 'manual', energy: 100, sync: true, trainee: true, sound: true });
    // a lesson: SYNC set on the SVT, a step that shows a normal beat, then back to the SVT for the shock
    showRhythm('normal-sinus', 70);
    showRhythm('avnrt', 190);
    expect(defib()).toMatchObject({ mode: 'manual', energy: 100, sync: true });
    // …but nothing that was being done to the last patient carries on
    useDefibStore.setState({ mode: 'pacer', charge: 'charged', pendingSyncSince: 5, pulseCheck: 'Pulse present' });
    newPatient();
    expect(defib()).toMatchObject({ mode: 'monitor', sync: false, charge: 'idle', pendingSyncSince: null, pulseCheck: null });
    expect(defib().pacer).toMatchObject({ on: false, captured: false, mA: 0 });
  });

  it('CPR, a running pacer and their marks on the tracing end with the patient', () => {
    showRhythm('vf');
    run(1_000);
    toggleCPR();
    run(3_000);
    expect(defib().cpr.on).toBe(true);
    /** the biggest compression mark in the last second of lead II */
    const marks = () => Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(sim.engine.external?.(sim.time - i * 10, 'II') ?? 0)));
    expect(marks()).toBeGreaterThan(0.5);
    const epoch = sim.epoch;
    showRhythm('normal-sinus');
    expect(defib().cpr.on).toBe(false);
    expect(defib().codeStart).toBeNull();
    // the compression marks are gone from the recording, and the tracings are told to redraw
    expect(marks()).toBe(0);
    expect(sim.epoch).toBeGreaterThan(epoch);
  });

  it('what the guided courses call still works: reset(null), showRhythm(id, rate), leaveSimulator()', () => {
    med().reset(null);
    expect(med().conditionId).toBeNull();
    showRhythm('atrial-flutter', 100);
    expect(monitor()).toBe('atrial-flutter@100');
    expect(sim.rewrite).toBe(true);
    // a rhythm with no rate of its own to set ignores the rate
    showRhythm('vf', 90);
    expect(monitor()).toBe('vf@0');
    expect(() => leaveSimulator()).not.toThrow();
  });
});

describe('effects on the same patient keep running', () => {
  it('opening a tool or a library section, or visiting the main menu, does not stop a drug that is acting', () => {
    openCondition('atrial-fibrillation');
    run(2_000);
    med().give('diltiazem', 20);
    run(30_000);
    openTool('ecg');
    openCategory('conditions');
    expect(med().given).toHaveLength(1);
    expect(med().next).not.toBeNull();
    useAppStore.getState().setMode('home');
    run(4 * 60_000, 200);
    useAppStore.getState().setMode('learn');
    run(2 * 60_000, 200);
    expect(useECGStore.getState().activeProfileId).toBe('atrial-fibrillation');
    expect(useTimelineStore.getState().heartRate).toBeLessThan(100);
    expect(med().given).toHaveLength(1);
    expect(med().log.some((l) => /Rate controlled/.test(l.text))).toBe(true);
  });

  it('a push-dose still wears off after a visit to the main menu', () => {
    showRhythm('normal-sinus', 72);
    run(2_000);
    med().give('epinephrine', 0.04);
    run(40_000);
    expect(useTimelineStore.getState().heartRate).toBeGreaterThan(90);
    useAppStore.getState().setMode('home');
    run(1_000);
    useAppStore.getState().setMode('learn');
    run(8 * 60_000, 200);
    expect(monitor()).toBe('normal-sinus@72');
    expect(med().next).toBeNull();
  });

  it('the case simulator takes the monitor: the session ends and the patient goes back to the untreated rhythm', () => {
    openCondition('avnrt');
    run(2_000);
    med().give('adenosine', 6);
    run(60_000);
    expect(monitor()).toBe('normal-sinus@84');
    med().give('procainamide', 1000);
    med().skipAhead();
    run(2_000);
    expect(med().mods).not.toBeNull();
    expect(med().next).not.toBeNull();
    useAppStore.getState().setMode('simulator');
    expect(med().given).toHaveLength(0);
    expect(med().log).toHaveLength(0);
    expect(med().next).toBeNull();
    expect(med().mods).toBeNull();
    expect(monitor()).toBe('avnrt@180');
    run(60 * 60_000, 2_000);
    expect(monitor()).toBe('avnrt@180');
  });

  it('"Practice it in the case simulator" on a condition page hands back the untreated patient as well', () => {
    openCondition('avnrt');
    run(2_000);
    med().give('adenosine', 6);
    run(60_000);
    expect(monitor()).toBe('normal-sinus@84');
    // the button's own order: save the workspace, start the case, then change screens
    const sc = SIM_SCENARIOS.find((s) => s.conditionId === 'avnrt')!;
    enterSimulator();
    useSimStore.getState().startScenario(sc.id, sc.roles[0]);
    useAppStore.getState().setMode('simulator');
    expect(med().given).toHaveLength(0);
    leaveSimulator();
    useSimStore.getState().closeScenario();
    useAppStore.getState().setMode('learn');
    // not sinus rhythm with no dose on record: the AVNRT patient, untreated
    expect(monitor()).toBe('avnrt@180');
  });

  it('entering the simulator with no drugs given leaves the monitor alone', () => {
    showRhythm('atrial-flutter', 100);
    useAppStore.getState().setMode('simulator');
    expect(monitor()).toBe('atrial-flutter@100');
  });

  it('the tracing keeps showing what the drugs do to the intervals on the main menu and the course list', () => {
    showRhythm('normal-sinus', 72);
    run(5_000);
    const plain = sim.engine.intervals(sim.time).qrs!;
    med().give('procainamide', 1000);
    for (let i = 0; i < 3; i++) { med().skipAhead(); run(2_000); }
    expect(med().mods?.qrsWiden).toBeGreaterThan(1.1);
    for (const mode of ['home', 'courses'] as const) {
      useAppStore.getState().setMode(mode);
      expect(drugMods(), mode).toEqual(med().mods);
      run(5_000);
      // the beats drawn while away from the Learn view are the patient's: still widened
      expect(sim.engine.intervals(sim.time).qrs!, mode).toBeGreaterThan(plain * 1.1);
    }
    // only the case simulator's patient has been given none of it
    useAppStore.getState().setMode('simulator');
    expect(drugMods()).toBeNull();
  });
});

describe('the quiz borrows the monitor only for its strips', () => {
  it('closing a quiz that showed no strip leaves the drugs acting', () => {
    openCondition('avnrt');
    run(2_000);
    med().give('adenosine', 6);
    run(3_000);
    endQuizStrips();
    expect(med().given).toHaveLength(1);
    expect(med().next).not.toBeNull();
    run(60_000);
    expect(monitor()).toBe('normal-sinus@84');
  });

  it('a strip is another patient; closing the quiz brings back the patient from before any drug', () => {
    openCondition('avnrt');
    run(2_000);
    med().give('adenosine', 6);
    run(60_000);
    expect(monitor()).toBe('normal-sinus@84');
    showQuizStrip('vt', 170);
    expect(monitor()).toBe('vt@170');
    expect(med().given).toHaveLength(0);
    showQuizStrip('atrial-flutter', 150);
    endQuizStrips();
    // not "sinus rhythm" with no dose on record: the AVNRT patient, untreated
    expect(monitor()).toBe('avnrt@180');
    // with no drugs given, the rhythm the learner had on the monitor, at its rate
    showRhythm('lbbb', 60);
    showQuizStrip('vf');
    showQuizStrip('vf');
    endQuizStrips();
    expect(monitor()).toBe('lbbb@60');
  });

  it('a topic opened from the quiz stays on the monitor when the quiz closes', () => {
    openCondition('avnrt');
    showQuizStrip('vt', 170);
    openCondition('atrial-fibrillation');
    const af = monitor();
    endQuizStrips();
    expect(monitor()).toBe(af);
    // …and a strip shown after it hands the monitor back to that topic
    showQuizStrip('torsades');
    endQuizStrips();
    expect(monitor()).toBe(af);
  });

  it('…even when the topic has the same rhythm as the strip (a VT strip, then the VT page from its links)', () => {
    openCondition('avnrt');
    showQuizStrip('vt', 170);
    openCondition('monomorphic-vt');
    run(2_000);
    const vt = monitor();
    endQuizStrips();
    expect(monitor()).toBe(vt);
    expect(med().conditionId).toBe('monomorphic-vt');
  });
});

describe('"Show the ECG" on a condition page', () => {
  it('does not end a code under way on the defibrillator', () => {
    openCondition('atrial-fibrillation');
    loadScenario(scenario('vf'));
    toggleCPR();
    run(5_000);
    showConditionEcg('atrial-fibrillation');
    expect(monitor()).toBe('vf@0');
    expect(defib().cpr.on).toBe(true);
    expect(defib().scenario?.id).toBe('vf');
    expect(defib().log.length).toBeGreaterThan(1);
    expect(useAppStore.getState().ecg).toBe('open');
    expect(useECGStore.getState().bottomView).toBe('ecg');
    // nor one without a scenario: CPR on a rhythm the instructor put up
    resetCode();
    openCondition('atrial-fibrillation');
    showRhythm('pea', 40);
    toggleCPR();
    showConditionEcg('atrial-fibrillation');
    expect(monitor()).toBe('pea@40');
    expect(defib().cpr.on).toBe(true);
  });

  it('does not end the drugs still acting', () => {
    openCondition('avnrt');
    run(2_000);
    med().give('adenosine', 6);
    run(60_000);
    showConditionEcg('avnrt');
    expect(monitor()).toBe('normal-sinus@84');
    expect(med().given).toHaveLength(1);
  });

  it('puts the pattern back when nobody is being treated, and keeps the rate the learner set when it is already up', () => {
    openCondition('avnrt');
    showRhythm('vt', 170);
    showConditionEcg('avnrt');
    expect(monitor()).toBe('avnrt@180');
    expect(med().conditionId).toBe('avnrt');
    expect(useAppStore.getState().ecg).toBe('open');
    setRhythm('avnrt', 200);
    showConditionEcg('avnrt');
    expect(monitor()).toBe('avnrt@200');
  });
});

describe('ECG cables go back to their standard sites', () => {
  it('a reversal made in the electrode lab changes the engine\'s leads', () => {
    expect(leadI()).toBeCloseTo(standardLeadI, 6);
    applyPlacement(reversal());
    expect(leadI()).toBeCloseTo(-standardLeadI, 1);
    expect(isStandard(useECGStore.getState().placement)).toBe(false);
  });

  const opens: [string, () => void][] = [
    ['a condition', () => openCondition('inferior-stemi')],
    ['a case study', () => openCase(Object.keys(CASE_DATA)[0])],
    ['a library section', () => openCategory('conditions')],
    ['a structure', () => openStructure('mitral-valve')],
    ['a procedure', () => openProcedure('cardioversion')],
    ['a drug card', () => openMedication('adenosine')],
    ['the 12-lead tool', () => openTool('ecg')],
    ['the 3D heart tool', () => openTool('heart')],
    ['the defibrillator tool', () => openTool('defib')],
    ['Give meds', () => openTreatment('avnrt')],
    ['a rhythm shown for study (a lesson, a quiz strip, a simulator case)', () => showRhythm('vt', 170)],
    ['a defibrillator scenario', () => loadScenario(scenario('svt-stable'))],
  ];
  for (const [what, open] of opens) {
    it(`when ${what} is opened — also after an unanswered mystery reversal`, () => {
      useECGStore.getState().setElectrodeLab(true);
      applyPlacement(reversal(), true);
      const epoch = sim.epoch;
      open();
      expect(isStandard(useECGStore.getState().placement)).toBe(true);
      expect(useECGStore.getState().placementHidden).toBe(false);
      expect(leadI()).toBeCloseTo(standardLeadI, 6);
      // every tracing redraws with the leads back in place
      expect(sim.epoch).toBeGreaterThan(epoch);
    });
  }

  it('a case in the simulator is read on correctly placed cables, and so is the monitor it hands back', () => {
    openTool('lab');
    applyPlacement(reversal(), true);
    useAppStore.getState().setMode('simulator');
    enterSimulator();
    useSimStore.getState().startScenario('stemi-anterior-field', 2);
    expect(isStandard(useECGStore.getState().placement)).toBe(true);
    expect(leadI()).toBeCloseTo(standardLeadI, 6);
    applyPlacement(reversal());
    leaveSimulator();
    useSimStore.getState().closeScenario();
    useAppStore.getState().setMode('learn');
    expect(isStandard(useECGStore.getState().placement)).toBe(true);
    expect(leadI()).toBeCloseTo(standardLeadI, 6);
  });

  it('the electrode lab that was open when the simulator took over stays shut afterwards', () => {
    openTool('lab');
    useAppStore.getState().setMode('simulator');
    enterSimulator();
    useSimStore.getState().startScenario('stemi-anterior-field', 2);
    expect(useECGStore.getState().electrodeLab).toBe(false);
    leaveSimulator();
    useSimStore.getState().closeScenario();
    useAppStore.getState().setMode('home');
    expect(useECGStore.getState().electrodeLab).toBe(false);
  });

  it('pushing a drug closes the electrode lab and puts its cables back: the effect is watched on a true 12-lead', () => {
    openCondition('avnrt');
    useECGStore.getState().setElectrodeLab(true);
    applyPlacement(reversal(), true);
    med().give('adenosine', 6);
    expect(useECGStore.getState().electrodeLab).toBe(false);
    expect(isStandard(useECGStore.getState().placement)).toBe(true);
    expect(leadI()).toBeCloseTo(standardLeadI, 6);
  });

  it('the electrode lab itself opens with the cables as the learner left them', () => {
    applyPlacement(reversal());
    openTool('lab');
    expect(isStandard(useECGStore.getState().placement)).toBe(false);
    expect(useECGStore.getState().electrodeLab).toBe(true);
    expect(leadI()).toBeCloseTo(-standardLeadI, 1);
  });

  it('nothing redraws when the cables were already in place', () => {
    const epoch = sim.epoch;
    cleanSlate();
    expect(sim.epoch).toBe(epoch);
  });
});

describe('a new topic or tool opens in a known state', () => {
  it('cleanSlate: cables on, electrode lab and defibrillator put away, real time — and the drawers, the patient and the drugs untouched', () => {
    openCondition('atrial-fibrillation');
    med().give('diltiazem', 20);
    useAppStore.setState({ heart: 'open', ecg: 'full', listOpen: false });
    useECGStore.setState({ bottomView: 'defib', electrodeLab: true });
    useTimelineStore.setState({ speed: 0.25, playing: false });
    applyPlacement(reversal(), true);
    cleanSlate();
    const ecg = useECGStore.getState();
    expect(ecg.electrodeLab).toBe(false);
    expect(ecg.bottomView).toBe('ecg');
    expect(isStandard(ecg.placement)).toBe(true);
    expect(useTimelineStore.getState().speed).toBe(1);
    expect(useTimelineStore.getState().playing).toBe(false);
    const app = useAppStore.getState();
    expect([app.heart, app.ecg, app.listOpen, app.mode]).toEqual(['open', 'full', false, 'learn']);
    expect(med().given).toHaveLength(1);
    expect(monitor()).toBe('atrial-fibrillation@112');
  });

  for (const tool of ['electrode lab', 'defibrillator'] as const) {
    it(`a library section opened after the ${tool} does not bring it back`, () => {
      useAppStore.setState({ compact: true, phone: true });
      openTool(tool === 'defibrillator' ? 'defib' : 'lab');
      useAppStore.getState().setMode('home');
      openCategory('procedures');
      expect(useECGStore.getState().electrodeLab).toBe(false);
      expect(useECGStore.getState().bottomView).toBe('ecg');
      expect(useAppStore.getState().ecg).toBe('closed');
    });

    it(`an item opened after the ${tool} does not bring it back`, () => {
      useAppStore.setState({ compact: true, phone: true });
      for (const open of [() => openStructure('aortic-valve'), () => openProcedure('defibrillation'), () => openMedication('amiodarone'), () => openCondition('avnrt')]) {
        openTool(tool === 'defibrillator' ? 'defib' : 'lab');
        useAppStore.getState().setEcg('closed');
        open();
        expect(useECGStore.getState().electrodeLab).toBe(false);
        expect(useECGStore.getState().bottomView).toBe('ecg');
      }
    });
  }

  it('the 3D heart tool puts the electrode lab and the defibrillator away too', () => {
    openTool('defib');
    openTool('heart');
    expect(useECGStore.getState().bottomView).toBe('ecg');
    openTool('lab');
    openTool('heart');
    expect(useECGStore.getState().electrodeLab).toBe(false);
  });

  it('each tool still opens on its own view', () => {
    openTool('defib');
    expect(useECGStore.getState().bottomView).toBe('defib');
    expect(useAppStore.getState().ecg).toBe('full');
    openTool('wiggers');
    expect(useECGStore.getState().bottomView).toBe('wiggers');
    openTool('lab');
    expect([useECGStore.getState().bottomView, useECGStore.getState().electrodeLab]).toEqual(['ecg', true]);
    openTool('ecg');
    expect([useECGStore.getState().bottomView, useECGStore.getState().electrodeLab]).toEqual(['ecg', false]);
  });

  it('reading about a structure keeps the pressure curves that were open beside it', () => {
    openTool('wiggers');
    useAppStore.getState().setEcg('open');
    openStructure('mitral-valve');
    expect(useECGStore.getState().bottomView).toBe('wiggers');
  });

  it('slow motion from "Watch one heartbeat" ends when something else is opened', () => {
    const opens: (() => void)[] = [
      () => openCategory('conditions'), () => openTool('ecg'), () => openTool('heart'), () => openCondition('avnrt'),
      () => openTreatment('avnrt'), () => openCase(Object.keys(CASE_DATA)[0]),
    ];
    for (const open of opens) {
      useTimelineStore.getState().setSpeed(0.25);
      open();
      expect(useTimelineStore.getState().speed).toBe(1);
    }
    // …but not when the learner taps a structure to read about it while watching
    useTimelineStore.getState().setSpeed(0.25);
    openStructure('mitral-valve');
    expect(useTimelineStore.getState().speed).toBe(0.25);
  });

  it('Give meds on a phone held sideways shows the form, not a full-screen 12-lead', () => {
    useAppStore.setState({ compact: true, phone: true, short: true, ecg: 'closed', heart: 'closed' });
    openTreatment('avnrt');
    expect(useAppStore.getState().ecg).toBe('closed');
    expect(useAppStore.getState().rightPanelTab).toBe('treat');
    expect(useECGStore.getState().bottomView).toBe('ecg');
    // …also when the 12-lead was filling the screen before
    useAppStore.setState({ ecg: 'full' });
    openTreatment('atrial-fibrillation');
    expect(useAppStore.getState().ecg).toBe('closed');
  });

  it('Give meds on every other screen opens with the 12-lead beside the form', () => {
    for (const shape of [{ compact: false, phone: false }, { compact: true, phone: false }, { compact: true, phone: true }]) {
      useAppStore.setState({ ...shape, short: false, ecg: 'closed' });
      openTreatment('avnrt');
      expect(useAppStore.getState().ecg).toBe('open');
      expect(useAppStore.getState().rightPanelTab).toBe('treat');
    }
  });
});
