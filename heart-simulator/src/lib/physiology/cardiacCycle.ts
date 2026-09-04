/**
 * Cardiac Cycle Physiology Engine
 * Models chamber volumes, pressures, valve states, and blood flow timing.
 *
 * Timing is taken from the shared cycle table (`cycleTiming.ts`), so the
 * pressure curves line up with the ECG playhead and the 3D contraction.
 * `cycleProgress` is the ventricular beat progress (0 = beat start; values
 * above 1 mean the beat's events are over and the ventricle is in diastasis).
 */

import { MECH } from './cycleTiming';

export interface ChamberState {
  volume: number;       // mL
  pressure: number;     // mmHg
  wallStress: number;   // normalized 0-1
  contracting: boolean;
  filling: boolean;
}

export interface ValveState {
  open: boolean;
  regurgitant: boolean;
  stenotic: boolean;
  gradientMmHg: number;
  openFraction: number; // 0=closed, 1=fully open
}

export interface HemodynamicSnapshot {
  time: number;
  phase: string;
  lv: ChamberState;
  rv: ChamberState;
  la: ChamberState;
  ra: ChamberState;
  mitralValve: ValveState;
  aorticValve: ValveState;
  tricuspidValve: ValveState;
  pulmonaryValve: ValveState;
  aorticPressure: number;
  paPressure: number;
  laPressure: number;
  cvp: number;
  strokeVolume: number;
  ejectionFraction: number;
  cardiacOutput: number;
}

export interface CycleParams {
  heartRate: number;
  lvEDV: number;   // end-diastolic volume
  lvESV: number;   // end-systolic volume
  rvEDV: number;
  rvESV: number;
  aorticSystolic: number;
  aorticDiastolic: number;
  paSystolic: number;
  paDiastolic: number;
  cvp: number;
  laP: number;
  /** Peak-to-peak gradient across the aortic valve (stenosis), mmHg. */
  aorticGradient: number;
  /** Mean gradient across the mitral valve (stenosis), mmHg. */
  mitralGradient: number;
  mitralRegurgitant: boolean;
  aorticRegurgitant: boolean;
  /** Fraction of LV filling contributed by atrial contraction. */
  atrialKickFraction: number;
}

export const NORMAL_PARAMS: CycleParams = {
  heartRate: 72,
  lvEDV: 120,
  lvESV: 50,
  rvEDV: 130,
  rvESV: 60,
  aorticSystolic: 120,
  aorticDiastolic: 80,
  paSystolic: 25,
  paDiastolic: 10,
  cvp: 5,
  laP: 8,
  aorticGradient: 0,
  mitralGradient: 0,
  mitralRegurgitant: false,
  aorticRegurgitant: false,
  atrialKickFraction: 0.2,
};

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Compute hemodynamic snapshot at a given point in the cardiac cycle.
 * @param cycleProgress ventricular beat progress (0..1+, see module docs)
 * @param params hemodynamic parameters
 * @param options.atrialKick whether the atria contracted this beat (false in AF / dropped P)
 */
