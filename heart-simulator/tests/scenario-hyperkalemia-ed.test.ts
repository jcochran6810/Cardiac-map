/**
 * Severe hyperkalemia in the emergency department (setting 'ed'): the ER nurse carries out the computer ED physician's
 * orders and speaks up; the ER doctor treats the 12-lead before the lab, shifts the potassium, finds the cause and calls
 * nephrology for dialysis. The case is imported from its own file: it is registered in scenarios/index.ts by the lead.
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, answerRead, criticalsFor, perform, review, start, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edHyperkalemia as sc } from '@/lib/sim/scenario/scenarios/edHyperkalemia';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { ROLE_SETTING } from '@/store/useAppStore';
import { monitorVitals, staleEtco2 } from '@/store/useSimStore';
import { runScenario } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const rn = (steps: string[]) => runScenario(sc, 6, steps);
const md = (steps: string[]) => runScenario(sc, 7, steps);
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const has = (s: SimState, flag: string) => flag in s.flags;
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const fix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState, label: RegExp) => fix(s).some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => fix(s).find((t) => label.test(t.label))?.kind === 'late';
const done = (s: SimState, label: RegExp) => review(sc, s.ended ? s : stop(s)).wentWell.some((t) => label.test(t.label));
/** Reassess until a condition holds (or the case ends), reading each 12-lead correctly as it comes */
function until(s: SimState, ok: (x: SimState) => boolean, max = 40): SimState {
  for (let i = 0; i < max && !ok(s) && !s.ended; i++) {
    s = perform(sc, s, 'reassess');
    while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
  }
  return s;
}

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  6: ['triage', 'pads', 'notify-physician', 'iv', 'ecg12', 'notify-physician', 'calcium-chloride', 'labs', 'glucose', 'insulin-dextrose', 'albuterol-hyperk',
    'sample', ...R(4), 'notify-physician', 'calcium-chloride', ...R(2), 'sodium-bicarbonate', ...R(3), 'ecg12-repeat', ...R(4), 'glucose', 'handoff'],
  7: ['primary', 'opqrst', 'calcium-chloride', 'labs', 'insulin-dextrose', 'albuterol-hyperk', 'sample', 'lungs', 'perfusion', 'reassess', 'calcium-chloride',
    ...R(2), 'sodium-bicarbonate', 'admit', ...R(5), 'ecg12-repeat', ...R(4), 'glucose', 'handoff'],
};

/** The nurse's run up to the physician's first order (calcium), with the 12-lead taken to the physician */
const RN_TO_CALCIUM_ORDER = IDEAL[6].slice(0, IDEAL[6].indexOf('calcium-chloride'));
/** …and on to the critical potassium reported: the second gram of calcium and the bicarbonate are ordered together */
const RN_TO_K_ORDERS = IDEAL[6].slice(0, IDEAL[6].indexOf('calcium-chloride', IDEAL[6].indexOf('calcium-chloride') + 1));
/** The doctor's run until the nurse's 12-lead is on the screen and read */
const MD_TO_ECG = ['primary', 'opqrst'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bPEA\b|asystole|pulseless electrical|hyperkal|potassium|peaked|sine/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis|favour/i;
const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];

/** Every run the tests play, for the checks on voices, spelling and the monitor */
const RUNS: [6 | 7, string[]][] = [
  [6, IDEAL[6]], [7, IDEAL[7]],
  [7, ['primary', ...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'bvm', 'pressor', 'admit']],
  [6, [...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'bvm', 'pressor']],
  [7, [...MD_TO_ECG, 'atropine', 'pace', 'lidocaine', 'reassess', 'reassess']],
  [7, [...MD_TO_ECG, 'metoprolol', 'adenosine6', 'vagal', 'fluid', 'fluid', 'cpap', 'rsi']],
  [7, [...MD_TO_ECG, 'calcium-chloride', 'consult-cardiology', 'sodium-bicarbonate', 'albuterol', 'insulin-dextrose', ...R(32)]],
  [6, [...RN_TO_K_ORDERS, 'calcium-chloride', 'sodium-bicarbonate', 'reassess', 'reassess', 'sodium-bicarbonate']],
  // the tube before calcium and after ROSC; a nurse who is busy but never calls, and a nebulizer nobody asked for
  [7, [...MD_TO_ECG, 'rsi', 'calcium-chloride', 'reassess', 'reassess']],
  [7, ['primary', ...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'rsi', 'pressor']],
  [6, ['triage', 'pads', 'iv', 'albuterol', 'labs', ...R(12)]],
];

