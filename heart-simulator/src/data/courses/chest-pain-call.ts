import type { Course } from '@/types/course';

/**
 * Course: the chest pain call — a suspected heart attack on the ambulance, from the first look to the
 * hand-off. Written first for EMTs and paramedics: the text says what the crew does, and each role note
 * says which part belongs to that role (src/lib/scope.ts). Oxygen, aspirin, nitroglycerin cautions and time
 * targets follow the 2025 ACC/AHA/ACEP/NAEMSP/SCAI acute coronary syndromes guideline; the ST-elevation cut-offs
 * (including V4R) follow the Fourth Universal Definition of MI (2018). The nitroglycerin repeat interval and
 * maximum are left to the protocol on purpose: their wording in the 2025 guideline has not been confirmed.
 * Educational content only.
 */
export const CHEST_PAIN_CALL: Course = {
  id: 'chest-pain-call',
  title: 'The chest pain call',
  summary: 'A suspected heart attack from the first look to the hand-off: recognizing it, the first minutes of care, a clean 12-lead in ten minutes, when nitroglycerin must be held, and getting the patient to the right hospital. Role notes say which part is the EMT\'s and which is the paramedic\'s.',
  roles: [1, 2],
  level: 'core',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'is-it-the-heart',
      title: 'Is it the heart?',
      goal: 'Recognize a possible heart attack, including the ones that are easy to miss, and name the clue to four other killers that look like one.',
      minutes: 8,
      steps: [
        {
          title: 'One call, many causes',
          text: [
            'Chest pain is one of the most common reasons people call 911. Most of these patients are not having a heart attack. Some are, and for them every minute of delay costs heart muscle.',
            'You cannot prove a heart attack on scene, and you do not need to. Your job is to suspect it early, start the care that helps, hold back the care that harms, and get the patient to the right hospital. This course follows one call from the first look to the hand-off.',
          ],
          look: 'This is a healthy heart, beating at rest. The pale vessels on its surface are the coronary arteries, which carry blood to the heart muscle itself.',
          show: { heart: 'external', camera: 'Front', rhythm: 'normal-sinus' },
          roleNote: {
            1: 'Steps that involve a skill carry a note like this one, saying which part is yours as an EMT. Where it says "per protocol", your local protocol and medical direction decide.',
            2: 'Steps that involve a skill carry a note like this one, saying which part is the paramedic\'s. Everything in the EMT\'s part is yours as well.',
          },
        },
        {
          title: 'What the pain is',
          text: [
            'The heart muscle is fed by its own arteries, the coronary arteries. A heart attack (myocardial infarction, or MI) starts when one of them is suddenly blocked, usually by a blood clot that forms where a patch of fatty plaque in the artery wall has cracked open.',
            'The muscle beyond the blockage gets no oxygen. Muscle short of oxygen is called ischemic, and ischemic muscle hurts. If the artery stays blocked the muscle begins to die, and the damage spreads through the wall over the next few hours.',
            'Only opening the artery stops it. That is done in a hospital, so on this call time counts for more than anything you carry.',
          ],
          look: 'The start of the left anterior descending artery (LAD) is ringed. Below it, one area of muscle has turned a dusky purple and pulses: it is the part this artery feeds, now short of blood.',
          show: { rhythm: 'anterior-stemi', structure: 'lad-proximal' },
          check: {
            kind: 'choice',
            question: 'Look at the heart. Which part is pulsing purple?',
            options: [
              'The front wall and tip of the left ventricle',
              'The whole heart, from the base to the tip',
              'The back wall and the two upper chambers, the atria',
              'Only the artery itself, not the muscle around it',
            ],
            answer: 0,
            explain: 'A blocked artery injures only the muscle it feeds. This artery runs down the front of the heart, so the front wall and the tip (the apex) are short of blood while the rest still works. That is why a 12-lead ECG, a recording of the heart\'s electrical signals from twelve directions, can later show where the trouble is.',
          },
          more: ['lad-proximal', 'anterior-stemi'],
        },
        {
          title: 'The classic picture',
          text: [
            'The classic patient feels pressure, squeezing or heaviness in the center of the chest, more often than a sharp pain. It may spread to one or both arms, the neck, the jaw or the back, and it lasts for minutes, not seconds.',
            'It often comes with shortness of breath, a cold sweat, nausea or lightheadedness. Many of these patients look gray and frightened. Many also insist it is only indigestion.',
            'Listen to the patient\'s own words: "an elephant on my chest", "a tight band", or a clenched fist held against the breastbone.',
          ],
          look: 'The heart on screen still has its artery blocked. None of this can be seen from outside the chest: the patient\'s story is your first tool.',
          check: {
            kind: 'choice',
            question: 'Which story fits a classic heart attack best?',
            options: [
              'Heavy pressure in the center of the chest, spreading to the left arm, with a cold sweat',
              'A stabbing pain at one spot, which the patient can cover with one fingertip',
              'A twinge under the left breast that lasts two or three seconds and is gone',
              'Soreness that returns each time the same spot on the ribs is pressed',
            ],
            answer: 0,
            explain: 'Pressure in the center of the chest that spreads to an arm and comes with a cold sweat is the classic picture. Pain at one fingertip-sized spot, pain that lasts only seconds and pain brought on by pressing the chest wall all make the heart less likely. None of them rules it out, so the rest of your assessment still counts.',
          },
        },
        {
          title: 'The ones that are easy to miss',
          text: [
            'Many heart attacks do not follow the classic script. Chest pain is still the most common symptom in every group, but women, older adults and people with diabetes are more likely than others to have little or none, or to have it along with symptoms that seem more important to them.',
            'Watch for sudden shortness of breath, unusual tiredness or weakness, nausea or vomiting, a cold sweat, lightheadedness, or pain in the upper belly (the epigastrium) that feels like indigestion.',
            'The rule on the ambulance: an adult with any of these and no better explanation gets the same workup as a patient with crushing chest pain, including a 12-lead.',
          ],
          look: 'The heart is seen from below, and a different artery is blocked. The pulsing purple area is the bottom wall, which rests on the diaphragm right above the stomach. A heart attack here is often taken for indigestion.',
          show: { rhythm: 'inferior-stemi', camera: 'Bottom' },
          check: {
            kind: 'choice',
            question: 'A 74-year-old woman with diabetes has felt weak, nauseated and short of breath for an hour. She has no chest pain. What is the right approach?',
            options: [
              'Treat it as a possible heart attack and get a 12-lead',
              'Rule out the heart, because she has no chest pain',
              'Treat it as a stomach illness unless chest pain develops',
              'Recheck her in an hour and decide then',
            ],
            answer: 0,
            explain: 'She is in all three groups that are more likely to have a heart attack without chest pain: a woman, older and with diabetes. Shortness of breath, nausea and weakness are her warning. Waiting for chest pain, or for an hour to pass, wastes the time in which heart muscle can still be saved.',
          },
          roleNote: {
            1: 'You do not need to name the cause. Assess, request ALS per protocol, and acquire and transmit a 12-lead where your protocol allows.',
            2: 'A low threshold for the 12-lead is the safeguard here. Record it for any of these symptoms in an adult, even when the story sounds like a stomach complaint.',
          },
          more: ['inferior-stemi'],
        },
        {
          title: 'Look-alike one: aortic dissection',
          text: [
            'Four other emergencies can pass for a heart attack. Each has one clue that should make you stop and think. The first is aortic dissection: the inner lining of the aorta, the body\'s main artery, tears and blood forces its way into the wall.',
            'The clue is the pain itself: sudden, severe and at its worst the instant it starts, often called tearing or ripping and felt through to the back. A pulse or blood pressure that differs between the two arms supports it.',
            'It matters because the drugs that help in a heart attack by hindering clotting make the bleeding from a tear worse. Aspirin is held back when you suspect a dissection.',
          ],
          look: 'The ascending aorta is ringed: the large artery rising from the top of the heart. A tear in this part is the most dangerous kind.',
          show: { rhythm: 'aortic-dissection', structure: 'ascending-aorta' },
          check: {
            kind: 'choice',
            question: 'Which story points to an aortic dissection and not to a heart attack?',
            options: [
              'Sudden tearing pain, worst in the first second, going through to the back',
              'Pressure that built up over ten minutes and spread to the jaw',
              'Heaviness in the center of the chest with a cold sweat and nausea',
              'Tightness that came on while climbing stairs and has not let up',
            ],
            answer: 0,
            explain: 'Dissection pain is at its worst the moment it begins and is often felt as tearing through to the back. Heart attack pain usually builds over minutes as pressure or heaviness, and often comes with sweating and nausea. When the story says dissection, hold the aspirin and say so in your report.',
          },
          roleNote: {
            1: 'Check the pulse and a blood pressure in both arms if it does not delay you, report any difference, request ALS, and do not give aspirin when you suspect a dissection, per protocol.',
            2: 'A dissection can block a coronary artery where it leaves the aorta and put a true heart attack pattern on the 12-lead, most often of the bottom wall. If you transmit such a tracing from a patient with tearing pain or unequal pulses, say so, so that anti-clotting drugs can be held.',
          },
          more: ['aortic-dissection', 'ascending-aorta'],
        },
        {
          title: 'Look-alike two: pulmonary embolism',
          text: [
            'A pulmonary embolism (PE) is a blood clot, usually from a deep vein in the leg, that travels through the right side of the heart and lodges in the arteries of the lungs.',
            'The clue is the breathing: sudden shortness of breath, often with a fast heart rate and a sharp pain on breathing in, in a patient whose lungs sound clear. Ask about a swollen or painful leg, recent surgery, a long trip or time in bed, cancer and pregnancy.',
            'A large clot blocks the way out of the right ventricle. The patient may faint, the blood pressure falls and the oxygen saturation drops.',
          ],
          look: 'The pulmonary trunk is ringed: the vessel that carries blood from the right ventricle to the lungs. The clot lodges in its branches. This heart is beating fast, as it often does in a PE.',
          show: { rhythm: 'pulmonary-embolism', structure: 'pulmonary-trunk' },
          check: {
            kind: 'tap',
            question: 'Tap the chamber that has to push blood past the clot.',
            targets: ['right-ventricle'],
            explain: 'The right ventricle pumps into the pulmonary trunk. Its wall is thin, because it normally works against low pressure, so a large clot can make it fail within minutes. The left ventricle then runs short of blood only because so little gets through the lungs to reach it.',
          },
          roleNote: {
            1: 'Oxygen for a low saturation, a position that eases breathing, an ALS request and prompt transport, per protocol. Report the leg, the surgery or the long trip: the history is what points to a PE.',
            2: 'Record a 12-lead. In a PE it often shows little more than a fast rate, but it can show a heart attack, which would change the plan. Support the blood pressure per protocol and give the hospital early notice.',
          },
          more: ['pulmonary-embolism'],
        },
        {
          title: 'Look-alikes three and four: the squeezed heart',
          text: [
            'The last two press on the heart from outside. In a tension pneumothorax, air trapped around a collapsed lung builds up pressure inside the chest. The clue: severe trouble breathing with no breath sounds on one side. It most often follows a chest injury.',
            'In cardiac tamponade, fluid or blood fills the sac around the heart (the pericardium) until the chambers cannot fill. The clue is three findings together: low blood pressure, bulging neck veins and heart sounds that are faint and distant.',
            'Both cause a fast heart rate, low pressure and full neck veins. The lungs tell them apart: one side is silent in a tension pneumothorax, and both sides sound equal in tamponade.',
          ],
          look: 'This heart is in tamponade. It beats fast because each beat moves little blood: a heart that cannot fill has little to pump. The same is true in a tension pneumothorax.',
          show: { rhythm: 'tamponade', camera: 'Front' },
          check: {
            kind: 'choice',
            question: 'Fast pulse, low blood pressure, bulging neck veins, and no breath sounds on the left. Which is it?',
            options: ['Tension pneumothorax', 'Cardiac tamponade', 'Aortic dissection', 'A heart attack with no complications'],
            answer: 0,
            explain: 'A silent lung on one side is the clue to a tension pneumothorax. Tamponade gives the same pulse, pressure and neck veins, but air moves equally on both sides and the heart sounds are faint. Neither a dissection nor an uncomplicated heart attack takes away breath sounds.',
          },
          roleNote: {
            1: 'Support breathing, give oxygen for a low saturation, request ALS and transport without delay. Report exactly what you heard, and on which side.',
            2: 'Needle decompression of a tension pneumothorax is yours, per protocol. Tamponade needs drainage by a physician: early notice and rapid transport are your treatment.',
          },
          more: ['cardiac-tamponade'],
        },
        {
          title: 'Suspect first, sort later',
          text: [
            'You will rarely be certain on scene. Work the call as a heart attack whenever the story fits, and keep the four look-alikes in mind as you assess: tearing pain through to the back, breathlessness with clear lungs, one silent lung, faint heart sounds with full neck veins.',
            'Three things come from the patient and from no machine: when the symptoms started, what they feel like, and what medicines the patient takes. Pin down the time of onset as exactly as you can. Every hospital decision later depends on it.',
          ],
          look: 'The name tags are switched off. Turn the heart if you need to.',
          show: { rhythm: 'normal-sinus', heart: 'external', camera: 'Front', labels: false },
          check: {
            kind: 'tap',
            question: 'Tap the vessel that tears in an aortic dissection.',
            targets: ['ascending-aorta', 'aortic-arch', 'descending-aorta'],
            explain: 'The aorta leaves the top of the heart, arches over and runs down behind it. A tear can start anywhere along it. Sudden tearing pain through to the back, or a pulse that differs between the arms, means aspirin is held and the hospital is told.',
          },
          more: ['chest-pain-acs'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'first-minutes',
      title: 'The first minutes',
      goal: 'Carry out the first actions for a suspected heart attack and say why each one is done, or held back.',
      minutes: 7,
      steps: [
        {
          title: 'Stop the work of the heart',
          text: [
            'Everything in the first minutes has one aim: lower the work the heart has to do, and add nothing that makes the damage bigger. Start by stopping all effort. The patient does not walk to the stretcher or climb into the ambulance.',
            'Let the patient choose the position, usually sitting up or half-sitting. Loosen tight clothing, speak calmly and say what you are doing. Fear and effort both speed the heart, and a faster heart needs more oxygen than a blocked artery can deliver.',
          ],
          look: 'This heart has a blocked artery and is beating about 90 times a minute. The pulsing purple area is the muscle short of blood. Every extra beat is work that area cannot afford.',
          show: { heart: 'external', camera: 'Front', rhythm: 'anterior-stemi' },
          check: {
            kind: 'choice',
            question: 'A man with chest pressure says he can walk down the stairs to the ambulance. What do you do?',
            options: [
              'Carry him: walking raises the work of his heart',
              'Let him walk slowly while you hold his arm',
              'Let him walk if his pain is below 5 out of 10',
              'Have him walk, then rest for a minute before the 12-lead',
            ],
            answer: 0,
            explain: 'Any effort raises the heart rate and the oxygen the heart muscle needs, and the blocked artery cannot supply it. Walking slowly, or with little pain, is still effort. Bring the stair chair or the stretcher to the patient.',
          },
        },
        {
          title: 'Vital signs: your baseline',
          text: [
            'Take a full set of vital signs early: pulse, blood pressure, breathing rate and oxygen saturation (SpO2: how full of oxygen the blood is, read by a clip on the finger). Every later decision in this course depends on a number you measured.',
            'Look for signs that the pump is already struggling: a pulse that is very slow, very fast or irregular, a systolic blood pressure (the top number) below 90 mmHg, a saturation below 90%, cool and clammy skin, or crackling sounds in the lungs.',
            'Repeat the vital signs at least every 5 minutes while the patient is unstable, and before and after every drug.',
          ],
          look: 'This is the monitor view. On the right: heart rate in green, SpO₂ in blue, breathing rate in yellow beside the CO₂ value, and the cuff pressure in the box labeled NIBP. Press NIBP in the panel beside or below the screen to take one.',
          show: { ecg: 'defib', heart: false },
          check: {
            kind: 'choice',
            question: 'Find the oxygen saturation on the monitor. Which label is it under?',
            options: ['SpO₂', 'EtCO₂', 'NIBP', 'HR'],
            answer: 0,
            explain: 'SpO₂ is the oxygen saturation, shown in blue like the pulse wave it is read from. EtCO₂ is the carbon dioxide in each breath out, NIBP (non-invasive blood pressure) is the cuff pressure and HR is the heart rate. No monitor shows skin color, sweat or how the patient looks: check those yourself.',
          },
        },
        {
          title: 'Oxygen: only when it is needed',
          text: [
            'For decades every chest pain patient was given high-flow oxygen. Large trials then showed that extra oxygen does not help a heart attack patient whose blood is already well saturated, and the routine was dropped.',
            'The 2025 ACC/AHA guideline: give oxygen when the saturation is below 90%, and do not give it routinely at 90% or above. Some local protocols set a slightly different number. Follow yours.',
            'Make sure a low reading is real before you treat it. Cold fingers, nail polish and movement all give false low numbers. A clean, regular pulse wave on the monitor means the number can be trusted.',
          ],
          look: 'Find the blue wave labeled Pleth, under the green ECG. It is the pulse at the fingertip, and it rises once for every heartbeat. The blue number beside it is the SpO₂.',
          check: {
            kind: 'choice',
            question: 'A woman with chest pressure is breathing comfortably. Her SpO2 is 96% on room air, with a clean pulse wave. What about oxygen?',
            options: [
              'No oxygen for now: keep watching the saturation',
              'High-flow oxygen by mask, as for every chest pain patient',
              'Low-flow oxygen by nasal cannula, to be on the safe side',
              'Oxygen, but only once the 12-lead shows a heart attack',
            ],
            answer: 0,
            explain: 'At 96% her blood is carrying nearly all the oxygen it can, and adding more has not been shown to help. Oxygen is for a saturation below 90%. Giving a little "to be safe" is the old routine, and the 12-lead does not change the answer: the saturation does.',
          },
          roleNote: {
            1: 'Oxygen is in your scope. Give it for a saturation below the number in your protocol, and record the flow, the device and the reading before and after.',
            2: 'Titrate to the range in your protocol and no higher. A saturation that keeps falling in a heart attack suggests fluid in the lungs: listen to the chest and tell the hospital.',
          },
        },
        {
          title: 'Aspirin: the drug that saves lives',
          text: [
            'A heart attack is a clot growing on a cracked plaque, and a clot is built from platelets, the tiny cell fragments in the blood that stick together to plug a leak. Aspirin makes platelets less sticky. Given early, it lowers the chance of dying. Oxygen, nitroglycerin and pain medicine have not been shown to do that.',
            'The dose is 162 to 325 mg of plain aspirin, chewed: two to four 81 mg chewable tablets. Plain means not enteric-coated, the kind with a shell made to pass through the stomach unopened. Chewing matters: chewed aspirin starts to work within minutes, and a coated tablet swallowed whole takes far longer.',
            'Hold it for a true aspirin allergy, for serious bleeding going on now, such as vomiting blood or passing black stools, and when you suspect an aortic dissection. A patient who took a small daily aspirin today usually still gets the full dose, per protocol.',
          ],
          look: 'The start of the blocked artery is ringed. The blockage is a clot. Aspirin does not dissolve it, but it slows the clot from growing while the patient is on the way to having the artery opened.',
          show: { ecg: false, heart: 'external', structure: 'lad-proximal' },
          check: {
            kind: 'choice',
            question: 'Which of these patients should not be given aspirin?',
            options: [
              'Sudden tearing pain through to the back, with a weaker pulse in one arm',
              'Chest pressure, and a daily low-dose aspirin taken this morning',
              'Chest pressure, and aspirin has upset his stomach in the past',
              'Chest pressure with nausea, a cold sweat and no known allergies',
            ],
            answer: 0,
            explain: 'Tearing pain with unequal pulses suggests an aortic dissection, where a drug that hinders clotting can do harm. A daily low dose does not replace the full chewed dose, an upset stomach is not an allergy, and nausea with sweating is part of the heart attack itself.',
          },
          roleNote: {
            1: 'Aspirin for a suspected heart attack is in your scope, per protocol. Ask about allergy and bleeding, give it, and record the dose and the time.',
            2: 'If a dispatcher or a bystander already gave aspirin, find out what was taken and when before you add to it. The hospital will ask for the dose and the time.',
          },
          more: ['aspirin'],
        },
        {
          title: 'The monitor goes on',
          text: [
            'Attach the cardiac monitor as soon as you reach the patient. A heart attack makes the heart\'s electrical system unstable, and the monitor is how you see a dangerous rhythm the moment it starts.',
            'A monitoring lead shows the rhythm and nothing more. It cannot show whether an artery is blocked, or where. That takes the full 12-lead ECG, which is the next lesson.',
          ],
          look: 'The top trace is lead II, the usual monitoring lead. This patient\'s front wall is being injured, yet lead II looks close to normal. A calm monitor strip never rules out a heart attack.',
          show: { ecg: 'defib', heart: false },
          roleNote: {
            1: 'Where your protocol allows, you apply the electrodes and watch the patient. Naming the rhythm is the paramedic\'s part. If the trace changes suddenly, check the patient first: pulse, breathing, alertness.',
            2: 'Watch for runs of fast, wide beats and for a slowing rate. Both are warnings in a heart attack, and both are a reason to recheck the patient and the pads.',
          },
        },
        {
          title: 'Be ready for the worst',
          text: [
            'The most dangerous early complication of a heart attack is ventricular fibrillation (VF). The ventricles stop beating and only quiver, no blood moves, and the patient collapses with no pulse. It can come with no warning, and it is most likely in the first hours.',
            'VF can be survived when a shock is given fast. So get ready before it happens: defibrillator pads within reach or already on the chest, per protocol, and an agreed plan for who does what.',
            'If the patient collapses: check for a pulse, start CPR, and shock as soon as the pads are on.',
          ],
          look: 'This is VF. The ventricles only quiver, and the status box at the edge of the heart view reads "Fibrillation" in red. Where the tracing shows too, it is a chaotic wavy line with no regular beats.',
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'vf', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap one of the chambers that has stopped pumping.',
            targets: ['left-ventricle', 'right-ventricle', 'apex'],
            explain: 'In VF it is the ventricles, the two pumping chambers, that quiver. With no organized squeeze, no blood reaches the brain or the heart\'s own arteries. CPR moves a little blood by hand, and only a shock can stop the chaos so that a normal rhythm can start again.',
          },
          roleNote: {
            1: 'CPR and the AED are yours. Know where the pads are before you need them, and start compressions while your partner puts them on.',
            2: 'With the monitor on you will see VF begin. Confirm there is no pulse, defibrillate at once in manual mode and resume CPR, per the cardiac arrest algorithm.',
          },
          more: ['ventricular-fibrillation', 'defibrillation'],
        },
        {
          title: 'The first minutes, in order',
          text: [
            'Put together: stop all effort and settle the patient. Vital signs. Oxygen only for a low saturation. Aspirin unless there is a reason to hold it. Monitor on, pads within reach. Then the 12-lead, within 10 minutes of reaching the patient.',
            'With two of you, several of these happen at once. None of them should hold up the 12-lead or the decision to move.',
          ],
          look: 'The same patient again, artery still blocked. Nothing you have done so far opens it. What you have done is lower the heart\'s workload and slow the clot.',
          show: { rhythm: 'anterior-stemi', heart: 'external', camera: 'Front', ecg: false },
          check: {
            kind: 'choice',
            question: 'You reach a 58-year-old man with chest pressure and a cold sweat. SpO2 97%, blood pressure 148/90, no allergies, no bleeding. Which pair of actions is right?',
            options: [
              'Keep him seated where he is and give chewed aspirin',
              'Walk him to the ambulance and start high-flow oxygen',
              'Give high-flow oxygen and wait to see if the pain settles',
              'Lay him flat and hold all drugs until the hospital',
            ],
            answer: 0,
            explain: 'He stays still, because effort raises the work of his heart, and he gets aspirin, because nothing argues against it. His saturation is 97%, so oxygen adds nothing. Lying flat often makes breathing harder, and holding aspirin until the hospital gives up the one early drug that saves lives.',
          },
          roleNote: {
            1: 'If paramedics are not already on the way, request them early, per protocol. Do not wait on scene for them when meeting them on the road is faster.',
            2: 'Start an IV line when it does not delay the 12-lead or the move to the ambulance. It is your route for fluid and drugs if the pressure or the rhythm turns bad.',
          },
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'twelve-lead',
      title: 'The 12-lead in ten minutes',
      goal: 'Record a clean 12-lead within 10 minutes of reaching the patient, catch a swapped limb cable and get the tracing to the hospital.',
      minutes: 7,
      steps: [
        {
          title: 'Ten minutes',
          text: [
            'The 12-lead ECG decides where this patient goes and how fast. It draws twelve tracings, called leads. Each lead is a view of the heart\'s electrical activity from a different direction. The target is to record it, and have it read, within 10 minutes of first medical contact: the moment the first trained responder reaches the patient.',
            'Record it early and on scene when you can, before the patient is moved and before nitroglycerin, which can change the picture. A tracing sent from the scene lets the hospital get ready while you are still on the road.',
          ],
          look: 'This is a 12-lead of a healthy heart: twelve leads recorded at the same moment, in four columns of three, each with its name in the corner. A long strip of lead II runs along the bottom.',
          show: { ecg: 'ecg', heart: false, rhythm: 'normal-sinus' },
          check: {
            kind: 'choice',
            question: 'How soon after first medical contact should the first 12-lead be recorded and read?',
            options: ['Within 5 minutes', 'Within 10 minutes', 'Within 20 minutes', 'Within 30 minutes'],
            answer: 1,
            fixed: true,
            explain: 'Ten minutes from first contact, per the 2025 ACC/AHA guideline. Five would be welcome but is not the standard. Twenty or thirty minutes means the tracing was left for the ambulance or the hospital, and the hospital\'s head start is lost.',
          },
          roleNote: {
            1: 'Where your protocol allows, you acquire the 12-lead and transmit it. You do not interpret it. If the machine prints a warning such as "ACUTE MI", report those words as they stand, and never take a printout that reads "normal" as proof that the heart is fine.',
            2: 'You acquire it, read it and act on it. Read the tracing yourself and treat the machine\'s printed reading as a second opinion.',
          },
        },
        {
          title: 'Skin first',
          text: [
            'A clean tracing starts with the skin. Expose the chest fully, and keep the patient as warm and as covered as you can. Dry the skin: a patient in a cold sweat is the rule on this call, and electrodes do not stick to wet skin.',
            'Clip thick hair where the electrodes will sit, and rub each spot lightly with gauze so the gel makes good contact. Use fresh electrodes from a sealed pack. Dried-out gel gives a weak, noisy signal.',
          ],
          look: 'This is the electrode lab: a patient wearing all ten electrodes, with the heart beating behind a window in the chest. Drag to turn the patient.',
          show: { ecg: 'lab' },
        },
        {
          title: 'Four on the limbs',
          text: [
            'Ten electrodes make twelve leads. Four go on the limbs: RA (right arm), LA (left arm), RL (right leg) and LL (left leg). US cable colors are white, black, green and red. A common memory aid: on the right, snow over grass (white above green); on the left, smoke over fire (black above red).',
            'A standard 12-lead puts the limb electrodes on the arms and legs (the upper arms and thighs will do). On an ambulance they are often moved onto the torso, as on this patient, to cut down the false signal (artifact) caused by movement: RA and LA below the collarbones near the shoulders, RL and LL on the lower abdomen. That changes the limb leads a little, so use your service\'s placement every time and note it on the tracing.',
          ],
          look: 'Tap RA, LA, LL and RL on the patient. The lab names the lead each one makes and where it sits. For RL it tells you that it is the ground and makes no lead.',
          check: {
            kind: 'choice',
            question: 'Which limb electrode is the ground and makes no lead of its own?',
            options: ['RL, on the right leg', 'RA, on the right arm', 'LA, on the left arm', 'LL, on the left leg'],
            answer: 0,
            explain: 'The right leg electrode is the ground: it steadies the signal and belongs to no lead. The other three limb electrodes form the six limb leads between them, so swapping any two of those changes the tracing.',
          },
        },
        {
          title: 'Six on the chest',
          text: [
            'The six chest electrodes go in fixed places, found by feeling for the ribs and never by eye. V1: fourth intercostal space (the gap between the fourth and fifth ribs), at the right edge of the breastbone. V2: the same space, at the left edge. V4: fifth intercostal space, straight below the middle of the left collarbone.',
            'V3 goes halfway between V2 and V4. V5 and V6 follow at the same level as V4: V5 at the front fold of the armpit, V6 straight below the center of the armpit.',
            'To find the fourth space, feel for the bony ridge on the breastbone about 5 cm (2 inches) below its top notch. The second rib joins there, and the gap under that rib is the second space. Count down two more. On a patient with large breasts, V4 to V6 go on the chest wall under the breast.',
          ],
          look: 'Tap V1, V2 and V4 on the patient and read where each belongs. Then turn the patient and tap V6 to see how far around the side it sits.',
          check: {
            kind: 'choice',
            question: 'Where does V4 go?',
            options: [
              'Fifth intercostal space, below the middle of the left collarbone',
              'Fourth intercostal space, left edge of the breastbone',
              'Fifth intercostal space, below the center of the armpit',
              'On the left nipple, wherever that lies on this patient',
            ],
            answer: 0,
            explain: 'V4 sits in the fifth space on the line dropped from the middle of the collarbone. The fourth space at the left edge of the breastbone is V2. Below the center of the armpit is V6. The nipple is not a landmark: its position differs from one patient to the next.',
          },
        },
        {
          title: 'A still patient, a clean tracing',
          text: [
            'The machine records every electrical signal on the chest, including the ones made by tense or shivering muscle. Have the patient lean back, arms at the sides and legs uncrossed, and ask for a few seconds with no moving and no talking while it records.',
            'Record before you leave the scene, or stop the ambulance if you can. Then check the result before you send it: a flat, steady line between beats and thin, sharp waves.',
            'A line that wanders up and down usually means a loose electrode or deep breathing. A fuzzy, jagged line means muscle tremor. Fix the cause and record again.',
          ],
          look: 'This is the printout layout of a clean 12-lead. Between beats the line is flat and steady in every lead, and the waves are thin and sharp.',
          show: { ecg: 'ecg', layout: 'standard' },
          check: {
            kind: 'choice',
            question: 'You recorded the 12-lead while the stretcher was being loaded, and the line swings up and down across the page. What is the best move?',
            options: [
              'Record it again with the patient still, before anyone reads it',
              'Send it as it is and let the hospital read around the movement',
              'Turn the gain (the size setting) down until the line looks flat',
              'Move the chest electrodes closer together and send that',
            ],
            answer: 0,
            explain: 'A wandering line comes from movement or a loose electrode, and it can hide or imitate the very changes the reader is looking for. Thirty seconds spent on a second, still recording is worth it. Turning the gain down shrinks the real waves along with the noise.',
          },
        },
        {
          title: 'Swapped limb cables',
          text: [
            'The most common mistake is swapping the two arm cables. Nothing looks broken, and the machine still prints a neat tracing. But lead I is drawn upside down, and aVR, which normally points down, points up.',
            'A swapped cable can make a healthy heart look damaged and can hide a real heart attack. The clue to this one: the chest leads V1 to V6 still look normal. Lead I and V6 both look at the heart from the patient\'s left, so they should look alike. Lead I upside down beside a normal V6 points to the cables, not the heart.',
          ],
          look: 'Find "Try a reversal" in the lab (scroll if you need to) and tap "LA ↔ RA". An amber box lists the clues, and where the 12-lead shows beside the lab, lead I turns upside down. Tap "Reset placement" before you go on.',
          show: { ecg: 'lab', layout: 'simultaneous' },
          check: {
            kind: 'choice',
            question: 'On your tracing lead I is upside down and aVR points up, but V1 to V6 look normal. What do you do?',
            options: [
              'Check the arm electrodes, correct them and record again',
              'Transmit it and report a possible heart attack',
              'Move the chest electrodes one space lower',
              'Transmit it: the hospital will allow for the swap',
            ],
            answer: 0,
            explain: 'An upside-down lead I with an upright aVR and normal chest leads is the mark of swapped arm cables. Fix it at the source. A tracing sent with a known error can be misread as heart damage, and nobody at the hospital can tell which cables were swapped.',
          },
        },
        {
          title: 'Check it, then send it',
          text: [
            'Before the tracing leaves your hands, give it ten seconds. Are the patient\'s name or ID, the age and the time on it? Is the line clean? Does aVR point down and lead I point up? If not, check the arm electrodes before you blame the heart, and record again if they were swapped.',
            'Then transmit it, per protocol, and follow it with a short report: age and sex, the symptoms and when they started, the vital signs, and the fact that a 12-lead has been sent. A tracing that arrives before the patient lets a physician read it and start the hospital\'s response early.',
          ],
          look: 'The electrode lab is closed and every cable is back in its place: no amber ⚠ above the tracing. Run the check on this tracing: aVR points down, lead I points up.',
          show: { ecg: 'ecg', placement: 'standard' },
          check: {
            kind: 'lead',
            question: 'Tap the lead that is drawn upside down when the two arm cables are swapped.',
            targets: ['I'],
            explain: 'Lead I measures from the right arm to the left arm, so swapping those two cables turns it completely over. aVR and aVL trade places, which is why aVR then points up. Leads II and III trade places too, but neither is turned upside down.',
          },
          roleNote: {
            1: 'Acquire, check the quality, transmit, and report the patient. Do not tell the patient or the hospital what you think the tracing shows. Do tell them how the patient looks and when the symptoms began.',
            2: 'Read it before you send it and tell the hospital what you see. The next lesson covers what to look for. If the first tracing does not explain the symptoms, repeat it.',
          },
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'reading-it-fast',
      title: 'Reading it fast',
      goal: 'Find ST elevation on a 12-lead, name the wall and the artery behind it, and use reciprocal changes to back it up.',
      minutes: 10,
      steps: [
        {
          title: 'One question: where is the ST segment?',
          text: [
            'This lesson is for the paramedic, who reads the 12-lead. It covers one job: spotting an ST-elevation myocardial infarction (STEMI), the heart attack in which an artery is fully blocked and has to be opened now. The course "Finding a heart attack on the 12-lead" goes deeper.',
            'The ST segment is the short stretch of line between the end of the QRS (the tall spike) and the start of the T wave (the rounded wave after it). In a healthy heart it sits level with the baseline, the flat line between beats. Over muscle that is being injured through the full thickness of the wall it is lifted above the baseline. That is ST elevation.',
          ],
          look: 'Lead II of a healthy heart is enlarged, with its waves labeled. The dashed line right after the QRS marks where the ST segment is measured. The label beside its top gives the height: about 0 mm, level with the baseline.',
          show: { ecg: 'ecg', heart: false, rhythm: 'normal-sinus', inspect: 'II' },
          roleNote: {
            1: 'Reading a 12-lead is outside the EMT scope. Take this lesson to understand what the paramedic and the hospital look for, and why your clean, early tracing matters. Your part stays the same: acquire and transmit.',
            2: 'Recognition is the skill here: ST elevation, the wall, the mirror image. Exact measurement and the look-alikes are covered in "Finding a heart attack on the 12-lead".',
          },
        },
        {
          title: 'What ST elevation looks like',
          text: [
            'This is the same measurement in a patient with a blocked artery. The line leaves the QRS well above the baseline and runs straight into a tall, broad T wave.',
            'It counts as a STEMI when the ST segment is raised by 1 mm (one small box) or more in at least two leads that look at the same wall, in a patient with symptoms. In V2 and V3 the cut-off is higher, 1.5 to 2.5 mm depending on age and sex, because healthy people often show a little elevation there.',
          ],
          look: 'Lead V3 is enlarged. Read the label beside the top of the dashed line: the ST segment is about 3 mm above the baseline, where the healthy tracing read about 0.',
          show: { rhythm: 'anterior-stemi', inspect: 'V3' },
          check: {
            kind: 'choice',
            question: 'ST elevation of 1 mm is found in lead III and nowhere else. Does that meet the rule for a STEMI?',
            options: [
              'No: it takes two or more leads that look at the same wall',
              'Yes: 1 mm in any one lead is enough to call it',
              'Yes, as long as the patient also has chest pain',
              'No: the cut-off in every lead is 2.5 mm, not 1 mm',
            ],
            answer: 0,
            explain: 'One raised lead can be a quirk of that lead. The rule asks for 1 mm or more in at least two neighboring leads, such as III and aVF, in a patient with symptoms. The higher cut-offs of 1.5 to 2.5 mm apply only to V2 and V3.',
          },
        },
        {
          title: 'The front wall: V1 to V4',
          text: [
            'One raised lead proves nothing. Look for a group of neighbors. V1 to V4 sit in a row across the front of the chest and look at the septum (the wall between the two ventricles) and the front wall of the left ventricle.',
            'ST elevation in V1 to V4 is an anterior STEMI: an injury to the front wall, the largest territory of the heart. When it spreads into V5 as well, as it does in this patient, even more muscle is at risk.',
          ],
          look: 'All twelve leads are on screen. V1, V2 and V3 are the third column, and V4, V5 and V6 the fourth. Compare each ST segment with the flat line that comes before its QRS.',
          show: { layout: 'simultaneous' },
          check: {
            kind: 'lead',
            question: 'Tap a chest lead where the ST segment is clearly lifted above the baseline.',
            targets: ['V1', 'V2', 'V3', 'V4', 'V5'],
            explain: 'V1 to V5 all show it, most of all V2, V3 and V4, which lie directly over the front wall. Several neighbors telling the same story is what makes this an anterior STEMI and not a quirk of one lead.',
          },
        },
        {
          title: 'Find it on the heart',
          text: [
            'Each group of leads faces one wall, and each wall has its own artery. Here the heart is painted by artery, and the legend lists the wall each artery feeds. The pulsing purple area is this patient\'s injury: one whole territory.',
            'Lead V3 is selected. Its line of sight comes in through the front of the chest and meets the injured wall. V1 to V4 lie on the chest right over it, which is why they are the leads that show it.',
          ],
          look: 'The cyan line is lead V3\'s line of sight. It starts at the tag "V3 (+) looks from here" and meets the heart at the tag Anterior wall. The pulsing purple area covers that same front wall, down to the tip.',
          show: { heart: 'territories', camera: 'Front', lead: 'V3', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the artery that feeds the injured wall.',
            targets: ['lad-proximal', 'lad-mid', 'lad-distal', 'd1'],
            explain: 'The front wall is the territory of the left anterior descending artery (LAD), which runs down the front of the heart to the tip. So ST elevation in V1 to V4 means the LAD. It feeds more heart muscle than any other artery, which makes this the heart attack most likely to end in shock: a heart too weak to keep up the blood pressure.',
          },
          more: ['lad-proximal', 'anterior-stemi'],
        },
        {
          title: 'The bottom wall',
          text: [
            'Three leads look up at the heart from below, at the bottom (inferior) wall that rests on the diaphragm. ST elevation in those three is an inferior STEMI.',
            'This is a new patient. V1 to V4 are not lifted this time. Find the three leads with lifted ST segments.',
          ],
          look: 'All twelve leads again. Compare each ST segment with the flat line before its QRS. The lifted ones are in the first two columns, the limb leads.',
          show: { rhythm: 'inferior-stemi', heart: false },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows this patient\'s ST elevation.',
            targets: ['II', 'III', 'aVF'],
            explain: 'II, III and aVF are the inferior leads: all three look at the heart from below. Each is lifted by 1 mm or more and they are neighbors, so the rule is met. The next step shows the wall they look at and the artery that feeds it.',
          },
          roleNote: {
            2: 'With ST elevation in II, III and aVF, think of the right ventricle before any nitroglycerin. The next lesson explains why.',
          },
          more: ['inferior-stemi'],
        },
        {
          title: 'Find it from below',
          text: [
            'This is the same patient\'s heart, seen from below and painted by artery. The pulsing purple area is the underside: the inferior wall that II, III and aVF look at.',
            'In about 8 of 10 people this wall is fed by the right coronary artery (RCA). In the rest it is fed by the circumflex artery (LCx), a branch of the left coronary artery.',
            'The RCA usually also feeds the right ventricle and the AV node, the relay that passes each beat from the upper chambers to the lower ones. That is why an inferior heart attack often brings a slow heart rate and a low blood pressure.',
          ],
          look: 'The purple area pulses across the underside. The tip of the heart keeps another color: it belongs to a different artery. The legend names the artery that feeds the inferior wall. Find a name tag on the heart that ends in those letters.',
          show: { heart: 'territories', camera: 'Bottom', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the artery that feeds the bottom wall in most people. Any part of it counts.',
            targets: ['rca-distal', 'pda', 'posterolateral-branch', 'rca-mid', 'rca-proximal', 'am-branch'],
            explain: 'The right coronary artery (RCA) runs around the right side of the heart to its underside, where its end branches feed the inferior wall. So ST elevation in II, III and aVF usually means the RCA. Because the RCA also feeds the right ventricle, this is the heart attack in which nitroglycerin can do harm.',
          },
          more: ['inferior-stemi', 'rca-proximal'],
        },
        {
          title: 'The side wall: I, aVL, V5 and V6',
          text: [
            'Leads I, aVL, V5 and V6 look at the heart from the patient\'s left, at the side (lateral) wall of the left ventricle. ST elevation in these leads is a lateral STEMI.',
            'Lateral changes are often small, because this wall lies far from most of the electrodes. A millimeter in I and aVL, in a patient with the right story, deserves a second look and a repeat tracing.',
          ],
          look: 'A third patient, seen from the patient\'s left. The pulsing purple area covers the side wall. The legend lists the wall each artery feeds: find the one for the lateral wall, then its name tag on the heart.',
          show: { rhythm: 'lateral-stemi', heart: 'territories', camera: 'Left', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the artery that feeds the pulsing side wall of this heart.',
            targets: ['lcx-proximal', 'om1', 'om2'],
            explain: 'On this heart the lateral wall belongs to the circumflex artery (LCx) and its branches, the obtuse marginals (OM). A diagonal branch of the LAD can put the same picture on the 12-lead. So ST elevation in I, aVL, V5 and V6 points to the circumflex or a diagonal.',
          },
          more: ['lateral-stemi', 'lcx-proximal'],
        },
        {
          title: 'Reciprocal changes: the mirror image',
          text: [
            'A real STEMI often casts a mirror image. Leads that face the injured wall show ST elevation. Leads that look at the same wall from the opposite side show ST depression: the ST segment pushed below the baseline. These are reciprocal changes.',
            'They matter because the harmless causes of ST elevation, and inflammation of the sac around the heart (pericarditis), do not produce them. Elevation in one group of leads with depression in the opposite group is a blocked artery until proven otherwise.',
            'A mirror image makes a STEMI much more likely. A missing one does not rule it out: front-wall STEMIs often show little or none.',
          ],
          look: 'The inferior STEMI again, with all twelve leads. II, III and aVF are lifted. Now look through the other leads for the one pushed furthest below its baseline.',
          show: { rhythm: 'inferior-stemi', heart: false },
          check: {
            kind: 'lead',
            question: 'Tap the lead whose ST segment is pushed furthest below the baseline.',
            targets: ['aVL'],
            explain: 'aVL looks at the heart from the upper left, nearly opposite the inferior leads, so it shows the mirror image of their elevation. Inferior elevation with depression in aVL is the classic pair. Anterior or lateral elevation often comes with depression in III and aVF.',
          },
        },
        {
          title: 'Say it in one line',
          text: [
            'Reading it fast means three questions in order. Is the ST segment raised in two or more neighboring leads? Which wall: anterior (V1 to V4), inferior (II, III, aVF) or lateral (I, aVL, V5, V6)? Is there a mirror image to back it up?',
            'Then say it in one line: "ST elevation in II, III and aVF with depression in aVL: inferior STEMI." That line starts the STEMI alert in the last lesson.',
            'Not every heart attack shows ST elevation, and a first tracing can be normal. A normal 12-lead does not clear the patient: the care and the trip to the hospital stay the same. When the story is strong and the tracing is not, repeat the 12-lead and say so in your report.',
          ],
          look: 'One more tracing, with nothing marked. Go through the leads group by group: V1 to V4, then II, III and aVF, then I, aVL, V5 and V6.',
          show: { rhythm: 'lateral-stemi' },
          check: {
            kind: 'choice',
            question: 'Read this tracing. Which wall is being injured?',
            options: ['The lateral wall', 'The anterior wall', 'The inferior wall', 'None: this tracing is normal'],
            answer: 0,
            explain: 'The ST segments are raised in I, aVL, V5 and V6, the leads that look at the side of the heart, and pushed down in III, the mirror image. V1 to V3 are not raised, so it is not anterior. III and aVF are pushed down, not raised, so it is not inferior.',
          },
          more: ['anterior-stemi', 'inferior-stemi', 'lateral-stemi'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'nitroglycerin-and-pain',
      title: 'Nitroglycerin and pain relief',
      goal: 'Explain what nitroglycerin does, run the three checks that decide whether it can be given, and relieve pain without hiding a patient who is getting worse.',
      minutes: 8,
      steps: [
        {
          title: 'What nitroglycerin does',
          text: [
            'Nitroglycerin relaxes blood vessels, the veins most of all. Blood pools in the widened veins, so less of it returns to the heart with each beat. The ventricles fill less and stretch less, the heart does less work, and the pain often eases.',
            'It also widens the coronary arteries a little. But it does not open a blocked artery, and it has not been shown to save lives in a heart attack. It is a drug for comfort, and it carries a real risk: it lowers the blood pressure.',
          ],
          look: 'The heart is cut open. The blue dots are blood returning from the body into the right side. Nitroglycerin cuts down this returning flow, so each chamber fills a little less before it squeezes.',
          show: { heart: 'sectioned', camera: 'Front', flow: true, rhythm: 'normal-sinus' },
          check: {
            kind: 'choice',
            question: 'How does nitroglycerin ease the pain of a heart attack?',
            options: [
              'Less blood returns to the heart, so the heart does less work',
              'It dissolves the clot in the artery',
              'It dulls pain in the brain, as an opioid does',
              'It makes the heart beat harder to push blood past the blockage',
            ],
            answer: 0,
            explain: 'Widened veins hold more blood, less returns to the heart, and the heart\'s workload and need for oxygen fall. It does not dissolve clots: only opening the artery removes the blockage. It is not a painkiller acting on the brain, and a heart beating harder would need more oxygen, not less.',
          },
        },
        {
          title: 'How it is given',
          text: [
            'For chest pain, nitroglycerin goes under the tongue: a small tablet that dissolves there, or a metered spray. It starts to act within a few minutes.',
            'Seat the patient or lay them down first. One dose is one tablet or one spray, usually 0.4 mg. Measure the blood pressure before every dose and again a few minutes after it. How soon a dose may be repeated, and how many times, is set by your protocol and by the label on the patient\'s own prescription.',
            'Expect a headache and a flushed face. Dizziness, a faint or a drop in pressure is the signal to stop: lay the patient flat and reassess.',
          ],
          look: 'The cut-open heart is still on screen. Every dose cuts the returning blue flow again, which is why the pressure is measured before and after each one.',
          roleNote: {
            1: 'You may assist a patient with their own prescribed nitroglycerin, per protocol and medical direction. Confirm it is theirs and in date, run the three checks that follow, and measure the pressure before and after.',
            2: 'You carry and give nitroglycerin per protocol. The same three checks apply, and you can read the 12-lead for the third. Where you can, have an IV line in before the first dose, so that a fall in pressure can be treated with fluid.',
          },
          more: ['nitroglycerin'],
        },
        {
          title: 'Check one: the blood pressure',
          text: [
            'Nitroglycerin lowers the blood pressure, so it is held when the pressure is already low. The 2025 ACC/AHA guideline: do not give it when the systolic pressure is below 90 mmHg, or has fallen more than 30 mmHg below the patient\'s usual pressure.',
            'The second half protects patients with high blood pressure. Someone who usually runs 170 and now measures 130 has already lost 40 mmHg, even though 130 looks healthy. Many protocols set a higher floor than 90. Follow yours.',
          ],
          look: 'The monitor view is open. The box labeled NIBP, in the column of numbers on the right, shows the last cuff pressure, or dashes until one is taken. Press NIBP in the panel to take one: no dose without a fresh number.',
          show: { ecg: 'defib', heart: false, rhythm: 'anterior-stemi' },
          check: {
            kind: 'choice',
            question: 'A patient\'s usual systolic pressure is 150 mmHg. Today, with chest pressure, it is 112. By the guideline\'s rule, can nitroglycerin be given?',
            options: [
              'No: it is more than 30 mmHg below his usual pressure',
              'Yes: 112 is well above the floor of 90 mmHg',
              'Yes, but only half a tablet to begin with',
              'Yes, once he has been given oxygen for a few minutes',
            ],
            answer: 0,
            explain: 'A fall of 38 mmHg from his usual pressure fails the check, even though 112 is above the floor of 90. Both halves of the rule have to pass. Half a tablet lowers the pressure too, and oxygen does nothing to protect it.',
          },
        },
        {
          title: 'Check two: erectile-dysfunction drugs',
          text: [
            'Drugs for erectile dysfunction, the PDE-5 inhibitors, also widen blood vessels. Taken with nitroglycerin they can drop the blood pressure dangerously, and for hours.',
            'Hold nitroglycerin if the patient took avanafil (Stendra) within the last 12 hours, sildenafil (Viagra) or vardenafil (Levitra) within the last 24 hours, or tadalafil (Cialis) within the last 48 hours.',
            'Ask every patient, plainly and out of earshot of family. Ask women too: sildenafil and tadalafil are also prescribed, under other brand names, for high blood pressure in the lungs.',
          ],
          check: {
            kind: 'choice',
            question: 'A man with chest pressure took tadalafil 36 hours ago. His blood pressure is 138/84. Nitroglycerin?',
            options: [
              'Hold it: tadalafil needs 48 hours',
              'Give it: more than 24 hours have passed',
              'Give it: his blood pressure is normal',
              'Give one dose and recheck the pressure in a minute',
            ],
            answer: 0,
            explain: 'Tadalafil lasts the longest of these drugs, so its window is 48 hours. The 24-hour window belongs to sildenafil and vardenafil, and 12 hours to avanafil. A normal pressure now is no protection: the fall comes after the two drugs meet.',
          },
          roleNote: {
            1: 'Asking this question is part of assisting with nitroglycerin. If the answer is yes, or the patient is unsure, do not assist: tell medical direction and the crew you hand over to.',
          },
        },
        {
          title: 'Check three: the right ventricle',
          text: [
            'The third check is about where the heart attack is. In most people the artery that feeds the bottom (inferior) wall of the heart, the right coronary artery, also feeds the right ventricle. When it is blocked near its start, the right ventricle is injured as well.',
            'An injured right ventricle is weak. It keeps blood moving through the lungs only as long as plenty of blood is returning to fill it. Nitroglycerin cuts that return, and the blood pressure can collapse after a single dose.',
            'The guideline: avoid nitroglycerin when a right ventricular infarct (a heart attack involving the right ventricle) is suspected.',
          ],
          look: 'An inferior heart attack, seen from the front and painted by artery. The pulsing purple area covers the right ventricle and runs on around to the underside of the heart: one artery, the right coronary, feeds them both.',
          show: { rhythm: 'inferior-stemi', heart: 'territories', camera: 'Front', ecg: false },
          check: {
            kind: 'tap',
            question: 'Tap the chamber that fails when nitroglycerin is given in this heart attack.',
            targets: ['right-ventricle'],
            explain: 'The right ventricle is the thin-walled chamber at the front of the heart that pumps blood to the lungs. Injured, it depends on a full supply of returning blood, and nitroglycerin takes that supply away. Low pressure with clear lungs in an inferior heart attack is the warning sign.',
          },
          roleNote: {
            1: 'You cannot read the 12-lead, so use what you can measure. A low or falling pressure, a slow pulse, or a paramedic\'s or physician\'s report of an inferior heart attack are reasons to hold nitroglycerin and ask medical direction.',
          },
          more: ['right-ventricle', 'inferior-stemi'],
        },
        {
          title: 'The warning on the 12-lead',
          text: [
            'On the 12-lead the warning is ST elevation in the inferior leads. Every inferior STEMI raises the question of the right ventricle, and the question is answered before nitroglycerin is given.',
            'The twelve standard leads barely see the right ventricle. One extra lead does: V4R, recorded by moving the V4 electrode to the matching spot on the right side of the chest. ST elevation in V4R points to a right ventricular infarct.',
          ],
          look: 'This is the 12-lead of the same inferior heart attack. Look for the leads whose ST segments are lifted above the baseline.',
          show: { ecg: 'ecg', heart: false, layout: 'simultaneous' },
          check: {
            kind: 'lead',
            question: 'Tap a lead whose ST elevation should make you think of the right ventricle.',
            targets: ['II', 'III', 'aVF'],
            explain: 'II, III and aVF are the inferior leads. ST elevation there means the right coronary artery is the likely culprit, and the right ventricle may be involved with it. Check V4R and the blood pressure before any nitroglycerin.',
          },
          roleNote: {
            1: 'A right-sided lead is the paramedic\'s to read. If you are asked to place it, V4R is the V4 position mirrored onto the right side of the chest.',
            2: 'Record V4R in every inferior STEMI: fifth intercostal space, below the middle of the right collarbone. ST elevation of 0.5 mm or more there (1 mm in men under 30) points to the right ventricle: give no nitrates and treat low pressure with fluid, per protocol. Label the tracing as right-sided.',
          },
        },
        {
          title: 'Pain relief',
          text: [
            'Pain is not harmless. It drives up the heart rate and the blood pressure, and with them the work of the heart. But in a heart attack, pain is also your gauge of what the artery is doing. Aim for comfort, not silence.',
            'The order: nitroglycerin first, when the three checks allow it. An opioid such as fentanyl or morphine is kept for pain that nitroglycerin has not relieved, in small doses, per protocol. Opioids slow the uptake of the antiplatelet tablets the hospital will give (drugs that, like aspirin, keep platelets from clumping), so the paramedic uses the least that works.',
            'Anti-inflammatory painkillers such as ibuprofen (NSAIDs) are not given. In a heart attack they cause harm.',
          ],
          look: 'The first patient again. The pulsing purple area is still short of blood. Pain relief changes how the patient feels, not what is happening here. Only opening the artery does that.',
          show: { rhythm: 'anterior-stemi', heart: 'external', camera: 'Front', ecg: false },
          check: {
            kind: 'choice',
            question: 'After nitroglycerin the pain is still 8 out of 10. Blood pressure 132/80, SpO2 97%. What is the paramedic\'s next step for the pain, per protocol?',
            options: [
              'A small dose of an opioid, repeated if needed',
              'Ibuprofen by mouth, as for any other pain',
              'High-flow oxygen by mask to ease the pain',
              'Nothing: pain should be left untreated so it can be tracked',
            ],
            answer: 0,
            explain: 'An opioid is the choice for pain that nitroglycerin has not relieved, in the smallest dose that works. Ibuprofen and other NSAIDs cause harm in a heart attack. Oxygen does not treat pain at a saturation of 97%. Leaving severe pain untreated keeps the heart working harder than it needs to.',
          },
          roleNote: {
            1: 'Opioids are ALS drugs. Your pain relief is a comfortable position, calm reassurance, assisted nitroglycerin where allowed, and a smooth ride. Ask for a pain score from 0 to 10 with every set of vital signs.',
            2: 'Titrate small doses and watch breathing, saturation and pressure after each one, with naloxone at hand. Pain that returns or changes is a reason for a new 12-lead.',
          },
          more: ['fentanyl'],
        },
        {
          title: 'Three checks, every time',
          text: [
            'Before any nitroglycerin: a systolic pressure of at least 90 mmHg and no more than 30 below the patient\'s usual. No erectile-dysfunction drug inside its window of 12, 24 or 48 hours. No sign that the right ventricle is involved.',
            'If any one of them fails, the answer is no, and little is lost. Nitroglycerin was never the treatment. Aspirin, the 12-lead and a fast trip to the right hospital are.',
          ],
          look: 'The inferior heart attack is back on the 12-lead, for one last case.',
          show: { rhythm: 'inferior-stemi', ecg: 'ecg', heart: false },
          check: {
            kind: 'choice',
            question: 'Chest pressure. Blood pressure 104/70 (usual 118). Sildenafil 30 hours ago. The paramedic reads an inferior STEMI with ST elevation in V4R. Which check fails?',
            options: [
              'The right ventricle is involved',
              'The blood pressure is too low',
              'The sildenafil is too recent',
              'None: nitroglycerin can be given',
            ],
            answer: 0,
            explain: 'ST elevation in V4R points to a right ventricular infarct, so nitroglycerin is avoided. The pressure passes: 104 is above 90 and only 14 below the usual 118. The sildenafil passes: its window is 24 hours, and 30 have gone by. One failed check is enough to say no.',
          },
        },
      ],
    },

    // ─── 6 ───────────────────────────────────────────────────────────────
    {
      id: 'alert-and-handoff',
      title: 'The STEMI alert and the hand-off',
      goal: 'Call a STEMI alert early, choose the right hospital, keep reassessing on the way and hand over what the hospital needs.',
      minutes: 7,
      steps: [
        {
          title: 'The clock runs the call',
          text: [
            'A STEMI is treated by opening the blocked artery. The best way is primary PCI (percutaneous coronary intervention). In a catheterization laboratory, or cath lab, a thin tube is passed through an artery at the wrist or groin up to the heart. The blockage is opened with a small balloon and held open with a stent, a tiny mesh tube.',
            'The sooner it is done, the more heart muscle survives. Everything in this lesson is about saving minutes between your first contact with the patient and that balloon.',
          ],
          look: 'The heart is painted by artery. The pulsing purple area is muscle that is being lost while the artery stays shut. How much of it survives depends on how soon the artery is opened.',
          show: { heart: 'territories', camera: 'Front', rhythm: 'anterior-stemi' },
          more: ['pci-stent', 'cl-stemi-system'],
        },
        {
          title: 'The STEMI alert',
          text: [
            'A STEMI alert is an early warning to the hospital that a patient with a STEMI is on the way. The hospital calls in its cath lab team and clears a room before you arrive, instead of starting when you come through the door.',
            'It is set off by the 12-lead together with the patient: ST elevation that meets the rule, with symptoms that fit. Send the tracing and make the call as soon as the STEMI is recognized. Do not save it for the ambulance bay.',
          ],
          look: 'This is the tracing behind the alert, in the printout layout. The ST segments in V1 to V4, in the third and fourth columns, are lifted well above the baseline.',
          show: { ecg: 'ecg', layout: 'standard', heart: false },
          check: {
            kind: 'choice',
            question: 'When should the hospital first hear about a STEMI?',
            options: [
              'From the scene or early in transport, as soon as it is recognized',
              'On arrival, during the hand-off to the emergency team',
              'After a second 12-lead has confirmed the first one',
              'Once the pain has been treated and the patient is settled',
            ],
            answer: 0,
            explain: 'The alert is worth the most when it is early: the cath lab team needs time to come in and set up. Waiting for arrival, for a second tracing or for the pain to settle spends minutes the patient cannot get back. A second 12-lead is still useful. Send it as an update.',
          },
          roleNote: {
            1: 'You do not call a STEMI yourself. Transmit the 12-lead per protocol and report the patient. The paramedic, medical direction or the receiving physician reads it and calls the alert. Your early tracing is what makes their early alert possible.',
            2: 'Where your system allows it, you call the alert from the field on your own reading. Say it plainly: "STEMI alert", the wall, the age, the vital signs, the time of onset and your arrival time.',
          },
        },
        {
          title: 'The right hospital, not the nearest',
          text: [
            'A patient with a suspected STEMI goes straight to a hospital that can do PCI (a PCI-capable hospital, often called a STEMI receiving center), even when another hospital is closer, per your regional protocol.',
            'A stop at a hospital without a cath lab costs the patient a second ambulance trip and a great deal of heart muscle.',
            'If no PCI-capable hospital can be reached in time, the plan changes. A closer hospital can give a clot-dissolving drug (a fibrinolytic) and then send the patient on. Medical direction makes that call.',
          ],
          check: {
            kind: 'choice',
            question: 'A STEMI patient is 12 minutes from a hospital with no cath lab and 25 minutes from a PCI-capable hospital. Where do you go, under a typical regional protocol?',
            options: [
              'To the PCI-capable hospital, with a STEMI alert on the way',
              'To the nearest hospital, to be stabilized first',
              'To the nearest hospital, because the pain is severe',
              'To whichever hospital the patient has used before',
            ],
            answer: 0,
            explain: 'Thirteen extra minutes on the road are far less than the time lost by stopping at a hospital that then has to transfer the patient. Severe pain is a reason to reach the cath lab sooner, not to stop short of it. A STEMI is stabilized by opening the artery.',
          },
          roleNote: {
            1: 'The destination follows your protocol and medical direction. Your early 12-lead and report give them what they need to send you to the right place.',
            2: 'Passing a closer hospital is a protocol decision that rests on your reading of the 12-lead. If you are unsure, transmit and ask medical direction before you commit.',
          },
        },
        {
          title: 'The numbers the system is measured by',
          text: [
            'Three time targets from the 2025 ACC/AHA guideline run through this call. Each one starts at first medical contact (FMC), the moment you reach the patient.',
            'The 12-lead recorded and read: within 10 minutes of FMC. The artery opened by PCI: within 90 minutes of FMC when you take the patient straight to a PCI-capable hospital, and within 120 minutes when the patient has to be transferred from another hospital.',
            'If PCI cannot be done within 120 minutes and the symptoms began less than 12 hours ago, a fibrinolytic is given instead, unless there is a reason not to. Your scene time and your choice of destination are inside every one of these numbers.',
          ],
          check: {
            kind: 'choice',
            question: 'You reach a STEMI patient at 14:00 and take him straight to a PCI-capable hospital. By what time does the system aim to have the artery open?',
            options: ['14:10', '14:30', '15:30', '16:00'],
            answer: 2,
            fixed: true,
            explain: 'Ninety minutes from first medical contact: 15:30. The 10-minute mark, 14:10, is the target for the first 12-lead. 16:00 is the 120-minute limit that applies when a patient must be transferred from a hospital without a cath lab.',
          },
          more: ['cl-stemi-system'],
        },
        {
          title: 'On the way: watch, repeat, be ready',
          text: [
            'A heart attack changes by the minute. Keep the monitor on and the pads within reach, repeat the vital signs, and ask about the pain each time.',
            'Repeat the 12-lead when anything changes: pain that gets worse, eases or comes back, a new rhythm, a fall in pressure, and after treatment, per protocol. A first tracing that looked normal can show a STEMI minutes later. Put the time on every tracing and keep them in order.',
          ],
          look: 'A different patient, with an inferior heart attack, whose heart has suddenly slowed. The green number on the bar above the tracing reads about 40 a minute. A change like this calls for new vital signs and a new 12-lead.',
          show: { rhythm: 'inferior-stemi-chb', layout: 'simultaneous' },
          check: {
            kind: 'choice',
            question: 'Ten minutes from the hospital, the pain suddenly eases and the patient says he feels fine. What do you do?',
            options: [
              'Record new vital signs and a new 12-lead, and carry on as planned',
              'Cancel the STEMI alert and tell the hospital he has improved',
              'Divert to the nearest hospital, since the emergency is over',
              'Take the monitor off so that he can rest until arrival',
            ],
            answer: 0,
            explain: 'Pain can ease because the artery has opened for the moment or because a drug took effect, and the artery can block again at any time. He still needs the cath lab. A new 12-lead shows the hospital what changed and when. The alert, the destination and the monitor all stay.',
          },
          roleNote: {
            1: 'A sudden change in pulse, skin color or alertness: recheck the pulse and pressure, tell your partner or request ALS, and note the time.',
            2: 'A slow rate in an inferior STEMI is common, because the same artery usually feeds the AV node. Treat a slow rate that is causing symptoms per the bradycardia protocol, and send the new 12-lead.',
          },
          more: ['third-degree-av-block'],
        },
        {
          title: 'The hand-off',
          text: [
            'At the hospital the team has seconds to take in what you know, and the patient may go straight to the cath lab. Give the hand-off once, clearly, to the whole team, and hand over the paper as well.',
            'They need: the patient\'s name and age. When the symptoms started, to the minute if you can. Every 12-lead, with its time. Every drug, with dose and time, including aspirin taken before you arrived. The vital signs and what changed on the way. Allergies, blood thinners and erectile-dysfunction drugs.',
          ],
          look: 'A printout like this is part of what you hand over. On the real one, check that the patient\'s identity and the recording time are printed before it leaves your hands.',
          show: { rhythm: 'anterior-stemi', layout: 'standard' },
          check: {
            kind: 'choice',
            question: 'Which hand-off gives the cath lab team what it needs?',
            options: [
              '"Man, 62. Chest pressure since 13:40. 12-leads at 14:06 and 14:21, anterior ST elevation on both. Aspirin 324 mg at 14:08. Pressure 134/82, no change on the way."',
              '"Man, 62, anterior STEMI. He has had aspirin and the 12-leads are in the chart. Vital signs have been stable the whole way and he is comfortable now."',
              '"Chest pain since this afternoon. The ECG looked bad, so we called the alert from the scene. We gave the usual drugs and his pressure has held up well."',
              '"STEMI alert, male, about 60, with high blood pressure. Pain is 6 out of 10, down from 9 after treatment. Pressure is fine and oxygen is fine."',
            ],
            answer: 0,
            explain: 'The first report carries the times: onset, both tracings and the aspirin. Those times decide the treatment, and nobody else can supply them. The other three name the problem but leave the team to hunt for when it began, what was given and when.',
          },
          roleNote: {
            1: 'When you are the one handing over, give what you saw and did, with times. Leave the reading of the 12-lead to the tracing itself.',
            2: 'Add your reading, and what was held back and why: "no nitroglycerin, pressure 88", "V4R not recorded". That is part of the hand-off too.',
          },
        },
        {
          title: 'The whole call',
          text: [
            'From the first look to the hand-off, the call has one shape. Suspect the heart early, also when the story is not classic. Stop all effort, give aspirin, give oxygen only for a low saturation. Monitor on, pads close. A clean 12-lead within 10 minutes, transmitted.',
            'Hold nitroglycerin unless the pressure, the drug history and the right ventricle all allow it. Alert early, go to the hospital that can open the artery, and keep reassessing. Hand over the times: onset, tracings, drugs, changes.',
          ],
          look: 'This is the first patient\'s heart after the artery was opened in the cath lab. The pulsing purple area is gone: blood is reaching the front wall again.',
          show: { rhythm: 'anterior-stemi-reperfused', heart: 'external', camera: 'Front', ecg: false },
          check: {
            kind: 'tap',
            question: 'This patient\'s ST elevation was in V1 to V4. Tap the artery the cath lab opened.',
            targets: ['lad-proximal', 'lad-mid', 'lad-distal'],
            explain: 'V1 to V4 look at the front wall, and the front wall is fed by the left anterior descending artery (LAD). You did not open it. You recognized the call, gave aspirin, sent a clean 12-lead and chose the right hospital, and that is how it was opened in time.',
          },
          more: ['stemi-activation', 'chest-pain-acs', 'cl-stemi-system'],
        },
      ],
    },
  ],
};
