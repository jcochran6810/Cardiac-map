# Cardiac-map

Interactive cardiac teaching software (CardioSim), live at https://cardiacmap.stationinsight.com.
The application is in [`heart-simulator/`](heart-simulator/README.md). `heart-3d-model/` contains an
older standalone prototype that is not built or deployed.

## Working on this repository

Read [`CLAUDE.md`](CLAUDE.md) (Claude Code — the lead), [`AGENTS.md`](AGENTS.md) (Codex — UI and
graphics) and [`fix_list.md`](fix_list.md) first. Both agents follow the same start/end-session
protocol: `main` is production; work happens on a `claude/…` or `codex/…` session branch and goes live
only when an "end session" validates it and merges it into `main`. Session history is in
[`SESSION_LOG.md`](SESSION_LOG.md).

Application commands run from `heart-simulator/`:

```sh
npm ci            # install exactly what package-lock.json lists
npm run dev       # local dev server
npm run check     # typecheck + lint + unit tests (Vitest) + production build
```

GitHub Actions runs the same checks on every push to `main`, `claude/**` and `codex/**`, and on pull
requests into `main`.
