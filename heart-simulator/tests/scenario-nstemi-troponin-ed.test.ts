/**
 * NSTE-ACS in the emergency department ('nstemi-troponin-ed'), played as the ER nurse (6) and the ER doctor (7): the ideal
 * runs, the department's timings, each trap (a fibrinolytic or a cath lab activation for ST depression, no new 12-lead
 * when the pain comes back, a "normal-looking" first troponin, oxygen, a P2Y12 without an order or against cardiology's
 * plan, a repeat troponin drawn too soon or too late) and the responders behind them (the physician's read and orders and
 * their fallbacks, the computer nurse, the returning pain and the nitroglycerin, cardiology, the bed board).
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile, stLevel } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edNstemi as sc } from '@/lib/sim/scenario/scenarios/edNstemi';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState, who: Speaker) => s.log.filter((l) => l.who === who).map((l) => l.text);
const toFix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState) => toFix(s).filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => toFix(s).filter((t) => t.kind === 'late').map((t) => t.label);
const timing = (s: SimState, label: string) => review(sc, s.ended ? s : stop(s)).timings.find((t) => t.label === label)!;

/** A correct run for each role (the lead copies these into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  // the ER nurse: triage, the 12-lead and straight to the physician, the ordered posterior leads, the first troponin, the
  // monitor, aspirin on the standing order, a line and the ordered heparin, the history; when the pain comes back a new
  // 12-lead, nitroglycerin and a report; the repeat troponin at the 1-hour mark, its rise reported, and the hand-off once
  // the step-down bed is ready
  6: ['triage', 'ecg12', 'notify-physician', 'ecg-posterior', 'labs', 'monitor', 'aspirin', 'iv', 'heparin', 'sample', 'opqrst', ...R(10),
    'ecg12-repeat', 'nitro', 'notify-physician', ...R(16), 'troponin-repeat', ...R(4), 'notify-physician', 'handoff'],
  // the ER doctor: the history, the nurse's 12-lead read, V7–V9, aspirin, heparin and the serial troponin ordered at once;
  // cardiology once the first troponin is back (the P2Y12 held for the anatomy) and the admission; when the pain comes back
  // a new 12-lead, nitroglycerin and cardiology told; the hand-off once the bed is ready and the repeat troponin is back
  7: ['opqrst', 'sample', 'ecg-posterior', 'aspirin', 'heparin', 'troponin-repeat', ...R(4), 'consult-cardiology', 'admit', ...R(8),
    'ecg12-repeat', 'nitro', 'consult-cardiology', ...R(19), 'handoff'],
};
const ROLES = [6, 7] as const;
const RN = IDEAL[6];
const MD = IDEAL[7];
/** Each run up to the minute the pressure comes back (the pain event has fired) */
const RN_TO_PAIN = RN.slice(0, RN.indexOf('ecg12-repeat'));
const MD_TO_PAIN = MD.slice(0, MD.indexOf('ecg12-repeat'));
/** The nurse's run up to the physician's admission (the first troponin back, the heparin in) */
const RN_TO_DISPO = RN.slice(0, RN.indexOf('opqrst') + 3);

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|anaesth/i;

/** The events by which a computer colleague steps in for a missed step: none fires in an ideal run */
const RESCUES = [
  'rn-physician-wants-ecg', 'rn-physician-ecg', 'rn-physician-sees-ecg', 'rn-physician-labs', 'rn-physician-pain', 'rn-physician-ecg-pain',
  'rn-physician-nitro', 'rn-trop-reminder', 'rn-heparin-unordered', 'rn-lytic-stopped', 'md-aspirin-ask', 'md-plan-nudge', 'md-trop-ask',
  'md-nurse-ecg-pain', 'md-nurse-nitro',
];

function expectFullMarks(s: SimState) {
  expect(s.ended?.reason).toBe('complete');
  expect(s.pulse).toBe(true);
  const r = review(sc, s);
  expect(r.toFix).toEqual([]);
  expect(r.penaltyPoints).toBe(0);
  expect(r.percent).toBe(100);
  expect(r.grade).toBe('Excellent');
  expect(r.outcome).toMatch(/^Every critical intervention done in \d+:\d\d\.$/);
  for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
}

