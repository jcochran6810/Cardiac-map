import { describe, expect, it } from 'vitest';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabAirEmbolism as sc } from '@/lib/sim/scenario/scenarios/cathlabAirEmbolism';
import type { SimState } from '@/lib/sim/scenario/types';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: calls out the numbers, stops the injections, readies a bubble-free syringe for the aspiration and flush; once
  // he has recovered, back-bleeds the guide and clears the manifold, then the stent as ordered, the 12-lead and the band
  3: ['callout', 'stop-contrast', 'clear-air', 'reassess', 'clear-air', 'stent-des', 'ecg12', 'hemostasis'],
  // the nurse: calls out the numbers, 100 % oxygen and atropine as ordered, phenylephrine for the pressure once the rate is up
  4: ['callout', 'o2-nrb', 'atropine', 'phenylephrine', 'reassess', 'ecg12', 'hemostasis', 'handoff'],
  // the cardiologist: stop injecting, oxygen, aspirate and flush, atropine, intracoronary epinephrine; once he has recovered, the planned stent
  5: ['stop-contrast', 'o2-nrb', 'clear-air', 'atropine', 'ic-epinephrine', 'reassess', 'stent-des', 'final-angio', 'ecg12', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
const TECH = IDEAL[3];
const RN = IDEAL[4];
/** The cardiologist's finish once he has recovered */
const FINISH = ['stent-des', 'final-angio', 'ecg12', 'handoff'];

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
/** Words that would name what happened before the learner has read it */
const naming = /\bair\b|bubble|embol|froth|\bgas\b/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis/i;

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

describe('air embolism in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('air-embolism-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-air', 'clin-bezold', 'stemi-inferior', 'nsr']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      expect(criticalsFor(sc, role).length, `role ${role}`).toBeGreaterThan(4);
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

  it('has no image of its own patient: the published comparison run exists, and its alt text names no finding', () => {
    expect(sc.images).toBeUndefined();
    const img = CATH_IMAGES['rca-air-embolism'];
    expect(img).toBeDefined();
    expect(img!.alt).not.toMatch(naming);
    expect(img!.caption).toMatch(/air bubbles/);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const t of sc.teaching) expect(t).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });

  it('teaches the treatment, the traps and the prevention', () => {
    const text = sc.teaching.join(' ');
    for (const point of [/100 % oxygen/, /aspirate back through the guide/, /forceful flush/, /atropine/, /Not nitroglycerin/, /not a stent/, /back-bleed the guide/, /tip down/]) {
      expect(text).toMatch(point);
    }
  });
});

describe('air embolism in the cath lab: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm.profile).toBe('normal-sinus');
      expect(s.reads.map((r) => r.answer)).toEqual(['clin-air', 'nsr']);
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      expect(s.fired).not.toContain('vf');
      expect(s.fired).not.toContain('worse');
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nothing names what happened before the learner reads it — and the read comes first', () => {
    for (const role of ROLES) {
      const s = run(sc, role, [], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-air', prompt: 'What just happened?' });
      expect(s.pendingRead?.partial ?? []).toEqual([]);
      expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 44 });
      expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([78, 46, 8]);
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(naming);
      expect(unavailableReason(sc, s, 'reassess')).toMatch(/read first/);
    }
  });

  it('calling it a reflex is a misread, and the feedback says what it was', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    s = answerRead(sc, s, 'clin-bezold');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'clin-air', verdict: 'wrong' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 5 });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Coronary air embolism\./);
  });

  it('a published run of the same complication reaches the Imaging screen only after the read, labeled as another patient\'s', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    expect(s.images).toEqual([{ minute: 0, id: 'view-rca-lao', view: 'LAO view of the right coronary (check run)' }]);
    s = answerRead(sc, s, 'clin-air');
    expect(s.images).toHaveLength(1);
    s = perform(sc, s, 'stop-contrast');
    expect(s.images.at(-1)).toMatchObject({ image: 'rca-air-embolism', view: expect.stringMatching(/^Another patient/) });
    // nothing waits on it, so its caption shows at once
    expect(s.pendingRead).toBeNull();
  });
});

