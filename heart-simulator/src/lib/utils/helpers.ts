/**
 * Utility helpers for the cardiac education platform
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function formatPressure(systolic: number, diastolic: number): string {
  return `${Math.round(systolic)}/${Math.round(diastolic)}`;
}

export function formatHeartRate(hr: number): string {
  return `${Math.round(hr)} bpm`;
}

export function capitalizeWords(str: string): string {
  return str.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function getLearningLevelLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'EMT / NREMT-Basic',
    2: 'Paramedic',
    3: 'ED / ICU / Acute Care',
    4: 'Cardiology / Advanced',
    5: 'Interventional / EP / Structural',
  };
  return labels[level] || 'Unknown';
}
