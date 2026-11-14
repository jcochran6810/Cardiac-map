import { beforeEach, describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import { applyMods, combineMods, describeMods, modsKey } from '@/lib/ecg/mods';
import { HISTORY, MEDS, MED_BY_ID, category, classifyDose, describeDose, planDose, type MedId, type Patient } from '@/lib/sim/meds';
import type { Problem } from '@/lib/sim/scenario/types';
import { sim } from '@/lib/sim/simulation';
import { setRhythm, showRhythm } from '@/lib/rhythm';
import { SCENARIOS, loadScenario, useDefibStore } from '@/lib/sim/defib';
import { applyVtHeart, useMedStore, tickMeds } from '@/store/useMedStore';
import { useAppStore } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { MEDICATION_IDS } from '@/types/content';
import { MEDICATIONS } from '@/data/content/medications';

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
  }, 30_000);

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

  it('the newer tracings: a narrow PEA is an arrest, every stage of hyperkalemia is hyperkalemia, a temporary wire is paced', () => {
    expect(category(ECG_PROFILES['pea-narrow'], 110)).toBe('arrest');
    expect(category(ECG_PROFILES['pea-narrow'])).toBe(category(ECG_PROFILES.pea));
    for (const id of ['hyperkalemia', 'hyperkalemia-moderate', 'hyperkalemia-severe']) expect(category(ECG_PROFILES[id], 70), id).toBe('hyperk');
    expect(category(ECG_PROFILES['paced-vvi'], 70)).toBe('paced');
    expect(category(ECG_PROFILES['paced-vvi'], 70)).toBe(category(ECG_PROFILES.tcp, 70));
    // calcium is the drug for the sine wave
    expect(planDose('calcium-chloride', patient('hyperkalemia-severe', 60), 1).verdict.tone).toBe('good');
  });

  it('Takotsubo with LV outflow obstruction is judged like obstructive HCM: no nitrate, no epinephrine; phenylephrine for the low pressure', () => {
    const lvoto = (extra: Partial<Patient> = {}) => patient('takotsubo-lvoto', 118, { sbp: 82, ...extra });
    expect(planDose('nitroglycerin', lvoto({ sbp: 110 }), 0.4).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/Takotsubo with LV outflow obstruction/) });
    expect(planDose('epinephrine', lvoto(), 0.02).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not in Takotsubo with LV outflow obstruction/) });
    expect(planDose('phenylephrine', lvoto(), 0.1).verdict.tone).toBe('good');
    // the plain Takotsubo heart is not obstructed
    expect(planDose('epinephrine', patient('takotsubo', 102, { sbp: 82 }), 0.02).verdict.text).not.toMatch(/outflow obstruction/);
  });

  it('a low glucose: insulin is contraindicated (label) — dextrose first, then recheck; dextrose is the treatment', () => {
    expect(HISTORY.find((h) => h.id === 'hypoglycemia')?.label).toBe('Low glucose (hypoglycemia)');
    const hyperk = (problems: Problem[]) => patient('hyperkalemia', 64, { problems });
    expect(planDose('insulin-dextrose', hyperk(['hypoglycemia']), 10).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Contraindicated during hypoglycemia.*dextrose first.*recheck/) });
    expect(planDose('insulin-dextrose', hyperk([]), 10).verdict.tone).toBe('good');
    expect(planDose('dextrose', patient('normal-sinus', 96, { problems: ['hypoglycemia'] }), 25).verdict).toMatchObject({ tone: 'good', text: expect.stringMatching(/recheck/) });
    // without a low glucose on the page: check it first
    expect(planDose('dextrose', patient('normal-sinus', 96), 25).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Check the glucose first/) });
    expect(MED_BY_ID.dextrose.usual(patient('normal-sinus', 96))).toEqual({ low: 10, high: 25 });
  });

  it('lupus: procainamide is contraindicated (label), and the history offers the chip', () => {
    expect(HISTORY.find((h) => h.id === 'lupus')?.label).toBe('Lupus (SLE)');
    const vt = (problems: Problem[]) => patient('vt', 160, { sbp: 120, problems });
    expect(planDose('procainamide', vt(['lupus']), 1000).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/lupus/) });
    expect(planDose('procainamide', vt([]), 1000).verdict.text).not.toMatch(/lupus/);
  });

  it('the SCAD page draws an anterior STEMI, but a lytic there is harmful: no clot to lyse', () => {
    const scad = patient('anterior-stemi', 92, { sbp: 128, conditionId: 'scad' });
    expect(planDose('tenecteplase', scad, 45).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/spontaneous coronary artery dissection/) });
    expect(planDose('tenecteplase', patient('anterior-stemi', 92, { sbp: 128 }), 45).verdict.tone).toBe('good');
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

  it('nitroglycerin is held for the reasons on the drug card: the pressure, the heart rate, RV infarction, aortic stenosis, PDE-5 inhibitors', () => {
    const g = MED_BY_ID.nitroglycerin.guide;
    expect(g).toMatch(/SBP < 90 mmHg/);
    expect(g).toMatch(/30 mmHg below baseline/);
    expect(g).toMatch(/avanafil[^.]*12 h/);
    expect(g).toMatch(/sildenafil or vardenafil[^.]*24 h/);
    expect(g).toMatch(/tadalafil[^.]*48 h/);
    expect(g).toMatch(/RV infarction/);
    expect(g).toMatch(/aortic stenosis/);
    expect(g).toMatch(/bradycardia \(< 50\/min\) or tachycardia \(> 100\/min\) without heart failure/);
    // the library's drug card (and the tutor) say the same
    const card = MEDICATIONS.nitroglycerin.contraindications.join(' ');
    expect(card).toMatch(/bradycardia \(< 50\/min\), or tachycardia \(> 100\/min\) without heart failure/);
    // marked bradycardia: held, in an NSTEMI and in a STEMI
    const slow = planDose('nitroglycerin', patient('nstemi', 46, { sbp: 132 }), 0.4);
    expect(slow.verdict.tone).toBe('bad');
    expect(slow.verdict.text).toMatch(/46\/min is marked bradycardia/);
    expect(planDose('nitroglycerin', patient('anterior-stemi', 46, { sbp: 132 }), 0.4).verdict.tone).toBe('bad');
    expect(planDose('nitroglycerin', patient('hfref', 46, { sbp: 132 }), 0.4).verdict.tone).toBe('bad');
    // tachycardia without heart failure: held in every acute coronary syndrome
    for (const [id, hr] of [['nstemi', 120], ['wellens', 115], ['anterior-stemi', 118], ['lateral-stemi', 104], ['inferior-stemi', 110]] as const) {
      const fast = planDose('nitroglycerin', patient(id, hr, { sbp: 130 }), 0.4);
      expect(fast.verdict.tone, `${id} at ${hr}`).toBe('bad');
      expect(fast.verdict.text, `${id} at ${hr}`).toMatch(new RegExp(`${hr}/min without heart failure`));
    }
    // …but a fast heart in heart failure is no reason to hold them
    expect(planDose('nitroglycerin', patient('hfref', 118, { sbp: 150 }), 0.4).verdict.tone).toBe('good');
    expect(planDose('nitroglycerin', patient('hfpef', 112, { sbp: 160 }), 0.4).verdict.tone).toBe('good');
    // the edges: 50 and 100 are not "marked"
    expect(planDose('nitroglycerin', patient('nstemi', 50, { sbp: 130 }), 0.4).verdict.tone).toBe('good');
    expect(planDose('nitroglycerin', patient('nstemi', 100, { sbp: 130 }), 0.4).verdict.tone).toBe('good');
    // the other contraindications still refuse it
    expect(planDose('nitroglycerin', patient('nstemi', 46, { sbp: 84 }), 0.4).verdict.tone).toBe('bad');
    expect(planDose('nitroglycerin', patient('aortic-stenosis', 72, { sbp: 120 }), 0.4).verdict.tone).toBe('bad');
    // at an ordinary rate nothing changes
    expect(planDose('nitroglycerin', patient('nstemi', 88, { sbp: 130 }), 0.4).verdict.tone).toBe('good');
    expect(planDose('nitroglycerin', patient('anterior-stemi', 92, { sbp: 130 }), 0.4).verdict.tone).toBe('caution');
    // no indication stays no indication, whatever the rate
    expect(planDose('nitroglycerin', patient('normal-sinus', 120, { sbp: 130 }), 0.4).verdict.text).toMatch(/No indication/);
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
    run(6_000);
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
    // after fibrinolysis: clopidogrel, not the newer two
    const lysed = patient('anterior-stemi-reperfused', 80, { given: [{ id: 'tenecteplase', dose: 40, at: 1000 }] });
    expect(planDose('clopidogrel', lysed, 300).verdict.tone).toBe('good');
    expect(planDose('ticagrelor', lysed, 180).verdict.tone).toBe('caution');
    expect(planDose('prasugrel', lysed, 60).verdict.tone).toBe('caution');
    // ticagrelor can cause pauses and AV block: not "good" with a high-grade block
    expect(planDose('ticagrelor', patient('inferior-stemi-chb', 40), 180).verdict.tone).toBe('caution');
    for (const id of ['ticagrelor', 'clopidogrel', 'prasugrel'] as const) {
      expect(planDose(id, patient('aortic-dissection', 100), MED_BY_ID[id].usual(patient('aortic-dissection', 100)).low).verdict.tone).toBe('bad');
      expect(planDose(id, patient('normal-sinus', 72), MED_BY_ID[id].usual(patient('normal-sinus', 72)).low).verdict.tone).toBe('bad');
    }
  });
});

