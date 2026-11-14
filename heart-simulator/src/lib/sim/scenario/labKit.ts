/**
 * Helpers for cath lab scenarios. In the lab the learner works inside a team. When they play the tech,
 * the (computer) operator asks for catheters, wires, balloons, stents and views and waits for the right
 * one; when they play the nurse, the operator orders drugs; when they play the cardiologist, the tech
 * and the nurse do their own jobs and every procedural choice is the learner's.
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { Critical, Effect, Harm, Line, PendingRead, ScenarioEvent, SimState, Speaker } from './types';
import { has, orderedFlag } from './kit';

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
/**
 * Intracoronary drugs that open the microvessels in no-reflow. Each one lowers the pressure, so with a low one
 * 'ic-epinephrine' is the drug; intracoronary nitroglycerin is not on the list: it dilates the large artery, not the bed beyond.
 */
export const NO_REFLOW_VASODILATORS = ['ic-adenosine', 'ic-verapamil', 'ic-nitroprusside'];

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

/**
 * The operator asks the learner for something: the tech for a device or a view, the nurse for a drug. The emergency
 * department uses the same pattern with the ED physician ordering and the ER nurse answering (edKit's edOrder).
 */
export interface LabAsk {
  /** short name, e.g. 'guide' (flags: asked-guide, then the `gives` flag) */
  id: string;
  /** who is asked (default: the tech) */
  role?: LearningLevel;
  /** who asks, thanks and steps in (default: the cath lab operator; the ED physician in the emergency department) */
  speaker?: Speaker;
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
  /**
   * What happens to the patient when the operator (or a teammate) does it after all — the drug given, the reading
   * taken — so the case goes on as the story says. Leave it out when `gives` alone moves the procedure on.
   */
  fallbackEffect?: (s: SimState) => Effect;
  /** flag set once the operator has what they asked for (the procedure then moves on) */
  gives: string;
  label: string;
  why: string;
  points?: number;
  /** minutes the operator waits before getting it themselves (default 3) */
  wait?: number;
  /** full marks if answered within this many minutes (default 2) */
  within?: number;
  /**
   * hold the request — the ask and the fallback — while the patient is in cardiac arrest (edKit's edOrder makes it the
   * default for an ED physician's order: the arrest comes first). An order meant for the arrest sets false. An order
   * asked before the arrest and still open is judged again at ROSC by its own `when`: still right, it goes on; no longer,
   * it is cancelled (the flag `cancelled:<id>`) — no fallback, its item dropped, and one line saying why (`cancelWhy`)
   */
  holdInArrest?: boolean;
  /** why the physician cancels the order when it no longer fits after an arrest (default: a general reason) */
  cancelWhy?: string | ((s: SimState) => string);
  /**
   * an ED physician's order for this many doses: once the learner has given an accepted action that many times since the
   * order, it is used up — `ordered:<id>` is cleared (after that dose's rules have judged it), so another dose needs
   * another order. Leave it out for an order that stays open (a titration)
   */
  doses?: number;
}

const askedRole = (a: LabAsk) => a.role ?? 3;
const asker = (a: LabAsk): Speaker => a.speaker ?? 'operator';

/**
 * While an ED physician's order is open, a wrong answer to it is scored by askHarm alone, not also as a drug given
 * without an order (engine RN_ORDER_ONLY): one mistake, one penalty. The flag lasts from the order until it is carried out
 */
export const wrongAnswerFlag = (askId: string, id: string) => `wrong-answer:${askId}:${id}`;

/** An open ED physician's order lists this action as a wrong answer to it (askHarm scores it) */
export const answeringWrong = (s: SimState, id: string) =>
  Object.keys(s.flags).some((f) => f.startsWith('wrong-answer:') && f.endsWith(`:${id}`));

/**
 * Minute the learner answered a request (a device opened early counts from the request), or null. Once the operator or a
 * teammate has done it after all (the fallback), the learner's answer after that is a second dose, not the answer
 */
export function askDone(s: SimState, a: LabAsk): number | null {
  const at = s.flags[`asked-${a.id}`];
  if (at === undefined) return null;
  if (s.fired.includes(`${a.id}-fallback`)) return null;
  const hit = s.performed.find((p) => a.accept.includes(p.id) && (a.early || p.minute >= at));
  return hit ? Math.max(hit.minute, at) : null;
}

/**
 * The request, the operator's word on a wrong answer, the thank-you and the fallback, as events. When the ED physician
 * asks (edKit's edOrder), the request is the order: it sets `ordered:<id>` for each right answer, so the ER nurse may give
 * it — and, with `doses`, it is used up once she has given that many
 */
