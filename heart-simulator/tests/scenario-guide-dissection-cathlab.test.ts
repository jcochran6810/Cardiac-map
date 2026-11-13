import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabGuideDissection as sc } from '@/lib/sim/scenario/scenarios/cathlabGuideDissection';
import type { SimState } from '@/lib/sim/scenario/types';
import { attached } from '@/store/useSimStore';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const said = (s: SimState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: calls it out, takes the injector off, then hands the soft wire, the IVUS, the stent and the non-compliant
  // balloon as the operator asks; the 12-lead once the flow is back; the radial band
  3: ['callout', 'stop-contrast', 'wire-workhorse', 'ivus', 'stent-des', 'balloon-nc', 'ecg12', 'hemostasis'],
  // the nurse: calls out the rate and the pressure, atropine, fluid and fentanyl as the operator asks, a 12-lead during the
  // ischemia and once the flow is back, the radial band and the hand-off
  4: ['callout', 'atropine', 'fluid', 'fentanyl', 'ecg12', 'reassess', 'ecg12-repeat', 'hemostasis', 'handoff'],
  // the cardiologist: stop injecting, back the guide out, the rate and the pressure, a soft wire, IVUS, a stent from the
  // ostium; then the root, the 12-lead, the echo and the hand-off
  5: ['stop-contrast', 'reposition', 'atropine', 'fluid', 'wire-workhorse', 'ivus', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
/** The cardiologist up to the wire in the true lumen */
const MD_TO_WIRE = MD.slice(0, MD.indexOf('wire-workhorse') + 1);
/** The cardiologist from the stent to the end */
const MD_FINISH = MD.slice(MD.indexOf('final-angio'));
/** The cardiologist's first steps: stop injecting, back the guide out, the rate and the pressure */
const MD_FIRST = MD.slice(0, MD.indexOf('wire-workhorse'));

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
/** Words that name what happened (nobody says them before the learner has read it) */
const naming = /dissect|tear|torn|flap|lumen|hematoma|blood in the wall|false channel/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour|fibre/i;

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

describe('guide-catheter dissection of the RCA ostium: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('guide-dissection-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-dissection', 'stemi-inferior', 'nsr']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      expect(sc.briefing[role], `briefing for role ${role}`).toBeDefined();
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
  });

  it('shows one real image, the Amplatz deep in an RCA ostium, from an open-access article', () => {
    expect(sc.images).toEqual({ 'deep-seat': 'amplatz-left-guide-rca' });
    const img = CATH_IMAGES['amplatz-left-guide-rca']!;
    expect(img).toBeDefined();
    expect(img.caption).toMatch(/Amplatz/);
    expect(img.license).toMatch(/^CC BY/);
    // the briefing names the same guide the image shows
    expect(sc.briefing.default.map((l) => l[1]).join(' ')).toMatch(/AL 0\.75/);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const h of sc.harms) expect(h.text).not.toMatch(BRITISH);
    for (const c of sc.critical) expect(`${c.label} ${c.why}`).not.toMatch(BRITISH);
    for (const t of sc.teaching) expect(t).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('guide-catheter dissection: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm.profile).toBe('normal-sinus');
      expect([s.vitals.sbp, s.vitals.dbp]).toEqual([124, 74]);
      expect(s.flags.sealed).toBeDefined();
      expect(s.flags['root-checked']).toBeDefined();
      expect(s.flags['root-spread']).toBeUndefined();
      expect(s.flags.occluded).toBeUndefined();
      expect(s.reads.map((r) => r.answer)).toEqual(expect.arrayContaining(['clin-dissection', 'nsr']));
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) {
        if (l.who !== 'monitor') continue;
        expect(l.text, `role ${role}`).not.toMatch(giveaway);
        expect(l.text, `role ${role}`).not.toMatch(/dissect/i);
      }
    }
  });

  it('nothing names what happened before the learner reads it', () => {
    for (const role of ROLES) {
      const s = run(sc, role, [], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-dissection', prompt: 'What just happened?' });
      for (const l of s.log) expect(l.text, `role ${role}`).not.toMatch(naming);
    }
  });

  it('the nurse reads the inferior ischemia on the 12-lead during it, and the normal tracing once the flow is back', () => {
    const s = run(sc, 4, IDEAL[4]);
    expect(s.reads.map((r) => `${r.answer}:${r.verdict}`)).toEqual(['clin-dissection:correct', 'stemi-inferior:correct', 'nsr:correct']);
  });

  it('the arterial trace is damped while the Amplatz sits deep, and sharp once it is backed out', () => {
    for (const role of ROLES) {
      const s = run(sc, role, []);
      expect(attached(s).art, `role ${role}`).toBe(role === 4 ? true : 'damped');
    }
    expect(attached(run(sc, 5, ['stop-contrast'])).art).toBe('damped');
    const out = run(sc, 5, ['stop-contrast', 'reposition']);
    expect(attached(out).art).toBe(true);
    expect(out.log.some((l) => l.who === 'monitor' && l.text === 'The arterial trace has its notch back: BP 84/52.')).toBe(true);
  });
});

