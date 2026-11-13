/**
 * The kit for the second batch of cases: three ECG profiles (pre-excited AF, posterior STEMI, a long QT) with their
 * 12-lead reads, a patient on a continuous-flow LVAD (no pulse, no cuff pressure, a Doppler MAP), and the new actions —
 * their scope, default effects and built-in safety rules — wired into the cases that already had the drugs they stand beside.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { ECG_PROFILES, stLevel } from '@/lib/ecg/profiles';
import { DRILL_SETS } from '@/lib/drill';
import { QUIZ_QUESTIONS } from '@/data/content/quiz';
import { CATHLAB } from '@/data/content/cathlab';
import { ECG_PROFILE_IDS } from '@/types/content';
import { PROFILE_TERRITORY } from '@/lib/anatomy/landmarks';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { BUILT_IN_HARMS, perform, posteriorLeads, review, start, stop, unavailableReason, vitalsLine } from '@/lib/sim/scenario/engine';
import { READ_OPTION_BY_ID, answerFor, judgeRead, partialFor } from '@/lib/sim/scenario/reads';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { mapOf, palpable } from '@/lib/sim/scenario/kit';
import type { Problem, Scenario, SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { CONTINUOUS_FLOW_PLETH, plethAt, resetCode, setScriptedVitals, useDefibStore, vitalsAt } from '@/lib/sim/defib';
import { sim } from '@/lib/sim/simulation';
import { MED_BY_ID, planDose, type MedId } from '@/lib/sim/meds';
import { enterSimulator, leaveSimulator, monitorVitals, useSimStore } from '@/store/useSimStore';
import { UNTIL_ARRIVED, run as runDriver, runScenario as run } from './helpers';

const VITALS = { sbp: 132, dbp: 80, spo2: 96, rr: 16, etco2: 36, pain: 0, gcs: 15, glucose: 110, temp: 36.8 };

/** A bare test patient: nothing happens by itself, and the case never ends before the hand-off */
function patient(over: Partial<Scenario> & { profile?: string; hr?: number; vitals?: Partial<typeof VITALS>; lvad?: boolean } = {}): Scenario {
  const { profile = 'normal-sinus', hr = 80, vitals = {}, lvad, ...rest } = over;
  return {
    id: 'kit2-test', title: 'Test patient', summary: 'A bare patient for the kit tests.', setting: 'field', roles: [1, 2, 3, 4, 5], difficulty: 'beginner',
    briefing: { default: [['dispatch', 'Test patient.']] },
    initial: { rhythm: { profile, hr }, vitals: { ...VITALS, ...vitals }, ...(lvad ? { lvad: true } : {}) },
    facts: {}, respond: {}, events: [],
    critical: [{ id: 'handoff', label: 'Hand-off', why: 'The end of the case.', done: ['handoff'] }],
    harms: [], teaching: [],
    ...rest,
  };
}
const lab = (over: Parameters<typeof patient>[0] = {}) => patient({ setting: 'cathlab', ...over });
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const lastText = (s: SimState) => s.log.at(-1)!.text;
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
/** The tracing as the 12-lead sees it: the voltage of a lead at a moment of a beat */
const beatAt = (id: string, hr = ECG_PROFILES[id].defaultHR) => {
  const e = new ECGEngine(id, hr);
  e.ensure(30_000);
  return e;
};
const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|pre-excit|WPW|long QT|LVAD failure/i;

// ─── ECG profiles and reads ────────────────────────────────────────────────

describe('pre-excited atrial fibrillation (af-wpw)', () => {
  const p = ECG_PROFILES['af-wpw'];

  it('is fast, irregular and wide, with a QRS that changes from beat to beat', () => {
    expect(p.rhythm).toBe('af');
    expect(p.defaultHR).toBeGreaterThanOrEqual(210);
    expect(p.defaultHR).toBeLessThanOrEqual(220);
    const e = beatAt('af-wpw');
    const beats = e.vent.filter((v) => v.t > 8000 && v.t < 28_000);
    const rr = beats.slice(1).map((v, i) => v.t - beats[i].t);
    const mean = rr.reduce((a, b) => a + b, 0) / rr.length;
    // irregularly irregular: a wide spread of cycles around the rate asked for, the shortest set by the pathway
    expect(60_000 / mean).toBeGreaterThan(195);
    expect(60_000 / mean).toBeLessThan(235);
    expect(Math.min(...rr)).toBeGreaterThanOrEqual(p.pathway!.shortestRR - 1);
    expect(Math.min(...rr)).toBeLessThanOrEqual(250);
    expect(Math.max(...rr) - Math.min(...rr)).toBeGreaterThan(100);
    // every beat wide, and not all the same width (fusion with what the AV node conducts)
    const widths = beats.map((v) => v.qrsDur);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(110);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(12);
    expect(beats.every((v) => v.conduction === 'preexcited')).toBe(true);
    // the T wave of each beat is over before the next one, and no QT is read off the merged complexes
    for (let i = 1; i < beats.length; i++) expect(beats[i - 1].qt).toBeLessThan(beats[i].t - beats[i - 1].t);
    expect(e.intervals(20_000)).toMatchObject({ pr: null, qt: null, qtc: null });
  });

  it('a left lateral pathway: negative in I and aVL, positive in V1–V2 and the inferior leads', () => {
    const e = beatAt('af-wpw');
    const b = e.vent.find((v) => v.t > 12_000 && v.qrsDur > 150)!;
    const peak = (lead: 'I' | 'aVL' | 'V1' | 'V2' | 'III') => {
      let hi = -9, lo = 9;
      for (let t = b.t; t < b.t + b.qrsDur; t += 2) { const y = e.voltage(lead, t); hi = Math.max(hi, y); lo = Math.min(lo, y); }
      return hi + lo;
    };
    expect(peak('aVL')).toBeLessThan(0);
    expect(peak('I')).toBeLessThan(0);
    expect(peak('V1')).toBeGreaterThan(0.4);
    expect(peak('V2')).toBeGreaterThan(0.4);
    expect(peak('III')).toBeGreaterThan(0.4);
  });

  it('reads as pre-excited AF; the rhythm or the pathway alone is half of it', () => {
    expect(answerFor('af-wpw').id).toBe('afib-preexcited');
    expect(READ_OPTION_BY_ID['afib-preexcited'].group).toBe('Rhythm');
    expect(partialFor('af-wpw')).toEqual(['afib', 'wpw']);
    expect(judgeRead('af-wpw', 'afib')).toBe('partial');
    expect(judgeRead('af-wpw', 'vt')).toBe('wrong');
  });
});

