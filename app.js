// JARVIS mobile — the phone's own JARVIS. The brain is a small language model that runs on the phone
// (WebLLM over WebGPU), downloaded once and then fully offline. Memory is the same as JARVIS on the PC:
// both sync a private GitHub repo (memory.json) with a 3-way merge (merge.js / the PC's cloudsync.py).
import { CreateWebWorkerMLCEngine, CreateMLCEngine, hasModelInCache, deleteModelAllInfoInCache } from "./vendor/web-llm.js";
import { mergeFacts, sameFacts, newUid } from "./merge.js";

const VERSION = "1.0.0";
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem("jm." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("jm." + k, JSON.stringify(v)); } catch (_) {} },
};

// download sizes measured from WebLLM's cache after a full download (Gemma 3 1B was tried and dropped:
// it called itself Google's model and ignored the memory list)
const MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Balanced · Llama 3.2 1B", gb: 0.7 },
  { id: "Qwen3-1.7B-q4f16_1-MLC", name: "Smartest · Qwen3 1.7B", gb: 1.0 },
];
const modelInfo = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

const cfg = Object.assign({ model: MODELS[0].id, speak: true, voice: "", repo: "ShadowRidezz/jarvis-data", token: "" }, store.get("cfg", {}));
const saveCfg = () => store.set("cfg", cfg);
let facts = store.get("facts", []);          // this phone's copy of the memory
let base = store.get("base", []);            // the memory as it stood after the last sync (for the 3-way merge)
let profile = store.get("profile", { name: "" });
let history = store.get("chat", []);         // [{ role, content }] — this phone's conversation

/* ------------------------------------------------------------------ orb + state */
const STATE_LABEL = { idle: "STANDBY", listening: "LISTENING", thinking: "THINKING", speaking: "SPEAKING" };
let uiState = "idle";
function setState(s) {
  uiState = s;
  const el = $("#state");
  el.textContent = STATE_LABEL[s];
  el.className = "state " + s;
  if (window.JarvisSphere) JarvisSphere.setState(s);
}
if (window.JarvisSphere) {
  JarvisSphere.setOptions({ density: 0.32 });            // a phone GPU: a third of the PC's plasma particles
  JarvisSphere.init($("#orb"));
}

