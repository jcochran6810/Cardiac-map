/**
 * Beat-by-beat hemodynamic model (Wiggers diagram / PV loop).
 *
 * Driven by the same ventricular/atrial events as the ECG, so:
 *  - filling (and therefore stroke volume) depends on the preceding diastolic time
 *    (Frank-Starling) → AF short-RR beats eject less (pulse deficit);
 *  - the atrial kick only contributes when atrial contraction lands in late diastole
 *    (lost in AF; mistimed in AV dissociation → cannon A waves);
 *  - valve lesions change the shape of the curves (AS gradient, MR v-wave, MS gradient…);
 *  - systole shortens with rate and early filling is fast, so moderate tachycardia preserves
 *    stroke volume while very fast rates (SVT, VT) or slow-filling lesions (MS) cut it;
 *  - a simple baroreflex adjusts arterial tone so mean pressure is defended when output changes.
 * Each profile's representative values apply at its reference rate (refHR).
 * Values are representative teaching values, not patient-specific predictions.
 */
import { ECGEngine, VentEvent, CycleEvents, cycleEvents, noise1 } from '@/lib/ecg/engine';
import { QRS_TEMPLATES, type HemoProfile } from '@/lib/ecg/profiles';

export interface HemoParams {
  label: string;
  edv: number;
  esv: number;
  sbp: number;
  dbp: number;
  lvedp: number;
  laMean: number;
  /** Peak LV–aortic systolic gradient (AS fixed, HCM dynamic) */
  gradient: number;
  gradientType: 'none' | 'fixed' | 'dynamic';
  /** Regurgitant fraction of total LV stroke volume into the LA */
  mr: number;
  /** Mean diastolic LA–LV gradient (mitral stenosis) */
  msGradient: number;
  /** Isovolumic relaxation time constant (ms) */
  tauRelax: number;
  /** Aortic Windkessel time constant (ms) */
  tauAorta: number;
  /** Atrial kick as a fraction of normal filling */
  kick: number;
  s3: boolean;
  s4: boolean;
  murmur: 'none' | 'as' | 'mr' | 'ms' | 'hcm';
  /** Respiratory variation of stroke volume (pulsus paradoxus) */
  respVar: number;
  /** Heart rate at which the representative values above apply */
  refHR: number;
  /** External (pericardial) pressure added to LV diastolic pressure — tamponade */
  pericardial?: number;
  noOutput?: boolean;
}

const BASE: HemoParams = {
  label: 'Normal', edv: 120, esv: 50, sbp: 120, dbp: 78, lvedp: 9, laMean: 9, gradient: 0, gradientType: 'none',
  mr: 0, msGradient: 0, tauRelax: 38, tauAorta: 1900, kick: 0.2, s3: false, s4: false, murmur: 'none', respVar: 0.03, refHR: 72,
};

export const HEMO_PROFILES: Record<HemoProfile, HemoParams> = {
  normal: BASE,
  'aortic-stenosis': { ...BASE, label: 'Severe aortic stenosis', edv: 125, esv: 52, sbp: 112, dbp: 72, lvedp: 20, laMean: 16, gradient: 70, gradientType: 'fixed', tauRelax: 55, s4: true, murmur: 'as', kick: 0.3 },
  'mitral-regurgitation': { ...BASE, label: 'Chronic severe mitral regurgitation', edv: 185, esv: 72, sbp: 112, dbp: 68, lvedp: 14, laMean: 18, mr: 0.5, s3: true, murmur: 'mr', refHR: 85 },
  'mitral-stenosis': { ...BASE, label: 'Severe mitral stenosis', edv: 100, esv: 42, sbp: 104, dbp: 70, lvedp: 6, laMean: 24, msGradient: 12, murmur: 'ms', kick: 0.3, refHR: 80 },
  hfref: { ...BASE, label: 'HFrEF (LVEF ~25%)', edv: 220, esv: 165, sbp: 102, dbp: 66, lvedp: 24, laMean: 24, mr: 0.15, tauRelax: 60, s3: true, murmur: 'mr', kick: 0.15, refHR: 95 },
  hfpef: { ...BASE, label: 'HFpEF (stiff LV)', edv: 108, esv: 44, sbp: 152, dbp: 86, lvedp: 22, laMean: 20, tauRelax: 70, s4: true, kick: 0.3, refHR: 80 },
  hcm: { ...BASE, label: 'Obstructive HCM', edv: 100, esv: 28, sbp: 118, dbp: 74, lvedp: 18, laMean: 16, gradient: 55, gradientType: 'dynamic', mr: 0.08, tauRelax: 70, s4: true, murmur: 'hcm', kick: 0.3, refHR: 66 },
  shock: { ...BASE, label: 'Cardiogenic shock', edv: 190, esv: 155, sbp: 80, dbp: 52, lvedp: 28, laMean: 26, tauRelax: 65, s3: true, kick: 0.12, refHR: 118 },
  tamponade: { ...BASE, label: 'Cardiac tamponade', edv: 72, esv: 32, sbp: 88, dbp: 68, lvedp: 19, laMean: 19, respVar: 0.22, kick: 0.1, refHR: 118, pericardial: 16 },
  pe: { ...BASE, label: 'Acute PE with RV strain (underfilled LV)', edv: 88, esv: 38, sbp: 96, dbp: 66, lvedp: 5, laMean: 5, refHR: 114 },
  stemi: { ...BASE, label: 'Acute MI (reduced EF)', edv: 135, esv: 76, sbp: 126, dbp: 80, lvedp: 18, laMean: 16, tauRelax: 55, s4: true, kick: 0.25, refHR: 85 },
  'no-output': { ...BASE, label: 'No effective output', edv: 140, esv: 140, sbp: 20, dbp: 12, lvedp: 12, laMean: 12, noOutput: true, kick: 0 },
};

