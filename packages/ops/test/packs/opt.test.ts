// The optimization pack's authoring maths, against answers worked out another way (the Optimization track's facts,
// H:\htdocs\darsi\docs\curriculum\opt.md, and brute force), plus its builders and gallery scenes.
import { describe, expect, it } from "vitest";
import { packs, check, newLesson } from "../../src/index.ts";

const o = packs.opt;
const L = ["en", "ar"];
const en = (t: unknown): string => (t as Record<string, string>).en!;
const ar = (t: unknown): string => (t as Record<string, string>).ar!;
const roads = () => ({
  nodes: o.SHORTEST.nodes.map((v) => ({ x: v.x, y: v.y, label: o.say(L, v.name.en, v.name.ar) })),
  edges: o.SHORTEST.roads.map(([a, b, w]) => ({ a, b, w })),
});

describe("Dijkstra's method", () => {
  it("finds the shortest way to school, 13 km by Tala, Kesi and Mina, settling the nearest village first", () => {
    const { nodes, edges } = roads();
    const r = o.dijkstraFrames(nodes, edges, 0, 7, L);
    expect(r.dist[7]).toBe(13);
    expect(r.path.map((i) => o.SHORTEST.nodes[i]!.name.en)).toEqual(["Home", "Tala", "Kesi", "Mina", "School"]);
    // Settled in order of distance: each frame's chosen village is never nearer than the one before.
    const settled = r.frames.slice(1, -1).map((f) => f.nodes!.indexOf("c"));
    const d = settled.map((i) => r.dist[i]!);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(en(r.frames.at(-1)!.note)).toBe("Home → Tala → Kesi → Mina → School");
    expect(ar(r.frames.at(-1)!.note)).toBe("البيت ← تالا ← كيسي ← مينا ← المدرسة");
    expect(r.frames.at(-1)!.total).toBe(13);
    for (const f of r.frames) { expect(f.nodes).toHaveLength(8); expect(f.edges).toHaveLength(14); }
  });

  it("goes round by Rubi and Sana when the bridge is flooded: 14 km", () => {
    const { nodes, edges } = roads();
    const r = o.dijkstraFrames(nodes, edges, 0, 7, L, { closed: [o.SHORTEST.bridge] });
    expect(r.dist[7]).toBe(14);
    expect(r.path).toEqual([0, 5, 6, 7]);
    for (const f of r.frames) expect(f.edges![o.SHORTEST.bridge]).toBe("x");
  });

  it("agrees with every route tried by brute force", () => {
    const { edges } = roads();
    let best = Infinity;
    const walk = (v: number, seen: Set<number>, len: number): void => {
      if (v === 7) { best = Math.min(best, len); return; }
      for (const e of edges) {
        const u = e.a === v ? e.b : e.b === v ? e.a : -1;
        if (u >= 0 && !seen.has(u)) walk(u, new Set([...seen, u]), len + e.w);
      }
    };
    walk(0, new Set([0]), 0);
    expect(best).toBe(13);
  });
});

describe("the bus route", () => {
  it("drives 34.6 km by nearest neighbour, and three 2-opt swaps bring it to 28.6 km, the best of all", () => {
    const r = o.routeFrames(o.BUS, L);
    expect(Math.round(r.nnLength * 10) / 10).toBe(34.6);
    expect(r.swaps).toHaveLength(3);
    expect(Math.round(r.bestLength * 10) / 10).toBe(28.6);
    expect(o.bestTour(o.BUS).length).toBeCloseTo(r.bestLength, 6);
    expect(r.frames.at(-1)!.total).toBe(28.6);
    // Every swap shortens the route, by the gain it reports.
    let len = r.nnLength;
    for (const s of r.swaps) { expect(s.length).toBeCloseTo(len - s.gain, 6); len = s.length; }
    // Each route visits every village once.
    expect([...r.best].sort((a, b) => a - b)).toEqual(o.BUS.map((_, i) => i));
  });
});

describe("Kruskal's spanning tree", () => {
  it("joins all 8 places with 7 roads and 25 km, the least possible", () => {
    const { nodes, edges } = roads();
    const r = o.kruskalFrames(nodes, edges, L);
    expect(r.tree).toHaveLength(7);
    expect(r.total).toBe(25);
    // Brute force over every set of 7 roads that joins all places.
    let best = Infinity;
    const m = edges.length;
    const choose = (from: number, pick: number[]): void => {
      if (pick.length === 7) {
        const root = nodes.map((_, i) => i);
        const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
        for (const k of pick) root[find(edges[k]!.a)] = find(edges[k]!.b);
        if (new Set(nodes.map((_, i) => find(i))).size === 1) best = Math.min(best, pick.reduce((s, k) => s + edges[k]!.w, 0));
        return;
      }
      for (let k = from; k < m; k++) choose(k + 1, [...pick, k]);
    };
    choose(0, []);
    expect(best).toBe(25);
  });
});

