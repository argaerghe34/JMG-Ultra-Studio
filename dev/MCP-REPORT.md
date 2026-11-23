# The Premiere Pro MCP and Ultra Studio – report (23 Nov 2026)

**In short.**
- **The MCP now works inside Ultra Studio.** Ultra Studio starts its own copy of the Premiere Pro MCP you installed and hands its tools to Claude in **Ask**. In real Premiere:
  - Claude answered a question about the open timeline using only the MCP. It took 8 seconds and cost 3¢.
  - Claude added a marker through the MCP after the approval card, then checked that it was there. It took 12 seconds and cost 4.5¢.
- **The footage rule holds.** Only text goes back to the AI. The MCP tools that would send pictures or sound anywhere are never offered.
- **It's a prototype on GitHub (commit 195190d), not in a release yet.** Your installed copy is the released 1.3.43.1, without it.
- **Resolve 21.1 has an MCP server of its own, built in.** The Resolve version should work the other way round: Ultra Studio *offers* its tools to Claude (see part 4).

Also done today:
- **1.3.43.1 is tested in Premiere on the Mac.** Lines built from a sequence now keep their picture and sound.
  - The new test passes. It fails on the old code, so it really catches the bug.
  - All 16 Story tests pass.
  - The release page is ticked. Windows and Resolve are still listed in `dev/PENDING-TESTS.md`.

---

## 1. What the Premiere Pro MCP is

`premiere-pro-mcp` 1.31.0 (from leancoderkavy) has 411–551 tools, depending on the permissions it's started with. It has two halves inside Premiere:

| Half | How it reaches Premiere | On this Mac |
|---|---|---|
| **UXP plugin** | The plugin connects to the server on `127.0.0.1:7777`, a WebSocket with a token | **Installed and connected** |
| **CEP panel** | A folder of command files that the panel reads every 200 ms | **Not installed.** About 300 of the tools need it, so they can't run here. |

Things that matter for Ultra Studio:
- **Several copies can run at once.** A copy that needs Premiere asks the current one, using the shared token, to hand the connection over (new in 1.31.0). Ultra Studio's copy took over in about 2 s, then each read took 3–160 ms.
  - Your Claude Code copy and Ultra Studio's copy take the connection from each other when both are busy. That costs about 2–6 s each time.
- **Permissions:** the server can be limited to *inspect*, *edit*, *export* and *filesystem*. *unsafe-script* is off unless named. Ultra Studio starts its copy with **inspect, edit** only.
- **Its own safety net:**
  - Plans are previewed before they're applied, with a one-time token that's checked again before applying.
  - Sequence checkpoints (copies).
  - A recovery lock after an unclear result.
  - Every tool says whether it only reads (167 of 411 do).
- **What it does that Ultra Studio's ExtendScript can't** (through the UXP half):
  - Premiere's own transcripts as text, and searching them.
  - Scene edit detection.
  - Effects and keyframes.
  - Markers with colours and types.
  - Precise slips, slides and ripples, checked before they're applied.
  - Caption tracks.
  - Timeline checks before and after an edit.
  - Number-only analysis on this computer: scopes, silence, beats and QC.

## 2. What was built: Ultra Studio as an MCP *client*

**`js/core/mcp.js` – `US.mcp`**
- **Starting the server:** it starts its own copy of the MCP server, using the setup you made for Claude Code (`~/.claude.json`) or a server set in Settings.
  - The token is read from your setup and used only to start the copy. It is never stored or sent anywhere else.
