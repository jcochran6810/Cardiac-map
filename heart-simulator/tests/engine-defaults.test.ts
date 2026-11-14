/**
 * The engine's default responses for the existing actions: what each does in cardiac arrest, the lab's blocks, the
 * repeatable lines, and the words that follow the patient (an LVAD or a pacemaker, the sheath, the P2Y12 agent).
 */
import { describe, expect, it } from 'vitest';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { perform, start, unavailableReason } from '@/lib/sim/scenario/engine';
import type { Problem, Scenario, Setting, SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { fixture } from './ruleFixture';
import { runScenario as run } from './helpers';

const SINUS = { profile: 'normal-sinus', hr: 80 };
const VF = { profile: 'vf', hr: 0 };
const last = (s: SimState) => s.log.at(-1)!.text;
/** Perform without the "must be available" check: a blocked action leaves only its line, and no time passes */
const tryAct = (sc: Scenario, s: SimState, id: string) => perform(sc, s, id);
/** A patient whose case opens with these flags already set (a sheath in, a wire across, a line in) */
const withFlags = (setting: Setting, role: LearningLevel, flags: string[], over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({
  setting, role, rhythm: SINUS, ...over,
  extra: { events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }], ...(over.extra ?? {}) },
});
const arrest = (setting: Setting, role: LearningLevel, flags: string[] = ['iv']) => withFlags(setting, role, flags, { rhythm: VF, pulse: false });
/** The case in arrest with compressions given first (and a line in) */
const afterCpr = (sc: Scenario, role: LearningLevel) => run(sc, role, ['cpr']);

