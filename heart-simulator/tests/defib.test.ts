import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrubTo, sim } from '@/lib/sim/simulation';
import { showRhythm } from '@/lib/rhythm';
import * as D from '@/lib/sim/defib';
import type { HemoSummary } from '@/lib/physiology/hemodynamics';
import { useAppStore } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useMedStore } from '@/store/useMedStore';
import { frame, monitor, run } from './helpers';

const rate = () => useTimelineStore.getState().heartRate;
const defib = () => D.useDefibStore.getState();
const logged = () => defib().log.map((l) => l.text);
/** every "it could go either way" in the trainer goes the likely way */
const lucky = () => vi.spyOn(Math, 'random').mockReturnValue(0.01);
const unlucky = () => vi.spyOn(Math, 'random').mockReturnValue(0.99);

const NORMAL: HemoSummary = { sbp: 120, dbp: 78, map: 92, edv: 120, esv: 50, sv: 70, ef: 58, co: 5, lvedp: 9, laMean: 9, label: 'Normal', noOutput: false };
/** the patient's pressures, set directly: these tests are about what the device makes of them */
const pressures = (p: Partial<HemoSummary>) => vi.spyOn(sim.hemo, 'summary').mockReturnValue({ ...NORMAL, ...p });

/** show a rhythm and let it run long enough for the pressures to settle */
function patient(profileId: string, hr?: number) {
  showRhythm(profileId, hr);
  run(12_000);
}

/** charge and deliver a synchronized shock */
function cardiovert() {
  D.setMode('manual');
  if (!defib().sync) D.toggleSync();
  D.charge();
  run(7_000);
  expect(defib().charge).toBe('charged');
  D.shock();
  run(4_000);
}

beforeEach(() => {
  vi.restoreAllMocks();
  useAppStore.getState().setMode('learn');
  useTimelineStore.setState({ playing: true, speed: 1 });
  D.resetCode();
  D.setMode('monitor');
  // a patient with a pulse, unless the test says otherwise
  pressures({});
});

