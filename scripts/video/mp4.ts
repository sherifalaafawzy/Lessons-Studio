// MP4 export: the real player draws every frame (seek(t) in headless Chromium) and ffmpeg encodes them, so the video
// looks exactly like the lesson. One render at 640×360 gives three files for old phones and WhatsApp:
// 360p (25 fps), 240p and 144p (15 fps), all H.264 baseline with a silent AAC track, plus WebVTT captions, a poster
// and video.json (chapters and the moments a quick check is asked).
//   npm run mp4 -- <lesson folder | Darsi id> [--lang en,ar-EG] [--sizes 360,240,144] [--out out/videos] [--hold 4]
// A lesson folder holds manifest.json and scenes.json (and timing/<lang>.json once narrated; until then the timing is
// estimated from the words). Captions are separate files, never burned in. --hold is how long the video waits on a
// quick check before the answer (default 4 s).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captionChunks, pick, vttTime, type LessonPackage, type TimingFile } from "../../packages/spec/src/index.ts";
import { toPackage, type Lesson } from "../../packages/ops/src/index.ts";
import { launch, openStage, type StageOptions } from "./stage.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export const SIZES = {
  360: { w: 640, h: 360, fps: 25, crf: 28, kbps: 450, audioKbps: 40 },
  240: { w: 426, h: 240, fps: 15, crf: 29, kbps: 260, audioKbps: 32 },
  144: { w: 256, h: 144, fps: 15, crf: 31, kbps: 130, audioKbps: 24 },
} as const;
export type Size = keyof typeof SIZES;

/** Video time ↔ lesson time, with the video holding still for a while at each quick check. */
export function holdsFor(pkg: LessonPackage, lang: string, hold: number): { at: number; dur: number }[] {
  if (hold <= 0) return [];
  const t = pkg.timing[lang]!;
  return pkg.scenes.scenes.flatMap((s, i) => (s.check ? [{ at: t.scenes[i]!.end, dur: hold }] : []));
}
export function lessonTime(vt: number, holds: { at: number; dur: number }[]): number {
  let shift = 0;
  for (const h of holds) {
    if (vt < h.at + shift) break;
    if (vt < h.at + shift + h.dur) return h.at - 0.04;
    shift += h.dur;
  }
  return vt - shift;
}
export function videoTime(t: number, holds: { at: number; dur: number }[]): number {
  return t + holds.filter((h) => h.at <= t).reduce((n, h) => n + h.dur, 0);
}

/** The ffmpeg filter for the sound (input 1): the narration cut at each hold with that much silence put in, or, for
 *  `null`, input 1 as it is (silence). Everything is mono at 24 kHz, Gemini's own rate. */
export function audioFilter(holds: { at: number; dur: number }[] | null, total: number): string {
  const fmt = "aformat=sample_rates=24000:channel_layouts=mono";
  if (!holds) return `[1:a]${fmt},atrim=duration=${total.toFixed(3)}`;
  const parts: string[] = [];
  const chain: string[] = [];
  let from = 0;
  holds.forEach((h, i) => {
    parts.push(`[1:a]${fmt},atrim=start=${from.toFixed(3)}:end=${h.at.toFixed(3)},asetpts=PTS-STARTPTS[n${i}]`);
    parts.push(`aevalsrc=0:c=mono:s=24000:d=${h.dur.toFixed(3)}[h${i}]`);
    chain.push(`[n${i}]`, `[h${i}]`);
    from = h.at;
  });
  parts.push(`[1:a]${fmt},atrim=start=${from.toFixed(3)},asetpts=PTS-STARTPTS[n${holds.length}]`);
  chain.push(`[n${holds.length}]`);
  return `${parts.join(";")};${chain.join("")}concat=n=${chain.length}:v=0:a=1`;
}

/** WebVTT captions on the video's own clock (after each hold, later by the hold). */
export function captionsFor(timing: TimingFile, dir: "ltr" | "rtl", holds: { at: number; dur: number }[]): string {
  const mark = dir === "rtl" ? "‏" : "";
  const cues = captionChunks(timing, 42).map((c, i) =>
    `${i + 1}\n${vttTime(videoTime(c.start, holds))} --> ${vttTime(videoTime(c.end, holds))}\n${mark}${c.text}\n`);
  return `WEBVTT\n\n${cues.join("\n")}`;
}

