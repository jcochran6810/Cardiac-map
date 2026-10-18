# CardioSim

An interactive cardiac teaching simulator: a 3D heart, a live 12-lead ECG and a
pressure–volume (Wiggers) model that all run from **one shared clock**, so the
P wave, atrial contraction, valve clicks, pressures and the 3D heartbeat stay in
step — plus a **case simulator** where you treat a patient and get a scored review.

## Three screens

| Screen | What it is |
| --- | --- |
| **Home** | The start page: pick your role, then jump straight to the simulator, the 3D heart, conditions, the 12-lead, the electrode lab, drug cards, procedures, the defibrillator, pressure–volume, the quiz or the tutor. |
| **Learn** | The workspace: the 3D heart with the ECG dock below. **Library** (top left) lists anatomy, conditions, drugs, procedures and case studies; **Info** (top right) explains what you picked, with **← Back** to the item before. Tapping the heart with the info panel closed shows a short card with **Read more**. First-time tips explain tapping the heart and the leads. |
| **Simulator** | Treat a patient case from first contact to hand-off (below). |

Tablets and desktops switch screens with the tabs in the top bar; phones have a bottom tab bar
(Home · Learn · Simulator · Quiz · Tutor). Opening any library item (search, chips, tutor, quiz) goes to Learn.

**The phone's Back button stays inside the app** (`src/lib/backNav.ts`): every page — the screen, the item
open in the info panel, the Library / Info drawers on small screens, the electrode lab, quiz / tutor / help,
and the simulator's case list → case → action list → review — is a browser history entry. Back returns to
the previous page; closing something with its own button steps over its entry, so Back never stalls;
leaving a case in progress asks first; on Home the first Back says "press Back again to leave". The info
panel's **← Back** is the same button.

## Case simulator

`src/lib/sim/scenario/` (engine, interventions, scenarios) · `src/store/useSimStore.ts` · `src/components/simulator/`

- **Every action in your scope is offered — right or wrong** (`interventions.ts`: ~130 actions tagged by role
  and setting, including the cath lab's views, catheters, guides, wires, balloons, stents, support devices,
  physiology and imaging, and lab drugs). Each one takes case time and changes the patient: the rhythm on the monitor and the live
  12-lead, the vitals, and the story (patient, partner, team, monitor, hospital).
- **The monitor starts unplugged**: the ECG, SpO₂ and capnography appear only once you attach them; the
  NIBP box shows the last blood pressure you took. Nothing reads the tracings for you: the monitor reports
  numbers, and rhythm changes come as a "monitor alarm".
- **You read every 12-lead, and your FTO checks it** (`reads.ts`): after a paramedic, tech, nurse or
  cardiologist records a 12-lead, the case waits for their read, chosen from every interpretation the app
  can show (43, in four groups). The FTO — the preceptor in the cath lab — answers at once: correct, partly
  right or not quite, with the explanation of the tracing. A misread costs 5 points (2 if partly right) and
  the review lists every read. EMTs acquire and transmit without reading.
- **In the cath lab you read more than the 12-lead:** pressures (a damped guide, LVEDP, right heart numbers
  in shock or RV infarction), FFR, stent sizing from QCA / IVUS, sudden changes (reperfusion reflex, radial
  spasm, perforation, tamponade, contrast reaction) and — once real images are in the app — angiograms.
- **The cath lab works as a team** (`labKit.ts`): as the **tech**, the (computer) cardiologist asks for each
  catheter, guide, view, wire, balloon and stent and waits for the right one — a wrong one gets a word and
  costs points, one opened ahead of the request counts; as the **nurse**, the cardiologist orders drugs and
  you choose them (e.g. "something for the rate" → atropine, the hyperaemia dose of adenosine, IV cangrelor
  in shock); as the **cardiologist**, every choice is yours. The monitor shows the live arterial pressure
  (ART) once the sheath is in and the transducers are zeroed, and an **Imaging** tab lists every cine run
  with a C-arm diagram, its angles and what the view shows best (and the real angiogram when the app has one
  — `src/data/cathImages.ts`).
- **Events happen on time or because of what you did** (VF en route, heart block, a wedged catheter,
  reperfusion VF), built-in safety rules catch dangerous choices (shocking a patient with a pulse, arrest-dose
  epinephrine with a pulse, …), and teammates do the other roles' jobs in the cath lab.
- **The case ends by itself** once every critical step for your role is done (or the patient dies, or you end
  it). The review shows the score and grade, what to fix (harmful choices, missed and late steps — late
  counts half), what went well, your times against the goals and the teaching points. A **Hint** names the
  next critical step for 2 points. Best scores are kept on the device.
