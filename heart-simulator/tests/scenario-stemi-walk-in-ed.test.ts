/**
 * The walk-in anterior STEMI in the emergency department ('stemi-walk-in-ed'), played as the ER nurse (6) and the ER
 * doctor (7): the ideal runs, the department's timings, each trap (a slow or unshown 12-lead, nitroglycerin after tadalafil,
 * no aspirin, drugs without an order, waiting for a troponin or a repeat tracing, an IV beta-blocker with crackles, a lytic,
 * admission or transfer instead of the lab) and the responders behind them (the VF and the shock, the physician's
 * orders and fallbacks, the computer nurse, the interventional cardiologist).
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edStemiWalkIn as sc } from '@/lib/sim/scenario/scenarios/edStemiWalkIn';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState, who: Speaker) => s.log.filter((l) => l.who === who).map((l) => l.text);
const toFix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState) => toFix(s).filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => toFix(s).filter((t) => t.kind === 'late').map((t) => t.label);

/** A correct run for each role (the lead copies these into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  // the ER nurse: triage, the 12-lead and straight to the physician, aspirin, pads, a line, the ordered heparin and
  // ticagrelor, labs, the history that finds the tadalafil and the report of it, the ordered fentanyl; the VF shocked at
  // once with a call for help, the 12-lead after ROSC, and the hand-off once the lab is ready
  6: ['triage', 'ecg12', 'notify-physician', 'aspirin', 'pads', 'iv', 'heparin', 'p2y12', 'labs', 'sample', 'ask-pde5', 'notify-physician',
    'fentanyl', ...R(3), 'defib', 'call-help', 'ecg12-repeat', ...R(3), 'handoff'],
  // the ER doctor: the nurse's 12-lead read and the lab activated at once, aspirin, the history and the PDE-5 question,
  // heparin and ticagrelor as the interventional cardiologist asks, fentanyl instead of nitroglycerin; the VF shocked,
  // the 12-lead after ROSC, and the hand-off once the lab is ready
  7: ['primary', 'opqrst', 'cath-lab-activate', 'aspirin', 'sample', 'ask-pde5', 'heparin', 'p2y12', 'fentanyl', ...R(5), 'defib',
    'ecg12-repeat', ...R(3), 'handoff'],
};
const ROLES = [6, 7] as const;
const RN = IDEAL[6];
const MD = IDEAL[7];
/** The nurse up to the physician's activation, and the doctor up to his own */
const RN_TO_ALERT = RN.slice(0, 3);
const MD_TO_ALERT = MD.slice(0, 3);

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|anaesth/i;

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

describe('walk-in STEMI in the ED: the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to things that exist', () => {
    expect(sc.id).toBe('stemi-walk-in-ed');
    expect(sc.setting).toBe('ed');
    expect(sc.roles).toEqual([6, 7]);
    expect(sc.cathLabMinutes).toBe(20);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of ROLES) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      expect(criticalsFor(sc, role).length).toBeGreaterThan(5);
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

  it('keeps each role in its scope: the nurse never activates or gives a lytic on her own; the doctor does not triage', () => {
    const rn = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    const md = new Set(interventionsFor(7, 'ed').map((i) => i.id));
    for (const id of ['cath-lab-activate', 'tnk', 'admit', 'transfer', 'consult-cardiology']) expect(rn.has(id), id).toBe(false);
    for (const id of ['triage', 'notify-physician']) expect(md.has(id), id).toBe(false);
    expect(IDEAL[6].every((id) => rn.has(id) || id === 'reassess')).toBe(true);
    expect(IDEAL[7].every((id) => md.has(id) || id === 'reassess')).toBe(true);
  });

  it('speaks with the department\'s voices: the physician in the nurse\'s run, the nurse in the doctor\'s, never the lab or the field', () => {
    const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
    for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(line[0]);
    const rn = run(sc, 6, RN);
    const md = run(sc, 7, MD);
    for (const s of [rn, md]) for (const l of s.log) expect(NOT_IN_ED, `${l.who}: ${l.text}`).not.toContain(l.who);
    expect(said(rn, 'nurse')).toEqual([]);
    expect(said(md, 'physician')).toEqual([]);
    expect(said(md, 'consultant').length).toBeGreaterThan(0);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
    for (const t of [...sc.teaching, ...sc.critical.map((c) => c.why), ...sc.harms.map((h) => h.text)]) expect(t).not.toMatch(BRITISH);
  });
});