describe('NSTE-ACS in the ED: the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to things that exist', () => {
    expect(sc.id).toBe('nstemi-troponin-ed');
    expect(sc.setting).toBe('ed');
    expect(sc.roles).toEqual([6, 7]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('nstemi');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of ROLES) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      expect(criticalsFor(sc, role).length).toBeGreaterThan(8);
      for (const c of criticalsFor(sc, role)) {
        const used = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of used) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(used.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // every harm a role can be scored for is one it can commit
      for (const h of sc.harms.filter((x) => !x.roles || x.roles.includes(role))) {
        expect(h.actions.some((id) => scope.has(id)), `role ${role}: harm ${h.id}`).toBe(true);
      }
    }
  });

  it('keeps each role in its scope: the nurse never activates, gives tenecteplase, consults or admits; the doctor does not triage', () => {
    const rn = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    const md = new Set(interventionsFor(7, 'ed').map((i) => i.id));
    for (const id of ['cath-lab-activate', 'tnk', 'admit', 'transfer', 'consult-cardiology']) expect(rn.has(id), id).toBe(false);
    for (const id of ['triage', 'notify-physician']) expect(md.has(id), id).toBe(false);
    expect(RN.every((id) => rn.has(id))).toBe(true);
    expect(MD.every((id) => md.has(id))).toBe(true);
  });

  it('speaks with the department\'s voices: the physician in the nurse\'s run, the nurse in the doctor\'s, never the lab or the field', () => {
    const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
    for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(line[0]);
    const rn = run(sc, 6, RN);
    const md = run(sc, 7, MD);
    for (const s of [rn, md]) for (const l of s.log) expect(NOT_IN_ED, `${l.who}: ${l.text}`).not.toContain(l.who);
    expect(said(rn, 'nurse')).toEqual([]);
    expect(said(md, 'physician')).toEqual([]);
    expect(said(md, 'consultant')).toHaveLength(2);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
    for (const t of [...sc.teaching, ...sc.critical.map((c) => c.why), ...sc.harms.map((h) => h.text)]) expect(t).not.toMatch(BRITISH);
  });
});

describe('NSTE-ACS in the ED: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      // admitted, the pain came back and settled, the repeat troponin came back risen before she left
      for (const f of ['admit', 'dispo', 'pain-back', 'pain-relieved', 'trop1-back', 'trop2-drawn', 'trop2-back', 'bed-ready', 'handoff', 'heparin', 'aspirin']) {
        expect(s.flags[f], f).toBeDefined();
      }
      expect(s.flags['trop2-back']).toBeLessThanOrEqual(s.flags.handoff);
      expect(s.flags['p2y12-hold']).toBeDefined();
      // never a STEMI, so no activation, no fibrinolytic and no P2Y12
      for (const f of ['ecg-stemi', 'alert', 'alert-declined', 'lytic', 'p2y12']) expect(s.flags[f], f).toBeUndefined();
      expect(s.reads.map((r) => r.answer)).toEqual(['ischaemia', 'ischaemia']);
      expect(s.reads.every((r) => r.verdict === 'correct')).toBe(true);
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      for (const id of RESCUES) expect(s.fired, id).not.toContain(id);
      expect(said(s, 'hospital').some((t) => /repeat high-sensitivity troponin I 78 ng\/L.*a rise of 54 ng\/L/.test(t))).toBe(true);
      expect(s.log.some((l) => l.text === 'SBAR hand-off to the admitting team; they take over.')).toBe(true);
    });
  }

  it('times the department: the 12-lead and aspirin early, a new 12-lead at once with the new pain, the repeat troponin at the hour', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role]);
      expect(timing(s, 'Door to 12-lead').minute, `role ${role}`).toBeLessThanOrEqual(2);
      expect(timing(s, 'Door to aspirin').minute).toBeLessThanOrEqual(6);
      expect(timing(s, 'New pain to a new 12-lead').minute).toBe(0);
      const repeat = timing(s, 'First troponin to the repeat (goal: 1–3 hours)');
      expect(repeat.met).toBeNull();
      expect(repeat.minute).toBeGreaterThanOrEqual(60);
      expect(repeat.minute).toBeLessThanOrEqual(62);
    }
  });

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
      expect(said(s, 'monitor')).toContain('V7–V9: no ST elevation.');
    }
  });

  it('nothing names the diagnosis before the learner reads the first 12-lead', () => {
    // the picker shows the title and summary before the case starts
    for (const t of [sc.title, sc.summary]) expect(t).not.toMatch(/STEMI|NSTE|acute coronary|ischemi|infarct|occlu|left main|ST depression|troponin is/i);
    const before = { 6: ['triage', 'ecg12'], 7: ['opqrst', 'sample'] } as const;
    for (const role of ROLES) {
      const s = run(sc, role, [...before[role]], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'ecg', answer: 'ischaemia' });
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(/STEMI|NSTE|acute coronary|ischemi|infarct|occlu|left main/i);
    }
  });

  it('the tracing with the returning pain is a new one to read, at a faster rate, and still not a STEMI', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role]);
      expect(s.reads[1].minute).toBeGreaterThanOrEqual(s.flags['pain-back']);
      expect(s.lastEcg).toMatchObject({ profile: 'nstemi', hr: 104 });
      expect(s.log.some((l) => l.who === 'feedback' && /Recorded with the pain back/.test(l.text))).toBe(true);
    }
  });
});

