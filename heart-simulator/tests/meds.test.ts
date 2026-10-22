import { beforeEach, describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import { applyMods, combineMods, describeMods, modsKey } from '@/lib/ecg/mods';
import { MEDS, MED_BY_ID, category, classifyDose, describeDose, planDose, type MedId, type Patient } from '@/lib/sim/meds';
import { sim } from '@/lib/sim/simulation';
import { setRhythm } from '@/lib/rhythm';
import { useMedStore, tickMeds } from '@/store/useMedStore';
import { useAppStore } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { MEDICATION_IDS } from '@/types/content';

const patient = (profileId: string, hr: number, extra: Partial<Patient> = {}): Patient => ({ profileId, hr, kg: 80, given: [], ...extra });

/** ventricular beats between two times */
const beats = (e: ECGEngine, a: number, b: number) => e.vent.filter((v) => v.t >= a && v.t < b);

describe('drug modifiers on the ECG engine', () => {
  it('lengthen the PR, widen the QRS and lengthen the QT of conducted beats', () => {
    const plain = new ECGEngine('normal-sinus', 72);
    const dosed = new ECGEngine('normal-sinus', 72);
    dosed.setRhythm('normal-sinus', 72, 0, { prAdd: 60, qrsWiden: 1.3, qtcAdd: 60 });
    plain.ensure(10_000);
    dosed.ensure(10_000);
    const a = plain.intervals(9_000);
    const b = dosed.intervals(9_000);
    expect(b.pr! - a.pr!).toBe(60);
    expect(b.qrs! / a.qrs!).toBeCloseTo(1.3, 1);
    expect(b.qt!).toBeGreaterThan(a.qt! + 40);
  });

  it('rebuild the rhythm when they change, and not when they stay the same', () => {
    const e = new ECGEngine('normal-sinus', 72);
    e.ensure(10_000);
    e.setRhythm('normal-sinus', 72, 5_000, { prAdd: 40 });
    expect(e.segments.length).toBe(2);
    e.setRhythm('normal-sinus', 72, 6_000, { prAdd: 40 });
    expect(e.segments.length).toBe(2);
    e.setRhythm('normal-sinus', 72, 7_000, null);
    expect(e.segments.length).toBe(3);
  });

  it('AV block: P waves continue with no QRS complexes', () => {
    const e = new ECGEngine('normal-sinus', 60);
    e.ensure(5_000);
    e.setRhythm('normal-sinus', 60, 5_000, { avBlock: true });
    e.ensure(12_000);
    expect(beats(e, 5_400, 12_000)).toHaveLength(0);
    expect(e.atrial.filter((a) => a.t > 5_400 && a.t < 12_000 && !a.conducted).length).toBeGreaterThanOrEqual(5);
  });

  it('flutter can show long runs of flutter waves when a drug blocks the AV node', () => {
    const e = new ECGEngine('atrial-flutter', 150);
    e.ensure(5_000);
    e.setRhythm('atrial-flutter', 30, 5_000);
    e.ensure(20_000);
    const v = beats(e, 6_000, 20_000);
    expect(v[1].t - v[0].t).toBeCloseTo(2_000, -1); // 10:1 block
  });

  it('are described in words for the interpretation box', () => {
    expect(describeMods({ prAdd: 30, qtcAdd: -25, qrsWiden: 1.3, avBlock: true })).toEqual([
      'AV block: P waves without QRS complexes', 'PR +30 ms', 'QRS wider (×1.3)', 'QTc −25 ms',
    ]);
    expect(describeMods(null)).toEqual([]);
  });

  it('combine across drugs and give a stable key', () => {
    const m = combineMods([{ prAdd: 30 }, { prAdd: 20, qtcAdd: 25 }, { qrsWiden: 1.2 }, null])!;
    expect(m).toEqual({ prAdd: 50, qtcAdd: 25, qrsWiden: 1.2 });
    expect(modsKey(m)).toBe(modsKey({ ...m }));
    expect(modsKey(null)).toBe('');
    expect(applyMods(ECG_PROFILES['normal-sinus'], null)).toBe(ECG_PROFILES['normal-sinus']);
    expect(applyMods(ECG_PROFILES['atrial-fibrillation'], { prAdd: 50 }).pr).toBe(0); // no PR in AF
  });
});

describe('the medications', () => {
  it('cover drugs that exist in the Library, with sensible doses for an adult', () => {
    for (const m of MEDS) {
      expect(MEDICATION_IDS as readonly string[]).toContain(m.id);
      for (const kg of [50, 80, 120]) {
        const p = patient('normal-sinus', 72, { kg });
        const u = m.usual(p);
        expect(u.low).toBeGreaterThan(0);
        expect(u.high).toBeGreaterThanOrEqual(u.low);
        expect(m.max(p)).toBeGreaterThanOrEqual(u.high);
        expect(m.picks(p).length).toBeGreaterThan(1);
      }
    }
  });

  it('every drug gives a verdict and a timeline on every rhythm, and never points at a missing rhythm', () => {
    for (const m of MEDS) {
      for (const prof of Object.values(ECG_PROFILES)) {
        const p = patient(prof.id, prof.defaultHR || 0);
        for (const dose of m.picks(p)) {
          const plan = planDose(m.id, p, dose);
          expect(plan.verdict.text.length, `${m.id} on ${prof.id}`).toBeGreaterThan(10);
          expect(plan.steps.length, `${m.id} on ${prof.id}`).toBeGreaterThan(0);
          for (const s of plan.steps) {
            expect(s.at).toBeGreaterThan(0);
            if (s.profile) expect(ECG_PROFILES[s.profile], `${m.id} → ${s.profile}`).toBeDefined();
            if (s.hr !== undefined) expect(s.hr).toBeGreaterThanOrEqual(0);
          }
          for (let i = 1; i < plan.steps.length; i++) expect(plan.steps[i].at).toBeGreaterThanOrEqual(plan.steps[i - 1].at);
        }
      }
    }
  });

  it('dose by weight: diltiazem 0.25 mg/kg is usual, a fixed 50 mg is an overdose', () => {
    const d = MED_BY_ID.diltiazem;
    const p = patient('atrial-fibrillation', 150);
    expect(classifyDose(d, p, 20)).toBe('usual');
    expect(describeDose(d, p, 20)).toContain('0.25 mg/kg');
    expect(classifyDose(d, p, 5)).toBe('low');
    expect(classifyDose(d, p, 50)).toBe('toxic');
    expect(classifyDose(d, { ...p, kg: 120 }, 20)).toBe('low');
  });

  it('adenosine: 6 mg first, 12 mg after a full first dose; after an under-dose 6 mg still works', () => {
    const a = MED_BY_ID.adenosine;
    const first = patient('avnrt', 180);
    expect(classifyDose(a, first, 6)).toBe('usual');
    expect(classifyDose(a, first, 3)).toBe('low');
    const second = { ...first, given: [{ id: 'adenosine' as MedId, dose: 6, at: 0 }] };
    expect(classifyDose(a, second, 12)).toBe('usual');
    expect(classifyDose(a, second, 24)).toBe('toxic');
    const afterLow = { ...first, given: [{ id: 'adenosine' as MedId, dose: 3, at: 0 }] };
    expect(classifyDose(a, afterLow, 6)).toBe('usual');
    expect(planDose('adenosine', afterLow, 6).steps.some((s) => s.profile === 'normal-sinus')).toBe(true);
    // a 12 mg first dose is not "more than the maximum"
    expect(planDose('adenosine', first, 12).steps.some((s) => /maximum/.test(s.note))).toBe(false);
  });

  it('calcium 0.5–1 g and bicarbonate 50 mEq are usual doses', () => {
    expect(classifyDose(MED_BY_ID['calcium-chloride'], patient('hyperkalemia', 64), 0.5)).toBe('usual');
    expect(classifyDose(MED_BY_ID['sodium-bicarbonate'], patient('hyperkalemia', 64), 50)).toBe('usual');
  });

  it('tenecteplase follows the weight bands exactly', () => {
    const t = MED_BY_ID.tenecteplase;
    expect(classifyDose(t, patient('anterior-stemi', 92, { kg: 85 }), 45)).toBe('usual');
    expect(classifyDose(t, patient('anterior-stemi', 92, { kg: 85 }), 40)).toBe('low');
    expect(classifyDose(t, patient('anterior-stemi', 92, { kg: 55 }), 30)).toBe('usual');
  });
});

describe('classic responses', () => {
  it('adenosine terminates AVNRT through a brief AV block into sinus rhythm', () => {
    const plan = planDose('adenosine', patient('avnrt', 180), 6);
    expect(plan.verdict.tone).toBe('good');
    const block = plan.steps.find((s) => s.mods?.avBlock);
    const sinus = plan.steps.find((s) => s.profile === 'normal-sinus' && s.mods === null);
    expect(block!.at).toBeGreaterThanOrEqual(10_000);
    expect(block!.at).toBeLessThanOrEqual(20_000);
    expect(sinus!.at - block!.at).toBeGreaterThanOrEqual(2_000);
  });

  it('too little adenosine leaves the SVT running', () => {
    const plan = planDose('adenosine', patient('avnrt', 180), 3);
    expect(plan.doseClass).toBe('low');
    expect(plan.steps.some((s) => s.profile === 'normal-sinus')).toBe(false);
  });

  it('adenosine unmasks flutter waves and AF without converting them', () => {
    for (const id of ['atrial-flutter', 'atrial-fibrillation']) {
      const plan = planDose('adenosine', patient(id, 150), 6);
      expect(plan.verdict.tone).toBe('caution');
      expect(plan.steps.at(-1)!.restore).toBe(true);
    }
  });

  it('adenosine for sinus tachycardia is the wrong drug', () => {
    expect(planDose('adenosine', patient('sinus-tachycardia', 122), 6).verdict.tone).toBe('bad');
  });

  it('diltiazem controls the rate in AF within minutes, and converts AVNRT', () => {
    const af = planDose('diltiazem', patient('atrial-fibrillation', 150), 20);
    expect(af.steps.at(-1)!.hr).toBeLessThan(110);
    expect(af.steps.at(-1)!.at).toBeGreaterThanOrEqual(3 * 60_000);
    const svt = planDose('diltiazem', patient('avnrt', 180), 20);
    expect(svt.steps.some((s) => s.profile === 'normal-sinus' && (s.mods?.prAdd ?? 0) > 0)).toBe(true);
  });

  it('calcium-channel blockers in VT and AV-nodal blockers in bradycardia are dangerous', () => {
    expect(planDose('diltiazem', patient('vt', 170), 20).verdict.tone).toBe('bad');
    for (const id of ['diltiazem', 'metoprolol', 'adenosine'] as MedId[]) expect(planDose(id, patient('sinus-bradycardia', 46), MED_BY_ID[id].usual(patient('sinus-bradycardia', 46)).low).verdict.tone).toBe('bad');
  });

  it('atropine speeds a sinus bradycardia but not a block below the AV node', () => {
    const brady = planDose('atropine', patient('sinus-bradycardia', 46), 1);
    expect(brady.verdict.tone).toBe('good');
    expect(brady.steps.at(-1)!.hr).toBeGreaterThanOrEqual(60);
    const chb = planDose('atropine', patient('third-degree-avb', 36), 1);
    expect(chb.steps.some((s) => s.profile || s.hr)).toBe(false);
    const paradox = planDose('atropine', patient('sinus-bradycardia', 46), 0.3);
    expect(paradox.steps[0].hr).toBeLessThan(46);
  });

  it('magnesium is the drug for torsades, but pulseless torsades still needs the shock', () => {
    const mg = planDose('magnesium-sulfate', patient('torsades', 230), 2);
    expect(mg.verdict.tone).toBe('good');
    expect(mg.verdict.text).toMatch(/defibrillate/i);
    expect(mg.steps.some((s) => s.profile)).toBe(false);
    // pulseless torsades follows the VF pathway, epinephrine included
    expect(planDose('epinephrine', patient('torsades', 230), 1).verdict.tone).toBe('caution');
  });

  it('procainamide terminates stable VT and widens the QRS; in hypotensive VT it is the wrong choice', () => {
    const stable = planDose('procainamide', patient('vt', 170, { sbp: 118 }), 17 * 80);
    expect(Math.max(...stable.steps.map((s) => s.mods?.qrsWiden ?? 1))).toBeGreaterThan(1.2);
    expect(stable.steps.some((s) => s.profile === 'normal-sinus')).toBe(true);
    expect(stable.verdict.tone).toBe('good');
    expect(planDose('procainamide', patient('vt', 170, { sbp: 78 }), 17 * 80).verdict.tone).toBe('bad');
    expect(planDose('amiodarone', patient('vt', 170, { sbp: 78 }), 150).verdict.text).toMatch(/cardioversion/);
    expect(planDose('amiodarone', patient('vt', 170, { sbp: 118 }), 150).verdict.tone).toBe('good');
    // 17 mg/kg is the ceiling
    expect(classifyDose(MED_BY_ID.procainamide, patient('vt', 170), 20 * 80)).toBe('toxic');
  });

  it('aortic dissection: β-blocker first; no lysis, heparin or aspirin', () => {
    expect(planDose('metoprolol', patient('aortic-dissection', 104, { sbp: 150 }), 5).verdict.tone).toBe('good');
    expect(planDose('esmolol', patient('aortic-dissection', 104, { sbp: 150 }), 40).verdict.tone).toBe('good');
    for (const id of ['tenecteplase', 'heparin', 'aspirin'] as MedId[]) {
      expect(planDose(id, patient('aortic-dissection', 104, { sbp: 150 }), MED_BY_ID[id].usual(patient('aortic-dissection', 104)).low).verdict.tone).toBe('bad');
    }
  });

  it('heparin and aspirin for every acute coronary syndrome, whatever the rhythm', () => {
    for (const id of ['cardiogenic-shock', 'inferior-stemi-chb', 'anterior-stemi-reperfused', 'nstemi']) {
      expect(planDose('heparin', patient(id, 90), 4000).verdict.tone, id).toBe('good');
      expect(planDose('aspirin', patient(id, 90), 325).verdict.tone, id).toBe('good');
    }
    expect(planDose('tenecteplase', patient('cardiogenic-shock', 118), 45).verdict.tone).toBe('caution');
    // PE heparin is 80 units/kg without the ACS cap
    expect(classifyDose(MED_BY_ID.heparin, patient('pulmonary-embolism', 114), 6400)).toBe('usual');
  });

  it('nitrates are refused when the patient is hypotensive', () => {
    expect(planDose('nitroglycerin', patient('nstemi', 88, { sbp: 82 }), 0.4).verdict.tone).toBe('bad');
    expect(planDose('nitroglycerin', patient('nstemi', 88, { sbp: 130 }), 0.4).verdict.tone).toBe('good');
  });

  it('calcium narrows the hyperkalaemic QRS; tenecteplase reperfuses a STEMI', () => {
    const ca = planDose('calcium-chloride', patient('hyperkalemia', 64), 1);
    expect(ca.steps[0].mods!.qrsWiden).toBeLessThan(1);
    const tnk = planDose('tenecteplase', patient('anterior-stemi', 92), 45);
    expect(tnk.steps.map((s) => s.profile)).toContain('anterior-stemi-reperfused');
    // no VT-looking step that a learner might try to treat
    expect(tnk.steps.some((s) => s.profile === 'vt')).toBe(false);
  });

  it('1 mg of epinephrine IV to a patient with a pulse causes VT; a larger push-dose is only a caution', () => {
    const plan = planDose('epinephrine', patient('normal-sinus', 72), 1);
    expect(plan.verdict.tone).toBe('bad');
    expect(plan.steps.map((s) => s.profile)).toContain('vt');
    const push = planDose('epinephrine', patient('sinus-bradycardia', 46), 0.04);
    expect(push.verdict.tone).toBe('caution');
    expect(push.steps.some((s) => s.profile === 'vt')).toBe(false);
  });

  it('categorises the rhythms the drugs care about', () => {
    expect(category(ECG_PROFILES.avnrt)).toBe('svt');
    expect(category(ECG_PROFILES.vf)).toBe('arrest');
    expect(category(ECG_PROFILES.torsades)).toBe('torsades');
    expect(category(ECG_PROFILES['inferior-stemi'])).toBe('stemi');
    expect(category(ECG_PROFILES['inferior-stemi-chb'])).toBe('chb');
    expect(category(ECG_PROFILES['sinus-tachycardia'])).toBe('sinus-tach');
  });
});

describe('a medication session on the live clock', () => {
  beforeEach(() => {
    useAppStore.getState().setMode('learn');
    useMedStore.getState().reset('avnrt');
    sim.time = 100_000;
    setRhythm('avnrt', 180);
    sim.engine.setRhythm('avnrt', 180, sim.time, null);
  });

  /** run the simulation like SimulationDriver does, 16 ms at a time */
  function run(ms: number) {
    for (let t = 0; t < ms; t += 16) {
      const ecg = useECGStore.getState();
      sim.engine.setRhythm(ecg.activeProfileId, useTimelineStore.getState().heartRate, sim.time, useMedStore.getState().mods);
      sim.time += 16;
      sim.engine.ensure(sim.time + 4000);
      tickMeds(sim.time);
    }
  }

  it('adenosine 6 mg: the 12-lead shows SVT, then a pause, then sinus rhythm', () => {
    const t0 = sim.time;
    useMedStore.getState().give('adenosine', 6);
    expect(useMedStore.getState().next!.since).toBeGreaterThan(0);
    run(10_000);
    expect(useECGStore.getState().activeProfileId).toBe('avnrt');
    run(20_000);
    expect(useECGStore.getState().activeProfileId).toBe('normal-sinus');
    const v = beats(sim.engine, t0, sim.time);
    const gaps = v.slice(1).map((b, i) => b.t - v[i].t);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(2_500); // the pause
    expect(v.filter((b) => b.t < t0 + 10_000).every((b) => b.kind === 'svt')).toBe(true);
    expect(v.at(-1)!.kind).toBe('conducted'); // sinus beats afterwards
    const log = useMedStore.getState().log;
    expect(log[0].tone).toBe('push');
    expect(log.some((l) => l.tone === 'good')).toBe(true);
  });

  it('skip ahead brings a slow drug forward without jumping the clock', () => {
    setRhythm('atrial-fibrillation', 150);
    useMedStore.getState().give('diltiazem', 20);
    const before = sim.time;
    useMedStore.getState().skipAhead();
    expect(sim.time).toBe(before);
    expect(useMedStore.getState().next!.fireAt - sim.time).toBeLessThanOrEqual(1_600);
    run(2_000);
    expect(useTimelineStore.getState().heartRate).toBeLessThan(150);
  });

  it('a new patient (condition) clears the drugs given to the last one', () => {
    useMedStore.getState().give('diltiazem', 20);
    run(1_000);
    useMedStore.getState().reset('atrial-fibrillation');
    expect(useMedStore.getState().given).toHaveLength(0);
    expect(useMedStore.getState().next).toBeNull();
    expect(useMedStore.getState().mods).toBeNull();
  });

  it('leaving the Learn view drops the effects still to come', () => {
    useMedStore.getState().give('diltiazem', 20);
    useAppStore.getState().setMode('simulator');
    tickMeds(sim.time + 10 * 60_000);
    expect(useMedStore.getState().next).toBeNull();
    expect(useMedStore.getState().mods).toBeNull();
  });
});
