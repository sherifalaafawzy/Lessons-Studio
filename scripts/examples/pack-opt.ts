// Writes the example lesson "Finding the best plan" (examples/pack-opt), which shows every element of the optimization
// pack (docs/packs/opt.md) in English and Arabic: the shortest way by Dijkstra's method, a bus route by nearest
// neighbour and 2-opt, a spanning tree, exam slots by colouring, a timetable by propagation and search, a Gantt chart,
// the truck packed greedily and by dynamic programming, the garden's linear program and branch and bound. Its scenes are
// the pack's gallery presets. Then run `node scripts/make-timing.mjs pack-opt` for its estimated timings.
//   node scripts/examples/pack-opt.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scene, Text } from "../../packages/spec/src/index.ts";
import { packs, tx } from "../../packages/ops/src/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ID = "pack-opt";
const dir = join(ROOT, "examples", ID);
const langs = ["en", "ar"];
const T = (en: string, ar: string): Text => tx(en, ar, langs);

const scenes: Scene[] = [
  {
    id: "title", template: "title-hook",
    narration: { en: "Optimization: the best plan within the limits.", ar: "الحلول المثلى: أفضل خطة ضمن القيود." },
    // No kicker: the template sets it at 26 px, too small for a phone (layout check).
    content: { title: T("Finding the best plan", "البحث عن أفضل خطة"), icon: "spark" },
  },
  ...packs.opt.presets(langs, "landscape").map((p) => ({ ...p.scene, id: p.id.replace(/^opt-/, "") })),
  {
    id: "summary", template: "summary",
    narration: { en: "Name the goal and the limits, then let a method search.", ar: "سمِّ الهدف والقيود، ثم دع طريقة تبحث عن الحل." },
    content: {
      title: T("Remember", "تذكّر"),
      points: [T("A goal, limits and options", "هدف وقيود وخيارات"), T("Quick rules can miss the best", "القواعد السريعة قد تفوّت الأفضل"), T("Search, but cut what can't win", "ابحث، واقطع ما لا يمكن أن يفوز")],
      takeaway: T("Checking a plan is easy; finding the best is the craft.", "فحص الخطة سهل، أما إيجاد أفضلها فهو الفن."),
    },
  },
];

const manifest = {
  spec: "lesson-package", version: "0.2", id: ID, rev: 1,
  title: T("Finding the best plan", "البحث عن أفضل خطة"),
  summary: T("Shortest ways, bus routes, exam slots, timetables, a Gantt chart, the knapsack, a linear program and branch and bound, animated in step with the narration.",
    "أقصر الطرق وطريق الحافلة ومواعيد الامتحانات والجداول ومخطط جانت ومسألة الحقيبة والبرمجة الخطية والتفريع والتحديد، متحركة مع السرد."),
  topic: "ai", level: 2, defaultLang: "en", brand: "darsi-light", stage: "landscape",
  languages: [
    { code: "en", dir: "ltr", name: "English", duration: 1, timing: "timing/en.json", captions: "captions/en.vtt", quality: "draft" },
    { code: "ar", dir: "rtl", name: "العربية", duration: 1, timing: "timing/ar.json", captions: "captions/ar.vtt", quality: "machine" },
  ],
  provenance: { createdAt: "2026-10-29", createdBy: "Lesson Studio", tool: "scripts/examples/pack-opt.ts (optimization pack); timings estimated" },
  ai: { script: "ai-assisted", translation: "ai", narration: "none", visuals: "ai-assisted", avatar: "none" },
};
const old = (() => { try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; } })();
if (old) manifest.languages.forEach((l, i) => { l.duration = old.languages[i]?.duration ?? 1; });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "scenes.json"), JSON.stringify({ version: "0.2", scenes }) + "\n");
console.log(`wrote ${dir}`);
