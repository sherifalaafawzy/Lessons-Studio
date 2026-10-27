// "Convert to canvas": a template scene becomes free elements, laid out exactly as the player draws it.
// The scene is rendered off screen at its last frame in a left-to-right language; every text, box, icon and
// arrow is measured and rebuilt as an element. Texts keep every language. Cues whose target still exists keep
// working (the element ids follow the template's targets); everything else gets a short staggered entrance.
import type { Element, IconName, Scene, Text, Tone } from "@lessonstudio/spec";
import { ICONS } from "@lessonstudio/spec";
import { createPlayer } from "@lessonstudio/player";
import { getAt, presetKeys, toPackage, type Lesson } from "@lessonstudio/ops";
import { partPath } from "./parts.ts";

const SIZES = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] } as const;
const TONE_VARS: [Tone, string][] = [["fg", "--ls-fg"], ["muted", "--ls-muted"], ["accent", "--ls-accent"], ["accent2", "--ls-accent2"],
  ["danger", "--ls-danger"], ["ok", "--ls-ok"], ["surface", "--ls-card"], ["bg", "--ls-bg"], ["line", "--ls-line"]];

/** The element id a template part becomes: the template's own cue targets where it has them. */
export function partElementId(part: string): string {
  const i = part.indexOf(":");
  if (i < 0) return part;
  const kind = part.slice(0, i);
  const key = part.slice(i + 1);
  if (kind === "step" || kind === "point") return String(Number(key) + 1);
  if (kind === "line") return `line-${Number(key) + 1}`;
  if (kind === "edge") return `edge-${Number(key) + 1}`;
  return key.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) || kind;
}