describe('the P2Y12 inhibitors: one at a time, and the load after lysis', () => {
  const t180 = { id: 'ticagrelor' as const, dose: 180, at: 1000 };
  const lysis = { id: 'tenecteplase' as const, dose: 45, at: 500 };

  it('a second load — the same drug again or another one — is refused, and a repeat is judged on the total', () => {
    const loaded = patient('anterior-stemi', 90, { given: [t180] });
    for (const id of ['ticagrelor', 'clopidogrel', 'prasugrel'] as const) {
      const plan = planDose(id, loaded, MED_BY_ID[id].usual(loaded).high);
      expect(plan.verdict.tone, id).toBe('bad');
      expect(plan.verdict.text, id).toMatch(/already been loaded \(ticagrelor 180 mg\): one at a time, with aspirin/);
      expect(plan.verdict.text, id).toMatch(/cardiologist's decision/);
    }
    // the reviewers' run: the last ticagrelor 180 mg was "the usual dose" with 360 mg given in all
    const again = planDose('ticagrelor', loaded, 180);
    expect(again.doseClass).toBe('high');
    expect(again.doseText).toBe('180 mg (360 mg in all) — above the usual 180 mg');
    const chain = patient('anterior-stemi', 90, { given: [t180, { id: 'clopidogrel', dose: 600, at: 2000 }, { id: 'prasugrel', dose: 60, at: 3000 }] });
    expect(planDose('ticagrelor', chain, 180).verdict.text).toMatch(/ticagrelor 180 mg, then clopidogrel 600 mg, then prasugrel 60 mg/);
    expect(classifyDose(MED_BY_ID.clopidogrel, patient('anterior-stemi', 90, { given: [{ id: 'clopidogrel', dose: 600, at: 1 }] }), 600)).toBe('toxic');
    // a first load is judged as before, and other drugs given before it do not count toward it
    expect(planDose('clopidogrel', patient('anterior-stemi', 90, { given: [{ id: 'aspirin', dose: 325, at: 1 }] }), 600))
      .toMatchObject({ doseClass: 'usual', doseText: '600 mg — the usual dose', verdict: { tone: 'caution' } });
    expect(planDose('ticagrelor', patient('anterior-stemi', 90), 180)).toMatchObject({ doseClass: 'usual', verdict: { tone: 'good' } });
  });

  it('a load given in parts is one load: the dose that completes it is judged with it, not as a second load', () => {
    // the reviewers' run: ticagrelor 90 mg, then 90 mg, was "not the right drug … a second load" — "(180 mg in all) — the usual dose"
    const half = patient('anterior-stemi', 90, { given: [{ id: 'ticagrelor', dose: 90, at: 1000 }] });
    const rest = planDose('ticagrelor', half, 90);
    expect(rest.doseClass).toBe('usual');
    expect(rest.doseText).toBe('90 mg (180 mg in all) — the usual dose');
    expect(rest.verdict.tone).toBe('good');
    expect(rest.verdict.text).toMatch(/completes the load \(90 mg given before, 180 mg in all\)/);
    expect(rest.verdict.text).not.toMatch(/already been loaded/);
    // still short, or past the load: judged on the total, never as a second load
    const quarter = patient('anterior-stemi', 90, { given: [{ id: 'clopidogrel', dose: 75, at: 1000 }] });
    expect(planDose('clopidogrel', quarter, 75)).toMatchObject({ doseClass: 'low', verdict: { tone: 'caution' } });
    expect(planDose('clopidogrel', quarter, 75).verdict.text).toMatch(/still short \(75 mg given before, 150 mg in all\)/);
    expect(planDose('clopidogrel', quarter, 825).doseClass).toBe('high');
    expect(planDose('clopidogrel', quarter, 825).verdict.text).toMatch(/more than one load/);
    // a full load already given, or another P2Y12 inhibitor started: a second load
    const full = patient('anterior-stemi', 90, { given: [t180] });
    expect(planDose('ticagrelor', full, 180).verdict.tone).toBe('bad');
    expect(planDose('ticagrelor', full, 180).verdict.text).toMatch(/already been loaded \(ticagrelor 180 mg\)/);
    expect(planDose('clopidogrel', half, 600).verdict.tone).toBe('bad');
    expect(planDose('clopidogrel', half, 600).verdict.text).toMatch(/already been loaded \(ticagrelor 90 mg\)/);
    // after lysis: clopidogrel 75 mg, then 225 mg, is the 300 mg load
    const lysed75 = patient('anterior-stemi', 90, { given: [lysis, { id: 'clopidogrel', dose: 75, at: 1000 }] });
    const lysisRest = planDose('clopidogrel', lysed75, 225);
    expect(lysisRest).toMatchObject({ doseClass: 'usual', doseText: '225 mg (300 mg in all) — the usual dose', verdict: { tone: 'good' } });
    expect(lysisRest.verdict.text).toMatch(/completes the load/);
    const lysisOver = planDose('clopidogrel', lysed75, 525);
    expect(lysisOver.doseClass).toBe('high');
    expect(lysisOver.verdict.text).toMatch(/600 mg in all is more than the load after lysis/);
    expect(lysisOver.steps.some((s) => s.tone === 'warn' && /600 mg in all .* 600 mg is the PCI load/.test(s.note))).toBe(true);
    expect(planDose('clopidogrel', lysed75, 75).verdict.text).toMatch(/150 mg in all is short of the 300 mg load after lysis/);
    // the clopidogrel 300 mg load after lysis already given: a second load
    expect(planDose('clopidogrel', patient('anterior-stemi', 90, { given: [lysis, { id: 'clopidogrel', dose: 300, at: 1000 }] }), 300).verdict.tone).toBe('bad');
  });

  it('after tenecteplase the clopidogrel load is 300 mg (no load over 75): 600 mg is classed high, and the text says the age is not set', () => {
    const lysed = patient('anterior-stemi', 90, { given: [lysis] });
    const right = planDose('clopidogrel', lysed, 300);
    expect(right).toMatchObject({ doseClass: 'usual', verdict: { tone: 'good' } });
    expect(right.verdict.text).toMatch(/age is not set: 300 mg is the load at 75 or younger/);
    // the reviewers' run: 600 mg after lysis was "the usual dose"
    const pci = planDose('clopidogrel', lysed, 600);
    expect(pci.doseClass).toBe('high');
    expect(pci.doseText).toBe('600 mg — above the usual 300 mg');
    expect(pci.verdict.text).toMatch(/600 mg is more than the load after lysis/);
    expect(pci.steps.some((s) => s.tone === 'warn' && /PCI load/.test(s.note))).toBe(true);
    const old = planDose('clopidogrel', lysed, 75);
    expect(old.doseClass).toBe('low');
    expect(old.verdict.text).toMatch(/75 mg with no load is the dose over 75 years/);
    // without lysis, 600 mg is the PCI load
    expect(classifyDose(MED_BY_ID.clopidogrel, patient('anterior-stemi', 90), 600)).toBe('usual');
  });
});

describe('VT with a pulse: every antiarrhythmic reads right for a stable and an unstable patient', () => {
  const stable = (id: MedId, dose: number) => planDose(id, patient('vt', 150, { sbp: 112 }), dose);
  const unstable = (id: MedId, dose: number) => planDose(id, patient('vt', 150, { sbp: 72 }), dose);

  it('the stable-VT drugs end a stable VT; an unstable one is sent to synchronized cardioversion, whatever the dose', () => {
    for (const [id, dose] of [['procainamide', 17 * 80], ['amiodarone', 150], ['sotalol', 120]] as const) {
      expect(stable(id, dose).verdict.tone, id).toBe('good');
      expect(stable(id, dose).steps.some((s) => s.profile === 'normal-sinus'), id).toBe(true);
      const u = unstable(id, dose);
      expect(u.verdict.tone, id).not.toBe('good');
      expect(u.verdict.text, id).toMatch(/synchronized cardioversion now/i);
      // the drug is not waited for: the timeline does not end the unstable VT
      expect(u.steps.some((s) => s.profile === 'normal-sinus'), id).toBe(false);
    }
    // too little of a stable-VT drug in an unstable patient is not "the right drug, too little"
    for (const [id, dose] of [['procainamide', 400], ['amiodarone', 75], ['sotalol', 60]] as const) {
      expect(stable(id, dose).verdict.tone, id).toBe('good');
      expect(unstable(id, dose).verdict.tone, id).not.toBe('good');
    }
  });

  it('the drugs that do not stop VT are never "a good choice", and in an unstable patient they say to cardiovert', () => {
    for (const [id, dose] of [['adenosine', 6], ['lidocaine', 80], ['metoprolol', 5], ['esmolol', 40], ['magnesium-sulfate', 2], ['diltiazem', 20]] as const) {
      expect(stable(id, dose).verdict.tone, id).not.toBe('good');
      expect(unstable(id, dose).verdict.tone, id).not.toBe('good');
      if (id !== 'diltiazem') expect(unstable(id, dose).verdict.text, id).toMatch(/synchronized cardioversion now/i);
    }
    expect(unstable('adenosine', 6).verdict.tone).toBe('bad');
    expect(stable('magnesium-sulfate', 2).verdict.text).toMatch(/does not stop monomorphic VT/);
  });
});

describe('the VT condition page: the Give-meds patient presents stable or unstable', () => {
  /** run the shared clock, as SimulationDriver does */
  function run(ms: number, dt = 20) {
    for (let t = 0; t < ms; t += dt) {
      sim.engine.setRhythm(useECGStore.getState().activeProfileId, useTimelineStore.getState().heartRate, sim.time, useMedStore.getState().mods);
      sim.time += dt;
      sim.engine.ensure(sim.time + 4000);
      tickMeds(sim.time);
    }
  }
  const sbp = () => sim.hemo.summary(sim.time).sbp;
  beforeEach(() => {
    useAppStore.getState().setMode('learn');
    useMedStore.getState().reset('monomorphic-vt');
    useMedStore.setState({ vt: 'stable' });
    sim.time = 400_000;
    showRhythm('vt');
    setRhythm('vt', 120);
    sim.rewrite = false;
    sim.engine.setRhythm('vt', 120, sim.time, null);
    run(6_000);
  });

  it('stable by default: a normal heart behind the VT, a pressure that holds, and the stable-VT drugs are right', () => {
    // the VT rhythm's own heart is the failing one: hypotensive
    expect(sim.hemo.baseline).toBeNull();
    expect(sbp()).toBeLessThan(90);
    applyVtHeart('monomorphic-vt');
    expect(sim.hemo.baseline).toBe('normal');
    expect(sbp()).toBeGreaterThanOrEqual(90);
    // the reviewers' run: sotalol at 120/min was "not the right drug … this VT is unstable"
    const plan = useMedStore.getState().give('sotalol', 120);
    expect(plan.verdict.tone).toBe('good');
    expect(plan.verdict.text).toMatch(/may be considered/);
  });

  it('unstable by choice: the rhythm\'s own failing heart, and the drugs give way to synchronized cardioversion', () => {
    applyVtHeart('monomorphic-vt');
    useMedStore.getState().setVt('unstable');
    expect(sim.hemo.baseline).toBeNull();
    expect(sbp()).toBeLessThan(90);
    expect(useMedStore.getState().give('procainamide', 1000).verdict.text).toMatch(/unstable \(hypotensive\)/);
    useMedStore.getState().setVt('stable');
    expect(sim.hemo.baseline).toBe('normal');
  });

  it('a defibrillator scenario keeps its own heart: its story says how its VT presents, not the Give-meds choice', () => {
    const vtPulse = SCENARIOS.find((x) => x.id === 'vt-pulse')!;
    const vtStable = SCENARIOS.find((x) => x.id === 'vt-stable')!;
    // the reviewers' run: Give meds open on the VT page (stable), then the trainer's "Unstable VT (pulse)"
    applyVtHeart('monomorphic-vt');
    expect(sim.hemo.baseline).toBe('normal');
    loadScenario(vtPulse);
    sim.rewrite = false;
    expect(useDefibStore.getState().scenario?.id).toBe('vt-pulse');
    applyVtHeart('monomorphic-vt');
    expect(sim.hemo.baseline).toBeNull();
    // …and the other way round: Presents unstable, then the trainer's "Stable VT" (a normal heart)
    useMedStore.getState().setVt('unstable');
    loadScenario(vtStable);
    sim.rewrite = false;
    applyVtHeart('monomorphic-vt');
    expect(sim.hemo.baseline).toBe('normal');
    useMedStore.getState().setVt('stable');
    useMedStore.getState().setVt('unstable');
    expect(sim.hemo.baseline).toBe('normal');
    // a new patient ends the scenario: the condition's own VT shown again gets the chosen heart
    showRhythm('vt');
    sim.rewrite = false;
    expect(useDefibStore.getState().scenario).toBeNull();
    useMedStore.getState().setVt('stable');
    expect(sim.hemo.baseline).toBe('normal');
  });

  it('only this condition\'s VT, and only while it is on the monitor', () => {
    // a VT a drug caused on another condition's page keeps its own heart
    useMedStore.getState().reset('sinus-bradycardia');
    applyVtHeart('sinus-bradycardia');
    expect(sim.hemo.baseline).toBeNull();
    // the rhythm a drug has turned this VT into is left alone too
    useMedStore.getState().reset('monomorphic-vt');
    setRhythm('normal-sinus', 84);
    applyVtHeart('monomorphic-vt');
    expect(sim.hemo.baseline).toBeNull();
    // and a new patient starts with the rhythm's own heart
    setRhythm('vt', 120);
    applyVtHeart('monomorphic-vt');
    expect(sim.hemo.baseline).toBe('normal');
    showRhythm('vt');
    sim.rewrite = false;
    expect(sim.hemo.baseline).toBeNull();
  });
});

describe('sotalol', () => {
  it('may be considered for stable monomorphic VT and ends it with a slow rate and a longer QT', () => {
    const plan = planDose('sotalol', patient('vt', 160, { sbp: 118 }), 120);
    expect(plan.doseClass).toBe('usual');
    expect(plan.verdict).toMatchObject({ tone: 'good' });
    expect(plan.verdict.text).toMatch(/may be considered/);
    const end = plan.steps.find((s) => s.profile === 'normal-sinus');
    expect(end?.mods?.qtcAdd).toBeGreaterThan(0);
    expect(end?.hr).toBeLessThan(70);
  });

  it('is refused for unstable VT, torsades, arrest and a slow rhythm, and an overdose ends in torsades', () => {
    expect(planDose('sotalol', patient('vt', 170, { sbp: 74 }), 120).verdict.tone).toBe('bad');
    expect(planDose('sotalol', patient('torsades', 230), 120).verdict.tone).toBe('bad');
    expect(planDose('sotalol', patient('vf', 0), 120).verdict.tone).toBe('bad');
    expect(planDose('sotalol', patient('sinus-bradycardia', 44), 120).verdict.tone).toBe('bad');
    const over = planDose('sotalol', patient('vt', 160, { sbp: 118 }), 200);
    expect(over.doseClass).toBe('toxic');
    expect(over.steps.some((s) => s.profile === 'torsades')).toBe(true);
  });
});

/**
 * The contraindication audit of Give meds (GM1–GM51): each rule says no — or "with care" — where the label or the
 * guideline does, and the nearest right use still reads right.
 */
describe('contraindications: the drugs already given', () => {
  const dose = (id: MedId, d: number, at = 0) => ({ id, dose: d, at });
  const af = (extra: Partial<Patient> = {}) => patient('atrial-fibrillation', 150, { sbp: 120, ...extra });

  it('GM1: IV diltiazem and an IV β-blocker, either order, are not given together (diltiazem and esmolol labels)', () => {
    expect(planDose('diltiazem', af(), 20).verdict.tone).toBe('good');
    for (const beta of ['metoprolol', 'esmolol', 'sotalol'] as MedId[]) {
      const plan = planDose('diltiazem', af({ given: [dose(beta, beta === 'esmolol' ? 40 : 5)] }), 20);
      expect(plan.verdict.tone, beta).toBe('bad');
      expect(plan.verdict.text, beta).toMatch(/^Not on top of an IV β-blocker \(/);
      expect(plan.verdict.text).toMatch(/diltiazem and esmolol labels.*within a few hours/);
      // one warning on the timeline, without a rate of its own
      expect(plan.steps.filter((s) => s.tone === 'warn' && /calcium-channel blocker and a β-blocker/.test(s.note))).toHaveLength(1);
      expect(plan.steps.find((s) => /calcium-channel blocker and a β-blocker/.test(s.note))!.hr).toBeUndefined();
    }
    for (const beta of ['metoprolol', 'esmolol'] as MedId[]) {
      const plan = planDose(beta, af({ given: [dose('diltiazem', 20)] }), MED_BY_ID[beta].usual(af()).low);
      expect(plan.verdict.tone, beta).toBe('bad');
      expect(plan.verdict.text).toMatch(/^Not on top of IV diltiazem/);
    }
  });

  it('GM2: a second QT-prolonging antiarrhythmic — sotalol no, amiodarone or procainamide only with care', () => {
    const vt = (given: Patient['given']) => patient('vt', 160, { sbp: 120, given });
    expect(planDose('amiodarone', vt([]), 150).verdict.tone).toBe('good');
    const amio = planDose('amiodarone', vt([dose('procainamide', 1000)]), 150);
    expect(amio.verdict.tone).toBe('caution');
    expect(amio.verdict.text).toMatch(/^Procainamide already given: a second QT-prolonging antiarrhythmic stacks the QT.*not without expert advice; synchronized cardioversion is the usual next step/);
    expect(planDose('procainamide', vt([dose('amiodarone', 150)]), 1000).verdict.tone).toBe('caution');
    expect(planDose('sotalol', vt([dose('amiodarone', 150)]), 120).verdict.tone).toBe('bad');
  });

  it('GM3: a second β-blocker is at most "with care"', () => {
    expect(planDose('metoprolol', af(), 5).verdict.tone).toBe('good');
    const plan = planDose('metoprolol', af({ given: [dose('esmolol', 40)] }), 5);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/^Esmolol already given: a second β-blocker/);
  });

  it('GM4: digoxin and amiodarone, either order: halve the digoxin', () => {
    expect(planDose('digoxin', af({ given: [dose('amiodarone', 150)] }), 0.25).verdict.text).toMatch(/halve the digoxin/);
    const amio = planDose('amiodarone', af({ given: [dose('digoxin', 0.25)] }), 150);
    expect(amio.verdict.tone).toBe('caution');
    expect(amio.verdict.text).toMatch(/Digoxin already given: amiodarone roughly doubles its level/);
  });

  it('GM5: calcium on top of digoxin — slowly, and Fab for the hyperkalemia of digoxin toxicity', () => {
    const k = patient('hyperkalemia', 64);
    expect(planDose('calcium-chloride', k, 1).verdict.tone).toBe('good');
    const plan = planDose('calcium-chloride', { ...k, given: [dose('digoxin', 0.5)] }, 1);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/^Digoxin on board: give the calcium slowly \(label\)\. The hyperkalemia of digoxin toxicity is treated with digoxin Fab \(2023 AHA\); calcium is no longer considered contraindicated \(Levine 2011\)/);
  });

  it('GM6: calcium is the antidote to too much diltiazem or magnesium, not "no indication"', () => {
    expect(planDose('calcium-chloride', patient('normal-sinus', 72), 1).verdict.tone).toBe('bad');
    // diltiazem with a low pressure, or more than 0.45 mg/kg in all: the slowed rate comes up a little
    for (const p of [af({ hr: 70, sbp: 82, given: [dose('diltiazem', 20)] }), af({ hr: 70, given: [dose('diltiazem', 50)] })]) {
      const plan = planDose('calcium-chloride', p, 1);
      expect(plan.verdict.tone).toBe('good');
      expect(plan.verdict.text).toMatch(/IV calcium is the antidote — 1 g of calcium chloride \(or 3 g of gluconate\), repeated as needed, with fluids; pace a slow rate/);
      expect(plan.steps.find((s) => s.hr !== undefined)!.hr).toBe(77);
    }
    // a fast rate is not pushed faster
    expect(planDose('calcium-chloride', af({ sbp: 82, given: [dose('diltiazem', 20)] }), 1).steps.every((s) => s.hr === undefined)).toBe(true);
    // a usual dose with the pressure holding is not an overdose
    expect(planDose('calcium-chloride', af({ given: [dose('diltiazem', 20)] }), 1).verdict.tone).toBe('bad');
    // nor is the usual two-bolus regimen (0.25 + 0.35 mg/kg = 20 + 28 mg at 80 kg): 0.45 mg/kg is the most in ONE bolus
    expect(planDose('calcium-chloride', af({ hr: 90, given: [dose('diltiazem', 20), dose('diltiazem', 28)] }), 1).verdict.tone).toBe('bad');
    // past the regimen at its top (0.3 + 0.4 mg/kg, rounded), it is
    expect(planDose('calcium-chloride', af({ hr: 90, given: [dose('diltiazem', 32), dose('diltiazem', 35)] }), 1).verdict.tone).toBe('good');
    // too much magnesium with its signs (a low pressure, a slow rate): calcium is the antidote
    expect(planDose('calcium-chloride', patient('normal-sinus', 72, { sbp: 82, given: [dose('magnesium-sulfate', 4), dose('magnesium-sulfate', 2)] }), 1).verdict).toMatchObject({ tone: 'good', text: expect.stringMatching(/^Too much magnesium: IV calcium is the antidote/) });
    expect(planDose('calcium-chloride', patient('normal-sinus', 50, { sbp: 120, given: [dose('magnesium-sulfate', 4), dose('magnesium-sulfate', 2)] }), 1).verdict.tone).toBe('good');
    // without them: check the level and stop the magnesium — calcium is for the signs
    const mgNoSigns = planDose('calcium-chloride', patient('normal-sinus', 72, { sbp: 120, given: [dose('magnesium-sulfate', 2), dose('magnesium-sulfate', 2), dose('magnesium-sulfate', 2)] }), 1);
    expect(mgNoSigns.verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^6 g of magnesium in all: calcium is its antidote, but for the signs of too much.*check the magnesium level/) });
    expect(planDose('calcium-chloride', patient('normal-sinus', 72, { given: [dose('magnesium-sulfate', 2)] }), 1).verdict.tone).toBe('bad');
  });

  it('GM7–GM8: adenosine after digoxin, lidocaine after procainamide, epinephrine on a β-blocker, a P2Y12 load after an opioid', () => {
    expect(planDose('adenosine', patient('avnrt', 180, { given: [dose('digoxin', 0.25)] }), 6).verdict.text).toMatch(/defibrillator ready/);
    expect(planDose('adenosine', patient('avnrt', 180), 6).verdict.text).not.toMatch(/defibrillator/);
    const lido = planDose('lidocaine', patient('vt', 160, { sbp: 120, given: [dose('procainamide', 1000)] }), 100);
    expect(lido.verdict.tone).toBe('caution');
    expect(lido.verdict.text).toMatch(/two class I drugs add their toxicity/);
    expect(planDose('epinephrine', patient('sinus-bradycardia', 40, { given: [dose('metoprolol', 5)] }), 0.01).verdict.text).toMatch(/α effect is unopposed/);
    const tica = planDose('ticagrelor', patient('anterior-stemi', 92, { given: [dose('fentanyl', 50)] }), 180);
    expect(tica.verdict.tone).toBe('good');
    expect(tica.verdict.text).toMatch(/An opioid has been given: it delays the absorption of the oral load/);
  });

  it('in an arrest the drugs are given together by design: no combination caveat', () => {
    const vf = patient('vf', 0, { given: [dose('amiodarone', 300), dose('epinephrine', 1), dose('lidocaine', 100)] });
    expect(planDose('amiodarone', vf, 150).verdict.text).not.toMatch(/already given/);
  });
});

