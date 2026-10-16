# Cardiac-map agent instructions

These instructions apply to Codex and all agents working anywhere in this repository.

1. Read `CLAUDE.md`, `README.md`, and `fix_list.md` before project work.
2. Follow the mandatory start-session and end-session protocols in `CLAUDE.md`.
   They apply to code, graphics, assessments, documentation, and quick fixes.
3. `main` is the canonical integration branch. Fetch and verify `origin/main`
   before editing in every new session. Never assume an old branch is current.
4. "End session" means commit, session-log update, push, validation, merge into
   main, push main, and return to the working branch, unless the user explicitly
   says not to merge. Report blockers truthfully; a draft PR alone is not completion.
5. Do not assume Claude Code hooks execute in Codex. Use the manual checks.
6. Codex owns frontend presentation; Claude Code owns functional integrations,
   backend, authorization, data contracts and clinical algorithms. Preserve those
   boundaries, and coordinate integration changes rather than changing them silently.
7. Do not copy private Pressure-washing session history, credentials, application
   configuration, or deployment assumptions into this public repository.