describe('walk-in STEMI in the ED: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      // the lab was activated, he fibrillated while the team was on its way, one shock brought him back
      for (const f of ['alert', 'dispo', 'cath-ready', 'arrest', 'rosc', 'handoff']) expect(s.flags[f], f).toBeDefined();
      expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 108 });
      expect(s.reads.map((r) => r.answer)).toEqual(['stemi-anterior', 'stemi-anterior']);
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      expect(s.log.some((l) => l.text === 'SBAR hand-off to the cath lab team; they take over.')).toBe(true);
      // no nitrate went near him
      expect(s.counts.nitro).toBeUndefined();
    });
  }

  it('times the department: the 12-lead within 10 minutes, the activation and aspirin soon after it, the shock at once', () => {
    for (const role of ROLES) {
      const t = Object.fromEntries(review(sc, run(sc, role, IDEAL[role])).timings.map((x) => [x.label, x]));
      expect(t['Door to 12-lead'].minute, `role ${role}`).toBeLessThanOrEqual(3);
      expect(t['12-lead to cath lab activation'].minute).toBeLessThanOrEqual(1);
      expect(t['Door to aspirin'].met).toBe(true);
      expect(t['First shock after VF began'].minute).toBe(0);
      expect(t['Door to the cath lab team (goal: a device within 90 minutes of arrival)'].minute).toBeLessThan(30);
    }
  });

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nothing names the diagnosis before the learner reads the first 12-lead', () => {
    const before = { 6: ['triage', 'ecg12'], 7: ['primary', 'opqrst'] } as const;
    for (const role of ROLES) {
      const s = run(sc, role, [...before[role]], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'ecg', answer: 'stemi-anterior' });
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(/STEMI|infarct|occlu|LAD|heart attack/i);
    }
  });
});

