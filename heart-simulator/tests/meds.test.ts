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
      for (const kg of [40, 50, 80, 120, 200]) {
        const p = patient('normal-sinus', 72, { kg });
        const u = m.usual(p);
        expect(u.low).toBeGreaterThan(0);
        expect(u.high).toBeGreaterThanOrEqual(u.low);
        expect(m.max(p)).toBeGreaterThanOrEqual(u.high);
        expect(m.picks(p).length).toBeGreaterThan(1);
      }
    }
  });

  it('every drug gives a verdict and a timeline on every rhythm at its slowest, usual and fastest rate, and never points at a missing rhythm', () => {
    for (const m of MEDS) {
      for (const prof of Object.values(ECG_PROFILES)) {
        for (const hr of Array.from(new Set([prof.minHR, prof.defaultHR, prof.maxHR]))) {
          const p = patient(prof.id, hr || 0);
          const where = `${m.id} on ${prof.id} at ${hr}`;
          for (const dose of m.picks(p)) {
            const plan = planDose(m.id, p, dose);
            expect(plan.verdict.text.length, where).toBeGreaterThan(10);
            expect(plan.steps.length, where).toBeGreaterThan(0);
            for (const s of plan.steps) {
              expect(s.at).toBeGreaterThan(0);
              if (s.profile) expect(ECG_PROFILES[s.profile], `${m.id} → ${s.profile}`).toBeDefined();
              if (s.hr !== undefined) {
                expect(s.hr, where).toBeGreaterThanOrEqual(0);
                expect(s.hr, where).toBeLessThanOrEqual(250);
                expect(Number.isInteger(s.hr), where).toBe(true);
              }
            }
            for (let i = 1; i < plan.steps.length; i++) expect(plan.steps[i].at).toBeGreaterThanOrEqual(plan.steps[i - 1].at);
          }
        }
      }
    }
  });

  it('a drug that is given to slow the heart is never called a good choice when the heart is already slow', () => {
    const slowing: MedId[] = ['diltiazem', 'metoprolol', 'esmolol', 'amiodarone', 'digoxin', 'adenosine'];
    for (const prof of Object.values(ECG_PROFILES)) {
      if (prof.hemo === 'no-output' || prof.minHR >= 60 || prof.rhythm === 'paced' || prof.rhythm === 'vpaced') continue;
      const p = patient(prof.id, Math.max(prof.minHR, 30), { sbp: 110 });
      for (const id of slowing) {
        const plan = planDose(id, p, MED_BY_ID[id].usual(p).low);
        expect(plan.verdict.tone, `${id} on ${prof.id} at ${p.hr}`).not.toBe('good');
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

  it('a light patient: doses far above the weight-based dose are overdoses, not just "high"', () => {
    const light = patient('atrial-fibrillation', 150, { kg: 40 });
    // diltiazem 35 mg is 0.875 mg/kg — three and a half times the 0.25 mg/kg dose
    expect(classifyDose(MED_BY_ID.diltiazem, light, 35)).toBe('toxic');
    expect(classifyDose(MED_BY_ID.diltiazem, light, 20)).toBe('toxic');
    expect(classifyDose(MED_BY_ID.diltiazem, light, 10)).toBe('usual');
    expect(describeDose(MED_BY_ID.diltiazem, light, 35)).toMatch(/overdose/);
    // the dose offered as the overdose example is one, at every weight
    for (const kg of [40, 50, 60, 80, 120]) {
      const p = { ...light, kg };
      expect(classifyDose(MED_BY_ID.diltiazem, p, Math.max(...MED_BY_ID.diltiazem.picks(p))), `${kg} kg`).toBe('toxic');
    }
    // the second dose (0.35 mg/kg) is still a usual dose
    const second = { ...patient('atrial-fibrillation', 150), given: [{ id: 'diltiazem' as MedId, dose: 20, at: 0 }] };
    expect(classifyDose(MED_BY_ID.diltiazem, second, 28)).toBe('usual');
    expect(classifyDose(MED_BY_ID.diltiazem, { ...second, kg: 40 }, 14)).toBe('usual');

    // heparin 5000 units is 125 units/kg at 40 kg — above even the PCI dose (70–100 units/kg)
    const acs = patient('anterior-stemi', 92, { kg: 40 });
    expect(classifyDose(MED_BY_ID.heparin, acs, 5000)).toBe('toxic');
    expect(classifyDose(MED_BY_ID.heparin, acs, 2400)).toBe('usual');
    expect(classifyDose(MED_BY_ID.heparin, acs, 3500)).toBe('high');
    expect(classifyDose(MED_BY_ID.heparin, { ...acs, kg: 80 }, 5000)).toBe('high');
    expect(classifyDose(MED_BY_ID.heparin, { ...acs, kg: 80 }, 10000)).toBe('toxic');

    // bicarbonate: the usual range never reaches past the overdose line
    const k = patient('hyperkalemia', 64, { kg: 40 });
    expect(classifyDose(MED_BY_ID['sodium-bicarbonate'], k, 50)).toBe('usual');
    expect(MED_BY_ID['sodium-bicarbonate'].usual(k).high).toBeLessThanOrEqual(MED_BY_ID['sodium-bicarbonate'].max(k));
    expect(classifyDose(MED_BY_ID['sodium-bicarbonate'], k, 100)).toBe('toxic');
    expect(describeDose(MED_BY_ID['sodium-bicarbonate'], k, 100)).not.toMatch(/usual 50–100/);
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

  it('calcium 1 g and bicarbonate 50 mEq are usual doses', () => {
    expect(classifyDose(MED_BY_ID['calcium-chloride'], patient('hyperkalemia', 64), 1)).toBe('usual');
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

  it('atropine is judged by the heart rate, not by the name of the rhythm', () => {
    // a slow sinus rhythm is a bradycardia whatever the page is called — and it keeps its own QRS and ST segments
    for (const [id, hr] of [['normal-sinus', 35], ['lbbb', 38], ['inferior-stemi', 40], ['nstemi', 45], ['pvcs', 44]] as const) {
      const plan = planDose('atropine', patient(id, hr), 1);
      expect(plan.verdict.tone, id).toBe('good');
      expect(plan.verdict.text, id).not.toMatch(/No bradycardia/);
      expect(plan.steps.at(-1)!.hr, id).toBeGreaterThanOrEqual(60);
      expect(plan.steps.every((s) => s.profile === undefined || s.profile === id), id).toBe(true);
    }
    expect(planDose('atropine', patient('inferior-stemi', 40), 1).verdict.text).toMatch(/inferior/i);
    // the sinus bradycardia page ends in normal sinus rhythm, as before
    expect(planDose('atropine', patient('sinus-bradycardia', 46), 1).steps.at(-1)).toMatchObject({ profile: 'normal-sinus', hr: 84 });
    // 60/min and above is not a bradycardia
    for (const [id, hr] of [['normal-sinus', 60], ['normal-sinus', 72], ['inferior-stemi', 64], ['lbbb', 100]] as const) {
      const plan = planDose('atropine', patient(id, hr), 1);
      expect(plan.verdict.tone, `${id} ${hr}`).toBe('bad');
      expect(plan.verdict.text, `${id} ${hr}`).toMatch(/No bradycardia/);
    }
    // an accelerated junctional rhythm is not slow; a slow one is
    expect(planDose('atropine', patient('junctional', 96), 1).verdict.tone).toBe('bad');
    expect(planDose('atropine', patient('junctional', 44), 1).verdict.tone).toBe('good');
    // slow AF: the AV node is the brake, and atropine releases it
    const slowAf = planDose('atropine', patient('atrial-fibrillation', 48), 1);
    expect(slowAf.verdict.tone).not.toBe('bad');
    expect(slowAf.steps[0].hr).toBeGreaterThan(48);
    expect(planDose('atropine', patient('atrial-fibrillation', 130), 1).verdict.tone).toBe('bad');
  });

  it('at 50–59/min atropine is not simply "the right drug": the bradycardia algorithm is for rates typically below 50', () => {
    for (const [id, hr] of [['normal-sinus', 55], ['sinus-bradycardia', 52], ['inferior-stemi', 58], ['first-degree-avb', 55], ['junctional', 50]] as const) {
      for (const dose of [0.5, 1]) {
        const plan = planDose('atropine', patient(id, hr), dose);
        expect(plan.verdict.tone, `${id} ${hr} ${dose} mg`).toBe('caution');
        expect(plan.verdict.text, `${id} ${hr} ${dose} mg`).toMatch(/typically below 50\/min.*another cause/);
        // what atropine does to the heart is the same: the rate still rises
        expect(plan.steps.some((s) => s.hr !== undefined && s.hr > hr), `${id} ${hr} ${dose} mg`).toBe(true);
      }
    }
    for (const [id, hr] of [['normal-sinus', 49], ['sinus-bradycardia', 46], ['first-degree-avb', 45], ['junctional', 44]] as const) {
      expect(planDose('atropine', patient(id, hr), 1).verdict.tone, `${id} ${hr}`).toBe('good');
    }
  });

  it('a small dose of atropine is "the right drug, too little" only when there is a bradycardia', () => {
    const slow = planDose('atropine', patient('normal-sinus', 40), 0.4);
    expect(slow.verdict.tone).toBe('caution');
    expect(slow.verdict.text).toMatch(/right drug/);
    const normal = planDose('atropine', patient('normal-sinus', 72), 0.4);
    expect(normal.verdict.tone).toBe('bad');
    expect(normal.verdict.text).toMatch(/No bradycardia/);
    expect(normal.verdict.text).not.toMatch(/right drug|Give 1 mg/);
    // the paradoxical slowing itself happens either way
    expect(normal.steps[0].hr).toBeLessThan(72);
    expect(slow.steps[0].hr).toBeLessThan(40);
  });

  it('other drugs see a slow sinus rhythm as a bradycardia too', () => {
    for (const id of ['metoprolol', 'diltiazem', 'esmolol', 'amiodarone', 'digoxin'] as MedId[]) {
      const p = patient('normal-sinus', 38);
      const plan = planDose(id, p, MED_BY_ID[id].usual(p).low);
      expect(plan.verdict.tone, id).toBe('bad');
      expect(plan.verdict.text, id).toMatch(/bradycardia|slows the sinus node/i);
    }
    // an inferior MI at 40/min: a β-blocker is harmful, and fibrinolysis is still fibrinolysis for a STEMI
    const mi = patient('inferior-stemi', 40);
    expect(planDose('metoprolol', mi, 5).verdict.tone).toBe('bad');
    expect(planDose('esmolol', mi, 40).verdict.tone).toBe('bad');
    expect(planDose('tenecteplase', mi, 45).verdict.tone).toBe('good');
    // push-dose epinephrine for a slow rhythm keeps the patient's own QRS
    const epi = planDose('epinephrine', patient('lbbb', 38), 0.02);
    expect(epi.verdict.tone).toBe('caution');
    expect(epi.steps[0].profile).toBeUndefined();
    expect(epi.steps[0].hr).toBeGreaterThan(38);
    // nothing changes at an ordinary rate
    expect(planDose('metoprolol', patient('inferior-stemi', 64), 5).verdict.tone).toBe('caution');
    expect(category(ECG_PROFILES['normal-sinus'])).toBe('sinus');
    expect(category(ECG_PROFILES['normal-sinus'], 72)).toBe('sinus');
    expect(category(ECG_PROFILES['normal-sinus'], 59)).toBe('brady');
    expect(category(ECG_PROFILES['cardiogenic-shock'], 50)).toBe('brady');
    expect(category(ECG_PROFILES['inferior-stemi'], 40)).toBe('stemi');
    expect(category(ECG_PROFILES.avnrt, 50)).toBe('svt');
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

  it('calcium narrows the hyperkalemic QRS; tenecteplase reperfuses a STEMI', () => {
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

  it('an overdose does not turn a tachycardia or a heart block into sinus rhythm', () => {
    // digoxin toxicity: sinus rhythm gets PVCs, but VT at 170 does not become "sinus rhythm with PVCs at 170"
    expect(planDose('digoxin', patient('normal-sinus', 72), 2).steps.map((s) => s.profile)).toEqual(['pvcs']);
    for (const [id, hr] of [['vt', 170], ['avnrt', 180], ['third-degree-avb', 36], ['mobitz-ii', 80], ['paced', 72]] as const) {
      const plan = planDose('digoxin', patient(id, hr), 2);
      expect(plan.verdict.tone, id).toBe('bad');
      expect(plan.steps.some((s) => s.profile !== undefined || s.hr !== undefined), id).toBe(false);
    }
    // epinephrine 0.1 mg IV with a pulse: AF gets faster, it does not become sinus tachycardia; 1 mg still ends in VT
    const af = planDose('epinephrine', patient('atrial-fibrillation', 112), 0.1);
    expect(af.steps.some((s) => s.profile !== undefined)).toBe(false);
    expect(af.steps[0].hr).toBeGreaterThan(112);
    expect(planDose('epinephrine', patient('third-degree-avb', 36), 0.1).steps.some((s) => s.profile !== undefined)).toBe(false);
    expect(planDose('epinephrine', patient('paced', 72), 0.1).steps.some((s) => s.profile !== undefined || s.hr !== undefined)).toBe(false);
    expect(planDose('epinephrine', patient('atrial-fibrillation', 112), 1).steps.map((s) => s.profile)).toEqual([undefined, 'vt']);
    expect(planDose('epinephrine', patient('normal-sinus', 72), 0.1).steps.map((s) => s.profile)).toEqual(['sinus-tachycardia', 'pvcs']);
  });

  it('AIVR is a ventricular rhythm, not a sinus one: it is not suppressed, and atropine can only let the sinus node take over', () => {
    expect(category(ECG_PROFILES.aivr, 55)).toBe('aivr');
    expect(category(ECG_PROFILES.aivr, 78)).toBe('aivr');
    const slow = planDose('atropine', patient('aivr', 55), 1);
    expect(slow.verdict.tone).toBe('caution');
    expect(slow.verdict.text).not.toMatch(/sinus bradycardia/i);
    expect(slow.steps.at(-1)).toMatchObject({ profile: 'normal-sinus' });
    expect(slow.steps.at(-1)!.hr!).toBeGreaterThan(55);
    expect(planDose('atropine', patient('aivr', 105), 1).verdict.text).toMatch(/No bradycardia/);
    for (const [id, dose] of [['lidocaine', 100], ['amiodarone', 150], ['procainamide', 1000]] as const) {
      const plan = planDose(id, patient('aivr', 78), dose);
      expect(plan.verdict.tone, id).toBe('bad');
      expect(plan.verdict.text, id).toMatch(/suppress/);
      expect(plan.verdict.text, id).not.toMatch(/no effect on sinus/);
    }
    expect(planDose('lidocaine', patient('aivr', 78), 100).steps.map((s) => s.profile)).toContain('sinus-bradycardia');
    // the AV node is not part of it: adenosine and the AV-nodal blockers neither block nor slow it
    const ado = planDose('adenosine', patient('aivr', 78), 6);
    expect(ado.steps.some((s) => s.mods?.avBlock || s.hr !== undefined)).toBe(false);
    expect(ado.verdict.text).not.toMatch(/P waves march on/);
    for (const id of ['diltiazem', 'metoprolol', 'esmolol', 'digoxin'] as MedId[]) {
      const p = patient('aivr', 78, { sbp: 118 });
      const plan = planDose(id, p, MED_BY_ID[id].usual(p).low);
      expect(plan.verdict.tone, id).toBe('bad');
      expect(plan.verdict.text, id).toMatch(/ventricular/);
      expect(plan.steps.some((s) => s.hr !== undefined), id).toBe(false);
    }
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

/** British spellings (as in the glossary's own check): the app is written in US English */
const BRITISH = /haem|aemi[ac]|ischaem|oedema|fibre|litre|tumour|colour|centre|labelled|practise|synchronis|recognis|organis|stabilis|localis|minimis|visualis|catheteris|anaesth|polaris|analys(e|ed|ing)\b|paralys|manoeuvr|oesoph|paediatr|characteris|normalis|utilis|hospitalis|vascularis/i;

describe('what the learner reads follows the current guidelines', () => {
  const text = (id: MedId, p: Patient, dose: number) => {
    const plan = planDose(id, p, dose);
    return [plan.verdict.text, ...plan.steps.map((s) => s.note)].join(' ');
  };

  it('every drug card, verdict and note is in US English', () => {
    for (const m of MEDS) {
      expect(`${m.name} ${m.route} ${m.onset} ${m.guide}`, m.id).not.toMatch(BRITISH);
      for (const prof of Object.values(ECG_PROFILES)) {
        for (const hr of Array.from(new Set([prof.minHR, prof.defaultHR, prof.maxHR]))) {
          for (const sbp of [undefined, 80, 130]) {
            const p = patient(prof.id, hr || 0, { sbp });
            for (const dose of m.picks(p)) expect(text(m.id, p, dose), `${m.id} on ${prof.id} at ${hr}`).not.toMatch(BRITISH);
          }
        }
      }
    }
  }, 30_000);

  it('sustained torsades is defibrillated at once, pulse or not — then magnesium', () => {
    const t = patient('torsades', 230);
    for (const [id, dose] of [['amiodarone', 150], ['procainamide', 1000], ['lidocaine', 100]] as const) {
      const says = planDose(id, t, dose).verdict.text;
      expect(says, id).toMatch(/unsynchronized/);
      expect(says, id).toMatch(/pulse or not/);
      expect(says, id).not.toMatch(/if pulseless/);
      expect(says, id).toMatch(/magnesium/i);
    }
    // the torsades that procainamide toxicity causes is shocked at once too
    const tox = planDose('procainamide', patient('normal-sinus', 72), 2000).steps.find((s) => s.profile === 'torsades')!;
    expect(tox.note).toMatch(/unsynchronized/);
    expect(tox.note).not.toMatch(/if pulseless/);
  });

  it('calcium is 1 g (10 mL of 10%); in a hyperkalemic arrest neither calcium nor bicarbonate has an established benefit, and CPR does not pause for them', () => {
    const ca = MED_BY_ID['calcium-chloride'];
    expect(ca.guide).toMatch(/1 g \(10 mL of 10%\)/);
    expect(classifyDose(ca, patient('hyperkalemia', 64), 1)).toBe('usual');
    expect(classifyDose(ca, patient('hyperkalemia', 64), 0.5)).toBe('low');
    for (const id of ['calcium-chloride', 'sodium-bicarbonate'] as MedId[]) {
      for (const arrest of ['vf', 'pea', 'asystole']) {
        const says = planDose(id, patient(arrest, 0), MED_BY_ID[id].usual(patient(arrest, 0)).low).verdict.text;
        expect(says, `${id} in ${arrest}`).toMatch(/hyperkalemi/);
        expect(says, `${id} in ${arrest}`).toMatch(/not well established/);
        expect(says, `${id} in ${arrest}`).toMatch(/pausing CPR|pause CPR/);
      }
    }
  });

  it('aortic dissection: β-blockade to a heart rate of 60–80 and a systolic pressure below 120 mmHg; metoprolol over 2 min', () => {
    expect(MED_BY_ID.metoprolol.route).toMatch(/over 2 min/);
    expect(MED_BY_ID.metoprolol.route).not.toMatch(/1–2 min/);
    for (const [id, dose] of [['metoprolol', 5], ['esmolol', 40]] as const) {
      for (const hr of [104, 130]) {
        const plan = planDose(id, patient('aortic-dissection', hr, { sbp: 150 }), dose);
        expect(plan.verdict.text, id).toMatch(/60–80/);
        expect(plan.verdict.text, id).toMatch(/below 120 mmHg/);
        expect(plan.verdict.text, id).not.toMatch(/≈ 60|100–120/);
      }
      // titrated to the target, the rate does not fall below it
      for (const hr of [62, 70, 90]) {
        const p = patient('aortic-dissection', hr, { sbp: 150 });
        const steps = planDose(id, p, MED_BY_ID[id].usual(p).high).steps.filter((s) => s.hr !== undefined);
        for (const s of steps) expect(s.hr, `${id} from ${hr}`).toBeGreaterThanOrEqual(60);
      }
    }
    // three doses of 5 mg of metoprolol (the 15 mg maximum) still stop at the target
    const third = patient('aortic-dissection', 70, { sbp: 150, given: [{ id: 'metoprolol', dose: 5, at: 0 }, { id: 'metoprolol', dose: 5, at: 1 }] });
    expect(planDose('metoprolol', third, 5).steps.find((s) => s.hr !== undefined)!.hr).toBeGreaterThanOrEqual(60);
    // once the rate is inside the target, the pressure is the next job: a vasodilator, not more β-blocker
    for (const [id, dose] of [['metoprolol', 5], ['esmolol', 40]] as const) {
      for (const hr of [62, 70, 80]) {
        const plan = planDose(id, patient('aortic-dissection', hr, { sbp: 150 }), dose);
        expect(plan.verdict.tone, `${id} at ${hr}`).toBe('caution');
        expect(plan.verdict.text, `${id} at ${hr}`).toMatch(/inside the 60–80\/min target.*vasodilator/);
        expect(plan.steps.map((s) => s.note).join(' '), `${id} at ${hr}`).not.toMatch(/toward the target of 60–80/);
      }
      expect(planDose(id, patient('aortic-dissection', 81, { sbp: 150 }), dose).verdict.tone, id).toBe('good');
    }
  });

  it('adenosine is 6 mg, then 12 mg: after both, more is not offered as the cure', () => {
    expect(MED_BY_ID.adenosine.guide).not.toMatch(/second 12 mg/);
    const svt = patient('avnrt', 180);
    const both = { ...svt, given: [{ id: 'adenosine' as MedId, dose: 6, at: 0 }, { id: 'adenosine' as MedId, dose: 12, at: 1 }] };
    const third = planDose('adenosine', both, 12);
    expect(third.verdict.tone).toBe('caution');
    expect(third.verdict.text).toMatch(/6 mg, then 12 mg/);
    expect(third.steps.some((s) => s.profile === 'normal-sinus')).toBe(false);
    // the 12 mg after a failed 6 mg still works, and so does a full dose after an under-dose
    expect(planDose('adenosine', { ...svt, given: [{ id: 'adenosine', dose: 6, at: 0 }] }, 12).steps.some((s) => s.profile === 'normal-sinus')).toBe(true);
    expect(planDose('adenosine', { ...svt, given: [{ id: 'adenosine', dose: 3, at: 0 }, { id: 'adenosine', dose: 6, at: 1 }] }, 12).steps.some((s) => s.profile === 'normal-sinus')).toBe(true);
    // in a rhythm adenosine does not treat, a further dose still blocks the AV node for a few seconds
    const given = both.given;
    const af = planDose('adenosine', patient('atrial-fibrillation', 112, { given }), 12);
    expect(af.verdict.text).toMatch(/does not convert atrial fibrillation/);
    expect(af.steps.find((s) => s.hr !== undefined)!.hr).toBeLessThan(112);
    expect(af.steps.some((s) => s.restore)).toBe(true);
    const flutter = planDose('adenosine', patient('atrial-flutter', 150, { given }), 12);
    expect(flutter.steps.some((s) => s.mark === 'F waves')).toBe(true);
    const sinus = planDose('adenosine', patient('normal-sinus', 72, { given }), 12);
    expect(sinus.verdict.tone).toBe('bad');
    expect(sinus.steps.some((s) => s.mods?.avBlock)).toBe(true);
  });

  it('tenecteplase is one bolus over about 5 s; in PE it is for cardiopulmonary failure (category E), not for a PE with a normal pressure', () => {
    const tnk = MED_BY_ID.tenecteplase;
    expect(tnk.route).toMatch(/about 5 s/);
    const shocked = planDose('tenecteplase', patient('pulmonary-embolism', 120, { sbp: 78 }), 45);
    expect(shocked.verdict.text).toMatch(/cardiopulmonary failure/);
    expect(shocked.verdict.text).toMatch(/category E/);
    expect(shocked.verdict.text).not.toMatch(/^Massive/);
    expect(shocked.verdict.tone).not.toBe('bad');
    const normotensive = planDose('tenecteplase', patient('pulmonary-embolism', 114, { sbp: 124 }), 45);
    expect(normotensive.verdict.tone).toBe('bad');
    expect(normotensive.verdict.text).toMatch(/categor/);
    for (const id of ['normal-sinus', 'atrial-fibrillation']) {
      expect(planDose('tenecteplase', patient(id, 80), 45).verdict.text).not.toMatch(/massive/i);
    }
    // reperfusion rhythm: about 50–120/min, usually under 100
    const reperfusion = planDose('tenecteplase', patient('anterior-stemi', 92), 45).steps.map((s) => s.note).join(' ');
    expect(reperfusion).toMatch(/50–120\/min, usually under 100/);
  });

  it('heparin in PE: LMWH is preferred; unfractionated heparin when lysis, a procedure or rapid reversal may be needed, or the kidneys fail', () => {
    expect(MED_BY_ID.heparin.guide).toMatch(/LMWH/);
    const pe = planDose('heparin', patient('pulmonary-embolism', 114, { sbp: 124 }), 6400);
    expect(pe.verdict.tone).toBe('caution');
    expect(pe.verdict.text).toMatch(/LMWH/);
    expect(pe.verdict.text).toMatch(/renal/);
    const shocked = planDose('heparin', patient('pulmonary-embolism', 120, { sbp: 78 }), 6400);
    expect(shocked.verdict.tone).toBe('good');
    expect(shocked.verdict.text).toMatch(/lysis|procedure/);
    // ACS is unchanged
    expect(planDose('heparin', patient('anterior-stemi', 92), 4000).verdict.tone).toBe('good');
  });

  it('nitroglycerin is held for the 2025 reasons; a slow heart rate is a caution, not a contraindication', () => {
    const g = MED_BY_ID.nitroglycerin.guide;
    expect(g).toMatch(/SBP < 90 mmHg/);
    expect(g).toMatch(/30 mmHg below baseline/);
    expect(g).toMatch(/avanafil[^.]*12 h/);
    expect(g).toMatch(/sildenafil or vardenafil[^.]*24 h/);
    expect(g).toMatch(/tadalafil[^.]*48 h/);
    expect(g).toMatch(/RV infarction/);
    expect(g).toMatch(/aortic stenosis/);
    const slow = planDose('nitroglycerin', patient('nstemi', 46, { sbp: 132 }), 0.4);
    expect(slow.verdict.tone).toBe('caution');
    expect(slow.verdict.text).toMatch(/46\/min/);
    expect(planDose('nitroglycerin', patient('anterior-stemi', 46, { sbp: 132 }), 0.4).verdict.tone).toBe('caution');
    // the contraindications themselves still refuse it
    expect(planDose('nitroglycerin', patient('nstemi', 46, { sbp: 84 }), 0.4).verdict.tone).toBe('bad');
    expect(planDose('nitroglycerin', patient('aortic-stenosis', 72, { sbp: 120 }), 0.4).verdict.tone).toBe('bad');
    // at an ordinary rate nothing changes
    expect(planDose('nitroglycerin', patient('nstemi', 88, { sbp: 130 }), 0.4).verdict.tone).toBe('good');
    // an inferior MI with complete heart block is not "no indication": the pain is ischemic, the block is why to hold
    const chb = planDose('nitroglycerin', patient('inferior-stemi-chb', 40, { sbp: 112 }), 0.4);
    expect(chb.verdict.tone).toBe('bad');
    expect(chb.verdict.text).not.toMatch(/No indication/);
    expect(chb.verdict.text).toMatch(/heart block at 40\/min.*right ventricle.*V4R/);
    // the slow inferior STEMI names V4R once, not twice
    const slowInferior = planDose('nitroglycerin', patient('inferior-stemi', 45, { sbp: 120 }), 0.4).verdict.text;
    expect(slowInferior.match(/V4R/g)).toHaveLength(1);
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

  /** run the simulation like SimulationDriver does, 16 ms at a time (coarser steps for long waits) */
  function run(ms: number, dt = 16) {
    for (let t = 0; t < ms; t += dt) {
      const ecg = useECGStore.getState();
      sim.engine.setRhythm(ecg.activeProfileId, useTimelineStore.getState().heartRate, sim.time, useMedStore.getState().mods);
      sim.time += dt;
      sim.engine.ensure(sim.time + 4000);
      tickMeds(sim.time);
    }
  }
  const monitor = () => `${useECGStore.getState().activeProfileId}@${useTimelineStore.getState().heartRate}`;
  /** let every effect still to come happen, one skip at a time */
  function playOut() {
    for (let i = 0; i < 40 && useMedStore.getState().next; i++) {
      useMedStore.getState().skipAhead();
      run(2_000);
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

  it('the case simulator taking the monitor ends the session: nothing still to come, no dose record, the untreated rhythm back', () => {
    setRhythm('atrial-fibrillation', 150);
    useMedStore.getState().give('procainamide', 1000);
    useMedStore.getState().skipAhead();
    run(2_000);
    expect(useMedStore.getState().mods).not.toBeNull();
    useMedStore.getState().give('diltiazem', 20);
    playOut();
    expect(useTimelineStore.getState().heartRate).toBeLessThan(150);
    useAppStore.getState().setMode('simulator');
    tickMeds(sim.time + 10 * 60_000);
    expect(useMedStore.getState().next).toBeNull();
    expect(useMedStore.getState().mods).toBeNull();
    expect(useMedStore.getState().given).toHaveLength(0);
    expect(useMedStore.getState().log).toHaveLength(0);
    expect(monitor()).toBe('atrial-fibrillation@150');
  });

  it('the main menu is not another patient: the effects still to come arrive, and the dose record stays', () => {
    setRhythm('normal-sinus', 72);
    useMedStore.getState().give('epinephrine', 0.04);
    run(40_000);
    expect(monitor()).toBe('normal-sinus@97');
    useAppStore.getState().setMode('home');
    run(1_000);
    expect(useMedStore.getState().next).not.toBeNull();
    useAppStore.getState().setMode('learn');
    run(8 * 60_000, 100);
    expect(monitor()).toBe('normal-sinus@72');
    expect(useMedStore.getState().given).toHaveLength(1);
    expect(useMedStore.getState().log.at(-1)!.text).toMatch(/Wears off/);
  });

  it('a new rhythm comes at its own rate: procainamide toxicity is torsades at ~230/min, not at the sinus rate', () => {
    setRhythm('normal-sinus', 72);
    const plan = useMedStore.getState().give('procainamide', 2000);
    expect(plan.doseClass).toBe('toxic');
    playOut();
    expect(monitor()).toBe(`torsades@${ECG_PROFILES.torsades.defaultHR}`);
    // from AF as well
    useMedStore.getState().reset();
    setRhythm('atrial-fibrillation', 112);
    useMedStore.getState().give('procainamide', 2000);
    playOut();
    expect(monitor()).toBe(`torsades@${ECG_PROFILES.torsades.defaultHR}`);
  });

  it('a step that only changes the rate keeps the rhythm, and one that names the rhythm on the monitor keeps its rate', () => {
    setRhythm('atrial-fibrillation', 150);
    useMedStore.getState().give('diltiazem', 20);
    playOut();
    expect(useECGStore.getState().activeProfileId).toBe('atrial-fibrillation');
    expect(useTimelineStore.getState().heartRate).toBe(102);
  });

  it('a small dose of atropine wearing off does not undo the full dose given after it', () => {
    setRhythm('sinus-bradycardia', 46);
    useMedStore.getState().give('atropine', 0.4);
    run(20_000);
    useMedStore.getState().give('atropine', 1);
    run(200_000, 100);
    expect(useMedStore.getState().next).toBeNull();
    expect(monitor()).toBe('normal-sinus@84');
    // the log does not claim the rhythm went "back to where it was"
    expect(useMedStore.getState().log.at(-1)!.text).not.toMatch(/Back to where it was/);
  });

  it('a pressor wearing off does not bring back the SVT that adenosine stopped meanwhile', () => {
    useMedStore.getState().give('phenylephrine', 100);
    run(60_000, 50);
    expect(monitor()).toBe('avnrt@155');
    useMedStore.getState().give('adenosine', 6);
    run(120_000, 50);
    expect(monitor()).toBe('normal-sinus@84');
    run(12 * 60_000, 200);
    expect(useMedStore.getState().next).toBeNull();
    expect(monitor()).toBe('normal-sinus@84');
  });

  it('a transient effect on its own still wears off to the rhythm it started from', () => {
    useMedStore.getState().give('phenylephrine', 100);
    run(60_000, 50);
    expect(monitor()).toBe('avnrt@155');
    run(12 * 60_000, 200);
    expect(monitor()).toBe('avnrt@180');
    expect(useMedStore.getState().log.at(-1)!.text).toBe('Wears off.');
  });

  it('two transient doses on top of each other both wear off: the patient ends where they started', () => {
    setRhythm('sinus-bradycardia', 46);
    useMedStore.getState().give('epinephrine', 0.02);
    run(60_000, 50);
    expect(monitor()).toBe('normal-sinus@74');
    useMedStore.getState().give('epinephrine', 0.02);
    run(60_000, 50);
    expect(useTimelineStore.getState().heartRate).toBeGreaterThan(74);
    run(10 * 60_000, 200);
    expect(useMedStore.getState().next).toBeNull();
    expect(monitor()).toBe('sinus-bradycardia@46');
  });

  it('a short effect inside a long one: each wears off to what was there before it', () => {
    setRhythm('normal-sinus', 80);
    useMedStore.getState().give('phenylephrine', 100);
    run(60_000, 50);
    expect(monitor()).toBe('normal-sinus@69');
    useMedStore.getState().give('adenosine', 6);
    run(30_000, 50);
    // adenosine's seconds of AV block are over: back to the rate the pressor holds
    expect(monitor()).toBe('normal-sinus@69');
    expect(useMedStore.getState().mods).toBeNull();
    run(12 * 60_000, 200);
    expect(monitor()).toBe('normal-sinus@80');
  });

  it('a step planned for a rhythm that another drug has already ended does not act on the new rhythm', () => {
    useMedStore.getState().give('diltiazem', 20);
    run(30_000, 50);
    useMedStore.getState().give('adenosine', 6);
    const rates: string[] = [];
    for (let i = 0; i < 60; i++) {
      run(5_000, 50);
      rates.push(monitor());
    }
    // adenosine stops the SVT; diltiazem's "the SVT slows slightly" (to 166/min) must not then speed the sinus rhythm up
    expect(rates.at(-1)).toBe('normal-sinus@84');
    expect(rates.filter((r) => r.startsWith('normal-sinus')).every((r) => Number(r.split('@')[1]) <= 96)).toBe(true);
    // diltiazem is still on board: its longer PR shows on the sinus rhythm
    expect(useMedStore.getState().mods).toMatchObject({ prAdd: 30 });
    expect(useMedStore.getState().log.filter((l) => /SVT terminated/.test(l.text))).toHaveLength(0);
    expect(useMedStore.getState().log.filter((l) => /the SVT is terminated/.test(l.text))).toHaveLength(1);
  });

  it('a second rate-control drug never speeds the heart up to "its" rate', () => {
    setRhythm('atrial-fibrillation', 150);
    useMedStore.getState().give('diltiazem', 20);
    run(60_000, 50);
    useMedStore.getState().give('metoprolol', 5);
    let last = 150;
    for (let i = 0; i < 80; i++) {
      run(5_000, 50);
      const hr = useTimelineStore.getState().heartRate;
      expect(hr).toBeLessThanOrEqual(last);
      last = hr;
    }
    expect(useMedStore.getState().next).toBeNull();
    expect(last).toBe(102);
    // …and a drug that speeds the heart up is not undone by one that was already acting: atropine after a pressor
    useMedStore.getState().reset();
    setRhythm('lbbb', 40);
    useMedStore.getState().give('phenylephrine', 100);
    run(10_000, 50);
    useMedStore.getState().give('atropine', 1);
    run(200_000, 100);
    expect(monitor()).toBe('lbbb@84');
    run(12 * 60_000, 200);
    expect(monitor()).toBe('lbbb@84');
  });

  it('a transient effect does not come back over a rate the learner set by hand', () => {
    setRhythm('normal-sinus', 80);
    useMedStore.getState().give('phenylephrine', 100);
    run(60_000, 50);
    useTimelineStore.getState().setHeartRate(110);
    run(12 * 60_000, 200);
    expect(monitor()).toBe('normal-sinus@110');
  });
});

describe('hyperkalemia shifters and the P2Y12 loads', () => {
  it('insulin with dextrose lowers the potassium on the ECG of hyperkalemia, and warns about the glucose', () => {
    const plan = planDose('insulin-dextrose', patient('hyperkalemia', 70), 10);
    expect(plan.doseClass).toBe('usual');
    expect(plan.verdict.tone).toBe('good');
    expect(plan.steps.some((s) => (s.mods?.tScale ?? 1) < 1)).toBe(true);
    expect(plan.steps.map((s) => s.note).join(' ')).toMatch(/glucose/);
    expect(planDose('insulin-dextrose', patient('normal-sinus', 72), 10).verdict.tone).toBe('bad');
    expect(planDose('insulin-dextrose', patient('hyperkalemia', 70), 20).doseClass).toBe('high');
  });

  it('albuterol for hyperkalemia needs the big dose, speeds the heart, and is no arrest drug', () => {
    const big = planDose('albuterol', patient('hyperkalemia', 70), 10);
    expect(big.doseClass).toBe('usual');
    expect(big.verdict.tone).toBe('good');
    expect(big.steps.some((s) => (s.hr ?? 0) > 70)).toBe(true);
    const small = planDose('albuterol', patient('hyperkalemia', 70), 2.5);
    expect(small.doseClass).toBe('low');
    expect(small.verdict.tone).toBe('caution');
    // the wheezing dose is the usual dose when there is no hyperkalemia
    expect(planDose('albuterol', patient('normal-sinus', 72), 2.5).doseClass).toBe('usual');
    expect(planDose('albuterol', patient('vf', 0), 10).verdict.tone).toBe('bad');
    expect(planDose('albuterol', patient('atrial-fibrillation', 150), 5).verdict.tone).toBe('bad');
  });

  it('a P2Y12 load belongs to ACS — ticagrelor preferred, prasugrel at PCI, never with a dissection', () => {
    expect(planDose('ticagrelor', patient('anterior-stemi', 90), 180)).toMatchObject({ doseClass: 'usual', verdict: { tone: 'good' } });
    expect(planDose('prasugrel', patient('nstemi', 85), 60).verdict.text).toMatch(/at PCI/);
    expect(planDose('prasugrel', patient('nstemi', 85), 60).verdict.text).toMatch(/stroke or TIA/);
    expect(planDose('clopidogrel', patient('inferior-stemi', 70), 600).verdict.text).toMatch(/fibrinolysis/);
    for (const id of ['ticagrelor', 'clopidogrel', 'prasugrel'] as const) {
      expect(planDose(id, patient('aortic-dissection', 100), MED_BY_ID[id].usual(patient('aortic-dissection', 100)).low).verdict.tone).toBe('bad');
      expect(planDose(id, patient('normal-sinus', 72), MED_BY_ID[id].usual(patient('normal-sinus', 72)).low).verdict.tone).toBe('bad');
    }
  });
});
