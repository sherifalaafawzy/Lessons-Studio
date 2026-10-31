// @vitest-environment jsdom
// The programming pack's renderers: in the example lesson through the real player, and one by one at chosen moments.
import { afterEach, describe, expect, it } from "vitest";
import type { Element, LessonPackage, Text } from "@lessonstudio/spec";
import { createPlayer, type Player } from "../../src/index.ts";
import { Writer } from "../../src/dom.ts";
import type { Ctx, KitState } from "../../src/templates/types.ts";
import { kit } from "../../src/packs/code/index.ts";
import { diffLines } from "../../src/packs/code/codediff.ts";
import { loadExample } from "../../../../scripts/lib/examples.mjs";

let players: Player[] = [];
afterEach(() => {
  for (const p of players) p.destroy();
  players = [];
  document.body.replaceChildren();
});

function mk(lang = "en"): { p: Player; root: ShadowRoot; pkg: LessonPackage; calls: () => number } {
  const pkg = loadExample("pack-code").pkg as LessonPackage;
  const host = document.createElement("div");
  document.body.append(host);
  let n = 0;
  const p = createPlayer(host, pkg, { lang, tier: "full", orient: "landscape", now: () => 0, packs: { code: async () => { n++; return kit; } } });
  players.push(p);
  return { p, root: host.shadowRoot!, pkg, calls: () => n };
}
const scene = (pkg: LessonPackage, lang: string, id: string) => pkg.timing[lang]!.scenes.find((x) => x.id === id)!;
const end = (pkg: LessonPackage, lang: string, id: string): number => scene(pkg, lang, id).end - 0.05;
const at = (pkg: LessonPackage, lang: string, id: string, k: number): number => { const s = scene(pkg, lang, id); return s.start + (s.end - s.start) * k; };
const shown = (els: NodeListOf<HTMLElement> | HTMLElement[]): HTMLElement[] => [...els].filter((e) => e.style.visibility !== "hidden");
const left = (el: Element | null): number => parseFloat((el as HTMLElement).style.left);

/** One element drawn on its own, at chosen moments. */
function draw(el: Record<string, unknown>, o: { lang?: string; dir?: "ltr" | "rtl" } = {}): { box: HTMLElement; at: (s: Partial<KitState>) => void } {
  const lang = o.lang ?? "en";
  const ctx = {
    lang, dir: o.dir ?? "ltr", mirror: o.dir === "rtl", wr: new Writer(), tier: "full", orient: "landscape", W: 1280, H: 720, dur: 10, words: [],
    t: (x: Text | undefined) => (x === undefined ? "" : typeof x === "string" ? x : x[lang] ?? x.en ?? ""), design: { W: 1280, H: 720 }, first: false, scale: 1, url: (p: string) => p,
  } as unknown as Ctx;
  const box = document.createElement("div");
  document.body.append(box);
  const paint = kit.draw[el.type as string]!({ id: "e", x: 0, y: 0, w: 1100, h: 420, ...el } as unknown as Element, box, ctx);
  return { box, at: (s) => paint({ reveal: 1, draw: 1, frame: 0, focus: 0, pass: -1, ...s }) };
}

