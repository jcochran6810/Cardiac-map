import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabVasovagal as sc } from '@/lib/sim/scenario/scenarios/cathlabVasovagal';
import type { SimState } from '@/lib/sim/scenario/types';
import { readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'late').map((t) => t.label);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: calls it out without letting go, looks at the groin under the fingers, calls out the response, finishes the hold
  3: ['callout', 'perfusion', 'callout', ...R(5), 'hemostasis'],
  // the nurse: gets the cardiologist in, legs up and atropine as asked, a bolus, looks for a bleed, checks the site after the hold
  4: ['callout', 'legs-up', 'atropine', 'fluid', 'perfusion', ...R(4), 'hemostasis', 'handoff'],
  // the cardiologist: legs up, atropine and a bolus at once, looks for a bleed, hands over once the hold is done
  5: ['legs-up', 'atropine', 'fluid', 'perfusion', ...R(4), 'handoff'],
};
const ROLES = [3, 4, 5] as const;

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;

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

describe('vasovagal reaction at the sheath pull: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('vasovagal-sheath-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(sc.images).toBeUndefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-vasovagal', 'clin-bezold', 'clin-rp-bleed', 'clin-hematoma', 'sinus-brady', 'nsr']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      expect(criticalsFor(sc, role).length, `role ${role}`).toBeGreaterThanOrEqual(4);
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // every harm names real actions, and someone the case is written for can commit it
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      const roles = h.roles ?? sc.roles;
      expect(roles.some((r) => h.actions.some((id) => interventionsFor(r, 'cathlab').some((i) => i.id === id))), h.id).toBe(true);
    }
  });

  it('gives each role its own part: the tech holds and calls out, the nurse treats as asked, the cardiologist treats and rules out a bleed', () => {
    const ids = (role: 3 | 4 | 5) => criticalsFor(sc, role).map((c) => c.id);
    expect(ids(3)).toEqual(['tech-callout', 'site-check', 'tech-response', 'tech-hold']);
    expect(ids(4)).toEqual(['rn-callout', 'ask-rn-rate', 'ask-rn-pressure', 'site-check', 'rn-site-after', 'handoff']);
    expect(ids(5)).toEqual(['md-legs', 'md-atropine', 'md-fluid', 'md-site-check', 'handoff']);
    expect(sc.harms.find((h) => h.id === 'let-go')!.roles).toEqual([3]);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const t of sc.teaching) expect(t).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });

  it('teaches the treatment, the traps and the prevention', () => {
    const text = sc.teaching.join(' ');
    for (const point of [/head-down \(Trendelenburg\)/, /250–500 mL/, /1 mg in the 2025 AHA/, /less than 0\.5 mg/, /stays on it/, /lightest pressure/, /retroperitoneal/,
      /inguinal ligament/, /response is the test/, /radial access/, /closure device/, /IV fentanyl and midazolam/, /lidocaine/, /Never the 1 mg arrest dose/,
      /No nitroglycerin during the pull/, /contrast reaction/]) {
      expect(text).toMatch(point);
    }
  });
});

describe('vasovagal reaction at the sheath pull: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 76 });
      expect([s.vitals.sbp, s.vitals.dbp]).toEqual([112, 68]);
      expect(s.reads.map((r) => r.answer)).toEqual(['clin-vasovagal']);
      expect(s.fired.some((id) => id.endsWith('-fallback') || id.endsWith('-standing'))).toBe(false);
      for (const id of ['worse', 'pause']) expect(s.fired).not.toContain(id);
      expect(s.flags).not.toHaveProperty('let-go');
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nothing names the reaction before the learner reads it', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role]);
      const read = s.log.findIndex((l) => l.text.startsWith('My read:'));
      expect(read, `role ${role}`).toBeGreaterThan(0);
      for (const l of s.log.slice(0, read)) expect(l.text, `role ${role}`).not.toMatch(/vagal|reflex|vasovagal/i);
    }
  });
});

