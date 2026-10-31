// The layout check: every scene of a lesson in the real player (headless Chromium, scripts/video/stage.ts), in every
// language, at its middle (0.5) and as it ends (0.97, everything revealed), looking for text that overflows or
// overlaps, things off the stage, text too small for a 360 px phone, and bidi mistakes in right-to-left text. Run it
// before narration is paid for.
//   node scripts/video/layout-check.ts <Darsi id | example id | lesson folder | folder of lessons>... [--lang en,ar-EG]
//     [--json] [--at 0.5,0.97] [--orient portrait] [--skip font] [--system-fonts] [--shots out/layout-check/shots]
// Ids may use * ("ai-1-1-*"). --lang checks those languages where a lesson has them (default: all of its languages).
// Text is set in Noto Sans and Noto Sans Arabic, as on Android phones and in the online MP4 export (--system-fonts uses
// this machine's). --shots saves a picture of every moment with an error, the boxes in question outlined.
// The rules and thresholds are in layout-rules.ts. Exit code 1 when there are errors.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright-core";
import type { LessonPackage, Orient, TimingFile } from "../../packages/spec/src/index.ts";
import { currentTimings, toPackage, type Lesson } from "../../packages/ops/src/index.ts";
import { FONT_FILES, launch, openStage } from "./stage.ts";
import {
  LIMITS, beyond, bidiAdvice, bidiProblems, count, describeSides, fontFinding, formatLesson, formatTotals, merge, nameOf, nested, onceForTemplates, overflowOf,
  overlapShare, smallest, union, type CharPos, type Finding, type Kind, type LessonResult, type OverflowMeasure, type Rect, type Sides,
} from "./layout-rules.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const STAGES: Record<Orient, { W: number; H: number }> = { landscape: { W: 1280, H: 720 }, portrait: { W: 720, H: 1280 }, square: { W: 1080, H: 1080 } };

/* ---------- what the page measures ---------- */

/** A text on the stage: an element, a template part, or a block, cell or label inside a science element. */
export interface UnitM {
  key: string;
  /** Cells overlap-check as their table; everything else as itself. */
  group: string;
  el?: string;
  part?: string;
  sub?: string;
  /** Where it is in the stage's DOM (child indices), to tell a parent from its child. */
  path: number[];
  text: string;
  /** Its visible lines, one em tall, in stage pixels. */
  rects: Rect[];
  /** The most opaque of its visible text (0 when none of it shows). */
  opacity: number;
  /** Its smallest visible text: drawn size in stage pixels, and the CSS font size. */
  px: number;
  css: number;
  rtl: boolean;
  /** For right-to-left text with Latin letters or digits: where each character was drawn, and which are isolated. */
  pos?: (CharPos | null)[];
  iso?: string;
}
/** An element or template part, for the off-stage check: its box and what it actually draws (ink). */
export interface BoxM { key: string; el?: string; part?: string; type: string; box: Rect; ink: Rect | null; sized: boolean; text: string }
/** A box that holds text, for the overflow check. */
export interface OverM { key: string; el?: string; part?: string; sub?: string; what: string; w: number; h: number; m: OverflowMeasure; scale?: number; box: Rect; text: string }
export interface Snapshot {
  stage: Rect;
  units: UnitM[];
  boxes: BoxM[];
  over: OverM[];
  /** The scene's camera has moved (zoomed or panned): things may leave the frame on purpose. */
  camera: boolean;
}

/**
 * Runs in the page: measures the scene on the stage now. Self-contained (it is sent to the page as source), so it
 * repeats the few regular expressions it needs.
 */
