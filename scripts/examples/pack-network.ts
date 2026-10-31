// Writes the example lesson "How the internet carries a message" (examples/pack-network), which shows every element of
// the network pack: a home network, the path across the internet and a mesh of sensors (topology), DNS, HTTPS and an
// agent asking before it calls a tool (sequence), the protocol stack (layers) and what HTTPS hides (packet), in
// English and Arabic. Then run `node scripts/make-timing.mjs pack-network` for its estimated timings.
//   node scripts/examples/pack-network.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scene, Text } from "../../packages/spec/src/index.ts";
import { presets } from "../../packages/ops/src/packs/network.ts";
import { tx } from "../../packages/ops/src/science.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ID = "pack-network";
const dir = join(ROOT, "examples", ID);
const langs = ["en", "ar"];
const T = (en: string, ar: string): Text => tx(en, ar, langs);

const gallery = new Map(presets(langs).map((p) => [p.id, p.scene]));
const pick = (id: string): Scene => {
  const s = gallery.get(id);
  if (!s) throw new Error(`no preset ${id}`);
  return s;
};

const scenes: Scene[] = [
  {
    id: "title", template: "title-hook",
    narration: { en: "Every time you open a page, a message races across the world and back. Let's follow it.", ar: "في كل مرة تفتح فيها صفحة، تنطلق رسالة عبر العالم وتعود. لنتتبّعها معًا." },
    content: { title: T("How the internet carries a message", "كيف ينقل الإنترنت رسالتك"), icon: "wifi" },
  },
  pick("net-home"),
  pick("net-path"),
  pick("net-dns"),
  pick("net-layers"),
  pick("net-tls"),
  pick("net-https"),
  pick("net-mesh"),
  pick("net-agent"),
  {
    id: "summary", template: "summary",
    narration: { en: "Devices, routes, layers and locks: now you can see the internet at work.", ar: "أجهزة وطرق وطبقات وأقفال: الآن ترى الإنترنت وهو يعمل." },
    content: {
      title: T("Remember", "تذكّر"),
      points: [
        T("A message hops router by router", "تقفز الرسالة من موجّه إلى موجّه"),
        T("Each layer adds its own header", "تضيف كل طبقة ترويستها"),
        T("HTTPS hides the content, not the addresses", "يخفي HTTPS المحتوى لا العناوين"),
      ],
      takeaway: T("Look for HTTPS before you type a password.", "ابحث عن HTTPS قبل أن تكتب كلمة المرور."),
    },
  },
];

const manifest = {
  spec: "lesson-package", version: "0.2", id: ID, rev: 1,
  title: T("How the internet carries a message", "كيف ينقل الإنترنت رسالتك"),
  summary: T("Home and school networks, the path across the internet, DNS, the protocol layers, HTTPS and a mesh of sensors, animated in step with the narration.",
    "شبكات البيت والمدرسة، وطريق الرسالة عبر الإنترنت، ونظام أسماء النطاقات، وطبقات البروتوكولات، وHTTPS، وشبكة من المستشعرات، متحركة مع السرد."),
  topic: "cyber", level: 1, defaultLang: "en", brand: "darsi-light", stage: "landscape",
  languages: [
    { code: "en", dir: "ltr", name: "English", duration: 1, timing: "timing/en.json", captions: "captions/en.vtt", quality: "draft" },
    { code: "ar", dir: "rtl", name: "العربية", duration: 1, timing: "timing/ar.json", captions: "captions/ar.vtt", quality: "machine" },
  ],
  provenance: { createdAt: "2026-10-28", createdBy: "Lesson Studio", tool: "scripts/examples/pack-network.ts (network pack); timings estimated" },
  ai: { script: "ai-assisted", translation: "ai", narration: "none", visuals: "ai-assisted", avatar: "none" },
};
const old = (() => { try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; } })();
if (old) manifest.languages.forEach((l, i) => { l.duration = old.languages[i]?.duration ?? 1; });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "scenes.json"), JSON.stringify({ version: "0.2", scenes }) + "\n");
console.log(`wrote ${dir}`);
