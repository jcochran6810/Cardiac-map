import { describe, expect, it } from 'vitest';
import { answerRead, interventionsForScenario, perform, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { SCENARIOS, SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Scenario, SimState } from '@/lib/sim/scenario/types';
import { ROLE_SETTING, type LearningLevel } from '@/store/useAppStore';
import { monitorKeys, type MonitorKey } from '@/components/simulator/monitorKeys';
import { durationText } from '@/components/simulator/simStyles';

/**
 * The monitor's keys in the case simulator: a 12-lead or a blood pressure in one tap, without the action menu. Each key
 * runs one of the menu's own actions; these tests pin down which one, how the key reads, and when the keys are there.
 */

const field = SCENARIO_BY_ID['stemi-anterior-field'];
const tempWire = SCENARIO_BY_ID['heart-block-temp-wire-cathlab'];
const ROLES: LearningLevel[] = [1, 2, 3, 4, 5, 6, 7];

const key = (sc: Scenario, s: SimState, kind: MonitorKey['kind'], scope?: ReadonlySet<string>) =>
  monitorKeys(sc, s, scope).find((k) => k.kind === kind);

/** Answer every read that is open, correctly */
function readAll(sc: Scenario, s: SimState): SimState {
  while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
  return s;
}

/** Perform `ids` in turn, answering each read as it comes */
function play(sc: Scenario, role: LearningLevel, ids: string[]): SimState {
  let s = readAll(sc, start(sc, role));
  for (const id of ids) s = readAll(sc, perform(sc, s, id));
  return s;
}

describe('the 12-lead key', () => {
  it('records the first 12-lead, then repeats it, saying so on the key', () => {
    let s = start(field, 2);
    expect(key(field, s, 'ecg')).toMatchObject({ id: 'ecg12', label: '12-lead', time: '2 min', disabled: null });
    s = perform(field, s, key(field, s, 'ecg')!.id);
    // the read is open: every action is locked, the keys too
    expect(s.pendingRead?.kind).toBe('ecg');
    expect(monitorKeys(field, s)).toEqual([]);
    s = readAll(field, s);
    expect(key(field, s, 'ecg')).toMatchObject({ id: 'ecg12-repeat', label: 'Repeat 12-lead', time: '1½ min', disabled: null });
    // a repeat is a repeat for good
    s = readAll(field, perform(field, s, 'ecg12-repeat'));
    expect(key(field, s, 'ecg')?.id).toBe('ecg12-repeat');
  });

  it('an EMT records and transmits without a read: the key turns to a repeat at once', () => {
    const s = perform(field, start(field, 1), 'ecg12');
    expect(s.pendingRead).toBeNull();
    expect(key(field, s, 'ecg')?.id).toBe('ecg12-repeat');
  });

  it("a teammate's 12-lead counts as recorded: the key offers the repeat, which the engine then accepts", () => {
    // the cath lab tech's 12-lead from the table opens this case for the nurse and the cardiologist
    let s = start(tempWire, 5);
    expect(s.flags).toHaveProperty('ecg12');
    expect(monitorKeys(tempWire, s)).toEqual([]);
    s = readAll(tempWire, s);
    const ecg = key(tempWire, s, 'ecg')!;
    expect(ecg).toMatchObject({ id: 'ecg12-repeat', disabled: null });
    expect(perform(tempWire, s, ecg.id).performed.at(-1)?.id).toBe('ecg12-repeat');
  });

  it('a key the engine refuses is disabled, with the reason', () => {
    // a first 12-lead counted with no tracing on record (no case does this today): the engine says it is done
    const s = { ...start(field, 2), counts: { ecg12: 1 } };
    expect(key(field, s, 'ecg')).toMatchObject({ id: 'ecg12', disabled: 'Already done' });
  });
});

describe('the blood pressure key', () => {
  it('takes a manual set until the monitor is on, then the NIBP — and the key says which', () => {
    let s = start(field, 2);
    expect(key(field, s, 'bp')).toMatchObject({ id: 'vitals', label: 'Manual BP', time: '1 min', disabled: null });
    s = perform(field, s, 'vitals');
    expect(s.log.at(-1)?.text).toMatch(/^BP \d+\/\d+ · pulse/);
    s = perform(field, s, 'monitor');
    expect(key(field, s, 'bp')).toMatchObject({ id: 'nibp', label: 'NIBP', time: '30 s', disabled: null });
    s = perform(field, s, 'nibp');
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: expect.stringMatching(/^NIBP \d+\/\d+ mmHg\.$/) });
  });

  it('pads and a 12-lead put the monitor on too', () => {
    expect(key(field, play(field, 2, ['pads']), 'bp')?.id).toBe('nibp');
    expect(key(field, play(field, 2, ['ecg12']), 'bp')?.id).toBe('nibp');
  });

  it('never runs into the engine\'s "attach the monitor first"', () => {
    for (const sc of SCENARIOS) {
      for (const role of sc.roles) {
        const s = readAll(sc, start(sc, role));
        if (s.ended) continue;
        const bp = key(sc, s, 'bp')!;
        const after = perform(sc, s, bp.id);
        expect(after.log.slice(s.log.length).map((l) => l.text), `${sc.id} as ${role}`).not.toContain('Attach the monitor first, or take a manual set of vitals.');
      }
    }
  });
});

