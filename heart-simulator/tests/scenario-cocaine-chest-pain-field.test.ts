import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { cocaineField as sc } from '@/lib/sim/scenario/scenarios/cocaineField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const R = (n: number) => Array<string>(n).fill('reassess');
const status = (s: SimState) => sc.status!(s);
const missed = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'als', 'vitals', 'opqrst', 'sample', 'aspirin', 'perfusion', 'ecg12', 'ecg-transmit', 'glucose', 'transport-pci', 'notify',
    'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'vitals', 'perfusion', 'sample', 'midazolam', 'monitor', 'ecg12', 'opqrst', 'aspirin', 'ask-pde5', 'iv', 'nitro', 'glucose',
    'transport-pci', 'notify', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
};

/** The paramedic who has assessed him, found the fever and has a line in, but has given nothing yet */
const ASSESSED = ['primary', 'vitals', 'perfusion', 'sample', 'ask-pde5', 'monitor', 'iv'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|favour|behaviour|programme/i;

describe('cocaine chest pain in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and conditions that exist', () => {
    expect(sc).toMatchObject({ id: 'cocaine-chest-pain-field', setting: 'field', roles: [1, 2], conditionId: 'sinus-tachycardia' });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('sinus-tachycardia');
    expect(sc.initial.vitals).toMatchObject({ sbp: 178, dbp: 104, temp: 38.4 });
    expect(sc.initial.rhythm.hr).toBe(132);
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
    // the built-in beta-blocker rule reads it; the case's own rule of the same id replaces it. His chest pain is a
    // possible ACS, and the agitation is what the benzodiazepine is for
    expect(sc.problems).toEqual(['sympathomimetic-toxicity', 'acs', 'severe-agitation']);
    expect(BUILT_IN_HARMS.some((b) => b.id === 'beta-blocker-stimulant')).toBe(true);
  });

  it('each role has its own briefing and its own part', () => {
    expect(start(sc, 1).log.some((l) => /You are the BLS crew; a paramedic unit can meet you as an intercept/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
    // in the order a hint names them: the EMT's intercept call first
    expect(criticalsFor(sc, 1).map((c) => c.id)).toEqual(['als', 'vitals', 'ecg', 'temperature', 'history', 'transmit', 'aspirin', 'glucose',
      'repeat-ecg', 'transport', 'notify', 'handoff', 'arrest-shock']);
    expect(criticalsFor(sc, 2).map((c) => c.id)).toEqual(['vitals', 'benzo', 'ecg', 'temperature', 'history', 'aspirin', 'iv', 'nitro', 'glucose',
      'repeat-ecg', 'transport', 'notify', 'handoff', 'arrest-shock']);
    // the EMT's one way to the drug he needs weighs as much as the paramedic's benzodiazepine
    expect(sc.critical.find((c) => c.id === 'als')?.points).toBe(20);
    expect(sc.critical.find((c) => c.id === 'benzo')?.points).toBe(20);
  });

  it('the opening tells the story — cocaine an hour ago — but not the temperature', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).toMatch(/lines of coke about an hour ago/);
    expect(opening).not.toMatch(/fever|temperature|°|\bhot\b|hypertherm|beta|metoprolol/i);
  });

  it('the scene is safe and the calm approach starts at the door, in the opening for both roles — no menu step for it', () => {
    for (const role of [1, 2] as const) {
      const opening = start(sc, role).log.map((l) => l.text).join('\n');
      expect(opening).toMatch(/Police are on scene and say it is safe to enter/);
      expect(opening).toMatch(/A police officer stands by the door: "He hasn't hurt anyone — he's just wound up and scared\."/);
      expect(opening).toMatch(/keep a clear path to the door, turn the music off and talk to him calmly, one voice at a time/);
      expect(interventionsFor(role, 'field').some((i) => i.id === 'scene')).toBe(false);
    }
    expect(Object.keys(sc.respond)).not.toContain('scene');
    expect(sc.critical.some((c) => c.id === 'scene')).toBe(false);
    expect(sc.teaching.join(' ')).toMatch(/Calm talk comes first with any agitated patient, and it goes on while the benzodiazepine works/);
  });

  it('no event line names the rhythm, whatever state it fires in', () => {
    // on scene and in the ambulance, with and without an intercept called (each changes the words)
    const states = [start(sc, 1), start(sc, 2), medic([...ASSESSED, 'midazolam']), emt(['als', ...R(9)]), emt(['transport-near']), medic(['monitor', 'transport-pci'])];
    for (const s of states) {
      for (const ev of sc.events) {
        for (const extra of [{ als: 0, calm: 0, cooling: 0 }, { calm: 0 }] as Record<string, number>[]) {
          const probe: SimState = { ...structuredClone(s), flags: { ...s.flags, ...extra } };
          for (const l of ev.effect(probe).say ?? []) expect(l[1], ev.id).not.toMatch(GIVEAWAY);
        }
      }
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('cocaine chest pain in the field — the ideal runs', () => {
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
      // treated in time: he never got worse, and once calm and cooled his temperature came down
      expect(s.fired).not.toContain('worse');
      expect(s.fired).not.toContain('severe');
      expect(s.fired).toContain('cooler');
      expect(s.vitals.temp).toBe(37.8);
      expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 108 });
      expect(s.vitals.pain).toBeLessThanOrEqual(2);
    });
  }

  it('the paramedic reads the 12-lead at no cost; a wrong read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'sinus-tach', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 108: .*no STEMI\. .*does not rule out a heart attack/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const wrong = medic(readAfter(IDEAL[2], 'ecg12', 'svt'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it; the physician keeps the cath lab down', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/12-lead acquired\. You can't interpret it/);
    expect(said(s)).toMatch(/no ST elevation that meets STEMI criteria — the cath lab is not activated/);
  });

  it('the EMT\'s intercept gives the midazolam and the nitroglycerin; the EMT\'s own items stay the EMT\'s', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toContain('als-arrives');
    expect(said(s)).toMatch(/The paramedic arrives: an IV, midazolam 2\.5 mg IV for the agitation, then nitroglycerin 0\.4 mg/);
    expect(s.flags).toMatchObject({ benzodiazepine: expect.any(Number), calm: expect.any(Number), nitro: expect.any(Number) });
    // aspirin was given and the fever found before they came: no reminders
    expect(said(s)).not.toMatch(/Has he had aspirin|burning up/);
  });

  it('other right ways earn full marks too: the paramedic with the line first and the nearest emergency department', () => {
    const s = medic(['primary', 'monitor', 'nibp', 'iv', 'midazolam', 'perfusion', 'ecg12', 'opqrst', 'sample', 'ask-pde5', 'aspirin', 'nitro', 'glucose',
      'med-control', 'fluid', 'transport-near', 'notify', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff']);
    expect(said(s)).toMatch(/Midazolam 2\.5 mg IV\./);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
  });

  it('…and the EMT who leaves the scene first, with the intercept meeting the ambulance on the way', () => {
    const s = emt(['primary', 'als', 'vitals', 'opqrst', 'sample', 'aspirin', 'perfusion', 'glucose', 'transport-near', 'ecg12', 'ecg-transmit', 'notify',
      'ecg12-repeat', UNTIL_ARRIVED, 'handoff']);
    expect(said(s)).toMatch(/The medic unit meets you on the way; the paramedic climbs in/);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic([...ASSESSED, 'ecg12', 'metoprolol', 'diltiazem', 'adenosine6', 'push-epi', 'pressor', 'cardiovert', 'ecg12-repeat', 'defib', 'cpr', 'defib']),
      medic([...ASSESSED, ...R(8), 'midazolam', 'midazolam', 'midazolam']),
      emt(['monitor', 'aspirin', 'nitro-assist', ...R(9), 'ecg12', 'cpap', 'o2-nrb']),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });
});

