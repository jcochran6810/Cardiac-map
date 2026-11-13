import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { mapOf } from '@/lib/sim/scenario/kit';
import { lvadField as sc } from '@/lib/sim/scenario/scenarios/lvadField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const last = (s: SimState) => s.log.at(-1)!.text;
const R = (n: number) => Array<string>(n).fill('reassess');
const map = (s: SimState) => mapOf(s.vitals);
const toFix = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label));
const missed = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && label.test(t.label));

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'lvad-check', 'als', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'legs-up', 'ecg12', 'ecg-transmit', 'transport-pci', 'doppler-map',
    UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'iv', 'fluid', 'doppler-map', 'transport-pci', UNTIL_ARRIVED,
    'handoff'],
};

/** Both crews' first look: the survey, the pump and a Doppler MAP — by now they know he is perfusing, dry and low */
const ASSESSED = ['primary', 'lvad-check', 'doppler-map'];

/** He has slipped twice while he waited for fluid: confused, with a MAP of 47 (worse at 14 minutes, worse again at 22) */
const SLIPPED = ['lvad-check', 'doppler-map', ...R(11)];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|dehydrat|hypovol|\bdry\b/i;
const DIAGNOSIS = /dehydrat|hypovol|\bdry\b|low.flow/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|favour|programme/i;

describe('LVAD in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic on a continuous-flow LVAD, and refers only to things that exist', () => {
    expect(sc).toMatchObject({ id: 'lvad-field', setting: 'field', roles: [1, 2], conditionId: 'hfref' });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(sc.initial.lvad).toBe(true);
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('sinus-tachycardia');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
      // every rule applies to a role that can commit it: each role it names has one of its actions in scope
      const roles = h.roles ?? sc.roles;
      for (const r of roles) {
        expect(sc.roles, h.id).toContain(r);
        expect(h.actions.some((id) => interventionsFor(r, 'field').some((i) => i.id === id)), `${h.id}: role ${r}`).toBe(true);
      }
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // his failing heart: the built-in diltiazem and procainamide rules read it (this case's own rules stand in for them)
    expect(sc.problems).toEqual(['heart-failure']);
  });

  it('each role has its own briefing and its own part', () => {
    expect(start(sc, 1).log.some((l) => /You are the BLS crew; a paramedic unit can meet you as an intercept/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor, the Doppler and the drug box/.test(l.text))).toBe(true);
    expect(criticalsFor(sc, 1).map((c) => c.id)).toEqual(['primary', 'lvad-check', 'doppler', 'als', 'intercept-fluid', 'perfusion', 'vad-team', 'history', 'ecg', 'transmit', 'recheck', 'destination', 'handoff']);
    expect(criticalsFor(sc, 2).map((c) => c.id)).toEqual(['primary', 'lvad-check', 'doppler', 'perfusion', 'vad-team', 'history', 'ecg', 'iv', 'fluid', 'recheck', 'destination', 'handoff']);
  });

  it('nothing the learner sees before the assessment names the cause', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(DIAGNOSIS);
    // the story is there for whoever looks: the losses, a pump that alarms, no pulse and a man who talks
    expect(opening).toMatch(/two days of vomiting and diarrhea/);
    expect(opening).toMatch(/talks to you/);
    expect(opening).toMatch(/22 minutes.*8 minutes/);
  });

  it('no event line names the cause or the rhythm, whatever state it fires in', () => {
    const states = [start(sc, 1), medic([...ASSESSED, 'iv', 'pressor', 'nitro']), emt(['monitor', 'als', ...R(2)]), medic(['monitor', ...SLIPPED])];
    for (const s of states) {
      for (const ev of sc.events) {
        const probe: SimState = { ...structuredClone(s), flags: { ...s.flags, als: 0, arrived: 30, 'dest-pci': 20, 'dest-near': 20 } };
        for (const l of ev.effect(probe).say ?? []) expect(l[1], ev.id).not.toMatch(GIVEAWAY);
      }
    }
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('LVAD in the field — the ideal runs', () => {
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
      // refilled before he could slip, at his VAD center with his bag and his wife
      expect(s.fired).not.toContain('worse');
      expect(s.fired).toContain('arrive-center');
      expect(said(s)).toMatch(/His VAD team meets you at the door with an echo machine\. His wife hands them the travel bag\./);
      expect(said(s)).toMatch(/The controller's alarm goes quiet\./);
      expect(map(s)).toBeGreaterThanOrEqual(65);
    });
  }

  it('the paramedic reads the 12-lead as a fast sinus rhythm, at no cost; another read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'sinus-tach', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 112: .*no ST elevation.*he could be awake and talking in VT or even VF/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    for (const wrong of ['nsr', 'vt']) {
      const w = medic(readAfter(IDEAL[2], 'ecg12', wrong), 'manual');
      expect(w.penalties, wrong).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
    }
  });

  it('the EMT acquires and transmits the 12-lead and is not asked to read it; the physician sees no STEMI', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/12-lead acquired\. You can't interpret it/);
    expect(said(s)).toMatch(/ECG received\. The physician: "No ST elevation — this is not a cath lab call/);
  });

  it('the EMT\'s paramedic intercept gives the fluid; its timing and the recheck count for the EMT', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toContain('als-arrives');
    expect(s.flags['als-fluid']).toBeDefined();
    expect(said(s)).toMatch(/The paramedic arrives: an IV in his left forearm, and 500 mL of normal saline running in\./);
    expect(review(sc, s).timings.find((t) => t.label === 'Fluid bolus')).toMatchObject({ met: true });
    expect(review(sc, s).wentWell.some((w) => /Recheck after the bolus/.test(w.label))).toBe(true);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the cause', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic(['monitor', 'nibp', 'pads', 'iv', 'fluid', 'fluid', 'fluid', 'fluid', 'ecg12', 'ecg12-repeat', 'pressor', 'push-epi']),
      medic(['monitor', 'iv', 'metoprolol', 'diltiazem', 'adenosine6', 'amio-infusion', 'procainamide', 'lidocaine', 'atropine', 'defib', 'cardiovert', 'pace', 'epinephrine']),
      medic(['monitor', ...SLIPPED, 'iv', 'fluid', 'nitro', 'cpap', 'cpr']),
      emt(['monitor', 'aed', 'cpr', 'cpap', 'o2-nrb', 'aspirin', 'als', ...R(4), 'nibp', 'ecg12']),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('is deterministic', () => {
    for (const role of [1, 2] as const) expect(runScenario(sc, role, IDEAL[role])).toEqual(runScenario(sc, role, IDEAL[role]));
  });
});

