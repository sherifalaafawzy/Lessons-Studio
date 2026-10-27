// Puts the Darsi lessons into someone's Lesson Studio account, so they open, play and edit in the studio like any
// lesson there. A new lesson is created; one already there is replaced in one undoable change (the studio's history
// keeps the old version), unless it was edited in the studio since the last push: that one is skipped (--force replaces it).
//   node scripts/darsi/push.ts --email you@example.com [ids] [--force] [--emulator]
// Uses this PC's Google Cloud login (application default credentials) for the project in .firebaserc; --emulator
// writes to the local emulators instead.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { Lesson } from "../../packages/ops/src/index.ts";
import type { TimingFile } from "../../packages/spec/src/index.ts";
import { FirestoreStore } from "../../apps/server/src/stores/firestore.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LESSONS = join(ROOT, "content", "darsi", "lessons");
const VIA = "script:darsi";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const email = flag("--email");
const force = args.includes("--force");
const emulator = args.includes("--emulator");
const ids = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());
if (!email) {
  console.error("Usage: node scripts/darsi/push.ts --email you@example.com [ids] [--force] [--emulator]");
  process.exit(1);
}
const rc = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")) as { projects: Record<string, string> };
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8280";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9399";
}
const projectId = emulator ? rc.projects.emulators! : rc.projects.default!;
// A personal Google login needs a project to bill Identity Toolkit calls to (the email lookup).
if (!emulator) process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
const app = initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore(app);
const store = new FirestoreStore(db);

const uid = (await getAuth(app).getUserByEmail(email)).uid;
console.log(`${projectId}: ${email}`);
let failed = 0;
for (const id of ids.length ? ids : readdirSync(LESSONS).sort()) {
  const dir = join(LESSONS, id);
  const lesson: Lesson = { manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) };
  // The studio keeps no audio files yet: the lesson goes without them, and with the narration's measured timings.
  const timings: Record<string, TimingFile> = {};
  for (const l of lesson.manifest.languages) {
    if (existsSync(join(dir, l.timing))) timings[l.code] = JSON.parse(readFileSync(join(dir, l.timing), "utf8")) as TimingFile;
    delete l.audio;
    delete l.audioFallback;
  }
  delete lesson.manifest.assets;
  const actor = { uid, via: VIA };
  try {
    const snap = await db.collection("lessons").doc(id).get();
    if (!snap.exists) {
      await store.create(id, lesson, actor);
      for (const [lang, t] of Object.entries(timings)) await store.setTiming(id, lang, t, actor);
      console.log(`  ${id}: created${Object.keys(timings).length ? `, with measured timings (${Object.keys(timings).join(", ")})` : ""}`);
      continue;
    }
    const d = snap.data() as { owner: string; rev: number; updatedVia: string };
    if (d.owner !== uid) throw new Error(`belongs to someone else`);
    if (d.updatedVia !== VIA && !force) {
      console.log(`  ${id}: skipped, edited in the studio since the last push (rev ${d.rev}, via ${d.updatedVia}); --force replaces it`);
      continue;
    }
    const r = await store.apply(id, [{ op: "restore", lesson }], actor, d.rev);
    for (const [lang, t] of Object.entries(timings)) await store.setTiming(id, lang, t, actor);
    console.log(`  ${id}: updated (rev ${r.rev})${Object.keys(timings).length ? `, with measured timings (${Object.keys(timings).join(", ")})` : ""}`);
  } catch (e) {
    console.log(`  ${id}: failed: ${(e as Error).message}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