describe('air embolism in the cath lab: what works', () => {
  it('aspirating and flushing brings the flow back; on 100 % oxygen the last bubbles clear a minute later, on room air three', () => {
    let s = run(sc, 5, ['clear-air']);
    expect(s.flags['air-cleared']).toBe(0.5);
    expect(s.log.some((l) => /froth and bubbles fill the syringe, then dark blood/.test(l.text))).toBe(true);
    expect(s.vitals.pain).toBe(5);
    s = perform(sc, perform(sc, s, 'perfusion'), 'lungs');
    expect(s.flags.recovered).toBeUndefined();
    s = perform(sc, s, 'reassess');
    expect(s.flags.recovered).toBe(3.5);
    // on oxygen: a minute after both the flush and the mask
    let o2 = run(sc, 5, ['o2-nrb', 'clear-air', 'perfusion']);
    expect(o2.flags.recovered).toBeUndefined();
    o2 = perform(sc, o2, 'lungs');
    expect(o2.flags.recovered).toBe(2);
    expect(o2.rhythm.profile).toBe('normal-sinus');
    expect([o2.vitals.sbp, o2.vitals.dbp, o2.vitals.pain]).toEqual([124, 74, 1]);
  });

  it('an aspiration catheter pulls the air out of the artery as well: full marks', () => {
    const s = run(sc, 5, MD.map((id) => (id === 'clear-air' ? 'aspiration' : id)));
    expect(s.log.some((l) => /Aspiration catheter down the right coronary to the clear spots/.test(l.text))).toBe(true);
    expectFullMarks(s);
  });

  it('atropine brings the rate from 44 to 68, and the pressure up a little; a second dose has nothing to treat', () => {
    const s = run(sc, 5, ['atropine']);
    expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 68 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([88, 52]);
    expect(s.penalties).toEqual([]);
    expect(penalties(perform(sc, s, 'atropine'))).toEqual(['atropine-fast']);
  });

  it('nothing goes down the guide before it is aspirated: an intracoronary drug is refused with the reason (no time, no score)', () => {
    for (const role of [4, 5] as const) {
      const before = run(sc, role, ['stop-contrast']);
      const s = perform(sc, before, 'ic-epinephrine');
      expect(s.minute, `role ${role}`).toBe(before.minute);
      expect(s.counts['ic-epinephrine'], `role ${role}`).toBeUndefined();
      expect(s.vitals, `role ${role}`).toEqual(before.vitals);
      expect(s.log.at(-1)!.text, `role ${role}`).toMatch(role === 5 ? /^Aspirate the guide first/ : /^Hold it — nothing goes down that guide/);
    }
    // once it is clear, intracoronary epinephrine lifts the pressure and the rate
    const s = run(sc, 5, ['clear-air', 'ic-epinephrine']);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([94, 54, 54]);
    expect(s.flags.supported).toBeDefined();
    expect(s.penalties).toEqual([]);
  });

  it('any pressor — or fluid — for the pressure is correct care too: full marks', () => {
    for (const drug of ['pressor', 'push-epi', 'phenylephrine', 'fluid']) {
      const s = run(sc, 5, MD.map((id) => (id === 'ic-epinephrine' ? drug : id)));
      expect(s.flags.supported, drug).toBeDefined();
      expectFullMarks(s);
    }
  });

  it('transcutaneous pacing for the slow rate counts as treating it: full marks, and his own rate takes over again', () => {
    // the pacer takes a minute to set up, so here the flow, the rate and the pressure are back before anything else is needed
    const s = run(sc, 5, ['stop-contrast', 'o2-nrb', 'clear-air', 'pace', ...FINISH]);
    expect(s.flags.recovered).toBe(2.1);
    expect(s.log.some((l) => /his own beats are back, faster than the pacer/.test(l.text))).toBe(true);
    expectFullMarks(s);
    // a vasopressor then has nothing to treat
    expect(penalties(run(sc, 5, MD.map((id) => (id === 'atropine' ? 'pace' : id))))).toEqual(['vasopressor-normal-pressure']);
  });

  it('flow brought back within 2 minutes brings the rate and the pressure back with it: no missed atropine or pressor', () => {
    const s = run(sc, 5, ['o2-nrb', 'clear-air', 'stop-contrast', 'perfusion', 'pulse-check', 'pulse-check', ...FINISH]);
    expect(s.flags.recovered).toBe(2);
    expect(s.counts.atropine).toBeUndefined();
    expectFullMarks(s);
  });

  it('a nasal cannula gets a word, no credit and no penalty: it is not the 100 % the bubbles need', () => {
    const md = run(sc, 5, ['o2-nc']);
    expect(md.penalties).toEqual([]);
    expect(md.flags['o2-100']).toBeUndefined();
    expect(md.log.some((l) => l.who === 'team' && /non-rebreather/.test(l.text))).toBe(true);
    expect(missed(md)).toContain('100 % oxygen (non-rebreather)');
    const rn = run(sc, 4, ['callout', 'o2-nc']);
    expect(rn.penalties).toEqual([]);
    expect(rn.log.some((l) => l.who === 'operator' && /a third oxygen — I want 100 %/.test(l.text))).toBe(true);
  });

  it('the final pictures wait for the recovery and the stent', () => {
    const s = run(sc, 5, ['clear-air', 'final-angio']);
    expect(s.counts['final-angio']).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/^Not the final pictures yet/);
  });
});

