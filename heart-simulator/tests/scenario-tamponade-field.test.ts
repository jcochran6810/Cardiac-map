import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { answerFor } from '@/lib/sim/scenario/reads';
import { tamponadeField as sc } from '@/lib/sim/scenario/scenarios/tamponadeField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const last = (s: SimState) => s.log.at(-1)!.text;
const R = (n: number) => Array<string>(n).fill('reassess');
const toFix = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label));
const bp = (s: SimState) => [s.vitals.sbp, s.vitals.dbp];

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'vitals', 'als', 'perfusion', 'lungs', 'sample', 'o2-nc', 'ecg12', 'ecg-transmit', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'vitals', 'perfusion', 'lungs', 'sample', 'o2-nc', 'ecg12', 'transport-pci', 'iv', 'fluid', 'notify', 'reassess', 'reassess', 'nibp', 'push-epi',
    UNTIL_ARRIVED, 'handoff'],
};

/** The assessment both crews do first: by now they have the pressure, the neck veins, the heart sounds, the lungs and the cancer */
const ASSESSED = ['primary', 'vitals', 'perfusion', 'lungs', 'sample'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|tamponade|pericard|effusion|alternans|voltage|PEA/i;
const DIAGNOSIS = /tamponade|pericard|effusion|fluid around|alternans|low voltage|beck|paradox/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis|favour|titrat(ed|e) to a MAP of 65 mm\b/i;

describe('tamponade in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and conditions that exist', () => {
    expect(sc).toMatchObject({ id: 'tamponade-field', setting: 'field', roles: [1, 2], conditionId: 'cardiac-tamponade' });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('tamponade');
    // the paramedic reads "low voltage with electrical alternans" on its 12-lead
    expect(answerFor(sc.initial.rhythm.profile).id).toBe('low-voltage');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      // every rule can be broken by someone the case is written for
      expect(h.actions.some((id) => sc.roles.some((r) => interventionsFor(r, 'field').some((i) => i.id === id))), h.id).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // the tamponade is the only thing the built-in rules need to know beyond the tracing and the vitals
    expect(sc.problems).toEqual(['tamponade']);
  });

  it('each role has its own briefing and its own part', () => {
    expect(start(sc, 1).log.some((l) => /You are the BLS crew; a paramedic unit can meet you as an intercept/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
    expect(criticalsFor(sc, 1).map((c) => c.id)).toEqual(['vitals', 'beck', 'history', 'oxygen', 'als', 'ecg', 'transmit', 'destination', 'notify', 'handoff']);
    expect(criticalsFor(sc, 2).map((c) => c.id)).toEqual(['vitals', 'beck', 'history', 'oxygen', 'ecg', 'iv', 'fluid', 'destination', 'notify', 'pressor', 'handoff']);
  });

  it('nothing the learner sees before the assessment names the diagnosis', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(DIAGNOSIS);
    expect(opening).not.toMatch(/drain|neck vein|heart sound/i);
    // the story is there for whoever looks: the cancer, the breathlessness, sleeping sitting up, nearly fainting
    expect(opening).toMatch(/lung cancer/);
    expect(opening).toMatch(/slept in the recliner/);
    expect(opening).toMatch(/nearly passed out/);
  });

  it('no event line names the diagnosis, whatever state it fires in', () => {
    const states = [start(sc, 1), start(sc, 2), medic([...ASSESSED, 'ecg12', 'iv', 'nitro', 'cpap']), emt(['als', 'nitro-assist', ...R(3)])];
    for (const s of states) {
      for (const ev of sc.events) {
        for (const pulse of [true, false]) {
          const probe: SimState = { ...structuredClone(s), pulse, flags: { ...s.flags, als: 0, worse: 15, enroute: 9, arrived: 30, 'dest-pci': 9, 'dest-near': 9, nitro: 3, cpap: 4 } };
          for (const l of ev.effect(probe).say ?? []) expect(l[1], ev.id).not.toMatch(DIAGNOSIS);
        }
      }
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('tamponade in the field — the ideal runs', () => {
  for (const role of [1, 2] as const) {
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
      // the effusion kept building on the way, and the fluid and the pressor held him to the drain
      expect(s.fired).toContain('worse');
      for (const id of ['worse-dry', 'crash', 'arrest']) expect(s.fired, id).not.toContain(id);
      expect(s.vitals.sbp).toBeGreaterThanOrEqual(90);
      expect(s.fired).toContain('arrive-center');
      expect(said(s)).toMatch(/Your call ahead set it up/);
      expect(said(s)).toMatch(/the cardiologist drains 700 mL/);
    });
  }

  it('every rhythm a run reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: [1 | 2, string[]][] = [
      [1, IDEAL[1]], [2, IDEAL[2]],
      [2, [...ASSESSED, 'ecg12', 'iv', 'fluid', ...R(8), 'cpr', 'epinephrine', 'cpr']],
      [2, ['pads', 'iv', 'metoprolol', 'nitro', 'cpap', 'adenosine6', 'aed', 'cpr']],
      [1, ['monitor', 'nitro-assist', 'cpap', ...R(6), 'cpr', 'aed']],
    ];
    for (const [role, steps] of runs) {
      const s = runScenario(sc, role, steps, (x) => expect(resolveProfile(x.rhythm.profile).id, x.rhythm.profile).toBe(x.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('the paramedic reads the 12-lead as low voltage with electrical alternans, at no cost; another read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'low-voltage'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'low-voltage', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 128 with low voltage .*electrical alternans.*No ST elevation: it does not meet STEMI criteria\..*cardiac tamponade\.$/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    for (const read of ['pericarditis', 'right-strain']) {
      const wrong = medic(readAfter(IDEAL[2], 'ecg12', read), 'manual');
      expect(wrong.penalties, read).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
    }
    // the rhythm alone is at most half of the read (whether it earns partial credit is reads.ts's to say)
    expect(medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual').penalties).toEqual([expect.objectContaining({ id: 'misread-1' })]);
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it; the physician reads it and asks for the heart center', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/ECG received\. The physician: "No ST elevation — this is not a STEMI\. The complexes are small, and they alternate in height/);
    expect(said(s)).toMatch(/bring him to us: our cardiologists can drain it/);
  });

  it('the EMT\'s intercept meets the ambulance on the way with the fluid, and bridges the falling pressure with a vasopressor', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toEqual(expect.arrayContaining(['als-arrives', 'worse', 'als-pressor']));
    expect(said(s)).toMatch(/The medic unit meets you on the way; the paramedic climbs in: an IV, and a 500 mL saline bolus/);
    expect(said(s)).toMatch(/"His systolic is down to 80\." The paramedic gives push-dose epinephrine 20 mcg, then starts a norepinephrine drip\./);
    expect(s.vitals.sbp).toBe(92);
  });

  it('other right ways score full marks too: oxygen by mask, the IV and the bolus on scene, a call to medical control, an infusion', () => {
    const s = medic(['primary', 'vitals', 'perfusion', 'lungs', 'sample', 'o2-nrb', 'ecg12', 'iv', 'fluid', 'transport-pci', 'notify', 'med-control', 'reassess',
      'reassess', 'pressor', UNTIL_ARRIVED, 'handoff']);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
    // the daily aspirin he already takes and a second bolus cost nothing either
    const more = medic([...IDEAL[2].slice(0, 10), 'aspirin', 'fluid', ...IDEAL[2].slice(10)]);
    expect(more.penalties).toEqual([]);
    expect(review(sc, more).percent).toBe(100);
  });
});

describe('tamponade in the field — what the crew finds', () => {
  it('a manual cuff finds the pulsus paradoxus; the monitor\'s cuff gives only numbers', () => {
    const s = emt(['vitals']);
    expect(last(s)).toBe('BP 82/64 by hand — the sounds come and go with his breathing: first heard at 82, but only while he breathes out; with every beat only from 68 down — a 14 mmHg fall each time he breathes in · pulse 128, weak · RR 26 · SpO₂ 90%');
    expect(last(medic(['monitor', 'nibp']))).toBe('NIBP 82/64 mmHg.');
  });

  it('Beck\'s triad and dry lungs: distended neck veins, a pulse that fades on breathing in, faint heart sounds, no crackles', () => {
    const s = emt(['perfusion', 'lungs']);
    expect(said(s)).toMatch(/neck veins are distended up to the angle of the jaw, even sitting upright/);
    expect(said(s)).toMatch(/fades each time he breathes in/);
    expect(said(s)).toMatch(/the lungs are dry: no crackles/);
    expect(said(s)).toMatch(/trachea is midline/);
    expect(said(s)).toMatch(/the heart sounds are faint and distant/);
    const r = review(sc, stop(s));
    expect(r.wentWell.map((w) => w.label)).toContain('Look for the cause of the low pressure: neck veins, heart sounds and lungs');
  });

  it('the Hs and Ts point to the pericardium against what was found', () => {
    expect(last(medic([...ASSESSED, 'hs-ts']))).toMatch(/Tension pneumothorax: air moves on both sides.*Pulmonary embolism: possible with cancer.*Tamponade fits best/);
  });

  it('medical control backs each crew\'s plan once it hears what they found', () => {
    expect(last(medic([...ASSESSED, 'med-control']))).toMatch(/A 500 mL bolus, and reassess; no nitroglycerin, no CPAP, no opioids\. If his systolic falls under 90 after the fluid, push-dose epinephrine/);
    expect(last(emt(['als', ...ASSESSED, 'med-control']))).toMatch(/Don't wait on scene for your intercept/);
    // an EMT who has not asked for the intercept is told to
    expect(last(emt([...ASSESSED, 'med-control']))).toMatch(/Request a paramedic intercept now and let it meet you on the way/);
  });

  // regression: these answered with the diagnosis (and with findings nobody had gathered) before any assessment
  it('nobody on the phone or in the Hs and Ts names the cause before the crew has checked his neck veins', () => {
    const asked = [medic(['med-control']), medic(['hs-ts']), emt(['med-control']), emt(['ecg12', 'ecg-transmit']), medic(['ecg12', 'ecg-transmit'])];
    for (const s of asked) {
      expect(last(s)).not.toMatch(/fluid around (his|the) heart|tamponade fits|until proven otherwise|air moves on both sides/i);
    }
    // they ask for the findings instead
    expect(last(medic(['med-control']))).toMatch(/tell me more: his neck veins, his heart sounds and his lungs/);
    expect(last(emt(['med-control']))).toMatch(/Request a paramedic intercept now/);
    expect(last(medic(['hs-ts']))).toMatch(/his neck veins, his heart sounds, both lungs and the trachea, and his pulse as he breathes in are what tell them apart/);
    expect(last(emt(['ecg12', 'ecg-transmit']))).toMatch(/look at his neck veins, listen to his heart, and call me back/);
    // once the neck veins have been seen, the physician reading the transmitted 12-lead puts it together
    expect(last(emt(['perfusion', 'ecg12', 'ecg-transmit']))).toMatch(/fluid around his heart until proven otherwise/);
  });

  it('the call ahead tells the hospital what to have ready only once the neck veins have been checked', () => {
    const bare = medic(['transport-pci', 'notify', UNTIL_ARRIVED]);
    expect(said(bare)).toMatch(/Copy: short of breath, blood pressure 82\/64\. We'll see him in the emergency department\./);
    expect(said(bare)).toMatch(/He goes to a regular bay/);
    expect(review(sc, stop(bare)).toFix.some((t) => t.label === 'Look for the cause of the low pressure: neck veins, heart sounds and lungs')).toBe(true);
    const found = medic(['perfusion', 'transport-pci', 'notify']);
    expect(found.flags['notified-findings']).toBeDefined();
    expect(last(found)).toMatch(/the cath lab is setting up to drain his pericardium/);
  });
});

describe('tamponade in the field — what each treatment does', () => {
  it('the first bolus raises the pressure, the second a little, a third not at all — and none is penalized', () => {
    let s = medic(['iv', 'fluid']);
    expect(bp(s)).toEqual([92, 68]);
    expect(s.rhythm).toEqual({ profile: 'tamponade', hr: 124 });
    s = perform(sc, s, 'fluid');
    expect(bp(s)).toEqual([98, 71]);
    s = perform(sc, s, 'fluid');
    expect(bp(s)).toEqual([98, 71]);
    expect(said(s)).toMatch(/His neck veins are even fuller — and his pressure hasn't moved\./);
    expect(s.penalties).toEqual([]);
  });

  it('the effusion keeps building: the pressure slides at minute 15 wherever he is; push-dose epinephrine or an infusion bridges it', () => {
    let s = medic(['iv', 'fluid', 'transport-pci', ...R(6)]);
    expect(s.fired).toContain('worse');
    expect(bp(s)).toEqual([80, 62]);
    const pushed = perform(sc, s, 'push-epi');
    expect(bp(pushed)).toEqual([92, 68]);
    const infused = perform(sc, s, 'pressor');
    expect(bp(infused)).toEqual([94, 70]);
    s = pushed;
    expect(review(sc, stop(s)).toFix.some((t) => /When the pressure falls again/.test(t.label))).toBe(false);
  });

  it('an infusion already running when he slides counts for the slide; a push-dose that has worn off does not', () => {
    const infusion = medic(['iv', 'fluid', 'pressor', 'transport-pci', ...R(6)]);
    expect(infusion.fired).toContain('worse');
    expect(toFix(stop(infusion), /When the pressure falls again/)).toBeUndefined();
    const push = medic(['iv', 'fluid', 'push-epi', 'transport-pci', ...R(6)]);
    expect(push.fired).toContain('worse');
    expect(toFix(stop(push), /When the pressure falls again/)?.kind).toBe('missed');
  });

  it('holding the fluid: the pressure slides twice, and with nothing to hold it up he arrests on the way', () => {
    const steps = [...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'hs-ts', 'med-control', 'transport-pci', 'notify'];
    const s = medic([...steps, ...R(5)]);
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'worse-dry', 'arrest']));
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea-narrow');
    // an infusion alone keeps him alive, but the fluid he needed is still missing
    const pressorOnly = medic([...steps, 'reassess', 'pressor', UNTIL_ARRIVED, 'handoff']);
    expect(pressorOnly.fired).toContain('worse-dry');
    expect(pressorOnly.pulse).toBe(true);
    expect(toFix(pressorOnly, /A fluid bolus/)?.kind).toBe('missed');
    // one push with no fluid behind it wears off just before the second slide: he arrests on the way
    const onePush = medic([...steps, 'reassess', 'push-epi', ...R(4)]);
    expect(onePush.fired).toEqual(expect.arrayContaining(['push-wears-off-1', 'worse-dry', 'arrest']));
    expect(onePush.pulse).toBe(false);
  });

  // regression: each push used to add to the pressure for good, so five pushes and an infusion reached 150/90
  it('push-dose epinephrine holds the pressure for a few minutes: pushes in a row do not stack, and no vasopressor drives him to a normal pressure', () => {
    const one = medic(['iv', 'push-epi']);
    expect(bp(one)).toEqual([94, 70]);
    expect(last(one)).toMatch(/That buys a few minutes — it wears off\./);
    const four = medic(['iv', 'push-epi', 'push-epi', 'push-epi', 'push-epi']);
    expect(bp(four)).toEqual([94, 70]);
    const everything = medic(['iv', 'fluid', 'fluid', 'fluid', 'push-epi', 'push-epi', 'pressor', 'epi-im']);
    expect(everything.vitals.sbp).toBeLessThanOrEqual(108);
    expect(everything.vitals.dbp).toBeLessThanOrEqual(78);
  });

  it('a push wears off after 6 minutes unless an infusion takes over; a push after the slide brings him back to where the last one held him', () => {
    const worn = medic(['iv', 'push-epi', ...R(3)]);
    expect(worn.fired).toContain('push-wears-off-1');
    expect(bp(worn)).toEqual([82, 64]);
    expect(said(worn)).toMatch(/The push-dose epinephrine has worn off/);
    const held = medic(['iv', 'push-epi', 'pressor', ...R(3)]);
    expect(held.fired.some((id) => id.startsWith('push-wears-off'))).toBe(false);
    expect(held.vitals.sbp).toBeGreaterThan(94);
    // pushed at 11, slid at 15 under it, worn off at 17 (the slide shows), pushed again: 92/68, as after one push from 80/62
    const ideal = medic([...ASSESSED, 'o2-nc', 'ecg12', 'transport-pci', 'iv', 'push-epi', 'fluid', 'notify', 'reassess', 'reassess', 'push-epi', UNTIL_ARRIVED, 'handoff']);
    expect(ideal.fired).toEqual(expect.arrayContaining(['worse', 'push-wears-off-1']));
    expect(bp(ideal)).toEqual([92, 68]);
    expect(review(sc, ideal).percent).toBe(100);
  });

  it('a long scene time: he crashes at 20 and arrests in PEA at 24; CPR and epinephrine cannot fill his heart, and he dies', () => {
    let s = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(8)]);
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'crash', 'arrest']));
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'pea-narrow', hr: 104 });
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Monitor alarm.')).toBe(true);
    for (let i = 0; i < 12 && !s.ended; i++) s = perform(sc, s, i === 1 || i === 4 ? 'epinephrine' : 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('in the arrest: loading him without medical direction costs points; on medical control\'s order it does not, and the nearest department counts', () => {
    const arrested = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(8)]);
    expect(arrested.pulse).toBe(false);
    const loaded = perform(sc, arrested, 'transport-near');
    expect(penalties(loaded)).toEqual(['transport-in-arrest']);
    const ordered = perform(sc, perform(sc, arrested, 'med-control'), 'transport-near');
    expect(last(perform(sc, arrested, 'med-control'))).toMatch(/load him with continuous compressions/);
    expect(penalties(ordered)).toEqual([]);
    expect(toFix(stop(ordered), /Transport, with a short scene, to the hospital that can drain it/)?.kind).toBe('late');
  });

  // regression: the heart center counted for the destination even when he was loaded in the arrest with no order
  it('in the arrest only the move medical control orders counts for the destination', () => {
    const arrested = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(8)]);
    const center = perform(sc, arrested, 'transport-pci');
    expect(penalties(center)).toEqual(['transport-in-arrest']);
    expect(toFix(stop(center), /Transport, with a short scene/)?.kind).toBe('missed');
    // with the order, the nearest department it names counts (late); the heart center it did not name does not
    const ordered = perform(sc, arrested, 'med-control');
    expect(toFix(stop(perform(sc, ordered, 'transport-pci')), /Transport, with a short scene/)?.kind).toBe('missed');
    expect(penalties(perform(sc, ordered, 'transport-pci'))).toEqual([]);
    // the nearest department is ready for what medical control sent him there for
    let moved = perform(sc, ordered, 'transport-near');
    while (!moved.flags.arrived && !moved.ended) moved = perform(sc, moved, 'cpr');
    expect(moved.flags.arrived).toBeDefined();
    expect(said(moved)).toMatch(/The emergency physician is waiting with the ultrasound and a long needle/);
    expect(said(moved)).not.toMatch(/likely mean a transfer/);
  });

  // regression: medical control named the cause and ordered the move even when nobody had looked at his neck veins
  it('medical control orders the move in the arrest only on what the crew found before it', () => {
    const blind = medic(['primary', 'iv', 'nitro', ...R(6), 'cpr', 'med-control']);
    expect(blind.pulse).toBe(false);
    expect(blind.flags['transport-ordered']).toBeUndefined();
    expect(last(blind)).toMatch(/Work the arrest where you are/);
    expect(last(blind)).not.toMatch(/fluid around his heart/);
    expect(penalties(perform(sc, blind, 'transport-near'))).toContain('transport-in-arrest');
    expect(last(perform(sc, blind, 'hs-ts'))).toMatch(/nobody checked his neck veins or his heart sounds while he had a pulse/);
    expect(last(perform(sc, blind, 'notify'))).toBe('Copy: cardiac arrest in a man with lung cancer. The resuscitation bay is ready for you.');
  });

  // regression: an EMT who checked the neck veins and lungs only after the arrest ("No pulse.") earned the 10 points
  it('the neck veins and the heart sounds count only while he has a pulse', () => {
    const late = emt(['primary', 'nitro-assist', 'cpap', 'perfusion', 'lungs']);
    expect(late.pulse).toBe(false);
    expect(toFix(stop(late), /Look for the cause of the low pressure/)?.kind).toBe('missed');
  });

  // regression: the paramedic who had already joined the EMT crew did nothing once he arrested
  it('the EMT\'s intercept, already there when he arrests, runs the arrest drugs', () => {
    const s = emt([...ASSESSED, 'als', 'o2-nc', 'ecg12', 'ecg-transmit', ...R(9)]);
    expect(s.pulse).toBe(false);
    expect(s.fired).toContain('als-arrest-drugs');
    expect(said(s)).toMatch(/The paramedic runs the drugs: epinephrine 1 mg IV, every 3–5 minutes/);
    expect(s.flags.epi).toBeDefined();
    expect(last(perform(sc, s, 'med-control'))).toMatch(/Keep up the compressions and the epinephrine/);
  });

  it('the Hs and Ts in the arrest say only a drain fixes it', () => {
    const arrested = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(8), 'hs-ts']);
    expect(last(arrested)).toMatch(/only a drain fixes it, and that is in hospital/);
  });
});

