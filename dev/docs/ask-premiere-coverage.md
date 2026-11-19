# What Ask can do in the editor itself

Beyond running Ultra Studio's own tools, Ask (and Producer, on the same engine) works the editor through **typed
commands** – never a script written by the AI. Each command has checked arguments, goes through the approval card or
the risk warning (`US.chat.dangerOf`), works on a copy unless the editor asked for the sequence itself (then a
"– before Ask" copy is kept), and is in the journal for Undo where it can be taken back.

Written 19 Nov 2026 for Premiere Pro 27.0 (CEP panel: ExtendScript object model + QE). "Resolve" = what the same command
does in DaVinci Resolve Studio; "no" there means Resolve's scripting can't, and Ask says so (see `dev/RESOLVE.md`).
Checked in real Premiere by `dev/e2e/40b`, `40e`, `40f`, `40g`; rows marked ◇ are new this round and have only run
against the stand-ins until `40g` is run.

## Project
| What | How Ask does it | Undo | Resolve |
|------|-----------------|------|---------|
| Read the project, a bin, the selection | `project`, `bin`, `selection` | – | yes |
| Bins with counts, by name ◇ | `bins` (`askBins`) | – | yes |
| Find clips by name, file path / folder, bin, kind ◇ | `find` (`askFind`) | – | yes |
| What is new since the chat started / in the last while ◇ | `recent` | – | yes |
| Make a bin (empty too) ◇ | `makebin` (`ensureBin`) | removed if still empty | yes |
| Move clips to a bin | `move` ◇, or `edit` move | put back (not back to "no bin") | yes |
| Rename clips, colour labels in a bin | `edit` rename / label | put back | yes |
| Clip markers | `edit` marker in a bin | taken off | yes |
| Import files or a whole folder into a bin ◇ | `import` (`importFiles`) | no – the clips stay (said plainly) | yes |
| Subclips from In/Out, or from a sequence ◇ | `action subclips.make` | new items stay | as the tool |
| Files on disk that aren't in the project ◇ | `files` (only Ultra Studio's folders or one the editor named) | – | yes |
| **Delete clips or a bin that has things in it** | **never** – Ask doesn't delete the editor's project items. Empty bins it made are removed on Undo. | | |
| Relink, replace footage, metadata columns other than name/label | not offered | | |

