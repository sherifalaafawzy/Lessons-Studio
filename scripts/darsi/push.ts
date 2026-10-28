// Puts the Darsi lessons into someone's Lesson Studio account, so they open, play and edit in the studio like any
// lesson there. A new lesson is created; one already there is replaced in one undoable change (the studio's history
// keeps the old version), unless it was edited in the studio since the last push: that one is skipped (--force replaces it).
// The narration goes to the Storage bucket first, named by its content (media/<sha256>.<ext>, packages/ops mediaObject),
// so a file already there is not sent again. Each scene's voice is cut from it into its own clip (lessons/{id}/voice/{lang},
// packages/ops voice.ts), so the studio keeps every scene's voice when scenes move; a voice someone recorded or uploaded
// in the studio is never replaced. --voice-only writes only the voices and leaves the lessons as they are.
//   node scripts/darsi/push.ts --email you@example.com [ids] [--force] [--voice-only] [--emulator] [--bucket name]
// Uses this PC's Google Cloud login (application default credentials) for the project in .firebaserc; --emulator
// writes to the local emulators instead (Storage on 127.0.0.1:9289).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { clipObject, currentTimings, mediaObject, type Lesson, type Peaks, type VoiceClip, type VoiceDoc } from "../../packages/ops/src/index.ts";
import type { TimingFile } from "../../packages/spec/src/index.ts";
import { FirestoreStore } from "../../apps/server/src/stores/firestore.ts";
import { PEAKS_RATE, filePeaks } from "../lib/peaks.ts";
import { clipsFromNarration } from "../lib/voice.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LESSONS = join(ROOT, "content", "darsi", "lessons");
const VIA = "script:darsi";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const email = flag("--email");
const bucketName = flag("--bucket");
const force = args.includes("--force");
const voiceOnly = args.includes("--voice-only");
const emulator = args.includes("--emulator");
const ids = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());
if (!email) {
  console.error("Usage: node scripts/darsi/push.ts --email you@example.com [ids] [--force] [--voice-only] [--emulator]");
  process.exit(1);
}
const rc = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")) as { projects: Record<string, string> };
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8280";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9399";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9289";
}
const projectId = emulator ? rc.projects.emulators! : rc.projects.default!;
// A personal Google login needs a project to bill Identity Toolkit calls to (the email lookup).
if (!emulator) process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
const app = initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore(app);
const store = new FirestoreStore(db);
// The studio's bucket (VITE_FIREBASE_STORAGE_BUCKET); on the emulators, the default one the studio reads there.
const bucket = getStorage(app).bucket(bucketName ?? (emulator ? `${projectId}.appspot.com` : `${projectId}.firebasestorage.app`));
const sent = { files: 0, bytes: 0, kept: 0 };

/** Puts a lesson's narration files in the bucket, after checking each against its manifest entry. */
async function upload(dir: string, lesson: Lesson): Promise<void> {
  const audio = new Set(lesson.manifest.languages.flatMap((l) => [l.audio, l.audioFallback]).filter((p) => p !== undefined));
  for (const a of lesson.manifest.assets ?? []) {
    if (!audio.has(a.path)) throw new Error(`${a.path}: only narration goes to the studio's bucket`);
    const bytes = readFileSync(join(dir, a.path));
    if (bytes.length !== a.bytes || createHash("sha256").update(bytes).digest("hex") !== a.sha256) throw new Error(`${a.path} doesn't match the manifest`);
    const file = bucket.file(mediaObject(a));
    if ((await file.exists())[0]) {
      sent.kept++;
      continue;
    }
    await file.save(bytes, { resumable: false, metadata: { contentType: a.type, cacheControl: "public, max-age=31536000, immutable" } });
    sent.files++;
    sent.bytes += bytes.length;
  }
}

/** Stores each language's measured timing, and beside it the waveform of the audio it was measured from (for the timeline). */
async function setTimings(id: string, dir: string, lesson: Lesson, timings: Record<string, TimingFile>, actor: { uid: string; via: string }): Promise<void> {
  for (const [lang, t] of Object.entries(timings)) {
    await store.setTiming(id, lang, t, actor);
    const track = lesson.manifest.languages.find((l) => l.code === lang);
    const asset = lesson.manifest.assets?.find((a) => a.path === track?.audio);
    if (!asset || t.source === "estimated") continue;
    const peaks: Peaks = { audio: asset.sha256, rate: PEAKS_RATE, data: Buffer.from(await filePeaks(join(dir, asset.path))).toString("base64") };
    await db.collection("lessons").doc(id).collection("timing").doc(lang).update({ peaks });
  }
}

