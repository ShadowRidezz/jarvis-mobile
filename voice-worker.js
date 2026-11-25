// JARVIS's voice on the phone: Piper with the same Alan voice file the PC uses (en_GB-alan-medium, identical
// SHA-256), the same speed rule (length_scale = 1 / speech rate), run on the phone in this worker so speaking never
// stalls the orb. Text -> phonemes (piper-phonemize + eSpeak NG data) -> ONNX model -> 22.05 kHz PCM.
// The voice (63 MB) downloads once into Cache Storage; after that it works offline.
/* global createPiperPhonemize, ort */
importScripts("vendor/piper/piper_phonemize.js", "vendor/ort/ort.wasm.min.js");

const VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx";
const CACHE = "jarvis-voice-v1";
const base = new URL("./", self.location).href;
ort.env.wasm.numThreads = 1;                 // GitHub Pages can't enable cross-origin isolation, so no threads
ort.env.wasm.wasmPaths = base + "vendor/ort/";

let session = null, config = null, phonWasm = null, phonData = null, loading = null;

async function cached(url, onProgress) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const r = await fetch(url);
  if (!r.ok) throw new Error("download failed (" + r.status + ")");
  const total = +r.headers.get("content-length") || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (onProgress) onProgress(got, total);
  }
  const blob = new Blob(parts);
  await cache.put(url, new Response(blob, { headers: { "Content-Type": "application/octet-stream" } }));
  return blob.arrayBuffer();
}

function load() {
  if (loading) return loading;
  loading = (async () => {
    const [cfgBuf, model, wasm, data] = await Promise.all([
      cached(VOICE_URL + ".json"),
      cached(VOICE_URL, (got, total) => postMessage({ type: "progress", got, total })),
      fetch(base + "vendor/piper/piper_phonemize.wasm").then((r) => r.arrayBuffer()),
      fetch(base + "vendor/piper/piper_phonemize.data").then((r) => r.arrayBuffer()),
    ]);
    config = JSON.parse(new TextDecoder().decode(cfgBuf));
    phonWasm = wasm; phonData = data;
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    postMessage({ type: "ready" });
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// eSpeak phonemes -> Piper ids. A fresh small WASM instance per sentence (the tool exits after each run); the 18 MB
// eSpeak data and the WASM are handed over from memory, not fetched again.
function phonemize(text) {
  return new Promise((resolve, reject) => {
    let out = null;
    createPiperPhonemize({
      noInitialRun: true,
      wasmBinary: phonWasm,
      getPreloadedPackage: () => phonData,
      print: (line) => { try { out = JSON.parse(line).phoneme_ids; } catch (_) {} },
      printErr: () => {},
      locateFile: (f) => base + "vendor/piper/" + f,
    }).then((mod) => {
      mod.callMain(["-l", config.espeak.voice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]);
      out ? resolve(out) : reject(new Error("no phonemes"));
    }, reject);
  });
}

async function speak(text, rate) {
  await load();
  const ids = await phonemize(text);
  const inf = config.inference || {};
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([inf.noise_scale ?? 0.667, 1 / (rate || 1), inf.noise_w ?? 0.8]), [3]),
  };
  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
  const res = await session.run(feeds);
  return { pcm: new Float32Array(res.output.data), sr: config.audio.sample_rate };
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === "load") { await load(); return; }
    if (m.type === "speak") {
      const { pcm, sr } = await speak(m.text, m.rate);
      postMessage({ type: "audio", id: m.id, pcm, sr }, [pcm.buffer]);
    }
  } catch (e) {
    postMessage({ type: "error", id: m.id, message: String((e && e.message) || e) });
  }
};
