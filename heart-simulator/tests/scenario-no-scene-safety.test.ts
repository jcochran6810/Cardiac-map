import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { perform, start, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTIONS, INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import type { Scenario, Setting } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';

/**
 * The "Scene safety and PPE" action (id 'scene') is gone: no learner has to pick it from the menu, and no case scores it.
 * The narrator's "On scene" lines (the speaker 'scene') stay — they are how a field case describes what the crew finds.
 */
const ID = 'scene';
const ROLES: LearningLevel[] = [1, 2, 3, 4, 5, 6, 7];
const SETTINGS: Setting[] = ['field', 'ed', 'cathlab'];

const isScenario = (v: unknown): v is Scenario =>
  !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Scenario).id === 'string' && Array.isArray((v as Scenario).critical) && typeof (v as Scenario).respond === 'object';

/** Every case written, registered in the case list or not yet (a case file exports its scenario) */
async function everyCase(): Promise<Scenario[]> {
  const dir = fileURLToPath(new URL('../src/lib/sim/scenario/scenarios/', import.meta.url));
  const found = new Map<string, Scenario>(SCENARIOS.map((s) => [s.id, s]));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const mod = (await import(join(dir, file))) as Record<string, unknown>;
    for (const v of Object.values(mod)) if (isScenario(v)) found.set(v.id, v);
  }
  return Array.from(found.values());
}

describe('no scene-safety step', () => {
  it('the action does not exist', () => {
    expect(INTERVENTIONS.some((i) => i.id === ID)).toBe(false);
    expect(INTERVENTION_BY_ID[ID]).toBeUndefined();
    expect(INTERVENTIONS.some((i) => /scene safety|\bPPE\b/i.test(i.label))).toBe(false);
  });

  it('no role is offered it in any setting', () => {
    for (const role of ROLES) for (const setting of SETTINGS) expect(interventionsFor(role, setting).map((i) => i.id), `role ${role} in ${setting}`).not.toContain(ID);
  });

  it('asking for it changes nothing: no time, no log line, no count', () => {
    const field = SCENARIOS.find((c) => c.setting === 'field' && c.roles.includes(1))!;
    const s = start(field, 1);
    expect(unavailableReason(field, s, ID)).toBe('Unknown intervention');
    expect(perform(field, s, ID)).toBe(s);
  });

  it('no case responds to it, scores it, times it or names it as a harm', async () => {
    const cases = await everyCase();
    // the registered cases at least, and the case files not yet in the list
    expect(cases.length).toBeGreaterThanOrEqual(SCENARIOS.length);
    for (const sc of cases) {
      expect(Object.keys(sc.respond), `${sc.id}: respond`).not.toContain(ID);
      for (const c of sc.critical) {
        expect(c.id, `${sc.id}: critical`).not.toBe(ID);
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids, `${sc.id}: critical ${c.id}`).not.toContain(ID);
      }
      for (const h of sc.harms) expect(h.actions, `${sc.id}: harm ${h.id}`).not.toContain(ID);
      for (const t of sc.timings ?? []) expect(t.actions, `${sc.id}: timing ${t.label}`).not.toContain(ID);
    }
  });
});
