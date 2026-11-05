/**
 * Validation of the science elements (math, plot, net, arch, table), called from validatePackage. Limits keep them
 * light: a network or a diagram is one element, but old phones still draw every neuron, line and cell.
 */
import type { ArchKind, Lang, ScienceElement, Text, Tone } from "../types.ts";
import { compileExpr } from "./expr.ts";
import { parseTex } from "./tex.ts";

type Add = (code: string, path: string, detail?: string) => void;
type TextCheck = (v: Text | undefined, path: string, required?: boolean) => void;

export const ARCH_KINDS: readonly ArchKind[] = [
  "input", "output", "embed", "dense", "conv", "pool", "attn", "norm", "ffn", "add", "concat", "softmax", "act", "rnn",
  "store", "tool", "model", "box",
];
export const SCIENCE_LIMITS = {
  /** Neurons in a network, layers, lines between neurons. */
  neurons: 40, layers: 8, perLayer: 10, synapses: 200,
  /** Frames of a training animation. */
  frames: 60,
  /** Points in one series, cells in a heat grid (per side). */
  points: 400, heat: 32,
  blocks: 24, rows: 12, cols: 8,
};
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
const isPt = (p: unknown): boolean => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);

export function checkScience(el: ScienceElement, q: string, langs: Lang[], err: Add, warn: Add, text: TextCheck, tones: readonly string[]): void {
  const tone = (v: unknown, k: string): void => { if (v !== undefined && !tones.includes(v as Tone)) err("badTone", `${q}.${k}`); };
  if (el.w === undefined || el.h === undefined) err("badBox", q, "w and h");
  switch (el.type) {
    case "math": {
      const sources: [string, string][] = typeof el.tex === "string" ? [["", el.tex]] : isObj(el.tex) ? Object.entries(el.tex as Record<string, string>) : [];
      if (!sources.length) return err("badTex", `${q}.tex`);
      if (typeof el.tex !== "string") for (const l of langs) if (typeof (el.tex as Record<string, string>)[l] !== "string") err("missingText", `${q}.tex`, l);
      let groups: string | undefined;
      for (const [l, src] of sources) {
        const at = l ? `${q}.tex.${l}` : `${q}.tex`;
        try {
          const p = parseTex(src);
          const g = p.groups.join(",");
          if (groups !== undefined && g !== groups) err("texParts", at, "every language needs the same \\g parts");
          groups ??= g;
          for (const k of p.words) if (!isObj(el.words) || !(k in el.words)) err("texWord", at, k);
        } catch (e) {
          err("badTex", at, e instanceof Error ? e.message : String(e));
        }
      }
      for (const [k, v] of Object.entries(isObj(el.words) ? el.words : {})) text(v as Text, `${q}.words.${k}`);
      if (el.size !== undefined && !(isNum(el.size) && el.size >= 12 && el.size <= 200)) err("badSize", `${q}.size`);
      if (el.align !== undefined && !["start", "center", "end"].includes(el.align)) err("badAlign", `${q}.align`);
      if (el.notation !== undefined && el.notation !== "arabic") err("badNotation", `${q}.notation`);
      break;
    }
    case "plot": {
      for (const k of ["xr", "yr"] as const) {
        const r = el[k];
        if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1]) || r[0] >= r[1]) err("badRange", `${q}.${k}`);
      }
      text(el.xLabel, `${q}.xLabel`, false);
      text(el.yLabel, `${q}.yLabel`, false);
      for (const k of ["xTicks", "yTicks"] as const) if (el[k] !== undefined && (!Array.isArray(el[k]) || el[k]!.length > 12 || !el[k]!.every(isNum))) err("badTicks", `${q}.${k}`);
      const series = arr(el.series);
      if (!series.length || series.length > 8) err("badCount", `${q}.series`, "1–8");
      let frames = 0;
      const seen = (n: number, at: string): void => {
        if (n > SCIENCE_LIMITS.frames) err("tooManyFrames", at, String(n));
        if (frames && n > 1 && n !== frames) err("frameCount", at, `${n} frames where another part has ${frames}`);
        if (n > 1) frames = n;
      };
      series.forEach((s, j) => {
        const sq = `${q}.series[${j}]`;
        if (!isObj(s)) return err("badSeries", sq);
        tone((s as { tone?: unknown }).tone, `series[${j}].tone`);
        text((s as { label?: Text }).label, `${sq}.label`, false);
        switch (s.kind) {
          case "fn":
            try { compileExpr(s.fn); } catch (e) { err("badFn", `${sq}.fn`, e instanceof Error ? e.message : String(e)); }
            if (s.params !== undefined) {
              if (!Array.isArray(s.params) || !s.params.length || !s.params.every((p) => Array.isArray(p) && p.length <= 4 && p.every(isNum))) err("badParams", `${sq}.params`);
              else seen(s.params.length, `${sq}.params`);
            }
            break;
          case "line": case "area": case "dots": {
            const sets = s.frames !== undefined ? arr(s.frames) : s.pts !== undefined ? [s.pts] : [];
            if (!sets.length) err("badSeries", sq, "pts or frames");
            const len = Array.isArray(sets[0]) ? sets[0].length : 0;
            sets.forEach((set, f) => {
              if (!Array.isArray(set) || !set.every(isPt) || set.length > SCIENCE_LIMITS.points) err("badPoints", `${sq}.frames[${f}]`);
              else if (set.length !== len) err("frameCount", `${sq}.frames[${f}]`, "every frame needs the same number of points");
            });
            if (s.frames !== undefined) seen(sets.length, `${sq}.frames`);
            const okCls = (c: unknown): boolean => Array.isArray(c) && c.length === len && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 3);
            if (s.cls !== undefined && !okCls(s.cls)) err("badClasses", `${sq}.cls`);
            if (s.clsFrames !== undefined) {
              if (!Array.isArray(s.clsFrames) || !s.clsFrames.length || !s.clsFrames.every(okCls)) err("badClasses", `${sq}.clsFrames`);
              else seen(s.clsFrames.length, `${sq}.clsFrames`);
            }
            break;
          }
          case "heat": {
            const grids = s.frames !== undefined ? arr(s.frames) : s.grid !== undefined ? [s.grid] : [];
            if (!grids.length) err("badSeries", sq, "grid or frames");
            grids.forEach((g, f) => {
              const ok = Array.isArray(g) && g.length >= 1 && g.length <= SCIENCE_LIMITS.heat &&
                g.every((r) => Array.isArray(r) && r.length === g[0]!.length && r.length <= SCIENCE_LIMITS.heat && r.every((v) => isNum(v) && (s.scale ? v >= 0 && v <= 1 : Number.isInteger(v) && v >= 0 && v <= 3)));
              if (!ok) err("badGrid", `${sq}.frames[${f}]`, `at most ${SCIENCE_LIMITS.heat} × ${SCIENCE_LIMITS.heat}; classes 0–3, or 0–1 with scale`);
            });
            if (s.frames !== undefined) seen(grids.length, `${sq}.frames`);
            break;
          }
          case "hline": case "vline":
            if (!isNum(s.at)) err("badSeries", `${sq}.at`);
            break;
          case "marker":
            if (!Array.isArray(s.pts) || !s.pts.length || !s.pts.every(isPt)) err("badPoints", `${sq}.pts`);
            else seen(s.pts.length, `${sq}.pts`);
            break;
          default:
            err("badSeries", `${sq}.kind`, String((s as { kind?: unknown }).kind));
        }
      });
      if (el.frame !== undefined && !(isNum(el.frame) && el.frame >= 0)) err("badFrame", `${q}.frame`);
      break;
    }
    case "net": {
      const deep = el.form === "deep";
      if (el.form !== undefined && el.form !== "full" && el.form !== "deep") err("badForm", `${q}.form`);
      const L = arr(el.layers);
      const per = deep ? 100000 : SCIENCE_LIMITS.perLayer;
      if (L.length < 2 || L.length > SCIENCE_LIMITS.layers || !L.every((n) => Number.isInteger(n) && n >= 1 && n <= per)) {
        err("badLayers", `${q}.layers`, deep ? `2–${SCIENCE_LIMITS.layers} layers, each a count up to ${per}` : `2–${SCIENCE_LIMITS.layers} layers of 1–${SCIENCE_LIMITS.perLayer} neurons`);
        break;
      }
      if (deep && (el.weights || el.acts)) err("deepWeights", `${q}.form`, "a deep layer shows its count, not every weight");
      if (!deep) {
        const neurons = L.reduce((a, b) => a + b, 0);
        const synapses = L.slice(1).reduce((a, n, k) => a + n * L[k]!, 0);
        if (neurons > SCIENCE_LIMITS.neurons) err("tooManyNeurons", `${q}.layers`, String(neurons));
        if (synapses > SCIENCE_LIMITS.synapses) err("tooManyNeurons", `${q}.layers`, `${synapses} lines`);
      }
      const frames = (v: unknown[] | undefined, k: string): number => {
        if (v === undefined) return 0;
        if (!Array.isArray(v) || !v.length || v.length > SCIENCE_LIMITS.frames) { err("badFrames", `${q}.${k}`); return 0; }
        return v.length;
      };
      const nw = frames(el.weights, "weights");
      arr(el.weights).forEach((f, fi) => {
        const ok = Array.isArray(f) && f.length === L.length - 1 && f.every((m, l) => Array.isArray(m) && m.length === L[l] &&
          m.every((r) => Array.isArray(r) && r.length === L[l + 1] && r.every(isNum)));
        if (!ok) err("badWeights", `${q}.weights[${fi}]`, "weights[frame][layer][from][to]");
      });
      const na = frames(el.acts, "acts");
      arr(el.acts).forEach((f, fi) => {
        const ok = Array.isArray(f) && f.length === L.length && f.every((a, l) => Array.isArray(a) && a.length === L[l] && a.every((v) => isNum(v) && v >= -1 && v <= 1));
        if (!ok) err("badActs", `${q}.acts[${fi}]`, "acts[frame][layer][neuron], from −1 to 1");
      });
      if (nw > 1 && na > 1 && nw !== na) err("frameCount", `${q}.acts`, "weights and acts need the same number of frames");
      if (isObj(el.labels)) {
        const lb = el.labels;
        if (deep && (lb.in || lb.out)) err("badLabels", `${q}.labels`, "a deep layer is named once, under labels.layers");
        if (!deep && lb.in !== undefined) { if (!Array.isArray(lb.in) || lb.in.length !== L[0]) err("badLabels", `${q}.labels.in`); else lb.in.forEach((t, j) => text(t, `${q}.labels.in[${j}]`)); }
        if (!deep && lb.out !== undefined) { if (!Array.isArray(lb.out) || lb.out.length !== L[L.length - 1]) err("badLabels", `${q}.labels.out`); else lb.out.forEach((t, j) => text(t, `${q}.labels.out[${j}]`)); }
        if (lb.layers !== undefined) { if (!Array.isArray(lb.layers) || lb.layers.length !== L.length) err("badLabels", `${q}.labels.layers`); else lb.layers.forEach((t, j) => text(t, `${q}.labels.layers[${j}]`)); }
      } else if (el.labels !== undefined) err("badLabels", `${q}.labels`);
      if (el.frame !== undefined && !(isNum(el.frame) && el.frame >= 0)) err("badFrame", `${q}.frame`);
      break;
    }
    case "arch": {
      const blocks = arr(el.blocks);
      if (!blocks.length || blocks.length > SCIENCE_LIMITS.blocks) err("badCount", `${q}.blocks`, `1–${SCIENCE_LIMITS.blocks}`);
      const ids = new Set<string>();
      blocks.forEach((b, j) => {
        const bq = `${q}.blocks[${j}]`;
        if (!isObj(b)) return err("badBlock", bq);
        if (typeof b.id !== "string" || !ITEM_ID.test(b.id)) err("badId", `${bq}.id`);
        else if (ids.has(b.id)) err("dupId", `${bq}.id`, b.id);
        ids.add(b.id);
        if (!ARCH_KINDS.includes(b.kind)) err("badKind", `${bq}.kind`, String(b.kind));
        const glyph = (b.kind === "add" || b.kind === "concat") && (b.label === "" || (isObj(b.label) && Object.values(b.label).every((v) => v === "")));
        if (!glyph) text(b.label, `${bq}.label`);
        text(b.note, `${bq}.note`, false);
        tone(b.tone, `blocks[${j}].tone`);
      });
      arr(el.edges).forEach((e, j) => {
        const eq = `${q}.edges[${j}]`;
        if (!isObj(e) || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) return err("badEdge", eq);
        text(e.label, `${eq}.label`, false);
      });
      if (!Array.isArray(el.edges)) err("badEdge", `${q}.edges`);
      else if (hasCycle(blocks.map((b) => b.id), el.edges.filter((e) => isObj(e) && !e.skip))) err("archCycle", `${q}.edges`, "the arrows (skips aside) must not loop: draw a loop with a skip arrow back");
      const inGroup = new Set<string>();
      arr(el.groups).forEach((g, j) => {
        const gq = `${q}.groups[${j}]`;
        if (!isObj(g) || typeof g.id !== "string" || !Array.isArray(g.blocks) || !g.blocks.length) return err("badGroup", gq);
        for (const b of g.blocks) { if (!ids.has(b)) err("badGroup", `${gq}.blocks`, b); if (inGroup.has(b)) err("badGroup", `${gq}.blocks`, `${b} is in two groups`); inGroup.add(b); }
        text(g.label, `${gq}.label`, false);
        if (g.repeat !== undefined && !(Number.isInteger(g.repeat) && g.repeat >= 2 && g.repeat <= 1000)) err("badGroup", `${gq}.repeat`);
      });
      if (el.flow !== undefined && !["right", "down", "up"].includes(el.flow)) err("badFlow", `${q}.flow`);
      break;
    }
    case "table": {
      const cols = arr(el.cols);
      if (!cols.length || cols.length > SCIENCE_LIMITS.cols) err("badCount", `${q}.cols`, `1–${SCIENCE_LIMITS.cols}`);
      cols.forEach((c, j) => text(c, `${q}.cols[${j}]`));
      const rows = arr(el.rows);
      if (!rows.length || rows.length > SCIENCE_LIMITS.rows) err("badCount", `${q}.rows`, `1–${SCIENCE_LIMITS.rows}`);
      rows.forEach((r, j) => {
        if (!Array.isArray(r) || r.length !== cols.length) return err("badRow", `${q}.rows[${j}]`, `${cols.length} cells`);
        r.forEach((c, k) => {
          const cell = isObj(c) && "v" in c ? c.v : c;
          if (isObj(c) && "v" in c) tone(c.tone, `rows[${j}][${k}].tone`);
          if (typeof cell !== "number" && typeof cell !== "string") text(cell as Text, `${q}.rows[${j}][${k}]`);
        });
      });
      if (el.heat !== undefined && typeof el.heat !== "boolean") err("badHeat", `${q}.heat`);
      if (el.ltr !== undefined && (!Array.isArray(el.ltr) || !el.ltr.every((n) => Number.isInteger(n) && n >= 0 && n < cols.length))) err("badColumns", `${q}.ltr`);
      if (el.size !== undefined && !(isNum(el.size) && el.size >= 12 && el.size <= 80)) err("badSize", `${q}.size`);
      break;
    }
  }
  void warn;
}

function hasCycle(ids: string[], edges: { from: string; to: string }[]): boolean {
  const out = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of edges) out.get(e.from)?.push(e.to);
  const state = new Map<string, number>();
  const visit = (n: string): boolean => {
    const s = state.get(n);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(n, 1);
    for (const m of out.get(n) ?? []) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return ids.some((id) => visit(id));
}