function loadLesson(arg: string): { id: string; dir: string; lesson: Lesson; timings: Record<string, TimingFile> } {
  const candidates = [resolve(arg), join(ROOT, "content", "darsi", "lessons", arg.toLowerCase()), join(ROOT, "examples", arg)];
  const dir = candidates.find((d) => existsSync(join(d, "manifest.json")) && existsSync(join(d, "scenes.json")));
  if (!dir) throw new Error(`No lesson (manifest.json and scenes.json) at ${arg}`);
  const lesson: Lesson = { manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) };
  const timings: Record<string, TimingFile> = {};
  for (const l of lesson.manifest.languages) {
    const p = l.timing ? join(dir, l.timing) : "";
    if (p && existsSync(p)) timings[l.code] = JSON.parse(readFileSync(p, "utf8"));
  }
  return { id: lesson.manifest.id, dir, lesson, timings };
}

async function encode(args: string[]): Promise<{ stdin: NodeJS.WritableStream; done: Promise<void> }> {
  const ffmpeg = process.env.FFMPEG_PATH ?? ((await import("ffmpeg-static")).default as unknown as string);
  const p = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
  const done = new Promise<void>((ok, bad) => p.on("close", (code) => (code === 0 ? ok() : bad(new Error(`ffmpeg failed (${code}):\n${err}`)))));
  return { stdin: p.stdin, done };
}

const write = (s: NodeJS.WritableStream, b: Buffer): Promise<void> | void => (s.write(b) ? undefined : new Promise((ok) => s.once("drain", () => ok())));

export interface Rendered { lang: string; seconds: number; frames: number; drawn: number; files: Record<string, number> }

/** Renders one language of a lesson into `out`: the sizes asked for, captions.vtt, poster.jpg and video.json. */
export async function renderLanguage(
  browser: Awaited<ReturnType<typeof launch>>, pkg: LessonPackage, lang: string, out: string,
  o: { sizes: Size[]; hold: number; dir?: string; log?: (s: string) => void; stage?: Pick<StageOptions, "player" | "libDir" | "fontDir"> },
): Promise<Rendered> {
  mkdirSync(out, { recursive: true });
  const holds = holdsFor(pkg, lang, o.hold);
  const timing = pkg.timing[lang]!;
  const total = timing.duration + holds.reduce((n, h) => n + h.dur, 0);
  // Frames are drawn at the fastest rate asked for: 15 fps when only 240p or 144p is wanted.
  const fps = Math.max(...o.sizes.map((s) => SIZES[s].fps));
  const frames = Math.ceil(total * fps);
  const track = pkg.manifest.languages.find((l) => l.code === lang)!;
  const narration = track.audio && o.dir && existsSync(join(o.dir, track.audio)) ? join(o.dir, track.audio) : null;
  // The stage only draws: the player gets no narration to load, and its clock goes where seek() puts it.
  const silent: LessonPackage = { ...pkg, manifest: { ...pkg.manifest, languages: pkg.manifest.languages.map(({ audio: _a, audioFallback: _f, ...l }) => l) } };
  const stage = await openStage(browser, silent, { lang, width: 640, ...(o.dir ? { dir: o.dir } : {}), ...o.stage });

  // One ffmpeg reads the 640×360 frames and writes every size: each gets its own scale and frame rate. The sound is
  // the narration with silence where the video holds on a quick check, or silence throughout.
  const sizes = o.sizes;
  const filter = `[0:v]split=${sizes.length}${sizes.map((_, i) => `[v${i}]`).join("")};` +
    sizes.map((s, i) => `[v${i}]${s === 360 ? "null" : `scale=${SIZES[s].w}:${SIZES[s].h}:flags=lanczos,setsar=1,fps=${SIZES[s].fps}`},format=yuv420p[o${i}]`).join(";") +
    `;${audioFilter(narration ? holds : null, total)}[aud];[aud]asplit=${sizes.length}${sizes.map((_, i) => `[a${i}]`).join("")}`;
  const args = [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
    ...(narration ? ["-i", narration] : ["-f", "lavfi", "-t", String(total.toFixed(2)), "-i", "anullsrc=channel_layout=mono:sample_rate=24000"]),
    "-filter_complex", filter,
  ];
  sizes.forEach((s, i) => {
    const z = SIZES[s];
    args.push(
      "-map", `[o${i}]`, "-map", `[a${i}]`,
      "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0", "-preset", "slow", "-tune", "animation",
      "-crf", String(z.crf), "-maxrate", `${z.kbps}k`, "-bufsize", `${z.kbps * 2}k`,
      "-g", String(z.fps * 10), "-r", String(z.fps),
      "-c:a", "aac", "-b:a", narration ? `${z.audioKbps}k` : "24k", "-ac", "1",
      "-movflags", "+faststart", "-shortest",
      "-metadata", `title=${pick(pkg.manifest.title, lang)}`, "-metadata", `language=${lang}`,
      join(out, `${s}p.mp4`),
    );
  });
  const ff = await encode(args);

  let lastKey = "";
  let last: Buffer | null = null;
  let drawn = 0;
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = lessonTime(f / fps, holds);
    await stage.seek(t);
    const key = await stage.key();
    if (key !== lastKey || !last) {
      last = await stage.shot("jpeg", 92);
      lastKey = key;
      drawn++;
    }
    await write(ff.stdin, last);
    if (o.log && f % (fps * 15) === 0) o.log(`  ${lang} ${Math.round((f / frames) * 100)}% (${Math.round((Date.now() - started) / 1000)} s)`);
  }
  ff.stdin.end();
  await ff.done;

  // The poster: the title scene as it settles, else three seconds in.
  const ti = pkg.scenes.scenes.findIndex((s) => s.template === "title-hook");
  await stage.seek(ti >= 0 ? Math.max(timing.scenes[ti]!.start + 1.6, timing.scenes[ti]!.end - 0.3) : Math.min(3, timing.duration));
  writeFileSync(join(out, "poster.jpg"), await stage.shot("jpeg", 85));
  await stage.close();

  const dir = pkg.manifest.languages.find((l) => l.code === lang)!.dir;
  writeFileSync(join(out, "captions.vtt"), captionsFor(timing, dir, holds));
  const names = (i: number): string => {
    const c = pkg.scenes.scenes[i]!.content as Record<string, unknown>;
    const t = c.title ?? c.kicker ?? (Array.isArray(c.elements) ? (c.elements as { type: string; text?: unknown }[]).find((e) => e.type === "text")?.text : undefined);
    return t ? pick(t as Parameters<typeof pick>[0], lang) : "";
  };
  writeFileSync(join(out, "video.json"), `${JSON.stringify({
    id: pkg.manifest.id, lang, dir, title: pick(pkg.manifest.title, lang), seconds: Math.round(total * 100) / 100,
    timing: timing.source,
    narrated: !!narration,
    chapters: timing.scenes.map((s, i) => ({ at: Math.round(videoTime(s.start, holds) * 100) / 100, label: names(i) })).filter((c) => c.label),
    checks: pkg.scenes.scenes.flatMap((s, i) => (s.check ? [{ at: Math.round(videoTime(timing.scenes[i]!.end, holds) * 100) / 100, hold: o.hold, check: s.check }] : [])),
    files: Object.fromEntries(sizes.map((s) => [`${s}p`, `${s}p.mp4`])),
  }, null, 1)}\n`);

  const files: Record<string, number> = {};
  for (const f of [...sizes.map((s) => `${s}p.mp4`), "poster.jpg", "captions.vtt"]) files[f] = statSync(join(out, f)).size;
  return { lang, seconds: total, frames, drawn, files };
}

