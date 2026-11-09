{{WHATSNEW}}

## Install (2 minutes)

**Mac:** unzip the download, then double-click **Install on Mac.command**. If macOS says it can't be opened, click **Done**, then **System Settings › Privacy & Security › Open Anyway** (macOS 15 Sequoia and later; on older macOS, right-click › **Open** › **Open**). Quit Premiere first (the installer waits for you).

**Windows:** unzip the download (right-click › Extract All), then double-click **Install on Windows.bat**. If Windows SmartScreen appears, click **More info › Run anyway**.

Then open Premiere Pro and choose **Window › Extensions › JMG Ultra Studio**. Dock it wherever you like.

**In DaVinci Resolve Studio:** use the Resolve download (`JMG-Ultra-Studio-Resolve-<version>.zip`) – see *In DaVinci Resolve Studio* below.

**First thing to do:** on **Home**, press **Check my setup**. It really renders some sound and reads some video from your open project, so you know everything works on that computer. Press **Copy report** if anything fails and send it over.

**Updating:** **Settings › Updates › Check for updates and install** – one button, and the panel reloads by itself. Or run the new installer. Your settings and analysis results are kept.
**Removing:** run **Uninstall on Mac / Windows**.

## In DaVinci Resolve Studio

The same panel runs in **DaVinci Resolve Studio 19.1 or later** (20 recommended), on a Mac or a PC. The free DaVinci Resolve can't run plugins.

**Install:** unzip `JMG-Ultra-Studio-Resolve-<version>.zip` and open **START HERE - How to install.html** in the unzipped folder – it walks you through every step, on a Mac or a PC. In short:

1. **Quit DaVinci Resolve.** It only looks for plugins when it starts.
2. **Double-click Install on Mac.command** (Mac – if it says it can't be opened, click **Done**, then **System Settings › Privacy & Security › Open Anyway**; or in Terminal type `bash ` and drag the installer in) or **Install on Windows.bat** (PC – if SmartScreen appears, **More info › Run anyway**).
3. The installer shows each step as it's done. Resolve's plugin folder is shared by everyone on the computer, so the Mac may ask for your password (nothing shows while you type) and Windows asks to allow changes – click **Yes**.
4. When it says **Installed**, press **O** to open Resolve.
5. **Open a project**, then choose **Workspace › Workflow Integrations › JMG Ultra Studio** – it opens in its own window.
6. On **Home**, press **Check my setup**: it checks Resolve Studio, the plugin version and that every tool has what it needs.

Not in the Workspace menu? Open a project, then quit Resolve completely and open it again; and check *DaVinci Resolve › About* says **Studio**, 19.1 or later.

**Updating:** **Settings › Updates › Check for updates and install** – one button; the Mac may ask for your password. Or run the new installer (quit Resolve first). **Removing:** **Uninstall on Mac / Windows**. Settings, analysis results and logs are shared with the Premiere version.

**Resolve's words:** this guide is written for Premiere. In Resolve the panel uses Resolve's words – a *sequence* is a *timeline*, the *Project panel* is the *Media Pool*, *Media Encoder* is Resolve's *render queue* (the Deliver page), *export presets* are *render presets*, and *adjustment layers* are *adjustment clips*.

**What works differently in Resolve:**

- Story can't read the transcripts Resolve makes itself (a plugin can't get at them): **Transcribe with Resolve** (Story › 1 Interviews) reads the transcripts Resolve already has of the clips, multicam clips or timelines you tick (or has Resolve make them) and reads those (phrase by phrase, without speaker names), or Story reads transcript files. Resolve may not respond while it transcribes.
- Captions from Story are saved and put in the Media Pool (Captions bin) for you to drag onto the timeline – Resolve can't place a subtitle file by script.
- ▶ in Story plays the line in the panel's own player; the clip is selected in the Media Pool.
- Sound Check can't set clip volume from a plugin: it tells you what to change instead of changing it.
- Highlights in Story use clip colours and markers, and Render ranges use marked ranges, instead of adjustment layers.
- Selects can't spot faces in Resolve, so it doesn't sort close-ups by face there; everything else in Selects works the same.
- Resolve projects live in Resolve's database, not in a file next to your footage.
- Colour and Camera Switch are paused in both editors for now.

## How it behaves everywhere

- **Never touches your original cut.** Tools that cut or rebuild a sequence make a copy or a new sequence first. New bins go under **JMG Ultra Studio**. Colour is the exception by nature: it adds its own Lumetri effect to the clips you choose, and leaves any grade you made alone.
- **Always shows what's happening** in the status bar at the top: who's working (Ultra Studio, Premiere, Media Encoder, AI), what it's doing, progress, time left, and a **Stop** button – one click stops after the current step, three quick clicks stop at once (AI requests too). Click the bar for the full activity log.
- **Says which AI it's using** – the top bar shows the model, or **No AI**. Without AI everything still works; the features that work best with AI say they're running their basic version, and **Settings › AI › Without AI** explains what's different. Settings also shows usage by API key, and **What was sent to AI** – the exact text of every request, kept on this computer, with an option to see each one before it's sent.
- **Plain errors.** Every problem says what went wrong and the one thing to do next. Technical details sit behind **Details**.
- **Nothing is uploaded.** Analysis runs on your computer, using Premiere itself to read every format it can play. AI is optional and only ever sees text.
- **Remembers analysis.** Analysing a clip once is enough; moving sliders afterwards is instant.

## Overnight prep

On **Home**, open **Overnight prep – get this project ready while you're away**. Tick what to do – **Read Premiere's transcripts**, **Find themes**, **Find moments**, **Write the interview log** (with AI, a short summary of each interview), **Make the beat map**, **Find clips for social**, **Then run a recipe** (choose one – e.g. *Podcast episode*; edit steps wait for you in the morning), **Analyse all the footage for Selects** (any footage, unless you choose a kind) – and press **Start overnight prep**. It runs them one after another, keeps the computer awake, and in the morning Home shows a report: what was done, how long it took, and anything that needs you. Your edit isn't changed; leave Premiere open with the project.

With an AI key you can let it use the AI for themes, moments and the interview summaries. With Claude you choose a limit for the night (for example *Up to $2.00*) when you press Start; nothing asks later, and any AI step that wouldn't fit is skipped and listed in the report.

## Tools

**Advanced** (in the rail, near the bottom) keeps the tools for particular jobs out of the way: **Selects**, **Subclip Maker**, **MC Selects** (Premiere), **Take Sets**, **Song Splitter** and **Podcast**. Open one from there; its screen has a **‹ Advanced** link back. Its **In development** folder holds the tools still being made – **Colour**, **Camera Switch**, **B-roll**, **Sound Check** and **mVFX** – which you can try, though parts may not work yet and the Assistant doesn't use them.

{{TOOLS}}

{{AICOSTS}}

## If something goes wrong

1. Read the message – it says what to do.
2. Press **Details › Copy** or open the **activity log** (☰) and copy it.
3. **Home › Check my setup › Copy report** and send both.

If an export or a Media Encoder step never starts, quit **Adobe Media Encoder** (and Premiere, if it has stopped responding), open Premiere again and retry – Premiere starts a fresh Media Encoder by itself.

Files live in `~/Library/Application Support/JMG Ultra Studio` (Mac) or `%APPDATA%\JMG Ultra Studio` (Windows): settings, analysis cache, logs. Exports go to `Documents/JMG Ultra Studio`.