describe('walk-in STEMI in the ED: the ER nurse', () => {
  it('a slow 12-lead: the physician asks for it at 10 minutes, the item and the door-to-ECG time are late', () => {
    const s = run(sc, 6, ['triage', 'opqrst', 'sample', 'vitals', 'monitor', 'iv', 'labs', 'reassess', 'reassess', 'ecg12']);
    expect(s.log.some((l) => l.who === 'physician' && /within 10 minutes of walking in/.test(l.text))).toBe(true);
    expect(late(s)).toContain('12-lead within 10 minutes of arrival — before registration or a chair in the waiting room');
    expect(review(sc, stop(s)).timings.find((t) => t.label === 'Door to 12-lead')!.met).toBe(false);
  });

  it('no 12-lead at all: the physician records it and activates the lab, and the nurse\'s items are missed', () => {
    const s = run(sc, 6, ['triage', 'opqrst', 'sample', 'vitals', 'monitor', 'iv', 'labs', ...R(3)]);
    expect(s.flags['physician-ecg']).toBeDefined();
    expect(s.flags.alert).toBeDefined();
    expect(s.flags['ecg-stemi']).toBeDefined();
    expect(missed(s)).toEqual(expect.arrayContaining([
      '12-lead within 10 minutes of arrival — before registration or a chair in the waiting room',
      'Show the 12-lead to the ED physician the moment it prints',
    ]));
  });

  it('a 12-lead left on the printer: the physician finds it 5 minutes later, and showing it is missed', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'aspirin', 'pads', 'iv', 'labs', 'reassess']);
    expect(s.fired).toContain('rn-physician-sees-ecg');
    expect(s.flags.alert).toBeGreaterThanOrEqual(s.flags.ecg12 + 5);
    expect(said(s, 'physician').some((t) => /printer/.test(t))).toBe(true);
    expect(missed(s)).toContain('Show the 12-lead to the ED physician the moment it prints');
    // shown at once, the physician activates on the spot
    expect(run(sc, 6, RN_TO_ALERT).flags.alert).toBeDefined();
  });

  it('a report before the 12-lead gets "get me a 12-lead now", and no activation', () => {
    const s = run(sc, 6, ['notify-physician']);
    expect(said(s, 'physician').at(-1)).toMatch(/Get me a 12-lead right now/);
    expect(s.flags.alert).toBeUndefined();
    expect(ids(s)).toEqual([]);
  });

  it('no aspirin: the item is missed', () => {
    const s = run(sc, 6, RN.filter((id) => id !== 'aspirin'));
    expect(missed(s)).toContain('Aspirin 324 mg chewed, on the chest pain standing order');
  });

  it('heparin, ticagrelor and fentanyl need the physician\'s order; aspirin is on the standing order', () => {
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'iv', 'heparin', 'p2y12', 'fentanyl']))).toEqual([
      'rn-without-order-heparin', 'rn-without-order-p2y12', 'rn-without-order-fentanyl',
    ]);
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'aspirin', 'iv', 'labs']))).toEqual([]);
    // each order comes as an ask in the physician's voice, and full marks when answered at once
    const s = run(sc, 6, RN.slice(0, RN.indexOf('fentanyl') + 1));
    expect(said(s, 'physician').filter((t) => /Heparin 4,000|ticagrelor 180|Fentanyl 50/.test(t))).toHaveLength(3);
    expect(ids(s)).toEqual([]);
  });

  it('an unanswered order falls back to the physician, and the item is missed', () => {
    const s = run(sc, 6, [...RN_TO_ALERT, 'aspirin', 'pads', 'iv', 'labs', ...R(3)]);
    expect(s.fired).toContain('heparin-fallback');
    expect(s.flags.heparin).toBeDefined();
    expect(missed(s)).toContain('Heparin on the physician\'s order');
  });

  it('nitroglycerin on the standing order, with or without asking: the pressure crashes, one penalty, and the physician takes over the pain', () => {
    for (const steps of [['triage', 'ecg12', 'notify-physician', 'nitro'], ['triage', 'ecg12', 'notify-physician', 'ask-pde5', 'nitro']]) {
      const s = run(sc, 6, steps);
      expect(ids(s), steps.join()).toEqual(['nitro-pde5']);
      expect(s.vitals.sbp).toBeLessThan(90);
      expect(s.log.some((l) => l.who === 'monitor' && l.text === `BP ${s.vitals.sbp}/${s.vitals.dbp}.`)).toBe(true);
      expect(said(s, 'physician').some((t) => /tadalafil this morning\. No more nitrates/.test(t))).toBe(true);
      // the physician knows now, but holds the opioid while the systolic is under 90: it comes once a bolus brings it up
      expect(s.flags['physician-knows-pde5']).toBeDefined();
      expect(s.flags['asked-fentanyl']).toBeUndefined();
      const bolus = run(sc, 6, [...steps, 'iv', 'fluid']);
      expect(bolus.vitals.sbp).toBeGreaterThanOrEqual(90);
      expect(bolus.flags['asked-fentanyl']).toBeDefined();
      expect(ids(bolus), steps.join()).toEqual(['nitro-pde5']);
    }
    // the high dose: the same one penalty, not also "without an order" or "not hypertensive"
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'nitro-high']))).toEqual(['nitro-pde5']);
  });

  it('a small bolus brings the crashed pressure back up', () => {
    const crashed = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'nitro', 'iv']);
    const s = perform(sc, crashed, 'fluid');
    expect(s.vitals.sbp).toBeGreaterThan(crashed.vitals.sbp);
    expect(ids(s)).toEqual(['nitro-pde5']);
  });

  it('the tadalafil: reported, the fentanyl order comes at once; not reported, the physician finds out at 12 minutes', () => {
    const reported = run(sc, 6, RN.slice(0, RN.lastIndexOf('notify-physician') + 1));
    expect(reported.flags['pde5-reported']).toBeDefined();
    expect(reported.flags['asked-fentanyl']).toBe(reported.flags['pde5-reported']);
    const silent = run(sc, 6, [...RN.slice(0, RN.indexOf('ask-pde5') + 1), ...R(2)]);
    expect(silent.flags['physician-knows-pde5']).toBeDefined();
    expect(silent.flags['asked-fentanyl']).toBeDefined();
    expect(missed(silent)).toContain('Hold the nitroglycerin and tell the physician about the tadalafil');
  });

  it('IV metoprolol: the pressure falls and the lungs fill — one penalty, not also "without an order"', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'iv', 'metoprolol']);
    expect(ids(s)).toEqual(['rn-rate-drug-heart-failure']);
    expect(s.vitals.sbp).toBeLessThan(146);
    expect(s.flags['worse-hf']).toBeDefined();
    expect(run(sc, 6, ['triage', 'ecg12', 'iv', 'metoprolol', 'lungs']).log.at(-1)!.text).toMatch(/a third of the way up/);
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'iv', 'diltiazem']))).toEqual(['rn-rate-drug-heart-failure']);
  });

  it('oxygen with an SpO₂ of 94 % costs points; after ROSC it is titrated care', () => {
    expect(ids(run(sc, 6, ['triage', 'o2-nc']))).toEqual(['oxygen-normoxic']);
    const rosc = RN.slice(0, RN.indexOf('call-help') + 1);
    expect(ids(run(sc, 6, [...rosc, 'o2-nc']))).toEqual([]);
  });

  it('the hand-off waits for the lab team', () => {
    const s = run(sc, 6, RN.slice(0, RN.indexOf('ecg12-repeat') + 1));
    expect(s.flags['cath-ready']).toBeUndefined();
    expect(unavailableReason(sc, s, 'handoff')).toBeNull();
    const tried = perform(sc, s, 'handoff');
    expect(tried.ended).toBeNull();
    expect(tried.log.at(-1)!.text).toMatch(/still on its way/);
  });

  it('VF: a call for help with the shock is the nurse\'s item, and the physician comes into the room', () => {
    const s = run(sc, 6, RN.slice(0, RN.indexOf('call-help') + 1));
    expect(s.fired).toContain('rn-rosc');
    const noCall = run(sc, 6, [...RN.slice(0, RN.indexOf('defib') + 1), 'ecg12-repeat', ...R(3), 'handoff']);
    expect(missed(noCall)).toContain('Call for help as you shock');
    expect(noCall.fired).toContain('rn-rosc');
  });
});