describe('delayed responses belong to the rhythm they were aimed at', () => {
  it('diltiazem given before a successful cardioversion does not bring the AF back', () => {
    patient('atrial-fibrillation', 150);
    lucky();
    D.giveDrug('diltiazem');
    run(5_000);
    cardiovert();
    expect(monitor()).toBe('normal-sinus@88');
    run(90_000);
    expect(monitor()).toBe('normal-sinus@88');
    expect(logged().some((t) => /after diltiazem/.test(t))).toBe(false);
  });

  it('amiodarone given before a successful cardioversion does not report that the VT persists', () => {
    patient('vt', 150);
    D.giveDrug('amiodarone');
    lucky();
    cardiovert();
    expect(monitor()).toBe('normal-sinus@88');
    unlucky();
    run(70_000);
    expect(monitor()).toBe('normal-sinus@88');
    expect(logged().some((t) => /VT persists/.test(t))).toBe(false);
  });

  it('adenosine does not stop the heart of a patient whose SVT was already cardioverted', () => {
    patient('avnrt', 180);
    lucky();
    D.giveDrug('adenosine');
    D.instructorRhythm('normal-sinus', 80);
    run(15_000);
    expect(monitor()).toBe('normal-sinus@80');
    expect(logged().some((t) => /Adenosine: transient|SVT terminated/.test(t))).toBe(false);
  });

  it('the sinus rhythm that follows adenosine does not replace a rhythm the patient went into meanwhile', () => {
    patient('avnrt', 180);
    lucky();
    D.giveDrug('adenosine');
    run(5_000);
    expect(monitor()).toBe('asystole@0');
    D.instructorRhythm('vf');
    run(10_000);
    expect(monitor()).toBe('vf@0');
  });

  it('adenosine in atrial flutter: the rate comes back afterwards, unless something else changed it meanwhile', () => {
    patient('atrial-flutter', 150);
    D.giveDrug('adenosine');
    run(5_000);
    expect(monitor()).toBe('atrial-flutter@75');
    run(10_000);
    expect(monitor()).toBe('atrial-flutter@150');

    D.resetCode();
    patient('atrial-flutter', 150);
    D.giveDrug('adenosine');
    run(5_000);
    D.instructorRhythm('atrial-flutter', 100);
    run(10_000);
    expect(monitor()).toBe('atrial-flutter@100');
  });

  it('a shock that worked does not overwrite a rhythm that changed in the two seconds after it', () => {
    patient('vf');
    D.setMode('manual');
    D.charge();
    run(7_000);
    lucky();
    D.shock();
    D.instructorRhythm('asystole');
    run(4_000);
    expect(monitor()).toBe('asystole@0');
    expect(logged().some((t) => /Shock terminated/.test(t))).toBe(false);
  });

  it('the pause after adenosine is not an arrest: no pulse to feel, but the patient goes on breathing', () => {
    // the real pressure model: the pulse must really go during the pause
    vi.restoreAllMocks();
    patient('avnrt', 180);
    // 12 mg from the Give meds tab gives the longest pause (several seconds without a QRS)
    useMedStore.getState().give('adenosine', 12);
    // watch the monitor live, as the learner would
    const pulseless: D.Vitals[] = [];
    for (let k = 0; k < 250; k++) {
      run(100);
      const x = D.vitalsAt(sim.time);
      if (!x.pulse) pulseless.push(x);
    }
    expect(pulseless.length, 'a pause long enough to lose the pulse').toBeGreaterThan(0);
    for (const x of pulseless) {
      expect(x.rr).toBeGreaterThan(0);
      expect(x.etco2).toBeGreaterThan(10);
    }
  });

  it('energies go up to the device maximum of 360 J', () => {
    expect(D.ENERGIES.at(-1)).toBe(360);
    expect(D.ENERGIES).toContain(200);
  });

  it('responses that fall due together happen in the order they were meant to', () => {
    patient('avnrt', 180);
    lucky();
    D.giveDrug('adenosine');
    run(1_000);
    // the strip is dragged forward past both the pause and the return of sinus rhythm
    useTimelineStore.getState().pause();
    scrubTo(sim.time + 9_000);
    frame();
    useTimelineStore.getState().play();
    run(20_000);
    expect(monitor()).toBe('normal-sinus@82');
    const order = logged().filter((t) => /Adenosine: transient|SVT terminated/.test(t));
    expect(order).toEqual(['Adenosine: transient AV block — brief pause', 'SVT terminated — sinus rhythm']);
  });
});

describe('pre-excited AF: an AV-nodal blocker speeds it, never slows it', () => {
  // 2023 ACC/AHA/ACCP/HRS AF guideline: adenosine, diltiazem and IV amiodarone are 3: Harm when AF runs down a pathway
  it.each([['diltiazem', 61_000], ['amiodarone', 61_000], ['adenosine', 5_000]] as const)('%s: a warning, and the rate climbs (to 250 at most)', (drug, wait) => {
    patient('af-wpw', 200);
    D.giveDrug(drug);
    expect(logged().some((t) => /pre-excited AF is harmful/.test(t))).toBe(true);
    run(wait);
    expect(useECGStore.getState().activeProfileId).toBe('af-wpw');
    expect(rate()).toBe(224);
    expect(logged().some((t) => /confirms AF|slowing after|can slow the rate/.test(t))).toBe(false);
    run(30_000);
    expect(rate()).toBe(224);
    patient('af-wpw', 240);
    D.giveDrug(drug === 'adenosine' ? 'diltiazem' : drug);
    run(61_000);
    expect(rate()).toBe(250);
  });

  it('a successful cardioversion leaves sinus rhythm that still comes down the pathway', () => {
    patient('af-wpw', 214);
    lucky();
    cardiovert();
    expect(monitor()).toBe('wpw@88');
  });
});

