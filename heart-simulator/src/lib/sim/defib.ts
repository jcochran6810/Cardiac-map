'use client';

/**
 * Monitor-defibrillator trainer: device state, ACLS logic and patient responses.
 *
 * A generic, unbranded device (monitor / AED / manual defibrillation / synchronised
 * cardioversion / transcutaneous pacing) wired to the shared simulation clock, ECG engine and
 * hemodynamic model. Energies, doses and sequences follow the AHA ACLS algorithms
 * (2020 guidelines with 2023 focused updates). Outcome probabilities are simulation settings
 * chosen to make practice realistic, not predictions for real patients.
 *
 * Concept (instructor-driven monitor/defib practice with live vitals) inspired by the
 * EMSDojo student project; no code or artwork from it is used.
 */
import { create } from 'zustand';
import { sim } from '@/lib/sim/simulation';
import { setRhythm, showRhythm } from '@/lib/rhythm';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { resolveProfile, type HemoProfile } from '@/lib/ecg/profiles';
import type { AnyLead } from '@/lib/ecg/vector';

export type DefibMode = 'monitor' | 'aed' | 'manual' | 'pacer';
export type LogKind = 'shock' | 'drug' | 'rhythm' | 'cpr' | 'info' | 'warn' | 'pacing' | 'rosc';
export interface LogEntry { t: number; text: string; kind: LogKind }

export const ENERGIES = [50, 75, 100, 120, 150, 200] as const;

export interface DrugDef {
  id: string;
  label: string;
  dose: (s: DefibState) => string;
  indication: string;
}

