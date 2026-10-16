# Session log — CardioSim

What each Claude Code session shipped. Written at every "end session" (see CLAUDE.md →
"End-session protocol" and "Session log format"). The SessionStart hook shows the newest entry to
the next session.

<!-- newest first: add each new entry directly below this line -->

### 2026-10-16 — claude/create-heart-3d-model-6mtrW (history before the session protocol — backfilled)

**Asked:** n/a — reconstructed from git history when the start/end-session protocol was adopted, so
the first protocol session has context.
**Branch:** production `claude/create-heart-3d-model-6mtrW` at `6033603`.
**Shipped:**
- 2026-03-10 — first standalone three.js heart page (`heart-3d-model/index.html`, `5708192`).
- 2026-03-11 — first Next.js simulator in `heart-simulator/` (~40 commits, `76ed3d0`…`20ba346`):
  anatomical orientation, ECG synced to contraction, conduction arrows, resizable panels, lead
  selection with axis line, case data, search, procedure categories.
- 2026-10-16 — CardioSim rebuild, merged as PR #1 from `ccr-db7776c7-ytbwam` (`6033603`): one shared
  simulation clock for the 3D heart, 12-lead ECG (dipole model, 46 rhythm profiles) and Wiggers/PV
  loop; electrode lab, AHA 17-segment bull's-eye, activation maps, C-arm angles; monitor-defibrillator
  trainer with projector mirror (`/monitor`); clinical review of all content; role-based scope of
  practice (EMT, Paramedic, Cath Lab Tech, Cath Lab RN, Cardiologist) across 184 library items.
- 2026-10-16 — custom domain https://cardiacmap.stationinsight.com added to Vercel project
  `cardiac-map` (by the owner, in the dashboard).
**Verified:** Vercel production deployment of `6033603` READY; the domain serves `/api/health` 200.
**Files:** see `git log` — not itemised for backfilled history.
**Follow-up:** see `fix_list.md`.