describe('contraindications: the pressure and the ventricle', () => {
  it('GM9: diltiazem for an SVT with a low pressure or a failing ventricle is refused (label)', () => {
    expect(planDose('diltiazem', patient('avnrt', 180, { sbp: 120 }), 20).verdict.tone).toBe('good');
    const plan = planDose('diltiazem', patient('avnrt', 180, { sbp: 80 }), 20);
    expect(plan.verdict.tone).toBe('bad');
    expect(plan.verdict.text).toMatch(/^Not with a low pressure or a failing ventricle: IV diltiazem is contraindicated in severe hypotension and cardiogenic shock \(label\)/);
    expect(plan.verdict.text).toMatch(/synchronized cardioversion/);
  });

  it('GM10: procainamide outside VT with a low pressure or a failing ventricle; unstable pre-excited AF is cardioverted', () => {
    const stable = planDose('procainamide', patient('af-wpw', 214, { sbp: 112 }), 1000);
    expect(stable.verdict.tone).toBe('good');
    const unstable = planDose('procainamide', patient('af-wpw', 250, { sbp: 87 }), 1000);
    expect(unstable.verdict.tone).toBe('bad');
    expect(unstable.verdict.text).toMatch(/^Unstable pre-excited AF: synchronized cardioversion now/);
    expect(planDose('procainamide', patient('atrial-fibrillation', 150, { sbp: 80 }), 1000).verdict.tone).toBe('bad');
    // a failing ventricle: the widening steps are kept, and an overdose still shows torsades
    const dcm = planDose('procainamide', patient('dcm', 96, { sbp: 110 }), 2000);
    expect(dcm.verdict.tone).toBe('bad');
    expect(dcm.steps.some((s) => s.profile === 'torsades')).toBe(true);
  });

  it('GM35: fentanyl with a low pressure — support the pressure first', () => {
    expect(planDose('fentanyl', patient('anterior-stemi', 92, { sbp: 130 }), 50).verdict.tone).toBe('good');
    const plan = planDose('fentanyl', patient('anterior-stemi', 92, { sbp: 80 }), 50);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/blunts the sympathetic drive.*RV infarct or a tamponade.*Support the pressure first/);
  });

  it('GM36: phenylephrine is for a low pressure — the drug in outflow obstruction, second to norepinephrine in pump failure', () => {
    expect(planDose('phenylephrine', patient('normal-sinus', 72, { sbp: 120 }), 100).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^No low pressure to treat/) });
    expect(planDose('phenylephrine', patient('hcm', 70, { sbp: 80 }), 100).verdict.tone).toBe('good');
    expect(planDose('phenylephrine', patient('aortic-stenosis', 70, { sbp: 80 }), 100).verdict.tone).toBe('good');
    expect(planDose('phenylephrine', patient('tamponade', 118, { sbp: 80 }), 100).verdict.text).toMatch(/Drain the pericardium/);
    expect(planDose('phenylephrine', patient('cardiogenic-shock', 118, { sbp: 80 }), 100).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/norepinephrine is the usual first pressor/) });
    expect(planDose('phenylephrine', patient('sinus-bradycardia', 40, { sbp: 80 }), 100).verdict.tone).toBe('bad');
    // the steps stay: the pressure rises, the rate falls, it wears off
    expect(planDose('phenylephrine', patient('hcm', 70, { sbp: 80 }), 100).steps.map((s) => s.mark ?? s.tone)).toEqual(['reflex ↓', 'info']);
  });

  it('GM45: esmolol in obstructive HCM with a low pressure is "with care" (after fluid and phenylephrine), not "dangerous"', () => {
    const plan = planDose('esmolol', patient('hcm', 80, { sbp: 82 }), 40);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/fluid and phenylephrine first; after them a β-blocker lowers the outflow gradient/);
    // any other failing ventricle is still refused
    expect(planDose('esmolol', patient('dcm', 96, { sbp: 82 }), 40).verdict.tone).toBe('bad');
  });

  it('push-dose epinephrine: a bridge for a compensated low pressure, never in obstructive HCM', () => {
    const shock = planDose('epinephrine', patient('cardiogenic-shock', 118, { sbp: 78 }), 0.01);
    expect(shock.verdict.tone).toBe('caution');
    expect(shock.verdict.text).toMatch(/A bridge for a low pressure while the cause is treated.*norepinephrine is the usual infusion/);
    expect(planDose('epinephrine', patient('cardiogenic-shock', 118, { sbp: 110 }), 0.01).verdict.tone).toBe('bad');
    const hcm = planDose('epinephrine', patient('hcm', 80, { sbp: 78 }), 0.01);
    expect(hcm.verdict.tone).toBe('bad');
    expect(hcm.verdict.text).toMatch(/outflow obstruction worse/);
  });

  it('calcium in a bradycardia is "only for its cause", not "no indication"', () => {
    const plan = planDose('calcium-chloride', patient('sinus-bradycardia', 40), 1);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/^Only when a calcium-channel-blocker or β-blocker overdose, hyperkalemia or a low calcium causes the slow rate/);
  });
});