describe('guide-catheter dissection: recognizing it', () => {
  it('a test injection through the deep-seated Amplatz: a damped trace, contrast lingering at the ostium, pain, a slow rate and a low pressure', () => {
    const s = run(sc, 5, [], undefined, 'manual');
    expect(s.pendingRead?.partial ?? []).toEqual([]);
    expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 48 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([84, 52, 6]);
    expect(said(s, /pressure trace damps as the guide tip dives deep/)).toBe(true);
    expect(said(s, /a smudge of contrast lingers at the ostium/)).toBe(true);
  });

  it('calling it a perforation is a misread, and the feedback says what it was', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    s = answerRead(sc, s, 'clin-perforation');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'clin-dissection', verdict: 'wrong' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 5 });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Coronary dissection\./);
  });

  it('the real run from before the stain reaches the Imaging screen only once it has been named', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    expect(s.images).toEqual([]);
    s = answerRead(sc, s, 'clin-dissection');
    s = perform(sc, s, 'stop-contrast');
    expect(s.images.at(-1)).toMatchObject({ id: 'deep-seat', image: 'amplatz-left-guide-rca' });
    // nothing waits on that run: its caption shows at once
    expect(s.pendingRead).toBeNull();
  });
});

describe('guide-catheter dissection: what works', () => {
  it('atropine brings the rate back and fluid the pressure', () => {
    const s = run(sc, 5, MD_FIRST);
    expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 74 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([96, 60]);
    expect(s.penalties).toEqual([]);
  });

  it('a soft wire through the backed-out guide finds the true lumen; IVUS confirms it; the stent seals the entry and the flow comes back', () => {
    let s = run(sc, 5, MD_TO_WIRE);
    expect(s.flags['wire-true']).toBeDefined();
    expect(s.flags['lumen-known']).toBeUndefined();
    s = perform(sc, s, 'ivus');
    expect(s.flags['lumen-known']).toBeDefined();
    expect(said(s, /the wire runs in the true lumen all the way/)).toBe(true);
    s = perform(sc, s, 'stent-des');
    expect(s.flags.sealed).toBeDefined();
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 82 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([124, 74, 1]);
    expect(said(s, /placed 1 mm out into the aorta so it covers the ostium/)).toBe(true);
    expect(s.penalties).toEqual([]);
  });

  it('the final runs check the aortic root, and the echo the root, the valve and the pericardium', () => {
    const s = run(sc, 5, MD);
    expect(said(s, /A gentle injection in the aortic root: no contrast in the aortic wall/)).toBe(true);
    expect(said(s, /the aortic root normal in size, no flap seen, no aortic regurgitation, no pericardial effusion/)).toBe(true);
  });

  it('pacing for the rate, push-dose epinephrine for the pressure: correct care too, full marks', () => {
    const steps = MD.map((id) => (id === 'atropine' ? 'pace' : id === 'fluid' ? 'push-epi' : id));
    expectFullMarks(run(sc, 5, steps));
  });

  it('cardiac surgery on standby, a guide exchange over the wire, IVUS after the stent and a flared ostium cost nothing', () => {
    const steps = [...MD_FIRST, 'call-surgery', 'wire-workhorse', 'guide-jr4', 'ivus', 'stent-des', 'balloon-nc', 'ivus', ...MD_FINISH];
    const s = run(sc, 5, steps);
    expectFullMarks(s);
    expect(said(s, /the wire stays where it was/)).toBe(true);
    expect(said(s, /minimum stent area 11\.0 mm²/)).toBe(true);
  });

  it('a CT of the aorta waits until the entry is sealed; the final pictures too', () => {
    const early = run(sc, 5, MD_TO_WIRE);
    for (const id of ['ct-urgent', 'final-angio']) {
      const t = perform(sc, early, id);
      expect(t.counts[id], id).toBeUndefined();
      expect(t.penalties, id).toEqual([]);
    }
    const late = run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-des', 'ct-urgent']);
    expect(late.counts['ct-urgent']).toBe(1);
    expect(said(late, /a thin crescent of contrast in the aortic wall right around the RCA ostium only/)).toBe(true);
    expect(late.penalties).toEqual([]);
  });

  it('a pericardial needle is refused: there is no effusion to drain', () => {
    const s = perform(sc, run(sc, 5, ['echo']), 'pericardiocentesis');
    expect(s.counts.pericardiocentesis).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/no pericardial effusion/);
  });
});