describe('drugs and devices in cardiac arrest', () => {
  it('adenosine has no place in an arrest: it says so, and the rhythm stays', () => {
    const sc = arrest('field', 2);
    for (const id of ['adenosine6', 'adenosine12']) {
      const s = run(sc, 2, [id]);
      expect(last(s), id).toBe('Adenosine given — it has no place in cardiac arrest and changes nothing on the monitor.');
      expect(s.rhythm).toEqual(VF);
      expect(s.flags.adenosine).toBeDefined();
    }
  });

  it('refuses a vagal maneuver, a vasopressor infusion, a nebulizer, a neuro exam and consent during CPR: no time passes', () => {
    const field = arrest('field', 2);
    const lab = arrest('cathlab', 5);
    for (const [sc, role, id, why] of [
      [field, 2, 'vagal', /^Not in cardiac arrest: a vagal maneuver needs a patient with a pulse/],
      [field, 2, 'pressor', /^Not during CPR: the arrest drug is epinephrine 1 mg every 3–5 minutes\. Start the infusion once there is a pulse, for a MAP of 65 or more\.$/],
      [field, 2, 'albuterol', /^Not in cardiac arrest: a nebulizer needs a patient who is breathing/],
      [field, 2, 'neuro', /^Not during CPR: with no pulse there is nothing for a neuro exam to find/],
      [lab, 5, 'consent', /^Not in cardiac arrest: run the arrest; consent and the allergy history wait\.$/],
    ] as const) {
      const before = start(sc, role);
      const s = tryAct(sc, before, id);
      expect(s.minute, id).toBe(0);
      expect(s.counts[id], id).toBeUndefined();
      expect(last(s), id).toMatch(why);
    }
  });

  it('the vasopressor infusion is not used up in the arrest: it is there for the pressure after ROSC', () => {
    const sc = arrest('field', 2);
    const s = tryAct(sc, start(sc, 2), 'pressor');
    expect(unavailableReason(sc, s, 'pressor')).toBeNull();
    const low = fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { sbp: 78, dbp: 44 } });
    expect(run(low, 2, ['iv', 'pressor']).flags.pressor).toBeDefined();
  });

  it('push-dose epinephrine in an arrest is no arrest dose, and its flag is its own', () => {
    const s = run(arrest('field', 2), 2, ['push-epi']);
    expect(last(s)).toBe('Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse; the arrest dose is 1 mg.');
    expect(s.flags['push-epi-arrest']).toBeDefined();
    expect(s.flags['push-epi']).toBeUndefined();
  });

  it('IM epinephrine in an arrest: almost none is absorbed', () => {
    const s = run(arrest('ed', 7), 7, ['epi-im']);
    expect(last(s)).toBe('Epinephrine 0.5 mg IM — in cardiac arrest almost none of it is absorbed from the muscle: the arrest dose is 1 mg IV/IO.');
    expect(s.flags['epi-im']).toBeDefined();
  });

  it('the steroid and the antihistamine have no place in an arrest; neither is refused', () => {
    const sc = arrest('ed', 7);
    expect(last(run(sc, 7, ['steroid']))).toBe('Methylprednisolone given — it has no place in cardiac arrest and changes nothing on the monitor.');
    expect(last(run(sc, 7, ['diphenhydramine']))).toBe('Diphenhydramine given — it has no place in cardiac arrest and changes nothing on the monitor.');
  });

  it('a mask or a cannula offers oxygen only to someone who breathes: in an arrest, or breathing too little, the SpO₂ stays; obtunded, the airway is the warning', () => {
    const sc = arrest('field', 2);
    for (const [id, what] of [['o2-nc', 'Cannula on'], ['o2-nrb', 'Mask on']] as const) {
      const s = run(sc, 2, [id]);
      expect(s.vitals.spo2, id).toBe(start(sc, 2).vitals.spo2);
      expect(last(s), id).toBe(`${what} — but the patient is not breathing: a mask or a cannula only offers oxygen to someone who breathes. Bag-mask with oxygen.`);
    }
    const slow = fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { rr: 6, gcs: 9, spo2: 84 } });
    const masked = run(slow, 2, ['o2-nrb']);
    expect(masked.vitals.spo2).toBe(84);
    expect(last(masked)).toMatch(/^Mask on — but the patient is barely breathing/);
    // once someone breathes for them, the oxygen goes in with the breaths
    expect(run(slow, 2, ['bvm', 'o2-nrb']).vitals.spo2).toBe(89);
    // obtunded but breathing at a fair rate: the oxygen goes in, and the danger named is the airway
    const drowsy = fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { gcs: 8, spo2: 88 } });
    const cannula = run(drowsy, 2, ['o2-nc']);
    expect(cannula.vitals.spo2).toBe(92);
    expect(last(cannula)).toBe('GCS 8 or less: the patient cannot protect the airway — position, suction, and prepare to manage it.');
    // once the airway is secured that warning is not repeated
    expect(last(run(fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { gcs: 3, spo2: 88, rr: 12 } }), 2, ['airway', 'o2-nrb']))).toBe('Non-rebreather at 15 L/min. SpO₂ 93%.');
    // breathing well: as before
    expect(run(fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { spo2: 90 } }), 2, ['o2-nc']).vitals.spo2).toBe(94);
  });

  it('"compressions go on" only once the learner has given them in this arrest', () => {
    const sc = arrest('ed', 7);
    const lines: Record<string, string> = {
      'calcium-chloride': 'Calcium chloride 1 g pushed and flushed', 'sodium-bicarbonate': 'Sodium bicarbonate 50 mEq pushed and flushed',
      'magnesium-sulfate': 'Magnesium sulfate 2 g pushed', dextrose: 'Dextrose 25 g pushed', alteplase: 'Alteplase 50 mg IV push',
      transfuse: 'Packed red cells running in fast',
    };
    for (const [id, text] of Object.entries(lines)) {
      expect(last(run(sc, 7, [id])), id).toBe(`${text}.`);
      expect(last(run(sc, 7, ['cpr', id])), id).toBe(`${text}; compressions go on.`);
    }
  });

  it('alteplase in an arrest from a PE is a bolus, not the 2-hour infusion', () => {
    const s = run(arrest('ed', 7), 7, ['cpr', 'alteplase']);
    expect(s.flags.lytic).toBeDefined();
    expect(s.flags.alteplase).toBeDefined();
    expect(last(run(fixture({ setting: 'ed', role: 7, rhythm: SINUS }), 7, ['iv', 'alteplase']))).toBe('Alteplase running: 100 mg over 2 hours.');
  });

  it('the IV amiodarone push in pre-excited AF drives the rate up, as the other nodal blockers do', () => {
    const sc = fixture({ setting: 'field', role: 2, rhythm: { profile: 'af-wpw', hr: 210 } });
    const s = run(sc, 2, ['iv', 'amio-arrest']);
    expect(s.rhythm).toEqual({ profile: 'af-wpw', hr: 235 });
    expect(s.log.slice(-2).map((l) => l.text)).toEqual(['Amiodarone 300 mg IV push.', 'The complexes come faster and wider.']);
  });
});

