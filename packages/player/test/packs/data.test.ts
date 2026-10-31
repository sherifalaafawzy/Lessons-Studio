// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Element, LessonPackage, Text } from "@lessonstudio/spec";
import { createPlayer, type Player } from "../../src/index.ts";
import { Writer } from "../../src/dom.ts";
import { kit } from "../../src/packs/data/index.ts";
import type { Ctx, KitState } from "../../src/templates/types.ts";
import { loadExample } from "../../../../scripts/lib/examples.mjs";

const pkg = (): LessonPackage => loadExample("pack-data").pkg as LessonPackage;
const elementOf = (sceneId: string): Element => {
  const s = pkg().scenes.scenes.find((x) => x.id === sceneId)!;
  return (s.content as { elements: Element[] }).elements.find((e) => kit.draw[e.type])!;
};

/** One element drawn on its own, in a language, with a painter for any state. */
function draw(el: Element, lang = "en"): { box: HTMLElement; paint: (s: Partial<KitState>) => void } {
  const rtl = lang.startsWith("ar");
  const ctx = {
    lang, dir: rtl ? "rtl" : "ltr", mirror: rtl, wr: new Writer(),
    t: (x: Text | undefined) => (x === undefined ? "" : typeof x === "string" ? x : x[lang] ?? x.en ?? ""),
  } as unknown as Ctx;
  const box = document.createElement("div");
  document.body.append(box);
  const p = kit.draw[el.type]!(el, box, ctx);
  return { box, paint: (s) => p({ reveal: 1, draw: 1, frame: 0, focus: 0, pass: -1, ...s }) };
}
const opacity = (n: Element | null): number => Number((n as HTMLElement | null)?.style.opacity ?? 1);
const left = (n: Element): number => parseFloat((n as HTMLElement).style.left);

let players: Player[] = [];
afterEach(() => {
  for (const p of players) p.destroy();
  players = [];
  document.body.replaceChildren();
});

describe("the data pack", () => {
  it("loads only for lessons that use it, and brings its CSS", async () => {
    let calls = 0;
    const mk = (id: string): ShadowRoot => {
      const host = document.createElement("div");
      document.body.append(host);
      const p = createPlayer(host, loadExample(id).pkg as LessonPackage, { lang: "en", tier: "full", orient: "landscape", now: () => 0, packs: { data: async () => { calls++; return kit; } } });
      players.push(p);
      return host.shadowRoot!;
    };
    mk("prompt-injection");
    await players[0]!.ready;
    expect(calls).toBe(0);
    const root = mk("pack-data");
    await players[1]!.ready;
    expect(calls).toBe(1);
    expect([...root.querySelectorAll("style")].some((s) => s.textContent!.includes(".pd-q"))).toBe(true);
  });

  it("draws the same frame for the same time, whatever came before", async () => {
    const p0 = pkg();
    const host = document.createElement("div");
    document.body.append(host);
    const p = createPlayer(host, p0, { lang: "ar", tier: "full", orient: "landscape", now: () => 0, packs: { data: async () => kit } });
    players.push(p);
    await p.ready;
    const html = (): string => host.shadowRoot!.querySelector(".ls-stage")!.innerHTML;
    const times = ["library", "top", "having", "stream", "batch", "fill", "clean"].flatMap((id) => {
      const s = p0.timing.ar!.scenes.find((x) => x.id === id)!;
      return [0.45, 0.8].map((k) => s.start + (s.end - s.start) * k);
    });
    const once = times.map((t) => (p.renderAt(t), html()));
    times.forEach((t, i) => {
      p.renderAt(times[(i + 3) % times.length]!);
      p.renderAt(t);
      expect(html()).toBe(once[i]);
    });
  });
});

