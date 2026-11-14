import { describe, expect, it } from 'vitest';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, stop, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabStroke as sc } from '@/lib/sim/scenario/scenarios/cathlabStroke';
import type { SimState } from '@/lib/sim/scenario/types';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const toFix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState) => toFix(s).filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => toFix(s).filter((t) => t.kind === 'late').map((t) => t.label);
const said = (s: SimState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: calls it out with the time, shuts the injector, calls the stroke alert and runs the ACT; the nurse and the
  // stroke neurologist then take him to CT
  3: ['callout', 'stop-contrast', 'stroke-team', 'act', ...R(2)],
  // the nurse: calls it out, the stroke alert, the neuro check, the glucose, the cuff pressure, the airway, the ACT, then to
  // CT with him and the hand-off for thrombectomy
  4: ['callout', 'stroke-team', 'neuro', 'glucose', 'nibp', 'primary', 'act', 'ct-urgent', 'handoff'],
  // the cardiologist: stops, calls the stroke alert, examines, checks the glucose and the ACT, CT and CT angiography, hand-off
  5: ['stop-contrast', 'stroke-team', 'neuro', 'glucose', 'act', 'ct-urgent', 'handoff'],
};
const ROLES = [3, 4, 5] as const;

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
/** Words that would name what happened before the learner has read it */
const naming = /stroke|embol|clot|infarct|occlu|isch|NIHSS|neuro/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis|favour/i;

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

describe('stroke in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('periprocedural-stroke-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-stroke', 'clin-sedation']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
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

  it('gives each role its own part: the tech the call-out, the injector, the alert and the ACT; the nurse the checks; the cardiologist the decisions', () => {
    const ids = (role: 3 | 4 | 5) => criticalsFor(sc, role).map((c) => c.id);
    expect(ids(3)).toEqual(['tech-callout', 'tech-stop', 'tech-alert', 'tech-act']);
    expect(ids(4)).toEqual(['rn-callout', 'rn-alert', 'rn-neuro', 'rn-glucose', 'rn-bp', 'rn-airway', 'rn-anticoag', 'rn-ct', 'bp-low', 'handoff']);
    expect(ids(5)).toEqual(['md-stop', 'md-alert', 'md-neuro', 'md-glucose', 'md-anticoag', 'md-ct', 'bp-low', 'handoff']);
    // the tech has no glucose meter and orders no scan
    for (const id of ['glucose', 'ct-urgent', 'tnk']) expect(interventionsFor(3, 'cathlab').some((i) => i.id === id), id).toBe(false);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const t of sc.teaching) expect(t).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });

  it('teaches the recognition, the safe stop, the work-up, the pressure and who decides on thrombolysis', () => {
    const text = sc.teaching.join(' ');
    for (const point of [/Sedation does not cause a one-sided deficit/, /not the sheath/, /last known well/, /over a wire/, /leave the sheath in/, /glucose/,
      /oxygen only to keep the SpO₂ above 94 %/, /swallow screen/, /CT angiography/, /thrombectomy/, /stroke team's decision/, /usual eligibility rules/, /220\/120/,
      /185\/110/, /0\.25 mg\/kg/, /no protamine unless the CT shows a bleed/, /contrast-induced encephalopathy/]) {
      expect(text).toMatch(point);
    }
  });
});

describe('stroke in the cath lab: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.reads.map((r) => r.answer)).toEqual(['clin-stroke']);
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      expect(s.fired).not.toContain('worse');
      expect(s.fired).not.toContain('operator-carries-on');
      expect(s.flags['more-arch']).toBeUndefined();
      // his pressure is left where it was
      expect([s.vitals.sbp, s.vitals.dbp]).toEqual([174, 92]);
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(naming);
    }
  });

  it('nothing names what happened before the learner reads it — and the read comes first', () => {
    for (const role of ROLES) {
      const s = run(sc, role, [], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-stroke', prompt: 'What is happening?' });
      for (const l of s.log) expect(l.text, `role ${role}: ${l.text}`).not.toMatch(naming);
      expect(unavailableReason(sc, s, 'neuro'), `role ${role}`).toMatch(/read first/);
    }
  });

  it('the tech\'s case ends as he leaves for CT; the nurse\'s and the cardiologist\'s once the scan is read and he is handed over', () => {
    const tech = run(sc, 3, IDEAL[3]);
    expect(tech.flags['to-ct']).toBeDefined();
    expect(tech.flags.ct).toBeUndefined();
    for (const role of [4, 5] as const) {
      const s = run(sc, role, IDEAL[role]);
      expect(s.flags.thrombectomy, `role ${role}`).toBeDefined();
      expect(s.log.at(-2)?.text, `role ${role}`).toMatch(/^SBAR to the stroke and neurointerventional team: .*last known well 10:40.*ACT 238.*not lowered.*left M1 occlusion — straight to thrombectomy\.$/);
    }
  });
});