export function collect(o: { bidi: boolean; visible: number }): Snapshot {
  const stage = document.getElementById("p")!.shadowRoot!.querySelector<HTMLElement>(".ls-stage")!;
  const sr = stage.getBoundingClientRect();
  const k = sr.width / (stage.offsetWidth || sr.width) || 1;
  const rectOf = (r: { left: number; top: number; width: number; height: number }): Rect => ({ x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k });
  const em = (r: Rect, px: number): Rect => (px > 0 && px < r.h ? { x: r.x, y: r.y + (r.h - px) / 2, w: r.w, h: px } : r);
  const unionOf = (rs: Rect[]): Rect | null => {
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  };
  const short = (s: string | null | undefined, n = 40): string => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const ARABIC = /[\u{600}-\u{6FF}\u{750}-\u{77F}\u{870}-\u{8FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFC}]/u;
  const CORE = /[A-Za-z0-9\u{C0}-\u{24F}]/u;

  // Opacity and scale, multiplied down from the stage.
  const ops = new Map<Element, number>();
  const opacity = (el: Element | null): number => {
    if (!el || el === stage) return 1;
    let v = ops.get(el);
    if (v === undefined) {
      const cs = getComputedStyle(el);
      v = (cs.visibility === "hidden" || cs.display === "none" ? 0 : Number(cs.opacity)) * opacity(el.parentElement);
      ops.set(el, v);
    }
    return v;
  };
  const scs = new Map<Element, number>();
  const scaleOf = (el: Element | null): number => {
    if (!el || el === stage) return 1;
    let v = scs.get(el);
    if (v === undefined) {
      const t = getComputedStyle(el).transform;
      let s = 1;
      if (t && t !== "none") { const m = new DOMMatrix(t); s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); }
      v = s * scaleOf(el.parentElement);
      scs.set(el, v);
    }
    return v;
  };
  /** A text's drawn size in stage pixels, and its CSS font size. SVG text is scaled by its viewBox and transforms too. */
  const fontPx = (el: Element): [number, number] => {
    const css = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (el instanceof SVGElement) {
      const t = (el.closest("text") ?? el) as SVGGraphicsElement;
      const m = t.getScreenCTM?.();
      if (m) return [(css * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))) / k, css];
    }
    return [css * scaleOf(el), css];
  };
  const pathOf = (el: Element): number[] => {
    const p: number[] = [];
    for (let e: Element | null = el; e && e !== stage && e.parentElement; e = e.parentElement) p.unshift(Array.prototype.indexOf.call(e.parentElement.children, e));
    return p;
  };
  const elOf = (e: Element): string | undefined => (e.closest("[data-el]") as HTMLElement | null)?.dataset.el ?? undefined;
  const partOf = (e: Element): string | undefined => (e.closest("[data-part]") as HTMLElement | null)?.dataset.part ?? undefined;
  const range = document.createRange();
  /** The text nodes under an element; with `blank`, the ones of spaces only too (they hold a text's words apart). */
  const textNodes = (under: Element, blank = false): Text[] => {
    const out: Text[] = [];
    const w = document.createTreeWalker(under, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if ((blank || /\S/.test(n.nodeValue ?? "")) && !n.parentElement?.closest("style")) out.push(n as Text);
    return out;
  };
  const lines = (n: Text): DOMRect[] => {
    range.selectNodeContents(n);
    return [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
  };

  /* Texts. */
  const OWNER = ".la-b, text, .lt td, .lt th, [data-part], [data-el]";
  type Building = UnitM & { nodes: { n: Text; at: number }[]; owner: Element; block: Element | null };
  const units = new Map<Element, Building>();
  const blockOf = (e: Element, owner: Element): Element => {
    for (let x: Element | null = e; x && x !== owner; x = x.parentElement) {
      const d = getComputedStyle(x).display;
      if (!d.startsWith("inline") && d !== "contents") return x;
    }
    return owner;
  };
  const indexIn = (e: Element, sel: string): number => [...(e.closest("[data-el]") ?? stage).querySelectorAll(sel)].indexOf(e);
  const unitFor = (owner: Element): Building => {
    const el = elOf(owner);
    const part = partOf(owner);
    let key: string, group: string, sub: string | undefined, path = pathOf(owner);
    if (owner.matches(".la-b")) {
      sub = `block "${short(owner.querySelector(".la-t")?.textContent ?? owner.textContent, 24)}"`;
      key = group = `el:${el}/block:${indexIn(owner, ".la-b")}`;
    } else if (owner instanceof SVGElement) {
      sub = `label "${short(owner.textContent, 24)}"`;
      key = group = `el:${el}/label:${indexIn(owner, "text")}`;
    } else if (owner.matches(".lt td, .lt th")) {
      const row = (owner.parentElement as HTMLTableRowElement).rowIndex;
      const col = (owner as HTMLTableCellElement).cellIndex;
      sub = row === 0 ? `header ${col + 1}` : `cell ${row},${col + 1}`;
      key = `el:${el}/cell:${row},${col}`;
      group = `el:${el}`;
      path = pathOf(owner.closest("[data-el]") ?? owner);
    } else if (owner.matches("[data-part]")) {
      key = group = `part:${part}`;
    } else if (owner.matches("[data-el]")) {
      key = group = `el:${el}`;
    } else {
      // Template text outside any part (a step's number, a message's time).
      sub = `.${(owner.getAttribute("class") ?? owner.tagName.toLowerCase()).split(" ")[0]}`;
      key = group = `tpl:${path.join(".")}`;
    }
    return {
      key, group, ...(el ? { el } : {}), ...(part ? { part } : {}), ...(sub ? { sub } : {}), path, text: "", rects: [], opacity: 0, px: Infinity, css: 0,
      rtl: getComputedStyle(owner).direction === "rtl", nodes: [], owner, block: null,
    };
  };
  for (const n of textNodes(stage, true)) {
    const parent = n.parentElement!;
    let owner = parent.closest(OWNER);
    if (!owner || !stage.contains(owner)) owner = parent;
    let u = units.get(owner);
    const blank = !/\S/.test(n.nodeValue ?? "");
    if (blank && !u) continue; // spaces only count between a text's words
    if (!u) units.set(owner, (u = unitFor(owner)));
    // A new block inside the text (a block's label and its note) starts a new paragraph: bidi runs end there.
    const block = blockOf(parent, owner);
    if (u.text && block !== u.block) u.text += "\n";
    u.block = block;
    u.nodes.push({ n, at: u.text.length });
    u.text += n.nodeValue ?? "";
    if (blank) continue;
    const op = opacity(parent);
    const rs = lines(n);
    if (op < o.visible || !rs.length) continue;
    const [px, css] = fontPx(parent);
    u.opacity = Math.max(u.opacity, op);
    if (px < u.px) { u.px = px; u.css = css; }
    for (const r of rs) u.rects.push(em(rectOf(r), px));
  }
  // Right to left: where each character of a text with Latin letters or digits was drawn.
  if (o.bidi) {
    for (const u of units.values()) {
      if (!u.rtl || !CORE.test(u.text)) continue;
      const pos: (CharPos | null)[] = new Array(u.text.length).fill(null);
      const iso: string[] = new Array(u.text.length).fill("0");
      for (const { n, at } of u.nodes) {
        let isolated = false;
        for (let e = n.parentElement; e && e !== u.owner; e = e.parentElement) if (e.tagName === "BDI" || e.hasAttribute("dir")) isolated = true;
        const s = n.nodeValue ?? "";
        for (let i = 0; i < s.length; i++) {
          if (isolated) iso[at + i] = "1";
          if (s[i] === "\n" || ARABIC.test(s[i]!)) continue;
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const r = range.getBoundingClientRect();
          if (r.width || r.height) pos[at + i] = { x: (r.left + r.width / 2 - sr.left) / k, y: (r.top + r.height / 2 - sr.top) / k, h: r.height / k };
        }
      }
      u.pos = pos;
      u.iso = iso.join("");
    }
  }

  /* Boxes, and what they draw. */
  const paints = (d: Element): boolean => {
    if (d.tagName === "IMG") return true;
    if (!(d instanceof HTMLElement)) return false;
    const cs = getComputedStyle(d);
    const bg = cs.backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return true;
    if (cs.backgroundImage !== "none") return true;
    return ["top", "right", "bottom", "left"].some((s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 && cs.getPropertyValue(`border-${s}-style`) !== "none");
  };
  const boxes: BoxM[] = [];
  for (const el of stage.querySelectorAll<HTMLElement>("[data-el], [data-part]")) {
    if (el.querySelector("[data-el]")) continue; // a group: its children are checked one by one
    if (opacity(el) < o.visible) continue;
    const inks: Rect[] = [];
    for (const n of textNodes(el)) {
      if (opacity(n.parentElement) < o.visible) continue;
      const [px] = fontPx(n.parentElement!);
      for (const r of lines(n)) inks.push(em(rectOf(r), px));
    }
    for (const d of [el, ...el.querySelectorAll("*")]) {
      if (opacity(d) < o.visible) continue;
      if (d instanceof SVGGeometryElement || d.tagName === "image" || paints(d)) {
        const r = d.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) inks.push(rectOf(r));
      }
    }
    const type = el.dataset.el !== undefined ? ([...el.classList].find((c) => c.startsWith("ls-el-"))?.slice(6) ?? "element") : "part";
    boxes.push({
      key: el.dataset.el !== undefined ? `el:${el.dataset.el}` : `part:${el.dataset.part}`,
      ...(el.dataset.el !== undefined ? { el: el.dataset.el } : { part: el.dataset.part! }),
      type, box: rectOf(el.getBoundingClientRect()), ink: unionOf(inks), sized: type === "text" && !!el.style.width, text: short(el.textContent),
    });
  }

  /* Boxes that hold text. */
  const NONE: Sides = { left: 0, right: 0, top: 0, bottom: 0 };
  /** How far the text's lines reach past the box's padding edge, in the box's own pixels (absolutely placed text, such as a side label, is meant to be outside). */
  const inkSides = (box: HTMLElement): Sides => {
    const r = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const s = scaleOf(box) * k;
    const b = (side: string): number => parseFloat(cs.getPropertyValue(`border-${side}-width`)) * s || 0;
    const pad = { left: r.left + b("left"), right: r.right - b("right"), top: r.top + b("top"), bottom: r.bottom - b("bottom") };
    const out: Sides = { left: 0, right: 0, top: 0, bottom: 0 };
    for (const n of textNodes(box)) {
      let placed = false;
      for (let e = n.parentElement; e && e !== box; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "absolute" || p === "fixed") placed = true; }
      if (placed || opacity(n.parentElement) < o.visible) continue;
      const px = fontPx(n.parentElement!)[0] * k;
      for (const q of lines(n)) {
        const top = q.top + Math.max(0, (q.height - px) / 2);
        const bottom = q.bottom - Math.max(0, (q.height - px) / 2);
        out.left = Math.max(out.left, (pad.left - q.left) / s);
        out.right = Math.max(out.right, (q.right - pad.right) / s);
        out.top = Math.max(out.top, (pad.top - top) / s);
        out.bottom = Math.max(out.bottom, (bottom - pad.bottom) / s);
      }
    }
    return out;
  };
  const measure = (box: HTMLElement): OverflowMeasure => {
    // Absolutely placed children (side labels) count in the scroll size but are meant to be outside: ink only then.
    const abs = [...box.querySelectorAll("*")].some((d) => { const p = getComputedStyle(d).position; return p === "absolute" || p === "fixed"; });
    // Down the page only the lines count: the scroll height includes the font's ascent and descent beyond the line
    // height (Arabic fonts have a lot), so every tight line would look "taller than its box".
    return { clientW: box.clientWidth, clientH: box.clientHeight, scrollW: abs ? box.clientWidth : box.scrollWidth, scrollH: box.clientHeight, ink: inkSides(box) };
  };
  const over: OverM[] = [];
  const add = (box: HTMLElement, what: string, id: { key: string; el?: string; part?: string; sub?: string }, m: OverflowMeasure = measure(box), scale?: number): void => {
    over.push({ ...id, what, w: box.clientWidth, h: box.clientHeight, m, ...(scale !== undefined ? { scale } : {}), box: rectOf(box.getBoundingClientRect()), text: short(box.textContent) });
  };
  const idOf = (e: Element): { key: string; el?: string; part?: string } => {
    const el = elOf(e);
    const part = partOf(e);
    return el !== undefined ? { key: `el:${el}`, el } : { key: `part:${part}`, ...(part !== undefined ? { part } : {}) };
  };
  const PARENTS = ".ls-node, .ls-step, .ls-quiz-opt, .ls-point, .ls-callout, .ls-msg-from, .ls-bubble, .ls-phone";
  for (const box of stage.querySelectorAll<HTMLElement>(".ls-el-text, .ls-el-code pre, [data-part], .la-b, .lt td, .lt th")) {
    if (opacity(box) < o.visible) continue;
    if (box.matches(".ls-el-text")) { if (box.style.width) add(box, "text box", idOf(box)); continue; }
    if (box.matches(".ls-el-code pre")) { add(box, "code card", idOf(box)); continue; }
    if (box.matches("[data-part]")) {
      add(box, "part", idOf(box));
      const p = box.parentElement;
      if (p && p.matches(PARENTS)) add(p, `part's ${(p.getAttribute("class") ?? "").split(" ")[0]?.replace("ls-", "")}`, idOf(box));
      continue;
    }
    if (box.matches(".la-b")) {
      const label = short(box.querySelector(".la-t")?.textContent ?? box.textContent, 24);
      add(box, "block", { ...idOf(box), sub: `block "${label}"` });
      continue;
    }
    const row = (box.parentElement as HTMLTableRowElement).rowIndex;
    const col = (box as HTMLTableCellElement).cellIndex;
    add(box, "cell", { ...idOf(box), sub: row === 0 ? `header ${col + 1}` : `cell ${row},${col + 1}` });
  }
  // A table taller or wider than its element; an equation shrunk to fit its box, or still poking out of it.
  for (const t of stage.querySelectorAll<HTMLElement>(".lt")) {
    const el = t.closest<HTMLElement>("[data-el]");
    if (!el || opacity(t) < o.visible) continue;
    add(el, "table", idOf(el), { clientW: el.clientWidth, clientH: el.clientHeight || t.offsetHeight, scrollW: t.offsetWidth, scrollH: el.clientHeight ? t.offsetHeight : 0, ink: NONE });
  }
  for (const b of stage.querySelectorAll<HTMLElement>(".lm-box")) {
    const eq = b.querySelector<HTMLElement>(".lm");
    if (!eq || opacity(b) < o.visible) continue;
    const t = getComputedStyle(eq).transform;
    const m = t && t !== "none" ? new DOMMatrix(t) : null;
    const scale = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1;
    const br = b.getBoundingClientRect();
    const er = eq.getBoundingClientRect();
    const s = scaleOf(b) * k;
    const ink: Sides = { left: Math.max(0, br.left - er.left) / s, right: Math.max(0, er.right - br.right) / s, top: Math.max(0, br.top - er.top) / s, bottom: Math.max(0, er.bottom - br.bottom) / s };
    add(b, "equation", idOf(b), { clientW: b.clientWidth, clientH: b.clientHeight, scrollW: b.clientWidth, scrollH: b.clientHeight, ink }, scale);
  }

  return {
    stage: { x: 0, y: 0, w: sr.width / k, h: sr.height / k },
    units: [...units.values()].map(({ nodes: _n, owner: _o, block: _b, ...u }) => ({ ...u, px: Number.isFinite(u.px) ? u.px : 0 })),
    camera: [...stage.querySelectorAll(".ls-shot")].some((e) => getComputedStyle(e).transform !== "none"),
    boxes,
    over,
  };
}

