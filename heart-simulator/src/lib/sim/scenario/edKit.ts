/**
 * Helpers for emergency department scenarios (setting 'ed', roles 6 and 7). In the ED the learner works inside a team.
 * When they play the ER nurse, the (computer) ED physician examines, decides and gives the orders — the nurse carries
 * them out, reports back and speaks up; when they play the ER doctor, a computer nurse does the nursing (the monitor, the
 * line, the drugs on the doctor's order) and every medical decision is the learner's: the diagnosis, the procedures, the
 * fibrinolytic, the cath lab, the consult and where the patient goes.
 *
 * A case's voices: 'physician' (the ED physician, in the nurse's cases), 'nurse' (in the doctor's cases), 'team',
 * 'consultant' (cardiology), 'ems' (the crew that brought the patient), 'hospital' (the cath lab, radiology, the bed
 * board), 'patient' and 'monitor' — never the cath lab 'operator', and never the field's 'dispatch', 'scene' or 'partner'.
 *
 * The flags the engine sets in the ED: 'triage' (and 'esi-1' / 'esi-2'), 'ems-report', 'physician-notified', 'cxr',
 * 'pocus', 'ct', 'central' (with 'venous' and 'iv'), 'rsi' (with 'airway'), 'procedural-sedation' (with 'sedation'),
 * 'consult', 'troponin-repeat', 'alert' or 'alert-declined' (cath lab activation), 'cath-ready' (the team is ready:
 * Scenario.cathLabMinutes), 'admit', 'transfer' and 'dispo' (any decision on where the patient goes: the hand-off waits for it).
 *
 * Orders, in the ER nurse's runs (role 6). The nurse gives a medication only on a provider's order or a standing order
 * (state Nurse Practice Act, ENA, facility policy): every drug in the engine's RN_ORDER_ONLY list given in the ED with no
 * order costs points ('rn-without-order-<id>'), unless the flag `ordered:<id>` (kit's orderedFlag) is set first. The ED
 * physician's order sets it: edOrder (with askEvents) when the order is given, physicianOrder or physicianDispo in a case
 * event, standingOrders for what the department's protocol already covers. Needing no order: the chest pain standing order
 * (aspirin, nitroglycerin 0.4 mg, oxygen, the monitor, the 12-lead, an IV, labs and the serial troponin, the chest film),
 * the ACLS drugs in an arrest (epinephrine, amiodarone, lidocaine) and the shocks, and the other protocols the department
 * runs (glucose, the antiemetic, the anaphylaxis and bronchospasm drugs).
 *
 * The 12-lead in the ER doctor's runs: either the doctor records it ('ecg12'), or a computer-nurse event sets the flag
 * 'ecg12' — the engine then treats it as a recorded tracing (the doctor reads it, a STEMI on it sets 'ecg-stemi' for the
 * cath lab activation and the fibrinolytic rule), and DOOR_TO_ECG counts it (give such an event no read of its own: the
 * engine asks for it). The doctor's own measure is the read and the decision: ECG_TO_ACTIVATION, and DOOR_TO_NEEDLE for a
 * fibrinolytic.
 *
 * The ER doctor's procedures carry built-in indication rules in the ED, so a case where one is right says so: a
 * pericardiocentesis needs 'tamponade' in Scenario.problems (and, with a pulse, the physician's 'pocus' first); a
 * fibrinolytic a STEMI on a recorded 12-lead or 'pulmonary-embolism'; RSI the monitor and a reason (a GCS under 13, an
 * SpO₂ under 92, a breathing rate under 10 or over 30, or a low pressure — a case with another reason replaces
 * 'rsi-no-indication' in its own words); a transvenous wire a rate under 50.
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { Effect, ScenarioEvent, SimState, Speaker, Timing } from './types';
import type { LabAsk } from './labKit';
import { has, orderedFlag } from './kit';

/** Roles a scenario item applies to, by name */
export const ED_RN: LearningLevel[] = [6];
export const ED_MD: LearningLevel[] = [7];
export const ED_TEAM: LearningLevel[] = [6, 7];