describe('stroke in the cath lab: the read', () => {
  it('blaming the sedation is a misread that costs 5 points, and the feedback says why', () => {
    const s = run(sc, 5, ['read:clin-sedation'], undefined, 'manual');
    expect(s.reads[0]).toMatchObject({ answer: 'clin-stroke', chosen: 'clin-sedation', verdict: 'wrong' });
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'misread-1', points: 5 })]);
    expect(s.log.some((l) => l.who === 'feedback' && /Sedation never causes a one-sided weakness/.test(l.text))).toBe(true);
  });

  it('each role hears the tempting explanation before the read: the nurse asks the cardiologist, the operator offers it to the team', () => {
    expect(said(run(sc, 5, [], undefined, 'manual'), /is he just drowsy\?/)).toBe(true);
    for (const role of [3, 4] as const) expect(said(run(sc, role, [], undefined, 'manual'), /Probably the midazolam/), `role ${role}`).toBe(true);
  });
});

describe('stroke in the cath lab: the responders', () => {
  it('the tech\'s or nurse\'s call-out gives the time and stops the operator: catheter out over a wire, sheath in', () => {
    for (const role of [3, 4] as const) {
      const s = run(sc, role, ['callout']);
      expect(s.log.some((l) => l.who === 'you' && /He was talking normally at 10:40; it is 10:42 now\./.test(l.text)), `role ${role}`).toBe(true);
      expect(s.flags.stopped, `role ${role}`).toBeDefined();
      expect(s.flags['time-noted'], `role ${role}`).toBeDefined();
      expect(said(s, /J-wire and out; the sheath stays in/), `role ${role}`).toBe(true);
      expect(said(s, /Call a stroke alert, please/), `role ${role}`).toBe(true);
    }
  });

  it('a stroke alert called out loud stops the operator too, and a call-out right after still counts', () => {
    const s = run(sc, 4, ['stroke-team', 'callout']);
    expect(s.flags.stopped).toBeDefined();
    expect(s.fired).not.toContain('operator-carries-on');
    expect(missed(s)).not.toContain('Call it out at once, with the time');
    expect(late(s)).not.toContain('Call it out at once, with the time');
  });

  // regression: the stroke alert said in the room (with the time) is the call-out — it was missed, 10 points, without a second one
  it('the stroke alert alone is the call-out: the tech and the nurse who call it first lose nothing', () => {
    const tech = run(sc, 3, ['stroke-team', 'stop-contrast', 'act', ...R(2)]);
    expectFullMarks(tech);
    expect(tech.log.some((l) => l.who === 'you' && /since 10:42, last known well 10:40/.test(l.text))).toBe(true);
    const rn = run(sc, 4, ['stroke-team', 'neuro', 'glucose', 'vitals', 'primary', 'act', 'ct-urgent', 'handoff']);
    expectFullMarks(rn);
    // after a teammate has had to speak up, the alert no longer counts as the call-out
    const late4 = run(sc, 4, ['reassess', 'stroke-team']);
    expect(late4.fired).toContain('callout-fallback');
    expect(missed(late4)).toContain('Call it out at once, with the time');
  });

  it('the cardiologist\'s stop ends the catheter work: a run afterwards is refused, at no cost', () => {
    const stopped = run(sc, 5, ['stop-contrast']);
    const s = perform(sc, stopped, 'view-rca-lao');
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/case is over/) });
    expect([s.minute, s.penalties]).toEqual([stopped.minute, []]);
  });

  it('the exam: NIHSS 10 from the nurse and the cardiologist, a quick check from the tech — and the glucose is not low', () => {
    expect(run(sc, 5, ['stop-contrast', 'neuro']).log.at(-1)!.text).toMatch(/NIHSS 10: .*right lower face droops.*right arm drifts down.*Last known well 10:40\./);
    expect(run(sc, 4, ['callout', 'neuro']).log.at(-1)!.text).toMatch(/NIHSS 10/);
    expect(run(sc, 3, ['callout', 'neuro']).log.at(-1)!.text).toMatch(/^Quick check \(BE-FAST\)/);
    expect(run(sc, 5, ['glucose']).log.at(-1)!.text).toBe('Blood glucose 126 mg/dL: not low.');
  });

  it('the stroke team comes 4 minutes after the alert; the neurologist quotes the ACT when there is one and rules out IV thrombolysis', () => {
    let s = run(sc, 5, ['stop-contrast', 'stroke-team', 'act']);
    expect(s.flags['team-here']).toBeUndefined();
    s = run(sc, 5, ['stop-contrast', 'stroke-team', 'act', ...R(2)]);
    expect(s.fired).toContain('stroke-team-arrives');
    expect(said(s, /Stroke neurologist at the table: "NIHSS 10; .*An ACT of 238 after 5,000 units of heparin: his clotting time is far too long for IV thrombolysis\./)).toBe(true);
    const noAct = run(sc, 5, ['stop-contrast', 'stroke-team', ...R(2)]);
    expect(said(noAct, /I want an ACT/)).toBe(true);
  });

  it('the CT waits until the catheter is out, and for the nurse until the stroke alert', () => {
    const md = run(sc, 5, ['ct-urgent']);
    expect(md.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not with a catheter in his aortic arch/) });
    expect(md.counts['ct-urgent']).toBeUndefined();
    const rn = run(sc, 4, ['callout', 'ct-urgent']);
    expect(rn.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^The scan comes with the stroke alert/) });
    expect(rn.counts['ct-urgent']).toBeUndefined();
  });

  it('the CT shows no bleed and a left M1 occlusion: thrombectomy, no IV thrombolysis after the heparin', () => {
    const s = run(sc, 5, IDEAL[5].slice(0, -1));
    expect(said(s, /no bleeding; subtle early ischemic change in the left insula only \(ASPECTS 9\)\. CT angiography: the left middle cerebral artery is cut off in its M1 segment/)).toBe(true);
    expect(said(s, /No IV thrombolysis: 5,000 units of heparin at 10:20 and an ACT of 238 — with his clotting time that long, the bleeding risk rules it out\. He goes straight to thrombectomy/)).toBe(true);
    expect(said(s, /Leave his pressure where it is — no higher than 185\/110, and nothing to bring it down\./)).toBe(true);
    expect(s.flags.thrombectomy).toBeDefined();
  });

  it('a CT without the stroke alert finds the occlusion but no one to treat it: the hand-off waits for the stroke team, and the alert is late', () => {
    let s = run(sc, 5, ['stop-contrast', 'neuro', 'glucose', 'act', 'ct-urgent']);
    expect(s.flags.ct).toBeDefined();
    expect(s.flags.thrombectomy).toBeUndefined();
    expect(said(s, /who is the stroke team on this\?/)).toBe(true);
    expect(perform(sc, s, 'handoff').log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Nobody has taken him on yet: .*call the stroke alert/) });
    s = perform(sc, s, 'stroke-team');
    expect(s.flags.thrombectomy).toBeDefined();
    expect(said(s, /there within minutes, the scan already on the screen/)).toBe(true);
    s = perform(sc, s, 'handoff');
    expect(s.ended?.reason).toBe('complete');
    expect(late(s)).toContain('Call the stroke alert');
  });

  it('interventional radiology sends a cardiologist who calls them to the stroke alert, at no cost', () => {
    const s = run(sc, 5, ['stop-contrast', 'call-vascular']);
    expect(s.log.at(-1)!.text).toMatch(/Call the stroke alert/);
    expect(s.penalties).toEqual([]);
  });

  it('the nurse checks the airway (no oxygen needed above 94 %) and puts a cuff on the other arm for the trip', () => {
    const s = run(sc, 4, ['callout', 'primary', 'nibp']);
    expect(said(s, /SpO₂ 96 %.*No oxygen needed: it is for an SpO₂ of 94 % or less.*nothing by mouth until a swallow screen/)).toBe(true);
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'NIBP 174/92 mmHg: cuff on the left arm, cycling every 5 minutes for the trip to CT.' });
  });

  // regression: the default gave a cuff pressure on the right arm, the one with the radial sheath in it
  it('blood pressure in both arms: no cuff on the sheath arm, and it counts as the pressure for the trip', () => {
    const s = run(sc, 4, ['callout', 'bp-both-arms']);
    expect(s.log.at(-1)!.text).toBe('Left arm 174/92. The right arm carries the radial sheath, so no cuff goes on it.');
    expect(missed(s)).not.toContain('Blood pressure on the cuff, for the trip to CT');
  });

  // regression: the hand-off before the scan said "the procedure is not over"; the access and the femoral closure device answered as if
  // the case had just begun, and cardiac surgery promised an operating room for a stroke
  it('the hand-off waits for the scan, the sheath is already in, nothing needs a femoral closure, and surgery sends the caller to the stroke team', () => {
    expect(perform(sc, run(sc, 4, ['callout']), 'handoff').log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not yet: he goes to CT and CT angiography first/) });
    const md = run(sc, 5, ['stop-contrast']);
    for (const [id, text] of [['access', /already in his right radial artery/], ['closure-device', /nothing for a femoral closure device to close/]] as const) {
      const s = perform(sc, md, id);
      expect(s.log.at(-1), id).toMatchObject({ who: 'system', text: expect.stringMatching(text) });
      expect([s.minute, s.penalties], id).toEqual([md.minute, []]);
    }
    // regression: these went ahead on a heart with no catheter in it to use, nothing to drain and nothing bleeding
    for (const [id, text] of [['clear-air', /no catheter in a coronary to aspirate through/], ['balloon-tamponade', /nothing to inflate a balloon over/],
      ['pericardiocentesis', /no pericardial effusion, so there is nothing for a needle to drain/]] as const) {
      const s = perform(sc, md, id);
      expect(s.log.at(-1), id).toMatchObject({ who: 'system', text: expect.stringMatching(text) });
      expect([s.minute, s.penalties], id).toEqual([md.minute, []]);
    }
    const lvedp = perform(sc, run(sc, 3, []), 'lvedp');
    expect(lvedp.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^There is no catheter in his left ventricle/) });
    const surgery = perform(sc, md, 'call-surgery');
    expect(surgery.log.at(-1)!.text).toMatch(/^Cardiac surgery: "A new deficit on the table is not ours — call the stroke alert/);
    expect(said(surgery, /OR is being prepared/)).toBe(false);
    expect(surgery.penalties).toEqual([]);
  });

  it('in the tech\'s case the nurse examines him and the computer team carries the rest', () => {
    const s = run(sc, 3, IDEAL[3]);
    expect(s.fired).toEqual(expect.arrayContaining(['md-stops', 'alert-ask', 'rn-assesses-for-tech', 'act-ask', 'stroke-team-arrives']));
    expect(said(s, /Nurse: "Glucose 126\. .*NIHSS 10/)).toBe(true);
    expect(said(s, /The nurse and the neurologist take him to CT/)).toBe(true);
  });
});

