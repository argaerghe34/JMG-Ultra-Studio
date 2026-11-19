# Seeing and hearing the footage – research (19 Nov 2026 notes 23–29)

All figures below were fetched on **19 November 2026** from the pages listed under Sources. File sizes and SHA-256 values come from the GitHub REST API (`digest`) and the Hugging Face API (`lfs.oid`); nothing was downloaded. Anything not fetched is marked *unconfirmed* and repeated in the last-but-one section.

## 1. What can run from a CEP panel / Resolve's Electron

| Route | Premiere CEP (Chromium 99 + Node 17.7) | Resolve (Electron) | Notes |
|---|---|---|---|
| Helper binary (`llama-server`) spawned hidden by Node, talked to over `http://127.0.0.1:<port>` | Yes | Yes | No build step, no JS library. The panel only needs `child_process.spawn` and `fetch`/`http`. Recommended. |
| Cloud API over HTTPS (Gemini, Claude) | Yes | Yes | Plain `https` requests. Footage (stills/audio/video) leaves the machine. |
| onnxruntime-web (WASM) inside the panel | Probably, single-threaded | Yes | A third-party JS + `.wasm` bundle. Threads need `crossOriginIsolated`, which a CEP panel does not normally have; WebGPU is optional and absent in Chromium 99. Whether the current build's JS parses on Chromium 99 is unconfirmed. |
| onnxruntime-node (native add-on) | Unconfirmed | Unconfirmed | v1.31.1, MIT, N-API 6 (Node 17.7 supports it on paper). Needs the npm package and its native binaries vendored per platform. Not tested in CEP. |
| Apple SoundAnalysis / Vision | Only through a small Swift helper | Same | Mac only. |
| Ollama / LM Studio | Only if the user installs it | Same | Separate app; we would only call its local HTTP API. |

## 2. Local vision models (GGUF + mmproj, for llama.cpp)

Download URL pattern: `https://huggingface.co/<repo>/resolve/main/<file>`.

| Role | Model | Repo | Files (bytes · sha256) | Total | Licence | On llama.cpp docs list |
|---|---|---|---|---|---|---|
| Tiny | SmolVLM2-500M-Video-Instruct (Q8_0) | `ggml-org/SmolVLM2-500M-Video-Instruct-GGUF` | `SmolVLM2-500M-Video-Instruct-Q8_0.gguf` · 436,808,704 · `6f67b8036b2469fcd71728702720c6b51aebd759b78137a8120733b4d66438bc`<br>`mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf` · 108,785,184 · `921dc7e259f308e5b027111fa185efcbf33db13f6e35749ddf7f5cdb60ef520b` | 0.55 GB | Apache-2.0 | Yes |
| Default (light) | SmolVLM2-2.2B-Instruct (Q4_K_M) | `ggml-org/SmolVLM2-2.2B-Instruct-GGUF` | `SmolVLM2-2.2B-Instruct-Q4_K_M.gguf` · 1,112,602,656 · `0cf76814555b8665149075b74ab6b5c1d428ea1d3d01c1918c12012e8d7c9f58`<br>`mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf` · 592,523,200 · `ae07ea1facd07dd3230c4483b63e8cda96c6944ad2481f33d531f79e892dd024` | 1.71 GB | Apache-2.0 | Yes |
| Default (sees + hears speech) | Gemma 4 E2B-it (QAT Q4_0) | `ggml-org/gemma-4-E2B-it-GGUF` | `gemma-4-E2B-it-Q4_0.gguf` · 2,841,481,184 · `8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52`<br>`mmproj-gemma-4-E2B-it-Q8_0.gguf` · 557,368,096 · `042cc2561806cd3b5cb5efb25cab76911e3100c43cc09d854904f921924b1429` | 3.40 GB | Apache-2.0 | Yes (vision and audio) |
| Stronger | Gemma 4 E4B-it (QAT Q4_0) | `ggml-org/gemma-4-E4B-it-GGUF` | `gemma-4-E4B-it-Q4_0.gguf` · 4,590,807,392 · `a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2`<br>`mmproj-gemma-4-E4B-it-Q8_0.gguf` · 559,874,848 · `9257f21a0f5358204b4a612cff83fad2e56412f4f607f0049331ce60c0cf9d34` | 5.15 GB | Apache-2.0 | Yes (vision and audio) |

Alternatives with real data (not on the docs list, so support is inferred from the repos existing with an mmproj):

