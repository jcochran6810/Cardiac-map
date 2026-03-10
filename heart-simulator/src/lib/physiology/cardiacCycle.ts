/**
 * Cardiac Cycle Physiology Engine
 * Models chamber volumes, pressures, valve states, and blood flow timing.
 */

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
}

const NORMAL_PARAMS: CycleParams = {
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
};

/**
 * Compute hemodynamic snapshot at a given point in the cardiac cycle.
 * @param cycleProgress 0 to 1 representing one full cardiac cycle
 * @param params hemodynamic parameters
 */
export function computeHemodynamics(
  cycleProgress: number,
  params: CycleParams = NORMAL_PARAMS
): HemodynamicSnapshot {
  const p = cycleProgress;
  const sv = params.lvEDV - params.lvESV;
  const ef = sv / params.lvEDV;
  const co = (sv * params.heartRate) / 1000;

  // LV pressure and volume modeling
  let lvPressure: number;
  let lvVolume: number;
  let lvContracting = false;
  let lvFilling = false;

  // Valve states
  let mitralOpen = false;
  let aorticOpen = false;
  let tricuspidOpen = false;
  let pulmonaryOpen = false;

  let phase: string;

  if (p < 0.11) {
    // Atrial systole — late diastolic filling
    phase = 'Atrial Systole';
    lvPressure = 5 + 7 * (p / 0.11);
    lvVolume = params.lvEDV - 15 + 15 * (p / 0.11);
    lvFilling = true;
    mitralOpen = true;
    tricuspidOpen = true;
  } else if (p < 0.16) {
    // Isovolumetric contraction
    phase = 'Isovolumetric Contraction';
    const subP = (p - 0.11) / 0.05;
    lvPressure = 12 + (params.aorticDiastolic - 12) * subP;
    lvVolume = params.lvEDV;
    lvContracting = true;
  } else if (p < 0.30) {
    // Rapid ejection
    phase = 'Rapid Ejection';
    const subP = (p - 0.16) / 0.14;
    lvPressure = params.aorticSystolic * (1 - 0.1 * subP);
    lvVolume = params.lvEDV - sv * 0.7 * subP;
    lvContracting = true;
    aorticOpen = true;
    pulmonaryOpen = true;
  } else if (p < 0.40) {
    // Reduced ejection
    phase = 'Reduced Ejection';
    const subP = (p - 0.30) / 0.10;
    lvPressure = params.aorticSystolic * 0.9 - 30 * subP;
    lvVolume = params.lvEDV - sv * 0.7 - sv * 0.3 * subP;
    lvContracting = true;
    aorticOpen = true;
    pulmonaryOpen = true;
  } else if (p < 0.47) {
    // Isovolumetric relaxation
    phase = 'Isovolumetric Relaxation';
    const subP = (p - 0.40) / 0.07;
    lvPressure = (params.aorticDiastolic - 30) * (1 - subP) + params.laP * subP;
    lvVolume = params.lvESV;
  } else if (p < 0.60) {
    // Rapid filling
    phase = 'Rapid Filling';
    const subP = (p - 0.47) / 0.13;
    lvPressure = params.laP - 3 + 5 * subP;
    lvVolume = params.lvESV + (params.lvEDV - params.lvESV - 15) * 0.7 * subP;
    lvFilling = true;
    mitralOpen = true;
    tricuspidOpen = true;
  } else {
    // Diastasis
    phase = 'Diastasis';
    const subP = (p - 0.60) / 0.29;
    lvPressure = params.laP + 2 * subP;
    lvVolume = params.lvESV + (params.lvEDV - params.lvESV - 15) * 0.7 +
      (params.lvEDV - params.lvESV - 15) * 0.3 * subP;
    lvFilling = true;
    mitralOpen = true;
    tricuspidOpen = true;
  }

  // RV mirrors LV with lower pressures
  const rvPressureScale = params.paSystolic / params.aorticSystolic;
  const rvSV = params.rvEDV - params.rvESV;

  let rvPressure: number;
  let rvVolume: number;
  if (p < 0.11) {
    rvPressure = 3 + 4 * (p / 0.11);
    rvVolume = params.rvEDV - 15 + 15 * (p / 0.11);
  } else if (p < 0.16) {
    const subP = (p - 0.11) / 0.05;
    rvPressure = 7 + (params.paDiastolic - 7) * subP;
    rvVolume = params.rvEDV;
  } else if (p < 0.40) {
    const subP = (p - 0.16) / 0.24;
    rvPressure = params.paSystolic * (1 - 0.2 * subP);
    rvVolume = params.rvEDV - rvSV * subP;
  } else if (p < 0.47) {
    const subP = (p - 0.40) / 0.07;
    rvPressure = params.paDiastolic * (1 - subP) + params.cvp * subP;
    rvVolume = params.rvESV;
  } else {
    const subP = (p - 0.47) / 0.53;
    rvPressure = params.cvp + 2 * subP;
    rvVolume = params.rvESV + (params.rvEDV - params.rvESV) * subP;
  }

  const aorticPressure = aorticOpen
    ? lvPressure
    : params.aorticDiastolic + (params.aorticSystolic - params.aorticDiastolic) *
      Math.max(0, 1 - (p > 0.4 ? (p - 0.4) * 3 : 0));

  return {
    time: cycleProgress,
    phase,
    lv: {
      volume: lvVolume,
      pressure: lvPressure,
      wallStress: lvContracting ? 0.8 : 0.2,
      contracting: lvContracting,
      filling: lvFilling,
    },
    rv: {
      volume: rvVolume,
      pressure: rvPressure,
      wallStress: lvContracting ? 0.6 : 0.15,
      contracting: lvContracting,
      filling: lvFilling,
    },
    la: {
      volume: mitralOpen ? 40 - 15 * (lvFilling ? 1 : 0) : 40 + 20 * (p < 0.4 ? p / 0.4 : 1),
      pressure: params.laP,
      wallStress: p < 0.11 ? 0.5 : 0.1,
      contracting: p < 0.11,
      filling: !mitralOpen,
    },
    ra: {
      volume: tricuspidOpen ? 35 - 10 * (lvFilling ? 1 : 0) : 35 + 15 * (p < 0.4 ? p / 0.4 : 1),
      pressure: params.cvp,
      wallStress: p < 0.11 ? 0.4 : 0.1,
      contracting: p < 0.11,
      filling: !tricuspidOpen,
    },
    mitralValve: { open: mitralOpen, regurgitant: false, stenotic: false, gradientMmHg: 0, openFraction: mitralOpen ? 1 : 0 },
    aorticValve: { open: aorticOpen, regurgitant: false, stenotic: false, gradientMmHg: 0, openFraction: aorticOpen ? 1 : 0 },
    tricuspidValve: { open: tricuspidOpen, regurgitant: false, stenotic: false, gradientMmHg: 0, openFraction: tricuspidOpen ? 1 : 0 },
    pulmonaryValve: { open: pulmonaryOpen, regurgitant: false, stenotic: false, gradientMmHg: 0, openFraction: pulmonaryOpen ? 1 : 0 },
    aorticPressure,
    paPressure: pulmonaryOpen ? rvPressure : params.paDiastolic,
    cvp: params.cvp,
    strokeVolume: sv,
    ejectionFraction: ef,
    cardiacOutput: co,
  };
}

/**
 * Get default or condition-modified hemodynamic parameters
 */
export function getConditionParams(conditionId: string): CycleParams {
  const mods: Record<string, Partial<CycleParams>> = {
    'aortic-stenosis': { aorticSystolic: 90, lvESV: 70 },
    'mitral-regurgitation': { lvEDV: 150, laP: 20 },
    'heart-failure': { lvEDV: 180, lvESV: 140, aorticSystolic: 90, aorticDiastolic: 65 },
    'cardiogenic-shock': { lvEDV: 200, lvESV: 170, aorticSystolic: 70, aorticDiastolic: 45, cvp: 15 },
    'pulmonary-hypertension': { paSystolic: 60, paDiastolic: 30, rvEDV: 160, rvESV: 100 },
    'tamponade': { lvEDV: 80, rvEDV: 80, aorticSystolic: 85, cvp: 18, laP: 18 },
    'hypertension': { aorticSystolic: 170, aorticDiastolic: 100, lvEDV: 140, lvESV: 55 },
  };

  return { ...NORMAL_PARAMS, ...(mods[conditionId] || {}) };
}