interface BeatHemo {
  ev: CycleEvents;
  params: HemoParams;
  edv: number;
  esv: number;
  sv: number;
  /** aortic pressure at aortic valve opening */
  pd: number;
  /** systolic peak */
  ps: number;
  /** end-systolic (dicrotic notch) pressure */
  pes: number;
  kick: boolean;
  floor: number;
  /** effective arterial (Windkessel) time constant for this beat */
  tau: number;
  /** running (baroreflex-sensed) forward stroke volume and cycle length */
  svAvg: number;
  rrAvg: number;
  /** mean LA pressure for the filling period that ended at this beat */
  laMean: number;
}

export interface HemoSample {
  lvp: number;
  aop: number;
  lap: number;
  lvv: number;
  phono: number;
}

export interface HemoSummary {
  sbp: number;
  dbp: number;
  map: number;
  edv: number;
  esv: number;
  sv: number;
  ef: number;
  co: number;
  lvedp: number;
  laMean: number;
  label: string;
  noOutput: boolean;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Diastolic pressure–volume relation (EDPVR) for a parameter set (+ any pericardial constraint) */
function edpvr(p: HemoParams, v: number): number {
  const ext = p.pericardial ?? 0;
  const va = p.esv - 25;
  const k = Math.log(Math.max(1.4, (p.lvedp - ext) / 2.5)) / Math.max(40, p.edv - va);
  return ext + 2.5 * Math.exp(k * (v - va));
}

/** Fraction of passive filling completed after d ms of open-mitral diastole */
function fillFraction(d: number, stenotic: boolean): number {
  if (d <= 0) return 0;
  // MS: slow, diastole-long filling across the narrowed orifice — tachycardia hurts most
  if (stenotic) return 1 - Math.exp(-d / 260);
  // Rapid early filling (~75%, τ≈70 ms) plus slow diastasis
  return 0.75 * (1 - Math.exp(-d / 70)) + 0.25 * (1 - Math.exp(-d / 500));
}

/** Open-mitral diastolic time for a narrow-QRS beat at a given steady heart rate (matches cycleEvents) */
function nominalDiastole(hr: number, stenotic: boolean): number {
  const rr = 60000 / hr;
  const ivct = Math.max(38, Math.min(55, 50 - 0.1 * (hr - 72)));
  const lvet = Math.max(150, Math.min(340, 415 - 1.7 * hr));
  const ivrt = stenotic ? 65 : Math.max(50, Math.min(90, 80 - 0.3 * (hr - 72)));
  return Math.max(20, rr - ivct - lvet - ivrt);
}

export class HemoModel {
  private cache = new WeakMap<VentEvent, BeatHemo>();
  constructor(private engine: ECGEngine) {}

  private paramsAt(t: number): HemoParams {
    return HEMO_PROFILES[this.engine.segmentAt(t).profile.hemo] ?? BASE;
  }

