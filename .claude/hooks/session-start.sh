#!/usr/bin/env bash
# SessionStart hook — same design as the MyTradeCrate (Pressure-washing) and Station Insight
# (Bunker-gear) repos, adapted for CardioSim. See CLAUDE.md "Start-session protocol".
#
# Two agents work in this repo: Claude Code (lead; runs this as its SessionStart hook) and
# Codex (UI / graphics; has no hooks, so it runs `bash scripts/session-start.sh`, which calls
# this script with SESSION_START_AGENT=codex). See CLAUDE.md "Working with Codex" and AGENTS.md.
#
# Always (every environment):
#   - Injects the required-reading policy (CLAUDE.md / heart-simulator/README.md / fix_list.md;
#     Codex also AGENTS.md).
#   - Creates a stub fix_list.md if it is missing (never overwrites).
#
# Web/remote only ($CLAUDE_CODE_REMOTE == "true"):
#   - Brings the session branch up to date with the production branch named in
#     .claude/production-branch (following a rename recorded on production itself), WITHOUT ever
#     discarding commits or uncommitted work:
#       behind only          → fast-forward (git merge --ff-only)
#       ahead only           → leave it (unmerged session work); NOTICE on a fresh start
#       ahead and behind     → BLOCKER (diverged; the assistant asks how to proceed)
#       dirty tree that blocks the fast-forward, or no way to compare → BLOCKER
#       merge / rebase in progress, or an end-session merge waiting to be pushed → NOTICE
#       Claude only: on production / detached HEAD / fetch failure → BLOCKER
#       Codex: a fresh copy of production is its normal start (it is told to branch), and a
#       failed fetch is expected in Codex cloud (no internet during tasks) → noted, not blocked
#   - Lists other agents' unmerged branches (claude/*, codex/*, last 14 days) and raises a
#     NOTICE when one changes the same files as this branch.
#   - Warns when GitHub's default branch is not the production branch (new web sessions
#     start from the default branch, so they would miss newer work and this hook).
#   - Runs the baseline checks in heart-simulator/: npm ci (skipped when package.json,
#     package-lock.json and the Node version are unchanged since its last successful run),
#     typecheck, lint, test.
#   - Injects the newest entry from SESSION_LOG.md so the session sees what the last one shipped.
#
# Output: one JSON `hookSpecificOutput` object on stdout; all other output goes to stderr.
# The hook always exits 0 — it reports problems, it never aborts the session.
#
# Testing: .claude/hooks/session-start.test.sh runs it against throwaway git repos.
# SESSION_START_SKIP_CHECKS=1 skips the npm steps (used by that test).

set -uo pipefail
export GIT_TERMINAL_PROMPT=0

# Hook input (JSON with "source"); empty when run by hand from a terminal
if [ -t 0 ]; then INPUT=""; else INPUT="$(cat)"; fi

read_source() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("source", "") if isinstance(d, dict) else "")
except Exception:
    print("")' 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s);console.log(d&&typeof d==="object"&&d.source?String(d.source):"")}catch{console.log("")}})' 2>/dev/null
  else
    printf '%s' "$INPUT" | grep -o '"source"[[:space:]]*:[[:space:]]*"[a-z]*"' | sed 's/.*"\([a-z]*\)"$/\1/'
  fi
}

emit_context() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$1" | python3 -c 'import json,sys
print(json.dumps({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":sys.stdin.read()}}))'
  elif command -v node >/dev/null 2>&1; then
    printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:s}})))'
  else
    local esc
    esc="$(printf '%s' "$1" | tr -d '\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' | awk 'BEGIN { ORS = "\\n" } { print }')"
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$esc"
  fi
}

# File list → "`a`, `b`, `c`"
join_files() { awk 'NF { printf "%s`%s`", (n++ ? ", " : ""), $0 } END { if (n) print "" }'; }
# First non-blank line, without a byte-order mark or whitespace
first_word() { grep -m 1 -v '^[[:space:]]*$' | sed 's/^\xEF\xBB\xBF//' | tr -d '[:space:]'; }
# Network git with a time limit, so a stalled connection can't eat the hook's whole timeout
gitnet() { timeout "${GIT_NET_TIMEOUT:-60}" git "$@"; }

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$REPO_ROOT" || exit 0
APP_DIR="$REPO_ROOT/heart-simulator"
LIVE_URL="https://cardiacmap.stationinsight.com"
AGENT="${SESSION_START_AGENT:-claude}"
[ "$AGENT" = "codex" ] || AGENT="claude"