describe("erd", () => {
  it("draws the tables with their keys, and crow's feet on the relationships", () => {
    const { box, paint } = draw(elementOf("library"));
    paint({});
    expect([...box.querySelectorAll(".pd-tn")].map((n) => n.textContent)).toEqual(["members", "loans", "books"]);
    expect(box.querySelectorAll(".pd-tc.is-pk")).toHaveLength(3);
    expect(box.querySelectorAll(".pd-rel")).toHaveLength(2);
    // Each line ends in a fork (many) at loans and two bars (one) at the other table: 6 extra moves per line.
    for (const g of box.querySelectorAll(".pd-rel path")) expect((g.getAttribute("d")!.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("brings tables in one by one and lights a relationship and its key columns", () => {
    const { box, paint } = draw(elementOf("library"));
    paint({ reveal: 0.4 });
    expect([...box.querySelectorAll(".pd-t")].map(opacity)).toEqual([1, 0.2, 0]);
    paint({ focus: 4 });
    expect(box.querySelectorAll(".pd-rel.is-on")).toHaveLength(1);
    expect([...box.querySelectorAll(".pd-tc.is-on .pd-cn")].map((n) => n.textContent)).toEqual(["id", "member_id"]);
    paint({ focus: 2 });
    expect(box.querySelector(".pd-t.is-on .pd-tn")!.textContent).toBe("loans");
  });

  it("mirrors the tables in Arabic, names and types staying left to right", () => {
    const en = draw(elementOf("library")).box;
    const ar = draw(elementOf("library"), "ar").box;
    const x = (b: HTMLElement) => [...b.querySelectorAll(".pd-t")].map(left);
    expect(x(en)[0]! < x(en)[2]!).toBe(true);
    expect(x(ar)[0]! > x(ar)[2]!).toBe(true);
    expect(ar.querySelector(".pd-t")!.getAttribute("dir")).toBe("ltr");
    expect(ar.querySelector(".pd-tl")!.textContent).toBe("الأعضاء");
  });
});

describe("query", () => {
  it("lights each clause in turn and numbers the clauses in the order they run", () => {
    const { box, paint } = draw(elementOf("top"));
    paint({ frame: 1 });
    const lines = [...box.querySelectorAll(".pd-ln")];
    expect(lines.map((l) => l.classList.contains("is-now"))).toEqual([false, false, true, false, false]);
    expect(lines.map((l) => l.querySelector(".pd-b")!.textContent)).toEqual(["3", "1", "2", "4", "5"]);
    expect(lines.map((l) => opacity(l.querySelector(".pd-b")))).toEqual([0, 1, 1, 0, 0]);
    expect(box.querySelector(".pd-sql")!.getAttribute("dir")).toBe("ltr");
  });

  it("strikes out the rows WHERE drops, then closes the gap", () => {
    const { box, paint } = draw(elementOf("top"));
    paint({ frame: 1 });
    const grid = box.querySelectorAll(".pd-g")[0]!;
    const out = [...grid.querySelectorAll(".pd-r.is-out")].map((r) => r.querySelector(".pd-c")!.textContent);
    expect(out).toEqual(["Joseph", "Omar"]);
    paint({ frame: 2 });
    expect([...grid.querySelectorAll(".pd-r")].filter((r) => opacity(r) === 0)).toHaveLength(2);
    // The header lights the columns SELECT uses and dims the others.
    expect([...grid.querySelectorAll(".pd-h .pd-c")].map((c) => [c.classList.contains("is-lit"), opacity(c)])).toEqual([[true, 1], [false, 0.28], [true, 1]]);
  });

  it("sorts by moving rows, cuts at LIMIT and frames the result", () => {
    const { box, paint } = draw(elementOf("top"));
    const R = box.querySelectorAll(".pd-g")[1]!;
    const ys = (): number[] => [...R.querySelectorAll<HTMLElement>(".pd-r")].map((r) => parseFloat(/translateY\(([\d.]+)px/.exec(r.style.transform)![1]!));
    paint({ frame: 3 });
    const before = ys();
    paint({ frame: 4 });
    const after = ys();
    expect(after).not.toEqual(before);
    expect(R.querySelector(".pd-ar")!.textContent).toBe("");
    expect([...R.querySelectorAll(".pd-ar")].map((a) => a.textContent)).toEqual(["", "↓"]);
    paint({ frame: 3.5 });
    const mid = ys();
    mid.forEach((y, i) => expect(y).toBeCloseTo((before[i]! + after[i]!) / 2, 0));
    paint({ frame: 5 });
    expect(opacity(R.querySelector(".pd-cut"))).toBe(1);
    paint({ frame: 6 });
    expect(R.classList.contains("is-res")).toBe(true);
  });

  it("joins rows with lines, then shows the rows the join makes", () => {
    const { box, paint } = draw(elementOf("having"));
    paint({ frame: 1 });
    const links = [...box.querySelectorAll(".pd-link")];
    expect(links).toHaveLength(5);
    expect(links.every((l) => opacity(l) === 1)).toBe(true);
    expect(box.querySelectorAll(".pd-split").length).toBeGreaterThan(0);
    paint({ frame: 2 });
    expect(links.every((l) => opacity(l) === 0)).toBe(true);
    paint({ frame: 3 });
    const W = box.querySelectorAll(".pd-g")[2]!;
    expect(W.querySelectorAll(".pd-r.pd-k0")).toHaveLength(3);
    expect(W.querySelectorAll(".pd-r.pd-k1")).toHaveLength(2);
  });

  it("runs the tables right to left in Arabic, the SQL and column names left to right", () => {
    const { box, paint } = draw(elementOf("top"), "ar");
    paint({ frame: 0 });
    const grid = box.querySelector(".pd-g")!;
    expect(grid.getAttribute("dir")).toBe("rtl");
    expect(grid.querySelector(".pd-h .pd-c span[dir]")!.getAttribute("dir")).toBe("ltr");
    expect(grid.querySelector(".pd-r .pd-c")!.textContent).toBe("أمينة");
    expect(left(box.querySelector(".pd-sql")!)).toBeGreaterThan(400);
  });
});

describe("pipeline", () => {
  it("moves the records and counts them; a bad one is caught and set aside", () => {
    const el = elementOf("stream") as Extract<Element, { type: "pipeline" }>;
    const { box, paint } = draw(el);
    const dots = [...box.querySelectorAll(".pd-dot")];
    paint({ frame: 0 });
    const x0 = dots.map((d) => d.getAttribute("cx"));
    paint({ frame: 2.5 });
    expect(dots.map((d) => d.getAttribute("cx"))).not.toEqual(x0);
    const last = el.frames.length - 1;
    paint({ frame: last });
    expect([...box.querySelectorAll(".pd-st .pd-cnt")].map((c) => Number(c.textContent))).toEqual(el.frames[last]!.slice(0, 4));
    expect(box.querySelector(".pd-tray .pd-cnt")!.textContent).toBe("1");
    expect(box.querySelectorAll(".pd-dot.is-bad")).toHaveLength(1);
    paint({ pass: 0 });
    expect(dots.map((d) => d.getAttribute("cx"))).toEqual(x0);
  });

  it("turns a retried record ok, and mirrors the flow in Arabic", () => {
    const el = elementOf("batch") as Extract<Element, { type: "pipeline" }>;
    const { box, paint } = draw(el);
    paint({ frame: el.frames.length - 1 });
    expect(box.querySelectorAll(".pd-dot.is-ok")).toHaveLength(1);
    const ar = draw(el, "ar").box;
    const x = (b: HTMLElement) => [...b.querySelectorAll(".pd-st")].map(left);
    expect(x(box)[0]! < x(box)[2]!).toBe(true);
    expect(x(ar)[0]! > x(ar)[2]!).toBe(true);
  });
});

describe("sheet", () => {
  it("fills a formula down, the selection and the formula bar following", () => {
    const { box, paint } = draw(elementOf("fill"));
    paint({ frame: 0 });
    expect(box.querySelector(".pd-nb")!.textContent).toBe("D2");
    expect(box.querySelector(".pd-ff")!.textContent).toBe("=AVERAGE(B2:C2)");
    paint({ frame: 2 });
    expect(box.querySelector(".pd-nb")!.textContent).toBe("D4");
    expect(box.querySelector(".pd-ff")!.textContent).toBe("=AVERAGE(B4:C4)");
    const shownD = [...box.querySelectorAll(".pd-sc")].filter((_, i) => i % 4 === 3).map((c) => opacity(c.querySelector(".pd-v")));
    expect(shownD).toEqual([1, 1, 1, 1, 0, 0]);
    expect([...box.querySelectorAll(".pd-sh.is-sel")].map((n) => n.textContent)).toEqual(["D", "4"]);
  });

  it("marks the issues, fixes the typo and strikes out the repeated row", () => {
    const { box, paint } = draw(elementOf("clean"));
    paint({ frame: 0, focus: 1 });
    expect(box.querySelectorAll(".pd-is")).toHaveLength(3);
    expect(box.querySelector(".pd-is.is-on")!.classList.contains("pd-is-typo")).toBe(true);
    expect([...box.querySelectorAll(".pd-tag")].map(opacity)).toEqual([1, 0, 0]);
    paint({ frame: 2 });
    expect(box.querySelectorAll(".pd-is.is-fixed")).toHaveLength(2);
    expect(box.querySelectorAll(".pd-sc.is-out")).toHaveLength(3);
    expect(box.querySelector(".pd-sc.is-new")!.textContent).toContain("Tomatoes");
  });

  it("runs right to left in Arabic, column A on the right, numbers left to right", () => {
    const { box, paint } = draw(elementOf("fill"), "ar");
    paint({ frame: 4 });
    const letters = [...box.querySelectorAll(".pd-sh")].filter((n) => /^[A-D]$/.test(n.textContent!));
    expect(letters.map((n) => n.textContent)).toEqual(["A", "B", "C", "D"]);
    expect(left(letters[0]!)).toBeGreaterThan(left(letters[3]!));
    expect(box.querySelector(".pd-num bdi")!.getAttribute("dir")).toBe("ltr");
    expect(box.querySelector(".pd-ff")!.getAttribute("dir")).toBe("ltr");
  });
});
