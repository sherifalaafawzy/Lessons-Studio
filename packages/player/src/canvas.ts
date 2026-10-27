import type { AnimProp, Ease, Element, SceneTiming, Tone, Track } from "@lessonstudio/spec";
import { resolveWhen } from "@lessonstudio/spec";
import { h, svg, units } from "./dom.ts";
import { icon } from "./icons.ts";
import { clamp01, fix, pulseScale, type CueState } from "./motion.ts";
import type { Ctx } from "./templates/types.ts";

/* ---------- keyframes ---------- */

/** Easing curves, each mapping 0 → 1 onto 0 → 1 ("back" overshoots a little). */
export function easeOf(e: Ease | undefined, p: number): number {
  switch (e) {
    case "linear": return p;
    case "in": return p * p * p;
    case "out": return 1 - (1 - p) ** 3;
    case "back": { const c = 1.70158; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; }
    case "step": return p < 1 ? 0 : 1;
    default: return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  }
}

/** A track with its keyframe times resolved for one language, sorted by time. */
export interface Compiled {
  prop: AnimProp;
  t: number[];
  v: number[];
  e: (Ease | undefined)[];
}

/** Resolves keyframe times (numbers or spoken words) against a scene's local word timings. */
export function compileTracks(tracks: Track[] | undefined, timing: SceneTiming, lang: string): Compiled[] {
  return (tracks ?? []).map((tr) => {
    const keys = tr.keys
      .map((k, i) => ({ at: resolveWhen(k.at, timing, lang).at, v: k.value, e: k.ease, i }))
      .sort((a, b) => a.at - b.at || a.i - b.i);
    return { prop: tr.prop, t: keys.map((k) => k.at), v: keys.map((k) => k.v), e: keys.map((k) => k.e) };
  });
}

/**
 * A track's value at local time lt: held before the first keyframe and after the last, eased in between.
 * With `still` (tiers without motion) values jump at each keyframe instead of moving.
 */
export function valueAt(c: Compiled, lt: number, still = false): number {
  const n = c.t.length;
  if (!n) return 0;
  if (lt <= c.t[0]!) return c.v[0]!;
  if (lt >= c.t[n - 1]!) return c.v[n - 1]!;
  let i = 1;
  while (c.t[i]! < lt) i++;
  if (still) return c.v[i - 1]!;
  const span = c.t[i]! - c.t[i - 1]!;
  const p = span > 0 ? easeOf(c.e[i], (lt - c.t[i - 1]!) / span) : 1;
  return c.v[i - 1]! + (c.v[i]! - c.v[i - 1]!) * p;
}

const toneVar = (t: Tone | undefined, fallback: string): string => (t ? `var(--ls-${t === "surface" ? "card" : t})` : fallback);

/* ---------- elements ---------- */

export interface ElementBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Drawn {
  id: string;
  el: Element;
  box: HTMLElement;
  tracks: Compiled[];
  /** Sets what this element draws at a moment (stroke drawn, text revealed); `reveal` and `draw` are 0–1. */
  paint(reveal: number, draw: number): void;
  kids: Drawn[];
}

export interface Layer {
  root: HTMLElement;
  update(lt: number, cs: CueState): void;
}

const LINE_PAD = 24;