describe('the bag-mask on a patient with a pulse', () => {
  it('an awake patient who breathes well pushes it away; one who breathes too slowly is assisted', () => {
    const fine = fixture({ setting: 'field', role: 1, rhythm: SINUS });
    const pushed = run(fine, 1, ['bvm']);
    expect(last(pushed)).toMatch(/pushes the mask away/);
    expect(pushed.flags.ventilated).toBeUndefined();
    const slow = fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: { rr: 6, gcs: 12 } });
    const assisted = run(slow, 1, ['bvm']);
    expect(last(assisted)).toBe('Assisting each breath with the bag-mask, about 1 every 6 seconds; chest rising.');
    expect(assisted.flags.ventilated).toBeDefined();
  });
});

describe('the patient\'s own nitroglycerin (the EMT)', () => {
  const sc = fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: { pain: 6, sbp: 150 }, extra: { facts: { ownNitro: 'Her own spray, in date.' } } });

  it('repeats up to 3 doses, each said as another; never for a patient too drowsy to take it', () => {
    expect(INTERVENTION_BY_ID['nitro-assist']).toMatchObject({ repeatable: true, maxTimes: 3 });
    expect(INTERVENTION_BY_ID['nitro-assist'].detail).toMatch(/^0\.4 mg \(the patient's own\), every 5 min, max 3, with a blood pressure before each — per protocol \/ medical direction; not with a systolic under 90, a rate under 50 or over 100, or a PDE-5 inhibitor or riociguat$/);
    const s = run(sc, 1, ['nitro-assist', 'nitro-assist']);
    expect(s.log.some((l) => l.text === 'Another of the patient\'s own nitroglycerin under the tongue.')).toBe(true);
    expect(unavailableReason(sc, run(sc, 1, ['nitro-assist', 'nitro-assist', 'nitro-assist']), 'nitro-assist')).toBe('Maximum 3 doses');
    const drowsy = fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: { gcs: 10 }, extra: { facts: { ownNitro: 'Her own spray.' } } });
    const refused = tryAct(drowsy, start(drowsy, 1), 'nitro-assist');
    expect(refused.minute).toBe(0);
    expect(last(refused)).toBe('The patient must be awake enough to take their own nitroglycerin under the tongue.');
    const vf = withFlags('field', 1, [], { rhythm: VF, pulse: false, extra: { facts: { ownNitro: 'Her own spray.' } } });
    expect(tryAct(vf, start(vf, 1), 'nitro-assist').counts['nitro-assist']).toBeUndefined();
  });
});

describe('the P2Y12 loading dose names the agent', () => {
  const ed = (problems: Problem[] = [], flags: string[] = []) => withFlags('ed', 7, flags, { rhythm: { profile: 'anterior-stemi', hr: 90 }, problems });
  const agent = (sc: Scenario) => last(run(sc, 7, ['p2y12']));

  it('ticagrelor by default; clopidogrel with a lytic, after an intracranial hemorrhage or with an oral anticoagulant', () => {
    expect(agent(ed())).toBe('P2Y12 loading dose: ticagrelor 180 mg.');
    expect(agent(ed([], ['lytic']))).toBe('P2Y12 loading dose: clopidogrel 300 mg (75 mg, no load, over 75) — the only P2Y12 inhibitor with a fibrinolytic.');
    expect(agent(ed(['intracranial-hemorrhage']))).toMatch(/^P2Y12 loading dose: clopidogrel 600 mg — ticagrelor and prasugrel are contraindicated after an intracranial hemorrhage\.$/);
    expect(agent(ed(['oral-anticoagulant']))).toMatch(/^P2Y12 loading dose: clopidogrel 600 mg/);
    // the lab's cangrelor running: ticagrelor (a thienopyridine waits for the infusion to end)
    expect(last(run(withFlags('cathlab', 5, ['cangrelor']), 5, ['p2y12']))).toBe('P2Y12 loading dose: ticagrelor 180 mg — clopidogrel or prasugrel would wait until the cangrelor infusion ends.');
  });
});

