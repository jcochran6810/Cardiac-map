/**
 * Guided courses: short lessons made of steps. Each step explains one idea in plain words while the
 * app shows it — the 3D heart in the right view, the right rhythm on the 12-lead, the pressure
 * curves — and most steps end with a quick check.
 */
import type { ViewMode, LearningLevel } from '@/store/useAppStore';
import type { StandardLead } from '@/lib/ecg/vector';
import type { ECGProfileId, StructureId } from '@/types/content';

/**
 * What the app shows during a step.
 *
 * The scene — `rhythm`, `hr`, `heart`, `ecg`, `layout`, `flow`, `labels`, `vector`, `speed` — carries on from
 * the earlier steps of the lesson, so a step only names what changes. The pointers — `structure`, `highlight`,
 * `camera`, `lead`, `inspect`, `focus` — belong to their own step and are cleared by the next one.
 */
export interface StepShow {
  /** the rhythm on every tracing and on the beating heart */
  rhythm?: ECGProfileId;
  /** its rate, for rhythms whose rate can be set */
  hr?: number;
  /** the 3D heart in this view (false = put it away) */
  heart?: ViewMode | false;
  /** fly the camera to this structure and ring it (null = nothing selected) */
  structure?: StructureId | null;
  /** structures to light up without moving the camera */
  highlight?: StructureId[];
  /** a named camera angle: Front, Back, Left, Right, Top, Bottom, RAO, LAO, RAO Cr, AP Cr, LAO Cr, RAO Ca, Spider */
  camera?: string;
  /** blood-flow particles in the sectioned view */
  flow?: boolean;
  /** name tags on the 3D heart */
  labels?: boolean;
  /** the heart's electrical vector as an arrow on the 3D heart: it grows, turns and shrinks through each beat (longest along the QRS axis) */
  vector?: boolean;
  /** the bottom panel: the 12-lead, the pressure–volume curves, the monitor-defibrillator or the electrode lab (false = put it away) */
  ecg?: 'ecg' | 'wiggers' | 'defib' | 'lab' | false;
  /** how the 12-lead is laid out: live 12-lead, printout, or 3-lead monitor */
  layout?: 'simultaneous' | 'standard' | 'monitor';
  /** select a lead: it is outlined on the 12-lead and its line of sight is drawn through the 3D heart (null = none) */
  lead?: StandardLead | null;
  /** enlarge one lead with its waves and intervals marked (null = back to all leads) */
  inspect?: StandardLead | null;
  /** how fast the simulation runs (1 = real time) */
  speed?: 0.1 | 0.25 | 0.5 | 1;
  /** on a phone on its side there is room for one picture: which one this step needs most */
  focus?: 'heart' | 'ecg';
}

/** A multiple-choice question */
export interface ChoiceCheck {
  kind: 'choice';
  question: string;
  options: string[];
  /** index of the right option */
  answer: number;
  /**
   * The lesson shows the options in a shuffled order (the same order every time for the same question), so the
   * right answer's place in this list gives nothing away. Set `fixed` for options that only read well in the order
   * written — a numeric scale, "all of the above".
   */
  fixed?: boolean;
  /** the question is "work out the heart rate": the app hides its own rate numbers until it is answered */
  hideRate?: boolean;
  /** shown after any answer: why the right one is right */
  explain: string;
}

/** "Tap the … on the heart": the learner picks a structure on the 3D heart (or its name tag) */
export interface TapCheck {
  kind: 'tap';
  question: string;
  /** any of these structures is right (e.g. any segment of the artery asked for) */
  targets: StructureId[];
  explain: string;
}

/** "Tap a lead that …": the learner picks a lead on the 12-lead */
export interface LeadCheck {
  kind: 'lead';
  question: string;
  /** any of these leads is right */
  targets: StandardLead[];
  explain: string;
}

export type StepCheck = ChoiceCheck | TapCheck | LeadCheck;

export interface LessonStep {
  title: string;
  /** one to three short paragraphs in plain words */
  text: string[];
  /** what to watch for on screen right now */
  look?: string;
  show?: StepShow;
  check?: StepCheck;
  /** a line for one role only, within its scope of practice (1 EMT, 2 paramedic, 3 cath lab tech, 4 cath lab RN, 5 cardiologist) */
  roleNote?: Partial<Record<LearningLevel, string>>;
  /** library items to read afterwards (structure, condition, drug, procedure, cath lab or case-study ids) */
  more?: string[];
}

export interface Lesson {
  /** unique within its course */
  id: string;
  title: string;
  /** one line: what the learner will be able to do */
  goal: string;
  minutes: number;
  steps: LessonStep[];
}

export interface Course {
  id: string;
  title: string;
  /** one or two sentences for the course card */
  summary: string;
  /** the roles this course is written for first (anyone can take it) */
  roles: LearningLevel[];
  /** 'beginner': no background needed · 'core': the working knowledge · 'advanced': depth for those who want it */
  level: 'beginner' | 'core' | 'advanced';
  /** still being written: kept out of the course list */
  draft?: boolean;
  lessons: Lesson[];
}