| Model | Repo | Files (bytes · sha256) | Total | Licence |
|---|---|---|---|---|
| Qwen3-VL-2B-Instruct (Q4_K_M) | `Qwen/Qwen3-VL-2B-Instruct-GGUF` | `Qwen3VL-2B-Instruct-Q4_K_M.gguf` · 1,107,409,952 · `089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae`<br>`mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` · 445,053,216 · `f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82` | 1.55 GB | Apache-2.0 |
| Qwen3.5-4B (Q4_K_M) | `ggml-org/Qwen3.5-4B-GGUF` | `Qwen3.5-4B-Q4_K_M.gguf` · 3,032,091,584 · `217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14`<br>`mmproj-Qwen3.5-4B-Q8_0.gguf` · 366,894,560 · `5a5ba634d46f9888599963bfc52194eadf099e1efdbee46d71957d911cf62654` | 3.40 GB | Apache-2.0 |
| Qwen2.5-VL-7B-Instruct (Q4_K_M) | `ggml-org/Qwen2.5-VL-7B-Instruct-GGUF` | `Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf` · 4,683,072,032 · `9258bf05b12686d097ff3b6b18d968ab393649780aa2b3cd67fec43d50554392`<br>`mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf` · 853,119,712 · `2ddb555391bae966e412deab9e07b58afa18bcc06930ba0f1c78a3695ab9e506` | 5.54 GB | Apache-2.0 (docs-listed) |
| InternVL3-2B-Instruct (Q4_K_M) | `ggml-org/InternVL3-2B-Instruct-GGUF` | `InternVL3-2B-Instruct-Q4_K_M.gguf` · 1,116,758,816 · `dc36eddc05ff1db5e11e0aa38efe7a5063b045aa5350c3b1a2510f3ff9107179`<br>`mmproj-InternVL3-2B-Instruct-Q8_0.gguf` · 337,012,000 · `a91c525291f65b0469f82544e82f202c4df1c093268f0ce27deec10664078a0c` | 1.45 GB | Apache-2.0 (docs-listed) |

Not recommended:

- **Qwen2.5-VL-3B** – the ggml-org GGUF card says Apache-2.0, but the upstream `Qwen/Qwen2.5-VL-3B-Instruct` is under the **Qwen Research licence** (non-commercial). Avoid.
- **Gemma 3 4B** – works (2.49 GB + 0.85 GB mmproj) but is under the older Gemma terms; Gemma 4 is Apache-2.0 and newer.
- **Moondream2** – only f16 files in the ggml-org repo (2.84 GB + 0.91 GB), so no size advantage.
- **Gemma 3n** – the ggml-org repo has no mmproj; text only there.
- **Qwen3.5-0.8B** – ggml-org repo has no mmproj file, so vision in llama.cpp is unconfirmed.

Notes:

- Gemma 4 image budget is selectable: 70, 140, 280, 560 or 1,120 tokens per image (model card). In llama-server this is `--image-min-tokens` / `--image-max-tokens`. Low budgets suit captioning.
- Gemma 4 E2B is 2.3 B "effective" parameters (5.1 B with embedding tables), context 128K.
- The `mtp-*.gguf` files in the Gemma 4 / Qwen3.5 repos are optional extras and are not needed (their exact purpose was not checked).
- **Memory**: no published per-model RAM table was found. Rule of thumb (estimate, not a published figure): file sizes plus roughly 0.5–1.5 GB for context – about 1 GB for SmolVLM2-500M, 2.5–3 GB for the 2B models, 4.5 GB for Gemma 4 E2B, 6.5 GB for Gemma 4 E4B.
- **Speed**: no published seconds-per-image figures were found for Apple Silicon, a mid PC CPU or a small GPU. Must be measured in the build.

## 3. Local listening models

What llama.cpp's `docs/multimodal.md` lists for audio input:

| Model | Listed | Hears non-speech sound? | Licence | Comment |
|---|---|---|---|---|
| Ultravox v0.5 (Llama 3.2 1B / 3.1 8B) | Yes | Speech-focused; non-speech not claimed (unconfirmed) | mmproj MIT; the text model is Llama 3.2, under Meta's Llama community licence | Smallest. |
| Voxtral Mini 3B (2507) | Yes | Speech understanding; non-speech not confirmed | Apache-2.0 (upstream) | 2.47 GB + 0.72 GB. |
| Qwen3-ASR 0.6B / 1.7B | Yes | No – transcription only | not checked | |
| Qwen2-Audio / SeaLLM-Audio | "No pre-quantised GGUF … very poor result" | – | – | Docs advise against. |
| Qwen2.5-Omni 3B / 7B | Yes (audio + vision) | **Yes** – card reports MMAU sound 70.27, music 60.48; VocalSound 0.936 (3B) | **Qwen Research licence – non-commercial** | Good ears, wrong licence for a product. |
| Qwen3-Omni 30B-A3B | Yes | Yes | not checked | Too large (30B). |
| Gemma 4 E2B / E4B | Yes (audio + vision) | Card only claims speech recognition and speech translation; **max 30 s of audio per clip** | Apache-2.0 | Same files as in section 2. |
| LFM3-Omni-2B | In server README (video with soundtrack) and ggml-org | **Yes** – card: questions "can address speech, music, background sounds, or events"; MMAR 51.40 | **LFM Open License v1.0** – terms not read; check before shipping | Text, image, audio and video in; needs a build with PR #31257; video needs `ffmpeg`. |

Best two for "hearing":

| Model | Repo | Files (bytes · sha256) | Total | Licence |
|---|---|---|---|---|
| Gemma 4 E2B-it | `ggml-org/gemma-4-E2B-it-GGUF` | as in section 2 (one download covers seeing and speech) | 3.40 GB | Apache-2.0 |
| LFM3-Omni-2B (Q4_K_M) | `ggml-org/LFM3-Omni-2B-GGUF` | `LFM3-Omni-2B-Q4_K_M.gguf` · 1,099,630,048 · `cc0879a5ae593a84ea4681535feb30377f1c867f8feda77b3b5b68b7881dea06`<br>`mmproj-LFM3-Omni-2B-Q8_0.gguf` · 506,842,432 · `279fb3110acc6c20876016f92487006d95507fccb0699b0ef22ae19cc417c79e` | 1.61 GB | LFM Open License v1.0 (check) |

For reference (non-commercial, do not ship): Qwen2.5-Omni-3B – `Qwen2.5-Omni-3B-Q4_K_M.gguf` 2,104,931,648 `4b0bd358c1e9ec55dd3055ef6d71c958c821533d85916a10cfa89c4552a86e29`; `mmproj-Qwen2.5-Omni-3B-Q8_0.gguf` 1,538,031,328 `4e6c816cd33f7298d07cb780c136a396631e50e62f6501660271f8c6e302e565`.

Small speech-only option: Ultravox v0.5 1B – `Llama-3.2-1B-Instruct-Q4_K_M.gguf` 807,694,464 `6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83`; `mmproj-ultravox-v0_5-llama-3_2-1b-f16.gguf` 1,371,123,616 `b34dde1835752949d6b960528269af93c92fec91c61ea0534fcc73f96c1ed8b2` (repo `ggml-org/ultravox-v0_5-llama-3_2-1b-GGUF`).

Plain conclusion: with a clean open licence, no small llama.cpp model is *documented* to describe laughter, applause, music or wind. For non-speech sound the realistic choices are (a) Gemini in the cloud (its docs say it "understands non-speech sounds (birdsong, sirens, etc.)"), (b) LFM3-Omni-2B if its licence suits, or (c) a classic sound tagger (section 4).

### Classic sound taggers and image embedders (survey)

