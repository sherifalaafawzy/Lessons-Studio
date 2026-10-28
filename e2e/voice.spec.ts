// Scenes' voices in the studio, end to end on the local emulators (npm run emulators, with Storage on 9289): each scene's
// clip plays in the lesson's order and stays with its scene when scenes move; a changed script silences only its scene;
// recording with the microphone (Chromium's stand-in, reading a real narration), undo, and uploading a file.
// The voiceClip function runs from the built bundle (npm --prefix functions run build) inside this test, so it reaches
// the Storage emulator; the studio's call to it is answered from here. Skipped when the emulators aren't running.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { AUTH, FIRESTORE, STORAGE } from "./emulators.ts";

const STUDIO = "http://localhost:4331";
const DIR = "content/darsi/lessons/cy-1-1-2/";
const BUCKET = "demo-lessonstudio.appspot.com";

// The microphone hears the first nine seconds of the lesson's English narration, over and over.
const MIC = join(tmpdir(), "ls-fake-mic.wav");
spawnSync(ffmpegPath as unknown as string, ["-v", "error", "-y", "-i", `${DIR}audio/en.m4a`, "-t", "9", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", MIC]);

test.use({
  launchOptions: {
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC}`],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  },
});

async function up(): Promise<boolean> {
  try {
    const all = await Promise.all([`http://${AUTH}/`, `http://${FIRESTORE}/`, `http://${STORAGE}/v0/b/${BUCKET}/o?prefix=x`].map((u) => fetch(u)));
    return all.every((r) => r.status < 500);
  } catch {
    return false;
  }
}

async function admin() {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = STORAGE;
  const { initializeApp, getApps } = await import("firebase-admin/app");
  return getApps().find((a) => a.name === "voice") ?? initializeApp({ projectId: "demo-lessonstudio" }, "voice");
}

/** Answers the studio's calls to voiceClip with the function itself, run here against the emulators. */
async function serveVoiceClip(page: Page): Promise<void> {
  process.env.LS_MEDIA_BUCKET = BUCKET;
  process.env.GCLOUD_PROJECT = "demo-lessonstudio";
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-lessonstudio", storageBucket: BUCKET });
  await admin();
  const fns = await import(pathToFileURL(join(process.cwd(), "functions/lib/index.js")).href);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  await page.route("**/demo-lessonstudio/europe-west1/voiceClip", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const claims = JSON.parse(Buffer.from((req.headers().authorization ?? "").split(".")[1] ?? "", "base64url").toString() || "{}");
    try {
      const result = await fns.voiceClip.run({ data: req.postDataJSON().data, auth: { uid: claims.user_id, token: claims }, rawRequest: {} });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ result }) });
    } catch (e) {
      return route.fulfill({ status: 400, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: (e as Error).message } }) });
    }
  });
}

/** The narrated lesson in a new test account, with each scene's voice cut from its narration as scripts/darsi/push.ts does. */
async function narratedLesson(page: Page) {
  const app = await admin();
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getStorage } = await import("firebase-admin/storage");
  const { FirestoreStore } = await import("../apps/server/src/stores/firestore.ts");
  const { clipObject } = await import("../packages/ops/src/index.ts");
  const { clipsFromNarration } = await import("../scripts/lib/voice.ts");
  const email = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const user = await getAuth(app).createUser({ email, password: "lessonstudio-test" });
  await getAuth(app).setCustomUserClaims(user.uid, { studio: true });
  const read = (p: string) => JSON.parse(readFileSync(DIR + p, "utf8"));
  const lesson = { manifest: read("manifest.json"), scenes: read("scenes.json") };
  const id = `voices-${Date.now().toString(36)}`;
  lesson.manifest.id = id;
  const db = getFirestore(app);
  await new FirestoreStore(db).create(id, lesson, { uid: user.uid, via: "script:darsi" });
  const bucket = getStorage(app).bucket(BUCKET);
  for (const track of lesson.manifest.languages) {
    const made = await clipsFromNarration(lesson, track, read(`timing/${track.code}.json`), readFileSync(DIR + track.audioFallback), "script:darsi");
    for (const m of made) await bucket.file(clipObject(m.clip)).save(m.file, { resumable: false, metadata: { contentType: "audio/ogg" } });
    await db.doc(`lessons/${id}/voice/${track.code}`).set({ clips: Object.fromEntries(made.map((m) => [m.scene, m.clip])) });
  }
  await page.addInitScript(() => {
    const A = window.Audio;
    const made: HTMLAudioElement[] = [];
    (window as unknown as { audios: HTMLAudioElement[] }).audios = made;
    window.Audio = function (src?: string) { const a = new A(src); made.push(a); return a; } as unknown as typeof Audio;
  });
  await page.goto(STUDIO);
  await page.getByLabel("Test account").fill(email);
  await page.getByRole("button", { name: "Sign in with the test account" }).click();
  await expect(page.getByRole("heading", { name: "Your lessons" })).toBeVisible();
  await page.goto(`${STUDIO}/lessons/${id}`);
  await expect(page.locator(".board .card")).toHaveCount(13);
  return { id, lesson, db };
}

/** The stage's narration: the newest audio playing a track built in memory. */
const stageAudio = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { audios: HTMLAudioElement[] }).audios.filter((x) => x.src.startsWith("blob:")).pop();
  return a ? { src: a.src, t: a.currentTime, paused: a.paused } : null;
});

