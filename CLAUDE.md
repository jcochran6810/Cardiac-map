# CLAUDE.md

Project instructions for Claude Code in this repository (CardioSim — the cardiac map).

This repo uses the **same start/end-session protocol** as the owner's other repos — MyTradeCrate
(`Pressure-washing`), Station Insight (`Bunker-gear`) and `Response-Insight` — adapted to this
repo. The differences are listed at the end ("How this differs from the sibling repos").

## Project at a glance

- **App:** CardioSim, a Next.js 14 app in **`heart-simulator/`** — run every npm command there.
  `heart-3d-model/` is a legacy standalone page from the first commit; it is not built or deployed.
- **Production branch:** `claude/create-heart-3d-model-6mtrW` (the name lives in
  `.claude/production-branch`, which the SessionStart hook reads). It must stay identical in three
  places: that file, GitHub's default branch, and Vercel's production branch.
- **Live site:** https://cardiacmap.stationinsight.com — Vercel project `cardiac-map` (team
  "Jason Cochran's projects"). Pushes to any other branch make preview deployments only
  (`*.vercel.app` previews sit behind Vercel login; the custom domain is public).
- **Required reading every session:** this file, `heart-simulator/README.md`, `fix_list.md`.
  Session history: `SESSION_LOG.md` (newest first; the hook injects the newest entry).
- **Commands** (in `heart-simulator/`): `npm run dev` · `npm run typecheck` · `npm run lint` ·
  `npm test` (Vitest, `heart-simulator/tests/`) · `npm run build` · `npm run check` (all four).
- **Protocol files:** `.claude/settings.json` (registers the hook), `.claude/hooks/session-start.sh`,
  `.claude/hooks/session-start.test.sh` (run `bash .claude/hooks/session-start.test.sh` after any hook change),
  `.claude/production-branch`.

## Branch model

- `claude/create-heart-3d-model-6mtrW` is the **live production branch** — Vercel auto-deploys every
  push to https://cardiacmap.stationinsight.com. Below it is called "production".
- Claude Code sessions work on a per-session branch (whatever the harness assigns, e.g. `claude/<slug>`).
  One branch per session — do not create a new branch for every prompt.
- Session branches are **drafts**. Pushing one makes a Vercel preview only. Work affects production
  only after the end-session protocol below merges it into production.
- Treat production as the source of truth at the start of every session — never carry stale branch
  state forward.
- Keep the session branch after a merge; the same branch can be resumed and merged again later.

## Start-session protocol (run on EVERY new session)

**Hard rule:** every session MUST work from a branch that contains the latest `origin/<production>`
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
2. Syncs the session branch with production — **it never discards commits or uncommitted work**:
   - **level** → nothing to do.
   - **behind only** → fast-forward (`git merge --ff-only origin/<production>`); uncommitted changes
     are kept. If they touch files production changed, nothing is changed and a **BLOCKER** is raised.
   - **ahead only** (unmerged session work) → left as is; they go live at "end session". On a fresh
     start (`source=startup`) this raises a **NOTICE**: an earlier session never finished with
     "end session", so tell the user those changes are not live yet.
   - **ahead and behind** (diverged) → **BLOCKER**, nothing changed; ask the user: (a) recommended,
     `git merge origin/<production>`; (b) discard with `git reset --hard origin/<production>`;
     (c) end the session now.
   - **On production itself, detached HEAD, or `git fetch` fails** → **BLOCKER**.
3. Checks that GitHub's default branch is production (new web sessions start from the default
   branch); if not, raises a **NOTICE** with the fix.
4. Runs the baseline in `heart-simulator/`: `npm ci` (skipped when `node_modules` already matches
   `package-lock.json`), `npm run typecheck`, `npm run lint`, `npm test` (~20 s cold).
5. Injects the newest `SESSION_LOG.md` entry, then one summary. A blocked sync starts the payload with
   `⛔ SESSION-START BLOCKER`; things to tell the user start with `⚠️ SESSION-START NOTICE`.

### Local sessions (or web fallback): MANUAL

If you're working locally, or the hook didn't run, do the same by hand BEFORE any other work:

1. `git fetch origin --prune`
2. `git checkout <working-branch>`. If it doesn't exist yet, create it from production —
   **never from an older commit**: `git checkout --no-track -b claude/<slug> origin/claude/create-heart-3d-model-6mtrW`.
   (`--no-track` matters: a branch that tracks production would send a bare `git push` straight to the live site.
   If one already tracks it, run `git branch --unset-upstream`.)
