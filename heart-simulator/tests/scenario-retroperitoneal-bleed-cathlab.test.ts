import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { CATH_IMAGES } from '@/data/cathImages';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_OPTION_BY_ID } from '@/lib/sim/scenario/reads';
import { cathlabRpBleed as sc } from '@/lib/sim/scenario/scenarios/cathlabRpBleed';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.filter((p) => !p.id.startsWith('misread-')).map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const bp = (s: SimState) => [s.vitals.sbp, s.vitals.dbp];

/** A correct run for every role the case is written for */
const IDEAL: Record<3 | 4 | 5, string[]> = {
  // the tech: the ACT, a look, vascular surgery paged, the room readied (transducer, pads), a 12-lead while she is moved; on the
  // table the drop called out, both groins prepped, the time-out; the leak called out, the covered stent handed, the new groin held
  3: ['act', 'perfusion', 'call-vascular', 'transducer', 'pads', 'ecg12', 'callout', 'prep', 'timeout', 'reassess', 'callout', ...R(4), 'stent-covered', 'hemostasis'],
  // the nurse: a look, the call, saline, labs with a crossmatch, a second big line, blood, the ACT; on the table the drop called
  // out, the time-out, protamine and a second unit as ordered, a 12-lead; the new groin held, the hand-off
  4: ['perfusion', 'callout', 'fluid', 'labs', 'iv', 'transfuse', 'act', 'callout', 'timeout', 'protamine', 'transfuse', 'ecg12', ...R(4), 'hemostasis', 'handoff'],
  // the cardiologist: a look, saline, labs, blood, back to the lab (consent); the ACT and protamine, vascular surgery and a
  // 12-lead while she is moved; on the table the time-out, in from the left groin, a balloon over the hole, more blood and an
  // echo while it is up, then the covered stent, the final run and the hand-off
  5: ['perfusion', 'fluid', 'labs', 'transfuse', 'consent', 'act', 'protamine', 'call-vascular', 'ecg12', 'timeout', 'access-femoral', 'balloon-tamponade',
    'transfuse', 'echo', 'stent-covered', 'final-angio', 'handoff'],
};
const ROLES = [3, 4, 5] as const;
const MD = IDEAL[5];
/** The cardiologist until she is on the table (the 12-lead read given) */
const MD_TO_TABLE = MD.slice(0, MD.indexOf('timeout'));
/** The cardiologist until the hole is found */
const MD_TO_LEAK = MD.slice(0, MD.indexOf('access-femoral') + 1);
/** The cardiologist with the balloon up */
const MD_TO_BALLOON = MD.slice(0, MD.indexOf('balloon-tamponade') + 1);

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;
/** Words that name what is happening before the learner has read it */
const NAMES_IT = /retroperit|bleed|hemorrhag|hematoma|blood loss/i;

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

/** Reassess until the bleeding has taken her into cardiac arrest (or 30 tries) */
function untilArrest(s: SimState): SimState {
  for (let i = 0; i < 30 && s.pulse && !s.ended; i++) s = perform(sc, s, 'reassess');
  return s;
}

describe('retroperitoneal bleed in the cath lab: the case itself', () => {
  it('is a cath lab case for the tech, the nurse and the cardiologist, and refers only to things that exist', () => {
    expect(sc.id).toBe('retroperitoneal-bleed-cathlab');
    expect(sc.setting).toBe('cathlab');
    expect(sc.roles).toEqual([3, 4, 5]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(sc.problems).toEqual(['bleeding', 'heparin-on-board']);
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const id of ['clin-rp-bleed', 'clin-hematoma', 'clin-vasovagal', 'angio-perforation', 'sinus-tach']) expect(READ_OPTION_BY_ID[id], id).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
      expect(sc.briefing[role], `briefing ${role}`).toBeDefined();
      for (const c of criticalsFor(sc, role)) {
        const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
        for (const id of ids) expect(INTERVENTION_BY_ID[id], `${c.id}: ${id}`).toBeDefined();
        // at least one way to satisfy each critical item is in the learner's scope
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // every harm a role can commit is in that role's scope
      for (const h of sc.harms.filter((x) => !x.roles || x.roles.includes(role))) {
        if (h.roles) expect(h.actions.some((id) => scope.has(id)), `role ${role}: ${h.id}`).toBe(true);
      }
    }
  });

  it('shows a real angiogram of a high femoral puncture leaking from the external iliac artery', () => {
    expect(sc.images).toEqual({ iliac: 'high-puncture-iliac-extravasation' });
    const img = CATH_IMAGES['high-puncture-iliac-extravasation']!;
    expect(img.caption).toMatch(/external iliac/);
    // the alt text names the kind of image, never the finding the learner reads
    expect(img.alt).not.toMatch(/leak|extravasation|bleed/i);
  });

  it('the title and summary do not give the diagnosis away', () => {
    expect(`${sc.title} ${sc.summary}`).not.toMatch(NAMES_IT);
    for (const lines of Object.values(sc.briefing)) for (const [, text] of lines!) expect(text).not.toMatch(NAMES_IT);
  });

  it('uses US spelling everywhere a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of ROLES) for (const l of run(sc, role, IDEAL[role]).log) expect(l.text, `role ${role}`).not.toMatch(BRITISH);
  });
});