- **Tools:** it lists the tools and calls them.
- **Answers are text only.** Pictures and sound in an answer are left out, and the answer says how many.
- **Never offered:**
  - **Footage would leave this computer:** `capture_frame` (gives the AI a picture), `transcribe_audio` (uploads sound to ElevenLabs), `transcribe_clip_uxp` (may use Adobe's cloud).
  - **Whole projects:** tools that open, close, create or "save as" a project.
  - **Scripts the AI writes:** script runners.
- **Its own copy is restricted:**
  - Its permissions are *inspect, edit*, and it gets no ElevenLabs key.
  - It has its own command folder. Without that, starting it would clear commands your Claude Code copy has in progress.
  - Premiere gets a 90 s wait, and a read is tried once more if Premiere was busy.
- **Only tools that can run here are offered.** It asks the MCP which half each tool needs and which halves answer. Here: UXP yes, CEP no, so 109 usable tools.

**`js/tools/40-assistant-mcp.js` – two new tools in every Ask chat:**
- `mcp.find`: the best-matching MCP tools for a few words, with their arguments and whether each only reads. It's free.
- `mcp.call`: runs one tool.
  - Reading runs straight away.
  - **A change shows Ask's approval card first**, with the tool and its exact arguments. The journal notes that it can be undone only with Premiere's own Edit › Undo.

**Tests:**
- 6 unit tests, using a stand-in MCP server: framing, the blocked tools, text-only answers, the restricted copy, Claude Code's setup, and which bridge a tool needs.
- One end-to-end test in real Premiere, `dev/e2e/67-mcp-ask.e2e.js`.
- All 911 unit tests pass.

## 3. Results (real Premiere 2027, test project, real Claude Sonnet 5.5)

| | What happened | Time | Cost |
|---|---|---|---|
| **Start** | Ultra Studio started its copy and listed 411 tools (167 read-only). It read the open timeline through the MCP and saw the same two clips in the same places as its own commands. | 0.8 s start, 6 ms read | free |
| **Safety checks** | Reading ran straight away and changing markers asked first. `capture_frame`, `transcribe_audio` and unknown tools were refused. | – | free |
| **B: a question** | *"Using only the Premiere MCP, how many clips are on V1, and where do they start?"* Claude ran `mcp.find`, then `inspect_sequence_structure_uxp`, and answered: "Video track 1 of 'Test – MCP' has 2 clips. The first starts at 0:00 and the second at 0:04. Nothing was changed." Correct, and nothing needed approval. | 8 s | $0.031 |
| **C: a change** | *"Add a sequence marker 'MCP test' at 3 s through the MCP."* Claude ran `mcp.find`, then `manage_markers_uxp`. **The approval card showed** `{"action":"add","owner_type":"sequence","name":"MCP test","start_seconds":3}` and it ran after approval. Claude then ran `list_markers_uxp` to check. The marker is there at 3.00 s. | 12 s | $0.045 |

**What went wrong first, and was fixed:**
1. **The CEP half isn't installed, and nothing said so.** Claude picked a CEP tool and waited 90 s. It reported honestly that it couldn't do it. Fix: only tools whose half answers are offered.
2. **Premiere can be busy.** Premiere runs one script at a time, so a read could time out while Ultra Studio's own command ran. Fix: a longer wait, and one more try for reads.

**Not related to the MCP:** the AI Ask test 40d asked before adding a marker to the chat's *own* copy, which it shouldn't need to. This is Ultra Studio's own marker tool (no MCP step ran in that test), and it's worth fixing separately. The other Ask tests (40, 40b, 40c, 40e, 40f, 40g) pass.

## 4. Resolve: what the equivalent is

- **Resolve Studio 21.1 (8 Sep 2026) has an MCP server built in** (File › Setup AI Assistants). It sets itself up for Claude Desktop, Claude Code and Codex.
  - Blackmagic hasn't published its tool list or how it connects. Its readme says only "Native MCP server for interacting with AI assistants".
  - The demonstrations: organise media, rename, batch render, export markers, apply a LUT to node 2 of every clip, reframe to 9:16, and write and run scripts.
  - Sources: [Blackmagic readme](https://www.blackmagicdesign.com/support/content/readme/baf7c071c0524fbf8ccc961925c9f443), [Digital Production](https://digitalproduction.com/2026/09/08/resolve-21-1-adds-mcp-and-finally-gets-presets/), [YMCinema](https://ymcinema.com/2026/09/17/davinci-resolve-21-1-mcp-ai-assistants-control-edit/).
- **21.1 also makes scripting and Workflow Integrations Studio-only**, and adds about 20 script commands. Two matter here:
  - **Reading Resolve's own transcripts with speakers and times.**
  - **Making multicam clips and SmartSwitch.**
  - Also new: auto-align, transitions, fades, speed changes, and audio normalise.
- **Community servers (all MIT licence):**
  - [samuelgursky/davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp): about 4.3k stars, v5.4.0 on 20 Nov. 37 combined tools, or about 390 single ones. It needs *External scripting: Local* and a Python install.
  - [DigitalWorkflowCompany/resolve-mcp](https://github.com/DigitalWorkflowCompany/resolve-mcp): about 88 tools, barely maintained.
  - [flamexnreal/davinci-resolve-ai-bridge-mcp](https://github.com/flamexnreal/davinci-resolve-ai-bridge-mcp): about 46 tools, runs on Free through a Lua bridge.
- **What Resolve's scripting still can't do:**
  - Keyframes on the Edit page Inspector, other than through Fusion.
  - Blade, move or slip existing clips. Ultra Studio deletes and lays them again, as it does now.
  - Fairlight effects.
  - Reading the pixels of a frame.

**So for Resolve, the better way is the other way round: Ultra Studio *serves* MCP.**
- Its Electron plugin already holds Resolve's scripting object. It can run a small MCP server on this computer, `127.0.0.1` with a random port and a token, so that Claude Desktop and Claude Code can use Ultra Studio's tested commands. Those commands would be:
  - Story: search lines, build from lines, themes.
  - Selects.
  - Silence Cut.
  - Final Check.
  - Deliver.
- Blackmagic's own server covers general Resolve control alongside it.
- Being a *client* adds little in Resolve, because Ultra Studio can call the API directly. It would also need External scripting switched on and Python.

## 5. Proposals – what to build next (Premiere first, as you asked)

**Quick wins (days)**
1. **Settings › AI › Premiere MCP:** shows whether it's found, which half is connected, how many tools can run, and a Test button. Plus a switch to turn it off and a choice of how much it may do: *look only* or *look and edit*.
2. **Install the MCP's CEP panel too.** That unlocks about 300 more tools, and its own readme recommends it. One step in its installer; you'd need to agree to it, because it adds a panel to Premiere.
3. **Ask uses the MCP's checks after its own edits:** `verify_timeline_postconditions`, and `predict_timeline_edit` before risky ones.
4. **Story reads Premiere's own transcripts** through `get_clip_transcript_uxp` when a clip already has one. That means no second transcription, and speaker names come too.

**Medium (a week or two)**
5. **Ultra Studio as an MCP server for Claude Desktop and Claude Code**, in Premiere and Resolve alike. The same small server in the panel offers Ultra Studio's own tools: Story search and build, Selects, Final Check, Deliver, and the Ask journal with Undo. Claude Code, or a Claude Desktop project, could then say *"build a 2-minute cut from the Next Chapter lines and run Final Check"*, and Ultra Studio does it with its tested code and safety rules.
6. **Markers, colours, effects and keyframes through UXP**, where ExtendScript can't. For example, marker colours, and keyframed punch-ins on Story builds, through `manage_markers_uxp` and `automate_effect_parameters_uxp`.
7. **Scene edit detection for Selects and Subclip Maker**, using `detect_scene_edits_uxp` as a second opinion.

**Big bets**
8. **"Edit plans" across both:** Ask writes a plan, the MCP previews it with its one-time token, you approve it in Ultra Studio's card, then the MCP applies it and checks it. Ultra Studio's journal gets the MCP's checkpoint, so Undo can go back to the copy.
9. **Resolve 21.1:** Story reads Resolve's own transcripts, and multicam and SmartSwitch become available to Story and MC Selects. Once Blackmagic publishes its tool list, connect to its built-in MCP the same way.

**Risks to keep in mind**
- **The MCP is a third-party project** that changes weekly; it's had about 30 versions. Ultra Studio should keep working without it, which it does now: the tools simply don't appear.
- **Its copies take the Premiere connection from each other.** If Claude Code is busy with the MCP at the same time as Ultra Studio, each wait costs a few seconds.
- **Changes made through the MCP aren't in Ultra Studio's Undo.** The approval card says so. Proposal 8 would fix that.

*Code: `js/core/mcp.js`, `js/tools/40-assistant-mcp.js`, `dev/tests/mcp.test.js`, `dev/e2e/67-mcp-ask.e2e.js`. Research notes: the MCP's code was read, nothing was installed, and nothing in Resolve was touched (as you asked).*