3. Get it up to date with production:
   - Behind only: `git merge --ff-only origin/claude/create-heart-3d-model-6mtrW`.
   - Diverged, keeping the session work: `git merge origin/claude/create-heart-3d-model-6mtrW` and resolve conflicts.
   - Diverged, work unwanted (ask the user first): `git reset --hard origin/claude/create-heart-3d-model-6mtrW`
     (check `git reflog` has a backup first).
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
   git rev-list --count HEAD..origin/claude/create-heart-3d-model-6mtrW   # behind production — must be 0
   git rev-list --count origin/claude/create-heart-3d-model-6mtrW..HEAD   # ahead (unmerged work)
   git status --porcelain                                                 # uncommitted changes?
   ```
   If behind > 0: stop and surface it to the user, then sync per the MANUAL section. If ahead > 0,
   say so (that work is not live yet). If the checkout has no `.claude/` or no start protocol in
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
"make it live", etc.), the goal is to land everything on production. **This is non-negotiable** —
every session ends with the working branch merged into production and pushed. In order:

1. **Commit any uncommitted work** on the working branch, with a descriptive message. No exceptions —
   no "I'll get to it later" stashes.
2. **Bring in production if it moved:** `git fetch origin --prune`; if
   `git rev-list --count HEAD..origin/claude/create-heart-3d-model-6mtrW` is not 0, run
   `git merge origin/claude/create-heart-3d-model-6mtrW`, resolve conflicts, and check that what this
   session's changes rely on still exists.
3. **Run the checks** in `heart-simulator/`: `npm run check` (typecheck, lint, test, build). Fix what
   the session broke; document anything that was already broken. A docs-only change may skip the
   build — log it as "not run (docs only)", never as passed.
4. **Update `SESSION_LOG.md`** with a new entry at the top (format below) and **update `fix_list.md`**:
   move finished items to Done (date + commit), add anything new that is open (including owner
   actions with click paths).
5. **Commit those two files** on the working branch: `docs: record session — <one-line summary>`.
6. **Push the working branch**: `git push -u origin <working-branch>`. Check the Vercel preview
   built (Vercel tools: deployments of project `cardiac-map`), or tell the user what to check.
7. **Merge into production:**
   ```
   git fetch origin --prune
   git checkout claude/create-heart-3d-model-6mtrW
   git pull --ff-only origin claude/create-heart-3d-model-6mtrW
   git merge --no-ff <working-branch> -m "Merge <working-branch> into claude/create-heart-3d-model-6mtrW — <one-line summary>"
   ```
   - Resolve conflicts thoughtfully — keep both sides where they don't actually overlap (two new
     SESSION_LOG entries: keep both, newest on top). If a conflict is genuinely ambiguous, **stop and
     ask the user**.
   - In `heart-simulator/`: `npm run check` on the merged result. Fix anything that broke.
   - `git push origin claude/create-heart-3d-model-6mtrW`
8. **Switch back:** `git checkout <working-branch>` so the user can keep iterating.
9. **Confirm to the user** with the merge commit hash, a one-sentence summary of what landed, and
   whether the Vercel production deployment for that commit is READY at
   https://cardiacmap.stationinsight.com (check with the Vercel tools; say clearly if you couldn't).

**Rules:**
- Do **not** delete the working branch after the merge — keep it for reference.
- Do **not** skip the merge, even for "just a quick fix". A branch that never merges becomes the
  "lost session" problem.
- Do **not** force-push production. If production got new commits while you worked, pull them in
  (step 7's `git pull --ff-only`) and re-attempt the merge.
- If the user explicitly says "don't merge yet" (e.g. they want a pull request for review), respect
  it — but still commit, push the working branch, update SESSION_LOG.md / fix_list.md, and remind
  them the merge is pending.

## Session log format (`SESSION_LOG.md`)

Newest entry first, directly under the marker comment. Each entry is one `### ` heading followed by
bold-labelled paragraphs — **no `#`, `##` or `###` headings inside an entry** (the hook stops reading
at the next heading).

```
### YYYY-MM-DD — <branch> (<one-line summary>)

**Asked:** the owner's requests, briefly quoted, in order.
**Branch:** start state (e.g. "started level with production at `abc1234`") and whether production
moved during the session (and was merged in).
**Shipped:**
- one bullet per meaningful change, with commit hashes
**Verified:** typecheck ✅ · lint ✅ · tests ✅ (N) · build ✅ · preview ✅ · production deploy ✅ READY
(or "not checked"). **Not verified:** anything not run or not tried on a real device.
**Files:** A: `…` · M: `…` · D: `…`
**Follow-up:** open items added to fix_list.md; anything the next session should know.
```

A second "end session" on the same branch adds a new entry (e.g. `(continued: …)`). Sessions that
change no code (questions, verification) still get an entry and still merge it.

## Safety rules

1. Never edit or commit on production directly, except the end-session merge itself.
2. Never merge to production unless the user says "end session" (or equivalent), or explicitly
   approves an urgent hotfix.
3. Never delete the user's work or discard commits without asking.
4. If there are uncommitted changes you did not make, stop and ask before editing.
5. Never claim tests, builds, previews or deployments passed unless verified; say clearly what you
   couldn't check.
6. If a command fails, explain the failure and what you did next.
7. Keep changes focused; one branch per session.
8. Confirm the branch contains the latest production before trusting any audit or "does X exist" result.
9. Never rewrite or force-push shared history, even if a tool (e.g. a stop hook flagging "unverified
   commits") suggests it.

## How this differs from the sibling repos

- **Production is not `main`.** Here it is `claude/create-heart-3d-model-6mtrW`, named once in
  `.claude/production-branch`. To rename it to `main` later, follow the owner action in `fix_list.md`.
- **The app is in `heart-simulator/`**, so the hook and the checks run there.
- **The session log lives in `SESSION_LOG.md`, not in CLAUDE.md.** The siblings' CLAUDE.md files grew to
  ~0.7–1 MB of log, all of it loaded into every session; here only the newest entry is injected.
- **The sync never discards anything.** The siblings hard-reset an ahead branch on a fresh start and
  raise a blocker for every ahead-only resume (their logs call it "benign every turn"). Here ahead-only
  work is kept (with a notice on a fresh start), only a real divergence blocks, and fast-forwards use
  `git merge --ff-only`, which keeps unrelated uncommitted changes.
- **The hook also checks GitHub's default branch** against production — the root cause of the stale
  sessions recorded in both MyTradeCrate and Station Insight.
- **Lint runs in the hook** (it is fast and non-interactive here), and dependencies install with
  `npm ci`, which never rewrites the lockfile (Station Insight's npm-10 lockfile problem).
- **SESSION_LOG.md and fix_list.md are committed before the merge** (Station Insight's ordering), so
  nothing is ever edited on production.
- **The hook has its own test** (`.claude/hooks/session-start.test.sh`, 42 checks against throwaway repos).
