// The studio's "Export MP4": a lesson rendered on the server with the same headless player and ffmpeg as
// `npm run mp4` (scripts/video/), at one size. Chromium is @sparticuz/chromium in the cloud, or this PC's on the
// emulators (CHROMIUM_PATH). The player, the shared library and the fonts are copied beside the bundle by build.mjs.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LessonPackage } from "@lessonstudio/spec";
import { mediaObject } from "@lessonstudio/ops";
import { SIZES, renderLanguage, type Size } from "../../scripts/video/mp4.ts";
import { launch } from "../../scripts/video/stage.ts";

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

/** Renders one language of a lesson at one size, with its narration when it has some; returns the MP4. */
export async function renderVideo(pkg: LessonPackage, lang: string, size: Size, read: ReadMedia): Promise<{ mp4: Buffer; seconds: number; narrated: boolean }> {
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
    const narrated = await fetchNarration(pkg, lang, files, read);
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