describe('walk-in STEMI in the ED: the ER doctor', () => {
  it('the computer nurse records the 12-lead, starts the line, puts the pads on and draws the blood', () => {
    const s = run(sc, 7, MD.slice(0, 5));
    for (const f of ['monitor', 'ecg12', 'iv', 'labs', 'pads']) expect(s.flags[f], f).toBeDefined();
    expect(s.flags.ecg12).toBe(2);
    expect(said(s, 'nurse')[1]).toBe('Doctor — the 12-lead on bed 3.');
    // a line the doctor placed first is not placed twice
    expect(said(run(sc, 7, ['iv', 'reassess', 'reassess']), 'nurse').some((t) => /^Blood is off for troponin/.test(t))).toBe(true);
  });

  it('activation: the interventional cardiologist calls back for ticagrelor and heparin; late activation earns half', () => {
    const s = run(sc, 7, MD.slice(0, 5));
    expect(said(s, 'consultant').join(' ')).toMatch(/ticagrelor 180 milligrams now, and heparin 60 units a kilo/);
    const slow = run(sc, 7, ['primary', 'opqrst', 'sample', ...R(5), 'cath-lab-activate']);
    expect(slow.fired).toContain('md-nudge');
    expect(late(slow)).toContain('Read the 12-lead and activate the cath lab — no troponin, no repeat tracing first');
    expect(ids(slow)).toEqual([]);
  });

  it('waiting on a troponin or a repeat 12-lead before activating costs points; after it, or after ROSC, it is fine', () => {
    const wait = run(sc, 7, ['primary', 'opqrst', 'reassess', 'troponin-repeat']);
    expect(ids(wait)).toEqual(['troponin-before-activation']);
    expect(said(wait, 'nurse').at(-1)).toMatch(/Are we waiting for it/);
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'reassess', 'troponin-repeat']))).toEqual([]);
    expect(ids(run(sc, 7, ['primary', 'opqrst', 'ecg12-repeat']))).toEqual(['repeat-ecg-before-activation']);
    expect(ids(run(sc, 7, ['primary', 'opqrst', 'ecg12']))).toEqual(['repeat-ecg-before-activation']);
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'ecg12-repeat']))).toEqual([]);
    // his own 12-lead first, before anyone has seen one, is no repeat
    expect(ids(run(sc, 7, ['ecg12']))).toEqual([]);
    // never activated, yet the 12-lead after ROSC is still right
    const rosc = run(sc, 7, ['primary', 'opqrst', 'aspirin', ...R(7), 'defib', 'ecg12-repeat']);
    expect(rosc.flags.rosc).toBeDefined();
    expect(ids(rosc)).not.toContain('repeat-ecg-before-activation');
  });

  it('a consult before activating costs nothing but time: the interventional cardiologist says activate', () => {
    const s = run(sc, 7, ['primary', 'opqrst', 'consult-cardiology']);
    expect(said(s, 'consultant').at(-1)).toMatch(/activate the lab/);
    expect(s.flags.alert).toBeUndefined();
    expect(ids(s)).toEqual([]);
  });

  it('admitting or transferring instead of the lab costs points; once the lab is activated neither is offered a second thought', () => {
    expect(run(sc, 7, ['primary', 'opqrst', 'admit']).penalties).toMatchObject([{ id: 'admit-no-reperfusion', severity: 'critical' }]);
    expect(ids(run(sc, 7, ['primary', 'opqrst', 'transfer']))).toEqual(['transfer-pci-here']);
    const active = run(sc, 7, MD_TO_ALERT);
    for (const id of ['admit', 'transfer']) {
      const s = perform(sc, active, id);
      expect(s.minute, id).toBe(active.minute);
      expect(s.counts[id], id).toBeUndefined();
      expect(ids(s), id).toEqual([]);
    }
  });

  it('a fibrinolytic in a hospital with a cath lab: one critical penalty, before or after the read', () => {
    for (const steps of [['iv', 'tnk'], ['primary', 'opqrst', 'iv', 'tnk'], [...MD_TO_ALERT, 'iv', 'tnk']]) {
      expect(run(sc, 7, steps).penalties, steps.join()).toMatchObject([{ id: 'lytic-pci-available', severity: 'critical' }]);
    }
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'iv', 'alteplase']))).toEqual(['lytic-pci-available']);
  });

  it('an IV beta-blocker or diltiazem with crackles costs points; a CT scan delays the lab', () => {
    const s = run(sc, 7, [...MD_TO_ALERT, 'iv', 'metoprolol']);
    expect(ids(s)).toEqual(['rate-drug-heart-failure']);
    expect(s.vitals.spo2).toBeLessThan(94);
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'iv', 'diltiazem']))).toEqual(['rate-drug-heart-failure']);
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'ct-urgent']))).toEqual(['ct-delays-reperfusion']);
  });

  it('nitroglycerin after tadalafil: the pressure crashes and the nurse says so', () => {
    const s = run(sc, 7, [...MD_TO_ALERT, 'nitro']);
    expect(ids(s)).toEqual(['nitro-pde5']);
    expect(s.vitals.sbp).toBeLessThan(90);
    expect(said(s, 'nurse').at(-1)).toMatch(/dropped to \d+\/\d+ right after the nitro/);
  });

  it('the nurse offers nitroglycerin at 6 minutes if nothing has been given for the pain; the decision is the doctor\'s', () => {
    const s = run(sc, 7, [...MD_TO_ALERT, 'aspirin', 'sample', 'ask-pde5', 'reassess']);
    expect(said(s, 'nurse').some((t) => /Nitroglycerin on the chest pain order, or something else/.test(t))).toBe(true);
    expect(run(sc, 7, MD).fired).not.toContain('md-nitro-ask');
  });

  it('the P2Y12 loaded before the interventional cardiologist calls is no mistake, and counts', () => {
    const s = run(sc, 7, ['primary', 'opqrst', 'p2y12', 'cath-lab-activate', 'aspirin', 'sample', 'ask-pde5', 'heparin', 'fentanyl', ...R(5), 'defib',
      'ecg12-repeat', ...R(3), 'handoff']);
    expectFullMarks(s);
  });
});

