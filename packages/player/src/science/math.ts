import type { MathElement, MNode } from "@lessonstudio/spec";
import { parseTex } from "@lessonstudio/spec/science";
import { h, svg } from "../dom.ts";
import { clamp01, fix } from "../motion.ts";
import type { KitRenderer } from "../templates/types.ts";
import { arabicDigits } from "./util.ts";

/**
 * Equations as plain HTML: fractions and stacked scripts are inline flex boxes, roots and stretchy brackets are SVG
 * that grow with what they hold (no measuring), so a frame depends only on its time. The equation is shrunk once to
 * fit its box, the first time it is on screen.
 */

/** Stretchy delimiters in a 10 × 100 box, drawn with a stroke that doesn't scale. */
const DELIM: Record<string, string> = {
  "(": "M8 2 Q1 50 8 98", ")": "M2 2 Q9 50 2 98", "[": "M8 2 H3 V98 H8", "]": "M2 2 H7 V98 H2",
  "{": "M8 2 Q4 2 4 10 V40 Q4 50 1 50 Q4 50 4 60 V90 Q4 98 8 98", "}": "M2 2 Q6 2 6 10 V40 Q6 50 9 50 Q6 50 6 60 V90 Q6 98 2 98",
  "|": "M5 2 V98", "‖": "M3 2 V98 M7 2 V98", "⟨": "M8 2 L2 50 L8 98", "⟩": "M2 2 L8 50 L2 98",
  "⌊": "M3 2 V98 H8", "⌋": "M7 2 V98 H2", "⌈": "M8 2 H3 V98", "⌉": "M2 2 H7 V98",
};
/** The same shape seen in a mirror, for Arabic notation (right to left). */
const FLIP: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "⟨": "⟩", "⟩": "⟨", "⌊": "⌋", "⌋": "⌊", "⌈": "⌉", "⌉": "⌈" };

function delim(d: string, rtl: boolean): Node | null {
  if (!d) return null;
  const p = DELIM[rtl ? FLIP[d] ?? d : d];
  if (!p) return h("span", { className: "lm-o" }, d);
  // In a wrapper as tall as the row: an SVG on its own would size itself from its viewBox.
  return h("span", { className: "lm-dw" }, svg("svg", { viewBox: "0 0 10 100", preserveAspectRatio: "none", "aria-hidden": "true" },
    svg("path", { d: p, fill: "none", stroke: "currentColor", "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" })));
}

const UPRIGHT = /^[Α-ΩΓΔΘΛΞΠΣΦΨΩ]$/;