describe('air embolism in the cath lab: the traps', () => {
  it('intracoronary nitroglycerin with a pressure of 78 is a major error, drops it further and moves nothing — one penalty', () => {
    const s = run(sc, 5, ['clear-air', 'ic-nitro']);
    expect(penalties(s)).toEqual(['nitro-low-pressure']);
    expect(s.vitals.sbp).toBe(68);
    expect(s.log.some((l) => /Nothing to widen: the flow is no different/.test(l.text))).toBe(true);
    // sublingual nitroglycerin by the nurse: the same single penalty
    const rn = run(sc, 4, ['callout', 'nitro']);
    expect(penalties(rn)).toEqual(['nitro-low-pressure']);
    // with the pressure back, nitroglycerin before the final pictures is no mistake
    expect(penalties(run(sc, 5, [...MD.slice(0, MD.indexOf('stent-des')), 'ic-nitro']))).toEqual([]);
  });

  it('an intracoronary vasodilator with a low pressure costs points and drops it further', () => {
    const s = run(sc, 5, ['clear-air', 'ic-adenosine']);
    expect(penalties(s)).toEqual(['vasodilator-low-pressure']);
    expect(s.vitals.sbp).toBe(70);
    expect(penalties(run(sc, 5, ['clear-air', 'ic-nitroprusside']))).toEqual(['vasodilator-low-pressure']);
  });

  it('a stent for the "occlusion" while the air is still there costs points and changes nothing — and earns no credit later', () => {
    const s = run(sc, 5, ['stent-des']);
    expect(penalties(s)).toEqual(['stent-for-air']);
    expect(s.flags['air-cleared']).toBeUndefined();
    expect(s.rhythm.profile).toBe('inferior-stemi');
    expect(s.log.some((l) => /beyond the stent the artery is still blocked/.test(l.text))).toBe(true);
    const later = run(sc, 5, ['stent-des', 'stop-contrast', 'o2-nrb', 'clear-air', 'atropine', 'ic-epinephrine', 'reassess', 'final-angio', 'ecg12', 'handoff']);
    expect(later.ended?.reason).toBe('complete');
    const r = review(sc, later);
    expect(r.wentWell.map((w) => w.label)).not.toContain('Then finish the case: the planned stent, once he has recovered');
    expect(r.percent).toBeLessThan(90);
    // after the flush but before he has recovered: a smaller penalty
    expect(penalties(run(sc, 5, ['clear-air', 'stent-des']))).toEqual(['stent-unstable']);
    // and a second stent once the planned one is in
    expect(penalties(run(sc, 5, [...MD.slice(0, MD.indexOf('final-angio')), 'stent-des']))).toEqual(['extra-stent']);
  });

  it('another injection before the guide is aspirated pushes more air down: a major error, and he gets worse', () => {
    const s = run(sc, 5, ['view-rca-lao']);
    expect(penalties(s)).toEqual(['inject-through-air']);
    expect(s.rhythm.hr).toBe(38);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([70, 41]);
    expect(s.log.some((l) => /More clear spots stream down the right coronary/.test(l.text))).toBe(true);
    // after the aspiration the run shows the artery filling again, and costs nothing
    const after = run(sc, 5, ['clear-air', 'view-rca-lao']);
    expect(after.penalties).toEqual([]);
    expect(after.log.some((l) => /fills to the crux again/.test(l.text))).toBe(true);
  });

  it('left alone it gets worse at 2 minutes and fibrillates at 5; a shock brings him back to the same blocked artery — no shock and he dies', () => {
    let s = run(sc, 5, ['reassess']);
    expect(s.fired).toContain('worse');
    expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 36 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([66, 38]);
    s = perform(sc, perform(sc, s, 'reassess'), 'reassess');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    const shocked = perform(sc, s, 'defib');
    expect(shocked.pulse).toBe(true);
    expect(shocked.rhythm).toEqual({ profile: 'inferior-stemi', hr: 48 });
    expect(shocked.flags['air-cleared']).toBeUndefined();
    expect(penalties(shocked)).toEqual([]);
    // then clearing the air still brings him back
    const cleared = perform(sc, perform(sc, perform(sc, shocked, 'o2-nrb'), 'clear-air'), 'reassess');
    expect(cleared.flags.recovered).toBeDefined();
    expect(review(sc, stop(cleared)).wentWell.map((w) => w.label)).toContain('Defibrillate VF within 1 minute');
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });

  it('a pressure drug or the aspiration does not stop the VF from coming if the air is never aspirated', () => {
    const s = run(sc, 5, ['o2-nrb', 'atropine', 'pressor', ...R(2)]);
    expect(s.fired).toContain('vf');
  });

  it('phenylephrine with a rate of 44 slows it further and does not count as holding the pressure up', () => {
    const s = run(sc, 5, ['phenylephrine']);
    expect(penalties(s)).toEqual(['phenylephrine-slow']);
    expect(s.rhythm.hr).toBe(40);
    expect(s.flags.supported).toBeUndefined();
  });

  it('a beta-blocker, an AV-nodal blocker, clot drugs or a lytic for the air all cost points', () => {
    expect(penalties(run(sc, 5, ['metoprolol']))).toEqual(['beta-blocker']);
    expect(penalties(run(sc, 5, ['diltiazem']))).toEqual(['av-blocker-slow']);
    expect(penalties(run(sc, 5, ['adenosine6']))).toEqual(['av-blocker-slow']);
    expect(penalties(run(sc, 5, ['gp2b3a']))).toEqual(['clot-drugs-for-air']);
    expect(penalties(run(sc, 4, ['callout', 'cangrelor']))).toEqual(['clot-drugs-for-air']);
    const lytic = run(sc, 5, ['tnk']);
    expect(lytic.penalties[0]).toMatchObject({ id: 'lytic-in-lab', severity: 'critical' });
    expect(penalties(run(sc, 5, ['protamine']))).toEqual(['protamine-mid-pci']);
  });

  it('a pressor once the pressure is back has nothing to treat', () => {
    const recovered = MD.slice(0, MD.indexOf('stent-des'));
    for (const drug of ['push-epi', 'pressor', 'ic-epinephrine']) expect(penalties(run(sc, 5, [...recovered, drug])), drug).toEqual(['vasopressor-normal-pressure']);
    expect(penalties(run(sc, 5, [...recovered, 'phenylephrine']))).toEqual(['phenylephrine-no-hypotension']);
  });
});

