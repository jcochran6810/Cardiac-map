# CardioSim

An interactive cardiac teaching simulator: a 3D heart, a live 12-lead ECG and a
pressure–volume (Wiggers) model that all run from **one shared clock**, so the
P wave, atrial contraction, valve clicks, pressures and the 3D heartbeat stay in
step.

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
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production build
```

## What's inside

| Area | Where | Notes |
| --- | --- | --- |
| ECG engine | `src/lib/ecg/` | Vector (dipole) model projected onto all 12 leads + right-sided/posterior leads, so axis, reciprocal ST change and R-wave progression come out of the physics rather than being drawn per lead. 46 rhythm/condition profiles (incl. PEA, pulseless VT, transcutaneous pacing), Fridericia QTc. |
| Hemodynamics | `src/lib/physiology/hemodynamics.ts` | Beat-by-beat LV/aortic/LA pressure, LV volume and heart sounds (Frank–Starling filling, atrial kick, Windkessel aorta). Drives the Wiggers chart and PV loop. |
| Simulation clock | `src/lib/sim/simulation.ts`, `src/components/sim/SimulationDriver.tsx` | Single animation loop; pause, scrub and 0.1–1× speed. |
| 3D heart | `src/components/scene/` | Exterior, four-chamber section with blood flow, x-ray, conduction system and coronary territories. Contraction, depolarization wave and ischemia are shaded on the GPU from the live ECG. |
| Anatomy map | `src/lib/anatomy/landmarks.ts` | Landmarks snapped to the model surface; clicking the heart opens the matching structure. |
| Teaching content | `src/data/content/`, `src/data/caseData.ts` | 62 structures, 42 conditions, 42 procedures, 38 medications, 9 branching cases, 66 quiz questions. Loaded on demand. |
| UI | `src/components/layout/`, `src/components/ecg/`, `src/components/physiology/` | Navigator, info panel, ECG (12-lead, monitor, paper, inspect, calipers), Wiggers/PV loop, tutor, quiz. |
| Electrode lab | `src/lib/ecg/electrodes.ts`, `src/components/ecg/ElectrodeLab.tsx` | 10 electrodes → 12 leads (Einthoven / Goldberger / Wilson). Swap cables or try a "mystery reversal" and watch the live 12-lead change. |
| Activation map | `src/lib/anatomy/activation.ts` | Epicardial isochronal map of each beat (normal per Durrer 1970, LBBB, RBBB, WPW, pacing, PVC/VT), like an EP mapping system. The 3D wavefront follows it in every view. |
| Coronary territories | `src/lib/anatomy/aha17.ts`, `src/components/anatomy/Bullseye.tsx` | AHA 17-segment bull's-eye linked to the culprit artery; the angio panel shows the C-arm angle (LAO/RAO, CRA/CAU) of any view. |
| Monitor / defibrillator trainer | `src/lib/sim/defib.ts`, `src/components/monitor/` | Generic monitor with ECG, SpO₂ pleth, capnography and NIBP. Includes AED, manual defibrillation, synchronised cardioversion, transcutaneous pacing, CPR, ACLS drugs, a code record, scenarios, and trainee/instructor modes. Press **Projector** to mirror it at `/monitor` on a second screen. |

## Phones, tablets and desktops

The layout adapts to the screen (`src/lib/device.ts`, Tailwind `phone:` / `touch:` / `short:` variants):

| Screen | Layout |
| --- | --- |
| Desktop / laptop (≥ 1024 px) | Navigator, info panel, 3D heart and ECG dock side by side; drag the dividers to resize |
| Tablet | Navigator and info panel slide over the heart (tap outside to close); rarer ECG options under **More** |
| Phone, upright | Compact top bar (search and role/scope behind icons), ECG / Wiggers / Monitor tabs, interpretation and electrode lab slide over the tracing, quiz / tutor / help open full screen |
| Phone, on its side | Heart and ECG dock side by side |

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
`F` blood flow · `V` ECG vector · `E` ECG/Wiggers · `M` monitor/defib · `Q` quiz ·
`T` tutor · `/` search · `?` help · `Esc` close.

## Credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the open-source projects and publications
used to check accuracy, and for their licences.

## Accuracy note

Content was written and then reviewed against current AHA/ACC, ESC and ACLS
guidance. It is a teaching aid, not a clinical reference — always follow local
protocols and current guidelines for patient care.
