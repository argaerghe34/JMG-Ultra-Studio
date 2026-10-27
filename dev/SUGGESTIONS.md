# Suggested features and improvements – 27 Oct 2026

For JMG Ultra Studio after 1.3.0. Nothing here is built yet; pick what you want and I'll plan it.
The rules still apply to all of it: footage stays on the computer and AI sees only text, Story comes first, the UI stays
simple and consistent, and everything works on Mac and Windows.
Already done or planned, so not repeated here: Selects camera movement, Colour background previews, Moments
colours and labels, the ▶ fix, offline vision models (`dev/VISION-MODELS.md`) and other editors (`dev/OTHER-EDITORS.md`).

Effort: **S** = an evening, **M** = a few days, **L** = a week or more.

## Top 5 – what I'd do next

1. **Story travels with the project (Mac ↔ PC).** *(S–M)*
   - **What:** keep Story's themes, narratives and speaker names in a small file next to the project (in the
     *JMG Ultra Studio* folder that Safe Zones already uses), rather than only on the computer.
   - **Why it helps:** you'll work on both machines. At the moment a project opened on the PC starts Story from scratch.
   - **Risk:** if both computers change the same project at once, one wins. The fix is to keep the newer copy and say so plainly.
2. **Paper edit round trip.** *(M)*
   - **What:** a producer or client reorders, deletes or stars lines in the paper edit (Word or spreadsheet). Story
     then reads it back and builds that sequence.
   - **Why it helps:** documentary and charity films are often agreed on paper. Today the paper edit goes out, but
     the notes come back by hand. Avid editors credit script-based editing with halving edit times.
   - **Risk:** people edit documents freely. Use the spreadsheet as the reliable route, and match Word by the line
     IDs we print.
3. **Clean lines when building.** *(M)*
   - **What:** an option in 4 Build, *Tidy the lines*. It removes "um", "er", false starts and repeated words inside
     each line, using the word timings we already have, with short handles so the cuts stay smooth.
   - **Why it helps:** it saves the most tedious pass of an interview cut, and it suits the narrative and promo cuts too.
   - **Risk:** Premiere's text-based editing can already delete filler words by hand. Ours is automatic, on a copy,
     and only on the lines you chose. A tight cut can clip a breath, so make it off by default with a light setting.
4. **Overnight AI at half price.** *(M)*
   - **What:** when Overnight prep uses Claude, send its jobs (themes, moments, interview summaries) as one batch.
   - **Why it helps:** Anthropic charges about half for batched requests, which usually finish well within a night.
     So the night's AI cost roughly halves, with the same results.
   - **Risk:** a batch can occasionally take hours. If it isn't back by morning, the report says so and Story offers
     to run it normally.
5. **Get ready for Premiere's move to UXP.** *(start S, whole move L)*
   - **What:** Adobe made UXP (the new panel system) official in Premiere 25.6. CEP and ExtendScript, which this
     panel uses, will be retired.
   - **No firm date:** I found no Adobe date. One community post claims ExtendScript support ended in September
     2026, but 1.3 runs fine on 26.5.
   - **Suggested first step:** a small UXP test panel that checks the 10 Premiere calls we depend on most (markers,
     overwriteClip, transcripts, export, QE extract).
   - **Why it helps:** this is the one thing that could stop the panel working after an update. Knowing early lets
     us move at our own pace.
   - **Risk:** UXP doesn't yet do everything ExtendScript does (QE calls especially), and developers report slow bulk
     timeline edits.

## Quick wins (small)

- **Story keyboard shortcuts:** Space plays the line, ↑ ↓ move, T ticks, X takes it out. This makes reviewing
  hundreds of lines much faster. No real risk, except clashing with Premiere's own shortcuts: they only work while
  the panel has focus.
- **Voice balance:** show how many lines each speaker has in each theme and in the cut. It warns when one voice
  dominates, and charity films usually want a fair mix. No risk.
- **Theme lengths:** show each theme's running time next to its line count ("14 lines · 3 min 20 s"). This makes
  it easy to plan a 60-second or 10-minute cut. No risk.
- **Copy line with timecode:** ⋯ › *Copy*, which copies the line, speaker, clip and timecode for emails and scripts.
  No risk.
- **Starred lines:** star a line anywhere in Story and it's kept in a *My favourites* theme. This keeps the gut
  feelings you have while reviewing. No risk.
- **Report untranscribed interviews:** Home and the Overnight report list the interviews that still need
  Premiere's transcription, with a button to select them. Otherwise one missing transcript silently leaves a voice
  out. No risk.
- **Mac + Windows tests on every push:** run the unit tests automatically on GitHub for both systems. This catches
  Windows-only breakage without the PC being on. GitHub's free minutes cover it for a private repo of this size.
- **Cache size and tidy-up:** Settings shows how much space the analysis cache uses, with *Clear old projects*.
  Selects and Colour caches grow over months. Only clear what can be rebuilt.

## Bigger features (medium–large)

- **B-roll that matches the words.** *(M)*
  - **What:** for each line in a narrative or theme, suggest B-roll whose clip, bin or Selects labels match what is
    said ("the kitchen", "the market"). *Make it a promo* would then use it.
  - **Why it helps:** it closes the gap between Story and Selects, which today pick B-roll only by quality.
  - **Risk:** it is only as good as your names and bins. It would get much better with the offline vision model once
    that's chosen.
