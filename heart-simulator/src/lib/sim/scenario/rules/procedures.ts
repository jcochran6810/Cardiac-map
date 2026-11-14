/**
 * Built-in safety rules for procedures and decisions: transport in an arrest, the pericardiocentesis, the STEMI alert
 * and the cath lab activation, and the scanner.
 */
import type { Harm } from '../types';
import { ecgShowsStemi, hasProblem, lowPressure } from './helpers';

export const PROCEDURE_RULES: Harm[] = [
  // on-scene resuscitation until a sustained ROSC, for most adults (2025 AHA Systems of Care). Only the loading is judged:
  // an arrest that begins en route is worked in the ambulance, and that is no mistake
  { id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s, sc) => sc.setting === 'field' && !s.pulse, points: 6, severity: 'major', text: 'Loading the patient for transport during cardiac arrest. Compressions on a stretcher and in a moving ambulance are poorer and keep being interrupted, and what the arrest needs — high-quality CPR, a shock for VF or pulseless VT, epinephrine and the reversible causes — works right here. For most adults, work the arrest on scene until there is a sustained ROSC, then transport (2025 AHA).' },
  { id: 'pericardiocentesis-no-tamponade', actions: ['pericardiocentesis'], when: (_s, sc) => sc.setting === 'ed' && !hasProblem(sc, ['tamponade']), points: 15, severity: 'critical', text: 'A pericardiocentesis without tamponade. The needle can puncture the heart, a coronary artery or the lung: it is for an effusion that is squeezing the heart (a low pressure, distended neck veins, the right heart collapsing in diastole on the ultrasound). Find the real cause of the shock instead.' },
  // the physician stands the cath lab down (the default response); a case can say it in its own words
  { id: 'stemi-alert-no-ste', actions: ['stemi-alert'], when: (s) => !ecgShowsStemi(s), points: 3, severity: 'minor', text: 'A STEMI alert for a 12-lead that does not meet STEMI criteria. The alert calls the cath lab team in for an artery that is not known to be blocked (pericarditis, a bundle branch block, a thick heart muscle or a high potassium can raise the ST segments too). Transmit the 12-lead or give a radio report, and let the hospital decide.' },
  // the emergency department's activation, in its own words (the interventional cardiologist declines it: the default)
  { id: 'cath-lab-no-ste', actions: ['cath-lab-activate'], when: (s) => !ecgShowsStemi(s), points: 3, severity: 'minor', text: 'Activating the cath lab for a 12-lead that does not meet STEMI criteria. It calls the team in for an artery that is not known to be blocked (pericarditis, a bundle branch block, a thick heart muscle or a high potassium can raise the ST segments too). Repeat the 12-lead every 15–30 minutes while the pain goes on, add the posterior leads, send a troponin and consult cardiology.' },
  { id: 'ct-unstable', actions: ['ct-urgent'], when: (s) => s.pulse && lowPressure(s), points: 5, severity: 'major', text: 'Sending an unstable patient to the CT scanner. A systolic under 90 (with an LVAD, a Doppler MAP under 60) needs treatment here first (fluids, blood, pressors, the bleeding stopped): the scanner is no place to deteriorate.' },
];
