/**
 * What each of the 12 leads "looks at", and which electrodes form it.
 *
 * A lead views the heart from its positive pole: the exploring electrode for the unipolar leads
 * (aVR, aVL, aVF, V1–V6, measured against a central terminal) and the positive limb electrode for
 * the bipolar limb leads (I, II, III, measured against another limb). The wall and artery are the
 * usual teaching correlations for localising ST elevation; individual coronary anatomy varies
 * (right- vs left-dominant circulation, a wraparound LAD).
 */
import type { Electrode } from './electrodes';
import type { StandardLead } from './vector';

export interface LeadView {
  /** The part of the heart this lead faces */
  wall: string;
  /** Short name for labels on the 3D heart */
  short: string;
  /** Usual culprit artery when ST elevation is seen here */
  artery: string;
  /** Positive (viewing) electrode */
  positive: Electrode;
  /** Negative pole: another limb electrode, or a central terminal */
  negative: Electrode | 'Goldberger' | 'Wilson';
}

export const LEAD_VIEWS: Record<StandardLead, LeadView> = {
  I: { wall: 'High lateral wall', short: 'High lateral wall', artery: 'LCx or a diagonal of the LAD', positive: 'LA', negative: 'RA' },
  II: { wall: 'Inferior wall', short: 'Inferior wall', artery: 'RCA (LCx if left-dominant)', positive: 'LL', negative: 'RA' },
  III: { wall: 'Inferior wall', short: 'Inferior wall', artery: 'RCA (LCx if left-dominant)', positive: 'LL', negative: 'LA' },
  aVR: {
    wall: 'Right upper heart: basal septum and the cavity',
    short: 'Basal septum / cavity',
    artery: 'ST elevation here with widespread ST depression suggests left main or multivessel ischaemia',
    positive: 'RA', negative: 'Goldberger',
  },
  aVL: { wall: 'High lateral wall', short: 'High lateral wall', artery: 'LCx or the first diagonal', positive: 'LA', negative: 'Goldberger' },
  aVF: { wall: 'Inferior wall', short: 'Inferior wall', artery: 'RCA (LCx if left-dominant)', positive: 'LL', negative: 'Goldberger' },
  V1: { wall: 'Septum (and the right ventricle)', short: 'Septum / RV', artery: 'LAD (septal branches)', positive: 'V1', negative: 'Wilson' },
  V2: { wall: 'Septum', short: 'Septum', artery: 'LAD (septal branches)', positive: 'V2', negative: 'Wilson' },
  V3: { wall: 'Anterior wall', short: 'Anterior wall', artery: 'LAD', positive: 'V3', negative: 'Wilson' },
  V4: { wall: 'Anterior wall (apex)', short: 'Anterior wall / apex', artery: 'LAD', positive: 'V4', negative: 'Wilson' },
  V5: { wall: 'Low lateral wall', short: 'Low lateral wall', artery: 'LCx or a diagonal', positive: 'V5', negative: 'Wilson' },
  V6: { wall: 'Low lateral wall', short: 'Low lateral wall', artery: 'LCx or a diagonal', positive: 'V6', negative: 'Wilson' },
};

/** Bipolar limb leads measure between two real electrodes */
export function isBipolar(lead: StandardLead): boolean {
  const n = LEAD_VIEWS[lead].negative;
  return n !== 'Goldberger' && n !== 'Wilson';
}

/**
 * The lead an electrode explores on its own (tapping an electrode shows this lead).
 * The right-leg electrode is the ground and belongs to no lead.
 */
export function leadForElectrode(e: Electrode): StandardLead | null {
  if (e === 'RA') return 'aVR';
  if (e === 'LA') return 'aVL';
  if (e === 'LL') return 'aVF';
  if (e === 'RL') return null;
  return e;
}

/** Where each electrode goes. Limb electrodes use torso (Mason–Likar) sites. */
export const ELECTRODE_SITE_TEXT: Record<Electrode, string> = {
  RA: 'Right infraclavicular fossa, just below the clavicle near the shoulder',
  LA: 'Left infraclavicular fossa, just below the clavicle near the shoulder',
  RL: 'Right lower abdomen (ground / reference, not part of any lead)',
  LL: 'Left lower abdomen, anterior axillary line between the costal margin and the iliac crest',
  V1: '4th intercostal space, right sternal border',
  V2: '4th intercostal space, left sternal border',
  V3: 'Midway between V2 and V4',
  V4: '5th intercostal space, midclavicular line',
  V5: 'Anterior axillary line, level with V4',
  V6: 'Midaxillary line, level with V4',
};

const NEGATIVE_TEXT: Record<'Goldberger' | 'Wilson', string> = {
  Goldberger: 'the average of the other two limb electrodes',
  Wilson: 'the Wilson central terminal (average of RA, LA and LL)',
};

/** One-line description of a lead's poles, e.g. "LA (+) against RA (−)" */
export function describePoles(lead: StandardLead): string {
  const v = LEAD_VIEWS[lead];
  const neg = v.negative === 'Goldberger' || v.negative === 'Wilson' ? NEGATIVE_TEXT[v.negative] : v.negative;
  return `${v.positive} (+) against ${neg} (−)`;
}
