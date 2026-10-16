#!/usr/bin/env bash
# Tests for session-start.sh: runs the hook against throwaway git repos in every branch state it
# handles and checks the message it emits, that its output is valid JSON, and that it never
# loses a commit or an uncommitted change.
#
#   bash .claude/hooks/session-start.test.sh
#
# The npm baseline checks are skipped here (SESSION_START_SKIP_CHECKS=1); they are plain npm scripts.

set -uo pipefail

HOOK="$(cd "$(dirname "$0")" && pwd)/session-start.sh"
PROD="prod-branch"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$1"; }

# A fresh "GitHub" (bare origin whose default branch is $PROD) and a clone on session branch claude/test
setup() {
  rm -rf "$WORK/origin.git" "$WORK/clone" "$WORK/seed"
  git init -q --bare -b "$PROD" "$WORK/origin.git"
  git init -q -b "$PROD" "$WORK/seed"
  (
    cd "$WORK/seed"
    mkdir -p .claude heart-simulator
    printf '%s\n' "$PROD" > .claude/production-branch
    printf 'shared\n' > shared.txt
    printf '# Fix list\n\n## Open\n\n- [ ] keep me\n' > fix_list.md
    printf '# Session log\n\n```\n### template heading inside a fence\n```\n\n### 2026-01-02 — newest (second)\nnewest body\n\n### 2026-01-01 — older (first)\nolder body\n' > SESSION_LOG.md
    git add -A && git commit -qm "base"
    git remote add origin "$WORK/origin.git"
    git push -q origin "$PROD"
  )
  git clone -q "$WORK/origin.git" "$WORK/clone"
  git -C "$WORK/clone" checkout -q --no-track -b claude/test "origin/$PROD"
}

# Commit on production (as if another session had merged work)
advance_prod() {
  (
    cd "$WORK/seed"
    printf 'prod %s\n' "$1" >> "prod-$1.txt"
    git add -A && git commit -qm "prod $1" && git push -q origin "$PROD"
  )
}

commit_local() {
  (cd "$WORK/clone" && printf 'local %s\n' "$1" > "local-$1.txt" && git add -A && git commit -qm "local $1")
}

# Runs the hook; sets OUT (raw stdout) and CTX (additionalContext)
run_hook() {
  local source="${1:-startup}" remote="${2:-true}"
  OUT="$(cd "$WORK/clone" && printf '{"source":"%s"}' "$source" | CLAUDE_PROJECT_DIR="$WORK/clone" CLAUDE_CODE_REMOTE="$remote" SESSION_START_SKIP_CHECKS=1 bash "$HOOK" 2>/dev/null)"
  CTX="$(printf '%s' "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["hookSpecificOutput"]["hookEventName"]=="SessionStart"; print(d["hookSpecificOutput"]["additionalContext"])' 2>/dev/null)" || CTX="__INVALID_JSON__"
}

expect_ctx() { if [[ "$CTX" == *"$1"* ]]; then ok "$2"; else bad "$2 (missing: $1)"; fi; }
expect_no_ctx() { if [[ "$CTX" != *"$1"* ]]; then ok "$2"; else bad "$2 (unexpected: $1)"; fi; }
expect_head() { local h; h="$(git -C "$WORK/clone" rev-parse HEAD)"; if [ "$h" = "$1" ]; then ok "$2"; else bad "$2 (HEAD $h, expected $1)"; fi; }
expect_json() { if [ "$CTX" != "__INVALID_JSON__" ]; then ok "stdout is one valid SessionStart JSON object"; else bad "stdout is not valid JSON: $OUT"; fi; }

echo "local session: policy only, no git changes"
setup
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"; advance_prod 1
run_hook startup false
expect_json
expect_ctx "SESSION STARTUP — REQUIRED FIRST STEP" "policy injected"
expect_ctx "Local environment" "local note shown"
expect_head "$BEFORE" "no sync in a local session"

echo "level with production"
setup
run_hook startup
expect_json
expect_ctx "is at production HEAD" "reports level"
expect_no_ctx "SESSION-START BLOCKER" "no blocker"
expect_ctx "newest body" "injects the newest SESSION_LOG entry"
expect_no_ctx "older body" "injects only the newest entry"
expect_no_ctx "template heading inside a fence" "ignores headings inside code fences"

