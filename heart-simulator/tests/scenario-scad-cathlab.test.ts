import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabScad as sc } from '@/lib/sim/scenario/scenarios/cathlabScad';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const said = (s: SimState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: set-up, the time-out, the JL4 as asked, calls out the damped pressure, repeats the LAD after the nurse's
  // nitroglycerin, the JR4 as asked, the radial band and the 12-lead for the ache
  3: ['prep', 'transducer', 'pads', 'timeout', 'cath-jl4', 'callout', 'view-lao-cranial', 'cath-jr4', 'hemostasis', 'ecg12'],
  // the nurse: consent (and the breastfeeding question), heparin as ordered, the time-out, a 12-lead, the damped pressure
  // called out, intracoronary nitroglycerin, "no more heparin" read back, metoprolol, fentanyl, the band, the repeat 12-lead, the hand-off
  4: ['consent', 'heparin', 'timeout', 'ecg12', 'callout', 'ic-nitro', 'callout', 'metoprolol', 'fentanyl', 'hemostasis', 'ecg12-repeat', 'handoff'],
  // the cardiologist: consent, heparin and the time-out before access; the damped catheter backed out; the diagnostic run;
  // nitroglycerin and a repeat of the LAD; no intervention; the heparin stopped; metoprolol; the ache treated and a 12-lead;
  // the echo; the hand-off
  5: ['consent', 'heparin', 'timeout', 'access', 'cath-jl4', 'reposition', 'angio', 'ic-nitro', 'view-lao-cranial', 'stop-antithrombotics', 'metoprolol',
    'fentanyl', 'ecg12', 'echo', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
/** The cardiologist up to the run that shows the dissection */
const MD_TO_RUN = MD.slice(0, MD.indexOf('angio') + 1);
/** ... and on to the nitroglycerin and the repeat run: the diagnosis made, spasm ruled out */
const MD_TO_DIAGNOSIS = MD.slice(0, MD.indexOf('view-lao-cranial') + 1);
/** The cardiologist's steps after the diagnosis */
const MD_FINISH = MD.slice(MD.indexOf('view-lao-cranial') + 1);

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const naming = /SCAD|spontaneous|dissect|intramural|hematoma|blood in the wall/i;
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

describe('SCAD in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('scad-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    expect(sc.images).toBeUndefined();
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['angio-scad', 'angio-dissection', 'hemo-damped', 'reperfused-anterior']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // every harm aimed at a role can be committed by it
      for (const h of sc.harms.filter((x) => !x.roles || x.roles.includes(role))) {
        if (h.roles) expect(h.actions.some((id) => scope.has(id)), `role ${role}: harm ${h.id}`).toBe(true);
      }
    }
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('SCAD in the cath lab: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.reads.map((r) => r.answer)).toEqual(expect.arrayContaining(['angio-scad', 'reperfused-anterior']));
      if (role !== 5) expect(s.reads.map((r) => r.answer)).toContain('hemo-damped');
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      // conservative care: no wire, no balloon, no stent, and the flow is what it was
      expect(s.flags.wired).toBeUndefined();
      expect(s.flags.extended).toBeUndefined();
      expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
      expect(s.flags['spasm-excluded']).toBeDefined();
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nothing names the dissection before the learner reads the run, for every role', () => {
    const toRun: Record<3 | 4 | 5, string[]> = {
      3: ['prep', 'transducer', 'pads', 'timeout', 'cath-jl4', 'read:hemo-damped', 'callout'],
      4: ['consent', 'heparin', 'timeout', 'ecg12', 'read:hemo-damped', 'read:reperfused-anterior', 'callout'],
      5: [...MD_TO_RUN],
    };
    for (const role of ROLES) {
      const s = run(sc, role, toRun[role], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'angio', answer: 'angio-scad', prompt: 'What does the left coronary run show?' });
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(naming);
      // and a hint asked for now only coaches the read
      expect(takeHint(sc, s).log.at(-1)!.text).not.toMatch(naming);
    }
  });

  it('nitroglycerin given before the first run rules out spasm on that run: full marks without a repeat view', () => {
    const steps = MD.filter((id) => id !== 'view-lao-cranial');
    const reordered = [...steps.slice(0, steps.indexOf('angio')), 'ic-nitro', 'angio', ...steps.slice(steps.indexOf('angio') + 1).filter((id) => id !== 'ic-nitro')];
    const s = run(sc, 5, reordered);
    expect(said(s, /^Left coronary, after the nitroglycerin/)).toBe(true);
    expectFullMarks(s);
  });

  it('an LV gram instead of the echo, nitroglycerin for the ache, and femoral access are correct care too: full marks', () => {
    const steps = MD.map((id) => (id === 'echo' ? 'lv-gram' : id === 'fentanyl' ? 'nitro' : id === 'access' ? 'access-femoral' : id));
    expectFullMarks(run(sc, 5, steps));
  });

  it('a second antiplatelet drug without a stent is debated, not wrong: no penalty', () => {
    const s = run(sc, 5, [...MD_TO_DIAGNOSIS, 'p2y12', ...MD_FINISH]);
    expectFullMarks(s);
  });
});

