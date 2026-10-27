// Validates every example package. Exits 1 on any error.
import { validatePackage } from "../packages/spec/src/index.ts";
import { exampleIds, loadExample } from "./lib/examples.mjs";

let failed = false;
for (const id of exampleIds()) {
  const { pkg } = loadExample(id);
  const r = validatePackage(pkg);
  console.log(`${id}: ${r.errors.length} errors, ${r.warnings.length} warnings`);
  for (const e of r.errors) console.log(`  error   ${e.code} at ${e.path}${e.detail ? ` (${e.detail})` : ""}`);
  for (const w of r.warnings) console.log(`  warning ${w.code} at ${w.path}${w.detail ? ` (${w.detail})` : ""}`);
  if (!r.ok) failed = true;
}
process.exit(failed ? 1 : 0);