export function computeHemodynamics(
  cycleProgress: number,
  params: CycleParams = NORMAL_PARAMS,
  options: { atrialKick?: boolean; ventricularBeat?: boolean } = {},
): HemodynamicSnapshot {
  const atrialKick = options.atrialKick !== false;
  const ventricularBeat = options.ventricularBeat !== false;
  const p = ventricularBeat ? cycleProgress : 2; // no QRS → stays in diastole
  const sv = params.lvEDV - params.lvESV;
  const ef = sv / params.lvEDV;
  const co = (sv * params.heartRate) / 1000;

  const kick = atrialKick ? sv * params.atrialKickFraction : 0;
  const passiveFill = params.lvEDV - kick;              // volume reached by passive filling
  const preKickVolume = passiveFill;

  let lvPressure: number;
  let lvVolume: number;
  let lvContracting = false;
  let lvFilling = false;
  let mitralOpen = false;
  let aorticOpen = false;
  let phase: string;

  const peakLV = params.aorticSystolic + params.aorticGradient;
  const laMean = params.laP + params.mitralGradient;

  if (p < MECH.atrialStart) {
    phase = 'Diastasis';
    lvPressure = laMean - 1;
    lvVolume = preKickVolume - 4 + 4 * (p / MECH.atrialStart);
    lvFilling = true;
    mitralOpen = true;
  } else if (p < MECH.atrialEnd) {
    phase = atrialKick ? 'Atrial Systole' : 'Late Diastole (no atrial kick)';
    const s = smooth((p - MECH.atrialStart) / (MECH.atrialEnd - MECH.atrialStart));
    lvPressure = laMean - 1 + (atrialKick ? 5 * s : 0);
    lvVolume = preKickVolume + kick * s;
    lvFilling = true;
    mitralOpen = true;
  } else if (p < MECH.ivcStart) {
    phase = 'End Diastole';
    lvPressure = laMean + (atrialKick ? 3 : 0);
    lvVolume = params.lvEDV;
    mitralOpen = true;
  } else if (p < MECH.ejectStart) {
    phase = 'Isovolumetric Contraction';
    const s = smooth((p - MECH.ivcStart) / (MECH.ejectStart - MECH.ivcStart));
    lvPressure = (laMean + 4) + (params.aorticDiastolic - laMean - 4) * s;
    lvVolume = params.lvEDV;
    lvContracting = true;
    mitralOpen = params.mitralRegurgitant; // MR: mitral leaks during IVC
  } else if (p < MECH.reducedStart) {
    phase = 'Rapid Ejection';
    const s = (p - MECH.ejectStart) / (MECH.reducedStart - MECH.ejectStart);
    lvPressure = params.aorticDiastolic + (peakLV - params.aorticDiastolic) * Math.sin(s * Math.PI * 0.55);
    lvVolume = params.lvEDV - sv * 0.7 * smooth(s);
    lvContracting = true;
    aorticOpen = true;
  } else if (p < MECH.ivrStart) {
    phase = 'Reduced Ejection';
    const s = (p - MECH.reducedStart) / (MECH.ivrStart - MECH.reducedStart);
    lvPressure = peakLV * (1 - 0.12 * s) - (peakLV - params.aorticDiastolic) * 0.55 * s * s;
    lvVolume = params.lvEDV - sv * 0.7 - sv * 0.3 * smooth(s);
    lvContracting = true;
    aorticOpen = true;
  } else if (p < MECH.fillStart) {
    phase = 'Isovolumetric Relaxation';
    const s = smooth((p - MECH.ivrStart) / (MECH.fillStart - MECH.ivrStart));
    const start = Math.max(params.aorticDiastolic - 10, laMean + 10);
    lvPressure = start * (1 - s) + (laMean - 3) * s;
    lvVolume = params.lvESV;
    aorticOpen = params.aorticRegurgitant;
  } else if (p < MECH.diastasisStart) {
    phase = 'Rapid Filling';
    const s = (p - MECH.fillStart) / (MECH.diastasisStart - MECH.fillStart);
    lvPressure = laMean - 3 + 2 * s;
    lvVolume = params.lvESV + (preKickVolume - 4 - params.lvESV) * 0.8 * (1 - Math.pow(1 - s, 2.2));
    lvFilling = true;
    mitralOpen = true;
  } else {
    phase = 'Diastasis';
    const s = clamp01((p - MECH.diastasisStart) / 0.4);
    lvPressure = laMean - 1 + 0.5 * s;
    lvVolume = params.lvESV + (preKickVolume - 4 - params.lvESV) * (0.8 + 0.2 * s);
    lvFilling = true;
    mitralOpen = true;
  }

  // RV mirrors LV with lower pressures and the same timing
  const rvSV = params.rvEDV - params.rvESV;
  const rvKick = atrialKick ? rvSV * params.atrialKickFraction : 0;
  const rvPreKick = params.rvEDV - rvKick;
  let rvPressure: number;
  let rvVolume: number;
  let pulmonaryOpen = false;
  let tricuspidOpen = false;

  if (p < MECH.atrialEnd) {
    const s = p < MECH.atrialStart ? 0 : smooth((p - MECH.atrialStart) / (MECH.atrialEnd - MECH.atrialStart));
    rvPressure = params.cvp - 1 + (atrialKick ? 3 * s : 0);
    rvVolume = rvPreKick + rvKick * s;
    tricuspidOpen = true;
  } else if (p < MECH.ivcStart) {
    rvPressure = params.cvp + 1;
    rvVolume = params.rvEDV;
    tricuspidOpen = true;
  } else if (p < MECH.ejectStart) {
    const s = smooth((p - MECH.ivcStart) / (MECH.ejectStart - MECH.ivcStart));
    rvPressure = (params.cvp + 2) + (params.paDiastolic - params.cvp - 2) * s;
    rvVolume = params.rvEDV;
  } else if (p < MECH.ivrStart) {
    const s = (p - MECH.ejectStart) / (MECH.ivrStart - MECH.ejectStart);
    rvPressure = params.paDiastolic + (params.paSystolic - params.paDiastolic) * Math.sin(s * Math.PI * 0.9);
    rvVolume = params.rvEDV - rvSV * smooth(s);
    pulmonaryOpen = true;
  } else if (p < MECH.fillStart) {
    const s = smooth((p - MECH.ivrStart) / (MECH.fillStart - MECH.ivrStart));
    rvPressure = (params.paDiastolic - 4) * (1 - s) + (params.cvp - 2) * s;
    rvVolume = params.rvESV;
  } else {
    const s = clamp01((p - MECH.fillStart) / (1.2 - MECH.fillStart));
    rvPressure = params.cvp - 2 + 1.5 * s;
    rvVolume = params.rvESV + (rvPreKick - params.rvESV) * (1 - Math.pow(1 - s, 2));
    tricuspidOpen = true;
  }

  // Aortic pressure: follows LV during ejection, then decays exponentially (Windkessel)
  let aorticPressure: number;
  if (aorticOpen && !params.aorticRegurgitant) {
    aorticPressure = lvPressure - params.aorticGradient * Math.max(0, Math.sin(((p - MECH.ejectStart) / (MECH.ivrStart - MECH.ejectStart)) * Math.PI));
  } else {
    const sinceClose = p >= MECH.ivrStart ? p - MECH.ivrStart : p + (1.2 - MECH.ivrStart);
    const dicrotic = sinceClose < 0.04 ? 6 * Math.sin((sinceClose / 0.04) * Math.PI) : 0;
    const peak = params.aorticSystolic;
    const decayed = params.aorticDiastolic + (peak * 0.9 - params.aorticDiastolic) * Math.exp(-sinceClose * 5.5);
    aorticPressure = Math.max(params.aorticDiastolic, decayed) + dicrotic;
  }

  const paPressure = pulmonaryOpen
    ? rvPressure
    : params.paDiastolic + (params.paSystolic * 0.85 - params.paDiastolic) * Math.exp(-((p >= MECH.ivrStart ? p - MECH.ivrStart : p + 0.6)) * 5);

  // Atrial pressures: v wave rising while the AV valves are closed, a wave with the kick
  const laPressure = laMean
    + (atrialKick && p >= MECH.atrialStart && p < MECH.atrialEnd ? 4 * Math.sin(((p - MECH.atrialStart) / (MECH.atrialEnd - MECH.atrialStart)) * Math.PI) : 0)
    + (!mitralOpen ? 3 * clamp01((p - MECH.ivcStart) / (MECH.fillStart - MECH.ivcStart)) : 0)
    + (params.mitralRegurgitant && lvContracting ? 12 : 0);

  const atrialContracting = atrialKick && p >= MECH.atrialStart && p < MECH.atrialEnd;

  return {
    time: cycleProgress,
    phase,
    lv: { volume: lvVolume, pressure: lvPressure, wallStress: lvContracting ? 0.8 : 0.2, contracting: lvContracting, filling: lvFilling },
    rv: { volume: rvVolume, pressure: rvPressure, wallStress: lvContracting ? 0.6 : 0.15, contracting: lvContracting, filling: tricuspidOpen },
    la: {
      volume: mitralOpen ? 40 - 10 * (lvFilling ? 1 : 0) : 40 + 20 * clamp01((p - MECH.ivcStart) / 0.36),
      pressure: laPressure, wallStress: atrialContracting ? 0.5 : 0.1, contracting: atrialContracting, filling: !mitralOpen,
    },
    ra: {
      volume: tricuspidOpen ? 35 - 8 * (tricuspidOpen ? 1 : 0) : 35 + 15 * clamp01((p - MECH.ivcStart) / 0.36),
      pressure: params.cvp + (atrialContracting ? 2 : 0), wallStress: atrialContracting ? 0.4 : 0.1, contracting: atrialContracting, filling: !tricuspidOpen,
    },
    mitralValve: { open: mitralOpen, regurgitant: params.mitralRegurgitant, stenotic: params.mitralGradient > 0, gradientMmHg: params.mitralGradient, openFraction: mitralOpen ? 1 : 0 },
    aorticValve: { open: aorticOpen, regurgitant: params.aorticRegurgitant, stenotic: params.aorticGradient > 0, gradientMmHg: params.aorticGradient, openFraction: aorticOpen ? 1 : 0 },
    tricuspidValve: { open: tricuspidOpen, regurgitant: false, stenotic: false, gradientMmHg: 0, openFraction: tricuspidOpen ? 1 : 0 },
    pulmonaryValve: { open: pulmonaryOpen, regurgitant: false, stenotic: false, gradientMmHg: 0, openFraction: pulmonaryOpen ? 1 : 0 },
    aorticPressure,
    paPressure,
    laPressure,
    cvp: params.cvp,
    strokeVolume: sv,
    ejectionFraction: ef,
    cardiacOutput: co,
  };
}

