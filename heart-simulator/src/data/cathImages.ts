/**
 * Real angiograms, pressure-wire screens, intravascular images, echo and X-ray images shown in the cath
 * lab catalog and the simulator, stored in public/cath-images/. Every one is a figure from an open-access
 * journal article under a Creative Commons Attribution licence (CC BY 3.0 or 4.0) — checked against the
 * article's own licence text, not just its metadata (the two can disagree: a "CC BY" link on a
 * non-commercial article was found and left out) — and is credited, linked and marked "cropped" where
 * it is shown.
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
const CC_BY_3 = { license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/' } as const;
const pmc = (id: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`;

const SAITO = 'Saito R, Koyama K, Kongoji K, Soejima K. BMC Cardiovasc Disord 2022;22:206';
const KLEMENC = 'Klemenc M, Budihna G, Kranjec I. Eur Heart J Case Rep 2023;8:ytad605';
const LAHIRI = 'Lahiri S, Rashid O, Goel A, Moondhra A. Cureus 2025;17:e98607';
const KANDA = 'Kanda D, Takumi T, Sonoda T, et al. BMC Cardiovasc Disord 2021;21:55';
const BARUS = 'Baruś P, Piasecki A, Gumiężna K, et al. Front Cardiovasc Med 2023;10:1021023';
const ALSARA = 'Alsara O, Alsarah A, Kalavakunta JK, et al. Case Rep Med 2013;2013:834164';
const CHATURVEDI = 'Chaturvedi A, Rotman Y, Hoang T, et al. Insights Imaging 2023;14:122';

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
  'ffr-significant': {
    src: '/cath-images/ffr-significant.jpg', width: 712, height: 448,
    alt: 'Pressure-wire console screen',
    caption: 'FFR 0.63: at maximal hyperemia the distal pressure (Pd, green) runs well below the aortic pressure (Pa, red) — Pd 62 ÷ Pa 98. Under 0.80, so the narrowing limits flow: treat it.',
    credit: `${BARUS}, fig. 3 top (cropped)`, ...CC_BY_4, source: pmc('PMC10325624'),
  },
  'ffr-not-significant': {
    src: '/cath-images/ffr-not-significant.jpg', width: 712, height: 471,
    alt: 'Pressure-wire console screen',
    caption: 'FFR 0.93: Pd 76 ÷ Pa 82 at maximal hyperemia — the narrowing does not limit flow. Above 0.80 it is treated with medicines, not a stent (FAME, DEFER).',
    credit: `${BARUS}, fig. 3 bottom (cropped)`, ...CC_BY_4, source: pmc('PMC10325624'),
  },
  'lad-dissection': {
    src: '/cath-images/lad-dissection.jpg', width: 661, height: 764,
    alt: 'Left coronary angiogram',
    caption: 'An LAD dissection after PCI (arrow): the false lumen fills late and faintly beside the brightly filled true lumen, and a thin lucent line — the intimal flap — runs between them.',
    credit: 'Fabrizio R, Mascitti L, Furci C. Radiol Case Rep 2023;19:35–8, fig. 1 (cropped)', ...CC_BY_4, source: pmc('PMC10598716'),
  },
  'radial-spasm': {
    src: '/cath-images/radial-spasm.jpg', width: 746, height: 691,
    alt: 'Forearm angiogram through a radial sheath',
    caption: 'Radial artery spasm: the artery is clamped tight around the sheath (red arrow). In this patient the sheath could not be pulled out until a nerve block relaxed the arm.',
    credit: 'Kovacs PL, Deutch Z, Castillo D. Cureus 2022;14:e33068, fig. 1 (cropped)', ...CC_BY_4, source: pmc('PMC9886372'),
  },
  'stent-thrombosis': {
    src: '/cath-images/stent-thrombosis.jpg', width: 750, height: 823,
    alt: 'Left coronary angiogram, RAO caudal view',
    caption: 'Stent thrombosis: the LAD is occluded at the stent (arrow). In this patient an allergic reaction to contrast set it off (Kounis syndrome).',
    credit: 'Okuda R, Utsumi S, Tanaka H, et al. Cureus 2024;16:e55514, fig. 2', ...CC_BY_4, source: pmc('PMC10915903'),
  },
  'lm-lao-caudal': {
    src: '/cath-images/lm-lao-caudal.jpg', width: 556, height: 522,
    alt: 'Left coronary angiogram, LAO caudal view',
    caption: 'LAO caudal ("spider") view: a severe narrowing right at the ostium of the left main (arrow). This view lays out the left main and its split into the LAD and circumflex.',
    credit: `${ALSARA}, fig. 3 (cropped)`, ...CC_BY_3, source: pmc('PMC3876687'),
  },
  'lm-rao-caudal': {
    src: '/cath-images/lm-rao-caudal.jpg', width: 559, height: 518,
    alt: 'Left coronary angiogram, RAO caudal view',
    caption: 'The same ostial left main narrowing (arrow) in the RAO caudal view. A left main lesion puts most of the left ventricle at risk.',
    credit: `${ALSARA}, fig. 2 (cropped)`, ...CC_BY_3, source: pmc('PMC3876687'),
  },
  'ivus-plaque-normal': {
    src: '/cath-images/ivus-plaque-normal.jpg', width: 798, height: 258,
    alt: 'Intravascular ultrasound cross-sections',
    caption: 'IVUS: left, an eccentric fibrous plaque (thicker on one side) at a left main narrowing; middle and right, normal vessel beyond it — a thin bright wall around a round lumen. The black circle in the centre is the catheter.',
    credit: 'Li B, Liu Y, Lou Z, et al. Medicine (Baltimore) 2022;101:e29116, fig. 2a–c (cropped)', ...CC_BY_4, source: pmc('PMC9276303'),
  },
  'oct-ivus-plaques': {
    src: '/cath-images/oct-ivus-plaques.jpg', width: 760, height: 376,
    alt: 'OCT and IVUS cross-sections side by side',
    caption: 'The same plaque types by OCT (top, orange) and IVUS (bottom, grey): A healthy wall, B calcium, C fibrous plaque, D lipid (asterisks mark the plaque). OCT is sharper near the lumen; IVUS sees deeper into the wall.',
    credit: `${BARUS}, fig. 2`, ...CC_BY_4, source: pmc('PMC10325624'),
  },
  'ivus-stent-expansion': {
    src: '/cath-images/ivus-stent-expansion.jpg', width: 793, height: 652,
    alt: 'IVUS measurements after stenting',
    caption: 'IVUS after stenting in four patients (rows A–D): the proximal reference, the narrowest stent area (MSA) and the distal reference, with the numbers on the right. An MSA well below the reference areas means an under-expanded stent — post-dilate it.',
    credit: 'Wu X, Wu MX, Huang HB, et al. Rev Cardiovasc Med 2024;25:57, fig. 5', ...CC_BY_4, source: pmc('PMC11263152'),
  },
  'tamponade-echo': {
    src: '/cath-images/tamponade-echo.jpg', width: 354, height: 265,
    alt: 'Echocardiogram, apical four-chamber view',
    caption: 'A large pericardial effusion all around the heart, squeezing the right atrium and right ventricle: tamponade. (In this patient a chest wound caused it.)',
    credit: 'Almehmadi F, Chandy M, Connelly KA, Edwards J. Case Rep Cardiol 2016;2016:2154748, fig. 2a (cropped)', ...CC_BY_4, source: pmc('PMC5019924'),
  },
  'impella-position': {
    src: '/cath-images/impella-position.jpg', width: 797, height: 275,
    alt: 'Chest X-ray and CT with an Impella pump',
    caption: 'An Impella in the right place: the outlet in the ascending aorta (solid arrow), the inlet over the left ventricle (dashed arrow), about 3.5 cm below the aortic valve. This one went in through the axillary artery.',
    credit: `${CHATURVEDI}, fig. 5`, ...CC_BY_4, source: pmc('PMC10350447'),
  },
  'iabp-low': {
    src: '/cath-images/iabp-low.jpg', width: 482, height: 684,
    alt: 'Chest X-ray with an intra-aortic balloon pump',
    caption: 'An IABP sitting too low: its tip marker (arrow) is below the carina. In this patient the balloon blocked the celiac and mesenteric arteries and the bowel became ischemic. The tip belongs 1–2 cm below the left subclavian artery, about level with the carina.',
    credit: `${CHATURVEDI}, fig. 3a (cropped)`, ...CC_BY_4, source: pmc('PMC10350447'),
  },
};