describe('the cath lab\'s blocks', () => {
  it('a femoral closure device needs a femoral sheath', () => {
    const radial = withFlags('cathlab', 5, ['access']);
    const s = tryAct(radial, start(radial, 5), 'closure-device');
    expect(s.minute).toBe(0);
    expect(last(s)).toBe('There is no femoral arterial sheath to close: a radial sheath comes out with a radial band (hemostasis).');
    expect(run(withFlags('cathlab', 5, ['access', 'femoral']), 5, ['closure-device']).flags.closure).toBeDefined();
  });

  it('the radial cocktail needs a radial sheath; only an awake patient says it burns', () => {
    const none = withFlags('cathlab', 4, []);
    expect(last(tryAct(none, start(none, 4), 'radial-cocktail'))).toBe('The cocktail goes through a radial sheath, against radial spasm: there is no radial sheath in.');
    const femoral = withFlags('cathlab', 4, ['access', 'femoral']);
    expect(tryAct(femoral, start(femoral, 4), 'radial-cocktail').counts['radial-cocktail']).toBeUndefined();
    const radial = withFlags('cathlab', 4, ['access']);
    expect(last(run(radial, 4, ['radial-cocktail']))).toBe('"Ooh, that burns up my arm."');
    const drowsy = withFlags('cathlab', 4, ['access'], { vitals: { gcs: 10 } });
    expect(run(drowsy, 4, ['radial-cocktail']).log.some((l) => l.who === 'patient')).toBe(false);
    // the IV adenosine for FFR too
    expect(run(withFlags('cathlab', 4, ['iv'], { vitals: { gcs: 10 } }), 4, ['adenosine-iv-ffr']).log.some((l) => l.who === 'patient')).toBe(false);
  });

  it('hemostasis needs a sheath, and no wire left in the coronary; the femoral line waits for the ACT', () => {
    const none = withFlags('cathlab', 4, []);
    expect(last(tryAct(none, start(none, 4), 'hemostasis'))).toBe('There is no sheath in yet.');
    const wired = withFlags('cathlab', 4, ['access', 'wired']);
    expect(last(tryAct(wired, start(wired, 4), 'hemostasis'))).toBe('Not yet: a wire is still in the coronary.');
    expect(run(withFlags('cathlab', 4, ['access', 'wired', 'final-angio']), 4, ['hemostasis']).flags.hemostasis).toBeDefined();
    expect(last(run(withFlags('cathlab', 4, ['access', 'femoral']), 4, ['hemostasis']))).toMatch(/^Femoral sheath out once the ACT is under about 170–180 s \(or closed with a device\); firm pressure for 15–20 minutes/);
  });

  it('the balloon over a perforation goes in over the wire; the tech opens and preps it', () => {
    expect(INTERVENTION_BY_ID['balloon-tamponade'].roles).toEqual([3, 5]);
    const unwired = withFlags('cathlab', 5, ['access', 'guide']);
    expect(last(tryAct(unwired, start(unwired, 5), 'balloon-tamponade'))).toBe('Wire the vessel first: the balloon goes in over the coronary wire.');
    expect(run(withFlags('cathlab', 5, ['access', 'guide', 'wired']), 5, ['balloon-tamponade']).flags['balloon-tamponade']).toBeDefined();
    const tech = run(withFlags('cathlab', 3, []), 3, ['balloon-tamponade']);
    expect(last(tech)).toBe('Balloon opened and prepped for the operator, sized to the vessel.');
    expect(tech.flags['balloon-tamponade-ready']).toBeDefined();
  });

  it('the pressure wire is equalized at the guide tip: a guide first', () => {
    const noGuide = withFlags('cathlab', 5, ['access']);
    expect(last(tryAct(noGuide, start(noGuide, 5), 'ffr-equalize'))).toBe('Engage a guide first: the pressure wire is equalized at its tip.');
    const tech = withFlags('cathlab', 3, ['access']);
    expect(last(tryAct(tech, start(tech, 3), 'ffr-equalize'))).toBe('There is no guide engaged yet.');
    expect(run(withFlags('cathlab', 5, ['access', 'guide']), 5, ['ffr-equalize']).flags.equalized).toBeDefined();
  });

  it('raising the legs after a femoral puncture tilts the table; the CT line names the sheath only while it is in', () => {
    expect(run(withFlags('cathlab', 4, ['access', 'femoral']), 4, ['legs-up']).log.some((l) => l.text === 'Bed tilted head-down (Trendelenburg), the punctured hip kept straight.')).toBe(true);
    expect(run(withFlags('cathlab', 4, ['access']), 4, ['legs-up']).log.some((l) => l.text === 'Lying flat with the legs raised.')).toBe(true);
    const ct = (flags: string[]) => run(withFlags('cathlab', 5, flags), 5, ['ct-urgent']).log.find((l) => /^Scanned and back/.test(l.text))!.text;
    expect(ct(['access'])).toMatch(/the sheath secured\.$/);
    expect(ct(['access', 'hemostasis'])).toMatch(/the access site checked\.$/);
  });
});

