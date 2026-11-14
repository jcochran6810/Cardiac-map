import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edDissection as sc } from '@/lib/sim/scenario/scenarios/edDissection';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import { readAfter, runScenario } from './helpers';

const nurse = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 6, steps, undefined, reads);
const doctor = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 7, steps, undefined, reads);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const saidBy = (s: SimState, who: Speaker) => s.log.filter((l) => l.who === who).map((l) => l.text).join('\n');
const last = (s: SimState) => s.log.at(-1)!.text;
const R = (n: number) => Array<string>(n).fill('reassess');
const toFix = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label));
const bp = (s: SimState) => [s.vitals.sbp, s.vitals.dbp];

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<6 | 7, string[]> = {
  6: ['triage', 'monitor', 'ecg12', 'bp-both-arms', 'opqrst', 'notify-physician', 'iv', 'metoprolol', 'fentanyl', 'labs', 'nitro', ...R(9), 'handoff'],
  7: ['opqrst', 'bp-both-arms', 'pocus', 'call-surgery', 'metoprolol', 'fentanyl', 'nitro', 'ct-urgent', ...R(5), 'handoff'],
};

/** The nurse's work up to the report, when the physician comes to the bedside (minute 6.5) */
const RN_REPORTED = ['triage', 'monitor', 'ecg12', 'bp-both-arms', 'opqrst', 'notify-physician'];
/** The doctor's assessment and bedside scan (minute 5; the nurse's lines are in from minute 2) */
const MD_ASSESSED = ['opqrst', 'bp-both-arms', 'pocus'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|hypertroph|LVH|dissect|aort|tamponade/i;
const DIAGNOSIS = /[Dd]issect|[Aa]ort|[Tt]amponade|\btype A\b/;
const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis|favour|anaesth/i;

describe('aortic dissection in the emergency department — the case itself', () => {
  it('is an ED case for the ER nurse and the ER doctor, and refers only to interventions, rhythms and conditions that exist', () => {
    expect(sc).toMatchObject({ id: 'aortic-dissection-ed', setting: 'ed', roles: [6, 7], conditionId: 'aortic-dissection' });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('aortic-dissection');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      // every rule can be broken by a role it applies to
      const roles = h.roles ?? sc.roles;
      expect(h.actions.some((id) => roles.some((r) => interventionsFor(r, 'ed').some((i) => i.id === id))), h.id).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // the built-in fibrinolytic rule reads it; the case words its own antithrombotic rules
    expect(sc.problems).toEqual(['aortic-dissection']);
  });

  it('each role has its own briefing and its own part', () => {
    expect(start(sc, 6).log.some((l) => /You are his nurse: triage, the monitor, the 12-lead/.test(l.text))).toBe(true);
    expect(start(sc, 7).log.some((l) => /You are the ED physician: the diagnosis, every order and where he goes are yours/.test(l.text))).toBe(true);
    expect(criticalsFor(sc, 6).map((c) => c.id)).toEqual([
      'rn-triage', 'rn-monitor', 'rn-ecg', 'rn-arms', 'rn-report', 'rn-iv', 'ask-rn-beta', 'ask-rn-fentanyl', 'ask-rn-vasodilator', 'rn-labs', 'handoff',
    ]);
    expect(criticalsFor(sc, 7).map((c) => c.id)).toEqual([
      'md-history', 'md-arms', 'md-pocus', 'md-rate', 'md-analgesia', 'md-vasodilator', 'md-ct', 'md-surgery', 'handoff',
    ]);
  });

  it('the nurse\'s part stays in nursing scope: no physician procedure, decision or prescription is hers', () => {
    const rn = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    for (const id of ['pocus', 'ct-urgent', 'call-surgery', 'cath-lab-activate', 'tnk', 'pericardiocentesis', 'admit', 'transfer']) expect(rn.has(id), id).toBe(false);
    // every drug she gives in the ideal run is on the physician's order (or on no order list at all): no penalty
    expect(nurse(IDEAL[6]).penalties).toEqual([]);
    expect(nurse(IDEAL[6]).log.filter((l) => l.who === 'physician' && /^"(Metoprolol|Fentanyl|His rate is controlled)/.test(l.text))).toHaveLength(3);
  });

  it('nothing the learner sees before the assessment names the diagnosis', () => {
    const opening = [sc.title, sc.summary, ...Object.values(sc.briefing).flat().map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/dissect|aort|tear|rip|arm\b|murmur/i);
    // the story is there for whoever looks: the sudden onset, and a hand reaching round to his back
    expect(opening).toMatch(/all at once/);
    expect(opening).toMatch(/reaching round to his back/);
  });

  it('no event line names the diagnosis, whatever state it fires in', () => {
    const states = [
      start(sc, 6), start(sc, 7), nurse([...RN_REPORTED, 'aspirin', 'nitro', 'iv']), doctor([...MD_ASSESSED, 'heparin', 'nitro']),
      doctor(R(21)), nurse(R(21)),
    ];
    for (const s of states) {
      for (const ev of sc.events) {
        const probe: SimState = {
          ...structuredClone(s),
          flags: { ...s.flags, 'md-here': 1, 'ct-ordered': 1, 'vasodilated': 1, labs: 1, tamponade: s.flags.tamponade ?? 30, 'or-called': 2 },
          timers: { ...s.timers, orReady: 3 },
        };
        for (const l of ev.effect(probe).say ?? []) expect(l[1], ev.id).not.toMatch(DIAGNOSIS);
      }
    }
  });

  it('speaks with the department\'s voices only, and in US spelling', () => {
    for (const l of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(l[0]);
    for (const role of [6, 7] as const) {
      const s = runScenario(sc, role, IDEAL[role]);
      for (const l of s.log) {
        expect(NOT_IN_ED, `${l.who}: ${l.text}`).not.toContain(l.who);
        expect(l.text).not.toMatch(BRITISH);
      }
    }
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const t of sc.teaching) expect(t).not.toMatch(BRITISH);
  });
});

describe('aortic dissection in the emergency department — the ideal runs', () => {
  for (const role of [6, 7] as const) {
    it(`role ${role}: ends by itself with full marks`, () => {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      expect(r.outcome).toMatch(/^Every critical intervention done/);
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      // the rate and pressure controlled in time: the tear never spread or bled, and he went to the operating room at goal
      expect(s.fired).not.toContain('extension');
      expect(s.fired).not.toContain('tamponade');
      expect(s.flags['to-or']).toBeDefined();
      expect(s.flags['bp-goal']).toBeDefined();
      expect(s.rhythm).toEqual({ profile: 'aortic-dissection', hr: 66 });
      expect(bp(s)).toEqual([116, 70]);
      expect(last(s)).toBe('All critical interventions are done — scenario complete.');
      // the nurse hands him to the operating room nurse, the doctor to the surgeon (anesthesia hears both)
      const to = role === 6 ? 'the operating room nurse' : 'the cardiac surgeon';
      expect(said(s)).toMatch(new RegExp(`SBAR hand-off to ${to} and the anesthesiologist: .*what was held \\(no aspirin, no heparin\\)`));
    });
  }

  it('the times: the 12-lead, both arms, the rate control and the surgeon\'s call, each well inside its goal', () => {
    expect(review(sc, nurse(IDEAL[6])).timings).toEqual([
      { label: 'Door to 12-lead', minute: 2, target: 10, met: true },
      { label: 'Blood pressure in both arms', minute: 4, target: 10, met: true },
      { label: 'Rate control (IV beta-blocker)', minute: 8.5, target: 15, met: true },
      { label: 'Cardiac surgeon called', minute: 8.5, target: 20, met: true },
      { label: 'Arrival to the operating room', minute: 29.5, met: null },
    ]);
    // the doctor's run: the computer nurse's 12-lead counts for the team
    expect(review(sc, doctor(IDEAL[7])).timings).toEqual([
      { label: 'Door to 12-lead', minute: 1, target: 10, met: true },
      { label: 'Blood pressure in both arms', minute: 1, target: 10, met: true },
      { label: 'Rate control (IV beta-blocker)', minute: 5.2, target: 15, met: true },
      { label: 'Cardiac surgeon called', minute: 5, target: 20, met: true },
      { label: 'Arrival to the operating room', minute: 27.7, met: null },
    ]);
  });

  it('both read the 12-lead as LVH, at no cost; a STEMI read costs 5 points', () => {
    const rn = nurse(readAfter(IDEAL[6], 'ecg12', 'lvh'), 'manual');
    expect(rn.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'lvh', verdict: 'correct' })]);
    expect(rn.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus rhythm 98 with left ventricular hypertrophy: .*does not meet STEMI criteria/.test(l.text))).toBe(true);
    expect(review(sc, rn).percent).toBe(100);
    // the doctor reads the computer nurse's tracing (it comes during the history)
    const md = doctor(readAfter(IDEAL[7], 'opqrst', 'lvh'), 'manual');
    expect(md.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'lvh', verdict: 'correct', minute: 1 })]);
    const wrong = doctor(readAfter(IDEAL[7], 'opqrst', 'stemi-inferior'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: SimState[] = [];
    for (const role of [6, 7] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      doctor([...MD_ASSESSED, 'nitro', 'nitro-high', 'fluid', 'push-epi', 'pressor', 'legs-up', 'cath-lab-activate', 'metoprolol', 'diltiazem', 'tnk', ...R(8)]),
      doctor([...MD_ASSESSED, ...R(18), 'ct-urgent', 'pericardiocentesis', 'fentanyl', 'metoprolol']),
      nurse(['monitor', 'aspirin', 'nitro', 'iv', 'heparin', ...R(12), 'nibp', 'fluid']),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('every action in each role\'s scope works from the bedside before and after the bleed, and keeps the vitals real', () => {
    const before = { 6: nurse([...RN_REPORTED, 'iv']), 7: doctor(MD_ASSESSED) };
    // the nurse's run has the physician's metoprolol in by then: it bleeds at 55 minutes, not 40
    const after = { 6: nurse(['monitor', 'iv', ...R(27)]), 7: doctor(R(20)) };
    for (const role of [6, 7] as const) {
      expect(after[role].flags.tamponade).toBeDefined();
      for (const from of [before[role], after[role]]) {
        for (const iv of interventionsFor(role, 'ed')) {
          if (unavailableReason(sc, from, iv.id)) continue;
          const s = perform(sc, from, iv.id);
          expect(s.vitals.sbp, iv.id).toBeGreaterThanOrEqual(s.pulse ? 50 : 0);
          expect(s.vitals.dbp, iv.id).toBeLessThan(Math.max(1, s.vitals.sbp));
          expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
          for (const l of s.log) {
            if (l.who === 'monitor') expect(l.text, iv.id).not.toMatch(GIVEAWAY);
            expect(NOT_IN_ED, `${iv.id}: ${l.who}`).not.toContain(l.who);
          }
        }
      }
    }
  });

  it('is deterministic', () => {
    expect(nurse(IDEAL[6])).toEqual(nurse(IDEAL[6]));
    expect(doctor(IDEAL[7])).toEqual(doctor(IDEAL[7]));
  });
});

describe('aortic dissection in the emergency department — finding it', () => {
  it('opens hypertensive and in severe pain, with the tracing of years of high blood pressure; a walk-in, triaged ESI 2', () => {
    const s = start(sc, 6);
    expect(s.rhythm).toEqual({ profile: 'aortic-dissection', hr: 98 });
    expect([...bp(s), s.vitals.pain]).toEqual([196, 104, 10]);
    expect(last(nurse(['triage']))).toMatch(/^ESI 2: high risk/);
    expect(nurse(['triage']).flags['esi-2']).toBeDefined();
    // nobody brought him: no EMS report to take
    const ems = nurse(['ems-handoff']);
    expect(ems.counts['ems-handoff']).toBeUndefined();
    expect(last(ems)).toMatch(/came in on their own/);
  });

  it('the history tells of a sudden tearing pain through to the back, and a blood pressure left untreated', () => {
    const s = doctor(['opqrst', 'sample']);
    expect(said(s)).toMatch(/like something tearing in my chest and going straight through to my back/);
    expect(said(s)).toMatch(/I stopped taking them a month ago/);
  });

  it('both arms: 196/104 on the right, 150/88 on the left, and a weaker left radial pulse; the cuffs read the right', () => {
    const s = nurse(['bp-both-arms']);
    expect(last(s)).toBe('Right arm 196/104 · left arm 150/88: 46 mmHg lower on the left. The left radial pulse is weaker than the right.');
    expect(s.flags['bp-arms']).toBeDefined();
    expect(last(nurse(['vitals']))).toBe('BP 196/104 in the right arm · pulse 98 · RR 22 · SpO₂ 96%');
    expect(last(nurse(['monitor', 'nibp']))).toBe('NIBP 196/104 mmHg.');
  });

  it('a new diastolic murmur, the pulse deficit, a wide mediastinum, and the doctor\'s scan of the root', () => {
    expect(last(doctor(['lungs']))).toMatch(/a soft, high-pitched, blowing murmur right after the second heart sound/);
    expect(last(doctor(['perfusion']))).toMatch(/left radial pulse weaker; femoral and foot pulses present and equal/);
    expect(said(doctor(['cxr']))).toMatch(/Portable chest X-ray: the upper mediastinum is wide/);
    // the nurse hears the film read in the physician's voice
    expect(saidBy(nurse(['cxr']), 'physician')).toMatch(/^Portable chest X-ray: the upper mediastinum is wide/);
    const scan = doctor(['pocus']);
    expect(saidBy(scan, 'you')).toMatch(/Bedside ultrasound: the aortic root is wide — 4\.8 cm — with a thin, mobile flap .*jet of aortic regurgitation; a small pericardial effusion, with no collapse of the right heart/);
    expect(scan.flags.pocus).toBeDefined();
  });

  it('the nurse\'s report brings the physician at once, who examines, scans and calls the surgeon', () => {
    const s = nurse(RN_REPORTED);
    expect(s.minute).toBe(6.5);
    expect(saidBy(s, 'physician')).toMatch(/196\/104 on the right and 150\/88 on the left\? I'm coming now\. Hold the aspirin and the nitroglycerin/);
    expect(saidBy(s, 'physician')).toMatch(/Listens to his chest: "A soft, blowing murmur/);
    expect(s.flags['md-here']).toBe(6.5);
    const scanned = nurse([...RN_REPORTED, 'iv']);
    expect(saidBy(scanned, 'physician')).toMatch(/The root is wide — 4\.8 centimeters — with a thin flap/);
    expect(scanned.flags['or-called']).toBeDefined();
    expect(scanned.timers.orReady).toBe(8.5 + 20);
    // reported before the arms were measured: the physician asks for them
    expect(saidBy(nurse(['monitor', 'notify-physician']), 'physician')).toMatch(/Get me a blood pressure in both arms/);
  });

  it('without a report the physician still comes at minute 8 — and takes the arm pressures if nobody has', () => {
    const s = nurse(['triage', 'monitor', 'ecg12', ...R(2)]);
    expect(s.flags['md-here']).toBe(8);
    expect(saidBy(s, 'physician')).toMatch(/comes over to see the new chest pain/);
    expect(saidBy(s, 'physician')).toMatch(/Takes the pressure in both arms: "Right 196\/104, left 150\/88/);
    // the report and the arms were the nurse's: missed
    const stopped = stop(nurse(['triage', 'monitor', 'ecg12', ...R(2)]));
    expect(toFix(stopped, /^Blood pressure in both arms/)?.kind).toBe('missed');
    expect(toFix(stopped, /^Report to the ED physician/)?.kind).toBe('missed');
  });

  it('a hint names the next missing item, at a cost', () => {
    const s = takeHint(sc, doctor(['opqrst']));
    expect(last(s)).toMatch(/^Hint: Blood pressure in both arms\./);
    expect(s.penalties).toEqual([expect.objectContaining({ points: 2 })]);
  });
});

describe('aortic dissection in the emergency department — the ER nurse\'s traps', () => {
  it('aspirin from the chest pain standing order costs 10 points once — heparin after it adds nothing, and is no second "without an order"', () => {
    const s = nurse(['aspirin']);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'antithrombotic-dissection-rn', points: 10, severity: 'major' })]);
    expect(s.penalties[0].text).toMatch(/The chest pain standing order covers aspirin, but it also asks you to screen first/);
    expect(penalties(nurse(['aspirin', 'iv', 'heparin']))).toEqual(['antithrombotic-dissection-rn']);
    expect(penalties(nurse(['iv', 'heparin']))).toEqual(['antithrombotic-dissection-rn']);
    // the physician hears of it at the bedside
    expect(saidBy(nurse(['bp-both-arms', 'aspirin', 'notify-physician']), 'physician')).toMatch(/He has had aspirin\? Not for this pain/);
  });

  it('nitroglycerin from the standing order before the beta-blocker races his heart and costs 5 points; the physician stops it', () => {
    const early = nurse(['monitor', 'nitro']);
    expect(early.rhythm.hr).toBe(110);
    expect(bp(early)).toEqual([184, 98]);
    expect(said(early)).toMatch(/now my heart is pounding/);
    expect(penalties(early)).toEqual(['vasodilator-before-rate-rn']);
    const atBedside = nurse([...RN_REPORTED, 'nitro']);
    expect(saidBy(atBedside, 'physician')).toMatch(/Hold the nitroglycerin — his rate first/);
    // on the physician's order, after the rate is controlled: no penalty, and no racing
    const ordered = nurse([...RN_REPORTED, 'iv', 'metoprolol', 'nitro']);
    expect(penalties(ordered)).toEqual([]);
    expect(ordered.rhythm.hr).toBe(66);
  });

  it('the drugs that need an order cost 5 points each when given before it', () => {
    expect(penalties(nurse(['iv', 'metoprolol']))).toEqual(['rn-without-order-metoprolol']);
    expect(penalties(nurse(['iv', 'fentanyl']))).toEqual(['rn-without-order-fentanyl']);
    // the high nitroglycerin dose is on no standing order, and it races his heart
    expect(penalties(nurse(['monitor', 'nitro-high']))).toEqual(['rn-without-order-nitro-high', 'vasodilator-before-rate-rn']);
    // a fibrinolytic: no order, and the built-in rule for a torn aorta
    expect(penalties(nurse(['iv', 'alteplase']))).toEqual(expect.arrayContaining(['lytic-dissection', 'rn-without-order-alteplase']));
  });

  it('fluid for his high pressure pushes it higher and costs 5 points', () => {
    const s = nurse(['monitor', 'iv', 'fluid']);
    expect(bp(s)).toEqual([204, 108]);
    expect(said(s)).toMatch(/The tearing is worse again/);
    expect(penalties(s)).toEqual(['fluid-hypertensive']);
  });

  it('the hand-off waits for the operating room', () => {
    const early = nurse([...RN_REPORTED, 'iv', 'metoprolol', 'fentanyl', 'labs', 'nitro', 'handoff']);
    expect(early.counts.handoff).toBeUndefined();
    expect(last(early)).toMatch(/^The operating room is not ready yet/);
    // before anyone has decided where he goes, the department's own rule
    expect(last(nurse(['triage', 'handoff']))).toMatch(/^The patient stays in the department until the ED physician decides where they go/);
  });

  it('a case with the aspirin given scores below Excellent', () => {
    const s = nurse(IDEAL[6].flatMap((id) => (id === 'triage' ? [id, 'aspirin'] : [id])));
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).percent).toBeLessThan(90);
  });
});