describe('retroperitoneal bleed in the cath lab: ideal runs end by themselves with full marks', () => {
  for (const role of ROLES) {
    it(`role ${role}`, () => {
      const s = run(sc, role, IDEAL[role]);
      expectFullMarks(s);
      expect(s.flags.sealed).toBeDefined();
      expect(s.flags.stable).toBeDefined();
      expect(bp(s)).toEqual([106, 64]);
      expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 96 });
      expect(s.reads.map((r) => r.answer)).toEqual(expect.arrayContaining(['clin-rp-bleed', 'angio-perforation', 'sinus-tach']));
      expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
      expect(s.fired.some((id) => /arrest/.test(id))).toBe(false);
      expect(s.fired).not.toContain('team-timeout');
    });
  }

  it('every rhythm reached is a real ECG profile, and no monitor line names the rhythm or the diagnosis', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role], (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
    }
  });

  it('nothing in the room names what is happening before the learner reads it', () => {
    const first: Record<3 | 4 | 5, string[]> = { 3: ['act'], 4: ['perfusion'], 5: ['perfusion'] };
    for (const role of ROLES) {
      const s = run(sc, role, first[role], undefined, 'manual');
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'clinical', answer: 'clin-rp-bleed', partial: ['clin-hematoma'] });
      for (const l of s.log) expect(l.text, `role ${role}: ${l.text}`).not.toMatch(NAMES_IT);
    }
    // a learner who looks at nothing gets the read at 2 minutes, with what the patient and the nurse say
    const idle = run(sc, 5, ['call-help', 'nibp', 'vitals', 'nibp'], undefined, 'manual');
    expect(idle.pendingRead).toMatchObject({ answer: 'clin-rp-bleed' });
    expect(idle.log.some((l) => l.who === 'patient' && /low down on the right/.test(l.text))).toBe(true);
    expect(idle.log.some((l) => /groin's dry and soft/.test(l.text))).toBe(true);
  });

  it('a covered stent straight away, without the balloon first, is correct care too: full marks', () => {
    const s = run(sc, 5, [...MD_TO_LEAK, 'stent-covered', 'transfuse', 'echo', 'final-angio', 'handoff']);
    expect(s.fired).not.toContain('deflation-run');
    expectFullMarks(s);
  });

  it('the history, the neurological check, the lungs, oxygen, the legs raised, a closure device and a CT once sealed cost nothing', () => {
    const extra = ['opqrst', 'sample', 'neuro', 'lungs', 'o2-nc', 'legs-up'];
    const s = run(sc, 5, [MD[0], ...extra, ...MD.slice(1, -1), 'closure-device', 'ct-urgent', 'handoff']);
    expect(penalties(s)).toEqual([]);
    const text = s.log.map((l) => l.text).join('\n');
    expect(text).toMatch(/front of my right thigh feels numb/);
    expect(text).toMatch(/the femoral nerve/);
    expect(text).toMatch(/no contrast outside the vessels now/);
  });
});

describe('retroperitoneal bleed in the cath lab: recognizing it', () => {
  it('calling it vasovagal is a misread, and the feedback says what it is', () => {
    let s = run(sc, 5, ['perfusion'], undefined, 'manual');
    s = answerRead(sc, s, 'clin-vasovagal');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'clin-rp-bleed', verdict: 'wrong' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 5 });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Retroperitoneal bleed\..*vasovagal reaction slows the heart, and hers is fast/);
  });

  it('an access-site hematoma is partly right: the right source, the wrong place', () => {
    let s = run(sc, 4, ['perfusion'], undefined, 'manual');
    s = answerRead(sc, s, 'clin-hematoma');
    expect(s.reads.at(-1)).toMatchObject({ verdict: 'partial' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 2 });
  });

  it('the groin is quiet; the back, the thigh, the neck veins and the hemoglobin tell the story', () => {
    const s = run(sc, 5, ['perfusion', 'opqrst', 'labs']);
    const text = s.log.map((l) => l.text).join('\n');
    expect(text).toMatch(/Right groin: the dressing dry, the site soft and flat — no swelling, no bruit/);
    expect(text).toMatch(/neck veins flat/);
    expect(text).toMatch(/lower back — the right side/);
    expect(text).toMatch(/hemoglobin reads 8\.1 g\/dL — it was 12\.6 this morning/);
  });

  it('the 12-lead and the echo point away from the heart: no new ST change, no effusion, an empty ventricle', () => {
    const s = run(sc, 5, ['ecg12', 'echo']);
    expect(s.reads.find((r) => r.kind === 'ecg')).toMatchObject({ answer: 'sinus-tach', verdict: 'correct' });
    expect(s.log.some((l) => /nothing points to the stent/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /no pericardial effusion.*an empty heart, not a failing one/.test(l.text))).toBe(true);
  });

  it('the run from the other groin is a real image to read: contrast leaving the external iliac', () => {
    const s = perform(sc, run(sc, 5, [...MD_TO_TABLE, 'timeout']), 'access-femoral');
    expect(s.images.at(-1)).toMatchObject({ id: 'iliac', image: 'high-puncture-iliac-extravasation' });
    expect(s.pendingRead).toMatchObject({ kind: 'angio', answer: 'angio-perforation', run: s.images.length });
    expect(s.flags.contralateral).toBeDefined();
    // the words of the run stay off the story: the learner reads the image
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'Cine recorded: The right iliac and femoral arteries, through the crossover sheath.' });
    const read = answerRead(sc, s, 'angio-dissection');
    expect(read.reads.at(-1)).toMatchObject({ verdict: 'wrong' });
  });
});


