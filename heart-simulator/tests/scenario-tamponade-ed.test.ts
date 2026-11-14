/**
 * Cardiac tamponade with shock in the emergency department (setting 'ed'): the ER nurse assesses, escalates and carries out
 * the computer ED physician's orders around a bedside drain; the ER doctor examines, scans, fills and drains her, and admits
 * her to the CCU. The case is imported from its own file: it is registered in scenarios/index.ts by the lead.
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, answerRead, criticalsFor, perform, review, start, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edTamponade as sc } from '@/lib/sim/scenario/scenarios/edTamponade';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { ROLE_SETTING } from '@/store/useAppStore';
import { monitorVitals, staleEtco2 } from '@/store/useSimStore';
import { runScenario } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const rn = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 6, steps, undefined, reads);
const md = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 7, steps, undefined, reads);
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const has = (s: SimState, flag: string) => flag in s.flags;
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const fix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState, label: RegExp) => fix(s).some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => fix(s).find((t) => label.test(t.label))?.kind === 'late';
const done = (s: SimState, label: RegExp) => review(sc, s.ended ? s : stop(s)).wentWell.some((t) => label.test(t.label));
/** Reassess until a condition holds (or the case ends), reading any 12-lead the computer nurse records on the way */
function until(s: SimState, ok: (x: SimState) => boolean, max = 30): SimState {
  for (let i = 0; i < max && !ok(s) && !s.ended; i++) {
    s = perform(sc, s, 'reassess');
    while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
  }
  return s;
}

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  6: ['triage', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'notify-physician', 'iv', 'labs', 'ecg12', 'sample', 'fluid', 'pads',
    'notify-physician', 'pressor', 'reassess', 'notify-physician', 'vitals', 'reassess', 'handoff'],
  7: ['perfusion', 'lungs', 'sample', 'pocus', 'fluid', 'pericardiocentesis', 'consult-cardiology', 'admit', 'handoff'],
};

/** The nurse's run up to the physician's scan and his bolus order (the 12-lead recorded and read) */
const RN_TO_FLUID_ORDER = IDEAL[6].slice(0, IDEAL[6].indexOf('ecg12') + 1);
/** …up to her report of the falling pressure, and his vasopressor order */
const RN_TO_PRESSOR_ORDER = IDEAL[6].slice(0, IDEAL[6].indexOf('pressor'));
/** …up to the needle going in, with the extra beats on the monitor */
const RN_TO_NEEDLE = IDEAL[6].slice(0, IDEAL[6].indexOf('reassess') + 1);
/** The doctor's run up to the drain: examined, history, scanned, a bolus in */
const MD_TO_DRAIN = IDEAL[7].slice(0, IDEAL[7].indexOf('pericardiocentesis'));
/** The ER doctor's start: the computer nurse has the monitor, oxygen, lines and labs on at minute 1 */
const MD_START = ['perfusion', 'lungs'];

/** The nurse gives nitroglycerin twice: the pressure crashes and she arrests */
const RN_NITRO_ARREST = ['triage', 'monitor', 'iv', 'nitro', 'nitro'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bPEA\b|asystole|pulseless electrical|tamponade|effusion|pericard|alternans|low voltage|PVC|premature/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis|favour/i;
const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];

/** Every run the tests play, for the checks on voices, spelling and the monitor */
const RUNS: [6 | 7, string[]][] = [
  [6, IDEAL[6]], [7, IDEAL[7]], [6, [...RN_NITRO_ARREST, 'epinephrine', 'cpr', ...R(4), 'handoff']],
  [6, [...RN_TO_NEEDLE, 'vitals', ...R(3)]],
  [6, ['triage', 'monitor', 'iv', 'cpap', 'metoprolol', 'midazolam', 'legs-up', 'vagal', ...R(4)]],
  [7, [...MD_START, 'rsi', 'cpr', 'pericardiocentesis', ...R(2)]], [7, [...MD_START, 'pressor', 'ct-urgent']],
  [7, [...MD_START, ...R(12), 'cpr', 'pocus', 'pericardiocentesis', ...R(2)]],
  [7, [...MD_START, 'pocus', 'nitro', 'cpap', 'diltiazem', 'procedural-sedation', 'bvm', ...R(6)]],
];

