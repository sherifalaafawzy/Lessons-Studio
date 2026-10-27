// Reports the player's size against its budget, and each example package's download size per language.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { exampleIds, loadExample } from "./lib/examples.mjs";

const BUDGET_KB = 30; // our target; PLAN.md §9.1 allows up to 150 KB
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

const out = await build({
  entryPoints: ["packages/player/src/index.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2019",
  write: false,
});
const code = out.outputFiles[0].contents;
const playerGz = gz(code);
console.log(`player: ${kb(code.length)} minified, ${kb(playerGz)} gzipped (budget ${BUDGET_KB} KB)`);

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