describe('rate-control drugs slow the heart, whatever rate it starts from', () => {
  it('diltiazem in fast AF brings the rate down to about 90', () => {
    patient('atrial-fibrillation', 150);
    D.giveDrug('diltiazem');
    run(61_000);
    expect(monitor()).toBe('atrial-fibrillation@88');
  });

  it('diltiazem in AF that is already at 70 does not speed it up', () => {
    patient('atrial-fibrillation', 70);
    D.giveDrug('diltiazem');
    run(61_000);
    expect(useECGStore.getState().activeProfileId).toBe('atrial-fibrillation');
    expect(rate()).toBeLessThan(70);
    expect(rate()).toBeGreaterThanOrEqual(40);
    expect(logged().at(-1)).toMatch(/already controlled/);
  });

  it('diltiazem in flutter with 4:1 block does not speed it up either', () => {
    patient('atrial-flutter', 75);
    D.giveDrug('diltiazem');
    run(61_000);
    expect(rate()).toBeLessThan(75);
  });

  it('amiodarone in AF at 80 does not raise the rate to 98', () => {
    patient('atrial-fibrillation', 80);
    D.giveDrug('amiodarone');
    run(91_000);
    expect(rate()).toBeLessThanOrEqual(80);
    patient('atrial-fibrillation', 150);
    D.giveDrug('amiodarone');
    run(91_000);
    expect(monitor()).toBe('atrial-fibrillation@98');
  });

  it('adenosine never speeds a slow heart up: the transient slowing is slower than the rate it started from', () => {
    patient('sinus-bradycardia', 38);
    D.giveDrug('adenosine');
    run(5_000);
    expect(rate()).toBeLessThan(38);
    run(8_000);
    expect(monitor()).toBe('sinus-bradycardia@38');

    D.resetCode();
    patient('atrial-fibrillation', 55);
    D.giveDrug('adenosine');
    run(5_000);
    expect(rate()).toBeLessThan(55);
    run(10_000);
    expect(monitor()).toBe('atrial-fibrillation@55');
  });
});

describe('atropine is judged by the heart rate, not by the name of the rhythm', () => {
  it('sinus rhythm at 35/min is a bradycardia: the rate rises', () => {
    patient('normal-sinus', 35);
    D.giveDrug('atropine');
    run(21_000);
    expect(useECGStore.getState().activeProfileId).toBe('normal-sinus');
    expect(rate()).toBeGreaterThanOrEqual(60);
    expect(logged().some((t) => /No bradycardia/.test(t))).toBe(false);
  });

  it('the vagal bradycardia of an inferior MI responds, and the ST elevation stays', () => {
    patient('inferior-stemi', 40);
    D.giveDrug('atropine');
    run(21_000);
    expect(useECGStore.getState().activeProfileId).toBe('inferior-stemi');
    expect(rate()).toBeGreaterThanOrEqual(60);
  });

  it('a bundle branch block at 38/min is still a bradycardia, and keeps its QRS', () => {
    patient('lbbb', 38);
    D.giveDrug('atropine');
    run(21_000);
    expect(useECGStore.getState().activeProfileId).toBe('lbbb');
    expect(rate()).toBeGreaterThanOrEqual(60);
  });

  it('the sinus bradycardia page still ends in normal sinus rhythm', () => {
    patient('sinus-bradycardia', 40);
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('normal-sinus@76');
  });

  it('complete heart block in an inferior MI (narrow escape, block in the AV node) can respond', () => {
    patient('inferior-stemi-chb', 40);
    lucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('inferior-stemi@70');
    D.resetCode();
    patient('inferior-stemi-chb', 40);
    unlucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('inferior-stemi-chb@40');
    expect(logged().some((t) => /No bradycardia/.test(t))).toBe(false);
    expect(logged().at(-1)).toMatch(/pac/i);
  });

  it('complete heart block with a wide escape does not respond', () => {
    patient('third-degree-avb', 34);
    lucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('third-degree-avb@34');
    expect(logged().at(-1)).toMatch(/below the AV node/);
  });

  it('slow AF and a slow junctional rhythm are bradycardias too', () => {
    patient('atrial-fibrillation', 50);
    lucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(useECGStore.getState().activeProfileId).toBe('atrial-fibrillation');
    expect(rate()).toBeGreaterThan(50);
    D.resetCode();
    patient('junctional', 44);
    lucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('normal-sinus@78');
  });

  it('a normal or fast rate is not a bradycardia, whatever the rhythm', () => {
    for (const [id, hr] of [['normal-sinus', 72], ['inferior-stemi', 64], ['lbbb', 60], ['junctional', 90], ['atrial-fibrillation', 112], ['avnrt', 180]] as const) {
      D.resetCode();
      patient(id, hr);
      D.giveDrug('atropine');
      expect(logged().at(-1), id).toMatch(/No bradycardia to treat/);
      run(21_000);
      expect(monitor(), id).toBe(`${id}@${hr}`);
    }
  });

  it('first-degree AV block at a normal rate needs no atropine; a slow one can respond', () => {
    patient('first-degree-avb', 68);
    lucky();
    D.giveDrug('atropine');
    expect(logged().at(-1)).toMatch(/No bradycardia to treat — first-degree AV block alone needs no treatment/);
    run(21_000);
    expect(monitor()).toBe('first-degree-avb@68');
    D.resetCode();
    patient('first-degree-avb', 48);
    lucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('normal-sinus@78');
  });

  it('the slow heart of hyperkalemia hardly responds: the potassium is treated', () => {
    patient('hyperkalemia', 45);
    lucky();
    D.giveDrug('atropine');
    run(21_000);
    expect(monitor()).toBe('hyperkalemia@45');
    expect(logged().at(-1)).toMatch(/Little response.*potassium.*calcium/);
  });

  it('a response does not land on a patient whose bradycardia was meanwhile paced', () => {
    patient('sinus-bradycardia', 38);
    D.giveDrug('atropine');
    D.setMode('pacer');
    D.setPacer({ mA: 130, rate: 70 });
    D.startPacing();
    expect(monitor()).toBe('tcp@70');
    run(25_000);
    expect(monitor()).toBe('tcp@70');
    expect(defib().pacer.captured).toBe(true);
  });
});