describe('vasovagal reaction at the sheath pull: the reaction and the read', () => {
  it('opens with the reaction: a pulse of 38 and a pressure of 70/40 during the hold', () => {
    for (const role of ROLES) {
      const s = run(sc, role, []);
      expect(s.rhythm).toEqual({ profile: 'sinus-bradycardia', hr: 38 });
      expect([s.vitals.sbp, s.vitals.dbp]).toEqual([70, 40]);
      expect(s.pendingRead).toBeNull();
      expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 38. BP 70/40.')).toBe(true);
    }
    // the tech has to raise the alarm; for the nurse the tech does, and for the cardiologist the nurse
    expect(run(sc, 3, []).log.some((l) => /Heart rate 38!|Doctor —/.test(l.text))).toBe(false);
    expect(said(run(sc, 4, []))).toMatch(/Tech \(at the groin\): "Heart rate 38!/);
    expect(said(run(sc, 5, []))).toMatch(/Nurse: "Doctor — rate 38/);
  });

  it('asks for the read only once the groin, the thigh, the belly and the back have been looked at', () => {
    for (const role of ROLES) {
      const s = run(sc, role, ['perfusion'], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-vasovagal', partial: ['clin-bezold'], prompt: 'What is happening to him?' });
      expect(s.log.at(-1)!.text).toMatch(/soft and flat — no swelling, no ooze.*no pain in his back/);
      expect(unavailableReason(sc, s, 'reassess')).toMatch(/read first/);
    }
    expect(run(sc, 3, ['perfusion'], undefined, 'manual').log.at(-1)!.text).toMatch(/^Pale, cold and wet with sweat\. Under your fingers/);
  });

  it('calling it the Bezold–Jarisch reflex is partly right; calling it a bleed is a misread, and the feedback says why', () => {
    let s = run(sc, 5, ['legs-up', 'perfusion'], undefined, 'manual');
    s = answerRead(sc, s, 'clin-bezold');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'clin-vasovagal', verdict: 'partial' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 2 });
    s = run(sc, 5, ['legs-up', 'perfusion'], undefined, 'manual');
    s = answerRead(sc, s, 'clin-rp-bleed');
    expect(s.reads.at(-1)).toMatchObject({ verdict: 'wrong' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 5 });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Vasovagal reaction\..*nothing points to a bleed.*the response is the proof/);
  });

  it('the right read, given by hand, still ends the cardiologist\'s run with full marks', () => {
    const steps = readAfter(IDEAL[5], 'perfusion', 'clin-vasovagal');
    expectFullMarks(run(sc, 5, steps, undefined, 'manual'));
  });

  it('the cardiologist who never looks for a bleed misses that item', () => {
    const s = run(sc, 5, ['legs-up', 'atropine', 'fluid', ...R(5), 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(missed(s)).toEqual(['Look for a bleed: the groin, the thigh, the belly, the flank and the back']);
    expect(s.reads).toEqual([]);
  });
});

describe('vasovagal reaction at the sheath pull: what each treatment does', () => {
  it('atropine brings the rate to 74; the legs and a bolus lift the pressure; with both he recovers', () => {
    let s = run(sc, 5, ['atropine']);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 74 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([80, 46]);
    expect(s.flags).not.toHaveProperty('recovered');
    s = run(sc, 5, ['legs-up']);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([78, 44, 38]);
    s = run(sc, 5, ['fluid']);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([80, 46, 38]);
    s = run(sc, 5, ['atropine', 'fluid']);
    expect(s.flags).toHaveProperty('recovered');
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 76 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.gcs]).toEqual([112, 68, 15]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 76. BP 112/68.' && l.tone === 'good')).toBe(true);
  });

  it('with the legs up and atropine but no bolus, the pressure comes back a few minutes later', () => {
    let s = run(sc, 5, ['legs-up', 'atropine']);
    expect(s.flags).not.toHaveProperty('recovered');
    s = perform(sc, s, 'reassess');
    expect(s.flags).not.toHaveProperty('recovered');
    s = perform(sc, s, 'reassess');
    expect(s.flags.recovered).toBeGreaterThanOrEqual(s.flags['rate-up'] + 3);
    // the bolus is still the cardiologist's to give
    expect(missed(s)).toContain('A fluid bolus for the pressure');
  });

  it('nothing for the rate: it slows to 32, then a 6-second pause — and the nurse gives atropine on the standing order', () => {
    let s = run(sc, 5, ['legs-up', 'fluid', 'reassess']);
    expect(s.fired).toContain('worse');
    expect(s.rhythm.hr).toBe(32);
    expect(s.vitals.gcs).toBe(12);
    s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('pause');
    expect(s.log.some((l) => l.who === 'monitor' && /^A 6-second pause with no beats at all/.test(l.text))).toBe(true);
    s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('rn-atropine-standing');
    expect(s.flags).toHaveProperty('recovered');
    expect(missed(s)).toContain('Atropine 1 mg IV for the slow rate');
    // every pressure on the way down stayed one a living patient can show
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(50);
  });

  it('a cardiologist who does nothing still sees the nurse give atropine and fluid at 6 minutes', () => {
    const s = run(sc, 5, R(3));
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'pause', 'rn-atropine-standing', 'rn-fluid-standing', 'recovered']));
    expect(missed(s)).toEqual(expect.arrayContaining(['Legs above the heart', 'Atropine 1 mg IV for the slow rate', 'A fluid bolus for the pressure']));
  });

  it('pacing holds the rate at 70 (and hurts); atropine then hands the rate back to his own beats — pacing does not replace it', () => {
    let s = run(sc, 5, ['pace']);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.pain).toBe(7);
    expect(s.flags).toHaveProperty('rate-up');
    expect(penalties(s)).toEqual([]);
    s = perform(sc, s, 'atropine');
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 74 });
    expect(s.log.some((l) => /his own beats are back, faster than the pacer/.test(l.text))).toBe(true);
    s = run(sc, 5, ['pace', 'fluid', 'perfusion', ...R(4), 'handoff']);
    expect(s.flags).toHaveProperty('recovered');
    expect(missed(s)).toContain('Atropine 1 mg IV for the slow rate');
  });
});

