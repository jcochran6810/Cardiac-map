/**
 * Real angiograms, pressure-wire screens and intravascular images shown in the cath lab catalog and the
 * simulator, stored in public/cath-images/. Every one comes from an open-access case report under the
 * Creative Commons Attribution 4.0 licence (checked against the article's own licence statement) and is
 * credited, linked and marked "cropped" where it is shown.
 *
 * Keys are referenced by catalog items (`image.keys`) and by scenarios (`Scenario.images`).
 * `alt` names the kind of image only — it must not give away the finding a learner is asked to read;
 * `caption` says what it shows and is revealed once the read is given.
 */
export interface CathImage {
  /** path under public/, e.g. /cath-images/lad-occlusion.jpg */
  src: string;
  width: number;
  height: number;
  /** what kind of image this is (no findings) */
  alt: string;
  /** what the image shows — the teaching point */
  caption: string;
  /** authors, journal and figure, as the licence asks; says when the figure was cropped */
  credit: string;
  license: string;
  licenseUrl: string;
  /** the article the image came from */
  source: string;
}

const CC_BY_4 = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' } as const;
const pmc = (id: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`;

const SAITO = 'Saito R, Koyama K, Kongoji K, Soejima K. BMC Cardiovasc Disord 2022;22:206';
const KLEMENC = 'Klemenc M, Budihna G, Kranjec I. Eur Heart J Case Rep 2023;8:ytad605';
const LAHIRI = 'Lahiri S, Rashid O, Goel A, Moondhra A. Cureus 2025;17:e98607';
const KANDA = 'Kanda D, Takumi T, Sonoda T, et al. BMC Cardiovasc Disord 2021;21:55';

export const CATH_IMAGES: Partial<Record<string, CathImage>> = {
  'lad-occlusion': {
    src: '/cath-images/lad-occlusion.jpg', width: 777, height: 912,
    alt: 'Left coronary angiogram',
    caption: 'The proximal LAD stops dead (arrow): a total occlusion with no flow beyond it (TIMI 0).',
    credit: `${SAITO}, fig. 7B (cropped)`, ...CC_BY_4, source: pmc('PMC9088105'),
  },
  'rca-occlusion': {
    src: '/cath-images/rca-occlusion.jpg', width: 804, height: 912,
    alt: 'Right coronary angiogram',
    caption: 'The right coronary artery ends abruptly in its proximal segment (arrow): a total occlusion (TIMI 0). Nothing fills beyond it.',
    credit: `${SAITO}, fig. 7A (cropped)`, ...CC_BY_4, source: pmc('PMC9088105'),
  },
  'lad-intermediate-rao-cranial': {
    src: '/cath-images/lad-intermediate-rao-cranial.jpg', width: 648, height: 609,
    alt: 'Left coronary angiogram, RAO cranial view',
    caption: 'RAO cranial view of the left coronary: a moderate narrowing of the LAD (arrow) with flow preserved beyond it. By eye nobody can tell whether it limits flow — the pressure wire can.',
    credit: `${KLEMENC}, fig. 2 (cropped)`, ...CC_BY_4, source: pmc('PMC10762887'),
  },
  'lad-occlusion-thrombus': {
    src: '/cath-images/lad-occlusion-thrombus.jpg', width: 394, height: 391,
    alt: 'Left coronary angiogram',
    caption: 'The proximal LAD is totally occluded (arrow), with a large thrombus burden.',
    credit: 'Oktaviono YH, Hutomo SA, Al-Farabi MJ. Medicine (Baltimore) 2020;99:e19288, fig. 2B (cropped)', ...CC_BY_4, source: pmc('PMC7478610'),
  },
  'normal-left-rao-caudal': {
    src: '/cath-images/normal-left-rao-caudal.jpg', width: 382, height: 345,
    alt: 'Left coronary angiogram, RAO caudal view',
    caption: 'A normal left coronary system in the RAO caudal view: the left main dividing into a smooth LAD and circumflex, no narrowing anywhere.',
    credit: `${LAHIRI}, fig. 2B (cropped)`, ...CC_BY_4, source: pmc('PMC12770860'),
  },
  'normal-rca-lao': {
    src: '/cath-images/normal-rca-lao.jpg', width: 272, height: 409,
    alt: 'Right coronary angiogram, LAO view',
    caption: 'A normal but small right coronary in the LAO view. It is non-dominant: the posterior descending artery comes from the circumflex instead.',
    credit: `${LAHIRI}, fig. 2A (cropped)`, ...CC_BY_4, source: pmc('PMC12770860'),
  },
  'left-rao-caudal': {
    src: '/cath-images/left-rao-caudal.jpg', width: 880, height: 902,
    alt: 'Left coronary angiogram, RAO 30° caudal 25°',
    caption: 'The left coronary in RAO 30° caudal 25° (the angles are printed in the corner) — the classic view of the left main bifurcation and the circumflex with its marginal branches. The arrow marks an occluded circumflex branch in this patient.',
    credit: `${KANDA}, fig. 3a (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'left-lao-cranial': {
    src: '/cath-images/left-lao-cranial.jpg', width: 886, height: 902,
    alt: 'Left coronary angiogram, LAO 50° cranial 25°',
    caption: 'The same left coronary in LAO 50° cranial 25°: the tree looks completely different from the RAO caudal view. The arrow marks the same occluded circumflex branch.',
    credit: `${KANDA}, fig. 3b (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'rca-perforation': {
    src: '/cath-images/rca-perforation.jpg', width: 880, height: 933,
    alt: 'Right coronary angiogram, LAO 50°',
    caption: 'Contrast leaking out of the acute marginal branch of the right coronary (arrow): a coronary perforation. In this patient the needle of an emergency pericardiocentesis had nicked it; coils sealed it.',
    credit: `${KANDA}, fig. 3c (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'rca-lao-coils': {
    src: '/cath-images/rca-lao-coils.jpg', width: 886, height: 933,
    alt: 'Right coronary angiogram, LAO 50°',
    caption: 'The right coronary in LAO 50°: the classic "C" from the ostium round to the crux. The arrow marks coils that sealed a perforated branch.',
    credit: `${KANDA}, fig. 3d (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'ffr-console': {
    src: '/cath-images/ffr-console.jpg', width: 417, height: 228,
    alt: 'Pressure-wire console screen',
    caption: 'A pressure-wire console: FFR 0.90 (Pd 70 ÷ Pa 78 at maximal hyperemia) and a resting Pd/Pa of 0.96 — not significant (FFR ≤ 0.80 is). It also shows CFR and IMR, which test the small vessels.',
    credit: 'Provera A, Andreini D, Petersen K, et al. Eur Heart J Case Rep 2024;8:ytae172, fig. 2B (cropped)', ...CC_BY_4, source: pmc('PMC11033843'),
  },
  'rfr-pullback': {
    src: '/cath-images/rfr-pullback.jpg', width: 800, height: 469,
    alt: 'Resting pressure-ratio pullback through the LAD',
    caption: 'A resting pressure-ratio (RFR) pullback from the distal LAD (left) to the proximal LAD (right): the ratio rises gradually from 0.82 with no single step — diffuse disease, not one focal narrowing (a resting ratio ≤ 0.89 is significant).',
    credit: `${KLEMENC}, fig. 4`, ...CC_BY_4, source: pmc('PMC10762887'),
  },
  'oct-tcfa': {
    src: '/cath-images/oct-tcfa.jpg', width: 579, height: 579,
    alt: 'Optical coherence tomography cross-section of a coronary artery',
    caption: 'OCT cross-section: a thin-cap fibroatheroma (white arrow) over a dense lipid pool (red arrow), cholesterol crystals (green arrow) and fibrous tissue (asterisk). The bright rings in the lumen are the imaging catheter.',
    credit: 'Vijayvergiya R, Kanabar K, Panda P, Lal A. Eur Heart J Case Rep 2019;3:ytz139, fig. 2 (cropped)', ...CC_BY_4, source: pmc('PMC6764536'),
  },
  'lv-gram-aneurysm': {
    src: '/cath-images/lv-gram-aneurysm.jpg', width: 313, height: 359,
    alt: 'Left ventriculogram',
    caption: 'A left ventriculogram with a large apical aneurysm: a thin-walled pouch at the apex that bulges out while the rest of the ventricle squeezes. (This patient\'s coronaries were normal.)',
    credit: 'Roy Choudhury A, Valakkada J, Ayappan A. Eur Heart J Case Rep 2025;9:ytaf125, fig. 1D (cropped)', ...CC_BY_4, source: pmc('PMC12012445'),
  },
};