- **Better offline understanding of words.** *(M)*
  - **What:** a small local text model (about 25–90 MB) that understands meaning, so Search, Find more and themes
    without AI find "helping others" when people say "giving back".
  - **Why it helps:** stronger results with no key and no cost, and only text, so it fits the rules.
  - **Risk:** it's a download, so I'd ask first and check its licence. It also needs measuring for speed in the panel.
- **Repeated answers.** *(M)*
  - **What:** when someone answers the same question twice (common in interviews), group the takes side by side and
    pick the better one by default.
  - **Why it helps:** it saves listening to both, and Story stops using the weaker version.
  - **Risk:** it can mistake two different answers for the same one. Always show both and let you choose.
- **Cut report for any sequence.** *(S–M)*
  - **What:** for a rough cut, show its themes, speakers, the time each gets, and what's strong but unused.
  - **Why it helps:** it answers "is this cut balanced, and what am I missing?" after each round of notes. It builds
    on *Show what's missed* and *Compare two versions*.
  - **Risk:** none to speak of.
- **Bilingual paper edits and captions.** *(M)*
  - **What:** translate the chosen lines with AI (text only) and add them beside the original in the paper edit, or
    as captions.
  - **Why it helps:** for projects with Hebrew or other-language interviews, and funders or clients who need English.
  - **Risk:** AI cost. The translation needs a human check, so mark it as a draft.
- **Ultra Studio history.** *(M)*
  - **What:** a list of everything Ultra Studio has made in this project (sequences, bins, markers, tracks), with
    *Show* and *Remove* for each.
  - **Why it helps:** it makes experimenting safe, and makes it easy to clean up before handing over a project.
  - **Risk:** remove only what Ultra Studio made, and ask before removing anything you've changed since.

## Performance & reliability

- **Large projects stay fast.** *(S–M)*
  - **What:** test Story on the 30-hour, 222-interview project (19,000 lines) for scrolling, ticking and building,
    and draw long lists only as they come into view.
  - **Why it helps:** your biggest projects are where Story helps most.
  - **Risk:** low.
- **Analyse new footage in the background.** *(M)*
  - **What:** when Premiere is idle and the computer is plugged in, quietly analyse newly imported clips for Selects,
    one at a time.
  - **Why it helps:** Selects is then instant when you open it, without waiting for Overnight prep.
  - **Risk:** it must never slow your editing. Pause on any activity, keep it off on battery, and offer a switch.
- **One-click diagnostics file.** *(S)*
  - **What:** save the setup report, activity log and versions as one text file, with no media and no keys, to send
    or attach to a GitHub issue.
  - **Why it helps:** problem reports, especially from the PC, become quicker and more complete.
  - **Risk:** make sure paths and keys are stripped.
- **Premiere update check.** *(S)*
  - **What:** after each Premiere update, Home offers a quick self-test of the Premiere calls we rely on.
  - **Why it helps:** Adobe updates sometimes change behaviour. This catches it before it bites in a real edit.
  - **Risk:** the test needs an open project. It uses its own temporary sequence and deletes it afterwards.

## Longer term

- **The move to UXP** *(L)*: see the Top 5. Plan it as a gradual move, one tool at a time, once the test panel shows
  what works.
- **Local transcription for other editors** *(M–L)*: a version for Resolve or Final Cut Pro would need its own
  transcripts. A local Whisper-class model keeps audio on the computer. It goes with `dev/OTHER-EDITORS.md`.
- **Shared Story for a team** *(L)*: two editors, or an editor and a producer, working on one project's themes, with
  changes merged. This builds on *Story travels with the project*.
- **Vision-assisted Story** *(L, after the vision-model prototype)*: describe B-roll in words ("hands, close-up,
  warm light"), and place it over the right lines automatically. Everything stays on the computer.

## What I looked at

- **Competing tools:** most Premiere AI extensions (AutoCut, FireCut and others) aim at YouTube and podcast work:
  silence, captions, zooms, chapters and multicam. Ultra Studio already covers these, and its Story depth is unusual.
- **Jumper:** shows that local visual search is practical in Premiere at about 15× real time, offline.
- **Documentary editors:** their recurring pains are the volume of interviews, finding the quote, building story
  from what was said, and keeping producers in the loop. That's behind items 2, 3 and the balance and repeated-answer ideas.
- **Adobe:** made UXP official in Premiere 25.6 and has published no CEP end date that I could find.

Sources:
- [UXP arrives in Premiere (Adobe)](https://blog.developer.adobe.com/en/publish/2025/12/uxp-arrives-in-premiere-a-new-era-for-plugin-development)
- [UXP changelog](https://developer.adobe.com/premiere-pro/uxp/changelog)
- [ExtendScript to UXP thread](https://community.adobe.com/questions-729/extendscript-to-uxp-for-premiere-pro-1553924)
- [UXP bulk-edit performance](https://forums.creativeclouddeveloper.com/t/how-to-prevent-ui-freezes-and-crashes-during-bulk-timeline-edits-via-uxp-api/11882)
- [Jumper review](https://provideocoalition.com/review-ai-driven-video-search-with-jumper/amp)
- [Script-based editing in Avid](https://www.provideocoalition.com/script-based-editing-avids/)
- [Art of the Cut – Andy Grieve](https://www.provideocoalition.com/the-art-of-the-cut-andy-grieve/)
- [Frame.io string-outs](https://workflow.frame.io/guide/stringouts)
- [AutoCut on Capterra](https://www.capterra.com/p/10036511/AutoCut/)
- [FireCut](https://firecut.ai/blog/how-firecut-streamlines-your-premiere-pro-timeline/)
- [Premiere what's new](https://helpx.adobe.com/hk_en/premiere-pro/using/new-features.html)