/* ---------- what the measurements mean ---------- */

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
/** A name and its text, unless the name already says it (a block or a label is named by its text). */
const said = (x: { el?: string; part?: string; sub?: string }, text: string): string => {
  const name = nameOf(x);
  return text && !name.includes(text) ? `${name} "${text}"` : name;
};
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** The findings in one moment of a scene. Fonts and bidi are judged as the scene ends, when everything has arrived. */
export function analyse(snap: Snapshot, at: number, stageW: number, final: boolean): Finding[] {
  const out: Finding[] = [];
  const id = (x: { el?: string; part?: string; sub?: string }): { el?: string; part?: string; sub?: string } =>
    ({ ...(x.el !== undefined ? { el: x.el } : {}), ...(x.part !== undefined ? { part: x.part } : {}), ...(x.sub !== undefined ? { sub: x.sub } : {}) });

  // 1. Off the stage: what an element draws (its letters, lines and fills); for a text box with a width, its box too.
  const decorative = new Set(["shape", "line", "path"]);
  for (const b of snap.boxes) {
    const ink = b.ink && beyond(b.ink, snap.stage);
    if (ink) {
      // A shape bleeding off the edge, or anything the camera has zoomed or panned past, may be meant: a warning.
      out.push({
        level: decorative.has(b.type) || snap.camera ? "warn" : "error", kind: "offstage", ...id(b), at: [at], amount: Math.max(ink.left, ink.right, ink.top, ink.bottom),
        message: `${said(b, b.text)} (${b.type}): ${describeSides(ink)}${snap.camera ? " (the camera has moved)" : ""}`, text: b.text, boxes: [round(b.ink!)],
      });
      continue;
    }
    const box = b.sized ? beyond(b.box, snap.stage) : null;
    if (box) {
      out.push({
        level: "warn", kind: "offstage", ...id(b), at: [at], amount: Math.max(box.left, box.right, box.top, box.bottom),
        message: `${said(b, b.text)}: its text fits, but its box (${Math.round(b.box.w)} px wide) goes ${describeSides(box)}; longer text would be cut`,
        text: b.text, boxes: [round(b.box)],
      });
    }
  }

  // 2. Overflow: text bigger than its box; an equation shrunk too far to fit.
  for (const o of snap.over) {
    if (o.scale !== undefined && o.scale < LIMITS.mathScale) {
      out.push({
        level: "error", kind: "overflow", ...id(o), at: [at], amount: 1 - o.scale, text: o.text, boxes: [round(o.box)],
        message: `${nameOf(o)} (equation): shrunk to ${o.scale.toFixed(2)} of its size to fit its box (${o.w}×${o.h}); give it more room or split it`,
      });
    }
    const { dx, dy } = overflowOf(o.m);
    if (!dx && !dy) continue;
    const how = [dx ? `${dx} px wider` : "", dy ? `${dy} px taller` : ""].filter(Boolean).join(" and ");
    out.push({
      level: "error", kind: "overflow", ...id(o), at: [at], amount: Math.max(dx, dy), text: o.text, boxes: [round(o.box)],
      message: `${said(o, o.text)} (${o.what}): the text is ${how} than its box (${o.w}×${o.h})`,
    });
  }

  // 3. Overlap: texts sharing more than 15% of the smaller one's area (cells count as their table).
  const groups = new Map<string, UnitM>();
  for (const u of snap.units) {
    if (u.opacity < LIMITS.visible || !u.rects.length) continue;
    const g = groups.get(u.group);
    if (!g) {
      groups.set(u.group, { ...u, key: u.group, ...(u.group !== u.key ? { sub: undefined } : {}), rects: [...u.rects] });
    } else {
      g.rects.push(...u.rects);
      g.opacity = Math.max(g.opacity, u.opacity);
      g.text = `${g.text} ${u.text}`;
    }
  }
  const list = [...groups.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (nested(a.path, b.path)) continue;
      const share = overlapShare(a.rects, b.rects);
      if (share <= LIMITS.overlap) continue;
      const solid = Math.min(a.opacity, b.opacity) >= LIMITS.opaque;
      const ta = a.text.replace(/\s+/g, " ").trim().slice(0, 30);
      const tb = b.text.replace(/\s+/g, " ").trim().slice(0, 30);
      out.push({
        level: solid ? "error" : "warn", kind: "overlap", ...id(a), other: id(b), at: [at], amount: share,
        message: `${said(a, ta)} and ${said(b, tb)} overlap: ${pct(share)} of the smaller one${solid ? "" : " (one is fading in or out)"}`,
        text: ta, boxes: [round(union(a.rects)!), round(union(b.rects)!)],
      });
    }
  }

  if (!final) return out;

  // 4. Too small for a phone: the smallest few texts of the scene.
  const texts = snap.units.filter((u) => u.opacity >= LIMITS.visible && u.px > 0);
  const { worst, more } = smallest(texts, stageW);
  const font = fontFinding(worst.map((u) => ({ ...id(u), text: u.text.replace(/\s+/g, " ").trim().slice(0, 30), css: u.css, px: u.px, phone: u.phone, level: u.level })), more, at);
  if (font) out.push({ ...font, boxes: worst.map((u) => round(union(u.rects)!)) });

  // 5. Bidi: left-to-right runs that don't read left to right in right-to-left text.
  for (const u of snap.units) {
    if (!u.pos || !u.iso) continue;
    for (const p of bidiProblems(u.text, u.pos, u.iso)) {
      out.push({
        level: p.level, kind: "bidi", ...id(u), at: [at], amount: 1, text: p.run,
        message: `${nameOf(u)}: ${bidiAdvice(p)}`, ...(u.rects.length ? { boxes: [round(union(u.rects)!)] } : {}),
      });
    }
  }
  return out;
}

