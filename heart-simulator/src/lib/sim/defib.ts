'use client';

/**
 * Monitor-defibrillator trainer: device state, ACLS logic and patient responses.
 *
 * A generic, unbranded device (monitor / AED / manual defibrillation / synchronized
 * cardioversion / transcutaneous pacing) wired to the shared simulation clock, ECG engine and
 * hemodynamic model. Energies, doses and sequences follow the adult ACLS algorithms of the
 * 2025 AHA Guidelines for CPR and Emergency Cardiovascular Care. Outcome probabilities are
 * simulation settings chosen to make practice realistic, not predictions for real patients.
 *
 * Concept (instructor-driven monitor/defib practice with live vitals) inspired by the
 * EMSDojo student project; no code or artwork from it is used.
 */
import { create } from 'zustand';
import { sim } from '@/lib/sim/simulation';
import { onNewPatient, setRhythm, showRhythm } from '@/lib/rhythm';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { QRS_TEMPLATES, resolveProfile, type ECGProfile, type HemoProfile } from '@/lib/ecg/profiles';
import type { HemoSummary } from '@/lib/physiology/hemodynamics';
import type { AnyLead } from '@/lib/ecg/vector';

export type DefibMode = 'monitor' | 'aed' | 'manual' | 'pacer';
export type LogKind = 'shock' | 'drug' | 'rhythm' | 'cpr' | 'info' | 'warn' | 'pacing' | 'rosc';
export interface LogEntry { t: number; text: string; kind: LogKind }

// up to 360 J: some biphasic devices go that high, and 'use the device maximum' must be something a learner can choose
export const ENERGIES = [50, 75, 100, 120, 150, 200, 300, 360] as const;

export interface DrugDef {
  id: string;
  label: string;
  dose: (s: DefibState) => string;
  indication: string;
}

export const DRUGS: DrugDef[] = [
  { id: 'epinephrine', label: 'Epinephrine', dose: () => '1 mg IV (IO if no IV) (1 mg/10 mL), every 3–5 min', indication: 'Cardiac arrest (all rhythms)' },
  { id: 'amiodarone', label: 'Amiodarone', dose: (s) => (pulseNow() ? '150 mg IV over 10 min' : s.amioDoses === 0 ? '300 mg IV (or IO) bolus' : '150 mg IV (or IO) bolus'), indication: 'Refractory VF/pVT; stable wide-complex tachycardia' },
  { id: 'lidocaine', label: 'Lidocaine', dose: (s) => (s.lidoDoses === 0 ? '1–1.5 mg/kg IV (or IO)' : '0.5–0.75 mg/kg IV (or IO)'), indication: 'Alternative to amiodarone for VF/pVT' },
  { id: 'adenosine', label: 'Adenosine', dose: (s) => (s.adenosineDoses === 0 ? '6 mg rapid IV push + 20 mL flush' : '12 mg rapid IV push + flush'), indication: 'Regular narrow-complex SVT (stable)' },
  { id: 'atropine', label: 'Atropine', dose: () => '1 mg IV every 3–5 min (max 3 mg)', indication: 'Symptomatic bradycardia' },
  { id: 'magnesium', label: 'Magnesium sulfate', dose: () => '1–2 g IV (or IO)', indication: 'Torsades de pointes' },
  { id: 'diltiazem', label: 'Diltiazem', dose: () => '15–20 mg (0.25 mg/kg) IV over 2 min', indication: 'Rate control of AF / flutter (not in HFrEF, hypotension or WPW)' },
  { id: 'calcium', label: 'Calcium chloride', dose: () => '1 g IV (10 mL of 10%)', indication: 'Hyperkalemia with ECG changes; in a hyperkalemic arrest its benefit is not well established' },
];

export interface Scenario {
  id: string;
  label: string;
  profile: string;
  hr?: number;
  baseline: HemoProfile | null;
  spo2: number;
  rr: number;
  etco2: number;
  arrest: boolean;
  story: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'vf', label: 'VF cardiac arrest', profile: 'vf', baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: '58-year-old man collapsed at the gym. Unresponsive, not breathing normally, no pulse. Bystander CPR in progress.' },
  { id: 'pvt', label: 'Pulseless VT', profile: 'pvt', hr: 190, baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: '66-year-old with prior MI found unresponsive and pulseless in the ED waiting room.' },
  { id: 'pea', label: 'PEA arrest', profile: 'pea', hr: 44, baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: '72-year-old hemodialysis patient who missed two sessions; found unresponsive. Monitor shows organized activity, no pulse.' },
  { id: 'asystole', label: 'Asystole', profile: 'asystole', baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: 'Unwitnessed arrest at home, downtime unknown. Confirm asystole in two leads and check gain and connections.' },
  { id: 'torsades', label: 'Torsades', profile: 'torsades', baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: 'Patient on methadone and ondansetron becomes unresponsive on the ward; the monitor shows a twisting polymorphic rhythm.' },
  { id: 'svt-unstable', label: 'Unstable SVT', profile: 'avnrt', hr: 190, baseline: 'shock', spo2: 94, rr: 24, etco2: 31, arrest: false, story: '64-year-old with ischemic cardiomyopathy: palpitations, chest pain, confusion, clammy. Regular narrow tachycardia.' },
  { id: 'svt-stable', label: 'Stable SVT', profile: 'avnrt', hr: 180, baseline: null, spo2: 98, rr: 18, etco2: 36, arrest: false, story: '28-year-old with sudden palpitations at rest, alert and well perfused.' },
  { id: 'af-unstable', label: 'Unstable AF', profile: 'atrial-fibrillation', hr: 160, baseline: 'shock', spo2: 92, rr: 26, etco2: 30, arrest: false, story: '70-year-old with new irregular tachycardia, hypotension and acute pulmonary edema.' },
  { id: 'vt-pulse', label: 'Unstable VT (pulse)', profile: 'vt', hr: 170, baseline: null, spo2: 95, rr: 22, etco2: 33, arrest: false, story: '61-year-old with prior MI: wide regular tachycardia, hypotension, chest pain and confusion; weak radial pulse.' },
  { id: 'vt-stable', label: 'Stable VT', profile: 'vt', hr: 150, baseline: 'normal', spo2: 97, rr: 18, etco2: 36, arrest: false, story: '48-year-old with palpitations; alert, no chest pain or breathlessness, normal blood pressure. Regular wide-complex tachycardia.' },
  { id: 'chb', label: 'Symptomatic CHB', profile: 'third-degree-avb', hr: 34, baseline: 'hfref', spo2: 95, rr: 20, etco2: 34, arrest: false, story: '79-year-old with syncope and dizziness; pale and clammy. Slow wide escape rhythm.' },
  { id: 'brady', label: 'Sinus bradycardia', profile: 'sinus-bradycardia', hr: 38, baseline: 'hfref', spo2: 96, rr: 18, etco2: 35, arrest: false, story: '67-year-old with light-headedness and hypotension after starting a new medication.' },
];

