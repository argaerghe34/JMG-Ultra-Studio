# Offline vision models for Selects – findings (26 Oct 2026, low priority, nothing installed)

**Goal:** let Selects understand more of a shot's content and style – e.g. pick all wide shots, reveals or
cinematic moves more reliably – with footage never leaving the computer.

## What Selects already does locally (no model)
- Camera moves (pan/tilt with direction, push-in/pull-out, handheld, whip pans) and smoothness – measured from the
  motion between frames. Reliable on the test clips; this is the right tool for movement, better than a model.
- Reveals (pull-backs, cranes, lights coming up), focus, exposure, shake, flicker, faces.
- **Gap:** shot size is only known when there's a face (close/mid/wide from face size). A landscape, a room or a
  crowd has no shot size, and there's no idea of *what* is in the shot.

## Options
| Option | What it adds | Size / speed | Mac + PC | Notes |
|---|---|---|---|---|
| **MobileCLIP (Apple) or CLIP/SigLIP as ONNX, run in the panel** (onnxruntime-web / Transformers.js) | Zero-shot labels from plain words: “wide landscape”, “aerial shot”, “close-up of hands”, “crowd”, “interior”, “sunset”… and text search of B-roll (“the market”) – all on the computer | MobileCLIP-S0/S1 roughly tens of MB to ~100 MB; one frame per select, WASM in CEP's Chromium 99 (no WebGPU there) – est. tens of ms to a few hundred ms per frame (to measure) | Yes (same code) | Best fit. Licence must be checked before shipping (Apple's MobileCLIP weights have their own licence; OpenAI CLIP is MIT; SigLIP Apache-2.0). SigLIP 2 base is larger (~93 MB quantised image encoder). |
| **Apple Vision framework** (built into macOS) | ~1,300 scene labels, image feature prints, aesthetics score (macOS 15+) | Nothing to download; fast (Neural Engine) | **Mac only** | Needs a small signed helper app; nothing equivalent on Windows → features would differ between Mac and PC. |
| **Shot-scale classifiers** (CineScale CNN, MovieShots-trained models) | 5–9 classes: extreme close-up … extreme long shot | Small CNNs | Yes (ONNX) | Trained on films; licences/weights availability unclear; narrower than CLIP. |
| **Camera-motion models** (CameraBench fine-tuned VLM, 2025) | Rich camera-motion descriptions | Large vision-language models – GBs, slow | Impractical | Our motion measurement already covers pans, tilts, push-ins and reveals locally. |
| **Small vision-language models** (e.g. Moondream-class) | Free-text descriptions of shots | 1–2 GB+, seconds per frame | Possible but heavy | Too heavy for a panel; not recommended. |

## Recommendation
Prototype **MobileCLIP (or SigLIP if the licence suits better) as ONNX inside the panel**: one frame per select,
a fixed set of prompts for shot size and setting (wide / medium / close / aerial / interior / exterior / people /
landscape / detail), plus a search box for B-roll by content. Same code on Mac and PC, nothing leaves the computer,
results cached with the Selects analysis. Before that: check the weights' licence, measure speed in CEP on the test
clips, and **ask the user before downloading any model** (tens of MB). Apple Vision is the fallback only if the
user is happy for the Mac to have extra features the PC doesn't.

Sources: Xenova/mobileclip_s2 and mobileclip_blt (Hugging Face), Transformers.js docs, Qualcomm SigLIP2 model card,
CameraBench (arXiv 2504.15376), MovieNet/MovieShots (arXiv 2007.10937), CineScale (paperswithcode).
