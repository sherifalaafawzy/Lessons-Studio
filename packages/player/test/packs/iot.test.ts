// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { createPlayer, type Player } from "../../src/index.ts";
import { kit } from "../../src/packs/iot/index.ts";
import { BOARD_PINS } from "../../src/packs/iot/pinout.ts";
import { evaluate } from "../../src/packs/iot/gates.ts";
import { BOARDS } from "../../../spec/src/packs/iot/check.ts";
import { evalGates, gateFrames } from "../../../ops/src/packs/iot.ts";
import { loadExample } from "../../../../scripts/lib/examples.mjs";

const load = (id: string): LessonPackage => loadExample(id).pkg as LessonPackage;
let players: Player[] = [];
afterEach(() => {
  for (const p of players) p.destroy();
  players = [];
  document.body.replaceChildren();
});

function mk(id: string, lang = "en"): { p: Player; root: ShadowRoot; pkg: LessonPackage; calls: () => number } {
  const pkg = load(id);
  const host = document.createElement("div");
  document.body.append(host);
  let n = 0;
  const p = createPlayer(host, pkg, { lang, tier: "full", orient: "landscape", now: () => 0, packs: { iot: async () => { n++; return kit; } } });
  players.push(p);
  return { p, root: host.shadowRoot!, pkg, calls: () => n };
}
const scene = (pkg: LessonPackage, lang: string, id: string, at = 0.97): number => {
  const s = pkg.timing[lang]!.scenes.find((x) => x.id === id)!;
  return s.start + (s.end - s.start) * at;
};
const el = (root: ShadowRoot, id: string): Element => root.querySelector(`[data-el="${id}"]`)!;

