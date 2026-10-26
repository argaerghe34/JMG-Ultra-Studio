{{WHATSNEW}}

## Install (2 minutes)

**Mac:** unzip the download, then double-click **Install on Mac.command**. The first time, macOS may say it's from an unidentified developer: right-click the file › **Open** › **Open**. Quit Premiere first (the installer waits for you).

**Windows:** unzip the download (right-click › Extract All), then double-click **Install on Windows.bat**. If Windows SmartScreen appears, click **More info › Run anyway**.

Then open Premiere Pro and choose **Window › Extensions › JMG Ultra Studio**. Dock it wherever you like.

**First thing to do:** on **Home**, press **Check my setup**. It really renders some sound and reads some video from your open project, so you know everything works on that computer. Press **Copy report** if anything fails and send it over.

**Updating:** run the new installer. Your settings and analysis results are kept.
**Removing:** run **Uninstall on Mac / Windows**.

## How it behaves everywhere

- **Never touches your original cut.** Tools that cut or rebuild a sequence make a copy or a new sequence first. New bins go under **JMG Ultra Studio**. Colour is the exception by nature: it adds its own Lumetri effect to the clips you choose, and leaves any grade you made alone.
- **Always shows what's happening** in the status bar at the top: who's working (Ultra Studio, Premiere, Media Encoder, AI), what it's doing, progress, time left, and a **Stop** button. Click the bar for the full activity log.
- **Plain errors.** Every problem says what went wrong and the one thing to do next. Technical details sit behind **Details**.
- **Nothing is uploaded.** Analysis runs on your computer, using Premiere itself to read every format it can play. AI is optional and only ever sees text.
- **Remembers analysis.** Analysing a clip once is enough; moving sliders afterwards is instant.

## Overnight prep

On **Home**, open **Overnight prep – get this project ready while you're away**. Tick what to do – **Read Premiere's transcripts**, **Find themes**, **Find moments**, **Write the interview log** (with AI, a short summary of each interview), **Analyse all the footage for Selects** (any footage, unless you choose a kind) – and press **Start overnight prep**. It runs them one after another, keeps the computer awake, and in the morning Home shows a report: what was done, how long it took, and anything that needs you. Your edit isn't changed; leave Premiere open with the project.

With an AI key you can let it use the AI for themes, moments and the interview summaries. With Claude you choose a limit for the night (for example *Up to $2.00*) when you press Start; nothing asks later, and any AI step that wouldn't fit is skipped and listed in the report.

## Tools

{{TOOLS}}

{{AICOSTS}}

## If something goes wrong

1. Read the message – it says what to do.
2. Press **Details › Copy** or open the **activity log** (☰) and copy it.
3. **Home › Check my setup › Copy report** and send both.

If an export or a Media Encoder step never starts, quit **Adobe Media Encoder** (and Premiere, if it has stopped responding), open Premiere again and retry – Premiere starts a fresh Media Encoder by itself.

Files live in `~/Library/Application Support/JMG Ultra Studio` (Mac) or `%APPDATA%\JMG Ultra Studio` (Windows): settings, analysis cache, logs. Exports go to `Documents/JMG Ultra Studio`.
