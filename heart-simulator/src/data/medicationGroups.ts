/**
 * The library's medication list, by group: every drug card (MEDICATION_IDS) in exactly one group, so the main menu's
 * "medications reviewed" count (all cards) matches what the list offers.
 */
export const MED_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: 'Antiplatelet, anticoagulant & lytic',
    ids: ['aspirin', 'clopidogrel', 'ticagrelor', 'prasugrel', 'heparin', 'enoxaparin', 'bivalirudin', 'apixaban', 'warfarin', 'tenecteplase', 'alteplase', 'eptifibatide', 'cangrelor', 'protamine'],
  },
  { label: 'Anti-ischemic & analgesia', ids: ['nitroglycerin', 'fentanyl', 'metoprolol', 'esmolol'] },
  { label: 'Antiarrhythmic & rate control', ids: ['adenosine', 'diltiazem', 'verapamil', 'amiodarone', 'procainamide', 'sotalol', 'lidocaine', 'digoxin', 'magnesium-sulfate'] },
  { label: 'Blood pressure & vasodilators', ids: ['labetalol', 'nicardipine', 'nitroprusside'] },
  { label: 'ACLS, pressors & inotropes', ids: ['atropine', 'epinephrine', 'norepinephrine', 'vasopressin', 'phenylephrine', 'dopamine', 'dobutamine', 'milrinone'] },
  { label: 'Heart failure & prevention', ids: ['furosemide', 'lisinopril', 'sacubitril-valsartan', 'spironolactone', 'empagliflozin', 'atorvastatin'] },
  { label: 'Sedation, airway & analgesia', ids: ['midazolam', 'ketamine', 'etomidate', 'propofol', 'rocuronium', 'succinylcholine', 'morphine'] },
  {
    label: 'Electrolytes & other',
    ids: ['calcium-chloride', 'insulin-dextrose', 'albuterol', 'sodium-bicarbonate', 'colchicine', 'dextrose', 'diphenhydramine', 'methylprednisolone', 'glucagon', 'ondansetron', 'naloxone'],
  },
];
