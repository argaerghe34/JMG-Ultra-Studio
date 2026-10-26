# Ultra Studio for DaVinci Resolve or Final Cut Pro – notes for later (26 Oct 2026)

Not started; kept for when the user wants to decide.

**What moves across.** About half the code doesn't depend on Premiere: transcripts, themes, How picky, the narrative,
Moments, AI costs, documents, picture and sound analysis. What has to be rewritten per editor is the Premiere layer
(`jsx/` – about 90 commands: build sequences, markers, clip colours, bins, exports, reading transcripts).

**DaVinci Resolve – realistic (recommended first).** Resolve Studio (paid) runs web-technology "Workflow Integration"
panels, so the screens and logic can largely be reused with a new Resolve layer (Resolve's scripting API). Believed
not available in the free Resolve – to confirm. Most tools should carry over (Story building, markers/colours, bins,
Selects, Silence Cut, Beats, Songs, Camera Switch, B-roll, Safe Zones, Deliver). To check: whether a panel can read
Resolve's own transcripts (else exported files or a local transcriber). Colour mostly dropped – Resolve's Color page
does it better. Rough size: several weeks plus testing.

**Final Cut Pro – a different project.** No in-app scripting; add-ons are separate Mac apps (Swift) exchanging
FCPXML (workflow extensions / drag and drop). Ultra Studio would be a companion Mac app: drag a project in, get a new
timeline, keyword collections or markers back. Fits Story, Selects, Silence Cut, Beats, Camera Switch; live features
(playhead, live colouring, previews) mostly impossible. Mac-only, screens rebuilt in Apple's tools. Bigger than Resolve.

**Next step when wanted:** a short feasibility check in Resolve (edition needed, panels, transcripts, gaps) before
building anything.
