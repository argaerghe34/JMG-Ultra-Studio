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

## 1.3.44 – the Premiere Pro MCP: Settings, CEP panel, edit checks, Story transcripts
Tested in Premiere on the Mac on 23 Nov 2026 (`68-mcp-features`, `67-mcp-ask`, Ask 40/40b/40e/40g all pass), with two gaps:
- **Premiere, Mac – reading a real Premiere transcript through the MCP.** No clip in the test project has a Premiere
  transcript, and the MCP can't import one into a project of more than 512 items. With the screen unlocked: in the test
  project, select `J001_spoken_interview.mp4` (bin "Test – MCP"), right-click › Transcribe (Premiere's own, on this
  computer), wait for it, then `node dev/e2e/run.js 68`. Expect part D to list that clip with its lines and speaker
  (`info.story.found`), and the project not saved.
- **Premiere, Windows** (needs the MCP installed there: `npm install -g premiere-pro-mcp`, set up for Claude Code, its
  UXP plugin and `premiere-pro-mcp --install-cep`): `node dev/e2e/run.js 68` and `node dev/e2e/run.js 67`. Expect Settings
  › Premiere MCP to show both halves connected, and the checks as on the Mac. Without the MCP both tests skip.
- Resolve: nothing changes there (the Premiere MCP is Premiere only).
- Release: https://github.com/argaerghe34/JMG-Ultra-Studio/releases/tag/v1.3.44