describe('cocaine chest pain in the field — the traps', () => {
  it('metoprolol: the pressure climbs and the pain worsens (unopposed alpha) — one penalty, in the case\'s words', () => {
    const before = medic(ASSESSED);
    const s = perform(sc, before, 'metoprolol');
    expect(penalties(s)).toEqual(['beta-blocker-stimulant']);
    expect(s.penalties[0]).toMatchObject({ points: 15, severity: 'critical', text: expect.stringMatching(/^A beta-blocker in acute cocaine intoxication\..*unopposed.*3 — Harm/) });
    expect(s.vitals.sbp).toBeGreaterThan(before.vitals.sbp);
    expect(s.vitals.pain).toBe(before.vitals.pain + 2);
    expect(s.rhythm.hr).toBe(before.rhythm.hr - 8);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === `Heart rate ${s.rhythm.hr}. BP ${s.vitals.sbp}/${s.vitals.dbp}.`)).toBe(true);
    expect(said(s)).toMatch(/squeezing harder/);
    expect(review(sc, stop(s)).toFix.find((t) => t.kind === 'harm')?.label).toBe('A beta-blocker in acute cocaine intoxication.');
  });

  it('no 12-lead: the 12-lead items are missed, and the repeat cannot be done without a first one', () => {
    const noEcg = (steps: string[]) => steps.filter((id) => !['ecg12', 'ecg-transmit', 'ecg12-repeat'].includes(id));
    const s1 = emt(noEcg(IDEAL[1]));
    expect(s1.ended?.reason).toBe('complete');
    expect(missed(s1)).toEqual(['12-lead ECG within 10 minutes', 'Transmit the 12-lead (you do not interpret it)', 'Repeat the 12-lead']);
    const s2 = medic(noEcg(IDEAL[2]));
    expect(missed(s2)).toEqual(['12-lead ECG within 10 minutes', 'Repeat the 12-lead']);
    expect(review(sc, s2).percent).toBeLessThan(85);
    const blocked = medic(['ecg12-repeat']);
    expect(blocked.minute).toBe(0);
    expect(blocked.counts['ecg12-repeat']).toBeUndefined();
  });

  it('ignoring the temperature: the item is missed, nobody cools him, and the hospital asks for it', () => {
    const s = medic(IDEAL[2].filter((id) => id !== 'perfusion'));
    expect(missed(s)).toEqual(['Check his skin and take his temperature — and cool him']);
    expect(s.fired).not.toContain('cooler');
    expect(s.vitals.temp).toBe(38.4);
    expect(said(s)).toMatch(/Do you have a temperature on him\?/);
    // the hand on his wrist is the clue; the number comes only from checking the skin
    expect(said(s)).toMatch(/His wrist is hot and slick with sweat/);
    expect(said(s)).not.toMatch(/Temperature 38\.4/);
  });

  it('the skin check finds the fever and starts the cooling; at 39 °C or more the cold packs and the fan go on', () => {
    const s = medic(['perfusion']);
    expect(said(s)).toMatch(/Temperature 38\.4 °C \(101\.1 °F\)/);
    expect(said(s)).toMatch(/hoodie comes off, the air conditioning goes up/);
    expect(s.flags.cooling).toBeDefined();
    const hot = medic([...R(8), 'perfusion']);
    expect(hot.fired).toEqual(['worse', 'severe']);
    expect(said(hot)).toMatch(/Temperature 39\.6 °C \(103\.3 °F\)/);
    expect(said(hot)).toMatch(/cold packs to his neck, armpits and groin, and a fan/);
  });

  it('no benzodiazepine: he gets worse at 10 minutes and out of control at 16 — hotter when nobody is cooling him', () => {
    const uncooled = medic(['primary', ...R(8)]);
    expect(uncooled.fired).toEqual(['worse', 'severe']);
    expect(uncooled.vitals.temp).toBe(39.6);
    expect(uncooled.vitals.gcs).toBe(14);
    expect(uncooled.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 152 });
    expect([uncooled.vitals.sbp, uncooled.vitals.dbp]).toEqual([196, 114]);
    expect(said(uncooled)).toMatch(/Not face down — he can't breathe like that/);
    expect(uncooled.penalties).toEqual([]);
    const cooled = medic(['primary', 'perfusion', ...R(8)]);
    expect(cooled.fired).toEqual(['worse', 'severe']);
    expect(cooled.vitals.temp).toBe(38.9);
    const r = review(sc, stop(uncooled));
    expect(r.toFix.find((t) => t.kind === 'missed' && /Midazolam/.test(t.label))).toBeDefined();
  });

  it('out of control, the first dose only takes the edge off and a second one settles him — neither is a mistake', () => {
    let s = medic(['primary', ...R(8)]);
    s = perform(sc, s, 'midazolam');
    expect(said(s)).toMatch(/Midazolam 5 mg IM in the thigh \(no IV yet\)/);
    expect(s.flags.calm).toBeUndefined();
    expect(s.rhythm.hr).toBe(140);
    s = perform(sc, s, 'midazolam');
    expect(s.flags.calm).toBeDefined();
    expect(s.rhythm.hr).toBe(116);
    expect(s.vitals.gcs).toBe(14);
    expect(s.penalties).toEqual([]);
    expect(said(s)).toMatch(/He stops fighting, lies back on the stretcher/);
  });

  it('an extra dose for a calm patient makes him drowsy (a minor mistake); every dose after that slows his breathing further, and each costs', () => {
    let s = medic(['vitals', 'iv', 'midazolam']);
    expect(s.flags.calm).toBeDefined();
    expect(s.vitals.gcs).toBe(15);
    s = perform(sc, s, 'midazolam');
    expect(penalties(s)).toEqual(['midazolam-calm']);
    expect(s.penalties[0]).toMatchObject({ points: 2, severity: 'minor' });
    expect(s.vitals).toMatchObject({ gcs: 13, rr: 12, spo2: 95 });
    expect(said(s)).toMatch(/now he is drowsy, his eyes closing/);
    expect(status(s)).toMatch(/^Drowsy: he opens his eyes when you speak to him/);
    // regression: the third dose used to change nothing at all
    s = perform(sc, s, 'midazolam');
    expect(penalties(s)).toEqual(['midazolam-calm', 'midazolam-oversedated']);
    expect(s.penalties[1]).toMatchObject({ points: 8, severity: 'major' });
    expect(s.vitals).toMatchObject({ gcs: 11, rr: 8, spo2: 89 });
    expect(said(s)).toMatch(/snoring and hard to rouse, breathing 8 times a minute/);
    // GCS 11 now: midazolam's three doses are spent, but the sedation protocol is the same drug — it costs too, and he gets
    // deeper again (the built-in rule watches the midazolam action only)
    expect(unavailableReason(sc, s, 'midazolam')).toBe('Maximum 3 doses');
    s = perform(sc, s, 'sedation');
    expect(penalties(s)).toEqual(['midazolam-calm', 'midazolam-oversedated', 'sedation-drowsy']);
    expect(s.vitals).toMatchObject({ gcs: 9, rr: 6, spo2: 84 });
    // too drowsy to swallow now: no aspirin, and the bag-mask (which he tolerates) is the rescue
    const asa = perform(sc, s, 'aspirin');
    expect(asa.counts.aspirin).toBeUndefined();
    const bagged = perform(sc, s, 'bvm');
    expect(bagged.vitals).toMatchObject({ spo2: 96, rr: 10 });
    expect(bagged.log.some((l) => /bag-mask with oxygen assisting his own breaths/.test(l.text))).toBe(true);
    expect(bagged.penalties).toEqual(s.penalties);
  });

  it('the bag-mask is not forced on a calm patient who breathes well', () => {
    const s = perform(sc, medic(['iv', 'midazolam']), 'bvm');
    expect(said(s)).toMatch(/pushes the mask away/);
  });

  it('the sedation protocol is a benzodiazepine here: it counts for the item, once he has a line', () => {
    const s = medic(['iv', 'sedation']);
    expect(said(s)).toMatch(/Sedation per protocol: midazolam 2\.5 mg IV\./);
    expect(s.flags.calm).toBeDefined();
    expect(review(sc, stop(s)).wentWell.some((w) => /Midazolam for the agitation/.test(w.label))).toBe(true);
  });

  it('oxygen with a normal saturation is a minor mistake', () => {
    expect(penalties(medic(['o2-nrb']))).toEqual(['oxygen-normoxic']);
    expect(penalties(emt(['o2-nc']))).toEqual(['oxygen-normoxic']);
  });

  it('nitroglycerin needs a pressure and the erectile-dysfunction question first; with both it eases the pain', () => {
    expect(penalties(medic(['nitro']))).toEqual(['nitro-no-bp', 'nitro-no-pde5']);
    const s = medic(['vitals', 'ask-pde5', 'nitro']);
    expect(s.penalties).toEqual([]);
    expect(s.vitals).toMatchObject({ sbp: 166, dbp: 98, pain: 5 });
    expect(said(s)).toMatch(/Maybe a little better/);
  });

  it('the high nitroglycerin dose is one minor mistake, even once the pressure is under 160', () => {
    expect(penalties(medic(['vitals', 'ask-pde5', 'nitro-high']))).toEqual(['nitro-high-chest-pain']);
    const s = medic(['vitals', 'ask-pde5', 'midazolam', 'nitro-high']);
    expect(s.vitals.sbp).toBeLessThan(160);
    expect(penalties(s)).toEqual(['nitro-high-chest-pain']);
  });

  it('pressors drive everything up; rate drugs for a sinus rate are a minor mistake, counted once', () => {
    const p = medic(['iv', 'push-epi']);
    expect(penalties(p)).toEqual(['pressor-stimulant']);
    expect(p.rhythm.hr).toBe(142);
    expect(p.vitals.sbp).toBe(194);
    const r = medic(['iv', 'adenosine6', 'amio-infusion', 'lidocaine']);
    expect(penalties(r)).toEqual(['antiarrhythmic-sinus']);
    expect(penalties(medic(['iv', 'epinephrine']))).toEqual(['arrest-epi-with-pulse']);
  });

  it('diltiazem before the benzodiazepine and nitroglycerin is a minor mistake; after them, for a pressure still 160 or more, the case does not charge it', () => {
    const early = medic(['iv', 'diltiazem']);
    expect(penalties(early)).toEqual(['diltiazem-stimulant']);
    expect(early.penalties[0]).toMatchObject({ points: 2, severity: 'minor', text: expect.stringMatching(/2023 AHA poisoning update/) });
    // the metoprolol trap leaves the pressure high after both: then a calcium-channel blocker is a fair vasodilator
    let s = medic(['vitals', 'iv', ...R(4), 'metoprolol', 'midazolam', 'ask-pde5', 'nitro']);
    expect(s.fired).toEqual(['worse']);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(160);
    s = perform(sc, s, 'diltiazem');
    // …but minutes after IV metoprolol it is the built-in combination rule's (the diltiazem label: not within a few hours)
    expect(penalties(s)).toEqual(['beta-blocker-stimulant', 'iv-beta-blocker-with-diltiazem']);
    // once the pressure is down, it is not
    const down = medic(['vitals', 'iv', 'midazolam', 'ask-pde5', 'nitro', 'diltiazem']);
    expect(penalties(down)).toEqual(['diltiazem-stimulant']);
  });

  it('a synchronized shock with no tachyarrhythmia, and an unsynchronized one that causes VF — a shock in 2 minutes brings him back', () => {
    expect(penalties(medic(['pads', 'cardiovert']))).toEqual(['cardiovert-no-tachycardia']);
    let s = medic(['pads', 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(penalties(s)).toEqual(['shock-with-pulse']);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 124 });
    expect(review(sc, stop(s)).wentWell.some((w) => /defibrillate within 2 minutes/.test(w.label))).toBe(true);
  });

  it('in that VF he does not talk, and nobody feels for skin signs before the shock', () => {
    const vf = medic(['pads', 'defib']);
    const skin = perform(sc, vf, 'perfusion');
    expect(skin.minute).toBe(vf.minute);
    expect(skin.log.at(-1)!.text).toBe('He has no pulse: CPR and a shock come first.');
    for (const id of ['opqrst', 'sample', 'lungs', 'neuro']) {
      const s = perform(sc, vf, id);
      expect(s.log.at(-1)!.text, id).toMatch(/He cannot answer|No breaths of his own|Unresponsive/);
    }
  });

  it('a STEMI alert for a 12-lead without one is declined, at a small cost', () => {
    const s = medic(['monitor', 'ecg12', 'stemi-alert']);
    expect(penalties(s)).toEqual(['stemi-alert-no-ste']);
    expect(said(s)).toMatch(/does not meet STEMI criteria — the cath lab is not activated/);
  });

  it('CPAP and raised legs do not belong here', () => {
    expect(penalties(emt(['cpap', 'legs-up']))).toEqual(['cpap-clear-lungs', 'legs-up-hypertensive']);
  });

  it('right care beyond the critical items costs nothing: pain relief, fluid, the poison center, medical control, the neuro check', () => {
    const s = medic(['vitals', 'iv', 'fentanyl', 'fluid', 'neuro', 'lungs', 'glucose', 'poison-control', 'med-control', 'ondansetron', 'ecg-transmit']);
    expect(s.penalties).toEqual([]);
    expect(said(s)).toMatch(/Poison center: "Cocaine with chest pain.*a benzodiazepine first.*no beta-blocker/);
    expect(said(s)).not.toMatch(/Nothing you describe points to a poisoning/);
    expect(said(s)).toMatch(/Medical control: "Midazolam for the agitation/);
  });
});