describe('NSTE-ACS in the ED: the traps', () => {
  it('a fibrinolytic for ST depression: one critical penalty for either role, and only its bleeding shows', () => {
    const md = run(sc, 7, [...MD.slice(0, 3), 'tnk', ...R(3)]);
    expect(ids(md)).toEqual(['lytic-st-depression']);
    expect(md.penalties[0]).toMatchObject({ severity: 'critical', points: 15 });
    expect(said(md, 'nurse').some((t) => /oozing/.test(t))).toBe(true);
    // the nurse's alteplase, with no order too: still the one penalty, in words that name both mistakes
    const rn = run(sc, 6, ['triage', 'ecg12', 'iv', 'alteplase', ...R(3)]);
    expect(ids(rn)).toEqual(['rn-lytic-st-depression']);
    expect(rn.penalties[0]).toMatchObject({ severity: 'critical', points: 15 });
    expect(rn.penalties[0].text).toMatch(/^A fibrinolytic with no order, for ST depression\./);
    expect(said(rn, 'team').some((t) => /oozing/.test(t))).toBe(true);
  });

  it('a cath lab activation for ST depression: the interventional cardiologist declines, one penalty, no disposition', () => {
    const s = run(sc, 7, [...MD.slice(0, 3), 'cath-lab-activate']);
    expect(ids(s)).toEqual(['cath-lab-st-depression']);
    expect(said(s, 'consultant').at(-1)).toMatch(/not a STEMI — I'm not bringing the team in/);
    expect(s.flags['alert-declined']).toBeDefined();
    for (const f of ['alert', 'dispo', 'cathReady']) expect(s.flags[f], f).toBeUndefined();
    expect(s.timers.cathReady).toBeUndefined();
    // before any 12-lead the engine refuses it: nothing is done and nothing scored
    const early = run(sc, 7, ['cath-lab-activate']);
    expect(early.counts['cath-lab-activate']).toBeUndefined();
    expect(ids(early)).toEqual([]);
  });

  it('no new 12-lead when the pain comes back (nurse): the physician records it at 12 minutes, and the item is missed', () => {
    const s = run(sc, 6, [...RN_TO_PAIN, 'nitro', 'notify-physician', ...R(6)]);
    expect(s.fired).toContain('rn-physician-ecg-pain');
    expect(said(s, 'physician').some((t) => /A new 12-lead now, while she has the pain/.test(t))).toBe(true);
    expect(missed(s)).toContain('A new 12-lead within 10 minutes of the returning pain');
    expect(timing(s, 'New pain to a new 12-lead').met).toBe(false);
  });

  it('no new 12-lead when the pain comes back (doctor): the nurse records it at 10 minutes, the doctor reads it, the item is missed', () => {
    const s = run(sc, 7, [...MD_TO_PAIN, ...R(5)]);
    expect(s.fired).toContain('md-nurse-ecg-pain');
    expect(s.reads).toHaveLength(2);
    expect(missed(s)).toContain('A new 12-lead within 10 minutes of the returning pain');
    // the doctor's own 12-lead after the nurse's is late: half the points
    const slow = run(sc, 7, [...MD_TO_PAIN, ...R(6), 'ecg12-repeat']);
    expect(slow.fired).toContain('md-nurse-ecg-pain');
    expect(late(slow)).toContain('A new 12-lead within 10 minutes of the returning pain');
  });

  it('a "normal-looking" first troponin: it is under the men\'s limit but flagged high for a woman, and she cannot leave without a disposition', () => {
    const md = run(sc, 7, MD.slice(0, 10));
    expect(said(md, 'hospital').some((t) => /troponin I 24 ng\/L — flagged high .*16 ng\/L for women, 34 for men/.test(t))).toBe(true);
    expect(said(md, 'nurse').some((t) => /go home tonight if it's only a little high/.test(t))).toBe(true);
    // no disposition, no hand-off; and no transfer out of a hospital with a cath lab
    const blocked = perform(sc, md, 'handoff');
    expect(blocked.counts.handoff).toBeUndefined();
    expect(blocked.log.at(-1)!.text).toMatch(/Decide where the patient goes first/);
    const transfer = perform(sc, md, 'transfer');
    expect(transfer.counts.transfer).toBeUndefined();
    expect(transfer.log.at(-1)!.text).toMatch(/this hospital has a cath lab/);
    // the physician spells it out to the nurse
    expect(said(run(sc, 6, RN_TO_DISPO), 'physician').some((t) => /would pass under the men's \(34\)/.test(t))).toBe(true);
  });

  it('oxygen with an SpO₂ of 97 % costs points for either role', () => {
    expect(ids(run(sc, 6, ['triage', 'o2-nc']))).toEqual(['oxygen-normoxic']);
    expect(ids(run(sc, 7, ['o2-nrb']))).toEqual(['oxygen-normoxic']);
  });

  it('the P2Y12: the nurse never gives it without an order (one penalty); the doctor decides it with cardiology', () => {
    const rn = run(sc, 6, ['triage', 'ecg12', 'p2y12']);
    expect(ids(rn)).toEqual(['rn-p2y12-no-order']);
    // after cardiology asked to hold it: a small penalty, and the nurse says so
    const against = run(sc, 7, [...MD.slice(0, MD.indexOf('admit')), 'p2y12']);
    expect(ids(against)).toEqual(['p2y12-against-plan']);
    expect(said(against, 'nurse').at(-1)).toMatch(/cardiology asked us to hold it/);
    // before the call it is the doctor's to decide: no penalty, and cardiology works with it
    const before = run(sc, 7, [...MD.slice(0, 6), 'p2y12', ...R(4), 'consult-cardiology']);
    expect(ids(before)).toEqual([]);
    expect(said(before, 'consultant').at(-1)).toMatch(/She has had ticagrelor already\? Then that's done/);
    expect(before.flags['p2y12-hold']).toBeUndefined();
  });

  it('heparin needs the physician\'s order; aspirin, nitroglycerin and the troponins are on the standing order', () => {
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'iv', 'heparin']))).toEqual(['rn-without-order-heparin']);
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'aspirin', 'iv', 'labs', 'nitro']))).toEqual([]);
    // the order comes as an ask in the physician's voice, once there is a line for it
    const s = run(sc, 6, RN.slice(0, RN.indexOf('heparin') + 1));
    expect(s.flags['asked-heparin']).toBe(s.flags.iv);
    expect(said(s, 'physician').some((t) => /heparin, please — 4,000 units IV now/.test(t))).toBe(true);
    expect(ids(s)).toEqual([]);
  });
});