describe("the programming pack in the player", () => {
  it("loads once, for a lesson that uses it, with its styles", async () => {
    const { p, root, calls } = mk();
    await p.ready;
    expect(calls()).toBe(1);
    expect([...root.querySelectorAll("style")].some((s) => s.textContent!.includes(".pc-code"))).toBe(true);
  });

  it("draws every element of the example", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    p.renderAt(end(pkg, "en", "trace"));
    expect(root.querySelectorAll(".pc-code .pc-ln")).toHaveLength(6);
    expect(shown(root.querySelectorAll<HTMLElement>(".pc-vr")).map((r) => r.textContent)).toEqual(["marks[45, 80, 62]", "passed2", "m62"]);
    expect([...root.querySelectorAll(".pc-ol")].map((r) => r.textContent).join("")).toBe("2");
    expect(root.querySelector(".pc-no.is-on")!.textContent).toBe("6");
    p.renderAt(end(pkg, "en", "flowchart"));
    expect(root.querySelectorAll(".pc-fs")).toHaveLength(7);
    expect(root.querySelectorAll(".pc-fe")).toHaveLength(8);
    expect(root.querySelector(".pc-fs.is-on")!.getAttribute("class")).toContain("pc-f-end");
    p.renderAt(at(pkg, "en", "function", 0.62));
    expect(shown(root.querySelectorAll<HTMLElement>(".pc-vr.is-h")).map((r) => r.textContent)).toEqual(["greet('Ada')"]);
    p.renderAt(end(pkg, "en", "sort"));
    const bars = [...root.querySelectorAll<HTMLElement>(".pc-it")];
    expect(bars).toHaveLength(6);
    expect(bars.every((b) => b.classList.contains("is-done"))).toBe(true);
    expect(root.querySelector(".pc-cnts")!.textContent).toBe("comparisons: 15swaps: 3");
    p.renderAt(end(pkg, "en", "search"));
    expect(root.querySelector(".pc-it.is-found")!.textContent).toBe("37");
    expect(root.querySelector(".pc-note")!.textContent).toBe("return 5");
    p.renderAt(end(pkg, "en", "recursion"));
    expect(root.querySelectorAll(".pc-call")).toHaveLength(9);
    expect([...root.querySelectorAll<HTMLElement>(".pc-ret")].every((b) => b.style.opacity === "1")).toBe(true);
    p.renderAt(end(pkg, "en", "bug"));
    expect((root.querySelector(".pc-add") as HTMLElement).style.opacity).toBe("1");
    expect((root.querySelector(".pc-del") as HTMLElement).style.opacity).toBe("0");
    expect(root.querySelector(".pc-dout.is-ok")!.textContent).toBe("21");
  });

  it("draws the same frame for the same time, whatever came before", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    const html = (): string => root.querySelector(".ls-stage")!.innerHTML;
    const times = ["trace", "flowchart", "function", "sort", "search", "recursion", "bug"].map((id) => at(pkg, "en", id, 0.57));
    const once = times.map((t) => (p.renderAt(t), html()));
    times.forEach((t, i) => {
      p.renderAt(times[(i + 3) % times.length]!);
      p.renderAt(t);
      expect(html()).toBe(once[i]);
    });
  });

  it("mirrors the flowchart, the call tree and the trace's panels in Arabic, never the code or the array", async () => {
    const en = mk("en");
    const ar = mk("ar");
    await Promise.all([en.p.ready, ar.p.ready]);
    const place = (m: { p: Player; root: ShadowRoot; pkg: LessonPackage }, id: string, sel: string): number[] => {
      m.p.renderAt(end(m.pkg, m === en ? "en" : "ar", id));
      return [...m.root.querySelectorAll(sel)].map((e) => left(e));
    };
    const [codeEn, varsEn] = place(en, "trace", ".pc-code, .pc-vars");
    const [codeAr, varsAr] = place(ar, "trace", ".pc-code, .pc-vars");
    expect(codeEn!).toBeLessThan(varsEn!);
    expect(codeAr!).toBeGreaterThan(varsAr!);
    expect(ar.root.querySelector(".pc-code")!.getAttribute("dir")).toBe("ltr");
    const flowEn = place(en, "flowchart", ".pc-fn");
    const flowAr = place(ar, "flowchart", ".pc-fn");
    // "print(passed)" is in the side lane: right of the start in English, left of it in Arabic.
    expect(flowEn[4]!).toBeGreaterThan(flowEn[0]!);
    expect(flowAr[4]!).toBeLessThan(flowAr[0]!);
    expect(ar.root.querySelectorAll(".pc-fn")[3]!.getAttribute("dir")).toBe("ltr");
    const treeEn = place(en, "recursion", ".pc-call");
    const treeAr = place(ar, "recursion", ".pc-call");
    expect(treeEn[1]!).toBeLessThan(treeEn[0]!);
    expect(treeAr[1]!).toBeGreaterThan(treeAr[0]!);
    en.p.renderAt(end(en.pkg, "en", "search"));
    ar.p.renderAt(end(ar.pkg, "ar", "search"));
    const xs = (r: ShadowRoot): string[] => [...r.querySelectorAll<HTMLElement>(".pc-it")].map((b) => b.style.transform);
    expect(xs(ar.root)).toEqual(xs(en.root));
  });
});