describe('pulse check', () => {
  it('with the model\'s own pressures: sinus rhythm has a pulse, VF and PEA have none', () => {
    vi.restoreAllMocks();
    patient('normal-sinus', 72);
    expect(D.pulseNow()).toBe(true);
    D.checkPulse();
    expect(defib().pulseCheck).toBe('Pulse present');
    for (const id of ['vf', 'pea', 'asystole']) {
      patient(id);
      expect(D.pulseNow(), id).toBe(false);
      D.checkPulse();
      expect(defib().pulseCheck, id).toBe('No pulse');
    }
  });

  it('normal pressures: a pulse', () => {
    pressures({});
    D.checkPulse();
    expect(defib().pulseCheck).toBe('Pulse present');
    expect(D.pulseNow()).toBe(true);
  });

  it('a pressure with almost no pulse pressure behind it cannot be felt (VT at 250/min: 66/62)', () => {
    pressures({ sbp: 66, dbp: 62, sv: 5, co: 1.3 });
    D.checkPulse();
    expect(defib().pulseCheck).toBe('No pulse');
    expect(D.pulseNow()).toBe(false);
    expect(D.vitalsAt(sim.time).pulse).toBe(false);
    expect(D.vitalsAt(sim.time).spo2).toBeNull();
  });

  it('nor can a stroke volume of a few millilitres, whatever the pressure reads (SVT at 240/min: 97/92)', () => {
    pressures({ sbp: 97, dbp: 92, sv: 8, co: 1.9 });
    D.checkPulse();
    expect(defib().pulseCheck).toBe('No pulse');
    pressures({ sbp: 100, dbp: 70, sv: 12 });
    expect(D.pulseNow()).toBe(false);
  });

  it('boundaries: 10 mmHg of pulse pressure and 15 mL are just enough', () => {
    pressures({ sbp: 70, dbp: 60, sv: 15 });
    expect(D.pulseNow()).toBe(true);
    D.checkPulse();
    expect(defib().pulseCheck).toBe('Weak, thready pulse');
    pressures({ sbp: 70, dbp: 61, sv: 15 });
    expect(D.pulseNow()).toBe(false);
    pressures({ sbp: 70, dbp: 60, sv: 14 });
    expect(D.pulseNow()).toBe(false);
    pressures({ sbp: 49, dbp: 30, sv: 30 });
    expect(D.pulseNow()).toBe(false);
  });

  it('low but real output: weak and thready', () => {
    pressures({ sbp: 74, dbp: 50, sv: 30 });
    D.checkPulse();
    expect(defib().pulseCheck).toBe('Weak, thready pulse');
    // shock at 80/52 is still called a pulse
    pressures({ sbp: 80, dbp: 52, sv: 35 });
    D.checkPulse();
    expect(defib().pulseCheck).toBe('Pulse present');
  });

  it('no output: no pulse; and compressions must stop first', () => {
    pressures({ sbp: 20, dbp: 20, sv: 0, noOutput: true });
    D.checkPulse();
    expect(defib().pulseCheck).toBe('No pulse');
    D.toggleCPR();
    D.checkPulse();
    expect(defib().pulseCheck).toMatch(/Stop compressions/);
  });

  it('a pulseless VT is treated as an arrest: no compressions warning, a shock without SYNC is right', () => {
    patient('vt', 250);
    pressures({ sbp: 66, dbp: 62, sv: 5 });
    D.toggleCPR();
    expect(logged().some((t) => /WITH a pulse/.test(t))).toBe(false);
    D.toggleCPR();
    D.setMode('manual');
    D.charge();
    run(7_000);
    unlucky();
    D.shock();
    expect(logged().some((t) => /use SYNC/.test(t))).toBe(false);
    expect(logged().at(-1)).toMatch(/refractory/);
  });

  it('the cuff cannot read a pressure that does not pulse', () => {
    pressures({ sbp: 66, dbp: 62, sv: 5 });
    D.measureNibp();
    run(7_000);
    expect(defib().nibp.last).toBe('fail');
    pressures({ sbp: 84, dbp: 56, sv: 40 });
    D.measureNibp();
    run(7_000);
    expect(defib().nibp.last).toMatchObject({ sbp: 84, dbp: 56 });
  });

  it('the cuff and the pulse check agree: no reading where no pulse can be felt (VT at 190/min: 67/53, 14 mL)', () => {
    pressures({ sbp: 67, dbp: 53, sv: 14 });
    D.checkPulse();
    expect(defib().pulseCheck).toBe('No pulse');
    D.measureNibp();
    run(7_000);
    expect(defib().nibp.last).toBe('fail');
    expect(D.vitalsAt(sim.time).spo2).toBeNull();
  });
});