describe('repeatable lines', () => {
  it('neuro, capnography, pacing and the echo can be repeated; the radio report twice, the 12-lead transmission three times', () => {
    expect(INTERVENTION_BY_ID.neuro.repeatable).toBe(true);
    expect(INTERVENTION_BY_ID.capno.repeatable).toBe(true);
    expect(INTERVENTION_BY_ID.pace.repeatable).toBe(true);
    expect(INTERVENTION_BY_ID.echo).toMatchObject({ repeatable: true, maxTimes: 3 });
    expect(INTERVENTION_BY_ID.notify).toMatchObject({ repeatable: true, maxTimes: 2 });
    expect(INTERVENTION_BY_ID['ecg-transmit']).toMatchObject({ repeatable: true, maxTimes: 3 });
    expect(INTERVENTION_BY_ID['procedural-sedation']).toMatchObject({ repeatable: true, maxTimes: 2 });
    expect(INTERVENTION_BY_ID.heparin).toMatchObject({ repeatable: true, maxTimes: 3 });
  });

  it('a repeat 12-lead transmission is said as one', () => {
    const sc = fixture({ setting: 'field', role: 1, rhythm: SINUS });
    const s = run(sc, 1, ['ecg12', 'ecg-transmit', 'ecg12-repeat', 'ecg-transmit']);
    expect(s.log.filter((l) => l.who === 'hospital').map((l) => l.text)).toEqual(['ECG received; the physician is reviewing it.', 'Repeat 12-lead received; the physician is reviewing it.']);
  });

  it('the pads already pacing need nothing more turned on', () => {
    const sc = fixture({ setting: 'field', role: 2, rhythm: { profile: 'third-degree-avb', hr: 34 } });
    const paced = run(sc, 2, ['pace']);
    expect(paced.rhythm.profile).toBe('tcp');
    const again = tryAct(sc, paced, 'pace');
    expect(again.minute).toBe(paced.minute);
    expect(last(again)).toBe('The pads are already pacing at 70.');
  });

  it('a second dose of procedural sedation is a top-up', () => {
    const sc = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'svt', hr: 180 } });
    const s = run(sc, 7, ['monitor', 'iv', 'procedural-sedation', 'procedural-sedation']);
    expect(s.log.filter((l) => /^Etomidate/.test(l.text)).map((l) => l.text.split(':')[0])).toEqual(['Etomidate 0.15 mg/kg IV', 'Etomidate 0.05 mg/kg top-up IV']);
    expect(INTERVENTION_BY_ID['procedural-sedation'].detail).toMatch(/^etomidate 0\.1–0\.15 mg\/kg IV \(or propofol 0\.5–1 mg\/kg with a normal pressure — not with a low one: it drops the pressure; with a low pressure a reduced dose of etomidate or ketamine\), titrated/);
  });

  it('another heparin bolus is said as one; a low ACT sets the time it was low', () => {
    const lab = withFlags('cathlab', 4, ['iv']);
    const s = run(lab, 4, ['act', 'heparin', 'act', 'heparin']);
    expect(s.log.filter((l) => /heparin bolus given/i.test(l.text)).map((l) => l.text)).toEqual(['Heparin bolus given (weight-based).', 'Another heparin bolus given (weight-based).']);
    expect(s.timers.actLowAt).toBe(0);
    const ed = interventionsFor(7, 'ed').find((i) => i.id === 'heparin')!.detail!;
    expect(ed).toMatch(/^weight-based: 60 U\/kg \(max 4,000 U\), then 12 U\/kg\/h \(max 1,000 U\/h\) for ACS; for a pulmonary embolism 80 U\/kg, then 18 U\/kg\/h; the cath lab tops it up for PCI — not with heparin-induced thrombocytopenia, active bleeding or a possible aortic dissection$/);
  });
});