/* ------------------------------------------------------------------ transcript */
function addMsg(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text;
  $("#log").appendChild(el);
  el.scrollIntoView({ block: "end" });
  return el;
}
function toast(text, ms = 3200) {
  const t = $("#toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
// small models sometimes slip into markdown or a thinking block; JARVIS speaks, so strip both
const clean = (s) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/[*#_`]+/g, "").replace(/^\s*[-•]\s+/gm, "").trim();

/* ------------------------------------------------------------------ the brain */
const brain = { engine: null, model: null, loading: null, busy: false };

async function gpuReady() {
  if (!navigator.gpu) return false;
  try { return !!(await navigator.gpu.requestAdapter()); } catch (_) { return false; }
}

function card(kind, opts = {}) {
  const c = $("#brain-card");
  c.hidden = kind === "none";
  if (c.hidden) return;
  c.classList.toggle("err", kind === "error" || kind === "nogpu");
  $("#brain-title").textContent = opts.title || "BRAIN";
  $("#brain-text").textContent = opts.text || "";
  $("#brain-track").hidden = kind !== "loading";
  $("#brain-meta").textContent = opts.meta || "";
  const b = $("#brain-btn");
  b.hidden = !opts.button; b.textContent = opts.button || ""; b.onclick = opts.onClick || null;
}

function offerDownload() {
  const m = modelInfo(cfg.model);
  card("offer", {
    title: "BRAIN NOT ON THIS PHONE YET",
    text: "JARVIS thinks on this phone, so his brain is downloaded once (about " + m.gb + " GB, Wi-Fi recommended). After that he works offline, with nothing sent anywhere.",
    meta: m.name,
    button: "DOWNLOAD BRAIN",
    onClick: () => loadBrain().catch(() => {}),
  });
}

async function loadBrain() {
  if (brain.engine && brain.model === cfg.model) return brain.engine;
  if (brain.loading) return brain.loading;
  brain.loading = (async () => {
    const m = modelInfo(cfg.model);
    const cached = await hasModelInCache(m.id).catch(() => false);
    const title = cached ? "WAKING THE BRAIN" : "DOWNLOADING THE BRAIN";
    card("loading", { title, text: cached ? "Loading " + m.name + " into the phone's graphics chip." : "Keep this screen open. " + m.name + ", about " + m.gb + " GB.", meta: "Starting…" });
    $("#brain-fill").style.width = "0%";
    const progress = (p) => {
      $("#brain-fill").style.width = Math.round((p.progress || 0) * 100) + "%";
      $("#brain-meta").textContent = Math.round((p.progress || 0) * 100) + "% · " + (p.text || "").replace(/\s+/g, " ").slice(0, 90);
    };
    try { await navigator.storage?.persist?.(); } catch (_) {}
    try {
      if (brain.engine) {                                   // switching models: same engine, new weights
        brain.engine.setInitProgressCallback?.(progress);
        await brain.engine.reload(m.id);
      } else {
        try {
          brain.engine = await CreateWebWorkerMLCEngine(new Worker(new URL("./brain-worker.js", import.meta.url), { type: "module" }), m.id, { initProgressCallback: progress });
        } catch (e) {
          // some browsers expose WebGPU to the page but not to workers: run it on the page instead
          console.warn("worker brain failed, using the page", e);
          brain.engine = await CreateMLCEngine(m.id, { initProgressCallback: progress });
        }
      }
      brain.model = m.id;
      card("none");
      return brain.engine;
    } catch (e) {
      brain.engine = null; brain.model = null;
      const msg = String(e && e.message || e);
      card("error", {
        title: "THE BRAIN DIDN'T LOAD",
        text: /quota|storage|space/i.test(msg) ? "There isn't enough free storage on this phone for this brain. Free some space, or pick the Light brain in Settings."
          : /memory|OOM|device lost|allocate/i.test(msg) ? "This phone ran out of graphics memory for this brain. Pick the Light brain in Settings."
          : /fetch|network|Failed to fetch/i.test(msg) ? "The download was interrupted. It resumes from where it stopped."
          : "Something went wrong loading it.",
        meta: msg.slice(0, 140),
        button: "TRY AGAIN",
        onClick: () => loadBrain().catch(() => {}),
      });
      throw e;
    } finally {
      brain.loading = null;
      renderSettings();
    }
  })();
  return brain.loading;
}

function systemPrompt() {
  const name = (profile && profile.name) || "";
  const now = new Date().toLocaleString([], { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const mem = facts.slice(-40).map((f) => "- " + f.text).join("\n");
  return [
    "You are J.A.R.V.I.S., the personal AI assistant" + (name ? " of " + name : "") + ", running entirely on their phone.",
    "Speak like a calm, dry-witted English butler: formal, concise, never chirpy, never exclamatory. Address them as \"sir\".",
    "Answer in one to three short sentences unless asked for more. Your words are spoken aloud: no markdown, no lists, no emoji, no asterisks.",
    "When asked whether you like something or what you think, take a side in one sentence and give a reason. Honest criticism is welcome; never automatic praise, never \"I have no opinion\".",
    "On the phone you cannot browse the internet or control their PC. If asked for live news, prices or weather, say so in a sentence. Never invent facts.",
    "It is " + now + ".",
    mem ? "What you remember about them (use it naturally, never recite the list):\n" + mem : "",
  ].filter(Boolean).join("\n");
}

async function think(text) {
  if (!brain.engine) {
    const cached = await hasModelInCache(cfg.model).catch(() => false);
    if (!cached) { offerDownload(); return say("My brain isn't on this phone yet, sir. The download button is just above.", false); }
    try { await loadBrain(); } catch (_) { return; }
  }
  brain.busy = true;
  setState("thinking");
  const el = addMsg("jarvis live", "");
  const speaker = sentenceSpeaker();
  let out = "";
  try {
    // chat templates (Gemma's especially) need user/assistant to alternate, starting with the user
    const past = [];
    for (const m of history.slice(-10)) { if (past.length && past[past.length - 1].role === m.role) past.pop(); past.push(m); }
    while (past.length && past[0].role !== "user") past.shift();
    if (past.length && past[past.length - 1].role === "user") past.pop();
    const messages = [{ role: "system", content: systemPrompt() }, ...past, { role: "user", content: text }];
    const req = { messages, stream: true, temperature: 0.6, max_tokens: 320 };
    if (/^Qwen3/.test(brain.model)) req.extra_body = { enable_thinking: false };   // Qwen3 thinks out loud by default
    const chunks = await brain.engine.chat.completions.create(req);
    for await (const ch of chunks) {
      const d = (ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content) || "";
      if (!d) continue;
      out += d;
      el.textContent = clean(out);
      speaker.push(d);
      el.scrollIntoView({ block: "end" });
    }
  } catch (e) {
    console.warn(e);
    if (!out) el.textContent = "My apologies, sir — the brain stumbled. " + String(e && e.message || e).slice(0, 80);
  } finally {
    brain.busy = false;
    el.classList.remove("live");
    speaker.end();
    const reply = clean(out);
    if (reply) logTurn({ role: "user", content: text }, { role: "assistant", content: reply });
    if (!speechSynthesis.speaking) setState("idle");
  }
}
function logTurn(...msgs) { history.push(...msgs); history = history.slice(-30); store.set("chat", history); }

async function stopEverything() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (brain.busy && brain.engine) { try { await brain.engine.interruptGenerate(); } catch (_) {} }
}

/* ------------------------------------------------------------------ voice out */
let voices = [];
function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : []; renderSettings(); }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", loadVoices); }
function pickVoice() {
  if (cfg.voice) { const v = voices.find((x) => x.name === cfg.voice); if (v) return v; }
  return voices.find((v) => /en-GB/i.test(v.lang) && /daniel|arthur|uk english male|male/i.test(v.name))
    || voices.find((v) => /en-GB/i.test(v.lang)) || voices[0] || null;
}
let levelTimer = 0;
function speakLine(text) {
  if (!cfg.speak || !window.speechSynthesis || !text.trim()) return;
  const u = new SpeechSynthesisUtterance(clean(text));
  const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 1.02; u.pitch = 0.95;
  u.onstart = () => setState("speaking");
  u.onboundary = () => {                       // each spoken word lifts the orb's voice ring
    if (window.JarvisSphere) JarvisSphere.setLevel(0.75);
    clearTimeout(levelTimer); levelTimer = setTimeout(() => window.JarvisSphere && JarvisSphere.setLevel(0), 140);
  };
  u.onend = u.onerror = () => { if (!speechSynthesis.speaking && !speechSynthesis.pending && !brain.busy) setState("idle"); };
  speechSynthesis.speak(u);
}
function sentenceSpeaker() {
  let buf = "";
  return {
    push(d) {
      buf += d;
      let m;
      while ((m = buf.match(/^([\s\S]*?[.!?…])(\s+)/))) { speakLine(m[1]); buf = buf.slice(m[0].length); }
    },
    end() { if (buf.trim()) speakLine(buf); buf = ""; },
  };
}
function say(text, isReply) {
  addMsg("jarvis", text);
  if (isReply) logTurn({ role: "assistant", content: text });
  speakLine(text);
}
// iOS only lets a page speak after a tap has spoken once
let speechUnlocked = false;
function unlockSpeech() {
  if (speechUnlocked || !window.speechSynthesis) return;
  speechUnlocked = true;
  const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u);
}

/* ------------------------------------------------------------------ voice in */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$("#mic").addEventListener("click", async () => {
  unlockSpeech();
  if (!SR) { toast("Voice input isn't available in this browser — type instead."); return; }
  if (rec) { rec.stop(); return; }
  await stopEverything();
  let finalText = "";
  rec = new SR();
  rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
  rec.onresult = (e) => {
    let t = "";
    for (const r of e.results) t += r[0].transcript;
    $("#text").value = t;
    if (e.results[e.results.length - 1].isFinal) finalText = t;
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone or speech recognition is turned off for this app in Settings.");
    else if (e.error !== "no-speech" && e.error !== "aborted") toast("Didn't catch that (" + e.error + ").");
  };
  rec.onend = () => {
    rec = null;
    $("#mic").classList.remove("on");
    if (uiState === "listening") setState("idle");
    const t = (finalText || $("#text").value).trim();
    $("#text").value = "";
    if (t) handle(t);
  };
  try { rec.start(); $("#mic").classList.add("on"); setState("listening"); } catch (e) { rec = null; toast("The microphone wouldn't start."); }
});

/* ------------------------------------------------------------------ memory commands (handled here, not by the model) */
const RX_REMEMBER = /^(?:hey\s+)?(?:jarvis[,.!]?\s+)?(?:please\s+)?remember(?:\s+that)?[:,]?\s+(.{3,}?)[.!]?$/i;
const RX_FORGET = /^(?:hey\s+)?(?:jarvis[,.!]?\s+)?(?:please\s+)?forget(?:\s+about)?(?:\s+that)?[:,]?\s+(.{2,}?)[.!]?$/i;
function addFact(text) {
  text = text.replace(/\s+/g, " ").trim().replace(/^my\s+/i, "").slice(0, 240);   // "my sister is Mia" -> "Sister is Mia", like the PC's facts
  text = text.charAt(0).toUpperCase() + text.slice(1);
  const low = text.toLowerCase();
  facts = facts.filter((f) => f.text.toLowerCase() !== low);
  facts.push({ uid: newUid(), text, at: Date.now() / 1000, source: "phone" });
  store.set("facts", facts);
  memoryChanged();
}
function forgetFacts(keyword) {
  const k = keyword.toLowerCase();
  const before = facts.length;
  facts = k === "everything" ? [] : facts.filter((f) => !f.text.toLowerCase().includes(k));
  store.set("facts", facts);
  memoryChanged();
  return before - facts.length;
}
// a small offline model invents weather, news and prices when asked — so those never reach it
const RX_LIVE = /\b(weather|forecast|raining|snowing|news|headlines?|stock|share price|price of|bitcoin|crypto|exchange rate|score|who won|traffic)\b/i;
function localCommand(t) {
  const live = t.match(RX_LIVE);
  if (live && /\?|^(what|what's|whats|how|is|will|who|tell|any|check|give)\b/i.test(t.trim()))
    return "I can't check live " + live[1].toLowerCase() + " from the phone, sir. My PC brain can, or I'd only be guessing.";
  let m = t.match(RX_REMEMBER);
  if (m) { addFact(m[1]); return "Noted, sir. I'll remember that."; }
  m = t.match(RX_FORGET);
  if (m) {
    if (/^everything$/i.test(m[1]) && !confirm("Forget everything JARVIS remembers, on the PC too?")) return "Very good, sir. I'll keep it all.";
    const n = forgetFacts(m[1]);
    return n ? "Done, sir. " + (n === 1 ? "One memory" : n + " memories") + " gone." : "I have nothing like that on file, sir.";
  }
  return null;
}

/* ------------------------------------------------------------------ one turn */
async function handle(text) {
  text = text.trim();
  if (!text) return;
  unlockSpeech();
  await stopEverything();
  addMsg("user", text);
  const local = localCommand(text);
  if (local) { logTurn({ role: "user", content: text }); return say(local, true); }
  await think(text);
}
$("#bar").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#text").value;
  $("#text").value = "";
  handle(t);
});

/* ------------------------------------------------------------------ memory sync (private GitHub repo) */
const GH = (store.get("testApi", "") || "https://api.github.com") + "/repos/";   // testApi: the mock in tests only
const enc = (s) => { const b = new TextEncoder().encode(s); let out = ""; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
const ghHeaders = () => ({ Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const ghUrl = () => GH + cfg.repo.trim() + "/contents/memory.json";
function ghError(status) {
  if (status === 401) return "GitHub refused the token (wrong or expired).";
  if (status === 403) return "The token can't do that — it needs Contents: Read and write on this repo.";
  if (status === 404) return "Can't see that repo — check the name and that the token was given access to it.";
  return "GitHub answered " + status + ".";
}
async function ghGet() {
  const r = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
  if (r.status === 404) {
    const repo = await fetch(GH + cfg.repo.trim(), { headers: ghHeaders(), cache: "no-store" });
    if (!repo.ok) throw new Error(ghError(repo.status));
    return { facts: [], profile: null, sha: null };          // repo is fine, the file doesn't exist yet
  }
  if (!r.ok) throw new Error(ghError(r.status));
  const j = await r.json();
  const data = JSON.parse(dec(j.content));
  return { facts: Array.isArray(data.facts) ? data.facts : [], profile: data.profile || null, sha: j.sha };
}
async function ghPut(data, sha) {
  const r = await fetch(ghUrl(), {
    method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message: "phone: memory sync", content: enc(JSON.stringify(data, null, 1) + "\n"), ...(sha ? { sha } : {}) }),
  });
  if (r.status === 409 || r.status === 422) return false;      // someone wrote in between: merge again
  if (!r.ok) throw new Error(ghError(r.status));
  return true;
}
let syncing = null, syncNote = "";
function setSync(kind, note) {
  syncNote = note || "";
  const c = $("#sync-chip");
  c.className = "chip " + kind;
  c.querySelector("span").textContent = { off: "SYNC OFF", busy: "SYNCING", ok: "SYNCED", err: "SYNC ERROR" }[kind];
  c.title = syncNote;
  const s = $("#sync-status");
  s.textContent = syncNote; s.classList.toggle("err", kind === "err");
}
function sync() {
  if (!cfg.token || !cfg.repo) { setSync("off", "Not set up — add the repo and a token below."); return Promise.resolve(); }
  if (!navigator.onLine) { setSync("off", "Offline — will sync when you're back online."); return Promise.resolve(); }
  if (syncing) return syncing;
  syncing = (async () => {
    setSync("busy", "Syncing…");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await ghGet();
        const merged = mergeFacts(base, facts, remote.facts);
        if (remote.profile) { profile = remote.profile; store.set("profile", profile); }
        facts = merged; store.set("facts", facts);
        if (remote.sha && sameFacts(merged, remote.facts)) { base = merged; store.set("base", base); break; }
        const ok = await ghPut({ v: 1, facts: merged, profile: remote.profile || profile, updated: Date.now() / 1000, by: "phone" }, remote.sha);
        if (ok) { base = merged; store.set("base", base); break; }
        if (attempt === 2) throw new Error("The cloud copy kept changing — try again in a moment.");
      }
      store.set("syncedAt", Date.now());
      setSync("ok", "Synced " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " · " + facts.length + (facts.length === 1 ? " memory" : " memories"));
    } catch (e) {
      setSync("err", String(e && e.message || e));
    } finally {
      syncing = null;
      renderMemory();
    }
  })();
  return syncing;
}
let syncSoon = 0;
function memoryChanged() { renderMemory(); clearTimeout(syncSoon); syncSoon = setTimeout(sync, 1500); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
addEventListener("online", () => sync());
setInterval(() => { if (!document.hidden) sync(); }, 120000);
$("#sync-chip").addEventListener("click", () => { openSheet(); sync(); });

/* ------------------------------------------------------------------ settings */
function openSheet() { renderSettings(); $("#sheet").hidden = false; }
$("#cfg-btn").addEventListener("click", openSheet);
$("#sheet-x").addEventListener("click", () => { $("#sheet").hidden = true; });
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") $("#sheet").hidden = true; });

function renderSettings() {
  const sel = $("#model");
  if (!sel.options.length) for (const m of MODELS) sel.add(new Option(m.name.split(" · ")[0] + " · " + m.gb + " GB", m.id));
  sel.value = cfg.model;
  $("#model-hint").textContent = (brain.model ? "Running: " + modelInfo(brain.model).name + "." : "Not loaded.") +
    " Smartest needs more graphics memory; if it fails to load, use Balanced.";
  $("#speak").checked = !!cfg.speak;
  const vs = $("#voice");
  vs.innerHTML = "";
  vs.add(new Option("Automatic (British if available)", ""));
  for (const v of voices) vs.add(new Option(v.name + " · " + v.lang, v.name));
  vs.value = cfg.voice;
  $("#repo").value = cfg.repo;
  $("#token").value = cfg.token;
  $("#about").textContent = "JARVIS mobile " + VERSION + " · the brain runs on this phone; conversations never leave it.";
  renderMemory();
}
function renderMemory() {
  $("#mem-count").textContent = "· " + facts.length;
  const ul = $("#mem-list");
  ul.innerHTML = "";
  if (!facts.length) { ul.innerHTML = '<li><span class="hint">Nothing remembered yet.</span></li>'; return; }
  for (const f of facts.slice().reverse()) {
    const li = document.createElement("li");
    const sp = document.createElement("span");
    sp.textContent = f.text;
    const sm = document.createElement("small");
    sm.textContent = (f.source === "phone" ? "FROM THE PHONE" : f.source === "auto" ? "LEARNED ON THE PC" : "FROM THE PC") +
      " · " + new Date((+f.at || 0) * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
    sp.appendChild(sm);
    const x = document.createElement("button");
    x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Forget this");
    x.onclick = () => { facts = facts.filter((y) => y.uid !== f.uid); store.set("facts", facts); memoryChanged(); };
    li.append(sp, x);
    ul.appendChild(li);
  }
}
$("#model").addEventListener("change", async (e) => {
  cfg.model = e.target.value; saveCfg();
  if (!brain.engine) { (await hasModelInCache(cfg.model).catch(() => false)) ? loadBrain().catch(() => {}) : offerDownload(); return; }
  if (await hasModelInCache(cfg.model).catch(() => false)) loadBrain().catch(() => {});
  else { $("#sheet").hidden = true; offerDownload(); }
});
$("#speak").addEventListener("change", (e) => { cfg.speak = e.target.checked; saveCfg(); if (!cfg.speak) speechSynthesis.cancel(); });
$("#voice").addEventListener("change", (e) => { cfg.voice = e.target.value; saveCfg(); unlockSpeech(); speakLine("Good evening, sir."); });
$("#sync-save").addEventListener("click", () => {
  cfg.repo = $("#repo").value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
  cfg.token = $("#token").value.trim();
  saveCfg();
  sync();
});
$("#brain-del").addEventListener("click", async () => {
  if (!confirm("Delete the downloaded brain from this phone? You can download it again later.")) return;
  try { if (brain.engine) await brain.engine.unload(); } catch (_) {}
  brain.engine = null; brain.model = null;
  for (const m of MODELS) await deleteModelAllInfoInCache(m.id).catch(() => {});
  renderSettings(); offerDownload(); toast("Brain deleted from this phone.");
});
$("#chat-clear").addEventListener("click", () => {
  history = []; store.set("chat", history); $("#log").innerHTML = ""; toast("Conversation cleared.");
});

/* ------------------------------------------------------------------ start */
for (const m of history.slice(-12)) addMsg(m.role === "user" ? "user" : "jarvis", m.content);
setState("idle");
renderMemory();
sync();
(async () => {
  if (!(await gpuReady())) {
    card("nogpu", { title: "THIS BROWSER CAN'T RUN THE BRAIN", text: "JARVIS's on-phone brain needs WebGPU: Safari on iOS 26 or newer, or Chrome on Android. Memory sync still works here." });
    return;
  }
  if (await hasModelInCache(cfg.model).catch(() => false)) loadBrain().catch(() => {});
  else offerDownload();
})();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
window.__jm = { brain, sync, get facts() { return facts; }, handle, cfg };   // for tests