/** Who makes the medical decision in this run: the learner (the ER doctor) or the computer ED physician */
export const edPhysician = (s: SimState): Speaker => (s.role === 7 ? 'you' : 'physician');

/** Who does the nursing in this run: the learner (the ER nurse) or the computer ED nurse */
export const edNurse = (s: SimState): Speaker => (s.role === 6 ? 'you' : 'nurse');

/** Someone has decided where the patient goes (the cath lab, admission, a transfer) */
export const dispo = (s: SimState) => has(s, 'dispo');

/**
 * The computer physician decides where the patient goes, in a nurse's case (a case event's effect): it sets 'dispo' and
 * the destination's flag, so the nurse's hand-off can follow. `cathLab`: the lab is activated and ready in `minutes`.
 * `orders`: the drugs the physician orders with it (e.g. heparin and the P2Y12 before the lab), which the nurse may then give
 */
export function physicianDispo(s: SimState, where: 'admit' | 'transfer' | 'cathLab', text: string, minutes = 0, orders: string[] = []): Effect {
  const ordered = orders.map(orderedFlag);
  if (where === 'cathLab') return { say: [['physician', text]], flags: ['dispo', 'alert', ...ordered], timers: { cathReady: s.minute + minutes } };
  return { say: [['physician', text]], flags: ['dispo', where, ...ordered] };
}

/** The ED physician orders these actions, in a nurse's case (a case event's effect): `ordered:<id>` for each */
export function physicianOrder(text: string, ids: string[]): Effect {
  return { say: [['physician', text]], flags: ids.map(orderedFlag) };
}

/**
 * The department's standing orders or protocol for this patient, in force from arrival (a case event): the drugs the
 * nurse may give without asking, beyond the chest pain standing order the engine already allows (e.g. a STEMI protocol's
 * heparin and P2Y12 once the physician has read the 12-lead)
 */
export function standingOrders(ids: string[], when: (s: SimState) => boolean = () => true): ScenarioEvent {
  return { id: 'standing-orders', when, effect: () => ({ flags: ids.map(orderedFlag) }) };
}

/**
 * An order from the ED physician that the ER nurse carries out — labKit's LabAsk with the physician as the one who asks:
 * use it with askEvents, askCritical and askHarm exactly as in a cath lab case (the item is the nurse's: roles [6])
 */
export function edOrder(a: Omit<LabAsk, 'role' | 'speaker'>): LabAsk {
  return { ...a, role: 6, speaker: 'physician' };
}

/**
 * The time goals of an ED chest pain case, from arrival (minute 0): a 12-lead within 10 minutes (2021 AHA/ACC chest pain
 * guideline). It counts the learner's own 'ecg12' or the flag a computer-nurse event sets, so in the ER doctor's runs it
 * scores the team's time, not who recorded it: the doctor's own measure is the read and the decision (ECG_TO_ACTIVATION)
 */
export const DOOR_TO_ECG: Timing = { label: 'Door to 12-lead', actions: ['ecg12'], flag: 'ecg12', target: 10 };

/**
 * A STEMI that cannot reach PCI in time: the fibrinolytic within 30 minutes of arrival (2025 ACC/AHA ACS guideline). The
 * timing counts the first dose of 'tnk' (or a flag the case sets when the computer physician gives it)
 */
export const DOOR_TO_NEEDLE: Timing = { label: 'Door to fibrinolytic', actions: ['tnk', 'alteplase'], flag: 'lytic', target: 30 };

/** The ED's part of door-to-balloon: STEMI on the 12-lead to the cath lab activated (the flag 'alert') — as early as possible */
export const ECG_TO_ACTIVATION: Timing = { label: '12-lead to cath lab activation', actions: ['cath-lab-activate'], flag: 'alert', from: 'ecg12' };