describe('cocaine chest pain in the field — the EMT\'s part', () => {
  it('he has no nitroglycerin of his own: the EMT cannot give any, at no cost and no time', () => {
    const s = emt(['nitro-assist']);
    expect(s.minute).toBe(0);
    expect(s.counts['nitro-assist']).toBeUndefined();
    expect(said(s)).toMatch(/I don't have any nitroglycerin of my own/);
  });

  it('the AED is not applied to a patient with a pulse', () => {
    const s = emt(['aed']);
    expect(s.minute).toBe(0);
    expect(s.penalties).toEqual([]);
  });

  it('never calling the intercept: he gets worse in the ambulance, and the item is missed', () => {
    const s = emt(IDEAL[1].filter((id) => id !== 'als'));
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'severe']));
    expect(s.fired).not.toContain('als-arrives');
    expect(missed(s)).toEqual(['Request a paramedic intercept early']);
  });

  it('an intercept called late meets him out of control and needs two doses; one called before the aspirin and the fever reminds the EMT of both', () => {
    const late = emt(['primary', ...R(8), 'als', ...R(3)]);
    expect(late.fired).toEqual(['worse', 'severe', 'als-arrives']);
    expect(said(late)).toMatch(/midazolam 5 mg IM, then 2\.5 mg IV, for the agitation/);
    expect(late.flags.calm).toBeDefined();
    const early = emt(['als', ...R(3)]);
    expect(early.fired).toContain('als-arrives');
    expect(said(early)).toMatch(/Has he had aspirin\? That one is yours/);
    expect(said(early)).toMatch(/he is burning up/);
    // the intercept cools him, but finding the fever is still the EMT's item
    expect(missed(early)).toContain('Check his skin and take his temperature — and cool him');
  });

  it('medical control tells the EMT what is in an EMT\'s hands', () => {
    const s = emt(['med-control']);
    expect(said(s)).toMatch(/Aspirin 324 mg chewed.*never face down.*cool him.*paramedic intercept/);
  });
});