export const math: KitRenderer = (el, box, ctx) => {
  const e = el as MathElement;
  const src = typeof e.tex === "string" ? e.tex : ctx.t(e.tex);
  const arabic = e.notation === "arabic" && ctx.dir === "rtl";
  const groups = new Map<number, HTMLElement[]>();
  let parsed;
  try { parsed = parseTex(src); } catch { return () => {}; }

  const node = (n: MNode): Node => {
    switch (n.t) {
      case "row": return h("span", { className: "lm-row" }, ...n.c.map(node));
      case "i": return h("i", { className: n.v.length > 1 || UPRIGHT.test(n.v) ? "lm-i lm-up" : "lm-i" }, n.v);
      case "n": return h("span", { className: "lm-n" }, arabic ? arabicDigits(n.v) : n.v);
      case "o": return h("span", { className: `lm-o lm-${n.k}` }, n.v);
      case "x": return h("span", { className: "lm-x" }, n.v);
      case "w": {
        const word = ctx.t(e.words?.[n.k]);
        return h("bdi", { className: "lm-w" }, word);
      }
      case "frac": return h("span", { className: "lm-f" }, h("span", { className: "lm-fn" }, node(n.a)), h("span", { className: "lm-fd" }, node(n.b)));
      case "s": {
        const base = node(n.b);
        if (n.sup && n.sub) return h("span", { className: "lm-s" }, base, h("span", { className: "lm-ss" }, h("span", null, node(n.sup)), h("span", null, node(n.sub))));
        return h("span", { className: "lm-s" }, base, n.sup ? h("span", { className: "lm-sup" }, node(n.sup)) : h("span", { className: "lm-sub" }, node(n.sub!)));
      }
      case "sqrt": {
        const sign = h("span", { className: "lm-sqw" }, svg("svg", { viewBox: "0 0 10 100", preserveAspectRatio: "none", "aria-hidden": "true" },
          svg("path", { d: "M0 62 L3 58 L6 96 L10 1", fill: "none", stroke: "currentColor", "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" })));
        return h("span", { className: "lm-sq" }, n.n ? h("span", { className: "lm-sqi" }, node(n.n)) : null, sign, h("span", { className: "lm-sqb" }, node(n.a)));
      }
      case "big": {
        const sym = h("span", { className: n.name ? "lm-bn" : "lm-bs" }, n.v);
        return h("span", { className: "lm-big" }, n.sup ? h("span", { className: "lm-bl" }, node(n.sup)) : null, sym, n.sub ? h("span", { className: "lm-bl" }, node(n.sub)) : null);
      }
      case "acc": {
        if (n.v === "bar") return h("span", { className: "lm-bar" }, node(n.a));
        const mark = { hat: "^", vec: "→", tilde: "~", dot: "˙" }[n.v];
        return h("span", { className: "lm-acc" }, h("span", { className: "lm-am" }, mark), node(n.a));
      }
      case "bf": return h("span", { className: "lm-bf" }, node(n.a));
      case "fence": return h("span", { className: "lm-fence" }, delim(n.l, arabic), h("span", { className: "lm-fb" }, node(n.a)), delim(n.r, arabic));
      case "stack": return h("span", { className: "lm-stack" }, ...n.lines.map((ln) => h("span", { className: "lm-sl" },
        h("span", { className: "lm-sll" }, node(ln.l)), h("span", { className: "lm-slr" }, node(ln.r)))));
      case "mat": {
        const cols = Math.max(...n.rows.map((r) => r.length));
        const grid = h("span", { className: "lm-mat" }, ...n.rows.flatMap((r) => Array.from({ length: cols }, (_, j) => h("span", null, r[j] ? node(r[j]!) : ""))));
        grid.style.gridTemplateColumns = `repeat(${cols},auto)`;
        if (n.l === "{") grid.style.justifyItems = "start";
        return h("span", { className: "lm-fence" }, delim(n.l, arabic), grid, delim(n.r, arabic));
      }
      case "g": {
        const s = h("span", { className: "lm-g" }, node(n.a));
        const list = groups.get(n.n) ?? [];
        list.push(s);
        groups.set(n.n, list);
        return s;
      }
      case "c": {
        const s = h("span", null, node(n.a));
        s.style.color = `var(--ls-${n.tone})`;
        return s;
      }
      case "sp": {
        const s = h("span", { className: "lm-sp" });
        s.style.marginInlineStart = `${n.w}em`;
        return s;
      }
    }
  };

  const eq = h("span", { className: "lm" }, node(parsed.root));
  eq.setAttribute("dir", arabic ? "rtl" : "ltr");
  const inner = h("div", { className: "lm-box" }, eq);
  inner.style.fontSize = `${e.size ?? 48}px`;
  inner.style.justifyContent = e.align === "start" ? "flex-start" : e.align === "end" ? "flex-end" : "center";
  box.append(inner);

  // Parts in order; with none, the whole equation is one part.
  const order = [...groups.keys()].sort((a, b) => a - b).map((k) => groups.get(k)!);
  const parts = order.length ? order : [[eq]];
  let fitted = false;
  return (s) => {
    if (!fitted && box.isConnected && e.w && e.h) {
      // Shrink to fit, once: equations are measured, never re-measured while playing.
      fitted = true;
      const k = Math.min(1, e.w / Math.max(1, eq.offsetWidth), e.h / Math.max(1, eq.offsetHeight));
      if (k < 1) eq.style.transform = `scale(${fix(k, 3)})`;
    }
    const n = parts.length;
    parts.forEach((list, i) => {
      const op = fix(clamp01(s.reveal * n - i));
      const on = Math.round(s.focus) === i + 1;
      for (const p of list) { ctx.wr.style(p, "opacity", op); ctx.wr.cls(p, "is-on", on); }
    });
  };
};