describe('the device', () => {
  it('CHARGE while pacing stops the pacer: the underlying rhythm returns', () => {
    patient('third-degree-avb', 34);
    D.setMode('pacer');
    D.setPacer({ mA: 130 });
    D.startPacing();
    run(1_000);
    expect(monitor()).toBe('tcp@70');
    D.charge();
    expect(defib().mode).toBe('manual');
    expect(defib().pacer.on).toBe(false);
    expect(defib().pacer.captured).toBe(false);
    expect(monitor()).toBe('third-degree-avb@34');
    expect(defib().charge).toBe('charging');
    run(8_000);
    expect(defib().charge).toBe('charged');
    expect(monitor()).toBe('third-degree-avb@34');
  });

  it('CHARGE from the monitor screen switches to manual defibrillation', () => {
    patient('vf');
    D.charge();
    expect(defib().mode).toBe('manual');
    expect(defib().charge).toBe('charging');
  });
});

describe('the AED reads the rhythm, never the pulse', () => {
  /** let the AED analyze what is on the monitor: true if it advises a shock */
  function aed() {
    D.analyze();
    run(7_000);
    return defib().aed.phase === 'shock';
  }

  it('on a fast VT it advises a shock whether or not there is a pulse — and says an AED is not for a patient with one', () => {
    patient('vt', 170);
    expect(aed()).toBe(true);
    expect(logged()).toContain(D.AED_WITH_PULSE);
    expect(defib().log.find((l) => l.text === D.AED_WITH_PULSE)!.kind).toBe('warn');

    D.resetCode();
    pressures({ sbp: 20, dbp: 20, sv: 0, noOutput: true });
    patient('vt', 170);
    expect(aed()).toBe(true);
    expect(logged()).not.toContain(D.AED_WITH_PULSE);
  });

  it('no warning in the arrest it is made for, and no shock for an organized rhythm with a pulse', () => {
    pressures({ sbp: 20, dbp: 20, sv: 0, noOutput: true });
    patient('vf');
    expect(aed()).toBe(true);
    expect(logged()).not.toContain(D.AED_WITH_PULSE);

    vi.restoreAllMocks();
    pressures({});
    D.resetCode();
    patient('normal-sinus', 80);
    expect(aed()).toBe(false);
    expect(logged()).toContain(D.AED_WITH_PULSE);
  });
});

