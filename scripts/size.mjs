// Reports the player's size against its budget, and each example package's download size per language.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { exampleIds, loadExample } from "./lib/examples.mjs";

const BUDGET_KB = 30; // our target; PLAN.md §9.1 allows up to 150 KB
const SCIENCE_KB = 20;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

// Split as hosts load it: the core (entry plus the chunks it imports) and each technology pack, a chunk loaded on demand.
const out = await build({
  entryPoints: ["packages/player/src/index.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2019",
  splitting: true,
  outdir: "out/size",
  write: false,
});
const files = new Map(out.outputFiles.map((f) => [f.path.replace(/\\/g, "/").split("/").pop(), f.contents]));
const entry = [...files.keys()].find((n) => n.startsWith("index"));
const core = new Set();
const walk = (n) => {
  if (core.has(n)) return;
  core.add(n);
  const text = new TextDecoder().decode(files.get(n));
  // Static imports only (import{…}from"./chunk.js"); the kit's import("./science.js") is left out.
  for (const m of text.matchAll(/(?:^|[;}\s])import\s*(?:[^"'()]*?from\s*)?"\.\/([^"]+\.js)"/g)) walk(m[1]);
};
walk(entry);
const sum = (names) => names.reduce((a, n) => [a[0] + files.get(n).length, a[1] + gz(files.get(n))], [0, 0]);
const [coreRaw, playerGz] = sum([...core]);
console.log(`player: ${kb(coreRaw)} minified, ${kb(playerGz)} gzipped (budget ${BUDGET_KB} KB)`);
// Each pack: its own chunk (named after its folder) and what it imports that the core doesn't have.
let sciGz = 0;
for (const name of [...files.keys()].filter((n) => !core.has(n) && !n.startsWith("chunk-")).sort()) {
  const mine = new Set();
  const visit = (n) => {
    if (mine.has(n) || core.has(n)) return;
    mine.add(n);
    const text = new TextDecoder().decode(files.get(n));
    for (const m of text.matchAll(/(?:^|[;}\s])import\s*(?:[^"'()]*?from\s*)?"\.\/([^"]+\.js)"/g)) visit(m[1]);
  };
  visit(name);
  const [raw, z] = sum([...mine]);
  sciGz = Math.max(sciGz, z);
  console.log(`  pack ${name.replace(/-[\w]+\.js$/, "").replace(/\.js$/, "")}: ${kb(raw)} minified, ${kb(z)} gzipped (budget ${SCIENCE_KB} KB; only for lessons that use it)`);
}

console.log("\nlesson packages (what one language downloads; gzipped as a server would send it):");
for (const id of exampleIds()) {
  const { dir, pkg } = loadExample(id);
  for (const l of pkg.manifest.languages) {
    const files = ["manifest.json", "scenes.json", l.timing, l.captions, l.audio].filter((f) => f && existsSync(join(dir, f)));
    let raw = 0;
    let zipped = 0;
    for (const f of files) {
      const b = readFileSync(join(dir, f));
      raw += b.length;
      zipped += f.endsWith(".opus") || f.endsWith(".m4a") ? b.length : gz(b);
    }
    const audio = l.audio ? "" : ", no audio yet";
    console.log(`  ${id} ${l.code}: ${kb(raw)} raw, ${kb(zipped)} gzipped, ${l.duration.toFixed(0)} s${audio}`);
  }
}
if (playerGz > BUDGET_KB * 1024) {
  console.error(`\nThe player is over its ${BUDGET_KB} KB budget.`);
  process.exit(1);
}
