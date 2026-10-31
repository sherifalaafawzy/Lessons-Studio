// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { createPlayer, type Player } from "../../src/index.ts";
import { kit } from "../../src/packs/network/index.ts";
import { iso } from "../../src/packs/network/util.ts";
import { loadExample } from "../../../../scripts/lib/examples.mjs";

let players: Player[] = [];
afterEach(() => {
  for (const p of players) p.destroy();
  players = [];
  document.body.replaceChildren();
});

function mk(lang = "en"): { p: Player; root: ShadowRoot; pkg: LessonPackage; calls: () => number } {
  const pkg = loadExample("pack-network").pkg as LessonPackage;
  const host = document.createElement("div");
  document.body.append(host);
  let n = 0;
  const p = createPlayer(host, pkg, { lang, tier: "full", orient: "landscape", now: () => 0, packs: { network: async () => { n++; return kit; } } });
  players.push(p);
  return { p, root: host.shadowRoot!, pkg, calls: () => n };
}
const scene = (pkg: LessonPackage, lang: string, id: string) => pkg.timing[lang]!.scenes.find((x) => x.id === id)!;
const end = (pkg: LessonPackage, lang: string, id: string): number => scene(pkg, lang, id).end - 0.05;
const at = (pkg: LessonPackage, lang: string, id: string, k: number): number => { const s = scene(pkg, lang, id); return s.start + (s.end - s.start) * k; };
const num = (el: Element | null | undefined, a: string): number => Number(el?.getAttribute(a));
const translate = (el: Element): [number, number] => {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec((el as SVGElement).style.transform)!;
  return [Number(m[1]), Number(m[2])];
};

