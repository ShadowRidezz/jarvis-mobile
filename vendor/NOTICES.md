# Bundled third-party code

| Folder | What | Source | License |
|---|---|---|---|
| `web-llm.js` | WebLLM 0.2.88 (the on-phone brain) | npm `@mlc-ai/web-llm` | Apache-2.0 (`web-llm.LICENSE`) |
| `ort/` | ONNX Runtime Web 1.18.0, single-thread WASM build (runs the voice) | npm `onnxruntime-web` | MIT |
| `piper/` | piper-phonemize compiled to WASM, with eSpeak NG data (text to phonemes) | npm `@diffusionstudio/piper-wasm` 1.0.0 | MIT; the eSpeak NG data is GPL-3.0 (github.com/espeak-ng/espeak-ng) |

The voice itself (`en_GB-alan-medium`, the same file JARVIS uses on the PC) is not stored here: the phone downloads
it once from huggingface.co/rhasspy/piper-voices.