describe('posterior STEMI (posterior-stemi)', () => {
  const p = ECG_PROFILES['posterior-stemi'];
  const e = beatAt('posterior-stemi');
  const b = e.vent.find((v) => v.t > 12_000)!;
  const r = (lead: 'V1' | 'V2') => { let hi = -9; for (let t = b.t; t < b.t + b.qrsDur; t += 2) hi = Math.max(hi, e.voltage(lead, t)); return hi; };
  const s = (lead: 'V1' | 'V2') => { let lo = 9; for (let t = b.t; t < b.t + b.qrsDur; t += 2) lo = Math.min(lo, e.voltage(lead, t)); return lo; };
  /** ST 40 ms after the J point against the PR segment, mm */
  const st = (lead: 'V1' | 'V2' | 'V3' | 'I' | 'II' | 'aVF') => (e.voltage(lead, b.t + b.qrsDur + 40) - e.voltage(lead, b.t - 30)) * 10;

  it('ST depression with upright T waves and tall R waves in V1–V3, and no ST elevation in the limb leads', () => {
    for (const lead of ['V1', 'V2', 'V3'] as const) expect(st(lead), lead).toBeLessThanOrEqual(-1);
    for (const lead of ['I', 'II', 'aVF'] as const) expect(Math.abs(st(lead)), lead).toBeLessThan(1);
    // R/S over 1 in V1 and V2
    expect(r('V1')).toBeGreaterThan(-s('V1'));
    expect(r('V2')).toBeGreaterThan(2 * -s('V2'));
    // the T wave peaks upright in V1–V3
    for (const lead of ['V1', 'V2', 'V3'] as const) {
      let tp = -9;
      for (let t = b.t + b.qrsDur + 120; t < b.t + b.qt; t += 4) tp = Math.max(tp, e.voltage(lead, t));
      expect(tp, lead).toBeGreaterThan(e.voltage(lead, b.t - 30) + 0.1);
    }
    expect(p.hemo).toBe('stemi');
    expect(PROFILE_TERRITORY['posterior-stemi']).toBe('LCx');
  });

  it('V7–V9 show 0.5 mm or more of ST elevation, read off the same vector model', () => {
    for (const lead of ['V7', 'V8', 'V9'] as const) expect(stLevel(p, lead), lead).toBeGreaterThanOrEqual(0.5);
    expect(posteriorLeads({ rhythm: { profile: 'posterior-stemi', hr: 78 } })).toBe('V7–V9: ST elevation 1 mm in V7, 1.5 mm in V8, 1.5 mm in V9.');
    expect(posteriorLeads({ rhythm: { profile: 'normal-sinus', hr: 78 } })).toBe('V7–V9: no ST elevation.');
    expect(posteriorLeads({ rhythm: { profile: 'anterior-stemi', hr: 78 } })).toBe('V7–V9: no ST elevation.');
  });

  it('the posterior leads action reports them; a case fact still wins; none during CPR', () => {
    const sc = patient({ profile: 'posterior-stemi', hr: 78 });
    expect(lastText(run(sc, 2, ['ecg-posterior']))).toBe('V7–V9: ST elevation 1 mm in V7, 1.5 mm in V8, 1.5 mm in V9.');
    expect(lastText(run(patient({ profile: 'posterior-stemi', facts: { ecgPosterior: 'V7–V9: 2 mm ST elevation.' } }), 2, ['ecg-posterior']))).toBe('V7–V9: 2 mm ST elevation.');
    const arrest = patient({ profile: 'vf', hr: 0, initial: { rhythm: { profile: 'vf', hr: 0 }, vitals: VITALS, pulse: false } });
    expect(run(arrest, 2, ['ecg-posterior']).counts['ecg-posterior']).toBeUndefined();
  });

  it('reads as a posterior STEMI, and it activates the cath lab (a STEMI equivalent)', () => {
    expect(answerFor('posterior-stemi').id).toBe('stemi-posterior');
    expect(READ_OPTION_BY_ID['stemi-posterior'].group).toBe('Ischemia and infarction');
    expect(judgeRead('posterior-stemi', 'ischaemia')).toBe('wrong');
    const sc = patient({ profile: 'posterior-stemi', hr: 78 });
    const s = run(sc, 2, ['ecg12', 'stemi-alert']);
    expect(s.flags['ecg-stemi']).toBeDefined();
    expect(s.flags.alert).toBeDefined();
    expect(ids(s)).not.toContain('stemi-alert-no-ste');
  });
});

describe('long QT with PVCs (long-qt)', () => {
  const p = ECG_PROFILES['long-qt'];

  it('sinus at 50–70 with a QTc of about 580 and an occasional late PVC', () => {
    expect(p.defaultHR).toBeGreaterThanOrEqual(50);
    expect(p.defaultHR).toBeLessThanOrEqual(70);
    expect(p.qtc).toBeGreaterThanOrEqual(560);
    expect(p.qtc).toBeLessThanOrEqual(600);
    const e = beatAt('long-qt');
    const iv = e.intervals(20_000);
    expect(iv.qtc).toBeGreaterThanOrEqual(560);
    expect(iv.qtc).toBeLessThanOrEqual(600);
    const beats = e.vent.filter((v) => v.t > 5000 && v.t < 28_000);
    const pvcs = beats.filter((v) => v.kind === 'pvc').length;
    expect(pvcs).toBeGreaterThan(0);
    // one in seven: occasional, not every fourth beat
    expect(pvcs / beats.length).toBeLessThan(0.2);
  });

  it('reads as a long QT; the PVCs alone are half of it', () => {
    expect(answerFor('long-qt').id).toBe('long-qt');
    expect(judgeRead('long-qt', 'pvcs')).toBe('partial');
    expect(judgeRead('long-qt', 'torsades')).toBe('wrong');
  });

  it('the built-in long-QT rules read the tracing: ondansetron, procainamide and amiodarone on it cost points', () => {
    const sc = patient({ profile: 'long-qt', hr: 58 });
    expect(ids(run(sc, 2, ['iv', 'ondansetron']))).toEqual(['ondansetron-long-qt']);
    expect(ids(run(sc, 2, ['iv', 'procainamide']))).toEqual(['procainamide-long-qt']);
    expect(ids(run(sc, 2, ['iv', 'amio-infusion']))).toEqual(['amiodarone-long-qt']);
    // a normal QT: none of them
    expect(ids(run(patient(), 2, ['iv', 'amio-infusion']))).toEqual([]);
    expect(ids(run(patient({ problems: ['long-qt'] }), 2, ['iv', 'amio-infusion']))).toEqual(['amiodarone-long-qt']);
  });
});

describe('read options the new cath lab cases need', () => {
  it('a left main occlusion, SCAD, and a dynamic LV outflow obstruction (pressures and a sudden change)', () => {
    expect(READ_OPTION_BY_ID['angio-lm-occlusion'].group).toBe('Occlusions');
    expect(READ_OPTION_BY_ID['angio-scad'].group).toBe('Findings');
    expect(READ_OPTION_BY_ID['hemo-lvoto'].group).toBe('Waveforms');
    expect(READ_OPTION_BY_ID['clin-lvoto'].group).toBe('Hemodynamic emergencies');
    // a case asks for them as it asks for any read: the answer, a half-right option, the explanation
    const sc = lab({ events: [{ id: 'gradient', when: () => true, effect: () => ({ read: { kind: 'hemo', answer: 'hemo-lvoto', partial: ['hemo-as'], explain: 'A gradient inside the LV.' } }) }] });
    const s = start(sc, 5);
    expect(s.pendingRead).toMatchObject({ kind: 'hemo', answer: 'hemo-lvoto' });
  });
});

describe('the new profiles join the library quietly', () => {
  const NEW = ['af-wpw', 'posterior-stemi', 'long-qt'];

  it('are listed with every other profile id, consistent and in US English', () => {
    for (const id of NEW) {
      expect(ECG_PROFILE_IDS as readonly string[]).toContain(id);
      const p = ECG_PROFILES[id];
      expect(p.id).toBe(id);
      expect(p.findings.length).toBeGreaterThanOrEqual(4);
      expect(p.keyLeads!.length).toBeGreaterThan(0);
      expect(`${p.name} ${p.headline} ${p.findings.join(' ')}`).not.toMatch(/ischaem|haem|oedema|aemia/i);
    }
  });

  it('do not appear in the rhythm trainer or the quiz, which the library does not teach them in yet', () => {
    for (const set of DRILL_SETS) for (const item of set.items) expect(NEW, `${set.id}`).not.toContain(item.profile);
    expect(JSON.stringify(QUIZ_QUESTIONS)).not.toMatch(/"(af-wpw|posterior-stemi|long-qt)"/);
  });
});