describe('LVAD in the field — what the crew finds', () => {
  it('opens awake and perfusing with no pulse to feel, a Doppler MAP of 58 and a fast sinus rate', () => {
    const s = start(sc, 2);
    expect(s).toMatchObject({ pulse: true, lvad: true, rhythm: { profile: 'sinus-tachycardia', hr: 112 } });
    expect(map(s)).toBe(58);
    expect(s.vitals.gcs).toBe(15);
    expect(last(medic(['primary']))).toBe('Airway open, breathing 18/min, no palpable radial or carotid pulse, GCS 15.');
    expect(last(medic(['pulse-check']))).toBe('No palpable pulse — yet the patient is awake and talking to you.');
    expect(last(medic(['doppler-map']))).toBe('Doppler MAP 58 mmHg: the whooshing flow sound returns at 58 as the cuff goes down.');
  });

  it('the cuff, the NIBP and the oximeter cannot read him; oxygen does not change the number, at no cost', () => {
    expect(last(medic(['monitor', 'nibp']))).toBe('NIBP: unable to measure.');
    expect(last(medic(['vitals']))).toMatch(/^No palpable pulse, and no sounds with the cuff: no blood pressure by hand\. RR 18; the oximeter wanders around 86% over a nearly flat waveform/);
    expect(said(medic(['monitor']))).toMatch(/The pleth is nearly flat, and the SpO₂ number wanders between 80 and 90/);
    for (const o2 of ['o2-nc', 'o2-nrb']) {
      const s = emt([o2]);
      expect(s.vitals.spo2, o2).toBe(86);
      expect(last(s), o2).toMatch(/it has no pulse to read\. His lips are pink/);
      expect(s.penalties, o2).toEqual([]);
    }
    // refilled, the heart adds a little pulsatility and the probe finds a signal
    expect(medic(['iv', 'fluid']).vitals.spo2).toBe(94);
  });

  it('the pump check: the hum, a red LOW FLOW alarm at 2.3 L/min, power and driveline intact — and his travel bag', () => {
    const s = medic(['lvad-check']);
    expect(said(s)).toMatch(/A steady pump hum over the left chest: the pump is running\. Controller: a red heart symbol and a steady alarm tone \(LOW FLOW\); flow 2\.3 L\/min/);
    expect(said(s)).toMatch(/Both batteries connected and charged; the driveline runs intact/);
    expect(said(s)).toMatch(/His wife hands over his travel bag — two charged spare batteries/);
    expect(s.flags.equipment).toBeDefined();
    // after the bolus: the alarm has cleared and the flow is back to 3.6
    expect(last(medic(['lvad-check', 'iv', 'fluid', 'lvad-check']))).toMatch(/Controller: no alarm; flow 3\.6 L\/min/);
  });

  it('the history: the losses, the diuretic taken this morning, no blood, warfarin and sildenafil', () => {
    const s = medic(['opqrst', 'sample', 'ask-pde5']);
    expect(said(s)).toMatch(/Two days of throwing up and the runs/);
    expect(said(s)).toMatch(/furosemide 40 .*I took them today like always/);
    expect(said(s)).toMatch(/No blood in the vomit, and the diarrhea is watery and brown, never black/);
    expect(said(s)).toMatch(/Sildenafil — 20 mg three times a day/);
  });

  it('the skin and the neck veins say dry; the lungs are clear', () => {
    expect(last(medic(['perfusion']))).toMatch(/capillary refill 3 seconds; a dry mouth .*neck veins flat/);
    expect(last(medic(['lungs']))).toMatch(/^Clear and equal/);
    expect(last(medic(['iv', 'fluid', 'perfusion']))).toMatch(/capillary refill 2 seconds/);
  });
});