describe('contraindications: the rhythm', () => {
  it('GM11: procainamide in complete heart block (label) and Mobitz II (avoid)', () => {
    const chb = planDose('procainamide', patient('third-degree-avb', 36, { sbp: 100 }), 1000);
    expect(chb.verdict.text).toMatch(/^Contraindicated \(label\): complete heart block/);
    expect(chb.steps.some((s) => s.mark === 'escape ↓' && s.hr! < 36)).toBe(true);
    expect(planDose('procainamide', patient('mobitz-ii', 80, { sbp: 120 }), 1000).verdict.text).toMatch(/^Avoid \(label: second-degree AV block\)/);
  });

  it('GM12: procainamide is one load — 17 mg/kg in all, however it is split', () => {
    const vt = (given: Patient['given']) => patient('vt', 160, { sbp: 120, given });
    expect(classifyDose(MED_BY_ID.procainamide, vt([{ id: 'procainamide', dose: 800, at: 0 }]), 500)).toBe('usual');
    expect(planDose('procainamide', vt([{ id: 'procainamide', dose: 800, at: 0 }]), 500).verdict.tone).toBe('good');
    const over = planDose('procainamide', vt([{ id: 'procainamide', dose: 1360, at: 0 }]), 800);
    expect(over.doseClass).toBe('toxic');
    expect(over.doseText).toMatch(/2160 mg in all/);
    expect(over.verdict.tone).toBe('bad');
    expect(over.verdict.text).toMatch(/^27 mg\/kg in all — past the 17 mg\/kg ceiling of the load/);
    // the QRS shows everything given, not only this part of the load
    const last = over.steps.filter((s) => s.mods).at(-1)!.mods!;
    expect(last.qrsWiden!).toBeCloseTo(1 + 0.3 * (27 / 17), 1);
  });

  it('GM13: lidocaine in complete heart block, Mobitz II and a slow junctional escape (label: it suppresses the escape)', () => {
    const chb = planDose('lidocaine', patient('third-degree-avb', 36, { sbp: 100 }), 100);
    expect(chb.verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Contraindicated \(label\): severe AV block without a pacemaker/) });
    expect(chb.steps[0].hr).toBe(Math.round(36 * 0.7));
    expect(planDose('lidocaine', patient('mobitz-ii', 80), 100).verdict.text).toMatch(/^Contraindicated \(label\)/);
    expect(planDose('lidocaine', patient('junctional', 45), 100).verdict.text).toMatch(/suppress the escape pacemaker/);
    expect(planDose('lidocaine', patient('junctional', 90), 100).verdict.text).toMatch(/^No indication/);
  });

  it('GM14–GM15: lidocaine for ectopy in a slow rhythm, in WPW and as prophylaxis in MI', () => {
    const slow = planDose('lidocaine', patient('pvcs', 50), 100);
    expect(slow.verdict.tone).toBe('caution');
    expect(slow.verdict.text).toMatch(/the label warns that lidocaine for ectopy in a slow rhythm/);
    expect(slow.steps.some((s) => s.mark === 'no PVCs')).toBe(true);
    expect(planDose('lidocaine', patient('pvcs', 80), 100).verdict.text).not.toMatch(/label warns/);
    expect(planDose('lidocaine', patient('wpw', 80), 100).verdict.text).toMatch(/label lists Wolff-Parkinson-White as a contraindication/);
    expect(planDose('lidocaine', patient('anterior-stemi', 92), 100).verdict.text).toMatch(/saves no one and causes more bradycardia and asystole/);
  });

  it('GM16: magnesium in heart block (label), not routine in MI; still the drug for torsades', () => {
    for (const [id, hr] of [['third-degree-avb', 36], ['mobitz-ii', 80], ['mobitz-i', 80]] as const) {
      const plan = planDose('magnesium-sulfate', patient(id, hr), 2);
      expect(plan.verdict.tone, id).toBe('bad');
      expect(plan.verdict.text).toMatch(/^Contraindicated \(label\): parenteral magnesium in heart block.*Torsades is the exception, with pacing ready/);
      expect(plan.steps[0]).toMatchObject({ hr: Math.round(Math.max(20, hr * 0.9)), mods: { prAdd: 20 } });
    }
    expect(planDose('magnesium-sulfate', patient('anterior-stemi', 92), 2).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/ISIS-4/) });
    expect(planDose('magnesium-sulfate', patient('torsades', 230), 2).verdict.tone).toBe('good');
  });

  it('GM17–GM19: digoxin, amiodarone and adenosine in a slow or controlled AF', () => {
    expect(planDose('digoxin', patient('atrial-fibrillation', 55), 0.25).verdict.tone).toBe('bad');
    expect(planDose('digoxin', patient('atrial-fibrillation', 90), 0.25).verdict.text).toMatch(/already controlled/);
    expect(planDose('digoxin', patient('atrial-fibrillation', 150), 0.25).verdict.text).toMatch(/^Slow but useful/);
    expect(planDose('amiodarone', patient('atrial-fibrillation', 50), 150).verdict.tone).toBe('bad');
    expect(planDose('amiodarone', patient('atrial-fibrillation', 150), 150).verdict.tone).toBe('caution');
    const ado = planDose('adenosine', patient('atrial-fibrillation', 50), 6);
    expect(ado.verdict.tone).toBe('bad');
    expect(ado.steps.find((s) => s.mark === 'pause')!.hr).toBe(25);
    expect(planDose('adenosine', patient('atrial-flutter', 50), 6).verdict.tone).toBe('bad');
    expect(planDose('adenosine', patient('atrial-flutter', 150), 6).verdict.tone).toBe('caution');
  });

  it('GM20: adenosine above 12 mg is more than the label allows', () => {
    const plan = planDose('adenosine', patient('avnrt', 180), 18);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/more than the label allows \(6 mg, then 12 mg\)/);
    expect(planDose('adenosine', patient('avnrt', 180), 12).verdict.tone).toBe('good');
  });

  it('GM21–GM22: an IV β-blocker in an acute coronary syndrome — refused with a systolic under 100 or a rate over 110, "with care" otherwise', () => {
    for (const id of ['metoprolol', 'esmolol'] as MedId[]) {
      const d = MED_BY_ID[id].usual(patient('anterior-stemi', 92)).low;
      expect(planDose(id, patient('anterior-stemi', 92, { sbp: 130 }), d).verdict.tone, id).toBe('caution');
      expect(planDose(id, patient('anterior-stemi', 92, { sbp: 95 }), d).verdict.text, id).toMatch(/metoprolol injection label rules out IV use below 100 mmHg/);
      expect(planDose(id, patient('anterior-stemi', 115, { sbp: 130 }), d).verdict, id).toMatchObject({ tone: 'bad', text: expect.stringMatching(/risk factor for cardiogenic shock.*2013 ACCF\/AHA STEMI/) });
      // NSTE-ACS reads like the STEMI: not "no indication"
      for (const prof of ['nstemi', 'wellens', 'anterior-stemi-reperfused']) {
        const plan = planDose(id, patient(prof, 84, { sbp: 130 }), d);
        expect(plan.verdict.tone, `${id} ${prof}`).toBe('caution');
        expect(plan.verdict.text).not.toMatch(/No indication/);
        expect(planDose(id, patient(prof, 84, { sbp: 95 }), d).verdict.tone, `${id} ${prof} 95`).toBe('bad');
      }
    }
  });

  it('GM23–GM25: epinephrine — the bradycardia branch needs a slow rate; a big push-dose needs a slow rate or a low pressure; 1 mg in pulseless torsades is the arrest dose', () => {
    expect(planDose('epinephrine', patient('first-degree-avb', 100, { sbp: 120 }), 0.01).verdict.text).toMatch(/^No indication/);
    expect(planDose('epinephrine', patient('first-degree-avb', 45, { sbp: 120 }), 0.01).verdict.text).toMatch(/^Bradycardia not responding to atropine/);
    expect(planDose('epinephrine', patient('mobitz-ii', 80, { sbp: 120 }), 0.01).verdict.tone).toBe('bad');
    const big = planDose('epinephrine', patient('atrial-fibrillation', 150, { sbp: 120 }), 0.05);
    expect(big.doseClass).toBe('high');
    expect(big.verdict.tone).toBe('bad');
    expect(big.verdict.text).toMatch(/no slow rate or low pressure to treat/);
    expect(planDose('epinephrine', patient('sinus-bradycardia', 40), 0.05).verdict.tone).toBe('caution');
    expect(classifyDose(MED_BY_ID.epinephrine, patient('torsades', 230), 1)).toBe('usual');
    expect(describeDose(MED_BY_ID.epinephrine, patient('torsades', 230), 1)).not.toMatch(/overdose/);
  });

  it('GM27–GM28: atropine needs a bradycardia, and stops at 3 mg in all', () => {
    expect(planDose('atropine', patient('mobitz-i', 80), 1).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^No bradycardia to treat: Mobitz I/) });
    expect(planDose('atropine', patient('mobitz-i', 45), 1).verdict.tone).toBe('good');
    expect(planDose('atropine', patient('mobitz-i', 55), 1).verdict.tone).toBe('caution');
    expect(planDose('atropine', patient('first-degree-avb', 80), 1).verdict.tone).toBe('bad');
    const past = planDose('atropine', patient('sinus-bradycardia', 40, { given: [{ id: 'atropine', dose: 2.5, at: 0 }] }), 1);
    expect(past.verdict.tone).toBe('caution');
    expect(past.verdict.text).toMatch(/^3\.5 mg in total — past the 3 mg maximum/);
    expect(past.steps.some((s) => s.tone === 'warn' && /past the 3 mg maximum/.test(s.note))).toBe(true);
    expect(planDose('atropine', patient('sinus-bradycardia', 40, { given: [{ id: 'atropine', dose: 2, at: 0 }] }), 1).verdict.tone).toBe('good');
  });

  it('pre-excited AF: β-blockers are named among the 2023 AF guideline\'s 3: Harm drugs', () => {
    expect(planDose('metoprolol', patient('af-wpw', 214, { sbp: 112 }), 5).verdict.text).toMatch(/2023 ACC\/AHA\/ACCP\/HRS AF guideline: adenosine, diltiazem, verapamil, digoxin, IV amiodarone and β-blockers — 3: Harm/);
  });
});