log() { printf '[session-start] %s\n' "$*" >&2; }

PROD="$(first_word < "$REPO_ROOT/.claude/production-branch" 2>/dev/null)"
[ -z "$PROD" ] && PROD="main"

# === Always-on: auto-create fix_list.md if missing (never overwrites) ===
if [ ! -f "$REPO_ROOT/fix_list.md" ]; then
  cat > "$REPO_ROOT/fix_list.md" <<'STUB'
# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim.

Add new items at the top. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

_(none yet)_

## Done

_(none yet)_
STUB
fi

# === Always-on: required-reading policy ===
if [ "$AGENT" = "codex" ]; then
  READING="  1. AGENTS.md                  — your role (UI / graphics), lanes, how your work lands
  2. CLAUDE.md                  — the shared start/end-session protocol (Claude is the lead)
  3. heart-simulator/README.md  — product overview, features, architecture
  4. fix_list.md                — open items, \"For Codex\" requests, owner actions"
else
  READING="  1. CLAUDE.md                  — project instructions, start/end-session protocols
  2. heart-simulator/README.md  — product overview, features, architecture
  3. fix_list.md                — outstanding fixes / TODOs / owner actions"
fi
POLICY_BLOCK="SESSION STARTUP — REQUIRED FIRST STEP

Before taking any action, doing any work, or answering any question in this
session, read the following files in this order:

$READING

This is mandatory project policy. Do this BEFORE any other tool calls,
investigation, or response. If any of these files is missing, note it and
continue. (The full session history is in SESSION_LOG.md; its newest entry
is included below on web sessions.)"

# === Local (non-remote): emit just the policy and exit ===
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  emit_context "$POLICY_BLOCK