describe('retroperitoneal bleed in the cath lab: what works', () => {
  it('left alone she keeps bleeding: the pressure falls every 5 minutes, the heart races, she gets drowsy, then arrests', () => {
    let s = run(sc, 5, ['perfusion']);
    const seen: number[][] = [];
    for (let i = 0; i < 12 && s.pulse; i++) {
      s = perform(sc, s, 'reassess');
      seen.push([s.vitals.sbp, s.rhythm.hr, s.vitals.gcs]);
    }
    expect(seen.slice(0, 7)).toEqual([[84, 118, 15], [74, 124, 14], [74, 124, 14], [74, 124, 14], [64, 130, 12], [64, 130, 12], [64, 130, 12]]);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    expect(s.minute).toBe(16.5);
    for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    // no CPR and no volume: she dies 10 minutes later, and the story says no CPR was given
    for (let i = 0; i < 8 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended).toMatchObject({ reason: 'death', minute: 26.5 });
    expect(s.log.at(-1)!.text).toMatch(/^You gave no CPR in this arrest/);
  });

  it('in the arrest, volume brings her back only with compressions going — and she is still bleeding', () => {
    const arrested = untilArrest(run(sc, 5, ['perfusion']));
    const noCpr = perform(sc, arrested, 'transfuse');
    expect(noCpr.pulse).toBe(false);
    expect(noCpr.log.at(-1)!.text).toMatch(/goes nowhere until compressions move it/);
    const back = perform(sc, perform(sc, arrested, 'cpr'), 'transfuse');
    expect(back.pulse).toBe(true);
    expect(back.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 134 });
    expect(bp(back)).toEqual([72, 40]);
    expect(penalties(back)).toEqual([]);
    // the hole is still open: the pressure goes on falling until it is closed, and she arrests again
    const again = untilArrest(back);
    expect(again.fired).toContain('re-arrest');
    // saline during the compressions works too
    expect(perform(sc, perform(sc, arrested, 'cpr'), 'fluid').pulse).toBe(true);
  });

  it('saline lifts the pressure twice, then less; blood lifts it more — never past what a bleeding circulation holds', () => {
    const f = run(sc, 5, ['perfusion', 'fluid', 'fluid', 'fluid']);
    expect(f.log.filter((l) => l.who === 'monitor').map((l) => l.text)).toEqual(['BP 92/55. Heart rate 114.', 'BP 100/60. Heart rate 110.', 'BP 104/62. Heart rate 106.']);
    const b = run(sc, 5, ['perfusion', 'transfuse', 'transfuse', 'transfuse']);
    expect(b.log.filter((l) => l.who === 'monitor').map((l) => l.text)).toEqual([
      'BP 96/58. Heart rate 114.', 'BP 108/66. Heart rate 110.', 'BP 98/60. Heart rate 116.', 'BP 108/66. Heart rate 112.',
    ]);
    // the third unit within the hour: the massive transfusion protocol, plasma with the red cells
    expect(b.log.some((l) => l.who === 'hospital' && /a third unit within the hour, so the massive transfusion protocol is activated/.test(l.text))).toBe(true);
    expect(penalties(b)).toEqual([]);
  });

  it('the units are counted whoever hangs them', () => {
    const s = run(sc, 4, ['perfusion', 'callout', 'fluid', 'labs', ...R(3), 'transfuse']);
    // the operator hung unit 1 when the nurse did not start the blood in time; the nurse's is unit 2
    expect(s.fired).toContain('rn-blood-fallback');
    expect(s.log.some((l) => /^Unit 2 of emergency-release packed red cells, checked at the bedside/.test(l.text))).toBe(true);
  });

  it('the ACT shows heparin still on board; protamine reverses it and slows the bleeding', () => {
    const first = run(sc, 5, ['act']);
    expect(first.log.at(-1)!.text).toBe('ACT 164 s — it was 118 before the case: some heparin is still on board.');
    const s = run(sc, 5, ['act', 'protamine', 'act']);
    expect(s.log.some((l) => /Protamine 20 mg IV, slowly over 10 minutes/.test(l.text))).toBe(true);
    expect(s.log.filter((l) => /^ACT /.test(l.text)).at(-1)!.text).toBe('ACT 124 s — back to her baseline (118 before the case).');
    expect(penalties(s)).toEqual([]);
    // reversed, the next fall is 8 instead of 10
    const reversed = perform(sc, run(sc, 5, ['act', 'protamine']), 'reassess');
    expect(bp(reversed)).toEqual([76, 45]);
  });

  it('consent sends her to the lab: on the table 3 minutes later, prepped by the team — and the move drops her pressure', () => {
    let s = run(sc, 5, ['perfusion', 'consent']);
    expect(s.flags['to-lab']).toBe(1.5);
    expect(s.flags['on-table']).toBeUndefined();
    s = run(sc, 5, ['perfusion', 'consent', 'reassess', 'reassess']);
    expect(s.flags['on-table']).toBe(5.5);
    expect(s.flags.prep).toBeDefined();
    expect(s.flags.transducer).toBeDefined();
    expect(s.flags.pads).toBeDefined();
    expect(s.log.some((l) => /Tech: "Doctor — she dropped to 76 moving over!"/.test(l.text))).toBe(true);
  });

  it('nothing is done from the recovery bay that belongs on the table, and the hole is reached from the left groin, not the wrist', () => {
    const bay = run(sc, 5, ['perfusion']);
    for (const id of ['access-femoral', 'timeout', 'balloon-tamponade', 'stent-covered', 'final-angio', 'access']) {
      const t = perform(sc, bay, id);
      expect(t.counts[id], id).toBeUndefined();
      expect(t.log.at(-1)!.who, id).toBe('system');
    }
    expect(perform(sc, bay, 'access-femoral').log.at(-1)!.text).toMatch(/confirm her consent/);
    expect(perform(sc, bay, 'access').log.at(-1)!.text).toMatch(/Not from the wrist/);
    // a coronary balloon or stent does not fit the iliac
    const table = run(sc, 5, [...MD_TO_LEAK]);
    for (const id of ['stent-des', 'balloon-predil', 'balloon-nc']) expect(perform(sc, table, id).counts[id], id).toBeUndefined();
  });

  it('the balloon stops the bleeding at once; 5 minutes later the run still leaks; the covered stent seals it and she comes back up', () => {
    let s = run(sc, 5, MD_TO_BALLOON);
    expect(s.flags['bleeding-stopped']).toBeDefined();
    const before = bp(s);
    s = perform(sc, perform(sc, s, 'reassess'), 'reassess');
    // no more falls while the balloon is up
    expect(bp(s)).toEqual(before);
    expect(s.fired.filter((id) => id.startsWith('drop-'))).toEqual(['drop-1', 'drop-2']);
    expect(s.flags['leak-persists']).toBeUndefined();
    s = perform(sc, s, 'reassess');
    expect(s.flags['leak-persists']).toBeDefined();
    expect(s.log.some((l) => /Balloon down after 5 minutes: the next run still shows contrast leaking/.test(l.text))).toBe(true);
    // the final run waits for the seal
    expect(perform(sc, s, 'final-angio').counts['final-angio']).toBeUndefined();
    s = perform(sc, s, 'stent-covered');
    expect(s.flags.sealed).toBeDefined();
    expect(s.flags.stable).toBeDefined();
    expect(bp(s)).toEqual([106, 64]);
    expect(s.log.some((l) => /Covered stent, 8 × 50 mm, across the hole in the right external iliac/.test(l.text))).toBe(true);
  });

  it('sealed on saline alone she stays pale and fast — and the blood item is missed', () => {
    const s = run(sc, 5, MD.filter((id) => id !== 'transfuse'));
    expect(s.ended?.reason).toBe('complete');
    expect(bp(s)).toEqual([94, 56]);
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 108 });
    expect(missed(s)).toEqual(['Blood early']);
  });

  it('pressing on the groin before the hole is sealed changes nothing; afterwards the new groin is held and both feet checked', () => {
    const early = run(sc, 4, ['perfusion', 'hemostasis']);
    expect(early.log.at(-1)).toMatchObject({ tone: 'warn' });
    expect(early.log.at(-1)!.text).toMatch(/no bone to press against\. Nothing changes/);
    expect(early.flags.hemostasis).toBeUndefined();
    expect(penalties(early)).toEqual([]);
  });

  it('vascular surgery comes to stand by, and agrees once the hole is sealed from the inside', () => {
    const md = run(sc, 5, MD);
    expect(md.log.some((l) => l.who === 'hospital' && /The vascular surgeon arrives and scrubs in/.test(l.text))).toBe(true);
    const late = run(sc, 5, [...MD.filter((id) => id !== 'call-vascular').slice(0, -1), 'call-vascular', ...R(5)]);
    expect(late.log.some((l) => /looks at the final run and agrees: sealed from the inside/.test(l.text))).toBe(true);
  });
});