describe('guide-catheter dissection: the traps', () => {
  it('one more run spreads the stain into the aortic wall around the ostium: a major error', () => {
    const s = run(sc, 5, ['view-rca-lao']);
    expect(penalties(s)).toEqual(['inject-into-dissection']);
    expect(s.flags['inj-1']).toBeDefined();
    expect(s.flags['root-spread']).toBeUndefined();
    expect(s.vitals.sbp).toBeLessThan(84);
    expect(said(s, /contrast now stains the aortic wall around the RCA ostium/)).toBe(true);
  });

  it('a second run drives it up the ascending aorta and shuts the RCA: critical — and surgery has to be called', () => {
    let s = run(sc, 5, ['view-rca-lao', 'view-rca-rao']);
    expect(penalties(s)).toEqual(['inject-into-dissection', 'inject-again']);
    expect(s.penalties[1]).toMatchObject({ severity: 'critical', points: 12 });
    expect(s.flags['root-spread']).toBeDefined();
    expect(s.flags.occluded).toBeDefined();
    expect(said(s, /climbs the wall of the ascending aorta/)).toBe(true);
    expect(said(s, /tearing — right through to my back/)).toBe(true);
    // the RCA shut at once: VF comes 4 minutes later unless the entry is sealed by then — straight to the wire, the IVUS
    // and the stent. Sealed without calling the surgeons, the procedure is not over: no hand-off until they are involved
    const FIX = ['stop-contrast', 'reposition', 'wire-workhorse', 'ivus', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'];
    s = run(sc, 5, ['view-rca-lao', 'view-rca-rao', ...FIX]);
    expect(s.fired).not.toContain('vf');
    expect(s.flags.sealed).toBeDefined();
    expect(s.ended).toBeNull();
    expect(missed(s)).toContain('Call cardiac surgery when it climbs the aorta (or the artery is lost)');
    // called at once, the case can finish (with the two injections still costing points)
    const called = run(sc, 5, ['view-rca-lao', 'view-rca-rao', 'call-surgery', ...FIX]);
    expect(called.ended?.reason).toBe('complete');
    expect(penalties(called)).toEqual(['inject-into-dissection', 'inject-again']);
    expect(said(called, /the crescent in the wall of the ascending aorta has not grown since the stent went in/)).toBe(true);
    expect(review(sc, called).toFix.find((t) => t.label.startsWith('Call cardiac surgery'))).toBeUndefined();
  });

  it('a diagnostic angiogram pulls the wire: getting back into the true lumen takes two wires and two looks with IVUS', () => {
    let s = run(sc, 5, [...MD_TO_WIRE, 'angio']);
    expect(penalties(s)).toEqual(['angio-after-dissection']);
    expect(s.flags['wire-lost']).toBeDefined();
    expect(s.flags.wired).toBeUndefined();
    expect(s.flags.guide).toBeUndefined();
    expect(said(s, /the wire with it/)).toBe(true);
    // no guide, no wire: the guide goes back first, sat without contrast
    expect(perform(sc, s, 'wire-workhorse').counts['wire-workhorse']).toBe(1);
    expect(perform(sc, s, 'wire-workhorse').flags.wired).toBeUndefined();
    s = run(sc, 5, [...MD_TO_WIRE, 'angio', 'guide-jr4', 'wire-workhorse', 'ivus']);
    expect(s.flags['wire-false']).toBeDefined();
    expect(s.flags['false-known']).toBeDefined();
    expect(s.flags['lumen-known']).toBeUndefined();
    expect(said(s, /the wire runs outside the true lumen/)).toBe(true);
    // with the true lumen lost the RCA shut while the catheters were changed: VF comes as the IVUS finishes — shock it,
    // then a second soft wire beside the first finds the true lumen, IVUS confirms it, and the stent seals it
    expect(s.flags.occluded).toBeDefined();
    expect(s.rhythm.profile).toBe('vf');
    s = run(sc, 5, [...MD_TO_WIRE, 'angio', 'guide-jr4', 'wire-workhorse', 'ivus', 'defib', 'wire-workhorse', 'ivus', 'stent-des']);
    expect(said(s, /the first left in the false channel as a marker/)).toBe(true);
    expect(s.flags.sealed).toBeDefined();
    expect(s.pulse).toBe(true);
    expect(penalties(s)).toEqual(['angio-after-dissection']);
  });

  it('a hydrophilic wire slips into the false lumen; IVUS shows it before any harm is done', () => {
    const s = run(sc, 5, [...MD_FIRST, 'wire-hydrophilic', 'ivus']);
    expect(penalties(s)).toEqual(['hydrophilic-in-dissection']);
    expect(s.flags['wire-false']).toBeDefined();
    expect(s.flags['wire-true']).toBeUndefined();
    expect(s.flags['false-known']).toBeDefined();
  });

  it('a stent over the false-lumen wire shuts the RCA: critical; VF follows; only the surgeons can take it from there', () => {
    let s = run(sc, 5, [...MD_FIRST, 'wire-hydrophilic', 'stent-des']);
    expect(penalties(s)).toEqual(['hydrophilic-in-dissection', 'stent-false-lumen']);
    expect(s.penalties[1]).toMatchObject({ severity: 'critical', points: 15 });
    expect(s.flags.occluded).toBeDefined();
    expect(s.flags.sealed).toBeUndefined();
    expect([s.vitals.sbp, s.rhythm.hr]).toEqual([70, 40]);
    // no way back to the true lumen past the crushed stent
    s = perform(sc, s, 'wire-workhorse');
    expect(s.flags['wire-true']).toBeUndefined();
    while (s.pulse) s = perform(sc, s, 'reassess');
    expect(s.rhythm.profile).toBe('vf');
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    s = perform(sc, s, 'call-surgery');
    expect(s.flags['to-surgery']).toBeDefined();
    s = perform(sc, s, 'handoff');
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.missed).toBeGreaterThan(0);
    expect(r.grade).toBe('Unsafe');
  });

  it('a stent over a true-lumen wire without looking first: it works, but costs points and misses the IVUS', () => {
    const s = run(sc, 5, [...MD_TO_WIRE, 'stent-des', ...MD_FINISH]);
    expect(s.flags.sealed).toBeDefined();
    expect(penalties(s)).toEqual(['stent-blind']);
    expect(missed(s)).toEqual(['Confirm the true lumen with IVUS before any stent']);
  });

  it('OCT\'s contrast flush is another injection into the tear: a minor error that spreads the stain — though it does find the lumen', () => {
    const s = run(sc, 5, [...MD_TO_WIRE, 'oct', 'stent-des', ...MD_FINISH]);
    expect(penalties(s)).toEqual(['oct-flush']);
    expect(s.flags['inj-1']).toBeDefined();
    expect(said(s, /its first 10 mm are a blur/)).toBe(true);
    expect(said(s, /the stain stays in the wall right around the ostium and has not grown/)).toBe(true);
    expect(missed(s)).toEqual([]);
  });

  it('a guide left jammed in the ostium: the RCA shuts at 4 minutes even with a wire down it', () => {
    const s = run(sc, 5, ['stop-contrast', 'atropine', 'fluid', 'wire-workhorse', 'reassess']);
    expect(s.flags['wire-true']).toBeDefined();
    expect(s.flags.occluded).toBeDefined();
    expect(missed(s)).toContain('Back the guide out of the ostium to coaxial');
  });

  it('ignoring it: the RCA shuts at 4 minutes, VF at 8; a shock brings her back to a shut artery — no shock and she dies', () => {
    let s = run(sc, 5, R(2));
    expect(s.flags.occluded).toBe(4);
    expect([s.rhythm.hr, s.vitals.sbp]).toEqual([40, 72]);
    s = run(sc, 5, R(4));
    expect(s.rhythm.profile).toBe('vf');
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    const shocked = perform(sc, s, 'defib');
    expect(shocked.pulse).toBe(true);
    expect(shocked.rhythm.profile).toBe('inferior-stemi');
    expect(shocked.flags.occluded).toBeDefined();
    expect(penalties(shocked)).toEqual([]);
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });

  it('even with a wire in and the guide backed out, the blood in the wall closes the RCA if the stent never comes', () => {
    const s = run(sc, 5, [...MD_TO_WIRE, ...R(4)]);
    expect(s.flags.occluded).toBeDefined();
  });

  it('nitroglycerin for the pain before the entry is sealed: one penalty, and the pressure falls', () => {
    const s = run(sc, 5, ['nitro']);
    expect(penalties(s)).toEqual(['nitro-low-pressure']);
    expect(s.vitals.sbp).toBeLessThan(84);
    const high = run(sc, 5, ['fluid', 'nitro-high']);
    expect(penalties(high)).toEqual(['nitro-low-pressure']);
    // once the stent is in and the pressure is back, 0.4 mg is no mistake; the 0.8 mg pulmonary-edema dose still is
    const sealed = [...MD_TO_WIRE, 'ivus', 'stent-des'];
    expect(penalties(run(sc, 5, [...sealed, 'nitro']))).toEqual([]);
    expect(penalties(run(sc, 5, [...sealed, 'nitro-high']))).toEqual(['nitro-high-not-hypertensive']);
  });

  it('protamine, a lytic, a beta-blocker and a GP IIb/IIIa inhibitor each cost points', () => {
    expect(penalties(run(sc, 5, ['protamine']))).toEqual(['protamine-dissection']);
    expect(penalties(run(sc, 5, ['tnk']))).toEqual(['lytic-in-lab']);
    expect(penalties(run(sc, 5, ['metoprolol']))).toEqual(['beta-blocker']);
    expect(penalties(run(sc, 5, ['gp2b3a']))).toEqual(['gp-in-dissection']);
  });

  it('a balloon or an aspiration catheter in the torn segment costs points; a covered stent seals it but costs a little', () => {
    const balloon = run(sc, 5, [...MD_TO_WIRE, 'balloon-predil']);
    expect(penalties(balloon)).toEqual(['balloon-in-dissection']);
    expect(said(balloon, /pushed further along/)).toBe(true);
    expect(penalties(run(sc, 5, [...MD_TO_WIRE, 'aspiration']))).toEqual(['aspiration-in-dissection']);
    const covered = run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-covered']);
    expect(penalties(covered)).toEqual(['covered-for-dissection']);
    expect(covered.flags.sealed).toBeDefined();
  });

  it('swapping the Amplatz for another catheter pulls the wire too; one that finds the RCA again does it with contrast', () => {
    const jr4 = run(sc, 5, [...MD_TO_WIRE, 'cath-jr4']);
    expect(penalties(jr4)).toEqual(['guide-out-after-dissection']);
    expect(jr4.flags['wire-lost']).toBeDefined();
    expect(jr4.flags.guide).toBeUndefined();
    expect(jr4.flags['inj-1']).toBeDefined();
    expect(said(jr4, /The Amplatz comes out, and the wire with it, for the JR4 diagnostic catheter/)).toBe(true);
    // a pigtail goes to the ventricle: no contrast into the RCA, but the wire is gone all the same
    const pig = run(sc, 5, [...MD_TO_WIRE, 'cath-pigtail']);
    expect(penalties(pig)).toEqual(['guide-out-after-dissection']);
    expect(pig.flags['inj-1']).toBeUndefined();
    expect(pig.flags['wire-lost']).toBeDefined();
    expect(said(pig, /for the pigtail catheter/)).toBe(true);
    // once the entry is sealed, another catheter is no mistake
    expect(penalties(run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-des', 'cath-pigtail', 'lv-gram']))).toEqual([]);
  });

  it('a forceful flush down the guide drives the tear like contrast does', () => {
    const s = run(sc, 5, [...MD_TO_WIRE, 'clear-air']);
    expect(penalties(s)).toEqual(['inject-into-dissection']);
    expect(s.flags['inj-1']).toBeDefined();
  });

  it('intracoronary vasodilators and epinephrine have nothing to treat in a torn ostium: one penalty each, the built-in nitroprusside rule included', () => {
    for (const drug of ['ic-adenosine', 'ic-verapamil', 'ic-nitroprusside']) {
      expect(penalties(run(sc, 5, [drug])), drug).toEqual(['ic-vasodilator-dissection']);
      expect(penalties(run(sc, 4, ['callout', drug])), `nurse ${drug}`).toEqual(['ic-vasodilator-dissection']);
    }
    expect(penalties(run(sc, 5, ['ic-epinephrine']))).toEqual(['ic-epi-no-indication']);
  });

  it('the radial cocktail with a low pressure, and a pump while the root may be torn, cost a little', () => {
    expect(penalties(run(sc, 4, ['callout', 'radial-cocktail']))).toEqual(['cocktail-low-pressure']);
    const iabp = run(sc, 5, ['stop-contrast', 'iabp']);
    expect(penalties(iabp)).toEqual(['mcs-torn-root']);
    // and it takes six minutes the artery does not have: the RCA shuts meanwhile
    expect(iabp.flags.occluded).toBeDefined();
    // the tech who sets up the console when nobody asked costs nothing: the operator decides
    expect(penalties(run(sc, 3, ['callout', 'stop-contrast', 'iabp']))).toEqual([]);
  });

  it('the bedside findings match an ischemic inferior wall and right ventricle, and recover once the stent is in', () => {
    const before = run(sc, 5, ['perfusion', 'ecg-right', 'echo']);
    expect(said(before, /Pale, cool and clammy/)).toBe(true);
    expect(said(before, /V4R: 1 mm ST elevation/)).toBe(true);
    expect(said(before, /the inferior wall barely moving/)).toBe(true);
    // the right heart numbers of an ischemic right ventricle: a high right atrial pressure, a normal wedge, a low output
    const rhc = run(sc, 5, ['access-venous', 'rhc']);
    expect(said(rhc, /RA 14 · RV 30\/14 · PA 28\/12 \(mean 18\) · PCWP 11 · CO 3\.4 L\/min, CI 2\.0/)).toBe(true);
    expect(said(rhc, /RA 6 · RV 26\/6/)).toBe(false);
    const after = run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-des', 'perfusion', 'ecg-right', 'lvedp']);
    expect(said(after, /Warm and pink again/)).toBe(true);
    expect(said(after, /V4R: no ST elevation/)).toBe(true);
    expect(said(after, /LV 124\/12 mmHg: LVEDP 12 mmHg/)).toBe(true);
    // a balloon has no hole to cover
    expect(perform(sc, run(sc, 5, MD_TO_WIRE), 'balloon-tamponade').counts['balloon-tamponade']).toBeUndefined();
  });

  it('a guide exchange before a wire is down needs contrast: another injection into the tear', () => {
    const s = run(sc, 5, ['stop-contrast', 'guide-jr4']);
    expect(penalties(s)).toEqual(['guide-exchange-unwired']);
    expect(s.flags['inj-1']).toBeDefined();
    // the same after the stain has already spread: critical, and it climbs the aorta
    const again = run(sc, 5, ['view-rca-lao', 'guide-al1']);
    expect(penalties(again)).toEqual(['inject-into-dissection', 'guide-exchange-again']);
    expect(again.flags['root-spread']).toBeDefined();
  });
});

describe('guide-catheter dissection: the tech and the nurse', () => {
  const TECH = IDEAL[3];
  const RN = IDEAL[4];

  it('the tech hands a soft workhorse wire, IVUS, a drug-eluting stent and a non-compliant balloon: the wrong one gets a word and costs points', () => {
    const hydro = run(sc, 3, ['callout', 'stop-contrast', 'wire-hydrophilic']);
    expect(penalties(hydro)).toEqual(['wrong-wire']);
    expect(said(hydro, /Not a hydrophilic wire — it slips into the false lumen/)).toBe(true);
    const oct = run(sc, 3, [...TECH.slice(0, TECH.indexOf('ivus')), 'oct']);
    expect(penalties(oct)).toEqual(['wrong-imaging']);
    expect(said(oct, /Not OCT/)).toBe(true);
    expect(oct.flags['inj-1']).toBeUndefined();
    const covered = run(sc, 3, [...TECH.slice(0, TECH.indexOf('stent-des')), 'stent-covered']);
    expect(penalties(covered)).toEqual(['wrong-stent']);
    const compliant = run(sc, 3, [...TECH.slice(0, TECH.indexOf('balloon-nc')), 'balloon-predil']);
    expect(penalties(compliant)).toEqual(['wrong-nc']);
    expect(said(compliant, /Not a compliant balloon/)).toBe(true);
  });

  it('a tech who sets up a run gets refused: a small penalty, and no contrast goes in', () => {
    const s = run(sc, 3, ['callout', 'view-rca-lao']);
    expect(penalties(s)).toEqual(['tech-cine-dissection']);
    expect(said(s, /No runs — nobody injects into that ostium/)).toBe(true);
    expect(s.flags['inj-1']).toBeUndefined();
  });

  it('a tech who opens a stent before the IVUS costs a little', () => {
    expect(penalties(run(sc, 3, ['callout', 'stop-contrast', 'stent-des']))).toEqual(['tech-unasked-stent']);
  });

  it('a tech who never takes the injector off: the operator does it after a minute, and the item is missed', () => {
    const s = run(sc, 3, TECH.filter((id) => id !== 'stop-contrast'));
    expect(s.fired).toContain('tech-stop-fallback');
    expect(missed(s)).toContain('Injector off: no more contrast');
  });

  it('when the tech never answers, the operator gets everything — and seals it before the RCA shuts', () => {
    const s = run(sc, 3, R(5));
    expect(s.fired).toEqual(expect.arrayContaining(['tech-stop-fallback', 'wire-fallback', 'imaging-fallback', 'stent-fallback', 'md-stent']));
    expect(s.flags.sealed).toBeDefined();
    expect(s.flags.occluded).toBeUndefined();
    expect(s.pulse).toBe(true);
  });

  it('the nurse who reaches for a drug that slows the rate gets a word and a penalty', () => {
    for (const drug of ['adenosine6', 'diltiazem']) {
      const s = run(sc, 4, ['callout', drug]);
      expect(penalties(s), drug).toEqual(['wrong-rn-rate']);
      expect(said(s, /That slows her further/), drug).toBe(true);
    }
    // metoprolol has its own penalty: one mistake, one penalty — and the same word from the operator
    const beta = run(sc, 4, ['callout', 'metoprolol']);
    expect(penalties(beta)).toEqual(['beta-blocker']);
    expect(said(beta, /That slows her further/)).toBe(true);
  });

  it('the nurse who gives nitroglycerin for the pressure or the pain gets a word and one penalty', () => {
    const s = run(sc, 4, ['callout', 'atropine', 'nitro']);
    expect(penalties(s)).toEqual(['nitro-low-pressure']);
    expect(said(s, /that drops it further/)).toBe(true);
  });

  it('pacing for the rate and push-dose epinephrine for the pressure count for the nurse too', () => {
    const s = run(sc, 4, RN.map((id) => (id === 'atropine' ? 'pace' : id === 'fluid' ? 'push-epi' : id)));
    expectFullMarks(s);
  });

  it('a nurse who stays silent misses the callout; one who never answers leaves it to the operator', () => {
    expect(missed(run(sc, 4, RN.filter((id) => id !== 'callout')))).toContain('Call out the damped pressure and the change at once');
    const s = run(sc, 4, R(5));
    expect(s.fired).toEqual(expect.arrayContaining(['rn-rate-fallback', 'rn-pressure-fallback', 'md-stent', 'md-final']));
    expect(s.flags.sealed).toBeDefined();
    expect(s.pulse).toBe(true);
  });

  it('a witnessed VF shocked at once earns the defibrillation item (the nurse and the tech never see one: the operator seals it in time)', () => {
    let s = run(sc, 5, R(4));
    expect(s.rhythm.profile).toBe('vf');
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(review(sc, s).toFix.find((t) => t.label.startsWith('Defibrillate'))).toBeUndefined();
  });
});

describe('guide-catheter dissection: review fixes (correct care in another order, harmful care costs, the story matches)', () => {
  const RN = IDEAL[4];

  it('an echo before the stent (to look at the root and the pericardium) earns the echo item: it cannot be repeated', () => {
    const s = run(sc, 5, ['stop-contrast', 'reposition', 'atropine', 'fluid', 'wire-workhorse', 'echo', 'ivus', 'stent-des', 'final-angio', 'ecg12', 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
    expect(r.outcome).toMatch(/^Every critical intervention done in/);
  });

  it('nitroglycerin before the entry is sealed is wrong even with the pressure pushed over 100: the right ventricle is ischemic', () => {
    const lifted = ['stop-contrast', 'reposition', 'atropine', 'fluid', 'push-epi'];
    const s = run(sc, 5, lifted);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    expect(penalties(run(sc, 5, [...lifted, 'nitro']))).toEqual(['nitro-low-pressure']);
    expect(penalties(run(sc, 5, [...lifted, 'ic-nitro']))).toEqual(['nitro-low-pressure']);
    // the high dose costs once, not twice
    expect(penalties(run(sc, 5, [...lifted, 'nitro-high']))).toEqual(['nitro-low-pressure']);
    expect(sc.harms.find((h) => h.id === 'nitro-low-pressure')!.text).toMatch(/right ventricular infarction/);
  });

  it('the radial band waits for the end of the procedure: refused mid-case at no cost, and the item can still be earned', () => {
    for (const role of [3, 4] as const) {
      const early = run(sc, role, role === 3 ? ['callout', 'stop-contrast', 'hemostasis'] : ['callout', 'atropine', 'fluid', 'hemostasis']);
      expect(early.counts.hemostasis, `role ${role}`).toBeUndefined();
      expect(early.log.at(-1)!.text, `role ${role}`).toMatch(/still working through the radial sheath/);
      expect(early.penalties, `role ${role}`).toEqual([]);
    }
    expectFullMarks(run(sc, 4, ['callout', 'atropine', 'fluid', 'hemostasis', 'fentanyl', 'ecg12', 'reassess', 'ecg12-repeat', 'hemostasis', 'handoff']));
  });

  it('a nurse who eases the pain before the operator asks has answered the ask', () => {
    const s = run(sc, 4, ['callout', 'fentanyl', 'atropine', 'fluid', 'ecg12', 'reassess', 'ecg12-repeat', 'hemostasis', 'handoff']);
    expectFullMarks(s);
    expect(s.fired).not.toContain('rn-pain-fallback');
  });

  it('the review names what the nurse did for the rate and the pressure, pacing and epinephrine included', () => {
    const s = run(sc, 4, RN.map((id) => (id === 'atropine' ? 'pace' : id === 'fluid' ? 'push-epi' : id)));
    const labels = review(sc, s).wentWell.map((w) => w.label);
    expect(labels).toEqual(expect.arrayContaining(['Something for the slow rate: atropine (or pacing)', 'Something for the low pressure: fluid first']));
  });

  it('IV metoprolol: major while the RCA is closing, minor (nothing to treat) once the flow is back', () => {
    expect(penalties(run(sc, 5, ['metoprolol']))).toEqual(['beta-blocker']);
    const after = run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-des', 'metoprolol']);
    expect(penalties(after)).toEqual(['beta-blocker-after']);
    expect(after.penalties[0]).toMatchObject({ severity: 'minor', points: 3 });
  });

  it('in the arrest nobody answers questions, the skin has no pulse, and the echo waits for the shock', () => {
    const vf = run(sc, 5, R(4));
    expect(vf.pulse).toBe(false);
    for (const id of ['opqrst', 'sample', 'echo']) {
      const t = perform(sc, vf, id);
      expect(t.counts[id], id).toBeUndefined();
      expect(t.log.slice(vf.log.length).some((l) => l.who === 'patient'), id).toBe(false);
    }
    const skin = perform(sc, vf, 'perfusion');
    expect(said(skin, /no pulse at the wrist or the groin/)).toBe(true);
    expect(skin.log.at(-1)!.text).not.toMatch(/radial pulse slow and weak/);
  });

  it('an LV gram, an LVEDP or an FFR is refused while the tear is open and the guide sits in it; a radial case has no groin to close', () => {
    const torn = run(sc, 5, MD_TO_WIRE);
    for (const id of ['lv-gram', 'lvedp', 'ffr', 'ffr-equalize', 'closure-device']) {
      const t = perform(sc, torn, id);
      expect(t.counts[id], id).toBeUndefined();
      expect(t.penalties, id).toEqual([]);
      expect(t.minute, id).toBe(torn.minute);
    }
    // after a swap to a pigtail (which pulls the wire and costs points) the LV gram can be done
    const pig = run(sc, 5, [...MD_TO_WIRE, 'cath-pigtail', 'lv-gram']);
    expect(pig.counts['lv-gram']).toBe(1);
    expect(said(pig, /the inferior wall barely moves/)).toBe(true);
    expect(penalties(pig)).toEqual(['guide-out-after-dissection']);
  });

  it('an IV adenosine infusion has nothing to measure in a torn ostium: a minor error', () => {
    expect(penalties(run(sc, 5, ['adenosine-iv-ffr']))).toEqual(['adenosine-infusion-dissection']);
    expect(penalties(run(sc, 4, ['callout', 'adenosine-iv-ffr']))).toEqual(['adenosine-infusion-dissection']);
  });

  it('another heparin bolus on top of a good ACT costs a little; after protamine has reversed it, a new bolus is right', () => {
    const extra = run(sc, 5, ['heparin', 'act']);
    expect(penalties(extra)).toEqual(['heparin-extra']);
    expect(said(extra, /ACT 356 s: above the PCI range/)).toBe(true);
    const reversedThenRedosed = run(sc, 5, ['protamine', 'act', 'heparin', 'act']);
    expect(penalties(reversedThenRedosed)).toEqual(['protamine-dissection']);
    expect(said(reversedThenRedosed, /ACT 158 s: the heparin is largely reversed/)).toBe(true);
    expect(reversedThenRedosed.log.filter((l) => /^ACT/.test(l.text)).at(-1)!.text).toBe('ACT 272 s: in range for PCI.');
  });

  it('a 12-lead taken at a rate of 48 is explained as sinus bradycardia with the inferior ST elevation', () => {
    const s = run(sc, 4, ['callout', 'ecg12']);
    expect(s.reads.at(-1)).toMatchObject({ answer: 'stemi-inferior', verdict: 'correct' });
    expect(said(s, /Sinus bradycardia 48: new ST elevation in II, III and aVF/)).toBe(true);
  });

  it('there is no tachycardia in this case: AV-nodal blockers, antiarrhythmics, lidocaine and IM epinephrine each cost points, once', () => {
    expect(penalties(run(sc, 5, ['diltiazem']))).toEqual(['nodal-blocker-no-tachycardia']);
    expect(penalties(run(sc, 5, ['adenosine12']))).toEqual(['nodal-blocker-no-tachycardia']);
    // the nurse answering the open rate request with it: that request's penalty alone; once the rate is treated, this one
    expect(penalties(run(sc, 4, ['callout', 'diltiazem']))).toEqual(['wrong-rn-rate']);
    expect(penalties(run(sc, 4, ['callout', 'atropine', 'diltiazem']))).toEqual(['nodal-blocker-no-tachycardia']);
    expect(penalties(run(sc, 5, ['amio-infusion']))).toEqual(['antiarrhythmic-no-arrhythmia']);
    // procainamide at 48 and 84: one penalty, not the built-in low-pressure and slow-rate rules on top
    expect(penalties(run(sc, 5, ['procainamide']))).toEqual(['antiarrhythmic-no-arrhythmia']);
    expect(penalties(run(sc, 4, ['callout', 'lidocaine']))).toEqual(['lidocaine-no-arrhythmia']);
    expect(penalties(run(sc, 4, ['callout', 'epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
  });

  it('a drug given in the arrest is felt by nobody', () => {
    const vf = run(sc, 5, R(4));
    for (const id of ['radial-cocktail', 'adenosine-iv-ffr']) {
      const t = perform(sc, vf, id);
      expect(t.log.slice(vf.log.length).some((l) => l.who === 'patient'), id).toBe(false);
    }
    expect(perform(sc, vf, 'consent').counts.consent).toBeUndefined();
  });

  it('a non-compliant balloon inside a stent in the false lumen does not open the artery', () => {
    const s = run(sc, 5, [...MD_FIRST, 'wire-hydrophilic', 'stent-des', 'balloon-nc']);
    expect(said(s, /still nothing fills beyond it/)).toBe(true);
    expect(said(s, /good expansion/)).toBe(false);
    expect(s.flags.sealed).toBeUndefined();
  });
});
