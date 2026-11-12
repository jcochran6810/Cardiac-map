/**
 * What a stethoscope would hear, as timed events: the two heart sounds, the extra sounds (S3, S4, an
 * opening snap) and the murmurs of each valve lesion. The times are the same valve events the Wiggers
 * diagram draws (its phonocardiogram trace), so what is heard lines up with what is seen.
 * Pure: `src/lib/audio/heartAudio.ts` turns these events into sound.
 */
import { cycleEvents, type ECGEngine } from '@/lib/ecg/engine';
import { HEMO_PROFILES, type HemoModel, type HemoParams } from '@/lib/physiology/hemodynamics';

export type SoundKind = 's1' | 's2' | 's3' | 's4' | 'snap';
export type MurmurKind = 'as' | 'hcm' | 'mr' | 'ms';

export interface HeartSound {
  /** simulation time (ms) */
  t: number;
  kind: SoundKind;
}

export interface Murmur {
  /** simulation time it starts and ends (ms) */
  t0: number;
  t1: number;
  kind: MurmurKind;
  /** mitral stenosis in sinus rhythm: the rumble swells again as the atrium contracts, just before S1 */
  presystolic?: boolean;
}

export interface Auscultation {
  sounds: HeartSound[];
  murmurs: Murmur[];
}

/** One line for the learner: what they are listening to */
export const MURMUR_TEXT: Record<MurmurKind, string> = {
  as: 'Harsh systolic murmur that swells and fades between S1 and S2 (aortic stenosis)',
  hcm: 'Systolic murmur that builds in mid-systole as the outflow obstruction develops (obstructive HCM)',
  mr: 'Blowing murmur that fills all of systole, from S1 to S2 (mitral regurgitation)',
  ms: 'Opening snap after S2, then a low diastolic rumble (mitral stenosis)',
};

function paramsAt(engine: ECGEngine, hemo: HemoModel, t: number): HemoParams {
  const base = HEMO_PROFILES[engine.segmentAt(t).profile.hemo] ?? HEMO_PROFILES.normal;
  const over = hemo.baseline;
  if (base.noOutput || !over) return base;
  return HEMO_PROFILES[over] ?? base;
}

/** Did an organised atrial contraction end just before this beat's mitral closure (so there is an atrial kick to hear)? */
function atrialKickBefore(engine: ECGEngine, mc: number): boolean {
  const rhythm = engine.segmentAt(mc).profile.rhythm;
  if (rhythm === 'af' || rhythm === 'flutter') return false;
  const ai = engine.lastAtrialIndex(mc - 20);
  if (ai < 0) return false;
  const a = engine.atrial[ai];
  const squeeze = a.t + 70;
  return a.kind === 'sinus' && squeeze > mc - 320 && squeeze < mc - 25;
}

/**
 * Everything that starts in the window (from, to]. Calling it for back-to-back windows returns each
 * sound exactly once, so a player can schedule a little ahead on every frame.
 */
export function auscultate(engine: ECGEngine, hemo: HemoModel, from: number, to: number): Auscultation {
  const out: Auscultation = { sounds: [], murmurs: [] };
  if (to <= from) return out;
  const vent = engine.vent;
  // a beat's sounds run on into the next beat's diastole: start a couple of beats back
  const first = Math.max(0, engine.lastVentIndex(from) - 2);
  const inWindow = (t: number) => t > from && t <= to;
  for (let i = first; i < vent.length && vent[i].t <= to; i++) {
    const v = vent[i];
    const next = i + 1 < vent.length ? vent[i + 1] : null;
    const p = paramsAt(engine, hemo, v.t);
    if (p.noOutput) continue;
    const ev = cycleEvents(v, next);
    const sound = (t: number, kind: SoundKind) => { if (inWindow(t)) out.sounds.push({ t, kind }); };
    sound(ev.mc + 12, 's1');
    sound(ev.ac + 6, 's2');
    // S3: the end of rapid filling into a dilated, volume-loaded ventricle
    if (p.s3 && (!next || ev.mo + 80 < ev.nextMc - 40)) sound(ev.mo + 80, 's3');
    // S4: the atrium contracting into a stiff ventricle, just before the NEXT S1
    if (p.s4 && next && atrialKickBefore(engine, ev.nextMc)) sound(ev.nextMc - 75, 's4');
    if (p.murmur === 'as' || p.murmur === 'hcm') {
      if (inWindow(ev.ao)) out.murmurs.push({ t0: ev.ao, t1: ev.ac, kind: p.murmur });
    } else if (p.murmur === 'mr') {
      if (inWindow(ev.mc + 20)) out.murmurs.push({ t0: ev.mc + 20, t1: ev.ac + 10, kind: 'mr' });
    } else if (p.murmur === 'ms') {
      sound(ev.mo + 4, 'snap');
      const end = next ? ev.nextMc : ev.mo + 600;
      if (inWindow(ev.mo + 40) && end > ev.mo + 90) out.murmurs.push({ t0: ev.mo + 40, t1: end, kind: 'ms', presystolic: !!next && atrialKickBefore(engine, ev.nextMc) });
    }
  }
  out.sounds.sort((a, b) => a.t - b.t);
  return out;
}

/** What is audible with this rhythm and heart, in the order it is heard — for the on-screen legend */
export function soundsHeard(engine: ECGEngine, hemo: HemoModel, t: number): { extra: SoundKind[]; murmur: MurmurKind | null; silent: boolean } {
  const p = paramsAt(engine, hemo, t);
  if (p.noOutput) return { extra: [], murmur: null, silent: true };
  const rhythm = engine.segmentAt(t).profile.rhythm;
  const kick = rhythm !== 'af' && rhythm !== 'flutter';
  const extra: SoundKind[] = [];
  if (p.s3) extra.push('s3');
  if (p.s4 && kick) extra.push('s4');
  if (p.murmur === 'ms') extra.push('snap');
  return { extra, murmur: p.murmur === 'none' ? null : p.murmur, silent: false };
}