(Local environment — automatic git sync + npm ci/typecheck/lint/test are
skipped. Run them manually per CLAUDE.md's start-session protocol.)"
  exit 0
fi

# === Web-only from here on: sync + baseline checks ===
SOURCE="$(read_source)"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo '')"
LABEL="${CURRENT_BRANCH:-detached HEAD}"
SYNC_STATUS=""
BLOCKER=""
NOTICES=""
add_notice() { NOTICES="${NOTICES}- $1
"; }

# Fetch production with an explicit refspec (single-branch and shallow clones don't map it otherwise)
fetch_branch() { gitnet fetch --quiet origin "+refs/heads/$1:refs/remotes/origin/$1" 2>/dev/null; }
FETCHED="no"
if fetch_branch "$PROD"; then
  FETCHED="yes"
  # Follow a rename recorded on production itself (e.g. an older branch still naming the former branch)
  NEXT="$(git show "origin/$PROD:.claude/production-branch" 2>/dev/null | first_word)"
  if [ -n "$NEXT" ] && [ "$NEXT" != "$PROD" ] && fetch_branch "$NEXT"; then
    add_notice "Production is now \`$NEXT\` (this branch's .claude/production-branch still says \`$PROD\`); compared with \`$NEXT\`. Merging production in updates the file."
    PROD="$NEXT"
  fi
fi

if [ "$AGENT" = "codex" ]; then
  BRANCH_HINT="\`git checkout -b codex/<slug>\`"
  FRESH_HINT="\`git checkout -b codex/<new-slug> origin/$PROD\`"
else
  BRANCH_HINT="\`git fetch origin && git checkout --no-track -b claude/<slug> origin/$PROD\`"
  FRESH_HINT="\`git checkout --no-track -b claude/<new-slug> origin/$PROD\`"
fi
HAVE_PROD="no"
git rev-parse -q --verify "refs/remotes/origin/$PROD^{commit}" >/dev/null 2>&1 && HAVE_PROD="yes"

# A shallow clone may not reach the common ancestor: deepen it so the comparison is real
if [ "$FETCHED" = "yes" ] && [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ] \
   && ! git merge-base HEAD "origin/$PROD" >/dev/null 2>&1; then
  log "shallow clone — fetching more history"
  gitnet fetch --quiet --unshallow origin >/dev/null 2>&1 || gitnet fetch --quiet --deepen=5000 origin >/dev/null 2>&1 || true
  fetch_branch "$PROD" || true
fi

GIT_DIR_PATH="$(git rev-parse --git-dir 2>/dev/null || echo .git)"
IN_PROGRESS=""
[ -f "$GIT_DIR_PATH/MERGE_HEAD" ] && IN_PROGRESS="merge"
{ [ -d "$GIT_DIR_PATH/rebase-merge" ] || [ -d "$GIT_DIR_PATH/rebase-apply" ]; } && IN_PROGRESS="rebase"
[ -f "$GIT_DIR_PATH/CHERRY_PICK_HEAD" ] && IN_PROGRESS="cherry-pick"

DIRTY="no"
if ! git diff --quiet HEAD 2>/dev/null; then DIRTY="yes"; fi
if ! git diff --cached --quiet 2>/dev/null; then DIRTY="yes"; fi
DIRTY_NOTE=""
if [ "$DIRTY" = "yes" ]; then
  if [ "$SOURCE" = "startup" ]; then
    DIRTY_NOTE=" Uncommitted changes were already present when this session started (kept as they are)."
    add_notice "Uncommitted changes were already in the working tree at session start — this session did not make them. Ask the user before editing, committing or discarding them (CLAUDE.md safety rule 4)."
  else
    DIRTY_NOTE=" Uncommitted changes are present (kept as they are) — commit them as part of this session's work."
  fi
fi

# Behind/ahead counts vs production; empty when they can't be computed
counts() { git rev-list --left-right --count "origin/$PROD...HEAD" 2>/dev/null; }

if [ -n "$IN_PROGRESS" ]; then
  SYNC_STATUS="⚠️ A git $IN_PROGRESS is in progress on \`$LABEL\` — sync skipped. Finish it or abort it first (\`git $IN_PROGRESS --continue\` / \`git $IN_PROGRESS --abort\`), then re-check the branch against production."
  add_notice "A git $IN_PROGRESS was left in progress (probably interrupted by a context compaction or restart). Finish or abort it before doing anything else."
elif [ "$AGENT" = "claude" ] && [ -z "$CURRENT_BRANCH" ]; then
  SYNC_STATUS="⛔ Detached HEAD — STOP. Check out a session branch from origin/$PROD before doing anything else: $BRANCH_HINT."
  BLOCKER="yes"
elif [ "$AGENT" = "claude" ] && [ "$CURRENT_BRANCH" = "$PROD" ]; then
  read -r PB PA <<< "$(counts || echo '- -')"
  if [ "$SOURCE" != "startup" ] && [ "$FETCHED" = "yes" ] && [ "$PB" = "0" ] && [ "${PA:-0}" != "0" ] && [ "$PA" != "-" ]; then
    SYNC_STATUS="⚠️ On \`$PROD\` with $PA unpushed commit(s) — an end-session merge was interrupted. Finish it: CLAUDE.md end-session step 7 (checks on the merged result, \`git push origin $PROD\`) and step 8 (back to the session branch, fast-forward it, push)."
    add_notice "An end-session merge into \`$PROD\` is waiting to be pushed. Finish steps 7–8 before anything else."
  else
    SYNC_STATUS="⛔ On the production branch \`$PROD\` directly — STOP. Every push to it goes live at $LIVE_URL; sessions belong on their own branch. Create one: $BRANCH_HINT."
    BLOCKER="yes"
  fi
elif [ "$AGENT" = "claude" ] && [ "$FETCHED" = "no" ]; then
  SYNC_STATUS="‼️ git fetch origin $PROD failed (or timed out) — cannot verify sync state. Surface this to the user before continuing."
  BLOCKER="yes"
elif [ "$HAVE_PROD" = "no" ]; then
  SYNC_STATUS="⚠️ Could not reach GitHub and this checkout has no copy of production to compare with (normal in Codex cloud tasks, which have no internet). Make sure this task was started from branch \`$PROD\` — if it was started from any other branch, stop and tell the owner. Work on your own branch: $BRANCH_HINT."
elif ! git merge-base HEAD "origin/$PROD" >/dev/null 2>&1 || [ -z "$(counts)" ]; then
  SYNC_STATUS="⛔ Cannot compare \`$LABEL\` with production (no common history found — a shallow clone that could not be deepened, or an unrelated branch). Nothing was changed. STOP and tell the user; try \`git fetch --unshallow origin\` and run the check again."
  BLOCKER="yes"
else
  UPSTREAM="origin/$PROD"
  STALE_NOTE=""
  [ "$FETCHED" = "no" ] && STALE_NOTE=" (compared with this checkout's copy of production — GitHub was not reachable, so production may have newer commits)"
  read -r BEHIND AHEAD <<< "$(counts)"
  SHORT="$(git rev-parse --short HEAD)"
  BRANCH_NOTE=""
  if [ "$AGENT" = "codex" ] && { [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "$PROD" ]; }; then
    BRANCH_NOTE=" This is a copy of production — create your branch before changing anything: $BRANCH_HINT."
  fi

  if [ "$AHEAD" = "0" ] && [ "$BEHIND" = "0" ]; then
    SYNC_STATUS="✅ \`$LABEL\` is at production HEAD (\`$PROD\` @ $SHORT)$STALE_NOTE.$DIRTY_NOTE$BRANCH_NOTE"
  elif [ "$AHEAD" = "0" ]; then
    # Behind only: a fast-forward. --ff-only never discards commits, and git refuses (rather than
    # overwriting) when uncommitted or untracked files would be clobbered.
    if FF_ERR="$(git merge --ff-only --quiet "$UPSTREAM" 2>&1 >/dev/null)"; then
      SYNC_STATUS="✅ \`$LABEL\` fast-forwarded to production (\`$PROD\` @ $(git rev-parse --short HEAD); was $BEHIND commit(s) behind)$STALE_NOTE.$DIRTY_NOTE$BRANCH_NOTE"
    else
      WHY="$(printf '%s\n' "$FF_ERR" | grep -m 1 . | sed 's/^error: //')"
      SYNC_STATUS="⛔ \`$LABEL\` is $BEHIND commit(s) behind production and could not be fast-forwarded — git says: \"$WHY\". Nothing was changed. STOP and ask the user, then either set the changes aside and fast-forward: \`git stash push -u && git merge --ff-only origin/$PROD && git stash pop\`, or commit them and merge: \`git merge origin/$PROD\`."
      BLOCKER="yes"
    fi
  elif [ "$BEHIND" = "0" ]; then
    # Ahead only: the branch already contains all of production plus unmerged work. Never discard it.
    SYNC_STATUS="✅ \`$LABEL\` contains all of production (\`$PROD\`) plus $AHEAD unmerged commit(s) — they go live when merged into production$STALE_NOTE.$DIRTY_NOTE$BRANCH_NOTE"
    if [ "$SOURCE" = "startup" ]; then
      add_notice "This new session found $AHEAD commit(s) on \`$LABEL\` that never reached production (an earlier session did not finish with \"end session\"). Tell the user in your first reply — these changes are NOT live yet, and the next \"end session\" would ship them. Newest: $(git log -1 --format='%h %s' HEAD)"
    fi
  else
    SYNC_STATUS="⛔ \`$LABEL\` has diverged from production (ahead=$AHEAD, behind=$BEHIND vs origin/$PROD; source=${SOURCE:-unknown}).$DIRTY_NOTE Nothing was changed. STOP and ask the user: (a) RECOMMENDED — keep the session work and bring production in: \`git merge origin/$PROD\`; (b) set this branch's work aside and start fresh from production: $FRESH_HINT (the old branch and its commits stay untouched; uncommitted changes come along if they don't clash); (c) end the session now via the end-session protocol so the work merges into production."
    BLOCKER="yes"
  fi
fi
log "$SYNC_STATUS"

# GitHub's default branch must be the production branch: web sessions are created from it.
DEFAULT_BRANCH="$(GIT_NET_TIMEOUT=20 gitnet ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2; exit }')"
if [ -n "$DEFAULT_BRANCH" ] && [ "$DEFAULT_BRANCH" != "$PROD" ]; then
  add_notice "GitHub's default branch is \`$DEFAULT_BRANCH\` but production is \`$PROD\` (.claude/production-branch). New web sessions start from the default branch, so they can miss newer work and this protocol. Tell the user: GitHub → Settings → General → Default branch → \`$PROD\` (and keep Vercel's production branch the same)."
fi

# Other agents' unmerged work (claude/* and codex/* branches touched in the last 14 days)
WIP=""
if [ "$FETCHED" = "yes" ]; then
  gitnet fetch --prune --quiet origin '+refs/heads/codex/*:refs/remotes/origin/codex/*' '+refs/heads/claude/*:refs/remotes/origin/claude/*' 2>/dev/null || true
fi
if [ "$HAVE_PROD" = "yes" ]; then
  NOW="$(date +%s)"
  MINE="$(git diff --name-only "origin/$PROD...HEAD" 2>/dev/null)"
  for REF in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/codex/ refs/remotes/origin/claude/ 2>/dev/null); do
    NAME="${REF#origin/}"
    { [ "$NAME" = "$CURRENT_BRANCH" ] || [ "$NAME" = "$PROD" ]; } && continue
    N="$(git rev-list --count "origin/$PROD..$REF" 2>/dev/null || echo 0)"
    [ "$N" = "0" ] && continue
    TS="$(git log -1 --format=%ct "$REF" 2>/dev/null || echo 0)"
    [ $((NOW - TS)) -gt $((14 * 86400)) ] && continue
    WHO="Claude"; case "$NAME" in codex/*) WHO="Codex" ;; esac
    FILES="$(git diff --name-only "origin/$PROD...$REF" 2>/dev/null)"
    COUNT="$(printf '%s\n' "$FILES" | grep -c .)"
    SHOWN="$(printf '%s\n' "$FILES" | head -n 6 | join_files)"
    [ "$COUNT" -gt 6 ] && SHOWN="$SHOWN … +$((COUNT - 6)) more"
    LINE="- \`$NAME\` ($WHO, $N unmerged commit(s), $(git log -1 --format=%cd --date=short "$REF")): $SHOWN"
    OVERLAP="$(comm -12 <(printf '%s\n' "$MINE" | grep . | sort -u) <(printf '%s\n' "$FILES" | grep . | sort -u))"
    if [ -n "$OVERLAP" ]; then
      OV="$(printf '%s\n' "$OVERLAP" | head -n 6 | join_files)"
      LINE="$LINE — ⚠️ also changed on this branch: $OV"
      add_notice "\`$NAME\` ($WHO) has unmerged changes to files this branch also changes ($OV). Coordinate before editing them further — see CLAUDE.md → \"Working with Codex\"."
    fi
    WIP="${WIP}${LINE}
"
  done
fi
[ -z "$WIP" ] && WIP="(none)
"

# Newest entry of SESSION_LOG.md: the first "### " block (outside ``` / ~~~ fences), up to the
# next #, ## or ### heading, capped so a malformed log can't flood the context
LAST_SESSION_LOG=""
EARLIER_LOG=""
if [ -f SESSION_LOG.md ]; then
  # Mid-merge the working file may hold conflict markers — read the committed version instead
  if grep -q '^<<<<<<< ' SESSION_LOG.md; then LOG_TEXT="$(git show HEAD:SESSION_LOG.md 2>/dev/null)"; else LOG_TEXT="$(cat SESSION_LOG.md)"; fi
  LAST_SESSION_LOG="$(printf '%s\n' "$LOG_TEXT" | awk '
    /^(```|~~~)/ { fence = !fence }
    !fence && /^### / && !started { started = 1; print; next }
    started && !fence && /^(#|##|###) / { exit }
    started { if (++n > 150) { print "… (entry truncated — see SESSION_LOG.md)"; exit } print }
  ')"
  # Headings of the next few entries, so a parallel session's entry is never hidden
  EARLIER_LOG="$(printf '%s\n' "$LOG_TEXT" | awk '
    /^(```|~~~)/ { fence = !fence }
    !fence && /^### / { if (++n >= 2 && n <= 5) print "- " substr($0, 5) }
  ')"
fi
[ -z "$LAST_SESSION_LOG" ] && LAST_SESSION_LOG="(no previous entry found in SESSION_LOG.md)"
[ -n "$EARLIER_LOG" ] && LAST_SESSION_LOG="$LAST_SESSION_LOG

Earlier entries (read SESSION_LOG.md for details):
$EARLIER_LOG"

# === Baseline checks (run even when blocked, so the report is complete) ===
INSTALL_STATUS="⚠️  skipped"; TYPECHECK_STATUS="⚠️  skipped"; LINT_STATUS="⚠️  skipped"; TEST_STATUS="⚠️  skipped"
if [ "${SESSION_START_SKIP_CHECKS:-}" = "1" ]; then
  log "baseline checks skipped (SESSION_START_SKIP_CHECKS=1)"
elif [ ! -f "$APP_DIR/package.json" ]; then
  INSTALL_STATUS="‼️ heart-simulator/package.json not found — checks not run"
else
  cd "$APP_DIR" || true
  export CI=1 NEXT_TELEMETRY_DISABLED=1
  # Skip npm ci only when nothing that decides the install changed since its last successful run
  STAMP_VAL="$( { cat package.json package-lock.json; node -v; } 2>/dev/null | sha256sum | cut -d' ' -f1)"
  STAMP="node_modules/.session-start-stamp"
  if [ -f node_modules/.package-lock.json ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$STAMP_VAL" ]; then
    INSTALL_STATUS="✅ dependencies unchanged since the last npm ci (skipped)"
  else
    log "npm ci..."
    # npm ci installs exactly what the lockfile says and never rewrites it
    if npm ci --no-audit --no-fund --loglevel=error >&2 2>&1; then
      INSTALL_STATUS="✅ npm ci"
      printf '%s' "$STAMP_VAL" > "$STAMP"
    else
      INSTALL_STATUS="‼️ npm ci FAILED (no internet? is package-lock.json in sync with package.json? Regenerate it with npm 11: \`npx -y npm@11 install\`)"
    fi
  fi

  log "npm run typecheck..."
  if npm run typecheck >&2 2>&1; then TYPECHECK_STATUS="✅ npm run typecheck"; else TYPECHECK_STATUS="‼️ npm run typecheck FAILED"; fi

  log "npm run lint..."
  if npm run lint </dev/null >&2 2>&1; then LINT_STATUS="✅ npm run lint"; else LINT_STATUS="‼️ npm run lint FAILED"; fi

  log "npm test..."
  if npm test --silent >&2 2>&1; then TEST_STATUS="✅ npm test"; else TEST_STATUS="‼️ npm test FAILED"; fi
  cd "$REPO_ROOT" || true
fi

# === Emit unified context ===
HEADER=""
if [ "$BLOCKER" = "yes" ]; then
  HEADER="⛔ SESSION-START BLOCKER — the hook could not confirm that this branch contains the latest production (\`$PROD\`) and could not safely fix it. Per CLAUDE.md, no session may work from a branch that is missing production commits. Before doing ANY other work, surface the sync status below to the user and resolve it. Do not start the user's task until it is resolved.

"
fi
if [ -n "$NOTICES" ]; then
  HEADER="${HEADER}⚠️ SESSION-START NOTICE — mention the following to the user in your first reply:
${NOTICES}
"
fi

if [ "$AGENT" = "codex" ]; then
  REMINDER="Reminder: \`$PROD\` is the live production branch ($LIVE_URL). Work on a \`codex/<slug>\` branch; it goes live only through the end-session protocol in CLAUDE.md (or a pull request into \`$PROD\` that Claude reviews and merges — see AGENTS.md). Never push to \`$PROD\` directly."
else
  REMINDER="Reminder: \`$PROD\` is the live production branch ($LIVE_URL). All work happens on \`$LABEL\` and only goes live when the user types \"end session\" and CLAUDE.md's end-session protocol merges this branch into \`$PROD\`."
fi

CONTEXT="${HEADER}${POLICY_BLOCK}

## Session start — automatic baseline

Agent: $AGENT · branch: \`$LABEL\` · production branch: \`$PROD\` ($LIVE_URL)
Sync: $SYNC_STATUS

Baseline checks in heart-simulator/ (already executed — no need to rerun):
- $INSTALL_STATUS
- $TYPECHECK_STATUS
- $LINT_STATUS
- $TEST_STATUS

$REMINDER

## Unmerged work on other branches (claude/*, codex/* — last 14 days)

$WIP
## Previous session (newest entry in SESSION_LOG.md)

$LAST_SESSION_LOG"

emit_context "$CONTEXT"
exit 0