describe('stroke in the cath lab: when the team is slow, the teammates step in and the review says so', () => {
  it('no call-out: the operator carries on, the deficit grows, and a teammate calls it out — the item is missed', () => {
    for (const role of [3, 4] as const) {
      const s = run(sc, role, ['reassess']);
      expect(s.fired, `role ${role}`).toEqual(expect.arrayContaining(['operator-carries-on', 'callout-fallback', 'md-stops', 'worse']));
      expect(s.flags['team-noticed'], `role ${role}`).toBeDefined();
      expect(said(s, /stopped talking/), `role ${role}`).toBe(true);
      // a call-out after the teammate's does not count
      const after = perform(sc, s, 'callout');
      expect(missed(after), `role ${role}`).toContain('Call it out at once, with the time');
    }
  });

  it('the tech who never shuts the injector, calls the alert or runs the ACT: the operator and the nurse do it, and each item is missed', () => {
    const s = run(sc, 3, ['callout', ...R(4)]);
    expect(s.fired).toEqual(expect.arrayContaining(['injector-fallback', 'alert-fallback', 'act-fallback']));
    expect(s.flags['stroke-alert']).toBeDefined();
    expect(missed(s)).toEqual(expect.arrayContaining(['Injector off and the manifold closed', 'Call the stroke alert', 'Run an ACT for the stroke team']));
  });

  // regression: a second alert after a teammate's counted as the learner's own, only late (half the points), and the timing showed it
  // instead of the real call; the same for the tech's ACT after the nurse had run it, and the injector after the operator closed it
  it('what a teammate already did is not the learner\'s: a second alert is refused, and a late repeat earns nothing', () => {
    let rn = run(sc, 4, ['callout', 'neuro', 'glucose', 'vitals', 'reassess']);
    expect(rn.fired).toContain('alert-fallback');
    const before = rn.minute;
    rn = perform(sc, rn, 'stroke-team');
    expect(rn.log.at(-1)).toMatchObject({ who: 'system', text: 'The stroke alert was called at 10:46: the stroke neurologist is on the way.' });
    expect([rn.minute, rn.counts['stroke-team']]).toEqual([before, undefined]);
    const r = review(sc, stop(rn));
    expect(r.toFix.find((t) => t.label === 'Call the stroke alert')?.kind).toBe('missed');
    expect(r.timings.find((t) => t.label === 'Stroke team called')?.minute).toBe(rn.flags['stroke-alert']);

    let tech = run(sc, 3, ['callout', ...R(4)]);
    expect(tech.fired).toEqual(expect.arrayContaining(['injector-fallback', 'act-fallback']));
    expect(perform(sc, tech, 'stop-contrast').log.at(-1)).toMatchObject({ who: 'system', text: 'The injector is already off and the manifold closed.' });
    tech = perform(sc, tech, 'act');
    expect(tech.counts.act).toBe(1);
    expect(missed(tech)).toEqual(expect.arrayContaining(['Injector off and the manifold closed', 'Run an ACT for the stroke team']));
    expect(late(tech)).not.toContain('Run an ACT for the stroke team');
  });

  // regression: in the tech's case the nurse described the first, milder deficit after it had grown
  it('the nurse\'s report in the tech\'s case describes the deficit as it is', () => {
    const s = run(sc, 3, ['view-rca-lao', 'callout', 'reassess']);
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'rn-assesses-for-tech']));
    expect(said(s, /^Nurse: "Glucose 126\. Drowsy, eyes to the left, no words at all; the right face, arm and leg barely move\. NIHSS 19\./)).toBe(true);
  });

  it('the nurse who does not call the alert: the tech calls it at 3 minutes, and the item is missed', () => {
    const s = run(sc, 4, ['callout', 'neuro', 'glucose', 'nibp', 'primary', 'act']);
    expect(s.fired).toContain('alert-fallback');
    expect(said(s, /Tech, on the phone: "Stroke alert:/)).toBe(true);
    expect(missed(s)).toContain('Call the stroke alert');
  });

  it('a cardiologist who delays the stroke team is prompted at 3 minutes, and at 6 the deficit grows', () => {
    const s = run(sc, 5, ['stop-contrast', 'glucose', 'act', 'echo', 'reassess']);
    expect(s.fired).toEqual(expect.arrayContaining(['md-alert-nudge', 'worse']));
    expect(s.vitals.gcs).toBe(10);
    // the scan then shows the bigger infarct, and the exam the bigger deficit
    const scanned = run(sc, 5, ['stop-contrast', 'glucose', 'act', 'echo', 'reassess', 'stroke-team', 'neuro', 'ct-urgent']);
    expect(said(scanned, /ASPECTS 7/)).toBe(true);
    expect(said(scanned, /NIHSS 19/)).toBe(true);
  });

  // regression: the grown deficit read "GCS 12" beside "no speech at all, follows no commands" (that is E3 V1–2 M5: 9–10)
  it('the grown deficit: the GCS fits the exam, and he is now too drowsy for anything by mouth', () => {
    const s = run(sc, 5, ['view-rca-lao', 'stop-contrast', 'neuro']);
    expect(s.vitals.gcs).toBe(10);
    expect(s.log.at(-1)!.text).toMatch(/^GCS 10 \(E3 V2 M5\): drowsy, opens his eyes to voice; only groans, no words, and he follows no commands/);
    // the engine's swallow rule now refuses the aspirin outright (nothing given, nothing scored)
    const asa = perform(sc, s, 'aspirin');
    expect(asa.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/too drowsy to swallow safely/) });
    expect(asa.counts.aspirin).toBeUndefined();
  });
});