  private beat(i: number): BeatHemo | null {
    const vent = this.engine.vent;
    if (i < 0 || i >= vent.length) return null;
    const hit = this.cache.get(vent[i]);
    if (hit) return hit;
    // Walk back to the nearest cached beat (bounded), then compute forward
    let start = i;
    while (start > 0 && i - start < 24 && !this.cache.get(vent[start - 1])) start--;
    let prev: BeatHemo | null = start > 0 ? this.cache.get(vent[start - 1]) ?? null : null;
    for (let k = start; k <= i; k++) {
      const b = this.computeBeat(k, prev);
      this.cache.set(vent[k], b);
      prev = b;
    }
    return prev;
  }

  private computeBeat(i: number, prev: BeatHemo | null): BeatHemo {
    const vent = this.engine.vent;
    const v = vent[i];
    const next = i + 1 < vent.length ? vent[i + 1] : null;
    const ev = cycleEvents(v, next);
    const seg = this.engine.segmentAt(v.t);
    const p = this.paramsAt(v.t);
    const stenotic = p.msGradient > 0;
    const sv0 = p.edv - p.esv;
    const kickVol = p.kick * sv0;
    const prevEsv = prev && prev.params === p ? prev.esv : p.esv;
    const refDiastole = nominalDiastole(p.refHR, stenotic);
    const prevMo = prev ? prev.ev.mo : ev.mc - refDiastole;
    const diast = Math.max(0, ev.mc - prevMo);
    // Frank–Starling: passive filling scaled so the reference rate reproduces the profile's EDV
    const fill = (sv0 - kickVol) * fillFraction(diast, stenotic) / fillFraction(refDiastole, stenotic);
    // Atrial kick only if an organised atrial contraction falls in diastole (it may fuse with early
    // filling at fast rates); lost in AF/flutter and with retrograde or dissociated P waves
    let kick = false;
    if (seg.profile.rhythm !== 'af' && seg.profile.rhythm !== 'flutter') {
      const ai = this.engine.lastAtrialIndex(ev.mc - 20);
      for (let k = ai; k >= 0 && k > ai - 3; k--) {
        const a = this.engine.atrial[k];
        const c0 = a.t + 70;
        if (c0 > prevMo - 20 && c0 < ev.mc - 25 && a.kind === 'sinus') { kick = true; break; }
        if (c0 < prevMo) break;
      }
    }
    // Preload reserve is limited: the ventricle can only dilate a little beyond its usual EDV
    let edv = Math.max(prevEsv + 5, Math.min(p.edv + 0.15 * sv0, prevEsv + fill + (kick ? kickVol : 0)));
    if (p.noOutput) edv = p.edv;
    const resp = 1 - p.respVar * (0.5 + 0.5 * Math.sin((2 * Math.PI * v.t) / 5000));
    // Disease profiles already include their usual conduction (e.g. LBBB in HFrEF), so only beats
    // that differ from it (ectopic, VT) are penalised; in a normal heart LBBB/pacing costs a little.
    const usualLbbb = p !== BASE && QRS_TEMPLATES[seg.profile.qrs]?.conduction === 'lbbb';
    const contractile = p.noOutput ? 0.05 : Math.min(1, v.efficiency / (usualLbbb ? 0.85 : 1));
    const sv = Math.max(0, (edv - p.esv) * contractile * resp);
    const esv = edv - sv;
    const forwardSv = sv * (1 - p.mr);
    const fwd0 = Math.max(1, sv0 * (1 - p.mr));
    const ppBase = p.sbp - p.dbp;
    const pp = ppBase * Math.min(1.8, forwardSv / fwd0);

    // Baroreflex: arterial tone adapts (over several beats) so mean pressure is largely defended
    // when output changes; beat-to-beat variation (AF, PVCs, dropped beats) still shows through.
    const nominal = 60000 / Math.max(30, seg.hr || p.refHR);
    const cycle = prev ? Math.max(250, v.t - this.engine.vent[i - 1].t) : nominal;
    const same = !!prev && prev.params === p && prev.ev.qrs >= seg.start;
    const svAvg = same ? prev!.svAvg + (forwardSv - prev!.svAvg) * 0.45 : forwardSv;
    const rrAvg = same ? prev!.rrAvg + (cycle - prev!.rrAvg) * 0.45 : nominal;
    const coRatio = Math.max(0.05, (svAvg * 60000 / rrAvg) / (fwd0 * p.refHR));
    const map0 = p.dbp + ppBase / 3;
    const mapTarget = map0 * Math.pow(coRatio, coRatio < 1 ? 0.3 : 0.12);
    const ppAvg = ppBase * Math.min(1.8, svAvg / fwd0);
    const floor = p.noOutput ? 10 : 6;
    const pdTarget = Math.max(floor + 4, mapTarget - ppAvg / 3);
    const runoff = Math.max(150, rrAvg - (ev.ac - ev.ao));
    const x = Math.max(0.05, Math.min(0.97, (pdTarget - floor) / (pdTarget + 0.62 * ppAvg - floor)));
    const tau = p.noOutput ? p.tauAorta : Math.max(300, Math.min(6000, -runoff / Math.log(x)));
    let pd: number;
    if (prev) {
      pd = prev.floor + (prev.pes - prev.floor) * Math.exp(-(ev.ao - prev.ev.ac) / prev.tau);
    } else pd = pdTarget;
    if (p.noOutput) pd = Math.max(10, pd);
    const ps = pd + pp;
    const pes = pd + 0.62 * pp;
    // MS: the transmitral gradient climbs as diastole shortens (flow must cross in less time)
    const laMean = stenotic
      ? p.laMean + p.msGradient * (Math.min(2.5, Math.max(0.6, refDiastole / Math.max(60, diast))) - 1)
      : Math.max(p.laMean, edpvr(p, edv) - 3);
    return { ev, params: p, edv, esv, sv, pd, ps, pes, kick, floor, tau, svAvg, rrAvg, laMean };
  }