describe('NSTE-ACS in the ED: the ER nurse\'s responders', () => {
  it('the physician reads the 12-lead the nurse brings; a report before it gets "a 12-lead right now"', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician']);
    expect(said(s, 'physician')[0]).toMatch(/No ST elevation that meets STEMI criteria, so no cath lab activation/);
    expect(s.flags['asked-posterior']).toBeDefined();
    const before = run(sc, 6, ['notify-physician']);
    expect(said(before, 'physician').at(-1)).toMatch(/get me a 12-lead right now/);
    expect(before.flags['physician-read']).toBeUndefined();
  });

  it('a 12-lead left on the printer: the physician finds it 5 minutes later, and showing it is missed', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'monitor', 'aspirin', 'iv', 'reassess']);
    expect(s.fired).toContain('rn-physician-sees-ecg');
    expect(said(s, 'physician').some((t) => /sitting on the printer/.test(t))).toBe(true);
    expect(missed(s)).toContain('Show the 12-lead to the ED physician the moment it prints');
  });

  it('no 12-lead: the physician asks at 10 minutes and records it at 13 — with no read owed by the nurse — and the 12-lead is missed once', () => {
    const s = run(sc, 6, ['triage', 'monitor', 'iv', 'labs', 'aspirin', 'sample', 'opqrst', ...R(3)]);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-physician-wants-ecg', 'rn-physician-ecg']));
    expect(s.flags['physician-read']).toBeDefined();
    expect(s.flags.ecg12).toBeUndefined();
    expect(s.reads).toEqual([]);
    expect(missed(s)).toContain('12-lead within 10 minutes of arrival');
    // there was no tracing of the nurse's to show: one mistake, scored once
    expect(toFix(s).map((t) => t.label)).not.toContain('Show the 12-lead to the ED physician the moment it prints');
    expect(said(s, 'physician').some((t) => /^I've recorded her 12-lead myself\. No ST elevation/.test(t))).toBe(true);
    // recorded at 11 minutes: late, and the door-to-ECG goal missed
    const slow = run(sc, 6, ['triage', 'monitor', 'iv', 'labs', 'aspirin', 'sample', 'opqrst', 'reassess', 'reassess', 'ecg12']);
    expect(late(slow)).toContain('12-lead within 10 minutes of arrival');
    expect(timing(slow, 'Door to 12-lead').met).toBe(false);
  });

  it('the posterior leads: recorded before the ask they count; never recorded, the physician does it and the item is missed', () => {
    const early = run(sc, 6, ['triage', 'ecg12', 'ecg-posterior', 'notify-physician']);
    expect(early.flags['posterior-recorded']).toBeDefined();
    expect(toFix(early).map((t) => t.label)).not.toContain('Posterior leads V7–V9 on the physician\'s order');
    const never = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'monitor', 'aspirin', 'iv']);
    expect(never.fired).toContain('posterior-fallback');
    expect(said(never, 'monitor')).toContain('V7–V9: no ST elevation.');
    expect(missed(never)).toContain('Posterior leads V7–V9 on the physician\'s order');
  });

  it('an unanswered heparin order falls back to the physician, and the item is missed', () => {
    const s = run(sc, 6, [...RN.slice(0, RN.indexOf('heparin')), 'sample', 'opqrst', 'reassess']);
    expect(s.fired).toContain('heparin-fallback');
    expect(s.flags.heparin).toBeDefined();
    expect(missed(s)).toContain('Heparin on the physician\'s order');
  });

  it('the first troponin never drawn: the physician has it drawn at 15 minutes, and the item is missed', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'ecg-posterior', 'monitor', 'aspirin', 'iv', 'heparin', ...R(4)]);
    expect(s.fired).toContain('rn-physician-labs');
    expect(s.flags.labs).toBeGreaterThanOrEqual(15);
    expect(missed(s)).toContain('IV access, and the first troponin drawn');
  });

  it('the physician admits her once the first troponin is back and the heparin is in: no P2Y12, the repeat due at the hour', () => {
    const s = run(sc, 6, RN_TO_DISPO);
    expect(s.fired).toContain('rn-dispo');
    for (const f of ['dispo', 'admit', 'p2y12-hold']) expect(s.flags[f], f).toBeDefined();
    const text = said(s, 'physician').find((t) => /I've talked to cardiology/.test(t))!;
    expect(text).toMatch(/No ticagrelor until they've seen her arteries/);
    expect(text).toMatch(/due one hour after the first, at 65:00/);
    expect(s.flags['ordered:p2y12']).toBeUndefined();
    // admitted, she still boards until the bed is ready
    const early = perform(sc, s, 'handoff');
    expect(early.counts.handoff).toBeUndefined();
    expect(early.log.at(-1)!.text).toMatch(/step-down bed is not ready yet/);
  });

  it('the returning pain: nitroglycerin eases it at once and it settles 8 minutes later; a second dose takes it away', () => {
    const one = run(sc, 6, [...RN_TO_PAIN, 'ecg12-repeat', 'nitro']);
    expect(one.vitals.pain).toBe(2);
    expect(one.rhythm.hr).toBe(96);
    expect(said(one, 'monitor').at(-1)).toBe(`Heart rate 96. BP ${one.vitals.sbp}/${one.vitals.dbp}.`);
    const settled = run(sc, 6, [...RN_TO_PAIN, 'ecg12-repeat', 'nitro', ...R(4)]);
    expect(settled.flags['pain-relieved']).toBe(settled.flags['nitro-for-pain'] + 8);
    expect(settled.vitals.pain).toBe(0);
    const two = run(sc, 6, [...RN_TO_PAIN, 'ecg12-repeat', 'nitro', 'reassess', 'reassess', 'nitro']);
    expect(two.flags['pain-relieved']).toBeDefined();
    expect(two.vitals.pain).toBe(0);
    expect(two.rhythm.hr).toBe(90);
    expect(ids(two)).toEqual([]);
    // pain-free, nitroglycerin has nothing to relieve: the default (the pressure falls), no penalty
    const free = run(sc, 6, ['triage', 'nitro']);
    expect(free.vitals.sbp).toBeLessThan(138);
    expect(free.flags['nitro-for-pain']).toBeUndefined();
  });

  it('the returning pain left alone: the physician walks in at 10 minutes and gives the nitroglycerin at 12, and the items are missed', () => {
    const s = run(sc, 6, [...RN_TO_PAIN, ...R(6)]);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-physician-pain', 'rn-physician-nitro', 'rn-physician-ecg-pain']));
    expect(said(s, 'physician').some((t) => /came back ten minutes ago and nobody told me/.test(t))).toBe(true);
    expect(s.flags['nitro-for-pain']).toBeDefined();
    expect(missed(s)).toEqual(expect.arrayContaining([
      'A new 12-lead within 10 minutes of the returning pain',
      'Nitroglycerin 0.4 mg for the returning pain, on the standing order',
      'Report the returning pain to the ED physician',
    ]));
  });

  it('the repeat troponin: drawn too soon it does not count; at the hour it does; forgotten, the physician asks, and late is half', () => {
    const early = run(sc, 6, [...RN_TO_DISPO, 'troponin-repeat']);
    expect(early.flags['trop-early']).toBeDefined();
    expect(early.flags['trop2-drawn']).toBeUndefined();
    expect(said(early, 'hospital').at(-1)).toMatch(/too soon after the first sample/);
    // the second draw, at the hour, is the one that counts
    const later = run(sc, 6, [...RN.slice(0, RN.indexOf('opqrst') + 1), 'troponin-repeat', ...RN.slice(RN.indexOf('opqrst') + 1)]);
    expect(later.flags['trop2-drawn']).toBeDefined();
    expect(review(sc, later).toFix).toEqual([]);
    // forgotten until 77:30: the physician asks at the hour plus 10, and the item is late
    const tardy = run(sc, 6, [...RN.slice(0, RN.indexOf('troponin-repeat')), ...R(6), 'troponin-repeat']);
    expect(tardy.fired).toContain('rn-trop-reminder');
    expect(said(tardy, 'physician').some((t) => /Has her one-hour troponin gone\? It was due at 65:00/.test(t))).toBe(true);
    expect(late(tardy)).toContain('Repeat troponin drawn on time: one hour after the first');
    // drawn at 50 minutes or more it is the 1-hour sample
    const fifty = run(sc, 6, [...RN.slice(0, RN.indexOf('troponin-repeat') - 5), 'troponin-repeat']);
    expect(fifty.flags['trop2-drawn']).toBeDefined();
  });
});

