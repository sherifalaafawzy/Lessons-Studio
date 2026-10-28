// The studio's "Export MP4": a lesson rendered on the server with the same headless player and ffmpeg as
// `npm run mp4` (scripts/video/), at one size. Chromium is @sparticuz/chromium in the cloud, or this PC's on the
// emulators (CHROMIUM_PATH). The player, the shared library and the fonts are copied beside the bundle by build.mjs.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Lang, LessonPackage } from "@lessonstudio/spec";
import { clipObject, mediaObject, toPackage, voiceTrack, type Lesson, type TrackPart, type VoiceClip } from "@lessonstudio/ops";
import { toWav } from "@lessonstudio/narrate";
import { SIZES, renderLanguage, type Size } from "../../scripts/video/mp4.ts";
import { launch } from "../../scripts/video/stage.ts";
import { trackPcm } from "../../scripts/lib/voice.ts";

/** Reads a media object from the studio's Storage bucket (packages/ops mediaObject). */
export type ReadMedia = (object: string) => Promise<Buffer>;

/** What a request may ask for. */
export function readExport(data: unknown): { lesson: string; lang: string; size: Size } | string {
  const d = (data ?? {}) as Record<string, unknown>;
  const lesson = String(d.lesson ?? "");
  const lang = String(d.lang ?? "");
  const size = Number(d.size ?? 360) as Size;
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(lesson)) return "Which lesson?";
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) return "Which language?";
  if (!SIZES[size]) return "The size is 360, 240 or 144.";
  return { lesson, lang, size };
}

/**
 * Puts a language's narration from the bucket into `dir` at its package path, for renderLanguage to mux. Returns
 * false when the language has none to play (no audio, or estimated timings: toPackage leaves those silent).
 */
export async function fetchNarration(pkg: LessonPackage, lang: string, dir: string, read: ReadMedia): Promise<boolean> {
  const track = pkg.manifest.languages.find((l) => l.code === lang);
  const asset = track?.audio ? pkg.manifest.assets?.find((a) => a.path === track.audio) : undefined;
  if (!track?.audio || !asset) return false;
  const bytes = await read(mediaObject(asset));
  // Named by content: a file that doesn't match its name isn't the narration these timings were measured from.
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`${track.audio} doesn't match its sha256`);
  const at = join(dir, track.audio);
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, bytes);
  return true;
}

/**
 * A lesson with a language's voice clips (lessons/{id}/voice/{lang}), as the studio plays it: the clips in the lesson's
 * order with their timings, and the track at audio/<lang>.wav once any scene is voiced (putVoiceTrack writes it).
 */
export function voicePackage(lesson: Lesson, lang: Lang, clips: Record<string, VoiceClip>): { pkg: LessonPackage; parts: TrackPart[] } {
  const track = voiceTrack(lesson.scenes.scenes, lang, clips);
  const pkg = toPackage(lesson, { [lang]: track.timing });
  for (const l of pkg.manifest.languages) {
    delete l.audio;
    delete l.audioFallback;
    if (l.code === lang && track.voiced) l.audio = `audio/${lang}.wav`;
  }
  delete pkg.manifest.assets;
  return { pkg, parts: track.parts };
}

/** Writes a language's voice track, put together from its clips, where its package says (voicePackage). */
export async function putVoiceTrack(pkg: LessonPackage, lang: Lang, parts: TrackPart[], dir: string, read: ReadMedia): Promise<boolean> {
  const audio = pkg.manifest.languages.find((l) => l.code === lang)?.audio;
  if (!audio) return false;
  const pcm = await trackPcm(parts, (c) => read(clipObject(c)));
  const at = join(dir, audio);
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, toWav(pcm));
  return true;
}

/**
 * Renders one language of a lesson at one size; returns the MP4. `narrate` puts the language's narration in a folder
 * for the renderer (fetchNarration or putVoiceTrack), or says there is none.
 */
export async function renderVideo(pkg: LessonPackage, lang: string, size: Size, narrate: (dir: string) => Promise<boolean>): Promise<{ mp4: Buffer; seconds: number; narrated: boolean }> {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const started = Date.now();
  const log = (s: string): void => console.log(`exportVideo ${pkg.manifest.id} ${lang} ${size}p: ${s} (${Math.round((Date.now() - started) / 1000)} s)`);
  log("starting Chromium");
  let browser: Awaited<ReturnType<typeof launch>>;
  if (process.env.FUNCTIONS_EMULATOR === "true") browser = await launch();
  else {
    const chromium = (await import("@sparticuz/chromium")).default;
    browser = await launch({ executablePath: await chromium.executablePath(), args: chromium.args });
  }
  log("Chromium started");
  const out = mkdtempSync(join(tmpdir(), "ls-mp4-"));
  const files = mkdtempSync(join(tmpdir(), "ls-pkg-"));
  try {
    const narrated = await narrate(files);
    log(narrated ? "narration fetched" : "no narration: silent");
    const r = await renderLanguage(browser, pkg, lang, out, {
      sizes: [size], hold: 4, log, ...(narrated ? { dir: files } : {}),
      stage: { player: readFileSync(join(here, "player.js"), "utf8"), libDir: join(here, "library"), fontDir: join(here, "fonts") },
    });
    log(`done: ${r.drawn} of ${r.frames} frames drawn`);
    return { mp4: readFileSync(join(out, `${size}p.mp4`)), seconds: r.seconds, narrated };
  } catch (e) {
    log(`failed: ${(e as Error).stack ?? e}`);
    throw e;
  } finally {
    await browser.close().catch(() => {});
    rmSync(out, { recursive: true, force: true });
    rmSync(files, { recursive: true, force: true });
  }
}