describe('aortic dissection in the emergency department — the physician\'s orders to the nurse', () => {
  it('the beta-blocker, the opioid and the vasodilator come in that order, each once the last allows it', () => {
    const s = nurse([...RN_REPORTED, 'iv']);
    const orders = s.log.filter((l) => l.who === 'physician' && /^"(Metoprolol|Fentanyl)/.test(l.text));
    expect(orders.map((l) => /^"(\w+)/.exec(l.text)![1])).toEqual(['Metoprolol', 'Fentanyl']);
    expect(s.flags['ordered:metoprolol']).toBeDefined();
    expect(s.flags['ordered:fentanyl']).toBeDefined();
    // the vasodilator waits for the rate
    expect(s.flags['asked-rn-vasodilator']).toBeUndefined();
    const rated = perform(sc, s, 'metoprolol');
    expect(rated.flags['asked-rn-vasodilator']).toBeDefined();
    expect(rated.flags['ct-ordered']).toBeDefined();
  });

  it('an order not carried out within 3 minutes: the physician gives it, and the item is missed', () => {
    const s = nurse([...RN_REPORTED, 'iv', 'labs', ...R(2)]);
    expect(saidBy(s, 'physician')).toMatch(/I'll see to his rate myself\."\nMetoprolol 5 mg IV over 2 minutes/);
    expect(s.flags['rate-controlled']).toBeDefined();
    expect(s.rhythm.hr).toBe(66);
    expect(toFix(stop(s), /^IV beta-blocker on the physician's order/)?.kind).toBe('missed');
  });

  it('the nurse takes him to the scanner on the monitor: the read comes back, then the operating room calls', () => {
    const s = nurse([...RN_REPORTED, 'iv', 'metoprolol', 'fentanyl', 'labs', 'nitro', ...R(5)]);
    expect(s.fired).toContain('ct-trip');
    expect(said(s)).toMatch(/Back from the scanner: you went with him on the transport monitor/);
    expect(said(s)).toMatch(/Radiology: a flap that starts just above the valve/);
    expect(s.flags['or-ready']).toBeUndefined();
    expect(perform(sc, perform(sc, perform(sc, perform(sc, s, 'reassess'), 'reassess'), 'reassess'), 'reassess').flags['or-ready']).toBeDefined();
  });
});

describe('aortic dissection in the emergency department — the ER doctor\'s traps', () => {
  it('aspirin, heparin or a P2Y12 costs 10 points once (not the built-in rule as well)', () => {
    for (const steps of [['aspirin'], ['aspirin', 'p2y12'], [...MD_ASSESSED, 'heparin']]) {
      expect(doctor(steps).penalties).toEqual([expect.objectContaining({ id: 'antithrombotic-dissection-md', points: 10, severity: 'major' })]);
    }
    // the surgeon hears of it
    expect(last(doctor(['aspirin', 'call-surgery']))).toMatch(/He has had an antithrombotic: we'll have platelets ready/);
  });

  it('heparin makes the tear bleed into the pericardium within 10 minutes', () => {
    const s = doctor([...MD_ASSESSED, 'heparin', ...R(5)]);
    expect(s.fired).toContain('tamponade');
    expect(s.flags.tamponade).toBe(15.5);
    expect(bp(s)).toEqual([82, 60]);
  });

  it('a fibrinolytic is the built-in critical rule, and the bleed follows within minutes', () => {
    const s = doctor([...MD_ASSESSED, 'tnk', ...R(2)]);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'lytic-dissection', points: 15, severity: 'critical' })]);
    expect(s.fired).toContain('tamponade');
  });

  it('the cath lab is declined, in words that point to the aorta, for 8 points (not the built-in rule as well)', () => {
    const s = doctor([...MD_ASSESSED, 'cath-lab-activate']);
    expect(last(s)).toMatch(/I am not bringing the team in\. And with sudden pain tearing through to the back and a pressure difference between the arms, think of his aorta/);
    expect(s.flags.alert).toBeUndefined();
    expect(s.flags.dispo).toBeUndefined();
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'cath-lab-dissection', points: 8, severity: 'major' })]);
  });

  it('a vasodilator before the beta-blocker races the heart and costs 5 points; after it, the pressure comes down to the goal', () => {
    const first = doctor([...MD_ASSESSED, 'nitro']);
    expect(first.rhythm.hr).toBe(110);
    expect(penalties(first)).toEqual(['vasodilator-before-rate-md']);
    expect(penalties(doctor([...MD_ASSESSED, 'nitro-high']))).toEqual(['vasodilator-before-rate-md']);
    const right = doctor([...MD_ASSESSED, 'metoprolol', 'fentanyl', 'nitro']);
    expect(right.penalties).toEqual([]);
    expect(bp(right)).toEqual([144, 78]);
    // a dose too many once at the goal drops him below it
    const settled = doctor([...MD_ASSESSED, 'metoprolol', 'fentanyl', 'nitro', ...R(2)]);
    expect(bp(settled)).toEqual([116, 70]);
    const over = perform(sc, settled, 'nitro');
    expect(over.vitals.sbp).toBe(96);
    expect(penalties(over)).toEqual(['vasodilator-below-goal']);
  });

  it('a second rate drug on top of the first costs points (diltiazem on IV metoprolol: the label\'s 5); a rate drug in shock, 8', () => {
    // the diltiazem label rules out an IV beta-blocker and IV diltiazem within hours of each other: that major
    // contraindication outranks the case's minor second-drug rule
    const both = doctor([...MD_ASSESSED, 'metoprolol', 'diltiazem']);
    expect(penalties(both)).toEqual(['iv-beta-blocker-with-diltiazem']);
    expect(both.penalties[0]).toMatchObject({ points: 5, severity: 'major' });
    const shock = doctor(R(20));
    expect(shock.flags.tamponade).toBeDefined();
    expect(penalties(perform(sc, shock, 'metoprolol'))).toEqual(['rate-drug-low']);
    expect(penalties(perform(sc, shock, 'fentanyl'))).toEqual(['opioid-hypotension']);
  });

  it('fluid, a pressor and raised legs push a high pressure higher, and each costs', () => {
    let s = doctor([...MD_ASSESSED, 'fluid']);
    expect(bp(s)).toEqual([204, 108]);
    expect(penalties(s)).toEqual(['fluid-hypertensive']);
    s = perform(sc, s, 'pressor');
    expect(s.vitals.sbp).toBe(224);
    s = perform(sc, s, 'legs-up');
    expect(penalties(s)).toEqual(['fluid-hypertensive', 'pressor-hypertensive', 'legs-up-hypertensive']);
  });

  it('a transfer from a hospital with its own surgeon is turned down and costs 3 points', () => {
    const s = doctor([...MD_ASSESSED, 'transfer']);
    expect(last(s)).toMatch(/This hospital has a high-volume cardiac surgery program, and the surgeon on call tonight is a page away/);
    expect(s.flags.dispo).toBeUndefined();
    expect(penalties(s)).toEqual(['transfer-in-house']);
  });

  it('a pericardiocentesis: without tamponade a critical error; in tamponade, a drain that restarts the bleeding', () => {
    const none = doctor([...MD_ASSESSED, 'pericardiocentesis']);
    expect(none.penalties).toEqual([expect.objectContaining({ id: 'pericardiocentesis-dissection', points: 15, severity: 'critical' })]);
    const bled = doctor([...MD_ASSESSED, ...R(18), 'pericardiocentesis']);
    expect(bled.flags.tamponade).toBeDefined();
    expect(last(bled)).toMatch(/^Heart rate \d+\. BP 76\/52\.$/);
    expect(penalties(bled)).toEqual(['pericardiocentesis-before-or']);
  });

  it('the CT scanner in shock costs 8 points (the case\'s rule, not the built-in one)', () => {
    const s = perform(sc, doctor(R(20)), 'ct-urgent');
    expect(said(s)).toMatch(/On the scanner table his pressure falls to 68/);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'ct-unstable', points: 8 })]);
  });

  it('CPAP for his clear lungs is a minor error', () => {
    expect(penalties(doctor(['cpap']))).toEqual(['cpap-no-distress']);
  });

  it('a case with traps taken scores below Excellent', () => {
    const s = doctor(IDEAL[7].flatMap((id) => (id === 'pocus' ? [id, 'aspirin'] : [id])));
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).percent).toBeLessThan(90);
  });
});