describe("the network pack", () => {
  it("loads once for a lesson that uses it and adds its styles", async () => {
    const { p, root, calls } = mk();
    await p.ready;
    expect(calls()).toBe(1);
    expect([...root.querySelectorAll("style")].some((s) => s.textContent!.includes(".pn-c"))).toBe(true);
  });

  it("draws a network, a sequence diagram, the stack and a packet", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    p.renderAt(end(pkg, "en", "net-home"));
    expect(root.querySelectorAll(".pn-d")).toHaveLength(5);
    expect(root.querySelectorAll(".pn-l.is-w")).toHaveLength(2);
    expect(root.querySelectorAll(".pn-ring circle")).toHaveLength(3);
    p.renderAt(end(pkg, "en", "net-path"));
    expect([...root.querySelectorAll(".pn-z")].map((z) => z.textContent)).toEqual(["Your home", "The internet"]);
    p.renderAt(end(pkg, "en", "net-dns"));
    expect(root.querySelectorAll(".pn-p")).toHaveLength(4);
    expect(root.querySelectorAll(".pn-msg")).toHaveLength(5);
    expect(root.querySelectorAll(".pn-msg.is-reply")).toHaveLength(2);
    expect([...root.querySelectorAll(".pn-n text")].map((t) => t.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    expect(root.querySelector(".pn-note")).not.toBeNull();
    p.renderAt(end(pkg, "en", "net-layers"));
    expect(root.querySelectorAll(".pn-ly")).toHaveLength(8);
    p.renderAt(end(pkg, "en", "net-https"));
    expect(root.querySelectorAll(".pn-f")).toHaveLength(5);
    expect(root.querySelectorAll(".pn-enc")).toHaveLength(2);
  });

  it("encrypts the secret fields as the frame goes to 1, and the eye stays on what anyone can read", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    p.renderAt(at(pkg, "en", "net-https", 0.3));
    const plain = (): string[] => [...root.querySelectorAll<SVGElement>(".pn-enc")].map((e) => e.style.opacity);
    expect(plain()).toEqual(["0", "0"]);
    p.renderAt(end(pkg, "en", "net-https"));
    expect(plain()).toEqual(["1", "1"]);
    expect([...root.querySelectorAll<SVGElement>(".pn-eye")].map((e) => e.style.opacity)).toEqual(["1", "1", "1", "0", "0"]);
    expect([...root.querySelectorAll<SVGElement>(".pn-lock")].map((e) => e.style.opacity)).toEqual(["1", "1"]);
  });

  it("wraps the message in headers on the way down and unwraps it on the way up", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    const shown = (): number => [...root.querySelectorAll<SVGElement>(".pn-ch:not(.is-pay)")].filter((c) => c.style.opacity === "1").length;
    const s = scene(pkg, "en", "net-layers");
    const seen: number[] = [];
    for (let t = s.start + 0.1; t < s.end; t += 0.25) { p.renderAt(t); seen.push(shown()); }
    // One header to start (HTTP), all four at the bottom, one again at the top of the receiver.
    expect(seen[0]).toBe(1);
    expect(Math.max(...seen)).toBe(4);
    expect(seen[seen.length - 1]).toBe(1);
    expect(root.querySelector(".pn-ch.is-pay.is-on")).not.toBeNull();
  });

  it("moves a packet hop by hop and lights its trail", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    p.renderAt(at(pkg, "en", "net-path", 0.75));
    const pk = [...root.querySelectorAll<SVGElement>(".pn-pk")].find((x) => x.style.opacity === "1")!;
    expect(pk).toBeDefined();
    const [x1] = translate(pk);
    p.renderAt(at(pkg, "en", "net-path", 0.85));
    const [x2] = translate(pk);
    expect(x2).toBeGreaterThan(x1);
    expect([...root.querySelectorAll<SVGElement>(".pn-rt")].some((t) => t.style.opacity === "1")).toBe(true);
  });

  it("breaks a link and sends the next reading round it", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    p.renderAt(at(pkg, "en", "net-mesh", 0.2));
    expect(root.querySelector(".pn-l.is-down")).toBeNull();
    p.renderAt(end(pkg, "en", "net-mesh"));
    expect(root.querySelectorAll(".pn-l.is-down")).toHaveLength(1);
  });

  it("draws the same frame for the same time, whatever came before", async () => {
    const { p, root, pkg } = mk();
    await p.ready;
    const html = (): string => root.querySelector(".ls-stage")!.innerHTML;
    const times = ["net-home", "net-path", "net-dns", "net-layers", "net-tls", "net-https", "net-mesh", "net-agent"].map((id) => at(pkg, "en", id, 0.6));
    const once = times.map((t) => (p.renderAt(t), html()));
    times.forEach((t, i) => {
      p.renderAt(times[(i + 3) % times.length]!);
      p.renderAt(t);
      expect(html()).toBe(once[i]);
    });
  });

  it("mirrors networks, sequences and stacks in Arabic, but keeps packets left to right", async () => {
    const en = mk("en");
    const ar = mk("ar");
    await en.p.ready;
    await ar.p.ready;
    const cx = (r: ShadowRoot, sel: string): number[] => [...r.querySelectorAll(sel)].map((c) => num(c, "cx"));
    en.p.renderAt(end(en.pkg, "en", "net-home"));
    ar.p.renderAt(end(ar.pkg, "ar", "net-home"));
    const W = 1120;
    cx(en.root, ".pn-c").forEach((x, i) => expect(cx(ar.root, ".pn-c")[i]).toBeCloseTo(W - x, 0));
    en.p.renderAt(end(en.pkg, "en", "net-dns"));
    ar.p.renderAt(end(ar.pkg, "ar", "net-dns"));
    const lifelines = (r: ShadowRoot): number[] => [...r.querySelectorAll(".pn-life")].map((l) => num(l, "x1"));
    expect(lifelines(en.root)[0]!).toBeLessThan(lifelines(en.root)[3]!);
    expect(lifelines(ar.root)[0]!).toBeGreaterThan(lifelines(ar.root)[3]!);
    en.p.renderAt(end(en.pkg, "en", "net-https"));
    ar.p.renderAt(end(ar.pkg, "ar", "net-https"));
    const xs = (r: ShadowRoot): number[] => [...r.querySelectorAll(".pn-f .pn-c")].map((c) => num(c, "x"));
    // The first row (the headers' fields) runs left to right in both languages, as on the wire.
    for (const r of [en.root, ar.root]) { const x = xs(r); expect(x[0]!).toBeLessThan(x[1]!); expect(x[1]!).toBeLessThan(x[2]!); }
  });

  it("isolates Latin runs in Arabic labels and keeps Latin-only labels left to right", async () => {
    expect(iso("أين school.example؟", true)).toBe("أين ⁦school.example⁩؟");
    expect(iso("انشر: 31 °C", true)).toBe("انشر: ⁦31 °C⁩");
    expect(iso("Where is it?", false)).toBe("Where is it?");
    const { p, root, pkg } = mk("ar");
    await p.ready;
    p.renderAt(end(pkg, "ar", "net-agent"));
    const texts = [...root.querySelectorAll(".pn text")];
    const code = texts.find((t) => t.textContent === "book(lab2, Tue 10:00)")!;
    expect(code.getAttribute("direction")).toBe("ltr");
    const arabic = texts.find((t) => t.textContent!.includes("المختبر"))!;
    expect(arabic.getAttribute("direction")).toBe("rtl");
  });
});