describe('LVAD in the field — the VAD team', () => {
  it('a call before the numbers brings questions, not advice, and does not count; the call back with them does', () => {
    const early = medic(['call-vad']);
    expect(last(early)).toMatch(/^VAD coordinator: "This is his VAD team\. Please read me the controller — .* and get me a Doppler MAP, then call me straight back/);
    expect(early.flags['vad-advice']).toBeUndefined();
    expect(missed(early, /Call the VAD team/)).toBe(true);
    const back = medic(['call-vad', ...ASSESSED, 'call-vad']);
    expect(last(back)).toMatch(/Low flow at 2\.3 with a MAP of 58, .*he is dry.*Give him 500 mL of normal saline now/);
    expect(back.flags['vad-advice']).toBeDefined();
    expect(missed(back, /Call the VAD team/)).toBe(false);
  });

  it('says leave the controller alone, no compressions, and bring him with his bag and his wife', () => {
    const text = last(medic([...ASSESSED, 'call-vad']));
    expect(text).toMatch(/Leave the controller alone: no setting changes, no swapping controllers, and never disconnect the driveline/);
    expect(text).toMatch(/No compressions while he is talking to you/);
    expect(text).toMatch(/Bring him to us, his implanting center, with his travel bag and his wife/);
  });

  it('tells the EMT to get a paramedic for the fluid and to lay him flat', () => {
    expect(last(emt([...ASSESSED, 'call-vad']))).toMatch(/get a paramedic intercept to start a line and give 500 mL of saline — lay him flat with his legs up/);
    expect(last(emt(['als', ...ASSESSED, 'call-vad']))).toMatch(/when your paramedic gets there, 500 mL of saline/);
  });

  it('once refilled, it says the fluid is working; once he is confused, the nearest emergency department', () => {
    expect(last(medic([...ASSESSED, 'iv', 'fluid', 'call-vad']))).toMatch(/Flow 3\.6 and a MAP of 66: that is the fluid working/);
    expect(last(medic([...SLIPPED, 'call-vad']))).toMatch(/he is confused now: he is too unstable for the long ride\. Go to the nearest emergency department/);
  });
});

describe('LVAD in the field — the fluid and what delay does', () => {
  it('a bolus refills the pump: the alarm goes quiet, the MAP comes to 66 and the rate down', () => {
    const s = medic(['monitor', 'iv', 'fluid']);
    expect(said(s)).toMatch(/500 mL of normal saline in through the IV\.\nThe controller's alarm goes quiet\./);
    expect(map(s)).toBe(66);
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 102 });
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'Heart rate 102.' });
    expect(s.penalties).toEqual([]);
  });

  it('more boluses bring the MAP to 72 and 74, then change nothing — and none costs points', () => {
    let s = medic(['iv', 'fluid', 'fluid']);
    expect(map(s)).toBe(72);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 94 });
    s = perform(sc, s, 'fluid');
    expect(map(s)).toBe(74);
    const before = s.vitals;
    s = perform(sc, s, 'fluid');
    expect(s.vitals).toEqual(before);
    expect(last(s)).toMatch(/No further change: the flow is back in his usual range/);
    expect(s.penalties).toEqual([]);
  });

  it('a 12-lead after two boluses reads as a normal sinus rhythm', () => {
    const s = medic(readAfter(['iv', 'fluid', 'fluid', 'ecg12'], 'ecg12', 'nsr'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ answer: 'nsr', verdict: 'correct' })]);
  });

  it('without fluid he slips at 14 minutes (near fainting, MAP 52) and at 22 (confused, MAP 47) — and fluid still brings him back', () => {
    let s = medic(['monitor', ...R(7)]);
    expect(s.fired).toContain('worse');
    expect([map(s), s.vitals.gcs, s.rhythm.hr]).toEqual([52, 14, 120]);
    expect(said(s)).toMatch(/I feel like I'm going to pass out/);
    s = medic(['monitor', ...R(11)]);
    expect(s.fired).toContain('worse2');
    expect([map(s), s.vitals.gcs, s.rhythm.hr]).toEqual([47, 12, 126]);
    expect(said(s)).toMatch(/he keeps asking where he is/);
    // a deeper deficit needs more: one bolus brings him back to talking, two to a quiet controller
    s = perform(sc, perform(sc, s, 'iv'), 'fluid');
    expect([map(s), s.vitals.gcs]).toEqual([52, 14]);
    expect(said(s)).toMatch(/The controller is still alarming\./);
    s = perform(sc, perform(sc, s, 'fluid'), 'fluid');
    expect(map(s)).toBe(66);
    expect(last(medic([...SLIPPED, 'iv', 'fluid', 'fluid', 'fluid', 'lvad-check']))).toMatch(/Controller: no alarm/);
  });

  it('a late bolus counts half', () => {
    const s = medic(['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', ...R(2), 'iv', 'fluid']);
    expect(toFix(s, /Fluid bolus for the low flow/)).toMatchObject({ kind: 'late' });
  });

  it('raised legs help a little while he is dry — the alarm keeps sounding — and cost nothing', () => {
    const s = emt(['legs-up', 'lvad-check']);
    expect(map(s)).toBe(61);
    expect(said(s)).toMatch(/LOW FLOW\); flow 2\.4 L\/min/);
    expect(s.penalties).toEqual([]);
  });

  it('ondansetron for his nausea is good care and costs nothing', () => {
    const s = medic(['iv', 'ondansetron']);
    expect(last(s)).toBe('"The sick feeling is settling."');
    expect(s.penalties).toEqual([]);
  });

  it('the EMT\'s intercept arrives 6 minutes after the call — on scene, or on the way — and asks about the VAD team', () => {
    const scene = emt(['als', ...R(3)]);
    expect(scene.fired).toContain('als-arrives');
    expect(said(scene)).toMatch(/The paramedic arrives: an IV/);
    expect(said(scene)).toMatch(/Has anyone called his VAD team\?/);
    expect(map(scene)).toBe(66);
    expect(scene.flags.iv).toBeDefined();
    const road = emt(['als', 'lvad-check', 'transport-pci', ...R(2)]);
    expect(said(road)).toMatch(/The medic unit meets you on the way; the paramedic climbs in/);
    expect(emt(['als', ...R(2)]).fired).not.toContain('als-arrives');
  });
});

