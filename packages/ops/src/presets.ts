import type { AnimProp, Element, Key, When } from "@lessonstudio/spec";
import { packOf } from "@lessonstudio/spec";
import type { Preset } from "./types.ts";

export const PRESETS: Record<Preset, { dur: number; about: string }> = {
  "fade-in": { dur: 0.5, about: "appears" },
  "fade-out": { dur: 0.5, about: "disappears" },
  pop: { dur: 0.45, about: "pops in from nothing, with a small overshoot" },
  rise: { dur: 0.5, about: "rises 40 px into place while appearing" },
  "slide-in": { dur: 0.6, about: "slides 120 px in from the start side while appearing" },
  grow: { dur: 0.5, about: "grows from 60% while appearing" },
  pulse: { dur: 0.6, about: "swells briefly to draw the eye" },
  draw: { dur: 0.9, about: "its stroke is drawn (lines, paths, shapes)" },
  type: { dur: 1.5, about: "text is revealed word by word, code letter by letter, a chart grows; an equation, plot, network, diagram or table comes in part by part" },
  "move-to": { dur: 1, about: "moves from where it is to `to` {x, y}" },
  train: { dur: 4, about: "a plot or network plays its frames, first to last (training rounds)" },
  forward: { dur: 1.6, about: "data flows through a network or diagram, input to output" },
  backward: { dur: 1.6, about: "the error flows back through a network or diagram, output to input" },
};

/** A time shifted by `o` seconds; word anchors keep their word and change their offset. */
export function shift(at: When, o: number): When {
  const r = (x: number): number => Math.round(x * 1000) / 1000;
  if (typeof at === "number") return r(Math.max(0, at + o));
  return { ...at, offset: r((at.offset ?? 0) + o) };
}

/** The keyframes a preset adds, per property. */
export function presetKeys(el: Element, preset: Preset, at: When, dur?: number, to?: { x?: number; y?: number }): { prop: AnimProp; keys: Key[] }[] {
  const d = dur ?? PRESETS[preset].dur;
  const t = (o: number): When => shift(at, o);
  const appear = (len = Math.min(d, 0.3)): { prop: AnimProp; keys: Key[] } => ({ prop: "opacity", keys: [{ at: t(0), value: 0 }, { at: t(len), value: 1, ease: "out" }] });
  switch (preset) {
    case "fade-in": return [appear(d)];
    case "fade-out": return [{ prop: "opacity", keys: [{ at: t(0), value: 1 }, { at: t(d), value: 0, ease: "in" }] }];
    case "pop": return [{ prop: "scale", keys: [{ at: t(0), value: 0 }, { at: t(d), value: el.scale ?? 1, ease: "back" }] }, appear(0.15)];
    case "rise": return [{ prop: "y", keys: [{ at: t(0), value: el.y + 40 }, { at: t(d), value: el.y, ease: "out" }] }, appear()];
    case "slide-in": return [{ prop: "x", keys: [{ at: t(0), value: el.x - 120 }, { at: t(d), value: el.x, ease: "out" }] }, appear()];
    case "grow": return [{ prop: "scale", keys: [{ at: t(0), value: 0.6 }, { at: t(d), value: el.scale ?? 1, ease: "out" }] }, appear()];
    case "pulse": {
      const s = el.scale ?? 1;
      return [{ prop: "scale", keys: [{ at: t(0), value: s }, { at: t(d / 2), value: s * 1.12, ease: "out" }, { at: t(d), value: s, ease: "in" }] }];
    }
    case "draw":
      if (!["line", "path", "shape"].includes(el.type)) throw new Error(`"draw" works on lines, paths and shapes, not ${el.type}`);
      return [{ prop: "draw", keys: [{ at: t(0), value: 0 }, { at: t(d), value: 1, ease: "out" }] }];
    case "type":
      if (!["text", "code", "chart"].includes(el.type) && !packOf(el.type)) throw new Error(`"type" works on text, code, charts and the science elements, not ${el.type}`);
      return [{ prop: "reveal", keys: [{ at: t(0), value: 0 }, { at: t(d), value: 1, ease: "linear" }] }];
    case "train": {
      if (el.type !== "plot" && el.type !== "net" && !isTechPack(el)) throw new Error(`"train" works on plots, networks and technology pack elements, not ${el.type}`);
      return [{ prop: "frame", keys: [{ at: t(0), value: 0 }, { at: t(d), value: Math.max(1, framesOf(el) - 1), ease: "linear" }] }];
    }
    case "forward": case "backward": {
      if (el.type !== "net" && el.type !== "arch" && !isTechPack(el)) throw new Error(`"${preset}" works on networks, diagrams and technology pack elements, not ${el.type}`);
      const [a, b] = preset === "forward" ? [0, 1] : [1, 2];
      return [{ prop: "pass", keys: [{ at: t(0), value: a }, { at: t(d), value: b, ease: "linear" }, { at: t(d + 0.01), value: -1, ease: "step" }] }];
    }
    case "move-to": {
      if (!to || (to.x === undefined && to.y === undefined)) throw new Error(`"move-to" needs to: {x, y}`);
      const out: { prop: AnimProp; keys: Key[] }[] = [];
      if (to.x !== undefined) out.push({ prop: "x", keys: [{ at: t(0), value: el.x }, { at: t(d), value: to.x }] });
      if (to.y !== undefined) out.push({ prop: "y", keys: [{ at: t(0), value: el.y }, { at: t(d), value: to.y }] });
      return out;
    }
  }
}

/** How many frames a plot or network has (its longest frame list). */
export function framesOf(el: Element): number {
  if (el.type === "net") return Math.max(el.weights?.length ?? 1, el.acts?.length ?? 1);
  if (isTechPack(el)) {
    // A technology pack keeps its per-frame data in a top-level `frames` or `steps` list (docs/packs.md); the network
    // pack's elements count theirs from their parts.
    const o = el as unknown as { frames?: unknown; steps?: unknown; routes?: unknown[]; layers?: unknown[]; single?: boolean };
    if (el.type === "topology") return Math.max(2, (o.routes?.length ?? 0) + 1);
    if (el.type === "layers") return Math.max(2, (o.layers?.length ?? 1) * (o.single ? 1 : 2));
    if (el.type === "packet") return 2;
    return Math.max(1, Array.isArray(o.frames) ? o.frames.length : 0, Array.isArray(o.steps) ? o.steps.length : 0);
  }
  if (el.type !== "plot") return 1;
  let n = 1;
  for (const s of el.series) {
    const k = s.kind === "fn" ? s.params?.length : s.kind === "heat" ? s.frames?.length : s.kind === "marker" ? s.pts.length
      : s.kind === "line" || s.kind === "area" || s.kind === "dots" ? Math.max(s.frames?.length ?? 1, s.clsFrames?.length ?? 1) : 1;
    n = Math.max(n, k ?? 1);
  }
  return n;
}

/** An element of a technology pack other than science (code, data, iot, network, opt). */
const isTechPack = (el: Element): boolean => { const id = packOf(el.type); return !!id && id !== "science"; };