describe('contraindications: repeats and dose limits', () => {
  const g = (id: MedId, dose: number, at = 0) => ({ id, dose, at });

  it('GM29: tenecteplase is one bolus — a failed lysis goes for rescue PCI (REACT)', () => {
    expect(planDose('tenecteplase', patient('anterior-stemi', 92, { sbp: 130 }), 45).verdict.tone).toBe('good');
    const again = planDose('tenecteplase', patient('anterior-stemi', 92, { sbp: 130, given: [g('tenecteplase', 45)] }), 45);
    expect(again.verdict.tone).toBe('bad');
    expect(again.verdict.text).toMatch(/one bolus.*rescue PCI.*REACT/);
  });

  it('GM30: tenecteplase with a systolic over 180 — lower it first', () => {
    const plan = planDose('tenecteplase', patient('anterior-stemi', 92, { sbp: 190 }), 45);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/Lower the pressure first; if it cannot be controlled, lysis is contraindicated — transfer for PCI/);
  });

  it('GM31–GM32: a second heparin bolus or a second aspirin load is "with care"', () => {
    const stemi = patient('anterior-stemi', 92, { sbp: 130 });
    expect(planDose('heparin', stemi, 4000).verdict.tone).toBe('good');
    expect(planDose('heparin', { ...stemi, given: [g('heparin', 4000)] }, 4000).verdict.text).toMatch(/^The bolus has already been given/);
    expect(planDose('aspirin', stemi, 325).verdict.tone).toBe('good');
    expect(planDose('aspirin', { ...stemi, given: [g('aspirin', 325)] }, 325).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/the load is once/) });
  });

  it('GM33: aspirin in pericarditis is first line at the anti-inflammatory dose', () => {
    const p = patient('pericarditis', 104);
    const plan = planDose('aspirin', p, 650);
    expect(plan.verdict.tone).toBe('caution');
    expect(plan.verdict.text).toMatch(/650–1000 mg every 8 h/);
    expect(plan.doseClass).toBe('usual');
    expect(classifyDose(MED_BY_ID.aspirin, p, 1000)).toBe('usual');
    expect(classifyDose(MED_BY_ID.aspirin, p, 325)).toBe('low');
    expect(MED_BY_ID.aspirin.picks(p)).toContain(650);
  });

  it('GM34: an oral P2Y12 load in cardiogenic shock waits for the angiogram', () => {
    for (const id of ['ticagrelor', 'clopidogrel', 'prasugrel'] as MedId[]) {
      const plan = planDose(id, patient('cardiogenic-shock', 118), MED_BY_ID[id].usual(patient('cardiogenic-shock', 118)).low);
      expect(plan.verdict.tone, id).toBe('caution');
      expect(plan.verdict.text).toMatch(/^Cardiogenic shock: oral loads are absorbed poorly and late.*cangrelor/);
    }
  });

  it('GM37–GM38: nitroglycerin in a tamponade or a PE (preload-dependent), and not a fourth tablet', () => {
    expect(planDose('nitroglycerin', patient('tamponade', 96, { sbp: 100 }), 0.4).verdict.text).toMatch(/^Dangerous: a tamponade makes the heart preload-dependent/);
    expect(planDose('nitroglycerin', patient('pulmonary-embolism', 96, { sbp: 110 }), 0.4).verdict.text).toMatch(/PE straining the right ventricle/);
    const nstemi = patient('nstemi', 84, { sbp: 130 });
    const three = [g('nitroglycerin', 0.4), g('nitroglycerin', 0.4), g('nitroglycerin', 0.4)];
    expect(planDose('nitroglycerin', { ...nstemi, given: three.slice(0, 2) }, 0.4).verdict.tone).toBe('good');
    expect(planDose('nitroglycerin', { ...nstemi, given: three }, 0.4).verdict.text).toMatch(/^Three doses already/);
    // a contraindication still wins over the count
    expect(planDose('nitroglycerin', { ...nstemi, sbp: 80, given: three }, 0.4).verdict.tone).toBe('bad');
  });

  it('GM39: diltiazem — two boluses, then an infusion', () => {
    const p = patient('atrial-fibrillation', 150, { sbp: 120 });
    expect(planDose('diltiazem', { ...p, given: [g('diltiazem', 20)] }, 25).verdict.tone).toBe('good');
    const third = planDose('diltiazem', { ...p, given: [g('diltiazem', 20), g('diltiazem', 25)] }, 25);
    expect(third.verdict.tone).toBe('caution');
    expect(third.verdict.text).toMatch(/^Two boluses already.*start an infusion \(5–15 mg\/h\)/);
  });

  it('GM40: amiodarone in an arrest stops after 300 mg and 150 mg', () => {
    expect(planDose('amiodarone', patient('vf', 0, { given: [g('amiodarone', 300)] }), 150).verdict.tone).toBe('good');
    const third = planDose('amiodarone', patient('vf', 0, { given: [g('amiodarone', 300), g('amiodarone', 150)] }), 150);
    expect(third.verdict.tone).toBe('caution');
    expect(third.verdict.text).toMatch(/^The arrest doses are 300 mg, then 150 mg — both have been given/);
  });

  it('GM51: totals — magnesium, bicarbonate, fentanyl, insulin and sotalol given again', () => {
    const mg = planDose('magnesium-sulfate', patient('normal-sinus', 72, { given: [g('magnesium-sulfate', 4)] }), 2);
    // already "with care" (no ECG effect at a normal level): the reason is added after it
    expect(mg.verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/ 6 g in all: more than 4 g without torsades risks hypermagnesemia/) });
    expect(planDose('magnesium-sulfate', patient('torsades', 230, { given: [g('magnesium-sulfate', 2)] }), 2).verdict.tone).toBe('good');
    const k = patient('hyperkalemia', 64);
    expect(planDose('sodium-bicarbonate', { ...k, given: [g('sodium-bicarbonate', 100)] }, 100).verdict.text).toMatch(/ 200 mEq in all — more than 2 mEq\/kg/);
    expect(planDose('sodium-bicarbonate', { ...k, given: [g('sodium-bicarbonate', 50)] }, 50).verdict.text).not.toMatch(/in all/);
    const pain = patient('anterior-stemi', 92, { sbp: 130 });
    expect(planDose('fentanyl', { ...pain, given: [g('fentanyl', 100)] }, 100).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^200 mcg in all — more than 2 mcg\/kg/) });
    expect(planDose('fentanyl', { ...pain, given: [g('fentanyl', 50)] }, 50).verdict.tone).toBe('good');
    expect(planDose('insulin-dextrose', { ...k, given: [g('insulin-dextrose', 10)] }, 10).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^A second dose of insulin/) });
    const vt = patient('vt', 160, { sbp: 120 });
    expect(planDose('sotalol', vt, 120).verdict.tone).toBe('good');
    expect(planDose('sotalol', { ...vt, given: [g('sotalol', 120)] }, 120).verdict.text).toMatch(/^A second IV load/);
  });
});

describe('contraindications: what the learner reads', () => {
  it('GM46–GM48, GM50: albuterol with a long QT, tenecteplase in an arrest, heparin in pericarditis, an unstable SVT', () => {
    expect(planDose('albuterol', patient('long-qt', 72), 2.5).verdict.text).toMatch(/with a long QT.*lowers the potassium and adds adrenergic drive/);
    const pea = planDose('tenecteplase', patient('pea', 48), 45);
    expect(pea.verdict.tone).toBe('bad');
    expect(pea.verdict.text).toMatch(/arrest from a suspected pulmonary embolism, where it may be considered \(2025 AHA\)/);
    expect(planDose('heparin', patient('pericarditis', 104), 4000).verdict.text).toMatch(/bleeding into the pericardium/);
    expect(planDose('heparin', patient('tamponade', 118), 4000).verdict.text).toMatch(/bleeding into the pericardium/);
    const ado = planDose('adenosine', patient('avnrt', 180, { sbp: 80 }), 6);
    expect(ado.verdict.tone).toBe('good');
    expect(ado.verdict.text).toMatch(/unstable: synchronized cardioversion is the treatment — adenosine may be tried while it is set up/);
    expect(planDose('adenosine', patient('avnrt', 180, { sbp: 120 }), 6).verdict.text).not.toMatch(/unstable/);
    expect(planDose('amiodarone', patient('avnrt', 180, { sbp: 80 }), 150).verdict.text).toMatch(/unstable: synchronized cardioversion/);
  });
});

describe('GM43: the dosing guide says what each drug is not given with', () => {
  it.each([
    ['adenosine', /Not with: second- or third-degree AV block or sick sinus without a pacemaker, asthma, or an irregular or unstable wide-complex tachycardia/],
    ['diltiazem', /Not with: hypotension, HFrEF, pre-excited AF \(WPW\), VT, second- or third-degree AV block, or an IV β-blocker within a few hours/],
    ['esmolol', /Not with: .*pulmonary hypertension, or IV diltiazem or verapamil/],
    ['amiodarone', /Not with: cardiogenic shock, marked bradycardia, AV block, a long QT, or pre-excited AF/],
    ['lidocaine', /Not with: severe AV block or a ventricular escape rhythm, WPW, or an amide allergy/],
    ['digoxin', /Not with: WPW, AV block, obstructive HCM or a low K⁺; halve it with amiodarone/],
    ['atropine', /Not with: a heart transplant; for wide-complex Mobitz II or complete heart block, pace/],
    ['magnesium-sulfate', /Not with: heart block/],
    ['calcium-chloride', /Not through the bicarbonate line.*slowly with digoxin/],
    ['heparin', /Not with: HIT, active bleeding, severe thrombocytopenia, or a possible aortic dissection/],
    ['metoprolol', /not with pre-excited AF, cocaine or methamphetamine on board, or IV diltiazem within hours; in an MI no IV dose with a systolic under 120/],
    ['procainamide', /Not with: second- or third-degree AV block without a pacer, lupus, torsades, or a tricyclic overdose/],
    ['epinephrine', /not with dynamic LV outflow obstruction/],
    ['ticagrelor', /not within 24 h of a fibrinolytic/],
    ['prasugrel', /not with active bleeding or a fibrinolytic/],
    ['sodium-bicarbonate', /Not with alkalosis or a low calcium; never through the calcium line/],
    ['fentanyl', /Not with: hypotension or respiratory depression; with benzodiazepines/],
    ['phenylephrine', /Not with: bradycardia; only for a low pressure/],
    ['clopidogrel', /Not with: active bleeding/],
    ['nitroglycerin', /riociguat or raised intracranial pressure either, a tamponade, a massive PE, or LV outflow obstruction/],
  ] as [MedId, RegExp][])('%s', (id, re) => {
    expect(MED_BY_ID[id].guide).toMatch(re);
  });
});