describe('vasovagal reaction at the sheath pull: the team', () => {
  it('a tech who never calls out: the cardiologist comes in on the alarm, and the item is missed', () => {
    const s = run(sc, 3, ['perfusion', 'reassess']);
    expect(said(s)).toMatch(/why didn't anyone call me\?/);
    expect(s.fired).toContain('rn-treats-for-tech');
    expect(s.flags).toHaveProperty('recovered');
    expect(missed(s)).toContain('Call out the slow pulse and the low pressure at once — and stay on the groin');
  });

  it('a call for help reaches the cardiologist too, and counts as the call-out', () => {
    const s = run(sc, 3, ['call-help', 'perfusion', 'callout', ...R(5), 'hemostasis']);
    expectFullMarks(s);
  });

  it('a nurse who waits: the cardiologist comes in on the alarm, asks, and gives the atropine and the fluid himself', () => {
    const s = run(sc, 4, R(3));
    expect(said(s)).toMatch(/I can hear that alarm/);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-rate-ask', 'rn-pressure-ask', 'rn-rate-fallback', 'rn-pressure-fallback', 'worse', 'recovered']));
    expect(missed(s)).toEqual(expect.arrayContaining(['Get the cardiologist in at once', 'Atropine for the slow rate, as asked', 'Legs above the heart or a fluid bolus for the pressure, as asked']));
  });

  it('the nurse may treat before she is asked: atropine and the legs given first still count', () => {
    const s = run(sc, 4, ['atropine', 'legs-up', 'callout', 'fluid', 'perfusion', ...R(4), 'hemostasis', 'handoff']);
    expect(review(sc, s).toFix.map((t) => t.label)).toEqual([]);
  });

  it('the hold runs its 15 minutes: the tech cannot finish early, the nurse checks the site after it, and the hand-off waits for it', () => {
    let s = run(sc, 3, ['callout', 'perfusion', 'callout']);
    s = perform(sc, s, 'hemostasis');
    expect(s.log.at(-1)).toMatchObject({ who: 'system' });
    expect(s.log.at(-1)!.text).toMatch(/^Not yet: 10 more minutes of the 15-minute hold/);
    expect(s.counts.hemostasis).toBeUndefined();
    let n = run(sc, 4, ['callout', 'legs-up', 'atropine', 'fluid', 'perfusion']);
    n = perform(sc, n, 'hemostasis');
    expect(n.log.at(-1)!.text).toMatch(/^The tech is holding the groin: 8 more minutes/);
    n = perform(sc, n, 'handoff');
    expect(n.log.at(-1)!.text).toMatch(/^The procedure is not over yet/);
    expect(n.ended).toBeNull();
  });

  it('the hand-off says what happened, what was given, and what to do next time', () => {
    const s = run(sc, 5, IDEAL[5]);
    const text = s.log.findLast((l) => l.text.startsWith('SBAR'))!.text;
    expect(text).toMatch(/pulse 38, pressure 70\/40 — treated with the legs raised, a saline bolus and atropine 1 mg/);
    expect(text).toMatch(/groin soft and dry; no back, flank or belly pain/);
    expect(text).toMatch(/2–4 hours/);
    expect(text).toMatch(/radial access/);
  });
});

describe('vasovagal reaction at the sheath pull: the traps', () => {
  it('the tech who lets go of the groin to record a 12-lead: a hematoma, the hold starts again, and it costs points', () => {
    let s = run(sc, 3, ['callout', 'ecg12']);
    expect(penalties(s)).toEqual(['let-go']);
    expect(s.penalties[0]).toMatchObject({ severity: 'major', points: 10 });
    expect(s.flags).toHaveProperty('hematoma');
    expect(s.timers.holdEnd).toBe(0.1 + 2 + 15);
    expect(said(s)).toMatch(/You take your hands off the groin to put the leads on for a 12-lead\./);
    expect(said(s)).toMatch(/a firm lump about 4 cm across stays\. The 15-minute hold starts again\./);
    s = perform(sc, s, 'perfusion');
    expect(s.log.findLast((l) => l.who === 'you')!.text).toMatch(/firm over a lump about 4 cm across, from when the pressure came off/);
    expect(s.pendingRead?.explain).toMatch(/The lump at the puncture came from letting go of the groin/);
    // a second release: the lump grows, the hold starts again once more, and the mistake is counted once
    s = run(sc, 3, ['callout', 'ecg12', 'o2-nc']);
    expect(penalties(s)).toEqual(['let-go']);
    expect(said(s)).toMatch(/about 6 cm across/);
    // the hold is not over at 11 minutes any more
    s = run(sc, 3, ['callout', 'ecg12', 'perfusion', 'callout', ...R(4)]);
    s = perform(sc, s, 'hemostasis');
    expect(s.log.at(-1)!.text).toMatch(/^Not yet: \d+ more minutes? of the 15-minute hold \(it started again when the pressure came off\)/);
  });

  it('every job that needs both hands lets go of the groin for the tech; reading the monitor does not', () => {
    for (const id of ['pads', 'o2-nc', 'o2-nrb', 'bvm', 'bp-both-arms', 'capno', 'ecg-right', 'ecg-posterior', 'pace']) {
      const s = run(sc, 3, ['callout', id]);
      expect(penalties(s), id).toContain('let-go');
    }
    const v = run(sc, 3, ['callout', 'legs-up', 'vitals', 'nibp', 'pulse-check', 'opqrst', 'lungs']);
    expect(penalties(v)).toEqual([]);
    expect(said(v)).toMatch(/Your hands stay on the groin: you read the numbers off the monitor/);
    expect(said(v)).toMatch(/Your hands stay on the groin: the nurse tilts the bed head-down/);
  });

  it('the nurse or the cardiologist recording a 12-lead lets nothing bleed, and the tracing is read', () => {
    for (const role of [4, 5] as const) {
      const s = run(sc, role, ['ecg12']);
      expect(penalties(s), `role ${role}`).toEqual([]);
      expect(s.reads.at(-1)).toMatchObject({ kind: 'ecg', answer: 'sinus-brady', verdict: 'correct' });
    }
  });

  it('epinephrine first: the 1 mg arrest dose is a critical error and fixes nothing', () => {
    const s = run(sc, 5, ['epinephrine']);
    expect(penalties(s)).toEqual(['arrest-epi-with-pulse']);
    expect(s.penalties[0].severity).toBe('critical');
    expect(s.rhythm.hr).toBe(38);
    expect(s.flags).not.toHaveProperty('rate-up');
  });

  it('push-dose epinephrine or a pressor before the legs, the fluid and the atropine costs points; after them it does not', () => {
    for (const role of [4, 5] as const) {
      expect(penalties(run(sc, role, ['push-epi'])), `role ${role}`).toEqual(['pressor-before-basics']);
      expect(penalties(run(sc, role, ['pressor'])), `role ${role}`).toEqual(['pressor-before-basics']);
      expect(penalties(run(sc, role, ['atropine', 'push-epi'])), `role ${role}`).toEqual([]);
    }
  });

  it('an AV-nodal blocker or a vagal maneuver with a pulse of 38 costs points, and slows him further', () => {
    for (const id of ['metoprolol', 'diltiazem', 'adenosine6', 'adenosine12']) expect(penalties(run(sc, 5, [id])), id).toEqual(['nodal-blocker-slow']);
    const v = run(sc, 4, ['vagal']);
    expect(penalties(v)).toEqual(['vagal-maneuver-slow']);
    expect(v.rhythm.hr).toBe(32);
    // once the rate is back, the slow-rate rule no longer applies
    expect(penalties(run(sc, 5, ['atropine', 'fluid', 'metoprolol']))).toEqual([]);
  });

  it('an opioid or a sedative in the middle of the reaction drops the pressure, and costs points once (not also as unsafe midazolam)', () => {
    for (const id of ['fentanyl', 'midazolam', 'sedation']) {
      const s = run(sc, 4, [id]);
      expect(penalties(s), id).toEqual(['sedative-in-reaction']);
      expect(s.vitals.sbp, id).toBe(62);
    }
    // after the reaction, analgesia for the sore groin is no mistake
    expect(penalties(run(sc, 5, ['atropine', 'fluid', 'fentanyl']))).toEqual([]);
  });

  it('protamine with no heparin on board costs points and drops the pressure', () => {
    const s = run(sc, 5, ['protamine']);
    expect(penalties(s)).toEqual(['protamine-no-heparin']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([62, 36]);
  });

  it('an anticoagulant or a lytic keeps the groin oozing: points, and a longer hold', () => {
    for (const id of ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor']) {
      const s = run(sc, 4, [id]);
      expect(penalties(s), id).toEqual(['thinner-fresh-puncture']);
      expect(said(s), id).toMatch(/oozing round my fingers/);
      expect(s.timers.holdEnd, id).toBe(15);
    }
    const lytic = run(sc, 5, ['tnk']);
    expect(penalties(lytic)).toEqual(['lytic-no-indication']);
    expect(lytic.penalties[0].severity).toBe('critical');
    // the tech finishes the hold later than the usual 10 minutes on the case clock
    const s = run(sc, 5, ['heparin', 'legs-up', 'atropine', 'fluid', 'perfusion', ...R(4)]);
    expect(s.fired).not.toContain('tech-hold-done');
  });

  it('the built-in rules still apply: nitroglycerin, phenylephrine with a slow rate, blood with no bleed, atropine with a normal rate', () => {
    expect(penalties(run(sc, 5, ['nitro']))).toEqual(['nitro-hypotension']);
    expect(penalties(run(sc, 5, ['phenylephrine']))).toEqual(['phenylephrine-slow']);
    expect(penalties(run(sc, 4, ['transfuse']))).toEqual(['transfuse-no-bleeding']);
    expect(penalties(run(sc, 5, ['atropine', 'fluid', 'atropine']))).toEqual(['atropine-fast']);
  });

  it('nothing that needs a sheath, a catheter or a new puncture can be done, and nobody goes to the scanner during the hold', () => {
    for (const id of ['closure-device', 'access-femoral', 'angio', 'pericardiocentesis', 'temp-wire']) {
      const s = run(sc, 5, [id]);
      expect(s.counts[id], id).toBeUndefined();
      expect(s.log.at(-1)!.who, id).toBe('system');
    }
    for (const id of ['ic-epinephrine', 'stent-des', 'act', 'stop-contrast']) {
      const s = run(sc, 3, ['callout', id]);
      expect(s.counts[id], id).toBeUndefined();
      expect(penalties(s), id).toEqual([]);
    }
    const ct = run(sc, 5, ['ct-urgent']);
    expect(ct.counts['ct-urgent']).toBeUndefined();
    expect(ct.log.at(-1)!.text).toMatch(/^Not during the hold \(10 more minutes\)/);
    // once the hold is over and he is stable, the scan shows no bleed
    const after = run(sc, 5, ['legs-up', 'atropine', 'fluid', 'perfusion', ...R(4), 'ct-urgent']);
    expect(penalties(after)).toEqual([]);
    expect(after.log.at(-1)!.text).toBe('CT abdomen and pelvis: no retroperitoneal or groin hematoma.');
  });
});

describe('vasovagal reaction at the sheath pull: review fixes', () => {
  /** Play steps, skipping any the learner could not choose then (a sweep of every action has some) */
  function play(role: 3 | 4 | 5, steps: string[]): SimState {
    let s = run(sc, role, []);
    for (const id of steps) {
      while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
      if (!unavailableReason(sc, s, id)) s = perform(sc, s, id);
    }
    return s;
  }

  it('every action in each role\'s scope, at the height of the reaction: vitals a living patient can show, real rhythms, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      for (const iv of interventionsFor(role, 'cathlab')) {
        const s = run(sc, role, [], undefined, 'manual');
        let t = unavailableReason(sc, s, iv.id) ? s : perform(sc, s, iv.id);
        for (const id of ['reassess', 'reassess', 'reassess', 'reassess']) {
          while (t.pendingRead) t = answerRead(sc, t, t.pendingRead.answer);
          if (!t.ended) t = perform(sc, t, id);
        }
        expect(resolveProfile(t.rhythm.profile).id, `${role} ${iv.id}`).toBe(t.rhythm.profile);
        expect(t.pulse, `${role} ${iv.id}`).toBe(true);
        expect(t.vitals.sbp, `${role} ${iv.id}`).toBeGreaterThanOrEqual(50);
        expect(t.vitals.dbp, `${role} ${iv.id}`).toBeLessThan(t.vitals.sbp);
        for (const l of t.log) if (l.who === 'monitor') expect(l.text, `${role} ${iv.id}`).not.toMatch(giveaway);
      }
    }
  });

  it('a call-out made after the cardiologist came in on the alarm is a report to him at the table, with the numbers on the monitor now', () => {
    const t = run(sc, 3, ['reassess', 'callout']);
    expect(said(t)).toMatch(/"Rate 38 on my screen — why didn't anyone call me\?"/);
    expect(t.log.at(-2)!.text).toBe('"Doctor — heart rate 76, pressure 112 over 68 — he\'s pinking up. I\'m staying on the groin."');
    expect(t.log.at(-1)!.text).toBe('"Thanks — keep the numbers coming. And stay on that groin."');
    expect(said(t)).not.toMatch(/On my way in/);
    // the first call already reports the response: it counts for both items (the first one late)
    expect(late(t)).toEqual(['Call out the slow pulse and the low pressure at once — and stay on the groin']);
    expect(missed(t)).not.toContain('Call out the response to the treatment');
    const n = run(sc, 4, ['reassess', 'callout']);
    expect(n.log.at(-2)!.text).toBe('"Doctor — he\'s 38 and 70 over 40, sweaty and sick."');
    expect(n.log.at(-1)!.text).toBe('"Got it — thanks."');
    // a call for help with the cardiologist already in the room does not bring him in again
    expect(said(run(sc, 3, ['reassess', 'call-help']))).not.toMatch(/comes straight in/);
  });

  it('the cardiologist\'s asks name no numbers, and none is pushed on a patient who has already recovered', () => {
    const s = run(sc, 4, ['atropine', 'legs-up', 'fluid']);
    expect(s.log.some((l) => l.who === 'operator' && l.text === 'Something for his rate, please.')).toBe(true);
    expect(said(s)).not.toMatch(/Rate 38, pressure 70 over 40\. Something/);
    // paced and filled, he recovers without atropine: the cardiologist does not push it into a rate of 76 later
    const p = run(sc, 4, ['callout', 'pace', 'fluid', 'perfusion', ...R(4), 'hemostasis', 'handoff']);
    expect(p.flags).toHaveProperty('recovered');
    expect(p.fired).not.toContain('rn-rate-fallback');
    expect(said(p)).not.toMatch(/push the atropine myself/);
    expect(p.rhythm).toEqual({ profile: 'normal-sinus', hr: 76 });
    expect(missed(p)).toEqual(['Atropine for the slow rate, as asked']);
  });

  it('a treatment given once he has recovered earns nothing (and atropine then costs points)', () => {
    // the nurse's standing order brought him back at 6 minutes; the cardiologist's atropine after it treats nothing
    const s = run(sc, 5, ['legs-up', 'fluid', ...R(3), 'atropine', 'perfusion', ...R(2), 'handoff']);
    expect(s.fired).toContain('rn-atropine-standing');
    expect(penalties(s)).toEqual(['atropine-fast']);
    expect(missed(s)).toContain('Atropine 1 mg IV for the slow rate');
    const n = run(sc, 4, ['callout', 'pace', 'fluid', 'atropine']);
    expect(penalties(n)).toEqual(['atropine-fast']);
    expect(missed(n)).toContain('Atropine for the slow rate, as asked');
  });

  it('the cardiologist who never looks for a bleed has missed his own call: needs practice, and the hand-off says what was not examined', () => {
    const s = run(sc, 5, ['legs-up', 'atropine', 'fluid', ...R(5), 'handoff']);
    const r = review(sc, s);
    expect(r.percent).toBe(67);
    expect(r.grade).toBe('Needs practice');
    expect(s.log.findLast((l) => l.text.startsWith('SBAR'))!.text).toMatch(/groin soft and dry; the belly, the flank and the back still to be examined/);
    expect(criticalsFor(sc, 5).find((c) => c.id === 'md-site-check')!.points).toBe(15);
  });

  it('epinephrine before the basics lifts the rate and the pressure for a few minutes only: the slowing comes back', () => {
    const s = run(sc, 5, ['push-epi']);
    expect(penalties(s)).toEqual(['pressor-before-basics']);
    expect(s.rhythm.hr).toBe(48);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([86, 50]);
    expect(s.log.at(-1)!.text).toBe('Heart rate 48. BP 86/50 — for a few minutes.');
    expect(s.flags).not.toHaveProperty('rate-up');
    const later = perform(sc, perform(sc, s, 'reassess'), 'reassess');
    expect(later.fired).toContain('worse');
    expect(later.rhythm.hr).toBe(32);
    // after the atropine, push-dose epinephrine is the default bolus and costs nothing
    expect(penalties(run(sc, 5, ['atropine', 'push-epi']))).toEqual([]);
  });

  it('IM epinephrine for anaphylaxis, a P2Y12 load, amiodarone, lidocaine and nitroglycerin are each mistakes here', () => {
    for (const role of [4, 5] as const) {
      expect(penalties(run(sc, role, ['epi-im'])), `${role}`).toEqual(['epi-im-no-anaphylaxis']);
      expect(penalties(run(sc, role, ['p2y12'])), `${role}`).toEqual(['thinner-fresh-puncture']);
      // at a rate of 38 lidocaine is ruled out by its label; with the rate back up it only treats nothing
      expect(penalties(run(sc, role, ['lidocaine'])), `${role}`).toEqual(['lidocaine-slow-or-block']);
      expect(penalties(run(sc, role, ['atropine', 'lidocaine'])), `${role}`).toEqual(['lidocaine-no-arrhythmia']);
    }
    const amio = run(sc, 5, ['amio-infusion']);
    expect(penalties(amio)).toEqual(['nodal-blocker-slow']);
    expect(amio.rhythm.hr).toBe(34);
    expect([amio.vitals.sbp, amio.vitals.dbp]).toEqual([64, 36]);
    // nitroglycerin: the built-in rule while the pressure is low, the case's own once it is back — and no chest pain to ease
    const nitro = run(sc, 5, ['nitro']);
    expect(penalties(nitro)).toEqual(['nitro-hypotension']);
    expect(said(nitro)).not.toMatch(/The pressure is easing/);
    expect(penalties(run(sc, 5, ['legs-up', 'atropine', 'fluid', 'nitro']))).toEqual(['nitro-no-indication']);
    expect(review(sc, run(sc, 5, ['epi-im'])).toFix.find((t) => t.kind === 'harm')!.detail).toMatch(/A contrast reaction drops the pressure too, but with a fast pulse/);
  });

  it('the tech who starts compressions or shocks has let go of the groin too; pads over a rate of 50–70 are stopped by the nurse', () => {
    expect(penalties(run(sc, 3, ['callout', 'cpr']))).toEqual(['cpr-with-pulse', 'let-go']);
    expect(penalties(run(sc, 3, ['callout', 'defib']))).toEqual(['shock-with-pulse', 'let-go']);
    expect(penalties(run(sc, 3, ['callout', 'cardiovert']))).toEqual(['cardiovert-no-tachycardia', 'let-go']);
    // after the hold, the groin is sealed: only the built-in rule applies
    expect(penalties(run(sc, 3, ['callout', 'perfusion', 'callout', ...R(5), 'hemostasis']))).toEqual([]);
    const paced = play(3, ['callout', 'callout', ...R(1), 'pace']);
    expect(paced.rhythm.hr).toBe(76);
    expect(said(paced)).toMatch(/his own rate of 76 is faster/);
  });

  it('the hand-off says what was given and how the reaction went, whatever the run', () => {
    const slow = run(sc, 5, ['legs-up', 'fluid', 'perfusion', ...R(5), 'handoff']);
    expect(slow.log.findLast((l) => l.text.startsWith('SBAR'))!.text)
      .toMatch(/pulse 38 and pressure 70\/40, then 32 with a 6-second pause and a few seconds of jerking — treated with the legs raised, a saline bolus and atropine 1 mg/);
    const pressor = run(sc, 5, ['legs-up', 'atropine', 'pressor', 'perfusion', ...R(4), 'handoff']);
    expect(pressor.log.findLast((l) => l.text.startsWith('SBAR'))!.text).toMatch(/treated with the legs raised, atropine 1 mg and a vasopressor infusion/);
    const blood = run(sc, 5, ['legs-up', 'atropine', 'transfuse', 'perfusion', ...R(4), 'handoff']);
    expect(blood.log.findLast((l) => l.text.startsWith('SBAR'))!.text).toMatch(/treated with the legs raised, a unit of red cells and atropine 1 mg/);
    expect(penalties(blood)).toEqual(['transfuse-no-bleeding']);
  });

  it('with the numbers lifted by a drug but the surge not yet settled, he says he is a bit better', () => {
    const s = run(sc, 5, ['legs-up', 'atropine', 'pressor', 'reassess']);
    const better = s.log.findIndex((l) => l.who === 'patient' && l.text === '"A bit better… still sick to my stomach."');
    expect(better).toBeGreaterThan(0);
    // the legs have been up for 3 minutes since the rate came back: then he recovers
    expect(s.log.findIndex((l) => l.who === 'monitor' && l.tone === 'good')).toBeGreaterThan(better);
  });

  it('the legs go above the heart by tilting the bed head-down, so the punctured hip stays straight', () => {
    for (const role of [4, 5] as const) {
      expect(said(run(sc, role, ['legs-up']))).toMatch(/The bed tilted head-down, so his legs are above his heart; his right hip stays straight under the tech's fingers\./);
    }
    expect(said(run(sc, 3, ['callout', 'perfusion']))).toMatch(/Nurse: "Bed head-down, saline wide open — and atropine 1 milligram in, on the doctor's order\."/);
  });
});
