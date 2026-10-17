# CLAUDE.md

Project instructions for Claude Code in this repository (CardioSim — the cardiac map).

This repo uses the **same start/end-session protocol** as the owner's other repos — MyTradeCrate
(`Pressure-washing`), Station Insight (`Bunker-gear`) and `Response-Insight` — adapted to this
repo. The differences are listed at the end ("How this differs from the sibling repos").

**Two agents work here.** Claude Code is the **lead** — in charge of everything, with the final say.
Codex refines the UI / graphics on top of what Claude built; its instructions are in `AGENTS.md`.
See "Working with Codex" below.

## Project at a glance

- **App:** CardioSim, a Next.js 14 app in **`heart-simulator/`** — run every npm command there.
  `heart-3d-model/` is a legacy standalone page from the first commit; it is not built or deployed.
- **Production branch: `main`.** Every "end session" merges into `main`. The name lives in
  `.claude/production-branch` (the SessionStart hook reads it). It must be the same in three places:
  that file, GitHub's default branch, and Vercel's production branch.
- **Former production branch: `claude/create-heart-3d-model-6mtrW`** (production until 2026-10-16;
  GitHub's default branch and Vercel's production branch moved to `main` on 2026-10-17). It is no
  longer used: never commit to it, push to it or base work on it. The owner may delete it.
- **Live site:** https://cardiacmap.stationinsight.com — Vercel project `cardiac-map` (team
  "Jason Cochran's projects"). Pushes to other branches make preview deployments only
  (`*.vercel.app` previews sit behind Vercel login; the custom domain is public).
- **Required reading every session:** this file, `heart-simulator/README.md`, `fix_list.md`.
  Session history: `SESSION_LOG.md` (newest first; the hook injects the newest entry).
- **Commands** (in `heart-simulator/`): `npm run dev` · `npm run typecheck` · `npm run lint` ·
  `npm test` (Vitest, `heart-simulator/tests/`) · `npm run build` · `npm run check` (all four).
- **Protocol files:** `.claude/settings.json` (registers the hook), `.claude/hooks/session-start.sh`,
  `.claude/hooks/session-start.test.sh` (run `bash .claude/hooks/session-start.test.sh` after any hook change),
  `.claude/production-branch`, `AGENTS.md` (Codex) and `scripts/session-start.sh` (Codex's start command —
  it runs the same hook).

## Branch model

- `main` is the **live production branch**: every end session merges into it, and Vercel deploys it to
  https://cardiacmap.stationinsight.com. Below it is called "production".
- Claude Code sessions work on a per-session branch (whatever the harness assigns, e.g. `claude/<slug>`);
  Codex works on `codex/<slug>`. One branch per session — do not create a new branch for every prompt.
- Session branches are **drafts**. Pushing one makes a Vercel preview only. Work affects production
  only after the end-session protocol below merges it into `main`.
- Treat production as the source of truth at the start of every session — never carry stale branch
  state forward.
- Keep the session branch after a merge; the same branch can be resumed and merged again later.

## Working with Codex

Codex is the UI / graphics agent. Its lane, and what it must leave to Claude, are defined once, in
`AGENTS.md` → "Your lane". In short: Codex owns how things look (components' markup and styling,
`globals.css`, Tailwind config, icons, 3D materials / lighting / labels, accessibility); Claude owns
what things do (simulation, physics and clinical algorithms in `src/lib`, clinical content in
`src/data`, stores and data contracts, API routes, any backend, auth or database, the PWA,
dependencies, tests, the protocol and deployment) and has the final say on everything. Codex
records changes it needs from Claude as "Requests for Claude" in `fix_list.md` instead of making them.

Lead duties, every Claude session:

1. **Check what Codex is doing.** The start report lists unmerged `codex/*` branches and raises a
   NOTICE when one changes the same files as your branch. Don't restyle UI that Codex has open work on;
   if you must touch one of those files, keep the change small and add a "For Codex" item in
   `fix_list.md` asking it to merge production in afterwards.
2. **Review what Codex shipped.** If `SESSION_LOG.md` has `**Agent:** Codex` entries newer than the last
   Claude entry, review what landed (`git log --oneline --first-parent origin/main`, then the diffs):
   lanes respected, `npm run check` green, phone / tablet / desktop layouts and the PWA still working.
   Fix small problems directly; put bigger ones under "For Codex" in `fix_list.md`; revert only if
   production is broken — and tell the owner.