describe("exam slots", () => {
  const cl = o.clashEdges(o.EXAMS.pupils);
  const nodes = o.EXAMS.spots.map(([x, y]) => ({ x, y }));
  const edges = cl.map(([a, b]) => ({ a, b }));
  it("greedy in list order needs 4 slots, DSatur 3, and 3 is the fewest (Omar's three exams all clash)", () => {
    const g = o.colourFrames(nodes, edges, L);
    const d = o.colourFrames(nodes, edges, L, { method: "dsatur" });
    expect(g.used).toBe(4);
    expect(d.used).toBe(3);
    expect(o.fewestSlots(8, cl)).toBe(3);
    for (const r of [g, d]) for (const [a, b] of cl) expect(r.slots[a]).not.toBe(r.slots[b]);
    for (const [a, b] of [[0, 3], [0, 7], [3, 7]] as [number, number][]) expect(cl).toContainEqual([a, b]);
  });
});

describe("the truck (knapsack)", () => {
  const items = o.TRUCK.map((t) => ({ label: o.say(L, t.name.en, t.name.ar), w: t.w, v: t.v }));
  it("greedy packs solar panels, the filter and chalk: 60 points; the best is desks and books: 65", () => {
    const g = o.knapsackGreedy(items, o.TRUCK_CAP, L, { best: true });
    expect(g.value).toBe(60);
    expect(g.pick.sort()).toEqual([0, 3, 5]);
    expect(o.knapsackBest(items, o.TRUCK_CAP)).toEqual({ pick: [1, 2], value: 65, weight: 1000 });
    expect(g.frames.at(-1)!.in).toBe(".nn...");
  });
  it("fills the dynamic programming table to 65 and reads the best load back", () => {
    const d = o.knapsackDP(items, o.TRUCK_CAP, 100, L);
    expect(d.table).toHaveLength(7);
    expect(d.table[6]).toEqual([0, 3, 8, 15, 18, 33, 42, 45, 50, 57, 65]);
    expect(d.value).toBe(65);
    expect(d.pick).toEqual([1, 2]);
    // Every cell is the best value by brute force over the first k items with that much room.
    for (let k = 0; k <= 6; k++) for (let c = 0; c <= 10; c++) expect(d.table[k]![c]).toBe(o.knapsackBest(items.slice(0, k), c * 100).value);
    expect(d.frames.at(-1)!.fill).toBe(77);
  });
  it("greedy misses the best only at 1,000 kg, up to 2,000 kg", () => {
    const misses = Array.from({ length: 20 }, (_, i) => (i + 1) * 100).filter((cap) => o.knapsackGreedy(items, cap, L).value < o.knapsackBest(items, cap).value);
    expect(misses).toEqual([1000]);
  });
  it("branch and bound finds the best load and prunes what can't beat it", () => {
    for (const n of [3, 4, 6]) {
      const sub = items.slice(0, n);
      const b = o.branchAndBound(sub, o.TRUCK_CAP, L, { maxNodes: 99 });
      expect(b.value).toBe(o.knapsackBest(sub, o.TRUCK_CAP).value);
      expect(b.steps.filter((s) => s.mark === "x").length).toBeGreaterThan(0);
      // Steps come in visiting order: a parent before its children.
      b.steps.forEach((s, i) => expect(s.p).toBeLessThan(i));
    }
    const t = o.branchAndBound(items.slice(0, 3), o.TRUCK_CAP, L);
    expect(t.steps).toHaveLength(11);
    expect(t.steps.filter((s) => s.best).map((s) => s.val)).toEqual([42, 65]);
  });
});

describe("the garden (linear programming)", () => {
  it("has corners (0, 0), (7, 0), (6, 2), (3, 5), (0, 6); the best is (3, 5): 290", () => {
    const r = o.lp2d(o.GARDEN.cons, o.GARDEN.obj)!;
    expect(r.corners).toEqual([[0, 0], [7, 0], [6, 2], [3, 5], [0, 6]]);
    expect(r.corners[r.best]).toEqual([3, 5]);
    expect(r.value).toBe(290);
    // Land and hours are used up at (3, 5); water has room to spare.
    expect(r.tight[r.best]).toEqual([0, 2]);
  });
  it("moves to (6, 2) when tomatoes earn 50: 380; one more pupil-hour is worth 5", () => {
    expect(o.lp2d(o.GARDEN.cons, { a: 50, b: 40 })!.value).toBe(380);
    const more = o.GARDEN.cons.map((k, i) => (i === 2 ? { ...k, c: 19 } : k));
    expect(o.lp2d(more, o.GARDEN.obj)!.value).toBe(295);
  });
  it("is null when no plan keeps every limit", () => {
    expect(o.lp2d([{ a: 1, b: 1, c: 2, op: ">=" }, { a: 1, b: 1, c: 1 }], { a: 1, b: 1 })).toBeNull();
  });
});

