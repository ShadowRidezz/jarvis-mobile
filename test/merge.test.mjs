// node test/merge.test.mjs — the sync rules, including the cases that lose data if wrong
import assert from "node:assert/strict";
import { mergeFacts, sameFacts } from "../merge.js";

const f = (uid, text, at, edited) => ({ uid, text, at, ...(edited ? { edited } : {}) });
const texts = (l) => l.map((x) => x.text).sort();

const base = [f("pc1", "Plays Fortnite", 1), f("pc2", "Sister is Mia", 2)];

// new on each side -> both kept
assert.deepEqual(texts(mergeFacts(base, [...base, f("ph1", "Likes tea", 5)], [...base, f("pc3", "Lives in Michigan", 6)])),
  ["Likes tea", "Lives in Michigan", "Plays Fortnite", "Sister is Mia"]);

// deleted on the phone -> gone, even though the cloud still has it
assert.deepEqual(texts(mergeFacts(base, [base[0]], base)), ["Plays Fortnite"]);

// deleted on the PC -> gone from the phone too
assert.deepEqual(texts(mergeFacts(base, base, [base[1]])), ["Sister is Mia"]);

// deleted on one side but edited on the other since the last sync -> the edit survives
assert.deepEqual(texts(mergeFacts(base, [base[0]], [base[0], f("pc2", "Sister is Mia, 12", 2, 9)])),
  ["Plays Fortnite", "Sister is Mia, 12"]);

// edited on both -> the newer edit wins
assert.deepEqual(texts(mergeFacts(base, [base[0], f("pc2", "phone edit", 2, 7)], [base[0], f("pc2", "pc edit", 2, 8)])),
  ["Plays Fortnite", "pc edit"]);

// first sync ever (no base) -> union, nothing dropped
assert.deepEqual(texts(mergeFacts([], [f("ph1", "Likes tea", 5)], base)), ["Likes tea", "Plays Fortnite", "Sister is Mia"]);

// the same words on both devices with different uids -> one copy (the newest)
const dup = mergeFacts([], [f("ph9", "likes tea", 9)], [f("pc9", "Likes tea", 4)]);
assert.equal(dup.length, 1); assert.equal(dup[0].uid, "ph9");

// empty cloud after a wipe on the PC -> phone empties too (everything was in base)
assert.equal(mergeFacts(base, base, []).length, 0);

// cap at 150, newest kept
const many = Array.from({ length: 160 }, (_, i) => f("x" + i, "fact " + i, i));
const capped = mergeFacts([], many, []);
assert.equal(capped.length, 150); assert.equal(capped[0].text, "fact 10");

assert.ok(sameFacts(base, base.map((x) => ({ ...x }))));
assert.ok(!sameFacts(base, [base[0]]));
console.log("merge: all 10 checks passed");
