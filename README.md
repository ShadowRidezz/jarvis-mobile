# J.A.R.V.I.S. mobile

JARVIS on the phone, working with the PC off. The brain is a small language model that runs **on the phone**
(WebLLM over WebGPU): downloaded once, then fully offline, free, and conversations never leave the phone.
Memory is shared with JARVIS on the PC through a **private** GitHub repo.

| | |
|---|---|
| Brain | Balanced: Llama 3.2 1B (0.7 GB) · Smartest: Qwen3 1.7B (1.0 GB) |
| Needs | Safari on iOS 26+, or Chrome on Android (WebGPU) |
| Voice | Phone speech recognition in, phone voices out (British if available) |
| Memory | "remember that …", "forget …" · synced with the PC |
| Can't (phone only) | Live web (weather, news, prices), PC control — those stay with JARVIS on the PC |

## Set up

1. **This repo** (`jarvis-mobile`, public: it holds no personal data) → Settings › Pages › *Deploy from a branch* › `main` / root.
   The app is then at `https://<you>.github.io/jarvis-mobile/`.
2. **Memory repo**: create a **private**, empty repo called `jarvis-data`. JARVIS on the PC syncs it on its own with the
   PC's git login (sync-data/ in the JARVIS folder); nothing to set up there.
3. **Phone**: open the app in Safari → Share › *Add to Home Screen*. Open it, tap **Download brain** (on Wi-Fi).
4. **Memory sync on the phone**: GitHub › Settings › Developer settings › *Fine-grained tokens* › Generate:
   repository access *Only select repositories* → `jarvis-data`; permissions *Contents: Read and write*.
   Paste it in JARVIS › Settings › Memory sync. It is stored only on the phone.

## How sync works

`memory.json` in `jarvis-data` holds the facts. The phone (GitHub API) and the PC (git) both run the same 3-way merge
(`merge.js` / the PC's `cloudsync.py`): each keeps the list as it stood after its last sync, so a fact missing on one
side counts as deleted there, unless the other side edited it since. Run `node test/merge.test.mjs` for the rules.

## Files

`index.html` · `style.css` · `app.js` (chat, voice, memory, sync) · `merge.js` · `brain-worker.js` (the model, off the
UI thread) · `sphere.js` (the orb, same as the PC's) · `sw.js` (offline) · `vendor/web-llm.js` (WebLLM 0.2.88, Apache-2.0).