## Sequences
| What | How | Undo | Resolve |
|------|-----|------|---------|
| Read a sequence (clips, tracks, effects, markers, the lines heard) | `timeline` | – | yes |
| Settings: size, frame rate, length, tracks, In/Out, playhead ◇ | `editor sequence.settings` | – | yes |
| New sequence from clips, laid end to end or at times ◇ | `place` with `newSequence`; `edit` sequence (from a bin); `build` (from transcript lines) | deleted | yes |
| Duplicate ◇ / keep a version | `editor sequence.duplicate`, `version` | deleted | yes |
| Open | `open` | – | yes |
| Rename ◇ | `editor sequence.rename` (`seqSet`) | name put back | yes |
| In and Out ◇ | `editor sequence.inout` (`seqSet`) | no (set again by hand) | only where Resolve has `SetMarkInOut`; else said |
| Change frame size / frame rate of an existing sequence | not from a script (Deliver's vertical copy makes a new one) | | |
| Nest a sequence in another | `place` the sequence's own project item (found with `find` kind sequence) | with the copy | yes |

## Timeline (always on a copy, unless asked for the sequence itself)
| What | How | Resolve |
|------|-----|---------|
| Put clips in at a time and track, with a length and a start in the clip (overwrite) ◇ | `place` | yes |
| Append a clip to the end of many sequences | `edit` append | yes |
| Trim: a new length, or time on / off either end ◇ | `edit` trim | no |
| Move a clip in time ◇ | `edit` shift | no |
| Move a clip to another track | `place` it there, then `edit` remove the first | yes |
| Delete, with or without closing the gap | `edit` remove | yes |
| Cut (razor) at clips' or lines' edges | `edit` razor | no |
| Take time ranges out and close up (extract) ◇ | `editor sequence.extract` (`extractRanges`) | yes |
| Switch clips on / off, rename them | `edit` enable / rename | yes (rename 20.2+) |
| Speed | `edit` speed | 21.1+ |
| Tracks: add ◇, switch off ◇, lock ◇, name ◇ | `editor track.add` / `track.set` (`trackSet`) | add, off, name: yes; lock: where Resolve has it |
| Select clips ◇ | `editor select` (`selectClips`) | no |
| Playhead ◇ | `editor playhead` | yes |
| **Insert with ripple (push everything later)** | not as one command: `place` overwrites. Ask makes room first only by rebuilding (`place` into a new sequence) – it says so. | |
| **Lift a range leaving a gap; link / unlink; group; ripple trim; slip / slide / roll** | not offered: no dependable scripting call. Ask says to do it in the editor. | |
| **Colour a clip on the timeline** | Premiere gives a script no way to (or to read it) – colour it in its bin, or mark it. Resolve: yes. | |

## Markers
| What | How | Undo |
|------|-----|------|
| List with ids ◇, add ◇, change ◇, remove ◇ (sequence) | `editor marker.list / add / change / remove`; also `edit` marker over clips or lines | added ones are taken off; removing the editor's own warns first and can't be undone |
| Clip markers | `edit` marker in a bin | taken off |

Marker times go to Premiere as plain seconds – Premiere 27 refuses a Time object there.

## Effects, transitions, sound
| What | How | Resolve |
|------|-----|---------|
| Add an effect or a transition by its name | `edit` effect / transition (QE) | 21.1+ / 21.1.2+, Resolve's own names |
| Scale, position, rotation, opacity | `edit` motion / opacity | yes |
| A slow zoom (keyframed scale) | `edit` zoom | no |
| Any setting of an effect on the clip, by name – a value or keyframes: Motion, Opacity, Crop, Lumetri Color basics, blur amounts… ◇ | `edit` set | no |
| Volume in dB; audio fades as transitions (Constant Power…) | `edit` volume / transition | 21.1+ |
| Mute a track | `editor track.set` off | yes |
| mVFX titles, lower thirds, overlays, looks, moves ◇ | `action mvfx.add` (on a copy when Ask runs it) | as mVFX in Resolve |
| Plain text layers (title, lower third) | `edit` text | no |
| **Remove an effect from a clip; read or write a title's Source Text** | not from a script in Premiere 27 (the Source Text JSON isn't readable there; components can't be removed). Ask says so; mVFX's own titles are the way to get designed text. | |
| **Solo a track; clip gain (as opposed to volume); audio channel mapping; Essential Sound** | not offered: no scripting call. | |

## Export
| What | How | Note |
|------|-----|------|
| One frame as a picture ◇ | `editor frame` (`exportFrame`) | saved in Documents › JMG Ultra Studio › Frames; the file stays |
| The sequence, a review pack, ranges, to another editor | `action deliver.pack / deliver.ranges / deliver.toEditor` | always warns first (heavy, writes files); never on its own |
| Chapters, episode text, captions | `action deliver.chapters / deliver.text / story.captions` | – |

## What Premiere's scripting can't do at all (found in this project)
- Colour labels on timeline clips: can't be set or read.
- A title's Source Text in 27.0: not readable / writable as before.
- Marker times as Time objects: refused – plain seconds only.
- Start Premiere's own transcription.
- Chained `?:` inside closures misbehaved in 27.0, and ES3 reserved words can't be object keys (`{'in': 1}`) – these
  shape how the commands are written, not what Ask offers.
- Undo history: a panel can't press Edit › Undo or group its steps into one undo; that is why Ask keeps its own journal
  and works on copies.

## What would need UXP (Premiere's newer plug-in system)
Insert / ripple edits as one step, lift, link / unlink, slip / slide, clip gain, track solo, removing effects, reading
and writing text layers properly, sequence settings changes, one-step undo groups, and transcription. The panel is a CEP
extension today; moving these across is a separate piece of work.

## How Ask says it
When a request needs one of the "not offered" rows, the tool list simply has no command for it, and the prompt tells
the AI to say plainly that it can't be done from here and how to do it by hand – never to pretend, and never to try by
another route.