describe('NSTE-ACS in the ED: the ER doctor\'s responders', () => {
  it('the computer nurse records the 12-lead, draws the first troponin with the line, and asks about aspirin', () => {
    const s = run(sc, 7, ['opqrst', 'sample', 'reassess', 'reassess', 'reassess']);
    expect(s.flags.ecg12).toBe(2);
    expect(s.flags.labs).toBe(4);
    expect(s.flags.iv).toBe(4);
    expect(s.fired).toContain('md-aspirin-ask');
    expect(missed(s)).toContain('Aspirin 162–325 mg chewed — on top of her daily 81 mg');
  });

  it('the serial troponin: ordered early, the nurse draws it at the hour; ordered twice, refused; never ordered, the nurse asks and it is late', () => {
    const s = run(sc, 7, MD.slice(0, 6));
    expect(said(s, 'nurse').at(-1)).toMatch(/I'll draw it at 63:00/);
    const twice = perform(sc, s, 'troponin-repeat');
    expect(twice.counts['troponin-repeat']).toBe(1);
    expect(twice.log.at(-1)!.text).toMatch(/already ordered/);
    const none = run(sc, 7, [...MD.filter((id, i) => !(id === 'troponin-repeat' && i < 10))]);
    expect(none.fired).toContain('md-trop-ask');
    expect(late(run(sc, 7, [...MD_TO_PAIN.filter((id) => id !== 'troponin-repeat'), 'ecg12-repeat', 'nitro', ...R(20), 'troponin-repeat'])))
      .toContain('The serial troponin: order the repeat for 1 hour after the first');
  });

  it('cardiology answers for the moment: the troponin pending, the pain back, the pain settled', () => {
    const pending = run(sc, 7, [...MD.slice(0, 6), 'consult-cardiology']);
    expect(said(pending, 'consultant').at(-1)).toMatch(/the troponin still pending/);
    expect(said(pending, 'consultant').at(-1)).toMatch(/Hold the P2Y12 until I've seen her arteries/);
    expect(pending.flags['p2y12-hold']).toBeDefined();
    const pain = run(sc, 7, [...MD_TO_PAIN, 'consult-cardiology']);
    expect(said(pain, 'consultant').at(-1)).toMatch(/Pain back at rest\? A 12-lead with the pain, please — now\. Nitroglycerin now/);
    expect(said(pain, 'consultant').at(-1)).not.toMatch(/P2Y12/);
    const treated = run(sc, 7, [...MD_TO_PAIN, 'ecg12-repeat', 'nitro', 'consult-cardiology']);
    expect(said(treated, 'consultant').at(-1)).toMatch(/good that you repeated it\. Another nitroglycerin in 5 minutes/);
    const settled = run(sc, 7, [...MD_TO_PAIN, 'ecg12-repeat', 'nitro', ...R(4), 'consult-cardiology']);
    expect(said(settled, 'consultant').at(-1)).toMatch(/Good that it settled/);
  });

  it('admitted, she boards until the bed is ready; then the hand-off', () => {
    const s = run(sc, 7, MD.slice(0, MD.indexOf('admit') + 1));
    expect(said(s, 'hospital').at(-1)).toMatch(/cardiac step-down unit, for angiography within 24 hours\. The bed should be ready at about 70:00/);
    const early = perform(sc, s, 'handoff');
    expect(early.counts.handoff).toBeUndefined();
    const ready = run(sc, 7, MD);
    expect(ready.flags['bed-ready']).toBeGreaterThanOrEqual(70);
  });

  it('the returning pain left alone: the nurse gives nitroglycerin on the standing order at 12 minutes, and the doctor\'s items are missed', () => {
    const s = run(sc, 7, [...MD_TO_PAIN, ...R(6)]);
    expect(s.fired).toEqual(expect.arrayContaining(['md-nurse-ecg-pain', 'md-nurse-nitro']));
    expect(said(s, 'nurse').some((t) => /nitroglycerin on the chest pain standing order/.test(t))).toBe(true);
    expect(missed(s)).toEqual(expect.arrayContaining(['A new 12-lead within 10 minutes of the returning pain', 'Nitroglycerin for the returning pain']));
  });

  it('no plan after the first troponin: the nurse asks, and heparin, the consult and the admission are missed or late', () => {
    const s = run(sc, 7, ['opqrst', 'sample', 'ecg-posterior', 'aspirin', ...R(14)]);
    expect(s.fired).toContain('md-plan-nudge');
    expect(missed(s)).toEqual(expect.arrayContaining([
      'Anticoagulation: unfractionated heparin', 'Consult cardiology: the timing of angiography and the P2Y12 decision',
      'Admit her for an early invasive strategy (angiography within 24 hours)',
    ]));
  });
});

describe('NSTE-ACS in the ED: what the independent review fixed', () => {
  it('describes the tracing as the profile draws it: ST depression deepest in V5, aVR up, nothing up in V7–V9', () => {
    const p = resolveProfile('nstemi');
    const twelve = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;
    const deepest = twelve.reduce((a, b) => (stLevel(p, b) < stLevel(p, a) ? b : a));
    expect(deepest).toBe('V5');
    expect(stLevel(p, 'aVR')).toBeGreaterThanOrEqual(1);
    for (const l of ['I', 'II', 'V4', 'V5', 'V6'] as const) expect(stLevel(p, l), l).toBeLessThanOrEqual(-0.95);
    for (const l of ['V7', 'V8', 'V9'] as const) expect(stLevel(p, l), l).toBeLessThan(0.5);
    // the feedback says so, and the physician's order for V7–V9 does not call it the mirror image of a posterior STEMI
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician']);
    expect(s.log.find((l) => l.who === 'feedback')!.text).toMatch(/deepest in V5; less in aVF and V3\), and about 1 mm of ST elevation in aVR/);
    const ask = said(s, 'physician').find((t) => /V7, V8 and V9/.test(t))!;
    expect(ask).toMatch(/a circumflex occlusion can hide from the standard 12 leads/);
    expect(ask).not.toMatch(/mirror image/);
  });

  it('heparin given before the order: one penalty, no second bolus — the physician writes the order after the fact', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'iv', 'heparin', 'ecg-posterior', 'labs', 'monitor', 'aspirin', ...R(6)]);
    expect(ids(s)).toEqual(['rn-without-order-heparin']);
    expect(s.fired).toContain('rn-heparin-unordered');
    expect(s.fired).not.toContain('heparin-ask');
    expect(s.fired).not.toContain('heparin-fallback');
    expect(said(s, 'physician').some((t) => /Nobody had ordered it — heparin is not on the chest pain standing order/.test(t))).toBe(true);
    expect(said(s, 'physician').some((t) => /hung myself/.test(t))).toBe(false);
    // the order item never applies (the penalty is the cost), and she is still admitted
    expect(toFix(s).map((t) => t.label)).not.toContain('Heparin on the physician\'s order');
    expect(s.flags.dispo).toBeDefined();
    // the labs drawn after the bolus have no baseline aPTT, and say so
    expect(said(s, 'team').some((t) => /aPTT \(drawn after the heparin bolus: no baseline\)/.test(t))).toBe(true);
    expect(said(s, 'hospital').some((t) => /aPTT 78 s \(drawn after the heparin bolus\)/.test(t))).toBe(true);
    expect(said(run(sc, 6, RN_TO_DISPO), 'hospital').some((t) => /aPTT 29 s;/.test(t))).toBe(true);
  });

  it('the physician\'s heparin when nobody started a line: another nurse puts one in first', () => {
    const s = run(sc, 6, ['triage', ...R(13)]);
    expect(s.fired).toContain('heparin-fallback');
    expect(said(s, 'team').some((t) => /Another nurse puts an 18-gauge line in her right forearm, and the heparin goes up/.test(t))).toBe(true);
    expect(s.flags.iv).toBe(s.flags.heparin);
  });

  it('a fibrinolytic the nurse started: the physician stops it and hangs no heparin on top; she is still admitted', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'iv', 'alteplase', 'labs', 'monitor', 'aspirin', 'ecg-posterior', ...R(5)]);
    expect(ids(s)).toEqual(['rn-lytic-st-depression']);
    expect(said(s, 'physician').some((t) => /Alteplase is running\? Nobody ordered a fibrinolytic — stop it now/.test(t))).toBe(true);
    expect(s.fired).not.toContain('heparin-ask');
    expect(s.flags.heparin).toBeUndefined();
    expect(s.flags.dispo).toBeDefined();
  });

  it('when the physician had to record the 12-lead, it is missed once (not also as a tracing never shown)', () => {
    const s = run(sc, 6, ['triage', ...R(8)]);
    expect(s.fired).toContain('rn-physician-ecg');
    const labels = toFix(s).map((t) => t.label);
    expect(labels).toContain('12-lead within 10 minutes of arrival');
    expect(labels).not.toContain('Show the 12-lead to the ED physician the moment it prints');
  });

  it('aspirin at 12 minutes is on time for the nurse, as the department\'s door-to-aspirin goal says', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'ecg-posterior', 'monitor', 'iv', 'labs', ...R(2), 'aspirin']);
    expect(timing(s, 'Door to aspirin')).toMatchObject({ met: true });
    expect(late(s)).not.toContain('Aspirin 324 mg chewed, on the chest pain standing order');
  });

  it('a tracing recorded after the pain has settled is not explained as one with the pain', () => {
    const s = run(sc, 6, ['triage', 'monitor', 'iv', 'labs', 'aspirin', ...R(22), 'ecg12']);
    expect(s.flags['pain-relieved']).toBeLessThanOrEqual(s.flags.ecg12);
    const explained = s.log.filter((l) => l.who === 'feedback').at(-1)!.text;
    expect(explained).not.toMatch(/Recorded with the pain back/);
    expect(explained).toMatch(/^Correct\. Sinus rhythm 90/);
  });

  it('a 12-lead being recorded as the pain comes back is the tracing with the pain: it counts for both roles, and nobody repeats it', () => {
    // the ER doctor: started at 28:30, recorded at 30:00 as the pain comes back
    const md = run(sc, 7, [...MD_TO_PAIN.slice(0, -1), 'ecg12-repeat', 'nitro', ...R(6)]);
    expect(md.flags['ecg-at-pain']).toBe(md.flags['pain-back']);
    expect(md.reads).toHaveLength(2);
    expect(md.fired).not.toContain('md-nurse-ecg-pain');
    expect(toFix(md).map((t) => t.label)).not.toContain('A new 12-lead within 10 minutes of the returning pain');
    expect(timing(md, 'New pain to a new 12-lead')).toMatchObject({ minute: 0, met: true });
    // the ER nurse: the same
    const rn = run(sc, 6, [...RN_TO_PAIN.slice(0, -1), 'ecg12-repeat', 'nitro', 'notify-physician', ...R(6)]);
    expect(rn.flags['ecg-at-pain']).toBe(rn.flags['pain-back']);
    expect(rn.fired).not.toContain('rn-physician-ecg-pain');
    expect(toFix(rn).map((t) => t.label)).not.toContain('A new 12-lead within 10 minutes of the returning pain');
    // one finished before the pain came is not a tracing with the pain: the colleague records one, and the item is missed
    const before = run(sc, 7, [...MD_TO_PAIN.slice(0, -2), 'ecg12-repeat', ...R(7)]);
    expect(before.flags['ecg-at-pain']).toBeUndefined();
    expect(before.fired).toContain('md-nurse-ecg-pain');
    expect(missed(before)).toContain('A new 12-lead within 10 minutes of the returning pain');
  });

  it('cardiology called before there is a 12-lead: no plan, nothing named, no P2Y12 hold, and the call does not count; admission waits for the 12-lead', () => {
    const s = run(sc, 7, ['consult-cardiology', 'admit']);
    const reply = said(s, 'consultant').at(-1)!;
    expect(reply).toMatch(/what does her 12-lead show\? Get me the tracing/);
    expect(reply).not.toMatch(/STEMI|NSTE|ischemi|aVR|GRACE/);
    expect(s.flags['p2y12-hold']).toBeUndefined();
    expect(s.counts.admit).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/^Admit her for what\? Look at her 12-lead first/);
    expect(missed(run(sc, 7, ['consult-cardiology', 'opqrst', 'sample']))).toContain('Consult cardiology: the timing of angiography and the P2Y12 decision');
    // called again with the 12-lead in hand: the plan, and the item
    const again = run(sc, 7, ['consult-cardiology', 'opqrst', 'sample', 'consult-cardiology', 'admit']);
    expect(said(again, 'consultant').at(-1)).toMatch(/high-risk NSTE-ACS — her GRACE score is over 140/);
    expect(again.flags['p2y12-hold']).toBeDefined();
    expect(again.flags.admit).toBeDefined();
    expect(missed(again)).not.toContain('Consult cardiology: the timing of angiography and the P2Y12 decision');
  });

  it('a first call to cardiology during or after the returning pain still gives the plan: admit her, hold the P2Y12', () => {
    const noCall = [...MD_TO_PAIN.filter((id) => id !== 'consult-cardiology' && id !== 'admit'), 'reassess'];
    const during = run(sc, 7, [...noCall, 'ecg12-repeat', 'consult-cardiology']);
    expect(during.flags['pain-back']).toBeDefined();
    expect(said(during, 'consultant').at(-1)).toMatch(/Pain back at rest\?.*admit her to us\. Hold the P2Y12 until I've seen her arteries/);
    expect(during.flags['p2y12-hold']).toBeDefined();
    const after = run(sc, 7, [...noCall, 'ecg12-repeat', 'nitro', ...R(5), 'consult-cardiology']);
    expect(said(after, 'consultant').at(-1)).toMatch(/Good that it settled.*her GRACE score is over 140.*admit her to us on the step-down unit/);
    // a P2Y12 the doctor already gave is not "held" afterwards
    const given = run(sc, 7, [...MD.slice(0, 6), 'p2y12', ...R(3), 'consult-cardiology', 'admit', ...R(8), 'ecg12-repeat', 'nitro', ...R(4), 'consult-cardiology']);
    expect(said(given, 'consultant').at(-1)).toMatch(/Good that it settled/);
    expect(said(given, 'consultant').at(-1)).not.toMatch(/no P2Y12/);
    expect(given.flags['p2y12-hold']).toBeUndefined();
  });

  it('the declined activation during the pain speaks to the pain she has now', () => {
    const s = run(sc, 7, [...MD_TO_PAIN, 'cath-lab-activate']);
    expect(ids(s)).toEqual(['cath-lab-st-depression']);
    expect(said(s, 'consultant').at(-1)).toMatch(/Treat the pain she has now — nitroglycerin, the heparin running/);
  });

  it('the computer nurse never draws again what the doctor already drew', () => {
    const s = run(sc, 7, ['labs', 'opqrst', ...R(2)]);
    expect(said(s, 'nurse')).toContain('An 18-gauge in her right forearm, doctor; your bloods are already off.');
    expect(said(s, 'nurse').some((t) => /blood is off on the chest pain order/i.test(t))).toBe(false);
    expect(s.flags.labs).toBe(0.5);
  });
});
