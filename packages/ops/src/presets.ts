import type { AnimProp, Element, Key, When } from "@lessonstudio/spec";
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
  type: { dur: 1.5, about: "text is revealed word by word, code letter by letter, a chart grows" },
  "move-to": { dur: 1, about: "moves from where it is to `to` {x, y}" },
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
      if (!["text", "code", "chart"].includes(el.type)) throw new Error(`"type" works on text, code and charts, not ${el.type}`);
      return [{ prop: "reveal", keys: [{ at: t(0), value: 0 }, { at: t(d), value: 1, ease: "linear" }] }];
    case "move-to": {
      if (!to || (to.x === undefined && to.y === undefined)) throw new Error(`"move-to" needs to: {x, y}`);
      const out: { prop: AnimProp; keys: Key[] }[] = [];
      if (to.x !== undefined) out.push({ prop: "x", keys: [{ at: t(0), value: el.x }, { at: t(d), value: to.x }] });
      if (to.y !== undefined) out.push({ prop: "y", keys: [{ at: t(0), value: el.y }, { at: t(d), value: to.y }] });
      return out;
    }
  }
}