describe('Severe hyperkalemia in the ED — the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to what exists', () => {
    expect(sc).toMatchObject({ id: 'hyperkalemia-ed', setting: 'ed', roles: [6, 7] });
    for (const role of sc.roles) expect(ROLE_SETTING[role]).toBe('ed');
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('hyperkalemia');
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      expect(h.roles?.every((r) => sc.roles.includes(r)) ?? true, h.id).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      expect(criticalsFor(sc, role).length, `role ${role}`).toBeGreaterThan(8);
      for (const c of criticalsFor(sc, role)) {
        const actions = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(actions.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // the built-in drug rules read them: calcium, bicarbonate, insulin and high-dose albuterol are right here; his
    // stage 4 kidney disease (not on dialysis) is the renal failure the dosing rules read
    expect(sc.problems).toEqual(['hyperkalemia', 'metabolic-acidosis', 'renal-failure']);
  });

  it('keeps the physician\'s decisions and procedures from the ER nurse', () => {
    const nurse = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    for (const id of ['pocus', 'rsi', 'central-line', 'temp-wire', 'consult-cardiology', 'admit', 'transfer']) expect(nurse.has(id), id).toBe(false);
    expect(unavailableReason(sc, start(sc, 6), 'admit')).toBe('Outside your scope');
    // the nurse calls the physician and gives the drugs; the doctor does not triage
    expect(nurse.has('notify-physician')).toBe(true);
    expect(unavailableReason(sc, start(sc, 7), 'triage')).toBe('Outside your scope');
  });

  it('nothing the learner sees before the 12-lead names the diagnosis — but the story is there', () => {
    const opening = [sc.title, sc.summary, ...Object.values(sc.briefing).flat().map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/hyperkal|potassium|calcium|peaked|insulin|dialysis|kidney|spironolactone/i);
    expect(opening).toMatch(/66-year-old man/);
    expect(opening).toMatch(/pulse of 38/);
    expect(opening).toMatch(/legs feel like rubber/);
    // he walked in: there is no crew to give a report
    expect(said(perform(sc, start(sc, 6), 'ems-handoff'))).toMatch(/came in on their own/);
  });

  it('each role is briefed for its own part, in the department\'s voices', () => {
    expect(start(sc, 6).log.some((l) => /You are the triage nurse, and he will be your patient.*on the physician's order/.test(l.text))).toBe(true);
    expect(start(sc, 6).log.some((l) => /the only standing orders are the chest pain set/.test(l.text))).toBe(true);
    expect(start(sc, 7).log.some((l) => /You are the ED physician: the diagnosis, the orders and the procedures are yours/.test(l.text))).toBe(true);
    for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(line[0]);
    for (const [role, steps] of RUNS) for (const l of runScenario(sc, role, steps).log) expect(NOT_IN_ED, `role ${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
  });

  it('no monitor line names the rhythm or the diagnosis: the learner reads the tracing', () => {
    for (const [role, steps] of RUNS) {
      for (const l of runScenario(sc, role, steps).log) if (l.who === 'monitor') expect(l.text, `role ${role}: ${l.text}`).not.toMatch(GIVEAWAY);
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const c of [...criticalsFor(sc, 6), ...criticalsFor(sc, 7)]) expect(`${c.label} ${c.why}`).not.toMatch(BRITISH);
    for (const h of sc.harms) expect(h.text).not.toMatch(BRITISH);
    for (const [role, steps] of RUNS) for (const l of runScenario(sc, role, steps).log) expect(l.text).not.toMatch(BRITISH);
  });

  it('teaches calcium before the lab, the shift and its glucose checks, the bicarbonate and the line, the removal and the arrest', () => {
    const t = sc.teaching.join(' ');
    expect(t).toMatch(/without waiting for the lab/);
    expect(t).toMatch(/calcium chloride 1 g/);
    expect(t).toMatch(/calcium gluconate/i);
    expect(t).toMatch(/insulin never goes in alone/);
    expect(t).toMatch(/at 30 minutes and every hour/);
    expect(t).toMatch(/only for a metabolic acidosis/);
    expect(t).toMatch(/calcium carbonate precipitate/);
    expect(t).toMatch(/sodium zirconium cyclosilicate/);
    expect(t).toMatch(/succinylcholine is contraindicated/);
    expect(t).toMatch(/2025 AHA/);
  });
});

describe('Severe hyperkalemia in the ED — the ideal runs', () => {
  for (const role of [6, 7] as const) {
    it(`role ${role}: ends by itself with full marks`, () => {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      expect(said(s)).toMatch(/All critical interventions are done/);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      expect(r.reads.every((x) => x.verdict === 'correct' && x.answer === 'Hyperkalemia (peaked T waves, wide QRS)')).toBe(true);
      // he is better, rechecked and on his way to dialysis
      expect(has(s, 'shifted') && has(s, 'glucose-rechecked') && has(s, 'admit')).toBe(true);
      expect(said(s)).toMatch(/a repeat potassium sent from the same draw: 6\.3 mEq\/L/);
      expect(s.rhythm.hr).toBe(72);
    });
  }

  it('the nurse gives every drug on the physician\'s order: none of them costs an order penalty', () => {
    const s = rn(IDEAL[6]);
    // each drug was ordered (calcium twice), and each order was used up by the dose it asked for
    for (const ask of ['calcium', 'shift', 'neb', 'calcium-again', 'bicarb']) expect(has(s, `asked-${ask}`), ask).toBe(true);
    for (const id of ['calcium-chloride', 'sodium-bicarbonate']) expect(has(s, `ordered:${id}`), id).toBe(false);
    expect(ids(s).filter((p) => p.startsWith('rn-without-order'))).toEqual([]);
  });
});

describe('the potassium, untreated: delay matters', () => {
  it('left alone, the QRS widens and the rate falls at 10 minutes, the complexes run together at 15, and he arrests at 18', () => {
    let s = md(['primary']);
    s = until(s, (x) => has(x, 'worse'));
    expect(s.minute).toBeGreaterThanOrEqual(10);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 30 });
    expect(s.vitals).toMatchObject({ sbp: 72, dbp: 40 });
    s = until(s, (x) => has(x, 'pre-arrest'));
    expect(s.rhythm.hr).toBe(24);
    expect(said(s)).toMatch(/roll into one another/);
    s = until(s, (x) => !x.pulse);
    expect(s.minute).toBeGreaterThanOrEqual(18);
    expect(s.rhythm.profile).toBe('pea');
    expect(missed(s, /IV calcium at once/)).toBe(true);
  });

  it('the arrest worked: compressions, epinephrine and calcium bring him back — comatose, needing breaths and a pressure', () => {
    const s = md(['primary', ...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr']);
    expect(s.pulse).toBe(true);
    expect(has(s, 'rosc')).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 46 });
    expect(s.vitals.gcs).toBe(6);
    expect(done(s, /compressions at once/)).toBe(true);
    expect(done(s, /epinephrine as soon as possible/)).toBe(true);
    expect(missed(s, /After ROSC: support his breathing/)).toBe(true);
    // no penalty for calcium in the arrest: "not well established", never wrong
    expect(ids(s)).toEqual([]);
    const after = md(['primary', ...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'bvm', 'pressor']);
    expect(done(after, /After ROSC: support his breathing/)).toBe(true);
    expect(done(after, /After ROSC: treat the low pressure/)).toBe(true);
  });

  it('in the arrest the capnograph follows the shared rule: the case gives no number of its own', () => {
    for (const then of [['capno'], ['bvm', 'capno'], ['bvm', 'cpr', 'capno'], ['cpr', 'airway', 'capno']]) {
      let prev: SimState | null = null;
      let stale = false;
      const s = runScenario(sc, 7, ['primary', ...R(9), ...then], (x) => { stale = staleEtco2(prev, x, stale); prev = x; });
      expect(s.pulse, then.join(', ')).toBe(false);
      const line = s.log.filter((l) => l.who === 'monitor').at(-1)!.text;
      expect(Number(line.match(/\d+(?= mmHg)/)![0]), then.join(', ')).toBe(monitorVitals(s, stale).etco2);
    }
  });

  it('the calcium in the arrest is pushed, not run in over minutes', () => {
    const s = md(['primary', ...R(9), 'cpr', 'calcium-chloride']);
    expect(said(s)).toMatch(/Calcium chloride 1 g pushed and flushed; compressions go on/);
  });

  it('compressions without calcium (or bicarbonate) do not bring him back', () => {
    const s = md(['primary', ...R(9), 'cpr', 'epinephrine', 'cpr', 'cpr']);
    expect(s.pulse).toBe(false);
  });

  it('a nurse who does nothing: the physician comes, runs the 12-lead and orders calcium — too late, and he arrests; the physician runs the code', () => {
    let s = rn(R(3));
    expect(has(s, 'md-not-called')).toBe(true);
    s = until(s, (x) => !x.pulse);
    expect(has(s, 'ecg-md-found')).toBe(true);
    expect(said(s)).toMatch(/start compressions/);
    s = rn([...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'bvm', 'pressor']);
    expect(s.pulse).toBe(true);
    // the ACLS drugs need no order; the infusion after ROSC is on the physician's order
    expect(ids(s).filter((p) => p.startsWith('rn-without-order'))).toEqual([]);
    expect(missed(s, /Bring the ED physician to the bedside/)).toBe(true);
    expect(missed(s, /12-lead within 10 minutes/)).toBe(true);
  });

  it('calcium buys 30 minutes: with nothing to shift the potassium, the rate sags again', () => {
    let s = md([...MD_TO_ECG, 'calcium-chloride']);
    expect(s.rhythm.hr).toBe(52);
    s = until(s, (x) => has(x, 'calcium-faded'));
    expect(s.minute).toBeGreaterThanOrEqual(32);
    expect(s.rhythm.hr).toBe(44);
  });

  it('insulin works within 20 minutes: the rate and the strength come back', () => {
    let s = md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose']);
    s = until(s, (x) => has(x, 'shifted'));
    expect(s.minute - s.flags.insulin).toBeGreaterThanOrEqual(20);
    expect(s.rhythm.hr).toBe(72);
    expect(s.vitals).toMatchObject({ sbp: 122, dbp: 72, gcs: 15 });
  });
});

describe('the traps', () => {
  it('the ER doctor who waits for the lab: the calcium is late, scored as such, and he gets worse while waiting', () => {
    let s = md([...MD_TO_ECG, 'labs', 'sample']);
    s = until(s, (x) => has(x, 'k-known'));
    expect(has(s, 'worse')).toBe(true);
    s = perform(sc, s, 'calcium-chloride');
    expect(ids(s)).toContain('calcium-waited-for-lab');
    expect(late(s, /IV calcium at once/)).toBe(true);
    // calcium given on the 12-lead alone is never scored as waiting
    expect(ids(md([...MD_TO_ECG, 'calcium-chloride', 'labs', ...R(6), 'calcium-chloride']))).not.toContain('calcium-waited-for-lab');
  });

  it('atropine: the bradycardia algorithm\'s first drug before the 12-lead; a detour once the tracing shows the cause', () => {
    // the nurse's line is in at 1.5 minutes, her 12-lead at 2: atropine goes in between
    const before = md(['primary', 'lungs', 'atropine']);
    expect(said(before)).toMatch(/No change: heart rate 38/);
    expect(ids(before)).toEqual([]);
    const after = md([...MD_TO_ECG, 'atropine']);
    expect(ids(after)).toEqual(['atropine-first']);
    expect(after.rhythm.hr).toBe(38);
  });

  it('pacing before calcium: no beat follows a spike (the potassium raises the threshold) — and once the 12-lead shows it, it costs points', () => {
    const blind = md(['primary', 'pace']);
    expect(has(blind, 'pace-failed')).toBe(true);
    expect(blind.rhythm.profile).toBe('hyperkalemia');
    expect(ids(blind)).toEqual([]);
    const seen = md([...MD_TO_ECG, 'pace']);
    expect(ids(seen)).toEqual(['pace-before-calcium']);
    const nurse = rn([...RN_TO_CALCIUM_ORDER.slice(0, RN_TO_CALCIUM_ORDER.indexOf('ecg12') + 1), 'pace']);
    expect(ids(nurse)).toContain('pace-before-calcium');
  });

  it('calcium and bicarbonate in one line: the nurse who pushes into the running calcium blocks it; once it is in and flushed, it is right', () => {
    let s = rn([...RN_TO_K_ORDERS, 'calcium-chloride', 'sodium-bicarbonate']);
    expect(ids(s)).toEqual(['calcium-bicarbonate-same-line']);
    expect(has(s, 'precipitate')).toBe(true);
    expect(has(s, 'bicarbonate')).toBe(false);
    expect(said(s)).toMatch(/chalky precipitate of calcium carbonate/);
    // the tubing changed and the catheter flushed: the bicarbonate goes in now, with no second penalty
    s = perform(sc, s, 'sodium-bicarbonate');
    expect(has(s, 'bicarb-given-rn')).toBe(true);
    expect(ids(s)).toEqual(['calcium-bicarbonate-same-line']);
    // the ideal run waits for the calcium: no penalty at all
    expect(ids(rn(IDEAL[6]))).toEqual([]);
  });

  it('in the ER doctor\'s run the nurse keeps the calcium and the bicarbonate apart', () => {
    // the gas back at 12: the second gram at 13.5, the bicarbonate ordered while it runs in
    const s = md([...MD_TO_ECG, 'labs', 'calcium-chloride', ...R(5), 'calcium-chloride', 'sodium-bicarbonate']);
    expect(has(s, 'k-known')).toBe(true);
    expect(said(s)).toMatch(/I will let it finish, flush it, then push the bicarbonate/);
    expect(has(s, 'bicarbonate')).toBe(true);
    expect(ids(s)).toEqual([]);
  });

  it('bicarbonate is for the acidosis the gas shows, after the calcium: ahead of either, it costs points once', () => {
    expect(ids(md([...MD_TO_ECG, 'sodium-bicarbonate']))).toEqual(['bicarbonate-early']);
    // after the calcium but before the gas is back: still a guess
    expect(ids(md([...MD_TO_ECG, 'calcium-chloride', 'labs', 'sodium-bicarbonate']))).toEqual(['bicarbonate-early']);
    // once the gas shows the acidosis it is right
    expect(ids(md([...MD_TO_ECG, 'calcium-chloride', 'labs', ...R(5), 'sodium-bicarbonate']))).toEqual([]);
    // the built-in rule stays quiet: the case lists the acidosis
    expect(ids(md(IDEAL[7]))).not.toContain('bicarbonate-no-indication');
  });

  it('insulin needs a glucose first and a recheck after: the nurse who skips the first is scored, and a missed recheck brings the low', () => {
    const ordered = [...RN_TO_CALCIUM_ORDER, 'calcium-chloride'];
    expect(ids(rn([...ordered, 'insulin-dextrose']))).toEqual(['insulin-before-glucose']);
    expect(ids(rn([...ordered, 'glucose', 'insulin-dextrose']))).toEqual([]);
    // the doctor's nurse checked it with the line
    expect(ids(md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose']))).toEqual([]);

    let s = md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose', 'albuterol-hyperk']);
    s = until(s, (x) => has(x, 'hypoglycemia'));
    expect(s.minute - s.flags.insulin).toBeGreaterThanOrEqual(60);
    expect(s.vitals.glucose).toBe(52);
    expect(said(s)).toMatch(/his glucose has not been rechecked since the insulin/);
    s = perform(sc, s, 'glucose');
    expect(said(s)).toMatch(/Blood glucose 52 mg\/dL — low/);
    s = perform(sc, s, 'dextrose');
    expect(s.vitals.glucose).toBe(172);
    expect(ids(s)).toEqual([]);
    expect(done(s, /Treat the low glucose/)).toBe(true);
    // the check that found him low is no recheck: the item is missed, not late
    expect(missed(s, /Recheck the glucose/)).toBe(true);
  });

  it('a glucose straight after the dextrose is no recheck: the insulin\'s low comes later', () => {
    const s = md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose', 'glucose']);
    expect(said(s)).toMatch(/Blood glucose 212 mg\/dL — the dextrose is still in it/);
    expect(has(s, 'glucose-rechecked')).toBe(false);
  });

  it('the wheezing dose of albuterol is too small: a wrong answer to the nurse\'s order, and no credit for the doctor', () => {
    const s = rn([...RN_TO_CALCIUM_ORDER, 'calcium-chloride', 'albuterol']);
    expect(ids(s)).toEqual(['wrong-neb']);
    expect(said(s)).toMatch(/2\.5 milligrams will not move his potassium/);
    const d = md([...MD_TO_ECG, 'albuterol']);
    expect(ids(d)).toEqual([]);
    expect(said(d)).toMatch(/Did you want 10 to 20 milligrams/);
    expect(missed(d, /high-dose albuterol/)).toBe(true);
  });
});

describe('the ER nurse: orders, escalation and the critical value', () => {
  it('calcium on her own costs an order penalty: this department has no nurse-driven protocol for it', () => {
    const s = rn(['triage', 'pads', 'iv', 'ecg12', 'calcium-chloride']);
    expect(ids(s)).toContain('rn-without-order-calcium-chloride');
  });

  it('atropine in answer to the calcium order is the order\'s wrong answer, scored once', () => {
    const s = rn([...RN_TO_CALCIUM_ORDER, 'atropine']);
    expect(ids(s)).toEqual(['wrong-calcium']);
    expect(said(s)).toMatch(/Not atropine/);
  });

  it('the 12-lead goes to the physician the moment it prints; left on the printer, the physician finds it three minutes later', () => {
    const shown = rn(RN_TO_CALCIUM_ORDER);
    expect(has(shown, 'asked-calcium')).toBe(true);
    expect(said(shown)).toMatch(/We are not waiting for the lab/);
    const left = rn(['triage', 'pads', 'notify-physician', 'iv', 'ecg12', 'reassess', 'reassess']);
    expect(has(left, 'ecg-md-found')).toBe(true);
    expect(said(left)).toMatch(/a tracing like this comes to me the moment it prints/);
    expect(missed(left, /Take the 12-lead to the physician/)).toBe(true);
  });

  it('the physician not called: he sees the rate on the central monitor at 5 minutes and asks why', () => {
    const s = rn(['triage', 'pads', 'iv', 'labs', 'reassess']);
    expect(has(s, 'md-not-called')).toBe(true);
    expect(said(s)).toMatch(/why wasn't I called/);
    expect(missed(s, /Bring the ED physician/)).toBe(true);
  });

  it('the critical potassium: reported at once, it brings the second gram of calcium and the bicarbonate; sat on, the physician finds it', () => {
    const reported = rn(RN_TO_K_ORDERS);
    expect(has(reported, 'k-reported')).toBe(true);
    expect(has(reported, 'asked-calcium-again') && has(reported, 'asked-bicarb')).toBe(true);
    expect(said(reported)).toMatch(/never into the calcium/);
    let quiet = rn(RN_TO_K_ORDERS.slice(0, -1));
    quiet = until(quiet, (x) => has(x, 'k-md-found'));
    expect(quiet.minute - quiet.flags['k-known']).toBeGreaterThanOrEqual(5);
    expect(missed(quiet, /Report the critical potassium/)).toBe(true);
    expect(has(quiet, 'asked-bicarb')).toBe(true);
  });

  it('the physician decides where he goes: the hand-off waits for the ICU and the dialysis plan', () => {
    const early = rn(['triage', 'pads', 'notify-physician', 'handoff']);
    expect(early.ended).toBeNull();
    expect(said(early)).toMatch(/stays in the department until the ED physician decides/);
    expect(said(rn(IDEAL[6]))).toMatch(/he needs emergency dialysis — a temporary catheter goes in as soon as he reaches the ICU/);
  });
});

describe('the ER doctor\'s other choices', () => {
  it('lidocaine or amiodarone for the wide complexes: the rate falls to 30 and, without calcium, he arrests within minutes', () => {
    let s = md([...MD_TO_ECG, 'lidocaine']);
    expect(ids(s)).toEqual(['antiarrhythmic-wide']);
    expect(s.rhythm.hr).toBe(30);
    s = until(s, (x) => !x.pulse, 3);
    expect(s.pulse).toBe(false);
    // after calcium it still drags him down, and is still the critical mistake
    const after = md([...MD_TO_ECG, 'calcium-chloride', 'amio-infusion']);
    expect(ids(after)).toEqual(['antiarrhythmic-wide']);
    expect(after.rhythm.hr).toBe(38);
  });

  it('a beta-blocker, adenosine, a vagal maneuver: each slows a heart the potassium already slows', () => {
    expect(ids(md([...MD_TO_ECG, 'metoprolol']))).toEqual(['av-blocker']);
    const a = md([...MD_TO_ECG, 'adenosine6']);
    expect(ids(a)).toEqual(['adenosine-slow']);
    expect(said(a)).toMatch(/6 seconds with no complexes at all/);
    expect(ids(md([...MD_TO_ECG, 'vagal']))).toEqual(['vagal-slow']);
  });

  it('intubating him before calcium nearly stops his heart', () => {
    const s = md([...MD_TO_ECG, 'rsi']);
    expect(ids(s)).toEqual(['rsi-no-indication']);
    expect(s.rhythm.hr).toBe(28);
  });

  it('nephrology for dialysis and the ICU: admitting him is the call; a transfer is not needed', () => {
    const s = md([...MD_TO_ECG, 'calcium-chloride', 'labs', ...R(5), 'admit']);
    expect(said(s)).toMatch(/he needs emergency dialysis/);
    expect(has(s, 'dispo') && has(s, 'admit')).toBe(true);
    expect(done(s, /nephrology for emergency dialysis/)).toBe(true);
    const t = perform(sc, md(MD_TO_ECG), 'transfer');
    expect(has(t, 'transfer')).toBe(false);
    expect(said(t)).toMatch(/this hospital has nephrology on call, emergency dialysis and an ICU/);
  });

  it('cardiology, if called, sends him back to the potassium: no pacing wire', () => {
    const s = md([...MD_TO_ECG, 'consult-cardiology']);
    expect(said(s)).toMatch(/That tracing is his potassium/);
    expect(ids(s)).toEqual([]);
  });

  it('the second gram of calcium narrows the QRS a little more; the first lifts the rate and the pressure', () => {
    let s = md([...MD_TO_ECG, 'calcium-chloride']);
    expect(s.rhythm.hr).toBe(52);
    expect(s.vitals).toMatchObject({ sbp: 100, dbp: 60 });
    expect(said(s)).toMatch(/still wide, the T waves still tall/);
    s = perform(sc, perform(sc, s, 'reassess'), 'calcium-chloride');
    expect(s.rhythm.hr).toBe(60);
    expect(done(s, /A second gram of calcium/)).toBe(true);
  });

  it('a fluid bolus barely moves a pressure that comes from the rate; a second one floods the lungs', () => {
    const s = md([...MD_TO_ECG, 'fluid', 'fluid', 'lungs']);
    expect(ids(s)).toEqual(['fluid-repeat']);
    expect(said(s)).toMatch(/Crackles a third of the way up/);
  });
});

describe('review fixes: the story, the orders and the rechecks', () => {
  /** The nurse's run in another good order: the bicarbonate before the second gram, the repeat 12-lead before she is asked */
  const RN_OTHER_ORDER = ['triage', 'notify-physician', 'pads', 'iv', 'labs', 'ecg12', 'notify-physician', 'calcium-chloride', 'glucose', 'albuterol-hyperk',
    'insulin-dextrose', 'sample', ...R(2), 'notify-physician', 'sodium-bicarbonate', 'calcium-chloride', ...R(6), 'ecg12-repeat', ...R(3), 'glucose', 'handoff'];

  it('the ER nurse is the triage nurse who takes him in: the triage level is hers, ESI 1 in the case\'s words', () => {
    const s = rn(['triage']);
    expect(said(s)).toMatch(/ESI 1: a pulse of 38 with a pressure of 86\/50/);
    expect(done(s, /Triage: ESI 1/)).toBe(true);
    // nothing in her briefing says he has already been triaged
    expect(start(sc, 6).log.map((l) => l.text).join(' ')).not.toMatch(/He is yours|charge nurse/i);
  });

  it('nothing anyone says before the 12-lead is read names the cause or its drugs', () => {
    // every line up to the learner's first read of the 12-lead
    const before = (s: SimState) => {
      const read = s.log.findIndex((l) => l.text.startsWith('My read:'));
      return read < 0 ? s.log : s.log.slice(0, read);
    };
    const CAUSE = /hyperkal|potassium|calcium|dialysis|bicarbonate|insulin/i;
    // cardiology asks for the tracing; the nurse asks what a nebulizer is for; the line is just a line
    const consult = md(['primary', 'consult-cardiology']);
    expect(said(consult)).toMatch(/send me his 12-lead the moment it prints/);
    const neb = md(['primary', 'albuterol']);
    expect(said(neb)).toMatch(/His chest has no wheeze/);
    for (const s of [consult, neb, rn(['triage', 'pads', 'iv', 'notify-physician']), md(['primary', 'opqrst'])]) {
      for (const l of before(s)) expect(l.text, `${l.who}: ${l.text}`).not.toMatch(CAUSE);
    }
    // admitting him before anyone knows why is refused, with no time passing — the call can still be made later
    const early = perform(sc, start(sc, 7), 'admit');
    expect(early.minute).toBe(0);
    expect(has(early, 'admit')).toBe(false);
    expect(said(early)).toMatch(/Find out what is slowing his heart first/);
    expect(unavailableReason(sc, early, 'admit')).toBeNull();
  });

  it('the physician who walks in asks only for what is not yet done, with the numbers on the monitor', () => {
    const s = rn(['triage', 'pads', 'iv', 'reassess']);
    expect(has(s, 'md-not-called')).toBe(true);
    const arrives = s.log.find((l) => l.who === 'physician')!.text;
    expect(arrives).toMatch(/I saw a rate of 38 on the central monitor — why wasn't I called\? A 12-lead/);
    expect(arrives).not.toMatch(/Pads on him|a line in a big vein/);
  });

  it('a repeat 12-lead started just before the shift and printed after it counts: the doctor gets the item, the nurse is not asked again', () => {
    // insulin in at 3.5: the shift works at 23.5, while a 12-lead started at 22 is printing
    const s = md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose', ...R(9), 'lungs', 'ecg12-repeat']);
    const repeat = s.performed.find((p) => p.id === 'ecg12-repeat')!;
    expect(repeat.minute).toBeLessThan(s.flags.shifted);
    expect(done(s, /Repeat the 12-lead once the shift has worked/)).toBe(true);
    const nurse = rn(RN_OTHER_ORDER);
    expect(has(nurse, 'asked-ecg-again')).toBe(false);
    const r = review(sc, nurse);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
  });

  it('the repeat 12-lead is read as the tracing shows it: the same pattern at a safer rate, never a narrower QRS it does not draw', () => {
    for (const role of [6, 7] as const) {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(said(s)).not.toMatch(/narrower|complexes look a little narrow|narrow a little more/);
      expect(said(s)).toMatch(/Rate 72: still P waves flattened almost to nothing.*a QRS about 140 ms wide/);
    }
  });

  it('the glucose recheck counts from 20 minutes after the insulin; one sooner only shows the dextrose', () => {
    // insulin in at 3.5: a check at 21.5 is 18 minutes on, the next at 24 is 20.5
    let s = md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose', ...R(9), 'glucose']);
    expect(said(s)).toMatch(/the dextrose is still in it/);
    expect(has(s, 'glucose-rechecked')).toBe(false);
    s = perform(sc, perform(sc, s, 'reassess'), 'glucose');
    expect(s.performed.at(-1)!.minute - s.flags.insulin).toBe(20.5);
    expect(said(s)).toMatch(/Blood glucose 124 mg\/dL\. With it, a repeat potassium/);
    expect(done(s, /Recheck the glucose within the hour/)).toBe(true);
  });

  it('the ER doctor\'s nurse gives the insulin and asks when to recheck: ordering the rechecks is the doctor\'s decision', () => {
    const s = md([...MD_TO_ECG, 'calcium-chloride', 'insulin-dextrose']);
    expect(said(s)).toMatch(/His glucose was 136 before it\. When do you want it rechecked\?/);
    expect(said(s)).not.toMatch(/Glucose rechecked in about 30 minutes/);
    expect(said(rn([...RN_TO_CALCIUM_ORDER, 'calcium-chloride', 'glucose', 'insulin-dextrose']))).toMatch(/Glucose rechecked in about 30 minutes, then every hour/);
  });

  it('one order, one dose: a second gram of calcium before the second order costs an order penalty', () => {
    const s = rn([...RN_TO_CALCIUM_ORDER, 'calcium-chloride', 'calcium-chloride']);
    expect(ids(s)).toEqual(['rn-without-order-calcium-chloride']);
    // the second order, when it comes, allows the second gram
    expect(ids(rn(IDEAL[6]))).toEqual([]);
  });

  it('a dose after the physician has given it himself is a second dose: it costs, and earns no credit for the order', () => {
    // the bicarbonate: ordered, not given for 12 minutes, pushed by the physician — then the nurse pushes it again
    let s = rn([...RN_TO_K_ORDERS, 'calcium-chloride']);
    s = until(s, (x) => has(x, 'bicarb-md'));
    expect(said(s)).toMatch(/I have flushed the line and pushed the bicarbonate myself/);
    s = perform(sc, s, 'sodium-bicarbonate');
    expect(ids(s)).toContain('rn-without-order-sodium-bicarbonate');
    expect(missed(s, /Bicarbonate on the order/)).toBe(true);
    // the insulin: the physician gives it after 5 minutes; the nurse's dose after that is a second one
    let i = rn([...RN_TO_CALCIUM_ORDER, 'calcium-chloride']);
    i = until(i, (x) => has(x, 'shift-given'));
    expect(said(i)).toMatch(/I will give the dextrose and insulin myself/);
    i = perform(sc, i, 'insulin-dextrose');
    expect(ids(i)).toContain('rn-without-order-insulin-dextrose');
    expect(missed(i, /Insulin with dextrose on the physician's order/)).toBe(true);
  });

  it('blood is never drawn from the line the calcium is running in', () => {
    const s = rn([...RN_TO_CALCIUM_ORDER, 'calcium-chloride', 'labs']);
    expect(said(s)).toMatch(/Blood drawn by a fresh stick in the other arm — never from the line the calcium is running in/);
  });

  it('a tube after ROSC with a low pressure and nothing holding it up costs once; with the infusion running it is right', () => {
    const rosc = ['primary', ...R(9), 'cpr', 'epinephrine', 'calcium-chloride', 'cpr'];
    const bare = md([...rosc, 'rsi']);
    expect(ids(bare)).toEqual(['rsi-unresuscitated']);
    expect(ids(md([...rosc, 'pressor', 'rsi']))).toEqual([]);
  });

  it('intubating him before calcium never improves the rate, and he arrests within minutes unless calcium comes', () => {
    let s = md(['primary']);
    s = until(s, (x) => has(x, 'worse'));
    expect(s.rhythm.hr).toBe(30);
    s = perform(sc, s, 'rsi');
    expect(s.rhythm.hr).toBeLessThanOrEqual(28);
    expect(ids(s)).toEqual(['rsi-no-indication']);
    s = until(s, (x) => !x.pulse, 3);
    expect(s.pulse).toBe(false);
    // calcium straight after the tube: he holds on
    const saved = md([...MD_TO_ECG, 'rsi', 'calcium-chloride', 'reassess', 'reassess']);
    expect(saved.pulse).toBe(true);
  });

  it('his drowsiness reads the same in the team\'s words and his own', () => {
    let s = md(['primary']);
    s = until(s, (x) => has(x, 'worse'));
    expect(said(perform(sc, s, 'reassess'))).toMatch(/Harder to rouse/);
    s = until(s, (x) => has(x, 'pre-arrest'));
    expect(said(perform(sc, s, 'reassess'))).toMatch(/Barely rousable: he opens his eyes to a loud voice/);
  });

  it('calcium within 5 minutes of the 12-lead is on time, as the timing says; the acidosis shows on the capnograph', () => {
    let s = md(['primary', 'opqrst', 'sample', 'lungs', 'perfusion', 'neuro', 'lungs', 'lungs', 'lungs', 'lungs']);
    expect(s.minute - s.flags.ecg12).toBe(4.5);
    s = perform(sc, s, 'calcium-chloride');
    expect(done(s, /IV calcium at once/)).toBe(true);
    expect(review(sc, stop(s)).timings.find((t) => t.label === '12-lead to calcium')?.met).toBe(true);
    expect(said(md(['primary', 'capno']))).toMatch(/EtCO₂ 24 mmHg/);
  });
});
