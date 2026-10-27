// Loads the example packages from disk, with every language's timing.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples");

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

export function exampleIds() {
  return readdirSync(EXAMPLES).filter((id) => existsSync(join(EXAMPLES, id, "manifest.json")));
}

export function loadExample(id) {
  const dir = join(EXAMPLES, id);
  const manifest = read(join(dir, "manifest.json"));
  const scenes = read(join(dir, "scenes.json"));
  const timing = {};
  for (const l of manifest.languages) if (existsSync(join(dir, l.timing))) timing[l.code] = read(join(dir, l.timing));
  return { dir, pkg: { manifest, scenes, timing } };
}