  sample(t: number): HemoSample {
    const engine = this.engine;
    const i = engine.lastVentIndex(t);
    const pNow = this.paramsAt(t);
    if (i < 0) {
      return { lvp: edpvr(pNow, pNow.edv), aop: pNow.dbp, lap: pNow.laMean, lvv: pNow.edv, phono: 0 };
    }
    const b = this.beat(i)!;
    const nb = this.beat(i + 1);
    const p = b.params;
    const ev = b.ev;
    const nextMc = nb ? nb.ev.mc : ev.mo + 4000;

    // Long pause after the last beat (VF/asystole): pressures decay, no ejection
    if (pNow.noOutput && t > ev.mo + 200) {
      const el = t - ev.ac;
      const aop = 10 + (b.pes - 10) * Math.exp(-el / 1900);
      const lvv = b.esv + (pNow.edv - b.esv) * (1 - Math.exp(-(t - ev.mo) / 300));
      const lvp = edpvr(pNow, lvv);
      return { lvp, aop, lap: Math.max(lvp, 8), lvv, phono: 0 };
    }

    let lvv: number;
    let lvp: number;
    let aop: number;
    const ejDur = ev.ac - ev.ao;
    const svDia = (vol: number) => edpvr(p, vol);
    const nextEdv = nb ? nb.edv : b.edv;

    if (t < ev.mc) {
      // late diastole of this beat (between QRS onset and MC)
      lvv = b.edv;
      lvp = svDia(lvv);
      aop = this.aorticDiastolic(i, t);
    } else if (t < ev.ao) {
      const s = (t - ev.mc) / (ev.ao - ev.mc);
      const edp = svDia(b.edv);
      lvp = edp + (b.pd - edp) * (0.5 - 0.5 * Math.cos(Math.PI * s));
      lvv = b.edv - (p.mr > 0 ? b.sv * p.mr * 0.25 * s : 0);
      aop = this.aorticDiastolic(i, t);
    } else if (t < ev.ac) {
      const s = (t - ev.ao) / ejDur;
      const mrPre = p.mr > 0 ? b.sv * p.mr * 0.25 : 0;
      const ej = 1 - Math.pow(1 - s, 2.2);
      lvv = b.edv - mrPre - (b.sv - mrPre) * ej;
      // aortic: fast upstroke to peak (~30% of ejection; delayed in AS = pulsus tardus), then decline to Pes
      const peakAt = p.gradientType === 'fixed' ? 0.5 : 0.3;
      const up = s < peakAt ? Math.sin((Math.PI / 2) * (s / peakAt)) : 1 - (1 - (b.pes - b.pd) / Math.max(1, b.ps - b.pd)) * smooth(peakAt, 1, s);
      aop = b.pd + (b.ps - b.pd) * up;
      if (p.gradientType === 'dynamic') {
        // spike-and-dome: early peak, mid-systolic dip as obstruction develops
        aop -= (b.ps - b.pd) * 0.28 * Math.exp(-Math.pow((s - 0.55) / 0.16, 2));
      }
      let grad = 4 * Math.sin(Math.PI * s) - 2 * smooth(0.7, 1, s);
      if (p.gradientType === 'fixed') grad = p.gradient * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05)), 1.1) * (b.sv / Math.max(1, p.edv - p.esv));
      if (p.gradientType === 'dynamic') grad = p.gradient * Math.pow(smooth(0.15, 0.7, s), 1.3) * (1 - smooth(0.85, 1, s));
      lvp = aop + grad;
    } else if (t < ev.mo) {
      const s = t - ev.ac;
      lvv = b.esv;
      const pmin = Math.max(2, svDia(b.esv) - 1);
      lvp = pmin + (b.pes - 4 - pmin) * Math.exp(-s / p.tauRelax);
      aop = this.aorticDiastolic(i, t);
    } else {
      // filling toward next beat's EDV
      const s = t - ev.mo;
      const span = Math.max(1, nextMc - ev.mo);
      const passive = fillFraction(s, p.msGradient > 0) / Math.max(1e-3, fillFraction(span, p.msGradient > 0));
      const kickVol = nb && nb.kick ? p.kick * (p.edv - p.esv) : 0;
      const passiveTarget = nextEdv - kickVol;
      lvv = b.esv + (passiveTarget - b.esv) * Math.min(1, passive);
      if (kickVol > 0) lvv += kickVol * this.kickProgress(t, nextMc);
      lvp = svDia(lvv) - 2.5 * Math.exp(-s / 50) * (1 - Math.exp(-s / 15));
      aop = this.aorticDiastolic(i, t);
    }

    const lap = this.laPressure(t, i, b, nb, lvp);
    const phono = this.phono(t, b, nb);
    return { lvp, aop, lap, lvv, phono };
  }

  /** 0→1 as the atrial kick completes before next MC */
  private kickProgress(t: number, nextMc: number): number {
    const ai = this.engine.lastAtrialIndex(t);
    if (ai < 0) return 0;
    const a = this.engine.atrial[ai];
    const c0 = a.t + 70;
    if (c0 > nextMc) return 0;
    return smooth(c0, c0 + 110, t);
  }

  private aorticDiastolic(i: number, t: number): number {
    // decay from the most recent aortic closure before t
    let k = i;
    while (k >= 0) {
      const b = this.beat(k)!;
      if (b.ev.ac <= t) {
        const dt = t - b.ev.ac;
        let p = b.floor + (b.pes - b.floor) * Math.exp(-dt / b.tau);
        // dicrotic notch and rebound
        p += -5 * Math.exp(-Math.pow((dt - 12) / 10, 2)) + 2.5 * Math.exp(-Math.pow((dt - 45) / 22, 2));
        return p;
      }
      k--;
    }
    return this.paramsAt(t).dbp;
  }

  private laPressure(t: number, i: number, b: BeatHemo, nb: BeatHemo | null, lvp: number): number {
    const p = b.params;
    const ev = b.ev;
    const laMean = nb ? nb.laMean : b.laMean;
    const msGrad = p.msGradient + (laMean - p.laMean);
    let lap = laMean - 2;
    // a wave (or cannon a wave if the atrium contracts against a closed mitral valve)
    const ai = this.engine.lastAtrialIndex(t);
    const rhythm = this.engine.segmentAt(t).profile.rhythm;
    if (ai >= 0 && rhythm !== 'af' && rhythm !== 'flutter') {
      const a = this.engine.atrial[ai];
      const c0 = a.t + 70;
      if (t >= c0 && t <= c0 + 160) {
        const closed = (c0 >= ev.mc && c0 <= ev.mo);
        const amp = (closed ? 14 : 5) * (p.s4 ? 1.6 : 1);
        lap += amp * Math.sin((Math.PI * (t - c0)) / 160);
      }
    }
    // c wave at mitral closure, x descent through ejection
    lap += 2 * Math.exp(-Math.pow((t - ev.mc - 25) / 18, 2));
    if (t > ev.ao && t < ev.ac) lap -= 3 * Math.sin((Math.PI * (t - ev.ao)) / (ev.ac - ev.ao));
    // v wave builds during ventricular systole, peaks at mitral opening; giant v in MR
    const vAmp = 6 + p.mr * 55;
    if (t >= ev.ao && t < ev.mo) lap += vAmp * smooth(ev.ao, ev.mo, t);
    else if (t >= ev.mo) lap += vAmp * Math.exp(-(t - ev.mo) / (p.msGradient > 0 ? 260 : 70)) - 2 * Math.exp(-Math.pow((t - ev.mo - 90) / 60, 2));
    else if (t >= ev.mc) lap += 0;
    // During diastole with an open mitral valve LA tracks LV (+ stenotic gradient)
    if (t >= ev.mo && (!nb || t < nb.ev.mc)) {
      lap = Math.max(lap, lvp + 1 + msGrad);
    }
    if (p.mr > 0 && t >= ev.mc && t < ev.mo) lap += 0; // already in v wave
    return lap;
  }

  private phono(t: number, b: BeatHemo, nb: BeatHemo | null): number {
    const p = b.params;
    const ev = b.ev;
    if (p.noOutput) return 0;
    let s = 0;
    const burst = (center: number, width: number, freq: number, amp: number) => {
      const d = t - center;
      if (Math.abs(d) > width * 2.5) return 0;
      return amp * Math.exp(-Math.pow(d / width, 2)) * Math.sin(2 * Math.PI * freq * d / 1000);
    };
    const nz = (t2: number) => noise1(t2 / 2.2) * 0.7 + noise1(t2 / 1.1 + 50) * 0.3;
    s += burst(ev.mc + 12, 14, 55, 1.0); // S1
    s += burst(ev.ac + 6, 11, 75, 0.9); // S2
    if (p.s3) s += burst(ev.mo + 80, 22, 30, 0.55); // end of rapid filling, ~150 ms after A2
    if (p.s4 && nb && nb.kick) s += burst(nb.ev.mc - 75, 20, 28, 0.5);
    if (p.murmur === 'as' && t > ev.ao && t < ev.ac) {
      const x = (t - ev.ao) / (ev.ac - ev.ao);
      s += 0.55 * Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.1)), 1.4) * nz(t);
    } else if (p.murmur === 'hcm' && t > ev.ao && t < ev.ac) {
      const x = (t - ev.ao) / (ev.ac - ev.ao);
      s += 0.5 * smooth(0.1, 0.65, x) * (1 - smooth(0.85, 1, x)) * nz(t);
    } else if (p.murmur === 'mr' && t > ev.mc + 20 && t < ev.ac + 10) {
      s += 0.38 * nz(t);
    } else if (p.murmur === 'ms' && t > ev.mo + 40) {
      const end = nb ? nb.ev.mc : ev.mo + 600;
      if (t < end) {
        const x = (t - ev.mo) / Math.max(1, end - ev.mo);
        const presystolic = nb && nb.kick ? smooth(0.7, 0.98, x) * 0.5 : 0;
        s += (0.28 * (1 - x * 0.6) + presystolic) * (noise1(t / 4.5) * 0.8);
      }
      s += burst(ev.mo + 4, 7, 90, 0.6); // opening snap at mitral opening (short A2–OS = severe MS)
    }
    return s;
  }

  summary(t: number): HemoSummary {
    const p = this.paramsAt(t);
    const i = this.engine.lastVentIndex(t);
    const hr = this.engine.heartRate(t);
    if (i < 0 || p.noOutput) {
      const s = this.sample(t);
      return { sbp: Math.round(s.aop), dbp: Math.round(s.aop), map: Math.round(s.aop), edv: Math.round(s.lvv), esv: Math.round(s.lvv), sv: 0, ef: 0, co: 0, lvedp: Math.round(s.lvp), laMean: Math.round(s.lap), label: p.label, noOutput: true };
    }
    // average the last few beats
    let n = 0, sbp = 0, dbp = 0, edv = 0, esv = 0, sv = 0, la = 0;
    for (let k = i; k >= 0 && n < 4; k--, n++) {
      const b = this.beat(k)!;
      sbp += b.ps; dbp += b.pd; edv += b.edv; esv += b.esv; sv += b.sv * (1 - b.params.mr); la += b.laMean;
    }
    sbp /= n; dbp /= n; edv /= n; esv /= n; sv /= n; la /= n;
    const totalSv = edv - esv;
    return {
      sbp: Math.round(sbp), dbp: Math.round(dbp), map: Math.round(dbp + (sbp - dbp) / 3),
      edv: Math.round(edv), esv: Math.round(esv), sv: Math.round(sv),
      ef: Math.round((totalSv / Math.max(1, edv)) * 100),
      co: Math.round(((sv * hr) / 1000) * 10) / 10,
      lvedp: Math.round(edpvr(p, edv)), laMean: Math.round(la), label: p.label, noOutput: false,
    };
  }

  /** Events of the beat in progress at t (for labelling the Wiggers diagram) */
  eventsAt(t: number): CycleEvents | null {
    const i = this.engine.lastVentIndex(t);
    if (i < 0) return null;
    return this.beat(i)?.ev ?? null;
  }
}