describe('which keys show', () => {
  it('a key whose action is outside the scope is left out; the blood pressure key falls back to a manual set', () => {
    const s = play(field, 2, ['monitor']);
    const all = new Set(interventionsForScenario(field, 2).map((i) => i.id));
    const without = (...ids: string[]) => new Set(Array.from(all).filter((id) => !ids.includes(id)));
    expect(monitorKeys(field, s, without('ecg12')).map((k) => k.kind)).toEqual(['bp']);
    expect(key(field, s, 'bp', without('nibp'))).toMatchObject({ id: 'vitals', label: 'Manual BP' });
    expect(key(field, s, 'bp', without('nibp', 'vitals'))).toBeUndefined();
    expect(monitorKeys(field, s, new Set())).toEqual([]);
    // once recorded, the 12-lead key is the repeat or nothing (never a second "first" 12-lead)
    const recorded = play(field, 2, ['ecg12']);
    expect(key(field, recorded, 'ecg', without('ecg12-repeat'))).toBeUndefined();
  });

  it('none while a read is open, and none once the case has ended', () => {
    const reading = perform(field, start(field, 2), 'ecg12');
    expect(reading.pendingRead).not.toBeNull();
    expect(monitorKeys(field, reading)).toEqual([]);
    const stopped = stop(readAll(field, reading));
    expect(stopped.ended?.reason).toBe('stopped');
    expect(monitorKeys(field, stopped)).toEqual([]);
  });

  it('every role has both keys in its own setting', () => {
    for (const role of ROLES) {
      const ids = new Set(interventionsFor(role, ROLE_SETTING[role]).map((i) => i.id));
      for (const id of ['ecg12', 'ecg12-repeat', 'nibp', 'vitals']) expect(ids.has(id), `${id} for role ${role}`).toBe(true);
    }
  });

  it('every case, in every role it is written for: both keys, in scope, labeled for what they run', () => {
    const settings = new Set<string>();
    for (const sc of SCENARIOS) {
      for (const role of sc.roles) {
        settings.add(sc.setting);
        const s = readAll(sc, start(sc, role));
        const scope = new Set(interventionsForScenario(sc, role).map((i) => i.id));
        const keys = monitorKeys(sc, s);
        const where = `${sc.id} as ${role}`;
        expect(keys.map((k) => k.kind), where).toEqual(['ecg', 'bp']);
        for (const k of keys) {
          expect(scope.has(k.id), where).toBe(true);
          expect(k.disabled, where).toBeNull();
          expect(k.time).toBe(durationText(INTERVENTION_BY_ID[k.id].minutes));
          // the full name starts with what the key says (what a screen reader user hears matches what others see)
          expect(k.name.startsWith(`${k.label} key: ${INTERVENTION_BY_ID[k.id].label}`), where).toBe(true);
        }
        const [ecg, bp] = keys;
        expect(ecg.id, where).toBe('ecg12' in s.flags ? 'ecg12-repeat' : 'ecg12');
        expect(bp.id, where).toBe('monitor' in s.flags ? 'nibp' : 'vitals');
        expect(bp.label, where).toBe(bp.id === 'nibp' ? 'NIBP' : 'Manual BP');
      }
    }
    expect(Array.from(settings)).toEqual(expect.arrayContaining(['field', 'cathlab']));
  });
});