describe('retroperitoneal bleed in the cath lab: the traps', () => {
  it('more heparin is a critical error: the ACT climbs and the bleeding speeds up', () => {
    let s = run(sc, 5, ['perfusion', 'heparin']);
    expect(penalties(s)).toEqual(['more-antithrombotic']);
    expect(s.penalties[0]).toMatchObject({ points: 12, severity: 'critical' });
    s = perform(sc, perform(sc, s, 'reassess'), 'reassess');
    // the first fall is 16 instead of 10
    expect(bp(s)).toEqual([68, 40]);
    expect(perform(sc, s, 'act').log.at(-1)!.text).toBe('ACT 296 s.');
    // bivalirudin, eptifibatide and cangrelor are the same mistake
    for (const id of ['bivalirudin', 'gp2b3a', 'cangrelor']) expect(penalties(run(sc, 5, ['perfusion', id])), id).toEqual(['more-antithrombotic']);
    expect(penalties(run(sc, 5, ['perfusion', 'tnk']))).toEqual(['lytic-in-bleeding']);
  });

  it('a drip started in the bleed has no antidote: it must be stopped, and the item applies only once one runs', () => {
    expect(criticalsFor(sc, 5).some((c) => c.id === 'stop-drip')).toBe(true);
    const left = run(sc, 5, ['perfusion', 'bivalirudin']);
    expect(missed(left)).toContain('Stop the bivalirudin, GP IIb/IIIa or cangrelor drip started in the bleed');
    const stopped = run(sc, 5, ['perfusion', 'bivalirudin', 'stop-antithrombotics']);
    expect(stopped.log.at(-1)!.text).toMatch(/^Stopped: .*bivalirudin — off at the pump/);
    expect(missed(stopped)).not.toContain('Stop the bivalirudin, GP IIb/IIIa or cangrelor drip started in the bleed');
    // with none started the item never applies (the ideal run stays complete)
    expect(missed(run(sc, 5, ['perfusion']))).not.toContain('Stop the bivalirudin, GP IIb/IIIa or cangrelor drip started in the bleed');
  });

  it('calling it vasovagal and giving only atropine: one penalty, a faster heart, nothing for the bleeding — and she arrests', () => {
    let s = run(sc, 5, ['perfusion', 'atropine']);
    expect(penalties(s)).toEqual(['atropine-vasovagal']);
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 128 });
    expect(bp(s)).toEqual([84, 50]);
    s = untilArrest(s);
    expect(s.pulse).toBe(false);
    expect(missed(s)).toEqual(expect.arrayContaining(['Blood early', 'Back to the lab now (confirm her consent) — not to the scanner', 'Volume now: saline or blood']));
    // the nurse who reaches for it is held to the same rule
    expect(penalties(run(sc, 4, ['perfusion', 'atropine']))).toEqual(['atropine-vasovagal']);
  });

  it('sending her to the scanner while she is still bleeding: one penalty, ten minutes lost and a lower pressure', () => {
    const s = run(sc, 5, ['perfusion', 'fluid', 'transfuse', 'ct-urgent']);
    // the case's rule replaces the built-in one even with a systolic over 90: she holds it only while volume goes in
    expect(penalties(s)).toEqual(['ct-before-control']);
    expect(s.minute).toBe(13.5);
    expect(bp(s)).toEqual([78, 47]);
    expect(s.log.some((l) => /her pressure fell to 88\/53 on the scanner table/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /contrast pooling beside the right external iliac artery — it is still bleeding/.test(l.text))).toBe(true);
    // with a systolic under 90 it is still one penalty, not two
    expect(penalties(run(sc, 5, ['perfusion', 'reassess', 'ct-urgent']))).toEqual(['ct-before-control']);
    // with the balloon up she cannot go at all; once sealed the CT costs nothing
    const balloon = perform(sc, run(sc, 5, MD_TO_BALLOON), 'ct-urgent');
    expect(balloon.counts['ct-urgent']).toBeUndefined();
    expect(penalties(perform(sc, run(sc, 5, MD.slice(0, -1)), 'ct-urgent'))).toEqual([]);
  });

  it('no blood: the nurse who never starts it misses the item, and the operator hangs it', () => {
    const s = run(sc, 4, IDEAL[4].map((id) => (id === 'transfuse' ? 'reassess' : id)));
    expect(s.fired).toEqual(expect.arrayContaining(['rn-blood-fallback', 'rn-blood2-fallback']));
    expect(missed(s)).toEqual(expect.arrayContaining(['Blood started at once', 'Second unit of blood on the table']));
  });

  it('a vasopressor before any volume costs points; as a bridge after volume it does not', () => {
    for (const id of ['pressor', 'push-epi', 'phenylephrine']) expect(penalties(run(sc, 5, ['perfusion', id])), id).toEqual(['pressor-before-volume']);
    expect(penalties(run(sc, 5, ['perfusion', 'fluid', 'pressor']))).toEqual([]);
    expect(penalties(run(sc, 5, ['perfusion', 'transfuse', 'phenylephrine']))).toEqual([]);
  });

  it('a third saline bolus with no blood yet costs points; with blood going it does not', () => {
    expect(penalties(run(sc, 5, ['perfusion', 'fluid', 'fluid', 'fluid']))).toEqual(['saline-instead-of-blood']);
    expect(penalties(run(sc, 5, ['perfusion', 'fluid', 'fluid', 'transfuse', 'fluid']))).toEqual([]);
  });

  it('slowing the heart, nitroglycerin, sedation or another antiplatelet dose are mistakes in a bleeding patient', () => {
    expect(penalties(run(sc, 5, ['perfusion', 'metoprolol']))).toEqual(['rate-control-in-bleeding']);
    expect(penalties(run(sc, 5, ['perfusion', 'diltiazem']))).toEqual(['rate-control-in-bleeding']);
    expect(penalties(run(sc, 5, ['perfusion', 'nitro']))).toEqual(['nitro-hypotension']);
    // one penalty for sedation, not the built-in midazolam rule as well
    expect(penalties(run(sc, 5, ['perfusion', 'midazolam']))).toEqual(['sedation-in-shock']);
    expect(penalties(run(sc, 4, ['perfusion', 'sedation']))).toEqual(['sedation-in-shock']);
    expect(penalties(run(sc, 5, ['perfusion', 'p2y12']))).toEqual(['extra-antiplatelet']);
  });

  it('a needle in the pericardium or a pump finds nothing to fix: the cardiologist pays, the tech who opens the tray does not', () => {
    const tap = run(sc, 5, ['perfusion', 'pericardiocentesis']);
    expect(penalties(tap)).toEqual(['pericardiocentesis-no-effusion']);
    expect(tap.log.some((l) => /a dry tap/.test(l.text))).toBe(true);
    expect(penalties(run(sc, 3, ['act', 'pericardiocentesis']))).toEqual([]);
    for (const pump of ['impella', 'iabp']) {
      const s = run(sc, 5, ['perfusion', pump]);
      expect(penalties(s), pump).toEqual(['pump-in-bleeding']);
      // an empty ventricle: the pump lifts nothing, and the bleeding goes on pulling the pressure down while it goes in
      expect(s.vitals.sbp, pump).toBeLessThan(84);
      expect(s.log.some((l) => /the pressure (does not|barely) move/i.test(l.text)), pump).toBe(true);
    }
    expect(penalties(run(sc, 3, ['act', 'impella']))).toEqual([]);
  });

  it('a cardiac surgeon is the wrong call for the iliac artery: no penalty, but no vascular surgeon either', () => {
    const s = run(sc, 5, ['perfusion', 'call-surgery']);
    expect(penalties(s)).toEqual([]);
    expect(s.log.at(-1)!.text).toMatch(/you want vascular surgery/);
    expect(s.flags['vascular-called']).toBeUndefined();
  });
});