describe('aortic dissection in the emergency department — right care works', () => {
  it('the computer nurse rooms him, records the 12-lead and places the lines — and asks about the aspirin', () => {
    const s = doctor(MD_ASSESSED);
    expect(saidBy(s, 'nurse')).toMatch(/Bed 5, on the monitor/);
    expect(saidBy(s, 'nurse')).toMatch(/12-lead done/);
    expect(saidBy(s, 'nurse')).toMatch(/The chest pain order set has aspirin — do you want it given\?/);
    for (const f of ['monitor', 'ecg12', 'iv', 'labs']) expect(s.flags[f], f).toBeDefined();
    expect(s.penalties).toEqual([]);
  });

  it('fentanyl eases the pain and brings the rate and the pressure down', () => {
    const s = doctor([...MD_ASSESSED, 'fentanyl']);
    expect(s.vitals.pain).toBe(6);
    expect(s.rhythm.hr).toBe(92);
    expect(bp(s)).toEqual([182, 98]);
    expect(said(s)).toMatch(/Fentanyl 50 mcg IV — in, on your order\./);
  });

  it('the beta-blocker brings the rate to 66 and the pressure down; diltiazem, to 72', () => {
    const s = doctor([...MD_ASSESSED, 'metoprolol']);
    expect(s.rhythm).toEqual({ profile: 'aortic-dissection', hr: 66 });
    expect(bp(s)).toEqual([178, 94]);
    expect(s.flags['needs-vasodilator']).toBeDefined();
    expect(doctor([...MD_ASSESSED, 'diltiazem']).rhythm.hr).toBe(72);
    // diltiazem when a beta-blocker cannot be used: the same rate control, and the vasodilator after it costs nothing
    const dil = doctor([...MD_ASSESSED, 'diltiazem', 'fentanyl', 'nitro']);
    expect(dil.flags['rate-controlled']).toBeDefined();
    expect(dil.penalties).toEqual([]);
  });

  it('without the opioid the pressure settles at 128, not at the goal', () => {
    const s = doctor([...MD_ASSESSED, 'metoprolol', 'nitro', ...R(2)]);
    expect(bp(s)).toEqual([128, 76]);
    expect(s.flags['bp-goal']).toBeUndefined();
  });

  it('the surgeon comes in at once and asks for the CT; the operating room is ready 20 minutes after the call and once the CT is done', () => {
    let s = doctor([...MD_ASSESSED, 'call-surgery']);
    expect(last(s)).toMatch(/^Cardiac surgery: "A flap at the root on your scan — he's mine until the CT says otherwise\./);
    expect(s.flags.dispo).toBeDefined();
    s = runScenario(sc, 7, [...MD_ASSESSED, 'call-surgery', ...R(11)]);
    // 27 minutes: past the 20, but no CT yet
    expect(s.flags['or-ready']).toBeUndefined();
    expect(perform(sc, s, 'handoff').counts.handoff).toBeUndefined();
    s = perform(sc, s, 'ct-urgent');
    expect(s.flags['or-ready']).toBeDefined();
    // called after the CT: the read is the surgeon's to act on
    expect(last(doctor([...MD_ASSESSED, 'ct-urgent', 'call-surgery']))).toMatch(/^Cardiac surgery: "A flap from just above the valve — he's mine\./);
  });

  it('cardiology, consulted, answers what the doctor brings: a nudge to look first, the surgeon once the findings are in — never the drug plan', () => {
    const early = saidBy(doctor(['consult-cardiology']), 'consultant');
    expect(early).toMatch(/Before anyone calls it a heart attack: the pressure in both arms, a listen for a new murmur and a look at his aortic root/);
    expect(early).not.toMatch(/surgeon/);
    const found = saidBy(doctor(['opqrst', 'bp-both-arms', 'consult-cardiology']), 'consultant');
    expect(found).toMatch(/it is the cardiac surgeon he needs, now\. No aspirin, no heparin, no cath lab/);
    // the anti-impulse therapy stays the doctor's decision
    for (const t of [early, found]) expect(t).not.toMatch(/beta-blocker|metoprolol|heart rate 60|under 120/);
  });

  it('admitted to the ICU without the surgeon: the hand-off goes to the admitting team and the surgery item is missed', () => {
    const s = doctor([...MD_ASSESSED, 'metoprolol', 'fentanyl', 'nitro', 'ct-urgent', 'admit', 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(last(s)).toMatch(/1 critical item still not done/);
    expect(toFix(s, /^Call the cardiac surgeon/)?.kind).toBe('missed');
  });

  it('the labs come back 12 minutes after they are drawn', () => {
    // the computer nurse sends them at minute 2
    expect(doctor(MD_ASSESSED).flags.labs).toBe(2);
    expect(said(doctor([...MD_ASSESSED, ...R(4)]))).not.toMatch(/Labs back/);
    expect(said(doctor([...MD_ASSESSED, ...R(5)]))).toMatch(/Labs back: high-sensitivity troponin 8 ng\/L \(normal\)/);
  });
});

describe('aortic dissection in the emergency department — delay matters', () => {
  it('with nothing slowing his heart, at 20 minutes the tear spreads: belly pain, a numb, pulseless left leg', () => {
    const s = doctor(R(10));
    expect(s.minute).toBe(20);
    expect(s.fired).toContain('extension');
    expect(said(s)).toMatch(/my left leg has gone numb/);
    expect(last(perform(sc, s, 'perfusion'))).toMatch(/the left femoral and foot pulses gone/);
    expect(last(perform(sc, s, 'neuro'))).toMatch(/his left leg is numb and weak/);
    // rate control stops it
    expect(doctor([...MD_ASSESSED, 'metoprolol', ...R(8)]).fired).not.toContain('extension');
  });

  it('left in the department it bleeds into the pericardium at 40 minutes (55 with the rate controlled): shock and full neck veins', () => {
    const s = doctor(R(20));
    expect(s.flags.tamponade).toBe(40);
    expect(bp(s)).toEqual([82, 60]);
    expect(s.rhythm.hr).toBe(128);
    expect(said(s)).toMatch(/his neck veins are standing out/);
    expect(last(perform(sc, s, 'lungs'))).toMatch(/The heart sounds are muffled now/);
    expect(last(perform(sc, s, 'bp-both-arms'))).toBe('Right arm 82/60 · left arm too faint to hear. The left radial pulse is barely there.');
    expect(last(perform(sc, s, 'pocus'))).toMatch(/the right ventricle collapsing in diastole/);
    const controlled = doctor([...MD_ASSESSED, 'metoprolol', ...R(25)]);
    expect(controlled.flags.tamponade).toBe(55.5);
  });

  it('in shock the surgeon takes him at once: a small bolus is the bridge, and the hand-off is allowed', () => {
    let s = doctor([...R(20), 'call-surgery']);
    expect(said(s)).toMatch(/Cardiac surgery: "He's bleeding around the heart — bring him straight up; we open now\./);
    expect(s.flags['or-ready']).toBeDefined();
    s = perform(sc, s, 'fluid');
    expect(s.penalties).toEqual([]);
    expect(bp(s)).toEqual([92, 66]);
    s = perform(sc, s, 'handoff');
    expect(s.flags['to-or']).toBeDefined();
    expect(s.ended?.reason).toBe('complete');
    // the items that only made sense before the bleed drop out; what was never done is missed
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label).sort()).toEqual([
      'Bedside ultrasound: the aortic root, the valve, the pericardium', 'Blood pressure in both arms', 'The pain: onset, character and where it goes (OPQRST)',
    ]);
    expect(toFix(s, /^Call the cardiac surgeon/)?.kind).toBe('late');
  });

  it('in the nurse\'s run the physician sends him straight up when he bleeds', () => {
    const s = nurse([...RN_REPORTED, 'iv', ...R(24)]);
    expect(s.fired).toContain('tamponade');
    expect(s.flags['or-ready']).toBeDefined();
    expect(saidBy(s, 'physician')).toMatch(/He goes to the operating room now/);
    expect(last(perform(sc, s, 'notify-physician'))).toMatch(/the surgeon takes him straight up/);
  });

  it('left there 10 minutes after the bleed, his heart stops, and nothing in the department brings him back', () => {
    let s = doctor(R(25));
    expect(s.fired).toContain('arrest');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    for (let i = 0; i < 10 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('a late call to the surgeon counts half', () => {
    const late = doctor([...MD_ASSESSED, 'metoprolol', 'fentanyl', 'nitro', 'ct-urgent', ...R(3), 'call-surgery', ...R(10), 'handoff']);
    expect(late.ended?.reason).toBe('complete');
    expect(toFix(late, /^Call the cardiac surgeon/)?.kind).toBe('late');
  });
});

describe('aortic dissection in the emergency department — the review\'s fixes', () => {
  /** The nurse's work to the physician's first orders (minute 8.5: metoprolol and fentanyl ordered) */
  const RN_ORDERED = [...RN_REPORTED, 'iv'];

  it('the nurse gives diltiazem for the ordered metoprolol: one penalty (the order\'s), and the physician puts no beta-blocker on top', () => {
    const s = nurse([...RN_ORDERED, 'fentanyl', 'diltiazem', 'labs', ...R(2)]);
    expect(penalties(s)).toEqual(['wrong-rn-beta']);
    expect(saidBy(s, 'physician')).toMatch(/Diltiazem\? I ordered metoprolol — he has no reason not to take a beta-blocker/);
    expect(saidBy(s, 'physician')).toMatch(/I'll see to his rate myself\."\n"It is already down — no metoprolol on top of what he has had\."/);
    // the rate the diltiazem left, not a second drug's
    expect(s.rhythm.hr).toBe(72);
    expect(s.counts.metoprolol).toBeUndefined();
    expect(toFix(stop(s), /^IV beta-blocker on the physician's order/)?.kind).toBe('missed');
  });

  it('the nurse gives 0.8 mg of nitroglycerin for the ordered 0.4 mg: one penalty (the order\'s), and no second vasodilator from the physician', () => {
    const s = nurse([...RN_ORDERED, 'metoprolol', 'fentanyl', 'labs', 'nitro-high', ...R(2)]);
    expect(penalties(s)).toEqual(['wrong-rn-vasodilator']);
    expect(saidBy(s, 'physician')).toMatch(/That was 0\.8 — I ordered 0\.4/);
    expect(saidBy(s, 'physician')).toMatch(/It is coming down on what he has had — nothing more for now/);
    expect(s.log.filter((l) => /^Nitroglycerin 0\.4 mg sublingual/.test(l.text))).toEqual([]);
    expect(bp(s)).toEqual([116, 70]);
  });

  it('metoprolol or fentanyl before any order costs the scope penalty and the order\'s item: never more than carrying the order out late', () => {
    const alone = nurse(['triage', 'monitor', 'ecg12', 'iv', 'metoprolol', 'fentanyl', 'bp-both-arms', 'notify-physician', 'labs', 'nitro', ...R(12)]);
    expect(penalties(alone)).toEqual(['rn-without-order-metoprolol', 'rn-without-order-fentanyl']);
    expect(saidBy(alone, 'physician')).toMatch(/He has had metoprolol and fentanyl\? Who ordered that\? Call me first/);
    const r = review(sc, stop(alone));
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(expect.arrayContaining([
      'IV beta-blocker on the physician\'s order: the rate first', 'IV opioid for the pain, on the physician\'s order',
    ]));
    // the same nurse waiting for the orders and too slow to give them (the physician gives both): a better score
    const slow = nurse(['triage', 'monitor', 'ecg12', 'iv', 'bp-both-arms', 'notify-physician', 'labs', ...R(2), 'nitro', ...R(12)]);
    expect(slow.penalties).toEqual([]);
    expect(review(sc, stop(slow)).percent).toBeGreaterThan(r.percent);
  });

  it('reported before the arms were taken, the physician asks for them again instead of taking them over', () => {
    const s = nurse(['triage', 'monitor', 'notify-physician']);
    expect(saidBy(s, 'physician')).toMatch(/Get me a blood pressure in both arms while I walk over/);
    expect(saidBy(s, 'physician')).toMatch(/And I still need that pressure in both arms — now, please/);
    expect(saidBy(s, 'physician')).not.toMatch(/Takes the pressure in both arms/);
    // the nurse takes them and reports them: both items hers, at full marks
    const done = nurse(['triage', 'monitor', 'notify-physician', 'bp-both-arms', 'ecg12', 'notify-physician', 'iv', 'metoprolol', 'fentanyl', 'labs', 'nitro', ...R(10), 'handoff']);
    expect(done.ended?.reason).toBe('complete');
    expect(review(sc, done).percent).toBe(100);
  });

  it('calling for help brings the ED physician to the bedside (no report, so that item is missed)', () => {
    const s = nurse(['triage', 'monitor', 'ecg12', 'bp-both-arms', 'call-help']);
    expect(s.flags['md-here']).toBe(5.2);
    expect(saidBy(s, 'physician')).not.toMatch(/comes over to see the new chest pain/);
    expect(toFix(stop(s), /^Report to the ED physician/)?.kind).toBe('missed');
  });

  it('the nurse\'s labs before the physician has seen him are the order set\'s: the crossmatch is the physician\'s to add', () => {
    const s = nurse(['triage', 'monitor', 'labs', 'ecg12', 'bp-both-arms', 'notify-physician']);
    expect(said(s)).toMatch(/Labs sent on the chest pain order set: .*an extra set of tubes held in the lab/);
    expect(said(s)).not.toMatch(/Labs sent: .*type and crossmatch/);
    expect(saidBy(s, 'physician')).toMatch(/Two large-bore lines and a type and crossmatch for 4 units added to his labs, please/);
    // drawn after the physician's order: with the crossmatch
    expect(said(nurse([...RN_ORDERED, 'labs']))).toMatch(/Labs sent: .*with a type and crossmatch for 4 units/);
  });

  it('a nurse slow with the line: the physician places one, and hers is the second', () => {
    const s = nurse([...RN_REPORTED, ...R(2), 'iv']);
    expect(saidBy(s, 'physician')).toMatch(/Still no line\? I'll put one in myself — get the second one in/);
    expect(s.flags.iv).toBe(10.5);
    expect(said(s)).toMatch(/A second large-bore IV: 18 G in the other antecubital fossa\. Two lines now\./);
  });

  it('the doctor\'s beta-blocker right after the history and the arms finds the nurse\'s lines in', () => {
    const s = doctor(['opqrst', 'bp-both-arms', 'metoprolol']);
    expect(s.flags.iv).toBe(2);
    expect(s.counts.metoprolol).toBe(1);
    expect(s.flags['rate-controlled']).toBeDefined();
  });

  it('the vasodilator after the rate: sublingual nitroglycerin bridges to a nicardipine infusion, which holds the goal', () => {
    const md = doctor([...MD_ASSESSED, 'metoprolol', 'fentanyl', 'nitro', ...R(2)]);
    expect(saidBy(md, 'nurse')).toMatch(/Nitroglycerin 0\.4 mg sublingual, while pharmacy mixes the nicardipine infusion that takes over from it — in, on your order\./);
    expect(saidBy(md, 'nurse')).toMatch(/The nicardipine infusion is up from pharmacy and running at 5 milligrams an hour/);
    expect(bp(md)).toEqual([116, 70]);
    // without the opioid the pain holds the pressure over the goal, and the nurse says why
    const noPain = doctor([...MD_ASSESSED, 'metoprolol', 'nitro', ...R(2)]);
    expect(saidBy(noPain, 'nurse')).toMatch(/His pain is still 10 out of 10, and it holds his pressure up\./);
    // before the rate is controlled there is no bridge: the nitroglycerin alone races his heart
    expect(said(doctor([...MD_ASSESSED, 'nitro']))).not.toMatch(/nicardipine/);
    // the nurse's order names the infusion too
    expect(saidBy(nurse([...RN_ORDERED, 'metoprolol']), 'physician')).toMatch(/nitroglycerin 0\.4 milligrams sublingual while pharmacy mixes a nicardipine infusion/);
  });

  it('admitting him to the ICU without the surgeon costs 10 points on top of the missed call; after the call, admitting costs nothing', () => {
    const s = doctor([...MD_ASSESSED, 'metoprolol', 'fentanyl', 'nitro', 'ct-urgent', 'admit', 'handoff']);
    expect(penalties(s)).toEqual(['admit-without-surgeon']);
    expect(review(sc, s).percent).toBeLessThan(75);
    expect(penalties(doctor([...MD_ASSESSED, 'call-surgery', 'admit']))).toEqual([]);
  });

  it('blood before the bleed costs 3 points; once he bleeds it is a fair bridge to the operating room', () => {
    expect(penalties(doctor([...MD_ASSESSED, 'transfuse']))).toEqual(['transfuse-no-bleeding']);
    const shock = doctor(R(20));
    expect(shock.flags.tamponade).toBeDefined();
    expect(penalties(perform(sc, shock, 'transfuse'))).toEqual([]);
  });

  it('in the tamponade a bolus that lifts the systolic over 90 is still shock: more fluid is free, and the rate drug, the nitrate and the CT still cost', () => {
    let s = doctor(R(20));
    s = perform(sc, perform(sc, s, 'fluid'), 'fluid');
    // two small boluses: a bridge, kept under the shock ceiling, and no penalty
    expect(bp(s)).toEqual([102, 72]);
    expect(s.penalties).toEqual([]);
    expect(bp(perform(sc, perform(sc, s, 'fluid'), 'fluid'))).toEqual([104, 72]);
    const beta = perform(sc, s, 'metoprolol');
    expect(penalties(beta)).toEqual(['rate-drug-low']);
    expect(beta.flags['rate-controlled']).toBeUndefined();
    expect(beta.vitals.sbp).toBeLessThan(s.vitals.sbp);
    const nitro = perform(sc, s, 'nitro');
    expect(penalties(nitro)).toEqual(['vasodilator-in-shock']);
    expect(nitro.vitals.sbp).toBe(88);
    const ct = perform(sc, s, 'ct-urgent');
    expect(penalties(ct)).toEqual(['ct-unstable']);
    expect(said(ct)).toMatch(/On the scanner table his pressure falls to 68/);
    // a pressor to hold him for the operating room is no "pressor with a high pressure"
    expect(penalties(perform(sc, s, 'pressor'))).toEqual([]);
    // below 90 the nitrate rule is the case's too (one rule, not the engine's as well)
    expect(penalties(perform(sc, doctor(R(20)), 'nitro'))).toEqual(['vasodilator-in-shock']);
  });

  it('a needle in the pericardium once his heart has stopped is a last try: no penalty, and no pulse', () => {
    let s = doctor(['pocus', ...R(24)]);
    expect(s.pulse).toBe(false);
    s = perform(sc, perform(sc, s, 'cpr'), 'pericardiocentesis');
    expect(last(s)).toMatch(/^Drain in under ultrasound during the pulse check: blood comes back, and keeps coming .* Still no pulse\.$/);
    expect(s.penalties).toEqual([]);
    expect(s.pulse).toBe(false);
  });
});