describe('walk-in STEMI in the ED: the VF', () => {
  it('comes about 15 minutes in whatever is done, while the lab team is still on its way', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role].slice(0, IDEAL[role].indexOf('defib')));
      expect(s.pulse, `role ${role}`).toBe(false);
      expect(s.rhythm.profile).toBe('vf');
      expect(s.flags.arrest).toBeGreaterThanOrEqual(15);
      expect(s.flags['cath-ready']).toBeUndefined();
      expect(unavailableReason(sc, s, 'handoff')).toBeNull();
      expect(perform(sc, s, 'handoff').ended).toBeNull();
    }
  });

  it('a shock within 2 minutes brings him back; a late first shock fails, and CPR then a second shock work', () => {
    const toVf = MD.slice(0, MD.indexOf('defib'));
    expect(run(sc, 7, [...toVf, 'defib']).pulse).toBe(true);
    expect(run(sc, 7, [...toVf, 'aed']).pulse).toBe(true);
    const lateShock = run(sc, 7, [...toVf, 'pulse-check', 'bvm', 'pulse-check', 'bvm', 'hs-ts', 'pulse-check', 'defib']);
    expect(lateShock.pulse).toBe(false);
    const back = run(sc, 7, [...toVf, 'pulse-check', 'bvm', 'pulse-check', 'bvm', 'hs-ts', 'pulse-check', 'defib', 'cpr', 'defib']);
    expect(back.pulse).toBe(true);
    expect(late(back)).toContain('Defibrillate the VF within 2 minutes');
  });

  it('left untreated, he dies', () => {
    let s = run(sc, 7, MD.slice(0, MD.indexOf('defib')));
    for (let i = 0; i < 10 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });
});

