// Writes estimated timings and captions for every example, and puts each language's duration in its manifest.
// Languages that have narration keep their measured timings: re-run `npm run narrate` after editing their script.
// Usage: npm run timing [-- <example id>…]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateTiming, toVtt } from "../packages/spec/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const only = process.argv.slice(2);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

for (const id of readdirSync(root)) {
  const dir = join(root, id);
  if (!existsSync(join(dir, "manifest.json")) || (only.length && !only.includes(id))) continue;
  const manifest = read(join(dir, "manifest.json"));
  const { scenes } = read(join(dir, "scenes.json"));
  for (const lang of manifest.languages) {
    const path = join(dir, lang.timing);
    const before = existsSync(path) ? read(path) : null;
    if (before && before.source !== "estimated") {
      console.log(`${id} ${lang.code}: has narration (${before.source} timings), kept; run \`npm run narrate -- ${id}\` after script changes`);
      continue;
    }
    const timing = estimateTiming(scenes, lang.code);
    mkdirSync(dirname(join(dir, lang.timing)), { recursive: true });
    writeFileSync(join(dir, lang.timing), JSON.stringify(timing) + "\n");
    if (lang.captions) {
      mkdirSync(dirname(join(dir, lang.captions)), { recursive: true });
      writeFileSync(join(dir, lang.captions), toVtt(timing, lang.dir));
    }
    lang.duration = timing.duration;
    console.log(`${id} ${lang.code}: ${timing.duration.toFixed(1)} s, ${timing.scenes.length} scenes`);
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