/**
 * Each scene's voice, cut from the language's narration at the scenes' starts, with its measured word times: one clip per
 * scene and language in lessons/{id}/voice/{lang}. Only languages whose timings fit the script; a clip someone made in
 * the studio stays.
 */
async function setVoices(id: string, dir: string, lesson: Lesson, timings: Record<string, TimingFile>): Promise<string[]> {
  const fit = currentTimings(lesson.scenes.scenes, timings);
  const done: string[] = [];
  for (const track of lesson.manifest.languages) {
    const t = fit[track.code];
    const src = track.audioFallback ?? track.audio;
    if (!t || !src) continue;
    const clips: Record<string, VoiceClip> = {};
    for (const { scene, clip, file } of await clipsFromNarration(lesson, track, t, readFileSync(join(dir, src)), VIA)) {
      const obj = bucket.file(clipObject(clip));
      if ((await obj.exists())[0]) sent.kept++;
      else {
        await obj.save(file, { resumable: false, metadata: { contentType: "audio/ogg", cacheControl: "public, max-age=31536000, immutable" } });
        sent.files++;
        sent.bytes += file.length;
      }
      clips[scene] = clip;
    }
    const ref = db.collection("lessons").doc(id).collection("voice").doc(track.code);
    await db.runTransaction(async (tx) => {
      const had = (await tx.get(ref)).data() as VoiceDoc | undefined;
      const mine = Object.fromEntries(Object.entries(had?.clips ?? {}).filter(([, c]) => c.by !== VIA));
      tx.set(ref, { clips: { ...clips, ...mine }, ...(had?.prev ? { prev: had.prev } : {}) });
    });
    done.push(track.code);
  }
  return done;
}

const uid = (await getAuth(app).getUserByEmail(email)).uid;
console.log(`${projectId}: ${email}, media in ${bucket.name}`);
let failed = 0;
for (const id of ids.length ? ids : readdirSync(LESSONS).sort()) {
  const dir = join(LESSONS, id);
  const lesson: Lesson = { manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) };
  // The narration's measured timings go with it (the studio plays the audio only with them), and its waveform.
  const timings: Record<string, TimingFile> = {};
  for (const l of lesson.manifest.languages) {
    if (existsSync(join(dir, l.timing))) timings[l.code] = JSON.parse(readFileSync(join(dir, l.timing), "utf8")) as TimingFile;
  }
  const actor = { uid, via: VIA };
  try {
    const snap = await db.collection("lessons").doc(id).get();
    if (voiceOnly) {
      if (!snap.exists) throw new Error("isn't in the studio yet: push it without --voice-only first");
      if ((snap.data() as { owner: string }).owner !== uid) throw new Error("belongs to someone else");
      const langs = await setVoices(id, dir, lesson, timings);
      console.log(`  ${id}: voices (${langs.join(", ") || "none"})`);
      continue;
    }
    if (!snap.exists) {
      await upload(dir, lesson);
      await store.create(id, lesson, actor);
      await setTimings(id, dir, lesson, timings, actor);
      const langs = await setVoices(id, dir, lesson, timings);
      console.log(`  ${id}: created${Object.keys(timings).length ? `, with measured timings (${Object.keys(timings).join(", ")})` : ""}${langs.length ? `, voices (${langs.join(", ")})` : ""}`);
      continue;
    }
    const d = snap.data() as { owner: string; rev: number; updatedVia: string };
    if (d.owner !== uid) throw new Error(`belongs to someone else`);
    if (d.updatedVia !== VIA && !force) {
      console.log(`  ${id}: skipped, edited in the studio since the last push (rev ${d.rev}, via ${d.updatedVia}); --force replaces it`);
      continue;
    }
    await upload(dir, lesson);
    const r = await store.apply(id, [{ op: "restore", lesson }], actor, d.rev);
    await setTimings(id, dir, lesson, timings, actor);
    const langs = await setVoices(id, dir, lesson, timings);
    console.log(`  ${id}: updated (rev ${r.rev})${Object.keys(timings).length ? `, with measured timings (${Object.keys(timings).join(", ")})` : ""}${langs.length ? `, voices (${langs.join(", ")})` : ""}`);
  } catch (e) {
    console.log(`  ${id}: failed: ${(e as Error).message}`);
    failed++;
  }
}
console.log(`media: ${sent.files} files sent (${Math.round(sent.bytes / 1024)} KB), ${sent.kept} already there`);
process.exit(failed ? 1 : 0);
