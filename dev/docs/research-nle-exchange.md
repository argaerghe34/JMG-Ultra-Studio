# Research: moving timelines between Premiere, Resolve and Final Cut Pro

Written 18 Nov 2026 for the Deliver tab's "Other editors" feature (Deliver › Other editors).
Sources are linked inline. "Checked locally" means read from the apps on the dev Mac
(Premiere 2027 27.0, Resolve Studio 21.2, Final Cut Pro 12.3). Forum reports are marked as such.

## 1. Existing tools

**XtoCC** (Intelligent Assistance, Mac App Store, about $70): FCPXML → FCP 7 XML (xmeml) for Premiere,
After Effects and Audition. Lets you pick which roles to bring across. Their page says clips, connected clips,
J/L cuts, cross-dissolves and markers transfer cleanly, and maps marker types: unfinished to-do → red,
completed to-do → green, standard → blue.
- https://intelligentassistance.com/xtocc.html
- https://apps.apple.com/app/xtocc/id487899517
- Adobe's old migration guide (2018) says Premiere can't read .fcpxml and points to XtoCC; multicam comes
  across as a Premiere multicam sequence only with 4 or fewer angles. Users report title *text* is often lost
  (an empty text clip arrives) and plug-in overlays break.
  https://larryjordan.com/articles/fcp-x-transfer-projects-to-premiere-pro-cc/

**SendToX** (formerly 7toX): Premiere / FCP 7 XML → FCPXML. Sequences become compound clips (keyword
"Sequences"), bins become keyword collections, tracks become roles, constant speed carries over, and
31 transitions, 72 video and 32 audio filters are mapped. Anything changed or replaced gets a red to-do marker.
Multicam is **not** supported "as Premiere Pro does not export multicam information in the XML".
- https://intelligentassistance.com/sendtox.html
- https://larryjordan.com/articles/move-sequences-between-premiere-pro-cc-and-final-cut-pro-x/

**EDL-X / Philip Hodgetts' notes**: Intelligent Assistance (Hodgetts and Greg Clarke) also make EDL-X (EDL →
FCPXML) and similar converters. Their general position: a translation never transfers everything; add
markers to flag what was changed rather than dropping it silently. That is the pattern worth copying.

**OpenTimelineIO adapters** (https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/docs/tutorials/adapters.md):
- The core package only has `otio_json`, `otiod`, `otioz`. `fcp_xml` (xmeml), `cmx_3600` (EDL) and `AAF`
  moved to separate repos, bundled in the `OpenTimelineIO-Plugins` pip package, "maintained at varying levels".
