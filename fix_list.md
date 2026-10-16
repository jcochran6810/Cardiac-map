# Cardiac-map follow-up list

## Validation and workflow

- [ ] Claude Code: repair the existing optional-platform dependency omissions in
  `heart-simulator/package-lock.json`. `npm ci` currently fails. For the UI session,
  `npm install --package-lock=false` installed locally without changing manifests;
  Next.js logged failed automatic lockfile repair but completed its build.
- [ ] Claude Code: establish a meaningful automated test suite/CI. No test script
  or suite exists at this baseline. Type checking uses `npx tsc --noEmit`.
- [ ] Verify GitHub default branch and hosting production-branch configuration
  separately if the owner wants them migrated to main; creating main does not
  itself change hosting or establish a production deployment.

## UI and graphics

- [ ] Complete visual/device/keyboard regression checks and before/after screenshots
  for the UI foundation. In-app browser attachment failed twice during the session.
- [ ] Check 320/375px phones, tablet, desktop, short landscape and 200% zoom,
  especially header height, overlay crowding, search and scope popovers.
- [ ] Supply/confirm the approved anatomical Cardiac-map logo and canonical name.
- [ ] Continue the reviewed UI assessment: resizer keyboard support, dialog focus
  lifecycle, complete tab patterns, content error/retry states, chart access,
  electrode keyboard controls, and eventual full light-theme coverage.

## Claude Code integration follow-up

- [ ] Welcome Pressure & volume card selects Wiggers before openCondition resets
  the dock to ECG; decide/fix intended action ordering.
- [ ] Watch one heartbeat card describes 0.25x but only changes the view; decide
  whether the action or descriptive wording should change.
- [ ] Review presentation-to-state integration for header controls, six view modes,
  label keyboard reachability, scope focus return, search and projector behavior.