describe("each renderer, frame by frame", () => {
  it("trace: frame k is step k; the light glides to the next line at the end of a frame; changed values are marked", () => {
    const { box, at } = draw({
      type: "trace", code: "a = 1\nb = a + 1\nprint(b)", output: "2\n", labels: { vars: "Variables", out: "Output" },
      steps: [{ line: 1, vars: { a: "1" } }, { line: 2, vars: { a: "1", b: "2" } }, { line: 3, vars: { a: "1", b: "2" }, out: 2 }],
    });
    const bar = box.querySelector<HTMLElement>(".pc-bar")!;
    const rows = (): string[] => shown(box.querySelectorAll<HTMLElement>(".pc-vr")).map((r) => `${r.textContent}${r.classList.contains("is-new") ? "*" : ""}`);
    at({ frame: 0 });
    const y0 = bar.style.transform;
    expect(rows()).toEqual(["a1*"]);
    at({ frame: 1 });
    expect(rows()).toEqual(["a1", "b2*"]);
    expect(box.querySelector(".pc-no.is-on")!.textContent).toBe("2");
    at({ frame: 1.3 });
    const held = bar.style.transform;
    at({ frame: 1 });
    expect(bar.style.transform).toBe(held);
    at({ frame: 1.9 });
    expect(bar.style.transform).not.toBe(held);
    expect(rows()).toEqual(["a1", "b2*"]);
    at({ frame: 2 });
    expect(box.querySelector(".pc-ol")!.textContent).toBe("2");
    expect(bar.style.transform).not.toBe(y0);
    at({ frame: 0, focus: 3 });
    expect(box.querySelectorAll(".pc-ln")[2]!.classList.contains("is-focus")).toBe(true);
  });

  it("trace: a function's frame sits on top, then shows what it returns; an error is shown in the console", () => {
    const { box, at } = draw({
      type: "trace", code: "def f(x):\n    return 1 / x\nf(0)", error: "ZeroDivisionError: divide by zero",
      steps: [{ line: 1 }, { line: 3 }, { line: 2, fn: "f", call: "f(0)", depth: 1, locals: { x: "0" }, err: true }],
    });
    at({ frame: 2 });
    expect(shown(box.querySelectorAll<HTMLElement>(".pc-vr")).map((r) => r.textContent)).toEqual(["f(0)", "x0"]);
    expect(box.querySelector(".pc-bar")!.classList.contains("is-err")).toBe(true);
    expect(box.querySelector(".pc-ol.is-err")!.textContent).toBe("ZeroDivisionError: divide by zero");
  });

  it("array: items keep their identity and slide between frames; marks follow the frame being moved to", () => {
    const { box, at } = draw({ type: "array", values: [3, 1], frames: [{}, { compare: [0, 1] }, { order: [1, 0], swap: [0, 1] }, { done: [0, 1] }] });
    const [three, one] = [...box.querySelectorAll<HTMLElement>(".pc-it")];
    const x = (el: HTMLElement): number => Number(/translate\((-?[\d.]+)px/.exec(el.style.transform)![1]);
    at({ frame: 1 });
    expect(three!.classList.contains("is-cmp") && one!.classList.contains("is-cmp")).toBe(true);
    const [a, b] = [x(three!), x(one!)];
    expect(a).toBeLessThan(b);
    at({ frame: 1.35 });
    expect(x(three!)).toBeGreaterThan(a);
    expect(x(three!)).toBeLessThan(b);
    expect(three!.classList.contains("is-swap")).toBe(true);
    at({ frame: 2 });
    expect(x(three!)).toBeCloseTo(b, 0);
    expect(x(one!)).toBeCloseTo(a, 0);
    at({ frame: 3 });
    expect(three!.classList.contains("is-done")).toBe(true);
  });

  it("array: a search fades the slots outside lo…hi and points at them", () => {
    const { box, at } = draw({ type: "array", values: [1, 2, 3, 4, 5], index: true, frames: [{ lo: 0, hi: 4 }, { lo: 3, mid: 3, hi: 4, found: 3, note: "return 3" }] });
    at({ frame: 1 });
    const items = [...box.querySelectorAll<HTMLElement>(".pc-it")];
    expect(items.map((i) => i.style.opacity)).toEqual(["0.32", "0.32", "0.32", "1", "1"]);
    expect(items[3]!.classList.contains("is-found")).toBe(true);
    // lo and mid share slot 3: one label, as the code would say it.
    expect([...box.querySelectorAll<HTMLElement>(".pc-ptr")].filter((p) => p.style.opacity !== "0").map((p) => p.textContent)).toEqual(["lo=mid", "hi"]);
    expect([...box.querySelectorAll(".pc-ix")].map((p) => p.textContent)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("calltree: calls appear in call order, the running one is marked, and values come back up", () => {
    const calls = [{ label: "f(2)", ret: "2" }, { label: "f(1)", parent: 0, ret: "1" }, { label: "f(0)", parent: 0, ret: "1" }];
    const { box, at } = draw({ type: "calltree", calls, steps: [1, 2, -2, 3, -3, -1], anim: [{ prop: "frame", keys: [{ at: 0, value: 0 }] }] });
    const nodes = [...box.querySelectorAll<HTMLElement>(".pc-call")];
    at({ frame: 1 });
    expect(nodes.map((n) => n.style.opacity)).toEqual(["1", "1", "0"]);
    expect(nodes[1]!.classList.contains("is-now")).toBe(true);
    expect(nodes[0]!.classList.contains("is-open")).toBe(true);
    at({ frame: 1.5 });
    const chip = box.querySelector<HTMLElement>(".pc-chip")!;
    expect(chip.textContent).toBe("1");
    expect(Number(chip.style.opacity)).toBeGreaterThan(0);
    at({ frame: 2 });
    expect(nodes[1]!.classList.contains("is-done")).toBe(true);
    expect((nodes[1]!.querySelector(".pc-ret") as HTMLElement).style.opacity).toBe("1");
    expect(chip.style.opacity).toBe("0");
    // Without a frame track the whole run shows.
    const whole = draw({ type: "calltree", calls });
    whole.at({ frame: 0 });
    expect([...whole.box.querySelectorAll<HTMLElement>(".pc-call")].every((n) => n.style.opacity === "1" && n.classList.contains("is-done"))).toBe(true);
  });

  it("codediff: the bug's lines slide out and the fix's slide in, the shared ones stay", () => {
    expect(diffLines(["a", "b", "c"], ["a", "x", "c"]).map((r) => [r.t, r.ia, r.ib])).toEqual([["a", 0, 0], ["b", 1, -1], ["x", -1, 1], ["c", 2, 2]]);
    const { box, at } = draw({ type: "codediff", before: "a = 1\nb = 2", after: "a = 1\nb = 3", labels: { before: "Bug", after: "Fix" }, output: { before: "2", after: "3" } });
    const del = box.querySelector<HTMLElement>(".pc-del")!;
    const add = box.querySelector<HTMLElement>(".pc-add")!;
    const head = (): string => [...box.querySelectorAll<HTMLElement>(".pc-dh")].filter((h) => h.style.opacity !== "0").map((h) => h.textContent).join();
    at({ frame: 0 });
    expect([del.style.opacity, add.style.opacity, head()]).toEqual(["1", "0", "Bug"]);
    at({ frame: 1 });
    expect([del.style.opacity, add.style.opacity, head()]).toEqual(["0", "1", "Fix"]);
  });

  it("flowchart: the token travels the path one hop at a time and lights where it is", () => {
    const { box, at } = draw({
      type: "flowchart", path: ["s", "a", "e"],
      nodes: [{ id: "s", kind: "start", label: "Start" }, { id: "a", kind: "process", label: "x = 1" }, { id: "e", kind: "end", label: "End" }],
      edges: [{ from: "s", to: "a" }, { from: "a", to: "e" }],
    });
    const lit = (): number => [...box.querySelectorAll(".pc-fs")].findIndex((s) => s.classList.contains("is-on"));
    const tok = box.querySelector<SVGElement>(".pc-tok")!;
    at({ pass: -1 });
    expect([lit(), tok.style.opacity]).toEqual([-1, "0"]);
    at({ pass: 0.5 });
    expect([lit(), tok.style.opacity]).toEqual([1, "0"]);
    at({ pass: 0.25 });
    expect(Number(tok.style.opacity)).toBeGreaterThan(0);
    at({ pass: 1 });
    expect(lit()).toBe(2);
    at({ focus: 1 });
    expect(lit()).toBe(0);
  });
});