echo "behind only → fast-forward"
setup; advance_prod 1; advance_prod 2
run_hook startup
expect_ctx "fast-forwarded to production" "fast-forwards"
expect_head "$(git -C "$WORK/origin.git" rev-parse "$PROD")" "HEAD is production HEAD"

echo "behind only + unrelated uncommitted change → fast-forward keeps the change"
setup; advance_prod 1
printf 'edited\n' >> "$WORK/clone/shared.txt"
run_hook resume
expect_ctx "fast-forwarded to production" "fast-forwards"
expect_ctx "Uncommitted changes are present" "mentions the uncommitted change"
if grep -q edited "$WORK/clone/shared.txt"; then ok "uncommitted change kept"; else bad "uncommitted change lost"; fi

echo "behind only + uncommitted change to a file production changed → blocker, nothing touched"
setup
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"
(cd "$WORK/seed" && printf 'prod edit\n' >> shared.txt && git commit -qam "prod edits shared" && git push -q origin "$PROD")
printf 'local edit\n' >> "$WORK/clone/shared.txt"
run_hook resume
expect_ctx "SESSION-START BLOCKER" "blocker"
expect_ctx "could not be fast-forwarded" "explains why"
expect_head "$BEFORE" "HEAD unchanged"
if grep -q "local edit" "$WORK/clone/shared.txt"; then ok "uncommitted change kept"; else bad "uncommitted change lost"; fi

echo "ahead only, fresh session → keeps commits and raises a notice"
setup; commit_local 1; commit_local 2
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"
run_hook startup
expect_ctx "plus 2 unmerged commit(s)" "reports unmerged commits"
expect_ctx "SESSION-START NOTICE" "notice on a fresh session"
expect_no_ctx "SESSION-START BLOCKER" "no blocker"
expect_head "$BEFORE" "commits kept"

echo "ahead only, resumed session → keeps commits quietly"
run_hook resume
expect_no_ctx "SESSION-START NOTICE" "no notice on resume"
expect_no_ctx "SESSION-START BLOCKER" "no blocker"
expect_head "$BEFORE" "commits kept"

echo "diverged → blocker, nothing touched"
setup; commit_local 1; advance_prod 1
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"
for src in startup resume compact; do
  run_hook "$src"
  expect_ctx "SESSION-START BLOCKER" "blocker on $src"
  expect_ctx "has diverged from production (ahead=1, behind=1" "explains divergence on $src"
  expect_head "$BEFORE" "HEAD unchanged on $src"
done

echo "on the production branch → blocker"
setup
git -C "$WORK/clone" checkout -q "$PROD"
run_hook startup
expect_ctx "On the production branch" "blocks work on production"
expect_ctx "SESSION-START BLOCKER" "blocker header"

echo "detached HEAD → blocker"
setup
git -C "$WORK/clone" checkout -q --detach
run_hook startup
expect_ctx "Detached HEAD" "blocks detached HEAD"

echo "fetch fails → blocker"
setup
git -C "$WORK/clone" remote set-url origin "$WORK/does-not-exist.git"
run_hook startup
expect_ctx "fetch origin $PROD failed" "blocks when production can't be fetched"

echo "GitHub default branch differs from production → notice"
setup
git -C "$WORK/seed" push -q origin "$PROD:old-default"
git -C "$WORK/origin.git" symbolic-ref HEAD refs/heads/old-default
run_hook startup
expect_ctx "default branch is \`old-default\`" "warns about the default branch"

echo "fix_list.md stub"
setup
run_hook startup
if grep -q "keep me" "$WORK/clone/fix_list.md"; then ok "existing fix_list.md not overwritten"; else bad "fix_list.md overwritten"; fi
rm "$WORK/clone/fix_list.md"
run_hook startup false
if grep -q "^## Open" "$WORK/clone/fix_list.md"; then ok "missing fix_list.md recreated"; else bad "fix_list.md not recreated"; fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