describe('the Give meds tool reads the new rhythms (they can be put on the workspace monitor)', () => {
  const plan = (id: MedId, profileId: string, hr = ECG_PROFILES[profileId].defaultHR, sbp?: number) =>
    planDose(id, { profileId, hr, kg: 80, given: [], sbp }, MED_BY_ID[id].usual({ profileId, hr, kg: 80, given: [], sbp }).low);

  it('pre-excited AF: every AV-nodal blocker is harmful and speeds the rate; procainamide is the drug, and leaves the WPW pattern', () => {
    for (const id of ['adenosine', 'diltiazem', 'metoprolol', 'esmolol', 'digoxin', 'amiodarone'] as MedId[]) {
      const p = plan(id, 'af-wpw', 214, 110);
      expect(p.verdict.tone, id).toBe('bad');
      expect(p.verdict.text, id).toMatch(/pre-excited AF/);
      expect(p.steps.some((st) => (st.hr ?? 0) > 214), id).toBe(true);
    }
    // the same drugs in plain AF with a fast rate are still the ordinary choices
    expect(plan('diltiazem', 'atrial-fibrillation', 140, 120).verdict.tone).toBe('good');
    const pa = plan('procainamide', 'af-wpw', 214, 110);
    expect(pa.verdict.tone).toBe('good');
    expect(pa.steps.some((st) => st.profile === 'wpw')).toBe(true);
    expect(pa.steps.some((st) => st.profile === 'normal-sinus')).toBe(false);
  });

  it('pre-excited AF: sotalol is a β-blocker too, and magnesium does not slow the pathway', () => {
    const so = plan('sotalol', 'af-wpw', 214, 110);
    expect(so.verdict.tone).toBe('bad');
    expect(so.verdict.text).toMatch(/sotalol is a β-blocker/);
    expect(so.steps.some((st) => (st.hr ?? 0) > 214)).toBe(true);
    expect(so.steps.some((st) => st.hr !== undefined && st.hr < 214)).toBe(false);
    const mg = plan('magnesium-sulfate', 'af-wpw', 214, 110);
    expect(mg.verdict.tone).toBe('caution');
    expect(mg.verdict.text).toMatch(/not the accessory pathway/);
    expect(mg.steps.some((st) => st.hr !== undefined && st.hr < 214)).toBe(false);
    // in plain AF magnesium still trims the rate a little
    expect(plan('magnesium-sulfate', 'atrial-fibrillation', 140).steps.some((st) => st.hr !== undefined && st.hr < 140)).toBe(true);
  });

  it('a long QT: QT-prolonging drugs are wrong, magnesium is right', () => {
    for (const id of ['amiodarone', 'procainamide', 'sotalol'] as MedId[]) expect(plan(id, 'long-qt').verdict.tone, id).toBe('bad');
    expect(plan('magnesium-sulfate', 'long-qt').verdict.tone).toBe('good');
  });

  it('a long QT: lidocaine leaves the long QT on the tracing (it suppresses ectopy, it does not shorten the QT)', () => {
    const li = plan('lidocaine', 'long-qt');
    expect(li.steps.every((st) => st.profile === undefined || st.profile === 'long-qt')).toBe(true);
    expect(li.steps.find((st) => st.profile === 'long-qt')?.note).toMatch(/QT stays long.*Magnesium, potassium/);
    expect(li.verdict.text).toMatch(/QT stays long/);
    // ordinary PVCs: lidocaine still clears them to sinus rhythm
    expect(plan('lidocaine', 'pvcs').steps.some((st) => st.profile === 'normal-sinus')).toBe(true);
  });

  it('a posterior STEMI is an acute coronary syndrome and a STEMI for the antithrombotics and the lytic', () => {
    expect(plan('aspirin', 'posterior-stemi').verdict.tone).toBe('good');
    expect(plan('tenecteplase', 'posterior-stemi').verdict.tone).not.toBe('bad');
  });
});

// ─── LVAD ──────────────────────────────────────────────────────────────────

