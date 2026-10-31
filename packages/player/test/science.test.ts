// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { createPlayer, type Player } from "../src/index.ts";
import { kit } from "../src/science/index.ts";
import { loadExample } from "../../../scripts/lib/examples.mjs";

const load = (id: string): LessonPackage => loadExample(id).pkg as LessonPackage;
let players: Player[] = [];
afterEach(() => {
  for (const p of players) p.destroy();
  players = [];
  document.body.replaceChildren();
});

function mk(id: string, lang = "en", science = async () => kit): { p: Player; root: ShadowRoot; pkg: LessonPackage; calls: () => number } {
  const pkg = load(id);
  const host = document.createElement("div");
  document.body.append(host);
  let n = 0;
  const p = createPlayer(host, pkg, { lang, tier: "full", orient: "landscape", now: () => 0, science: () => { n++; return science(); } });
  players.push(p);
  return { p, root: host.shadowRoot!, pkg, calls: () => n };
}
const sceneEnd = (pkg: LessonPackage, lang: string, id: string): number => {
  const s = pkg.timing[lang]!.scenes.find((x) => x.id === id)!;
  return s.end - 0.05;
};

describe("the science kit", () => {
  it("loads only for lessons that use it", async () => {
    const plain = mk("prompt-injection");
    await plain.p.ready;
    expect(plain.calls()).toBe(0);
    const sci = mk("inside-a-neural-network");
    await sci.p.ready;
    expect(sci.calls()).toBe(1);
    expect([...sci.root.querySelectorAll("style")].some((s) => s.textContent!.includes(".lm-f"))).toBe(true);
  });

  it("draws an equation part by part, a network, a plot, a diagram and a table", async () => {
    const { p, root, pkg } = mk("inside-a-neural-network");
    await p.ready;
    p.renderAt(sceneEnd(pkg, "en", "neuron"));
    expect(root.querySelectorAll(".lm-g")).toHaveLength(4);
    expect(root.querySelectorAll(".lm-dw")).toHaveLength(2);
    expect(root.querySelectorAll(".ln-n")).toHaveLength(3);
    p.renderAt(sceneEnd(pkg, "en", "activations"));
    const curves = [...root.querySelectorAll(".lp-line")].map((x) => x.getAttribute("d") ?? "");
    expect(curves).toHaveLength(3);
    for (const d of curves) expect(d.length).toBeGreaterThan(100);
    p.renderAt(sceneEnd(pkg, "en", "transformer"));
    expect(root.querySelectorAll(".la-b")).toHaveLength(6);
    expect(root.querySelector(".la-gr")!.textContent).toBe("× 6");
    p.renderAt(sceneEnd(pkg, "en", "results"));
    expect(root.querySelectorAll(".lt tbody tr")).toHaveLength(3);
    expect(root.querySelector(".lt tr.is-on")).not.toBeNull();
  });

  it("draws the same frame for the same time, whatever came before", async () => {
    const { p, root, pkg } = mk("inside-a-neural-network");
    await p.ready;
    const html = (): string => root.querySelector(".ls-stage")!.innerHTML;
    const times = ["neuron", "network", "training", "descent", "transformer"].map((id) => {
      const s = pkg.timing.en!.scenes.find((x) => x.id === id)!;
      return s.start + (s.end - s.start) * 0.6;
    });
    const once = times.map((t) => (p.renderAt(t), html()));
    times.forEach((t, i) => {
      p.renderAt(times[(i + 2) % times.length]!);
      p.renderAt(t);
      expect(html()).toBe(once[i]);
    });
  });

  it("mirrors networks and diagrams in Arabic, but not plots or equations", async () => {
    const { p, root, pkg } = mk("inside-a-neural-network", "ar");
    await p.ready;
    p.renderAt(sceneEnd(pkg, "ar", "network"));
    const cx = [...root.querySelectorAll(".ln-n")].map((c) => Number(c.getAttribute("cx")));
    expect(cx[0]!).toBeGreaterThan(cx[cx.length - 1]!);
    p.renderAt(sceneEnd(pkg, "ar", "transformer"));
    const left = [...root.querySelectorAll<HTMLElement>(".la-b")].map((b) => parseFloat(b.style.left));
    expect(left[0]!).toBeGreaterThan(left[left.length - 1]!);
    p.renderAt(sceneEnd(pkg, "ar", "neuron"));
    expect(root.querySelector(".lm")!.getAttribute("dir")).toBe("ltr");
    p.renderAt(sceneEnd(pkg, "ar", "activations"));
    expect(root.querySelector(".ls-el-plot")!.getAttribute("dir")).toBe("ltr");
  });
});