async function playFor(page: Page, seconds: number): Promise<void> {
  const before = (await stageAudio(page))?.src;
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => { const a = await stageAudio(page); return a && a.src !== before ? a.t : a?.t ?? 0; }, { timeout: 15_000 }).toBeGreaterThan(seconds);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}

test.describe("scene voices", () => {
  test.beforeAll(async () => {
    test.skip(!(await up()), "The Firebase emulators aren't running with Storage (npm run emulators).");
  });

  test("each scene keeps its voice when scenes move; a changed script silences only its scene; record, undo, upload", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    test.setTimeout(120_000);
    await serveVoiceClip(page);
    const { id, lesson } = await narratedLesson(page);
    const segs = page.locator(".tl-voice .vseg");

    // Every scene is voiced, and the lesson plays its track, put together in the browser.
    await expect(segs).toHaveCount(13);
    await expect(page.locator(".tl-voice .vseg.empty")).toHaveCount(0);
    await expect(page.locator(".board .card .vdot.on")).toHaveCount(13);
    await expect(page.locator(".tl-voice .tl-spin")).toHaveCount(0);
    await playFor(page, 2);
    const first = (await stageAudio(page))!.src;

    // Moving the first scene down keeps every voice: a new track, in the new order, plays at once.
    await page.locator(".board .card").first().getByRole("button", { name: "Move down" }).click();
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(page.locator(".tl-voice .vseg.empty")).toHaveCount(0);
    await page.locator(".board .card").first().locator(".card-main").click();
    await expect.poll(async () => (await stageAudio(page))?.src !== first || null).toBeTruthy();
    await playFor(page, 1.5);

    // A new English script for one scene: only that scene goes silent, marked as changed.
    const scene = lesson.scenes.scenes[2];
    const { FirestoreStore } = await import("../apps/server/src/stores/firestore.ts");
    const { getFirestore } = await import("firebase-admin/firestore");
    const db = getFirestore(await admin());
    const owner = (await db.collection("lessons").doc(id).get()).data()!.owner as string;
    await new FirestoreStore(db).apply(id, [{ op: "setNarration", scene: scene.id, lang: "en", text: "Look closely at who sent the message, and why it sounds so urgent." }], { uid: owner, via: "mcp:Claude" });
    await expect(page.locator(".tl-voice .vseg.empty.stale")).toHaveCount(1);
    await expect(page.locator(".tl-voice .vseg:not(.empty)")).toHaveCount(12);

    // Record it again from the timeline: the recorder shows the new script, records, and the scene has its voice back.
    await page.locator(".tl-voice .vseg.empty.stale").click();
    const rec = page.getByRole("dialog", { name: "Record the voice" });
    await expect(rec.locator(".rec-script p")).toContainText("who sent the message");
    await expect(rec.locator(".rec-meter span")).toHaveAttribute("data-level", /good|loud/, { timeout: 10_000 });
    await rec.getByRole("button", { name: "Start recording" }).click();
    await expect(rec.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(3500);
    await rec.getByRole("button", { name: "Stop" }).click();
    await expect(rec.locator(".rec-take .clip-wave")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/voice-recorder.png" });
    await rec.getByRole("button", { name: "Use this take" }).click();
    await expect(rec).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator(".tl-voice .vseg.recorded")).toHaveCount(1);
    await expect(page.locator(".tl-voice .vseg.empty")).toHaveCount(0);

    // Its card in the inspector: recorded, matching the script; Undo brings back the old (stale) voice.
    await page.locator(".board .card").nth(2).locator(".card-main").click();
    await page.getByRole("tab", { name: "Scene" }).click();
    const card = page.locator(".vcard").first();
    await expect(card.locator(".vkind")).toHaveText("Recorded");
    await expect(card.locator(".vcard-status")).toContainText("Made for the current script");
    await page.screenshot({ path: "e2e/screenshots/voice-panel.png" });
    // Listen plays the clip itself, from the bucket.
    await card.getByRole("button", { name: "Listen" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { audios: HTMLAudioElement[] }).audios.filter((x) => x.src.includes("/o/media%2F")).pop()?.currentTime ?? 0)).toBeGreaterThan(0.5);
    await card.getByRole("button", { name: "Pause" }).click();
    await card.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".tl-voice .vseg.empty.stale")).toHaveCount(1);
    await expect(card.locator(".vcard-status")).toContainText("script changed");

    // Upload a file instead: it becomes the scene's voice.
    await card.locator('input[type="file"]').setInputFiles(MIC);
    const use = page.getByRole("dialog", { name: "Use an audio file" });
    await expect(use.locator(".rec-take .clip-wave")).toBeVisible();
    await use.getByRole("button", { name: "Use this file" }).click();
    await expect(use).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator(".tl-voice .vseg.uploaded")).toHaveCount(1);
    await expect(card.locator(".vkind")).toHaveText("Uploaded");
    await playFor(page, 1);

    // Egyptian Arabic kept all its voices through all of this.
    await page.getByRole("combobox", { name: "Lesson language" }).selectOption("ar-EG");
    await expect(page.locator(".tl-voice .vseg.empty")).toHaveCount(0);
    await expect(segs).toHaveCount(13);
    await page.screenshot({ path: "e2e/screenshots/voice-timeline-ar.png" });
  });
});