describe('walk-in STEMI in the ED: the physician\'s orders are fair to a nurse who does things in another sensible order', () => {
  /** The physician's order lines (the asks and the fallbacks), by minute */
  const orderLines = (s: SimState) => s.log.filter((l) => l.who === 'physician' && /Heparin 4,000|ticagrelor 180|Fentanyl 50|charge nurse/.test(l.text));

  it('the opioid is ordered once the 12-lead has been acted on: the tadalafil reported before the tracing, then the 12-lead, the line and the fentanyl', () => {
    const steps = ['triage', 'sample', 'ask-pde5', 'notify-physician', 'ecg12', 'notify-physician', 'iv', 'fentanyl', 'aspirin', 'pads', 'labs', 'heparin', 'p2y12',
      ...R(4), 'defib', 'call-help', 'ecg12-repeat', ...R(4), 'handoff'];
    const early = run(sc, 6, steps.slice(0, 4));
    expect(early.flags['pde5-reported']).toBeDefined();
    expect(early.flags['asked-fentanyl']).toBeUndefined();
    const s = run(sc, 6, steps);
    expect(s.flags['asked-fentanyl']).toBe(s.flags.alert);
    expect(s.fired).not.toContain('fentanyl-fallback');
    expect(toFix(s).map((t) => t.label)).not.toContain('Fentanyl for the pain, on the physician\'s order');
  });

  it('two IV orders at once and no line yet: the line first, then the heparin and the fentanyl, all on time', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'aspirin', 'sample', 'ask-pde5', 'notify-physician', 'pads', 'iv', 'heparin', 'fentanyl', 'p2y12',
      'labs', ...R(3), 'defib', 'call-help', 'ecg12-repeat', ...R(4), 'handoff']);
    expect(s.flags['asked-heparin']).toBe(s.flags['asked-fentanyl']);
    expect(s.flags.iv - s.flags['asked-heparin']).toBeGreaterThan(2);
    expectFullMarks(s);
  });

  it('no order is given, and none is taken over by someone else, while he is in cardiac arrest; an open one waits for the pulse', () => {
    const idle = run(sc, 6, R(16));
    expect(idle.ended?.reason).toBe('death');
    for (const l of orderLines(idle)) expect(l.minute, l.text).toBeLessThan(idle.flags.arrest);
    // the heparin order would have fallen due in the arrest: it waits, and comes after the shock
    const steps = ['triage', ...R(5), 'ecg12', 'notify-physician', ...R(2)];
    const before = run(sc, 6, steps);
    expect(before.flags.arrest).toBeDefined();
    expect(before.flags['asked-heparin']).toBeUndefined();
    const back = run(sc, 6, [...steps, 'defib', 'call-help']);
    expect(back.flags['asked-heparin']).toBeGreaterThanOrEqual(back.flags.rosc);
  });

  it('a drug already given is not ordered again: heparin and ticagrelor without an order cost one penalty each, and no second dose is asked for', () => {
    const s = run(sc, 6, ['iv', 'triage', 'ecg12', 'notify-physician', 'heparin', 'p2y12', 'aspirin', 'pads', ...R(3)]);
    expect(ids(s)).toEqual(['rn-without-order-heparin', 'rn-without-order-p2y12']);
    expect(s.flags['asked-heparin']).toBeUndefined();
    expect(s.flags['asked-p2y12']).toBeUndefined();
    expect(said(s, 'physician').some((t) => /Heparin 4,000|ticagrelor 180/.test(t))).toBe(false);
  });

  it('after the charge nurse has given an unanswered order, a second dose is refused: no time passes, nothing is counted, and the item is missed, not late', () => {
    let s = run(sc, 6, [...RN_TO_ALERT, 'aspirin', 'pads', 'labs', 'sample', 'ask-pde5', 'notify-physician', ...R(3)]);
    expect(s.fired).toEqual(expect.arrayContaining(['heparin-fallback', 'p2y12-fallback', 'fentanyl-fallback']));
    // the charge nurse started a line for the heparin
    expect(s.flags.iv).toBeDefined();
    expect(s.log.some((l) => l.who === 'team' && /charge nurse puts an 18-gauge/.test(l.text))).toBe(true);
    for (const id of ['heparin', 'p2y12', 'fentanyl']) {
      const again = perform(sc, s, id);
      expect(again.minute, id).toBe(s.minute);
      expect(again.counts[id], id).toBeUndefined();
      expect(again.log.at(-1)!.who, id).toBe('system');
    }
    s = stop(s);
    expect(missed(s)).toEqual(expect.arrayContaining(['Heparin on the physician\'s order', 'Ticagrelor on the physician\'s order', 'Fentanyl for the pain, on the physician\'s order']));
    expect(late(s)).toEqual([]);
  });

  it('the nurse\'s fentanyl order is one dose: a second one waits for a new order', () => {
    const s = run(sc, 6, RN.slice(0, RN.indexOf('fentanyl') + 1));
    const again = perform(sc, s, 'fentanyl');
    expect(again.minute).toBe(s.minute);
    expect(again.counts.fentanyl).toBe(1);
    // the ER doctor decides on more for himself
    const md = run(sc, 7, [...MD.slice(0, MD.indexOf('fentanyl') + 1), 'fentanyl']);
    expect(md.counts.fentanyl).toBe(2);
  });
});

describe('walk-in STEMI in the ED: the review says what happened', () => {
  it('asking about the PDE-5 inhibitors only after the nitrate is no screen: the item drops out and the harm says it', () => {
    for (const role of ROLES) {
      const label = role === 6 ? 'Ask about PDE-5 inhibitors and riociguat before any nitrate — by name' : 'Ask about PDE-5 inhibitors and riociguat before any nitrate';
      const pre = role === 6 ? ['triage', 'ecg12', 'notify-physician'] : MD_TO_ALERT;
      const after = run(sc, role, [...pre, 'nitro', 'ask-pde5']);
      expect(ids(after), `role ${role}`).toEqual(['nitro-pde5']);
      const r = review(sc, stop(after));
      expect(r.wentWell.map((w) => w.label), `role ${role}`).not.toContain(label);
      expect(r.toFix.map((t) => t.label), `role ${role}`).not.toContain(label);
      // asked first: it counts, even though the nitrate came after (the harm scores that)
      const first = review(sc, stop(run(sc, role, [...pre, 'ask-pde5', 'nitro'])));
      expect(first.wentWell.map((w) => w.label), `role ${role}`).toContain(label);
    }
  });

  it('a nitrate given after he named the tadalafil was not held: no credit for "hold the nitroglycerin", and the physician says she knew', () => {
    const s = run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'sample', 'ask-pde5', 'notify-physician', 'nitro']);
    expect(ids(s)).toEqual(['nitro-pde5']);
    expect(said(s, 'physician').at(-1)).toMatch(/You told me he took tadalafil this morning!/);
    const r = review(sc, stop(s));
    const label = 'Hold the nitroglycerin and tell the physician about the tadalafil';
    expect(r.wentWell.map((w) => w.label)).not.toContain(label);
    expect(r.toFix.map((t) => t.label)).not.toContain(label);
  });
});