describe('stroke in the cath lab: the traps', () => {
  it('carrying on: another run before stopping costs the cardiologist points and brings a second embolus', () => {
    const s = run(sc, 5, ['view-rca-lao']);
    expect(penalties(s)).toEqual(['carry-on']);
    expect(s.fired).toContain('worse');
    expect(s.vitals.gcs).toBe(10);
    expect(s.images.at(-1)).toMatchObject({ id: 'view-rca-lao' });
    // a new catheter is the same mistake
    expect(penalties(run(sc, 5, ['cath-jr4']))).toEqual(['carry-on']);
  });

  // regression: a balloon pump or an Impella (more large catheters in his aorta, no shock to support) cost nothing
  it('a pump in the aorta is more catheter work too: it costs the cardiologist, and after the stop it is refused', () => {
    for (const id of ['iabp', 'impella']) {
      const s = run(sc, 5, [id]);
      expect(penalties(s), id).toEqual(['carry-on']);
      expect(s.fired, id).toContain('worse');
      const after = perform(sc, run(sc, 5, ['stop-contrast']), id);
      expect(after.log.at(-1), id).toMatchObject({ who: 'system', text: expect.stringMatching(/nothing more goes into his aorta today/) });
    }
    // the tech's consoles are no carry-on: the default answers, at no cost
    expect(penalties(run(sc, 3, ['callout', 'iabp']))).toEqual([]);
  });

  it('the tech who sets up the next run hands the operator the means to go on; after the stop it is put away — both cost points', () => {
    const before = run(sc, 3, ['view-rca-lao']);
    expect(penalties(before)).toEqual(['tech-carry-on']);
    expect(before.flags['more-arch']).toBeDefined();
    expect(before.fired).toContain('worse');
    const afterStop = run(sc, 3, ['callout', 'stop-contrast', 'cath-jr4']);
    expect(penalties(afterStop)).toEqual(['tech-carry-on']);
    expect(afterStop.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/Put that away/) });
    expect(afterStop.flags['more-arch']).toBeUndefined();
  });

  it('more sedation hides the exam, slows the breathing and drops the pressure — one penalty, not two', () => {
    for (const [role, id] of [[5, 'midazolam'], [4, 'midazolam'], [5, 'fentanyl'], [4, 'sedation']] as const) {
      let s = run(sc, role, role === 4 ? ['callout', id] : ['stop-contrast', id]);
      expect(penalties(s), `${role} ${id}`).toEqual(['sedation-for-deficit']);
      expect(s.vitals.gcs, `${role} ${id}`).toBeLessThan(14);
      expect(s.vitals.sbp, `${role} ${id}`).toBeLessThan(174);
      s = perform(sc, s, 'neuro');
      expect(s.log.at(-1)!.text, `${role} ${id}`).toMatch(/can no longer be told/);
    }
    // a second dose with him drowsier is still the one mistake (the built-in midazolam rule stands aside)
    expect(penalties(run(sc, 5, ['stop-contrast', 'midazolam', 'midazolam']))).toEqual(['sedation-for-deficit']);
  });

  // regression: after extra sedation the neurologist, the plan and the hand-off still quoted "NIHSS 10" from an exam that can no longer be done
  it('after extra sedation nobody quotes an NIHSS the exam cannot give', () => {
    const s = run(sc, 5, ['stop-contrast', 'midazolam', 'stroke-team', 'neuro', 'glucose', 'act', ...R(2), 'ct-urgent', 'handoff']);
    expect(said(s, /Stroke neurologist at the table: "NIHSS hard to score through the extra sedation;/)).toBe(true);
    expect(s.log.at(-2)!.text).toMatch(/^SBAR .*NIHSS hard to score through the extra sedation;/);
    expect(said(s, /NIHSS 10/)).toBe(false);
  });

  it('lowering the pressure: the drop is real and each role that can do it pays for it; under 140 the deficit grows', () => {
    for (const [role, steps] of [[5, ['stop-contrast', 'nitro']], [4, ['callout', 'metoprolol']], [3, ['callout', 'radial-cocktail']], [5, ['ic-nitro']]] as const) {
      const s = run(sc, role, [...steps]);
      expect(penalties(s), `${role} ${steps.at(-1)}`).toEqual(['lower-bp-stroke']);
      expect(s.vitals.sbp, `${role} ${steps.at(-1)}`).toBeLessThan(174);
      // one dose leaves him in the 150s and 160s: still above what his collaterals need
      expect(s.vitals.sbp, `${role} ${steps.at(-1)}`).toBeGreaterThanOrEqual(140);
      expect(s.fired, `${role} ${steps.at(-1)}`).not.toContain('worse');
    }
    // pushed under 140, the collaterals fail: the teammate says so and the deficit grows — one penalty for the one mistake
    const twice = run(sc, 5, ['stop-contrast', 'nitro', 'nitro']);
    expect(twice.vitals.sbp).toBeLessThan(140);
    expect(twice.fired).toEqual(expect.arrayContaining(['pressure-falls', 'worse']));
    expect(said(twice, /a long way below his usual 170s/)).toBe(true);
    expect(penalties(twice)).toEqual(['lower-bp-stroke', 'lower-bp-again']);
    // nothing goes down a catheter that is out
    const out = run(sc, 5, ['stop-contrast']);
    for (const id of ['ic-nitro', 'ic-adenosine', 'ic-epinephrine']) {
      expect(perform(sc, out, id).log.at(-1), id).toMatchObject({ who: 'system', text: 'The catheter is out: there is no coronary to inject.' });
    }
  });

  // regression: one penalty covered any number of doses (and replaced the nitrate-with-hypotension rule), so three nitrates cost what
  // one did — and fixing the fall they caused even raised the percentage
  it('a run of lowering drugs costs more than one: a second dose is a mistake of its own, and a nitrate under 90 is the built-in one', () => {
    const one = run(sc, 5, ['stop-contrast', 'nitro']);
    const three = run(sc, 5, ['stop-contrast', 'nitro-high', 'nitro-high', 'nitro-high']);
    expect(penalties(one)).toEqual(['lower-bp-stroke']);
    expect(penalties(three)).toEqual(['lower-bp-stroke', 'lower-bp-again']);
    expect(three.vitals.sbp).toBeLessThan(90);
    expect(penalties(perform(sc, three, 'nitro'))).toEqual(['lower-bp-stroke', 'lower-bp-again', 'nitro-hypotension']);
    // the whole case, pressure fixed in time: a run of three still scores below a single dose
    const after = ['neuro', 'glucose', 'act', 'stroke-team', 'fluid', 'fluid', 'ct-urgent', 'handoff'];
    const once = review(sc, run(sc, 5, ['stop-contrast', 'nitro', ...after]));
    const thrice = review(sc, run(sc, 5, ['stop-contrast', 'nitro', 'nitro', 'nitro', ...after]));
    expect(thrice.percent).toBeLessThan(once.percent);
  });

  // regression: the growing stroke reset the heart rate to 92 whatever a beta-blocker had done to it
  it('the growing deficit speeds the heart from where it is, and the monitor says the same', () => {
    const s = run(sc, 4, ['callout', 'metoprolol', 'nitro', 'nitro']);
    expect(s.fired).toContain('worse');
    expect(s.rhythm.hr).toBe(82);
    expect(s.log.some((l) => l.who === 'monitor' && new RegExp(`^Heart rate 82\\. BP ${s.vitals.sbp}/${s.vitals.dbp}\\.$`).test(l.text))).toBe(true);
  });

  it('a pressure dropped under 140 must be brought back: the item appears, and a bolus or a pressor done in time earns it, at no cost', () => {
    const low = run(sc, 5, ['stop-contrast', 'nitro-high', 'nitro-high']);
    expect(low.vitals.sbp).toBeLessThan(140);
    expect(low.flags['bp-low']).toBeDefined();
    expect(penalties(low)).toEqual(['lower-bp-stroke', 'lower-bp-again']);
    expect(missed(low)).toContain('Bring a pressure that has fallen under 140 back up');
    for (const id of ['fluid', 'phenylephrine', 'pressor', 'push-epi', 'legs-up']) {
      const s = perform(sc, low, id);
      expect(s.vitals.sbp, id).toBeGreaterThan(low.vitals.sbp);
      expect(missed(s), id).not.toContain('Bring a pressure that has fallen under 140 back up');
      expect(penalties(s), id).toEqual(['lower-bp-stroke', 'lower-bp-again']);
    }
    // the stroke neurologist's plan says to bring it back, not to leave it there
    const scanned = run(sc, 5, ['stop-contrast', 'nitro-high', 'nitro-high', 'stroke-team', 'neuro', 'glucose', 'act', 'ct-urgent']);
    expect(said(scanned, /His pressure is too low for the brain around the clot: bring it back up/)).toBe(true);
  });

  // regression: phenylephrine fell to the built-in rule at 120, while the case's own rule let the other pressors go under 140
  it('a vasopressor with his pressure already high is a minor mistake — one rule, one line, for every vasopressor', () => {
    expect(penalties(run(sc, 5, ['stop-contrast', 'pressor']))).toEqual(['pressor-high-bp']);
    expect(penalties(run(sc, 4, ['callout', 'phenylephrine']))).toEqual(['pressor-high-bp']);
    // the tech's intracoronary epinephrine before the stop, down a catheter lying free in his aorta
    expect(penalties(run(sc, 3, ['ic-epinephrine']))).toEqual(['pressor-high-bp']);
    // 130 after a nitrate: bringing it back is right, whichever drug does it
    const low = run(sc, 4, ['callout', 'nitro', 'nitro']);
    expect(low.vitals.sbp).toBeLessThan(140);
    expect(low.vitals.sbp).toBeGreaterThanOrEqual(120);
    for (const id of ['phenylephrine', 'pressor', 'push-epi']) expect(penalties(perform(sc, low, id)), id).toEqual(['lower-bp-stroke', 'lower-bp-again']);
  });

  it('in the tech\'s case the nurse brings back a pressure the tech\'s drugs pushed under 140', () => {
    const s = run(sc, 3, ['radial-cocktail', 'ic-nitroprusside', 'ic-nitro', 'callout']);
    expect(s.fired).toEqual(expect.arrayContaining(['pressure-falls', 'worse', 'nurse-supports']));
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(140);
    expect(penalties(s)).toEqual(['lower-bp-stroke', 'lower-bp-again']);
    // the tech has no item for it: the nurse's
    expect(criticalsFor(sc, 3).map((c) => c.id)).not.toContain('bp-low');
  });

  it('a lytic from the cardiologist is a critical error, and the stroke team says so', () => {
    const s = run(sc, 5, ['stop-contrast', 'tnk', 'stroke-team', ...R(2)]);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'lytic-in-lab', severity: 'critical', points: 15 })]);
    expect(said(s, /oozing around the sheath/)).toBe(true);
    expect(said(s, /Tenecteplase — on top of the heparin, before a scan\?/)).toBe(true);
    expect(interventionsFor(4, 'cathlab').some((i) => i.id === 'tnk')).toBe(false);
  });

  it('more antithrombotic drugs before the scan: the nurse and the cardiologist pay for them, and the ACT climbs', () => {
    for (const id of ['heparin', 'bivalirudin', 'cangrelor']) expect(penalties(run(sc, 5, ['stop-contrast', id])), id).toEqual(['more-antithrombotic']);
    // eptifibatide with a stroke under way: every antithrombotic's contraindication at the built-in weight (15, critical)
    expect(penalties(run(sc, 5, ['stop-contrast', 'gp2b3a']))).toEqual(['antithrombotic-intracranial']);
    const s = run(sc, 4, ['callout', 'heparin', 'act']);
    expect(penalties(s)).toEqual(['more-antithrombotic']);
    expect(s.log.at(-1)!.text).toMatch(/^ACT 312 s/);
  });

  it('nothing by mouth: aspirin or a P2Y12 load costs points, and the swallow is not safe', () => {
    for (const [role, id] of [[4, 'aspirin'], [5, 'aspirin'], [5, 'p2y12']] as const) {
      const s = run(sc, role, role === 4 ? ['callout', id] : ['stop-contrast', id]);
      expect(penalties(s), `${role} ${id}`).toEqual(['nothing-by-mouth']);
      expect(s.log.at(-1)!.text, `${role} ${id}`).toMatch(/his swallow is not safe/);
    }
  });

  it('protamine without a bleed is a minor mistake, and the ACT falls', () => {
    const s = run(sc, 5, ['stop-contrast', 'protamine', 'act']);
    expect(penalties(s)).toEqual(['protamine-no-bleed']);
    expect(s.log.at(-1)!.text).toMatch(/^ACT 134 s/);
  });

  it('correct care is never penalized: oxygen, a 12-lead, the echo, the labs, a radial band and a second call-out cost nothing', () => {
    expect(penalties(run(sc, 5, ['stop-contrast', 'o2-nc', 'ecg12', 'echo', 'labs']))).toEqual([]);
    expect(penalties(run(sc, 4, ['callout', 'o2-nrb', 'labs', 'hemostasis', 'callout', 'vitals', 'bp-both-arms']))).toEqual([]);
    expect(penalties(run(sc, 3, ['callout', 'neuro', 'stop-contrast', 'hemostasis', 'callout']))).toEqual([]);
  });

  it('the review lists a harmful choice under what to fix, never under what went well', () => {
    const steps = [...IDEAL[5]];
    steps.splice(2, 0, 'nitro');
    const s = run(sc, 5, steps);
    const r = review(sc, s);
    expect(r.toFix.find((t) => t.kind === 'harm')).toMatchObject({ label: 'Lowering the blood pressure in an acute ischemic stroke.', severity: 'major' });
    expect(r.percent).toBeLessThan(100);
  });
});

