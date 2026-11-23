# Tests still to run

Released without being tested (the user asked for this). **At the next chance to test – on any computer, in any chat –
run each test below, record the result here, and remove the entry once it passes** (and tick it on the release's
GitHub page). The user asked for this on 23 Nov 2026. Follow the usual rules: only the test project, and only when
Premiere/Resolve isn't in use (ask first).

## 1.3.43.1 – Story: lines built from a sequence keep both picture and sound
- ✅ **Premiere, Mac – passed 23 Nov 2026:** `66-story-layers-frames` passed (6 lines between frames, each with picture
  and sound, no gaps); the same test FAILS on the old code (checked). All 16 Story tests (`run.js 22`) pass.
- Premiere, Windows: `node dev/e2e/run.js 66-story-layers-frames` and `node dev/e2e/run.js 22`
  Expect: every line has a picture and a sound clip that start and end together, no gaps, nothing listed as missing.
- Resolve (Mac, then Windows) – not yet: the user asked to get Premiere right first (23 Nov 2026): build from a timeline with Story working on it, in "JMG Ultra Studio Test", and check
  each line has picture and sound with no gap or overlap (`node dev/e2e/run.js --resolve 22`).
- Release: https://github.com/argaerghe34/JMG-Ultra-Studio/releases/tag/v1.3.43.1
