/**
 * Real angiograms and fluoroscopy images shown in the cath lab catalog and the simulator, stored in
 * public/cath-images/ with their licence. Each one is openly licensed (e.g. CC BY / CC BY-SA from
 * Wikimedia Commons or an open-access journal) and credited where it is shown.
 *
 * Keys are referenced by catalog items (`image.key`) and by scenarios (`Scenario.images`).
 */
export interface CathImage {
  /** path under public/, e.g. /cath-images/lad-occlusion-rao-cranial.jpg */
  src: string;
  alt: string;
  /** author, as the licence asks */
  credit: string;
  /** e.g. "CC BY-SA 4.0" */
  license: string;
  /** the page the image came from */
  source: string;
}

export const CATH_IMAGES: Partial<Record<string, CathImage>> = {};