describe('retroperitoneal bleed in the cath lab: the tech and the nurse', () => {
  const TECH = IDEAL[3];
  const RN = IDEAL[4];

  it('the tech hands the covered stent the operator asks for; a coronary device gets a word and costs points', () => {
    const upTo = TECH.slice(0, TECH.indexOf('stent-covered'));
    for (const id of ['stent-des', 'balloon-nc', 'balloon-predil']) {
      const s = run(sc, 3, [...upTo, id]);
      expect(penalties(s), id).toEqual(['wrong-covered']);
      expect(s.log.some((l) => l.who === 'operator' && /a coronary device neither fits the iliac nor seals a hole/.test(l.text)), id).toBe(true);
    }
  });

  it('a tech who calls out neither the drop nor the leak loses those points', () => {
    const s = run(sc, 3, TECH.filter((id) => id !== 'callout'));
    expect(missed(s)).toEqual(expect.arrayContaining(['Call out the pressure drop when she moves to the table', 'Call out the contrast leaving the vessel']));
  });

  it('when the tech never acts, the operator and the nurse do it all, and she is sealed and stable', () => {
    const s = run(sc, 3, R(15));
    expect(s.fired).toEqual(expect.arrayContaining(['act-fallback', 'vascular-fallback', 'team-timeout', 'covered-fallback', 'md-covered', 'md-final', 'stable']));
    expect(s.fired.some((id) => /arrest/.test(id))).toBe(false);
    expect(s.pulse).toBe(true);
    expect(bp(s)).toEqual([106, 64]);
  });

  it('the nurse who does not call: the cardiologist finds her at 4 minutes, and the call is missed', () => {
    const s = run(sc, 4, RN.filter((id, i) => !(id === 'callout' && i === 1)));
    expect(s.log.some((l) => l.who === 'operator' && l.text === 'Why didn\'t anyone call me?')).toBe(true);
    expect(s.flags['md-here']).toBe(4);
    expect(missed(s)).toContain('Call the cardiologist at once (SBAR, closed loop)');
  });

  it('the nurse who gives heparin when protamine was ordered gets a word and one penalty, not two', () => {
    const s = run(sc, 4, [...RN.slice(0, RN.indexOf('protamine')), 'heparin']);
    expect(s.log.some((l) => l.who === 'operator' && /that is more anticoagulant! Protamine, to reverse the heparin/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['more-antithrombotic']);
  });

  it('when the nurse only watches, the cardiologist gives the blood and the protamine and seals it', () => {
    const s = run(sc, 4, R(15));
    expect(s.fired).toEqual(expect.arrayContaining(['md-arrives', 'rn-blood-fallback', 'rn-act-fallback', 'rn-protamine-fallback', 'team-timeout', 'md-covered', 'stable']));
    expect(s.pulse).toBe(true);
    expect(missed(s)).toEqual(expect.arrayContaining(['Look at the groin — and beyond it', 'Open the fluids', 'A second large-bore IV']));
  });

  it('the tech and the nurse read the picture and the run too', () => {
    for (const role of [3, 4] as LearningLevel[]) {
      const s = run(sc, role, IDEAL[role as 3 | 4]);
      expect(s.reads.map((r) => r.answer), `role ${role}`).toEqual(expect.arrayContaining(['clin-rp-bleed', 'angio-perforation']));
    }
  });
});

describe('retroperitoneal bleed in the cath lab: review fixes', () => {
  const RN = IDEAL[4];
  const TECH = IDEAL[3];

  it('blood first, with no saline at all, is volume too: the cardiologist still gets full marks', () => {
    const s = run(sc, 5, MD.filter((id) => id !== 'fluid'));
    expectFullMarks(s);
    expect(s.counts.fluid).toBeUndefined();
  });

  it('protamine after a fresh heparin bolus: the dose for the bolus (50 mg, the most for one dose), and the ACT and the bleeding come back down', () => {
    const s = run(sc, 5, ['perfusion', 'heparin', 'act', 'protamine', 'act']);
    expect(s.log.some((l) => /^Protamine 50 mg IV, slowly over 10 minutes — the most for one dose/.test(l.text))).toBe(true);
    expect(s.log.filter((l) => /^ACT /.test(l.text)).map((l) => l.text)).toEqual(['ACT 296 s.', 'ACT 124 s — back to her baseline (118 before the case).']);
    // reversed: the first fall (at minute 4) is the slower one (8), not the anticoagulated one (16)
    expect(s.fired).toContain('drop-1');
    expect(s.vitals.sbp).toBe(84 - 8);
  });

  it('protamine does not reverse bivalirudin, a GP IIb/IIIa inhibitor, cangrelor or a fibrinolytic: the ACT stays up and the bleeding stays fast', () => {
    const biv = run(sc, 5, ['perfusion', 'bivalirudin', 'act', 'protamine', 'act']);
    expect(biv.log.some((l) => /The bivalirudin is still running — protamine does not reverse it/.test(l.text))).toBe(true);
    expect(biv.log.filter((l) => /^ACT /.test(l.text)).map((l) => l.text)).toEqual(['ACT 338 s.', 'ACT 338 s.']);
    for (const id of ['bivalirudin', 'gp2b3a', 'cangrelor', 'tnk']) {
      const s = run(sc, 5, ['perfusion', id, 'act', 'protamine']);
      const sbp = s.vitals.sbp;
      // the first fall comes at minute 4 and is the fast one (16)
      const after = perform(sc, s, 'reassess');
      expect(sbp - after.vitals.sbp, id).toBe(16);
    }
  });

  it('a second dose of protamine once the heparin is reversed does not go in', () => {
    // the nurse ran the ACT before the cardiologist came, and was busy when the order came: the operator gave it
    const late = run(sc, 4, ['act', 'perfusion', 'callout', 'fluid', 'labs', 'iv', 'transfuse']);
    expect(late.fired).toContain('rn-protamine-fallback');
    const again = perform(sc, late, 'protamine');
    expect(again.counts.protamine).toBeUndefined();
    expect(again.log.at(-1)).toMatchObject({ who: 'system' });
    expect(again.log.at(-1)!.text).toMatch(/already in and the heparin reversed/);
  });

  it('the cardiologist orders protamine only once at the bedside, even when the nurse ran the ACT before the call', () => {
    const s = run(sc, 4, ['act', 'perfusion', 'callout']);
    expect(s.flags['act-known']).toBeDefined();
    expect(s.flags['md-here']).toBeUndefined();
    expect(s.fired).not.toContain('rn-protamine-ask');
    expect(s.log.some((l) => /Protamine, 20 milligrams/.test(l.text))).toBe(false);
    const there = run(sc, 4, ['act', 'perfusion', 'callout', 'fluid', 'labs']);
    const ask = there.log.findIndex((l) => /One sixty-four: there is still heparin on board/.test(l.text));
    const here = there.log.findIndex((l) => l.text === 'Here. Show me.');
    expect(here).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(here);
  });

  it('after a heparin bolus from the nurse, the order is for the bolus: 50 mg, and the ACT again', () => {
    const s = run(sc, 4, ['perfusion', 'callout', 'heparin', 'fluid', 'labs', 'transfuse', 'act', 'protamine', 'act']);
    expect(s.fired).toContain('rn-protamine-high-ask');
    expect(s.fired).not.toContain('rn-protamine-ask');
    expect(s.log.some((l) => l.who === 'operator' && /^Two ninety-six/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /^Protamine 50 mg IV/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['more-antithrombotic']);
    expect(review(sc, stop(s)).toFix.filter((t) => t.label === 'Protamine, slowly, as ordered' && t.kind !== 'late')).toEqual([]);
  });

  it('a nurse who has already hung the second unit is not asked for it again, and loses nothing for it', () => {
    const s = run(sc, 4, ['perfusion', 'callout', 'fluid', 'labs', 'transfuse', 'iv', 'transfuse', 'act', 'callout', 'timeout', 'protamine', 'ecg12', ...R(5)]);
    expect(s.flags['unit-2']).toBeLessThanOrEqual(s.flags['on-table']);
    expect(s.fired).not.toContain('rn-blood2-ask');
    expect(s.log.some((l) => /^Second unit, please/.test(l.text))).toBe(false);
    expect(s.flags.sealed).toBeDefined();
    const r = review(sc, stop(s));
    expect(r.toFix.map((t) => t.label)).not.toContain('Second unit of blood on the table');
    expect(r.wentWell.map((t) => t.label)).not.toContain('Second unit of blood on the table');
  });

  it('no consent from a patient in cardiac arrest; a drowsy one goes on emergency (implied) consent and says nothing', () => {
    const arrested = untilArrest(run(sc, 5, ['perfusion']));
    const blocked = perform(sc, arrested, 'consent');
    expect(blocked.counts.consent).toBeUndefined();
    expect(blocked.flags['to-lab']).toBeUndefined();
    expect(blocked.log.at(-1)!.text).toMatch(/^Not in the middle of a cardiac arrest/);
    // compressions and blood bring her back drowsy (GCS 8): the team takes her on implied consent
    const back = perform(sc, perform(sc, arrested, 'cpr'), 'transfuse');
    expect(back.vitals.gcs).toBe(8);
    const s = perform(sc, back, 'consent');
    expect(s.flags['to-lab']).toBeDefined();
    const said = s.log.slice(back.log.length);
    expect(said.some((l) => l.who === 'patient')).toBe(false);
    expect(said.some((l) => /emergency \(implied\) consent/.test(l.text))).toBe(true);
  });

  it('volume wakes her up again as her pressure comes back (but not after an arrest, until the bleeding is stopped)', () => {
    let s = run(sc, 5, ['perfusion']);
    for (let i = 0; i < 5; i++) s = perform(sc, s, 'reassess');
    expect(s.vitals.sbp).toBe(64);
    expect(s.vitals.gcs).toBe(12);
    s = perform(sc, perform(sc, s, 'transfuse'), 'transfuse');
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(85);
    expect(s.vitals.gcs).toBe(15);
  });

  it('the tech cannot open the covered stent before the run has shown a hole to size it to', () => {
    const before = run(sc, 3, TECH.slice(0, TECH.indexOf('timeout') + 1));
    expect(before.flags['leak-seen']).toBeUndefined();
    const t = perform(sc, before, 'stent-covered');
    expect(t.counts['stent-covered']).toBeUndefined();
    expect(t.log.at(-1)!.text).toMatch(/^Nothing to size it to yet: the run comes first/);
    // once the leak is on the screen, opening it ahead of the request counts
    const s = run(sc, 3, [...TECH.slice(0, TECH.indexOf('timeout') + 1), 'reassess', 'callout', 'stent-covered', ...R(4), 'hemostasis']);
    expectFullMarks(s);
  });

  it('the cardiologist\'s time-out after the needle is already in does not count', () => {
    const s = run(sc, 5, [...MD_TO_TABLE, 'access-femoral', 'timeout', 'balloon-tamponade', 'transfuse', 'echo', 'stent-covered', 'final-angio', 'handoff']);
    expect(missed(s)).toEqual(['Time-out on the table before the new access']);
  });

  it('the vascular surgeon who arrives after the seal but before the final run asks to see it, and does not claim to have seen it', () => {
    const s = run(sc, 5, [...MD_TO_LEAK.filter((id) => id !== 'call-vascular'), 'stent-covered', 'call-vascular', 'echo', 'transfuse', ...R(3)]);
    expect(s.flags['final-angio']).toBeUndefined();
    expect(s.log.some((l) => /The vascular surgeon arrives as the covered stent goes in: "Good\. Show me the final run/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /looks at the final run/.test(l.text))).toBe(false);
    // the nurse who pages them after the cardiologist already has: they are already coming
    const twice = run(sc, 4, [...RN.slice(0, RN.indexOf('timeout')), 'call-vascular']);
    expect(twice.log.some((l) => l.who === 'operator' && /I've paged vascular surgery myself/.test(l.text))).toBe(true);
    expect(twice.log.at(-1)!.text).toBe('Vascular surgery: "Already on our way."');
  });

  it('a balloon left up and never followed by a covered stent: the nurse warns about the leg', () => {
    let s = run(sc, 5, MD_TO_BALLOON);
    for (let i = 0; i < 6; i++) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('balloon-too-long');
    expect(s.log.some((l) => /her right foot is cold and white with the balloon up/.test(l.text))).toBe(true);
    expect(missed(s)).toContain('Seal the hole with a covered stent');
  });

  it('the new groin is held long enough for a 7 Fr sheath, and nothing claims an ACT nobody measured', () => {
    for (const role of [3, 4] as const) {
      const s = run(sc, role, IDEAL[role]);
      const held = s.log.find((l) => /^Left groin: the 7 Fr crossover sheath out/.test(l.text));
      expect(held?.text, `role ${role}`).toMatch(/\(the heparin reversed\), firm pressure for 20 minutes/);
      expect(held?.text, `role ${role}`).not.toMatch(/ACT/);
    }
    const closed = run(sc, 5, [...MD.slice(0, -1), 'closure-device']);
    expect(closed.log.at(-1)!.text).not.toMatch(/ACT/);
  });

  it('sedation for a drowsy patient is the case\'s one sedation penalty even once the pressure is back over 90', () => {
    const arrested = untilArrest(run(sc, 5, ['perfusion']));
    let s = perform(sc, perform(sc, arrested, 'cpr'), 'transfuse');
    s = perform(sc, perform(sc, s, 'transfuse'), 'transfuse');
    // the next fall comes 5 minutes after the pulse is back, not 5 after the unit was started
    expect(s.fired.filter((id) => id.startsWith('drop-')).length).toBe(3);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(90);
    expect(s.vitals.gcs).toBeLessThanOrEqual(12);
    expect(penalties(perform(sc, s, 'midazolam'))).toEqual(['sedation-in-shock']);
  });

  it('the nurse\'s pressor line comes from the tech, not from "the nurse" she is playing', () => {
    const s = run(sc, 4, ['perfusion', 'callout', 'fluid', 'pressor']);
    expect(s.log.some((l) => /^Tech: "It's holding her pressure for now/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /^Nurse: "It's holding/.test(l.text))).toBe(false);
  });
});