describe('SCAD in the cath lab: the run and the read', () => {
  it('the run shows a long smooth narrowing with TIMI 3 flow and no plaque, in words: there is no real image of it', () => {
    const s = run(sc, 5, MD_TO_RUN, undefined, 'manual');
    expect(s.images.at(-1)).toMatchObject({ id: 'angio' });
    expect(s.images.at(-1)!.image).toBeUndefined();
    expect(s.pendingRead?.run).toBeUndefined();
    expect(said(s, /narrows smoothly and gradually over about 40 mm/)).toBe(true);
    expect(said(s, /no plaque anywhere/)).toBe(true);
    expect(said(s, /TIMI 3/)).toBe(true);
  });

  it('"dissection" alone is half right; "severe stenosis" is wrong — and the feedback says what it was', () => {
    let s = run(sc, 5, MD_TO_RUN, undefined, 'manual');
    const partial = answerRead(sc, s, 'angio-dissection');
    expect(partial.reads.at(-1)).toMatchObject({ verdict: 'partial' });
    expect(partial.penalties.at(-1)).toMatchObject({ points: 2 });
    s = answerRead(sc, s, 'angio-severe-stenosis');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'angio-scad', verdict: 'wrong' });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Spontaneous coronary artery dissection \(SCAD\)\./);
  });

  it('intracoronary nitroglycerin, then the LAD again: unchanged, so not spasm (without the nitroglycerin a repeat proves nothing)', () => {
    const plain = run(sc, 5, [...MD_TO_RUN, 'view-rao-cranial']);
    expect(plain.flags['spasm-excluded']).toBeUndefined();
    expect(missed(plain)).toContain('Rule out spasm: intracoronary nitroglycerin, then repeat the LAD');
    const s = run(sc, 5, MD_TO_DIAGNOSIS);
    expect(s.flags['spasm-excluded']).toBeDefined();
    expect(said(s, /After the nitroglycerin the long, smooth narrowing .* is unchanged/)).toBe(true);
    expect(s.vitals.sbp).toBeLessThan(138);
  });

  it('the angiogram needs a catheter that reaches the left coronary', () => {
    const s = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-jr4', 'angio']);
    expect(s.counts.angio).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/JR4 sees only the right coronary/);
    expect(s.flags.damped).toBeUndefined();
  });
});

