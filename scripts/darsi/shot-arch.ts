// One frame from a few of the new diagrams, so we can look before anyone re-renders the MP4s.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LessonPackage } from "../../packages/spec/src/index.ts";
import { launch, openStage } from "../video/stage.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const out = join(ROOT, "out", "arch-shots");
mkdirSync(out, { recursive: true });

const shots: [string, number, string][] = [
  ["ai-d1-1", 0, "ring"],
  ["ai-d1-1", 2, "neuron"],
  ["ai-d1-1", 4, "relu"],
  ["ai-d1-1", 5, "train"],
  ["ai-d1-2", 0, "valley"],
  ["ai-d1-2", 3, "backprop"],
  ["ai-d1-3", 2, "rnn"],
  ["ai-d1-3", 5, "memory"],
  ["ai-d1-4", 2, "scores"],
  ["ai-d2-1", 3, "filter"],
  ["ai-d2-4", 2, "gan"],
  ["ai-d3-1", 2, "reward"],
];

const chrome = process.env.CHROMIUM_PATH
  ?? "C:/Users/Sherif Alaa Fawzy/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe";
const browser = await launch({ executablePath: chrome });
const open = new Map<string, Awaited<ReturnType<typeof openStage>>>();
try {
  for (const [id, scene, name] of shots) {
    let stage = open.get(id);
    if (!stage) {
      const dir = join(ROOT, "out", "packages", id);
      const pkg = {
        manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
        scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")),
        timing: { en: JSON.parse(readFileSync(join(dir, "timing/en.json"), "utf8")) },
      } as LessonPackage;
      stage = await openStage(browser, pkg, { lang: "en", width: 1280, dir: join(ROOT, "content", "darsi", "lessons", id) });
      open.set(id, stage);
    }
    const span = stage ? null : null;
    const timing = JSON.parse(readFileSync(join(ROOT, "out", "packages", id, "timing/en.json"), "utf8"));
    const st = timing.scenes[scene];
    const t = st.start + Math.max(0.4, (st.end - st.start) * 0.82);
    await stage.seek(Math.min(t, stage.duration - 0.05));
    writeFileSync(join(out, `${id}-${name}.png`), await stage.shot("png"));
    console.log(`${id} ${name} @ ${t.toFixed(1)}s`);
    void span;
  }
} finally {
  for (const stage of open.values()) await stage.close();
  await browser.close();
}