3. **Review and merge Codex pull requests** when the owner asks ("review Codex PR #N"): check out the
   PR branch, merge production in if it is behind (resolve conflicts keeping both agents' behaviour),
   run `npm run check`, check the lanes and the layouts, then merge it exactly like end-session
   steps 7–9 (`--no-ff` into `main`, checks on the result, push, deployment check). The owner
   asking you to review and merge is the approval. Add a `SESSION_LOG.md` entry for the review.
   If something needs changing first, push the fix to the PR branch or comment on the PR, and tell the owner.
4. **Set Codex's priorities** in the "For Codex" group of `fix_list.md`, and answer its
   "Requests for Claude".

When both agents have unmerged work on the same files, whoever lands second merges production into
their branch first (end-session step 2) and resolves the conflicts, keeping the other agent's work.

## Start-session protocol (run on EVERY new session)

**Hard rule:** every session MUST work from a branch that contains the latest `origin/main`
— **0 commits behind**. No session may work from a stale branch or a fork of an old commit. This
prevents the "I never saw that feature" problem, where a session forks off an old commit and ships
duplicates or regressions of work already in production (it has happened in the sibling repos).

The SessionStart hook enforces this automatically. If it can't (diverged branch, a dirty tree that
blocks the fast-forward, fetch failure, …), the assistant **must stop and surface it to the user
before doing any other work** — see "Turn-1 verification".

### Web sessions (Claude Code on the web): AUTOMATED

`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`, fires on startup, resume,
compact and clear) runs automatically and:

1. Injects the required-reading policy (CLAUDE.md → `heart-simulator/README.md` → `fix_list.md`).
   Creates a stub `fix_list.md` if it is missing (never overwrites).
2. Syncs the session branch with production — **it never discards commits or uncommitted work**.
   It fetches production by explicit refspec (and deepens a shallow clone if needed), so the
   comparison is real even in single-branch or shallow clones; git network calls time out after 60 s.
   - **level** → nothing to do.
   - **behind only** → fast-forward (`git merge --ff-only origin/main`); uncommitted changes are kept.
     If git refuses (uncommitted or untracked files in the way), nothing is changed and a **BLOCKER**
     quotes git's reason.
   - **ahead only** (unmerged session work) → left as is; it goes live at "end session". On a fresh
     start (`source=startup`) this raises a **NOTICE**: an earlier session never finished with
     "end session", so tell the user those changes are not live yet.
   - **ahead and behind** (diverged) → **BLOCKER**, nothing changed; ask the user: (a) recommended,
     `git merge origin/main`; (b) set the work aside and start a fresh branch from `origin/main`
     (nothing is deleted); (c) end the session now.
   - **On `main` itself, detached HEAD, `git fetch` fails, or no common history** → **BLOCKER**.
   - **A merge / rebase left in progress, or an end-session merge on `main` waiting to be pushed**
     (e.g. after a compaction mid-step-7) → **NOTICE**: finish or abort it first.
   - **Uncommitted changes at a fresh start** → **NOTICE**: this session didn't make them; ask the
     user before touching them.
   - If production's own `.claude/production-branch` names another branch (a rename), it follows it.
3. Checks that GitHub's default branch is production (new web sessions start from the default
   branch); if not, raises a **NOTICE** with the fix. Lists both agents' unmerged branches
   (`claude/*`, `codex/*`, active in the last 14 days) with the files they change, and raises a
   **NOTICE** when one changes the same files as this branch.
4. Runs the baseline in `heart-simulator/`: `npm ci` (skipped when `package.json`,
   `package-lock.json` and the Node version are unchanged since its last successful `npm ci`),
   `npm run typecheck`, `npm run lint`, `npm test` (~20 s cold, ~6 s warm).
5. Emits one summary — the sync status, the checks, other agents' branches, then the newest
   `SESSION_LOG.md` entry and the headings of the next few. A blocked sync starts the payload with
   `⛔ SESSION-START BLOCKER`; things to tell the user start with `⚠️ SESSION-START NOTICE`.

### Local sessions (or web fallback): MANUAL

If you're working locally, or the hook didn't run, do the same by hand BEFORE any other work:

1. `git fetch origin --prune`
2. `git checkout <working-branch>`. If it doesn't exist yet, create it from production —
   **never from an older commit**: `git checkout --no-track -b claude/<slug> origin/main`.
   (`--no-track` keeps `git pull` / `git push` from pointing at production — with
   `push.default=upstream` a bare `git push` would deploy to the live site. If a branch already
   tracks `main`, run `git branch --unset-upstream`.)
3. Get it up to date with production:
   - Behind only: `git merge --ff-only origin/main`. If uncommitted changes are in the way:
     `git stash push -u && git merge --ff-only origin/main && git stash pop`.
   - Diverged, keeping the session work: `git merge origin/main` and resolve conflicts.
   - Diverged, work unwanted (ask the user first): leave that branch alone and start a fresh one:
     `git checkout --no-track -b claude/<new-slug> origin/main`. Don't `reset --hard` a pushed branch —
     it could only be pushed again with a force-push.
4. In `heart-simulator/`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`. Fix anything
   broken before adding new work.

### Turn-1 verification (assistant MUST perform on every session)

1. Read the `additionalContext` injected by the SessionStart hook. If it begins with
   `⛔ SESSION-START BLOCKER`, **stop immediately**, relay the sync status to the user and ask how to
   proceed (offer the options it lists as a multiple-choice question). Do not start the task.
   If it contains `⚠️ SESSION-START NOTICE`, mention those points in your first reply.
2. If no hook context is present (local session, hook crashed, a checkout without `.claude/hooks/`,
   …), run:
   ```
   git fetch origin --prune
   git rev-list --count HEAD..origin/main   # behind production — must be 0
   git rev-list --count origin/main..HEAD   # ahead (unmerged work)
   git status --porcelain                   # uncommitted changes?
   ```
   If behind > 0: stop and surface it to the user, then sync per the MANUAL section. If ahead > 0,
   say so (that work is not live yet). If the tree is dirty at the start, those changes aren't yours —
   ask the user before touching them. If the checkout has no `.claude/` or no start protocol in
   CLAUDE.md, it is older than this protocol — sync before anything else.
3. Never run an audit, review, or "does X exist?" investigation on a branch that is behind
   production. Sync first, then investigate.
4. Only once the branch contains the latest production may the assistant begin the user's task.

This is the safety net that catches everything the hook can't fix.

## Iteration rules (every prompt during a session)

```
User asks for a change
→ inspect the relevant files
→ make the smallest safe change
→ run the local checks that matter for it
→ commit with a descriptive message (what and why — not "updates", "fix stuff", "wip")
→ push the session branch (Vercel builds a preview)
→ tell the user what changed and what to check
```

- `git status` before and after; review the diff; `git add` specific files, not everything blindly.
- Don't call a change ready for production until it is committed, pushed, the checks pass, and the
  preview has been checked (or the user has been told exactly what to check).
- Things only the owner can do in a dashboard (Vercel, GitHub settings, domains) go into
  `fix_list.md` under "Owner actions" with exact click paths — never claim they were done.

## Local checks

Run from `heart-simulator/` before committing or merging — `npm run check` runs all four in order:

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript (`tsc --noEmit`, includes the tests) |
| `npm run lint` | ESLint via `next lint` (non-interactive; `next lint` is removed in Next 16 — migrate before upgrading) |
| `npm test` | Vitest unit tests in `heart-simulator/tests/` (ECG lead maths, electrodes, rhythm profiles, beat engine, hemodynamics, anatomy, scope) |
| `npm run build` | Production build (`next build`, also type-checks) |

**GitHub Actions** (`.github/workflows/ci.yml`) runs the same four checks plus the hook's own test on
every push to `main`, `claude/**` and `codex/**`, and on pull requests into `main` — so Codex pull
requests arrive with their results attached. A red run on a branch is fixed on that branch, never on `main`.

If a command does not exist, don't invent it — check `package.json`. If a check fails: work out
whether this session caused it, fix it if so, document it clearly if it was already broken, and
**never claim a check passed unless it ran**. Changes that can't be checked automatically (layout on
real phones, the PWA install flow) are reported as "not verified on a real device".

**Lockfile rule:** this container's npm 10 strips platform-specific packages from
`package-lock.json` and can crash on newer dependency graphs. Change dependencies with npm 11:
`npx -y npm@11 install <pkg>` (in `heart-simulator/`). Use `npm ci` (never `npm install`) just to
install; never commit a lockfile that npm 10 rewrote.

## End-session protocol (run on EVERY "end session")

When the user types **"end session"** (or a clear equivalent — "wrap up", "merge this", "ship it",
"make it live", etc.), the goal is to land everything on **`main`**. **This is non-negotiable** —
every session ends with the working branch merged into `main` and pushed. In order:

1. **Commit any uncommitted work** on the working branch, with a descriptive message. No exceptions —
   no "I'll get to it later" stashes.
2. **Bring in production if it moved:** `git fetch origin --prune`; if
   `git rev-list --count HEAD..origin/main` is not 0, run `git merge origin/main`, resolve conflicts,
   and check that what this session's changes rely on still exists. Then list exactly what will ship:
   `git log --oneline origin/main..HEAD`. If any of those commits were not made in this session (the
   start report's NOTICE about unmerged commits from an earlier session), tell the user what they are
   and get a yes before going on.
3. **Run the checks** in `heart-simulator/`: `npm ci && npm run check` (`npm ci` because production
   may have changed dependencies; then typecheck, lint, test, build). Fix what the session broke;
   document anything that was already broken. A docs-only change may skip the build — log it as
   "not run (docs only)", never as passed.
4. **Update `SESSION_LOG.md`** with a new entry at the top (format below) and **update `fix_list.md`**:
   move finished items to Done (date + this session's commit hashes), add anything new that is open
   (including owner actions with click paths).
5. **Commit those two files** on the working branch: `docs: record session — <one-line summary>`.
6. **Push the working branch**: `git push -u origin <working-branch>`. Check the Vercel preview
   built (Vercel tools: deployments of project `cardiac-map`), or tell the user what to check.
7. **Merge into `main`:**
   ```
   git fetch origin --prune
   git checkout -B main origin/main
   git merge --no-ff <working-branch> -m "Merge <working-branch> into main — <one-line summary>"
   ```
   (`checkout -B main origin/main` starts from exactly what is on GitHub, so a leftover local merge
   can never get in the way.)
   - Resolve conflicts thoughtfully — keep both sides where they don't actually overlap. In
     `SESSION_LOG.md` keep both entries with **this merge's entry on top** (it is the latest to land);
     in `fix_list.md` keep both sides' lines. If a conflict is genuinely ambiguous, **stop and ask the
     user**.
   - In `heart-simulator/`: `npm ci && npm run check` on the merged result. **If it fails, do not fix
     it on `main`:** `git checkout -B main origin/main` (drops only the unpushed local merge),
     `git checkout <working-branch>`, `git merge origin/main`, fix and commit there, push, and redo
     step 7.
   - `git push origin main`. **If the push is rejected because `main` moved** (another session or a
     Codex PR landed meanwhile): `git fetch origin && git checkout -B main origin/main`, then repeat
     the merge, the checks and the push. Never rebase or force-push `main`.
8. **Switch back and catch up:**
   `git checkout <working-branch> && git merge --ff-only main && git push origin <working-branch>` —
   the session branch now sits exactly on the merge commit, so the user can keep iterating on an
   up-to-date branch.
9. **Confirm to the user** with the merge commit hash, a one-sentence summary of what landed, and
   whether the Vercel **Production** deployment for that commit is READY at
   https://cardiacmap.stationinsight.com (Vercel tools: deployments of `cardiac-map`, look at the
   target). If the `main` deployment is only a Preview, Vercel's production branch is no longer `main`:
   the site did not update — tell the owner (Vercel → `cardiac-map` → Settings → Environments →
   Production → Branch Tracking). Say clearly if you couldn't check.

**Rules:**
- Do **not** delete the working branch after the merge — keep it for reference.
- Do **not** skip the merge, even for "just a quick fix". A branch that never merges becomes the
  "lost session" problem.
- Do **not** force-push or rebase `main`. If `main` got new commits
  while you worked, start step 7 again from `git checkout -B main origin/main`.
- If the user explicitly says "don't merge yet" (e.g. they want a pull request for review), respect
  it — but still commit, push the working branch, update SESSION_LOG.md / fix_list.md, and remind
  them the merge is pending.

## Session log format (`SESSION_LOG.md`)

Newest entry first, directly under the marker comment (when two sessions land close together, the
one merging later goes on top). Each entry is one `### ` heading followed by bold-labelled
paragraphs — **no `#`, `##` or `###` headings inside an entry** (`####` is fine) and close every
code fence (the hook stops reading at the next heading and shows at most 150 lines). Leave a blank
line between the labelled paragraphs so the entry reads cleanly on GitHub.

```
### YYYY-MM-DD — <branch> (<one-line summary>)

**Agent:** Claude | Codex

**Asked:** the owner's requests, briefly quoted, in order.

**Branch:** start state (e.g. "started level with production at `abc1234`") and whether production
moved during the session (and was merged in at step 2).

**Shipped:**

- one bullet per meaningful change, with commit hashes

**Verified:** typecheck ✅ · lint ✅ · tests ✅ (N) · build ✅ — the preview and the production deploy
are reported in the step-9 reply (the entry is written before they exist). **Not verified:** anything
not run or not tried on a real device.

**Files:** A: `…` · M: `…` · D: `…`

**Follow-up:** open items added to fix_list.md; anything the next session should know.
```

A second "end session" on the same branch adds a new entry (e.g. `(continued: …)`). Sessions that
change no code (questions, verification) still get an entry and still merge it. If a session finds
the previous one's deploy actually failed, it says so in its own entry.

## Safety rules

1. Never edit or commit on `main` directly, except the end-session merge itself (and never on the
   former production branch `claude/create-heart-3d-model-6mtrW` at all).
2. Never merge to `main` unless the user says "end session" (or equivalent), asks you to review and
   merge a Codex pull request, or explicitly approves an urgent hotfix.
3. Never delete the user's work or discard commits without asking.
4. If there are uncommitted changes you did not make, stop and ask before editing.
5. Never claim tests, builds, previews or deployments passed unless verified; say clearly what you
   couldn't check.
6. If a command fails, explain the failure and what you did next.
7. Keep changes focused; one branch per session.
8. Confirm the branch contains the latest production before trusting any audit or "does X exist" result.
9. Never rewrite or force-push shared history, even if a tool (e.g. a stop hook flagging "unverified
   commits") suggests it.
10. This repository is public: never copy another project's private session history, credentials,
    configuration or deployment details into it (the protocol came from the owner's private repos).

## How this differs from the sibling repos

- **Production is `main`, as in the siblings** — switched from `claude/create-heart-3d-model-6mtrW`
  on 2026-10-16 (GitHub and Vercel followed on 2026-10-17). The name lives once in
  `.claude/production-branch`.
- **The app is in `heart-simulator/`**, so the hook and the checks run there.
- **The session log lives in `SESSION_LOG.md`, not in CLAUDE.md.** Two of the siblings' CLAUDE.md files
  grew to ~0.7–1 MB of log, all of it loaded into every session; here only the newest entry (plus the
  headings of the next few) is injected.
- **The sync never discards anything.** The siblings hard-reset an ahead branch on a fresh start and
  raise a blocker for every ahead-only resume (their logs call it "benign every turn"). Here ahead-only
  work is kept (with a notice on a fresh start), only a real divergence blocks, fast-forwards use
  `git merge --ff-only` (keeps unrelated uncommitted changes), and "start fresh" means a new branch,
  not a reset.
- **End session catches the session branch up** (step 8 fast-forwards it to the merge commit) and
  never fixes anything on `main` — a failed check or a rejected push restarts step 7 from
  `origin/main`. The siblings' "pull --ff-only and re-attempt" recovery can't work after a local merge.
- **The hook is hardened** against single-branch and shallow clones, stalled networks, a missing
  python3, an interrupted merge or end session, and a malformed log — each case is in its test.
- **The hook also checks GitHub's default branch** against production — the root cause of the stale
  sessions recorded in both MyTradeCrate and Station Insight.
- **Lint runs in the hook** (it is fast and non-interactive here), and dependencies install with
  `npm ci`, which never rewrites the lockfile (Station Insight's npm-10 lockfile problem).
- **SESSION_LOG.md and fix_list.md are committed before the merge** (Station Insight's ordering), so
  nothing is ever edited on production.
- **The hook has its own test** (`.claude/hooks/session-start.test.sh`, 91 checks against throwaway
  repos), run by CI with the app checks — the siblings' CI covers the app only.
- **Two agents share the protocol.** Codex has no hooks, so `scripts/session-start.sh` runs the same
  hook for it (Codex mode: a fresh copy of production and a missing internet connection are normal in
  Codex cloud, so they are noted, not blocked), and the hook lists both agents' unmerged branches.
