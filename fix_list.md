# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim. The SessionStart hook tells every session
to read this file; the end-session protocol updates it (CLAUDE.md, step 4).

Add new items at the top of their group. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

### Owner actions (dashboard steps — code can't do these)

- [ ] 2026-10-16 — **Say "end session" to put this session's work live.** The phone/tablet layout,
  the installable app (PWA) with the new logo, and this session protocol are on
  `claude/magical-allen-qsnowt` but not yet merged into production, so
  https://cardiacmap.stationinsight.com does not have them yet. Merging also matters for the
  protocol itself: new sessions start from production, so until it is merged they won't get the hook.
- [ ] 2026-10-16 — *(Optional)* **Rename the production branch to `main`** to match the other repos.
  In this order, all on the same day: (1) ask Claude to create `main` from production and push it;
  (2) Vercel → project `cardiac-map` → Settings → Git → Production Branch → `main`;
  (3) GitHub → `jcochran6810/Cardiac-map` → Settings → General → Default branch → `main`
  (the GitHub mobile app's branch picker does not change it); (4) ask Claude to update
  `.claude/production-branch` and the branch name in `CLAUDE.md`, then "end session".
  Skipping a step leaves sessions or deploys on the old branch (this happened in MyTradeCrate).
- [ ] 2026-10-16 — **Let Claude change Vercel settings** (optional). The Vercel connector can read
  but gets "403 forbidden" on project changes (e.g. adding a domain). To allow it: claude.ai →
  Settings → Connectors → Vercel → reconnect and allow write tools.
- [ ] 2026-10-16 — **Delete the stale branch** `claude/project-refinement-prior-hghmfo`
  (2026-09-04; 2 commits that never shipped, 23 behind production). Review it first if you remember
  what it was for: GitHub → Branches. Sessions can't delete remote branches.

### Code

- [ ] 2026-10-16 — Phone/tablet layout and the PWA install flow were tested in emulated Chromium
  (sizes 360–1920 px, touch emulation, offline reload) but **not on a real iPhone or Android device**.
  Check: Safari → Share → Add to Home Screen; Android Chrome → Install; open offline.
- [ ] 2026-10-16 — Role permissions used by the monitor/defibrillator and tutor (`MANUAL_OK`,
  `DRUG_AUTHORITY` in `heart-simulator/src/components/monitor/DefibPanel.tsx:16`, `careField` in
  `heart-simulator/src/lib/tutor.ts:148`) live inside components, so unit tests can't reach them.
  Move them into `heart-simulator/src/lib/scope.ts` and test that each role only gets its scope.
- [ ] 2026-10-16 — No component or end-to-end tests yet; unit tests cover `src/lib` only. A
  Playwright smoke test of the main layouts (phone, tablet, desktop) would catch layout regressions.
- [ ] 2026-10-16 — `next lint` is removed in Next.js 16. Before upgrading Next, switch
  `heart-simulator` to the ESLint CLI with a flat config (`eslint.config.mjs`).
- [ ] 2026-10-16 — `heart-3d-model/index.html` is an unused legacy page from the first commit.
  Remove it, or keep it deliberately and say so in the README.

## Done

- [x] 2026-10-16 — Start/end-session protocol adopted from the sibling repos (MyTradeCrate,
  Station Insight, Response-Insight), adapted for this repo: `CLAUDE.md`,
  `.claude/hooks/session-start.sh` (+ `session-start.test.sh`, 42 checks), `.claude/settings.json`,
  `.claude/production-branch`, `SESSION_LOG.md`, this file; `typecheck`, `test` and `check` npm
  scripts and a Vitest suite (122 tests) so the session-start baseline has real checks.
- [x] 2026-10-16 — Installable app (PWA) with the new heart logo: manifest, icons, offline service
  worker, install button and iPhone instructions (`c8212a5`).
- [x] 2026-10-16 — Layout adapted to phones, tablets and desktops (`6e9f55d`).
- [x] 2026-10-16 — https://cardiacmap.stationinsight.com connected to Vercel project `cardiac-map`
  (owner added the domain; verified serving).
