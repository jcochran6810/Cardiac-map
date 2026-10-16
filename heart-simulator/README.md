# CardioSim

An interactive cardiac teaching simulator: a 3D heart, a live 12-lead ECG and a
pressure–volume (Wiggers) model that all run from **one shared clock**, so the
P wave, atrial contraction, valve clicks, pressures and the 3D heartbeat stay in
step. Content is written for five learner levels, from EMT to interventional / EP.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production build
```

## What's inside

| Area | Where | Notes |
| --- | --- | --- |
| ECG engine | `src/lib/ecg/` | Vector (dipole) model projected onto all 12 leads + right-sided/posterior leads, so axis, reciprocal ST change and R-wave progression come out of the physics rather than being drawn per lead. 43 rhythm/condition profiles, Fridericia QTc. |
| Hemodynamics | `src/lib/physiology/hemodynamics.ts` | Beat-by-beat LV/aortic/LA pressure, LV volume and heart sounds (Frank–Starling filling, atrial kick, Windkessel aorta). Drives the Wiggers chart and PV loop. |
| Simulation clock | `src/lib/sim/simulation.ts`, `src/components/sim/SimulationDriver.tsx` | Single animation loop; pause, scrub and 0.1–1× speed. |
| 3D heart | `src/components/scene/` | Exterior, four-chamber section with blood flow, x-ray, conduction system and coronary territories. Contraction, depolarization wave and ischemia are shaded on the GPU from the live ECG. |
| Anatomy map | `src/lib/anatomy/landmarks.ts` | Landmarks snapped to the model surface; clicking the heart opens the matching structure. |
| Teaching content | `src/data/content/`, `src/data/caseData.ts` | 62 structures, 42 conditions, 42 procedures, 38 medications, 9 branching cases, 60 quiz questions. Loaded on demand. |
| UI | `src/components/layout/`, `src/components/ecg/`, `src/components/physiology/` | Navigator, info panel, ECG (12-lead, monitor, paper, inspect, calipers), Wiggers/PV loop, tutor, quiz. |

## Keyboard shortcuts

`Space` play/pause · `←/→` step · `[ ]` speed · `1–5` 3D view · `L` labels ·
`F` blood flow · `V` ECG vector · `E` ECG/Wiggers · `Q` quiz · `T` tutor ·
`/` search · `?` help · `Esc` close.

## Accuracy note

Content was written and then reviewed against current AHA/ACC, ESC and ACLS
guidance. It is a teaching aid, not a clinical reference — always follow local
protocols and current guidelines for patient care.