export interface DefibState {
  mode: DefibMode;
  energy: number;
  sync: boolean;
  charge: 'idle' | 'charging' | 'charged';
  chargeDone: number;
  pendingSyncSince: number | null;
  aed: { phase: 'idle' | 'analyzing' | 'shock' | 'no-shock'; until: number };
  pacer: { on: boolean; rate: number; mA: number; threshold: number; demand: boolean; captured: boolean; inhibited: boolean };
  cpr: { on: boolean; since: number; quality: 'good' | 'poor'; cycleStart: number };
  vitals: { spo2: number; rr: number; etco2: number };
  baseline: HemoProfile | null;
  nibp: { measuring: boolean; until: number; last: { sbp: number; dbp: number; map: number } | 'fail' | null };
  pulseCheck: string | null;
  codeStart: number | null;
  lastEpi: number | null;
  epiDoses: number;
  amioDoses: number;
  lidoDoses: number;
  adenosineDoses: number;
  atropineMg: number;
  magnesiumGiven: boolean;
  calciumGiven: boolean;
  shocks: number;
  antiarrhythmicBonus: number;
  log: LogEntry[];
  trainee: boolean;
  sound: boolean;
  underlying: { profileId: string; hr: number } | null;
  lastShock: number;
  message: string | null;
  scenario: Scenario | null;
  /** this window only shows another window's device (the projector): it runs no device logic of its own */
  mirror: boolean;
}

const initial = (): DefibState => ({
  mode: 'monitor',
  energy: 200,
  sync: false,
  charge: 'idle',
  chargeDone: 0,
  pendingSyncSince: null,
  aed: { phase: 'idle', until: 0 },
  pacer: { on: false, rate: 70, mA: 0, threshold: 50 + Math.round(Math.random() * 40), demand: true, captured: false, inhibited: false },
  cpr: { on: false, since: 0, quality: 'good', cycleStart: 0 },
  vitals: { spo2: 97, rr: 16, etco2: 38 },
  baseline: null,
  nibp: { measuring: false, until: 0, last: null },
  pulseCheck: null,
  codeStart: null,
  lastEpi: null,
  epiDoses: 0,
  amioDoses: 0,
  lidoDoses: 0,
  adenosineDoses: 0,
  atropineMg: 0,
  magnesiumGiven: false,
  calciumGiven: false,
  shocks: 0,
  antiarrhythmicBonus: 0,
  log: [],
  trainee: false,
  sound: false,
  underlying: null,
  lastShock: -1e9,
  message: null,
  scenario: null,
  mirror: false,
});

export const useDefibStore = create<DefibState>(() => initial());
const get = () => useDefibStore.getState();
const set = (p: Partial<DefibState>) => useDefibStore.setState(p);

// ─── Signal artefacts on the ECG (deterministic in time so redraws agree) ───────

const cprIntervals: { start: number; end: number; quality: 'good' | 'poor' }[] = [];
const pacerIntervals: { start: number; end: number; period: number }[] = [];
const shockTimes: number[] = [];

const LEAD_W: Record<string, number> = { I: 0.45, II: 1, III: 0.75, aVR: -0.7, aVL: -0.2, aVF: 0.9, V1: 0.55, V2: 0.7, V3: 0.8, V4: 0.9, V5: 0.85, V6: 0.7 };