describe('GM42: the patient\'s history and age', () => {
  const h = (profileId: string, hr: number, problems: Problem[], extra: Partial<Patient> = {}) => patient(profileId, hr, { sbp: 120, problems, ...extra });
  const tone = (id: MedId, p: Patient, d: number) => planDose(id, p, d).verdict.tone;

  it('asthma or wheezing: adenosine and sotalol refused, a β1-selective blocker only with care', () => {
    for (const x of ['asthma', 'bronchospasm'] as Problem[]) {
      expect(tone('adenosine', h('avnrt', 180, []), 6)).toBe('good');
      expect(planDose('adenosine', h('avnrt', 180, [x]), 6).verdict.text).toMatch(/^Not with asthma or bronchospastic lung disease: adenosine can bring on severe bronchospasm \(label\)/);
      expect(tone('sotalol', h('vt', 160, [x]), 120)).toBe('bad');
      expect(tone('metoprolol', h('atrial-fibrillation', 150, []), 5)).toBe('good');
      // a history of asthma: with care; wheezing now: not at all (as the case simulator's beta-blocker-bronchospasm)
      expect(tone('metoprolol', h('atrial-fibrillation', 150, [x]), 5)).toBe(x === 'asthma' ? 'caution' : 'bad');
      expect(tone('esmolol', h('atrial-fibrillation', 150, [x]), 40)).toBe(x === 'asthma' ? 'caution' : 'bad');
    }
  });

  it('a transplanted heart: no atropine (3 — Harm), and adenosine starts at 3 mg — as with dipyridamole or carbamazepine', () => {
    expect(tone('atropine', h('sinus-bradycardia', 40, []), 1)).toBe('good');
    expect(planDose('atropine', h('sinus-bradycardia', 40, ['heart-transplant']), 1).verdict.text).toMatch(/^Not after a heart transplant \(2018 ACC\/AHA\/HRS bradycardia: 3 — Harm\)/);
    for (const x of ['heart-transplant', 'adenosine-potentiator'] as Problem[]) {
      const p = h('avnrt', 180, [x]);
      expect(MED_BY_ID.adenosine.usual(p)).toEqual({ low: 3, high: 3 });
      const three = planDose('adenosine', p, 3);
      expect(three.doseClass).toBe('usual');
      expect(three.verdict.tone).toBe('good');
      expect(three.steps.some((s) => s.profile === 'normal-sinus')).toBe(true);
      expect(planDose('adenosine', p, 6).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/start at 3 mg \(label\)/) });
      // after the 3 mg dose the regimen goes on as usual
      expect(MED_BY_ID.adenosine.usual({ ...p, given: [{ id: 'adenosine', dose: 3, at: 0 }] })).toEqual({ low: 6, high: 12 });
      expect(planDose('adenosine', { ...p, given: [{ id: 'adenosine', dose: 3, at: 0 }] }, 6).verdict.tone).toBe('good');
    }
  });

  it('a PDE-5 inhibitor and nitroglycerin; cocaine and the β-blockers; a true aspirin allergy', () => {
    expect(tone('nitroglycerin', h('nstemi', 84, []), 0.4)).toBe('good');
    expect(planDose('nitroglycerin', h('nstemi', 84, ['pde5-inhibitor']), 0.4).verdict.text).toMatch(/^Contraindicated \(label\): a PDE-5 inhibitor/);
    for (const id of ['metoprolol', 'esmolol', 'sotalol'] as MedId[]) {
      expect(planDose(id, h('atrial-fibrillation', 150, ['sympathomimetic-toxicity']), MED_BY_ID[id].usual(patient('atrial-fibrillation', 150)).low).verdict.text, id).toMatch(/^Not in acute cocaine or methamphetamine intoxication \(2014 AHA\/ACC NSTE-ACS: 3 — Harm\)/);
    }
    expect(tone('aspirin', h('anterior-stemi', 92, []), 325)).toBe('good');
    expect(planDose('aspirin', h('anterior-stemi', 92, ['aspirin-allergy']), 325).verdict.text).toMatch(/^Not with a true aspirin allergy.*P2Y12 inhibitor alone/);
  });

  it('bleeding: no antiplatelet, heparin or lytic; a stroke: no lytic within 3 months (absolute), relative after — and no prasugrel after any', () => {
    const stemi = (problems: Problem[]) => h('anterior-stemi', 92, problems, { kg: 85 });
    const nstemiP = (problems: Problem[]) => h('nstemi', 84, problems, { kg: 85 });
    // active bleeding: every antithrombotic and the lytic
    for (const [id, d] of [['aspirin', 325], ['ticagrelor', 180], ['clopidogrel', 600], ['prasugrel', 60], ['heparin', 4000], ['tenecteplase', 45]] as [MedId, number][]) {
      expect(planDose(id, stemi(['bleeding']), d).verdict, id).toMatchObject({ tone: 'bad', text: expect.stringMatching(/Not with active bleeding: this drug feeds the bleeding \(label\)\./) });
    }
    // an intracranial hemorrhage at any time: lysis (absolute), ticagrelor (history of ICH) and prasugrel (prior stroke) no;
    // aspirin, clopidogrel and heparin with care — it is a recent or active bleed that rules them out
    const ich = (id: MedId, d: number) => planDose(id, stemi(['intracranial-hemorrhage']), d).verdict;
    expect(ich('tenecteplase', 45)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Absolutely contraindicated: any prior intracranial hemorrhage/) });
    expect(ich('ticagrelor', 180)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Contraindicated \(label\): a history of intracranial hemorrhage/) });
    expect(ich('prasugrel', 60)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Contraindicated after any stroke or TIA \(label, boxed\) — an intracranial hemorrhage is one/) });
    for (const [id, d] of [['aspirin', 325], ['clopidogrel', 600], ['heparin', 4000]] as [MedId, number][]) {
      const v = ich(id, d);
      expect(v.tone, id).toBe('caution');
      // (first where it lowers the verdict; after the drug's own "with care" where clopidogrel already has one)
      expect(v.text, id).toMatch(/A prior intracranial hemorrhage raises the bleeding risk; a recent or active one rules this drug out — ask when, and give the ACS antithrombotics if it is old and healed\./);
      // the lytic's absolute contraindication is not pinned on the antiplatelets
      expect(v.text, id).not.toMatch(/absolute contraindication to lysis/);
    }
    expect(tone('tenecteplase', stemi([]), 45)).toBe('good');
    // an ischemic stroke within 3 months, or an intracranial lesion, trauma or neurosurgery: absolute
    expect(planDose('tenecteplase', stemi(['recent-stroke']), 45).verdict.text).toMatch(/^Absolutely contraindicated: an ischemic stroke within 3 months/);
    expect(tone('tenecteplase', stemi(['intracranial-risk']), 45)).toBe('bad');
    // a TIA or a stroke more than 3 months ago: relative only (2013 ACCF/AHA, kept in 2025)
    const prior = planDose('tenecteplase', stemi(['prior-stroke']), 45);
    expect(prior.verdict.tone).toBe('caution');
    expect(prior.verdict.text).toMatch(/^A relative contraindication \(2013 ACCF\/AHA STEMI, kept in 2025\): a TIA or a stroke more than 3 months ago/);
    for (const x of ['recent-stroke', 'prior-stroke'] as Problem[]) expect(planDose('prasugrel', stemi([x]), 60).verdict.text).toMatch(/^Contraindicated after any stroke or TIA \(label, boxed\)/);
    // the other relative contraindications to lysis, together in one sentence
    const rel = planDose('tenecteplase', stemi(['oral-anticoagulant', 'recent-surgery', 'recent-bleeding', 'pregnancy']), 45);
    expect(rel.verdict.tone).toBe('caution');
    expect(rel.verdict.text).toMatch(/an oral anticoagulant, major surgery within 3 weeks, internal bleeding within 2–4 weeks or an active ulcer, pregnancy\./);
    // an oral anticoagulant: the P2Y12 inhibitor is clopidogrel
    expect(planDose('ticagrelor', stemi(['oral-anticoagulant']), 180).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/is clopidogrel/) });
    expect(tone('prasugrel', stemi(['oral-anticoagulant']), 60)).toBe('caution');
    expect(planDose('clopidogrel', stemi(['oral-anticoagulant']), 600).verdict.text).not.toMatch(/oral anticoagulant on board/);
    // HIT: no heparin. Platelets under 100,000: heparin and the antiplatelets with care, no lysis (a bleeding diathesis)
    expect(planDose('heparin', stemi(['hit']), 4000).verdict.text).toMatch(/^Contraindicated \(label\): heparin-induced thrombocytopenia/);
    expect(planDose('heparin', nstemiP(['thrombocytopenia']), 4000).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Platelets under 100,000: find the cause first \(HIT\?\)/) });
    expect(planDose('heparin', stemi(['hit', 'thrombocytopenia']), 4000).verdict.text).not.toMatch(/find the cause/);
    expect(planDose('tenecteplase', stemi(['thrombocytopenia']), 45).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Platelets under 100,000: a bleeding diathesis — an absolute contraindication to fibrinolysis/) });
    for (const [id, d] of [['aspirin', 325], ['ticagrelor', 180], ['clopidogrel', 600], ['prasugrel', 60]] as [MedId, number][]) {
      expect(planDose(id, stemi(['thrombocytopenia']), d).verdict, id).toMatchObject({ tone: 'caution', text: expect.stringMatching(/Platelets under 100,000: an antiplatelet adds to the bleeding risk/) });
    }
    expect(HISTORY.find((x) => x.id === 'thrombocytopenia')!.label).toBe('Low platelets (< 100,000)');
  });

  it('HFrEF: diltiazem refused for AF, flutter and SVT (3 — Harm), procainamide and sotalol refused, a β-blocker only if compensated', () => {
    const hf: Problem[] = ['heart-failure'];
    for (const [prof, hr] of [['atrial-fibrillation', 150], ['atrial-flutter', 150], ['avnrt', 180]] as const) {
      expect(planDose('diltiazem', h(prof, hr, hf), 20).verdict.text, prof).toMatch(/^Not with HFrEF \(2023 ACC\/AHA\/ACCP\/HRS AF: IV non-dihydropyridine calcium-channel blockers — 3: Harm\)/);
    }
    expect(tone('procainamide', h('vt', 160, []), 1000)).toBe('good');
    expect(tone('procainamide', h('vt', 160, hf), 1000)).toBe('bad');
    // sotalol: only while compensated (label: decompensated failure); wet lungs now rule it out, with the β-blockers
    expect(planDose('sotalol', h('vt', 160, hf), 120).verdict.text).toMatch(/HFrEF: sotalol only while the failure is compensated/);
    expect(tone('sotalol', h('vt', 160, ['pulmonary-edema']), 120)).toBe('bad');
    expect(planDose('metoprolol', h('atrial-fibrillation', 150, hf), 5).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/only while the failure is compensated/) });
  });

  it('kidney failure and a low potassium', () => {
    for (const x of ['renal-failure', 'dialysis'] as Problem[]) {
      expect(planDose('magnesium-sulfate', h('torsades', 230, [x]), 2).verdict.text).toMatch(/accumulates — a lower dose, and check the level/);
      expect(tone('digoxin', h('atrial-fibrillation', 150, [x]), 0.25)).toBe('caution');
      expect(planDose('procainamide', h('vt', 160, [x]), 1000).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/NAPA accumulates/) });
      // sotalol: the label rules it out for AF or flutter below a creatinine clearance of 40; for VT it lengthens the interval
      expect(planDose('sotalol', h('atrial-fibrillation', 150, [x]), 120).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not for AF or flutter with kidney failure: the sotalol label rules it out below a creatinine clearance of 40 mL\/min/) });
      expect(planDose('sotalol', h('vt', 160, [x]), 120).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Kidney failure: sotalol is cleared by the kidneys — a longer dosing interval by the creatinine clearance \(label\)/) });
      const k = h('hyperkalemia', 64, [x]);
      expect(MED_BY_ID['insulin-dextrose'].usual(k)).toEqual({ low: 5, high: 5 });
      expect(planDose('insulin-dextrose', k, 5).verdict.tone).toBe('good');
      expect(planDose('insulin-dextrose', k, 10).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Kidney failure: 5 units, not 10/) });
    }
    expect(planDose('insulin-dextrose', h('hyperkalemia', 64, []), 10).verdict.tone).toBe('good');
    expect(tone('sotalol', h('vt', 160, ['hypokalemia']), 120)).toBe('bad');
    expect(planDose('digoxin', h('atrial-fibrillation', 150, ['hypokalemia']), 0.25).verdict.text).toMatch(/low potassium makes digoxin toxicity more likely/);
  });

  it('a long QT in the history: no QT-prolonging antiarrhythmic — sotalol in AF included (GM49)', () => {
    for (const [id, d] of [['amiodarone', 150], ['procainamide', 1000], ['sotalol', 120]] as [MedId, number][]) {
      expect(tone(id, h('vt', 160, ['long-qt']), d), id).toBe('bad');
    }
    expect(tone('sotalol', h('atrial-fibrillation', 150, []), 120)).toBe('caution');
    const af = planDose('sotalol', h('atrial-fibrillation', 150, ['long-qt']), 120);
    expect(af.verdict.tone).toBe('bad');
    expect(af.steps.some((s) => s.profile === 'torsades')).toBe(true);
  });

  it('75 or older: half-dose tenecteplase, clopidogrel 75 mg after lysis (over 75), no prasugrel, half the opioid', () => {
    const tnk = MED_BY_ID.tenecteplase;
    const old = h('anterior-stemi', 92, [], { kg: 85, age: 80 });
    // half the band is considered (STREAM-2; ESC), the full band is the US label's dose: both are usual, the full one warned
    expect(tnk.usual(old)).toEqual({ low: 22.5, high: 45 });
    const half = planDose('tenecteplase', old, 22.5);
    expect(half.doseClass).toBe('usual');
    expect(half.verdict.text).toMatch(/At 80, half the weight-band dose is considered \(STREAM-2; ESC\) — not in the US label/);
    expect(half.steps.some((s) => /weight-band dose at 80/.test(s.note))).toBe(false);
    const full = planDose('tenecteplase', old, 45);
    expect(full.doseClass).toBe('usual');
    expect(full.steps.some((s) => s.tone === 'warn' && /The full weight-band dose at 80/.test(s.note))).toBe(true);
    expect(full.steps.some((s) => /Above the weight band/.test(s.note))).toBe(false);
    expect(planDose('tenecteplase', old, 30).steps.some((s) => /More than half the weight-band dose at 80/.test(s.note))).toBe(true);
    expect(planDose('tenecteplase', old, 50).steps.some((s) => /Above the weight band/.test(s.note))).toBe(true);
    expect(tnk.usual({ ...old, age: 74 })).toEqual({ low: 45, high: 45 });
    // the cut-off is 75 itself
    expect(tnk.usual({ ...old, age: 75 })).toEqual({ low: 22.5, high: 45 });
    // clopidogrel after lysis
    const lysed = (age: number) => h('anterior-stemi', 92, [], { age, given: [{ id: 'tenecteplase', dose: 45, at: 0 }] });
    expect(classifyDose(MED_BY_ID.clopidogrel, lysed(80), 75)).toBe('usual');
    expect(planDose('clopidogrel', lysed(80), 75).verdict.text).toMatch(/At 80: 75 mg, no load\./);
    expect(planDose('clopidogrel', lysed(80), 300).verdict.text).toMatch(/300 mg is more than the dose after lysis at 80 \(75 mg, no load\)/);
    expect(classifyDose(MED_BY_ID.clopidogrel, lysed(75), 300)).toBe('usual');
    expect(planDose('clopidogrel', lysed(70), 300).verdict.text).toMatch(/At 70: the 300 mg load\./);
    expect(planDose('clopidogrel', lysed(70), 300).verdict.text).not.toMatch(/age is not set/);
    // prasugrel and the opioid dose
    expect(planDose('prasugrel', h('anterior-stemi', 92, [], { age: 78 }), 60).verdict.text).toMatch(/ At 78: prasugrel is generally not recommended from 75 \(boxed warning/);
    // where prasugrel would otherwise be the right choice, the age makes it "with care" and leads
    expect(planDose('prasugrel', h('anterior-stemi', 92, ['oral-anticoagulant'], { age: 78 }), 60).verdict.tone).toBe('caution');
    expect(tone('prasugrel', h('anterior-stemi', 92, [], { age: 60 }), 60)).toBe('caution');
    expect(planDose('prasugrel', h('anterior-stemi', 92, [], { age: 60 }), 60).verdict.text).not.toMatch(/At 60/);
    expect(MED_BY_ID.fentanyl.usual(h('anterior-stemi', 92, [], { age: 80 }))).toEqual({ low: 20, high: 40 });
    // 75 is already "75 or older"; 74 is not
    expect(MED_BY_ID.fentanyl.usual(h('anterior-stemi', 92, [], { age: 75 }))).toEqual({ low: 20, high: 40 });
    expect(MED_BY_ID.fentanyl.usual(h('anterior-stemi', 92, [], { age: 74 }))).toEqual({ low: 40, high: 80 });
    expect(planDose('prasugrel', h('anterior-stemi', 92, [], { age: 75 }), 60).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/ At 75: prasugrel is generally not recommended from 75/) });
    expect(planDose('prasugrel', h('anterior-stemi', 92, [], { age: 74 }), 60).verdict.text).not.toMatch(/At 74/);
    expect(classifyDose(MED_BY_ID.fentanyl, h('anterior-stemi', 92, [], { age: 80 }), 80)).toBe('high');
    expect(classifyDose(MED_BY_ID.fentanyl, h('anterior-stemi', 92, [], { age: 60 }), 80)).toBe('usual');
  });

  it('wheezing now: albuterol is the treatment, with care when the rate is fast, the QT long or the heart ischemic', () => {
    expect(tone('albuterol', h('normal-sinus', 80, []), 2.5)).toBe('caution');
    expect(planDose('albuterol', h('normal-sinus', 80, ['bronchospasm']), 2.5).verdict).toMatchObject({ tone: 'good', text: expect.stringMatching(/^Wheezing: albuterol 2\.5–5 mg nebulized/) });
    expect(planDose('albuterol', h('atrial-fibrillation', 150, ['bronchospasm']), 2.5).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/the rate is already fast/) });
    expect(planDose('albuterol', h('long-qt', 72, ['bronchospasm']), 2.5).verdict.text).toMatch(/with a long QT/);
    expect(tone('albuterol', h('nstemi', 84, ['bronchospasm']), 2.5)).toBe('caution');
    // not in an arrest, and the hyperkalemia dose is still its own
    expect(tone('albuterol', h('vf', 0, ['bronchospasm']), 2.5)).toBe('bad');
    expect(planDose('albuterol', h('hyperkalemia', 64, ['bronchospasm']), 10).verdict.text).toMatch(/^Hyperkalemia/);
  });

  it('every history item the page offers changes some verdict or usual dose', () => {
    const rhythms: [string, number][] = [['avnrt', 180], ['atrial-fibrillation', 150], ['vt', 160], ['sinus-bradycardia', 40], ['anterior-stemi', 92], ['nstemi', 84], ['hyperkalemia', 64], ['torsades', 230]];
    const read = (p: Patient) => MEDS.flatMap((m) => {
      const plan = planDose(m.id, p, m.usual(p).high);
      return [plan.verdict.tone, plan.verdict.text, plan.doseClass, JSON.stringify(m.usual(p))];
    }).join('|');
    for (const item of HISTORY) {
      const changes = rhythms.some(([prof, hr]) => read(h(prof, hr, [])) !== read(h(prof, hr, [item.id])));
      expect(changes, item.id).toBe(true);
    }
    // the ids are the case simulator's words, each offered once
    expect(new Set(HISTORY.map((x) => x.id)).size).toBe(HISTORY.length);
  });
});

