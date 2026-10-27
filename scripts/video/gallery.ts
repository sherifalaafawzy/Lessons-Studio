// A page to watch the rendered videos: out/videos/index.html, one card per lesson and language, with captions and
// the three sizes. Serve the folder over HTTP (captions don't load from file://), for example:
//   node scripts/video/gallery.ts && python -m http.server 4340 -d out/videos
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(ROOT, "out", "videos");
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mb = (p: string): string => (existsSync(p) ? `${(statSync(p).size / 1048576).toFixed(2)} MB` : "");
const time = (s: number): string => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

const cards: string[] = [];
for (const id of readdirSync(OUT).filter((d) => statSync(join(OUT, d)).isDirectory()).sort()) {
  for (const lang of readdirSync(join(OUT, id)).sort()) {
    const dir = join(OUT, id, lang);
    if (!existsSync(join(dir, "video.json"))) continue;
    const v = JSON.parse(readFileSync(join(dir, "video.json"), "utf8")) as { title: string; dir: string; seconds: number; narrated?: boolean; files: Record<string, string> };
    const base = `${id}/${lang}`;
    // A version on every link, from the file's time: a re-rendered video never plays from the browser's cache.
    const v_ = (f: string): string => `${base}/${f}?v=${Math.round(statSync(join(dir, f)).mtimeMs)}`;
    cards.push(`<article dir="${v.dir}" lang="${lang}">
  <video controls preload="none" poster="${v_("poster.jpg")}" src="${v_("360p.mp4")}"><track kind="captions" srclang="${lang}" src="${v_("captions.vtt")}" default></video>
  <h2>${esc(v.title)}</h2>
  <p dir="ltr"><b class="${v.narrated ? "on" : "off"}">${v.narrated ? "narrated" : "silent"}</b> ${id} · ${lang} · ${time(v.seconds)} · ${Object.keys(v.files).map((k) => `<a href="${v_(v.files[k]!)}">${k}</a> ${mb(join(dir, v.files[k]!))}`).join(" · ")} · <a href="${v_("captions.vtt")}">captions</a></p>
</article>`);
  }
}
writeFileSync(join(OUT, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Darsi videos</title><style>
body{margin:0;padding:16px;background:#f4f1ea;color:#1d1a2b;font:15px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 12px}.g{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))}
article{background:#fff;border:2px solid #1d1a2b;border-radius:14px;padding:10px}video{width:100%;border-radius:8px;background:#000;aspect-ratio:16/9}
h2{font-size:17px;margin:8px 0 4px}p{margin:0;color:#555;font-size:13px}a{color:#c2410c}
b.on,b.off{font-size:12px;padding:1px 6px;border-radius:6px;color:#fff}b.on{background:#0f766e}b.off{background:#777}
</style></head><body><h1>Darsi videos (${cards.length})</h1><div class="g">${cards.join("\n")}</div></body></html>
`);
console.log(`${cards.length} videos: ${join(OUT, "index.html")}`);