function externalSignal(t: number, lead: AnyLead): number {
  const w = LEAD_W[lead] ?? 0.7;
  let v = 0;
  for (let i = cprIntervals.length - 1; i >= 0; i--) {
    const c = cprIntervals[i];
    if (t < c.start) continue;
    if (t > c.end) break;
    const period = c.quality === 'good' ? 545 : 750; // ~110 vs ~80 compressions/min
    const ph = ((t - c.start) % period) / period;
    const amp = c.quality === 'good' ? 1.1 : 0.6;
    v += w * amp * (Math.exp(-Math.pow((ph - 0.18) / 0.09, 2)) - 0.45 * Math.exp(-Math.pow((ph - 0.48) / 0.14, 2)));
    break;
  }
  for (let i = pacerIntervals.length - 1; i >= 0; i--) {
    const p = pacerIntervals[i];
    if (t < p.start) continue;
    if (t > p.end) break;
    const dt = (t - p.start) % p.period;
    v += Math.sign(w || 1) * (2.2 * Math.exp(-Math.pow(dt / 1.4, 2)) + 0.25 * Math.exp(-dt / 35) * (dt > 2 ? 1 : 0));
    break;
  }
  for (let i = shockTimes.length - 1; i >= 0; i--) {
    const dt = t - shockTimes[i];
    if (dt < 0) continue;
    if (dt > 2500) break;
    v += w * (4 * Math.exp(-dt / 30) + 0.8 * Math.exp(-dt / 600) * Math.sin(dt / 160));
    break;
  }
  return v;
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  sim.engine.external = externalSignal;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function now() { return sim.time; }

function log(text: string, kind: LogKind = 'info') {
  install();
  set({ log: [...get().log, { t: now(), text, kind }].slice(-200) });
}

function prompt(message: string | null) { set({ message }); }

function currentProfile() {
  return resolveProfile(useECGStore.getState().activeProfileId);
}

/**
 * Is there a pulse to feel? A pressure reading alone does not make one. At extreme rates the ventricle hardly
 * fills: 66/62 mmHg with 5 mL behind each beat is a pressure, not a pulse. Feeling one takes a beat-to-beat swing
 * (a pulse pressure of about 10 mmHg or more) and something to cause it (a stroke volume of about 15 mL or more).
 */
function palpable(s: HemoSummary): boolean {
  return !s.noOutput && s.sbp >= 50 && s.sbp - s.dbp >= 10 && s.sv >= 15;
}

export function pulseNow(): boolean {
  return palpable(sim.hemo.summary(sim.time));
}

function changeRhythm(profileId: string, hr?: number, note?: string, kind: LogKind = 'rhythm') {
  setRhythm(profileId, hr);
  if (note) log(note, kind);
}

const scheduled: { at: number; fn: () => void }[] = [];
/** while a scheduled response runs: the moment it was due (the clock may have jumped past it) */
let due: number | null = null;
function after(ms: number, fn: () => void) { scheduled.push({ at: (due ?? now()) + ms, fn }); }

/**
 * The patient's delayed response to a drug or a shock. It belongs to the rhythm it was aimed at: if that rhythm is
 * no longer on the monitor when the time comes (a shock converted it, another drug acted first, the instructor
 * changed it, the pacer captured), nothing happens. A response may schedule the next one, which then belongs to the
 * rhythm the first one left.
 */
function respond(ms: number, fn: () => void) {
  const aimedAt = currentProfile().id;
  after(ms, () => { if (currentProfile().id === aimedAt) fn(); });
}

/**
 * A rate-control drug taking effect in AF or flutter. It can only slow the ventricles: a rate already at or below
 * the usual result falls a little further instead of jumping up to it.
 */
function slowVentricles(target: number, drug: string) {
  const pid = currentProfile().id;
  const hr = useTimelineStore.getState().heartRate;
  if (hr > target) changeRhythm(pid, target, `Ventricular rate slowing after ${drug}`);
  else changeRhythm(pid, Math.max(40, Math.round(hr * 0.85)), `The rate was already controlled — ${drug} slows it further: watch for bradycardia and hypotension`, 'warn');
}

/**
 * Adenosine's few seconds of slowing in a rhythm it does not convert. `slower` gives the rate during them (never
 * above the rate before); afterwards that rate comes back — unless something else has changed it meanwhile.
 */
function transientSlowing(slower: (hr: number) => number, lasts: number, note: string) {
  respond(4000, () => {
    const pid = currentProfile().id;
    const hr = useTimelineStore.getState().heartRate;
    const slow = Math.min(hr, slower(hr));
    changeRhythm(pid, slow, note);
    respond(lasts, () => { if (useTimelineStore.getState().heartRate === slow) changeRhythm(pid, hr); });
  });
}

/**
 * An AV-nodal blocker in pre-excited AF (a profile with an accessory `pathway`): harmful (2023 ACC/AHA/ACCP/HRS AF
 * guideline: adenosine, diltiazem, verapamil, digoxin and IV amiodarone; beta-blockers too). With the node blocked, every
 * impulse goes down the pathway: the ventricles speed up (as the Give-meds tool shows, ×1.12, to 250 at most), never slow.
 */
function pathwayBlocked(drug: string, ms: number) {
  log(`${drug} in pre-excited AF is harmful: with the AV node blocked every impulse goes down the accessory pathway — the rate climbs and it can degenerate into VF. Unstable: synchronized cardioversion; stable: procainamide or ibutilide`, 'warn');
  respond(ms, () => {
    const hr = useTimelineStore.getState().heartRate;
    changeRhythm(currentProfile().id, Math.min(250, Math.round(hr * 1.12)), `Faster and wider complexes after ${drug}: more impulses down the pathway`, 'warn');
  });
}

/** A complete heart block with a narrow escape rhythm: the block is in the AV node itself (inferior MI, vagal tone) */
function nodalBlock(p: ECGProfile): boolean {
  return p.rhythm === 'chb' && (QRS_TEMPLATES[p.qrs]?.duration ?? 0) < 120;
}
/** the same patient once the AV node conducts again */
const CONDUCTING: Record<string, string> = { 'inferior-stemi-chb': 'inferior-stemi' };

function isArrestRhythm(id: string) {
  const p = resolveProfile(id);
  return p.hemo === 'no-output';
}

/** What an AED advises a shock for: the rhythm alone — VF, torsades, pulseless VT, and VT at 150 or more with or without a pulse */
function shockable(id: string): boolean {
  const p = resolveProfile(id);
  return p.rhythm === 'vf' || p.rhythm === 'torsades' || (p.rhythm === 'vt' && (p.hemo === 'no-output' || useTimelineStore.getState().heartRate >= 150));
}

// ─── Device actions ─────────────────────────────────────────────────────────

export function setMode(mode: DefibMode) {
  install();
  const s = get();
  if (s.mode === mode) return;
  if (s.charge !== 'idle') disarm('Mode changed — charge removed');
  if (mode !== 'pacer' && s.pacer.on) stopPacing();
  set({ mode, sync: mode === 'manual' ? s.sync : false, aed: { phase: 'idle', until: 0 } });
  if (mode === 'aed') prompt('AED mode — apply pads, then press ANALYZE');
  else prompt(null);
}

export function setEnergy(j: number) {
  const s = get();
  if (s.charge !== 'idle') disarm('Energy changed — charge removed');
  set({ energy: j });
}

export function toggleSync() {
  const s = get();
  set({ sync: !s.sync, pendingSyncSince: null });
  log(s.sync ? 'SYNC off' : 'SYNC on — markers on each R wave', 'info');
}

export function charge() {
  install();
  // Charging belongs to the defibrillator: from the monitor or the pacer screen the device goes to manual
  // defibrillation — which stops the pacer, as changing mode always does (it cannot pace and charge at once)
  const mode = get().mode;
  if (mode === 'monitor' || mode === 'pacer') setMode('manual');
  const s = get();
  if (s.charge === 'charging') return;
  const ms = 2500 + (s.energy / 200) * 3500;
  set({ charge: 'charging', chargeDone: now() + ms });
  prompt(`Charging ${s.energy} J… state "Clear!" and check nobody is touching the patient`);
}

function disarm(reason: string) {
  set({ charge: 'idle', pendingSyncSince: null });
  log(reason, 'info');
  prompt(reason);
}

export function dumpCharge() { if (get().charge !== 'idle') disarm('Charge removed (disarmed)'); }

export function shock() {
  const s = get();
  if (s.charge !== 'charged') { prompt('Not charged'); return; }
  if (s.cpr.on) log('Shock delivered during compressions — rescuers must be clear', 'warn');
  if (s.sync && s.mode === 'manual') {
    set({ pendingSyncSince: now() });
    prompt('SYNC: hold SHOCK… discharging on the next R wave');
    return;
  }
  deliver(now(), false);
}

function vulnerable(t: number): boolean {
  const e = sim.engine;
  const i = e.lastVentIndex(t);
  if (i < 0) return false;
  const v = e.vent[i];
  const tp = v.t + v.tw.tp;
  return t > tp - 50 && t < tp + 40;
}

/**
 * The chance that one shock at this energy does its job. Cardioversion works best from the 2025 AHA initial energies
 * (biphasic): AF 200 J or more, atrial flutter 200 J, a narrow regular tachycardia 100 J, monomorphic VT 100 J. Less
 * energy is less likely to work, never impossible — flutter and re-entrant SVT often convert at 50 J.
 */
function energySuccess(kind: 'vf' | 'af' | 'flutter' | 'svt' | 'vt', j: number): number {
  switch (kind) {
    case 'vf': return j >= 150 ? 0.82 : j >= 120 ? 0.75 : j >= 100 ? 0.6 : 0.35;
    case 'af': return j >= 200 ? 0.9 : j >= 150 ? 0.72 : j >= 120 ? 0.62 : j >= 100 ? 0.5 : j >= 75 ? 0.35 : 0.25;
    case 'flutter': return j >= 200 ? 0.95 : j >= 150 ? 0.9 : j >= 100 ? 0.82 : j >= 75 ? 0.72 : 0.62;
    case 'svt': return j >= 100 ? 0.95 : j >= 75 ? 0.84 : 0.75;
    case 'vt': return j >= 100 ? 0.9 : j >= 75 ? 0.72 : 0.6;
  }
}

function deliver(t: number, synced: boolean) {
  const s = get();
  const prof = currentProfile();
  const pulse = pulseNow();
  shockTimes.push(t);
  const n = s.shocks + 1;
  set({ charge: 'idle', pendingSyncSince: null, shocks: n, lastShock: t, aed: { phase: 'idle', until: 0 } });
  log(`Shock ${n}: ${s.energy} J ${synced ? 'synchronized' : 'unsynchronized'}`, 'shock');
  prompt(s.cpr.on ? null : 'Shock delivered — resume CPR immediately (if in arrest)');

  const r = prof.rhythm;
  const rand = Math.random();
  // Pulseless VF / VT / torsades
  if (r === 'vf' || r === 'torsades' || (r === 'vt' && !pulse)) {
    const p = Math.min(0.95, energySuccess('vf', s.energy) + s.antiarrhythmicBonus + (s.lastEpi !== null ? 0.03 : 0));
    if (rand < p) {
      respond(2200, () => {
        const o = Math.random();
        if (o < 0.55) {
          roscNow('Shock terminated VF/VT — organized rhythm WITH a pulse (ROSC)');
          if (r === 'torsades' && !get().magnesiumGiven) respond(25000, () => {
            if (!get().magnesiumGiven && Math.random() < 0.5) changeRhythm('torsades', undefined, 'Torsades recurred — give magnesium, stop QT-prolonging drugs, correct K⁺; consider overdrive pacing');
          });
        } else if (o < 0.8) changeRhythm('pea', 50, 'Shock terminated VF/VT — organized rhythm but NO pulse (PEA)');
        else changeRhythm('asystole', undefined, 'Shock terminated VF/VT — asystole');
      });
    } else {
      log('Rhythm unchanged after the shock (refractory VF/VT)', 'rhythm');
    }
    return;
  }
  if (r === 'asystole' || prof.hemo === 'no-output') {
    log('Shock delivered to a NON-shockable rhythm — no benefit; interrupts CPR', 'warn');
    return;
  }
  // Organized rhythm with a pulse
  if (!synced) {
    log('Unsynchronized shock on an organized rhythm with a pulse — use SYNC for cardioversion', 'warn');
    if (vulnerable(t) && Math.random() < 0.6) {
      respond(300, () => changeRhythm('vf', undefined, 'R-on-T: shock landed on the T wave and induced VF'));
      return;
    }
  }
  const kind = r === 'af' ? 'af' : r === 'flutter' ? 'flutter' : r === 'svt' ? 'svt' : r === 'vt' ? 'vt' : null;
  if (!kind) {
    log('No shockable or cardiovertible rhythm — the shock was not indicated', 'warn');
    return;
  }
  // pre-excited AF converts to sinus rhythm that still comes down the pathway: the WPW pattern, delta waves and all
  if (rand < energySuccess(kind, s.energy)) {
    respond(1500, () => (prof.pathway
      ? changeRhythm('wpw', 88, 'Cardioversion successful — sinus rhythm with pre-excitation (the delta waves remain)')
      : changeRhythm('normal-sinus', 88, 'Cardioversion successful — sinus rhythm')));
  }
  else log('Cardioversion unsuccessful — consider escalating energy', 'rhythm');
}

function roscNow(note: string) {
  changeRhythm('sinus-tachycardia', 108, note);
  const s = get();
  if (s.cpr.on) stopCPR(true);
  log('ROSC: check pulse and BP, SpO2 90–98%, PaCO2 35–45 mmHg, 12-lead ECG, avoid hypotension (MAP ≥ 65 mmHg)', 'rosc');
}

/**
 * An AED reads only the rhythm: it cannot feel a pulse, so it advises a shock for VF and for VT fast enough, pulse or
 * not. That is why it goes only on someone unresponsive, not breathing normally and pulseless — and why the trainer
 * says so when it is put on a patient with a pulse (and still analyzes the rhythm, as a real AED would).
 */
export const AED_WITH_PULSE = 'AED on a patient with a pulse. An AED reads only the rhythm, never the pulse: it is for someone unresponsive, not breathing normally and pulseless, and on a fast VT it advises a shock even with a pulse. With a pulse, use the monitor and synchronized cardioversion if a shock is needed.';

export function analyze() {
  install();
  const s = get();
  if (pulseNow()) log(AED_WITH_PULSE, 'warn');
  if (s.mode !== 'aed') setMode('aed');
  set({ aed: { phase: 'analyzing', until: now() + 6000 } });
  prompt(get().cpr.on ? 'STOP CPR — motion detected. Do not touch the patient' : 'Analyzing heart rhythm. Do not touch the patient');
}

// ─── Pacing ─────────────────────────────────────────────────────────────────

export function startPacing() {
  install();
  const s = get();
  if (s.mode !== 'pacer') set({ mode: 'pacer' });
  if (s.pacer.on) return;
  set({ pacer: { ...get().pacer, on: true } });
  log(`Pacer ON: ${s.pacer.rate} ppm, ${s.pacer.mA} mA (${s.pacer.demand ? 'demand' : 'fixed'})`, 'pacing');
  if (isArrestRhythm(useECGStore.getState().activeProfileId)) log('Transcutaneous pacing is not recommended in cardiac arrest (asystole / PEA); VF / pulseless VT needs defibrillation', 'warn');
  evaluatePacing();
}

export function stopPacing() {
  const s = get();
  if (!s.pacer.on) return;
  const p = pacerIntervals[pacerIntervals.length - 1];
  if (p && p.end === Infinity) p.end = now();
  const under = s.underlying;
  set({ pacer: { ...s.pacer, on: false, captured: false, inhibited: false }, underlying: null });
  if (s.pacer.captured && under) changeRhythm(under.profileId, under.hr, 'Pacer OFF — underlying rhythm returns');
  else log('Pacer OFF', 'pacing');
}

export function setPacer(patch: Partial<Pick<DefibState['pacer'], 'rate' | 'mA' | 'demand'>>) {
  const s = get();
  set({ pacer: { ...s.pacer, ...patch } });
  if (get().pacer.on) evaluatePacing();
}

function evaluatePacing() {
  const s = get();
  const pc = s.pacer;
  const curId = useECGStore.getState().activeProfileId;
  const under = s.underlying ?? { profileId: curId, hr: useTimelineStore.getState().heartRate };
  const intrinsic = isArrestRhythm(under.profileId) || resolveProfile(under.profileId).rhythm === 'asystole' ? 0 : under.hr;
  const inhibited = pc.demand && intrinsic >= pc.rate;
  const arrest = isArrestRhythm(under.profileId);
  const captured = pc.on && !inhibited && pc.mA >= pc.threshold && !arrest;
  // spikes without capture are drawn as artefact
  const last = pacerIntervals[pacerIntervals.length - 1];
  const wantSpikes = pc.on && !inhibited && !captured;
  if (last && last.end === Infinity && (!wantSpikes || last.period !== 60000 / pc.rate)) last.end = now();
  if (wantSpikes && !(last && last.end === Infinity)) pacerIntervals.push({ start: now(), end: Infinity, period: 60000 / pc.rate });

  if (captured && !pc.captured) {
    set({ underlying: under, pacer: { ...pc, captured: true, inhibited } });
    changeRhythm('tcp', pc.rate, `Electrical capture at ${pc.mA} mA — confirm mechanical capture (femoral pulse / SpO2 waveform)`);
  } else if (captured && pc.captured) {
    if (useTimelineStore.getState().heartRate !== pc.rate) setRhythm('tcp', pc.rate);
    set({ pacer: { ...pc, inhibited } });
  } else if (!captured && pc.captured) {
    set({ pacer: { ...pc, captured: false, inhibited }, underlying: null });
    changeRhythm(under.profileId, under.hr, inhibited ? 'Pacer inhibited by intrinsic rhythm (demand mode)' : 'Loss of capture — spikes without QRS complexes');
  } else {
    set({ pacer: { ...pc, inhibited }, underlying: pc.on ? under : null });
  }
}

// ─── CPR ────────────────────────────────────────────────────────────────────

export function toggleCPR() {
  const s = get();
  if (s.cpr.on) stopCPR(false);
  else {
    install();
    const t = now();
    cprIntervals.push({ start: t, end: Infinity, quality: s.cpr.quality });
    set({ cpr: { ...s.cpr, on: true, since: t, cycleStart: t }, codeStart: s.codeStart ?? t });
    log(`CPR started (${s.cpr.quality === 'good' ? '100–120/min, 5–6 cm, full recoil' : 'poor quality: slow / shallow'})`, 'cpr');
    if (pulseNow()) log('Compressions on a patient WITH a pulse', 'warn');
    if (get().aed.phase === 'analyzing') prompt('STOP CPR — motion detected. Do not touch the patient');
  }
}

function stopCPR(silent: boolean) {
  const s = get();
  const c = cprIntervals[cprIntervals.length - 1];
  if (c && c.end === Infinity) c.end = now();
  const dur = now() - s.cpr.since;
  set({ cpr: { ...s.cpr, on: false } });
  if (!silent) log(`CPR paused after ${fmt(dur)} — rhythm / pulse check (≤ 10 s)`, 'cpr');
  // Simulation: non-shockable arrest may regain a pulse after a full cycle of CPR with epinephrine. In the dialysis
  // patient's (hyperkalemic) PEA calcium may help, but its benefit is not well established (2025): it raises the odds,
  // it does not make the outcome
  const id = useECGStore.getState().activeProfileId;
  const odds = id === 'pea' && s.scenario?.id === 'pea' ? (s.calciumGiven ? 0.3 : 0.1) : 0.25;
  // PEA of either width (the narrow, fast PEA of a mechanical cause too) and asystole
  if (!silent && dur >= 110000 && (id === 'pea' || id === 'pea-narrow' || id === 'asystole') && s.lastEpi !== null && now() - s.lastEpi < 300000 && Math.random() < odds) {
    roscNow('Pulse check: palpable pulse — ROSC');
  }
}

export function setCprQuality(q: 'good' | 'poor') {
  const s = get();
  set({ cpr: { ...s.cpr, quality: q } });
  if (s.cpr.on) {
    const c = cprIntervals[cprIntervals.length - 1];
    if (c && c.end === Infinity) c.end = now();
    cprIntervals.push({ start: now(), end: Infinity, quality: q });
  }
}

// ─── Drugs ──────────────────────────────────────────────────────────────────

export function giveDrug(id: string, authority?: string) {
  install();
  const s = get();
  const d = DRUGS.find((x) => x.id === id);
  if (!d) return;
  const prof = currentProfile();
  const pid = prof.id;
  const pulse = pulseNow();
  const dose = d.dose(s);
  log(`${d.label} ${dose}${authority ? ` — ${authority}` : ''}`, 'drug');
  switch (id) {
    case 'epinephrine': {
      if (pulse) log('Epinephrine 1 mg bolus is for cardiac arrest — in a patient with a pulse use an infusion (2–10 mcg/min) only if indicated', 'warn');
      set({ lastEpi: now(), epiDoses: s.epiDoses + 1, codeStart: s.codeStart ?? now() });
      break;
    }
    case 'amiodarone': {
      set({ amioDoses: s.amioDoses + 1 });
      if (prof.rhythm === 'torsades') { log('Amiodarone prolongs the QT — avoid in torsades. Sustained torsades: defibrillate now (unsynchronized), pulse or not; then magnesium', 'warn'); break; }
      if (!pulse && (prof.rhythm === 'vf' || prof.rhythm === 'vt')) {
        if (s.amioDoses >= 2) { log('Arrest dosing is 300 mg then one 150 mg dose — no further boluses', 'warn'); break; }
        if (s.shocks < 3 && s.amioDoses === 0) log('Amiodarone is usually given after the 3rd shock for refractory VF/pVT', 'info');
        set({ antiarrhythmicBonus: Math.min(0.15, s.antiarrhythmicBonus + 0.1) });
      } else if (pulse && prof.rhythm === 'vt') {
        if (sim.hemo.summary(sim.time).sbp < 90) log('Hypotension = unstable VT: synchronized cardioversion is indicated; drugs are for stable VT', 'warn');
        respond(60000, () => { if (Math.random() < 0.35) changeRhythm('normal-sinus', 84, 'VT terminated after amiodarone'); else log('VT persists after amiodarone — consider synchronized cardioversion / expert consultation', 'rhythm'); });
      } else if (pulse && prof.pathway) {
        pathwayBlocked('IV amiodarone', 60000);
      } else if (pulse && (prof.rhythm === 'af' || prof.rhythm === 'flutter')) {
        log('IV amiodarone can slow the rate in critically ill or HFrEF patients (it may also cardiovert — consider anticoagulation status)', 'info');
        respond(90000, () => slowVentricles(prof.rhythm === 'flutter' ? 100 : 98, 'amiodarone'));
      } else {
        log('No clear indication for amiodarone in this rhythm', 'warn');
      }
      break;
    }
    case 'lidocaine': {
      set({ lidoDoses: s.lidoDoses + 1 });
      if (s.lidoDoses >= 3) { log('Lidocaine: cumulative maximum ~3 mg/kg reached', 'warn'); break; }
      if (!pulse && (prof.rhythm === 'vf' || prof.rhythm === 'vt')) set({ antiarrhythmicBonus: Math.min(0.15, s.antiarrhythmicBonus + 0.08) });
      break;
    }
    case 'adenosine': {
      if (s.adenosineDoses >= 2) { log('Adenosine: maximum is 6 mg then 12 mg — consider other options', 'warn'); break; }
      const dose12 = s.adenosineDoses === 1;
      set({ adenosineDoses: s.adenosineDoses + 1 });
      if (!pulse) { log('Adenosine has no role in cardiac arrest', 'warn'); break; }
      // no AV-nodal pause down an accessory pathway: the node's share goes to the pathway instead
      if (prof.pathway) { pathwayBlocked('Adenosine', 4000); break; }
      if (prof.rhythm === 'svt') {
        if (Math.random() < (dose12 ? 0.85 : 0.6)) {
          respond(4000, () => {
            changeRhythm('asystole', undefined, 'Adenosine: transient AV block — brief pause');
            respond(4500, () => changeRhythm('normal-sinus', 82, 'SVT terminated — sinus rhythm'));
          });
        } else respond(5000, () => log('No conversion — SVT persists', 'rhythm'));
      } else if (prof.rhythm === 'flutter') {
        // 2:1 conduction becomes 4:1; flutter that is already slow doubles its block again
        transientSlowing((hr) => (hr > 100 ? 75 : Math.max(30, Math.round(hr / 2))), 8000, 'Adenosine: transient high-grade AV block reveals flutter waves (does not convert flutter)');
      } else if (prof.rhythm === 'af') {
        transientSlowing((hr) => (hr > 80 ? 60 : Math.max(30, Math.round(hr * 0.7))), 8000, 'Adenosine: transient slowing — irregular baseline confirms AF (does not convert AF)');
      } else if (prof.rhythm === 'vt') {
        log('Adenosine does not terminate (most) VT — treat as VT', 'warn');
      } else if (prof.rhythm === 'sinus') {
        transientSlowing((hr) => Math.max(25, Math.round(hr * 0.6)), 7000, 'Adenosine: transient sinus slowing / AV block');
      }
      break;
    }
    case 'atropine': {
      if (s.atropineMg >= 3) { log('Atropine: 3 mg maximum reached', 'warn'); break; }
      set({ atropineMg: s.atropineMg + 1 });
      if (!pulse) { log('Atropine is no longer recommended in cardiac arrest', 'warn'); break; }
      // The indication is the heart rate and where the slowing comes from — not the name of the rhythm:
      // sinus rhythm at 35/min, an inferior MI at 40/min and slow AF are bradycardias too
      const hr = useTimelineStore.getState().heartRate;
      const slow = hr < 60;
      const kind = prof.rhythm;
      if (kind === 'mobitz2' || (kind === 'chb' && !nodalBlock(prof))) {
        respond(15000, () => log('No response: block below the AV node with a wide escape rarely responds to atropine (a narrow junctional escape sometimes does) — pace or start a chronotropic infusion', 'rhythm'));
      } else if (kind === 'chb') {
        respond(20000, () => {
          if (Math.random() < 0.5) changeRhythm(CONDUCTING[pid] ?? 'normal-sinus', 70, 'AV conduction returns after atropine — the block was in the AV node');
          else log('Little response to atropine — pace, and do not delay reperfusion in an inferior MI', 'rhythm');
        });
      } else if (kind === 'wenckebach' || ((pid === 'first-degree-avb' || kind === 'junctional') && slow)) {
        respond(20000, () => { if (Math.random() < 0.7) changeRhythm('normal-sinus', 78, 'Improved AV-nodal conduction after atropine'); else log('Little response to atropine', 'rhythm'); });
      } else if (pid.startsWith('hyperkalemia') && slow) {
        // the potassium, not vagal tone, is slowing this heart (at every stage: 'hyperkalemia', '-moderate', '-severe')
        respond(20000, () => log('Little response to atropine: in hyperkalemia the potassium, not vagal tone, slows the heart — calcium first, then insulin + dextrose and a β-agonist; be ready to pace', 'rhythm'));
      } else if ((kind === 'sinus' || kind === 'pvc') && slow) {
        // the "sinus bradycardia" rhythm becomes normal sinus rhythm; any other keeps its own QRS and ST segments
        if (pid === 'sinus-bradycardia') respond(20000, () => changeRhythm('normal-sinus', 76, 'Heart rate rising after atropine'));
        else respond(20000, () => changeRhythm(pid, Math.max(70, Math.min(90, hr + 30)), 'Heart rate rising after atropine'));
      } else if ((kind === 'af' || kind === 'flutter') && slow) {
        respond(20000, () => { if (Math.random() < 0.7) changeRhythm(pid, Math.min(90, Math.round(hr * 1.3)), 'Ventricular rate rising after atropine (faster AV-nodal conduction)'); else log('Little response to atropine', 'rhythm'); });
      } else log(pid === 'first-degree-avb' ? 'No bradycardia to treat — first-degree AV block alone needs no treatment' : 'No bradycardia to treat', 'warn');
      break;
    }
    case 'magnesium': {
      set({ magnesiumGiven: true });
      if (prof.rhythm === 'torsades') log('Magnesium helps prevent recurrence, but sustained torsades must be defibrillated now (unsynchronized), pulse or not', 'info');
      break;
    }
    case 'diltiazem': {
      if (s.baseline === 'hfref' || s.baseline === 'shock' || !pulse) log('Avoid diltiazem in decompensated HFrEF, hypotension or shock', 'warn');
      if (prof.pathway && pulse) pathwayBlocked('Diltiazem', 60000);
      else if ((prof.rhythm === 'af' || prof.rhythm === 'flutter') && pulse) respond(60000, () => slowVentricles(prof.rhythm === 'flutter' ? 75 : 88, 'diltiazem'));
      else if (prof.rhythm === 'svt' && pulse) respond(30000, () => { if (Math.random() < 0.5) changeRhythm('normal-sinus', 80, 'SVT terminated after diltiazem'); });
      break;
    }
    case 'calcium': {
      set({ calciumGiven: true });
      if (!pulse) log('Calcium in arrest: only for suspected hyperkalemia (or hypocalcemia, calcium-channel-blocker overdose), and even then its benefit is not well established — give it without pausing CPR or shocks', 'info');
      else if (pid.startsWith('hyperkalemia')) log('Calcium stabilizes the myocardium within minutes but does not lower K⁺ — add insulin/glucose, β-agonist and K⁺ removal (dialysis)', 'info');
      break;
    }
  }
}

// ─── Assessment tools ──────────────────────────────────────────────────────

export function checkPulse() {
  const s = sim.hemo.summary(sim.time);
  const cpr = get().cpr.on;
  // thready: little pressure, or little difference between systole and diastole
  const text = cpr ? 'Stop compressions to check for a pulse' : !palpable(s) ? 'No pulse' : s.sbp < 80 || s.sbp - s.dbp < 20 ? 'Weak, thready pulse' : 'Pulse present';
  set({ pulseCheck: text });
  log(`Pulse check: ${text}`, 'info');
}

export function measureNibp() {
  set({ nibp: { ...get().nibp, measuring: true, until: now() + 6000 } });
}

// ─── Instructor ─────────────────────────────────────────────────────────────

export function loadScenario(sc: Scenario) {
  install();
  // A scenario is a new patient: showing its rhythm ends everything done to the last one — here (code record,
  // delayed responses) and elsewhere (drugs given in the Learn view). It also hands the trainee a device at its
  // defaults (200 J, SYNC off). Then this patient's own heart and vital signs.
  showRhythm(sc.profile, sc.hr);
  resetCode();
  sim.hemo.setOverride(sc.baseline);
  set({ baseline: sc.baseline, vitals: { spo2: sc.spo2, rr: sc.rr, etco2: sc.etco2 }, scenario: sc, codeStart: sc.arrest ? now() : null });
  log(`Scenario: ${sc.label}`, 'info');
}

export function instructorRhythm(profileId: string, hr?: number) {
  const s = get();
  if (s.pacer.on && s.pacer.captured) {
    set({ underlying: { profileId, hr: hr ?? resolveProfile(profileId).defaultHR } });
    evaluatePacing();
    return;
  }
  setRhythm(profileId, hr);
  log(`Instructor: rhythm changed`, 'rhythm');
  if (s.pacer.on) { set({ underlying: null }); evaluatePacing(); }
}

export function setBaseline(b: HemoProfile | null) {
  sim.hemo.setOverride(b);
  set({ baseline: b });
}

export function setVitals(p: Partial<DefibState['vitals']>) {
  set({ vitals: { ...get().vitals, ...p } });
}

export function forceRosc() { roscNow('Instructor: ROSC'); }

export function resetCode(keepVitals = false) {
  clearPatient(keepVitals, false);
  sim.epoch++;
}

/**
 * Forget the patient: the code record, counters and timers, CPR, pacing, a charge, delayed responses, the heart
 * behind the pressures. `keepSettings` leaves the device as it was set (energy, SYNC) for the next patient.
 * Returns whether the tracings must be redrawn (artefacts gone, another heart behind the pressures).
 */
function clearPatient(keepVitals: boolean, keepSettings: boolean): boolean {
  const drawn = cprIntervals.length + pacerIntervals.length + shockTimes.length > 0 || sim.hemo.baseline !== null;
  cprIntervals.length = 0;
  pacerIntervals.length = 0;
  shockTimes.length = 0;
  scheduled.length = 0;
  const s = get();
  const fresh = initial();
  useDefibStore.setState({
    ...fresh,
    mode: s.mode === 'pacer' ? 'monitor' : s.mode,
    trainee: s.trainee,
    sound: s.sound,
    vitals: keepVitals ? s.vitals : fresh.vitals,
    ...(keepSettings ? { energy: s.energy, sync: s.mode === 'manual' && s.sync } : null),
  });
  sim.hemo.setOverride(null);
  return drawn;
}

// A new patient: no shocks, drugs or CPR yet, nothing still on its way from the last patient, the heart that goes
// with the rhythm shown (not a scenario's), and a device that is neither charged nor pacing. The device itself
// stays as the learner set it: mode, energy and SYNC (a lesson sets them in one step and shocks in a later one).
onNewPatient(() => {
  if (clearPatient(false, true)) sim.epoch++;
});

/**
 * Is a patient being worked on at the defibrillator — a scenario, CPR, pacing, a charge, or anything in the code
 * record? Then putting up another rhythm for study would end that code.
 */
export function codeInProgress(): boolean {
  const s = get();
  return !!s.scenario || s.cpr.on || s.pacer.on || s.charge !== 'idle' || s.codeStart !== null || s.log.length > 0;
}

export function setTrainee(v: boolean) { set({ trainee: v }); }
export function setSound(v: boolean) { set({ sound: v }); }

// ─── Tick (called from the simulation loop) ────────────────────────────────

export function tickDefib(t: number) {
  const before = get();
  if (!installed && (before.log.length || before.cpr.on || before.pacer.on)) install();
  // The projector shows what the main window's device does. Its own clock started at another moment, so running
  // the device here too would finish a charge, an analysis or a blood-pressure reading at the wrong time.
  if (before.mirror) return;
  // Scheduled patient responses, in the order they were due: a jump of the clock (the strip dragged forward) can
  // make several due in the same frame, and a response may schedule the next one
  for (;;) {
    let k = -1;
    for (let i = 0; i < scheduled.length; i++) {
      if (scheduled[i].at <= t && (k < 0 || scheduled[i].at < scheduled[k].at)) k = i;
    }
    if (k < 0) break;
    const job = scheduled.splice(k, 1)[0];
    due = job.at;
    try { job.fn(); } finally { due = null; }
  }
  // (read after the responses: they may have changed the device, e.g. ROSC stops CPR)
  const s = get();
  // Charging
  if (s.charge === 'charging' && t >= s.chargeDone) {
    set({ charge: 'charged', chargeDone: t });
    prompt(s.mode === 'aed' ? 'SHOCK ADVISED — stand clear and press SHOCK' : `${s.energy} J ready — "Clear!" — press SHOCK`);
  } else if (s.charge === 'charged' && t - s.chargeDone > 60000) {
    disarm('Charge removed automatically after 60 s');
  }
  // Synchronized discharge on the next R wave
  if (s.pendingSyncSince !== null) {
    const e = sim.engine;
    const i = e.lastVentIndex(t);
    const v = i >= 0 ? e.vent[i] : null;
    const rhythm = currentProfile().rhythm;
    if (v && v.t >= s.pendingSyncSince && t >= v.t + 15 && rhythm !== 'vf' && rhythm !== 'torsades') {
      deliver(v.t + 15, true);
    } else if (t - s.pendingSyncSince > 3000) {
      set({ pendingSyncSince: null });
      prompt('SYNC could not find an R wave — for VF / pulseless or polymorphic VT turn SYNC off and defibrillate');
      log('Synchronized shock not delivered: no reliable R wave', 'warn');
    }
  }
  // AED analysis
  if (s.aed.phase === 'analyzing') {
    if (s.cpr.on) set({ aed: { phase: 'analyzing', until: t + 6000 } });
    else if (t >= s.aed.until) {
      const id = useECGStore.getState().activeProfileId;
      if (shockable(id)) {
        set({ aed: { phase: 'shock', until: t } });
        log('AED: shock advised', 'info');
        const e = get();
        set({ charge: 'charging', chargeDone: t + 2500 + (e.energy / 200) * 3500 });
        prompt('Shock advised — charging. Stay clear');
      } else {
        set({ aed: { phase: 'no-shock', until: t } });
        log('AED: no shock advised', 'info');
        prompt('No shock advised — resume CPR immediately, starting with compressions (pulse check ≤ 10 s only if an organized rhythm is seen)');
      }
    }
  }
  // NIBP
  if (s.nibp.measuring && t >= s.nibp.until) {
    const h = sim.hemo.summary(t);
    // an oscillometric cuff measures the pulsations in the artery: where no pulse can be felt it finds none to read
    // either (a reading of 67/53 beside "No pulse" would make a pulseless VT look like one that perfuses)
    const ok = palpable(h);
    set({ nibp: { measuring: false, until: 0, last: ok ? { sbp: h.sbp, dbp: h.dbp, map: h.map } : 'fail' } });
    log(ok ? `NIBP ${h.sbp}/${h.dbp} (${h.map})` : 'NIBP: unable to measure', 'info');
  }
  // Pacing follows rhythm / rate changes made elsewhere
  const active = useECGStore.getState().activeProfileId;
  if (s.pacer.on && !s.pacer.captured && s.underlying && s.underlying.profileId !== active) {
    set({ underlying: null });
    evaluatePacing();
  } else if (s.pacer.on && s.pacer.captured && active !== 'tcp') {
    set({ underlying: null, pacer: { ...s.pacer, captured: false } });
    stopPacing();
  }
}

// ─── Vitals and auxiliary waveforms ────────────────────────────────────────

export interface Vitals {
  hr: number;
  pulse: boolean;
  spo2: number | null;
  etco2: number;
  rr: number;
  sbp: number;
  dbp: number;
  co: number;
  /** the model's own pressure range, for scaling the pleth when the numbers are scripted */
  wave?: [number, number];
}

/**
 * A simulator scenario scripts the patient's numbers; the rhythm still comes from the ECG engine. `continuousFlow`: the
 * circulation is a continuous-flow LVAD's — perfusing (`pulse`) but with almost no pulsation, so the pleth is nearly flat
 */
export interface ScriptedVitals { pulse: boolean; sbp: number; dbp: number; spo2: number; rr: number; etco2: number; continuousFlow?: boolean }

/** How much of a normal plethysmogram a continuous-flow pump leaves (the native heart's own small pulsation) */
export const CONTINUOUS_FLOW_PLETH = 0.15;
let scripted: ScriptedVitals | null = null;

export function setScriptedVitals(v: ScriptedVitals | null) { scripted = v; }

/** Show a blood-pressure reading on the monitor's NIBP box ('fail' = no reading, null = blank) */
export function setNibpReading(r: { sbp: number; dbp: number } | 'fail' | null) {
  const last = r === null || r === 'fail' ? r : { ...r, map: Math.round((r.sbp + 2 * r.dbp) / 3) };
  set({ nibp: { measuring: false, until: 0, last } });
}

export function vitalsAt(t: number): Vitals {
  const s = get();
  const h = sim.hemo.summary(t);
  if (scripted) {
    const v = scripted;
    return { hr: sim.engine.heartRate(t), pulse: v.pulse, spo2: v.pulse ? v.spo2 : null, etco2: v.etco2, rr: v.rr, sbp: v.sbp, dbp: v.dbp, co: h.co, wave: [h.sbp, h.dbp] };
  }
  const pulse = palpable(h);
  const hr = sim.engine.heartRate(t);
  const lastShockAgo = t - s.lastShock;
  let spo2: number | null = null;
  if (pulse) spo2 = Math.round(Math.max(70, s.vitals.spo2 - (h.co < 2.5 ? 3 : 0) - (h.sbp < 70 ? 2 : 0)));
  let etco2: number;
  let rr = pulse ? (s.vitals.rr || 12) : s.cpr.on ? 10 : 0;
  if (pulse) etco2 = Math.round(s.vitals.etco2 * Math.max(0.6, Math.min(1.12, Math.pow(Math.max(0.3, h.co) / 5, 0.3))));
  else if (s.cpr.on) etco2 = s.cpr.quality === 'good' ? 18 : 9;
  else etco2 = 2;
  // A pause in a beating heart (the seconds of AV block after adenosine) is not an arrest: there is no pulse to
  // feel or measure, but the patient goes on breathing for now and the CO2 reaching the lungs fades breath by breath
  const prof = sim.engine.segmentAt(t).profile;
  if (!pulse && !s.cpr.on && prof.hemo !== 'no-output' && prof.rhythm !== 'vf' && prof.rhythm !== 'asystole' && prof.rhythm !== 'torsades') {
    const vi = sim.engine.lastVentIndex(t);
    const since = vi >= 0 ? t - sim.engine.vent[vi].t : 0;
    rr = s.vitals.rr || 12;
    etco2 = Math.round(s.vitals.etco2 * Math.max(0.2, Math.exp(-since / 12000)));
  }
  if (lastShockAgo >= 0 && lastShockAgo < 1500) spo2 = null;
  return { hr, pulse, spo2, etco2, rr, sbp: h.sbp, dbp: h.dbp, co: h.co };
}

/**
 * Pulse-oximetry plethysmogram (0..~1.1): the finger's volume pulse from the hemodynamic model (quick upstroke,
 * rounded peak, dicrotic notch, slow run-off); CPR-driven waves when pulseless.
 */
export function plethAt(t: number, pulse: boolean): number {
  const s = get();
  if (pulse) return Math.min(1.12, 0.86 * sim.hemo.pleth(t)) * (scripted?.continuousFlow ? CONTINUOUS_FLOW_PLETH : 1);
  for (let i = cprIntervals.length - 1; i >= 0; i--) {
    const c = cprIntervals[i];
    if (t >= c.start && t <= c.end) {
      const period = c.quality === 'good' ? 545 : 750;
      const ph = ((t - 150 - c.start) % period) / period;
      return (s.cpr.quality === 'good' ? 0.35 : 0.18) * Math.exp(-Math.pow((ph - 0.3) / 0.15, 2));
    }
    if (t > c.end) break;
  }
  return 0;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Capnogram (mmHg) for one breath: phase I (dead-space gas, flat at zero), phase II (the steep S-shaped rise as
 * alveolar gas arrives), phase III (the gently rising alveolar plateau that ends at the end-tidal value) and the
 * inspiratory down-stroke back to zero.
 */
export function capnoAt(t: number, rr: number, etco2: number): number {
  if (rr <= 0) return 0;
  const period = 60000 / rr;
  const x = (((t % period) + period) % period) / period;
  const rise = smooth(0.04, 0.15, x);
  const plateau = 0.9 + 0.1 * Math.min(1, Math.max(0, (x - 0.12) / 0.43));
  const fall = 1 - smooth(0.55, 0.61, x);
  return etco2 * rise * plateau * fall;
}

/** Mirror another window's device state (projector view): recreate artefacts on this clock */
export function mirrorRemote(m: {
  baseline: HemoProfile | null;
  defib: Partial<DefibState>;
  ages: { code: number | null; epi: number | null; shock: number | null; cpr: number | null };
}) {
  install();
  const t = now();
  const prev = get();
  sim.hemo.setOverride(m.baseline);
  const cprOn = !!m.defib.cpr?.on;
  const lastC = cprIntervals[cprIntervals.length - 1];
  const cprOpen = !!lastC && lastC.end === Infinity;
  if (cprOn && !cprOpen) cprIntervals.push({ start: t - Math.min(m.ages.cpr ?? 0, 2000), end: Infinity, quality: m.defib.cpr!.quality });
  if (!cprOn && cprOpen) lastC.end = t;
  const pc = m.defib.pacer;
  const spikes = !!pc && pc.on && !pc.captured && !pc.inhibited;
  const lastP = pacerIntervals[pacerIntervals.length - 1];
  const pOpen = !!lastP && lastP.end === Infinity;
  if (pOpen && (!spikes || lastP.period !== 60000 / (pc?.rate ?? 70))) lastP.end = t;
  if (spikes && !(pOpen && lastP.period === 60000 / pc!.rate)) pacerIntervals.push({ start: t, end: Infinity, period: 60000 / pc!.rate });
  const shockAt = m.ages.shock !== null ? t - m.ages.shock : -1e9;
  if (m.ages.shock !== null && m.ages.shock < 2500 && Math.abs(shockAt - prev.lastShock) > 500) shockTimes.push(shockAt);
  set({
    ...m.defib,
    mirror: true,
    baseline: m.baseline,
    codeStart: m.ages.code !== null ? t - m.ages.code : null,
    lastEpi: m.ages.epi !== null ? t - m.ages.epi : null,
    lastShock: shockAt,
    cpr: m.defib.cpr ? { ...m.defib.cpr, since: t - (m.ages.cpr ?? 0), cycleStart: t - (m.ages.cpr ?? 0) } : prev.cpr,
  });
}

export function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