describe('walk-in STEMI in the ED: the patient behaves as his heart would', () => {
  it('IV diltiazem fills the lungs as metoprolol does; oxygen for the falling saturation is then no mistake', () => {
    for (const drug of ['metoprolol', 'diltiazem']) {
      const s = run(sc, 7, [...MD_TO_ALERT, 'iv', drug]);
      expect(ids(s), drug).toEqual(['rate-drug-heart-failure']);
      expect(s.vitals.spo2, drug).toBeLessThan(90);
      expect(s.vitals.sbp, drug).toBeLessThan(146);
      expect(s.flags['worse-hf'], drug).toBeDefined();
      expect(ids(perform(sc, s, 'o2-nrb')), drug).toEqual(['rate-drug-heart-failure']);
    }
  });

  it('the lab left unactivated 10 minutes after the tracing: his pump fails further, and stays failing after the shock', () => {
    const slow = run(sc, 7, ['primary', 'opqrst', 'sample', ...R(5)]);
    expect(slow.fired).toContain('pump-failing');
    expect(slow.flags['pump-failing'] ?? slow.flags['worse-hf']).toBeGreaterThanOrEqual(slow.flags['ecg-stemi'] + 10);
    expect(slow.vitals.spo2).toBeLessThanOrEqual(91);
    expect(slow.vitals.rr).toBe(24);
    expect(said(slow, 'nurse').some((t) => /more short of breath/.test(t))).toBe(true);
    // oxygen for it is no mistake
    expect(ids(perform(sc, slow, 'o2-nc'))).toEqual([]);
    const shocked = run(sc, 7, ['primary', 'opqrst', 'sample', ...R(6), 'defib']);
    expect(shocked.pulse).toBe(true);
    expect(shocked.vitals.spo2).toBe(90);
    // activated at once (and in every nurse's run, where the computer physician activates), it never happens
    for (const role of ROLES) expect(run(sc, role, IDEAL[role]).fired, `role ${role}`).not.toContain('pump-failing');
    expect(run(sc, 6, R(7)).fired).not.toContain('pump-failing');
  });

  it('every rhythm is a real profile, the vitals stay bounded and no monitor line names the rhythm, in the traps as in the ideal runs', () => {
    const runs: [6 | 7, string[]][] = [
      [6, ['triage', 'o2-nc', 'ecg12', 'notify-physician', 'nitro', 'nitro', 'iv', 'metoprolol', 'fluid', 'fluid', 'lidocaine', ...R(4), 'cpr', 'aed', 'cpr', 'aed', ...R(2)]],
      [7, ['ecg12', 'iv', 'nitro-high', 'diltiazem', 'metoprolol', 'push-epi', 'pressor', 'tnk', 'ct-urgent', 'admit', ...R(3), 'cpr', 'epinephrine', 'defib', 'amio-arrest', 'defib']],
      [7, R(16)],
    ];
    for (const [role, steps] of runs) {
      const s = run(sc, role, steps, (st) => {
        expect(resolveProfile(st.rhythm.profile).id).toBe(st.rhythm.profile);
        if (st.pulse) {
          expect(st.vitals.sbp).toBeGreaterThanOrEqual(50);
          expect(st.vitals.dbp).toBeLessThan(st.vitals.sbp);
          expect(st.vitals.spo2).toBeLessThanOrEqual(100);
        }
      });
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
      for (const l of s.log) expect(l.text).not.toMatch(BRITISH);
    }
  });
});

describe('walk-in STEMI in the ED: harmful care costs, correct care does not', () => {
  it('a prophylactic antiarrhythmic in his sinus rhythm costs once; after the VF and the shock it is the physician\'s call', () => {
    for (const drug of ['lidocaine', 'amio-infusion', 'procainamide']) {
      expect(ids(run(sc, 7, [...MD_TO_ALERT, 'iv', drug])), drug).toEqual(['antiarrhythmic-no-arrhythmia']);
      expect(ids(run(sc, 7, [...MD.slice(0, MD.indexOf('defib') + 1), drug])), drug).toEqual([]);
    }
    // the nurse: one penalty each — no arrhythmia and no order
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'iv', 'lidocaine']))).toEqual(['rn-lidocaine-no-arrhythmia']);
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'iv', 'amio-infusion']))).toEqual(['rn-without-order-amio-infusion']);
  });

  it('a fluid bolus with his wet lungs and a normal pressure costs; the bolus for the nitrate\'s drop does not', () => {
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'iv', 'fluid']))).toEqual(['fluid-wet-lungs']);
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'nitro', 'iv', 'fluid']))).toEqual(['nitro-pde5']);
    expect(ids(run(sc, 6, ['triage', 'ecg12', 'notify-physician', 'nitro', 'iv', 'fluid']))).toEqual(['nitro-pde5']);
  });

  it('a vasopressor with a normal pressure costs the doctor; for the pressure the nitrate dropped it does not', () => {
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'iv', 'pressor']))).toEqual(['pressor-normal-pressure']);
    expect(ids(run(sc, 7, [...MD_TO_ALERT, 'nitro', 'iv', 'push-epi']))).toEqual(['nitro-pde5']);
  });
});