describe('GM44: the session keeps the history, the age and the drug clock', () => {
  beforeEach(() => {
    useAppStore.getState().setMode('learn');
    useMedStore.getState().reset('other-condition');
    useMedStore.getState().reset('avnrt');
    sim.time = 100_000;
    setRhythm('avnrt', 180);
    sim.engine.setRhythm('avnrt', 180, sim.time, null);
  });
  function run(ms: number, dt = 16) {
    for (let t = 0; t < ms; t += dt) {
      const ecg = useECGStore.getState();
      sim.engine.setRhythm(ecg.activeProfileId, useTimelineStore.getState().heartRate, sim.time, useMedStore.getState().mods);
      sim.time += dt;
      sim.engine.ensure(sim.time + 4000);
      tickMeds(sim.time);
    }
  }

  it('the history and the age the learner sets are what the dose is judged on', () => {
    run(6_000);
    useMedStore.getState().toggleProblem('asthma');
    expect(useMedStore.getState().problems).toEqual(['asthma']);
    expect(useMedStore.getState().give('adenosine', 6).verdict.text).toMatch(/^Not with asthma/);
    useMedStore.getState().toggleProblem('asthma');
    expect(useMedStore.getState().problems).toEqual([]);
    // an age is a whole adult age
    useMedStore.getState().setAge(82.4);
    expect(useMedStore.getState().age).toBe(82);
    useMedStore.getState().setAge(5);
    expect(useMedStore.getState().age).toBe(18);
    useMedStore.getState().setAge(null);
    expect(useMedStore.getState().age).toBeNull();
  });

  it('"Reset patient" keeps the history and the age (the same patient); another condition clears them; the drug clock restarts either way', () => {
    useMedStore.getState().toggleProblem('bleeding');
    useMedStore.getState().setAge(80);
    useMedStore.setState({ skipped: 60_000 });
    useMedStore.getState().reset('avnrt');
    expect(useMedStore.getState()).toMatchObject({ problems: ['bleeding'], age: 80, skipped: 0 });
    useMedStore.getState().reset();
    expect(useMedStore.getState()).toMatchObject({ problems: ['bleeding'], age: 80 });
    useMedStore.getState().reset('atrial-fibrillation');
    expect(useMedStore.getState()).toMatchObject({ problems: [], age: null, skipped: 0 });
  });

  it('skip ahead moves the drug clock: a dose is timed in drug time, so a repeat after a skip is not called "too soon"', () => {
    setRhythm('atrial-fibrillation', 150);
    sim.engine.setRhythm('atrial-fibrillation', 150, sim.time, null);
    run(6_000);
    const t0 = sim.time;
    useMedStore.getState().give('diltiazem', 20);
    expect(useMedStore.getState().given[0].at).toBe(t0);
    useMedStore.getState().skipAhead();
    const skipped = useMedStore.getState().skipped;
    expect(skipped).toBeGreaterThan(60_000);
    run(2_000);
    // a second bolus straight after the skip: the drugs have had about two minutes, not two seconds
    const second = useMedStore.getState().give('diltiazem', 25);
    const at = useMedStore.getState().given[1].at;
    expect(at).toBe(sim.time + skipped);
    expect(second.verdict.text).toMatch(/Too soon: the last bolus was 2 min ago/);
    // once the drugs have had 15 minutes, the repeat is on time
    useMedStore.getState().reset('avnrt');
    setRhythm('atrial-fibrillation', 150);
    run(6_000);
    useMedStore.getState().give('diltiazem', 20);
    useMedStore.setState({ skipped: 16 * 60_000 });
    expect(useMedStore.getState().give('diltiazem', 25).verdict.text).not.toMatch(/Too soon/);
  });

  it('epinephrine in an arrest: every 3–5 min of drug time', () => {
    setRhythm('vf', 0);
    sim.engine.setRhythm('vf', 0, sim.time, null);
    run(1_000, 50);
    expect(useMedStore.getState().give('epinephrine', 1).verdict.tone).toBe('good');
    run(60_000, 100);
    const soon = useMedStore.getState().give('epinephrine', 1);
    expect(soon.verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Too soon: the last epinephrine was 1 min ago/) });
    useMedStore.setState({ skipped: useMedStore.getState().skipped + 4 * 60_000 });
    expect(useMedStore.getState().give('epinephrine', 1).verdict.tone).toBe('good');
  });
});