describe('cocaine chest pain in the field — review fixes', () => {
  it('a paramedic who treats first and takes the history after is not late: the history is due by 15 minutes', () => {
    const s = medic(['primary', 'monitor', 'vitals', 'ecg12', 'iv', 'midazolam', 'perfusion', 'lungs', 'opqrst', 'sample', 'ask-pde5', 'aspirin', 'nitro',
      'glucose', 'transport-near', 'notify', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff']);
    expect(s.flags.sample).toBeGreaterThan(10);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
  });

  it('a pressure in both arms counts as the vital signs', () => {
    const s = medic(['bp-both-arms']);
    expect(said(s)).toMatch(/Right arm 178\/104 · left arm 174\/102/);
    expect(review(sc, stop(s)).wentWell.some((w) => w.label === 'Vital signs')).toBe(true);
  });

  it('the EMT who never calls the intercept: he arrives out of control and hot, and the review does not call it Excellent', () => {
    const s = emt(IDEAL[1].filter((id) => id !== 'als'));
    const r = review(sc, s);
    expect(r.toFix.find((t) => t.kind === 'missed')).toMatchObject({ label: 'Request a paramedic intercept early', points: 20 });
    expect(r.percent).toBeLessThan(85);
    expect(r.grade).not.toBe('Excellent');
    // in the ambulance: the straps and the stretcher, no officer and no pacing; the partner names who has the drug
    const loaded = s.log.findIndex((l) => /^Patient loaded/.test(l.text));
    const text = s.log.slice(loaded).map((l) => l.text).join('\n');
    expect(text).toMatch(/straining at the stretcher straps/);
    expect(text).toMatch(/thrashing against the stretcher straps/);
    expect(text).toMatch(/From the driver's seat: "Keep him on his back — never face down.*get a medic unit to meet us/);
    expect(text).not.toMatch(/officer|pacing/);
    expect(text).toMatch(/He is still agitated and confused, at 38\.9 °C \(102\.0 °F\): midazolam now/);
  });

  it('on scene the officer reaches for a face-down hold and the partner stops it; once the cuff is torn off the monitor shows only the rate', () => {
    const s = medic(['monitor', ...R(8)]);
    expect(s.fired).toEqual(['worse', 'severe']);
    expect(said(s)).toMatch(/back on his feet, pacing/);
    expect(said(s)).toMatch(/The officer moves to pin him face down on the floor\. "Not face down.*He needs something to calm him\."/);
    const severeAt = s.log.findIndex((l) => /torn off the cuff/.test(l.text));
    const after = s.log.slice(severeAt).find((l) => l.who === 'monitor');
    expect(after?.text).toBe('Heart rate 152.');
  });

  it('after the VF a shock caused he is groggy — until the cocaine winds him up again', () => {
    let s = medic(['pads', 'defib', 'defib']);
    expect(status(s)).toMatch(/^Groggy/);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    expect(status(s)).toMatch(/^"I can't sit still/);
  });

  it('nitroglycerin repeated within 5 minutes is a minor mistake; 5 minutes apart it is not', () => {
    const fast = medic(['vitals', 'ask-pde5', 'nitro', 'nitro']);
    expect(penalties(fast)).toEqual(['nitro-too-soon']);
    expect(fast.penalties[0]).toMatchObject({ points: 2, severity: 'minor' });
    const paced = medic(['vitals', 'ask-pde5', 'nitro', 'reassess', 'reassess', 'reassess', 'nitro']);
    expect(paced.penalties).toEqual([]);
  });

  it('the main trap is not "Excellent": metoprolol in an otherwise ideal paramedic run', () => {
    const i = IDEAL[2].indexOf('iv');
    const s = medic([...IDEAL[2].slice(0, i + 1), 'metoprolol', ...IDEAL[2].slice(i + 1)]);
    expect(penalties(s)).toEqual(['beta-blocker-stimulant']);
    const r = review(sc, s);
    expect(r.grade).not.toBe('Excellent');
    expect(r.toFix[0]).toMatchObject({ kind: 'harm', severity: 'critical', points: 15 });
  });

  it('the radio report repeats only what the hospital has been told', () => {
    expect(said(emt(['als', 'notify']))).toMatch(/still agitated\. Send us his 12-lead\. Do you have a temperature on him\?/);
    expect(said(emt(['ecg12', 'ecg-transmit', 'perfusion', 'notify']))).toMatch(/temperature 38\.4 °C \(101\.1 °F\), and we have his 12-lead: no STEMI/);
    expect(said(medic(['notify']))).toMatch(/still agitated\. Get a 12-lead on him\./);
    expect(said(medic(['ecg12', 'notify']))).toMatch(/still agitated, no STEMI on your 12-lead\. Do you have a temperature on him\?/);
  });

  it('the intercept who finds the fever says the number', () => {
    expect(said(emt(['als', ...R(3)]))).toMatch(/he is burning up: 38\.4 °C \(101\.1 °F\)\. Get that hoodie off/);
  });

  it('a hint names the intercept call first, before the slower assessment', () => {
    const s = takeHint(sc, start(sc, 1));
    expect(s.log.at(-1)!.text).toMatch(/^Hint: Request a paramedic intercept early\./);
  });

  it('teaches a STEMI alert for ST elevation on any tracing, not waiting to see whether nitroglycerin settles it', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/ST elevation that meets STEMI criteria on any tracing means a STEMI alert/);
    expect(text).not.toMatch(/does not settle with nitroglycerin/);
    expect(text).toMatch(/hobbled or hog-tied, under a backboard or mattress/);
  });
});

describe('cocaine chest pain in the field — hints and teaching', () => {
  it('a hint names the next critical item for the role', () => {
    expect(takeHint(sc, start(sc, 2)).log.at(-1)!.text).toMatch(/^Hint: Vital signs\./);
    const s = takeHint(sc, emt(['primary', 'vitals', 'perfusion', 'opqrst', 'sample']));
    expect(s.log.at(-1)!.text).toMatch(/^Hint: Request a paramedic intercept early\./);
  });

  it('teaches the benzodiazepine first, no beta-blocker, the temperature and never face down', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/benzodiazepine first/);
    expect(text).toMatch(/No beta-blocker while the signs of acute intoxication last/);
    expect(text).toMatch(/Take the temperature of every stimulant patient/);
    expect(text).toMatch(/Never restrain a patient face down/);
    expect(text).toMatch(/oxygen only for an SpO₂ under 90 %/);
  });
});