/** British spellings (as in the glossary's own check): the app is written in US English */
const BRITISH = /haem|aemi[ac]|ischaem|oedema|fibre|litre|tumour|colour|centre|labelled|practise|synchronis|recognis|organis|stabilis|localis|minimis|visualis|catheteris|anaesth|polaris|analys(e|ed|ing)\b|paralys|manoeuvr|oesoph|paediatr|characteris|normalis|utilis|hospitalis|vascularis/i;

describe('what the trainer says follows the current guidelines', () => {
  /** a synchronized shock at this energy, with every chance in the trainer coming out at `luck` */
  function cardiovertAt(j: number, luck: number) {
    D.setEnergy(j);
    vi.spyOn(Math, 'random').mockReturnValue(luck);
    cardiovert();
    return useECGStore.getState().activeProfileId === 'normal-sinus';
  }
  const tries: [string, number, string][] = [
    // rhythm, rate, the 2025 energy
    ['atrial-fibrillation', 150, '200 J or more'], ['atrial-flutter', 150, '200 J'], ['avnrt', 180, '100 J'], ['vt', 150, '100 J'],
  ];

  it('cardioversion works best at the 2025 energies: AF 200 J or more, flutter 200 J, narrow regular and monomorphic VT 100 J', () => {
    const cases: [string, number, number, number, boolean][] = [
      // rhythm, rate, joules, luck, converts
      ['atrial-fibrillation', 150, 200, 0.8, true], ['atrial-fibrillation', 150, 150, 0.8, false], ['atrial-fibrillation', 150, 100, 0.55, false],
      ['atrial-flutter', 150, 200, 0.9, true], ['atrial-flutter', 150, 100, 0.9, false],
      ['avnrt', 180, 100, 0.85, true], ['avnrt', 180, 50, 0.85, false],
      ['vt', 150, 100, 0.85, true], ['vt', 150, 50, 0.65, false],
    ];
    for (const [id, hr, j, luck, converts] of cases) {
      vi.restoreAllMocks();
      pressures({});
      D.resetCode();
      patient(id, hr);
      expect(cardiovertAt(j, luck), `${id} at ${j} J`).toBe(converts);
    }
  });

  it('a lower energy is less likely to work, never impossible', () => {
    for (const [id, hr, best] of tries) {
      vi.restoreAllMocks();
      pressures({});
      D.resetCode();
      patient(id, hr);
      expect(cardiovertAt(50, 0.15), `${id} at 50 J (the 2025 energy is ${best})`).toBe(true);
    }
  });

  it('sustained torsades: an immediate unsynchronized shock, pulse or not — then magnesium', () => {
    patient('torsades');
    D.giveDrug('amiodarone');
    expect(logged().at(-1)).toMatch(/unsynchronized/);
    expect(logged().at(-1)).toMatch(/pulse or not/);
    expect(logged().at(-1)).not.toMatch(/if pulseless/);
    D.giveDrug('magnesium');
    expect(logged().at(-1)).toMatch(/unsynchronized/);
    expect(logged().at(-1)).toMatch(/pulse or not/);
  });

  it('after ROSC: SpO2 90–98% and a MAP of at least 65 mmHg', () => {
    patient('vf');
    D.forceRosc();
    const rosc = defib().log.find((l) => l.kind === 'rosc')!.text;
    expect(rosc).toMatch(/SpO2 90–98%/);
    expect(rosc).toMatch(/MAP ≥ 65 mmHg/);
    expect(rosc).not.toMatch(/92–98|SBP ≥ 90/);
  });

  it('calcium in a hyperkalemic arrest: 1 g, benefit not well established, given without pausing CPR or shocks', () => {
    const ca = D.DRUGS.find((d) => d.id === 'calcium')!;
    expect(ca.dose(defib())).toMatch(/1 g IV \(10 mL of 10%\)/);
    expect(ca.indication).toMatch(/not well established/);
    pressures({ sbp: 20, dbp: 20, sv: 0, noOutput: true });
    D.loadScenario(D.SCENARIOS.find((s) => s.id === 'pea')!);
    D.giveDrug('calcium');
    const said = logged().slice(-2).join(' ');
    expect(said).toMatch(/not well established/);
    expect(said).toMatch(/without pausing CPR or shocks/);
    // with a pulse (hyperkalemia with ECG changes) it is the first treatment
    vi.restoreAllMocks();
    pressures({});
    D.resetCode();
    patient('hyperkalemia');
    D.giveDrug('calcium');
    expect(logged().at(-1)).toMatch(/stabilizes/);
  });

  it('in the dialysis patient\'s PEA, calcium may help but is no cure', () => {
    /** two minutes of CPR after epinephrine, then the pulse check, with every chance coming out at `luck` */
    const cycle = (calcium: boolean, luck: number) => {
      vi.restoreAllMocks();
      pressures({ sbp: 20, dbp: 20, sv: 0, noOutput: true });
      D.loadScenario(D.SCENARIOS.find((s) => s.id === 'pea')!);
      D.toggleCPR();
      D.giveDrug('epinephrine');
      if (calcium) D.giveDrug('calcium');
      run(115_000, 500);
      vi.spyOn(Math, 'random').mockReturnValue(luck);
      D.toggleCPR();
      return defib().log.some((l) => l.kind === 'rosc');
    };
    expect(cycle(true, 0.2)).toBe(true);
    expect(cycle(true, 0.4)).toBe(false);
    expect(cycle(false, 0.2)).toBe(false);
  });

  it('the trainer is written in US English', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['../src/lib/sim/defib.ts', '../src/components/monitor/DefibPanel.tsx', '../src/lib/sim/projector.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const hits = source.split('\n').filter((line) => BRITISH.test(line));
      expect(hits, file).toEqual([]);
    }
  });
});