- `fcpx_xml` (https://github.com/OpenTimelineIO/otio-fcpx-xml-adapter) is not in the bundle and has no
  releases. Its feature table: clips, tracks, gaps, markers and nesting yes; transitions, effects, linear and
  variable speed, colour **no**. Fine as a reference for structure; too thin to rely on.
- OTIO needs Python, which our panel doesn't ship. Use the adapters as reading material, not a dependency.

**Premiere and OTIO**: OTIO import/export arrived in Premiere *Beta* in Oct 2024 (File › Export ›
OpenTimelineIO; import via File › Import). It covers clip names, cut placement, source in/out, start
timecode, frame rate, tracks, linear speed and sequence markers; no effects, transitions or multicam.
Reported bugs: linear speed misread on import, speed keyframes lost, clip names reverted on round trip.
A localised Adobe release-notes page lists OTIO as a shipped feature, but I could not confirm which 26.x
build. Either way **ExtendScript has no OTIO export call**, so the panel can't drive it; whether
`app.project.importFiles` accepts `.otio` is untested.
- https://community.adobe.com/announcements-732/now-released-otio-import-and-export-311699
- https://community.adobe.com/feature-requests-730/otio-export-import-does-not-preserve-speed-keyframes-time-remapping-keyframes-in-premiere-pro-1556474

## 2. Resolve: what it writes and reads

**Scripting API (checked locally, Resolve 21.2 README and `DaVinciResolveScript.pyi`):**
- `Timeline.Export(path, type, subtype)` types: `EXPORT_FCPXML_1_8`, `_1_9`, `_1_10`, `EXPORT_FCP_7_XML`,
  `EXPORT_AAF` (subtype `EXPORT_AAF_NEW` / `_EXISTING`, required), `EXPORT_EDL` (subtype `EXPORT_CDL`,
  `_SDL`, `_MISSING_CLIPS` or `_NONE`, required), `EXPORT_OTIO`, `EXPORT_DRT`, `EXPORT_ALE`, CSV/TAB.
- FCPXML 1.3–1.7 export removed since 18.1. **The API tops out at FCPXML 1.10**, even though the UI offers
  newer versions.
- `MediaPool.ImportTimelineFromFile(path, options)` reads AAF/EDL/XML/FCPXML/DRT/ADL/OTIO. Options:
  `timelineName`, `importSourceClips`, `sourceClipsPath`, `sourceClipsFolders`, `interlaceProcessing` (AAF only).

**UI / versions:**
- Resolve 18.6 added import and export of FCPXML 1.11.
  https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_18.6_New_Features_Guide.pdf
- Resolve 21 beta 4 added import/export of "Final Cut Pro 12 FCPXML" (which is 1.14).
  https://www.motionmedia.com/mm-blog/davinci-resolve-21-beta-4-fcpxml-ai-updates
- Resolve has always lagged one or two FCPXML versions; an unsupported file just shows greyed out in the
  import dialog. Users also hit this with `.fcpxmld` bundles; pointing Resolve at the `Info.fcpxml` inside or
  re-exporting at 1.9/1.10 is the usual fix.
  https://discussions.apple.com/thread/255407526 ·
  https://forum.blackmagicdesign.com/viewtopic.php?p=850490
- Several 2026 guides still recommend **FCP 7 XML** out of Resolve for Premiere and **FCPXML 1.9/1.10** for FCP.
  https://roughcut.com/blog/multicam-xml-export-premiere-resolve-fcp ·
  https://tryuncle.com/learn/davinci-resolve/switching-from-final-cut-pro-to-davinci-resolve

**What Resolve drops on FCPXML import** (Larry Jordan, Tryuncle July 2026, forums): FCP titles (grey boxes),
third-party effects, roles (audio becomes flat tracks), AIFF audio, captions (send SRT separately). Multicam,
compound clips, speed ramps and some generators may import partly or break parsing; flattening first is the
standard advice. Transforms and basic Color Board come across if "Use sizing / colour information" is on.
- https://larryjordan.com/articles/sending-projects-between-apple-final-cut-pro-and-davinci-resolve/
- https://forum.blackmagicdesign.com/viewtopic.php?p=1151748 (API imports arriving unlinked or without effects)

## 3. Premiere: FCP 7 XML, AAF, EDL

- Export: `sequence.exportAsFinalCutProXML(path)` writes xmeml (version 4/5). Premiere also writes an
  "FCP Translation Results" text file beside it listing what didn't translate; read and surface it.
  https://support.maxon.net/hc/en-us/articles/212135507--Premiere-What-is-a-Translation-Report
- AAF and EDL exports exist in the UI (File › Export); AAF is aimed at Avid/Pro Tools and needs care with
  embedded vs linked audio. I found no documented ExtendScript call for AAF or EDL export, so treat xmeml
  as Premiere's only scriptable timeline export (worth a quick check in the 2027 DOM).
- Import: `app.project.importFiles([path])` takes xmeml, AAF and EDL.
- **No native FCPXML import** in Premiere 25/26/27; Adobe has long pointed at XtoCC.
  https://community.adobe.com/t5/premiere-pro-ideas/premiere-import-xml-is-outdated-final-cut-no-longer-supported/idi-p/13528893
- Losses on xmeml export (Adobe forum reports): most video effects, Lumetri, multicam (translation report says
  "not supported"; workaround is flattening a duplicate sequence), nested clips with speed changes, Essential
  Graphics text. Cuts, tracks, transforms, opacity, cross-dissolves, constant speed and audio levels usually survive.
  https://community.adobe.com/questions-729/multicam-sequences-are-not-supported-in-fcp-xml-export-1395326 ·
  https://community.adobe.com/questions-729/exporting-xml-or-aaf-with-nested-clips-and-or-effects-applied-not-working-1403807

## 4. Final Cut Pro FCPXML versions

From Apple's release notes (https://support.apple.com/102825):

| FCP | Date | FCPXML |
|---|---|---|
| 10.6 | Oct 2021 | 1.10, new `.fcpxmld` bundle |
| 10.7 | (not stated; 1.11 era) | 1.11 |
| 10.8 | Jun 2024 | 1.12 |
| 11.0 | Nov 2024 | 1.13 |
| 12.0 | Jan 2026 | 1.14 |
| 13.0 | 18 Nov 2026 (today) | 1.15 |

- Bundles: from 1.10, FCP exports a `.fcpxmld` folder with `Info.fcpxml` at its root; importers should accept
  both `.fcpxmld` and `.fcpxml`. Sources disagree on whether choosing 1.10/1.11 still gives a plain file, so
  handle both.
  https://developer.apple.com/documentation/professional-video-applications/importing-fcpxml-data
- DTDs: Apple's developer site only publishes the 1.10 DTD
  (https://developer.apple.com/documentation/professional-video-applications/document-type-definition).
  **Checked locally:** FCP 12.3 ships every DTD from 1.0 to 1.14 in
  `Final Cut Pro.app/Contents/Frameworks/Interchange.framework/Versions/A/Resources/FCPXMLv1_N.dtd`, so
  `xmllint --dtdvalid` can check our output on the Mac.
- FCP imports older versions happily, so writing an older version (1.9 or 1.10) is the safest target.
- Known bug: FCP 10.7.1 wrote volume/voice-isolation in the wrong order in 1.11 only.
  https://github.com/CommandPost/FCPCafe/issues/314

## 5. What converts well and badly

| Item | xmeml (Premiere, Resolve FCP7 XML) | FCPXML | Verdict |
|---|---|---|---|
| Cuts, tracks, gaps, source in/out | `clipitem` start/end/in/out in frames | spine + lanes, rational seconds | **Good.** Lanes ↔ tracks needs care: FCP connected clips hang off a parent clip |
| Timecode, 23.976, 29.97 DF | `<rate><timebase>24</timebase><ntsc>TRUE</ntsc>` + frame counts, `<displayformat>DF` | `frameDuration="1001/24000s"`, `tcFormat="DF"` | **Good if done carefully.** Round to frame boundaries; never use floats; keep the sequence start TC (often 01:00:00:00) |
| Constant speed | Time Remap filter / speed parameter | `timeMap` with two `timept`s, or `conform-rate` | **Fair.** Constant speed survives; reverse sometimes flips wrong |
| Speed ramps, freeze frames | Time Remap keyframes | `timeMap` with several points | **Poor.** Lost or approximated everywhere; flag them |
| Multicam | Premiere doesn't export it; xmeml `multiclip` exists | `mc-clip` + `media/multicam` | **Poor.** Flatten to the active angle and warn |
| Compound / nested | nested `sequence` inside `clipitem` | `ref-clip` / compound media | **Fair.** Works for simple nests; nests with speed or effects break. Offer "flatten" |
| Transitions | cross dissolve, dip to colour mostly | `transition` with FCP effect uid | **Fair** for dissolves; others become dissolves |
| Video effects, colour | Premiere/Resolve effect ids | FCP effect uids, Color Board | **Poor.** Transform/opacity/crop yes, grades and plug-ins no |
| Titles | generator items; Essential Graphics not exported | `title` + Motion template | **Poor.** Keep the slot and the text where we can; style is lost |
| Audio levels / keyframes | Audio Levels filter keyframes | `adjust-volume` + `param` keyframes | **Good** (convert gain dB carefully: xmeml stores linear 0–3.98, FCPXML stores dB) |
| Audio channels / roles | tracks per channel | roles and audio components | **Fair.** Roles → track names/labels and back; Resolve ignores roles |
| Markers | `marker` name/comment/in/out | `marker`, `chapter-marker`, to-do `marker completed="0/1"` | **Good.** Map to-do/chapter to colours as XtoCC does; Premiere marker colours aren't in xmeml |
| Clip colour labels | `<labels><label2>` | none (roles and keywords instead) | **Poor.** Map label → keyword at most |
| Captions | not really | `caption` elements | **Poor.** Send SRT separately |
| Relinking | `pathurl` `file://localhost/...` | `media-rep src="file:///..."` | **Good** if paths are absolute and percent-encoded; Mac ↔ PC paths always need relinking |

## What this means for our converter

**Format per route**
- Premiere → Resolve: Premiere's own xmeml, imported with `ImportTimelineFromFile`. No conversion.
- Resolve → Premiere: `Timeline.Export(EXPORT_FCP_7_XML)` and `importFiles`. No conversion.
- Resolve → FCP: `Timeline.Export(EXPORT_FCPXML_1_10)` (highest the API offers). FCP reads it.
- FCP → Resolve: import the file directly; for a `.fcpxmld`, pass the bundle or its `Info.fcpxml`. If the version
  is newer than this Resolve accepts, rewrite the `version` attribute only after our converter has checked
  there are no newer-only elements, or down-convert.
- Premiere → FCP: our xmeml → FCPXML converter, writing **FCPXML 1.10** as a plain `.fcpxml` (widest support;
  FCP 10.6 to 13 read it). When Resolve is open, routing through Resolve (import xmeml, export 1.10) is an
  alternative worth comparing in tests.
- FCP → Premiere: our FCPXML → xmeml converter (the XtoCC job). Accept 1.8–1.15 input; ignore unknown
  elements rather than failing.
- AAF/EDL: offer only as "advanced" (AAF for Avid/Pro Tools, EDL for a single video track). OTIO: offer from
  Resolve only, label it experimental for Premiere.

**Converter rules**
- Do all timing in integer frames or rationals; carry NTSC and DF flags explicitly.
- Flatten multicam to the active angle; offer to flatten nests that contain speed or effects.
- Never drop silently: add a marker (FCP to-do / red in Premiere) on every clip we changed or simplified, and
  write a short report beside the file, like SendToX and Premiere's translation results.
- Keep media paths absolute and percent-encoded; note that Mac ↔ PC moves need relinking.
- Validate FCPXML output with `xmllint` against the DTD from the local FCP bundle in tests.

**Warn users before export** (one short list in the panel):
- Effects, colour grades, plug-ins and title styling don't move; titles arrive as plain text or placeholders.
- Multicam is flattened; speed ramps become constant speed or are flagged.
- Clip colour labels and FCP roles only partly survive; captions need a separate SRT.
- Check the result against the original before deleting anything.

## What we built (1.3.38.x)
- `js/tools/33-deliver-nlexml.js`: one plain timeline model with readers and writers for FCPXML (reads 1.8–1.15,
  writes 1.10, checked against Final Cut Pro's own DTDs in `dev/tests/nle-xml.test.js` when FCP is installed),
  FCP 7 XML, CMX 3600 EDL and OTIO JSON. Times are whole-number fractions, so 23.976 and 29.97 DF never drift.
- Premiere: its own `exportAsFinalCutProXML` is the source (and the file for Premiere/Resolve); FCPXML, EDL and
  OTIO are made from it. Import: converted to FCP 7 XML, then `importFiles`.
- Resolve: the timeline is read through the API (`Timeline.Export`'s constants aren't on the JavaScript API);
  import uses `MediaPool.ImportTimelineFromFile` on the original file, with our FCP 7 XML as the fallback.
- What didn't come across is listed after every export and import, as SendToX and XtoCC do.
