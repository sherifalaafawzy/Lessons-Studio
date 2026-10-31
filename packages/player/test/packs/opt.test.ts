// @vitest-environment jsdom
// The optimization pack's renderers in the real player: it loads only for lessons that use it, draws each element and
// each algorithm's steps, gives the same frame for the same time, and keeps maps, plots and the DP table left to right
// in Arabic while timetables and trees follow the language.
import { afterEach, describe, expect, it } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { createPlayer, type Player } from "../../src/index.ts";
import { kit } from "../../src/packs/opt/index.ts";
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
  const p = createPlayer(host, pkg, { lang, tier: "full", orient: "landscape", now: () => 0, packs: { opt: async () => { n++; return kit; } } });
  players.push(p);
  return { p, root: host.shadowRoot!, pkg, calls: () => n };
}
const at = (pkg: LessonPackage, lang: string, id: string, k = 0.97): number => {
  const s = pkg.timing[lang]!.scenes.find((x) => x.id === id)!;
  return s.start + (s.end - s.start) * k;
};
const el = (root: ShadowRoot, id: string): HTMLElement => root.querySelector<HTMLElement>(`[data-el="${id}"]`)!;

describe("the optimization pack", () => {
  it("loads only for lessons that use it, with its own CSS", async () => {
    const plain = mk("prompt-injection");
    await plain.p.ready;
    expect(plain.calls()).toBe(0);
    const opt = mk("pack-opt");
    await opt.p.ready;
    expect(opt.calls()).toBe(1);
    expect([...opt.root.querySelectorAll("style")].some((s) => s.textContent!.includes(".po-n"))).toBe(true);
  });

  it("steps Dijkstra's method to the shortest way and drives the bus along it", async () => {
    const { p, root, pkg } = mk("pack-opt");
    await p.ready;
    p.renderAt(at(pkg, "en", "dijkstra"));
    const map = el(root, "map");
    expect(map.querySelectorAll(".po-n")).toHaveLength(8);
    expect(map.querySelectorAll(".po-e")).toHaveLength(14);
    expect(map.querySelectorAll(".po-n.s-p")).toHaveLength(5);
    expect(map.querySelectorAll(".po-e.s-p")).toHaveLength(4);
    expect([...map.querySelectorAll(".po-n text")].map((t) => t.textContent)).toEqual(["0", "4", "5", "7", "9", "6", "11", "13"]);
    expect(map.querySelector(".po-tv")!.textContent).toBe("13 km");
    expect(map.querySelector(".po-r")!.getAttribute("d")!.split("L")).toHaveLength(5);
    // Partway: the frontier is waiting, one village is being settled.
    p.renderAt(at(pkg, "en", "dijkstra", 0.45));
    expect(map.querySelectorAll(".po-n.s-c")).toHaveLength(1);
    expect(map.querySelectorAll(".po-n.s-f").length).toBeGreaterThan(0);
  });

  it("shows the bus route improving, the tree being joined and the exam slots coloured", async () => {
    const { p, root, pkg } = mk("pack-opt");
    await p.ready;
    p.renderAt(at(pkg, "en", "route"));
    expect(el(root, "route").querySelector(".po-tv")!.textContent).toBe("28.6 km");
    p.renderAt(at(pkg, "en", "tree"));
    expect(el(root, "roads").querySelectorAll(".po-e.s-p")).toHaveLength(7);
    p.renderAt(at(pkg, "en", "colour"));
    const exams = el(root, "exams");
    expect(new Set([...exams.querySelectorAll(".po-n")].map((n) => n.getAttribute("class")!.match(/po-k\d/)?.[0]))).toEqual(new Set(["po-k1", "po-k2", "po-k3"]));
  });

  it("fills the timetable and the Gantt chart, the truck and its table, and grows the search tree", async () => {
    const { p, root, pkg } = mk("pack-opt");
    await p.ready;
    p.renderAt(at(pkg, "en", "timetable"));
    const tt = el(root, "timetable");
    expect([...tt.querySelectorAll<HTMLElement>(".po-i")].filter((i) => i.style.opacity === "1")).toHaveLength(12);
    expect(tt.querySelector(".po-nt")!.textContent).toBe("A timetable that keeps every rule");
    p.renderAt(at(pkg, "en", "gantt"));
    expect(el(root, "print").querySelector(".po-tv")!.textContent).toBe("18 min");
    p.renderAt(at(pkg, "en", "greedy"));
    const truck = el(root, "truck");
    expect(truck.querySelectorAll(".po-kr")).toHaveLength(6);
    expect(truck.querySelector(".po-kp")!.textContent).toBe("65 points");
    p.renderAt(at(pkg, "en", "dp"));
    const table = el(root, "table");
    expect(table.querySelectorAll(".po-td")).toHaveLength(77);
    expect(table.querySelectorAll(".po-td.is-tr")).toHaveLength(7);
    p.renderAt(at(pkg, "en", "bnb"));
    const tree = el(root, "tree");
    expect(tree.querySelectorAll(".po-tn")).toHaveLength(11);
    expect(tree.querySelector(".po-tn.is-best")!.textContent).toContain("65");
    expect(tree.querySelectorAll(".po-tn.s-x").length).toBeGreaterThan(0);
  });

  it("draws the linear program's region and its corners, and slides the goal line to the best one", async () => {
    const { p, root, pkg } = mk("pack-opt");
    await p.ready;
    p.renderAt(at(pkg, "en", "lp"));
    const lp = el(root, "garden");
    expect([...lp.querySelectorAll(".po-cl")].map((t) => t.textContent)).toEqual(["", "(7, 0)", "(6, 2)", "(3, 5)", "(0, 6)"]);
    expect(lp.querySelectorAll(".po-cn.is-best")).toHaveLength(1);
    expect(lp.querySelector(".po-cn.is-best .po-cl")!.textContent).toBe("(3, 5)");
    expect([...lp.querySelectorAll(".po-lgr")].at(-1)!.textContent).toContain("30x + 40y = 290");
    // Before the line has reached it, no corner is the best yet.
    p.renderAt(at(pkg, "en", "lp", 0.75));
    expect(lp.querySelectorAll(".po-cn.is-best")).toHaveLength(0);
  });

  it("draws the same frame for the same time, whatever came before", async () => {
    const { p, root, pkg } = mk("pack-opt", "ar");
    await p.ready;
    const html = (): string => root.querySelector(".ls-stage")!.innerHTML;
    const ids = ["dijkstra", "route", "colour", "timetable", "gantt", "greedy", "dp", "lp", "bnb"];
    const times = ids.flatMap((id) => [at(pkg, "ar", id, 0.4), at(pkg, "ar", id, 0.8)]);
    const once = times.map((t) => (p.renderAt(t), html()));
    times.forEach((t, i) => {
      p.renderAt(times[(i + 5) % times.length]!);
      p.renderAt(t);
      expect(html()).toBe(once[i]);
    });
  });

  it("keeps maps, plots and the table left to right in Arabic; timetables, trees and the bag follow the language", async () => {
    const en = mk("pack-opt");
    const ar = mk("pack-opt", "ar");
    await Promise.all([en.p.ready, ar.p.ready]);
    const cx = (root: ShadowRoot): string[] => [...el(root, "map").querySelectorAll(".po-n circle")].map((c) => c.getAttribute("cx")!);
    en.p.renderAt(at(en.pkg, "en", "dijkstra"));
    ar.p.renderAt(at(ar.pkg, "ar", "dijkstra"));
    // The map keeps its geography in both languages (never flipped): west stays west. Only the card moves to the
    // reading side, and the names beside the dots may take a little more or less room.
    const xe = cx(en.root).map(Number), xa = cx(ar.root).map(Number);
    xe.forEach((x, i) => xe.forEach((y, j) => { if (Math.abs(x - y) > 1) expect(Math.sign(xa[i]! - xa[j]!), `${i} ${j}`).toBe(Math.sign(x - y)); }));
    expect(xa[0]!).toBeLessThan(xa[4]!); // Home is west of Mina (the school is a square, not a circle)
    expect(parseFloat(el(ar.root, "map").querySelector<HTMLElement>(".po-pn")!.style.left)).toBe(0);
    // The timetable's periods run right to left in Arabic.
    en.p.renderAt(at(en.pkg, "en", "timetable"));
    ar.p.renderAt(at(ar.pkg, "ar", "timetable"));
    const heads = (root: ShadowRoot): number[] => [...el(root, "timetable").querySelectorAll<HTMLElement>(".po-h")].map((h) => parseFloat(h.style.left));
    expect(heads(en.root)[0]!).toBeLessThan(heads(en.root)[3]!);
    expect(heads(ar.root)[0]!).toBeGreaterThan(heads(ar.root)[3]!);
    // The Gantt chart's time, the plot and the DP table stay left to right.
    ar.p.renderAt(at(ar.pkg, "ar", "gantt"));
    expect(el(ar.root, "print").querySelector(".po-s")!.getAttribute("dir")).toBe("ltr");
    ar.p.renderAt(at(ar.pkg, "ar", "dp"));
    expect(el(ar.root, "table").querySelector(".po")!.getAttribute("dir")).toBe("ltr");
    ar.p.renderAt(at(ar.pkg, "ar", "lp"));
    expect(el(ar.root, "garden").querySelector("svg")!.getAttribute("direction")).toBe("ltr");
    // The search tree mirrors: the first branch on the reading side; a value and its bound read like maths.
    ar.p.renderAt(at(ar.pkg, "ar", "bnb"));
    en.p.renderAt(at(en.pkg, "en", "bnb"));
    const left = (root: ShadowRoot, i: number): number => parseFloat(el(root, "tree").querySelectorAll<HTMLElement>(".po-tn")[i]!.style.left);
    expect(left(en.root, 1)).toBeLessThan(left(en.root, 6));
    expect(left(ar.root, 1)).toBeGreaterThan(left(ar.root, 6));
    expect(el(ar.root, "tree").querySelector(".po-tn")!.getAttribute("dir")).toBe("ltr");
    // Arabic labels isolate their numbers ("الحصة 1").
    expect(el(ar.root, "tree").closest(".ls-stage")).not.toBeNull();
    ar.p.renderAt(at(ar.pkg, "ar", "timetable"));
    expect(el(ar.root, "timetable").querySelector(".po-h bdi")!.textContent).toBe("1");
  });
});
