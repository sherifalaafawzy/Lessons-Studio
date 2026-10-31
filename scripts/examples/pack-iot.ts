// Writes the example lesson "Inside a connected device" (examples/pack-iot), which shows every element of the IoT pack:
// circuits with current flowing (a closed loop, an LED and its resistor, a light sensor read by a pin), a Pico's pins,
// a temperature reading sampled and thresholded, an ADC's steps, an AND gate with its truth table, and a byte, in
// English and Arabic. Then run `node scripts/make-timing.mjs pack-iot` for its estimated timings.
//   node scripts/examples/pack-iot.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scene, Text } from "../../packages/spec/src/index.ts";
import { presets } from "../../packages/ops/src/packs/iot.ts";
import { tx } from "../../packages/ops/src/science.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ID = "pack-iot";
const dir = join(ROOT, "examples", ID);
const langs = ["en", "ar"];
const T = (en: string, ar: string): Text => tx(en, ar, langs);
const gallery = new Map(presets(langs, "landscape").map((p) => [p.id, p.scene]));
const pick = (id: string): Scene => {
  const s = gallery.get(id);
  if (!s) throw new Error(`no preset ${id}`);
  return { ...s, id: id.replace(/^iot-/, "") };
};

const scenes: Scene[] = [
  {
    id: "title", template: "title-hook",
    narration: { en: "What happens inside a connected device? Let's follow the current, the pins and the numbers.", ar: "ماذا يحدث داخل جهاز متصل؟ لنتتبّع التيار والأطراف والأرقام." },
    content: { title: T("Inside a connected device", "داخل جهاز متصل"), icon: "chip" },
  },
  pick("iot-loop"),
  pick("iot-led"),
  pick("iot-light"),
  pick("iot-pico"),
  pick("iot-temperature"),
  pick("iot-adc"),
  pick("iot-and"),
  pick("iot-byte"),
  {
    id: "summary", template: "summary",
    narration: { en: "Current in a loop, pins with names, readings turned into numbers, and logic that decides: that's every smart device.", ar: "تيار في حلقة، وأطراف لها أسماء، وقراءات تتحول إلى أرقام، ومنطق يقرّر: هذا هو كل جهاز ذكي." },
    content: {
      title: T("Remember", "تذكّر"),
      points: [
        T("Current flows only round a closed loop", "يسري التيار في حلقة مغلقة فقط"),
        T("A resistor keeps an LED safe", "المقاومة تحمي الثنائي LED"),
        T("Sensors become numbers; thresholds become decisions", "الحساسات تصير أرقامًا، والعتبات تصير قرارات"),
      ],
      takeaway: T("Every smart device is a loop, a few pins and some logic.", "كل جهاز ذكي حلقة وبضعة أطراف وقليل من المنطق."),
    },
  },
];

const manifest = {
  spec: "lesson-package", version: "0.2", id: ID, rev: 1,
  title: T("Inside a connected device", "داخل جهاز متصل"),
  summary: T("Circuits with current flowing, a Pico's pins, a sensor reading sampled and thresholded, an ADC, logic gates and a byte, animated in step with the narration.",
    "دوائر يسري فيها التيار، وأطراف لوحة Pico، وقراءة حسّاس تُؤخذ عيّناتها وتُقارن بعتبة، ومحوّل تناظري رقمي، وبوابات منطقية، وبايت، كلها متحركة مع السرد."),
  topic: "iot", level: 2, defaultLang: "en", brand: "darsi-light", stage: "landscape",
  languages: [
    { code: "en", dir: "ltr", name: "English", duration: 1, timing: "timing/en.json", captions: "captions/en.vtt", quality: "draft" },
    { code: "ar", dir: "rtl", name: "العربية", duration: 1, timing: "timing/ar.json", captions: "captions/ar.vtt", quality: "machine" },
  ],
  provenance: { createdAt: "2026-10-28", createdBy: "Lesson Studio", tool: "scripts/examples/pack-iot.ts (the IoT pack's gallery scenes); timings estimated" },
  ai: { script: "ai-assisted", translation: "ai", narration: "none", visuals: "ai-assisted", avatar: "none" },
};
const old = (() => { try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; } })();
if (old) manifest.languages.forEach((l, i) => { l.duration = old.languages[i]?.duration ?? 1; });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "scenes.json"), JSON.stringify({ version: "0.2", scenes }) + "\n");
console.log(`wrote ${dir}`);
