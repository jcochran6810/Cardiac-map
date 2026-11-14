import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { ECG_PROFILES, resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, answerRead, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTIONS, INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { READ_SETS } from '@/lib/sim/scenario/reads';
import { SCENARIOS, SCENARIO_BY_ID, scenariosFor } from '@/lib/sim/scenario/scenarios';
import { ROLES, ROLE_SETTING, type LearningLevel } from '@/store/useAppStore';
import type { FactKey, Problem, Scenario, Speaker } from '@/lib/sim/scenario/types';
import { CATH_IMAGES } from '@/data/cathImages';
import { CATHLAB_C } from '@/data/content/cathlab-c';
import { UNTIL_ARRIVED, readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');

/** A correct run for every scenario and every role it is written for */
const IDEAL: Record<string, Partial<Record<LearningLevel, string[]>>> = {
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

describe('scenario library', () => {
  it('registers every scenario once, each with an ideal run for every role it is written for', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const sc of SCENARIOS) {
      expect(SCENARIO_BY_ID[sc.id]).toBe(sc);
      for (const role of sc.roles) expect(IDEAL[sc.id]?.[role], `${sc.id} role ${role}`).toBeDefined();
    }
    // every role, the ER nurse and the ER doctor included, has cases of its own
    for (const role of ROLES) expect(scenariosFor(role).length, `role ${role}`).toBeGreaterThan(0);
  });

  it('lists only the roles that work in the case\'s setting (field: 1–2, emergency department: 6–7, cath lab: 3–5)', () => {
    for (const sc of SCENARIOS) for (const role of sc.roles) expect(ROLE_SETTING[role], `${sc.id} role ${role}`).toBe(sc.setting);
  });

  it('emergency department cases speak with the department\'s voices: never the cath lab operator or the field', () => {
    const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
    for (const sc of SCENARIOS.filter((x) => x.setting === 'ed')) {
      for (const line of Object.values(sc.briefing).flat()) expect(NOT_IN_ED, `${sc.id} briefing: ${line[1]}`).not.toContain(line[0]);
      for (const [role, steps] of Object.entries(IDEAL[sc.id] ?? {})) {
        const s = run(sc, Number(role) as LearningLevel, steps!);
        for (const l of s.log) expect(NOT_IN_ED, `${sc.id} role ${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
      }
    }
  });

  it('only refers to interventions, rhythms and conditions that exist', () => {
    for (const sc of SCENARIOS) {
      if (sc.conditionId) expect(CONDITIONS[sc.conditionId], sc.conditionId).toBeDefined();
      expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
      for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `${sc.id} respond ${id}`).toBeDefined();
      for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `${sc.id} harm ${id}`).toBeDefined();
      for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `${sc.id} timing ${id}`).toBeDefined();
      for (const role of sc.roles) {
        const scope = new Set(interventionsFor(role, sc.setting).map((i) => i.id));
        for (const c of criticalsFor(sc, role)) {
          if (typeof c.done === 'function') continue;
          // at least one way to satisfy each critical item must be in the learner's scope
          expect(c.done.some((id) => scope.has(id)), `${sc.id} role ${role}: ${c.id}`).toBe(true);
        }
      }
    }
  });

  it('every rhythm a scenario can reach is a real ECG profile', () => {
    for (const sc of SCENARIOS) {
      for (const [role, steps] of Object.entries(IDEAL[sc.id])) {
        run(sc, Number(role) as LearningLevel, steps!, (s) => {
          expect(resolveProfile(s.rhythm.profile).id, `${sc.id}: ${s.rhythm.profile}`).toBe(s.rhythm.profile);
        });
      }
    }
  });
});

describe('the learner reads the tracings', () => {
  it('no monitor or event line names the rhythm or the diagnosis', () => {
    const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
    for (const sc of SCENARIOS) {
      for (const [role, steps] of Object.entries(IDEAL[sc.id])) {
        const s = run(sc, Number(role) as LearningLevel, steps!);
        for (const l of s.log) if (l.who === 'monitor') expect(l.text, `${sc.id}: ${l.text}`).not.toMatch(giveaway);
      }
    }
  });
});

describe('ideal runs end by themselves with full marks', () => {
  for (const sc of SCENARIOS) {
    for (const role of sc.roles) {
      it(`${sc.id} — role ${role}`, () => {
        const s = run(sc, role, IDEAL[sc.id]![role]!);
        expect(s.ended?.reason).toBe('complete');
        expect(s.pulse).toBe(true);
        const r = review(sc, s);
        expect(r.toFix).toEqual([]);
        expect(r.penaltyPoints).toBe(0);
        expect(r.percent).toBe(100);
        expect(r.grade).toBe('Excellent');
        for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      });
    }
  }
});

describe('inferior STEMI with RV infarction', () => {
  const sc = SCENARIO_BY_ID['stemi-inferior-rv-field'];

  it('nitroglycerin crashes the blood pressure and is a critical error', () => {
    const s = run(sc, 2, ['primary', 'vitals', 'iv', 'nitro']);
    expect(s.vitals.sbp).toBe(74);
    expect(s.penalties.map((p) => p.id)).toContain('nitro-rv');
    expect(s.log.some((l) => l.who === 'monitor' && /74\/44/.test(l.text))).toBe(true);
  });

  it('V4R reports the measurement, not the diagnosis', () => {
    const s = run(sc, 2, ['ecg12', 'ecg-right']);
    expect(s.log.at(-1)!.text).toBe('V4R: 1.5 mm ST elevation.');
  });

  it('complete heart block develops if the crew lingers, and atropine reverses it', () => {
    let s = run(sc, 2, ['primary', 'vitals', 'iv', 'opqrst', 'sample', 'ecg12', 'lungs', 'perfusion']);
    expect(s.rhythm.profile).toBe('inferior-stemi-chb');
    expect(s.rhythm.hr).toBe(40);
    expect(s.vitals.sbp).toBeLessThan(90);
    s = perform(sc, s, 'atropine');
    expect(s.rhythm).toEqual({ profile: 'inferior-stemi', hr: 66 });
  });

  it('for an EMT, the paramedic intercept treats the block', () => {
    const s = run(sc, 1, IDEAL['stemi-inferior-rv-field'][1]!);
    expect(s.fired).toEqual(expect.arrayContaining(['chb', 'als-arrives', 'als-treats-block']));
    expect(s.rhythm.profile).toBe('inferior-stemi');
  });

  it('an EMT who helps with her own nitroglycerin is penalised', () => {
    const s = run(sc, 1, ['primary', 'nitro-assist']);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-assist-rv']);
    expect(s.vitals.sbp).toBe(74);
  });

  it('more nitroglycerin once the heart block has dropped her pressure drops it further — never back up to 74/44', () => {
    let s = run(sc, 2, ['primary', 'vitals', 'iv', 'nitro', 'opqrst', 'sample', 'ecg12', 'lungs', 'perfusion']);
    expect(s.rhythm.profile).toBe('inferior-stemi-chb');
    const before = s.vitals.sbp;
    expect(before).toBeLessThan(74);
    s = perform(sc, s, 'nitro');
    expect(s.vitals.sbp).toBeLessThan(before);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === `BP ${s.vitals.sbp}/${s.vitals.dbp}.`)).toBe(true);
  });
});

describe('complete heart block', () => {
  const sc = SCENARIO_BY_ID['complete-heart-block-field'];

  it('atropine does not work; pacing does', () => {
    let s = run(sc, 2, ['pads', 'iv', 'atropine']);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 34 });
    s = perform(sc, s, 'pace');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
  });

  it('lidocaine suppresses the escape rhythm and is a critical error', () => {
    const s = run(sc, 2, ['iv', 'lidocaine']);
    expect(s.rhythm.hr).toBe(22);
    expect(s.penalties[0]).toMatchObject({ id: 'lidocaine-escape', severity: 'critical' });
    expect(review(sc, stop(s)).grade).toBe('Unsafe');
  });

  it('mechanical capture must be confirmed after pacing starts', () => {
    const s = run(sc, 2, ['pulse-check', 'pace']);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /mechanical capture/.test(t.label))).toBe(true);
  });

  it('a drug given while he is paced does not stop the pacer, and the story says so — the mistake still costs', () => {
    const drugs = [['lidocaine', 'lidocaine-escape'], ['amio-infusion', 'lidocaine-escape'], ['metoprolol', 'av-blocker'], ['diltiazem', 'av-blocker'],
      ['adenosine6', 'adenosine-block'], ['adenosine12', 'adenosine-block']];
    for (const [drug, harm] of drugs) {
      const s = run(sc, 2, ['pads', 'iv', 'pace', drug]);
      expect(s.rhythm, drug).toEqual({ profile: 'tcp', hr: 70 });
      const since = s.log.slice(s.log.findIndex((l) => /^Pacer on/.test(l.text)) + 1);
      expect(since.some((l) => /\b(22|30)\b|no QRS|eyes roll/.test(l.text)), drug).toBe(false);
      expect(s.penalties.map((p) => p.id), drug).toContain(harm);
      expect(s.vitals.sbp, drug).toBeGreaterThanOrEqual(80);
    }
  });

  it('a drug that slows the escape never raises a pressure already lower; pacing and a pressor never lower a higher one', () => {
    const low = run(sc, 2, ['iv', 'nitro', 'nitro']);
    expect(low.vitals.sbp).toBeLessThan(58);
    const slowed = perform(sc, low, 'diltiazem');
    expect(slowed.rhythm.hr).toBe(22);
    expect(slowed.vitals.sbp).toBeLessThanOrEqual(low.vitals.sbp);
    const high = run(sc, 2, ['iv', 'push-epi', 'push-epi', 'push-epi', 'push-epi']);
    expect(high.vitals.sbp).toBeGreaterThan(104);
    for (const id of ['pressor', 'pace']) {
      const s = perform(sc, high, id);
      expect(s.vitals.sbp, id).toBeGreaterThanOrEqual(high.vitals.sbp);
    }
    expect(perform(sc, high, 'pressor').log.at(-1)!.text).toContain(`BP ${high.vitals.sbp}/${high.vitals.dbp}`);
  });

  it('getting worse never speeds up an escape that lidocaine has already slowed', () => {
    let s = run(sc, 2, ['iv', 'lidocaine']);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 22 });
    expect(s.vitals.sbp).toBe(58);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 22. BP 58/32.')).toBe(true);
  });

  it('pads put on by the pacer count as pads on', () => {
    const s = run(sc, 2, ['primary', 'vitals', 'iv', 'atropine', 'pace', 'pulse-check', 'fentanyl', 'sample', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, s).toFix.filter((t) => t.kind === 'missed')).toEqual([]);
  });

  it('teaches that atropine should not be used after a heart transplant', () => {
    expect(sc.teaching.join(' ')).toMatch(/transplant[^.]*not use it/);
  });
});

describe('unstable SVT', () => {
  const sc = SCENARIO_BY_ID['svt-unstable-field'];

  it('an unsynchronised shock with a pulse causes VF and is penalised once', () => {
    const s = run(sc, 2, ['pads', 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.penalties.map((p) => p.id)).toEqual(['shock-with-pulse']);
    expect(s.penalties[0].points).toBe(20);
  });

  it('adenosine 12 mg converts it too, with no sedation item needed', () => {
    const s = run(sc, 2, ['primary', 'pads', 'nibp', 'iv', 'adenosine6', 'adenosine12', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.rhythm.profile).toBe('normal-sinus');
    const r = review(sc, s);
    expect(r.percent).toBe(100);
    expect(r.toFix).toEqual([]);
  });

  it('cardioverting an awake patient without sedation costs points', () => {
    const s = run(sc, 2, ['pads', 'cardiovert']);
    expect(s.penalties.map((p) => p.id)).toEqual(['no-sedation']);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /Sedation/.test(t.label))).toBe(true);
  });

  it('an AED is not applied to her (she has a pulse): refused with the reason, no time passes, nothing changes, nothing is scored', () => {
    const pads = run(sc, 2, ['pads']);
    const s = run(sc, 2, ['pads', 'aed']);
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'avnrt', hr: 190 });
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not with a pulse: an AED is only for a patient who is unresponsive, not breathing normally and has no pulse\./) });
    expect(s.minute).toBe(pads.minute);
    expect(s.counts.aed).toBeUndefined();
    expect(s.penalties).toEqual([]);
  });

  it('the AED shocks the VF an unsynchronized shock caused, and converts it as the manual shock does', () => {
    for (const shock of ['aed', 'defib']) {
      const s = run(sc, 2, ['pads', 'defib', shock]);
      expect(s.pulse, shock).toBe(true);
      expect(s.rhythm.profile, shock).toBe('sinus-tachycardia');
      expect(s.penalties.map((p) => p.id), shock).toEqual(['shock-with-pulse']);
    }
  });

  it('pads put on by the cardioversion itself count as pads on', () => {
    const s = run(sc, 2, ['primary', 'vitals', 'iv', 'sedation', 'cardiovert', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, s).toFix.filter((t) => t.kind === 'missed')).toEqual([]);
  });

  it('a hand-off with a critical item still missing ends the case, and the review says what is missing', () => {
    const s = run(sc, 2, ['primary', 'pads', 'nibp', 'iv', 'sedation', 'cardiovert', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.missed).toBe(1);
    expect(r.outcome).toMatch(/^Care handed over at \d+:\d\d with 1 critical item not done\.$/);
    expect(r.toFix.find((t) => t.kind === 'missed')?.label).toMatch(/12-lead after conversion/);
  });

  it('a blocker never raises a pressure an earlier drug has already pushed lower, and the monitor says what it is', () => {
    const low = run(sc, 2, ['iv', 'nitro', 'nitro']);
    expect(low.vitals.sbp).toBeLessThan(64);
    for (const id of ['diltiazem', 'metoprolol']) {
      const s = perform(sc, low, id);
      expect(s.vitals.sbp, id).toBeLessThanOrEqual(low.vitals.sbp);
      expect(s.log.some((l) => l.who === 'monitor' && l.text.includes(`BP ${s.vitals.sbp}/${s.vitals.dbp}`) || l.text.includes(`BP falls to ${s.vitals.sbp}/${s.vitals.dbp}`)), id).toBe(true);
    }
  });

  it('getting worse never raises a pressure a drug has already dropped, and the monitor says what it is', () => {
    let s = run(sc, 2, ['pads', 'iv', 'diltiazem']);
    expect(s.vitals.sbp).toBe(64);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([64, 38]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'BP 64/38.')).toBe(true);
  });

  it('teaches the 2025 cardioversion energies', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).not.toMatch(/50–100 J|120–200 J/);
    expect(text).toMatch(/narrow-complex[^.;]*100 J/i);
    expect(text).toMatch(/fibrillation[^.;]*200 J/);
    expect(text).toMatch(/flutter[^.;]*200 J/);
    expect(text).toMatch(/monomorphic VT[^.;]*100 J/);
  });
});

describe('VF cardiac arrest', () => {
  const sc = SCENARIO_BY_ID['vf-arrest-field'];

  it('dies without defibrillation', () => {
    let s = start(sc, 2);
    for (let i = 0; i < 15 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('epinephrine before the first shock is a minor error', () => {
    const s = run(sc, 2, ['cpr', 'io', 'epinephrine']);
    expect(s.penalties.map((p) => p.id)).toEqual(['epi-before-shock']);
  });

  it('a 12-lead is not possible during CPR', () => {
    const s = run(sc, 2, ['ecg12']);
    expect(s.minute).toBe(0);
    expect(s.counts.ecg12).toBeUndefined();
  });

  it('the 12-lead after ROSC shows the STEMI that caused the arrest', () => {
    const steps = IDEAL['vf-arrest-field'][2]!;
    const s = run(sc, 2, steps.slice(0, steps.indexOf('ecg12') + 1));
    expect(s.pulse).toBe(true);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\..*anterior STEMI/.test(l.text))).toBe(true);
  });

  it('an advanced airway placed during the arrest keeps him ventilated after ROSC: full marks', () => {
    const s = run(sc, 2, ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'airway', 'cpr', 'defib', 'amio-arrest', 'capno', 'cpr', 'defib',
      'ecg12', 'pressor', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
    // the crew keeps bagging through the airway: 10 breaths a minute, not his own 8
    expect(s.vitals.rr).toBe(10);
  });

  it('an airway placed after ROSC is used to ventilate him, as the bag is', () => {
    const rosc = run(sc, 2, ['cpr', 'defib', 'io', 'cpr', 'bvm', 'capno', 'defib', 'epinephrine', 'cpr', 'amio-arrest', 'defib']);
    expect(rosc.pulse).toBe(true);
    expect(rosc.vitals.rr).toBe(8);
    const s = perform(sc, rosc, 'airway');
    expect(s.flags.ventilated).toBeDefined();
    expect([s.vitals.rr, s.vitals.spo2]).toEqual([10, 96]);
    expect(sc.status!(s)).toMatch(/ventilated to 10/);
  });

  it('an EMT who reaches for the AED again after ROSC is told why not, at no cost: it is for a patient with no pulse', () => {
    const rosc = run(sc, 1, ['cpr', 'aed', 'als', 'cpr', 'aed']);
    expect(rosc.pulse).toBe(true);
    const s = perform(sc, rosc, 'aed');
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not with a pulse: an AED is only for/) });
    expect([s.minute, s.counts.aed, s.penalties]).toEqual([rosc.minute, rosc.counts.aed, []]);
  });

  it('an antiarrhythmic given only after ROSC does not count as the one for refractory VF', () => {
    const s = run(sc, 2, ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'cpr', 'defib', 'cpr', 'defib', 'lidocaine']);
    expect(s.pulse).toBe(true);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /Amiodarone/.test(t.label))).toBe(true);
  });

  it('post-ROSC goals follow the 2025 guidelines (SpO₂ 90–98 %, MAP ≥ 65)', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).toMatch(/SpO₂ 90–98 %/);
    expect(text).toMatch(/MAP ≥ 65/);
    expect(text).not.toMatch(/SBP ≥ 90|92–98/);
  });
});

describe('guideline wording in the STEMI cases', () => {
  it('nitroglycerin: no PDE-5 inhibitor within 12 h (avanafil), 24 h (sildenafil, vardenafil) or 48 h (tadalafil)', () => {
    const sc = SCENARIO_BY_ID['stemi-anterior-field'];
    for (const text of [sc.harms.find((h) => h.id === 'nitro-no-pde5')!.text, sc.teaching.join(' ')]) {
      expect(text).toMatch(/12 h \(avanafil\)/);
      expect(text).toMatch(/24 h \(sildenafil, vardenafil\)/);
      expect(text).toMatch(/48 h \(tadalafil\)/);
    }
  });

  it('the reperfusion goal is first medical contact to device, not door-to-balloon or door-to-device', () => {
    for (const id of ['stemi-anterior-field', 'stemi-cathlab', 'stemi-inferior-cathlab']) {
      const text = JSON.stringify(SCENARIO_BY_ID[id]);
      expect(text, id).not.toMatch(/door-to-(balloon|device)/i);
      expect(text, id).toMatch(/first medical contact/i);
    }
  });
});

describe('STEMI in the cath lab', () => {
  const sc = SCENARIO_BY_ID['stemi-cathlab'];
  const TECH_TO_GUIDE = ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger'];

  it('the tech hands what the cardiologist asks for, and the procedure moves on with each device', () => {
    const s = run(sc, 3, IDEAL['stemi-cathlab'][3]!);
    expect(s.fired).toEqual(expect.arrayContaining([
      'rn-setup-for-tech', 'md-access', 'diag-ask', 'diag-got', 'md-angio', 'guide-got', 'md-guide', 'damped', 'md-reposition',
      'view-got', 'md-wire', 'md-predil', 'md-stent', 'reperfusion-vf', 'nc-got', 'md-postdil', 'md-final',
    ]));
    expect(s.fired.some((id) => id.endsWith('-fallback'))).toBe(false);
    expect(s.rhythm.profile).toBe('anterior-stemi-reperfused');
    expect(s.reads.map((r) => r.answer)).toEqual(['angio-lad-prox-occlusion', 'hemo-damped', 'angio-timi3', 'reperfused-anterior']);
  });

  it('the wrong device gets a word from the operator and costs points; the right one moves things on', () => {
    let s = run(sc, 3, [...TECH_TO_GUIDE, 'guide-jr4']);
    expect(s.log.at(-1)).toMatchObject({ who: 'operator', text: expect.stringMatching(/right-coronary guide/) });
    expect(s.penalties.map((p) => p.id)).toEqual(['wrong-guide']);
    expect(s.flags.guide).toBeUndefined();
    s = perform(sc, s, 'guide-ebu');
    expect(s.flags.guide).toBeDefined();
  });

  it('a guide opened ahead of the request counts at once', () => {
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'guide-ebu', 'timeout', 'act', 'cath-tiger']);
    expect(s.fired).toContain('guide-got');
    expect(s.flags.damped).toBeDefined();
  });

  it('when the tech never hands it, the operator gets it after 3 minutes and the item is missed', () => {
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'act', 'reassess', 'reassess']);
    expect(s.fired).toContain('diag-fallback');
    expect(s.fired).toContain('md-angio');
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /Tiger/.test(t.label))).toBe(true);
  });

  it('opening a stent before there is a wire is a minor error', () => {
    const s = run(sc, 3, ['prep', 'stent-des']);
    expect(s.penalties.map((p) => p.id)).toEqual(['opened-early']);
  });

  it('the tech and the nurse read the damped pressure; a tech who misses it loses the callout points', () => {
    const s = run(sc, 3, [...TECH_TO_GUIDE, 'guide-ebu', 'reassess']);
    expect(s.reads.find((r) => r.kind === 'hemo')).toMatchObject({ answer: 'hemo-damped' });
    expect(s.log.some((l) => /who's watching the waveform/.test(l.text))).toBe(true);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /damped/.test(t.label))).toBe(true);
  });

  it('the nurse chooses the drugs the cardiologist asks for', () => {
    const s = run(sc, 4, ['consent', 'iv', 'heparin', 'p2y12', 'timeout', 'ic-verapamil']);
    expect(s.log.at(-1)!.text).toMatch(/radial cocktail through the sheath/);
    expect(s.penalties.map((p) => p.id)).toEqual(['wrong-cocktail']);
  });

  it('the cardiologist needs access, a catheter, a guide and a wire, in that order', () => {
    let s = run(sc, 5, ['consent', 'timeout', 'stent-des']);
    expect(s.counts['stent-des']).toBeUndefined();
    s = run(sc, 5, ['consent', 'timeout', 'access', 'angio']);
    expect(s.counts.angio).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/diagnostic catheter/);
    s = run(sc, 5, ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'wire-workhorse']);
    expect(s.counts['wire-workhorse']).toBeUndefined();
    s = perform(sc, s, 'guide-ebu');
    s = perform(sc, s, 'wire-workhorse');
    expect(s.counts['wire-workhorse']).toBeUndefined(); // the guide is wedged: back it out first
    s = perform(sc, s, 'reposition');
    s = perform(sc, s, 'wire-workhorse');
    expect(s.flags.wired).toBeDefined();
    expect(s.penalties.map((p) => p.id)).toContain('pci-no-heparin');
  });

  it('a right guide for an LAD culprit costs points', () => {
    const s = run(sc, 5, ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'angio', 'guide-jr4']);
    expect(s.penalties.map((p) => p.id)).toEqual(['right-guide-for-lad']);
  });

  it('the cardiologist sizes the stent from the measurements', () => {
    const steps = IDEAL['stemi-cathlab'][5]!;
    const toPredil = readAfter(steps.slice(0, steps.indexOf('balloon-predil') + 1), 'angio', 'angio-lad-prox-occlusion');
    const s = run(sc, 5, [...toPredil, 'read:stent-3.5x23'], undefined, 'manual');
    expect(s.reads.at(-1)).toMatchObject({ kind: 'sizing', answer: 'stent-3.5x28', verdict: 'partial' });
    expect(s.penalties.at(-1)).toMatchObject({ points: 2, text: expect.stringMatching(/^Stent sizing at/) });
  });

  it('reperfusion VF kills the patient if nobody shocks it', () => {
    const steps = IDEAL['stemi-cathlab'][5]!;
    let s = run(sc, 5, steps.slice(0, steps.indexOf('stent-des') + 1));
    expect(s.pulse).toBe(false);
    for (let i = 0; i < 6 && !s.ended; i++) s = perform(sc, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
  });
});

describe('inferior STEMI in the cath lab', () => {
  const sc = SCENARIO_BY_ID['stemi-inferior-cathlab'];
  const MD_TO_BALLOON = IDEAL['stemi-inferior-cathlab'][5]!.slice(0, IDEAL['stemi-inferior-cathlab'][5]!.indexOf('balloon-predil') + 1);

  it('nitroglycerin crashes the pressure of an RV infarct', () => {
    const s = run(sc, 5, ['nitro']);
    expect(s.vitals.sbp).toBe(72);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-rv']);
  });

  it('a left guide for the RCA costs points; reflow brings the reflex, and the learner must name it', () => {
    let s = run(sc, 5, ['consent', 'heparin', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'guide-ebu']);
    expect(s.penalties.map((p) => p.id)).toEqual(['left-guide-for-rca']);
    s = run(sc, 5, readAfter(MD_TO_BALLOON, 'angio', 'angio-rca-occlusion'), undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-bezold' });
    expect(s.rhythm.hr).toBe(38);
    expect(s.vitals.sbp).toBe(68);
  });

  it('pacing the reflex holds the paced rate even as it worsens; pacing and fluid bring her round', () => {
    let s = run(sc, 5, [...MD_TO_BALLOON, 'pace', 'reassess', 'reassess']);
    expect(s.fired).toContain('reflex-worse');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    s = run(sc, 5, [...MD_TO_BALLOON, 'pace', 'fluid']);
    expect(s.flags.recovered).toBeDefined();
    expect(s.log.at(-2)!.text).toMatch(/Heart rate 70\./);
  });

  it('a transvenous wire needs a venous sheath; in the reflex it paces', () => {
    let s = run(sc, 5, [...MD_TO_BALLOON, 'temp-wire']);
    expect(s.counts['temp-wire']).toBeUndefined();
    s = run(sc, 5, [...MD_TO_BALLOON, 'access-venous', 'temp-wire']);
    expect(s.rhythm).toEqual({ profile: 'paced-vvi', hr: 70 });
  });

  it('nitroglycerin in the reflex drops the pressure further — never back up to 72/42', () => {
    const reflex = run(sc, 5, MD_TO_BALLOON);
    expect(reflex.vitals.sbp).toBe(68);
    const s = perform(sc, reflex, 'nitro');
    expect(s.vitals.sbp).toBeLessThan(68);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === `BP ${s.vitals.sbp}/${s.vitals.dbp}.`)).toBe(true);
  });

  it('a wire that only catches the reflex at 50 is still too slow: pacing at 70 takes over, and is no mistake', () => {
    const at = MD_TO_BALLOON.indexOf('access-femoral') + 1;
    let s = run(sc, 5, [...MD_TO_BALLOON.slice(0, at), 'access-venous', 'temp-wire', ...MD_TO_BALLOON.slice(at)]);
    expect(s.rhythm).toEqual({ profile: 'paced-vvi', hr: 50 });
    s = perform(sc, s, 'pace');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.penalties.map((p) => p.id)).not.toContain('pace-not-slow');
    expect(s.log.slice(-3).map((l) => l.text).join(' ')).not.toMatch(/own rate/);
  });

  it('when the nurse never answers, the operator does it — and the patient responds', () => {
    const steps = IDEAL['stemi-inferior-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('callout') + 1), ...R(4)]);
    expect(s.fired).toEqual(expect.arrayContaining(['atropine-fallback', 'fluids-fallback', 'recovered']));
    expect(s.rhythm.hr).toBeGreaterThanOrEqual(70);
  });

  it('atropine brings the rate back, fluid the pressure; untreated, it gets worse', () => {
    let s = run(sc, 5, [...MD_TO_BALLOON, 'atropine']);
    expect(s.rhythm.hr).toBe(72);
    expect(s.flags.recovered).toBeUndefined();
    s = perform(sc, s, 'fluid');
    expect(s.flags.recovered).toBeDefined();
    const untreated = run(sc, 5, [...MD_TO_BALLOON, 'reassess', 'reassess']);
    expect(untreated.fired).toContain('reflex-worse');
    expect(untreated.vitals.sbp).toBe(58);
  });

  it('the nurse must choose the drug: adenosine for a rate of 38 is wrong — and ruled out at that rate, which outranks the wrong answer', () => {
    const steps = IDEAL['stemi-inferior-cathlab'][4]!;
    for (const drug of ['adenosine6', 'diltiazem']) {
      const s = run(sc, 4, [...steps.slice(0, steps.indexOf('callout') + 1), drug]);
      // at 38/min and 68/40 the labels rule them out (major): that penalty alone, not the minor wrong answer
      expect(s.penalties.map((p) => p.id), drug).toContain('nodal-blocker-slow');
      expect(s.penalties.map((p) => p.id), drug).not.toContain('wrong-atropine');
      expect(s.log.some((l) => l.who === 'operator' && /Atropine, 1 milligram/.test(l.text)), drug).toBe(true);
    }
  });
});

describe('FFR-guided PCI', () => {
  const sc = SCENARIO_BY_ID['ffr-cathlab'];
  const MD = IDEAL['ffr-cathlab'][5]!;
  const upTo = (id: string) => MD.slice(0, MD.indexOf(id));

  it('no reading before the wire is equalised; without hyperaemia the reading is a resting value', () => {
    let s = run(sc, 5, [...upTo('ffr-equalize'), 'ffr']);
    expect(s.counts.ffr).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/Equalize the pressure wire/);
    s = perform(sc, run(sc, 5, upTo('adenosine-iv-ffr')), 'ffr');
    expect(s.pendingRead).toMatchObject({ kind: 'physiology', answer: 'ffr-no-hyperemia' });
  });

  it('a stent before the physiology is a major error', () => {
    const s = run(sc, 5, [...upTo('ffr-equalize'), 'wire-workhorse', 'stent-des']);
    expect(s.penalties.map((p) => p.id)).toContain('stent-before-ffr');
  });

  it('the radial spasm must be treated before the guide will pass', () => {
    let s = run(sc, 5, [...upTo('radial-cocktail'), 'heparin', 'guide-ebu']);
    expect(s.counts['guide-ebu']).toBeUndefined();
    s = perform(sc, s, 'radial-cocktail');
    s = perform(sc, s, 'guide-ebu');
    expect(s.flags.guide).toBeDefined();
  });

  it('the nurse who pushes the SVT dose of adenosine for hyperaemia is corrected', () => {
    const steps = IDEAL['ffr-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('adenosine-iv-ffr')), 'adenosine6']);
    expect(s.penalties.map((p) => p.id)).toEqual(expect.arrayContaining(['svt-adenosine', 'wrong-hyperemia']));
    expect(s.log.some((l) => /Not the SVT dose/.test(l.text))).toBe(true);
  });

  it('intracoronary adenosine for hyperemia is about 200 mcg in the left coronary', () => {
    const s = perform(sc, run(sc, 5, upTo('adenosine-iv-ffr')), 'ic-adenosine');
    expect(s.log.some((l) => /^Adenosine 200 mcg intracoronary/.test(l.text))).toBe(true);
    expect(s.flags.hyperemia).toBeDefined();
  });

  it('when the tech never does a step, the operator does it and the procedure still finishes', () => {
    const steps = IDEAL['ffr-cathlab'][3]!;
    const s = run(sc, 3, [...steps.slice(0, steps.indexOf('guide-ebu') + 1), ...R(12)]);
    expect(s.fired).toEqual(expect.arrayContaining(['equalize-fallback', 'ffr-fallback', 'ivus-fallback', 'stent-fallback']));
    expect(s.flags.pci).toBeDefined();
    expect(s.flags['final-angio']).toBeDefined();
  });

  it('when the nurse never starts the adenosine, the operator does, and the FFR is measured', () => {
    const steps = IDEAL['ffr-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('adenosine-iv-ffr')), ...R(6)]);
    expect(s.fired).toEqual(expect.arrayContaining(['hyperemia-fallback', 'md-ffr-for-rn']));
    expect(s.flags.pci).toBeDefined();
  });
});

describe('cardiogenic shock in the cath lab', () => {
  const sc = SCENARIO_BY_ID['shock-cathlab'];

  it('fluid floods the lungs; the right heart numbers ask for a read', () => {
    let s = run(sc, 5, ['fluid']);
    expect(s.penalties.map((p) => p.id)).toEqual(['fluid-in-shock']);
    expect(s.vitals.spo2).toBe(85);
    s = run(sc, 5, ['consent', 'timeout', 'access-femoral', 'access-venous', 'rhc'], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'hemo', answer: 'hemo-cardiogenic' });
  });

  it('the pump never brings a higher pressure down', () => {
    const s = run(sc, 5, ['consent', 'o2-nrb', 'pressor', 'timeout', 'access-femoral', 'push-epi', 'push-epi', 'push-epi', 'push-epi']);
    expect(s.vitals.sbp).toBeGreaterThan(102);
    const pumped = perform(sc, s, 'impella');
    expect(pumped.flags.impella).toBeDefined();
    expect([pumped.vitals.sbp, pumped.vitals.dbp]).toEqual([s.vitals.sbp, s.vitals.dbp]);
    expect(pumped.log.at(-1)!.text).toBe(`BP ${s.vitals.sbp}/${s.vitals.dbp}.`);
  });

  it('support after the stent misses the support item', () => {
    const steps = IDEAL['shock-cathlab'][5]!.filter((id) => id !== 'impella');
    const s = stop(run(sc, 5, [...steps.slice(0, steps.indexOf('final-angio')), 'impella']));
    expect(review(sc, s).toFix.some((t) => t.kind === 'missed' && /Mechanical support/.test(t.label))).toBe(true);
  });

  it('the nurse gives IV cangrelor, not tablets, to a drowsy shocked patient', () => {
    const steps = IDEAL['shock-cathlab'][4]!;
    const s = run(sc, 4, [...steps.slice(0, steps.indexOf('cangrelor')), 'p2y12']);
    expect(s.penalties.map((p) => p.id)).toContain('wrong-p2y12');
  });

  it('an airway tried on an awake patient is not placed, and does not count as oxygen', () => {
    const s = run(sc, 5, ['airway']);
    expect(s.penalties.map((p) => p.id)).toEqual(['airway-awake']);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /^Oxygen/.test(t.label))).toBe(true);
  });

  it('the LV gram and the LVEDP show the failing ventricle the echo shows; the labs say to hold the metformin', () => {
    const s = run(sc, 5, ['consent', 'timeout', 'access-femoral', 'lv-gram', 'lvedp', 'labs']);
    const said = s.log.map((l) => l.text).join('\n');
    expect(said).toMatch(/LV gram: the anterior wall, the septum and the apex do not move/);
    expect(said).toMatch(/EF about 20 %/);
    expect(said).toMatch(/LVEDP 30 mmHg/);
    expect(said).not.toMatch(/normal wall motion|LVEDP 10/);
    expect(said).toMatch(/hold it from today \(the shock and a lactate of 5 alone rule it out\), recheck the creatinine at 48 hours/);
    expect(said).toMatch(/no significant mitral regurgitation/);
    // the LV gram in shock is itself a minor mistake
    expect(s.penalties.map((p) => p.id)).toEqual(['lv-gram-in-shock']);
  });

  it('push-dose epinephrine is a bridge: the norepinephrine infusion is the vasopressor item', () => {
    const steps = IDEAL['shock-cathlab'][5]!.map((id) => (id === 'pressor' ? 'push-epi' : id));
    const r = review(sc, run(sc, 5, steps));
    expect(r.toFix.some((t) => t.kind === 'missed' && t.label === 'A vasopressor early (norepinephrine)')).toBe(true);
    expect(sc.timings?.find((t) => t.label === 'Pressor running')?.actions).toEqual(['pressor']);
  });

  it('both groins: the catheters in the right, the left made ready for the pump\'s 14 French sheath, and the Impella goes in there', () => {
    const md = run(sc, 5, ['consent', 'timeout', 'access-femoral', 'access-venous', 'rhc', 'heparin', 'impella'], undefined, 'correct');
    const said = md.log.map((l) => l.text).join('\n');
    expect(said).toMatch(/Right common femoral artery under ultrasound, over the femoral head: a 6 French sheath for the catheters\. The left common femoral artery/);
    expect(said).toMatch(/Impella CP through the 14 French sheath in the left common femoral artery/);
    const rn = run(sc, 4, IDEAL['shock-cathlab'][4]!);
    expect(rn.log.some((l) => l.who === 'operator' && /left common femoral artery .* And the right femoral vein\. PA catheter going in\./.test(l.text))).toBe(true);
  });

  it('when the nurse never starts the pressor, the operator does — and the pressure responds', () => {
    const s = run(sc, 4, ['iv', ...R(5)]);
    expect(s.fired).toContain('pressor-fallback');
    expect(s.flags.pressor).toBeDefined();
    expect(s.fired).not.toContain('shock-worse');
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(90);
  });
});

describe('coronary perforation', () => {
  const sc = SCENARIO_BY_ID['perforation-cathlab'];

  it('opens with the perforation to read, and a tamponade follows', () => {
    let s = run(sc, 5, [], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-perforation' });
    s = run(sc, 5, ['read:clin-perforation', 'balloon-tamponade', 'call-surgery', 'fluid'], undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-tamponade' });
    expect(s.vitals.sbp).toBe(76);
  });

  it('no needle without the echo; left alone, the tamponade arrests the heart', () => {
    let s = run(sc, 5, ['balloon-tamponade', 'pericardiocentesis']);
    expect(s.counts.pericardiocentesis).toBeUndefined();
    s = run(sc, 5, ['balloon-tamponade', ...R(4)]);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea-narrow');
    s = perform(sc, perform(sc, s, 'echo'), 'pericardiocentesis');
    expect(s.pulse).toBe(true);
  });

  it('a drug-eluting stent does not seal a hole', () => {
    const s = run(sc, 5, ['balloon-tamponade', 'stent-des']);
    expect(s.penalties.map((p) => p.id)).toEqual(['des-for-perforation']);
  });
});

describe('contrast reaction', () => {
  const sc = SCENARIO_BY_ID['contrast-cathlab'];
  const MD = IDEAL['contrast-cathlab'][5]!;
  const toReaction = MD.slice(0, MD.indexOf('angio') + 1);

  it('the first injection brings the reaction, and the learner must name it', () => {
    const s = run(sc, 5, toReaction, undefined, 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'clinical', answer: 'clin-contrast' });
    expect(s.vitals.sbp).toBe(76);
  });

  it('antihistamine before epinephrine is a major error; more contrast during the reaction too', () => {
    const s = run(sc, 5, [...toReaction, 'diphenhydramine', 'view-rao-caudal']);
    expect(s.penalties.map((p) => p.id)).toEqual(['antihistamine-first', 'contrast-during-reaction']);
  });

  it('without epinephrine she arrests', () => {
    const s = run(sc, 5, [...toReaction, ...R(3)]);
    expect(s.pulse).toBe(false);
  });

  it('premedicating for a shellfish allergy is a minor error', () => {
    const s = run(sc, 5, ['steroid']);
    expect(s.penalties.map((p) => p.id)).toEqual(['premed-for-shellfish']);
  });

  it('in the anaphylactic arrest, CPR, epinephrine 1 mg IV and fluid can bring her back', () => {
    let s = run(sc, 5, [...toReaction, ...R(3)]);
    expect(s.pulse).toBe(false);
    s = run(sc, 5, [...toReaction, ...R(3), 'cpr', 'epinephrine', 'fluid', 'cpr']);
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(s.ended).toBeNull();
    // the arrest dose in the arrest is right: no penalty for it
    expect(s.penalties.map((p) => p.id)).not.toContain('arrest-epi-with-pulse');
    // IM epinephrine does nothing without a circulation, and does not count as the epinephrine she needed
    const im = run(sc, 5, [...toReaction, ...R(3), 'cpr', 'epi-im', 'fluid', 'cpr']);
    expect(im.pulse).toBe(false);
    expect(review(sc, stop(im)).toFix.find((t) => /^Epinephrine first/.test(t.label))?.kind).toBe('missed');
  });
});

describe('US spelling in everything a learner reads', () => {
  const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis|favour/i;

  it('the 12-lead feedback quotes the ECG profiles: their headlines and findings use US spelling too', () => {
    for (const p of Object.values(ECG_PROFILES)) expect([p.name, p.headline, ...p.findings].join(' '), p.id).not.toMatch(BRITISH);
  });

  it('actions, reads and every scenario text use US spelling', () => {
    for (const iv of INTERVENTIONS) expect(`${iv.label} ${iv.detail ?? ''}`, iv.id).not.toMatch(BRITISH);
    for (const set of Object.values(READ_SETS)) {
      expect([set.title, ...set.groups].join(' ')).not.toMatch(BRITISH);
      for (const o of set.options) expect(o.label, o.id).not.toMatch(BRITISH);
    }
    for (const sc of SCENARIOS) expect(JSON.stringify(sc), sc.id).not.toMatch(BRITISH);
  });

  it('so does every line of every ideal run', () => {
    for (const sc of SCENARIOS) {
      for (const [role, steps] of Object.entries(IDEAL[sc.id])) {
        for (const l of run(sc, Number(role) as LearningLevel, steps!).log) expect(l.text, `${sc.id} role ${role}`).not.toMatch(BRITISH);
      }
    }
  });
});

describe('the cath lab monitor', () => {
  it('shows the arterial line once the sheath is in and zeroed, damped while the guide is wedged', async () => {
    const { attached, monitorVitals } = await import('@/store/useSimStore');
    const sc = SCENARIO_BY_ID['stemi-cathlab'];
    let s = run(sc, 3, ['prep', 'transducer', 'pads']);
    expect(attached(s).art).toBe(false);
    s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger', 'guide-ebu']);
    expect(attached(s).art).toBe('damped');
    // the damped trace is an artifact: the monitor prints 82/64, the patient's own pressure (what the rules read) is unchanged
    expect(monitorVitals(s)).toMatchObject({ sbp: 82, dbp: 64 });
    expect(s.vitals.sbp).toBe(138);
    s = perform(sc, s, 'callout');
    expect(attached(s).art).toBe(true);
    expect(s.vitals.sbp).toBe(136);
    expect(monitorVitals(s)).toMatchObject({ sbp: 136, dbp: 84 });
  });

  it('no vasodilator or sedative rule charges on the damped number: a dose then is judged on the true pressure', async () => {
    const { attached } = await import('@/store/useSimStore');
    const sc = SCENARIO_BY_ID['stemi-cathlab'];
    const s = run(sc, 3, ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger', 'guide-ebu']);
    expect(attached(s).art).toBe('damped');
    expect(BUILT_IN_HARMS.find((h) => h.id === 'nitro-hypotension')!.when!(s, sc, 'ic-nitro')).toBe(false);
    expect(BUILT_IN_HARMS.find((h) => h.id === 'midazolam-unsafe')!.when!(s, sc, 'midazolam')).toBe(false);
  });
});

describe('real angiograms in the cath lab cases', () => {
  const CULPRIT_READS = {
    'stemi-cathlab': 'angio-lad-prox-occlusion', 'stemi-inferior-cathlab': 'angio-rca-occlusion',
    'ffr-cathlab': 'angio-lad-intermediate', 'shock-cathlab': 'angio-lad-prox-occlusion',
  } as const;

  it('the run shows the image, says what the image does not show, and waits for the read', () => {
    for (const [id, answer] of Object.entries(CULPRIT_READS)) {
      const sc = SCENARIO_BY_ID[id];
      const steps = IDEAL[id][5]!;
      let s = run(sc, 5, steps.slice(0, steps.indexOf('angio')));
      s = perform(sc, s, 'angio');
      expect(s.images.at(-1), id).toMatchObject({ id: 'angio', image: sc.images!.angio });
      expect(s.pendingRead, id).toMatchObject({ kind: 'angio', answer, prompt: expect.stringMatching(/coronary run/), run: s.images.length });
      expect(s.log.some((l) => /coronary: .*Imaging screen/.test(l.text)), id).toBe(true);
    }
  });

  it('the final run shows the same patient\'s artery opened up, and is read too', () => {
    for (const id of ['stemi-cathlab', 'stemi-inferior-cathlab', 'shock-cathlab', 'ffr-cathlab', 'perforation-cathlab']) {
      const sc = SCENARIO_BY_ID[id];
      const pre = CATH_IMAGES[(sc.images!.angio ?? sc.images!.perforation)!]!;
      const post = CATH_IMAGES[sc.images!['final-angio']!]!;
      expect(post.source, `${id}: before and after come from the same article`).toBe(pre.source);
      const s = run(sc, 5, IDEAL[id][5]!);
      expect(s.images.find((r) => r.id === 'final-angio'), id).toMatchObject({ image: sc.images!['final-angio'] });
      expect(s.reads.find((r) => r.answer === 'angio-timi3'), id).toMatchObject({ kind: 'angio', verdict: 'correct' });
    }
  });

  it('the tech and the nurse read the run the operator records', () => {
    for (const role of [3, 4] as const) {
      const sc = SCENARIO_BY_ID['stemi-cathlab'];
      const s = run(sc, role, IDEAL['stemi-cathlab'][role]!);
      expect(s.reads.find((r) => r.kind === 'angio'), `role ${role}`).toMatchObject({ answer: 'angio-lad-prox-occlusion', verdict: 'correct' });
    }
  });

  it('the FFR case shows the real console screen and asks what it means', () => {
    const sc = SCENARIO_BY_ID['ffr-cathlab'];
    for (const role of [3, 5] as const) {
      const steps = IDEAL['ffr-cathlab'][role]!;
      const s = perform(sc, run(sc, role, steps.slice(0, steps.indexOf('ffr'))), 'ffr');
      expect(s.images.at(-1), `role ${role}`).toMatchObject({ id: 'ffr', image: 'ffr-significant' });
      expect(s.pendingRead, `role ${role}`).toMatchObject({ kind: 'physiology', answer: 'ffr-significant', run: s.images.length });
      // the arterial line reads the same aortic pressure as the console: mean 98
      expect(Math.round((s.vitals.sbp + 2 * s.vitals.dbp) / 3), `role ${role}`).toBe(98);
    }
  });

  it('the no-reflow read says what the catalog says no-reflow is: TIMI 2 or less once the artery is open', () => {
    const option = READ_SETS.angio.options.find((o) => o.id === 'angio-no-reflow')!;
    const entry = CATHLAB_C.find((c) => c.id === 'cl-comp-no-reflow')!;
    expect(entry.summary).toMatch(/TIMI ≤ 2/);
    expect(option.label).toMatch(/TIMI ≤ 2/);
    // slow flow is no-reflow too: "TIMI 0–1" would make a TIMI 2 run read as an open artery
    expect(option.label).not.toMatch(/TIMI 0–1/);
    expect(option.label).toMatch(/slow flow/);
  });

  it('a thrombus read of the anterior STEMI run is partly right', () => {
    const sc = SCENARIO_BY_ID['stemi-cathlab'];
    const steps = IDEAL['stemi-cathlab'][5]!;
    let s = perform(sc, run(sc, 5, steps.slice(0, steps.indexOf('angio'))), 'angio');
    while (s.pendingRead && s.pendingRead.kind !== 'angio') s = answerRead(sc, s, s.pendingRead.answer);
    s = answerRead(sc, s, 'angio-thrombus');
    expect(s.reads.at(-1)).toMatchObject({ kind: 'angio', verdict: 'partial' });
  });
});

describe('the problems a case declares agree with what the patient says and shows', () => {
  /** The case's words for a fact, read on a started state with the history taken (some facts depend on flags) */
  function factText(sc: Scenario, key: FactKey): string {
    const s = start(sc, sc.roles[0]);
    for (const flag of ['sample', 'allergies', 'pde5-asked', 'opqrst', 'consent', 'ems-report']) s.flags[flag] = s.minute;
    const f = sc.facts[key];
    return typeof f === 'function' ? f(s) : f ?? '';
  }
  /** Everything the history gives: the SAMPLE and OPQRST answers, the allergy check, the crew's report (and a case's own SAMPLE answer) */
  function history(sc: Scenario): string {
    const own = sc.respond.sample?.(start(sc, sc.roles[0]))?.say?.map((l) => l[1]) ?? [];
    return [...(['sample', 'allergies', 'opqrst', 'ems'] as FactKey[]).map((k) => factText(sc, k)), ...own].join(' ');
  }
  const declares = (sc: Scenario, p: Problem) => !!sc.problems?.includes(p);
  const casesWith = (p: Problem) => SCENARIOS.filter((sc) => declares(sc, p)).map((sc) => sc.id);

  const PDE5 = /sildenafil|tadalafil|vardenafil|avanafil|riociguat|viagra|cialis|levitra|stendra|revatio|adcirca|adempas/i;
  /** The sentences of a text (a question, a dash-joined aside and a period all end one) */
  const sentences = (text: string) => text.split(/[.;!?]+/).map((x) => x.trim()).filter(Boolean);
  /** A sentence that says the patient does not have it: "No allergies", "Never had contrast", "no Viagra, Cialis…" */
  const negated = (sentence: string, drug: RegExp) => {
    const at = sentence.search(drug);
    return /^\W*(no|none|never|denies|not)\b/i.test(sentence) || /\b(no|never|not|denies)\b/i.test(sentence.slice(0, Math.max(at, 0)));
  };
  /** A real allergy to the drug: a sentence that names it with allergy wording, and does not deny it */
  const allergicTo = (text: string, drug: RegExp) => sentences(text).some((x) => drug.test(x)
    && /allerg|reaction|anaphyla|hives|angioedema|urticaria|swell|wheez/i.test(x) && !negated(x, drug));

  it('the checks below run on real cases', () => {
    expect(casesWith('pde5-inhibitor')).toEqual(expect.arrayContaining(['stemi-walk-in-ed', 'lvad-field']));
    expect(casesWith('rv-infarction')).toEqual(expect.arrayContaining(['stemi-inferior-rv-field', 'stemi-inferior-cathlab']));
    expect(casesWith('oral-anticoagulant')).toContain('lvad-field');
    expect(casesWith('dialysis')).toContain('hyperkalemia-dialysis-field');
    expect(casesWith('implanted-device')).toContain('lvad-field');
  });

  it('the allergy checks need allergy words next to the drug, not the drug alone', () => {
    const aspirin = /aspirin|NSAID|ibuprofen|naproxen/i;
    expect(allergicTo('No allergies. Aspirin 81 mg daily.', aspirin)).toBe(false);
    expect(allergicTo('Allergic to penicillin. Takes a baby aspirin every morning.', aspirin)).toBe(false);
    expect(allergicTo('Aspirin gives him hives and his lips swell.', aspirin)).toBe(true);
    expect(allergicTo('"I\'m allergic to aspirin."', aspirin)).toBe(true);
    const contrast = /contrast|dye/i;
    // the shellfish trap: a shellfish allergy is no contrast allergy (ACR)
    expect(allergicTo(`${factText(SCENARIO_BY_ID['contrast-cathlab'], 'allergies')} ${factText(SCENARIO_BY_ID['contrast-cathlab'], 'sample')}`, contrast)).toBe(false);
    expect(allergicTo('Hives and wheezing after the dye for a CT two years ago.', contrast)).toBe(true);
    expect(SCENARIO_BY_ID['contrast-cathlab'].problems).not.toContain('contrast-allergy');
  });

  /**
   * Cases whose V4R shows ST elevation without an RV infarct to declare: a lab complication that closes the RCA for
   * minutes (air in it, a guide that tore its ostium), fixed in the room — not a patient whose right ventricle is infarcted
   */
  const TRANSIENT_RV_ISCHEMIA = ['guide-dissection-cathlab', 'air-embolism-cathlab'];

  for (const sc of SCENARIOS) {
    it(sc.id, () => {
      const pde5 = factText(sc, 'pde5');
      if (declares(sc, 'pde5-inhibitor')) expect(pde5).toMatch(PDE5);
      // and the other way: a patient who says he takes one is declared (unless he names it only to deny it)
      if (sentences(pde5).some((x) => PDE5.test(x) && !negated(x, PDE5))) expect(sc.problems, 'takes a PDE-5 inhibitor').toContain('pde5-inhibitor');
      const v4r = factText(sc, 'ecgRight');
      if (declares(sc, 'rv-infarction')) {
        expect(v4r).toMatch(/ST elevation/);
        expect(v4r).not.toMatch(/no ST elevation/i);
      }
      if (/\d(\.\d)? mm (of )?ST elevation/.test(v4r) && !TRANSIENT_RV_ISCHEMIA.includes(sc.id)) expect(sc.problems, 'ST elevation in V4R').toContain('rv-infarction');
      if (declares(sc, 'oral-anticoagulant')) {
        expect(history(sc)).toMatch(/warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|savaysa/i);
      }
      // dialysis, and not "not on dialysis"; a patient on dialysis is not also in kidney failure without it
      if (declares(sc, 'dialysis')) expect(history(sc)).toMatch(/(?<!not on )dialysis/i);
      expect(declares(sc, 'dialysis') && declares(sc, 'renal-failure'), 'dialysis and renal-failure').toBe(false);
      const allergies = `${factText(sc, 'allergies')} ${factText(sc, 'sample')}`;
      if (declares(sc, 'aspirin-allergy')) expect(allergicTo(allergies, /aspirin|NSAID|ibuprofen|naproxen/i), 'an aspirin allergy in the history').toBe(true);
      if (declares(sc, 'contrast-allergy')) expect(allergicTo(allergies, /contrast|dye/i), 'a contrast allergy in the history').toBe(true);
      if (declares(sc, 'protamine-allergy')) expect(allergicTo(allergies, /protamine/i), 'a protamine allergy in the history').toBe(true);
    });
  }
});