describe('the patient\'s devices on the pads', () => {
  it('with an LVAD the pads go clear of the pump and the driveline', () => {
    const lvad = fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { sbp: 84, dbp: 72 }, lvad: true });
    expect(last(run(lvad, 2, ['pads']))).toBe('Pads on, clear of the pump and the driveline.');
  });

  it('with a pacemaker or ICD the pads stay 8 cm from it, and it is checked after a shock or pacing', () => {
    const device = (rhythm = SINUS, pulse = true) => fixture({ setting: 'field', role: 2, rhythm, pulse, problems: ['implanted-device'] });
    expect(last(run(device(), 2, ['pads']))).toBe('Pads on: anterior–lateral, at least 8 cm from the device (or front-and-back); check it afterwards.');
    expect(last(run(fixture({ setting: 'field', role: 2, rhythm: SINUS }), 2, ['pads']))).toBe('Pads on: anterior–lateral.');
    const shocked = run(device(VF, false), 2, ['defib']);
    expect(shocked.log.some((l) => /^Pads at least 8 cm from the device \(or front-and-back\); the device to be checked afterwards\.$/.test(l.text))).toBe(true);
    const paced = run(device({ profile: 'third-degree-avb', hr: 34 }), 2, ['pace']);
    expect(paced.log.some((l) => /the device to be checked afterwards/.test(l.text))).toBe(true);
  });
});

describe('the poison center and a stimulant', () => {
  it('a case that lists stimulant toxicity gets the specialist\'s questions, not "no poisoning"', () => {
    const sc = fixture({ setting: 'field', role: 2, rhythm: { profile: 'sinus-tachycardia', hr: 130 }, problems: ['sympathomimetic-toxicity'] });
    expect(last(run(sc, 2, ['poison-control']))).toMatch(/^Poison center: "What was taken, how much, and when\?/);
  });
});

describe('a reassessment shows the pressure only when its words do', () => {
  it('the default line prints it (flag bp); a case answer with no pressure in it sets none', () => {
    const plain = fixture({ setting: 'field', role: 2, rhythm: SINUS });
    expect(run(plain, 2, ['reassess']).flags.bp).toBeDefined();
    const faint = fixture({ setting: 'field', role: 2, rhythm: SINUS, extra: { respond: { reassess: () => ({ say: [['you', 'She is slumped and gray; after 15 seconds she comes round.']] }) } } });
    expect(run(faint, 2, ['reassess']).flags.bp).toBeUndefined();
    const own = fixture({ setting: 'field', role: 2, rhythm: SINUS, extra: { respond: { reassess: () => ({ say: [['you', 'Right arm BP 152/88 · pulse 80']] }) } } });
    expect(run(own, 2, ['reassess']).flags.bp).toBeDefined();
  });
});

describe('the lab defaults: the ACT with bivalirudin, the hemodynamic runs in an arrest, sitting up on the table', () => {
  const lab = (flags: string[], over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({
    setting: 'cathlab', role: 5, rhythm: SINUS, ...over,
    extra: { events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }] },
  });

  it('the ACT reads high with bivalirudin running, and sets no low-ACT timer: a heparin bolus on top of it is unguided', () => {
    const s = run(lab(['iv']), 5, ['bivalirudin', 'act']);
    expect(last(s)).toBe('ACT 330 s with the bivalirudin running.');
    expect(s.timers.actLowAt).toBeUndefined();
    expect(run(lab(['iv']), 5, ['act']).timers.actLowAt).toBe(0);
  });

  it('no LVEDP or right heart run during CPR', () => {
    const vf = lab(['iv', 'access', 'venous'], { rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    for (const id of ['lvedp', 'rhc']) {
      const s = perform(vf, start(vf, 5), id);
      expect(s.counts[id], id).toBeUndefined();
      expect(last(s), id).toBe('Not during CPR: no hemodynamic run in an arrest — the pressures mean nothing without a heartbeat of its own.');
    }
    expect(run(lab(['access', 'venous']), 5, ['lvedp', 'rhc']).flags).toMatchObject({ lvedp: expect.any(Number), rhc: expect.any(Number) });
  });

  it('sitting up: refused after a femoral puncture (the hip stays straight); on the table the head is raised and the legs stay on it', () => {
    const femoral = lab(['access', 'femoral']);
    const refused = perform(femoral, start(femoral, 5), 'sit-up');
    expect(refused.counts['sit-up']).toBeUndefined();
    expect(last(refused)).toMatch(/^Not after a femoral puncture: the hip stays straight/);
    const closed = lab(['access', 'femoral', 'hemostasis']);
    expect(perform(closed, start(closed, 5), 'sit-up').counts['sit-up']).toBeUndefined();
    const radial = run(lab(['access']), 5, ['sit-up']);
    expect(last(radial)).toBe('Head of the table raised as far as it goes, the legs kept on the table.');
    expect(radial.flags['sat-up']).toBeDefined();
    expect(last(run(fixture({ setting: 'ed', role: 7, rhythm: SINUS }), 7, ['sit-up']))).toBe('Sitting upright, the legs hanging down.');
  });
});
