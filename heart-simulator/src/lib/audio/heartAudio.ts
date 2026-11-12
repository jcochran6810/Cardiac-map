'use client';

/**
 * Heart sounds through the speaker: turns the timed events of `physiology/heartSounds.ts` into audio.
 *
 * Real heart sounds are mostly below 150 Hz, which phone and laptop speakers cannot reproduce, so each
 * sound here keeps its true character (S1 lower and longer than S2, S3/S4 dull, a snap sharp, murmurs
 * as shaped noise) but carries enough energy between 150 and 500 Hz to be heard without headphones.
 */
import type { HeartSound, Murmur } from '@/lib/physiology/heartSounds';

type Ctx = AudioContext;

/** [start Hz, end Hz, length s, loudness]: a short tone that falls in pitch and dies away */
const THUMP: Record<HeartSound['kind'], [number, number, number, number]> = {
  s1: [150, 90, 0.13, 0.95],
  s2: [210, 150, 0.085, 0.8],
  s3: [95, 65, 0.11, 0.42],
  s4: [85, 60, 0.1, 0.36],
  snap: [420, 330, 0.035, 0.4],
};

/** [centre Hz, Q, loudness]: the band of noise each murmur is made of */
const MURMUR: Record<Murmur['kind'], [number, number, number]> = {
  as: [330, 1.1, 0.34],
  hcm: [300, 1.2, 0.3],
  mr: [520, 0.9, 0.24],
  ms: [140, 1.4, 0.34],
};

const STEPS = 32;

/** Loudness through a murmur (0..1 over its length): the shape a stethoscope hears */
export function murmurShape(kind: Murmur['kind'], x: number, presystolic = false): number {
  const k = Math.max(0, Math.min(1, x));
  const ease = (a: number, b: number) => {
    const t = Math.max(0, Math.min(1, (k - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  switch (kind) {
    // crescendo–decrescendo ("diamond"), peaking a little after mid-systole
    case 'as': return Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.08)), 1.4);
    // builds as the obstruction develops, then stops short of S2
    case 'hcm': return ease(0.1, 0.65) * (1 - ease(0.85, 1));
    // the same loudness all the way through
    case 'mr': return ease(0, 0.06) * (1 - ease(0.95, 1));
    // loud after the snap, fading — and swelling again before S1 when the atrium contracts
    case 'ms': return ease(0, 0.05) * (0.85 - 0.5 * k) + (presystolic ? 0.75 * ease(0.72, 0.97) * (1 - ease(0.97, 1)) : 0);
  }
}

class HeartAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a tap or key press: browsers only start audio on a user gesture */
  enable(): boolean {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        // a gentle limiter so overlapping sounds never clip
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** seconds on the audio clock */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Stop making sound (already scheduled sounds are cut off) */
  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  /** A heart sound `inSeconds` from now */
  thump(kind: HeartSound['kind'], inSeconds: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const [f0, f1, dur, vol] = THUMP[kind];
    const at = ctx.currentTime + Math.max(0.005, inSeconds);
    // the body of the sound, and a quieter partial an octave and a bit above it for small speakers
    for (const [mult, level] of [[1, 1], [2.1, kind === 'snap' ? 0.5 : 0.38]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0 * mult, at);
      osc.frequency.exponentialRampToValueAtTime(f1 * mult, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * level, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.master);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }
  }

  /** A murmur starting `inSeconds` from now and lasting `seconds` */
  murmur(m: Pick<Murmur, 'kind' | 'presystolic'>, inSeconds: number, seconds: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || seconds < 0.03) return;
    const [freq, q, vol] = MURMUR[m.kind];
    const at = ctx.currentTime + Math.max(0.005, inSeconds);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const g = ctx.createGain();
    const curve = new Float32Array(STEPS + 1);
    for (let i = 0; i <= STEPS; i++) curve[i] = Math.max(0.0001, vol * murmurShape(m.kind, i / STEPS, m.presystolic));
    curve[0] = 0.0001;
    curve[STEPS] = 0.0001;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.setValueCurveAtTime(curve, at, seconds);
    src.connect(band).connect(g).connect(this.master);
    // start somewhere different in the noise each time so beats do not sound identical
    src.start(at, Math.random() * 1.5);
    src.stop(at + seconds + 0.03);
  }
}

export const heartAudio = new HeartAudio();
