import type { Speaker, Setting, Tone } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';

export const SETTING_LABEL: Record<Setting, string> = { field: 'Ambulance call', cathlab: 'Cath lab' };

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

export function speakerName(who: Speaker, role: LearningLevel): string {
  switch (who) {
    case 'dispatch': return 'Dispatch';
    case 'scene': return 'On scene';
    case 'patient': return 'Patient';
    case 'partner': return role >= 3 ? 'Team' : 'Partner';
    case 'team': return 'Team';
    case 'operator': return 'Cardiologist';
    case 'monitor': return 'Monitor';
    case 'you': return 'You';
    case 'hospital': return 'Hospital';
    case 'system': return 'Simulator';
    case 'fto': return role <= 2 ? 'FTO' : 'Preceptor';
  }
}

export const SPEAKER_STYLE: Record<Speaker, string> = {
  dispatch: 'text-sky-300',
  scene: 'text-slate-300',
  patient: 'text-amber-300',
  partner: 'text-violet-300',
  team: 'text-violet-300',
  operator: 'text-fuchsia-300',
  monitor: 'text-emerald-300',
  you: 'text-cyan-300',
  hospital: 'text-sky-300',
  system: 'text-slate-400',
  fto: 'text-orange-300',
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
