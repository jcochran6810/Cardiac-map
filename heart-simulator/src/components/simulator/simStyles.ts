import type { Speaker, Setting, Tone } from '@/lib/sim/scenario/types';
import { ROLE_SETTING, type LearningLevel } from '@/store/useAppStore';

export const SETTING_LABEL: Record<Setting, string> = { field: 'Ambulance call', ed: 'Emergency department', cathlab: 'Cath lab' };

export const DIFFICULTY_STYLE: Record<string, string> = {
  beginner: 'text-emerald-300 border-emerald-500/40',
  intermediate: 'text-yellow-300 border-yellow-500/40',
  advanced: 'text-orange-300 border-orange-500/40',
};

export function gradeStyle(percent: number) {
  if (percent >= 90) return { text: 'text-emerald-300', ring: '#34d399', box: 'border-emerald-500/40 bg-emerald-500/10' };
  if (percent >= 75) return { text: 'text-sky-300', ring: '#38bdf8', box: 'border-sky-500/40 bg-sky-500/10' };
  if (percent >= 50) return { text: 'text-amber-300', ring: '#fbbf24', box: 'border-amber-500/40 bg-amber-500/10' };
  return { text: 'text-red-300', ring: '#f87171', box: 'border-red-500/40 bg-red-500/10' };
}

/**
 * The name over a line in the case story. 'operator' is the cath lab's cardiologist at the table; the emergency
 * department speaks with its own voices (the ED physician, the nurse, the cardiology consultant, the EMS crew)
 */
export function speakerName(who: Speaker, role: LearningLevel): string {
  switch (who) {
    case 'dispatch': return 'Dispatch';
    case 'scene': return 'On scene';
    case 'patient': return 'Patient';
    // the crew partner in the ambulance; anywhere else the people beside you are the team
    case 'partner': return ROLE_SETTING[role] === 'field' ? 'Partner' : 'Team';
    case 'team': return 'Team';
    case 'operator': return 'Cardiologist';
    case 'physician': return 'ED physician';
    case 'nurse': return 'Nurse';
    case 'consultant': return 'Cardiology';
    case 'ems': return 'EMS crew';
    case 'monitor': return 'Monitor';
    case 'you': return 'You';
    case 'hospital': return 'Hospital';
    case 'system': return 'Simulator';
    case 'feedback': return 'Feedback';
  }
}

export const SPEAKER_STYLE: Record<Speaker, string> = {
  dispatch: 'text-sky-300',
  scene: 'text-slate-300',
  patient: 'text-amber-300',
  partner: 'text-violet-300',
  team: 'text-violet-300',
  operator: 'text-fuchsia-300',
  physician: 'text-fuchsia-300',
  nurse: 'text-violet-300',
  consultant: 'text-indigo-300',
  ems: 'text-sky-300',
  monitor: 'text-emerald-300',
  you: 'text-cyan-300',
  hospital: 'text-sky-300',
  system: 'text-slate-400',
  feedback: 'text-orange-300',
};

export const TONE_STYLE: Record<Tone, string> = {
  info: 'border-slate-700',
  good: 'border-emerald-500/50 bg-emerald-500/5',
  warn: 'border-amber-500/50 bg-amber-500/5',
  bad: 'border-red-500/60 bg-red-500/10',
};

/** 0.5 → "30 s", 2 → "2 min" */
export function durationText(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  const whole = Math.floor(minutes);
  const half = minutes - whole >= 0.5 ? '½' : '';
  return `${whole}${half} min`;
}