describe('air embolism in the cath lab: the tech and the nurse', () => {
  it('the tech who opens a stent in the middle of it gets a word and a small penalty; the wrong stent later costs too', () => {
    const s = run(sc, 3, ['callout', 'stent-des']);
    expect(penalties(s)).toEqual(['tech-unasked-metal']);
    expect(s.penalties[0].points).toBe(3);
    expect(s.log.some((l) => l.who === 'operator' && /that is not plaque, it is air/.test(l.text))).toBe(true);
    const wrong = run(sc, 3, [...TECH.slice(0, TECH.indexOf('stent-des')), 'stent-covered']);
    expect(penalties(wrong)).toEqual(['wrong-stent']);
    expect(wrong.log.some((l) => l.who === 'operator' && /No — a drug-eluting stent/.test(l.text))).toBe(true);
  });

  it('the tech cannot set up a run or hand up a drug before the guide is aspirated: refused, with no time lost', () => {
    const s = run(sc, 3, ['callout']);
    for (const id of ['view-rca-lao', 'ic-epinephrine', 'ic-nitro']) {
      const t = perform(sc, s, id);
      expect(t.minute, id).toBe(s.minute);
      expect(t.counts[id], id).toBeUndefined();
      expect(t.log.at(-1)!.who, id).toBe('operator');
    }
  });

  it('a silent tech misses the callout and the stop, and the operator asks who is watching', () => {
    const s = run(sc, 3, ['clear-air', 'reassess']);
    expect(s.log.some((l) => l.who === 'operator' && /who's watching the monitor/.test(l.text))).toBe(true);
    expect(missed(s)).toEqual(expect.arrayContaining(['Call out the slow rate and the falling pressure at once', 'Stop the injections at once (injector and manifold)']));
  });

  it('when the tech never answers, the operator gets his own syringe and clears it in time: no VF', () => {
    const s = run(sc, 3, R(7));
    expect(s.flags['air-cleared']).toBe(4);
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'md-clears', 'recovered', 'deair-fallback', 'stent-fallback', 'md-stent', 'md-final']));
    expect(s.fired).not.toContain('vf');
    expect(s.fired).not.toContain('syringe-fallback');
    expect(s.pulse).toBe(true);
    expect(missed(s)).toEqual(expect.arrayContaining(['A bubble-free aspiration and flush set-up, at once']));
  });

  it('the nurse who reaches for adenosine or diltiazem for the rate gets a word and one penalty — as major as anyone else\'s', () => {
    for (const drug of ['adenosine6', 'diltiazem', 'amio-infusion']) {
      const s = run(sc, 4, ['callout', drug]);
      expect(penalties(s), drug).toEqual(['av-blocker-slow']);
      expect(s.penalties[0], drug).toMatchObject({ points: 8, severity: 'major' });
      expect(s.log.some((l) => l.who === 'operator' && /That slows him down further/.test(l.text)), drug).toBe(true);
    }
    // the cardiologist pays the same for the same drug
    expect(run(sc, 5, ['diltiazem']).penalties[0]).toMatchObject({ id: 'av-blocker-slow', points: 8 });
  });

  it('the nurse who answers the pressure order with nitroglycerin gets a word and one penalty', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('phenylephrine')), 'ic-nitro']);
    expect(penalties(s)).toEqual(['nitro-low-pressure']);
    expect(s.log.some((l) => l.who === 'operator' && /that drops his pressure/.test(l.text))).toBe(true);
  });

  it('when the nurse never answers, the team gives the oxygen and the atropine — and he recovers without VF', () => {
    const s = run(sc, 4, R(4));
    expect(s.fired).toEqual(expect.arrayContaining(['md-stops-for-rn', 'md-clears', 'rn-o2-fallback', 'rn-atropine-fallback', 'rn-pressure-ask', 'recovered', 'md-stent', 'md-final']));
    // the pressure order is overtaken by the recovery: nobody pushes a pressor into a normal pressure
    expect(s.fired).not.toContain('rn-pressure-fallback');
    expect(s.counts.phenylephrine).toBeUndefined();
    expect(s.fired).not.toContain('vf');
    expect(s.flags.recovered).toBeDefined();
    expect(missed(s)).toEqual(expect.arrayContaining(['100 % oxygen (non-rebreather)', 'Bring the slow rate up: atropine (pacing if it does not hold)', 'Hold the pressure up while it clears']));
  });

  it('a nurse who gives atropine before she is asked still gets the credit, and the pressure order follows', () => {
    const s = run(sc, 4, ['atropine', 'callout', 'o2-nrb', 'push-epi', 'reassess', 'ecg12', 'hemostasis', 'handoff']);
    expect(s.fired).not.toContain('rn-atropine-ask');
    expect(s.fired).toContain('rn-pressure-ask');
    expectFullMarks(s);
  });

  it('a nurse who holds the pressure up before the rate is never asked for it: full marks', () => {
    const s = run(sc, 4, ['callout', 'push-epi', 'o2-nrb', 'atropine', 'reassess', 'ecg12', 'hemostasis', 'handoff']);
    expect(s.fired).not.toContain('rn-pressure-ask');
    expectFullMarks(s);
  });
});