- **Cases:** field — anterior STEMI (EMT, paramedic) · inferior STEMI with RV infarction and heart block (EMT,
  paramedic) · complete heart block · unstable SVT · VF cardiac arrest (EMT, paramedic). Cath lab (tech, nurse,
  cardiologist) — anterior STEMI (damped guide, reperfusion VF) · inferior STEMI from the groin (Bezold–Jarisch
  reflex) · FFR- and IVUS-guided PCI (radial spasm) · cardiogenic shock (right heart numbers, Impella) ·
  coronary perforation and tamponade · contrast reaction. Tests play every case's ideal run for each role
  and its main traps (`tests/scenarios.test.ts`).
- The engine is pure and deterministic (`engine.ts`: `start`, `perform`, `takeHint`, `stop`, `review`), so a new
  case is one file in `scenarios/` plus a line in `scenarios/index.ts` and an ideal run in the tests.

## Cath lab catalog

`src/data/content/cathlab*.ts` (content) · `src/lib/cathlab/views.ts` (view angles) · Library → **Cath lab** tab

About 75 items in eleven groups — angiographic views, access and closure, catheters and guides, wires,
balloons and stents, physiology and intravascular imaging, mechanical support and pacing, pressures and
hemodynamics, lab drugs, complications, team and safety. Each item says what it is, the numbers to know,
pearls and pitfalls, and **what the tech, the nurse and the cardiologist each do with it** (your own role is
highlighted). A view shows the C-arm position, turns the 3D heart to that angle and lights up the arteries it
shows best. Each item links to the simulator cases that use it ("Practise it"). The simulator's case list
points lab roles to the catalog first. Real angiogram / fluoroscopy images plug in through
`src/data/cathImages.ts` (each item already describes the image it wants); a test checks every link, every
simulator action and every standard view is covered (`tests/cathlab-catalog.test.ts`).

## Roles and scope of practice

Pick a role in the top bar; all guidance, recommended tabs, quiz questions, case decisions and
monitor/defibrillator permissions stay inside that role's scope (`src/lib/scope.ts`):

| Role | Scope framework |
| --- | --- |
| EMT (NREMT, BLS) | National EMS Scope of Practice Model 2019 (NHTSA) + state/local protocols and medical direction |
| Paramedic (NREMT, ALS) | National EMS Scope of Practice Model 2019 (NHTSA) + state/local protocols and medical direction |
| Cath Lab Tech (RCIS) | RCIS credential, SCAI best-practices consensus (2021), state law and facility policy |
| Cath Lab Nurse (RN) | State Nurse Practice Act, Board of Nursing rulings and facility policy |
| Cardiologist | Licensure and hospital privileges — full technical depth |