describe('a patient on a continuous-flow LVAD', () => {
  // a Doppler MAP of 76: a narrow pulse pressure around it
  const lvad = patient({ lvad: true, vitals: { sbp: 84, dbp: 72, spo2: 95 } });

  it('is alive and perfusing, with no pulse to feel and no cuff pressure', () => {
    const s = start(lvad, 2);
    expect(s.lvad).toBe(true);
    expect(s.pulse).toBe(true);
    expect(palpable(s)).toBe(false);
    expect(mapOf(s.vitals)).toBe(76);
    expect(lastText(run(lvad, 2, ['primary']))).toBe('Airway open, breathing 16/min, no palpable radial or carotid pulse, GCS 15.');
    const pc = run(lvad, 2, ['pulse-check']);
    expect(lastText(pc)).toBe('No palpable pulse — yet the patient is awake and talking to you.');
    expect(pc.flags['pulseless-confirmed']).toBeUndefined();
    const vit = run(lvad, 2, ['vitals']);
    expect(lastText(vit)).toBe('No palpable pulse, and no sounds with the cuff: no blood pressure by hand. RR 16 · SpO₂ 95%.');
    expect(vit.flags.bp).toBeUndefined();
    const nibp = run(lvad, 2, ['monitor', 'nibp']);
    expect(lastText(nibp)).toBe('NIBP: unable to measure.');
    expect(nibp.flags.bp).toBeUndefined();
    expect(lastText(run(lvad, 2, ['bp-both-arms']))).toBe('No sounds with the cuff on either arm: no blood pressure by hand.');
    expect(lastText(run(lvad, 2, ['perfusion']))).toBe('Skin warm and dry; no JVD; no pulse to feel at the wrist, the groin or the foot.');
  });

  it('the Doppler finds the MAP, and the reassessments carry it once the crew has one', () => {
    const s = run(lvad, 2, ['monitor', 'doppler-map']);
    expect(lastText(s)).toBe('Doppler MAP 76 mmHg: the whooshing flow sound returns at 76 as the cuff goes down.');
    expect(s.flags.bp).toBeDefined();
    expect(vitalsLine(run(lvad, 2, []))).toBe('No palpable pulse · RR 16 · SpO₂ 95%');
    expect(vitalsLine(s)).toBe('No palpable pulse · heart rate 80 on the monitor · Doppler MAP 76 · RR 16 · SpO₂ 95%');
    // a fluid bolus moves the MAP; no cuff reads it, so the monitor line says only what was done
    const fluid = run(lvad, 2, ['monitor', 'doppler-map', 'iv', 'fluid']);
    expect(lastText(fluid)).toBe('Bolus in.');
    expect(mapOf(fluid.vitals)).toBeGreaterThan(76);
    expect(said(run(lvad, 2, ['iv', 'nitro-high', 'metoprolol', 'pressor']))).not.toMatch(/\bBP \d/);
  });

  it('the LVAD check and the VAD team: the case\'s words, or what a running pump shows', () => {
    expect(lastText(run(lvad, 2, ['lvad-check']))).toMatch(/^A steady pump hum over the left chest\. Controller: no alarms/);
    const alarm = patient({ lvad: true, facts: { lvad: 'Pump hum present. Controller: yellow LOW FLOW alarm; flow 2.4 L/min, speed 5400 rpm, power 3.1 W.', vadTeam: 'VAD coordinator: "Give him fluid and bring him in."' } });
    expect(lastText(run(alarm, 1, ['lvad-check']))).toMatch(/LOW FLOW alarm/);
    const call = run(alarm, 1, ['call-vad']);
    expect(call.log.at(-1)).toMatchObject({ who: 'hospital', text: 'VAD coordinator: "Give him fluid and bring him in."' });
    expect(call.flags['vad-team']).toBeDefined();
    expect(lastText(run(lvad, 2, ['call-vad']))).toMatch(/^VAD coordinator: "Read me the controller/);
    // no LVAD: the check says so (it takes its minute); there is no VAD team to call (refused, no time)
    expect(lastText(run(patient(), 2, ['lvad-check']))).toMatch(/this patient has no LVAD/);
    const none = run(patient(), 2, ['call-vad']);
    expect(none.minute).toBe(0);
    expect(none.counts['call-vad']).toBeUndefined();
    const stopped = patient({ lvad: true, initial: { rhythm: { profile: 'pea', hr: 40 }, vitals: VITALS, pulse: false, lvad: true } });
    expect(lastText(run(stopped, 2, ['lvad-check']))).toBe('No pump hum over the chest. The controller shows a red pump-stop alarm.');
    expect(lastText(run(stopped, 2, ['doppler-map']))).toBe('Doppler over the brachial artery: no flow sound.');
  });

  it('compressions on a perfusing LVAD patient are their own mistake; an AED is refused; a shock for VF on the pump is no "shock with a pulse"', () => {
    expect(ids(run(lvad, 2, ['cpr']))).toEqual(['cpr-lvad-perfusing']);
    expect(ids(run(patient(), 2, ['cpr']))).toEqual(['cpr-with-pulse']);
    const aed = run(lvad, 1, ['aed']);
    expect(aed.minute).toBe(0);
    expect(lastText(aed)).toMatch(/^Not while the pump is perfusing/);
    const vfOnPump = patient({ lvad: true, profile: 'vf', hr: 0 });
    expect(ids(run(vfOnPump, 2, ['defib']))).toEqual([]);
    expect(ids(run(patient({ profile: 'vf', hr: 0 }), 2, ['defib']))).toEqual(['shock-with-pulse']);
  });

  it('perfusion, not the pump running, decides compressions and the AED (2025 AHA durable LVAD algorithm)', () => {
    // unresponsive, Doppler MAP 44: not perfusing — compressions are right and the AED analyzes the rhythm alone
    const lowFlow = patient({ lvad: true, vitals: { sbp: 52, dbp: 40, gcs: 3, spo2: 82 } });
    const cpr = run(lowFlow, 2, ['cpr']);
    expect(ids(cpr)).toEqual([]);
    expect(cpr.flags.cpr).toBeDefined();
    expect(lastText(cpr)).toMatch(/^2 minutes of compressions/);
    const vt = patient({ lvad: true, profile: 'vt', hr: 190, vitals: { sbp: 52, dbp: 40, gcs: 3, spo2: 82 } });
    const aed = run(vt, 1, ['aed']);
    expect(lastText(aed)).toBe('AED: "Shock advised." Shock delivered. Resume CPR.');
    expect(aed.flags.shocked).toBeDefined();
    expect(ids(run(vt, 2, ['defib']))).toEqual([]);
    expect(lastText(run(lowFlow, 1, ['aed']))).toBe('AED: "No shock advised. Start CPR."');
    // unresponsive but a MAP of 76: perfusing — find the cause, no CPR, no AED
    const asleep = patient({ lvad: true, vitals: { sbp: 84, dbp: 72, gcs: 6 } });
    const stopIt = run(asleep, 2, ['cpr']);
    expect(ids(stopIt)).toEqual(['cpr-lvad-perfusing']);
    expect(lastText(stopIt)).toBe('Stop — the pump is humming and the Doppler MAP is 76: check perfusion first.');
    expect(lastText(run(asleep, 1, ['aed']))).toMatch(/^Not while the pump is perfusing/);
    // awake: no word of a pulse — the pump is what perfuses
    const awake = run(lvad, 2, ['cpr']);
    expect(lastText(awake)).toBe('The patient cries out — awake and talking: the pump is perfusing.');
    expect(said(awake)).not.toMatch(/pulse/);
    // the rule's text does not read as a reason to withhold compressions
    const text = BUILT_IN_HARMS.find((h) => h.id === 'cpr-lvad-perfusing')!.text;
    expect(text).not.toMatch(/damage|dislodge/);
    expect(text).toMatch(/without delay/);
  });

  it('the pressure rules read the Doppler MAP, not the systolic, over an LVAD', () => {
    // MAP 76 with a systolic of 84: a normal LVAD pressure — nitrates and midazolam are no "hypotension" mistake
    expect(ids(run(lvad, 2, ['iv', 'nitro']))).toEqual([]);
    expect(ids(run(lvad, 2, ['iv', 'midazolam']))).toEqual([]);
    expect(ids(run(lab({ lvad: true, vitals: { sbp: 84, dbp: 72 } }), 5, ['ct-urgent']))).toEqual([]);
    expect(ids(run(lvad, 2, ['iv', 'nitro-high']))).toEqual(['nitro-high-not-hypertensive']);
    // MAP 54: low
    const low = patient({ lvad: true, vitals: { sbp: 60, dbp: 52 } });
    expect(ids(run(low, 2, ['iv', 'nitro']))).toEqual(['nitro-hypotension']);
    expect(ids(run(low, 2, ['iv', 'midazolam']))).toEqual(['midazolam-unsafe']);
    expect(ids(run({ ...low, setting: 'cathlab' }, 5, ['ct-urgent']))).toEqual(['ct-unstable']);
    expect(ids(run({ ...low, setting: 'cathlab' }, 5, ['iv', 'phenylephrine']))).toEqual([]);
    // MAP 100: hypertensive over an LVAD — the high nitrate dose fits; phenylephrine does not
    const high = patient({ lvad: true, vitals: { sbp: 104, dbp: 98 } });
    expect(ids(run(high, 2, ['iv', 'nitro-high']))).toEqual([]);
    expect(ids(run({ ...lvad, setting: 'cathlab' }, 5, ['iv', 'phenylephrine']))).toEqual(['phenylephrine-no-hypotension']);
    // without an LVAD the systolic still decides
    expect(ids(run(patient({ vitals: { sbp: 84, dbp: 72 } }), 2, ['iv', 'nitro']))).toEqual(['nitro-hypotension']);
  });

  it('a narrow authored pulse pressure stays as written, and the first Doppler reads the authored MAP', () => {
    const narrow = patient({ lvad: true, vitals: { sbp: 80, dbp: 74 } });
    const s = run(narrow, 2, ['monitor', 'doppler-map']);
    expect(s.vitals).toMatchObject({ sbp: 80, dbp: 74 });
    expect(lastText(s)).toMatch(/^Doppler MAP 76 mmHg/);
    // a drug that moves it keeps it narrow too (never under 2 mmHg)
    const after = run(narrow, 2, ['iv', 'fluid']);
    expect(after.vitals.sbp - after.vitals.dbp).toBeLessThan(10);
    expect(after.vitals.sbp - after.vitals.dbp).toBeGreaterThanOrEqual(2);
    // without an LVAD the 10 mmHg floor stands
    expect(run(patient({ vitals: { sbp: 80, dbp: 74 } }), 2, ['monitor']).vitals.dbp).toBe(70);
  });

  it('every other patient is unchanged: no lvad key, the same lines', () => {
    const s = start(patient(), 2);
    expect('lvad' in s).toBe(false);
    expect(lastText(run(patient(), 2, ['primary']))).toBe('Airway open, breathing 16/min, radial pulse 80/min, GCS 15.');
    expect(lastText(run(patient(), 2, ['monitor', 'nibp']))).toBe('NIBP 132/80 mmHg.');
    expect(lastText(run(patient(), 2, ['iv', 'fluid']))).toBe('Bolus in. BP 140/85.');
    expect(monitorVitals(s)).toEqual({ pulse: true, sbp: 132, dbp: 80, spo2: 96, rr: 16, etco2: 36 });
    // the LVAD case is the only registered patient with a pump
    for (const sc of Object.values(SCENARIO_BY_ID)) if (sc.id !== 'lvad-field' && sc.id !== 'kit2-lvad') expect(sc.initial.lvad, sc.id).toBeUndefined();
    expect(SCENARIO_BY_ID['lvad-field'].initial.lvad).toBe(true);
  });
});

describe('the case monitor with an LVAD', () => {
  const sc = patient({ id: 'kit2-lvad', lvad: true, vitals: { sbp: 84, dbp: 72, spo2: 95 } });
  const store = () => useSimStore.getState();
  beforeEach(() => {
    SCENARIO_BY_ID['kit2-lvad'] = sc;
    useTimelineStore.setState({ playing: true, speed: 1 });
    resetCode();
    useAppStore.getState().setMode('simulator');
    enterSimulator();
  });
  afterEach(() => {
    leaveSimulator();
    store().closeScenario();
    useAppStore.getState().setMode('learn');
    delete SCENARIO_BY_ID['kit2-lvad'];
  });

  it('perfusing with a nearly flat pleth; the NIBP box shows a failed reading', () => {
    expect(monitorVitals(start(sc, 2))).toEqual({ pulse: true, sbp: 84, dbp: 72, spo2: 95, rr: 16, etco2: 36, continuousFlow: true });
    store().startScenario('kit2-lvad', 2);
    store().act('monitor');
    runDriver(4000);
    const v = vitalsAt(sim.time);
    expect(v.pulse).toBe(true);
    expect(v.spo2).toBe(95);
    let peak = 0;
    for (let t = sim.time - 3000; t < sim.time; t += 20) peak = Math.max(peak, plethAt(t, true));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(1.12 * CONTINUOUS_FLOW_PLETH);
    store().act('nibp');
    expect(useDefibStore.getState().nibp.last).toBe('fail');
    store().closeScenario();
    setScriptedVitals(null);
  });
});

// ─── The new actions ───────────────────────────────────────────────────────

describe('new actions: scope and settings', () => {
  const scope = (role: LearningLevel, setting: 'field' | 'cathlab') => interventionsFor(role, setting).map((i) => i.id);
  const OFFERED: Record<string, [LearningLevel[], ('field' | 'cathlab')[]]> = {
    'bp-both-arms': [[1, 2, 3, 4, 5], ['field', 'cathlab']],
    'doppler-map': [[1, 2], ['field']],
    'lvad-check': [[1, 2], ['field']],
    'call-vad': [[1, 2], ['field']],
    'nitro-high': [[2, 4, 5], ['field', 'cathlab']],
    midazolam: [[2, 4, 5], ['field', 'cathlab']],
    phenylephrine: [[4, 5], ['cathlab']],
    'legs-up': [[1, 2, 3, 4, 5], ['field', 'cathlab']],
    transfuse: [[4, 5], ['cathlab']],
    'ct-urgent': [[4, 5], ['cathlab']],
    'call-vascular': [[3, 4, 5], ['cathlab']],
    'stroke-team': [[3, 4, 5], ['cathlab']],
    'clear-air': [[3, 5], ['cathlab']],
  };

  it.each(Object.entries(OFFERED))('%s is offered to exactly its roles, in its settings', (id, [roles, settings]) => {
    for (const role of [1, 2, 3, 4, 5] as LearningLevel[]) {
      for (const setting of ['field', 'cathlab'] as const) {
        expect(scope(role, setting).includes(id), `${id}: role ${role}, ${setting}`).toBe(roles.includes(role) && settings.includes(setting));
      }
    }
  });

  it('IV drugs wait for a line; midazolam, the nitrate and the legs do not', () => {
    for (const id of ['phenylephrine', 'transfuse']) expect(INTERVENTION_BY_ID[id].needsAccess, id).toBe(true);
    for (const id of ['midazolam', 'nitro-high', 'legs-up', 'bp-both-arms', 'doppler-map']) expect(INTERVENTION_BY_ID[id].needsAccess, id).toBeUndefined();
    const s = run(lab(), 4, ['phenylephrine']);
    expect(s.minute).toBe(0);
    expect(lastText(s)).toMatch(/No IV or IO access/);
  });

  it('the regional heart center now names cardiac surgery (the label the search and the cases use is unchanged)', () => {
    const t = INTERVENTION_BY_ID['transport-pci'];
    expect(t.label).toBe('Transport to the regional heart center (PCI, pacing, dialysis)');
    expect(t.detail).toBe('PCI-capable: a cath lab, cardiac surgery, transvenous pacing, emergency dialysis and an ICU');
  });

  it('every new cath lab action is taught by a catalog item', () => {
    const taught = (item: string, ...sims: string[]) => { for (const x of sims) expect(CATHLAB[item].sim, `${item} ${x}`).toContain(x); };
    taught('cl-comp-rp-bleed', 'transfuse', 'ct-urgent', 'call-vascular');
    taught('cl-comp-stroke', 'stroke-team', 'ct-urgent');
    taught('cl-comp-air-embolism', 'clear-air');
    taught('cl-drug-pressors', 'phenylephrine');
    taught('cl-comp-vasovagal', 'legs-up');
    taught('cl-drug-sedation', 'midazolam');
  });
});

describe('new actions: default effects', () => {
  it('blood pressure in both arms: the same within a few mmHg unless the case says otherwise; none in arrest', () => {
    const s = run(patient(), 1, ['bp-both-arms']);
    expect(lastText(s)).toBe('Right arm 132/80 · left arm 128/78.');
    expect(s.flags.bp).toBeDefined();
    const dissection = patient({ facts: { bpArms: 'Right arm 168/94 · left arm 122/70.' } });
    expect(lastText(run(dissection, 2, ['bp-both-arms']))).toBe('Right arm 168/94 · left arm 122/70.');
    const arrest = patient({ initial: { rhythm: { profile: 'vf', hr: 0 }, vitals: VITALS, pulse: false } });
    expect(run(arrest, 2, ['bp-both-arms']).minute).toBe(0);
    expect(lastText(run(lab(), 3, ['bp-both-arms']))).toBe('Right arm 132/80 · left arm 128/78.');
  });

  it('a Doppler on a patient with a pulse finds the systolic', () => {
    expect(lastText(run(patient(), 2, ['doppler-map']))).toBe('Doppler over the brachial artery: the first beat returns at 132 mmHg (the systolic pressure).');
  });

  it('nitroglycerin 0.8 mg drops the pressure about twice as far as 0.4 mg', () => {
    const scape = patient({ vitals: { sbp: 210, dbp: 120 } });
    const high = run(scape, 2, ['nitro-high']);
    expect([high.vitals.sbp, high.vitals.dbp]).toEqual([190, 110]);
    expect(lastText(high)).toBe('BP 190/110.');
    expect(high.flags.nitro).toBeDefined();
    expect(high.flags['nitro-high']).toBeDefined();
    const low = run(scape, 2, ['nitro']);
    expect(low.vitals.sbp).toBe(200);
    expect(unavailableReason(scape, run(scape, 2, ['nitro-high', 'nitro-high', 'nitro-high']), 'nitro-high')).toBe('Maximum 3 doses');
    expect(ids(run(scape, 2, ['nitro-high']))).toEqual([]);
  });

  it('midazolam: IM without a line, IV with one; each dose a little drowsier (not below 12), the pressure and breathing a little lower', () => {
    const agitated = patient({ vitals: { sbp: 178, dbp: 104, rr: 22 }, hr: 124, profile: 'sinus-tachycardia' });
    const im = run(agitated, 2, ['midazolam']);
    expect(im.log.some((l) => l.text === 'Midazolam 5 mg IM (no IV yet).')).toBe(true);
    expect([im.vitals.sbp, im.vitals.dbp, im.vitals.rr, im.vitals.gcs]).toEqual([170, 99, 20, 14]);
    expect(im.flags.benzodiazepine).toBeDefined();
    expect(im.flags.sedation).toBeDefined();
    const iv = run(agitated, 2, ['iv', 'midazolam', 'midazolam', 'midazolam']);
    expect(iv.log.some((l) => l.text === 'Midazolam 2.5 mg IV.')).toBe(true);
    expect(iv.vitals.gcs).toBe(12);
    // the third dose found him at 13: no penalty; a fourth is past the maximum
    expect(ids(iv)).toEqual([]);
    expect(unavailableReason(agitated, iv, 'midazolam')).toBe('Maximum 3 doses');
    const arrest = patient({ initial: { rhythm: { profile: 'vf', hr: 0 }, vitals: VITALS, pulse: false } });
    expect(lastText(run(arrest, 2, ['midazolam']))).toMatch(/has no place in cardiac arrest/);
  });

  it('phenylephrine raises the pressure and slows a sinus node a little (never below 50)', () => {
    const low = lab({ vitals: { sbp: 82, dbp: 50 }, hr: 92 });
    const s = run(low, 5, ['iv', 'phenylephrine']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([98, 60]);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 86 });
    expect(lastText(s)).toBe('Heart rate 86. BP 98/60.');
    expect(ids(s)).toEqual([]);
    const slowish = run(lab({ vitals: { sbp: 82, dbp: 50 }, hr: 52, profile: 'sinus-bradycardia' }), 4, ['iv', 'phenylephrine']);
    expect(slowish.rhythm.hr).toBe(50);
  });

  it('raising the legs adds a little pressure; not in arrest', () => {
    const s = run(lab({ vitals: { sbp: 84, dbp: 48 }, hr: 46, profile: 'sinus-bradycardia' }), 4, ['legs-up']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([92, 52]);
    expect(s.log.some((l) => l.text === 'Lying flat with the legs raised.')).toBe(true);
    const arrest = patient({ initial: { rhythm: { profile: 'vf', hr: 0 }, vitals: VITALS, pulse: false } });
    expect(run(arrest, 1, ['legs-up']).counts['legs-up']).toBeUndefined();
  });

  it('packed red cells: one unit at a time, up to four', () => {
    const bleed = lab({ vitals: { sbp: 78, dbp: 44 }, hr: 118, profile: 'sinus-tachycardia', problems: ['bleeding'] });
    const s = run(bleed, 4, ['iv', 'transfuse', 'transfuse']);
    expect(s.log.some((l) => l.text.startsWith('Unit 2 of packed red cells'))).toBe(true);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([98, 56]);
    expect(ids(s)).toEqual([]);
    expect(unavailableReason(bleed, run(bleed, 4, ['iv', 'transfuse', 'transfuse', 'transfuse', 'transfuse']), 'transfuse')).toBe('Maximum 4 doses');
  });

  it('CT, vascular surgery, the stroke team: the case\'s finding, or none; nobody scans a patient in arrest', () => {
    const s = run(lab({ facts: { ct: 'Radiology: a large right retroperitoneal hematoma.' } }), 5, ['ct-urgent']);
    expect(s.minute).toBe(10);
    expect(s.log.at(-1)).toMatchObject({ who: 'hospital', text: 'Radiology: a large right retroperitoneal hematoma.' });
    expect(lastText(run(lab(), 4, ['ct-urgent']))).toBe('Radiology: no acute finding on the CT.');
    const arrest = lab({ initial: { rhythm: { profile: 'vf', hr: 0 }, vitals: VITALS, pulse: false } });
    expect(run(arrest, 5, ['ct-urgent']).minute).toBe(0);
    expect(run(lab(), 3, ['call-vascular']).flags['vascular-called']).toBeDefined();
    expect(run(lab(), 3, ['stroke-team']).flags['stroke-alert']).toBeDefined();
  });

  it('clearing coronary air: the tech readies the syringes; the cardiologist needs a catheter in a coronary', () => {
    const tech = run(lab(), 3, ['clear-air']);
    expect(tech.flags['clear-air-ready']).toBeDefined();
    expect(run(lab(), 5, ['clear-air']).minute).toBe(0);
    const engaged = lab({ events: [{ id: 'guide-in', when: () => true, effect: () => ({ flags: ['access', 'guide'] }) }] });
    const md = run(engaged, 5, ['clear-air']);
    expect(md.flags['air-cleared']).toBeDefined();
    expect(lastText(md)).toMatch(/^Aspirated back through the guide/);
  });

  it('no monitor line from a new action names a rhythm or a diagnosis', () => {
    const runs = [
      run(patient({ lvad: true, vitals: { sbp: 84, dbp: 72 } }), 2, ['monitor', 'doppler-map', 'lvad-check', 'call-vad', 'iv', 'midazolam', 'nitro-high', 'legs-up']),
      run(lab({ vitals: { sbp: 84, dbp: 50 }, problems: ['bleeding'] }), 5, ['iv', 'phenylephrine', 'transfuse', 'legs-up', 'bp-both-arms', 'call-vascular', 'stroke-team']),
      run(patient({ profile: 'posterior-stemi' }), 2, ['ecg-posterior']),
    ];
    for (const s of runs) for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
  });
});

describe('new built-in safety rules', () => {
  const withProblems = (sc: Scenario, ...problems: Problem[]): Scenario => ({ ...sc, problems });
  const rule = (id: string) => BUILT_IN_HARMS.find((h) => h.id === id)!;

  it('high-dose nitroglycerin: for a systolic of 160 or more; under 90 it is the general nitrate rule', () => {
    expect(ids(run(patient({ vitals: { sbp: 150, dbp: 90 } }), 2, ['nitro-high']))).toEqual(['nitro-high-not-hypertensive']);
    expect(ids(run(patient({ vitals: { sbp: 86, dbp: 54 } }), 2, ['nitro-high']))).toEqual(['nitro-hypotension']);
    expect(ids(run(patient({ vitals: { sbp: 196, dbp: 110 } }), 2, ['nitro-high']))).toEqual([]);
  });

  it('midazolam with a low pressure or a drowsy patient', () => {
    expect(ids(run(patient({ vitals: { sbp: 84, dbp: 50 } }), 2, ['midazolam']))).toEqual(['midazolam-unsafe']);
    expect(ids(run(patient({ vitals: { gcs: 11 } }), 2, ['midazolam']))).toEqual(['midazolam-unsafe']);
  });

  it('phenylephrine with a normal pressure, or with a slow heart', () => {
    expect(ids(run(lab(), 4, ['iv', 'phenylephrine']))).toEqual(['phenylephrine-no-hypotension']);
    expect(ids(run(lab({ vitals: { sbp: 80, dbp: 48 }, profile: 'sinus-bradycardia', hr: 42 }), 5, ['iv', 'phenylephrine']))).toEqual(['phenylephrine-slow']);
  });

  it('pulmonary edema: no raised legs, no fluid bolus', () => {
    const edema = withProblems(patient({ vitals: { sbp: 210, dbp: 118, spo2: 84, rr: 32 } }), 'pulmonary-edema');
    expect(ids(run(edema, 2, ['legs-up', 'iv', 'fluid']))).toEqual(['legs-up-pulmonary-edema', 'fluid-pulmonary-edema']);
    expect(ids(run(patient(), 2, ['legs-up', 'iv', 'fluid']))).toEqual([]);
  });

  it('blood without bleeding; a scan for an unstable patient', () => {
    expect(ids(run(lab({ vitals: { sbp: 112, dbp: 70 } }), 4, ['iv', 'transfuse']))).toEqual(['transfuse-no-bleeding']);
    expect(ids(run(lab({ vitals: { sbp: 82, dbp: 48 }, problems: ['bleeding'] }), 5, ['ct-urgent']))).toEqual(['ct-unstable']);
    expect(ids(run(lab({ problems: ['bleeding'] }), 5, ['ct-urgent']))).toEqual([]);
  });

  it('a beta-blocker in stimulant toxicity; antithrombotics and a lytic in an aortic dissection', () => {
    const cocaine = withProblems(patient({ profile: 'sinus-tachycardia', hr: 128, vitals: { sbp: 184, dbp: 108 } }), 'sympathomimetic-toxicity');
    expect(ids(run(cocaine, 2, ['iv', 'metoprolol']))).toEqual(['beta-blocker-stimulant']);
    expect(ids(run(cocaine, 2, ['iv', 'midazolam', 'nitro']))).toEqual([]);
    const dissection = withProblems(patient({ vitals: { sbp: 176, dbp: 98 } }), 'aortic-dissection');
    expect(ids(run(dissection, 1, ['aspirin']))).toEqual(['antithrombotic-dissection']);
    expect(rule('antithrombotic-dissection').actions).toEqual(expect.arrayContaining(['aspirin', 'heparin', 'p2y12', 'bivalirudin', 'gp2b3a', 'cangrelor']));
    expect(ids(run({ ...dissection, setting: 'cathlab' }, 5, ['iv', 'tnk']))).toEqual(['lytic-dissection']);
    expect(ids(run(patient(), 1, ['aspirin']))).toEqual([]);
  });

  it('an AV-nodal blocker in pre-excited AF is a critical error; cardioversion and procainamide are not', () => {
    const wpw = patient({ profile: 'af-wpw', hr: 214, vitals: { sbp: 104, dbp: 66 } });
    for (const id of ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion']) {
      expect(ids(run(wpw, 2, ['iv', id])), id).toContain('av-blocker-preexcited-af');
    }
    expect(rule('av-blocker-preexcited-af').severity).toBe('critical');
    expect(ids(run(wpw, 2, ['iv', 'procainamide']))).toEqual([]);
    const shocked = run(wpw, 2, ['iv', 'sedation', 'cardiovert']);
    expect(ids(shocked)).toEqual([]);
    expect(shocked.log.some((l) => /200 J/.test(l.text))).toBe(true);
    // plain AF: diltiazem is a fair choice
    expect(ids(run(patient({ profile: 'atrial-fibrillation', hr: 140 }), 2, ['iv', 'diltiazem']))).toEqual([]);
  });

  it('the monitor agrees with the rule: an AV-nodal blocker in pre-excited AF speeds the rate, with no pause and no name', () => {
    const wpw = patient({ profile: 'af-wpw', hr: 214, vitals: { sbp: 104, dbp: 66 } });
    for (const id of ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion']) {
      const s = run(wpw, 2, ['iv', id]);
      expect(s.rhythm, id).toEqual({ profile: 'af-wpw', hr: 240 });
      expect(said(s), id).toMatch(/faster and wider/);
      expect(said(s), id).not.toMatch(/brief pause|same rhythm returns/);
      expect(s.log.filter((l) => l.who === 'monitor').map((l) => l.text).join('\n'), id).not.toMatch(giveaway);
    }
    // never past 250, however many doses
    expect(run(patient({ profile: 'af-wpw', hr: 240 }), 2, ['iv', 'diltiazem', 'metoprolol']).rhythm.hr).toBe(250);
    // in plain AF the defaults are unchanged: metoprolol slows by 10, adenosine shows its pause
    expect(run(patient({ profile: 'atrial-fibrillation', hr: 150 }), 2, ['iv', 'metoprolol']).rhythm.hr).toBe(140);
    expect(lastText(run(patient({ profile: 'atrial-fibrillation', hr: 150 }), 2, ['iv', 'adenosine6']))).toBe('A brief pause, then the same rhythm returns.');
  });

  it('sustained torsades with a pulse is defibrillated (no penalty); a synchronized attempt does not fire and costs points', () => {
    const tdp = patient({ profile: 'torsades', hr: 230, vitals: { sbp: 78, dbp: 46, gcs: 13 } });
    expect(ids(run(tdp, 2, ['defib']))).toEqual([]);
    const sync = run(tdp, 2, ['cardiovert']);
    expect(ids(sync)).toEqual(['sync-polymorphic']);
    expect(lastText(sync)).toBe('SYNC is on: the device cannot lock onto the twisting complexes and does not fire.');
    // monomorphic VT with a pulse: still a shock "with a pulse"
    expect(ids(run(patient({ profile: 'vt', hr: 180 }), 2, ['defib']))).toEqual(['shock-with-pulse']);
  });

  it('the review links each new rule to its action', () => {
    const r = review(patient(), stop(run(lab(), 4, ['iv', 'phenylephrine', 'transfuse'])));
    expect(r.toFix.find((t) => t.kind === 'harm' && t.actions?.includes('transfuse'))?.label).toBe('Packed red cells with no bleeding to treat.');
  });
});

// ─── The cases that were already there ─────────────────────────────────────

describe('the existing cases treat the new drugs as they treat the ones beside them', () => {
  it('high-dose nitroglycerin crashes an RV infarct, and is the same mistake as the standard dose', () => {
    const rv = SCENARIO_BY_ID['stemi-inferior-rv-field'];
    const s = run(rv, 2, ['primary', 'iv', 'nitro-high']);
    expect(ids(s)).toEqual(['nitro-rv']);
    expect(s.vitals.sbp).toBeLessThanOrEqual(74);
    const labRv = SCENARIO_BY_ID['stemi-inferior-cathlab'];
    expect(ids(run(labRv, 5, ['nitro-high']))).toContain('nitro-rv');
  });

  it('in cardiogenic shock both nitrates and midazolam are the case\'s own mistakes (one penalty each)', () => {
    const shock = SCENARIO_BY_ID['shock-cathlab'];
    expect(ids(run(shock, 4, ['iv', 'nitro-high']))).toEqual(['nitro-in-shock']);
    expect(ids(run(shock, 4, ['iv', 'midazolam']))).toEqual(['sedation-in-shock']);
  });

  it('the beta-blocker overdose\'s drug model counts the new drugs: the high nitrate dose drops her further than the standard one', () => {
    const bb = SCENARIO_BY_ID['beta-blocker-overdose-field'];
    const std = run(bb, 2, ['primary', 'iv', 'nitro']);
    const high = run(bb, 2, ['primary', 'iv', 'nitro-high']);
    expect(high.vitals.sbp).toBeLessThan(std.vitals.sbp);
    // midazolam is premedication for the pacer, as sedation is
    const paced = run(bb, 2, ['primary', 'pads', 'iv', 'atropine', 'midazolam', 'pace']);
    expect(paced.flags.premed ?? paced.flags.analgesia).toBeDefined();
  });

  it('midazolam counts as sedation before a cardioversion and for the pacer; the FFR nurse may give it for the nerves', () => {
    const svt = SCENARIO_BY_ID['svt-unstable-field'];
    const s = run(svt, 2, ['primary', 'pads', 'nibp', 'iv', 'midazolam', 'cardiovert']);
    expect(ids(s)).toEqual([]);
    const ffr = SCENARIO_BY_ID['ffr-cathlab'];
    const nurse = run(ffr, 4, ['consent', 'iv', 'timeout', 'midazolam']);
    expect(nurse.flags.settled).toBeDefined();
  });

  it('midazolam scores as sedation does in the four cases that sedate before a shock or the pacer', () => {
    const swap = (steps: string[]) => steps.map((x) => (x === 'sedation' ? 'midazolam' : x));
    const READY = ['primary', 'vitals', 'monitor', 'ecg12', 'opqrst', 'sample', 'lungs', 'iv'];
    const runs: [string, string[]][] = [
      ['svt-unstable-field', ['primary', 'pads', 'nibp', 'iv', 'sedation', 'cardiovert', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff']],
      ['af-rvr-field', [...READY, 'reassess', 'reassess', 'reassess', 'sedation', 'cardiovert']],
      ['stable-vt-field', ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'diltiazem', 'sedation', 'cardiovert']],
      ['complete-heart-block-field', ['primary', 'pads', 'nibp', 'iv', 'atropine', 'sedation', 'pace', 'pulse-check', 'fentanyl', 'sample', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']],
    ];
    for (const [id, steps] of runs) {
      const sc = SCENARIO_BY_ID[id];
      const sed = run(sc, 2, steps);
      const mid = run(sc, 2, swap(steps));
      expect(ids(mid), id).toEqual(ids(sed));
      expect(ids(mid), id).not.toContain('midazolam-unsafe');
      expect(review(sc, mid).percent, id).toBe(review(sc, sed).percent);
    }
    // the ideal unstable-SVT run with midazolam in place of the sedation: full marks
    expect(review(SCENARIO_BY_ID['svt-unstable-field'], run(SCENARIO_BY_ID['svt-unstable-field'], 2, swap(runs[0][1]))).percent).toBe(100);
  });

  it('in the cath lab midazolam is the procedural dose; one mistake is one penalty in the hyperkalemia case', () => {
    expect(said(run(lab(), 4, ['iv', 'midazolam']))).toMatch(/Midazolam 1 mg IV\./);
    expect(said(run(patient(), 2, ['iv', 'midazolam']))).toMatch(/Midazolam 2\.5 mg IV\./);
    expect(INTERVENTION_BY_ID.midazolam.detail).toMatch(/0\.5–1 mg IV/);
    const hk = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    expect(ids(run(hk, 2, ['primary', 'iv', 'midazolam']))).toEqual(['sedation-no-pain']);
    expect(ids(run(hk, 2, ['primary', 'iv', 'sedation']))).toEqual(['sedation-no-pain']);
  });

  it('no cuff on the dialysis fistula arm, even for a pressure in both arms', () => {
    const hk = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    const s = run(hk, 2, ['primary', 'bp-both-arms']);
    expect(lastText(s)).toMatch(/^Right arm \d+\/\d+\. Not on the left: it carries his dialysis fistula/);
    expect(lastText(s)).not.toMatch(/left arm \d/);
    expect(s.flags['bp-arms']).toBeDefined();
  });

  it('the perforation is a bleed (blood is no mistake), and phenylephrine supports her falling pressure', () => {
    const perf = SCENARIO_BY_ID['perforation-cathlab'];
    expect(ids(run(perf, 4, ['callout', 'fluid', 'transfuse', 'call-surgery']))).toEqual([]);
    const rn = run(perf, 4, ['callout', 'phenylephrine', 'call-surgery', 'reassess', 'reassess', 'act', 'hemostasis', 'handoff']);
    expect(review(perf, rn).percent).toBe(100);
    const md = run(perf, 5, ['balloon-tamponade', 'call-surgery', 'phenylephrine', 'echo', 'pericardiocentesis', 'stent-covered', 'final-angio', 'handoff']);
    expect(review(perf, md).percent).toBe(100);
  });

  it('no-reflow: a phenylephrine bolus holds the pressure up and is credited as support', () => {
    const nr = SCENARIO_BY_ID['no-reflow-cathlab'];
    const s = run(nr, 5, ['act', 'heparin', 'stent-des', 'phenylephrine', 'ic-epinephrine', 'ivus', 'ic-adenosine', 'final-angio', 'ecg12', 'echo', 'handoff']);
    expect(s.flags.supported).toBeDefined();
    expect(s.flags['pressure-up']).toBeLessThanOrEqual(s.flags['no-reflow'] + 3);
    const r = review(nr, s);
    expect(r.percent).toBe(100);
    expect(r.timings.find((t) => t.label === 'Pressure held up')?.met).toBe(true);
  });

  it('wet lungs in cardiogenic shock and in the failing AF heart: no legs up, no volume, no pure vasoconstrictor — one penalty each', () => {
    const shock = SCENARIO_BY_ID['shock-cathlab'];
    const legs = run(shock, 4, ['iv', 'legs-up']);
    expect(ids(legs)).toEqual(['legs-up-pulmonary-edema']);
    expect(legs.vitals.sbp).toBeLessThanOrEqual(80);
    expect(ids(run(shock, 4, ['iv', 'transfuse']))).toEqual(['transfuse-no-bleeding']);
    const phe = run(shock, 4, ['iv', 'phenylephrine']);
    expect(ids(phe)).toEqual(['phenylephrine-in-shock']);
    expect(phe.vitals.sbp).toBeLessThan(90);
    expect(ids(run(shock, 4, ['iv', 'fluid']))).toEqual(['fluid-in-shock']);
    const af = SCENARIO_BY_ID['af-rvr-field'];
    expect(ids(run(af, 2, ['primary', 'legs-up']))).toEqual(['legs-up-pulmonary-edema']);
    expect(ids(run(af, 2, ['primary', 'iv', 'fluid']))).toEqual(['fluid-hf']);
  });
});