describe('air embolism in the cath lab: review fixes (each a regression test)', () => {
  it('the tech who readies the syringes as the very first action gets the credit, and the operator aspirates at once', () => {
    // the request only comes after the learner's first action: a tech who is already there must not be marked late
    const s = run(sc, 3, ['clear-air', 'stop-contrast', 'callout', 'reassess', 'clear-air', 'stent-des', 'ecg12', 'hemostasis']);
    expect(s.fired).toContain('syringe-got');
    expect(s.fired).not.toContain('syringe-fallback');
    expect(s.fired).not.toContain('worse');
    expect(s.flags['air-cleared']).toBe(0.5);
    expectFullMarks(s);
  });

  it('a second syringe set-up during the event is refused (no time, not counted), so the back-bleed is still there for later', () => {
    const before = run(sc, 3, ['callout', 'stop-contrast', 'clear-air']);
    const again = perform(sc, before, 'clear-air');
    expect(again.minute).toBe(before.minute);
    expect(again.counts['clear-air']).toBe(1);
    expect(again.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/^I have the syringes/) });
    expectFullMarks(run(sc, 3, ['callout', 'stop-contrast', 'clear-air', 'clear-air', 'clear-air', 'reassess', 'clear-air', 'stent-des', 'ecg12', 'hemostasis']));
  });

  it('the back-bleed after the recovery is no late answer to the syringe request the tech never answered', () => {
    const s = run(sc, 3, ['callout', 'stop-contrast', ...R(2), 'clear-air', 'stent-des', 'ecg12', 'hemostasis']);
    expect(s.fired).toContain('syringe-fallback');
    expect(s.fired).toContain('deair-got');
    expect(missed(s)).toContain('A bubble-free aspiration and flush set-up, at once');
  });

  it('a cardiologist who clears the air and gives oxygen, then watches, is not marked down for the length of the reassessment', () => {
    // flow due back at 2:00 (aspirated by 0:30, oxygen by 1:00): the rate and the pressure came back with it
    const fast = run(sc, 5, ['clear-air', 'o2-nrb', 'stop-contrast', 'reassess', ...FINISH]);
    expect(fast.flags.recovered).toBe(3.1);
    expectFullMarks(fast);
    // due at 2:06: the slow rate went 2 minutes untreated — late, half the points, not missed
    const slow = run(sc, 5, ['stop-contrast', 'clear-air', 'o2-nrb', 'reassess', ...FINISH]);
    const r = review(sc, slow);
    expect(r.toFix).toEqual([expect.objectContaining({ kind: 'late', label: 'Bring the slow rate up: atropine (pacing if it does not hold)', points: 5 })]);
    expect(r.wentWell.map((w) => w.label)).toContain('Hold the pressure up while it clears');
    // flow back only after 3 minutes, with no atropine and no pressor: both are missed
    const late = run(sc, 5, ['stop-contrast', 'perfusion', 'lungs', 'pulse-check', 'clear-air', 'o2-nrb', 'reassess', ...FINISH]);
    expect(missed(late)).toEqual(expect.arrayContaining(['Bring the slow rate up: atropine (pacing if it does not hold)', 'Hold the pressure up while it clears']));
  });

  it('a balloon pump — the mechanical support the teaching names — holds the pressure up too', () => {
    const s = run(sc, 5, ['stop-contrast', 'clear-air', 'o2-nrb', 'atropine', 'iabp', ...FINISH]);
    expect(s.flags.supported).toBeDefined();
    expect(s.log.some((l) => /IABP in, tip 2 cm below the left subclavian/.test(l.text))).toBe(true);
    // full marks (the 6 minutes it takes to place only show in the "flow back" timing, which is not scored)
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect([r.percent, r.toFix]).toEqual([100, []]);
  });

  it('a shock brings back a rhythm, not the flow: never aspirated, he fibrillates again 3 minutes later', () => {
    let s = run(sc, 5, [...R(3), 'defib']);
    expect(s.pulse).toBe(true);
    s = run(sc, 5, [...R(3), 'defib', 'reassess', 'reassess']);
    expect(s.fired).toContain('vf-again-1');
    expect(s.pulse).toBe(false);
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    // shocked again and still not aspirated, it keeps coming back; left alone, he dies
    let t = run(sc, 5, [...R(3), 'defib', ...R(2), 'defib', ...R(2)]);
    expect(t.fired).toContain('vf-again-2');
    for (let i = 0; i < 6 && !t.ended; i++) t = perform(sc, t, 'reassess');
    expect(t.ended?.reason).toBe('death');
    // aspirated after the shock: no second VF, and he recovers
    const cleared = run(sc, 5, [...R(3), 'defib', 'clear-air', 'o2-nrb', 'reassess', 'reassess']);
    expect(cleared.fired.some((id) => id.startsWith('vf-again'))).toBe(false);
    expect(cleared.flags.recovered).toBeDefined();
    // an AED says what an AED says
    expect(run(sc, 5, [...R(3), 'aed']).log.some((l) => l.who === 'monitor' && /^AED: "Shock advised\."/.test(l.text))).toBe(true);
  });

  it('a nurse who paces for the rate has answered the call: no atropine fallback announced, full credit', () => {
    const s = run(sc, 4, ['callout', 'o2-nrb', 'pace', 'push-epi', 'reassess', 'ecg12', 'hemostasis', 'handoff']);
    expect(s.fired).toContain('rn-atropine-got');
    expect(s.fired).not.toContain('rn-atropine-fallback');
    expect(s.log.some((l) => /push the atropine myself/.test(l.text))).toBe(false);
    expectFullMarks(s);
  });

  it('no radial band while the guide is still in the coronary: refused before the final pictures, done after', () => {
    for (const role of [3, 4] as const) {
      const before = run(sc, role, ['callout']);
      const s = perform(sc, before, 'hemostasis');
      expect(s.minute, `role ${role}`).toBe(before.minute);
      expect(s.counts.hemostasis, `role ${role}`).toBeUndefined();
      expect(s.log.at(-1)!.text, `role ${role}`).toMatch(/^Not yet — the guide is still in the coronary/);
    }
    expectFullMarks(run(sc, 3, ['callout', 'stop-contrast', 'clear-air', 'hemostasis', 'reassess', 'clear-air', 'stent-des', 'ecg12', 'hemostasis']));
  });

  it('nitroglycerin under the tongue brings no relief, only a lower pressure — one penalty', () => {
    for (const [drug, sbp] of [['nitro', 68], ['nitro-high', 58]] as const) {
      const s = run(sc, 5, [drug]);
      expect(penalties(s), drug).toEqual(['nitro-low-pressure']);
      expect(s.vitals.pain, drug).toBe(8);
      expect(s.vitals.sbp, drug).toBe(sbp);
      expect(s.log.some((l) => /The pressure is easing|a little better/.test(l.text)), drug).toBe(false);
    }
  });

  it('the radial cocktail with a low pressure costs points; the tech is not the one to give it', () => {
    for (const role of [4, 5] as const) {
      const s = run(sc, role, [role === 4 ? 'callout' : 'stop-contrast', 'radial-cocktail']);
      expect(penalties(s), `role ${role}`).toEqual(['cocktail-low-pressure']);
      expect(s.vitals.sbp, `role ${role}`).toBe(70);
    }
    const tech = run(sc, 3, ['callout']);
    const t = perform(sc, tech, 'radial-cocktail');
    expect(t.minute).toBe(tech.minute);
    expect(t.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/the nurse has the drugs/) });
  });

  it('drugs that slow the node slow it: diltiazem drops the rate, IV adenosine and amiodarone cost points', () => {
    const dilt = run(sc, 5, ['diltiazem']);
    expect([dilt.rhythm.hr, dilt.vitals.sbp]).toEqual([38, 66]);
    expect(penalties(run(sc, 5, ['adenosine-iv-ffr']))).toEqual(['av-blocker-slow']);
    expect(penalties(run(sc, 5, ['amio-infusion']))).toEqual(['av-blocker-slow']);
    // lidocaine at a rate of 44: its label rules it out (it can suppress the escape beats) — that outranks the case's minor rule
    expect(penalties(run(sc, 5, ['lidocaine']))).toEqual(['lidocaine-slow-or-block']);
  });

  it('an OCT run is a contrast flush down the guide: before the aspiration it pushes more air (the tech is held off)', () => {
    const md = run(sc, 5, ['oct']);
    expect(penalties(md)).toEqual(['inject-through-air']);
    expect(md.log.some((l) => /More clear spots stream down the right coronary/.test(l.text))).toBe(true);
    const tech = run(sc, 3, ['callout']);
    expect(perform(sc, tech, 'oct').log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/^Hold it/) });
    // once he has recovered, OCT and IVUS size the lesion (not "no plaque"), and FFR says it still needs its stent
    const ready = MD.slice(0, MD.indexOf('stent-des'));
    for (const id of ['oct', 'ivus']) expect(run(sc, 5, [...ready, id]).log.some((l) => /fibrous plaque: minimal lumen area 2\.6 mm²/.test(l.text)), id).toBe(true);
    expect(run(sc, 5, [...ready, 'ffr']).log.some((l) => /FFR 0\.71/.test(l.text))).toBe(true);
  });

  it('the extra views agree with the patient: V4R and the LV gram show the ischemia during the event, not after', () => {
    const during = run(sc, 5, ['ecg-right', 'lv-gram']);
    expect(during.log.some((l) => l.text === 'V4R: 1 mm of ST elevation.')).toBe(true);
    expect(during.log.some((l) => /LV gram: the inferior wall does not move/.test(l.text))).toBe(true);
    const after = run(sc, 5, [...MD.slice(0, MD.indexOf('stent-des')), 'ecg-right', 'lv-gram']);
    expect(after.log.some((l) => l.text === 'V4R: no ST elevation.')).toBe(true);
    expect(after.log.some((l) => /LV gram: normal wall motion/.test(l.text))).toBe(true);
  });

  it('procedures with no target are refused with the reason, at no cost in time', () => {
    const s = run(sc, 5, ['stop-contrast']);
    for (const id of ['closure-device', 'balloon-tamponade', 'pericardiocentesis']) {
      const t = perform(sc, s, id);
      expect(t.minute, id).toBe(s.minute);
      expect(t.counts[id], id).toBeUndefined();
      expect(t.log.at(-1)!.who, id).toBe('system');
    }
  });

  it('a covered stent for the "occlusion" is the same trap as a drug-eluting one: one penalty', () => {
    const s = run(sc, 5, ['stent-covered']);
    expect(penalties(s)).toEqual(['stent-for-air']);
    expect(s.flags['stent-early']).toBeDefined();
    expect(penalties(run(sc, 5, [...MD.slice(0, MD.indexOf('stent-des')), 'stent-covered']))).toEqual(['covered-no-perforation']);
  });

  it('push-dose epinephrine speeds the slow sinus rate a little as it lifts the pressure', () => {
    const s = run(sc, 5, ['push-epi']);
    expect([s.rhythm.hr, s.vitals.sbp, s.vitals.dbp]).toEqual([50, 94, 56]);
  });

  it('the review times what happened: the operator stops at once for the nurse, and the tech\'s set-up is not the aspiration', () => {
    const rn = review(sc, stop(run(sc, 4, ['vitals', 'o2-nrb'])));
    expect(rn.timings.find((t) => t.label === 'Injections stopped')).toMatchObject({ minute: 0, met: true });
    const tech = run(sc, 3, IDEAL[3]);
    expect(review(sc, tech).timings.find((t) => t.label === 'Air aspirated and flushed')!.minute).toBe(tech.flags['air-cleared']);
    expect(tech.flags['air-cleared']).toBe(0.7);
  });
});

describe('air embolism in the cath lab: every action in scope keeps a consistent patient', () => {
  it('during the event and after the recovery, for every role', () => {
    for (const role of ROLES) {
      const during = run(sc, role, role === 5 ? ['stop-contrast'] : ['callout']);
      const after = run(sc, role, IDEAL[role].slice(0, IDEAL[role].indexOf('reassess') + 1));
      expect(after.flags.recovered, `role ${role}`).toBeDefined();
      for (const from of [during, after]) {
        for (const iv of interventionsFor(role, 'cathlab')) {
          if (unavailableReason(sc, from, iv.id)) continue;
          const s = perform(sc, from, iv.id);
          const what = `role ${role} ${iv.id} at ${from.minute}`;
          expect(resolveProfile(s.rhythm.profile).id, what).toBe(s.rhythm.profile);
          if (s.pulse) {
            expect(s.vitals.sbp, what).toBeGreaterThanOrEqual(50);
            expect(s.vitals.sbp, what).toBeGreaterThan(s.vitals.dbp);
          }
          for (const l of s.log.slice(from.log.length)) if (l.who === 'monitor') expect(l.text, what).not.toMatch(giveaway);
        }
      }
    }
  });
});