export function askEvents(a: LabAsk): ScenarioEvent[] {
  const asked = `asked-${a.id}`;
  const wait = a.wait ?? 3;
  const mine = (s: SimState) => s.role === askedRole(a);
  // the arrest comes first: no new order, and no teammate stepping in, while there is no pulse
  const held = (s: SimState) => !!a.holdInArrest && !s.pulse;
  // an order asked before an arrest and still open: at ROSC it is judged again by its own `when` (resumed or cancelled)
  const heldFlag = `held:${a.id}`;
  const cancelled = cancelledFlag(a.id);
  const open = (s: SimState) => has(s, asked) && !has(s, a.gives) && !has(s, cancelled);
  const judged = (s: SimState) => !has(s, heldFlag) || has(s, `resumed:${a.id}`);
  const order = asker(a) === 'physician';
  const ordered = order ? a.accept.map(orderedFlag) : [];
  const wrongOpen = order ? (a.wrong ?? []).map((id) => wrongAnswerFlag(a.id, id)) : [];
  const given = (s: SimState) => s.performed.filter((p) => a.accept.includes(p.id) && p.minute >= s.flags[asked]).length;
  const used: ScenarioEvent[] = order && a.doses !== undefined ? [{
    id: `${a.id}-used`,
    when: (s) => mine(s) && has(s, asked) && given(s) >= a.doses!,
    effect: () => ({ clear: ordered }),
  }] : [];
  const rechecked: ScenarioEvent[] = a.holdInArrest ? [
    { id: `${a.id}-held`, when: (s) => mine(s) && !s.pulse && open(s), effect: () => ({ flags: [heldFlag] }) },
    {
      id: `${a.id}-recheck`,
      when: (s) => mine(s) && s.pulse && has(s, heldFlag) && open(s),
      effect: (s) => {
        if (a.when(s)) return { flags: [`resumed:${a.id}`] };
        const why = typeof a.cancelWhy === 'function' ? a.cancelWhy(s) : a.cancelWhy ?? 'after the arrest it no longer fits the patient';
        const clear = [...ordered, ...wrongOpen];
        // the item's label without its "on the physician's order" ending, as part of a sentence
        const what = a.label.replace(/[.,;:]?\s*(on the physician's order|as ordered)$/i, '');
        const order = /^[A-Z][a-z]/.test(what) ? `${what[0].toLowerCase()}${what.slice(1)}` : what;
        return { say: [['team', `After the arrest the physician cancels the order — ${order}: ${why}.`]], flags: [cancelled], ...(clear.length ? { clear } : {}) };
      },
    },
  ] : [];
  return [
    {
      id: `${a.id}-ask`,
      when: (s) => mine(s) && !held(s) && a.when(s),
      effect: () => ({ say: [[asker(a), a.ask]], flags: [asked, ...ordered, ...wrongOpen] }),
    },
    {
      id: `${a.id}-wrong`,
      when: (s) => mine(s) && !!a.wrongSay && !has(s, a.gives) && !has(s, cancelled) && doneAfter(s, a.wrong ?? [], asked) !== null,
      effect: () => ({ say: [[asker(a), a.wrongSay ?? '', 'warn']] }),
    },
    {
      id: `${a.id}-got`,
      when: (s) => mine(s) && !has(s, a.gives) && !has(s, cancelled) && askDone(s, a) !== null,
      effect: () => ({ say: [[asker(a), a.thanks, 'good']], flags: [a.gives], ...(wrongOpen.length ? { clear: wrongOpen } : {}) }),
    },
    ...rechecked,
    {
      id: `${a.id}-fallback`,
      when: (s) => mine(s) && !held(s) && open(s) && judged(s) && s.minute >= s.flags[asked] + wait,
      effect: (s) => {
        const done = a.fallbackEffect?.(s) ?? {};
        const clear = [...wrongOpen, ...(done.clear ?? [])];
        return { ...done, say: [[asker(a), a.fallback, 'warn'], ...(done.say ?? [])], flags: [a.gives, ...(done.flags ?? [])], ...(clear.length ? { clear } : {}) };
      },
    },
    ...used,
  ];
}

/** The flag an order cancelled after an arrest sets (askEvents: judged again at ROSC by its own `when`) */
export const cancelledFlag = (askId: string) => `cancelled:${askId}`;

/** The learner's critical item for a request: the right answer within 2 minutes of it (none once the order is cancelled) */
export function askCritical(a: LabAsk): Critical {
  return {
    id: `ask-${a.id}`, label: a.label, why: a.why, roles: [askedRole(a)], points: a.points ?? 5,
    done: (s) => askDone(s, a),
    uses: a.accept,
    target: { within: { flag: `asked-${a.id}`, minutes: a.within ?? 2 } },
    applies: (s) => has(s, `asked-${a.id}`) && !has(s, cancelledFlag(a.id)),
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
 * A cine run. With a real angiogram for it, the learner sees the image and reads it (the simulator checks
 * the read) — `alongside` says what the image does not show (e.g. the other coronary); without one, the
 * finding is said in words.
 */
export function cine(
  id: string, view: string, image: string | undefined, words: Line[], read: Omit<PendingRead, 'minute'>, alongside: Line[] = [],
): Effect {
  return image
    ? { say: [['monitor', `Cine recorded: ${view}.`], ...alongside], image: { id, view, image }, read }
    : { say: words, image: { id, view } };
}

/** The cardiologist needs arterial access and a diagnostic catheter before the angiogram */
export function angioGate(s: SimState): Effect | null {
  if (s.role !== 5) return null;
  if (!has(s, 'access')) return { blocked: true, say: [['system', 'No arterial access yet.']] };
  if (!has(s, 'catheter')) return { blocked: true, say: [['system', 'Choose a diagnostic catheter first (a Tiger does both coronaries from the radial; or a JL4 and a JR4).']] };
  return null;
}