// No top-level await: the Cloud Functions bundle includes this file, and its runtime require()s the bundle.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const langsArg = flag("--lang");
  const sizes = (flag("--sizes") ?? "360,240,144").split(",").map((s) => Number(s) as Size);
  if (sizes.some((s) => !SIZES[s])) throw new Error("--sizes takes 360, 240 and 144");
  const outRoot = resolve(flag("--out") ?? join(ROOT, "out", "videos"));
  const hold = Number(flag("--hold") ?? 4);
  if (!args.length) {
    console.error("Usage: npm run mp4 -- <lesson folder | Darsi id>... [--lang en,ar-EG] [--sizes 360,240,144] [--out out/videos] [--hold 4]");
    process.exit(1);
  }
  const browser = await launch();
  try {
    for (const arg of args) {
      const { id, dir, lesson, timings } = loadLesson(arg);
      const pkg = toPackage(lesson, timings);
      const langs = langsArg ? langsArg.split(",") : lesson.manifest.languages.map((l) => l.code);
      for (const lang of langs) {
        if (!pkg.timing[lang]) throw new Error(`${id} has no ${lang}`);
        const out = join(outRoot, id, lang);
        const r = await renderLanguage(browser, pkg, lang, out, { sizes, hold, dir, log: console.log });
        const mb = (n: number): string => `${(n / 1048576).toFixed(2)} MB`;
        console.log(`${id} ${lang}: ${Math.floor(Math.round(r.seconds) / 60)}:${String(Math.round(r.seconds) % 60).padStart(2, "0")}, ${r.drawn} of ${r.frames} frames drawn; ` +
          Object.entries(r.files).map(([f, n]) => `${f} ${f.endsWith(".mp4") ? mb(n) : `${Math.round(n / 1024)} KB`}`).join(", "));
      }
    }
  } finally {
    await browser.close();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
