// Light lessons for learners: each lesson as a static Lesson Package (manifest, scenes, timing and captions per
// language) that the player plays anywhere, a few KB per language instead of megabytes of video. Pictures from the
// shared library ("@lib/...": the cast, the extended icons) load from Lesson Studio's Hosting, once for every lesson.
//   npm run package-lessons -- [lesson folders | Darsi ids] [--out out/packages]
// With no lessons named, it packages all of content/darsi/lessons/.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { toVtt, validatePackage, walkElements, type TimingFile } from "../../packages/spec/src/index.ts";
import { toPackage, type Lesson } from "../../packages/ops/src/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DARSI = join(ROOT, "content", "darsi", "lessons");

const args = process.argv.slice(2);
const o = args.indexOf("--out");
const outRoot = resolve(o >= 0 ? args.splice(o, 2)[1]! : join(ROOT, "out", "packages"));
const dirs = (args.length ? args : readdirSync(DARSI)).map((a) => [resolve(a), join(DARSI, a.toLowerCase())].find((d) => existsSync(join(d, "manifest.json")))
  ?? (() => { throw new Error(`No lesson at ${a}`); })());

const gz = (s: string): number => gzipSync(Buffer.from(s), { level: 9 }).length;
const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
let bad = 0;
const index: { id: string; title: unknown; languages: { code: string; seconds: number; kb: number; audioKb: number }[] }[] = [];

for (const dir of dirs) {
  const lesson: Lesson = { manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) };
  const timings: Record<string, TimingFile> = {};
  for (const l of lesson.manifest.languages) if (existsSync(join(dir, l.timing))) timings[l.code] = JSON.parse(readFileSync(join(dir, l.timing), "utf8"));
  const pkg = toPackage(lesson, timings);
  const r = validatePackage(pkg);
  const issues = [...r.errors, ...r.warnings.filter((w) => w.code !== "longLesson" && w.code !== "heavyLesson")];
  const id = pkg.manifest.id;
  const out = join(outRoot, id);
  rmSync(out, { recursive: true, force: true });

  const files: Record<string, string> = {
    "manifest.json": JSON.stringify(pkg.manifest),
    "scenes.json": JSON.stringify(pkg.scenes),
  };
  for (const l of pkg.manifest.languages) {
    files[l.timing] = JSON.stringify(pkg.timing[l.code]);
    if (l.captions) files[l.captions] = toVtt(pkg.timing[l.code]!, l.dir);
  }
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(out, name, ".."), { recursive: true });
    writeFileSync(join(out, name), body);
  }
  // The narration, once made (Opus, plus AAC for browsers without Opus).
  for (const l of pkg.manifest.languages) {
    for (const f of [l.audio, l.audioFallback]) {
      if (!f || !existsSync(join(dir, f))) continue;
      mkdirSync(join(out, f, ".."), { recursive: true });
      copyFileSync(join(dir, f), join(out, f));
    }
  }

  // What the library adds (fetched once, shared by every lesson).
  const lib = new Set<string>();
  for (const s of pkg.scenes.scenes) walkElements(s, (el) => { if (el.type === "image" && el.src.startsWith("@lib/")) lib.add(el.src); });
  const langs = pkg.manifest.languages.map((l) => {
    const n = gz(files["manifest.json"]!) + gz(files["scenes.json"]!) + gz(files[l.timing]!) + (l.captions ? gz(files[l.captions]!) : 0);
    const audio = l.audio && existsSync(join(dir, l.audio)) ? statSync(join(dir, l.audio)).size : 0;
    return { code: l.code, seconds: Math.round(pkg.timing[l.code]!.duration), kb: Math.round(n / 102.4) / 10, audioKb: Math.round(audio / 1024) };
  });
  index.push({ id, title: pkg.manifest.title, languages: langs });
  console.log(`${id}: ${langs.map((l) => `${l.code} ${kb(l.kb * 1024)}${l.audioKb ? ` + ${l.audioKb} KB narration` : ""} for ${Math.floor(l.seconds / 60)}:${String(l.seconds % 60).padStart(2, "0")}`).join(", ")} gzipped` +
    `; library: ${lib.size} cast pictures${issues.length ? `; ${issues.length} issues` : ""}`);
  for (const e of issues.slice(0, 8)) console.log(`   ${e.code} ${e.path}${e.detail ? ` (${e.detail})` : ""}`);
  if (r.errors.length) bad++;
}
writeFileSync(join(outRoot, "index.json"), `${JSON.stringify({ lessons: index }, null, 1)}\n`);
console.log(`\n${index.length} lessons in ${outRoot}`);
process.exit(bad ? 1 : 0);
