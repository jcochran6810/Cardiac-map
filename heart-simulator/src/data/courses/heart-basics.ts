import type { Course } from '@/types/course';

/**
 * Course: how the heart works — chambers, valves and the path of blood, one heartbeat, the coronary
 * arteries and the electrical system. No background needed; every later course builds on it.
 * Educational content only.
 */
export const HEART_BASICS: Course = {
  id: 'heart-basics',
  title: 'How the heart works',
  summary: 'The chambers and valves, the path blood takes, what happens in one heartbeat, the arteries that feed the heart and the wiring that fires it.',
  roles: [1, 2, 3, 4, 5],
  level: 'beginner',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'chambers',
      title: 'Four chambers, two pumps',
      goal: 'Name the four chambers, say what each one does and find them on the heart.',
      minutes: 5,
      steps: [
        {
          title: 'Where the heart sits',
          text: [
            'The heart is a muscle about the size of your fist. It sits behind the breastbone, between the lungs, tilted so that its point — the apex — aims down toward the left hip.',
            'Because of that tilt, the part closest to the front of the chest is mostly the right ventricle. The left ventricle is tucked around to the left and behind.',
          ],
          look: 'Drag the heart to turn it. The pointed tip at the bottom is the apex.',
          show: { heart: 'external', camera: 'Front', rhythm: 'normal-sinus' },
        },
        {
          title: 'Two pumps, side by side',
          text: [
            'The heart is two pumps that beat together. The right side takes in used, oxygen-poor blood from the body and sends it to the lungs. The left side takes in fresh, oxygen-rich blood from the lungs and sends it to the whole body.',
            'This heart has been cut open from the front so you can see inside. "Right" and "left" always mean the patient\'s right and left, so the right side of the heart is on your left.',
          ],
          look: 'Blue dots are oxygen-poor blood moving through the right side. Red dots are oxygen-rich blood moving through the left side.',
          show: { heart: 'sectioned', flow: true },
          check: {
            kind: 'choice',
            question: 'Which side of the heart pumps blood to the lungs?',
            options: ['The right side', 'The left side', 'Both sides', 'Neither — the lungs pull it in'],
            answer: 0,
            explain: 'The right side sends oxygen-poor blood to the lungs. The left side sends the oxygen-rich blood that comes back out to the body.',
          },
        },
        {
          title: 'The atria receive',
          text: [
            'Each pump has two chambers. The upper one is an atrium (two are called atria). Atria are thin-walled collecting chambers: blood arrives in them and waits for the ventricle below to open.',
            'The right atrium collects blood from the body. The left atrium collects blood from the lungs.',
          ],
          look: 'The right atrium is ringed on the heart.',
          show: { structure: 'right-atrium' },
          check: {
            kind: 'tap',
            question: 'Tap the left atrium on the heart.',
            targets: ['left-atrium'],
            explain: 'The left atrium is the upper chamber on the patient\'s left. It receives oxygen-rich blood from the lungs through the pulmonary veins.',
          },
        },
        {
          title: 'The ventricles pump',
          text: [
            'The lower chambers are the ventricles. They have thick, muscular walls and do the pumping.',
            'The left ventricle has the thickest wall of all — about three times thicker than the right. It has to push blood to the whole body against a pressure of about 120 mmHg. The right ventricle only pushes blood next door to the lungs, against about 25 mmHg.',
          ],
          look: 'Compare the wall of the left ventricle (ringed) with the thinner wall of the right ventricle beside it.',
          show: { structure: 'left-ventricle' },
          check: {
            kind: 'choice',
            question: 'Why is the wall of the left ventricle thicker than the right?',
            options: [
              'It pumps against a much higher pressure',
              'It holds much more blood',
              'It beats faster than the right ventricle',
              'It has to pump blood uphill to the lungs',
            ],
            answer: 0,
            explain: 'Both ventricles pump the same amount of blood with each beat, at the same rate. The left one works against roughly five times the pressure, so it needs more muscle.',
          },
        },
        {
          title: 'The septum: the wall between',
          text: [
            'A wall of muscle called the septum separates the right side from the left, so oxygen-poor and oxygen-rich blood never mix. The thick part between the two ventricles is the interventricular septum.',
            'The septum matters later on: the heart\'s electrical wiring runs down it, and a heart attack in the front of the heart often damages it.',
          ],
          show: { structure: 'interventricular-septum' },
          check: {
            kind: 'tap',
            question: 'Tap the right ventricle.',
            targets: ['right-ventricle'],
            explain: 'The right ventricle is the lower chamber on the patient\'s right, with the thinner wall. It pumps blood to the lungs.',
          },
          more: ['interventricular-septum'],
        },
        {
          title: 'Find them from the outside',
          text: [
            'Now the heart is closed again, as a surgeon would see it. The atria sit at the top and back, and the ventricles form the bulk of the heart below them.',
            'From the front, most of what you see is the right ventricle. The left ventricle forms the left border and the apex.',
          ],
          look: 'The name tags are switched off. Turn the heart if you need to.',
          show: { heart: 'external', camera: 'Front', labels: false },
          check: {
            kind: 'tap',
            question: 'Tap the left ventricle (the apex counts).',
            targets: ['left-ventricle', 'apex'],
            explain: 'The left ventricle forms the left side of the heart and its tip, the apex. That is where you feel the heartbeat on the chest wall.',
          },
          more: ['left-ventricle', 'right-ventricle', 'apex'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'blood-path',
      title: 'Valves and the path of blood',
      goal: 'Trace a drop of blood through the heart and name the four valves it passes.',
      minutes: 6,
      steps: [
        {
          title: 'Four one-way doors',
          text: [
            'Blood moves through the heart in one direction only. Four valves make sure of it: each one opens to let blood forward and shuts to stop it leaking back.',
            'Two valves sit between an atrium and its ventricle (the tricuspid on the right, the mitral on the left). Two sit at the exits of the ventricles (the pulmonary valve and the aortic valve).',
          ],
          look: 'Follow the dots: they only ever move forward.',
          show: { heart: 'sectioned', flow: true, rhythm: 'normal-sinus' },
        },
        {
          title: 'From the body into the right heart',
          text: [
            'Oxygen-poor blood returns from the body in two large veins: the superior vena cava from the head and arms, and the inferior vena cava from everything below.',
            'Both empty into the right atrium. From there blood passes through the tricuspid valve into the right ventricle.',
          ],
          look: 'The tricuspid valve is ringed. Blue dots pass through it each time the ventricle relaxes.',
          show: { structure: 'tricuspid-valve' },
          check: {
            kind: 'tap',
            question: 'Tap the vein that brings blood back from the head and arms.',
            targets: ['svc'],
            explain: 'The superior vena cava (SVC) drains the head, neck and arms into the top of the right atrium.',
          },
        },
        {
          title: 'Out to the lungs',
          text: [
            'When the right ventricle squeezes, the tricuspid valve shuts and the pulmonary valve opens. Blood leaves through the pulmonary trunk and its branches to the lungs, where it drops off carbon dioxide and picks up oxygen.',
            'The pulmonary arteries are the only arteries that carry oxygen-poor blood. An artery is any vessel that carries blood away from the heart.',
          ],
          look: 'The pulmonary trunk is ringed: the large vessel leaving the right ventricle.',
          show: { structure: 'pulmonary-trunk' },
        },
        {
          title: 'Back from the lungs into the left heart',
          text: [
            'Oxygen-rich blood returns from the lungs in the pulmonary veins, which empty into the left atrium.',
            'From the left atrium blood passes through the mitral valve into the left ventricle. The mitral valve is the only valve with two leaflets; the other three have three.',
          ],
          look: 'The mitral valve is ringed. Red dots pass through it as the ventricle fills.',
          show: { structure: 'mitral-valve' },
          check: {
            kind: 'choice',
            question: 'Which valve does blood pass between the left atrium and the left ventricle?',
            options: ['Mitral valve', 'Tricuspid valve', 'Aortic valve', 'Pulmonary valve'],
            answer: 0,
            explain: 'The mitral valve is on the left, between the left atrium and left ventricle. The tricuspid is its partner on the right.',
          },
        },
        {
          title: 'Out to the body',
          text: [
            'When the left ventricle squeezes, the mitral valve shuts and the aortic valve opens. Blood is driven into the aorta, the largest artery in the body, and on to every organ.',
            'The very first branches of the aorta, just above the aortic valve, are the coronary arteries. The heart feeds itself first.',
          ],
          look: 'The aortic valve is ringed, at the exit of the left ventricle.',
          show: { structure: 'aortic-valve' },
          check: {
            kind: 'tap',
            question: 'Tap the aorta.',
            targets: ['ascending-aorta', 'aortic-arch'],
            explain: 'The aorta rises from the left ventricle just beyond the aortic valve. A narrowed aortic valve (aortic stenosis) makes the ventricle work much harder to fill it.',
          },
        },
        {
          title: 'Cords that hold the valves shut',
          text: [
            'The mitral and tricuspid valves are held by thin, strong cords called chordae tendineae. The cords are anchored to small pillars of muscle in the ventricle wall, the papillary muscles.',
            'When the ventricle squeezes, the papillary muscles pull on the cords and stop the leaflets from flipping back into the atrium. If a papillary muscle tears — it can happen a few days after a heart attack — the valve suddenly leaks badly.',
          ],
          look: 'The chordae are ringed: fine white cords between the mitral valve and the ventricle wall.',
          show: { structure: 'chordae-tendineae' },
          more: ['chordae-tendineae', 'anterolateral-papillary-muscle', 'mitral-regurgitation'],
        },
        {
          title: 'Put it in order',
          text: [
            'That is the whole circuit: body → right atrium → right ventricle → lungs → left atrium → left ventricle → body.',
            'Both sides fill and squeeze at the same time, so with each beat the right side sends one stroke of blood to the lungs while the left side sends the same amount to the body.',
          ],
          show: { structure: null },
          check: {
            kind: 'choice',
            question: 'Blood returning from the body passes through these in which order?',
            options: [
              'Right atrium → tricuspid valve → right ventricle → pulmonary valve',
              'Right atrium → mitral valve → right ventricle → aortic valve',
              'Left atrium → tricuspid valve → left ventricle → pulmonary valve',
              'Right ventricle → tricuspid valve → right atrium → pulmonary valve',
            ],
            answer: 0,
            explain: 'Right atrium, through the tricuspid valve, into the right ventricle, then out through the pulmonary valve to the lungs. The mitral and aortic valves belong to the left side.',
          },
          more: ['tricuspid-valve', 'pulmonary-valve', 'mitral-valve', 'aortic-valve'],
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'cardiac-cycle',
      title: 'One heartbeat, step by step',
      goal: 'Describe filling and ejection, say what makes the "lub" and the "dub", and find them on a pressure tracing.',
      minutes: 7,
      steps: [
        {
          title: 'Fill, then squeeze',
          text: [
            'Every heartbeat has two parts. In diastole the ventricles relax and fill with blood. In systole they squeeze and push it out.',
            'At a resting heart rate about two-thirds of each beat is diastole. That matters: the heart muscle gets its own blood supply mainly while it is relaxed.',
          ],
          look: 'The heart is slowed to a quarter of its real speed. The Cardiac cycle box on the heart names the phase and shows which valves are open.',
          show: { heart: 'sectioned', flow: true, speed: 0.25, rhythm: 'normal-sinus', hr: 70 },
        },
        {
          title: 'Filling',
          text: [
            'As the ventricles relax, the pressure inside them falls below the pressure in the atria. The mitral and tricuspid valves swing open and blood pours in.',
            'Most filling is passive and happens early, in the first third of diastole. The aortic and pulmonary valves stay shut, so nothing leaks back from the arteries.',
          ],
          look: 'Watch the dots cross the mitral and tricuspid valves while the box says "filling".',
          show: { structure: 'mitral-valve' },
        },
        {
          title: 'The atrial kick',
          text: [
            'At the end of diastole the atria squeeze and top up the ventricles. This "atrial kick" adds roughly 20–30% to the filling at rest.',
            'A healthy heart can manage without it. A stiff or failing heart, or one beating very fast, depends on it — which is one reason atrial fibrillation (no atrial squeeze at all) can make such a patient suddenly worse.',
          ],
          look: 'On the tracing below, each small P wave is followed by a glow across the atria, and then they squeeze.',
          show: { ecg: 'ecg', layout: 'monitor', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Which rhythm loses the atrial kick completely?',
            options: ['Atrial fibrillation', 'Sinus tachycardia', 'Sinus bradycardia', 'Normal sinus rhythm'],
            answer: 0,
            explain: 'In atrial fibrillation the atria quiver instead of squeezing, so the ventricles get only passive filling.',
          },
        },
        {
          title: 'The valves shut: "lub"',
          text: [
            'The electrical signal reaches the ventricles (the QRS on the ECG) and they start to squeeze. Pressure rises above the atrial pressure and the mitral and tricuspid valves snap shut. That is the first heart sound, S1 — the "lub".',
            'For a brief moment all four valves are closed. The ventricle tightens around a fixed volume of blood and the pressure climbs steeply. This is isovolumetric contraction.',
          ],
          look: 'Just after each QRS the box shows all valves closed and "S1" lights up.',
          show: { structure: null },
        },
        {
          title: 'Ejection',
          text: [
            'As soon as the pressure in the left ventricle rises above the pressure in the aorta, the aortic valve opens and blood is ejected. The same happens on the right through the pulmonary valve.',
            'A healthy ventricle holds about 120 mL when full and ejects about 70 mL — the stroke volume. The fraction ejected, 55–70%, is the ejection fraction (EF).',
          ],
          look: 'Red dots leave through the aortic valve while the box says "ejection".',
          show: { structure: 'aortic-valve' },
          check: {
            kind: 'choice',
            question: 'A ventricle fills to 120 mL and ejects 72 mL. What is its ejection fraction?',
            options: ['40%', '48%', '60%', '72%'],
            answer: 2,
            fixed: true,
            explain: '72 ÷ 120 = 0.60, so the EF is 60% — normal. Below 40% is reduced.',
          },
        },
        {
          title: 'The valves shut again: "dub"',
          text: [
            'The ventricles relax, and their pressure falls below the pressure in the arteries. The aortic and pulmonary valves close. That is the second heart sound, S2 — the "dub".',
            'Again all four valves are closed for a moment (isovolumetric relaxation). Then the pressure drops below atrial pressure, the mitral and tricuspid valves open, and filling starts again.',
          ],
          look: '"S2" lights up as ejection ends. Systole is the gap between S1 and S2; diastole is the longer gap between S2 and the next S1.',
          show: { structure: null },
          check: {
            kind: 'choice',
            question: 'What makes the first heart sound (S1, the "lub")?',
            options: [
              'The mitral and tricuspid valves closing',
              'The aortic and pulmonary valves closing',
              'The aortic valve opening',
              'Blood rushing into the ventricles',
            ],
            answer: 0,
            explain: 'S1 is the mitral and tricuspid valves closing at the start of systole. S2 is the aortic and pulmonary valves closing at the end of it.',
          },
        },
        {
          title: 'The same beat as pressures',
          text: [
            'This chart — the Wiggers diagram — draws the same heartbeat as pressures. Yellow is the pressure in the left ventricle, red is the pressure in the aorta and blue is the pressure in the left atrium. Below are the volume of the left ventricle and the heart sounds.',
            'Each valve opens or closes exactly where two pressure lines cross. The dashed lines mark them: MC (mitral closes), AO (aortic opens), AC (aortic closes), MO (mitral opens).',
          ],
          look: 'Find the point where the yellow line climbs through the red line: that is the aortic valve opening.',
          show: { ecg: 'wiggers', heart: false, speed: 0.5 },
          check: {
            kind: 'choice',
            question: 'On the chart, the aortic valve opens when…',
            options: [
              'left ventricular pressure rises above aortic pressure',
              'left atrial pressure rises above ventricular pressure',
              'aortic pressure reaches its peak',
              'the P wave appears on the ECG',
            ],
            answer: 0,
            explain: 'A valve opens when the pressure behind it exceeds the pressure in front of it. For the aortic valve that is when the ventricle\'s pressure passes the aorta\'s (the diastolic blood pressure, about 80 mmHg).',
          },
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'coronaries',
      title: 'The arteries that feed the heart',
      goal: 'Name the three main coronary arteries and the part of the heart each one supplies.',
      minutes: 6,
      steps: [
        {
          title: 'The heart feeds itself first',
          text: [
            'The heart muscle cannot take oxygen from the blood inside its chambers. It is fed by its own arteries, the coronary arteries, which leave the aorta just above the aortic valve and run over the surface of the heart.',
            'The left ventricle is squeezed so hard in systole that its arteries fill mainly in diastole. A fast heart rate shortens diastole — less time to be fed — just when the muscle is working hardest.',
          ],
          look: 'The pale vessels running over the surface are the coronary arteries.',
          show: { heart: 'external', camera: 'Front', rhythm: 'normal-sinus' },
        },
        {
          title: 'The left main and the LAD',
          text: [
            'The left coronary artery starts as a short trunk, the left main. It divides into two: the left anterior descending artery (LAD) and the circumflex.',
            'The LAD runs down the front of the heart in the groove between the two ventricles, all the way to the apex. It feeds the front wall of the left ventricle, the front two-thirds of the septum and the apex — more heart muscle than any other artery.',
          ],
          look: 'The start of the LAD is ringed. Follow it down the front of the heart toward the apex.',
          show: { structure: 'lad-proximal' },
          check: {
            kind: 'choice',
            question: 'The left main coronary artery divides into which two arteries?',
            options: [
              'The LAD and the circumflex',
              'The LAD and the right coronary artery',
              'The circumflex and the right coronary artery',
              'The right coronary artery and the posterior descending artery',
            ],
            answer: 0,
            explain: 'Left main → LAD + circumflex. A blockage of the left main therefore threatens most of the left ventricle at once.',
          },
        },
        {
          title: 'The circumflex',
          text: [
            'The circumflex (LCx) turns left and wraps around the heart in the groove between the left atrium and left ventricle.',
            'It feeds the side (lateral) wall and part of the back of the left ventricle through branches called obtuse marginals.',
          ],
          look: 'The view has turned to the patient\'s left side. The start of the circumflex is ringed.',
          show: { structure: 'lcx-proximal' },
        },
        {
          title: 'The right coronary artery',
          text: [
            'The right coronary artery (RCA) runs in the groove between the right atrium and right ventricle, around to the underside of the heart.',
            'It feeds the right ventricle and, in about 8 out of 10 people, the bottom (inferior) wall of the left ventricle. It also usually feeds the heart\'s two electrical nodes — the SA node in about 6 of 10 people and the AV node in about 8 or 9 of 10.',
            'That is why a heart attack from a blocked RCA often comes with a slow heart rate or heart block.',
          ],
          look: 'The start of the RCA is ringed, on the patient\'s right side of the heart.',
          show: { structure: 'rca-proximal' },
          more: ['rca-proximal', 'av-nodal-artery', 'sa-nodal-artery'],
        },
        {
          title: 'Three arteries, three territories',
          text: [
            'Here the surface is painted by the artery that feeds it: green for the LAD (front wall, septum, apex), blue for the circumflex (side wall), orange for the RCA (right ventricle and inferior wall).',
            'When one artery blocks, its territory is the part that is injured — and each territory shows up in its own group of ECG leads. You will use this map again in the heart attack course.',
          ],
          look: 'Turn the heart to see all three colours. The round "bull\'s-eye" map shows the same territories as a target.',
          show: { heart: 'territories', camera: 'Front' },
          check: {
            kind: 'choice',
            question: 'A blocked LAD threatens which part of the heart?',
            options: [
              'The front wall, the septum and the apex',
              'The right ventricle and the inferior wall',
              'The side wall only',
              'The right atrium and SA node',
            ],
            answer: 0,
            explain: 'The LAD feeds the front (anterior) wall of the left ventricle, the front two-thirds of the septum and the apex.',
          },
        },
        {
          title: 'Check yourself',
          text: [
            'One more. In most people the same artery feeds the inferior wall of the left ventricle and the AV node, so trouble in that artery often shows as a slow heart rate.',
          ],
          look: 'Tap any segment of the artery on the heart or its name tag.',
          show: { heart: 'territories', camera: 'Front' },
          check: {
            kind: 'tap',
            question: 'Tap the artery that usually supplies the AV node.',
            targets: ['rca-proximal', 'rca-mid', 'rca-distal', 'pda', 'posterolateral-branch', 'am-branch'],
            explain: 'The right coronary artery supplies the AV node in about 80–90% of people. Inferior heart attacks from the RCA often cause bradycardia and AV block.',
          },
          more: ['lmca', 'lad-proximal', 'lcx-proximal', 'rca-proximal'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'conduction',
      title: 'The wiring that fires it',
      goal: 'Follow the electrical signal from the SA node to the ventricles and say what takes over if it fails.',
      minutes: 6,
      steps: [
        {
          title: 'Electricity first, squeeze second',
          text: [
            'Heart muscle only squeezes after an electrical signal has passed through it. Every beat starts as electricity and becomes a squeeze a split second later.',
            'The ECG records the electricity, not the squeeze. A heart can show an organized rhythm on the monitor and still pump nothing — always check the patient for a pulse.',
          ],
          look: 'The heart is see-through and slowed down. The glowing track is the wiring that carries each signal.',
          show: { heart: 'conduction', ecg: 'ecg', layout: 'monitor', speed: 0.25, rhythm: 'normal-sinus', hr: 70, focus: 'heart' },
        },
        {
          title: 'The SA node: the pacemaker',
          text: [
            'Each normal beat starts in the sinoatrial (SA) node, a small patch of special cells at the top of the right atrium, near where the superior vena cava enters.',
            'The SA node fires by itself 60–100 times a minute at rest. Its signal spreads across both atria, which draws the P wave on the ECG, and the atria squeeze.',
          ],
          look: 'The SA node is ringed. Each beat lights it first, then the signal fans out across the atria.',
          show: { structure: 'sa-node' },
        },
        {
          title: 'The AV node: the gatekeeper',
          text: [
            'The atria and ventricles are electrically insulated from each other. The only way through is the atrioventricular (AV) node, low in the wall between the atria.',
            'The AV node holds the signal for about a tenth of a second. That pause gives the atria time to finish topping up the ventricles, and it draws the flat part of the PR interval on the ECG. The AV node also limits how many signals get through — a safety brake when the atria fire far too fast.',
          ],
          look: 'The AV node is ringed. Watch the signal pause there before it moves on.',
          show: { structure: 'av-node' },
          check: {
            kind: 'choice',
            question: 'What does the pause at the AV node allow?',
            options: [
              'The ventricles to finish filling before they squeeze',
              'The atria to relax before they are refilled',
              'The SA node to recharge',
              'The coronary arteries to fill',
            ],
            answer: 0,
            explain: 'The delay lets the atrial squeeze finish filling the ventricles before the ventricles are told to contract.',
          },
        },
        {
          title: 'The bundle of His and its branches',
          text: [
            'Below the AV node the signal enters a fast lane: the bundle of His, which splits into a right bundle branch and a left bundle branch running down each side of the septum.',
            'Because the fast lane reaches both ventricles almost at the same moment, the QRS on the ECG is narrow — less than 0.12 seconds (3 small boxes). If one branch is blocked, that ventricle is reached late, the slow way through muscle, and the QRS becomes wide.',
          ],
          look: 'The bundle of His is ringed. The signal races down both bundle branches in the septum.',
          show: { structure: 'bundle-of-his' },
          more: ['bundle-of-his', 'right-bundle-branch-block', 'left-bundle-branch-block'],
        },
        {
          title: 'The Purkinje fibers',
          text: [
            'The bundle branches end in a fine network, the Purkinje fibers, that spreads the signal through the inner walls of both ventricles within a few hundredths of a second.',
            'The ventricles are activated from the septum and apex upward, so the squeeze wrings blood from the tip of the heart toward the valves at the top — like squeezing toothpaste from the bottom of the tube.',
          ],
          look: 'The Purkinje network is ringed, fanning out across the lower ventricles.',
          show: { structure: 'purkinje-fibers' },
          check: {
            kind: 'tap',
            question: 'Tap the AV node.',
            targets: ['av-node'],
            explain: 'The AV node sits low in the wall between the atria, just above the ventricles — the single electrical gateway between the two.',
          },
        },
        {
          title: 'Backup pacemakers',
          text: [
            'If the SA node fails or its signal is blocked, lower parts of the wiring can start the beats themselves — but each one is slower: the SA node fires at 60–100 a minute, the AV junction at 40–60 and the ventricles at only 20–40.',
            'This is complete heart block: no signal crosses the AV node. The atria keep their own pace while a backup pacemaker lower down drives the ventricles, slowly.',
          ],
          look: 'The atria (P waves) and the ventricles (wide QRS complexes) now fire independently. The red × on the wiring marks the block.',
          show: { rhythm: 'third-degree-avb', speed: 0.5 },
          check: {
            kind: 'choice',
            question: 'A backup pacemaker in the ventricles usually fires at about…',
            options: ['20–40 a minute', '40–60 a minute', '60–100 a minute', '100–150 a minute'],
            answer: 0,
            fixed: true,
            explain: 'SA node 60–100, AV junction 40–60, ventricles 20–40. The lower the backup, the slower and less reliable it is.',
          },
          more: ['sa-node', 'av-node', 'third-degree-av-block'],
        },
      ],
    },
  ],
};