describe('contraindications as the labels and guidelines word them: shock risk, the brain, platelets, the drug clock', () => {
  const g = (id: MedId, dose: number, at = 0) => ({ id, dose, at });
  const h = (profileId: string, hr: number, problems: Problem[], extra: Partial<Patient> = {}) => patient(profileId, hr, { sbp: 120, problems, ...extra });

  it('an IV β-blocker in acute MI: a systolic under 120 or an age over 70 is a shock risk — no IV dose (2013 ACCF/AHA STEMI, COMMIT)', () => {
    const mi = (extra: Partial<Patient>) => patient('anterior-stemi', 92, extra);
    expect(planDose('metoprolol', mi({ sbp: 130, age: 60 }), 5).verdict.tone).toBe('caution');
    expect(planDose('metoprolol', mi({ sbp: 130 }), 5).verdict.tone).toBe('caution');
    expect(planDose('metoprolol', mi({ sbp: 110 }), 5).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Harmful here: a systolic of 110 mmHg \(under 120\) is a risk factor for cardiogenic shock/) });
    expect(planDose('metoprolol', mi({ sbp: 119, age: 80 }), 5).verdict.text).toMatch(/a systolic of 119 mmHg \(under 120\)/);
    expect(planDose('metoprolol', mi({ sbp: 130, age: 80 }), 5).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Harmful here: an age over 70 \(80\) is a risk factor for cardiogenic shock/) });
    expect(planDose('metoprolol', mi({ sbp: 130, age: 70 }), 5).verdict.tone).toBe('caution');
    expect(planDose('esmolol', mi({ sbp: 110, age: 80 }), 40).verdict.tone).toBe('bad');
    expect(planDose('esmolol', mi({ sbp: 130, age: 80 }), 40).verdict.text).toMatch(/an age over 70/);
    // an NSTE-ACS reads the same risks
    expect(planDose('metoprolol', patient('nstemi', 84, { sbp: 112 }), 5).verdict.tone).toBe('bad');
    expect(planDose('metoprolol', patient('nstemi', 84, { sbp: 130 }), 5).verdict.tone).toBe('caution');
  });

  it('asthma or bronchospastic lung disease: the chip says so, and adenosine\'s alternative fits the rhythm (never a calcium-channel blocker for VT)', () => {
    expect(HISTORY.find((x) => x.id === 'asthma')!.label).toBe('Asthma / bronchospastic lung disease');
    expect(planDose('adenosine', h('avnrt', 180, ['asthma']), 6).verdict.text).toMatch(/An SVT here: vagal maneuvers, a calcium-channel blocker, or synchronized cardioversion\./);
    const vt = planDose('adenosine', h('vt', 160, ['asthma']), 6).verdict;
    expect(vt.tone).toBe('bad');
    expect(vt.text).toMatch(/A wide-complex tachycardia: synchronized cardioversion, or procainamide or amiodarone if stable\./);
    expect(vt.text).not.toMatch(/An SVT here|calcium-channel blocker, or/);
  });

  it('a long QT in the history: in VF the arrest dose of amiodarone is "with care" (lidocaine preferred, keep defibrillating) — never "synchronized cardioversion"', () => {
    const vf = planDose('amiodarone', h('vf', 0, ['long-qt']), 300).verdict;
    expect(vf.tone).toBe('caution');
    expect(vf.text).toMatch(/^A long QT: for shock-refractory VF or pulseless VT, lidocaine is the better choice.*keep defibrillating/);
    expect(vf.text).not.toMatch(/synchronized/);
    expect(planDose('amiodarone', h('vf', 0, []), 300).verdict.tone).toBe('good');
    // with a pulse it is still refused
    expect(planDose('amiodarone', h('vt', 160, ['long-qt']), 150).verdict.tone).toBe('bad');
  });

  it('sotalol with a long QT in the history says it once, in every rhythm', () => {
    const af = planDose('sotalol', h('atrial-fibrillation', 150, ['long-qt']), 120).verdict.text;
    expect(af.match(/Not with a long QT/g)).toHaveLength(1);
    for (const [prof, hr, d] of [['vt', 160, 120], ['vt', 160, 60], ['avnrt', 180, 120], ['normal-sinus', 80, 120]] as [string, number, number][]) {
      const v = planDose('sotalol', h(prof, hr, ['long-qt']), d).verdict;
      expect(v.tone, `${prof} ${d}`).toBe('bad');
      expect(v.text.match(/long QT/g)!.length, `${prof} ${d}`).toBeLessThanOrEqual(2);
    }
    // without the history the low-dose VT and the SVT verdicts are as before
    expect(planDose('sotalol', h('vt', 160, []), 60).verdict.tone).toBe('good');
    expect(planDose('sotalol', h('avnrt', 180, []), 120).verdict.tone).toBe('caution');
  });

  it('IV diltiazem and an IV β-blocker: refused within a few hours (label), "with care" after — the drug clock decides', () => {
    const af = (now: number | undefined, given: Patient['given']) => patient('atrial-fibrillation', 150, { sbp: 120, now, given });
    expect(planDose('diltiazem', af(undefined, [g('esmolol', 40)]), 20).verdict.tone).toBe('bad');
    expect(planDose('diltiazem', af(60 * 60_000, [g('esmolol', 40)]), 20).verdict.tone).toBe('bad');
    const later = planDose('diltiazem', af(6 * 3_600_000, [g('esmolol', 40)]), 20);
    expect(later.verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^An IV β-blocker \(esmolol\) 6 h ago: past the few hours the labels ask for/) });
    expect(later.steps.some((s) => /calcium-channel blocker and a β-blocker/.test(s.note))).toBe(true);
    // the other order, on the same clock
    expect(planDose('metoprolol', af(30 * 60_000, [g('diltiazem', 20)]), 5).verdict.tone).toBe('bad');
    expect(planDose('metoprolol', af(5 * 3_600_000, [g('diltiazem', 20)]), 5).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^IV diltiazem 5 h ago/) });
  });

  it('albuterol reads a long QT in the history too', () => {
    const v = planDose('albuterol', h('normal-sinus', 80, ['long-qt']), 2.5).verdict;
    expect(v).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Only for real bronchospasm: with a long QT a β-agonist lowers the potassium/) });
    expect(v.text).not.toMatch(/QTc about/);
    expect(planDose('albuterol', h('normal-sinus', 80, ['long-qt', 'bronchospasm']), 2.5).verdict.text).toMatch(/with a long QT it lowers the potassium/);
  });

  it('GM31 in a PE too: a second UFH bolus is "with care"', () => {
    const pe = patient('pulmonary-embolism', 110, { sbp: 120 });
    expect(planDose('heparin', pe, 6400).verdict.text).toMatch(/^Anticoagulate at once/);
    const again = planDose('heparin', { ...pe, given: [g('heparin', 6400)] }, 6400);
    expect(again.verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^The bolus has already been given/) });
  });

  it('aspirin in pericarditis: a tamponade is drained first; a hemorrhagic effusion or a possible dissection rules it out', () => {
    const text = planDose('aspirin', patient('pericarditis', 104), 650).verdict.text;
    expect(text).toMatch(/A tamponade is drained first; avoid it with a hemorrhagic effusion or a possible dissection\./);
    expect(text).not.toMatch(/Not with a tamponade/);
  });

  it('GM28 in every rhythm: past 3 mg of atropine there is a warning on the timeline (Mobitz II included)', () => {
    for (const [prof, hr] of [['mobitz-ii', 40], ['third-degree-avb', 36], ['sinus-bradycardia', 40]] as [string, number][]) {
      const plan = planDose('atropine', patient(prof, hr, { given: [g('atropine', 2.5)] }), 1);
      expect(plan.verdict.text, prof).toMatch(/3\.5 mg in total — past the 3 mg maximum/);
      expect(plan.steps.filter((s) => s.tone === 'warn' && /past the 3 mg maximum/.test(s.note)), prof).toHaveLength(1);
    }
  });

  it('push-dose epinephrine for a low pressure: the usual dose is never judged worse than a bigger one', () => {
    const low = patient('normal-sinus', 100, { sbp: 80 });
    const usual = planDose('epinephrine', low, 0.01);
    expect(usual.verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^A bridge for a low pressure while its cause is found and treated/) });
    expect(planDose('epinephrine', low, 0.04).verdict.tone).toBe('caution');
    expect(planDose('epinephrine', patient('normal-sinus', 100, { sbp: 120 }), 0.01).verdict.tone).toBe('bad');
  });

  it('insulin: a second dose while the first is still acting (4–6 h) is "with care", on the drug clock too', () => {
    const k = (now: number) => patient('hyperkalemia', 64, { now, given: [g('insulin-dextrose', 10, 3_600_000)] });
    expect(planDose('insulin-dextrose', k(3 * 3_600_000), 10).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^A second dose of insulin/) });
    expect(planDose('insulin-dextrose', k(1.5 * 3_600_000), 10).verdict.tone).toBe('caution');
    expect(planDose('insulin-dextrose', k(8 * 3_600_000), 10).verdict.tone).toBe('good');
  });

  it('a preload-dependent heart in the history: no nitrate with an RV infarction, severe aortic stenosis or LV outflow obstruction', () => {
    expect(planDose('nitroglycerin', h('inferior-stemi', 72, []), 0.4).verdict.tone).toBe('caution');
    expect(planDose('nitroglycerin', h('inferior-stemi', 72, ['rv-infarction']), 0.4).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with an RV infarction \(2025 ACC\/AHA ACS\): a preload-dependent heart/) });
    expect(planDose('nitroglycerin', h('nstemi', 84, ['severe-aortic-stenosis']), 0.4).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with severe aortic stenosis/) });
    expect(planDose('nitroglycerin', h('nstemi', 84, ['lvot-obstruction']), 0.4).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with dynamic LV outflow obstruction/) });
    // the aortic-stenosis page already says it: not twice
    expect(planDose('nitroglycerin', h('aortic-stenosis', 70, ['severe-aortic-stenosis']), 0.4).verdict.text).not.toMatch(/Not with severe aortic stenosis/);
    // an opioid with an RV infarction: small doses
    expect(planDose('fentanyl', h('inferior-stemi', 72, ['rv-infarction']), 50).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^RV infarction: a preload-dependent heart — an opioid can drop the pressure/) });
    for (const id of ['rv-infarction', 'severe-aortic-stenosis', 'lvot-obstruction', 'digoxin-toxicity'] as Problem[]) {
      expect(HISTORY.some((x) => x.id === id), id).toBe(true);
    }
  });

  it('LV outflow obstruction: no epinephrine with a pulse (it is still the arrest drug); phenylephrine is the drug for its low pressure', () => {
    expect(planDose('epinephrine', h('cardiogenic-shock', 118, ['lvot-obstruction'], { sbp: 78 }), 0.01).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with dynamic LV outflow obstruction \(obstructive HCM, Takotsubo with LVOTO\)/) });
    expect(planDose('epinephrine', h('vf', 0, ['lvot-obstruction']), 1).verdict.tone).toBe('good');
    expect(planDose('phenylephrine', h('cardiogenic-shock', 118, [], { sbp: 80 }), 100).verdict.tone).toBe('caution');
    for (const x of ['lvot-obstruction', 'severe-aortic-stenosis'] as Problem[]) {
      expect(planDose('phenylephrine', h('cardiogenic-shock', 118, [x], { sbp: 80 }), 100).verdict, x).toMatchObject({ tone: 'good', text: expect.stringMatching(/^Hypotension with outflow obstruction/) });
    }
    // no low pressure: still nothing to treat
    expect(planDose('phenylephrine', h('nstemi', 84, ['lvot-obstruction']), 100).verdict.tone).toBe('bad');
  });

  it('digoxin toxicity: no more digoxin; calcium only slowly, after digoxin Fab', () => {
    expect(planDose('digoxin', h('atrial-fibrillation', 150, []), 0.25).verdict.tone).not.toBe('bad');
    expect(planDose('digoxin', h('atrial-fibrillation', 150, ['digoxin-toxicity']), 0.25).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with digoxin toxicity: more digoxin feeds it/) });
    const ca = planDose('calcium-chloride', h('hyperkalemia', 64, ['digoxin-toxicity']), 1).verdict;
    expect(ca.tone).toBe('caution');
    expect(ca.text).toMatch(/^Digoxin toxicity: digoxin Fab treats its hyperkalemia \(2023 AHA\)\. The calcium label still lists digitalis toxicity; the evidence \(Levine 2011\) found no harm — if calcium is needed, give it slowly\./);
  });

  it('the brain: raised intracranial pressure holds the nitrate; neurosurgery or an intracranial lesion makes heparin "with care"', () => {
    for (const x of ['intracranial-hemorrhage', 'intracranial-risk'] as Problem[]) {
      expect(planDose('nitroglycerin', h('nstemi', 84, [x]), 0.4).verdict, x).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^Raised intracranial pressure is a label contraindication/) });
    }
    expect(planDose('heparin', h('nstemi', 84, ['intracranial-risk']), 4000).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^An intracranial lesion, or recent brain or spine surgery or head trauma: full anticoagulation is a relative contraindication/) });
    expect(planDose('heparin', h('nstemi', 84, []), 4000).verdict.tone).toBe('good');
  });
});

describe('review round: Give meds says the contraindication the simulator and the cards say', () => {
  const tone = (id: MedId, p: Patient, dose: number) => planDose(id, p, dose).verdict.tone;
  const text = (id: MedId, p: Patient, dose: number) => planDose(id, p, dose).verdict.text;
  const withProblems = (profileId: string, hr: number, problems: Problem[], extra: Partial<Patient> = {}) => patient(profileId, hr, { sbp: 120, problems, ...extra });

  it('SCAD: heparin and a P2Y12 load are not judged as for a clot (the heparin card, the SCAD page)', () => {
    const scad = patient('anterior-stemi', 92, { sbp: 128, conditionId: 'scad' });
    expect(planDose('heparin', scad, 4000).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^SCAD: heparin is often started before the angiogram/) });
    expect(planDose('ticagrelor', scad, 180).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/^SCAD: aspirin is reasonable; without a stent the role of a P2Y12 inhibitor is uncertain/) });
    expect(tone('heparin', patient('anterior-stemi', 92, { sbp: 128 }), 4000)).toBe('good');
  });

  it('digoxin with LV outflow obstruction: the chip, and the HCM and Takotsubo-LVOTO pages', () => {
    expect(planDose('digoxin', withProblems('atrial-fibrillation', 130, ['lvot-obstruction']), 0.25).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with dynamic LV outflow obstruction/) });
    expect(tone('digoxin', patient('hcm', 80, { sbp: 120 }), 0.25)).toBe('bad');
    expect(text('digoxin', patient('takotsubo-lvoto', 110, { sbp: 100 }), 0.25)).toMatch(/positive inotrope worsens the gradient/);
  });

  it('the HCM page: a β-blocker is first line; diltiazem with a low pressure is harmful', () => {
    for (const [id, dose] of [['metoprolol', 5], ['esmolol', 40]] as const) {
      expect(planDose(id, patient('hcm', 80, { sbp: 120 }), dose).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/non-vasodilating β-blocker is first line/) });
    }
    expect(planDose('diltiazem', patient('hcm', 80, { sbp: 80 }), 20).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not with hypotension in obstructive HCM/) });
  });

  it('procainamide after lidocaine is two class I drugs, as lidocaine after procainamide is', () => {
    const vt = patient('vt', 160, { sbp: 120, given: [{ id: 'lidocaine', dose: 100, at: 0 }] });
    expect(planDose('procainamide', vt, 1000).verdict).toMatchObject({ tone: 'caution', text: expect.stringMatching(/Lidocaine already given: two class I drugs/) });
  });

  it('AF with a systolic under 90: amiodarone and digoxin say the shock comes first', () => {
    const af = patient('atrial-fibrillation', 150, { sbp: 80 });
    for (const [id, dose] of [['amiodarone', 150], ['digoxin', 0.25]] as const) expect(text(id, af, dose), id).toMatch(/this AF is unstable: synchronized cardioversion/);
    expect(text('amiodarone', patient('atrial-fibrillation', 150, { sbp: 120 }), 150)).not.toMatch(/unstable/);
  });

  it('the new history chips: wet lungs, pheochromocytoma, low magnesium or calcium, a sodium-channel-blocker overdose', () => {
    for (const id of ['pulmonary-edema', 'pheochromocytoma', 'hypomagnesemia', 'hypocalcemia', 'sodium-channel-blocker-overdose'] as Problem[]) {
      expect(HISTORY.some((x) => x.id === id), id).toBe(true);
    }
    const af = (problems: Problem[]) => withProblems('atrial-fibrillation', 150, problems);
    for (const [id, dose] of [['metoprolol', 5], ['esmolol', 40], ['diltiazem', 20]] as const) expect(tone(id, af(['pulmonary-edema']), dose), id).toBe('bad');
    expect(tone('procainamide', withProblems('vt', 160, ['pulmonary-edema']), 1000)).toBe('bad');
    for (const [id, dose] of [['metoprolol', 5], ['esmolol', 40]] as const) expect(text(id, af(['pheochromocytoma']), dose), id).toMatch(/untreated pheochromocytoma/);
    expect(text('digoxin', af(['hypomagnesemia']), 0.25)).toMatch(/low magnesium/);
    expect(text('sodium-bicarbonate', withProblems('normal-sinus', 80, ['hypocalcemia']), 50)).toMatch(/A low calcium/);
    expect(tone('procainamide', withProblems('vt', 160, ['sodium-channel-blocker-overdose']), 1000)).toBe('bad');
  });

  it('combinations and pages: calcium and bicarbonate, lysis after ticagrelor, heparin on an oral anticoagulant, pericarditis, PE, Takotsubo', () => {
    const k = patient('hyperkalemia', 60, { sbp: 110, given: [{ id: 'sodium-bicarbonate', dose: 50, at: 0 }] });
    expect(text('calcium-chloride', k, 1)).toMatch(/Not through the same line/);
    const stemi = patient('anterior-stemi', 92, { sbp: 128, given: [{ id: 'ticagrelor', dose: 180, at: 0 }] });
    expect(text('tenecteplase', stemi, 45)).toMatch(/clopidogrel is the P2Y12 inhibitor given with a fibrinolytic/);
    expect(text('heparin', withProblems('anterior-stemi', 92, ['oral-anticoagulant']), 4000)).toMatch(/check the INR or the time of the last DOAC dose/);
    expect(planDose('tenecteplase', patient('pericarditis', 104, { sbp: 120 }), 45).verdict).toMatchObject({ tone: 'bad', text: expect.stringMatching(/^Not in pericarditis/) });
    expect(text('phenylephrine', patient('pulmonary-embolism', 114, { sbp: 80 }), 0.1)).toMatch(/norepinephrine is the first vasopressor/);
    expect(text('epinephrine', patient('takotsubo', 102, { sbp: 82 }), 0.02)).toMatch(/catecholamines are avoided where possible/);
  });

  it('wheezing now rules a β1-selective blocker out; a history of asthma calls for care', () => {
    expect(tone('metoprolol', withProblems('atrial-fibrillation', 150, ['bronchospasm']), 5)).toBe('bad');
    expect(tone('metoprolol', withProblems('atrial-fibrillation', 150, ['asthma']), 5)).toBe('caution');
  });
});
