import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabLeftMain as sc } from '@/lib/sim/scenario/scenarios/cathlabLeftMain';
import type { SimState } from '@/lib/sim/scenario/types';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'late').map((t) => t.label);
const said = (s: SimState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: the room, then the catheter, the ACT, the pump, the leg, the guide, the IVUS, the stent as ordered, the dip
  // called out, the post-dilation balloon, and a 12-lead once the left main is open
  3: ['prep', 'transducer', 'pads', 'timeout', 'cath-jl4', 'act', 'impella', 'perfusion', 'guide-ebu', 'ivus', 'stent-des', 'callout', 'balloon-nc', 'ecg12'],
  // the nurse: a line and the pressor, the oxygen, consent, the 12-lead; heparin, the surgeon, the ACT, cangrelor and a little
  // fentanyl as ordered; the leg below the pump; the dip called out; the 12-lead after; the hand-off
  4: ['iv', 'pressor', 'o2-nrb', 'consent', 'timeout', 'ecg12', 'heparin', 'call-surgery', 'act', 'cangrelor', 'fentanyl', 'perfusion', ...R(3), 'callout',
    'ecg12-repeat', 'handoff'],
  // the cardiologist: oxygen and the pressor, the 12-lead, femoral access, the culprit; the surgeon told, heparin, the ACT and an
  // echo; the pump before the left main is touched; cangrelor; IVUS-guided stenting and post-dilation; the culprit only
  5: ['consent', 'o2-nrb', 'pressor', 'ecg12', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'call-surgery', 'heparin', 'act', 'echo', 'impella',
    'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des', 'balloon-nc', 'ivus', 'final-angio', 'ecg12-repeat', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
const upTo = (steps: string[], id: string) => steps.slice(0, steps.indexOf(id) + 1);
/** The cardiologist up to the read of the angiogram */
const MD_TO_ANGIO = upTo(MD, 'angio');
/** … up to the pump across the valve */
const MD_TO_PUMP = upTo(MD, 'impella');
/** … up to the wire down the LAD */
const MD_TO_WIRE = upTo(MD, 'wire-workhorse');
/** The steps to the run, with every read given by hand, so the angiogram read stays open */
const MANUAL_TO_ANGIO: Record<3 | 4 | 5, string[]> = {
  3: upTo(IDEAL[3], 'cath-jl4'),
  4: upTo(IDEAL[4], 'ecg12'),
  5: ['consent', 'o2-nrb', 'pressor', 'ecg12', 'read:ischaemia', 'timeout', 'access-femoral', 'cath-jl4', 'angio'],
};

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

describe('left main in cardiogenic shock: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('left-main-shock-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('nstemi');
    expect(sc.problems).toEqual(['pulmonary-edema', 'heart-failure', 'acs', 'cardiogenic-shock']);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['ischaemia', 'angio-thrombus', 'angio-lm', 'hemo-cardiogenic', 'nsr']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
  });

  it('shows the real left main thrombus image, and its alt text gives nothing away', () => {
    expect(sc.images).toEqual({ angio: 'lm-thrombus-eptifibatide-before' });
    const img = CATH_IMAGES[sc.images!.angio!]!;
    expect(img).toBeDefined();
    expect(img.caption).toMatch(/thrombus partly blocks the left main/);
    expect(img.alt).not.toMatch(/thromb|left main|occlu/i);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('left main in cardiogenic shock: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 96 });
      expect(s.reads.map((r) => r.answer)).toEqual(expect.arrayContaining(['angio-thrombus', 'nsr']));
      if (role !== 3) expect(s.reads.map((r) => r.answer)).toContain('ischaemia');
      // every teammate answered without the operator stepping in
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      expect(has(s, 'impella') && has(s, 'pci') && has(s, 'final-angio')).toBe(true);
      expect(has(s, 'rca-pci')).toBe(false);
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nobody names the left main before the learner has read the run', () => {
    for (const role of ROLES) {
      const s = run(sc, role, MANUAL_TO_ANGIO[role], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'angio', answer: 'angio-thrombus', prompt: 'What does the left coronary run show?', run: s.images.length });
      expect(s.images.at(-1)).toMatchObject({ id: 'angio', image: 'lm-thrombus-eptifibatide-before' });
      // the 12-lead feedback may say "think left main" (that is the lesson of the 12-lead); nobody in the room says where it is
      for (const l of s.log) if (l.who !== 'feedback') expect(l.text, `role ${role}: ${l.who}`).not.toMatch(/left main/i);
      expect(said(s, /^Right coronary: .*Imaging screen/)).toBe(true);
    }
  });

  it('the run is clot in the left main: "left main stenosis" is half the read, "occlusion" is not it', () => {
    const at = (choice: string) => {
      const s = run(sc, 5, [...MANUAL_TO_ANGIO[5], `read:${choice}`], undefined, 'manual');
      return s.reads.at(-1)!.verdict;
    };
    expect(at('angio-thrombus')).toBe('correct');
    expect(at('angio-lm')).toBe('partial');
    expect(at('angio-lm-occlusion')).toBe('wrong');
  });

  it('correct care in another order or with another drug still earns full marks', () => {
    // bivalirudin instead of heparin
    expectFullMarks(run(sc, 5, MD.map((id) => (id === 'heparin' ? 'bivalirudin' : id))));
    // oral ticagrelor once the anatomy is known (cangrelor is the better choice, not the only one)
    expectFullMarks(run(sc, 5, MD.map((id) => (id === 'cangrelor' ? 'p2y12' : id))));
    // a pre-dilation before the stent, with the pump in
    const pre = [...MD];
    pre.splice(pre.indexOf('stent-des'), 0, 'balloon-predil');
    expectFullMarks(run(sc, 5, pre));
    // radial diagnostics first, then the femoral artery for the pump
    const radial = MD.filter((id) => id !== 'access-femoral');
    radial.splice(radial.indexOf('cath-jl4'), 0, 'access');
    radial.splice(radial.indexOf('call-surgery'), 0, 'access-femoral');
    expectFullMarks(run(sc, 5, radial));
  });
});

