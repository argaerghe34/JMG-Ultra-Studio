# mVFX – what MotionVFX's mDocumentary covers, and what our pack does instead

Research for the **mVFX** tab (1.3.29), done 5 Nov 2026 from the product page
https://www.motionvfx.com/store,mdocumentary-dvr,p3969.html (read in the browser; the page's own text, its
"Technical Specifications" and the hover-preview thumbnails). Nothing from the page is in the repository: no
pictures, names, fonts or files – only this description, so the pack we build covers the same ground with our own
type, layout and motion.

## What mDocumentary is

- Sold as "Ultimate Narrative Tools and Effects for Final Cut Pro & DaVinci Resolve". No Premiere version.
- The DaVinci Resolve version (DVR): **37 effects, 28 titles and 6 transitions + 5 LUTs**, installed through
  MotionVFX's own "mInstaller" app into Resolve's Effects Library (Fusion templates: titles, generators and effects
  you drag onto the timeline and edit in the Inspector). Needs Resolve 18.1.2+, macOS or Windows, 16 GB RAM, 4 GB
  VRAM; 49 MB. Works in horizontal and vertical timelines. Price shown: $109.
- The Final Cut version has 66 titles and 6 transitions (more because each FCP title is a fixed layout).
- The product page says nothing about how they animate, their fonts, colours or timings – only the hover previews
  do (summarised below). There is no manual on the page; a YouTube tutorial is linked.

## The categories on the page, and what each element looks like

| Category (count on the page) | What they are | Look, as far as the previews show |
|---|---|---|
| **Freeze Frames** (8) | The picture freezes and the subject is picked out: masked cut-outs with a dark or black-and-white surround, a frame or a circle, sometimes a name beside it. "Highlight objects with cinematic freeze frames … easy-to-use masks." | Dark/desaturated surround, a crisp edge round the subject, small captions. |
| **Overlay Effects** (42) | Looks laid over the footage: film grain and dust, light leaks, old-film gates and borders, projector flicker, vignettes, split screens, "evidence" frames, double exposure (a preset is named on the page), paper and scratch textures, colour washes. | Warm faded film, black-and-white, 8 mm/16 mm gate edges with rounded corners, dust specks, scratches. |
| **Typography** (30) | Names and roles (interviewee lower thirds), "original idea by" credits, three-name cards, time jumps ("13 years later"), chapter and location titles, case-file / typewriter stamps with a handwritten scrawl, credits lists, quotes. | Mostly white on black or over footage: a serif with wide letterspacing for the big words, a small sans in capitals for the roles, a monospace "typewriter" for stamps, a handwritten line for signatures. Thin rules and brackets; nothing boxed or colourful. |
| **Timelines** (6) | A dated ruler: a line with ticks and a date ("October 1991") that moves along as years pass; a decade bar. | Thin white line, serif caps for the date, small tick marks. |
| **Transitions** (8) | Light-leak burns, film burns, flash frames, a grainy dip. | Warm light washes over the cut. |
| **Backgrounds** (8) | Dark dusty gradients, dim blurred scenes, paper and texture plates to put titles on. | Near-black with dust and a soft light, or warm paper. |
| **Movements** (14) | Camera moves on a clip: push in, pull out, pans, tilts, handheld drift, a zoom with the subject marked, focus-pull style arrows (the thumbnails are line icons of the move). | Slow, smooth, small. |
| **LUTs** (5) | Five colour looks named after memories: faded, cold night, warm coffee, expired film and reunion. | Faded blacks, warm or cool casts, lifted shadows. |

How it is used in Resolve: drag the title/effect/generator from the Effects Library, type the words in the
Inspector, pick colours and position there, trim its length on the timeline; the in/out animations follow the
clip's length. Freeze frames and masks are drawn on the clip. The LUTs are .cube files for the Colour page.

## Our pack (original – designed from the use cases, not from their files)

The **mVFX** tab holds a "Documentary pack" built from the same categories, with our own type, layout and motion:

| Our category | Presets | Premiere | Resolve |
|---|---|---|---|
| **Lower thirds** | Hairline, Tag, Block, Bracket, Stacked, Underline, Side bar, Typewriter | Native text layers (Premiere's Basic Title template with our font, size, colour, position), the rules/bars as alpha PNGs drawn by the panel, keyframed in/out moves – all editable in Effect Controls / Essential Graphics. Speaker names from Story offered as a source. | Our own Fusion title templates (`.setting`), installed into Resolve's Edit › Titles library and inserted at the playhead; words, colours and sizes are Inspector controls; the animation stretches with the clip. |
| **Titles & cards** | Chapter, Section number, Opening title, Location & date, Time jump, Quote, Credits, Three names, End card, Caption | as above | as above |
| **Timelines & dates** | Date ruler, Era bar, Typewriter stamp, Day counter | text + PNG ruler | Fusion title |
| **Overlays** | Film grain, Dust & scratches, Vignette, Warm light leak, Cool light leak, Letterbox 2.39, Film gate, Paper wash, Scan lines, Flicker | alpha PNG (drawn by the panel at the sequence size), opacity/motion keyframes where the look moves | Fusion generators (FastNoise, Background, masks) with controls |
| **Backgrounds** | Dusty dark, Paper, Slate, Ink, Linen, Spotlight | PNG plate | Fusion generator |
| **Freeze frames** | Spotlight, Black & white, Name tag, Outline box | The frame at the playhead exported as PNG (`exportFrame`), placed above the clip for N seconds, with the look on top | The same (`exportFrame`) – Resolve lays stills for 5 s; the look is a generator above |
| **Movements** | Push in, Pull out, Pan left, Pan right, Tilt up, Tilt down, Drift, Punch | Motion keyframes with ease | Resolve doesn't let add-ons keyframe: said plainly, a static punch-in offered instead |
| **Transitions** | Light leak, Flash, Film burn, Grain dip, Cross dissolve, Dip to black | the overlay over the cut + the dissolve (`editApply`) | the overlay generator at the playhead (centred on the cut); Resolve doesn't let add-ons add transitions |
| **Looks** (5) | Faded memory, Warm archive, Cold night, Bleach, Sepia | Lumetri Color with matching settings, and the .cube saved for Lumetri's Input LUT | `SetLUT` of the .cube on the clip's first node |

Everything stays editable in the editor. Where an editor can't do it, the button says so (like Quick effects).
