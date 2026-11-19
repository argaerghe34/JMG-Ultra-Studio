# Quick start

JMG Ultra Studio is a panel for Premiere Pro and DaVinci Resolve Studio. It helps you go from interviews and footage to a finished edit. This page gets you going in about five minutes.

## 1. Install it

Download the newest version from the **Releases** page on GitHub ([github.com/argaerghe34/JMG-Ultra-Studio](https://github.com/argaerghe34/JMG-Ultra-Studio/releases)). There is one zip for each editor.

**Premiere Pro** (2025 or later): download `JMG-Ultra-Studio-<version>.zip` and unzip it.

- **Mac:** quit Premiere, then double-click **Install on Mac.command**. If macOS says it can't be opened, click **Done**, then go to **System Settings › Privacy & Security › Open Anyway**.
- **Windows:** right-click the zip › **Extract All**, then double-click **Install on Windows.bat**. If SmartScreen appears, click **More info › Run anyway**.

**DaVinci Resolve Studio** (19.1 or later – the free DaVinci Resolve can't run plugins) – download `JMG-Ultra-Studio-Resolve-<version>.zip`, unzip it and open **START HERE - How to install.html** if you'd like every step with pictures. In short:

- Quit Resolve.
- **Mac:** double-click **Install on Mac.command**. It may ask for your Mac password (nothing shows while you type).
- **Windows:** double-click **Install on Windows.bat** and click **Yes** when Windows asks to allow changes.
- When it says **Installed**, open Resolve again.

## 2. Open the panel

- **Premiere Pro:** **Window › Extensions › JMG Ultra Studio**. Dock it wherever you like.
- **Resolve:** open a project, then **Workspace › Workflow Integrations › JMG Ultra Studio**. It opens in its own window.

On **Home**, press **Check my setup**. It really talks to your editor and reads a clip, so you know everything works on this computer.

## 3. Five things to try first

The sidebar follows your edit: **Home**, **Story**, **Edit**, **Deliver** and **Advanced**, with **Ask** at the bottom.

1. **Story – read your interviews.** Transcribe your interviews in Premiere as usual (select them › right-click › Transcribe). Then open **Story** and press **Read Premiere’s transcripts**. In Resolve, press **Read transcripts from Resolve…** and tick your interviews. You can also use **Import transcript files…** for SRT, VTT or text files.
2. **Find the themes.** Go to **2 Themes**, type a few themes you care about (or leave it empty) and press **Find themes**. Story groups the best lines by what they're about.
3. **Look through every line in Pro View.** **Pro View** is a tab inside Story: every line in one table, with its theme, speaker and length. It's best with a wide panel.
4. **Build a sequence.** Go to **4 Build** and press **Build sequence**. Story always makes a new sequence, so your own edit is never touched.
5. **Cut the pauses, then Ask.** In **Edit › Silence Cut**, press **Find the pauses**, then **Make a cut copy**. Then open **Ask** and say what you want in plain English – for example “cut the silences” or a question about your interviews.

When you're ready to finish, **Deliver** starts with **Final Check** (black gaps, flash frames, offline media) and then exports everything in one go.

Use a tab a lot? Press the **☆** beside its title to give it its own button on the sidebar.

## 4. Settings

**Settings** is the gear in the top bar.

- **Updates** is at the top: one button, **Check for updates and install**.
- **AI (optional)** – add a Claude or Gemini key if you want AI. Everything works without one, and you can use a model on this computer instead.
- **Vision & listening models** – choose who may look at and listen to your footage, project by project. Its **Models on this computer** part lists every model on your computer once and has one picker for each of three jobs: reading and writing, looking at footage, listening. Ultra Studio downloads its own looking and listening models when you press Download; models you have in Ollama or LM Studio show there too.
- **Take the tour** – a one-minute tour, and the **Full guide**, which walks through every tab step by step.
- **Quick start** opens this page again.

Search everything with **⌘K** (Ctrl+K on Windows).

## 5. What stays on your computer

Your footage stays on your computer unless you choose otherwise, project by project:

- AI gets text – your request and transcript lines – sent straight to the AI you choose.
- Stills – a few small ones – only if you switch them on for a project in **Settings › AI (optional) › Footage – what the AI may see** (that part is only the permission; the model that looks is chosen in **Models on this computer**).
- Sound or video goes to a cloud model only if you pick **Cloud** for that project in **Settings › Vision & listening models**. It's off until you pick it, and you see the cost first.
- A project set to **nothing leaves this computer** sends nothing off this computer – not even text. Models on your own computer may always look and listen.
- **Settings › What was sent to AI** shows the exact text of every request, and any stills or sound that went (with their size).

Tools that change a sequence always work on a copy.

## 6. Getting help

- Read the message on screen – it says what to do next.
- On **Home**, press **Check my setup**, then **Copy report**.
- Open an issue on GitHub ([github.com/argaerghe34/JMG-Ultra-Studio/issues](https://github.com/argaerghe34/JMG-Ultra-Studio/issues)) and paste the report in.