describe("the IoT pack", () => {
  it("loads only for lessons that use it, with its own CSS", async () => {
    const plain = mk("prompt-injection");
    await plain.p.ready;
    expect(plain.calls()).toBe(0);
    const iot = mk("pack-iot");
    await iot.p.ready;
    expect(iot.calls()).toBe(1);
    expect([...iot.root.querySelectorAll("style")].some((s) => s.textContent!.includes(".pi-dot"))).toBe(true);
  });

  it("draws a circuit: parts, wires, a lit lamp and current flowing once the switch closes", async () => {
    const { p, root, pkg } = mk("pack-iot");
    await p.ready;
    p.renderAt(scene(pkg, "en", "loop", 0.05));
    const c = el(root, "c");
    expect(c.querySelectorAll(".pi-part")).toHaveLength(3);
    expect(c.querySelectorAll("path.pi-w[pathLength]")).toHaveLength(3);
    const dots = (): SVGElement[] => [...c.querySelectorAll<SVGElement>(".pi-dot")];
    expect(dots().every((d) => d.style.opacity === "0")).toBe(true);
    p.renderAt(scene(pkg, "en", "loop", 0.6));
    expect(dots().some((d) => d.style.opacity === "1")).toBe(true);
    expect(Number((c.querySelector(".pi-lit.pi-lamp") as SVGElement).style.opacity)).toBeGreaterThan(0.9);
    expect(c.textContent).toContain("3.0 V");
  });

  it("moves the current with the flow's clock, faster for more current", async () => {
    const { p, root, pkg } = mk("pack-iot");
    await p.ready;
    const at = (t: number): string[] => (p.renderAt(t), [...el(root, "c").querySelectorAll(".pi-dot")].map((d) => d.getAttribute("transform") ?? ""));
    const t = scene(pkg, "en", "led", 0.8);
    const a = at(t);
    const b = at(t + 0.1);
    expect(a).not.toEqual(b);
    // 10 mA at 6 px/s per mA: 6 px in a tenth of a second.
    const x = (s: string): number => Number(/translate\(([-\d.]+)/.exec(s)![1]);
    const moved = a.map((s, i) => Math.abs(x(b[i]!) - x(s))).filter((d) => d > 0 && d < 20);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved[0]!).toBeCloseTo(6, 0);
  });

  it("draws a board with its pins, a signal, gates with a truth table and a register", async () => {
    const { p, root, pkg } = mk("pack-iot");
    await p.ready;
    p.renderAt(scene(pkg, "en", "pico"));
    const board = el(root, "board");
    expect(board.querySelectorAll(".pi-hole")).toHaveLength(40);
    expect([...board.querySelectorAll(".pi-pl text")].map((t) => t.textContent)).toEqual(expect.arrayContaining(["GP15", "GP14", "GND"]));
    expect(board.querySelectorAll(".pi-hole.is-hi")).toHaveLength(1);
    p.renderAt(scene(pkg, "en", "temperature"));
    const sig = el(root, "sig");
    expect(sig.querySelectorAll(".pi-smp")).toHaveLength(49);
    expect(sig.querySelector(".pi-dig")!.getAttribute("d")).toContain("Z");
    expect(sig.textContent).toMatch(/\d+(\.\d)? °C/);
    p.renderAt(scene(pkg, "en", "and"));
    const g = el(root, "g");
    expect(g.querySelectorAll(".pi-gate")).toHaveLength(1);
    expect(g.querySelector(".pi-out")!.classList.contains("is-1")).toBe(true);
    p.renderAt(scene(pkg, "en", "byte"));
    const b = el(root, "b");
    expect([...b.querySelectorAll(".pi-bv")].map((t) => t.textContent).join("")).toBe("01000001");
    expect(b.textContent).toContain("64 + 1 = 65");
  });

  it("sweeps time with the cursor: a signal draws only what has happened", async () => {
    const { p, root, pkg } = mk("pack-iot");
    await p.ready;
    const width = (t: number): number => (p.renderAt(t), Number(el(root, "sig").querySelector("svg svg svg")!.getAttribute("width")));
    const early = width(scene(pkg, "en", "temperature", 0.3));
    const late = width(scene(pkg, "en", "temperature", 0.8));
    expect(late).toBeGreaterThan(early);
  });

  it("draws the same frame for the same time, whatever came before", async () => {
    const { p, root, pkg } = mk("pack-iot");
    await p.ready;
    const html = (): string => root.querySelector(".ls-stage")!.innerHTML;
    const times = ["loop", "led", "light", "pico", "temperature", "adc", "and", "byte"].map((id) => scene(pkg, "en", id, 0.6));
    const once = times.map((t) => (p.renderAt(t), html()));
    times.forEach((t, i) => {
      p.renderAt(times[(i + 3) % times.length]!);
      p.renderAt(t);
      expect(html()).toBe(once[i]);
    });
  });

  it("never mirrors in Arabic: schematics, boards, time and bits stay left to right, labels read right to left", async () => {
    const en = mk("pack-iot");
    const ar = mk("pack-iot", "ar");
    await Promise.all([en.p.ready, ar.p.ready]);
    const shapes = (m: ReturnType<typeof mk>, id: string, sel: string): string[] => {
      m.p.renderAt(scene(m.pkg, m.p.lang, id));
      return [...el(m.root, id === "byte" ? "b" : id === "pico" ? "board" : "c").querySelectorAll(sel)].map((x) => x.getAttribute("transform") ?? x.getAttribute("cx") ?? x.getAttribute("x") ?? "");
    };
    expect(shapes(ar, "led", ".pi-part > g")).toEqual(shapes(en, "led", ".pi-part > g"));
    expect(shapes(ar, "pico", ".pi-hole")).toEqual(shapes(en, "pico", ".pi-hole"));
    expect(shapes(ar, "byte", ".pi-cell")).toEqual(shapes(en, "byte", ".pi-cell"));
    for (const id of ["c", "board", "sig", "g", "b"]) {
      ar.p.renderAt(scene(ar.pkg, "ar", { c: "led", board: "pico", sig: "temperature", g: "and", b: "byte" }[id]!));
      expect(el(ar.root, id).getAttribute("dir"), id).toBe("ltr");
    }
    ar.p.renderAt(scene(ar.pkg, "ar", "light"));
    const ldr = [...el(ar.root, "c").querySelectorAll("text")].find((t) => t.textContent === "LDR")!;
    expect(ldr.getAttribute("direction")).toBeNull();
    ar.p.renderAt(scene(ar.pkg, "ar", "loop"));
    const sw = [...el(ar.root, "c").querySelectorAll("text")].find((t) => t.textContent === "مفتاح")!;
    expect(sw.getAttribute("direction")).toBe("rtl");
  });

  it("keeps its boards' pins and its logic in step with the spec and ops", () => {
    for (const b of ["pico", "esp32", "microbit"] as const) {
      expect(BOARD_PINS[b]!.top).toEqual([...BOARDS[b].top]);
      expect(BOARD_PINS[b]!.bottom).toEqual([...BOARDS[b].bottom]);
    }
    const net = { inputs: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], gates: [{ id: "x", kind: "xor" as const, in: ["a", "b"] }, { id: "n", kind: "nand" as const, in: ["x", "c"] }], outputs: [{ id: "q", from: "n", label: "Q" }] };
    for (const row of gateFrames(3)) expect(evaluate(net, row)).toEqual(evalGates(net, row));
  });
});
