// JARVIS memory sync — a 3-way merge of remembered facts between this device and the cloud copy.
// A fact is { uid, text, at, edited?, cat?, source? }. `base` is the list as it stood after this
// device's last successful sync, so a fact missing on one side is told apart:
//   in base, gone on one side  -> deleted there (unless the other side edited it since)
//   not in base, on one side   -> new there
// The PC core (cloudsync.py) runs the same rules.

export const MEMORY_MAX = 150;
const stamp = (f) => Math.max(+f.at || 0, +f.edited || 0);

export function mergeFacts(base, local, remote) {
  const B = new Map(base.map((f) => [f.uid, f]));
  const L = new Map(local.map((f) => [f.uid, f]));
  const R = new Map(remote.map((f) => [f.uid, f]));
  const out = [];
  for (const uid of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(uid), r = R.get(uid), b = B.get(uid);
    if (l && r) { out.push(stamp(l) >= stamp(r) ? l : r); continue; }
    const one = l || r;
    if (b && stamp(one) <= stamp(b)) continue;      // deleted on the other side, not edited since
    out.push(one);
  }
  // the same words remembered on both devices: keep the newest copy
  // (ties broken by uid so the PC and the phone produce the same order — sync compares lists)
  const byUid = (a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  const seen = new Map();
  for (const f of out.sort((a, b) => stamp(b) - stamp(a) || byUid(a, b))) {
    const k = f.text.trim().toLowerCase();
    if (!seen.has(k)) seen.set(k, f);
  }
  return [...seen.values()].sort((a, b) => (+a.at || 0) - (+b.at || 0) || byUid(a, b)).slice(-MEMORY_MAX);
}

export const sameFacts = (a, b) =>
  a.length === b.length && a.every((f, i) => f.uid === b[i].uid && f.text === b[i].text && stamp(f) === stamp(b[i]));

export function newUid() {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return "ph" + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36);
}