| Model | What it gives | Size | Licence | ONNX |
|---|---|---|---|---|
| YAMNet | 521 AudioSet classes | about 3.7 M parameters (a few MB) | Apache-2.0 (per a derivative's card; original repo licence not re-read) | Official ONNX file size not found |
| PANNs CNN14 | 527 AudioSet classes | about 81 M parameters | MIT (GitHub repo) | Not checked |
| AST (AudioSet) | 527 classes | 346 MB fp32; 91 MB quantised ONNX (`Xenova/ast-finetuned-audioset-10-10-0.4593`) | BSD-3-Clause | Yes |
| LAION CLAP (htsat-unfused) | Free-text sound search | audio encoder ONNX 118 MB (34 MB quantised), text encoder 502 MB (127 MB quantised) | Code CC0-1.0; HF weights card Apache-2.0 | Yes (`Xenova/clap-htsat-unfused`) |
| BEATs | AudioSet tagging | about 90 M parameters | MIT (microsoft/unilm) | Not checked |
| CLIP ViT-B/32 | Image–text search | vision ONNX 352 MB (89 MB quantised), text 254 MB (65 MB quantised) | MIT | Yes (`Xenova/clip-vit-base-patch32`) |
| SigLIP 2 base | Image–text search | vision ONNX 372 MB (95 MB quantised), text 1.13 GB (283 MB quantised) | Apache-2.0 (upstream) | Yes (`onnx-community/siglip2-base-patch16-224-ONNX`) |
| MobileCLIP-S0 | Image–text search, small | vision ONNX 45.5 MB (11.8 MB quantised), text 170 MB (42.8 MB quantised) | Apple AMLR licence (`apple-amlr`) – read before shipping | Yes (`Xenova/mobileclip_s0`) |
| Apple SoundAnalysis built-in classifier | A few hundred sound classes | Built into macOS | Mac only | – (exact class count and OS minimum unconfirmed) |

Speeds for all of these were not fetched.

## 4. The helper runtime: llama-server vs Ollama vs onnxruntime

### llama.cpp `llama-server` (MIT)

Release layout has changed: **"latest" on GitHub is now `v1.0.0`** (13 Nov 2026), which carries only `nightly-tag.txt` pointing at build **`b12359`**. The binaries live in the `b…` build releases (flagged pre-release). The newest visible build is **`b12532`** (19 Nov 2026, 04:45 UTC). Pinning `b12359` (the v1.0.0 build) is the conservative choice.

**b12359 (the v1.0.0 build)** – base URL `https://github.com/ggml-org/llama.cpp/releases/download/b12359/`

| Platform | Asset | Bytes | sha256 |
|---|---|---|---|
| macOS arm64 (Metal) | `llama-b12359-bin-macos-arm64.tar.gz` | 16,907,811 | `82b00abc740160e1b9980e6cc79c117345fa34af058c80e6c0a69aa8ddccde75` |
| macOS x64 (CPU only) | `llama-b12359-bin-macos-x64.tar.gz` | 12,661,621 | `25320d529077ef5a3d16e7b5da26438f221d88c8c0930a32b0c79457f5eede56` |
| Windows x64 CPU | `llama-b12359-bin-win-cpu-x64.zip` | 25,097,509 | `837c1655e87df3b66989f4be33a792a1399c785bf259038dc75c900096683e69` |
| Windows x64 Vulkan | `llama-b12359-bin-win-vulkan-x64.zip` | 38,090,643 | `e8d18c6e4210cca87e7307c2ea78363ac8d158e4e1397358ec96ab70b53a0d5e` |

**b12532 (newest)** – base URL `https://github.com/ggml-org/llama.cpp/releases/download/b12532/`

| Platform | Asset | Bytes | sha256 |
|---|---|---|---|
| macOS arm64 (Metal) | `llama-b12532-bin-macos-arm64.tar.gz` | 17,335,616 | `e3162c7d47e796435bcdef4ca348c56f4a315eebefc90109ca15d40e1d136ca8` |
| macOS x64 (CPU only) | `llama-b12532-bin-macos-x64.tar.gz` | 13,109,615 | `6b924dab04936022ade3a2f54f3f8fec781229cea01ed2f646019842262efd63` |
| Windows x64 CPU | `llama-b12532-bin-win-cpu-x64.zip` | 25,700,468 | `beb8c051a782fb0970d4ae20fa276a6dfd3e7245685b185244a22570e9e473fa` |
| Windows x64 Vulkan | `llama-b12532-bin-win-vulkan-x64.zip` | 38,910,645 | `adf70e4956e5277c1a8bfce17a9b59e098eac286a1e2b1cb8c76b72c908c20aa` |

Also offered for Windows x64: CUDA 12.4 / 13.5 (plus separate `cudart` DLL zips), SYCL, OpenVINO, ROCm; Windows arm64 CPU, Vulkan, OpenCL-Adreno.

What is inside (read from `.github/workflows/release.yml`, archives not opened):

- **macOS**: now a **`.tar.gz`, not a zip**. Contents of `build/bin` under a top folder named after the tag, so the executable is `llama-<tag>/llama-server` (for example `llama-b12359/llama-server`), with its `.dylib` files and `LICENSE` beside it. Built with rpath `@loader_path`, so keep everything in one folder. Minimum macOS 13.3. The arm64 build embeds the Metal shaders; the x64 build has Metal switched off.
- **Windows**: flat zip of `build\bin\Release\*`, so `llama-server.exe` is at the zip root beside its DLLs. Backends are loadable DLLs (`GGML_BACKEND_DL=ON`, all CPU variants, bundled OpenMP). The Vulkan zip is the CPU zip plus the Vulkan backend DLL (merged at release time).
- Exact dylib/DLL names were not listed (unconfirmed) – extract the whole archive.
- Node has no built-in tar reader. Simplest route: spawn the system `tar` (`/usr/bin/tar` on macOS; `tar.exe` ships with Windows 10 and later and also extracts zips).
- **Signing**: the macOS job has no codesign or notarisation step, so the binaries are at most ad-hoc (linker-signed), not notarised. A file written by Node does not get the quarantine attribute, so it should run without a Gatekeeper prompt – inferred, not tested. The Windows binaries are presumably unsigned (unconfirmed); SmartScreen does not apply to a spawned child process, antivirus might.

Confirmed from `tools/server/README.md` and `docs/multimodal.md`:

- Start with `-m model.gguf --mmproj mmproj.gguf` (flag `-mm, --mmproj FILE`). "Currently, we support **image**, **audio** and **video** input." The server README still calls multimodal "experimental".
- `/v1/chat/completions` content parts:
  - `image_url` – `image_url.url` may be a remote URL, base64 (raw or `data:image/...;base64,`) or a local path; formats as `stb_image` (jpeg, png, tga, bmp, gif…).
  - `input_audio` – `input_audio.data` or `.url`; formats as `miniaudio` (**mp3, wav, flac**); `format` is ignored and auto-detected.
  - `input_video` – `.data` or `.url`; needs `ffmpeg` (`--video-ffmpeg-dir DIR`, `--video-fps N` default 4.0).
  - Local file paths need `--media-path` and a `file://` prefix.
- Flags: `--host` (default `127.0.0.1`), `--port` (**default now 9931**, not 8080), `-ngl, --n-gpu-layers N|auto|all` (default auto), `-c, --ctx-size N` (0 = from model), `-t, --threads N`, `--no-webui` / `--no-ui`, `--no-mmproj-offload`, `--image-min-tokens`, `--image-max-tokens`, `-np, --parallel`, `--api-key`, `-to, --timeout` (default 3600 s), `--sleep-idle-seconds`, `--offline`, `--log-disable`, `--reasoning off`.
- `GET /health` (also `/v1/health`): 503 `{"error":{"code":503,"message":"Loading model",…}}` while loading; 200 `{"status":"ok"}` when ready. No API key needed.

### Ollama / LM Studio

- Ollama (MIT) is a separate install with its own model store and local HTTP API. Its vision list today is dominated by 2026 models (for example `lfm3-omni` 2b, `lfm3-vl` 2b, `bonsai-2` 2b–27b, `qwen3.8` 27b, `mimo-v2.6` 9b, `muse-glimmer` 30b); sizes in bytes are not shown on the listing page. Gemma, LLaVA, Moondream and MiniCPM-V did not appear on the first page of that listing.
- LM Studio was not checked.
- Verdict: fine as an optional "use what I already have" path; not something to depend on, as we cannot install it silently or pin model checksums.

### onnxruntime

- onnxruntime-web: WASM is the default CPU provider; WebGPU optional; threads only with `crossOriginIsolated`; the proxy worker does not work under a restrictive CSP. Current file names are `ort-wasm-simd*.wasm`, so SIMD appears to be required (Chromium 99 has WASM SIMD). Good for small embedders/taggers (CLIP, CLAP, AST); it cannot produce free-text descriptions.
- onnxruntime-node 1.31.1: MIT, N-API 6, win32/darwin/linux, no `engines` restriction stated. Untested in CEP's Node 17.7.
- Either one brings a third-party library into an app that has none. The llama-server route does not.

## 5. Cloud models and prices (19 Nov 2026)

### Google Gemini – takes video and audio natively

USD per 1 M tokens, standard paid tier (source: Gemini API pricing page; it carried no "last updated" date).

| Model id | Input (text/image/video) | Audio input | Output (incl. thinking) | Free tier | Note |
|---|---|---|---|---|---|
| `gemini-4-carbon` | 2.00 | same | 10.00 | No | **Rises to 4.00 / 20.00 on 1 Dec 2026**. Strongest. |
| `gemini-4-argon` | 2.00 | same | 10.00 | No | Rises to 4.00 / 20.00 on 1 Dec 2026. |
| `gemini-4-neon` | 3.00 | same | 15.00 | No | |
| `gemini-4-hydrogen` | 1.50 | same | 7.50 | Yes | Google's suggestion for new projects. |
| `gemini-3.8-flash` | 0.75 | same | 3.75 | Yes | **Rises to 1.50 / 7.50 on 1 Jan 2027**. |
| `gemini-3.6-flash` | 0.75 | same | 3.75 | Yes | Previous Flash; same rise. |
| `gemini-3.5-flash-lite` | 0.30 | same | 2.50 | Yes | Google's other suggestion for new projects. |
| `gemini-3.1-flash-lite` | 0.25 | 0.50 | 1.50 | Yes | |
| `gemini-3.1-pro-preview` | 2.00 (4.00 over 200k) | same | 12.00 (18.00 over 200k) | No | Preview. |
| `gemini-2.5-flash-lite` | 0.10 | 0.30 | 0.40 | Yes | Older generation. |
| `gemini-2.5-flash` / `gemini-2.5-pro` | – | – | – | – | Deprecated; rerouted on 1 Dec 2026. Do not use. |

Batch is half price. All listed Gemini 4 models take text, image, audio, video and PDF with a 1 M context.

Free tier and privacy: for every model with a free tier the pricing page says "Used to improve our products: **Yes**" on the free tier and "**No**" on paid. So free-tier footage may be used for training; paid is not.

Tokens (the two Google pages disagree – both shown):

| Item | Video-understanding page | Media-resolution page (Gemini 3 and 4) |
|---|---|---|
| Video frame, low | 66 tokens | 70 tokens |
| Video frame, default | 258 tokens "unless resolution is low", yet the page labels about 100 tokens/s as "default (low)" | 70 tokens (unspecified = default) |
| Video frame, high | about 300 tokens/s in total | 280 tokens |
| Sampling | 1 frame per second (custom `fps` in (0, 24]) | – |
| Audio | 32 tokens/s | 25 tokens/s |
| Still image | – | 1,120 default, 280 low, 560 medium, 2,240 ultra-high |

Working figures used below: **about 100 tokens per second** of video with sound at low (which appears to be the default on Gemini 3 and 4) and **about 300 tokens per second** at high (the old 2.5-era default). Audio alone: 32 tokens/s (1,920 per minute).

Limits:

- Video length: up to 3 hours at default (low) and 1 hour at high, on 1 M-context models. Up to 10 videos per request.
- Audio: up to 9.5 hours per prompt; many formats (wav, mp3, aac, flac, ogg, m4a, opus…); multi-channel is mixed down; non-speech sounds are understood; refer to times as MM:SS.
- Inline request size: the Files page says use the Files API above **100 MB** total request size; older text on the video and audio pages still says 20 MB. Assume 20 MB is always safe and 100 MB is the present limit.
- Files API: free; kept **48 hours**; **2 GB per file, 20 GB per project** (Files page). The video page says 20 GB per file on paid and 2 GB on free. Treat 2 GB as the safe figure.
- Clipping: `start_offset` / `end_offset` strings in seconds (for example `"60s"`).
- "Agentic video understanding" on Gemini 4 / 3.8 / 3.6 / 3.5-lite can use up to 88% fewer input tokens on long video (Google's claim).

### Anthropic Claude – images only

No video or audio input. Formats JPEG, PNG, GIF, WebP.

| Model | API id | Input | Output |
|---|---|---|---|
| Claude Fable 5.2 | `claude-fable-5-2` | 8.00 | 40.00 |
| Claude Opus 5.5 | `claude-opus-5-5` | 4.00 | 20.00 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2.00 | 10.00 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | 0.10 (prompt up to 100,000 tokens) / 0.50 (over) | 0.50 / 2.50 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | 1.00 | 5.00 |

Batch API: 50% off. Image tokens: **`ceil(width / 28) × ceil(height / 28)`** (28 × 28-pixel patches). Images are scaled down first to fit the model's tier: Claude 4.7 and later – long edge 2,576 px and at most 4,784 tokens; older models – 1,568 px and 1,568 tokens. Examples: 1000 × 1000 = 1,296 tokens; 1920 × 1080 = 2,691 tokens (high-resolution tier) or 1,560 (standard); a 768 × 432 still = 28 × 16 = 448 tokens; 512 × 288 = 19 × 11 = 209 tokens. Limits: 600 images per request (100 on 200k-context models), 10 MB per image, 8000 × 8000 px, 128 MB per request; more than 20 images in a request triggers a stricter per-image size limit.

### OpenAI – survey only

Flagships `gpt-6.2-astra` 8.00 / 40.00, `gpt-6.2-sol` 2.00 / 10.00, `gpt-6.1-terra` 1.00 / 5.00, `gpt-6-luna` 0.10 / 0.50. Audio input only on the `gpt-audio*` and `gpt-realtime*` models (32.00 per 1 M audio tokens; mini 10.00). The pricing page mentions no native video input.

## 6. Cost and time per hour of footage

Input cost only, at today's prices. Output (the descriptions, plus any thinking tokens) is extra: 15,000 output tokens per footage hour would add about $0.06 on 3.8 Flash and $0.04 on 3.5 Flash-Lite.

Token counts: video + sound at low ≈ 6,000 per minute = 360,000 per hour; at high ≈ 18,000 per minute = 1,080,000 per hour (over the 1 M context, so split the hour). "Stills + audio" = one still every 5 s at 258 tokens (3,096 per minute) + audio (1,920 per minute) = 5,016 per minute = 300,960 per hour. Audio only = 115,200 per hour.

| Gemini model | Video low: per min / per hour | Video high: per min / per hour | Stills + audio: per hour | Audio only: per hour |
|---|---|---|---|---|
| `gemini-2.5-flash-lite` | $0.0010 / $0.058 | $0.0021 / $0.127 | $0.053 | $0.035 |
| `gemini-3.5-flash-lite` | $0.0018 / $0.108 | $0.0054 / $0.324 | $0.090 | $0.035 |
| `gemini-3.1-flash-lite` | $0.0020 / $0.117 | $0.0048 / $0.290 | $0.104 | $0.058 |
| `gemini-3.8-flash` (doubles 1 Jan 2027) | $0.0045 / $0.27 | $0.0135 / $0.81 | $0.226 | $0.086 |
| `gemini-4-hydrogen` | $0.0090 / $0.54 | $0.0270 / $1.62 | $0.451 | $0.173 |
| `gemini-4-carbon`, `gemini-4-argon` (double 1 Dec 2026) | $0.0120 / $0.72 | $0.0360 / $2.16 | $0.602 | $0.230 |
| `gemini-4-neon` | $0.0180 / $1.08 | $0.0540 / $3.24 | $0.903 | $0.346 |

(For the two models with a separate audio price the frames and audio were priced separately: 66 or 258 tokens per frame at 1 fps, 32 audio tokens per second.)

Observations:

- At 258 tokens per still, "one still every 5 s + audio" is barely cheaper than native low-resolution video, which gives 60 frames a minute instead of 12. On Gemini 3 and 4 a still costs 280 tokens at low and 1,120 at default, so set `media_resolution` low for stills or it becomes dearer than video.
- Native video means uploading the footage (or a small proxy) to Google. Stills + audio keeps uploads tiny.

Claude, stills only (720 stills per footage hour at 448 tokens each = 322,560 tokens): Haiku 5.5 $0.032 (keep each request under 100,000 prompt tokens, about 200 stills, or the rate is five times higher), Sonnet 5.5 $0.65, Opus 5.5 $1.29, Fable 5.2 $2.58. No sound.

Local: free to run. Time per hour of footage could not be computed – no published per-image speeds were found. At one still every 5 s there are 720 stills per footage hour; multiply by the measured seconds per still.

## 7. Licences

| Item | Licence | OK to ship / auto-download in a commercial tool? |
|---|---|---|
| llama.cpp / llama-server | MIT | Yes (keep the `LICENSE` file that is in the archive) |
| SmolVLM2 (500M, 2.2B) | Apache-2.0 | Yes |
| Gemma 4 (E2B, E4B, 12B) | Apache-2.0 | Yes |
| Qwen3-VL-2B, Qwen3.5-4B, Qwen2.5-VL-7B, InternVL3-2B | Apache-2.0 | Yes |
| Gemma 3 / 3n | Gemma terms of use | Usable, but has a use policy; prefer Gemma 4 |
| **Qwen2.5-VL-3B** | **Qwen Research** (upstream) | **No – non-commercial** |
| **Qwen2.5-Omni 3B / 7B** | **Qwen Research** | **No – non-commercial** |
| LFM3-Omni-2B, LFM2-VL | LFM Open License v1.0 | Unconfirmed – read the licence first |
| Ultravox v0.5 | MIT projector + Llama 3.2 community licence | Usable with Meta's conditions |
| Voxtral Mini 3B | Apache-2.0 | Yes |
| PANNs MIT · AST BSD-3 · BEATs MIT · CLAP CC0 code / Apache-2.0 weights card · CLIP MIT · SigLIP 2 Apache-2.0 | – | Yes |
| MobileCLIP | Apple AMLR | Read first |
| Ollama | MIT | Yes (not bundled) |
| onnxruntime | MIT | Yes |

## What could not be confirmed

- Exact dylib / DLL file names inside the llama.cpp archives (archives were not opened; layout taken from the release workflow).
- That the un-notarised macOS `llama-server` runs when downloaded by Node without a Gatekeeper prompt – inferred from "no codesign step" and "no quarantine attribute", not tested. Windows signing status not checked.
- Which build first included LFM3-Omni support (PR #31257) – assumed present in b12359 and b12532 because the master README documents it.
- Published speed (seconds per image) for any model on Apple Silicon, a PC CPU or a small GPU; published RAM tables. Memory figures here are estimates.
- Whether Gemma 4 E2B/E4B, Ultravox and Voxtral can usefully describe non-speech sound (their cards claim speech tasks only).
- The actual terms of the LFM Open License v1.0 and the full Qwen Research licence text (identified by licence name only); the Qwen3-ASR licence.
- llama.cpp support for Qwen3-VL-2B and Qwen3.5-4B is inferred (GGUF + mmproj repos exist) – they are not on the docs list.
- Gemini token rates: the two Google pages disagree (66 vs 70 tokens per low frame; 258 vs 70 default; 32 vs 25 audio tokens/s), and on inline limit (20 MB vs 100 MB) and Files API file size (2 GB vs 20 GB paid). Count tokens with the API before trusting the cost table.
- Which Gemini 4 model is the "Pro" and which the "Flash" – Google's pages do not use those labels for Gemini 4.
- No "last updated" date on any Google or OpenAI page; the retrieval date (19 Nov 2026) is the date of all prices.
- Whether current onnxruntime-web runs on Chromium 99 and whether onnxruntime-node loads in CEP's Node 17.7.
- YAMNet official ONNX size and original licence file; PANNs/BEATs ONNX availability; speeds of all taggers; Apple SoundAnalysis class count and OS minimum (page would not load); LM Studio; MiniCPM-V.
- Claude: the exact stricter per-image size limit for requests with more than 20 images (the sentence was cut off).

## Sources

- https://api.github.com/repos/ggml-org/llama.cpp/releases/latest
- https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=8
- https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b12359
- https://github.com/ggml-org/llama.cpp/releases/download/v1.0.0/nightly-tag.txt
- https://raw.githubusercontent.com/ggml-org/llama.cpp/master/.github/workflows/release.yml
- https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md
- https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/multimodal.md
- https://raw.githubusercontent.com/ggml-org/llama.cpp/master/LICENSE
- https://huggingface.co/api/models/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/SmolVLM2-2.2B-Instruct-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/gemma-4-E2B-it-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/gemma-4-E4B-it-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/gemma-3-4b-it-GGUF/tree/main
- https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/Qwen3.5-4B-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/tree/main
- https://huggingface.co/api/models/Qwen/Qwen2.5-VL-3B-Instruct
- https://huggingface.co/api/models/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/InternVL3-2B-Instruct-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/moondream2-20250414-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/LFM3-Omni-2B-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/Qwen2.5-Omni-3B-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/ultravox-v0_5-llama-3_2-1b-GGUF/tree/main
- https://huggingface.co/api/models/ggml-org/Voxtral-Mini-3B-2507-GGUF/tree/main
- https://huggingface.co/google/gemma-4-E2B-it
- https://huggingface.co/Qwen/Qwen2.5-Omni-3B
- https://huggingface.co/LiquidAI/LFM3-Omni-2B
- https://huggingface.co/api/models?author=ggml-org&sort=lastModified&direction=-1&limit=60
- https://aistudio.google.com/docs/pricing (redirect from ai.google.dev/gemini-api/docs/pricing)
- https://aistudio.google.com/docs/models
- https://aistudio.google.com/docs/video-understanding
- https://aistudio.google.com/docs/audio
- https://aistudio.google.com/docs/files
- https://aistudio.google.com/docs/media-resolution
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://developers.openai.com/api/docs/pricing
- https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- https://registry.npmjs.org/onnxruntime-node/latest
- https://ollama.com/search?c=vision
- GitHub repo licence fields: qiuqiangkong/audioset_tagging_cnn, LAION-AI/CLAP, microsoft/unilm, YuanGongND/ast, ollama/ollama
- Hugging Face file listings: Xenova/clap-htsat-unfused, Xenova/ast-finetuned-audioset-10-10-0.4593, Xenova/clip-vit-base-patch32, onnx-community/siglip2-base-patch16-224-ONNX, Xenova/mobileclip_s0, apple/MobileCLIP-S0, google/siglip2-base-patch16-224
- https://huggingface.co/STMicroelectronics/yamnet (YAMNet licence, via search)

## What was built (filled in by the build)