describe('the projector window only mirrors the main window', () => {
  const ages = { code: null, epi: null, shock: null, cpr: null };

  it('"charging" stays charging until the main window says it is ready', () => {
    run(2_000);
    D.mirrorRemote({ baseline: null, defib: { mode: 'manual', energy: 200, charge: 'charging', message: 'Charging 200 J…' }, ages });
    run(10_000);
    expect(defib().charge).toBe('charging');
    expect(defib().message).toBe('Charging 200 J…');
    D.mirrorRemote({ baseline: null, defib: { mode: 'manual', energy: 200, charge: 'charged', message: '200 J ready' }, ages });
    run(70_000);
    // …and it does not disarm by itself either
    expect(defib().charge).toBe('charged');
    expect(defib().message).toBe('200 J ready');
  });

  it('an AED analysis and a blood-pressure measurement are not finished on the projector\'s own clock', () => {
    sim.time += 500_000;
    showRhythm('vf');
    run(1_000);
    // "until" comes from the main window's clock, which started at another moment
    D.mirrorRemote({
      baseline: null, ages,
      defib: { mode: 'aed', charge: 'idle', aed: { phase: 'analyzing', until: 6_000 }, nibp: { measuring: true, until: 6_000, last: null }, message: 'Analyzing heart rhythm. Do not touch the patient' },
    });
    run(3_000);
    expect(defib().aed.phase).toBe('analyzing');
    expect(defib().charge).toBe('idle');
    expect(defib().nibp.measuring).toBe(true);
    expect(defib().log).toHaveLength(0);
  });

  it('a window that runs its own device again (reset) is no longer a mirror', () => {
    D.mirrorRemote({ baseline: null, defib: { mode: 'manual', charge: 'idle' }, ages });
    D.resetCode();
    D.charge();
    run(8_000);
    expect(defib().charge).toBe('charged');
  });
});