/** The free-element layer of a scene: canvas content or overlays, drawn on the design stage and fitted to the player's stage. */
export function mountLayer(elements: Element[], ctx: Ctx): Layer {
  const { W, H } = ctx.design;
  const mirror = ctx.mirror;
  const timing: SceneTiming = { id: "", start: 0, end: ctx.dur, sentences: [], words: ctx.words };
  const still = ctx.tier !== "full";
  const rtl = ctx.dir === "rtl";

  const lengthOf = (pts: number): string => fix(pts, 1);

  function draw(el: Element): Drawn {
    const w = el.w;
    const hgt = el.h;
    const box = h("div", { className: `ls-el ls-el-${el.type}`, "data-el": el.id });
    const pos = (x: number, y: number, bw?: number, bh?: number): void => {
      // Mirrored elements keep their distance from the right edge instead of the left.
      box.style.cssText += `;${mirror && !el.fixed ? "right" : "left"}:${fix(x, 1)}px;top:${fix(y, 1)}px` +
        (bw !== undefined ? `;width:${fix(bw, 1)}px` : "") + (bh !== undefined ? `;height:${fix(bh, 1)}px` : "");
    };
    let paint: Drawn["paint"] = () => {};
    const kids: Drawn[] = [];
    box.style.color = toneVar(el.tone, el.type === "icon" ? "var(--ls-accent)" : "var(--ls-fg)");

    switch (el.type) {
      case "text": {
        pos(el.x, el.y, w, hgt);
        box.style.fontSize = `${el.size ?? 40}px`;
        box.style.fontWeight = String(el.weight ?? 700);
        box.style.textAlign = el.align ?? "start";
        if (w === undefined) box.style.whiteSpace = "nowrap";
        const words: HTMLElement[] = [];
        for (const u of units(ctx.t(el.text), rtl)) {
          const only = u[0];
          if (u.length === 1 && only && only.nodeType === 3 && !only.textContent?.trim()) { box.append(only); continue; }
          const s = h("span", null, ...u);
          words.push(s);
          box.append(s);
        }
        paint = (reveal) => {
          const shown = Math.ceil(reveal * words.length - 1e-6);
          words.forEach((s, i) => ctx.wr.style(s, "opacity", i < shown ? "1" : "0"));
        };
        break;
      }
      case "shape": {
        pos(el.x, el.y, w, hgt);
        const sw = el.strokeWidth ?? (el.stroke ? 4 : 0);
        const W2 = w ?? 0;
        const H2 = hgt ?? 0;
        const r = el.shape === "pill" ? H2 / 2 : el.radius ?? 0;
        const node = el.shape === "ellipse"
          ? svg("ellipse", { cx: W2 / 2, cy: H2 / 2, rx: Math.max(0, W2 / 2 - sw / 2), ry: Math.max(0, H2 / 2 - sw / 2) })
          : svg("rect", { x: sw / 2, y: sw / 2, width: Math.max(0, W2 - sw), height: Math.max(0, H2 - sw), rx: r, ry: r });
        node.setAttribute("fill", el.fill ? toneVar(el.fill, "none") : el.stroke ? "none" : "var(--ls-card)");
        if (sw) { node.setAttribute("stroke", toneVar(el.stroke, "currentColor")); node.setAttribute("stroke-width", String(sw)); }
        const a = W2 / 2;
        const b = H2 / 2;
        const len = el.shape === "ellipse"
          ? Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
          : 2 * (W2 + H2) - (8 - 2 * Math.PI) * Math.min(r, W2 / 2, H2 / 2);
        node.setAttribute("stroke-dasharray", lengthOf(len));
        box.append(svg("svg", { width: W2, height: H2, viewBox: `0 0 ${W2} ${H2}`, className: "ls-el-svg" }, node));
        paint = (_r, d) => ctx.wr.style(node, "stroke-dashoffset", fix(len * (1 - d), 1));
        break;
      }
      case "line": {
        const x1 = el.x;
        const x2 = el.x2;
        const minX = Math.min(x1, x2) - LINE_PAD;
        const minY = Math.min(el.y, el.y2) - LINE_PAD;
        const bw = Math.abs(x2 - x1) + 2 * LINE_PAD;
        const bh = Math.abs(el.y2 - el.y) + 2 * LINE_PAD;
        // A mirrored line is placed by its box and drawn flipped inside it.
        const lx1 = x1 - minX;
        const lx2 = x2 - minX;
        const ly1 = el.y - minY;
        const ly2 = el.y2 - minY;
        // Mirrored, the box keeps its distance from the right edge and the line is flipped inside it.
        pos(minX, minY, bw, bh);
        const sw = el.strokeWidth ?? 5;
        const len = Math.hypot(lx2 - lx1, ly2 - ly1);
        const line = svg("line", { x1: lx1, y1: ly1, x2: lx2, y2: ly2, stroke: "currentColor", "stroke-width": sw, "stroke-linecap": "round" });
        if (el.dash) line.setAttribute("stroke-dasharray", `${sw * 2} ${sw * 2}`);
        else line.setAttribute("stroke-dasharray", lengthOf(len));
        const g = svg("g", mirror && !el.fixed ? { transform: `translate(${bw} 0) scale(-1 1)` } : null, line);
        const heads: SVGElement[] = [];
        const head = (fx: number, fy: number, tx: number, ty: number): SVGElement => {
          const ang = Math.atan2(ty - fy, tx - fx);
          const s = 10 + sw * 2;
          const p = [
            [tx, ty],
            [tx - s * Math.cos(ang - 0.45), ty - s * Math.sin(ang - 0.45)],
            [tx - s * Math.cos(ang + 0.45), ty - s * Math.sin(ang + 0.45)],
          ].map((q) => q.map((n) => fix(n!, 1)).join(",")).join(" ");
          const poly = svg("polygon", { points: p, fill: "currentColor" });
          heads.push(poly);
          return poly;
        };
        if (el.arrow === "end" || el.arrow === "both") g.append(head(lx1, ly1, lx2, ly2));
        if (el.arrow === "both") g.append(head(lx2, ly2, lx1, ly1));
        box.append(svg("svg", { width: bw, height: bh, viewBox: `0 0 ${bw} ${bh}`, className: "ls-el-svg" }, g));
        paint = (_r, d) => {
          if (!el.dash) ctx.wr.style(line, "stroke-dashoffset", fix(len * (1 - d), 1));
          for (const hd of heads) ctx.wr.style(hd, "opacity", d >= 0.98 ? "1" : "0");
        };
        break;
      }
      case "path": {
        pos(el.x, el.y, w, hgt);
        const p = svg("path", {
          d: el.d, pathLength: 1, "stroke-dasharray": 1, stroke: "currentColor", "stroke-width": el.strokeWidth ?? 5,
          "stroke-linecap": "round", "stroke-linejoin": "round", fill: el.fill ? toneVar(el.fill, "none") : "none",
        });
        const g = svg("g", mirror && !el.fixed ? { transform: `translate(${w ?? 0} 0) scale(-1 1)` } : null, p);
        box.append(svg("svg", { width: w ?? 0, height: hgt ?? 0, viewBox: `0 0 ${w ?? 0} ${hgt ?? 0}`, className: "ls-el-svg" }, g));
        paint = (_r, d) => ctx.wr.style(p, "stroke-dashoffset", fix(1 - d, 4));
        break;
      }
      case "icon": {
        const size = Math.min(w ?? 64, hgt ?? w ?? 64);
        pos(el.x, el.y, w ?? size, hgt ?? size);
        box.append(icon(el.icon, size));
        break;
      }
      case "image": {
        pos(el.x, el.y, w, hgt);
        // Lower tiers and small screens get the small copy.
        const src = el.small && (ctx.tier !== "full" || ctx.scale < 0.6) ? el.small : el.src;
        const img = h("img", { src: ctx.url(src), alt: ctx.t(el.alt), draggable: "false", decoding: "async" });
        img.style.objectFit = el.fit ?? "cover";
        box.append(img);
        break;
      }
      case "code": {
        pos(el.x, el.y, w, hgt);
        box.setAttribute("dir", "ltr");
        box.style.fontSize = `${el.size ?? 28}px`;
        const lines = el.code.split("\n");
        const total = lines.reduce((a, l) => a + l.length, 0) || 1;
        const rows = lines.map((l, i) => h("span", { className: (el.highlight ?? []).includes(i + 1) ? "ls-code-line is-mark" : "ls-code-line" }, l || " "));
        box.append(h("pre", null, ...rows));
        let shownBefore = -1;
        paint = (reveal) => {
          // Typed out letter by letter; rewritten only when the count changes.
          const shown = Math.round(reveal * total);
          if (shown === shownBefore) return;
          shownBefore = shown;
          let left = shown;
          rows.forEach((row, i) => {
            const l = lines[i]!;
            const n = Math.max(0, Math.min(l.length, left));
            left -= l.length;
            const want = n >= l.length ? l || " " : l.slice(0, n);
            if (row.textContent !== want) row.textContent = want;
            ctx.wr.style(row, "opacity", n > 0 || (reveal >= 1 && !l) ? "1" : "0");
          });
        };
        break;
      }
      case "chart": {
        pos(el.x, el.y, w, hgt);
        box.setAttribute("dir", "ltr");
        const W2 = w ?? 400;
        const H2 = hgt ?? 240;
        const labels = el.labels ?? [];
        const lh = labels.length ? 40 : 0;
        const plotH = H2 - lh - 8;
        const max = el.max ?? Math.max(1e-9, ...el.data);
        const n = el.data.length;
        const s = svg("svg", { width: W2, height: H2, viewBox: `0 0 ${W2} ${H2}`, className: "ls-el-svg" });
        s.append(svg("line", { x1: 0, y1: plotH, x2: W2, y2: plotH, stroke: "var(--ls-muted)", "stroke-width": 3 }));
        const step = W2 / n;
        labels.forEach((l, i) => {
          const tx = svg("text", { x: step * i + step / 2, y: H2 - 8, "text-anchor": "middle", fill: "var(--ls-muted)", "font-size": 24 });
          tx.textContent = ctx.t(l);
          s.append(tx);
        });
        if (el.kind === "bar") {
          const bars = el.data.map((v, i) => {
            const bh = (Math.max(0, v) / max) * plotH;
            const r = svg("rect", { x: step * i + step * 0.18, y: plotH - bh, width: step * 0.64, height: bh, fill: "currentColor", rx: 6 });
            r.style.transformOrigin = `0 ${plotH}px`;
            s.append(r);
            return r;
          });
          paint = (reveal) => bars.forEach((b, i) => {
            ctx.wr.style(b, "transform", `scaleY(${fix(clamp01(reveal * n - i * 0.6))})`);
          });
        } else {
          const pts = el.data.map((v, i) => `${fix(step * i + step / 2, 1)},${fix(plotH - (v / max) * plotH, 1)}`).join(" ");
          const pl = svg("polyline", { points: pts, fill: "none", stroke: "currentColor", "stroke-width": 6, "stroke-linejoin": "round", "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1 });
          s.append(pl);
          paint = (reveal) => ctx.wr.style(pl, "stroke-dashoffset", fix(1 - reveal, 4));
        }
        box.append(s);
        break;
      }
      case "group": {
        pos(el.x, el.y, w, hgt);
        for (const c of el.children) {
          const d = draw(c);
          kids.push(d);
          box.append(d.box);
        }
        break;
      }
    }
    return { id: el.id, el, box, tracks: compileTracks(el.anim, timing, ctx.lang), paint, kids };
  }

  const drawn = elements.map(draw);
  const plane = h("div", { className: "ls-layer" }, ...drawn.map((d) => d.box));
  plane.style.width = `${W}px`;
  plane.style.height = `${H}px`;
  // Fit the design stage into the player's stage (contain), centred.
  const k = Math.min(ctx.W / W, ctx.H / H);
  if (k !== 1 || ctx.W !== W || ctx.H !== H) {
    plane.style.transform = `translate(${fix((ctx.W - W * k) / 2, 1)}px,${fix((ctx.H - H * k) / 2, 1)}px) scale(${fix(k, 4)})`;
  }

  function apply(d: Drawn, lt: number, cs: CueState): void {
    const el = d.el;
    const get = (prop: AnimProp, base: number): number => {
      const c = d.tracks.find((x) => x.prop === prop);
      return c ? valueAt(c, lt, still) : base;
    };
    const flip = mirror && !el.fixed ? -1 : 1;
    const dx = (get("x", el.x) - el.x) * flip;
    const dy = get("y", el.y) - el.y;
    const rot = get("rotate", el.rotate ?? 0) * flip;
    const sc = get("scale", el.scale ?? 1) * pulseScale(cs.pulse.get(el.id));
    // A reveal cue brings an element without its own opacity track in at the cue's word.
    const cued = cs.at.get(el.id);
    const baseOpacity = el.opacity ?? 1;
    let op = get("opacity", baseOpacity);
    if (cued !== undefined && !d.tracks.some((x) => x.prop === "opacity")) {
      op = still ? (lt >= cued ? baseOpacity : 0) : baseOpacity * clamp01((lt - cued) / 0.35);
    }
    const parts: string[] = [];
    if (dx || dy) parts.push(`translate(${fix(dx, 1)}px,${fix(dy, 1)}px)`);
    if (rot) parts.push(`rotate(${fix(rot, 2)}deg)`);
    if (sc !== 1) parts.push(`scale(${fix(sc)})`);
    ctx.wr.style(d.box, "transform", parts.length ? parts.join(" ") : "none");
    ctx.wr.style(d.box, "opacity", fix(clamp01(op)));
    ctx.wr.cls(d.box, "is-hi", cs.hi.has(el.id));
    d.paint(clamp01(get("reveal", 1)), clamp01(get("draw", 1)));
    for (const c of d.kids) apply(c, lt, cs);
  }

  return {
    root: plane,
    update(lt, cs) {
      for (const d of drawn) apply(d, lt, cs);
    },
  };
}

/** Pans and zooms a scene: the camera looks at (x, y) on the stage, at a zoom of `scale`. */
export function cameraTransform(tracks: Compiled[], lt: number, ctx: Ctx): string {
  if (!tracks.length) return "none";
  const still = ctx.tier !== "full";
  const at = (p: AnimProp, base: number): number => {
    const c = tracks.find((x) => x.prop === p);
    return c ? valueAt(c, lt, still) : base;
  };
  const s = Math.max(0.1, at("scale", 1));
  let cx = at("x", ctx.W / 2);
  if (ctx.mirror) cx = ctx.W - cx;
  const cy = at("y", ctx.H / 2);
  if (s === 1 && cx === ctx.W / 2 && cy === ctx.H / 2) return "none";
  return `translate(${fix(ctx.W / 2 - cx * s, 1)}px,${fix(ctx.H / 2 - cy * s, 1)}px) scale(${fix(s, 4)})`;
}
