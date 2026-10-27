// Contact sheets: one picture per scene (as it ends, every animation done), on one page per lesson and language.
//   node scripts/darsi/sheet.ts [ids] [--lang ar-EG] [--at 0.5]
// --at picks the moment inside each scene (0 = start, 1 = end; default 0.97). Writes out/sheets/<id>-<lang>.png.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toPackage, type Lesson } from "../../packages/ops/src/index.ts";
import { launch, openStage } from "../video/stage.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const lang = flag("--lang") ?? "en";
const at = Number(flag("--at") ?? 0.97);
const ids = args.length ? args.map((a) => a.toLowerCase()) : ["ai-1-1-1", "ai-1-1-2", "ai-1-1-3", "ai-1-1-4", "cy-1-1-1", "cy-1-1-2", "cy-1-1-3", "cy-1-1-4", "iot-1-2-1", "iot-1-2-2", "iot-1-2-3", "iot-1-2-4"];
const out = join(ROOT, "out", "sheets");
mkdirSync(out, { recursive: true });

const browser = await launch();
try {
  for (const id of ids) {
    const dir = join(ROOT, "content", "darsi", "lessons", id);
    const lesson: Lesson = { manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) };
    const pkg = toPackage(lesson);
    const stage = await openStage(browser, pkg, { lang, width: 640 });
    const shots: { n: string; png: string }[] = [];
    for (const s of pkg.timing[lang]!.scenes) {
      await stage.seek(s.start + (s.end - s.start) * at - (at >= 1 ? 0.05 : 0));
      shots.push({ n: s.id, png: (await stage.shot("png")).toString("base64") });
    }
    await stage.close();
    const page = await browser.newPage({ viewport: { width: 1980, height: 400 } });
    const title = lesson.manifest.title as Record<string, string>;
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:16px;background:#20242c;font:14px system-ui;color:#e7eaf0}
      h1{font-size:18px;margin:0 0 12px} .g{display:grid;grid-template-columns:repeat(3,640px);gap:10px}
      figure{margin:0} img{display:block;width:640px;height:360px} figcaption{padding:3px 0}</style>
      <h1>${id} (${lang}): ${title[lang] ?? title.en}</h1><div class="g">${shots.map((s) => `<figure><img src="data:image/png;base64,${s.png}"><figcaption>${s.n}</figcaption></figure>`).join("")}</div>`);
    const file = join(out, `${id}-${lang}${at === 0.97 ? "" : `-${at}`}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.close();
    console.log(file);
  }
} finally {
  await browser.close();
}