/* ---------- lessons ---------- */

interface Loaded { id: string; dir: string; lesson: Lesson; timings: Record<string, TimingFile> }

function isLesson(dir: string): boolean {
  return existsSync(join(dir, "manifest.json")) && existsSync(join(dir, "scenes.json"));
}

/** Lesson folders for the arguments: Darsi ids, example ids, lesson folders, folders of lessons; ids may use *. */
export function resolveInputs(args: string[], root = ROOT): string[] {
  const lessonsDir = join(root, "content", "darsi", "lessons");
  const examplesDir = join(root, "examples");
  const out: string[] = [];
  for (const a of args) {
    if (/[*?]/.test(a)) {
      const re = new RegExp(`^${a.toLowerCase().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
      const found = [lessonsDir, examplesDir].flatMap((d) => (existsSync(d) ? readdirSync(d).filter((n) => re.test(n.toLowerCase())).map((n) => join(d, n)) : [])).filter(isLesson);
      if (!found.length) throw new Error(`No lessons match ${a}`);
      out.push(...found);
      continue;
    }
    const direct = resolve(a);
    if (isLesson(direct)) { out.push(direct); continue; }
    if (existsSync(direct) && statSync(direct).isDirectory()) {
      const kids = readdirSync(direct).map((n) => join(direct, n)).filter(isLesson);
      if (kids.length) { out.push(...kids); continue; }
    }
    const named = [join(lessonsDir, a.toLowerCase()), join(examplesDir, a)].find(isLesson);
    if (!named) throw new Error(`No lesson (manifest.json and scenes.json) at ${a}`);
    out.push(named);
  }
  return [...new Set(out)];
}

function load(dir: string): Loaded {
  const lesson: Lesson = { manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), scenes: JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) };
  const files: Record<string, TimingFile> = {};
  for (const l of lesson.manifest.languages) {
    const p = l.timing ? join(dir, l.timing) : "";
    if (p && existsSync(p)) files[l.code] = JSON.parse(readFileSync(p, "utf8"));
  }
  // Measured timings only while they still fit the script; otherwise estimated, as the studio does.
  return { id: lesson.manifest.id, dir, lesson, timings: currentTimings(lesson.scenes.scenes, files) };
}

/** The three Noto files (as on Android phones and in the online MP4 export) in a folder of their own. */
function notoFonts(): string {
  const dir = join(ROOT, "out", "layout-check", "fonts");
  mkdirSync(dir, { recursive: true });
  const from: Record<string, string> = {
    [FONT_FILES[0]!]: join(ROOT, "node_modules", "@fontsource-variable", "noto-sans", "files", FONT_FILES[0]!),
    [FONT_FILES[1]!]: join(ROOT, "node_modules", "@fontsource-variable", "noto-sans", "files", FONT_FILES[1]!),
    [FONT_FILES[2]!]: join(ROOT, "node_modules", "@fontsource-variable", "noto-sans-arabic", "files", FONT_FILES[2]!),
  };
  for (const [name, src] of Object.entries(from)) if (!existsSync(join(dir, name))) copyFileSync(src, join(dir, name));
  return dir;
}

export interface CheckOptions {
  /** Moments in each scene, 0 (start) to 1 (end); the last one also judges fonts and bidi. */
  at: number[];
  /** A stage shape other than the lesson's own. */
  orient?: Orient;
  /** A folder with the Noto fonts (FONT_FILES); without it, the machine's own fonts. */
  fontDir?: string;
  /** Where to save pictures of the moments with errors. */
  shots?: string;
  /** Kinds of finding to leave out. */
  skip?: Kind[];
}

/** Checks one language of a lesson, scene by scene. */
export async function checkLanguage(browser: Browser, l: Loaded, pkg: LessonPackage, lang: string, o: CheckOptions): Promise<LessonResult> {
  const track = pkg.manifest.languages.find((x) => x.code === lang)!;
  const orient = o.orient ?? pkg.manifest.stage ?? "landscape";
  const { W, H } = STAGES[orient];
  const base: LessonResult = { id: l.id, lang, dir: track.dir, stage: { orient, W, H }, timing: pkg.timing[lang]!.source, scenes: [], errors: 0, warnings: 0 };
  // The stage only draws: no narration to load, and the clock goes where seek() puts it.
  const silent: LessonPackage = { ...pkg, manifest: { ...pkg.manifest, languages: pkg.manifest.languages.map(({ audio: _a, audioFallback: _f, ...x }) => x) } };
  const stage = await openStage(browser, silent, { lang, width: W, orient, dir: l.dir, ...(o.fontDir ? { fontDir: o.fontDir } : {}) });
  try {
    const timing = pkg.timing[lang]!;
    const last = Math.max(...o.at);
    for (let i = 0; i < pkg.scenes.scenes.length; i++) {
      const scene = pkg.scenes.scenes[i]!;
      const st = timing.scenes[i]!;
      const found: Finding[] = [];
      for (const at of o.at) {
        await stage.seek(st.start + (st.end - st.start) * at);
        const final = at === last;
        const snap = await stage.page.evaluate(collect, { bidi: final, visible: LIMITS.visible });
        const fs = analyse(snap, at, W, final).filter((f) => !o.skip?.includes(f.kind));
        found.push(...fs);
        if (o.shots && fs.some((f) => f.level === "error")) await shoot(stage, o.shots, `${l.id}-${lang}-${scene.id}-${at}`, fs);
      }
      base.scenes.push({ id: scene.id, index: i, template: scene.template, findings: merge(found) });
    }
  } finally {
    await stage.close();
  }
  onceForTemplates(base.scenes);
  return { ...base, ...count(base.scenes) };
}

/** A picture of the moment with the boxes in question outlined: red for errors, orange for warnings. */
async function shoot(stage: Awaited<ReturnType<typeof openStage>>, dir: string, name: string, fs: Finding[]): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const marks = fs.flatMap((f) => (f.boxes ?? []).map((b) => ({ ...b, c: f.level === "error" ? "#e00" : "#f90" })));
  await stage.page.evaluate((marks) => {
    const layer = document.createElement("div");
    layer.id = "lc-marks";
    layer.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:9";
    for (const m of marks) {
      const d = document.createElement("div");
      d.style.cssText = `position:absolute;left:${m.x - 2}px;top:${m.y - 2}px;width:${m.w + 4}px;height:${m.h + 4}px;outline:3px solid ${m.c}`;
      layer.append(d);
    }
    document.body.append(layer);
  }, marks);
  writeFileSync(join(dir, `${name}.png`), await stage.shot("png"));
  await stage.page.evaluate(() => document.getElementById("lc-marks")?.remove());
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const has = (name: string): boolean => {
    const i = args.indexOf(name);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };
  const langs = flag("--lang")?.split(",");
  const at = (flag("--at") ?? "0.5,0.97").split(",").map(Number);
  const orient = flag("--orient") as Orient | undefined;
  const shots = flag("--shots");
  const json = has("--json");
  const systemFonts = has("--system-fonts");
  const skip = (flag("--skip")?.split(",") ?? []) as Kind[];
  const kinds: Kind[] = ["offstage", "overflow", "overlap", "font", "bidi"];
  if (!args.length || at.some((x) => !(x >= 0 && x <= 1)) || (orient && !STAGES[orient]) || skip.some((k) => !kinds.includes(k))) {
    console.error("Usage: npm run layout-check -- <Darsi id | example id | lesson folder | folder of lessons>... [--lang en,ar-EG] [--json] " +
      "[--at 0.5,0.97] [--orient landscape|portrait|square] [--skip font,bidi,overlap,overflow,offstage] [--system-fonts] [--shots <folder>]");
    process.exit(2);
  }
  const o: CheckOptions = {
    at, ...(orient ? { orient } : {}), ...(systemFonts ? {} : { fontDir: notoFonts() }), ...(shots ? { shots: resolve(shots) } : {}), ...(skip.length ? { skip } : {}),
  };
  const dirs = resolveInputs(args);
  const results: LessonResult[] = [];
  const browser = await launch();
  try {
    for (const dir of dirs) {
      let l: Loaded;
      try {
        l = load(dir);
      } catch (e) {
        results.push({ id: dir, lang: "", dir: "ltr", stage: { orient: "", W: 0, H: 0 }, timing: "", scenes: [], errors: 1, warnings: 0, failed: String((e as Error).message ?? e) });
        continue;
      }
      const pkg = toPackage(l.lesson, l.timings);
      // --lang names languages to check where a lesson has them ("ar,ar-EG" covers the examples and Darsi).
      const have = l.lesson.manifest.languages.map((x) => x.code);
      const these = langs ? langs.filter((x) => have.includes(x)) : have;
      if (!these.length) {
        results.push({ id: l.id, lang: langs!.join(","), dir: "ltr", stage: { orient: "", W: 0, H: 0 }, timing: "", scenes: [], errors: 1, warnings: 0, failed: `it has none of these languages (it has ${have.join(", ")})` });
        if (!json) console.log(`${formatLesson(results[results.length - 1]!)}\n`);
      }
      for (const lang of these) {
        try {
          results.push(await checkLanguage(browser, l, pkg, lang, o));
        } catch (e) {
          results.push({ id: l.id, lang, dir: "ltr", stage: { orient: "", W: 0, H: 0 }, timing: "", scenes: [], errors: 1, warnings: 0, failed: String((e as Error).message ?? e) });
        }
        if (!json) console.log(`${formatLesson(results[results.length - 1]!)}\n`);
      }
    }
  } finally {
    await browser.close();
  }
  if (json) console.log(JSON.stringify({ limits: LIMITS, lessons: results, totals: totalsOf(results) }, null, 1));
  else console.log(formatTotals(results));
  process.exitCode = results.some((r) => r.errors > 0 || r.failed) ? 1 : 0;
}

function totalsOf(results: LessonResult[]): { errors: number; warnings: number } {
  return results.reduce((n, r) => ({ errors: n.errors + r.errors, warnings: n.warnings + r.warnings }), { errors: 0, warnings: 0 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error && /^No lesson/.test(e.message) ? e.message : e);
    process.exit(1);
  });
}