export async function convertToCanvas(lesson: Lesson, scene: Scene): Promise<Scene> {
  if (scene.template === "canvas") return scene;
  const m = lesson.manifest;
  const shape = m.stage ?? "landscape";
  const [W, H] = SIZES[shape];
  // Measured in a left-to-right language, so positions are the unmirrored layout; right-to-left languages mirror it as usual.
  const track = m.languages.find((l) => l.dir === "ltr") ?? m.languages[0]!;
  const rtl = track.dir === "rtl";
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-30000px;top:0;width:${W}px;height:${H}px;visibility:hidden`;
  document.body.append(host);
  const bare: Scene = { ...scene };
  delete bare.overlays;
  delete bare.camera;
  const pkg = toPackage({ manifest: m, scenes: { version: "0.2", scenes: [bare] } }, { [track.code]: undefined });
  const player = createPlayer(host, pkg, { lang: track.code, tier: "full", orient: shape, captions: false });
  try {
    player.seek(Math.max(0, player.duration - 0.02));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const root = host.shadowRoot!;
    // Colours are read straight away, so nothing may be half way through a transition.
    const still = document.createElement("style");
    still.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
    root.append(still);
    const stage = root.querySelector<HTMLElement>(".ls-stage")!;
    const v = root.querySelector<HTMLElement>(".ls-viewport")!.getBoundingClientRect();
    const k = v.width / W || 1;
    const box = (r: DOMRect) => {
      const x = (r.left - v.left) / k, y = (r.top - v.top) / k, w = r.width / k, h = r.height / k;
      return { x: Math.round(rtl ? W - x - w : x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    };
    const pt = (x: number, y: number) => ({ x: Math.round(rtl ? W - (x - v.left) / k : (x - v.left) / k), y: Math.round((y - v.top) / k) });
    const toneOf = paletteOf(stage);
    // Measure the plain look: no highlight or "current step" styling left over from cues.
    for (const el of stage.querySelectorAll<HTMLElement>("[class*='is-']")) {
      for (const c of [...el.classList]) if (c.startsWith("is-")) el.classList.remove(c);
    }

    const taken = new Set<string>();
    const idFor = (want: string): string => {
      let id = want.slice(0, 40) || "el";
      for (let n = 2; taken.has(id); n++) id = `${want.slice(0, 36)}-${n}`;
      taken.add(id);
      return id;
    };
    const els: Element[] = [];
    const order: string[] = [];
    const partOf = new Map<HTMLElement, string>();
    for (const el of stage.querySelectorAll<HTMLElement>("[data-part]")) partOf.set(el, el.dataset.part!);

    // Boxes: anything with a visible background or border, outermost first so it sits behind its contents.
    for (const el of stage.querySelectorAll<HTMLElement>(".ls-scene *")) {
      if (el instanceof SVGElement || el.closest("svg") || /progress|packet|wipe/.test(el.className)) continue;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const filled = bg && !/rgba\(.*,\s*0\)$|transparent/.test(bg);
      if (!filled && !(bw > 0 && cs.borderTopStyle !== "none")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.width / k > W * 0.95) continue;
      const inside = [...partOf.entries()].filter(([p]) => el.contains(p));
      const name = inside.length === 1 ? `${partElementId(inside[0]![1])}-box` : "box";
      const radius = Math.round(parseFloat(cs.borderTopLeftRadius) || 0);
      const b = box(r);
      els.push({
        id: idFor(name), type: "shape", shape: radius >= Math.min(b.w, b.h) / 2 - 1 ? "pill" : "rect", ...b,
        ...(filled ? { fill: toneOf(bg) } : {}),
        ...(bw > 0 ? { stroke: toneOf(cs.borderTopColor, filled ? toneOf(bg) : undefined), strokeWidth: Math.round(bw) } : {}),
        ...(radius ? { radius } : {}),
      });
      order.push(name);
    }

    // Arrows of a flow: each edge line, with its head.
    for (const line of stage.querySelectorAll<SVGLineElement>("line.ls-edge")) {
      const ctm = line.getScreenCTM();
      if (!ctm) continue;
      const a = new DOMPoint(Number(line.getAttribute("x1")), Number(line.getAttribute("y1"))).matrixTransform(ctm);
      const b = new DOMPoint(Number(line.getAttribute("x2")), Number(line.getAttribute("y2"))).matrixTransform(ctm);
      const p1 = pt(a.x, a.y), p2 = pt(b.x, b.y);
      const name = idFor("arrow");
      els.push({ id: name, type: "line", x: p1.x, y: p1.y, x2: p2.x, y2: p2.y, arrow: "end", tone: toneOf(getComputedStyle(line).stroke), strokeWidth: Math.round(parseFloat(getComputedStyle(line).strokeWidth) || 4) });
      order.push(name);
    }

    // Icons.
    for (const svg of stage.querySelectorAll<SVGSVGElement>("svg[data-icon]")) {
      const icon = svg.dataset.icon as IconName;
      if (!(ICONS as readonly string[]).includes(icon)) continue;
      const host2 = svg.parentElement;
      const inside = host2 ? [...partOf.entries()].filter(([p]) => host2.contains(p) || p.parentElement === host2) : [];
      const name = inside.length === 1 ? `${partElementId(inside[0]![1])}-icon` : "icon";
      els.push({ id: idFor(name), type: "icon", icon, ...box(svg.getBoundingClientRect()), tone: toneOf(getComputedStyle(svg).color) });
      order.push(name);
    }

    // Text: the template's parts keep every language; other text (numbers, letters, times) is copied as shown.
    const texts = [...stage.querySelectorAll<HTMLElement>(".ls-scene [data-part], .ls-num, .ls-letter, .ls-msg-time")];
    for (const el of texts) {
      const part = el.dataset.part;
      const path = part ? partPath(scene, part) : null;
      const text = path ? getAt(scene, path) as Text | undefined : el.textContent?.trim();
      if (text === undefined || text === "") continue;
      const cs = getComputedStyle(el);
      // The words themselves, not their container (a number centred in a circle stays centred).
      const range = document.createRange();
      range.selectNodeContents(el);
      const b = box(range.getBoundingClientRect());
      const oneWord = typeof text === "string" ? !/\s/.test(text) : Object.values(text).every((x) => !/\s/.test(x));
      const weight = Number(cs.fontWeight) >= 750 ? 800 : Number(cs.fontWeight) >= 650 ? 700 : Number(cs.fontWeight) >= 550 ? 600 : 400;
      const align = cs.textAlign === "center" ? "center" : undefined;
      const want = part ? partElementId(part) : "text";
      // A little room, so other languages' longer words still fit on the line.
      els.push({
        id: idFor(want), type: "text", text, x: b.x, y: b.y, ...(oneWord ? {} : { w: Math.min(W - b.x, Math.round(b.w * 1.08) + 4) }),
        size: Math.round(parseFloat(cs.fontSize)), weight, tone: toneOf(cs.color), ...(align ? { align } : {}),
        ...(part === "link" ? { fixed: true } : {}),
      });
      order.push(want);
    }

    // Cues keep working where their target is now an element; the rest come in one after another.
    const ids = new Set(els.map((e) => e.id));
    const cues = (scene.cues ?? []).filter((c) => ids.has(c.target));
    const revealed = new Set(cues.filter((c) => c.action === "reveal").map((c) => c.target));
    let n = 0;
    const animated = els.map((e) => {
      if (revealed.has(e.id) || revealed.has(e.id.replace(/-(box|icon)$/, ""))) return e;
      return { ...e, anim: presetKeys(e, e.type === "line" ? "draw" : "fade-in", Math.round((0.15 + 0.12 * n++) * 100) / 100, 0.4) };
    });
    // A box revealed with its text: give it the text's cue too.
    const boxCues = cues.filter((c) => c.action === "reveal").flatMap((c) =>
      ["box", "icon"].map((s) => `${c.target}-${s}`).filter((id) => ids.has(id)).map((target) => ({ ...c, target })));

    const out: Scene = {
      id: scene.id, template: "canvas", narration: scene.narration,
      content: { elements: [...animated, ...(scene.overlays ?? [])] },
      ...(cues.length || boxCues.length ? { cues: [...cues, ...boxCues] } : {}),
      ...(scene.check ? { check: scene.check } : {}),
      ...(scene.transition ? { transition: scene.transition } : {}),
      ...(scene.camera ? { camera: scene.camera } : {}),
      ...(scene.background ? { background: scene.background } : {}),
      ...(scene.mirror !== undefined ? { mirror: scene.mirror } : {}),
    };
    return out;
  } finally {
    player.destroy();
    host.remove();
  }
}

/** The brand tone nearest to a colour, from the player's own palette. */
function paletteOf(stage: HTMLElement): (color: string, not?: Tone) => Tone {
  const cs = getComputedStyle(stage);
  const rgb = (c: string): [number, number, number] | null => {
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe || !c) return null;
    probe.fillStyle = "#000";
    probe.fillStyle = c.trim();
    const v = String(probe.fillStyle);
    if (v.startsWith("#")) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const tones = TONE_VARS.map(([tone, name]) => [tone, rgb(cs.getPropertyValue(name))] as const).filter((x): x is readonly [Tone, [number, number, number]] => !!x[1]);
  // `not`: an outline is never given its box's own fill colour, or it would vanish.
  return (color, not) => {
    const c = rgb(color);
    if (!c || !tones.length) return "fg";
    let best: Tone = "fg", d = Infinity;
    for (const [tone, t] of tones) {
      if (tone === not) continue;
      const e = (t[0] - c[0]) ** 2 + (t[1] - c[1]) ** 2 + (t[2] - c[2]) ** 2;
      if (e < d) { d = e; best = tone; }
    }
    return best;
  };
}
