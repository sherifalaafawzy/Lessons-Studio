import { createPlayer, ensureTiming, loadPackage, TIERS, type Orient, type Player, type Signals, type Tier } from "@lessonstudio/player";
import { pick, validatePackage, type LessonPackage, type Text } from "@lessonstudio/spec";

/** Playground state lives in the URL, so a view can be shared and the e2e tests can open one directly. */
const params = new URLSearchParams(location.search);
const state = {
  lesson: params.get("lesson") ?? "",
  lang: params.get("lang") ?? "",
  tier: (params.get("tier") ?? "auto") as Tier | "auto",
  orient: (params.get("orient") ?? "auto") as Orient | "auto",
  device: params.get("device") === "phone" ? "phone" : "desktop",
};

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const controls = $("controls");
const device = $("device");
const host = $("player");
const log = $("log");

/** "Low-end phone, 3G": a 360 px screen, device signals that pick the Lite tier, and slow downloads. */
const PHONE: Signals = { memory: 2, cores: 4, network: "3g" };
const bytesSeen = new Map<string, number>();

async function slowFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const r = await fetch(input, init);
  const body = await r.arrayBuffer();
  bytesSeen.set(String(input), body.byteLength);
  if (state.device === "phone") {
    // About 3G: 300 ms round trip and 400 kbit/s.
    await new Promise((ok) => setTimeout(ok, 300 + (body.byteLength * 8) / 400));
  }
  return new Response(body, { status: r.status, headers: r.headers });
}

function select(label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLLabelElement {
  const sel = document.createElement("select");
  sel.name = label.toLowerCase();
  for (const [v, text] of options) sel.add(new Option(text, v, false, v === value));
  sel.addEventListener("change", () => onChange(sel.value));
  const l = document.createElement("label");
  l.append(label, sel);
  return l;
}

function note(text: string): void {
  const line = document.createElement("div");
  line.textContent = `${new Date().toISOString().slice(11, 19)} ${text}`;
  log.prepend(line);
  while (log.childElementCount > 40) log.lastElementChild?.remove();
}

function syncUrl(): void {
  const q = new URLSearchParams();
  q.set("lesson", state.lesson);
  if (state.lang) q.set("lang", state.lang);
  if (state.tier !== "auto") q.set("tier", state.tier);
  if (state.orient !== "auto") q.set("orient", state.orient);
  if (state.device === "phone") q.set("device", "phone");
  history.replaceState(null, "", `?${q}`);
}

let player: Player | null = null;
let pkg: LessonPackage | null = null;
let lessons: { id: string; title: Text }[] = [];

async function showChecks(p: LessonPackage): Promise<void> {
  const report = $("report");
  for (const l of p.manifest.languages) await ensureTiming(p, l.code, slowFetch);
  const r = validatePackage(p);
  report.replaceChildren();
  const head = document.createElement("p");
  head.className = r.ok ? "ok" : "bad";
  head.textContent = `${r.errors.length} errors, ${r.warnings.length} warnings`;
  report.append(head);
  if (r.errors.length + r.warnings.length) {
    const ul = document.createElement("ul");
    for (const i of [...r.errors, ...r.warnings]) {
      const li = document.createElement("li");
      li.textContent = `${i.code} at ${i.path}${i.detail ? ` (${i.detail})` : ""}`;
      ul.append(li);
    }
    report.append(ul);
  }
}

function showSize(p: LessonPackage, lang: string): void {
  const files = ["manifest.json", "scenes.json"];
  const track = p.manifest.languages.find((l) => l.code === lang);
  if (track) files.push(track.timing, ...(track.captions ? [track.captions] : []));
  const rows: [string, number | undefined][] = files.map((f) => [f, bytesSeen.get(new URL(f, p.base).href)]);
  // The narration streams through <audio> on the first play; its size is in the manifest's assets.
  if (track?.audio) rows.push([`${track.audio} (on play)`, p.manifest.assets?.find((a) => a.path === track.audio)?.bytes]);
  const total = rows.reduce((a, [, b]) => a + (b ?? 0), 0);
  const table = document.createElement("table");
  for (const [f, b] of [...rows, ["Total", total] as [string, number]]) {
    const tr = table.insertRow();
    tr.insertCell().textContent = f;
    tr.insertCell().textContent = b === undefined ? "not loaded" : `${(b / 1024).toFixed(1)} KB`;
  }
  $("size").replaceChildren(table);
}

function buildControls(): void {
  const langs = pkg?.manifest.languages ?? [];
  controls.replaceChildren(
    select("Lesson", state.lesson, lessons.map((l) => [l.id, pick(l.title, "en")]), (v) => {
      state.lesson = v;
      state.lang = "";
      void open();
    }),
    select("Language", state.lang, langs.map((l) => [l.code, l.name]), async (v) => {
      state.lang = v;
      syncUrl();
      await player?.setLang(v);
      if (pkg) showSize(pkg, v);
    }),
    select("Quality", state.tier, [["auto", "Auto"], ...TIERS.map((t) => [t, t[0]!.toUpperCase() + t.slice(1)] as [string, string])], (v) => {
      state.tier = v as Tier | "auto";
      syncUrl();
      player?.setTier(state.tier);
    }),
    select("Shape", state.orient, [["auto", "Auto"], ["landscape", "Landscape 16:9"], ["portrait", "Portrait 9:16"], ["square", "Square 1:1"]], (v) => {
      state.orient = v as Orient | "auto";
      syncUrl();
      player?.setOrient(state.orient);
    }),
    select("Preview as", state.device, [["desktop", "Desktop"], ["phone", "Low-end phone, 3G"]], (v) => {
      state.device = v;
      void open();
    }),
  );
}

async function open(): Promise<void> {
  syncUrl();
  player?.destroy();
  player = null;
  device.className = `device ${state.device === "phone" ? "phone" : ""}`;
  const started = performance.now();
  pkg = await loadPackage(`/examples/${state.lesson}/`, { lang: state.lang || undefined, fetch: slowFetch });
  if (!state.lang || !pkg.manifest.languages.some((l) => l.code === state.lang)) state.lang = pkg.manifest.defaultLang;
  await ensureTiming(pkg, state.lang, slowFetch);
  buildControls();
  player = createPlayer(host, pkg, {
    lang: state.lang,
    tier: state.tier,
    orient: state.orient,
    signals: state.device === "phone" ? PHONE : undefined,
    fetch: slowFetch,
    onEvent: (e) => note(e.type === "scene" ? `scene ${e.id}` : e.type === "check" ? `check ${e.id}: ${e.correct ? "right" : "wrong"}` : e.type === "tier" ? `tier ${e.tier}` : e.type === "lang" ? `lang ${e.lang}` : e.type === "no-audio" ? "no audio: playing silently with captions" : e.type),
  });
  note(`ready in ${Math.round(performance.now() - started)} ms, tier ${player.tier}, ${player.orient}`);
  (window as unknown as { player: Player }).player = player;
  showSize(pkg, state.lang);
  void showChecks(pkg);
}

async function start(): Promise<void> {
  lessons = await (await fetch("/examples/index.json")).json();
  if (!lessons.some((l) => l.id === state.lesson)) state.lesson = lessons[0]?.id ?? "";
  await open();
}

void start();