describe('LVAD in the field — the traps', () => {
  it('compressions on a man who is talking: 15 points once, for either crew; the built-in rule does not add to it', () => {
    for (const s of [medic(['cpr', 'cpr']), emt(['cpr'])]) {
      expect(penalties(s)).toEqual(['cpr-lvad-perfusing']);
      expect(s.penalties[0]).toMatchObject({ points: 15, severity: 'critical' });
      expect(said(s)).toMatch(/"Ow — what are you doing\?" He pushes your hands away/);
    }
    expect(sc.harms.find((h) => h.id === 'cpr-lvad-perfusing')!.text).toMatch(/a Doppler MAP of 50 or less — and then without delay/);
  });

  it('the AED is refused while the pump perfuses him: no time, no penalty', () => {
    const s = emt(['aed']);
    expect(s.minute).toBe(0);
    expect(s.counts.aed).toBeUndefined();
    expect(last(s)).toMatch(/^Not while the pump is perfusing/);
    expect(s.penalties).toEqual([]);
  });

  it('CPAP for a number that cannot read: the flow falls, the mask comes off, 5 points for either crew', () => {
    for (const s of [medic(['cpap']), emt(['cpap'])]) {
      expect(penalties(s)).toEqual(['cpap-dry-pump']);
      expect(last(s)).toMatch(/the controller's flow falls from 2\.3 to 2\.0 L\/min .*You take the mask off\./);
    }
  });

  it('a vasopressor before fluid: the MAP creeps up, the flow falls — 5 points; after the fluid, only once the MAP is back', () => {
    const s = medic(['iv', 'pressor']);
    expect(penalties(s)).toEqual(['pressor-dry-pump']);
    expect(said(s)).toMatch(/The controller's flow falls to 1\.9 L\/min as the vessels tighten/);
    expect(map(s)).toBe(64);
    expect(penalties(medic(['iv', 'push-epi']))).toEqual(['pressor-dry-pump']);
    // refilled to a MAP of 66: nothing calls for it
    expect(penalties(medic(['iv', 'fluid', 'pressor']))).toEqual(['pressor-dry-pump']);
    // slipped twice, one bolus in and a MAP of 52: a vasopressor on top is a fair step, not a mistake
    expect(penalties(medic([...SLIPPED, 'iv', 'fluid', 'pressor']))).toEqual([]);
  });

  it('nitroglycerin: 8 points once — not also the built-in low-pressure rule — and the MAP falls', () => {
    const s = medic(['iv', 'nitro', 'nitro']);
    expect(penalties(s)).toEqual(['nitro-no-indication']);
    expect(map(s)).toBeLessThan(58);
    expect(penalties(medic(['nitro-high']))).toEqual(['nitro-no-indication']);
    expect(sc.harms.find((h) => h.id === 'nitro-no-indication')!.text).toMatch(/sildenafil/);
    // the EMT has none of his own to help with: refused, no time
    const own = emt(['nitro-assist']);
    expect([own.minute, own.counts['nitro-assist'], own.penalties]).toEqual([0, undefined, []]);
  });

  it('slowing his compensating rate: metoprolol 8 points, diltiazem 15 (in place of the built-in heart-failure rule)', () => {
    const b = medic(['monitor', 'iv', 'metoprolol']);
    expect(penalties(b)).toEqual(['beta-blocker-compensation']);
    expect(b.rhythm.hr).toBe(100);
    expect(said(b)).toMatch(/I'm going to pass out/);
    const d = medic(['iv', 'diltiazem']);
    expect(penalties(d)).toEqual(['diltiazem-lvad']);
    expect(d.penalties[0]).toMatchObject({ points: 15, severity: 'critical' });
  });

  it('antiarrhythmics and adenosine for a sinus rhythm: one penalty each, never doubled by the built-in procainamide rules', () => {
    for (const id of ['amio-infusion', 'procainamide', 'lidocaine']) expect(penalties(medic(['iv', id])), id).toEqual(['antiarrhythmic-sinus']);
    expect(penalties(medic(['iv', 'adenosine6']))).toEqual(['adenosine-sinus']);
  });

  it('an opioid or a sedative with nothing to treat: 5 points once, not also the built-in midazolam rule', () => {
    expect(penalties(medic(['midazolam']))).toEqual(['sedative-no-indication']);
    expect(penalties(medic(['iv', 'fentanyl', 'midazolam']))).toEqual(['sedative-no-indication']);
  });

  it('aspirin with no chest pain, IM epinephrine and glucagon: minor errors', () => {
    expect(penalties(emt(['aspirin']))).toEqual(['aspirin-no-acs']);
    expect(penalties(emt(['epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
    expect(penalties(medic(['iv', 'glucagon']))).toEqual(['glucagon-no-indication']);
  });

  it('shocks with a pulse: the built-in rules score them; an awake man feels it', () => {
    const d = medic(['defib']);
    expect(penalties(d)).toEqual(['shock-with-pulse']);
    expect(said(d)).toMatch(/he was awake the whole time/);
    expect(penalties(medic(['cardiovert']))).toEqual(['cardiovert-no-tachycardia']);
    expect(penalties(medic(['pace']))).toEqual(['pace-not-slow']);
  });

  it('pads go front and back, clear of the pump and the ICD, at no cost', () => {
    const s = medic(['pads']);
    expect(last(s)).toMatch(/anterior–posterior\), clear of the pump and of the ICD/);
    expect(s.penalties).toEqual([]);
  });

  it('leaving without his equipment: 8 points, and the VAD team has to send his wife home for the bag', () => {
    const s = medic(['primary', 'transport-pci', UNTIL_ARRIVED]);
    expect(penalties(s)).toEqual(['no-equipment']);
    expect(said(s)).toMatch(/his travel bag is still by the door/);
    expect(said(s)).toMatch(/Where are his spare batteries and his backup controller\?/);
    // the pump check or the VAD team's call brings the bag along
    expect(penalties(medic(['lvad-check', 'transport-pci']))).toEqual([]);
    expect(penalties(emt(['call-vad', 'transport-pci']))).toEqual([]);
  });

  it('the nearest emergency department while he is awake and perfusing: 8 points and the destination missed', () => {
    const s = medic([...ASSESSED, 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(penalties(s)).toEqual(['nearest-ed']);
    expect(said(s)).toMatch(/We have no VAD program here/);
    expect(review(sc, s).toFix.some((t) => t.kind === 'missed' && /Transport to his VAD center/.test(t.label))).toBe(true);
  });

  it('once he is confused with a falling MAP, the nearest emergency department is right: no penalty, and it counts', () => {
    const s = medic([...SLIPPED, 'transport-near']);
    expect(s.vitals.gcs).toBe(12);
    expect(s.penalties).toEqual([]);
    expect(s.flags['near-justified']).toBeDefined();
    expect(missed(s, /Transport to his VAD center/)).toBe(false);
  });

  it('a case with the main traps taken scores below Excellent', () => {
    const s = medic(['primary', 'cpr', 'monitor', 'cpap', 'iv', 'pressor', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    const r = review(sc, s);
    expect(penalties(s)).toEqual(['cpr-lvad-perfusing', 'cpap-dry-pump', 'pressor-dry-pump', 'no-equipment', 'nearest-ed']);
    expect(r.grade).not.toBe('Excellent');
    expect(r.percent).toBeLessThan(50);
  });
});

describe('LVAD in the field — the end of the case', () => {
  it('the hand-off waits for arrival', () => {
    const s = medic(['primary', 'handoff']);
    expect(s.counts.handoff).toBeUndefined();
    expect(last(s)).toMatch(/^Hand off on arrival/);
  });

  it('at his VAD center the echo shows an underfilled heart; a center not called pages its team from the department', () => {
    const s = medic(IDEAL[2]);
    expect(said(s)).toMatch(/a small, underfilled left ventricle and a working right ventricle/);
    const uncalled = medic(['lvad-check', 'transport-pci', UNTIL_ARRIVED]);
    expect(said(uncalled)).toMatch(/Nobody told his VAD team he was coming/);
  });

  it('a hint names the next critical step, at a cost', () => {
    const s = takeHint(sc, medic(['primary']));
    expect(last(s)).toMatch(/^Hint: Check the pump/);
    expect(s.penalties.map((p) => p.points)).toEqual([2]);
  });

  it('a stopped case reports the pump check, the Doppler and the VAD team as missed', () => {
    const s = start(sc, 1);
    for (const label of [/Check the pump/, /Doppler MAP/, /Call the VAD team/, /paramedic intercept/]) expect(missed(s, label), String(label)).toBe(true);
  });

  it('teaches the perfusion thresholds, the Doppler, the controller and the destination', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/Doppler MAP of 50 or less/);
    // 2025 AHA durable LVAD algorithm: the EtCO₂ counts only through a tube or tracheostomy (a supraglottic airway reads high)
    expect(text).toMatch(/EtCO₂ over 20 — read only through an endotracheal tube or tracheostomy, since a supraglottic airway reads falsely high/);
    expect(text).toMatch(/skin color and temperature, capillary refill, a Doppler MAP over 50/);
    expect(text).toMatch(/change a controller only when the VAD team/);
    expect(text).toMatch(/implanting VAD center/);
    expect(text).toMatch(/2025 AHA durable LVAD algorithm; 2017 AHA statement/);
  });
});

describe('LVAD in the field — review fixes', () => {
  const pen = (s: SimState, id: string) => s.penalties.find((p) => p.id === id);
  const fix = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label));

  it('a reassessment after the bolus is a recheck: it reads the controller and the Doppler MAP', () => {
    const medicRun = medic(['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'iv', 'fluid', 'reassess', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(said(medicRun)).toMatch(/Doppler MAP 66 · RR 18 · SpO₂ 94% with a small waveform · the controller quiet/);
    expect(review(sc, medicRun).percent).toBe(100);
    // the EMT whose intercept gave the fluid while the crew was loading: the reassessments on the way count
    const emtRun = emt(['primary', 'call-vad', 'als', 'lvad-check', 'doppler-map', 'call-vad', 'perfusion', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', 'reassess', 'reassess', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, emtRun).toFix).toEqual([]);
  });

  it('the destination item reads right whichever place was right: the nearest department counts by name once he is confused', () => {
    const near = medic([...SLIPPED, 'transport-near', UNTIL_ARRIVED, 'handoff']);
    // loaded after 24 minutes on scene: right, but late (the goal is to leave by 20)
    expect(fix(near, /^Transport to his VAD center while he is stable \(the nearest department once he is confused\)$/)).toMatchObject({ kind: 'late' });
  });

  it('the EMT cannot reach for ALS care: the line, the fluid and the drugs are the intercept\'s', () => {
    const s = start(sc, 1);
    for (const id of ['iv', 'io', 'fluid', 'nitro', 'pressor', 'push-epi', 'defib', 'epinephrine', 'ondansetron', 'capno']) expect(unavailableReason(sc, s, id), id).toBe('Outside your scope');
  });

  it('a sensible EMT crew that looks first and calls the intercept at 5:00 is on time', () => {
    const s = emt(['primary', 'lungs', 'vitals', 'monitor', 'nibp', 'lvad-check', 'als']);
    expect(s.performed.at(-1)).toEqual({ id: 'als', minute: 5 });
    const done = emt(['primary', 'lungs', 'vitals', 'monitor', 'nibp', 'lvad-check', 'als', 'doppler-map', 'sample', 'opqrst', 'perfusion', 'call-vad', 'ecg12', 'ecg-transmit', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, done)).toMatchObject({ percent: 100, toFix: [] });
  });

  it('the EMT who never calls the intercept: he arrives confused with a MAP of 47 — not a passing case', () => {
    const s = emt(['primary', 'lvad-check', 'doppler-map', 'call-vad', 'transport-pci', 'perfusion', 'sample', 'ecg12', 'ecg-transmit', UNTIL_ARRIVED, 'handoff']);
    expect([map(s), s.vitals.gcs]).toEqual([47, 12]);
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(['IV fluid through the paramedic intercept before he gets worse', 'Request a paramedic intercept for IV fluid']);
    expect(r.percent).toBeLessThan(75);
    expect(r.grade).toBe('Needs practice');
    // an intercept called late reaches him after he has slipped: both count half
    const late = emt(['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'ecg-transmit', 'opqrst', 'als', ...R(4), 'lvad-check', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(late.fired).toContain('worse');
    expect(fix(late, /IV fluid through the paramedic intercept/)).toMatchObject({ kind: 'late' });
    expect(fix(late, /Request a paramedic intercept/)).toMatchObject({ kind: 'late' });
  });

  it('the slips and the intercept play in the order they happen, even when one action spans both', () => {
    // the intercept is due at 13:48; the reassessment runs from 12:18 to 14:18 — it reached him before he would have slipped
    const first = emt(['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'als', 'reassess', 'reassess', 'glucose', 'reassess']);
    expect(first.minute).toBe(14.3);
    expect(first.fired).toEqual(['als-arrives']);
    expect(map(first)).toBe(66);
    // due at 14:18, after the slip at 14:00: he slips first, and the bolus brings him back to where he started
    const second = emt(['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'ecg-transmit', 'als', 'reassess', 'reassess', 'reassess']);
    expect(second.fired).toEqual(['worse', 'als-arrives']);
    expect([map(second), second.vitals.gcs]).toEqual([58, 15]);
  });

  it('the paramedic who never gives the fluid does not pass as competent', () => {
    const s = medic(['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'iv', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(s.vitals.gcs).toBe(12);
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(['Fluid bolus for the low flow: 500 mL normal saline']);
    expect(r.percent).toBeLessThan(75);
  });

  it('the coordinator never sends an EMT crew to a paramedic it does not have', () => {
    const none = last(emt([...SLIPPED, 'call-vad']));
    expect(none).toMatch(/Go to the nearest emergency department/);
    expect(none).toMatch(/Get a paramedic intercept to meet you for IV fluid\./);
    expect(none).not.toMatch(/your paramedic/i);
    // called but not there yet; there and the alarm still sounding (a late intercept after two slips: one bolus is not enough)
    expect(last(emt([...SLIPPED, 'als', 'call-vad']))).toMatch(/Your paramedic can start a line and run fluid when they reach you\./);
    expect(last(emt(['lvad-check', 'doppler-map', 'als', 'call-vad']))).toMatch(/when your paramedic gets there, 500 mL of saline/);
    const lateIntercept = emt([...SLIPPED, 'als', ...R(3), 'call-vad']);
    expect(lateIntercept.fired).toEqual(['worse', 'worse2', 'als-arrives']);
    expect(last(lateIntercept)).toMatch(/He needs more fluid: have your paramedic give another 500 mL of saline, then recheck\./);
    // the paramedic's second bolus is "another"
    expect(last(medic([...SLIPPED, 'iv', 'fluid', 'call-vad']))).toMatch(/Give him another 500 mL of normal saline now/);
  });

  it('the hand-off reports what was done: no "after the fluid" for a man who had none', () => {
    const dry = medic(['lvad-check', 'doppler-map', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(said(dry)).toMatch(/SBAR hand-off: .*the Doppler MAP, and no IV fluid yet/);
    expect(said(dry)).not.toMatch(/before and after the fluid/);
    // he arrives confused after the long ride with no fluid, and the report says so
    expect(said(dry)).toMatch(/SBAR hand-off: no palpable pulse, confused but answering;/);
    const ideal = medic(IDEAL[2]);
    expect(said(ideal)).toMatch(/SBAR hand-off: no palpable pulse, awake and talking; the low-flow alarm and the controller's numbers; the Doppler MAP before and after the fluid; .*what the VAD team advised; his medicines — warfarin, aspirin, sildenafil\./);
  });

  it('stacked wrong drugs take him down to a MAP of 45 at the lowest, and confused — still perfusing, so compressions still cost', () => {
    const s = medic(['iv', 'monitor', 'nitro', 'nitro', 'nitro', 'metoprolol', 'diltiazem', 'procainamide', 'amio-arrest', 'magnesium-sulfate', ...R(6), 'doppler-map', 'neuro', 'cpr']);
    expect(map(s)).toBe(45);
    expect(s.vitals.gcs).toBe(12);
    expect(said(s)).toMatch(/GCS 12\. Confused and drowsy/);
    expect(pen(s, 'cpr-lvad-perfusing')).toMatchObject({ points: 15 });
    // a falling MAP clouds him on its way down: under 55 near fainting, under 50 confused
    const two = medic(['iv', 'nitro', 'nitro']);
    expect([map(two), two.vitals.gcs]).toEqual([48, 12]);
    const one = medic(['iv', 'nitro']);
    expect([map(one), one.vitals.gcs]).toEqual([53, 14]);
    // his skin says the same as his pressure
    expect(last(perform(sc, two, 'perfusion'))).toMatch(/^Gray, with cool, clammy hands; capillary refill 4 seconds/);
    // fluid brings him back as far as the pressure allows
    const back = perform(sc, perform(sc, two, 'fluid'), 'fluid');
    expect([map(back), back.vitals.gcs]).toEqual([62, 15]);
  });

  it('once he is confused, his wife gives the history', () => {
    const s = medic([...SLIPPED, 'sample', 'ask-pde5']);
    expect(said(s)).toMatch(/He is too muddled to answer; his wife answers for him: "No allergies\. Warfarin, .*he took them today like always/);
    expect(said(s)).toMatch(/his wife answers for him: "Sildenafil — 20 mg three times a day, for the pressure in his lungs/);
  });

  it('the arrest-only rules speak of a man awake on his pump, not of "a patient with a pulse"', () => {
    for (const [id, rule] of [['defib', 'shock-with-pulse'], ['epinephrine', 'arrest-epi-with-pulse'], ['amio-arrest', 'arrest-amio-with-pulse']] as const) {
      const s = medic(['iv', id]);
      expect(penalties(s), id).toEqual([rule]);
      expect(s.penalties[0].text, id).toMatch(/awake on his pump\. No pulse to feel is normal with a continuous-flow LVAD/);
      expect(s.penalties[0].text, id).not.toMatch(/with a pulse/);
    }
    expect(pen(medic(['defib']), 'shock-with-pulse')).toMatchObject({ points: 15, severity: 'critical' });
    expect(pen(medic(['iv', 'epinephrine']), 'arrest-epi-with-pulse')).toMatchObject({ points: 15, severity: 'critical' });
  });

  it('magnesium, albuterol, diphenhydramine and a vagal maneuver have nothing to treat: minor errors', () => {
    expect(penalties(medic(['iv', 'magnesium-sulfate']))).toEqual(['magnesium-no-indication']);
    const neb = medic(['monitor', 'albuterol']);
    expect(penalties(neb)).toEqual(['beta-agonist-antihistamine-no-indication']);
    expect(neb.rhythm.hr).toBe(118);
    expect(penalties(medic(['iv', 'diphenhydramine']))).toEqual(['beta-agonist-antihistamine-no-indication']);
    for (const s of [emt(['vagal']), medic(['vagal'])]) expect(penalties(s)).toEqual(['vagal-sinus']);
  });

  it('the long ride once he is confused costs points and is not his destination; a bolus first makes it right again', () => {
    const s = medic([...SLIPPED, 'transport-pci']);
    expect(penalties(s)).toEqual(['long-ride-unstable']);
    expect(missed(s, /Transport to his VAD center/)).toBe(true);
    // one bolus on scene brings him back to talking (GCS 14): now the VAD center is right
    const refilled = medic([...SLIPPED, 'iv', 'fluid', 'transport-pci']);
    expect(refilled.vitals.gcs).toBe(14);
    expect(refilled.penalties).toEqual([]);
    expect(missed(refilled, /Transport to his VAD center/)).toBe(false);
  });

  it('a 12-lead after a rate drug says the drug, not the fluid, brought the rate down', () => {
    const s = medic(readAfter(['monitor', 'iv', 'metoprolol', 'diltiazem', 'ecg12'], 'ecg12', 'nsr'), 'manual');
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus rhythm 88: .*A drug has pushed the rate down, but not the cause/.test(l.text))).toBe(true);
  });

  it('every in-scope action, from any of these states, keeps the MAP at 45 or more, the GCS true to the MAP, and the monitor silent on the rhythm', () => {
    const bases = [start(sc, 2), medic([...SLIPPED]), medic(['iv', 'nitro', 'nitro', 'nitro']), emt([...SLIPPED]), start(sc, 1)];
    for (const base of bases) {
      for (const iv of interventionsFor(base.role, 'field')) {
        let s = base;
        if (iv.needsAccess && !s.flags.iv && base.role === 2) s = perform(sc, s, 'iv');
        s = perform(sc, s, iv.id);
        expect(s.pulse, iv.id).toBe(true);
        expect(map(s), iv.id).toBeGreaterThanOrEqual(45);
        if (map(s) < 50) expect(s.vitals.gcs, iv.id).toBeLessThanOrEqual(12);
        else if (map(s) < 55) expect(s.vitals.gcs, iv.id).toBeLessThanOrEqual(14);
        for (const l of s.log.slice(base.log.length)) if (l.who === 'monitor') expect(l.text, iv.id).not.toMatch(GIVEAWAY);
      }
    }
  });
});