/** has() for the tests, on the state's flags */
function has(s: SimState, flag: string) {
  return flag in s.flags;
}

describe('left main in cardiogenic shock: the patient responds', () => {
  it('opens with the shock: a pressure of 78/50, SpO₂ 86 % on a cannula, and the 12-lead reads as diffuse ischemia with aVR up', () => {
    const s = run(sc, 5, ['ecg12'], undefined, 'manual');
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2]).toEqual([78, 50, 86]);
    expect(s.pendingRead).toMatchObject({ kind: 'ecg', answer: 'ischaemia' });
    expect(s.pendingRead!.explain).toMatch(/ST elevation in aVR/);
    expect(s.pendingRead!.explain).toMatch(/not a formal STEMI criterion/);
  });

  it('norepinephrine brings the pressure to 90/56; more nasal cannula is refused with the reason, at no cost', () => {
    let s = run(sc, 5, ['pressor']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([90, 56]);
    s = run(sc, 5, []);
    const after = perform(sc, s, 'o2-nc');
    expect(after.minute).toBe(0);
    expect(after.counts['o2-nc']).toBeUndefined();
    expect(after.log.at(-1)!.text).toMatch(/non-rebreather/);
    expect(run(sc, 5, ['o2-nrb']).vitals.spo2).toBe(91);
  });

  it('left without a pressor or support, the shock deepens; without more oxygen, the saturation falls', () => {
    const s = run(sc, 5, ['consent', 'timeout', 'access-femoral', 'cath-jl4', ...R(2)]);
    expect(s.fired).toEqual(expect.arrayContaining(['shock-worse', 'hypoxia-worse']));
    expect(s.vitals.sbp).toBe(68);
    expect(s.vitals.spo2).toBeLessThanOrEqual(80);
    expect(s.vitals.gcs).toBeLessThanOrEqual(12);
  });

  it('the ACT reads low before the heparin and in range after it', () => {
    let s = perform(sc, run(sc, 5, ['timeout']), 'act');
    expect(s.log.at(-1)!.text).toMatch(/^ACT 132 s/);
    s = perform(sc, perform(sc, s, 'heparin'), 'act');
    expect(s.log.at(-1)!.text).toMatch(/^ACT 276 s/);
  });

  it('the Impella needs a femoral artery; once in, the pressure and the oxygen come up', () => {
    const steps = ['consent', 'o2-nrb', 'pressor', 'timeout', 'access', 'cath-jl4', 'angio', 'heparin'];
    let s = run(sc, 5, steps);
    const blocked = perform(sc, s, 'impella');
    expect(blocked.counts.impella).toBeUndefined();
    expect(blocked.log.at(-1)!.text).toMatch(/14 French sheath in a femoral artery/);
    s = run(sc, 5, [...steps, 'access-femoral', 'impella']);
    expect(has(s, 'impella')).toBe(true);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([104, 72]);
    expect(s.vitals.spo2).toBeGreaterThanOrEqual(93);
  });

  it('the surgeon, once he has seen the run, says to open it now and stands by; called before the run, he only asks for the pictures', () => {
    let s = run(sc, 5, [...MD_TO_ANGIO, 'call-surgery']);
    expect(s.log.at(-1)!.text).toMatch(/Open the left main — that's the fastest way/);
    expect(s.log.at(-1)!.text).toMatch(/backup/);
    s = run(sc, 5, ['call-surgery']);
    expect(s.log.at(-1)!.text).toMatch(/wants to see the pictures/);
  });

  it('with the pump in, the balloon in the left main brings a dip the pump carries him through', () => {
    const s = run(sc, 5, upTo(MD, 'stent-des'));
    expect(s.pulse).toBe(true);
    expect(s.fired).toEqual(expect.arrayContaining(['inflation', 'reperfused']));
    expect(said(s, /Balloon up in the left main: BP falls to 74\/56/)).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 96 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain]).toEqual([108, 72, 2]);
  });

  it('without support, the balloon in the left main brings VF; a shock brings him back and the open artery reperfuses', () => {
    let s = run(sc, 5, [...MD_TO_ANGIO, 'call-surgery', 'heparin', 'act', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    // the balloon in an unsupported left main is the mistake (once), and the support item is missed
    expect(penalties(s)).toEqual(['lm-unsupported']);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 96 });
    expect(missed(s)).toContain('Mechanical support before the left main is touched (Impella)');
    expect(review(sc, stop(s)).wentWell.map((w) => w.label)).toContain('Defibrillate VF within 1 minute');
  });

  it('in VF, the hint names the shock first', () => {
    const s = run(sc, 5, [...MD_TO_ANGIO, 'call-surgery', 'heparin', 'act', 'guide-ebu', 'wire-workhorse', 'stent-des']);
    expect(s.pulse).toBe(false);
    expect(takeHint(sc, s).log.at(-1)!.text).toMatch(/^Hint: Defibrillate VF/);
  });

  it('a balloon pump does far less: the inflation drops him to 58/34 but he holds on, and the support item is missed — with no penalty', () => {
    const s = run(sc, 5, [...MD_TO_ANGIO, 'call-surgery', 'heparin', 'act', 'echo', 'iabp', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des']);
    expect(s.pulse).toBe(true);
    expect(said(s, /58\/34 despite the balloon pump/)).toBe(true);
    expect(penalties(s)).toEqual([]);
    expect(missed(s)).toContain('Mechanical support before the left main is touched (Impella)');
  });

  it('waiting with the culprit known deepens the shock at 25 minutes and brings VF at 35; the stent is then late', () => {
    // the pump is in at 21.7 and the run was read at 12: eight reassessments reach 37.7
    let s = run(sc, 5, [...MD_TO_PUMP, ...R(8)]);
    const angio = s.flags.angio;
    expect(s.minute).toBeGreaterThanOrEqual(angio + 25);
    expect(s.fired).toContain('delay-worse');
    expect(said(s, /Lactate 8\.4 and climbing/)).toBe(true);
    expect(s.pulse).toBe(true);
    s = run(sc, 5, [...MD_TO_PUMP, ...R(13)]);
    expect(s.fired).toContain('delay-vf');
    expect(s.pulse).toBe(false);
    s = run(sc, 5, [...MD_TO_PUMP, ...R(8), 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des']);
    expect(s.pulse).toBe(true);
    expect(late(s)).toContain('Stent the culprit left main');
  });

  it('a right heart run to measure the shock costs time, not points: still full marks', () => {
    const steps = [...MD];
    steps.splice(steps.indexOf('call-surgery') + 1, 0, 'access-venous', 'rhc');
    const s = run(sc, 5, steps);
    expect(s.reads.map((r) => r.answer)).toContain('hemo-cardiogenic');
    expect(s.fired).not.toContain('delay-worse');
    expectFullMarks(s);
  });

  it('IVUS sizes the left main, shows the under-expanded stent, and confirms the post-dilation; OCT does not count at this ostium', () => {
    let s = run(sc, 5, [...MD_TO_WIRE, 'ivus']);
    expect(s.log.at(-1)!.text).toMatch(/reference lumen 4\.4 mm/);
    s = run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-des', 'ivus']);
    expect(s.log.at(-1)!.text).toMatch(/under-expanded at the ostium/);
    s = run(sc, 5, [...MD_TO_WIRE, 'ivus', 'stent-des', 'balloon-nc', 'ivus']);
    expect(s.log.at(-1)!.text).toMatch(/93 % of the reference/);
    const oct = run(sc, 5, MD.map((id) => (id === 'ivus' ? 'oct' : id)));
    expect(said(oct, /cannot clear the blood from the ostium/)).toBe(true);
    expect(said(oct, /4\.0 × 12 sized by eye/)).toBe(true);
    expect(penalties(oct)).toEqual([]);
    expect(missed(oct)).toEqual(['IVUS to size and check the left main stent']);
  });

  it('a right heart run in shock asks for a read: cardiogenic shock numbers', () => {
    const s = run(sc, 5, [...MANUAL_TO_ANGIO[5], 'read:angio-thrombus', 'access-venous', 'rhc'], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'hemo', answer: 'hemo-cardiogenic' });
    expect(s.log.at(-1)!.text).toMatch(/PCWP 30 .* CI 1\.5/);
  });

  it('the leg below the pump is checked after it goes in, and an echo before it shows nothing in the way', () => {
    const s = run(sc, 5, MD);
    expect(said(s, /No LV thrombus; the aortic valve opens normally/)).toBe(true);
    const t = run(sc, 3, IDEAL[3]);
    // the operator's catheters are in the right groin, so the pump went into the left one
    expect(said(t, /Left leg below the large-bore sheath: the foot is pink and warm/)).toBe(true);
  });
});

describe('left main in cardiogenic shock: the team', () => {
  it('the tech\'s asks come in order, and each answer moves the procedure on', () => {
    const s = run(sc, 3, IDEAL[3]);
    const asks = s.fired.filter((id) => id.endsWith('-ask'));
    expect(asks).toEqual(['diag-ask', 'impella-ask', 'act-ask', 'guide-ask', 'ivus-ask', 'stent-ask', 'nc-ask']);
    expect(s.fired).toEqual(expect.arrayContaining(['md-access', 'md-angio', 'md-impella', 'md-guide', 'md-wire', 'md-stent', 'md-pot', 'md-final']));
  });

  it('a tech who hands the balloon pump, a right guide or OCT gets a word and loses points', () => {
    let s = run(sc, 3, [...upTo(IDEAL[3], 'act'), 'iabp']);
    expect(penalties(s)).toEqual(['wrong-impella']);
    expect(said(s, /Not the balloon pump/)).toBe(true);
    s = run(sc, 3, [...upTo(IDEAL[3], 'perfusion'), 'guide-jr4']);
    expect(penalties(s)).toEqual(['wrong-guide']);
    s = run(sc, 3, [...upTo(IDEAL[3], 'guide-ebu'), 'oct']);
    expect(penalties(s)).toEqual(['wrong-ivus']);
    expect(said(s, /Not OCT — the flush can't clear an ostial left main/)).toBe(true);
  });

  it('when the tech never primes the pump, the operator does it after 3 minutes and the item is missed', () => {
    const s = run(sc, 3, [...upTo(IDEAL[3], 'act'), ...R(2)]);
    expect(s.fired).toContain('impella-fallback');
    expect(has(s, 'impella')).toBe(true);
    expect(missed(s)).toContain('Prime the Impella console');
  });

  it('the tech and the nurse call out the dip with the balloon up; a learner who stays silent misses it', () => {
    for (const role of [3, 4] as const) {
      const silent = run(sc, role, IDEAL[role].filter((id) => id !== 'callout'));
      expect(has(silent, 'inflation-dip'), `role ${role}`).toBe(true);
      expect(missed(silent), `role ${role}`).toContain('Call out the pressure dip with the balloon up');
    }
  });

  it('when the nurse never starts the pressor, the operator does — and the pressure responds', () => {
    const s = run(sc, 4, ['iv', 'o2-nrb', 'consent', 'reassess']);
    expect(s.fired).toContain('pressor-fallback');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([90, 56]);
    expect(missed(s)).toContain('A vasopressor for the cardiogenic shock (norepinephrine)');
  });

  it('the nurse is asked to call the surgeon only once the run is read, and the surgeon answers', () => {
    const s = run(sc, 4, upTo(IDEAL[4], 'call-surgery'));
    expect(s.fired).toContain('surgery-got');
    expect(said(s, /I've seen the run/)).toBe(true);
  });

  it('the nurse who gives tablets when the IV P2Y12 inhibitor was ordered is corrected', () => {
    const s = run(sc, 4, [...upTo(IDEAL[4], 'act'), 'p2y12']);
    expect(penalties(s)).toEqual(['wrong-p2y12']);
    expect(said(s, /Not a tablet/)).toBe(true);
  });

  it('the nurse who reaches for a sedative when asked for something for the pain is corrected, once', () => {
    const s = run(sc, 4, [...upTo(IDEAL[4], 'cangrelor'), 'midazolam']);
    expect(penalties(s)).toEqual(['benzodiazepine-in-shock']);
    expect(said(s, /Not a sedative/)).toBe(true);
    expect(s.vitals.rr).toBeLessThan(23);
  });
});

describe('left main in cardiogenic shock: the traps', () => {
  it('fluid into wet lungs: one penalty, the operator\'s word, and the oxygen falls', () => {
    const s = run(sc, 4, ['iv', 'fluid']);
    expect(penalties(s)).toEqual(['fluid-in-shock']);
    expect(said(s, /his lungs are already full/)).toBe(true);
    expect(s.vitals.spo2).toBe(83);
  });

  it('raised legs, a unit of blood and phenylephrine each cost once, and none of them helps', () => {
    expect(penalties(run(sc, 4, ['legs-up']))).toEqual(['legs-up-pulmonary-edema']);
    expect(penalties(run(sc, 4, ['iv', 'transfuse']))).toEqual(['transfuse-no-bleeding']);
    const s = run(sc, 4, ['iv', 'phenylephrine']);
    expect(penalties(s)).toEqual(['phenylephrine-in-shock']);
    expect(said(s, /his hands are colder/)).toBe(true);
  });

  it('nitroglycerin and a beta-blocker in shock drop the pressure and cost points (once each)', () => {
    let s = run(sc, 5, ['nitro']);
    expect(penalties(s)).toEqual(['nitro-in-shock']);
    expect(s.vitals.sbp).toBe(64);
    s = run(sc, 5, ['ic-nitro']);
    expect(penalties(s)).toEqual(['ic-nitro-low-pressure']);
    s = run(sc, 5, ['metoprolol']);
    expect(penalties(s)).toEqual(['beta-blocker']);
    expect(s.penalties[0].severity).toBe('critical');
    expect(s.vitals.sbp).toBe(60);
  });

  it('a sedative in a shocked, hypoxic patient costs once, under the case\'s own rule', () => {
    expect(penalties(run(sc, 5, ['midazolam']))).toEqual(['benzodiazepine-in-shock']);
    // the generic "sedation / analgesia" order costs less than a named benzodiazepine
    const sed = run(sc, 5, ['sedation']);
    expect(penalties(sed)).toEqual(['sedation-in-shock']);
    expect(sed.penalties[0]).toMatchObject({ points: 3, severity: 'minor' });
  });

  it('going after the non-culprit RCA once the left main is open is harmful (CULPRIT-SHOCK), and costs once', () => {
    const s = run(sc, 5, [...upTo(MD, 'balloon-nc'), 'guide-jr4', 'wire-workhorse', 'stent-des']);
    expect(penalties(s)).toEqual(['non-culprit-pci']);
    expect(s.penalties[0].severity).toBe('critical');
    expect(has(s, 'rca-pci')).toBe(true);
  });

  it('a right guide before the left main is open costs a little and comes back out: the culprit stays within reach', () => {
    let s = run(sc, 5, [...MD_TO_PUMP, 'guide-jr4']);
    expect(penalties(s)).toEqual(['right-guide-for-lm']);
    expect(s.log.at(-1)!.text).toMatch(/The culprit is in the left main: it comes back out\.$/);
    // no guide is left in: the wire waits for the left guide
    const blocked = perform(sc, s, 'wire-workhorse');
    expect(blocked.counts['wire-workhorse']).toBeUndefined();
    // with the EBU already in, the EBU goes back in, and the left main can still be opened
    s = run(sc, 5, [...MD_TO_PUMP, 'cangrelor', 'guide-ebu', 'guide-jr4', 'wire-workhorse', 'ivus', 'stent-des']);
    expect(said(s, /and the EBU goes back in/)).toBe(true);
    expect(penalties(s)).toEqual(['right-guide-for-lm']);
    expect(has(s, 'pci') && !has(s, 'on-rca')).toBe(true);
  });

  it('the pump without heparin is a critical error', () => {
    expect(penalties(run(sc, 5, [...MD_TO_ANGIO, 'impella']))).toEqual(['pci-no-heparin']);
  });

  it('an oral P2Y12 load before the angiogram costs a little; after it, it is no mistake', () => {
    expect(penalties(run(sc, 5, ['p2y12']))).toEqual(['oral-p2y12-early']);
    expect(penalties(run(sc, 5, [...MD_TO_ANGIO, 'p2y12']))).toEqual([]);
  });

  it('aspiration at the ostium, an LV gram, protamine, a lytic and access before the time-out each cost points', () => {
    expect(penalties(run(sc, 5, [...MD_TO_WIRE, 'aspiration']))).toEqual(['aspiration-ostial-lm']);
    expect(penalties(run(sc, 5, [...MD_TO_ANGIO, 'lv-gram']))).toEqual(['lv-gram-in-shock']);
    const prot = run(sc, 4, [...upTo(IDEAL[4], 'ecg12'), 'protamine']);
    expect(penalties(prot)).toEqual(['protamine-in-pci']);
    expect(said(prot, /protamine reverses it/)).toBe(true);
    expect(penalties(run(sc, 5, ['tnk']))).toEqual(['lytic-in-lab']);
    expect(penalties(run(sc, 5, ['access-femoral']))).toEqual(['access-no-timeout']);
  });

  it('a cardiologist who stents without support, imaging or the surgeon told misses those items, not the stent', () => {
    let s = run(sc, 5, [...MD_TO_ANGIO, 'heparin', 'guide-ebu', 'wire-workhorse', 'stent-des']);
    s = perform(sc, s, 'defib');
    const m = missed(s);
    for (const label of ['Mechanical support before the left main is touched (Impella)', 'IVUS to size and check the left main stent', 'Call cardiac surgery — without waiting for them']) {
      expect(m).toContain(label);
    }
    expect(m).not.toContain('Stent the culprit left main');
    // one reading of the run is enough
    expect(s.reads.filter((r) => r.kind === 'angio')).toHaveLength(1);
    expect(answerRead(sc, s, 'angio-thrombus')).toBe(s);
  });
});

describe('left main in cardiogenic shock: review fixes', () => {
  const count = (s: SimState, re: RegExp) => s.log.filter((l) => re.test(l.text)).length;
  const blockedAtNoCost = (s: SimState, id: string, re: RegExp) => {
    const after = perform(sc, s, id);
    expect(after.minute, id).toBe(s.minute);
    expect(after.counts[id], id).toBe(s.counts[id]);
    expect(after.penalties, id).toEqual(s.penalties);
    expect(after.log.at(-1)!.text, id).toMatch(re);
  };

  it('the catheters never share the pump\'s sheath: femoral catheters put the pump in the left groin, radial ones leave it the right', () => {
    let s = run(sc, 5, MD_TO_PUMP);
    expect(said(s, /The left common femoral artery under ultrasound too, with two closure sutures/)).toBe(true);
    expect(said(s, /Impella CP from the left common femoral artery/)).toBe(true);
    s = perform(sc, s, 'perfusion');
    expect(s.log.at(-1)!.text).toMatch(/^Left leg below the large-bore sheath/);
    const radial = MD.filter((id) => id !== 'access-femoral');
    radial.splice(radial.indexOf('cath-jl4'), 0, 'access');
    radial.splice(radial.indexOf('call-surgery'), 0, 'access-femoral');
    s = run(sc, 5, radial);
    expect(said(s, /Right radial artery under ultrasound/)).toBe(true);
    expect(said(s, /The catheters stay in the wrist/)).toBe(true);
    expect(said(s, /Impella CP from the right common femoral artery/)).toBe(true);
    // the computer operator does the same for the tech and the nurse
    for (const role of [3, 4] as const) {
      const t = run(sc, role, IDEAL[role]);
      expect(said(t, /Impella CP from the left common femoral artery/), `role ${role}`).toBe(true);
      expect(said(t, /EBU guide through the right femoral sheath/), `role ${role}`).toBe(true);
    }
  });

  it('the sheath that carries the pump stays in: closure and hemostasis are refused with the reason, at no cost', () => {
    blockedAtNoCost(run(sc, 5, MD_TO_PUMP), 'closure-device', /Not while the pump runs/);
    blockedAtNoCost(run(sc, 4, upTo(IDEAL[4], 'perfusion')), 'hemostasis', /Not while the pump runs/);
    blockedAtNoCost(run(sc, 3, upTo(IDEAL[3], 'perfusion')), 'hemostasis', /Not while the pump runs/);
  });

  it('no guide before the pictures: refused, nothing wired, and the left main still unnamed', () => {
    const s = run(sc, 5, ['consent', 'o2-nrb', 'pressor', 'timeout', 'access-femoral']);
    for (const id of ['guide-ebu', 'guide-jr4', 'guide-al1']) blockedAtNoCost(s, id, /Take the diagnostic pictures first/);
    for (const id of ['wire-workhorse', 'wire-hydrophilic']) expect(perform(sc, s, id).counts[id]).toBeUndefined();
    for (const l of perform(sc, s, 'guide-jr4').log) expect(l.text).not.toMatch(/left main/i);
  });

  it('support before the pictures, the nurse\'s 12-lead after the time-out, a surgeon told early: all still full marks', () => {
    // the pump first, as in DanGer Shock, then the angiogram
    expectFullMarks(run(sc, 5, ['consent', 'o2-nrb', 'pressor', 'ecg12', 'timeout', 'access-femoral', 'heparin', 'act', 'echo', 'impella', 'cath-jl4', 'angio',
      'call-surgery', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des', 'balloon-nc', 'ivus', 'final-angio', 'ecg12-repeat', 'handoff']));
    // a nurse who assesses first: the line and the infusion by 3 minutes, the 12-lead after the time-out
    expectFullMarks(run(sc, 4, ['primary', 'iv', 'pressor', 'o2-nrb', 'consent', 'timeout', 'ecg12', ...IDEAL[4].slice(6)]));
    // the cardiologist calls the surgeon on the 12-lead alone; the surgeon calls back once the run is read, once
    const early = [...MD];
    early.splice(early.indexOf('call-surgery'), 1);
    early.splice(early.indexOf('ecg12'), 0, 'call-surgery');
    const s = run(sc, 5, early);
    expectFullMarks(s);
    expect(said(s, /wants to see the pictures/)).toBe(true);
    expect(count(s, /I've seen the run/)).toBe(1);
  });

  it('the nurse one step ahead (heparin, the surgeon, cangrelor before the orders) gets the credit, and nothing is given twice', () => {
    const steps = ['iv', 'pressor', 'o2-nrb', 'consent', 'timeout', 'heparin', 'call-surgery', 'ecg12', 'act', 'cangrelor', 'fentanyl', 'perfusion', ...R(3), 'callout',
      'ecg12-repeat', 'handoff'];
    const s = run(sc, 4, steps);
    expect(missed(s)).toEqual([]);
    expect(s.fired.filter((id) => id.endsWith('-fallback'))).toEqual([]);
    expect(count(s, /Heparin 8,000 units/)).toBe(1);
    expect(count(s, /Cangrelor 30 mcg\/kg bolus/)).toBe(1);
    expect(count(s, /I've seen the run/)).toBe(1);
  });

  it('a drug a teammate already gave is refused at no cost: the infusion, the heparin, cangrelor, the aspirin from the ED', () => {
    // the operator started the norepinephrine when the nurse never did
    const s = run(sc, 4, ['iv', 'o2-nrb', 'consent', 'reassess']);
    expect(s.fired).toContain('pressor-fallback');
    blockedAtNoCost(s, 'pressor', /already running/);
    blockedAtNoCost(run(sc, 5, []), 'aspirin', /324 mg in the emergency department/);
    // the operator gave the heparin and started the cangrelor when the nurse never did
    const t = run(sc, 4, [...upTo(IDEAL[4], 'ecg12'), ...R(2), 'call-surgery', 'act', ...R(2)]);
    expect(t.fired).toEqual(expect.arrayContaining(['heparin-fallback', 'p2y12-fallback']));
    blockedAtNoCost(t, 'heparin', /already in: check the ACT/);
    blockedAtNoCost(t, 'cangrelor', /already running/);
  });

  it('bivalirudin when heparin was ordered: the operator says so, nobody adds heparin on top, the item is missed', () => {
    const s = run(sc, 4, [...upTo(IDEAL[4], 'ecg12'), 'bivalirudin', ...R(3)]);
    expect(said(s, /Bivalirudin\? I asked for heparin/)).toBe(true);
    expect(count(s, /Heparin 8,000 units/)).toBe(0);
    expect(has(s, 'heparin')).toBe(false);
    expect(missed(s)).toContain('Heparin for the pump and the PCI');
    expect(penalties(s)).toEqual([]);
    // the case goes on: the ACT on bivalirudin, then the pump
    expect(said(s, /ACT 338 s, with bivalirudin running/)).toBe(true);
    expect(has(s, 'impella')).toBe(true);
  });

  it('push-dose epinephrine is a bridge: the infusion is what counts, and without it the shock comes back', () => {
    const rn = run(sc, 4, ['iv', 'push-epi', 'pressor', 'o2-nrb']);
    expect(said(rn, /buys us a few minutes. Now the norepinephrine infusion/)).toBe(true);
    expect(review(sc, stop(rn)).wentWell.map((w) => w.label)).toContain('A vasopressor for the cardiogenic shock (norepinephrine)');
    const md = run(sc, 5, ['consent', 'o2-nrb', 'push-epi', 'ecg12', 'timeout', 'access-femoral', 'reassess']);
    expect(md.fired).toContain('shock-worse');
    expect(md.vitals.sbp).toBe(68);
    expect(missed(md)).toContain('A vasopressor early (norepinephrine)');
  });

  it('his ejection fraction is about 25 %: diltiazem and procainamide are caught by the built-in rules', () => {
    expect(penalties(run(sc, 5, ['diltiazem']))).toEqual(['diltiazem-heart-failure']);
    // one dose, one penalty: in shock the low pressure outranks the failing heart
    expect(penalties(run(sc, 4, ['iv', 'procainamide']))).toEqual(['procainamide-hypotension']);
  });

  it('no FFR at the culprit (refused), and IV adenosine in shock costs and drops the pressure', () => {
    blockedAtNoCost(run(sc, 5, MD_TO_WIRE), 'ffr', /No FFR at an acute culprit/);
    const s = run(sc, 5, ['adenosine-iv-ffr']);
    expect(penalties(s)).toEqual(['adenosine-in-shock']);
    expect(s.vitals.sbp).toBeLessThan(78);
  });

  it('the radial cocktail with a systolic under 90 costs a little; on the pressor its verapamil still does (cardiogenic shock)', () => {
    expect(penalties(run(sc, 5, ['consent', 'timeout', 'access', 'radial-cocktail']))).toEqual(['cocktail-low-pressure']);
    expect(penalties(run(sc, 5, ['pressor', 'consent', 'timeout', 'access', 'radial-cocktail']))).toEqual(['verapamil-cardiogenic-shock']);
  });

  it('going without support costs the score, not just the patient: below Excellent even with a fast shock', () => {
    let s = run(sc, 5, [...MD_TO_ANGIO, 'call-surgery', 'heparin', 'act', 'echo', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des']);
    expect(s.rhythm.profile).toBe('vf');
    s = run(sc, 5, [...MD_TO_ANGIO, 'call-surgery', 'heparin', 'act', 'echo', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des', 'defib',
      'balloon-nc', 'ivus', 'final-angio', 'ecg12-repeat', 'handoff']);
    const r = review(sc, s);
    expect(penalties(s)).toEqual(['lm-unsupported']);
    expect(r.percent).toBeLessThan(90);
    expect(r.grade).not.toBe('Excellent');
    // a balloon pump is support, if far less: no penalty, the support item missed
    expect(penalties(run(sc, 5, MD.map((id) => (id === 'impella' ? 'iabp' : id))))).toEqual([]);
  });

  it('waiting until the shock runs into VF costs the score as well as the patient', () => {
    const s = run(sc, 5, [...MD_TO_PUMP, ...R(13), 'defib', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des', 'balloon-nc', 'ivus', 'final-angio',
      'ecg12-repeat', 'handoff']);
    expect(s.fired).toEqual(expect.arrayContaining(['delay-worse', 'delay-vf']));
    expect(penalties(s)).toEqual(['lm-delay']);
    expect(late(s)).toContain('Stent the culprit left main');
    expect(review(sc, s).grade).not.toBe('Excellent');
    // a thorough but slower cardiologist (a right heart run, extra checks) is only late, never penalized
    const slow = [...MD];
    slow.splice(slow.indexOf('impella'), 0, 'access-venous', 'rhc', 'lungs', 'perfusion', 'labs', 'reassess', 'reassess');
    const t = run(sc, 5, slow);
    expect(penalties(t)).toEqual([]);
    expect(t.fired).not.toContain('delay-vf');
  });

  it('the non-culprit penalty lands on the RCA wire: a right guide after the stent treats nothing and costs nothing', () => {
    const s = run(sc, 5, [...upTo(MD, 'balloon-nc'), 'guide-jr4']);
    expect(penalties(s)).toEqual([]);
    expect(penalties(perform(sc, s, 'wire-workhorse'))).toEqual(['non-culprit-pci']);
  });

  it('an ACT taken with the pump already in is too late for the item', () => {
    const steps = MD.filter((id) => id !== 'act');
    steps.splice(steps.indexOf('impella') + 1, 0, 'act');
    expect(missed(run(sc, 5, steps))).toEqual(['Check the ACT before the pump goes in']);
  });

  it('the right heart numbers fit the arterial line: the SVR follows the pressure he has', () => {
    // 78/50 (a mean of 59) before the pressor; 90/56 (a mean of 67) on it: SVR = 80 × (MAP − 14) / 3.0
    const before = run(sc, 5, ['consent', 'timeout', 'access-femoral', 'access-venous', 'rhc'], undefined, 'manual');
    expect(said(before, /PCWP 30 .* SVR 1,200 /)).toBe(true);
    const on = run(sc, 5, ['pressor', 'consent', 'timeout', 'access-femoral', 'access-venous', 'rhc'], undefined, 'manual');
    expect(said(on, /PCWP 30 .* SVR 1,410 /)).toBe(true);
    expect(on.pendingRead!.explain).not.toMatch(/high SVR/);
  });

  it('more nasal cannula is refused with his saturation now; once on the non-rebreather, stepping down is refused too', () => {
    blockedAtNoCost(run(sc, 5, ['consent', 'timeout', 'access-femoral', 'cath-jl4', 'reassess']), 'o2-nc', /SpO₂ of 80 %: more oxygen means the non-rebreather/);
    blockedAtNoCost(run(sc, 5, ['o2-nrb']), 'o2-nc', /stepping down to a nasal cannula waits/);
  });

  it('a tech who hands a Tiger for the femoral left coronary run is corrected and loses 2 points', () => {
    const s = run(sc, 3, [...upTo(IDEAL[3], 'timeout'), 'cath-tiger']);
    expect(penalties(s)).toEqual(['wrong-diag']);
    expect(said(s, /from the groin, the left coronary first: a JL4/)).toBe(true);
  });

  it('a nurse who gives heparin and runs an ACT before the pictures does not bring the pump in before them', () => {
    const s = run(sc, 4, ['iv', 'pressor', 'o2-nrb', 'heparin', 'act', 'consent', ...R(3)]);
    expect(has(s, 'impella')).toBe(false);
    expect(has(s, 'guide')).toBe(false);
    expect(s.fired).not.toContain('rn-act-ask');
    // once the run is in, the operator asks for the ACT and the pump follows
    const t = run(sc, 4, ['iv', 'pressor', 'o2-nrb', 'heparin', 'act', 'consent', 'timeout', 'ecg12', 'call-surgery', 'act']);
    expect(t.fired).toEqual(expect.arrayContaining(['heparin-got', 'rn-act-ask', 'rn-act-got', 'md-impella']));
    expect(t.flags.impella).toBeGreaterThan(t.flags.angio);
  });

  it('the tech may prime the pump before running the ACT: both on time', () => {
    const steps = [...IDEAL[3]];
    steps.splice(steps.indexOf('act'), 1);
    steps.splice(steps.indexOf('impella') + 1, 0, 'act');
    expectFullMarks(run(sc, 3, steps));
  });

  it('no hint names the culprit or gives away the 12-lead before it is read', () => {
    for (const role of ROLES) {
      let s = run(sc, role, []);
      for (const id of IDEAL[role]) {
        if (s.reads.some((r) => r.kind === 'angio')) break;
        const h = takeHint(sc, s).log.at(-1)!.text;
        if (!s.reads.some((r) => r.kind === 'ecg')) expect(h, `role ${role}`).not.toMatch(/aVR|ST depression/);
        expect(h, `role ${role}`).not.toMatch(/left main/i);
        s = perform(sc, s, id);
        while (s.pendingRead && s.pendingRead.kind !== 'angio') s = answerRead(sc, s, s.pendingRead.answer);
        if (s.pendingRead) break;
      }
    }
  });

  it('with the Impella in, the dip is the pump carrying him: no flow alarm', () => {
    const s = run(sc, 5, upTo(MD, 'stent-des'));
    expect(said(s, /the pump keeps up its flow of 3\.4 L\/min/)).toBe(true);
    expect(said(s, /flow alarm/)).toBe(false);
  });
});