## Run it

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build && npm start   # production build
```

Checks (run before committing — `npm run check` runs all four):

```bash
npm run typecheck  # TypeScript
npm run lint       # ESLint (next lint)
npm test           # Vitest unit tests in tests/ — ECG lead maths, electrodes, rhythms, engine, hemodynamics, anatomy, scope
npm run build      # production build
```

Working with AI agents: the repo root has `CLAUDE.md` (the start/end-session protocol; Claude Code is
the lead), `AGENTS.md` (Codex, the UI / graphics agent), `fix_list.md` (open items, owner actions and
"For Codex" priorities) and `SESSION_LOG.md` (what each session shipped). Production is the
`main` branch ("end session" merges into it), live at https://cardiacmap.stationinsight.com.

## What's inside

| Area | Where | Notes |
| --- | --- | --- |
| ECG engine | `src/lib/ecg/` | Vector (dipole) model projected onto all 12 leads + right-sided/posterior leads, so axis, reciprocal ST change and R-wave progression come out of the physics rather than being drawn per lead. 49 rhythm/condition profiles (incl. PEA, pulseless VT, transcutaneous pacing, inferior STEMI with heart block and reperfused STEMI), Fridericia QTc. |
| Hemodynamics | `src/lib/physiology/hemodynamics.ts` | Beat-by-beat LV/aortic/LA pressure, LV volume and heart sounds (Frank–Starling filling, atrial kick, Windkessel aorta). Drives the Wiggers chart and PV loop. |
| Simulation clock | `src/lib/sim/simulation.ts`, `src/components/sim/SimulationDriver.tsx` | Single animation loop; pause, scrub and 0.1–1× speed. |
| 3D heart | `src/components/scene/` | Exterior, four-chamber section with blood flow, x-ray, conduction system and coronary territories. Contraction, depolarization wave and ischemia are shaded on the GPU from the live ECG. Selecting a lead (12-lead or electrode lab) draws its view line: from the (+) side, into the wall it faces and through the heart. |
| Anatomy map | `src/lib/anatomy/landmarks.ts` | Landmarks snapped to the model surface; clicking the heart opens the matching structure. |
| Teaching content | `src/data/content/`, `src/data/caseData.ts` | 62 structures, 42 conditions, 42 procedures, 38 medications, 9 branching cases, 66 quiz questions. Loaded on demand. |
| UI | `src/components/layout/`, `src/components/ecg/`, `src/components/physiology/` | Navigator, info panel, ECG (live 12-lead, printout, monitor, paper, inspect, calipers), Wiggers/PV loop, tutor, quiz. |
| Electrode lab | `src/lib/ecg/electrodes.ts`, `src/lib/ecg/leadViews.ts`, `src/lib/anatomy/humanBody.ts`, `src/components/ecg/ElectrodeLab.tsx`, `src/components/ecg/TorsoModel.tsx` | 10 electrodes on a 3D patient (an adult male body built from the CC0 MakeHuman mesh by `scripts/build-human-model.py`; limb electrodes on the shoulders and lower abdomen, Mason–Likar; the heart beats behind a window in the chest) → 12 leads (Einthoven / Goldberger / Wilson). Tap a lead or an electrode to see where that lead looks from; swap cables or try a "mystery reversal" and watch the live 12-lead change. |
| Activation map | `src/lib/anatomy/activation.ts` | Epicardial isochronal map of each beat (normal per Durrer 1970, LBBB, RBBB, WPW, pacing, PVC/VT), like an EP mapping system. The 3D wavefront follows it in every view. |
| Coronary territories | `src/lib/anatomy/aha17.ts`, `src/components/anatomy/Bullseye.tsx` | AHA 17-segment bull's-eye linked to the culprit artery; the angio panel shows the C-arm angle (LAO/RAO, CRA/CAU) of any view. |
| Monitor / defibrillator trainer | `src/lib/sim/defib.ts`, `src/components/monitor/` | Generic monitor with ECG, SpO₂ pleth, capnography and NIBP. Includes AED, manual defibrillation, synchronised cardioversion, transcutaneous pacing, CPR, ACLS drugs, a code record, scenarios, and trainee/instructor modes. Press **Projector** to mirror it at `/monitor` on a second screen. |

## Phones, tablets and desktops

The layout adapts to the screen (`src/lib/device.ts`, Tailwind `phone:` / `touch:` / `short:` variants):

| Screen | Layout |
| --- | --- |
| Desktop / laptop (≥ 1024 px) | Navigator, info panel, 3D heart and ECG dock side by side; drag the dividers to resize |
| Tablet | Navigator and info panel slide over the heart (tap outside to close); rarer ECG options under **More** |
| Phone, upright | Bottom tab bar (Home · Learn · Simulator · Quiz · Tutor); compact top bar with **Library**, role, search and **Info**; ECG / Wiggers / Defibrillator tabs; interpretation slides over the tracing; the electrode lab and the defibrillator enlarge the dock; in the simulator one button opens the action list |
| Phone, on its side | Heart and ECG dock side by side; the simulator shows the patient and the action list side by side |

On touch screens buttons get bigger, the ECG dock has a grip bar and an enlarge (⤢) button, a double-tap on
a lead inspects it, and Help lists the touch gestures.

## Install as an app (PWA)

CardioSim installs like a native app and keeps working offline after the first visit.

- **Android / Chrome / Edge:** tap **Install** (banner, navigator panel, Help, or the browser menu → *Install app*).
- **iPhone / iPad:** in Safari tap **Share → Add to Home Screen** (the app shows these steps when you tap Install).
- **Desktop:** the **Install** button in the top bar, or the install icon in the address bar.

Pieces: `public/manifest.webmanifest` (name, colours, icons, install screenshots), `public/sw.js` (offline cache:
pages network-first, build files and 3D models cache-first, one cache per release), `src/lib/pwa.ts` +
`src/components/ui/InstallApp.tsx` (registration and install buttons). Icons in `public/icons/`, `app/icon.png`
and `app/apple-icon.png` are generated from `assets/logo-source.webp`.

## Keyboard shortcuts

`Space` play/pause · `←/→` step · `[ ]` speed · `1–6` 3D view · `L` labels ·
`F` blood flow · `V` ECG vector · `E` ECG/Wiggers · `M` defibrillator · `Q` quiz ·
`T` tutor · `/` search · `?` help · `Esc` close. (The 3D and ECG keys work in Learn only.)

## Credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the open-source projects and publications
used to check accuracy, and for their licences.

## Accuracy note

Content was written and then reviewed against current AHA/ACC, ESC and ACLS
guidance. It is a teaching aid, not a clinical reference — always follow local
protocols and current guidelines for patient care.
