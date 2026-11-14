/**
 * The ideal runs: a correct run for every registered scenario and every role it is written for. tests/scenarios.test.ts
 * checks each one ends by itself with full marks; other tests (and the diff harness, DIFF_IDEAL_FILE) start from them.
 */
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');

export const IDEAL: Record<string, Partial<Record<LearningLevel, string[]>>> = {
  'stemi-anterior-field': {
    1: ['primary', 'opqrst', 'sample', 'vitals', 'als', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', ...R(2), 'aed', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'pads', 'aspirin', 'iv', 'stemi-alert', 'ask-pde5', 'nitro', 'transport-pci', ...R(2), 'defib', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  },
  'stemi-inferior-rv-field': {
    1: ['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'ecg-right', 'aspirin', 'iv', 'stemi-alert', 'atropine', 'fluid', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'complete-heart-block-field': {
    2: ['primary', 'pads', 'nibp', 'iv', 'atropine', 'pace', 'pulse-check', 'fentanyl', 'sample', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'svt-unstable-field': {
    2: ['primary', 'pads', 'nibp', 'iv', 'sedation', 'cardiovert', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff'],
  },
  'vf-arrest-field': {
    1: ['als', 'cpr', 'aed', 'cpr', 'bvm', 'aed', 'bvm', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
    2: ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'capno', 'bvm', 'cpr', 'defib',
      'bvm', 'ecg12', 'pressor', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'stemi-inferior-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-jl4', 'cath-jr4', 'guide-jr4', 'view-rca-lao', 'wire-workhorse', 'balloon-predil',
      'callout', 'temp-wire', 'stent-des', 'ecg12', 'hemostasis'],
    4: ['consent', 'iv', 'heparin', 'p2y12', 'timeout', 'act', ...R(4), 'callout', 'atropine', 'fluid', 'reassess', 'ecg12', 'hemostasis', 'handoff'],
    5: ['consent', 'heparin', 'p2y12', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'guide-jr4', 'view-rca-lao', 'wire-workhorse',
      'balloon-predil', 'atropine', 'fluid', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'ffr-cathlab': {
    3: ['prep', 'transducer', 'monitor', 'timeout', 'cath-tiger', 'view-lao-caudal', 'view-rao-cranial', 'view-rao-caudal', 'view-rca-lao',
      'radial-cocktail', 'act', 'guide-ebu', 'ffr-equalize', 'ffr', 'ivus', 'stent-des', 'balloon-nc', 'hemostasis'],
    4: ['consent', 'iv', 'timeout', 'sedation', 'reassess', 'radial-cocktail', 'heparin', 'act', 'ic-nitro', 'adenosine-iv-ffr', 'reassess', 'p2y12',
      ...R(2), 'hemostasis', 'handoff'],
    5: ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'radial-cocktail', 'heparin', 'guide-ebu', 'ffr-equalize', 'ic-nitro', 'adenosine-iv-ffr',
      'ffr', 'ivus', 'p2y12', 'stent-des', 'balloon-nc', 'final-angio', 'handoff'],
  },
  'shock-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'rhc', 'impella', 'perfusion', 'guide-ebu', 'stent-des', 'ecg12'],
    4: ['iv', 'pressor', 'o2-nrb', 'consent', 'timeout', 'reassess', 'heparin', 'act', 'cangrelor', 'perfusion', ...R(4), 'ecg12', 'handoff'],
    5: ['consent', 'o2-nrb', 'pressor', 'timeout', 'access-femoral', 'access-venous', 'rhc', 'heparin', 'impella', 'cangrelor', 'cath-jl4', 'angio',
      'guide-ebu', 'view-rao-cranial', 'wire-workhorse', 'balloon-predil', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'perforation-cathlab': {
    3: ['callout', 'pericardiocentesis', 'stent-covered', 'hemostasis'],
    4: ['callout', 'fluid', 'call-surgery', ...R(2), 'act', 'hemostasis', 'handoff'],
    5: ['balloon-tamponade', 'call-surgery', 'fluid', 'echo', 'pericardiocentesis', 'stent-covered', 'final-angio', 'handoff'],
  },
  'contrast-cathlab': {
    3: ['prep', 'transducer', 'monitor', 'timeout', 'cath-tiger', 'stop-contrast', 'callout', 'o2-nrb', 'call-help', 'hemostasis'],
    4: ['consent', 'iv', 'timeout', 'reassess', 'callout', 'epi-im', 'fluid', 'o2-nrb', 'albuterol', 'diphenhydramine', 'steroid', 'hemostasis', 'handoff'],
    5: ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'stop-contrast', 'epi-im', 'fluid', 'o2-nrb', 'albuterol', 'diphenhydramine', 'steroid',
      'handoff'],
  },
  'hyperkalemia-dialysis-field': {
    2: ['primary', 'monitor', 'ecg12', 'sample', 'pads', 'iv', 'calcium-chloride', 'nibp', 'albuterol-hyperk', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'stable-vt-field': {
    2: ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'amio-infusion', 'transport-pci', ...R(6), 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  },
  'beta-blocker-overdose-field': {
    2: ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', 'atropine', 'glucagon', 'pressor', 'med-control', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'af-rvr-field': {
    2: ['primary', 'vitals', 'monitor', 'ecg12', 'opqrst', 'sample', 'lungs', 'iv', 'amio-infusion', 'transport-near', UNTIL_ARRIVED, 'handoff'],
  },
  'pea-arrest-field': {
    1: ['als', 'cpr', 'aed', 'bvm', 'cpr', 'cpr', 'cpr', 'bvm', 'vitals', 'ecg12', 'ecg-transmit', 'transport-near', UNTIL_ARRIVED, 'handoff'],
    2: ['cpr', 'pads', 'pulse-check', 'bvm', 'capno', 'hs-ts', 'iv', 'epinephrine', 'cpr', 'cpr', 'bvm', 'nibp', 'fluid', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff'],
  },
  'no-reflow-cathlab': {
    3: ['act', 'stent-des', 'callout', 'ic-epinephrine', 'ivus', 'ic-adenosine', 'callout', 'ecg12', 'hemostasis'],
    4: ['act', 'heparin', 'reassess', 'callout', 'ic-epinephrine', 'ecg12', 'ic-adenosine', 'callout', 'ecg12-repeat', 'hemostasis', 'handoff'],
    5: ['act', 'heparin', 'stent-des', 'ic-epinephrine', 'ivus', 'ic-adenosine', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'stemi-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger', 'guide-ebu', 'callout', 'view-rao-cranial', 'wire-workhorse',
      'balloon-predil', 'stent-des', 'defib', 'balloon-nc', 'ecg12', 'hemostasis'],
    4: ['consent', 'iv', 'heparin', 'p2y12', 'fentanyl', 'timeout', 'radial-cocktail', 'act', ...R(2), 'callout', ...R(2), 'fentanyl',
      'reassess', 'defib', 'ecg12', 'ic-nitro', 'hemostasis', 'handoff'],
    5: ['consent', 'heparin', 'p2y12', 'fentanyl', 'timeout', 'access', 'cath-tiger', 'angio', 'guide-ebu', 'reposition', 'view-rao-cranial',
      'wire-workhorse', 'balloon-predil', 'stent-des', 'defib', 'balloon-nc', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'posterior-stemi-field': {
    1: ['primary', 'vitals', 'als', 'opqrst', 'sample', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'pads', 'aspirin', 'ecg-posterior', 'stemi-alert', 'iv', 'ask-pde5', 'nitro',
      'transport-pci', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  },
  'cocaine-chest-pain-field': {
    1: ['primary', 'calm', 'als', 'vitals', 'opqrst', 'sample', 'aspirin', 'perfusion', 'temp', 'cool', 'ecg12', 'ecg-transmit', 'glucose', 'transport-pci',
      'notify', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'calm', 'vitals', 'perfusion', 'temp', 'sample', 'midazolam', 'cool', 'monitor', 'ecg12', 'opqrst', 'aspirin', 'ask-pde5', 'iv', 'nitro',
      'glucose', 'transport-pci', 'notify', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  },
  'aortic-dissection-field': {
    1: ['primary', 'opqrst', 'vitals', 'als', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', 'notify',
      UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'opqrst', 'vitals', 'bp-both-arms', 'perfusion', 'sample', 'ecg12', 'iv', 'fentanyl', 'med-control', 'metoprolol',
      'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff'],
  },
  'pulmonary-embolism-field': {
    1: ['primary', 'o2-nrb', 'als', 'vitals', 'perfusion', 'lungs', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', 'notify', UNTIL_ARRIVED,
      'handoff'],
    2: ['primary', 'vitals', 'o2-nrb', 'monitor', 'ecg12', 'perfusion', 'lungs', 'iv', 'pressor', 'sample', 'transport-pci', 'notify', UNTIL_ARRIVED,
      'handoff'],
  },
  'tamponade-field': {
    1: ['primary', 'vitals', 'als', 'perfusion', 'lungs', 'sample', 'o2-nc', 'ecg12', 'ecg-transmit', 'transport-pci', 'notify', UNTIL_ARRIVED,
      'handoff'],
    2: ['primary', 'vitals', 'perfusion', 'lungs', 'sample', 'o2-nc', 'ecg12', 'transport-pci', 'iv', 'fluid', 'notify', ...R(2), 'nibp', 'push-epi',
      UNTIL_ARRIVED, 'handoff'],
  },
  'scape-field': {
    1: ['primary', 'als', 'vitals', 'lungs', 'cpap', 'ask-pde5', 'nitro-assist', 'ecg12', 'ecg-transmit', 'vitals', 'notify', 'transport-near',
      UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'vitals', 'lungs', 'cpap', 'ask-pde5', 'nitro-high', 'monitor', 'ecg12', 'iv', 'nibp', 'nitro-high', 'notify', 'transport-near',
      UNTIL_ARRIVED, 'handoff'],
  },
  'wpw-af-field': {
    1: ['als', 'primary', 'vitals', 'pads', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', ...R(5), 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'procainamide', 'transport-pci', ...R(4), 'ecg12-repeat', UNTIL_ARRIVED,
      'handoff'],
  },
  'torsades-field': {
    1: ['als', 'pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'ecg-transmit', 'pulse-check', 'notify', 'transport-pci', 'aed', 'cpr', 'vitals',
      'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
    2: ['pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'iv', 'magnesium-sulfate', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'commotio-cordis-field': {
    1: ['als', 'aed', 'cpr', 'bvm', 'vitals', 'ecg12', 'ecg-transmit', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
    2: ['defib', 'cpr', 'bvm', 'capno', 'iv', 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
  },
  'lvad-field': {
    1: ['primary', 'lvad-check', 'als', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'legs-up', 'ecg12', 'ecg-transmit', 'transport-pci',
      'doppler-map', UNTIL_ARRIVED, 'handoff'],
    2: ['primary', 'lvad-check', 'doppler-map', 'perfusion', 'call-vad', 'sample', 'ecg12', 'iv', 'fluid', 'doppler-map', 'transport-pci',
      UNTIL_ARRIVED, 'handoff'],
  },
  'left-main-shock-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'cath-jl4', 'act', 'impella', 'perfusion', 'guide-ebu', 'ivus', 'stent-des', 'callout',
      'balloon-nc', 'ecg12'],
    4: ['iv', 'pressor', 'o2-nrb', 'consent', 'timeout', 'ecg12', 'heparin', 'call-surgery', 'act', 'cangrelor', 'fentanyl', 'perfusion', ...R(3),
      'callout', 'ecg12-repeat', 'handoff'],
    5: ['consent', 'o2-nrb', 'pressor', 'ecg12', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'call-surgery', 'heparin', 'act', 'echo',
      'impella', 'cangrelor', 'guide-ebu', 'wire-workhorse', 'ivus', 'stent-des', 'balloon-nc', 'ivus', 'final-angio', 'ecg12-repeat', 'handoff'],
  },
  'stent-thrombosis-cathlab': {
    3: ['callout', 'act', 'aspiration', 'ivus', 'balloon-nc', 'ivus', 'ecg12', 'hemostasis'],
    4: ['callout', 'cangrelor', 'p2y12', 'heparin', 'fentanyl', 'ecg12', ...R(2), 'hemostasis', 'handoff'],
    5: ['act', 'heparin', 'cangrelor', 'p2y12', 'aspiration', 'ivus', 'balloon-nc', 'ivus', 'final-angio', 'ecg12', 'handoff'],
  },
  'scad-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'cath-jl4', 'callout', 'view-lao-cranial', 'cath-jr4', 'hemostasis', 'ecg12'],
    4: ['consent', 'heparin', 'timeout', 'ecg12', 'callout', 'ic-nitro', 'callout', 'metoprolol', 'fentanyl', 'hemostasis', 'ecg12-repeat', 'handoff'],
    5: ['consent', 'heparin', 'timeout', 'access', 'cath-jl4', 'reposition', 'angio', 'ic-nitro', 'view-lao-cranial', 'stop-antithrombotics', 'metoprolol',
      'fentanyl', 'ecg12', 'echo', 'handoff'],
  },
  'takotsubo-lvot-cathlab': {
    3: ['prep', 'transducer', 'pads', 'timeout', 'cath-tiger', 'callout', 'cath-pigtail', 'lvedp', 'callout', 'lv-gram', 'ecg12', 'hemostasis'],
    4: ['consent', 'heparin', 'timeout', 'perfusion', 'nibp', 'callout', 'lungs', 'fluid', 'phenylephrine', 'reassess', 'fentanyl', 'ecg12',
      'hemostasis', 'handoff'],
    5: ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'angio', 'cath-pigtail', 'lvedp', 'fluid', 'phenylephrine', 'lv-gram', 'ecg12',
      'handoff'],
  },
  'heart-block-temp-wire-cathlab': {
    3: ['ecg12', 'pads', 'nibp', 'temp-wire', 'prep', 'timeout', 'reassess', 'callout', 'ecg12-repeat', 'reassess', 'callout', 'reassess',
      'pericardiocentesis', 'callout', 'reassess'],
    4: ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'consent', 'timeout', 'reassess', 'ecg12-repeat', 'reassess', 'callout', ...R(3),
      'callout', 'fluid', 'handoff'],
    5: ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat',
      'reassess', 'reposition', 'echo', 'reassess', 'pericardiocentesis', 'handoff'],
  },
  'guide-dissection-cathlab': {
    3: ['callout', 'stop-contrast', 'wire-workhorse', 'ivus', 'stent-des', 'balloon-nc', 'ecg12', 'hemostasis'],
    4: ['callout', 'atropine', 'fluid', 'fentanyl', 'ecg12', 'reassess', 'ecg12-repeat', 'hemostasis', 'handoff'],
    5: ['stop-contrast', 'reposition', 'atropine', 'fluid', 'wire-workhorse', 'ivus', 'stent-des', 'final-angio', 'ecg12', 'echo', 'handoff'],
  },
  'air-embolism-cathlab': {
    3: ['callout', 'stop-contrast', 'clear-air', 'reassess', 'clear-air', 'stent-des', 'ecg12', 'hemostasis'],
    4: ['callout', 'o2-nrb', 'atropine', 'phenylephrine', 'reassess', 'ecg12', 'hemostasis', 'handoff'],
    5: ['stop-contrast', 'o2-nrb', 'clear-air', 'atropine', 'ic-epinephrine', 'reassess', 'stent-des', 'final-angio', 'ecg12', 'handoff'],
  },
  'periprocedural-stroke-cathlab': {
    3: ['callout', 'stop-contrast', 'stroke-team', 'act', ...R(2)],
    4: ['callout', 'stroke-team', 'neuro', 'glucose', 'nibp', 'primary', 'act', 'ct-urgent', 'handoff'],
    5: ['stop-contrast', 'stroke-team', 'neuro', 'glucose', 'act', 'ct-urgent', 'handoff'],
  },
  'vasovagal-sheath-cathlab': {
    3: ['callout', 'perfusion', 'callout', ...R(5), 'hemostasis'],
    4: ['callout', 'legs-up', 'atropine', 'fluid', 'perfusion', ...R(4), 'hemostasis', 'handoff'],
    5: ['legs-up', 'atropine', 'fluid', 'perfusion', ...R(4), 'handoff'],
  },
  'retroperitoneal-bleed-cathlab': {
    3: ['act', 'perfusion', 'call-vascular', 'transducer', 'pads', 'ecg12', 'callout', 'prep', 'timeout', 'reassess', 'callout', ...R(4),
      'stent-covered', 'hemostasis'],
    4: ['perfusion', 'callout', 'fluid', 'labs', 'iv', 'transfuse', 'act', 'callout', 'timeout', 'protamine', 'transfuse', 'ecg12', ...R(4),
      'hemostasis', 'handoff'],
    5: ['perfusion', 'fluid', 'labs', 'transfuse', 'consent', 'act', 'protamine', 'call-vascular', 'ecg12', 'timeout', 'access-femoral',
      'balloon-tamponade', 'transfuse', 'echo', 'stent-covered', 'final-angio', 'handoff'],
  },
  'stemi-walk-in-ed': {
    6: ['triage', 'ecg12', 'notify-physician', 'aspirin', 'pads', 'iv', 'heparin', 'p2y12', 'labs', 'sample', 'ask-pde5', 'notify-physician',
      'fentanyl', ...R(3), 'defib', 'call-help', 'ecg12-repeat', ...R(3), 'handoff'],
    7: ['primary', 'opqrst', 'cath-lab-activate', 'aspirin', 'sample', 'ask-pde5', 'heparin', 'p2y12', 'fentanyl', ...R(5), 'defib', 'ecg12-repeat',
      ...R(3), 'handoff'],
  },
  'nstemi-troponin-ed': {
    6: ['triage', 'ecg12', 'notify-physician', 'ecg-posterior', 'labs', 'monitor', 'aspirin', 'iv', 'heparin', 'sample', 'ask-pde5', 'opqrst', ...R(10),
      'ecg12-repeat', 'nitro', 'notify-physician', ...R(16), 'troponin-repeat', ...R(4), 'notify-physician', 'handoff'],
    7: ['opqrst', 'sample', 'ecg-posterior', 'aspirin', 'heparin', 'troponin-repeat', ...R(4), 'consult-cardiology', 'admit', ...R(8),
      'ecg12-repeat', 'ask-pde5', 'nitro', 'consult-cardiology', ...R(19), 'handoff'],
  },
  'complete-heart-block-ed': {
    6: ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'labs', 'atropine', 'pace', 'pulse-check', 'nibp', 'notify-physician', 'fentanyl',
      'notify-physician', 'calcium-chloride', 'insulin-dextrose', 'sample', ...R(5), 'pulse-check', 'nibp', 'handoff'],
    7: ['ems-handoff', 'sample', 'labs', 'perfusion', 'atropine', 'pace', 'pulse-check', 'nibp', 'fentanyl', 'lungs', 'calcium-chloride',
      'insulin-dextrose', 'consult-cardiology', 'central-line', 'temp-wire', 'cxr', 'admit', 'handoff'],
  },
  'hyperkalemia-ed': {
    6: ['triage', 'pads', 'notify-physician', 'iv', 'ecg12', 'notify-physician', 'calcium-chloride', 'labs', 'glucose', 'insulin-dextrose',
      'albuterol-hyperk', 'sample', ...R(4), 'notify-physician', 'calcium-chloride', ...R(2), 'sodium-bicarbonate', ...R(3), 'ecg12-repeat', ...R(4),
      'glucose', 'handoff'],
    7: ['primary', 'opqrst', 'calcium-chloride', 'labs', 'insulin-dextrose', 'albuterol-hyperk', 'sample', 'lungs', 'perfusion', 'reassess',
      'calcium-chloride', ...R(2), 'sodium-bicarbonate', 'admit', ...R(5), 'ecg12-repeat', ...R(4), 'glucose', 'handoff'],
  },
  'unstable-af-cardioversion-ed': {
    6: ['ems-handoff', 'notify-physician', 'pads', 'neuro', 'ecg12', 'iv', 'labs', 'capno', 'bvm', 'cardiovert', 'cardiovert', 'nibp',
      'notify-physician', 'heparin', 'ecg12-repeat', 'magnesium-sulfate', 'sample', 'handoff'],
    7: ['ems-handoff', 'sample', 'neuro', 'labs', 'procedural-sedation', 'cardiovert', 'cardiovert', 'heparin', 'cxr', 'magnesium-sulfate', 'admit',
      'handoff'],
  },
  'scape-ed': {
    6: ['ems-handoff', 'cpap', 'notify-physician', 'monitor', 'nibp', 'nitro-high', 'iv', 'nibp', 'ecg12', 'labs', 'neuro', 'reassess',
      'notify-physician', 'reassess', 'handoff'],
    7: ['ems-handoff', 'cpap', 'lungs', 'nitro-high', 'sample', 'pocus', 'reassess', 'admit', 'handoff'],
  },
  'pulmonary-embolism-lysis-ed': {
    6: ['ems-handoff', 'triage', 'monitor', 'o2-nrb', 'notify-physician', 'iv', 'labs', 'ecg12', 'perfusion', 'heparin', 'pressor', 'sample',
      'neuro', 'stop-antithrombotics', 'alteplase', ...R(2), 'notify-physician', ...R(5), 'handoff'],
    7: ['ems-handoff', 'pocus', 'heparin', 'pressor', 'sample', 'alteplase', 'consult-cardiology', 'admit', ...R(5), 'handoff'],
  },
  'aortic-dissection-ed': {
    6: ['triage', 'monitor', 'ecg12', 'bp-both-arms', 'opqrst', 'ask-pde5', 'notify-physician', 'iv', 'metoprolol', 'fentanyl', 'labs', 'nicardipine', ...R(9),
      'handoff'],
    7: ['opqrst', 'bp-both-arms', 'pocus', 'call-surgery', 'metoprolol', 'fentanyl', 'ask-pde5', 'nicardipine', 'ct-urgent', ...R(5), 'handoff'],
  },
  'tamponade-ed': {
    6: ['triage', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'notify-physician', 'iv', 'labs', 'ecg12', 'sample', 'fluid', 'pads',
      'notify-physician', 'pressor', 'reassess', 'notify-physician', 'vitals', 'reassess', 'handoff'],
    7: ['perfusion', 'lungs', 'sample', 'pocus', 'fluid', 'pericardiocentesis', 'consult-cardiology', 'admit', 'handoff'],
  },
  'vf-arrest-ed': {
    6: ['call-help', 'cpr', 'defib', 'iv', 'cpr', 'defib', 'epinephrine', 'bvm', 'cpr', 'defib', 'amio-arrest', 'epinephrine', 'capno', 'cpr',
      'defib', 'cpr', 'pulse-check', 'pressor', 'bvm', 'ecg12', 'notify-physician', 'neuro', ...R(5), 'handoff'],
    7: ['defib', 'cpr', 'defib', 'epinephrine', 'airway', 'epinephrine', 'capno', 'cpr', 'defib', 'amio-arrest', 'hs-ts', 'cpr', 'defib', 'cpr',
      'pulse-check', 'pressor', 'bvm', 'ecg12', 'cath-lab-activate', 'neuro', 'temp-control', ...R(5), 'handoff'],
  },
};