export const DRUGS: DrugDef[] = [
  { id: 'epinephrine', label: 'Epinephrine', dose: () => '1 mg IV/IO (1 mg/10 mL), every 3–5 min', indication: 'Cardiac arrest (all rhythms)' },
  { id: 'amiodarone', label: 'Amiodarone', dose: (s) => (pulseNow() ? '150 mg IV over 10 min' : s.amioDoses === 0 ? '300 mg IV/IO bolus' : '150 mg IV/IO bolus'), indication: 'Refractory VF/pVT; stable wide-complex tachycardia' },
  { id: 'lidocaine', label: 'Lidocaine', dose: (s) => (s.lidoDoses === 0 ? '1–1.5 mg/kg IV/IO' : '0.5–0.75 mg/kg IV/IO'), indication: 'Alternative to amiodarone for VF/pVT' },
  { id: 'adenosine', label: 'Adenosine', dose: (s) => (s.adenosineDoses === 0 ? '6 mg rapid IV push + 20 mL flush' : '12 mg rapid IV push + flush'), indication: 'Regular narrow-complex SVT (stable)' },
  { id: 'atropine', label: 'Atropine', dose: () => '1 mg IV every 3–5 min (max 3 mg)', indication: 'Symptomatic bradycardia' },
  { id: 'magnesium', label: 'Magnesium sulfate', dose: () => '1–2 g IV/IO', indication: 'Torsades de pointes' },
  { id: 'diltiazem', label: 'Diltiazem', dose: () => '15–20 mg (0.25 mg/kg) IV over 2 min', indication: 'Rate control of AF / flutter (not in HFrEF, hypotension or WPW)' },
  { id: 'calcium', label: 'Calcium chloride', dose: () => '1 g IV (10 mL of 10%)', indication: 'Hyperkalaemia with ECG changes / arrest' },
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
  { id: 'pea', label: 'PEA arrest', profile: 'pea', hr: 44, baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: '72-year-old haemodialysis patient who missed two sessions; found unresponsive. Monitor shows organised activity, no pulse.' },
  { id: 'asystole', label: 'Asystole', profile: 'asystole', baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: 'Unwitnessed arrest at home, downtime unknown. Confirm asystole in two leads and check gain and connections.' },
  { id: 'torsades', label: 'Torsades', profile: 'torsades', baseline: null, spo2: 97, rr: 0, etco2: 38, arrest: true, story: 'Patient on methadone and ondansetron becomes unresponsive on the ward; the monitor shows a twisting polymorphic rhythm.' },
  { id: 'svt-unstable', label: 'Unstable SVT', profile: 'avnrt', hr: 190, baseline: 'shock', spo2: 94, rr: 24, etco2: 31, arrest: false, story: '64-year-old with ischaemic cardiomyopathy: palpitations, chest pain, confusion, clammy. Regular narrow tachycardia.' },
  { id: 'svt-stable', label: 'Stable SVT', profile: 'avnrt', hr: 180, baseline: null, spo2: 98, rr: 18, etco2: 36, arrest: false, story: '28-year-old with sudden palpitations at rest, alert and well perfused.' },
  { id: 'af-unstable', label: 'Unstable AF', profile: 'atrial-fibrillation', hr: 160, baseline: 'shock', spo2: 92, rr: 26, etco2: 30, arrest: false, story: '70-year-old with new irregular tachycardia, hypotension and acute pulmonary oedema.' },
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

export function pulseNow(): boolean {
  const s = sim.hemo.summary(sim.time);
  return !s.noOutput && s.sbp >= 50;
}

function changeRhythm(profileId: string, hr?: number, note?: string) {
  setRhythm(profileId, hr);
  if (note) log(note, 'rhythm');
}

const scheduled: { at: number; fn: () => void }[] = [];
function after(ms: number, fn: () => void) { scheduled.push({ at: now() + ms, fn }); }

function isArrestRhythm(id: string) {
  const p = resolveProfile(id);
  return p.hemo === 'no-output';
}

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
  const s = get();
  if (s.mode === 'monitor' || s.mode === 'pacer') set({ mode: 'manual' });
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

function energySuccess(kind: 'vf' | 'af' | 'flutter' | 'svt' | 'vt', j: number): number {
  switch (kind) {
    case 'vf': return j >= 150 ? 0.82 : j >= 120 ? 0.75 : j >= 100 ? 0.6 : 0.35;
    case 'af': return j >= 200 ? 0.9 : j >= 150 ? 0.85 : j >= 120 ? 0.75 : j >= 100 ? 0.55 : 0.3;
    case 'flutter': return j >= 100 ? 0.95 : 0.85;
    case 'svt': return j >= 100 ? 0.95 : 0.88;
    case 'vt': return j >= 100 ? 0.9 : 0.7;
  }
}

function deliver(t: number, synced: boolean) {
  const s = get();
  const prof = currentProfile();
  const pulse = pulseNow();
  shockTimes.push(t);
  const n = s.shocks + 1;
  set({ charge: 'idle', pendingSyncSince: null, shocks: n, lastShock: t, aed: { phase: 'idle', until: 0 } });
  log(`Shock ${n}: ${s.energy} J ${synced ? 'synchronised' : 'unsynchronised'}`, 'shock');
  prompt(s.cpr.on ? null : 'Shock delivered — resume CPR immediately (if in arrest)');

  const r = prof.rhythm;
  const rand = Math.random();
  // Pulseless VF / VT / torsades
  if (r === 'vf' || r === 'torsades' || (r === 'vt' && !pulse)) {
    const p = Math.min(0.95, energySuccess('vf', s.energy) + s.antiarrhythmicBonus + (s.lastEpi !== null ? 0.03 : 0));
    if (rand < p) {
      after(2200, () => {
        const o = Math.random();
        if (o < 0.55) {
          roscNow('Shock terminated VF/VT — organised rhythm WITH a pulse (ROSC)');
          if (r === 'torsades' && !get().magnesiumGiven) after(25000, () => {
            if (!get().magnesiumGiven && Math.random() < 0.5) changeRhythm('torsades', undefined, 'Torsades recurred — give magnesium, stop QT-prolonging drugs, correct K⁺; consider overdrive pacing');
          });
        } else if (o < 0.8) changeRhythm('pea', 50, 'Shock terminated VF/VT — organised rhythm but NO pulse (PEA)');
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
  // Organised rhythm with a pulse
  if (!synced) {
    log('Unsynchronised shock on an organised rhythm with a pulse — use SYNC for cardioversion', 'warn');
    if (vulnerable(t) && Math.random() < 0.6) {
      after(300, () => changeRhythm('vf', undefined, 'R-on-T: shock landed on the T wave and induced VF'));
      return;
    }
  }
  const kind = r === 'af' ? 'af' : r === 'flutter' ? 'flutter' : r === 'svt' ? 'svt' : r === 'vt' ? 'vt' : null;
  if (!kind) {
    log('No shockable or cardiovertible rhythm — the shock was not indicated', 'warn');
    return;
  }
  if (rand < energySuccess(kind, s.energy)) after(1500, () => changeRhythm('normal-sinus', 88, 'Cardioversion successful — sinus rhythm'));
  else log('Cardioversion unsuccessful — consider escalating energy', 'rhythm');
}

function roscNow(note: string) {
  changeRhythm('sinus-tachycardia', 108, note);
  const s = get();
  if (s.cpr.on) stopCPR(true);
  log('ROSC: check pulse and BP, SpO2 92–98%, PaCO2 35–45 mmHg, 12-lead ECG, treat hypotension (SBP ≥ 90, MAP ≥ 65)', 'rosc');
}

export function analyze() {
  install();
  const s = get();
  if (s.mode !== 'aed') setMode('aed');
  set({ aed: { phase: 'analyzing', until: now() + 6000 } });
  prompt(get().cpr.on ? 'STOP CPR — motion detected. Do not touch the patient' : 'Analysing heart rhythm. Do not touch the patient');
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
  // Simulation: non-shockable arrest may regain a pulse after a full cycle of CPR with epinephrine
  const id = useECGStore.getState().activeProfileId;
  const odds = id === 'pea' && s.scenario?.id === 'pea' ? (s.calciumGiven ? 0.5 : 0.1) : 0.25;
  if (!silent && dur >= 110000 && (id === 'pea' || id === 'asystole') && s.lastEpi !== null && now() - s.lastEpi < 300000 && Math.random() < odds) {
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
      if (prof.rhythm === 'torsades') { log('Amiodarone prolongs the QT — avoid in torsades; give magnesium and defibrillate if pulseless', 'warn'); break; }
      if (!pulse && (prof.rhythm === 'vf' || prof.rhythm === 'vt')) {
        if (s.amioDoses >= 2) { log('Arrest dosing is 300 mg then one 150 mg dose — no further boluses', 'warn'); break; }
        if (s.shocks < 3 && s.amioDoses === 0) log('Amiodarone is usually given after the 3rd shock for refractory VF/pVT', 'info');
        set({ antiarrhythmicBonus: Math.min(0.15, s.antiarrhythmicBonus + 0.1) });
      } else if (pulse && prof.rhythm === 'vt') {
        if (sim.hemo.summary(sim.time).sbp < 90) log('Hypotension = unstable VT: synchronised cardioversion is indicated; drugs are for stable VT', 'warn');
        after(60000, () => { if (currentProfile().rhythm === 'vt' && Math.random() < 0.35) changeRhythm('normal-sinus', 84, 'VT terminated after amiodarone'); else log('VT persists after amiodarone — consider synchronised cardioversion / expert consultation', 'rhythm'); });
      } else if (pulse && (prof.rhythm === 'af' || prof.rhythm === 'flutter')) {
        log('IV amiodarone can slow the rate in critically ill or HFrEF patients (it may also cardiovert — consider anticoagulation status)', 'info');
        after(90000, () => { if (currentProfile().id === pid) changeRhythm(pid, prof.rhythm === 'flutter' ? 100 : 98, 'Ventricular rate slowing after amiodarone'); });
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
      const hr = useTimelineStore.getState().heartRate;
      if (prof.rhythm === 'svt') {
        if (Math.random() < (dose12 ? 0.85 : 0.6)) {
          after(4000, () => changeRhythm('asystole', undefined, 'Adenosine: transient AV block — brief pause'));
          after(8500, () => changeRhythm('normal-sinus', 82, 'SVT terminated — sinus rhythm'));
        } else after(5000, () => log('No conversion — SVT persists', 'rhythm'));
      } else if (prof.rhythm === 'flutter') {
        after(4000, () => changeRhythm(pid, 75, 'Adenosine: transient high-grade AV block reveals flutter waves (does not convert flutter)'));
        after(12000, () => changeRhythm(pid, hr));
      } else if (prof.rhythm === 'af') {
        after(4000, () => changeRhythm(pid, 60, 'Adenosine: transient slowing — irregular baseline confirms AF (does not convert AF)'));
        after(12000, () => changeRhythm(pid, hr));
      } else if (prof.rhythm === 'vt') {
        log('Adenosine does not terminate (most) VT — treat as VT', 'warn');
      } else if (prof.rhythm === 'sinus') {
        after(4000, () => changeRhythm(pid, Math.max(40, Math.round(hr * 0.6)), 'Adenosine: transient sinus slowing / AV block'));
        after(11000, () => changeRhythm(pid, hr));
      }
      break;
    }
    case 'atropine': {
      if (s.atropineMg >= 3) { log('Atropine: 3 mg maximum reached', 'warn'); break; }
      set({ atropineMg: s.atropineMg + 1 });
      if (!pulse) { log('Atropine is no longer recommended in cardiac arrest', 'warn'); break; }
      if (pid === 'sinus-bradycardia') after(20000, () => changeRhythm('normal-sinus', 76, 'Heart rate rising after atropine'));
      else if (pid === 'junctional' || pid === 'mobitz-i' || pid === 'first-degree-avb') after(20000, () => { if (Math.random() < 0.7) changeRhythm('normal-sinus', 78, 'Improved AV-nodal conduction after atropine'); else log('Little response to atropine', 'rhythm'); });
      else if (pid === 'mobitz-ii' || pid === 'third-degree-avb') after(15000, () => log('No response: block below the AV node with a wide escape rarely responds to atropine (a narrow junctional escape sometimes does) — pace or start a chronotropic infusion', 'rhythm'));
      else log('No bradycardia to treat', 'warn');
      break;
    }
    case 'magnesium': {
      set({ magnesiumGiven: true });
      if (prof.rhythm === 'torsades') log('Magnesium helps prevent recurrence, but pulseless torsades must be defibrillated now', 'info');
      break;
    }
    case 'diltiazem': {
      if (s.baseline === 'hfref' || s.baseline === 'shock' || !pulse) log('Avoid diltiazem in decompensated HFrEF, hypotension or shock', 'warn');
      if ((prof.rhythm === 'af' || prof.rhythm === 'flutter') && pulse) after(60000, () => changeRhythm(pid, prof.rhythm === 'flutter' ? 75 : 88, 'Ventricular rate slowing after diltiazem'));
      else if (prof.rhythm === 'svt' && pulse) after(30000, () => { if (Math.random() < 0.5) changeRhythm('normal-sinus', 80, 'SVT terminated after diltiazem'); });
      break;
    }
    case 'calcium': {
      set({ calciumGiven: true });
      if (pid === 'hyperkalemia' || s.scenario?.id === 'pea') log('Calcium stabilises the myocardium within minutes but does not lower K⁺ — add insulin/glucose, β-agonist and K⁺ removal (dialysis)', 'info');
      break;
    }
  }
}

// ─── Assessment tools ──────────────────────────────────────────────────────

export function checkPulse() {
  const s = sim.hemo.summary(sim.time);
  const cpr = get().cpr.on;
  const text = cpr ? 'Stop compressions to check for a pulse' : s.noOutput || s.sbp < 50 ? 'No pulse' : s.sbp < 80 ? 'Weak, thready pulse' : 'Pulse present';
  set({ pulseCheck: text });
  log(`Pulse check: ${text}`, 'info');
}

export function measureNibp() {
  set({ nibp: { ...get().nibp, measuring: true, until: now() + 6000 } });
}

// ─── Instructor ─────────────────────────────────────────────────────────────

export function loadScenario(sc: Scenario) {
  install();
  resetCode(true);
  sim.hemo.setOverride(sc.baseline);
  set({ baseline: sc.baseline, vitals: { spo2: sc.spo2, rr: sc.rr, etco2: sc.etco2 }, scenario: sc, codeStart: sc.arrest ? now() : null });
  showRhythm(sc.profile, sc.hr);
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
  });
  sim.hemo.setOverride(null);
  sim.epoch++;
}

export function setTrainee(v: boolean) { set({ trainee: v }); }
export function setSound(v: boolean) { set({ sound: v }); }

// ─── Tick (called from the simulation loop) ────────────────────────────────

export function tickDefib(t: number) {
  const s = get();
  if (!installed && (s.log.length || s.cpr.on || s.pacer.on)) install();
  // Scheduled patient responses
  if (scheduled.length) {
    for (let i = scheduled.length - 1; i >= 0; i--) {
      if (t >= scheduled[i].at) {
        const job = scheduled.splice(i, 1)[0];
        job.fn();
      }
    }
  }
  // Charging
  if (s.charge === 'charging' && t >= s.chargeDone) {
    set({ charge: 'charged', chargeDone: t });
    prompt(s.mode === 'aed' ? 'SHOCK ADVISED — stand clear and press SHOCK' : `${s.energy} J ready — "Clear!" — press SHOCK`);
  } else if (s.charge === 'charged' && t - s.chargeDone > 60000) {
    disarm('Charge removed automatically after 60 s');
  }
  // Synchronised discharge on the next R wave
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
      log('Synchronised shock not delivered: no reliable R wave', 'warn');
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
        prompt('No shock advised — resume CPR immediately, starting with compressions (pulse check ≤ 10 s only if an organised rhythm is seen)');
      }
    }
  }
  // NIBP
  if (s.nibp.measuring && t >= s.nibp.until) {
    const h = sim.hemo.summary(t);
    const ok = !h.noOutput && h.sbp >= 45;
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

/** A simulator scenario scripts the patient's numbers; the rhythm still comes from the ECG engine */
export interface ScriptedVitals { pulse: boolean; sbp: number; dbp: number; spo2: number; rr: number; etco2: number }
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
  const pulse = !h.noOutput && h.sbp >= 50;
  const hr = sim.engine.heartRate(t);
  const lastShockAgo = t - s.lastShock;
  let spo2: number | null = null;
  if (pulse) spo2 = Math.round(Math.max(70, s.vitals.spo2 - (h.co < 2.5 ? 3 : 0) - (h.sbp < 70 ? 2 : 0)));
  let etco2: number;
  const rr = pulse ? (s.vitals.rr || 12) : s.cpr.on ? 10 : 0;
  if (pulse) etco2 = Math.round(s.vitals.etco2 * Math.max(0.6, Math.min(1.12, Math.pow(Math.max(0.3, h.co) / 5, 0.3))));
  else if (s.cpr.on) etco2 = s.cpr.quality === 'good' ? 18 : 9;
  else etco2 = 2;
  if (lastShockAgo >= 0 && lastShockAgo < 1500) spo2 = null;
  return { hr, pulse, spo2, etco2, rr, sbp: h.sbp, dbp: h.dbp, co: h.co };
}

/** Pulse-oximetry plethysmogram (0..1), delayed arterial pulse; CPR-driven waves when pulseless */
export function plethAt(t: number, pulse: boolean, sbp: number, dbp: number): number {
  const s = get();
  if (pulse) {
    const a = sim.hemo.sample(t - 220).aop;
    return Math.max(0, Math.min(1.1, (a - dbp) / Math.max(5, sbp - dbp)));
  }
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

/** Capnogram (mmHg) for a breath cycle */
export function capnoAt(t: number, rr: number, etco2: number): number {
  if (rr <= 0) return 0;
  const period = 60000 / rr;
  const x = (t % period) / period;
  // Phase I (dead space) → II (steep rise) → III (alveolar plateau) → 0 (inspiratory down-stroke)
  const rise = x < 0.05 ? 0 : x < 0.12 ? (x - 0.05) / 0.07 : 1;
  const fall = x < 0.55 ? 1 : x < 0.6 ? 1 - (x - 0.55) / 0.05 : 0;
  const plateau = 0.92 + 0.08 * Math.min(1, Math.max(0, (x - 0.12) / 0.43));
  return etco2 * Math.min(rise, fall) * plateau;
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