/**
 * Hemodynamic parameter presets keyed by condition id (the ids used in the
 * conditions panel) with a few aliases. Unknown ids return normal values.
 */
const CONDITION_HEMODYNAMICS: Record<string, Partial<CycleParams>> = {
  'aortic-stenosis': { aorticSystolic: 110, aorticDiastolic: 75, lvEDV: 125, lvESV: 55, aorticGradient: 60, laP: 12 },
  'mitral-regurgitation': { lvEDV: 160, lvESV: 55, laP: 18, mitralRegurgitant: true, aorticSystolic: 115 },
  'mitral-stenosis': { lvEDV: 95, lvESV: 40, laP: 22, mitralGradient: 10, paSystolic: 45, paDiastolic: 20 },
  'hfref': { lvEDV: 190, lvESV: 140, aorticSystolic: 100, aorticDiastolic: 70, laP: 18, cvp: 10 },
  'heart-failure': { lvEDV: 190, lvESV: 140, aorticSystolic: 100, aorticDiastolic: 70, laP: 18, cvp: 10 },
  'hfpef': { lvEDV: 95, lvESV: 35, aorticSystolic: 150, aorticDiastolic: 90, laP: 20, atrialKickFraction: 0.35 },
  'dilated-cardiomyopathy': { lvEDV: 230, lvESV: 175, aorticSystolic: 95, aorticDiastolic: 65, laP: 20, cvp: 10 },
  'hcm': { lvEDV: 90, lvESV: 25, aorticSystolic: 125, aorticDiastolic: 80, laP: 16, aorticGradient: 45, atrialKickFraction: 0.35 },
  'takotsubo': { lvEDV: 150, lvESV: 100, aorticSystolic: 95, aorticDiastolic: 60, laP: 16 },
  'cardiogenic-shock': { lvEDV: 200, lvESV: 170, aorticSystolic: 75, aorticDiastolic: 50, cvp: 15, laP: 26, paSystolic: 45, paDiastolic: 25 },
  'cardiac-tamponade': { lvEDV: 75, lvESV: 40, rvEDV: 75, rvESV: 45, aorticSystolic: 85, aorticDiastolic: 65, cvp: 18, laP: 18 },
  'tamponade': { lvEDV: 75, lvESV: 40, rvEDV: 75, rvESV: 45, aorticSystolic: 85, aorticDiastolic: 65, cvp: 18, laP: 18 },
  'pulmonary-hypertension': { paSystolic: 60, paDiastolic: 30, rvEDV: 170, rvESV: 110 },
  'hypertension': { aorticSystolic: 170, aorticDiastolic: 100, lvEDV: 140, lvESV: 55 },
  'sinus-tachycardia': { lvEDV: 105, lvESV: 45 },
  'atrial-fibrillation': { lvEDV: 110, lvESV: 50, laP: 12, atrialKickFraction: 0 },
  'atrial-flutter': { lvEDV: 108, lvESV: 50, laP: 12, atrialKickFraction: 0 },
  'anterior-stemi': { lvEDV: 135, lvESV: 80, aorticSystolic: 105, aorticDiastolic: 70, laP: 16 },
  'inferior-stemi': { lvEDV: 125, lvESV: 62, aorticSystolic: 100, aorticDiastolic: 65, cvp: 12 },
  'lateral-stemi': { lvEDV: 128, lvESV: 65, aorticSystolic: 110, aorticDiastolic: 72 },
  'monomorphic-vt': { lvEDV: 100, lvESV: 60, aorticSystolic: 85, aorticDiastolic: 55, atrialKickFraction: 0 },
  'ventricular-fibrillation': { lvEDV: 120, lvESV: 118, aorticSystolic: 30, aorticDiastolic: 20, atrialKickFraction: 0 },
  'third-degree-av-block': { lvEDV: 150, lvESV: 60, aorticSystolic: 130, aorticDiastolic: 60 },
  'sinus-bradycardia': { lvEDV: 140, lvESV: 55, aorticSystolic: 125, aorticDiastolic: 70 },
  'asd': { rvEDV: 170, rvESV: 80, paSystolic: 35, paDiastolic: 15 },
  'vsd': { lvEDV: 145, lvESV: 55, paSystolic: 40, paDiastolic: 18 },
  'acute-pericarditis': { laP: 10 },
};

/** Get default or condition-modified hemodynamic parameters. */
export function getConditionParams(conditionId: string | null | undefined, heartRate?: number): CycleParams {
  const mods = conditionId ? CONDITION_HEMODYNAMICS[conditionId] || {} : {};
  const params = { ...NORMAL_PARAMS, ...mods };
  if (heartRate) params.heartRate = heartRate;
  return params;
}

export function hasHemodynamicPreset(conditionId: string): boolean {
  return conditionId in CONDITION_HEMODYNAMICS;
}