describe("the timetable (propagation and search)", () => {
  const T = o.TIMETABLE;
  const lessons = T.classes.flatMap((_, k) => T.subjects.map((_s, s) => ({ klass: k, subject: s })));
  const valid = (sol: number[], rules: string[]): boolean =>
    lessons.every((a, i) => lessons.every((b, j) => i === j || (a.klass !== b.klass && a.subject !== b.subject) || sol[i] !== sol[j]))
    && rules.every((id) => { const r = T.rules[id]!; return lessons.every((l, i) => (r.klass !== undefined && r.klass !== l.klass) || (r.subject !== undefined && r.subject !== l.subject) || r.allowed.includes(sol[i]!)); });
  it("needs 8 guesses and meets 3 dead ends with Ms Huda and the maths test", () => {
    const r = o.timetableFrames(L, ["huda", "test"]);
    expect([r.guesses, r.deadEnds]).toEqual([8, 3]);
    expect(valid(r.solution!, ["huda", "test"])).toBe(true);
  });
  it("needs 2 guesses with the art room's exam too, and none exists with the lab busy as well", () => {
    const r = o.timetableFrames(L, ["huda", "test", "art"]);
    expect(r.guesses).toBe(2);
    expect(valid(r.solution!, ["huda", "test", "art"])).toBe(true);
    expect(en(r.frames.at(-1)!.note)).toBe("A timetable that keeps every rule");
    expect(o.timetableFrames(L, ["huda", "test", "art", "lab"]).solution).toBeNull();
  });
  it("swaps rows and columns in a narrow box", () => {
    const wide = o.timetableGrid({ id: "t", x: 0, y: 0, w: 1100, h: 400 }, L);
    const tall = o.timetableGrid({ id: "t", x: 0, y: 0, w: 600, h: 900 }, L);
    expect([wide.rows.length, wide.cols!.length]).toEqual([3, 4]);
    expect([tall.rows.length, tall.cols!.length]).toEqual([4, 3]);
    expect(tall.frames!.at(-1)!.at![0]).toEqual([...(wide.frames!.at(-1)!.at![0] as [number, number])].reverse());
  });
});

describe("the printing (a Gantt chart)", () => {
  it("takes 21 minutes in list order and 18 by Johnson's rule, the best of every order", () => {
    const r = o.printingFrames(L);
    expect([r.listTime, r.bestTime]).toEqual([21, 18]);
    const jobs = o.PRINTING.jobs;
    let best = Infinity;
    const perm = (left: number[], order: number[]): void => {
      if (!left.length) { best = Math.min(best, o.flowShop(jobs, order).makespan); return; }
      left.forEach((j, i) => perm([...left.slice(0, i), ...left.slice(i + 1)], [...order, j]));
    };
    perm(jobs.map((_, i) => i), []);
    expect(best).toBe(18);
  });
});

describe("builders and gallery scenes", () => {
  it("gives a default element of each type, showing its last step", () => {
    for (const t of ["graph", "schedule", "knapsack", "lp", "searchtree"]) {
      const el = o.element(t, L, { x: 10, y: 20, w: 900, h: 400 }) as unknown as { type: string; id: string; frame: number; frames?: unknown[]; steps?: unknown[] };
      expect(el.type).toBe(t);
      expect(el.id).toBe(t);
      expect(el.frame).toBe((el.frames ?? el.steps)!.length - 1);
    }
    expect(() => o.element("pie", L, { x: 0, y: 0, w: 1, h: 1 })).toThrow(/no "pie"/);
  });

  it("writes Egyptian Arabic notes for ar-EG and Modern Standard Arabic for ar", () => {
    const r = o.routeFrames(o.BUS, ["en", "ar", "ar-EG"]);
    const back = r.frames.find((f) => f.loop && !f.cut && !f.added)!.note as Record<string, string>;
    expect(back.ar).toMatch(/^نعود/);
    expect(back["ar-EG"]).toMatch(/^نرجع/);
  });

  it("validates every preset with no warnings, laid out on the stage, with keyframes on spoken words", () => {
    for (const stage of ["landscape", "portrait", "square"] as const) {
      const [W, H] = ({ landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] } as const)[stage];
      const list = o.presets(L, stage);
      expect(list.length).toBeGreaterThanOrEqual(5);
      expect(new Set(list.map((p) => p.scene.content && (p.scene as { content: { elements: { type: string }[] } }).content.elements[1]!.type))).toEqual(new Set(["graph", "schedule", "knapsack", "lp", "searchtree"]));
      for (const p of list) {
        const l = newLesson({ id: "pack-presets", title: { en: "P", ar: "ع" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], stage, createdBy: "u" }, "2026-10-29");
        l.scenes.scenes = [{ ...p.scene, id: "s" }];
        const r = check(l);
        expect(r.errors, p.id).toEqual([]);
        expect(r.warnings, p.id).toEqual([]);
        const els = (p.scene as { content: { elements: { x: number; y: number; w?: number; h?: number; anim?: { keys: { at: unknown }[] }[] }[] } }).content.elements;
        for (const el of els) expect(el.x >= 0 && el.y >= 0 && el.x + (el.w ?? 0) <= W && el.y + (el.h ?? 0) <= H, `${p.id} ${stage}`).toBe(true);
        for (const tr of els[1]!.anim ?? []) expect(tr.keys.some((k) => typeof k.at === "object"), p.id).toBe(true);
        expect(JSON.stringify(p.scene)).not.toContain("·");
      }
    }
  });
});