describe('walk-in STEMI in the ED: the code in the nurse\'s run', () => {
  it('nobody called: the physician arrives on the alarm 2 minutes in and asks for the shock — the shock is still the nurse\'s', () => {
    const toVf = RN.slice(0, RN.indexOf('defib'));
    const s = run(sc, 6, [...toVf, 'pulse-check', 'cpr']);
    expect(s.pulse).toBe(false);
    expect(s.fired).toContain('rn-physician-at-code');
    expect(said(s, 'physician').at(-1)).toMatch(/^I'm here — I heard the alarm\. Is he shockable\?/);
    const back = run(sc, 6, [...toVf, 'pulse-check', 'cpr', 'defib', 'ecg12-repeat', ...R(4), 'handoff']);
    expect(back.pulse).toBe(true);
    // he is already in the room: no second "I'm here"
    expect(said(back, 'physician').filter((t) => /^I'm here/.test(t))).toHaveLength(1);
    expect(missed(back)).toContain('Call for help as you shock');
    // called at once: the team comes with the call, and the physician never needs to come on the alarm
    expect(run(sc, 6, RN).fired).not.toContain('rn-physician-at-code');
  });
});

describe('an order held through the arrest is judged again at ROSC', () => {
  // the fentanyl order comes late (the history taken after a pause), and the VF comes before anyone has given it
  const LATE_ORDER = ['triage', 'ecg12', 'notify-physician', 'aspirin', 'pads', 'iv', 'heparin', 'p2y12', 'labs', 'reassess', 'sample', 'ask-pde5',
    'notify-physician'];
  /** The same case with the pressure under 90 as the pulse comes back (an event before the orders') */
  const lowAfterRosc: typeof sc = {
    ...sc,
    events: [{ id: 'low-after-rosc', when: (s) => 'rosc' in s.flags, effect: () => ({ vitals: { sbp: 84, dbp: 50 } }) }, ...sc.events],
  };

  it('held in the arrest: no fallback while there is no pulse', () => {
    const s = run(sc, 6, [...LATE_ORDER, ...R(2)]);
    expect(s.pulse).toBe(false);
    expect(s.fired).toEqual(expect.arrayContaining(['fentanyl-ask', 'fentanyl-held']));
    expect(s.fired).not.toContain('fentanyl-fallback');
  });

  it('still right after ROSC (his pressure holds): the order goes on, and the fallback gives it', () => {
    const s = run(sc, 6, [...LATE_ORDER, ...R(2), 'defib']);
    expect(s.pulse).toBe(true);
    expect(s.flags['resumed:fentanyl']).toBeDefined();
    expect(s.flags['cancelled:fentanyl']).toBeUndefined();
    expect(s.fired).toContain('fentanyl-fallback');
    expect(criticalsFor(sc, 6).find((c) => c.id === 'ask-fentanyl')!.applies!(s)).toBe(true);
  });

  it('no longer right (a systolic under 90): cancelled with one line, no fallback, the item dropped, and the order gone', () => {
    const s = run(lowAfterRosc, 6, [...LATE_ORDER, ...R(2), 'defib']);
    expect(s.vitals.sbp).toBe(84);
    expect(s.flags['cancelled:fentanyl']).toBeDefined();
    expect(s.fired).not.toContain('fentanyl-fallback');
    expect(s.flags['ordered:fentanyl']).toBeUndefined();
    const lines = s.log.filter((l) => /cancels the order/.test(l.text));
    expect(lines).toEqual([{ minute: s.minute, who: 'team', text: 'After the arrest the physician cancels the order — fentanyl for the pain: his systolic is 84 now — no opioid until his pressure holds.' }]);
    // the item neither counts as missed nor as applicable
    expect(criticalsFor(lowAfterRosc, 6).find((c) => c.id === 'ask-fentanyl')!.applies!(s)).toBe(false);
    expect(review(lowAfterRosc, stop(s)).toFix.map((t) => t.label)).not.toContain('Fentanyl for the pain, on the physician\'s order');
    // later: still no fallback; given now, it is a dose with no order
    const later = run(lowAfterRosc, 6, [...LATE_ORDER, ...R(2), 'defib', ...R(4), 'fentanyl']);
    expect(later.fired).not.toContain('fentanyl-fallback');
    expect(later.fired).not.toContain('fentanyl-got');
    expect(ids(later)).toContain('rn-without-order-fentanyl');
  });
});
