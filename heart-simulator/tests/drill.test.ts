import { beforeEach, describe, expect, it } from 'vitest';
import { DRILL_SETS, DRILL_SET_BY_ID, MASTERED, MAX_BOX, MAX_OPTIONS, grade, labelOf, mastery, nextQuestion, optionsFor, statKey, type DrillSet, type DrillStats } from '@/lib/drill';
import { useDrillStore } from '@/store/useDrillStore';
import { ECG_PROFILES } from '@/lib/ecg/profiles';

/** a repeatable stand-in for Math.random */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('practice sets', () => {
  it.each(DRILL_SETS.map((s) => [s.id, s] as const))('%s draws on real rhythm profiles, each with a name of its own and a rate it can run at', (_, set) => {
    expect(set.items.length).toBeGreaterThanOrEqual(6);
    expect(new Set(set.items.map((i) => i.profile)).size).toBe(set.items.length);
    expect(new Set(set.items.map((i) => i.label)).size).toBe(set.items.length);
    for (const it of set.items) {
      const p = ECG_PROFILES[it.profile];
      expect(p, it.profile).toBeTruthy();
      // the explanation after each answer is the profile's own list of findings
      expect(p.findings.length, `${it.profile} findings`).toBeGreaterThanOrEqual(2);
      if (it.hr) {
        expect(p.rateControl, `${it.profile} has a settable rate`).not.toBe('none');
        expect(it.hr[0]).toBeLessThan(it.hr[1]);
        expect(it.hr[0]).toBeGreaterThanOrEqual(p.minHR);
        expect(it.hr[1]).toBeLessThanOrEqual(p.maxHR);
      }
      for (const c of it.confuse ?? []) expect(ECG_PROFILES[c], `${it.profile} confused with ${c}`).toBeTruthy();
    }
  });

  it('keeps each sinus rhythm inside the rates that define it', () => {
    for (const set of DRILL_SETS) {
      for (const it of set.items) {
        if (!it.hr) continue;
        if (it.profile === 'normal-sinus') { expect(it.hr[0]).toBeGreaterThanOrEqual(60); expect(it.hr[1]).toBeLessThanOrEqual(100); }
        if (it.profile === 'sinus-bradycardia') expect(it.hr[1]).toBeLessThan(60);
        if (it.profile === 'sinus-tachycardia') expect(it.hr[0]).toBeGreaterThan(100);
      }
    }
  });

  it('names an answer by its label', () => {
    expect(labelOf(DRILL_SET_BY_ID.core, 'avnrt')).toBe('SVT');
    expect(labelOf(DRILL_SET_BY_ID.core, 'nonsense')).toBe('nonsense');
  });
});

describe('mastery', () => {
  it('moves a rhythm up one box when it is named right and down two when it is missed', () => {
    let s = grade(undefined, true);
    expect(s).toEqual({ seen: 1, right: 1, box: 1 });
    s = grade(grade(s, true), true);
    expect(s.box).toBe(3);
    s = grade(s, false);
    expect(s).toEqual({ seen: 4, right: 3, box: 1 });
    expect(grade(s, false).box).toBe(0);
    let top = s;
    for (let i = 0; i < 10; i++) top = grade(top, true);
    expect(top.box).toBe(MAX_BOX);
  });

  it('counts a rhythm as mastered from box three', () => {
    const set = DRILL_SET_BY_ID.core;
    const stats: DrillStats = {
      [statKey('core', 'vf')]: { seen: 3, right: 3, box: MASTERED },
      [statKey('core', 'vt')]: { seen: 4, right: 2, box: MASTERED - 1 },
      [statKey('blocks', 'pvcs')]: { seen: 9, right: 9, box: MAX_BOX },
    };
    expect(mastery(set, stats)).toEqual({ mastered: 1, total: set.items.length, seen: 7, right: 5 });
  });
});

describe('the next tracing', () => {
  const set = DRILL_SET_BY_ID.core;

  it('is never the one just shown, and offers the right answer among the options', () => {
    const rng = seeded(7);
    let last: string | null = null;
    for (let i = 0; i < 300; i++) {
      const q = nextQuestion(set, {}, last, rng);
      expect(q.profile).not.toBe(last);
      expect(q.options).toContain(q.profile);
      const item = set.items.find((it) => it.profile === q.profile)!;
      if (item.hr) {
        expect(q.hr).toBeGreaterThanOrEqual(item.hr[0]);
        expect(q.hr).toBeLessThanOrEqual(item.hr[1] + 1);
      } else expect(q.hr).toBeUndefined();
      last = q.profile;
    }
  });

  it('brings shaky rhythms back more often than solid ones', () => {
    const stats: DrillStats = {};
    for (const it of set.items) stats[statKey(set.id, it.profile)] = { seen: 5, right: 5, box: MAX_BOX };
    stats[statKey(set.id, 'atrial-flutter')] = { seen: 5, right: 1, box: 0 };
    const rng = seeded(3);
    const count: Record<string, number> = {};
    let last: string | null = null;
    for (let i = 0; i < 2000; i++) {
      const q = nextQuestion(set, stats, last, rng);
      count[q.profile] = (count[q.profile] ?? 0) + 1;
      last = q.profile;
    }
    expect(count['atrial-flutter']).toBeGreaterThan(3 * count.vf);
    // …but everything still comes round
    for (const it of set.items) expect(count[it.profile] ?? 0, it.profile).toBeGreaterThan(30);
  });

  it('offers every answer of a short set in the set\'s own order, and cuts a long set down keeping the look-alikes', () => {
    for (const s of DRILL_SETS) {
      if (s.items.length <= MAX_OPTIONS) expect(optionsFor(s, s.items[0], seeded())).toEqual(s.items.map((it) => it.profile));
    }
    const profiles = Object.keys(ECG_PROFILES).slice(0, 20);
    const long: DrillSet = { id: 'long', title: 'Long', text: '', layout: 'monitor', items: profiles.map((p, i) => ({ profile: p as never, label: p, confuse: i === 0 ? [profiles[19] as never, profiles[18] as never] : undefined })) };
    const opts = optionsFor(long, long.items[0], seeded(5));
    expect(opts.length).toBe(MAX_OPTIONS);
    expect(opts).toContain(profiles[0]);
    expect(opts).toContain(profiles[19]);
    expect(opts).toContain(profiles[18]);
    // still in the set's order
    expect(opts).toEqual(profiles.filter((p) => opts.includes(p as never)));
  });
});

describe('a practice session', () => {
  beforeEach(() => {
    useDrillStore.getState().close();
    useDrillStore.getState().resetStats();
  });

  it('scores answers, keeps the run of right answers and remembers the best run', () => {
    const rng = seeded(11);
    const st = () => useDrillStore.getState();
    st().begin('core', rng);
    expect(st().open).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(st().answer(st().question!.profile)).toBe(true);
      // a second tap on the same tracing changes nothing
      expect(st().answer('vf')).toBe(false);
      st().next(rng);
      expect(st().picked).toBeNull();
    }
    expect(st()).toMatchObject({ asked: 3, right: 3, streak: 3 });
    const missed = st().question!.profile;
    expect(st().answer('unsure')).toBe(false);
    expect(st()).toMatchObject({ asked: 4, right: 3, streak: 0 });
    expect(st().best.core).toBe(3);
    expect(st().stats[statKey('core', missed)]).toMatchObject({ seen: 1, right: 0, box: 0 });
    st().leaveSet();
    expect(st()).toMatchObject({ open: true, setId: null, question: null });
    st().close();
    expect(st().open).toBe(false);
  });
});
