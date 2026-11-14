/**
 * The emergency department setting of the case simulator: who may do what (ER nurse 6, ER doctor 7), the ED's own
 * actions and their defaults, the hand-off that waits for a disposition, the ED voices and the case list for a role with
 * no cases yet. A bare test patient stands in for the ED cases still to be written.
 */
import { describe, expect, it } from 'vitest';
import { INTERVENTIONS, INTERVENTION_BY_ID, categoryLabel, detailFor, interventionsFor } from '@/lib/sim/scenario/interventions';
import { CATH_LAB_MINUTES, RN_ORDER_ONLY, perform, review, start, unavailableReason } from '@/lib/sim/scenario/engine';
import { askCritical, askEvents, askHarm } from '@/lib/sim/scenario/labKit';
import { DOOR_TO_ECG, edNurse, edOrder, edPhysician, physicianDispo, physicianOrder, standingOrders } from '@/lib/sim/scenario/edKit';
import { SCENARIOS, SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Scenario, SimState, Speaker } from '@/lib/sim/scenario/types';
import { caseSections } from '@/components/simulator/caseList';
import { SETTING_LABEL, SPEAKER_STYLE, speakerName } from '@/components/simulator/simStyles';
import { groupActions } from '@/components/simulator/actionGroups';
import { LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { runScenario as run } from './helpers';

const VITALS = { sbp: 132, dbp: 80, spo2: 96, rr: 16, etco2: 36, pain: 6, gcs: 15, glucose: 110, temp: 36.8 };

/** A bare ED patient: nothing happens by itself, and the case never ends before the hand-off */
function edPatient(over: Partial<Scenario> & { profile?: string; hr?: number; vitals?: Partial<typeof VITALS>; pulse?: boolean } = {}): Scenario {
  const { profile = 'normal-sinus', hr = 80, vitals = {}, pulse, ...rest } = over;
  return {
    id: 'ed-test', title: 'Test ED patient', summary: 'A bare patient for the ED tests.', setting: 'ed', roles: [6, 7], difficulty: 'beginner',
    briefing: { default: [['team', 'Test patient in bed 4.']] },
    initial: { rhythm: { profile, hr }, vitals: { ...VITALS, ...vitals }, ...(pulse === false ? { pulse: false } : {}) },
    facts: {}, respond: {}, events: [],
    critical: [{ id: 'handoff', label: 'Hand-off', why: 'The end of the case.', done: ['handoff'] }],
    harms: [], teaching: [],
    ...rest,
  };
}
const stemi = (over: Parameters<typeof edPatient>[0] = {}) => edPatient({ profile: 'anterior-stemi', hr: 96, ...over });
const scope = (role: LearningLevel) => new Set(interventionsFor(role, 'ed').map((i) => i.id));
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const last = (s: SimState) => s.log.at(-1)!;
/** Perform without the "must be available" check of runScenario: a blocked action leaves no trace but its line */
const tryAct = (sc: Scenario, s: SimState, id: string) => perform(sc, s, id);

/** Physician-only in the emergency department (the ER nurse never sees them) */
const ED_MD_ONLY = [
  'airway', 'rsi', 'central-line', 'temp-wire', 'pericardiocentesis', 'procedural-sedation', 'tnk', 'pocus', 'ct-urgent',
  'cath-lab-activate', 'consult-cardiology', 'admit', 'transfer', 'call-surgery',
];
/** What both see in the department: assessment, monitoring and the 12-lead, labs, oxygen, CPAP, the bag-mask, lines, the ACLS drugs, aspirin, nitroglycerin, heparin, P2Y12, shocks and pacing */
const ED_BOTH = [
  'ems-handoff', 'primary', 'opqrst', 'sample', 'vitals', 'pulse-check', 'lungs', 'perfusion', 'glucose', 'neuro', 'reassess', 'bp-both-arms',
  'monitor', 'pads', 'nibp', 'ecg12', 'ecg12-repeat', 'ecg-right', 'ecg-posterior', 'capno', 'labs', 'cxr',
  'o2-nc', 'o2-nrb', 'bvm', 'cpap', 'iv', 'io', 'fluid', 'transfuse',
  'aspirin', 'nitro', 'fentanyl', 'heparin', 'p2y12', 'metoprolol', 'atropine', 'adenosine6', 'adenosine12', 'diltiazem', 'epinephrine',
  'amio-arrest', 'amio-infusion', 'lidocaine', 'push-epi', 'pressor', 'midazolam', 'calcium-chloride', 'sodium-bicarbonate',
  'insulin-dextrose', 'magnesium-sulfate', 'procainamide', 'dextrose', 'ondansetron', 'steroid',
  'cpr', 'aed', 'defib', 'cardiovert', 'pace', 'vagal', 'hs-ts', 'call-help', 'handoff', 'poison-control',
];
/** The field's and the cath lab's own: never offered in the department */
const NEVER_IN_ED = [
  'ecg-transmit', 'als', 'med-control', 'stemi-alert', 'notify', 'transport-pci', 'transport-near', 'nitro-assist', 'oral-glucose',
  'transducer', 'act', 'echo', 'lvedp', 'rhc', 'view-rao-cranial', 'lv-gram', 'ffr', 'angio', 'access', 'access-venous', 'timeout', 'consent',
  'stent-des', 'guide-ebu', 'iabp', 'impella', 'callout', 'radial-cocktail', 'ic-nitro', 'bivalirudin', 'phenylephrine', 'sedation', 'clear-air',
];

describe('emergency department scope', () => {
  it('gives the ER nurse and the ER doctor the department\'s shared work', () => {
    for (const role of [6, 7] as const) {
      const mine = scope(role);
      for (const id of ED_BOTH) expect(mine.has(id), `role ${role}: ${id}`).toBe(true);
      for (const id of NEVER_IN_ED) expect(mine.has(id), `role ${role}: ${id}`).toBe(false);
    }
  });

  it('keeps the physician\'s diagnosis, procedures and decisions from the ER nurse', () => {
    const rn = scope(6);
    const md = scope(7);
    for (const id of ED_MD_ONLY) {
      expect(rn.has(id), `ER nurse: ${id}`).toBe(false);
      expect(md.has(id), `ER doctor: ${id}`).toBe(true);
    }
    // triage and the report to the physician are the nurse's
    for (const id of ['triage', 'notify-physician']) {
      expect(rn.has(id), id).toBe(true);
      expect(md.has(id), id).toBe(false);
    }
  });

  it('tags roles 6 and 7 only where the department can offer the action, and every ED-only action with one of them', () => {
    for (const iv of INTERVENTIONS) {
      const ed = iv.roles.includes(6) || iv.roles.includes(7);
      if (ed) expect(!iv.settings || iv.settings.includes('ed'), `${iv.id} tags an ED role but is not offered in the ED`).toBe(true);
      if (iv.settings?.includes('ed')) expect(ed, `${iv.id} is offered in the ED to nobody there`).toBe(true);
    }
  });

  it('leaves the field and the cath lab roles exactly as they were', () => {
    const edOnly = INTERVENTIONS.filter((iv) => iv.settings?.length === 1 && iv.settings[0] === 'ed').map((iv) => iv.id);
    expect(edOnly.sort()).toEqual([
      'admit', 'alteplase', 'cath-lab-activate', 'central-line', 'consult-cardiology', 'cxr', 'ems-handoff', 'notify-physician', 'pocus',
      'procedural-sedation', 'rsi', 'transfer', 'triage', 'troponin-repeat',
    ]);
    for (const [role, setting] of [[1, 'field'], [2, 'field'], [3, 'cathlab'], [4, 'cathlab'], [5, 'cathlab']] as const) {
      const offered = interventionsFor(role, setting).map((i) => i.id);
      for (const id of edOnly) expect(offered, `role ${role}: ${id}`).not.toContain(id);
    }
  });

  it('names the ED\'s imaging, device and team categories for what they hold', () => {
    expect(categoryLabel('imaging', 'ed')).toBe('X-ray, CT & ultrasound');
    expect(categoryLabel('devices', 'ed')).toBe('Transvenous pacing');
    expect(interventionsFor(7, 'ed').filter((i) => i.category === 'devices').map((i) => i.id)).toEqual(['temp-wire']);
    expect(categoryLabel('team', 'ed')).toBe('Team, consults & disposition');
    expect(categoryLabel('imaging', 'cathlab')).toBe('Angiography & imaging');
    expect(categoryLabel('devices', 'cathlab')).toBe('Catheters, wires & devices');
    expect(categoryLabel('team', 'field')).toBe('Team, calls & transport');
  });

  it('groups the ER doctor\'s long list of medications, with procedural sedation among the sedatives', () => {
    const meds = interventionsFor(7, 'ed').filter((i) => i.category === 'meds');
    const groups = groupActions('meds', meds)!;
    expect(groups.find((g) => g.label === 'Pain, nausea & sedation')!.items.map((i) => i.id)).toContain('procedural-sedation');
    expect(groups.map((g) => g.label)).not.toContain('Other');
  });

  it('gives the heparin and P2Y12 doses the ED uses, and keeps the lab\'s and the field\'s words exactly as they were', () => {
    const ed = Object.fromEntries(interventionsFor(7, 'ed').map((i) => [i.id, i.detail]));
    expect(ed.heparin).toMatch(/^weight-based: 60 U\/kg \(max 4,000 U\)/);
    expect(ed.p2y12).toMatch(/fibrinolytic, clopidogrel 300 mg/);
    expect(ed['ct-urgent']).toMatch(/pulmonary embolism.*leave the department$/);
    expect(ed['call-vad']).toMatch(/advise where the patient should be treated$/);
    expect(Object.fromEntries(interventionsFor(6, 'ed').map((i) => [i.id, i.detail])).heparin).toBe(ed.heparin);
    // the cath lab nurse and cardiologist, and the field crews, see the words they saw before the ED came
    for (const role of [4, 5] as const) {
      const lab = Object.fromEntries(interventionsFor(role, 'cathlab').map((i) => [i.id, i.detail]));
      expect(lab.heparin).toBe('70–100 U/kg for primary PCI');
      expect(lab.p2y12).toBe('ticagrelor 180 mg (or prasugrel 60 mg)');
      expect(lab['ct-urgent']).toBe('head CT for a stroke (CT angiography if a clot could be pulled), abdomen and pelvis for a retroperitoneal bleed, chest CT angiography for a dissection — once the patient is stable enough to leave the lab');
    }
    for (const role of [1, 2] as const) {
      expect(interventionsFor(role, 'field').find((i) => i.id === 'call-vad')!.detail).toBe('the implanting center, 24/7: they talk you through the alarms and say where to take the patient');
    }
    expect(detailFor(INTERVENTION_BY_ID.heparin, 'cathlab')).toBe('70–100 U/kg for primary PCI');
    // the log line of the action says the setting's dose too
    expect(run(edPatient(), 7, ['iv', 'heparin']).log.some((l) => l.who === 'you' && l.text === `Unfractionated heparin IV bolus — ${ed.heparin}`)).toBe(true);
    // midazolam's procedural line names no setting
    expect(INTERVENTION_BY_ID.midazolam.detail).toMatch(/procedural sedation \(before a shock, the pacer or a bedside procedure\)/);
  });
});

describe('emergency department defaults', () => {
  it('takes the EMS report from the crew, and has none for a patient who walked in', () => {
    const walkIn = run(edPatient(), 6, []);
    const s = tryAct(edPatient(), walkIn, 'ems-handoff');
    expect(s.minute).toBe(0);
    expect(last(s).text).toMatch(/no EMS crew/);
    const brought = edPatient({ facts: { ems: '"62-year-old, crushing chest pain for 40 minutes; aspirin 324 mg given."' } });
    const r = run(brought, 7, ['ems-handoff']);
    expect(last(r)).toMatchObject({ who: 'ems', text: expect.stringMatching(/aspirin 324 mg/) });
    expect(r.flags['ems-report']).toBeDefined();
  });

  it('triages by the Emergency Severity Index: ESI 1 for a patient who needs a life-saving intervention, ESI 2 for chest pain', () => {
    const esi2 = run(edPatient(), 6, ['triage']);
    expect(last(esi2).text).toMatch(/^ESI 2: .*12-lead within 10 minutes/);
    expect(esi2.flags['esi-2']).toBeDefined();
    for (const sick of [edPatient({ vitals: { sbp: 78, dbp: 44 } }), edPatient({ profile: 'third-degree-avb', hr: 32 }), edPatient({ vitals: { spo2: 84 } })]) {
      const s = run(sick, 6, ['triage']);
      expect(last(s).text, sick.initial.rhythm.profile).toMatch(/^ESI 1: /);
      expect(s.flags['esi-1']).toBeDefined();
    }
    const own = edPatient({ facts: { triage: 'ESI 2: chest pain radiating to the back.' } });
    expect(last(run(own, 6, ['triage'])).text).toBe('ESI 2: chest pain radiating to the back.');
  });

  it('brings more hands into the room when the nurse or the doctor calls for help — no dispatch radio', () => {
    for (const role of [6, 7] as const) {
      const s = run(edPatient(), role, ['call-help']);
      expect(last(s).who, `role ${role}`).toBe('team');
      expect(last(s).text).toMatch(/come into the room/);
    }
    expect(last(run(edPatient(), 6, ['call-help'])).text).toMatch(/ED physician/);
  });

  it('the nurse reports to the ED physician; the physician answers', () => {
    const s = run(edPatient(), 6, ['notify-physician', 'notify-physician']);
    expect(last(s).who).toBe('physician');
    expect(s.counts['notify-physician']).toBe(2);
  });

  it('reads the chest film to the nurse, and lets the doctor read it; none during an arrest', () => {
    const film = edPatient({ facts: { cxr: 'Portable chest X-ray: a widened mediastinum.' } });
    expect(last(run(film, 6, ['cxr']))).toMatchObject({ who: 'physician', text: 'Portable chest X-ray: a widened mediastinum.' });
    expect(last(run(film, 7, ['cxr']))).toMatchObject({ who: 'you', text: 'Portable chest X-ray: a widened mediastinum.' });
    const arrest = edPatient({ profile: 'vf', hr: 0, pulse: false });
    expect(tryAct(arrest, start(arrest, 7), 'cxr').minute).toBe(0);
  });

  it('point-of-care ultrasound: the case\'s finding (or its echo), within the pulse check in an arrest', () => {
    const tamponade = edPatient({ facts: { pocus: 'A large pericardial effusion; the right ventricle collapses in diastole.' } });
    expect(last(run(tamponade, 7, ['pocus'])).text).toMatch(/collapses in diastole/);
    expect(last(run(edPatient({ facts: { echo: 'Severely reduced LV function.' } }), 7, ['pocus'])).text).toBe('Severely reduced LV function.');
    const pea = edPatient({ profile: 'normal-sinus', hr: 70, pulse: false });
    const s = run(pea, 7, ['pocus']);
    expect(last(s).text).toMatch(/pulse check/);
    expect(s.flags.pocus).toBeDefined();
  });

  it('CT in the department: no sheath to secure; and nobody scans an arrest', () => {
    const s = run(edPatient({ facts: { ct: 'Radiology: a type A aortic dissection.' } }), 7, ['ct-urgent']);
    expect(s.log.at(-2)!.text).toBe('Scanned and back: the patient went with a nurse and the monitor.');
    expect(last(s)).toMatchObject({ who: 'hospital', text: 'Radiology: a type A aortic dissection.' });
    const arrest = edPatient({ profile: 'vf', hr: 0, pulse: false });
    expect(tryAct(arrest, start(arrest, 7), 'ct-urgent').minute).toBe(0);
  });

  it('a central line (an introducer sheath) is access for drugs and the way in for a transvenous wire', () => {
    const block = edPatient({ profile: 'third-degree-avb', hr: 34, vitals: { sbp: 82, dbp: 50 } });
    const before = run(block, 7, []);
    const noLine = tryAct(block, before, 'temp-wire');
    expect(noLine.minute).toBe(0);
    expect(last(noLine).text).toMatch(/place a central venous line first/);
    const s = run(block, 7, ['central-line', 'atropine', 'temp-wire']);
    expect(s.flags.central).toBeDefined();
    expect(s.log.some((l) => /^Right internal jugular introducer sheath \(6 Fr, with a side port\)/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /from every port/.test(l.text))).toBe(false);
    expect(s.log.some((l) => /^Balloon-tipped pacing wire floated through the introducer sheath/.test(l.text))).toBe(true);
    expect(s.counts.atropine).toBe(1);
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expect(s.minute).toBeCloseTo(8 + 0.5 + 3, 5);
    expect(ids(s)).toEqual([]);
    expect(INTERVENTION_BY_ID['central-line'].detail).toMatch(/introducer sheath \(6 Fr, with a side port for drugs\)/);
  });

  it('a transvenous wire in the ED is for a slow rate; in the lab a wire on demand is still a backup', () => {
    const s = run(edPatient(), 7, ['central-line', 'temp-wire']);
    expect(ids(s)).toEqual(['temp-wire-not-slow']);
    expect(last(s).text).toMatch(/set to pace on demand below 50/);
    const lab = { ...edPatient(), id: 'lab-test', setting: 'cathlab' as const, roles: [3, 4, 5] as LearningLevel[] };
    expect(ids(run(lab, 5, ['access-venous', 'temp-wire']))).toEqual([]);
    expect(last(run(lab, 5, ['access-venous', 'temp-wire'])).text).toMatch(/^Temporary wire in the RV apex/);
  });

  it('the ER doctor drains the pericardium under their own ultrasound, and only for tamponade', () => {
    const tamponade = edPatient({ problems: ['tamponade'], vitals: { sbp: 78, dbp: 60 }, facts: { pocus: 'A large effusion; the right ventricle collapses in diastole.' } });
    // with a pulse, no needle before the scan
    const blind = tryAct(tamponade, run(tamponade, 7, []), 'pericardiocentesis');
    expect(blind.minute).toBe(0);
    expect(last(blind).text).toMatch(/scan the heart first/);
    const s = run(tamponade, 7, ['pocus', 'pericardiocentesis']);
    expect(s.flags.pericardiocentesis).toBeDefined();
    expect(last(s).text).toBe('Pericardial drain in under echo guidance.');
    expect(ids(s)).toEqual([]);
    // no tamponade: a needle into a normal pericardium
    const wrong = run(edPatient(), 7, ['pocus', 'pericardiocentesis']);
    expect(wrong.penalties).toMatchObject([{ id: 'pericardiocentesis-no-tamponade', severity: 'critical' }]);
    // in an arrest there is no time for a scan: the needle goes in blind, and says so
    const pea = edPatient({ profile: 'normal-sinus', hr: 70, pulse: false, problems: ['tamponade'] });
    const a = run(pea, 7, ['pericardiocentesis']);
    expect(last(a).text).toMatch(/^Emergency pericardiocentesis during the arrest, without imaging/);
    expect(ids(a)).toEqual([]);
  });

  it('a fibrinolytic needs a STEMI on the 12-lead or a pulmonary embolism', () => {
    const none = run(edPatient(), 7, ['iv', 'tnk']);
    expect(none.penalties).toMatchObject([{ id: 'lytic-no-indication', severity: 'critical' }]);
    expect(ids(run(stemi(), 7, ['ecg12', 'iv', 'tnk']))).toEqual([]);
    expect(ids(run(edPatient({ problems: ['pulmonary-embolism'] }), 7, ['iv', 'tnk']))).toEqual([]);
    // a dissection: one mistake, one penalty — the dissection's own rule
    expect(ids(run(edPatient({ problems: ['aortic-dissection'] }), 7, ['iv', 'tnk']))).toEqual(['lytic-dissection']);
    // the lab's own cases score a lytic in the lab in their own words
    const lab = { ...edPatient(), id: 'lab-test', setting: 'cathlab' as const, roles: [3, 4, 5] as LearningLevel[] };
    expect(ids(run(lab, 5, ['iv', 'tnk']))).toEqual([]);
  });

  it('serial troponins: a repeat after the first set of labs, in the case\'s words', () => {
    const before = tryAct(edPatient(), run(edPatient(), 6, []), 'troponin-repeat');
    expect(before.minute).toBe(0);
    expect(last(before).text).toMatch(/draw the first set of labs/);
    const sc = edPatient({ facts: { troponin: (s) => `hs-troponin ${s.minute < 1 ? 12 : 48} ng/L.` } });
    const s = run(sc, 6, ['labs', 'troponin-repeat', 'reassess', 'troponin-repeat']);
    expect(s.log.filter((l) => l.who === 'team').map((l) => l.text).slice(-1)[0]).toBe('hs-troponin 48 ng/L.');
    expect(s.flags['troponin-repeat']).toBeDefined();
    expect(unavailableReason(sc, s, 'troponin-repeat')).toBe('Maximum 2 doses');
    expect(unavailableReason(sc, s, 'labs')).toBe('Already done');
    expect(ids(s)).toEqual([]);
    expect(scope(7).has('troponin-repeat')).toBe(true);
  });

  it('rapid sequence intubation takes the airway of a patient who still breathes; resuscitate before you intubate', () => {
    const failing = edPatient({ vitals: { spo2: 82, rr: 34, gcs: 13 } });
    const s = run(failing, 7, ['monitor', 'iv', 'rsi']);
    expect(s.flags.airway).toBeDefined();
    expect(s.flags.ventilated).toBeDefined();
    expect(s.vitals.gcs).toBe(3);
    expect(s.vitals.spo2).toBeGreaterThan(82);
    expect(ids(s)).toEqual([]);
    const shock = edPatient({ vitals: { sbp: 78, dbp: 46, spo2: 84 } });
    expect(ids(run(shock, 7, ['monitor', 'iv', 'rsi']))).toEqual(['rsi-unresuscitated']);
    expect(ids(run(shock, 7, ['monitor', 'iv', 'pressor', 'rsi']))).toEqual([]);
    const arrest = edPatient({ profile: 'vf', hr: 0, pulse: false });
    const a = run(arrest, 7, ['io']);
    expect(tryAct(arrest, a, 'rsi').counts.rsi).toBeUndefined();
    // midazolam for the tube afterwards is sedation for a ventilated patient, not a mistake
    expect(ids(run(failing, 7, ['monitor', 'iv', 'rsi', 'midazolam']))).toEqual([]);
  });

  it('RSI needs an indication and the monitor', () => {
    // awake, breathing well, a normal oxygen saturation and pressure: no indication
    const well = run(edPatient(), 7, ['monitor', 'iv', 'rsi']);
    expect(well.penalties).toMatchObject([{ id: 'rsi-no-indication', severity: 'major' }]);
    expect(well.penalties[0].text).toMatch(/cannot protect the airway, cannot oxygenate or ventilate, or whose expected course/);
    // each indication on its own is enough
    for (const vitals of [{ gcs: 8 }, { spo2: 88 }, { rr: 36 }, { rr: 8 }, { sbp: 84, dbp: 50 }]) {
      expect(ids(run(edPatient({ vitals }), 7, ['monitor', 'iv', 'rsi'])), JSON.stringify(vitals)).not.toContain('rsi-no-indication');
    }
    const blind = run(edPatient({ vitals: { spo2: 82, rr: 34 } }), 7, ['iv', 'rsi']);
    expect(ids(blind)).toEqual(['rsi-unmonitored']);
    expect(ids(run(edPatient({ vitals: { spo2: 82, rr: 34 } }), 7, ['pads', 'iv', 'rsi']))).toEqual([]);
  });

  it('midazolam in the department: the titrated IV procedural dose before a shock or the pacer, never IM for a procedure', () => {
    const af = edPatient({ profile: 'atrial-fibrillation', hr: 150, vitals: { sbp: 96, dbp: 60 } });
    const noLine = tryAct(af, run(af, 7, []), 'midazolam');
    expect(noLine.minute).toBe(0);
    expect(last(noLine).text).toMatch(/goes in IV, a little at a time/);
    const s = run(af, 7, ['iv', 'midazolam']);
    expect(s.log.some((l) => l.text === 'Midazolam 1 mg IV, titrated.')).toBe(true);
    expect(s.log.some((l) => /^Midazolam \d+(\.\d+)? mg IM/.test(l.text))).toBe(false);
    const block = edPatient({ profile: 'third-degree-avb', hr: 34 });
    expect(run(block, 7, ['iv', 'midazolam']).log.some((l) => l.text === 'Midazolam 1 mg IV, titrated.')).toBe(true);
    // agitation (no procedure): the usual dose, IM without a line
    const agitated = edPatient({ profile: 'sinus-tachycardia', hr: 118, vitals: { sbp: 170, dbp: 100 } });
    expect(run(agitated, 7, ['midazolam']).log.some((l) => l.text === 'Midazolam 5 mg IM (no IV yet).')).toBe(true);
  });

  it('procedural sedation: for a cardioversion or pacing, on the monitor', () => {
    const svt = edPatient({ profile: 'avnrt', hr: 188, vitals: { sbp: 84, dbp: 52 } });
    const s = run(svt, 7, ['monitor', 'iv', 'procedural-sedation', 'cardiovert']);
    expect(s.flags.sedation).toBeDefined();
    expect(ids(s)).toEqual([]);
    expect(ids(run(svt, 7, ['iv', 'procedural-sedation']))).toEqual(['sedation-unmonitored']);
    expect(ids(run(edPatient(), 7, ['monitor', 'iv', 'procedural-sedation']))).toEqual(['sedation-no-procedure']);
    // a slow rate is a procedure to sedate for once the pads are on for the pacer; before that there is none yet
    const block = edPatient({ profile: 'third-degree-avb', hr: 34 });
    expect(ids(run(block, 7, ['monitor', 'pads', 'iv', 'procedural-sedation']))).toEqual([]);
    expect(ids(run(block, 7, ['monitor', 'iv', 'procedural-sedation']))).toEqual(['sedation-no-procedure']);
  });

  it('activates the cath lab only for a STEMI on the 12-lead; the team is ready after the case\'s minutes', () => {
    const noEcg = tryAct(stemi(), start(stemi(), 7), 'cath-lab-activate');
    expect(noEcg.minute).toBe(0);
    const s = run(stemi(), 7, ['ecg12', 'cath-lab-activate']);
    expect(s.flags.alert).toBeDefined();
    expect(s.flags.dispo).toBeDefined();
    expect(s.timers.cathReady).toBeCloseTo(2 + CATH_LAB_MINUTES, 5);
    expect(s.flags['cath-ready']).toBeUndefined();
    const quick = stemi({ cathLabMinutes: 4 });
    const ready = run(quick, 7, ['ecg12', 'cath-lab-activate', 'reassess', 'reassess']);
    expect(ready.flags['cath-ready']).toBeDefined();
    expect(ready.log.some((l) => l.who === 'hospital' && /room is ready/.test(l.text))).toBe(true);
    // a tracing that does not meet STEMI criteria: interventional cardiology declines, and the call costs points
    const pericarditis = edPatient({ profile: 'pericarditis', hr: 96 });
    const d = run(pericarditis, 7, ['ecg12', 'cath-lab-activate']);
    expect(last(d).who).toBe('consultant');
    expect(d.flags['alert-declined']).toBeDefined();
    expect(d.flags.dispo).toBeUndefined();
    expect(ids(d)).toEqual(['cath-lab-no-ste']);
  });

  it('the VAD team on the phone: the controller and a MAP, and the transfer is the ED physician\'s call', () => {
    const lvad = edPatient({ initial: { rhythm: { profile: 'normal-sinus', hr: 80 }, vitals: { ...VITALS, sbp: 84, dbp: 72 }, lvad: true } });
    const rn = last(run(lvad, 6, ['call-vad']));
    expect(rn).toMatchObject({ who: 'hospital', text: expect.stringMatching(/Have your ED physician call me: if you are not our implanting center, we will arrange the transfer\."$/) });
    expect(rn.text).not.toMatch(/bring the patient/);
    const md = last(run(lvad, 7, ['call-vad']));
    expect(md.text).toMatch(/physician to physician\."$/);
    expect(md.text).not.toMatch(/bring the patient|your ED physician/);
  });

  it('consults cardiology, who answers in the case\'s words', () => {
    const s = run(edPatient({ facts: { consult: 'Cardiology: "Start amiodarone; I am on my way."' } }), 7, ['consult-cardiology']);
    expect(last(s)).toMatchObject({ who: 'consultant', text: expect.stringMatching(/amiodarone/) });
    expect(unavailableReason(edPatient(), run(edPatient(), 7, ['consult-cardiology', 'consult-cardiology']), 'consult-cardiology')).toBe('Maximum 2 calls');
  });
});

describe('the emergency department hand-off', () => {
  it('waits for a disposition, and never leaves in an arrest', () => {
    const doc = run(edPatient(), 7, []);
    const early = tryAct(edPatient(), doc, 'handoff');
    expect(early.ended).toBeNull();
    expect(last(early).text).toMatch(/^Decide where the patient goes first/);
    const nurse = tryAct(edPatient(), run(edPatient(), 6, []), 'handoff');
    expect(last(nurse).text).toMatch(/until the ED physician decides/);
    const arrest = edPatient({ profile: 'vf', hr: 0, pulse: false });
    const a = tryAct(arrest, start(arrest, 7), 'handoff');
    expect(a.ended).toBeNull();
    expect(last(a).text).toMatch(/resuscitation is run here/);
    for (const id of ['admit', 'transfer']) expect(tryAct(arrest, start(arrest, 7), id).counts[id], id).toBeUndefined();
  });

  it('goes to the admitting team, the transport team or the cath lab team once it is ready', () => {
    const admitted = run(edPatient(), 7, ['admit', 'handoff']);
    expect(admitted.ended?.reason).toBe('complete');
    expect(admitted.log.some((l) => l.text === 'SBAR hand-off to the admitting team; they take over.')).toBe(true);
    expect(run(edPatient(), 7, ['transfer', 'handoff']).log.some((l) => /to the transport team/.test(l.text))).toBe(true);
    const sc = stemi({ cathLabMinutes: 3 });
    const waiting = run(sc, 7, ['ecg12', 'cath-lab-activate']);
    const blocked = tryAct(sc, waiting, 'handoff');
    expect(blocked.ended).toBeNull();
    expect(last(blocked).text).toMatch(/still on its way/);
    const done = run(sc, 7, ['ecg12', 'cath-lab-activate', 'reassess', 'reassess', 'handoff']);
    expect(done.ended?.reason).toBe('complete');
    expect(done.log.some((l) => /to the cath lab team/.test(l.text))).toBe(true);
  });

  it('in a nurse\'s case the computer physician decides: physicianDispo opens the hand-off', () => {
    const sc = edPatient({
      events: [{ id: 'dispo', when: (s) => s.minute >= 2, effect: (s) => physicianDispo(s, 'admit', 'I have spoken to the ICU: the patient is going up.') }],
    });
    const s = run(sc, 6, ['monitor', 'reassess', 'handoff']);
    expect(s.log.some((l) => l.who === 'physician' && /ICU/.test(l.text))).toBe(true);
    expect(s.ended?.reason).toBe('complete');
    const lab = edPatient({ events: [{ id: 'dispo', when: (s) => s.minute >= 1, effect: (s) => physicianDispo(s, 'cathLab', 'Cath lab activated.', 2) }] });
    expect(run(lab, 6, ['monitor', 'reassess', 'reassess', 'handoff']).ended?.reason).toBe('complete');
  });
});

describe('emergency department voices', () => {
  const FIELD_OR_LAB: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];

  it('no default response in the department speaks as the cath lab operator or the field', () => {
    const setups: [Scenario, string[]][] = [
      [edPatient(), ['iv', 'monitor', 'ecg12']],
      [stemi({ cathLabMinutes: 0 }), ['iv', 'monitor', 'ecg12']],
      [edPatient({ profile: 'vf', hr: 0, pulse: false }), ['io', 'monitor']],
    ];
    for (const role of [6, 7] as const) {
      for (const iv of interventionsFor(role, 'ed')) {
        for (const [sc, before] of setups) {
          const next = tryAct(sc, run(sc, role, before), iv.id);
          for (const l of next.log) expect(FIELD_OR_LAB, `role ${role} ${iv.id}: ${l.who} "${l.text}"`).not.toContain(l.who);
        }
      }
    }
  });

  it('names the ED speakers, and the team beside an ED learner', () => {
    expect(SETTING_LABEL.ed).toBe('Emergency department');
    expect(speakerName('physician', 6)).toBe('ED physician');
    expect(speakerName('nurse', 7)).toBe('Nurse');
    expect(speakerName('consultant', 7)).toBe('Cardiology');
    expect(speakerName('ems', 6)).toBe('EMS crew');
    expect(speakerName('operator', 5)).toBe('Cardiologist');
    for (const role of [3, 4, 5, 6, 7] as const) expect(speakerName('partner', role)).toBe('Team');
    for (const role of [1, 2] as const) expect(speakerName('partner', role)).toBe('Partner');
    for (const who of ['physician', 'nurse', 'consultant', 'ems'] as const) expect(SPEAKER_STYLE[who]).toMatch(/^text-/);
  });

  it('edKit: the physician\'s order is an ask the ER nurse answers, in the physician\'s voice', () => {
    const order = edOrder({
      id: 'aspirin', when: (s) => s.minute >= 0, ask: 'Aspirin 324 mg chewed, please.', accept: ['aspirin'], thanks: 'Thank you.',
      fallback: 'I will give it myself.', gives: 'aspirin-given', label: 'Aspirin on order', why: 'It cuts the mortality of an MI.',
    });
    expect(order).toMatchObject({ role: 6, speaker: 'physician' });
    const sc = edPatient({ events: askEvents(order), critical: [askCritical(order), { id: 'handoff', label: 'Hand-off', why: '…', done: ['handoff'] }] });
    const s = run(sc, 6, ['aspirin']);
    expect(s.log.filter((l) => l.who === 'physician').map((l) => l.text)).toEqual(['Aspirin 324 mg chewed, please.', 'Thank you.']);
    expect(askCritical(order).roles).toEqual([6]);
    // the ER doctor's run of the same case: the order is not theirs
    expect(run(sc, 7, ['aspirin']).log.some((l) => l.who === 'physician')).toBe(false);
    expect(edPhysician(start(sc, 7))).toBe('you');
    expect(edPhysician(start(sc, 6))).toBe('physician');
    expect(edNurse(start(sc, 6))).toBe('you');
    expect(edNurse(start(sc, 7))).toBe('nurse');
    expect(DOOR_TO_ECG).toMatchObject({ actions: ['ecg12'], target: 10 });
  });
});

describe('the case list for a role', () => {
  it('says so when a role has no cases yet, and shows the cath lab catalog only to the cath lab roles', () => {
    const noEd = SCENARIOS.filter((sc) => sc.setting !== 'ed');
    for (const role of [6, 7] as const) {
      const list = caseSections(role, noEd);
      expect(list.mine, LEVEL_LABELS[role].short).toEqual([]);
      expect(list.empty).toBe(true);
      expect(list.others.length).toBe(noEd.length);
      expect(list.studyLab).toBe(false);
    }
    for (const role of [3, 4, 5] as const) expect(caseSections(role).studyLab, `role ${role}`).toBe(true);
    for (const role of [1, 2] as const) {
      expect(caseSections(role).studyLab, `role ${role}`).toBe(false);
      expect(caseSections(role).empty).toBe(false);
    }
  });

  it('lists the ED cases under the ER roles, and under the other roles\' "other cases"', () => {
    const ed = SCENARIOS.filter((sc) => sc.setting === 'ed').map((sc) => sc.id);
    expect(ed).toHaveLength(10);
    for (const role of [6, 7] as const) {
      const list = caseSections(role);
      expect(list.mine.map((sc) => sc.id).sort(), LEVEL_LABELS[role].short).toEqual([...ed].sort());
      expect(list.empty).toBe(false);
    }
    expect(caseSections(6, [...SCENARIOS, edPatient()]).mine.map((sc) => sc.id)).toContain('ed-test');
    expect(caseSections(2).others.map((sc) => sc.id)).toEqual(expect.arrayContaining(ed));
  });
});

describe('the ER nurse gives a medication on an order', () => {
  const NEEDS_ORDER = ['iv', 'heparin', 'p2y12', 'pressor', 'diltiazem', 'insulin-dextrose', 'transfuse'];

  it('costs points for each drug the nurse gives on her own; the ER doctor orders them', () => {
    const rn = run(edPatient(), 6, NEEDS_ORDER);
    for (const id of NEEDS_ORDER.slice(1)) expect(ids(rn), id).toContain(`rn-without-order-${id}`);
    expect(ids(rn).filter((p) => p.startsWith('rn-without-order-'))).toHaveLength(NEEDS_ORDER.length - 1);
    expect(rn.penalties.find((p) => p.id === 'rn-without-order-heparin')).toMatchObject({ severity: 'major', text: expect.stringMatching(/^Heparin without an order\. /) });
    expect(ids(run(edPatient(), 7, NEEDS_ORDER)).filter((p) => p.startsWith('rn-without-order-'))).toEqual([]);
  });

  it('every order-only drug is one the ER nurse is offered, scored once per drug', () => {
    // the list also names actions still to come (no case offers them yet), each named here: every other one exists and is
    // the nurse's to give. When an action on this list is added, it moves off it (and the loop below checks it)
    const PENDING = ['adenosine3', 'esmolol', 'labetalol', 'metoprolol-po', 'nicardipine', 'inotrope', 'nitro-iv', 'furosemide', 'calcium-gluconate'];
    for (const id of PENDING) expect(INTERVENTION_BY_ID[id], `${id} exists now: take it off PENDING`).toBeUndefined();
    for (const id of PENDING) expect(Object.keys(RN_ORDER_ONLY), id).toContain(id);
    const existing = Object.keys(RN_ORDER_ONLY).filter((id) => !PENDING.includes(id));
    expect(existing).toEqual(expect.arrayContaining(['heparin', 'alteplase', 'lidocaine']));
    for (const id of existing) {
      expect(INTERVENTION_BY_ID[id], `${id} is not an action (a typo, or add it to PENDING)`).toBeDefined();
      expect(scope(6).has(id), id).toBe(true);
    }
    const twice = run(edPatient({ vitals: { pain: 8 } }), 6, ['iv', 'fentanyl', 'fentanyl']);
    expect(ids(twice).filter((p) => p === 'rn-without-order-fentanyl')).toHaveLength(1);
  });

  it('the chest pain standing order and the ACLS arrest drugs need no order', () => {
    const chestPain = run(stemi(), 6, ['triage', 'monitor', 'ecg12', 'o2-nc', 'iv', 'labs', 'aspirin', 'nibp', 'ask-pde5', 'nitro', 'cxr', 'troponin-repeat', 'notify-physician']);
    expect(ids(chestPain)).toEqual([]);
    const vf = edPatient({ profile: 'vf', hr: 0, pulse: false });
    expect(ids(run(vf, 6, ['cpr', 'defib', 'io', 'cpr', 'epinephrine', 'defib', 'amio-arrest', 'lidocaine'])).filter((p) => p.startsWith('rn-'))).toEqual([]);
    // calcium in an arrest is the code leader's call, scored by the drug rule; with a pulse it needs an order
    expect(ids(run(vf, 6, ['io', 'calcium-chloride']))).toEqual(['calcium-no-indication']);
    const hyperk = edPatient({ problems: ['hyperkalemia'] });
    expect(ids(run(hyperk, 6, ['iv', 'calcium-chloride']))).toEqual(['rn-without-order-calcium-chloride']);
  });

  it('the physician\'s order makes it the nurse\'s to give: an ask, an order in a case event, a standing order or the disposition', () => {
    const order = edOrder({
      id: 'heparin', when: (s) => s.minute >= 3, ask: 'Heparin 60 units per kilo, please.', accept: ['heparin'], wrong: ['p2y12'],
      wrongSay: 'That is not what I asked for.', thanks: 'Thanks.', fallback: 'I will give it myself.', gives: 'heparin-given',
      label: 'Heparin on order', why: '…',
    });
    const asked = edPatient({ events: askEvents(order), harms: [askHarm(order, 'Not the drug the physician ordered.')] });
    expect(ids(run(asked, 6, ['iv', 'heparin']))).toEqual(['rn-without-order-heparin']); // at minute 2, before the order
    expect(ids(run(asked, 6, ['iv', 'reassess', 'heparin']))).toEqual([]);
    // a wrong answer to the open order is the order's own mistake: one penalty, not two
    expect(ids(run(asked, 6, ['iv', 'reassess', 'p2y12']))).toEqual(['wrong-heparin']);
    // once the order is carried out, the same drug again on her own is no answer to it
    expect(ids(run(asked, 6, ['iv', 'reassess', 'heparin', 'p2y12']))).toEqual(['rn-without-order-p2y12']);
    const event = edPatient({ events: [{ id: 'orders', when: (s) => s.minute >= 3, effect: () => physicianOrder('Start a norepinephrine drip, please.', ['pressor']) }] });
    const e = run(event, 6, ['iv', 'pressor']);
    expect(ids(e)).toEqual(['rn-without-order-pressor']);
    expect(ids(run(event, 6, ['iv', 'reassess', 'pressor']))).toEqual([]);
    expect(run(event, 6, ['iv', 'reassess']).log.some((l) => l.who === 'physician' && /norepinephrine/.test(l.text))).toBe(true);
    expect(ids(run(edPatient({ events: [standingOrders(['heparin', 'p2y12'])] }), 6, ['iv', 'heparin', 'p2y12']))).toEqual([]);
    const lab = edPatient({ events: [{ id: 'dispo', when: (s) => s.minute >= 1, effect: (s) => physicianDispo(s, 'cathLab', 'Cath lab is coming; heparin and ticagrelor now.', 10, ['heparin', 'p2y12']) }] });
    expect(ids(run(lab, 6, ['iv', 'reassess', 'heparin', 'p2y12']))).toEqual([]);
  });

  it('applies to the ER nurse in the department only: the field and the lab nurse are unchanged', () => {
    const lab = { ...edPatient(), id: 'lab-test', setting: 'cathlab' as const, roles: [3, 4, 5] as LearningLevel[] };
    expect(ids(run(lab, 4, ['iv', 'heparin', 'p2y12'])).filter((p) => p.startsWith('rn-'))).toEqual([]);
    const field = { ...edPatient(), id: 'field-test', setting: 'field' as const, roles: [1, 2] as LearningLevel[] };
    expect(ids(run(field, 2, ['iv', 'fentanyl', 'metoprolol'])).filter((p) => p.startsWith('rn-'))).toEqual([]);
  });
});

describe('the defaults in cardiac arrest and with a drowsy patient', () => {
  const vf = edPatient({ profile: 'vf', hr: 0, pulse: false });

  it('nothing by mouth, no CPAP and no history from a patient in arrest', () => {
    for (const role of [6, 7] as const) {
      const s = run(vf, role, ['io']);
      for (const id of ['aspirin', 'p2y12', 'cpap', 'opqrst', 'sample', 'ask-pde5']) {
        const next = tryAct(vf, s, id);
        expect(next.counts[id], `role ${role}: ${id}`).toBeUndefined();
        expect(next.log.some((l) => l.who === 'patient'), `role ${role}: ${id}`).toBe(false);
      }
    }
    // a case's own answer is said as written (here a bystander's words)
    const told = edPatient({ profile: 'vf', hr: 0, pulse: false, facts: { sample: 'His wife: "Diabetes and blood pressure pills."' } });
    expect(last(run(told, 7, ['sample'])).text).toMatch(/^His wife/);
  });

  it('a drowsy patient swallows nothing, gets no CPAP below a GCS of 9, and gives no history', () => {
    const drowsy = edPatient({ vitals: { gcs: 9 } });
    for (const id of ['aspirin', 'p2y12']) {
      const next = tryAct(drowsy, run(drowsy, 7, ['iv']), id);
      expect(next.counts[id], id).toBeUndefined();
      expect(last(next).text).toMatch(/too drowsy to swallow/);
    }
    expect(run(drowsy, 7, ['cpap']).flags.cpap).toBeDefined();
    const obtunded = edPatient({ vitals: { gcs: 8 } });
    expect(tryAct(obtunded, run(obtunded, 7, []), 'cpap').counts.cpap).toBeUndefined();
    const s = run(drowsy, 6, ['opqrst']);
    expect(last(s).text).toMatch(/too drowsy to give a history/);
    expect(s.flags.opqrst).toBeUndefined();
    expect(run(edPatient(), 6, ['aspirin']).log.some((l) => l.text === 'Chews the aspirin.')).toBe(true);
  });
});

describe('the 12-lead in the ER doctor\'s run', () => {
  const nurseEcg = (minute: number) => ({ id: 'nurse-ecg', when: (s: SimState) => s.minute >= minute, effect: () => ({ say: [['nurse', '12-lead done — it is on the screen.']] as [Speaker, string][], flags: ['ecg12', 'monitor'] }) });

  it('a computer nurse\'s 12-lead counts: the doctor reads it, a STEMI on it opens the lab and the lytic, and the door-to-ECG time is the team\'s', () => {
    const sc = stemi({ events: [nurseEcg(3)], timings: [DOOR_TO_ECG] });
    const s = start(sc, 7);
    expect(s.pendingRead).toBeNull();
    const after = run(sc, 7, ['iv', 'monitor'], undefined, 'manual');
    expect(after.pendingRead).toMatchObject({ kind: 'ecg' });
    const done = run(sc, 7, ['iv', 'monitor', 'cath-lab-activate']);
    expect(done.flags['ecg-stemi']).toBeDefined();
    expect(done.flags.alert).toBeDefined();
    expect(ids(run(sc, 7, ['iv', 'monitor', 'tnk']))).toEqual([]);
    expect(review(sc, done).timings).toEqual([{ label: 'Door to 12-lead', minute: 3, target: 10, met: true }]);
    expect(DOOR_TO_ECG).toMatchObject({ actions: ['ecg12'], flag: 'ecg12', target: 10 });
  });
});

describe('the field and the lab keep their scoring', () => {
  it('a paramedic who sedates a drowsy, intubated patient after ROSC is still scored for it (only the ED exempts the tube)', () => {
    const sc = SCENARIO_BY_ID['vf-arrest-field'];
    const steps = ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'capno', 'airway', 'cpr', 'defib', 'pressor'];
    const before = run(sc, 2, steps);
    expect(before.pulse).toBe(true);
    expect(before.flags.airway).toBeDefined();
    expect(before.vitals.gcs).toBeLessThanOrEqual(12);
    expect(ids(run(sc, 2, [...steps, 'midazolam']))).toContain('midazolam-unsafe');
    // the department: a tube in a drowsy patient is a ventilated one, sedated on the physician's decision
    const tubed = edPatient({ vitals: { gcs: 6 } });
    expect(ids(run(tubed, 7, ['airway', 'iv', 'midazolam']))).toEqual([]);
    expect(ids(run(tubed, 7, ['iv', 'midazolam']))).toEqual(['midazolam-unsafe']);
  });
});

describe('alteplase for pulmonary embolism', () => {
  it('is an ED fibrinolytic the nurse runs on an order and the doctor decides, with the same rules as tenecteplase', async () => {
    const { INTERVENTION_BY_ID } = await import('@/lib/sim/scenario/interventions');
    const { BUILT_IN_HARMS, RN_ORDER_ONLY } = await import('@/lib/sim/scenario/engine');
    const { DOOR_TO_NEEDLE } = await import('@/lib/sim/scenario/edKit');
    const a = INTERVENTION_BY_ID['alteplase'];
    expect(a.roles).toEqual([6, 7]);
    expect(a.settings).toEqual(['ed']);
    expect(a.detail).toMatch(/100 mg over 2 hours/);
    expect(RN_ORDER_ONLY.alteplase).toBeDefined();
    for (const id of ['lytic-no-indication', 'lytic-dissection']) expect(BUILT_IN_HARMS.find((h) => h.id === id)?.actions).toContain('alteplase');
    expect(DOOR_TO_NEEDLE.actions).toContain('alteplase');
  });
});
