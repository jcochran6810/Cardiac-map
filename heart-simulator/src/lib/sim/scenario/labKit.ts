/**
 * Helpers for cath lab scenarios. In the lab the learner works inside a team. When they play the tech,
 * the (computer) operator asks for catheters, wires, balloons, stents and views and waits for the right
 * one; when they play the nurse, the operator orders drugs; when they play the cardiologist, the tech
 * and the nurse do their own jobs and every procedural choice is the learner's.
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { Critical, Effect, Harm, Line, PendingRead, ScenarioEvent, SimState, Speaker } from './types';
import { has } from './kit';

/** Roles a scenario item applies to, by name */
export const TECH: LearningLevel[] = [3];
export const RN: LearningLevel[] = [4];
export const MD: LearningLevel[] = [5];

/** Views by coronary system (intervention ids) */
export const LAD_VIEWS = ['view-rao-cranial', 'view-ap-cranial', 'view-lao-cranial'];
export const LEFT_VIEWS = ['view-rao-caudal', ...LAD_VIEWS, 'view-lao-caudal'];
export const RCA_VIEWS = ['view-rca-lao', 'view-rca-rao', 'view-rca-cranial'];
export const LEFT_GUIDES = ['guide-ebu'];
export const RIGHT_GUIDES = ['guide-jr4', 'guide-al1'];
export const WIRES = ['wire-workhorse', 'wire-hydrophilic'];

export const anticoagulated = (s: SimState) => has(s, 'heparin') || has(s, 'bivalirudin');

/**
 * The computer operator's next step after `after`: with the nurse it simply takes a minute; with the
 * tech it waits until the tech has handed what was asked for (the `handed` flag).
 */
export const nextStep = (s: SimState, after: string, handed: string) => (s.role === 4 ? s.minute >= s.flags[after] + 1 : has(s, handed));

/** Who is operating: the learner (cardiologist) or the computer operator */
export const operator = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** First minute any of these interventions was done at or after a flag was set */
export function doneAfter(s: SimState, ids: string[], flag: string): number | null {
  const from = s.flags[flag];
  if (from === undefined) return null;
  const hit = s.performed.find((p) => ids.includes(p.id) && p.minute >= from);
  return hit ? hit.minute : null;
}

/** The operator asks the learner for something: the tech for a device or a view, the nurse for a drug */
export interface LabAsk {
  /** short name, e.g. 'guide' (flags: asked-guide, then the `gives` flag) */
  id: string;
  /** who is asked (default: the tech) */
  role?: LearningLevel;
  /** when the operator asks */
  when: (s: SimState) => boolean;
  ask: string;
  /** the right answers */
  accept: string[];
  /** a device already opened before the request counts (a tech who thinks ahead) */
  early?: boolean;
  /** wrong answers: the operator says `wrongSay`, and the harm from `askHarm` costs points */
  wrong?: string[];
  wrongSay?: string;
  thanks: string;
  /** what the operator says when the right thing never comes */
  fallback: string;
  /** flag set once the operator has what they asked for (the procedure then moves on) */
  gives: string;
  label: string;
  why: string;
  points?: number;
  /** minutes the operator waits before getting it themselves (default 3) */
  wait?: number;
  /** full marks if answered within this many minutes (default 2) */
  within?: number;
}

const askedRole = (a: LabAsk) => a.role ?? 3;

/** Minute the learner answered a request (a device opened early counts from the request), or null */
export function askDone(s: SimState, a: LabAsk): number | null {
  const at = s.flags[`asked-${a.id}`];
  if (at === undefined) return null;
  const hit = s.performed.find((p) => a.accept.includes(p.id) && (a.early || p.minute >= at));
  return hit ? Math.max(hit.minute, at) : null;
}

/** The request, the operator's word on a wrong answer, the thank-you and the fallback, as events */
export function askEvents(a: LabAsk): ScenarioEvent[] {
  const asked = `asked-${a.id}`;
  const wait = a.wait ?? 3;
  const mine = (s: SimState) => s.role === askedRole(a);
  return [
    {
      id: `${a.id}-ask`,
      when: (s) => mine(s) && a.when(s),
      effect: () => ({ say: [['operator', a.ask]], flags: [asked] }),
    },
    {
      id: `${a.id}-wrong`,
      when: (s) => mine(s) && !!a.wrongSay && !has(s, a.gives) && doneAfter(s, a.wrong ?? [], asked) !== null,
      effect: () => ({ say: [['operator', a.wrongSay ?? '', 'warn']] }),
    },
    {
      id: `${a.id}-got`,
      when: (s) => mine(s) && !has(s, a.gives) && askDone(s, a) !== null,
      effect: () => ({ say: [['operator', a.thanks, 'good']], flags: [a.gives] }),
    },
    {
      id: `${a.id}-fallback`,
      when: (s) => mine(s) && has(s, asked) && !has(s, a.gives) && s.minute >= s.flags[asked] + wait,
      effect: () => ({ say: [['operator', a.fallback, 'warn']], flags: [a.gives] }),
    },
  ];
}

/** The learner's critical item for a request: the right answer within 2 minutes of it */
export function askCritical(a: LabAsk): Critical {
  return {
    id: `ask-${a.id}`, label: a.label, why: a.why, roles: [askedRole(a)], points: a.points ?? 5,
    done: (s) => askDone(s, a),
    target: { within: { flag: `asked-${a.id}`, minutes: a.within ?? 2 } },
    applies: (s) => has(s, `asked-${a.id}`),
  };
}

/** Handing the wrong thing after the operator asked */
export function askHarm(a: LabAsk, text: string, points = 3): Harm {
  return {
    id: `wrong-${a.id}`, actions: a.wrong ?? [], roles: [askedRole(a)], points, severity: 'minor', text,
    when: (s) => has(s, `asked-${a.id}`) && !has(s, a.gives),
  };
}

/**
 * A cine run. With a real angiogram for it, the learner sees the image and reads it (the preceptor checks
 * the read); until the app has one, the finding is said in words.
 */
export function cine(id: string, view: string, image: string | undefined, words: Line[], read: Omit<PendingRead, 'minute'>): Effect {
  return image
    ? { say: [['monitor', `Cine recorded: ${view}.`]], image: { id, view, image }, read }
    : { say: words, image: { id, view } };
}

/** The cardiologist needs arterial access and a diagnostic catheter before the angiogram */
export function angioGate(s: SimState): Effect | null {
  if (s.role !== 5) return null;
  if (!has(s, 'access')) return { blocked: true, say: [['system', 'No arterial access yet.']] };
  if (!has(s, 'catheter')) return { blocked: true, say: [['system', 'Choose a diagnostic catheter first (a Tiger does both coronaries from the radial; or a JL4 and a JR4).']] };
  return null;
}