describe('Tamponade in the ED — the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to what exists', () => {
    expect(sc).toMatchObject({ id: 'tamponade-ed', setting: 'ed', roles: [6, 7] });
    for (const role of sc.roles) expect(ROLE_SETTING[role]).toBe('ed');
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('tamponade');
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      expect(h.roles?.every((r) => sc.roles.includes(r)), h.id).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      expect(criticalsFor(sc, role).length, `role ${role}`).toBeGreaterThan(5);
      for (const c of criticalsFor(sc, role)) {
        const actions = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(actions.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // the built-in rule for the ER doctor's needle reads it
    expect(sc.problems).toEqual(['tamponade']);
    // the real echo the doctor's first scan shows exists, and its alt text gives nothing away
    expect(sc.images).toEqual({ pocus: 'tamponade-echo' });
    expect(CATH_IMAGES['tamponade-echo']?.alt).toMatch(/four-chamber/);
    expect(CATH_IMAGES['tamponade-echo']?.alt).not.toMatch(/effusion|tamponade/i);
  });

  it('keeps the physician\'s decisions and procedures from the ER nurse', () => {
    const nurse = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    for (const id of ['pocus', 'pericardiocentesis', 'rsi', 'airway', 'ct-urgent', 'procedural-sedation', 'consult-cardiology', 'call-surgery', 'admit', 'transfer', 'central-line']) {
      expect(nurse.has(id), id).toBe(false);
    }
    expect(unavailableReason(sc, start(sc, 6), 'pericardiocentesis')).toBe('Outside your scope');
    // the doctor's run has nothing that is the nurse's alone
    expect(unavailableReason(sc, start(sc, 7), 'triage')).toBe('Outside your scope');
  });

  it('nothing the learner sees before the workup names the diagnosis — but the story is there', () => {
    const opening = [sc.title, sc.summary, ...Object.values(sc.briefing).flat().map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/tamponade|effusion|pericard|fluid around|Beck|pulsus|alternans|drain/i);
    expect(opening).toMatch(/58-year-old woman/);
    expect(opening).toMatch(/breast cancer/);
    expect(opening).toMatch(/nearly fainted/);
    // the hints that come before the scan say nothing about what it shows
    for (const role of [6, 7] as const) {
      const first = criticalsFor(sc, role).filter((c) => !c.applies).slice(0, role === 6 ? 9 : 3);
      for (const c of first) expect(`${c.label} ${c.why}`, c.id).not.toMatch(/tamponade|effusion|pericard|drain|needle/i);
    }
  });

  it('each role is briefed for its own part, in the department\'s voices', () => {
    expect(start(sc, 6).log.some((l) => /You are the triage nurse, and she will be your patient: .*on the physician's orders/.test(l.text))).toBe(true);
    expect(start(sc, 7).log.some((l) => /You are the ED physician: the diagnosis, the orders and the procedures are yours/.test(l.text))).toBe(true);
    for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(line[0]);
    for (const [role, steps] of RUNS) for (const l of runScenario(sc, role, steps).log) expect(NOT_IN_ED, `role ${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
  });

  it('no monitor line names the rhythm or the diagnosis: the learner reads the tracing', () => {
    for (const [role, steps] of RUNS) {
      for (const l of runScenario(sc, role, steps).log) if (l.who === 'monitor') expect(l.text, `role ${role}: ${l.text}`).not.toMatch(GIVEAWAY);
    }
  });

  it('every rhythm a run reaches is a real ECG profile', () => {
    for (const [role, steps] of RUNS) {
      runScenario(sc, role, steps, (s) => expect(resolveProfile(s.rhythm.profile).id, `role ${role}: ${s.rhythm.profile}`).toBe(s.rhythm.profile));
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    expect(sc.teaching.join(' ')).not.toMatch(BRITISH);
    for (const c of [...criticalsFor(sc, 6), ...criticalsFor(sc, 7)]) expect(`${c.label} ${c.why}`).not.toMatch(BRITISH);
    for (const h of sc.harms) expect(h.text).not.toMatch(BRITISH);
    for (const [role, steps] of RUNS) for (const l of runScenario(sc, role, steps).log) expect(l.text).not.toMatch(BRITISH);
  });

  it('teaches Beck\'s triad, the pulsus, the scan, the bolus, what to hold, the drain and the arrest', () => {
    const t = sc.teaching.join(' ');
    expect(t).toMatch(/Beck's triad/);
    expect(t).toMatch(/more than 10 mmHg/);
    expect(t).toMatch(/low voltage and electrical alternans/);
    expect(t).toMatch(/right ventricle collapsing in early diastole/);
    expect(t).toMatch(/500 mL fluid bolus.*Sagristà-Sauleda/);
    expect(t).toMatch(/diuretics \(both not recommended in tamponade: 2015 ESC\)/);
    expect(t).toMatch(/induction and the ventilator can arrest her/);
    expect(t).toMatch(/Do not send a patient in tamponade with shock to the CT scanner/);
    expect(t).toMatch(/ultrasound-guided pericardiocentesis/);
    expect(t).toMatch(/Ts of PEA/);
  });
});

describe('the ideal runs end by themselves with full marks', () => {
  for (const role of [6, 7] as const) {
    it(`role ${role}`, () => {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      expect(s.log.some((l) => l.text === 'All critical interventions are done — scenario complete.')).toBe(true);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      // she goes to the CCU drained: the pressure is back, the rate down, the alternans gone
      expect(has(s, 'drained')).toBe(true);
      expect(s.vitals).toMatchObject({ sbp: 116, dbp: 74 });
      expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 106 });
      expect(has(s, 'admit')).toBe(true);
    });
  }

  it('the 12-lead is read as low voltage with alternans by both roles; the doctor also reads the scan', () => {
    const nurse = rn([...RN_TO_FLUID_ORDER, 'read:low-voltage', ...IDEAL[6].slice(RN_TO_FLUID_ORDER.length)], 'manual');
    expect(nurse.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'low-voltage', verdict: 'correct' })]);
    expect(review(sc, nurse).percent).toBe(100);
    const i = IDEAL[7].indexOf('pocus') + 1;
    const doctor = md([...IDEAL[7].slice(0, i), 'read:clin-tamponade', 'read:low-voltage', ...IDEAL[7].slice(i)], 'manual');
    expect(doctor.reads).toEqual([
      expect.objectContaining({ kind: 'clinical', answer: 'clin-tamponade', verdict: 'correct' }),
      expect.objectContaining({ kind: 'ecg', answer: 'low-voltage', verdict: 'correct' }),
    ]);
    expect(review(sc, doctor).percent).toBe(100);
    // a STEMI read costs points, and the explanation says why it is not one
    const wrong = md([...IDEAL[7].slice(0, i), 'read:clin-tamponade', 'read:stemi-anterior'], 'manual');
    expect(ids(wrong)).toEqual(['misread-2']);
    expect(said(wrong)).toMatch(/No ST elevation: it does not meet STEMI criteria/);
  });
});

describe('the ER nurse', () => {
  it('triages ESI 1, finds the pulsus with a manual cuff (the NIBP cannot), and the neck veins, heart sounds and lungs', () => {
    const s = rn(['triage', 'monitor', 'vitals', 'perfusion', 'lungs']);
    expect(has(s, 'esi-1')).toBe(true);
    expect(said(s)).toMatch(/BP 84\/68 by hand — the sounds come and go with her breathing: .*a fall of 14 mmHg each time she breathes in/);
    expect(said(s)).toMatch(/neck veins are distended up to the angle of the jaw/);
    expect(said(s)).toMatch(/heart sounds are faint and distant/);
    const nibp = rn(['triage', 'monitor', 'nibp']);
    expect(nibp.log.at(-1)!.text).toBe('NIBP 84/68 mmHg.');
    expect(missed(nibp, /^A manual blood pressure/)).toBe(true);
  });

  it('her SBAR says only what she has found; the physician comes at once, scans and orders the bolus', () => {
    expect(said(rn(['notify-physician']))).not.toMatch(/neck veins|clear lungs|breathes in|cancer/);
    const s = rn(RN_TO_FLUID_ORDER);
    expect(said(s)).toMatch(/SBAR: .*distended neck veins, clear lungs and faint heart sounds, a systolic that falls 14 mmHg each time she breathes in/);
    expect(s.flags['md-bedside']).toBe(5);
    expect(s.log.some((l) => l.who === 'physician' && /right ventricle collapses as it tries to fill/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'physician' && /500 mL of saline, fast, through a pressure bag/.test(l.text))).toBe(true);
  });

  it('a nurse who never calls him: the charge nurse sends him at minute 6, and the call is missed', () => {
    const s = rn(['triage', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'iv', 'labs']);
    expect(s.flags['md-bedside']).toBeGreaterThanOrEqual(6);
    expect(said(s)).toMatch(/Next time call me the moment a patient like this rolls in/);
    expect(missed(s, /^Get the ED physician to the bedside now/)).toBe(true);
  });

  it('the bolus: given on the order (or before it, as the department allows); never given, another nurse hangs it and the item is missed', () => {
    const ordered = rn([...RN_TO_FLUID_ORDER, 'fluid']);
    expect(ids(ordered)).toEqual([]);
    expect(ordered.vitals).toMatchObject({ sbp: 92, dbp: 71 });
    expect(done(ordered, /^A fluid bolus, as ordered/)).toBe(true);
    // a bolus for a systolic of 84 before the physician has seen her is no mistake, and counts once he orders it
    const early = rn(['triage', 'monitor', 'iv', 'fluid', 'notify-physician', ...R(2)]);
    expect(ids(early)).toEqual([]);
    expect(done(early, /^A fluid bolus, as ordered/)).toBe(true);
    const never = rn([...RN_TO_FLUID_ORDER, ...R(2)]);
    expect(said(never)).toMatch(/The other nurse is hanging the bolus/);
    expect(has(never, 'fluid')).toBe(true);
    expect(missed(never, /^A fluid bolus, as ordered/)).toBe(true);
  });

  it('the set-up: pads on, clear of the needle\'s way in, before the needle; never done, the physician puts them on and the item is missed', () => {
    const s = rn([...RN_TO_FLUID_ORDER, 'sample', 'fluid']);
    expect(s.log.some((l) => l.who === 'physician' && /the pads on her if they're not on yet — below her right collarbone and on her left side, clear of where my needle goes/.test(l.text))).toBe(true);
    const ready = perform(sc, s, 'pads');
    // anterior–lateral: front-and-back pads would put the front one over the left parasternal window the needle uses
    expect(ready.log.some((l) => /Pads on: one below the right collarbone, the other on her left side below the armpit \(anterior–lateral\)/.test(l.text))).toBe(true);
    expect(said(ready)).not.toMatch(/front and back|anterior–posterior/);
    expect(done(ready, /^Set up for the drain/)).toBe(true);
    // pads on early count once he asks
    expect(done(rn(['triage', 'monitor', 'pads', ...RN_TO_FLUID_ORDER.slice(2), 'sample', 'fluid']), /^Set up for the drain/)).toBe(true);
    const never = rn([...RN_TO_FLUID_ORDER, 'sample', 'fluid', ...R(2)]);
    expect(said(never)).toMatch(/I'm putting the pads on her myself/);
    expect(has(never, 'setup-ready')).toBe(true);
    expect(missed(never, /^Set up for the drain/)).toBe(true);
  });

  it('her pressure slides at minute 11: she reports it, and the physician orders a vasopressor, which she starts', () => {
    const s = rn(RN_TO_PRESSOR_ORDER);
    expect(s.flags.worse).toBeGreaterThanOrEqual(11);
    expect(s.vitals).toMatchObject({ sbp: 82, dbp: 67 });
    expect(s.log.at(-1)!.text).toMatch(/Start norepinephrine at 0\.05 micrograms per kilo per minute/);
    const given = perform(sc, s, 'pressor');
    expect(ids(given)).toEqual([]);
    expect(given.vitals).toMatchObject({ sbp: 96, dbp: 75 });
    for (const label of [/^Report the falling pressure/, /^A vasopressor as a bridge, as ordered/]) expect(done(given, label), String(label)).toBe(true);
    // push-dose epinephrine answers the order as well
    const push = rn(IDEAL[6].map((id) => (id === 'pressor' ? 'push-epi' : id)));
    expect(review(sc, push).percent).toBe(100);
  });

  it('push-dose epinephrine is a bridge: it wears off after a few minutes, pushes in a row hold rather than stack, an infusion takes over', () => {
    const pushed = md([...MD_START, 'sample', 'push-epi']);
    expect(pushed.vitals).toMatchObject({ sbp: 96, dbp: 74 });
    // six minutes on, with no infusion behind it, she slides back to where it found her
    const worn = until(pushed, (x) => x.fired.includes('push-wears-off-1'));
    expect(worn.minute - pushed.performed.at(-1)!.minute).toBeGreaterThan(6);
    expect(worn.vitals).toMatchObject({ sbp: 84, dbp: 68 });
    expect(said(worn)).toMatch(/The push-dose epinephrine has worn off/);
    // a second push while the first still acts holds her there, no higher
    const again = perform(sc, pushed, 'push-epi');
    expect(again.vitals.sbp).toBe(96);
    // the infusion holds what it raises: nothing wears off
    const held = until(perform(sc, pushed, 'pressor'), (x) => x.minute >= pushed.minute + 8, 5);
    expect(held.fired.some((id) => id.startsWith('push-wears-off'))).toBe(false);
    // and after the drain there is nothing for it to wear off from
    const drained = until(md([...MD_TO_DRAIN, 'push-epi', 'pericardiocentesis']), (x) => x.minute >= 20, 8);
    expect(drained.fired.some((id) => id.startsWith('push-wears-off'))).toBe(false);
  });

  it('a push-dose bridge never brings the arrest closer: the crash takes her own pressure, and the push\'s share comes off later', () => {
    const base = ['perfusion', 'lungs', 'sample', 'pocus'];
    const untreated = md([...base, ...R(9)]);
    const arrestAt = untreated.flags.arrest;
    expect(arrestAt).toBeDefined();
    // a push before the crash (at 14.5, or just before it at 15.5): the crash and the push wearing off have both come by
    // minute 21, and she still has a pulse — and she arrests no sooner than with no push at all
    for (const steps of [[...base, 'fluid', ...R(4), 'push-epi'], [...base, ...R(5), 'push-epi']]) {
      const pushed = md(steps);
      const at21 = until(pushed, (x) => x.minute >= 21 || !x.pulse);
      expect(at21.fired, steps.join(' ')).toEqual(expect.arrayContaining(['crash', 'push-wears-off-1']));
      expect(at21.pulse, steps.join(' ')).toBe(true);
      const later = until(pushed, (x) => !x.pulse, 12);
      expect(later.flags.arrest, steps.join(' ')).toBeGreaterThanOrEqual(arrestAt);
    }
  });

  it('a vasopressor before the order is outside her scope; an unreported slide is missed, and the physician orders it anyway', () => {
    expect(ids(rn(['triage', 'monitor', 'iv', 'pressor']))).toEqual(['rn-without-order-pressor']);
    expect(ids(rn(['triage', 'monitor', 'iv', 'push-epi']))).toEqual(['rn-without-order-push-epi']);
    // the pads not on yet, so his needle is not due: two minutes after the slide he orders the bridge himself
    const silent = rn([...RN_TO_FLUID_ORDER, 'sample', 'fluid', 'reassess']);
    expect(missed(silent, /^Report the falling pressure/)).toBe(true);
    expect(silent.flags['asked-rn-pressor']).toBe(silent.flags.worse + 2);
    const never = rn([...RN_TO_PRESSOR_ORDER, ...R(2)]);
    expect(said(never)).toMatch(/I'll start the norepinephrine myself/);
    expect(missed(never, /^A vasopressor as a bridge, as ordered/)).toBe(true);
  });

  it('during the needle: the extra beats on the monitor, called out — he pulls back and drains 650 mL', () => {
    const needle = rn(RN_TO_NEEDLE);
    expect(has(needle, 'needle-in')).toBe(true);
    expect(needle.rhythm.profile).toBe('pvcs');
    expect(needle.log.some((l) => l.who === 'monitor' && /early, wide beats as the needle advances/.test(l.text))).toBe(true);
    const called = perform(sc, needle, 'notify-physician');
    expect(called.log.some((l) => l.who === 'physician' && /Pulling back a couple of millimeters/.test(l.text))).toBe(true);
    expect(has(called, 'drained')).toBe(true);
    expect(said(called)).toMatch(/650 mL off/);
    expect(called.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 106 });
    expect(done(called, /^During the needle: call out the extra beats/)).toBe(true);
    // silent: he sees them himself a minute later, and the item is missed
    const silent = perform(sc, needle, 'vitals');
    expect(said(silent)).toMatch(/Extra beats on the monitor — I'm touching the heart\. Pulling back… Call them out/);
    expect(has(silent, 'drained')).toBe(true);
    expect(missed(silent, /^During the needle: call out the extra beats/)).toBe(true);
    // an antiarrhythmic for the needle's extra beats is wrong, and she has no order for it
    expect(ids(perform(sc, needle, 'lidocaine'))).toEqual(['antiarrhythmic-tamponade-rn']);
  });

  it('after the drain: the pressure rechecked (the pulsus gone); the physician admits her, and the hand-off waits for him', () => {
    const drained = perform(sc, rn(RN_TO_NEEDLE), 'notify-physician');
    const checked = perform(sc, drained, 'vitals');
    expect(checked.log.at(-1)!.text).toMatch(/BP 116\/74 by hand — the sounds no longer come and go with her breathing/);
    expect(done(checked, /^After the drain: recheck the pressure/)).toBe(true);
    const tooSoon = perform(sc, checked, 'handoff');
    expect(tooSoon.counts.handoff).toBeUndefined();
    expect(tooSoon.log.at(-1)!.text).toMatch(/until the ED physician decides where they go/);
    const admitted = until(checked, (x) => has(x, 'dispo'));
    expect(admitted.log.some((l) => l.who === 'physician' && /accepted her to the CCU with the drain in/.test(l.text))).toBe(true);
    expect(admitted.flags.dispo - admitted.flags.drained).toBeGreaterThanOrEqual(3);
    const unchecked = rn([...RN_TO_NEEDLE, 'notify-physician', 'cxr', 'ecg12-repeat', 'troponin-repeat']);
    expect(missed(unchecked, /^After the drain: recheck the pressure/)).toBe(true);
  });

  it('nitroglycerin on the chest pain standing order is a critical error here; a second dose arrests her, and the physician drains her during the CPR', () => {
    const one = rn(['triage', 'monitor', 'iv', 'nitro']);
    expect(ids(one)).toEqual(['nitro-tamponade']);
    expect(one.vitals).toMatchObject({ sbp: 70, dbp: 60 });
    const arrested = rn(RN_NITRO_ARREST);
    expect(arrested.pulse).toBe(false);
    expect(arrested.rhythm.profile).toBe('pea-narrow');
    expect(arrested.log.some((l) => l.who === 'physician' && /start compressions!.*I'm going in with the needle now/.test(l.text))).toBe(true);
    const back = rn([...RN_NITRO_ARREST, 'cpr']);
    expect(back.pulse).toBe(true);
    expect(has(back, 'rosc') && has(back, 'drained')).toBe(true);
    expect(said(back)).toMatch(/Needle in below the xiphoid while you compress/);
    expect(ids(back)).toEqual(['nitro-tamponade']);
    expect(done(back, /^She arrests: high-quality CPR at once/)).toBe(true);
    // no compressions: he drains her anyway after 2 minutes, and the CPR is missed
    const idle = rn([...RN_NITRO_ARREST, 'pads', 'reassess']);
    expect(has(idle, 'drained')).toBe(true);
    expect(missed(idle, /^She arrests: high-quality CPR at once/)).toBe(true);
    // epinephrine in the arrest is on the ACLS protocol; the run ends with the physician's decision and the hand-off
    const handed = rn([...RN_NITRO_ARREST, 'epinephrine', 'cpr', ...R(4), 'handoff']);
    expect(ids(handed)).toEqual(['nitro-tamponade']);
    expect(handed.ended?.reason).toBe('complete');
    expect(has(handed, 'admit')).toBe(true);
  });

  it('a rate or rhythm drug in her PEA: one penalty — the nurse\'s version also says it had no order; lidocaine and the arrest amiodarone need none', () => {
    const arrested = rn(RN_NITRO_ARREST);
    expect(arrested.pulse).toBe(false);
    const added = (id: string) => ids(perform(sc, arrested, id)).slice(arrested.penalties.length);
    for (const drug of ['adenosine6', 'metoprolol', 'diltiazem', 'amio-infusion', 'procainamide']) expect(added(drug), drug).toEqual(['antiarrhythmic-pea-rn']);
    for (const drug of ['amio-arrest', 'lidocaine']) expect(added(drug), drug).toEqual(['antiarrhythmic-pea']);
    expect(sc.harms.find((h) => h.id === 'antiarrhythmic-pea-rn')).toMatchObject({ roles: [6], points: 5, severity: 'major', text: expect.stringMatching(/PEA, with no order/) });
  });

  it('every other trap costs one penalty, the clinical one, which covers the missing order too', () => {
    const at = (id: string) => ids(rn(['triage', 'monitor', 'iv', id]));
    expect(at('cpap')).toEqual(['cpap-tamponade']);
    expect(at('bvm')).toEqual(['bvm-breathing']);
    expect(at('legs-up')).toEqual(['legs-up-orthopnea']);
    expect(at('vagal')).toEqual(['vagal-tamponade']);
    expect(at('metoprolol')).toEqual(['rate-slowing-tamponade-rn']);
    expect(at('diltiazem')).toEqual(['rate-slowing-tamponade-rn']);
    expect(at('amio-infusion')).toEqual(['antiarrhythmic-tamponade-rn']);
    expect(at('procainamide')).toEqual(['antiarrhythmic-tamponade-rn']);
    // the nurse's version weighs at least what the missing order would have
    expect(at('adenosine6')).toEqual(['adenosine-sinus-rn']);
    expect(rn(['triage', 'monitor', 'iv', 'adenosine6']).penalties[0]).toMatchObject({ points: 5, severity: 'major' });
    expect(at('midazolam')).toEqual(['sedative-tamponade-rn']);
    expect(at('fentanyl')).toEqual(['sedative-tamponade-rn']);
    expect(at('heparin')).toEqual(['antithrombotic-tamponade-rn']);
    expect(at('alteplase')).toEqual(['lytic-tamponade']);
    expect(at('epi-im')).toEqual(['epi-im-no-anaphylaxis']);
    expect(at('nitro-high')).toEqual(['nitro-tamponade']);
    // the slow ones drop the pressure: a rate drug takes away the compensation
    const slowed = rn(['triage', 'monitor', 'iv', 'metoprolol']);
    expect(slowed.vitals.sbp).toBeLessThan(70);
    expect(slowed.rhythm.hr).toBe(110);
    // aspirin on the chest pain standing order before anyone knows the cause is no mistake; after the scan it is
    expect(ids(rn(['triage', 'monitor', 'aspirin']))).toEqual([]);
    expect(ids(rn([...RN_TO_FLUID_ORDER, 'aspirin']))).toEqual(['aspirin-tamponade']);
    // a third bolus only fills the sac
    expect(ids(rn([...RN_TO_FLUID_ORDER, 'fluid', 'fluid', 'fluid']))).toEqual(['fluid-overload-tamponade']);
  });
});

describe('the ER nurse — other reasonable orders, and what the drain overtakes (review fixes)', () => {
  it('calls him first: he scans before any line is in, asks for the lines, and orders the bolus once one is in — full marks are still hers', () => {
    const first = rn(['triage', 'notify-physician', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs']);
    expect(first.log.some((l) => l.who === 'physician' && /Get two large-bore lines in her now/.test(l.text))).toBe(true);
    // no order yet: there is nothing to run it through
    expect(has(first, 'asked-rn-fluid')).toBe(false);
    const lined = perform(sc, first, 'iv');
    expect(lined.flags['asked-rn-fluid']).toBe(lined.flags.iv);
    // …then the pads, the labs and the 12-lead; the slide reported, the extra beats called out, the pressure rechecked
    const s = rn(['triage', 'notify-physician', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'iv', 'fluid', 'pads', 'labs', 'ecg12',
      'notify-physician', 'notify-physician', 'sample', 'vitals', 'reassess', 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(ids(s)).toEqual([]);
    expect(review(sc, s).percent).toBe(100);
    // the needle was due as she reported the slide: he went in rather than order a bridge
    expect(has(s, 'asked-rn-pressor')).toBe(false);
    // with no line at all he orders it anyway two minutes after the scan
    const noLine = rn(['triage', 'notify-physician', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'labs', 'sample']);
    expect(noLine.flags['asked-rn-fluid'] - noLine.flags['md-scan']).toBeGreaterThanOrEqual(2);
  });

  it('a call for help brings the physician in, and counts as getting him to the bedside', () => {
    const s = rn(['triage', 'call-help']);
    expect(has(s, 'md-bedside')).toBe(true);
    expect(s.log.at(-1)!.text).toMatch(/Here\. Keep going with what you're doing/);
    expect(done(s, /^Get the ED physician to the bedside now/)).toBe(true);
  });

  it('the bolus another nurse hung counts: hers after it is the second, and a third in all fills only the sac', () => {
    const team = rn([...RN_TO_FLUID_ORDER, ...R(2)]);
    expect(said(team)).toMatch(/The other nurse runs in 500 mL/);
    const second = perform(sc, team, 'fluid');
    expect(second.log.some((l) => /Another 500 mL in — 1000 mL in all/.test(l.text))).toBe(true);
    expect(ids(second)).toEqual([]);
    expect(ids(perform(sc, second, 'fluid'))).toEqual(['fluid-overload-tamponade']);
  });

  it('her 12-lead is hers to read: the needle waits for it to finish, and no 12-lead is taken while the needle is in', () => {
    const ecg = rn(['triage', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'notify-physician', 'iv', 'fluid', 'pads', 'ecg12']);
    // the set-up was ready long enough for the needle, but he waited for the tracing
    expect(ecg.minute - ecg.flags['setup-ready']).toBeGreaterThanOrEqual(2);
    expect(has(ecg, 'needle-in')).toBe(false);
    expect(ecg.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'low-voltage' })]);
    const needle = perform(sc, ecg, 'labs');
    expect(has(needle, 'needle-in')).toBe(true);
    const blocked = perform(sc, needle, 'ecg12-repeat');
    expect(blocked.counts['ecg12-repeat']).toBeUndefined();
    expect(blocked.minute).toBe(needle.minute);
    expect(blocked.log.at(-1)!.text).toMatch(/Not while the needle is in: watch the monitor/);
  });

  it('a vasopressor order the drain overtakes is stood down: no fallback after it, no item, and a dose after it needs a new order', () => {
    const s = rn([...RN_TO_FLUID_ORDER, 'sample', 'fluid', 'pads', 'vitals', 'lungs', 'lungs', 'notify-physician']);
    expect(has(s, 'asked-rn-pressor') && has(s, 'drained')).toBe(true);
    expect(s.flags.drained - s.flags['asked-rn-pressor']).toBeLessThan(2);
    expect(s.log.some((l) => l.who === 'physician' && /Hold the norepinephrine — her pressure's back/.test(l.text))).toBe(true);
    const later = until(s, (x) => has(x, 'dispo'));
    expect(said(later)).not.toMatch(/I'll start the norepinephrine myself/);
    expect(fix(later).some((t) => /^A vasopressor as a bridge/.test(t.label))).toBe(false);
    expect(ids(perform(sc, s, 'pressor'))).toEqual(['rn-without-order-pressor']);
    // and he never orders one with the needle in: the fluid is about to come off
    for (const x of [s, later]) expect(x.flags['asked-rn-pressor'] < (x.flags['needle-in'] ?? Infinity)).toBe(true);
  });

  it('a slide the drain fixes within her 2 minutes is not scored as unreported', () => {
    const s = rn(['triage', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'notify-physician', 'iv', 'fluid', 'pads', 'ecg12', 'labs', 'sample']);
    expect(s.flags.drained - s.flags.worse).toBeLessThan(2);
    expect(fix(s).some((t) => /^Report the falling pressure/.test(t.label))).toBe(false);
  });

  it('a pressure narrowed by a mistake: the pulse vanishes on every breath in — never a small fall that reads as normal', () => {
    const s = rn(['triage', 'monitor', 'iv', 'nitro', 'vitals']);
    expect(s.vitals.sbp - s.vitals.dbp).toBeLessThanOrEqual(10);
    expect(s.log.at(-1)!.text).toMatch(/lost altogether each time she breathes in, all the way down to 60/);
    expect(s.log.at(-1)!.text).not.toMatch(/a fall of \d+ mmHg/);
    expect(said(perform(sc, s, 'notify-physician'))).toMatch(/a pulse that disappears each time she breathes in/);
    // the triage words carry her numbers as they are
    expect(said(rn(['monitor', 'iv', 'nitro', 'triage']))).toMatch(/ESI 1: a pressure of 70\/60 with a pulse of 134/);
  });

  it('after the arrest she comes round over minutes, and what the nurse reports says how she is', () => {
    const back = rn([...RN_NITRO_ARREST, 'cpr', 'notify-physician']);
    expect(back.vitals.gcs).toBeLessThan(13);
    expect(back.log.at(-2)!.text).toMatch(/she is opening her eyes to her name, and the drain is draining/);
    // her husband gives the history while she cannot
    expect(said(perform(sc, back, 'sample'))).toMatch(/Her husband answers for her: "No allergies\. Breast cancer five years ago/);
    const awake = until(back, (x) => x.vitals.gcs >= 14);
    expect(awake.log.some((l) => /She is waking up: eyes open, she knows where she is/.test(l.text))).toBe(true);
    expect(awake.flags.rosc + 4).toBeLessThanOrEqual(awake.minute);
  });

  it('after the drain the tamponade traps are no longer critical — but still not free', () => {
    const drainedRn = until(rn(RN_TO_NEEDLE), (x) => has(x, 'drained'), 1);
    const after = perform(sc, perform(sc, drainedRn, 'notify-physician'), 'nitro');
    expect(ids(after)).toEqual(['nitro-no-indication']);
    expect(ids(perform(sc, perform(sc, drainedRn, 'notify-physician'), 'metoprolol'))).toEqual(['rate-slowing-after-drain']);
  });
});

describe('the ER doctor', () => {
  it('the computer nurse does the nursing and records the 12-lead; the doctor\'s exam finds Beck\'s triad', () => {
    const s = md([...MD_START, 'sample']);
    expect(has(s, 'monitor') && has(s, 'o2') && has(s, 'iv') && has(s, 'labs')).toBe(true);
    expect(said(s)).toMatch(/neck veins are distended/);
    expect(said(s)).toMatch(/No blood thinners/);
    const ecg = md([...MD_START, 'sample', 'reassess']);
    expect(has(ecg, 'ecg12')).toBe(true);
    expect(ecg.reads).toEqual([expect.objectContaining({ answer: 'low-voltage' })]);
    expect(review(sc, stop(ecg)).timings[0]).toMatchObject({ label: 'Door to 12-lead', met: true });
  });

  it('the first scan shows the real echo and asks what it shows; the words are in the explanation', () => {
    const s = md([...MD_START, 'pocus']);
    expect(s.images).toEqual([expect.objectContaining({ id: 'pocus', image: 'tamponade-echo' })]);
    expect(s.reads[0]).toMatchObject({ kind: 'clinical', answer: 'clin-tamponade', verdict: 'correct' });
    expect(said(s)).toMatch(/IVC is 2\.3 cm and does not narrow with breathing/);
    expect(said(s)).toMatch(/right ventricle collapsing in early diastole/);
    // a wrong read costs points
    const wrong = md([...MD_START, 'pocus', 'read:clin-lvoto', 'read:low-voltage'], 'manual');
    expect(ids(wrong)).toEqual(['misread-1']);
    // a second scan is in words, not a second image
    expect(md([...MD_START, 'pocus', 'pocus']).images).toHaveLength(1);
  });

  it('the needle waits for the scan; then a bolus and an ultrasound-guided drain bring the pressure back at once', () => {
    const blind = perform(sc, md(MD_START), 'pericardiocentesis');
    expect(blind.counts.pericardiocentesis).toBeUndefined();
    expect(blind.log.at(-1)!.text).toMatch(/scan the heart first/);
    const filled = md(MD_TO_DRAIN);
    expect(filled.vitals).toMatchObject({ sbp: 92, dbp: 71 });
    const s = perform(sc, filled, 'pericardiocentesis');
    expect(ids(s)).toEqual([]);
    expect(said(s)).toMatch(/18 G needle in-plane under the probe at the left parasternal window.*pigtail drain left in: 650 mL off/);
    expect(said(s)).toMatch(/Fluid sent for cytology/);
    expect(s.vitals).toMatchObject({ sbp: 116, dbp: 74 });
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 106 });
    expect(perform(sc, s, 'vitals').log.at(-1)!.text).toMatch(/a fall of only 4 mmHg/);
    // the 12-lead repeated after the drain is a new tracing: the alternans has gone
    const repeat = perform(sc, s, 'ecg12-repeat');
    expect(repeat.pendingRead).toMatchObject({ kind: 'ecg', answer: 'sinus-tach' });
    expect(repeat.pendingRead!.explain).toMatch(/the electrical alternans has gone/);
  });

  it('a drain with no bolus first, or the history after the needle, misses those items', () => {
    const dry = md([...MD_START, 'sample', 'pocus', 'pericardiocentesis', 'fluid']);
    expect(missed(dry, /^A fluid bolus before the drain/)).toBe(true);
    expect(done(dry, /^Drain it now/)).toBe(true);
    const noHistory = md([...MD_START, 'pocus', 'fluid', 'pericardiocentesis', 'sample']);
    expect(missed(noHistory, /^SAMPLE history: her illnesses and any blood thinners/)).toBe(true);
  });

  it('delay matters: the pressure slides at 11 (and 15 with no fluid), she crashes at 19 and arrests at 23', () => {
    const s = until(md(MD_START), (x) => !x.pulse);
    expect(s.flags.worse).toBeGreaterThanOrEqual(11);
    expect(s.flags['worse-dry']).toBeGreaterThanOrEqual(15);
    expect(s.flags.crashing).toBeGreaterThanOrEqual(19);
    expect(s.flags.arrest).toBeGreaterThanOrEqual(23);
    expect(s.rhythm.profile).toBe('pea-narrow');
    expect(missed(s, /^Drain it now/)).toBe(true);
    expect(missed(s, /^When the pressure falls again/)).toBe(true);
    // the bolus spares her the second slide
    expect(has(until(md(MD_TO_DRAIN), (x) => x.minute >= 16), 'worse-dry')).toBe(false);
  });

  it('when the pressure slides: a vasopressor bridge, or the drain itself within 5 minutes, meets the item', () => {
    const slid = until(md([...MD_START, 'sample']), (x) => has(x, 'worse'));
    expect(slid.vitals.sbp).toBeLessThan(80);
    const bridged = perform(sc, slid, 'pressor');
    expect(done(bridged, /^When the pressure falls again/)).toBe(true);
    expect(bridged.vitals.sbp).toBeGreaterThan(slid.vitals.sbp);
    const drained = md([...MD_START, 'sample', ...R(5), 'pocus', 'fluid', 'pericardiocentesis']);
    expect(drained.flags.worse).toBe(12);
    expect(drained.performed.find((x) => x.id === 'pericardiocentesis')!.minute - drained.flags.worse).toBeLessThanOrEqual(5);
    expect(done(drained, /^When the pressure falls again/)).toBe(true);
    expect(late(drained, /^Drain it now/)).toBe(true);
  });

  it('intubating her before the drain: with nothing holding the pressure she arrests, with a vasopressor it crashes — a critical error either way', () => {
    const bare = md([...MD_START, 'rsi']);
    expect(bare.pulse).toBe(false);
    expect(ids(bare)).toEqual(['intubation-tamponade']);
    const held = md([...MD_START, 'pressor', 'rsi']);
    expect(held.pulse).toBe(true);
    expect(held.vitals).toMatchObject({ sbp: 64, gcs: 3 });
    expect(ids(held)).toEqual(['intubation-tamponade']);
    // after the drain an awake patient breathing well has no indication for a tube
    expect(ids(md([...IDEAL[7].slice(0, IDEAL[7].indexOf('consult-cardiology')), 'rsi']))).toEqual(['rsi-no-indication']);
  });

  it('the scanner before the drain: she arrests on the table unless a vasopressor holds her; after the drain a CT is no mistake', () => {
    const shock = md([...MD_START, 'ct-urgent']);
    expect(shock.pulse).toBe(false);
    expect(said(shock)).toMatch(/Radiology: a large pericardial effusion/);
    expect(ids(shock)).toEqual(['ct-before-drain']);
    const held = md([...MD_START, 'pressor', 'ct-urgent']);
    expect(held.pulse).toBe(true);
    expect(said(held)).toMatch(/she could not lie flat on the table/);
    expect(ids(held)).toEqual(['ct-before-drain']);
    const after = md([...IDEAL[7].slice(0, IDEAL[7].indexOf('consult-cardiology')), 'ct-urgent']);
    expect(ids(after)).toEqual([]);
    expect(said(after)).toMatch(/small residual pericardial effusion around the drain/);
  });

  it('nitroglycerin, CPAP, a bag, rate drugs, sedation, antithrombotics and a lytic are scored once each; aspirin only once the cause is seen', () => {
    const at = (id: string) => ids(md([...MD_START, id]));
    expect(at('nitro')).toEqual(['nitro-tamponade']);
    expect(at('cpap')).toEqual(['cpap-tamponade']);
    expect(at('bvm')).toEqual(['bvm-breathing']);
    expect(at('metoprolol')).toEqual(['rate-slowing-tamponade']);
    expect(at('diltiazem')).toEqual(['rate-slowing-tamponade']);
    expect(at('amio-infusion')).toEqual(['antiarrhythmic-tamponade']);
    expect(at('procainamide')).toEqual(['antiarrhythmic-tamponade']);
    expect(at('adenosine12')).toEqual(['adenosine-sinus']);
    expect(at('midazolam')).toEqual(['sedative-tamponade']);
    expect(at('fentanyl')).toEqual(['sedative-tamponade']);
    expect(at('procedural-sedation')).toEqual(['sedation-tamponade']);
    expect(at('heparin')).toEqual(['antithrombotic-tamponade']);
    expect(at('p2y12')).toEqual(['antithrombotic-tamponade']);
    expect(at('tnk')).toEqual(['lytic-tamponade']);
    expect(at('legs-up')).toEqual(['legs-up-orthopnea']);
    expect(at('aspirin')).toEqual([]);
    expect(ids(md([...MD_START, 'pocus', 'aspirin']))).toEqual(['aspirin-tamponade']);
    // the built-in rules still speak for themselves: no STEMI for the cath lab, no tachyarrhythmia to cardiovert
    expect(ids(md([...MD_START, 'sample', 'reassess', 'cath-lab-activate']))).toEqual(['cath-lab-no-ste']);
    expect(at('cardiovert')).toEqual(['cardiovert-no-tachycardia']);
    // nitroglycerin crashes the pressure
    expect(md([...MD_START, 'nitro']).vitals).toMatchObject({ sbp: 70, dbp: 60 });
  });

  it('cardiology before the drain says drain it now; after it, the CCU; surgery is for a window if it comes back; a transfer is a minor error', () => {
    expect(md([...MD_START, 'consult-cardiology']).log.at(-1)!.text).toMatch(/don't wait for us.*Drain it now under ultrasound/);
    expect(md([...MD_START, 'call-surgery']).log.at(-1)!.text).toMatch(/too sick for a general anesthetic right now/);
    const drained = md(IDEAL[7].slice(0, IDEAL[7].indexOf('consult-cardiology')));
    expect(perform(sc, drained, 'consult-cardiology').log.at(-1)!.text).toMatch(/CCU with the drain in/);
    expect(ids(perform(sc, drained, 'transfer'))).toEqual(['transfer-tamponade']);
    // the hand-off waits for a decision on where she goes
    expect(perform(sc, drained, 'handoff').log.at(-1)!.text).toMatch(/Decide where the patient goes first/);
    // admitting her before the drain sends her up undrained: the drain is missed, and sending her on costs points of its own
    const undrained = md([...MD_START, 'pocus', 'fluid', 'admit', 'handoff']);
    expect(undrained.ended?.reason).toBe('complete');
    expect(missed(undrained, /^Drain it now/)).toBe(true);
    expect(ids(undrained)).toEqual(['dispo-undrained']);
    // a transfer undrained is the same mistake, scored once; after the drain a transfer is only the needless trip
    expect(ids(md([...MD_START, 'pocus', 'fluid', 'transfer']))).toEqual(['dispo-undrained']);
  });

  it('the arrest: CPR and the needle bring her back — under the probe if it is at hand, blind if not; with no drain she dies', () => {
    const scanned = md([...MD_START, 'pocus', ...R(10), 'cpr', 'pericardiocentesis']);
    expect(has(scanned, 'arrest')).toBe(true);
    expect(scanned.pulse).toBe(true);
    expect(said(scanned)).toMatch(/Pericardiocentesis during the pulse check, under the probe/);
    for (const label of [/^She arrests: high-quality CPR at once/, /^She arrests: drain the pericardium at once/]) expect(done(scanned, label), String(label)).toBe(true);
    const blind = md([...MD_START, 'rsi', 'cpr', 'pericardiocentesis']);
    expect(blind.pulse).toBe(true);
    expect(said(blind)).toMatch(/Emergency pericardiocentesis without imaging/);
    // an antiarrhythmic in PEA is a mistake
    expect(ids(md([...MD_START, 'rsi', 'amio-arrest']))).toEqual(['intubation-tamponade', 'antiarrhythmic-pea']);
    let dying = md([...MD_START, 'rsi', 'cpr', 'epinephrine', 'hs-ts']);
    expect(said(dying)).toMatch(/tamponade fits best/);
    for (let i = 0; i < 10 && !dying.ended; i++) dying = perform(sc, dying, 'cpr');
    expect(dying.ended?.reason).toBe('death');
  });

  it('in the arrest the case monitor and the capnography line read the same EtCO₂ (the shared arrest rule)', () => {
    // the effusion left to build, and RSI before the drain (the path suggested for tests/sim-monitor.test.ts ARRESTS)
    for (const path of [[...MD_START, ...R(12)], [...MD_START, 'rsi']]) {
      for (const then of [['capno'], ['cpr', 'capno'], ['bvm', 'capno'], ['bvm', 'cpr', 'capno'], ['cpr', 'bvm', 'capno'], ['cpr', 'airway', 'capno']]) {
        let prev: SimState | null = null;
        let stale = false;
        runScenario(sc, 7, [...path, ...then], (s) => { stale = staleEtco2(prev, s, stale); prev = s; });
        const s = prev!;
        expect(s.pulse).toBe(false);
        const line = [...s.log].reverse().find((l) => /^EtCO₂ \d+ mmHg/.test(l.text))!.text;
        expect(Number(line.match(/\d+(?= mmHg)/)![0]), [...path, ...then].join(', ')).toBe(monitorVitals(s, stale).etco2);
      }
    }
  });

  it('the bolus is a bridge, not the treatment: a doctor who drains at once without one still does well', () => {
    const s = md([...MD_START, 'sample', 'pocus', 'pericardiocentesis', 'consult-cardiology', 'admit', 'handoff']);
    const r = review(sc, s);
    expect(r.toFix.map((t) => t.label)).toEqual(['A fluid bolus before the drain']);
    expect(r.percent).toBe(93);
    expect(r.grade).toBe('Excellent');
  });

  it('after the drain: nitroglycerin or a rate drug is a lesser mistake with its own words, and a bag only gets pushed away', () => {
    const drained = md(IDEAL[7].slice(0, IDEAL[7].indexOf('consult-cardiology')));
    const nitro = perform(sc, drained, 'nitro');
    expect(ids(nitro)).toEqual(['nitro-no-indication']);
    expect(review(sc, stop(nitro)).toFix.find((t) => t.kind === 'harm')!.label).toBe('Nitroglycerin with nothing to treat.');
    const beta = perform(sc, drained, 'metoprolol');
    expect(ids(beta)).toEqual(['rate-slowing-after-drain']);
    expect(said(beta)).not.toMatch(/barely with us/);
    expect(beta.vitals.sbp).toBeGreaterThanOrEqual(100);
    const bag = perform(sc, drained, 'bvm');
    expect(bag.vitals).toMatchObject({ sbp: 116, dbp: 74 });
    expect(bag.log.at(-1)!.text).toMatch(/pushes the mask away/);
    expect(ids(bag)).toEqual(['bvm-breathing']);
  });

  it('ROSC with a tube in: no "breathes on her own", and after RSI she stays sedated; the history comes from her husband', () => {
    const s = md([...MD_START, 'rsi', 'cpr', 'pericardiocentesis']);
    expect(s.pulse).toBe(true);
    expect(said(s)).not.toMatch(/breathes on her own/);
    expect(s.vitals).toMatchObject({ gcs: 3, rr: 16 });
    expect(said(perform(sc, s, 'reassess'))).toMatch(/Sedated and paralyzed on the ventilator/);
    expect(said(perform(sc, s, 'sample'))).toMatch(/Her husband answers for her/);
    // still sedated four minutes on: no waking with a tube in
    expect(until(s, (x) => x.minute >= s.minute + 6).vitals.gcs).toBe(3);
  });

  it('late items are scored as late', () => {
    const slow = md([...MD_START, ...R(4), 'pocus']);
    expect(late(slow, /^Point-of-care ultrasound/)).toBe(true);
  });
});

describe('a diuretic in the tamponade', () => {
  it('takes away the filling her squeezed heart lives on: the pressure falls, and one built-in rule charges it', () => {
    const before = md(['perfusion', 'lungs', 'sample', 'pocus']);
    const s = perform(sc, before, 'furosemide');
    expect(s.vitals.sbp).toBeLessThan(before.vitals.sbp);
    const charged = ids(s).filter((id) => id.startsWith('furosemide-'));
    expect(charged).toHaveLength(1);
    expect(['furosemide-hypotension', 'furosemide-preload-dependent']).toContain(charged[0]);
    expect(said(s)).toMatch(/Her pressure is drifting down/);
  });
});