describe('SCAD in the cath lab: the damped catheter', () => {
  const TO_ENGAGE = MD.slice(0, MD.indexOf('cath-jl4') + 1);

  it('engaging the left main damps the pressure; backing out brings the real pressure back', () => {
    let s = run(sc, 5, TO_ENGAGE);
    expect(s.flags.damped).toBeDefined();
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([84, 66]);
    expect(said(s, /Doctor — the pressure's damped!/)).toBe(true);
    s = perform(sc, s, 'reposition');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([138, 86]);
    expect(s.flags.repositioned).toBeDefined();
  });

  it('injecting into the damped catheter is a major error and misses the back-out — the run still gets done', () => {
    const s = run(sc, 5, [...TO_ENGAGE, 'angio']);
    expect(penalties(s)).toEqual(['inject-damped']);
    expect(said(s, /dye squirts against the wall and hangs at the catheter tip/)).toBe(true);
    expect(s.flags.scad).toBeDefined();
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([138, 86]);
    expect(missed(s)).toContain('Back the damped catheter out before injecting');
    // a cine view into it is the same mistake
    expect(penalties(run(sc, 5, [...TO_ENGAGE, 'view-rao-cranial']))).toEqual(['inject-damped']);
  });

  it('left wedged for 3 minutes, the left heart goes without flow: VF — a shock brings her back', () => {
    let s = run(sc, 5, [...TO_ENGAGE, 'reassess', 'reassess']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
    expect(penalties(s)).toEqual([]);
    expect(missed(s)).toContain('Back the damped catheter out before injecting');
  });

  it('the tech and the nurse read the damped pressure and call it out; silence makes the operator notice it at 2 minutes', () => {
    for (const role of [3, 4] as const) {
      const steps = IDEAL[role].slice(0, IDEAL[role].indexOf('callout'));
      const quiet = run(sc, role, [...steps, ...R(1)]);
      expect(quiet.fired, `role ${role}`).toContain('md-reposition');
      expect(said(quiet, /who's watching the waveform\?/), `role ${role}`).toBe(true);
      expect(missed(quiet), `role ${role}`).toContain('Call out the damped pressure at once');
      const called = run(sc, role, [...steps, 'callout']);
      expect(said(called, /Thanks — backing out/), `role ${role}`).toBe(true);
    }
  });
});

describe('SCAD in the cath lab: the traps', () => {
  /** A guide in the left main and a wire down the LAD after the diagnosis */
  const WIRED = [...MD_TO_DIAGNOSIS, 'guide-ebu', 'wire-workhorse'];

  it('a wire down a stable SCAD is a major error; a stent pushes the blood in the wall along the vessel: flow slows, pain and ST elevation come back', () => {
    const wired = run(sc, 5, WIRED);
    expect(penalties(wired)).toEqual(['wire-stable-scad']);
    const s = perform(sc, wired, 'stent-des');
    expect(penalties(s)).toEqual(['wire-stable-scad', 'pci-stable-scad']);
    expect(s.penalties.find((p) => p.id === 'pci-stable-scad')).toMatchObject({ severity: 'critical', points: 15 });
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 112 });
    expect([s.vitals.sbp, s.vitals.pain]).toEqual([104, 8]);
    expect(said(s, /it has moved/)).toBe(true);
    expect(review(sc, stop(s)).grade).not.toBe('Excellent');
  });

  it('a balloon does the same; once the dissection has spread, long stents are the bail-out (no second penalty) — left alone, VF', () => {
    const ballooned = run(sc, 5, [...WIRED, 'balloon-predil']);
    expect(penalties(ballooned)).toEqual(['wire-stable-scad', 'pci-stable-scad']);
    expect(ballooned.flags.extended).toBeDefined();
    const bail = perform(sc, ballooned, 'stent-des');
    expect(bail.flags.bailout).toBeDefined();
    expect(bail.rhythm.profile).toBe('anterior-stemi-reperfused');
    expect(penalties(bail)).toEqual(['wire-stable-scad', 'pci-stable-scad']);
    let left = ballooned;
    for (let i = 0; i < 5 && left.pulse; i++) left = perform(sc, left, 'reassess');
    expect(left.pulse).toBe(false);
    expect(left.fired).toContain('extended-vf');
  });

  it('IVUS and OCT for a diagnosis the angiogram already made cost points (OCT more: its contrast flush)', () => {
    expect(penalties(run(sc, 5, [...WIRED, 'ivus']))).toEqual(['wire-stable-scad', 'ivus-scad']);
    const oct = run(sc, 5, [...WIRED, 'oct']);
    expect(penalties(oct)).toEqual(['wire-stable-scad', 'oct-scad']);
    expect(oct.penalties.at(-1)).toMatchObject({ points: 8, severity: 'major' });
    expect(said(oct, /forceful contrast flush/)).toBe(true);
    // the tech has no wire to image: nothing happens and nothing is scored
    const tech = run(sc, 3, [...IDEAL[3].slice(0, IDEAL[3].indexOf('cath-jr4')), 'ivus']);
    expect(tech.counts.ivus).toBeUndefined();
  });

  it('anticoagulation after the diagnosis is a major error for the cardiologist and the nurse', () => {
    for (const drug of ['gp2b3a', 'cangrelor', 'bivalirudin']) expect(penalties(run(sc, 5, [...MD_TO_DIAGNOSIS, drug])), drug).toEqual(['antithrombotic-after-scad']);
    // the heparin bolus held at the start and given once the dissection is on the screen: the wrong time for it
    const late = run(sc, 5, [...MD_TO_DIAGNOSIS.filter((id) => id !== 'heparin'), 'heparin']);
    expect(penalties(late)).toEqual(['antithrombotic-after-scad']);
    expect(said(late, /Heparin now — with blood in the wall of that artery\?/)).toBe(true);
    expect(missed(late)).toContain('Heparin for the STEMI before the catheters go in');
    // the nurse who answers "no more heparin" with bivalirudin: the operator's word and one penalty
    const rn = IDEAL[4];
    const s = run(sc, 4, [...rn.slice(0, rn.indexOf('ic-nitro') + 1), 'bivalirudin']);
    expect(penalties(s)).toEqual(['antithrombotic-after-scad']);
    expect(s.log.some((l) => l.who === 'operator' && /No more anticoagulation/.test(l.text))).toBe(true);
  });

  it('a fibrinolytic is a critical error, and with the dissection on the screen it spreads it', () => {
    const s = run(sc, 5, [...MD_TO_DIAGNOSIS, 'tnk']);
    expect(penalties(s)).toEqual(['lytic-scad']);
    expect(s.penalties[0].severity).toBe('critical');
    expect(s.flags.extended).toBeDefined();
    expect(s.rhythm.profile).toBe('anterior-stemi');
    expect(review(sc, stop(s)).grade).not.toBe('Excellent');
  });

  it('a forceful flush, a balloon pump, an aspiration catheter and oxygen with a normal SpO₂ all cost points', () => {
    expect(penalties(run(sc, 5, [...MD_TO_DIAGNOSIS, 'clear-air']))).toEqual(['forceful-flush']);
    expect(penalties(run(sc, 5, [...MD_TO_DIAGNOSIS, 'iabp']))).toEqual(['mcs-stable']);
    expect(penalties(run(sc, 5, [...WIRED, 'aspiration']))).toEqual(['wire-stable-scad', 'aspiration-scad']);
    for (const role of ROLES) expect(penalties(run(sc, role, ['o2-nrb'])), `role ${role}`).toEqual(['oxygen-normoxic']);
  });

  it('the ache is not a reason to intervene: the tech offers a wire, the right answer is pain relief and an unchanged 12-lead', () => {
    let s = run(sc, 5, MD_TO_DIAGNOSIS);
    expect(s.flags.ache).toBeDefined();
    expect(s.log.some((l) => l.who === 'team' && /Guide and a workhorse wire/.test(l.text))).toBe(true);
    s = perform(sc, s, 'fentanyl');
    expect(s.vitals.pain).toBe(1);
    // a 12-lead now, and another a little later: the ST segments do not move
    s = perform(sc, s, 'ecg12');
    while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
    s = perform(sc, s, 'ecg12-repeat');
    expect(s.pendingRead).toBeNull();
    expect(said(s, /^Unchanged from the previous 12-lead\.$/)).toBe(true);
    expect(said(s, /When can I go home\?/)).toBe(true);
    // ignoring the ache misses both
    const ignored = run(sc, 5, MD.filter((id) => id !== 'fentanyl' && id !== 'ecg12'));
    expect(review(sc, ignored).toFix.filter((t) => t.kind === 'missed').map((t) => t.label))
      .toEqual(expect.arrayContaining(['Treat the ache — not with a stent', '12-lead when the ache comes back']));
  });

  it('the hand-off waits for the diagnosis, then keeps her on telemetry for days and stops the heparin', () => {
    const early = run(sc, 5, MD.slice(0, MD.indexOf('reposition') + 1));
    const blocked = perform(sc, early, 'handoff');
    expect(blocked.counts.handoff).toBeUndefined();
    const s = run(sc, 5, MD);
    const text = s.log.find((l) => /^SBAR hand-off/.test(l.text))!.text;
    expect(text).toMatch(/Telemetry for 3 to 5 days, not an early discharge/);
    expect(text).toMatch(/No more heparin after the diagnosis, and no infusion/);
    expect(text).toMatch(/managed without a wire or a stent/);
    expect(text).toMatch(/fibromuscular dysplasia/);
  });

  it('metoprolol slows the rate and lowers the pressure a little', () => {
    const s = run(sc, 5, [...MD_TO_DIAGNOSIS, 'metoprolol']);
    expect(s.rhythm.hr).toBe(86);
    expect(s.vitals.sbp).toBeLessThan(138);
    expect(s.flags['beta-blocker']).toBeDefined();
  });
});

describe('SCAD in the cath lab: the tech and the nurse', () => {
  const TECH = IDEAL[3];
  const RN = IDEAL[4];

  it('the tech who opens a stent or a wire after "we leave it alone" gets a word and a small penalty', () => {
    for (const device of ['stent-des', 'wire-workhorse', 'guide-ebu']) {
      const s = run(sc, 3, [...TECH.slice(0, TECH.indexOf('cath-jr4')), device]);
      expect(penalties(s), device).toEqual(['tech-unasked-device']);
      expect(s.log.some((l) => l.who === 'operator' && /we are not touching this artery/.test(l.text)), device).toBe(true);
    }
  });

  it('the tech hands what was asked for: a Tiger for a JL4, a right-coronary view for the LAD, cost points', () => {
    expect(penalties(run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'cath-tiger']))).toEqual(['wrong-diag']);
    const view = run(sc, 3, [...TECH.slice(0, TECH.indexOf('view-lao-cranial')), 'view-rca-lao']);
    expect(penalties(view)).toEqual(['wrong-view']);
    expect(view.log.some((l) => l.who === 'operator' && /That's the right coronary/.test(l.text))).toBe(true);
  });

  it('the nurse gives what was ordered: the wrong drug for the beta-blocker or the pain gets a word and costs points', () => {
    const bb = run(sc, 4, [...RN.slice(0, RN.indexOf('metoprolol')), 'diltiazem']);
    expect(penalties(bb)).toEqual(['wrong-rn-bb']);
    const pain = run(sc, 4, [...RN.slice(0, RN.indexOf('fentanyl')), 'midazolam']);
    expect(penalties(pain)).toEqual(['wrong-rn-pain']);
    expect(pain.log.some((l) => l.who === 'operator' && /it doesn't treat pain/.test(l.text))).toBe(true);
    const nitro = run(sc, 4, [...RN.slice(0, RN.indexOf('ic-nitro')), 'ic-adenosine']);
    expect(penalties(nitro)).toEqual(['wrong-rn-nitro']);
  });

  it('the nurse reads back "no more heparin" — silence misses it, and the operator writes it on the orders', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('ic-nitro') + 1), 'metoprolol', ...R(2)]);
    expect(s.fired).toContain('rn-heparin-off-fallback');
    expect(missed(s)).toContain('Read back the order: no more heparin');
  });

  it('when the tech never answers, the operator does it all — and the procedure still ends', () => {
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', ...R(8)]);
    expect(s.fired).toEqual(expect.arrayContaining(['diag-fallback', 'md-reposition', 'view-fallback', 'jr4-fallback', 'md-done']));
    expect(s.flags['spasm-excluded']).toBeDefined();
    expect(s.flags['proc-over']).toBeDefined();
    expect(s.pulse).toBe(true);
  });

  it('when the nurse never answers, the operator gives the drugs — and the procedure still ends', () => {
    const s = run(sc, 4, ['consent', 'timeout', ...R(10)]);
    expect(s.fired).toEqual(expect.arrayContaining(['rn-heparin-fallback', 'rn-nitro-fallback', 'rn-heparin-off-fallback', 'rn-bb-fallback', 'rn-pain-fallback', 'md-done']));
    expect(s.flags['beta-blocker']).toBeDefined();
    expect(s.flags['proc-over']).toBeDefined();
  });

  it('the 12-lead read in the lab is a reperfused anterior wall; calling it an active anterior STEMI is half right', () => {
    // the catheter damps as the 12-lead finishes: that read comes first, then the 12-lead's
    const s = run(sc, 4, readAfter(['consent', 'heparin', 'timeout', 'ecg12', 'read:hemo-damped'], 'read:hemo-damped', 'stemi-anterior'), undefined, 'manual');
    expect(s.reads.find((r) => r.kind === 'ecg')).toMatchObject({ answer: 'reperfused-anterior', verdict: 'partial' });
  });

  it('every role ends up with the same patient: the diagnosis, spasm ruled out, no wire', () => {
    for (const role of [3, 4, 5] as LearningLevel[]) {
      const s = run(sc, role, IDEAL[role as 3 | 4 | 5]);
      expect(s.flags.scad, `role ${role}`).toBeDefined();
      expect(s.flags['spasm-excluded'], `role ${role}`).toBeDefined();
      expect(s.flags.wired, `role ${role}`).toBeUndefined();
    }
  });
});

describe('SCAD in the cath lab: the independent review', () => {
  const TO_ENGAGE = MD.slice(0, MD.indexOf('cath-jl4') + 1);
  const handoff = (s: SimState) => s.log.find((l) => /^SBAR hand-off/.test(l.text))!.text;

  it('the beta-blocker can be IV in the lab or by mouth: either counts, and the hand-off says it was started', () => {
    expect(criticalsFor(sc, 5).find((c) => c.id === 'md-bb')).toMatchObject({ points: 5, uses: ['metoprolol', 'metoprolol-po'] });
    const oral = run(sc, 5, MD.map((id) => (id === 'metoprolol' ? 'metoprolol-po' : id)));
    expectFullMarks(oral);
    expect(handoff(oral)).toMatch(/Metoprolol started/);
    // and IV metoprolol in the stable patient costs nothing (the ideal run gives it)
    expect(handoff(run(sc, 5, MD))).toMatch(/Metoprolol started/);
    // none at all: the item is missed, and the hand-off leaves it for the unit
    const none = run(sc, 5, MD.filter((id) => id !== 'metoprolol'));
    expect(missed(none)).toEqual(['A beta-blocker once the SCAD is seen: IV metoprolol, or by mouth']);
    expect(handoff(none)).toMatch(/Metoprolol by mouth to start on the unit/);
  });

  it('IV metoprolol once the spread hematoma has made the wall ischemic again (rate over 110, pressure falling) is a major error', () => {
    const s = run(sc, 5, [...MD_TO_DIAGNOSIS, 'guide-ebu', 'wire-workhorse', 'stent-des', 'metoprolol']);
    expect(penalties(s)).toEqual(['wire-stable-scad', 'pci-stable-scad', 'beta-blocker-shock-risk']);
  });

  it('a "reposition" before the catheter damps cannot switch the damping off before it happens', () => {
    // nothing in a coronary: nothing to reposition, no time, no count
    const none = perform(sc, run(sc, 5, ['consent', 'heparin', 'timeout', 'access']), 'reposition');
    expect(none.counts.reposition).toBeUndefined();
    // the right coronary engaged and nothing wedged: nothing to do, and the one back-out is kept for when the left damps
    let s = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-jr4']);
    s = perform(sc, s, 'reposition');
    expect(s.counts.reposition).toBeUndefined();
    s = perform(sc, s, 'cath-jl4');
    expect(s.flags.repositioned).toBeUndefined();
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([84, 66]);
    expect(penalties(perform(sc, s, 'angio'))).toEqual(['inject-damped']);
    s = perform(sc, s, 'reposition');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([138, 86]);
    expect(missed(s)).not.toContain('Back the damped catheter out before injecting');
  });

  it('nothing goes down a damped catheter: intracoronary nitroglycerin waits (no time, and no low-pressure penalty from the damped reading)', () => {
    const s = perform(sc, run(sc, 5, TO_ENGAGE), 'ic-nitro');
    expect(s.counts['ic-nitro']).toBeUndefined();
    expect(penalties(s)).toEqual([]);
    expect(s.log.at(-1)!.text).toMatch(/pressure is damped/);
  });

  it('no wire before the artery has been filmed; a left guide can film it instead of a diagnostic catheter: full marks', () => {
    const blind = perform(sc, run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'guide-ebu', 'reposition']), 'wire-workhorse');
    expect(blind.counts['wire-workhorse']).toBeUndefined();
    expect(penalties(blind)).toEqual([]);
    expectFullMarks(run(sc, 5, MD.map((id) => (id === 'cath-jl4' ? 'guide-ebu' : id === 'angio' ? 'view-rao-cranial' : id))));
  });

  it('the final pictures after the nitroglycerin repeat the LAD (full marks); before any run there are no "final" pictures to show', () => {
    const early = perform(sc, run(sc, 5, MD.slice(0, MD.indexOf('reposition') + 1)), 'final-angio');
    expect(early.counts['final-angio']).toBeUndefined();
    for (const l of early.log) expect(l.text).not.toMatch(naming);
    expectFullMarks(run(sc, 5, MD.map((id) => (id === 'view-lao-cranial' ? 'final-angio' : id))));
  });

  it('only a call-out while the catheter is damped counts: not one after the operator backed out, nor the nurse\'s later heparin read-back', () => {
    const quiet = IDEAL[4].slice(0, IDEAL[4].indexOf('callout'));
    const rn = run(sc, 4, [...quiet, ...R(1), 'ic-nitro', 'callout', 'metoprolol', 'fentanyl', 'hemostasis', 'ecg12-repeat', 'handoff']);
    expect(rn.flags['heparin-off']).toBeDefined();
    expect(missed(rn)).toContain('Call out the damped pressure at once');
    expect(review(sc, rn).timings.find((t) => t.label === 'Damped pressure dealt with')).toMatchObject({ minute: 2, met: false });
    const tech = run(sc, 3, [...IDEAL[3].slice(0, IDEAL[3].indexOf('callout')), ...R(1), 'callout']);
    expect(missed(tech)).toContain('Call out the damped pressure at once');
  });

  it('the nurse who gives the heparin after the operator already gave it doubles the dose: a major error, and the order is not counted', () => {
    const s = run(sc, 4, ['consent', ...R(1), 'heparin']);
    expect(s.fired).toContain('rn-heparin-fallback');
    expect(penalties(s)).toEqual(['heparin-twice']);
    expect(said(s, /double dose/)).toBe(true);
    expect(missed(s)).toContain('Heparin for the STEMI, as ordered');
    // switching to bivalirudin before the diagnosis is not scored as a double dose (after it, it is the anticoagulation harm)
    expect(penalties(run(sc, 5, ['consent', 'heparin', 'bivalirudin']))).toEqual([]);
    // the cardiologist stops the heparin once the SCAD is seen; the nurse's read-back may be the stop itself
    const md = run(sc, 5, MD.filter((id) => id !== 'stop-antithrombotics'));
    expect(missed(md)).toContain('Once the SCAD is seen: stop the heparin — no top-up, no drip');
    const rn = IDEAL[4];
    const stopped = run(sc, 4, rn.map((id, i) => (id === 'callout' && i === rn.lastIndexOf('callout') ? 'stop-antithrombotics' : id)));
    expect(stopped.fired).toContain('rn-heparin-off-got');
    // her own second bolus: the case's double dose stands in for the built-in unguided repeat (one dose, one penalty)
    expect(penalties(run(sc, 4, ['consent', 'heparin', 'heparin']))).toEqual(['heparin-twice']);
  });

  it('the tech who opens a balloon or a stent before anyone has seen the artery wastes it; a guide and a wire opened ahead are no mistake', () => {
    const stent = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'stent-des']);
    expect(penalties(stent)).toEqual(['tech-opened-early']);
    expect(stent.log.some((l) => l.who === 'operator' && /Too early/.test(l.text))).toBe(true);
    expect(penalties(run(sc, 3, ['prep', 'transducer', 'pads', 'guide-ebu', 'wire-workhorse']))).toEqual([]);
    // and a view chosen before the first run only moves the C-arm: no cine through a damped catheter
    const view = run(sc, 3, [...IDEAL[3].slice(0, IDEAL[3].indexOf('callout')), 'view-lao-cranial']);
    expect(view.images).toEqual([]);
  });

  it('the radial band goes on as the sheath comes out, not before', () => {
    const s = perform(sc, run(sc, 4, ['consent', 'heparin', 'timeout']), 'hemostasis');
    expect(s.counts.hemostasis).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/sheath is still in/);
  });

  it('a STEMI does not wait: with no time-out by 6 minutes the operator calls it, and the procedure still ends', () => {
    for (const role of [3, 4] as const) {
      const s = run(sc, role, R(10));
      expect(s.fired, `role ${role}`).toContain('md-starts');
      expect(s.flags['proc-over'], `role ${role}`).toBeDefined();
      expect(missed(s), `role ${role}`).toEqual(expect.arrayContaining(['Procedural time-out before access', 'Call out the damped pressure at once']));
    }
  });

  it('the hand-off says what happened: the access site, and imaging that spares a breastfeeding mother', () => {
    const text = handoff(run(sc, 5, MD.map((id) => (id === 'access' ? 'access-femoral' : id))));
    expect(text).toMatch(/Right femoral sheath out/);
    expect(text).not.toMatch(/radial band/);
    expect(text).toMatch(/MR angiography spares a breastfeeding mother/);
    expect(text).toMatch(/low-dose aspirin is safe while breastfeeding/);
  });

  it('on the wrong road, the stents need a P2Y12 inhibitor: an item that applies only once a stent is in', () => {
    const bail = [...MD_TO_DIAGNOSIS, 'guide-ebu', 'wire-workhorse', 'balloon-predil', 'stent-des'];
    expect(missed(run(sc, 5, [...bail, ...MD_FINISH]))).toContain('A P2Y12 inhibitor once stents are in');
    const loaded = run(sc, 5, [...bail, 'p2y12', ...MD_FINISH]);
    expect(missed(loaded)).not.toContain('A P2Y12 inhibitor once stents are in');
    expect(handoff(loaded)).toMatch(/P2Y12 inhibitor as well \(loaded\)/);
    expect(review(sc, run(sc, 5, MD)).toFix.map((t) => t.label)).not.toContain('A P2Y12 inhibitor once stents are in');
  });

  it('a shock brings her back, but with the LAD still failing the pressure comes back low', () => {
    let s = run(sc, 5, [...MD_TO_DIAGNOSIS, 'guide-ebu', 'wire-workhorse', 'stent-des']);
    for (let i = 0; i < 6 && s.pulse; i++) s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'defib');
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 112 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([100, 64]);
    expect(said(s, /^An organized rhythm is back within seconds: 100\/64/)).toBe(true);
  });

  it('the read\'s feedback names the finding, not the treatment: what to do next is still the cardiologist\'s decision', () => {
    const s = run(sc, 5, MD_TO_RUN);
    const feedback = s.log.filter((l) => l.who === 'feedback').at(-1)!.text;
    expect(feedback).toMatch(/^Correct\. Spontaneous coronary artery dissection/);
    expect(feedback).not.toMatch(/leave it alone|no stent|nitroglycerin/);
  });

  it('on every road — slow, wrong, wedged, stented, lysed — the vitals stay bounded and no monitor line names the rhythm', () => {
    const roads: [3 | 4 | 5, string[]][] = [
      [5, [...TO_ENGAGE, ...R(2), 'cpr', 'defib', 'angio', 'ic-nitro', 'view-lao-cranial', ...R(3)]],
      [5, [...MD_TO_DIAGNOSIS, 'guide-ebu', 'wire-workhorse', 'stent-des', 'metoprolol', ...R(5), 'defib', ...R(2)]],
      [5, [...MD_TO_DIAGNOSIS, 'tnk', 'ic-nitro', 'nitro', ...R(5)]],
      [4, ['consent', ...R(1), 'heparin', 'timeout', ...R(8)]],
      [3, ['prep', 'stent-des', 'timeout', 'view-lao-cranial', ...R(8)]],
    ];
    for (const [role, steps] of roads) {
      const s = run(sc, role, steps, (st) => {
        expect(resolveProfile(st.rhythm.profile).id).toBe(st.rhythm.profile);
        if (st.pulse) expect(st.vitals.sbp - st.vitals.dbp, `${role}: ${st.vitals.sbp}/${st.vitals.dbp}`).toBeGreaterThanOrEqual(10);
        if (st.pulse) expect(st.vitals.sbp).toBeGreaterThanOrEqual(50);
      });
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('a fibrinolytic after the diagnosis spreads the blood in the wall: no balloon was used, and the hand-off says it extended', () => {
    const s = run(sc, 5, [...MD_TO_DIAGNOSIS, 'tnk', 'handoff']);
    expect(s.flags.predilated).toBeUndefined();
    expect(handoff(s)).toMatch(/it has extended/);
    expect(handoff(s)).toMatch(/she needs bail-out stents or bypass now/);
  });
});
