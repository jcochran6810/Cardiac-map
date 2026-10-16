# Cardiac-map

Interactive cardiac teaching software. The current application is in
[`heart-simulator/`](heart-simulator/README.md). `heart-3d-model/` contains an older
standalone prototype.

## Working on this repository

Read [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), and
[`fix_list.md`](fix_list.md) first. All Claude Code and Codex sessions follow the
start/end session protocol. `main` is the integration source of truth; work on a
dedicated session branch and finish by validating and merging into main, unless
the owner explicitly requests that the work remain unmerged.

Application commands run from `heart-simulator/`:

```sh
npm install
npm run lint
npx tsc --noEmit
npm run build
npm run dev
```

There is currently no automated test script/suite. See the documented validation
gaps and lockfile issue in `fix_list.md`; do not report missing tests as passing.