describe('tamponade in the field — the traps', () => {
  it('nitroglycerin crashes his pressure and is one major error, whatever the pressure', () => {
    const s = medic(['iv', 'nitro']);
    expect(bp(s)).toEqual([68, 56]);
    expect(penalties(s)).toEqual(['nitro-tamponade']);
    // after a bolus his systolic is over 90: still wrong, still one penalty
    const after = medic(['iv', 'fluid', 'nitro']);
    expect(penalties(after)).toEqual(['nitro-tamponade']);
    expect(penalties(medic(['iv', 'nitro-high']))).toEqual(['nitro-tamponade']);
  });

  it('the EMT who helps him take his own nitroglycerin is penalized the same way', () => {
    const s = emt(['primary', 'nitro-assist']);
    expect(penalties(s)).toEqual(['nitro-tamponade']);
    expect(bp(s)).toEqual([68, 56]);
    expect(said(s)).toMatch(/He puts one of his own nitroglycerin tablets under his tongue/);
  });

  it('nitroglycerin, and then the slide the effusion brings, stop his heart; a bolus in between holds him', () => {
    const s = medic(['primary', 'iv', 'nitro', ...R(7)]);
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'arrest']));
    expect(s.pulse).toBe(false);
    const rescued = medic(['primary', 'iv', 'nitro', 'fluid', ...R(6)]);
    expect(rescued.fired).toContain('worse');
    expect(rescued.pulse).toBe(true);
  });

  it('CPAP squeezes the blood out of his chest: a major error for either crew; in an arrest it is refused', () => {
    for (const s of [emt(['primary', 'cpap']), medic(['primary', 'cpap'])]) {
      expect(penalties(s)).toEqual(['cpap-tamponade']);
      expect(bp(s)).toEqual([72, 58]);
    }
    const arrested = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(8)]);
    const tried = perform(sc, arrested, 'cpap');
    expect(tried.minute).toBe(arrested.minute);
    expect(tried.penalties).toEqual(arrested.penalties);
  });

  it('bagging a man who breathes on his own costs points and pressure; bagging him in the arrest is right', () => {
    const s = emt(['primary', 'bvm']);
    expect(penalties(s)).toEqual(['bvm-breathing']);
    expect(bp(s)).toEqual([76, 60]);
    const arrested = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(8), 'cpr', 'bvm']);
    expect(penalties(arrested)).toEqual([]);
  });

  it('a beta-blocker or diltiazem takes away the rate his output depends on: a critical error', () => {
    for (const drug of ['metoprolol', 'diltiazem']) {
      const s = medic(['iv', drug]);
      expect(s.penalties, drug).toEqual([expect.objectContaining({ id: 'rate-slowing-tamponade', severity: 'critical', points: 15 })]);
      expect(s.rhythm, drug).toEqual({ profile: 'tamponade', hr: 110 });
      expect(bp(s), drug).toEqual([64, 54]);
      expect(review(sc, stop(s)).grade).toBe('Unsafe');
    }
  });

  it('antiarrhythmics and adenosine for a sinus tachycardia: one penalty each, in this case\'s words', () => {
    expect(penalties(medic(['iv', 'amio-infusion']))).toEqual(['antiarrhythmic-tamponade']);
    expect(penalties(medic(['iv', 'procainamide']))).toEqual(['antiarrhythmic-tamponade']);
    expect(penalties(medic(['iv', 'adenosine6']))).toEqual(['adenosine-sinus']);
  });

  it('an opioid or a sedative drops the pressure he is holding up: one penalty, in this case\'s words', () => {
    for (const drug of ['fentanyl', 'midazolam', 'sedation']) {
      const s = medic(['iv', drug]);
      expect(penalties(s), drug).toEqual(['sedative-tamponade']);
      expect(bp(s), drug).toEqual([74, 60]);
    }
  });

  it('laying him flat with the legs up: he cannot breathe lying down — no gain, a minor error', () => {
    const s = emt(['monitor', 'legs-up']);
    expect(penalties(s)).toEqual(['legs-up-orthopnea']);
    expect(bp(s)).toEqual([82, 64]);
    expect(s.vitals.spo2).toBe(87);
  });

  it('a vagal maneuver and IM epinephrine are minor errors', () => {
    expect(penalties(emt(['vagal']))).toEqual(['vagal-tamponade']);
    expect(penalties(emt(['epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
  });

  it('the nearest emergency department while he still perfuses: the destination is missed; once he is crashing it counts', () => {
    const s = medic([...ASSESSED, 'o2-nc', 'ecg12', 'transport-near', 'iv', 'fluid', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(toFix(s, /Transport, with a short scene, to the hospital that can drain it/)?.kind).toBe('missed');
    expect(said(s)).toMatch(/We have no cardiologist here/);
    expect(said(s)).toMatch(/she calls the heart center for a transfer/);
    const crashing = medic([...ASSESSED, 'o2-nc', 'ecg12', 'iv', 'fluid', ...R(6), 'transport-near']);
    expect(crashing.fired).toContain('crash');
    expect(crashing.pulse).toBe(true);
    expect(toFix(stop(crashing), /Transport, with a short scene, to the hospital that can drain it/)?.kind).toBe('late');
  });

  it('a STEMI alert for a tracing with no ST elevation is declined and costs the built-in minor penalty', () => {
    const s = medic(['ecg12', 'stemi-alert']);
    expect(penalties(s)).toEqual(['stemi-alert-no-ste']);
    expect(last(s)).toMatch(/The STEMI alert is not activated/);
  });

  it('the built-in rules still catch a shock, an AED or an airway he does not need', () => {
    expect(penalties(medic(['pads', 'cardiovert']))).toEqual(['cardiovert-no-tachycardia']);
    expect(penalties(medic(['airway']))).toEqual(['airway-awake']);
    const aed = emt(['primary', 'aed']);
    expect(aed.minute).toBe(1);
    expect(aed.penalties).toEqual([]);
  });

  it('harmful care is never rewarded: the traps satisfy no critical item', () => {
    // nitroglycerin and CPAP take his last reserve: he arrests, and loading him then, with no order, earns no destination
    const s = medic(['iv', 'nitro', 'cpap', 'metoprolol', 'fentanyl', 'legs-up', 'transport-near']);
    expect(s.fired).toContain('arrest');
    expect(review(sc, stop(s)).wentWell.map((w) => w.label)).toEqual(['IV access']);
    // (the metoprolol and the fentanyl come after the arrest: a drug for a tachycardia with a pulse, and a drug with no role
    // in it)
    expect(penalties(s)).toEqual(['nitro-tamponade', 'cpap-tamponade', 'rate-drug-in-arrest', 'no-role-in-arrest', 'transport-in-arrest']);
  });

  // regression: the review said "a blood pressure by hand" for the monitor's cuff, and the nitroglycerin text said his
  // systolic was under 90 when the rule had fired after a bolus had brought it over 90; the slide said his wrist pulse
  // was barely there with an infusion holding 94/70
  it('the review and the story say what happened', () => {
    const nibp = medic(['monitor', 'nibp']);
    expect(review(sc, stop(nibp)).wentWell.map((w) => w.label)).toContain('Vital signs, with a blood pressure');
    const after = medic(['iv', 'fluid', 'nitro']);
    expect(penalties(after)).toEqual(['nitro-tamponade']);
    expect(after.penalties[0].text).not.toMatch(/under 90/);
    const held = medic(['iv', 'fluid', 'pressor', ...R(7)]);
    expect(held.fired).toContain('worse');
    expect(held.vitals.sbp).toBeGreaterThanOrEqual(90);
    expect(said(held)).toMatch(/his pulse is weaker than it was/);
    expect(said(held)).not.toMatch(/barely there/);
  });

  it('teaches the 2015 ESC contraindications, the fluid evidence and the drain', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/diuretics \(both contraindicated in tamponade: 2015 ESC\)/);
    expect(text).toMatch(/Sagristà-Sauleda, Circulation 2008/);
    expect(text).toMatch(/Beck's triad/);
    expect(text).toMatch(/pulsus paradoxus/);
    expect(text).toMatch(/electrical alternans/);
    expect(text).toMatch(/echo-guided pericardiocentesis/);
  });
});

describe('the push-dose bridge and the crash', () => {
  it('a push before the crash never brings the arrest closer than no push at all', () => {
    const base = [...ASSESSED, 'iv', 'fluid'];
    const firstArrest = (steps: string[]) => {
      let s = medic(steps);
      for (let i = 0; i < 12 && s.pulse && !s.ended; i++) s = perform(sc, s, 'reassess');
      return s.flags.arrested;
    };
    const untreated = firstArrest([...base, ...R(5)]);
    expect(untreated).toBeDefined();
    const pushed = firstArrest([...base, ...R(5), 'push-epi']);
    expect(pushed).toBeGreaterThanOrEqual(untreated);
  });
});
