import type { TableElement } from "@lessonstudio/spec";
import { h, rich } from "../dom.ts";
import { clamp01, fix } from "../motion.ts";
import type { KitRenderer } from "../templates/types.ts";
import { num } from "./util.ts";

/**
 * A table that fills row by row. It follows the lesson's direction (columns run right to left in Arabic); numbers and
 * the `ltr` columns (code, ids) stay left to right inside their cells.
 */
export const table: KitRenderer = (el, box, ctx) => {
  const e = el as TableElement;
  const rtl = ctx.dir === "rtl";
  const ltr = new Set(e.ltr ?? []);
  const cell = (v: string | number | Record<string, string>, col: number, tag: "td" | "th"): HTMLElement => {
    const c = h(tag, null);
    if (typeof v === "number") { c.append(h("bdi", { dir: "ltr" }, num(v))); c.className = "lt-num"; }
    else if (ltr.has(col)) { const s = typeof v === "string" ? v : ctx.t(v); c.append(h("bdi", { dir: "ltr" }, s)); }
    else c.append(...rich(typeof v === "string" ? v : ctx.t(v), rtl));
    return c;
  };
  const rows = e.rows.map((r) => h("tr", null, ...r.map((v, k) => cell(v as never, k, "td"))));
  const t = h("table", { className: "lt", dir: ctx.dir },
    h("thead", null, h("tr", null, ...e.cols.map((c, k) => cell(c as never, k, "th")))),
    h("tbody", null, ...rows));
  t.style.fontSize = `${e.size ?? 34}px`;
  box.append(t);
  return (s) => {
    const n = rows.length;
    const focus = Math.round(s.focus);
    rows.forEach((r, i) => {
      ctx.wr.style(r, "opacity", fix(clamp01(s.reveal * n - i)));
      ctx.wr.cls(r, "is-on", focus === i + 1);
    });
  };
};