describe('periprocedural stroke: the rate drugs\' own label contraindications are never free', () => {
  it('after two lowering doses, a beta-blocker under 90 is the built-in low-pressure rule; diltiazem after metoprolol the IV combination rule', () => {
    const low = run(sc, 4, ['callout', 'nitro-high', 'nitro-high', 'nitro-high']);
    expect(penalties(low)).toEqual(['lower-bp-stroke', 'lower-bp-again']);
    expect(low.vitals.sbp).toBeLessThan(90);
    for (const id of ['metoprolol', 'esmolol', 'diltiazem']) {
      expect(penalties(perform(sc, low, id)), id).toEqual(['lower-bp-stroke', 'lower-bp-again', 'nodal-blocker-hypotension']);
    }
    // the second lowering drug, diltiazem after IV metoprolol: the label's combination rule speaks for it (one dose, one penalty)
    expect(penalties(run(sc, 4, ['callout', 'metoprolol', 'diltiazem']))).toEqual(['lower-bp-stroke', 'iv-beta-blocker-with-diltiazem']);
    // …and still after both stroke rules have charged
    expect(penalties(run(sc, 4, ['callout', 'nitro', 'nitro', 'metoprolol', 'diltiazem'])))
      .toEqual(['lower-bp-stroke', 'lower-bp-again', 'iv-beta-blocker-with-diltiazem']);
  });
});
