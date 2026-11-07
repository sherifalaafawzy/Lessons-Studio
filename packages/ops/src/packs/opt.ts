/**
 * Optimization pack: content computed when a lesson is made (never on the phone), and ready-made elements and scenes with
 * labels in English and Arabic. Seeded, so the same call always gives the same lesson.
 *
 * The school problems are the Optimization track's own (H:\htdocs\darsi\docs\curriculum\opt.md "Facts the courses use"),
 * with the same numbers as Darsi's Labs: the shortest way to school (13 km; 14 km with the bridge flooded), the bus
 * route (nearest neighbour 34.6 km, three 2-opt swaps to 28.6 km), exam slots (greedy 4, DSatur 3), the truck (greedy
 * 60 points, best 65), the garden (best corner (3, 5): 290) and the timetable (propagation and search).
 */
import type { AnimProp, Ease, Element, Orient, Scene, Text, Tone, Track, When } from "@lessonstudio/spec";

type El<T extends string> = Extract<Element, { type: T }>;
export type GraphElement = El<"graph">;
export type ScheduleElement = El<"schedule">;
export type KnapsackElement = El<"knapsack">;
export type LpElement = El<"lp">;
export type SearchTreeElement = El<"searchtree">;
export type GraphNode = GraphElement["nodes"][number];
export type GraphEdge = NonNullable<GraphElement["edges"]>[number];
export type GraphFrame = NonNullable<GraphElement["frames"]>[number];
export type ScheduleItem = ScheduleElement["items"][number];
export type ScheduleFrame = NonNullable<ScheduleElement["frames"]>[number];
export type KnapsackFrame = NonNullable<KnapsackElement["frames"]>[number];
export type LpConstraint = LpElement["cons"][number];
export type SearchStep = SearchTreeElement["steps"][number];
export interface Box { id: string; x: number; y: number; w: number; h: number }

/* ---------- words in every language ---------- */

const isAr = (l: string): boolean => l.split("-")[0] === "ar";
/** A name in English, Modern Standard Arabic and (when it differs) the Egyptian Arabic of the Darsi videos. */
export interface Name { en: string; ar: string; eg?: string }
/** Text for the lesson's languages: English, the Arabic for every Arabic variant, Egyptian Arabic for ar-EG if given. */
export function say(langs: string[], en: string, ar: string, eg?: string): Text {
  return Object.fromEntries(langs.map((l) => [l, isAr(l) ? (l === "ar-EG" && eg ? eg : ar) : en]));
}
const sayN = (langs: string[], n: Name): Text => say(langs, n.en, n.ar, n.eg);
/** Text built per language: f(name in that language, Arabic?, Egyptian?). */
const per = (langs: string[], f: (ar: boolean, eg: boolean, l: string) => string): Text => Object.fromEntries(langs.map((l) => [l, f(isAr(l), l === "ar-EG", l)]));
/** A Text's words in one language (an Arabic variant falls back to any Arabic). */
export function inLang(t: Text | undefined, l: string): string {
  if (t === undefined) return "";
  if (typeof t === "string") return t;
  return t[l] ?? (isAr(l) ? Object.entries(t).find(([k]) => isAr(k))?.[1] : t.en) ?? Object.values(t)[0] ?? "";
}
const r1 = (v: number): number => Math.round(v * 10) / 10;
/** A number for a note: one decimal at most; thousands with a comma in English. */
const fmt = (v: number, ar = false): string => {
  const s = String(r1(v));
  return ar || Math.abs(v) < 1000 ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const KM: Name = { en: "km", ar: "كم", eg: "كيلو" };

/* ---------- maps and datasets ---------- */

/** The shortest way to school (Darsi's `shortest` lab): road lengths in km; map units only place the villages. */
export const SHORTEST = {
  nodes: [
    { x: 1, y: 5, name: { en: "Home", ar: "البيت" }, at: "b" },
    { x: 3, y: 8.2, name: { en: "Tala", ar: "تالا" }, at: "t" },
    { x: 4, y: 4.6, name: { en: "Bora", ar: "بورا" }, at: "b" },
    { x: 5.4, y: 8.6, name: { en: "Kesi", ar: "كيسي" }, at: "t" },
    { x: 6.6, y: 6.4, name: { en: "Mina", ar: "مينا" }, at: "r" },
    { x: 3.8, y: 1.5, name: { en: "Rubi", ar: "روبي" }, at: "b" },
    { x: 7.2, y: 2.4, name: { en: "Sana", ar: "سانا" }, at: "b" },
    { x: 9, y: 5, name: { en: "School", ar: "المدرسة" }, at: "b", square: true },
  ] as { x: number; y: number; name: Name; at: GraphNode["at"]; square?: boolean }[],
  roads: [
    [0, 1, 4], [0, 2, 5], [0, 5, 6], [1, 3, 3], [1, 2, 5], [2, 4, 6], [2, 5, 4], [2, 7, 10, 0.1, 0.3],
    [3, 4, 2], [3, 7, 8, -0.22], [4, 7, 4], [4, 6, 5], [5, 6, 5], [6, 7, 3],
  ] as [number, number, number, number?, number?][],
  home: 0,
  school: 7,
  /** The bridge between Kesi and Mina (road 8): flooded, the shortest way is 14 km by Rubi and Sana. */
  bridge: 8,
};

/** The school bus route (Darsi's `routes` lab): the school (0) and nine villages, in km. */
export const BUS: { x: number; y: number }[] = [
  { x: 5, y: 5 },
  { x: 8.6, y: 3.6 }, { x: 2.7, y: 1.5 }, { x: 2.8, y: 5.1 }, { x: 1.5, y: 9 }, { x: 6, y: 6.6 },
  { x: 7, y: 8.2 }, { x: 3.7, y: 7.4 }, { x: 4.6, y: 0.9 }, { x: 7.2, y: 1.6 },
];

/** Exam slots (Darsi's `colouring` lab): two exams clash when a pupil takes both. */
export const EXAMS = {
  names: [
    { en: "Maths", ar: "الرياضيات" }, { en: "English", ar: "الإنجليزية" }, { en: "Science", ar: "العلوم" }, { en: "Arabic", ar: "العربية" },
    { en: "History", ar: "التاريخ" }, { en: "Geography", ar: "الجغرافيا" }, { en: "Art", ar: "الفنون" }, { en: "French", ar: "الفرنسية" },
  ] as Name[],
  spots: [[2, 8.4], [5, 8.9], [8, 8.4], [8.7, 5], [8, 1.6], [5, 1.1], [2, 1.6], [1.3, 5]] as [number, number][],
  at: ["t", "t", "t", "r", "b", "b", "b", "l"] as GraphNode["at"][],
  /** Sami, Hala, Omar, Dina, Nadia and Tarek, and the exams each takes. */
  pupils: [[1, 2], [4, 5, 6], [0, 3, 7], [3, 6], [2, 7], [2, 3, 7]],
};
/** The clashes: pairs of exams some pupil takes both of, in order. */
export function clashEdges(groups: number[][]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const g of groups) for (const a of g) for (const b of g) if (a < b && !seen.has(`${a}-${b}`)) { seen.add(`${a}-${b}`); out.push([a, b]); }
  return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

/** Pack the truck (Darsi's `knapsack` lab): a 1,000 kg truck to a village school; value in points. */
export const TRUCK: { name: Name; short: Name; w: number; v: number }[] = [
  { name: { en: "Solar panels", ar: "ألواح شمسية" }, short: { en: "solar", ar: "الألواح" }, w: 600, v: 42 },
  { name: { en: "Desks", ar: "مقاعد" }, short: { en: "desks", ar: "المقاعد" }, w: 500, v: 33 },
  { name: { en: "Books", ar: "كتب" }, short: { en: "books", ar: "الكتب" }, w: 500, v: 32 },
  { name: { en: "Water filter", ar: "فلتر ماء" }, short: { en: "filter", ar: "الفلتر" }, w: 300, v: 15 },
  { name: { en: "Footballs", ar: "كرات قدم" }, short: { en: "balls", ar: "الكرات" }, w: 200, v: 8 },
  { name: { en: "Chalk, paper", ar: "طباشير وورق" }, short: { en: "chalk", ar: "الطباشير" }, w: 100, v: 3 },
];
export const TRUCK_CAP = 1000;
const KG: Name = { en: "kg", ar: "كغ", eg: "كيلو" };
const PTS: Name = { en: "points", ar: "نقطة", eg: "نقطة" };

/** The school garden (Darsi's `lp` lab): x tomato beds, y bean beds; profit 30x + 40y. */
export const GARDEN = {
  cons: [
    { a: 1, b: 1, c: 8, name: { en: "Land", ar: "الأرض" } },
    { a: 2, b: 1, c: 14, name: { en: "Water", ar: "الماء", eg: "المية" } },
    { a: 1, b: 3, c: 18, name: { en: "Pupils' hours", ar: "ساعات التلاميذ" } },
  ],
  obj: { a: 30, b: 40 },
  x: { en: "Tomato beds", ar: "أحواض الطماطم" } as Name,
  y: { en: "Bean beds", ar: "أحواض الفاصوليا" } as Name,
  goal: { en: "Profit", ar: "الربح" } as Name,
};

/** A small timetable (Darsi's `timetable` lab): three classes, four periods, four teachers. */
export const TIMETABLE = {
  periods: 4,
  classes: ["5A", "5B", "6A"],
  subjects: [
    { name: { en: "Maths", ar: "رياضيات" }, teacher: { en: "Musa", ar: "موسى" }, tone: "accent" as Tone },
    { name: { en: "Science", ar: "علوم" }, teacher: { en: "Huda", ar: "هدى" }, tone: "ok" as Tone },
    { name: { en: "English", ar: "إنجليزي" }, teacher: { en: "Ali", ar: "علي" }, tone: "accent2" as Tone },
    { name: { en: "Art", ar: "فنون" }, teacher: { en: "Rana", ar: "رنا" }, tone: "danger" as Tone },
  ],
  /** Rules that take periods away (0-based periods). Lessons are class × subject; each subject has one teacher. */
  rules: {
    huda: { subject: 1, allowed: [0, 1, 2], say: { en: "Ms Huda leaves after period 3", ar: "تغادر الأستاذة هدى بعد الحصة 3", eg: "الأستاذة هدى بتمشي بعد الحصة 3" } },
    test: { klass: 2, subject: 0, allowed: [0], say: { en: "6A's maths test is in period 1", ar: "اختبار رياضيات 6A في الحصة 1", eg: "امتحان رياضيات 6A في الحصة 1" } },
    art: { subject: 3, allowed: [0, 1, 3], say: { en: "The art room has an exam in period 3", ar: "في غرفة الفنون امتحان في الحصة 3", eg: "أوضة الفنون فيها امتحان في الحصة 3" } },
    lab: { subject: 1, allowed: [1, 2, 3], say: { en: "The lab is busy in period 1", ar: "المختبر مشغول في الحصة 1", eg: "المعمل مشغول في الحصة 1" } },
  } as Record<string, { klass?: number; subject?: number; allowed: number[]; say: Name }>,
};

/** Exam papers to print, then staple, for five classes (minutes): a two-machine flow shop. */
export const PRINTING = {
  machines: [{ en: "Copier", ar: "آلة النسخ", eg: "ماكينة التصوير" }, { en: "Stapler", ar: "الدبّاسة" }] as Name[],
  jobs: [
    { name: "5A", a: 5, b: 2 }, { name: "5B", a: 2, b: 4 }, { name: "6A", a: 4, b: 5 }, { name: "6B", a: 2, b: 3 }, { name: "7A", a: 3, b: 2 },
  ],
};

/* ---------- graph algorithms, step by step ---------- */

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const nameOf = (nodes: GraphNode[], i: number, l: string): string => inLang(nodes[i]?.label, l) || String(i + 1);
const unitOf = (u: Name | undefined, ar: boolean, eg: boolean): string => (u ? (ar ? (eg && u.eg ? u.eg : u.ar) : u.en) : "");

/**
 * Dijkstra's method from `from` to `to`, one frame per village settled: the waiting villages (frontier) with their
 * tentative distances, the one settled now and the roads checked from it, then the shortest path. `closed` roads are
 * never used (a flooded bridge).
 */
export function dijkstraFrames(nodes: GraphNode[], edges: GraphEdge[], from: number, to: number, langs: string[], o: { closed?: number[]; unit?: Name } = {}): { frames: GraphFrame[]; dist: number[]; path: number[] } {
  const n = nodes.length;
  const closed = new Set(o.closed ?? []);
  const unit = o.unit ?? KM;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const via = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  d[from] = 0;
  const frames: GraphFrame[] = [];
  const vals = (): (number | string)[] => d.map((x) => (x === Infinity ? "∞" : r1(x)));
  const snap = (cur: number, checked: number[], note: Text): GraphFrame => ({
    nodes: d.map((x, i) => (i === cur ? "c" : done[i] ? "v" : x < Infinity ? "f" : ".")).join(""),
    edges: edges.map((_, k) => (closed.has(k) ? "x" : checked.includes(k) ? "c" : via.some((e, i) => e === k && done[i] && i !== cur) ? "t" : ".")).join(""),
    vals: vals(),
    note,
  });
  frames.push(snap(-1, [], per(langs, (ar, eg, l) => ar
    ? `${eg ? "نبدأ من" : "نبدأ من"} ${nameOf(nodes, from, l)}: 0 ${unitOf(unit, ar, eg)}، والباقي ∞`
    : `Start at ${nameOf(nodes, from, l)}: 0 ${unit.en}; the rest ∞`)));
  for (;;) {
    let v = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i]! < Infinity && (v < 0 || d[i]! < d[v]!)) v = i;
    if (v < 0) break;
    done[v] = true;
    const checked: number[] = [];
    const lowered: number[] = [];
    edges.forEach((e, k) => {
      if (closed.has(k) || (e.a !== v && e.b !== v)) return;
      const u = e.a === v ? e.b : e.a;
      if (done[u]) return;
      checked.push(k);
      const nd = d[v]! + (e.w ?? 1);
      if (nd < d[u]! - 1e-9) { d[u] = nd; prev[u] = v; via[u] = k; lowered.push(u); }
    });
    const dv = fmt(d[v]!);
    frames.push(snap(v, checked, per(langs, (ar, eg, l) => {
      const u = unitOf(unit, ar, eg);
      const nm = nameOf(nodes, v, l);
      if (v === to) return ar ? `ثبّتنا ${nm}: ${dv} ${u}` : `${nm} is settled: ${dv} ${u}`;
      if (!checked.length) return ar ? `نثبّت ${nm}: ${dv} ${u}` : `Settle ${nm}: ${dv} ${u}`;
      // Egyptian names the place again ("طرق البيت") rather than a pronoun that must agree with it (البيت is masculine, a village feminine).
      return ar ? (eg ? `نثبّت ${nm}: ${dv} ${u}، ونشوف طرق ${nm}` : `نثبّت ${nm}: ${dv} ${u}، ونفحص طرقها`) : `Settle ${nm}: ${dv} ${u}; check its roads`;
    })));
    if (v === to) break;
  }
  const path: number[] = [];
  if (d[to]! < Infinity) for (let v = to; v >= 0; v = prev[v]!) path.unshift(v);
  const onPath = new Set(path);
  const pathEdges = new Set(path.slice(1).map((v) => via[v]!));
  frames.push({
    nodes: d.map((_, i) => (onPath.has(i) ? "p" : done[i] ? "v" : ".")).join(""),
    edges: edges.map((_, k) => (closed.has(k) ? "x" : pathEdges.has(k) ? "p" : ".")).join(""),
    vals: vals(),
    path,
    total: r1(d[to]!),
    note: per(langs, (ar, _eg, l) => path.map((v) => nameOf(nodes, v, l)).join(ar ? " ← " : " → ")),
  });
  return { frames, dist: d, path };
}

/** Nearest neighbour from the school (0): every partial route on the way. */
export function nearestNeighbour(pts: Pt[]): number[][] {
  const route = [0];
  const left = new Set(pts.map((_, i) => i).slice(1));
  const out = [route.slice()];
  while (left.size) {
    const here = pts[route[route.length - 1]!]!;
    let next = -1;
    for (const v of left) if (next < 0 || dist(here, pts[v]!) < dist(here, pts[next]!) - 1e-12) next = v;
    route.push(next);
    left.delete(next);
    out.push(route.slice());
  }
  return out;
}
/** A closed route's length (back to its start). */
export const tourLength = (pts: Pt[], route: number[]): number => route.reduce((s, v, i) => s + dist(pts[v]!, pts[route[(i + 1) % route.length]!]!), 0);
const pathLength = (pts: Pt[], route: number[]): number => route.slice(1).reduce((s, v, i) => s + dist(pts[route[i]!]!, pts[v]!), 0);

export interface Swap { route: number[]; length: number; gain: number; out: [number, number][]; in: [number, number][] }
/** 2-opt, best swap first: take out the two roads whose swap shortens the route most, reverse the stretch between. */
export function twoOpt(pts: Pt[], start: number[], maxSteps = 50): Swap[] {
  let route = start.slice();
  const n = route.length;
  const out: Swap[] = [];
  for (let step = 0; step < maxSteps && n > 3; step++) {
    let bi = -1, bk = -1, bg = 1e-9;
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 2; k < n; k++) {
        if (i === 0 && k === n - 1) continue;
        const a = pts[route[i]!]!, b = pts[route[i + 1]!]!, c = pts[route[k]!]!, e = pts[route[(k + 1) % n]!]!;
        const g = dist(a, b) + dist(c, e) - dist(a, c) - dist(b, e);
        if (g > bg) { bg = g; bi = i; bk = k; }
      }
    }
    if (bi < 0) break;
    const r = route;
    const removed: [number, number][] = [[r[bi]!, r[bi + 1]!], [r[bk]!, r[(bk + 1) % n]!]];
    const added: [number, number][] = [[r[bi]!, r[bk]!], [r[bi + 1]!, r[(bk + 1) % n]!]];
    route = [...r.slice(0, bi + 1), ...r.slice(bi + 1, bk + 1).reverse(), ...r.slice(bk + 1)];
    out.push({ route: route.slice(), length: tourLength(pts, route), gain: bg, out: removed, in: added });
  }
  return out;
}

/**
 * A bus route improving: nearest neighbour builds it village by village, then 2-opt swaps (each in two frames: the two
 * roads taken out, then the stretch reversed) until no swap helps. Totals are the route's length.
 */
export function routeFrames(pts: Pt[], langs: string[], o: { unit?: Name } = {}): { frames: GraphFrame[]; nn: number[]; nnLength: number; best: number[]; bestLength: number; swaps: Swap[] } {
  const unit = o.unit ?? KM;
  const steps = nearestNeighbour(pts);
  const n = pts.length;
  const frames: GraphFrame[] = [];
  const u = (ar: boolean, eg: boolean): string => unitOf(unit, ar, eg);
  const states = (f: (i: number) => string): string => Array.from({ length: n }, (_, i) => f(i)).join("");
  steps.forEach((route, k) => {
    const last = route[route.length - 1]!;
    const leg = k ? dist(pts[route[route.length - 2]!]!, pts[last]!) : 0;
    frames.push({
      nodes: states((i) => (i === last ? "c" : route.includes(i) ? "v" : ".")),
      path: route.slice(),
      total: r1(pathLength(pts, route)),
      note: k === 0
        ? say(langs, "Start at the school", "نبدأ من المدرسة")
        : per(langs, (ar, eg) => ar ? `الأقرب: القرية ${last}، ${fmt(leg)} ${u(ar, eg)}` : `Nearest: village ${last}, ${fmt(leg)} ${unit.en}`),
    });
  });
  const nn = steps[steps.length - 1]!;
  const nnLength = tourLength(pts, nn);
  frames.push({ nodes: states(() => "v"), path: nn, loop: true, total: r1(nnLength), note: per(langs, (ar, eg) => ar ? (eg ? `نرجع للمدرسة: ${fmt(nnLength)} ${u(ar, eg)}` : `نعود إلى المدرسة: ${fmt(nnLength)} ${u(ar, eg)}`) : `Back to school: ${fmt(nnLength)} ${unit.en}`) });
  const swaps = twoOpt(pts, nn);
  let route = nn;
  for (const s of swaps) {
    const ends = new Set(s.out.flat());
    frames.push({ nodes: states((i) => (ends.has(i) ? "c" : ".")), path: route, loop: true, cut: s.out, total: r1(tourLength(pts, route)), note: say(langs, "Take out two roads", "نزيل طريقين", "نشيل طريقين") });
    route = s.route;
    frames.push({ nodes: states((i) => (ends.has(i) ? "c" : ".")), path: route, loop: true, added: s.in, total: r1(s.length), note: per(langs, (ar, eg) => ar ? (eg ? `نعكس الجزء اللي بينهم: نوفّر ${fmt(s.gain)} ${u(ar, eg)}` : `نعكس الجزء بينهما: نوفّر ${fmt(s.gain)} ${u(ar, eg)}`) : `Reverse the stretch between: ${fmt(s.gain)} ${unit.en} saved`) });
  }
  const bestLength = tourLength(pts, route);
  frames.push({ nodes: states(() => "v"), path: route, loop: true, total: r1(bestLength), note: say(langs, "No swap helps any more", "لم يعد أي تبديل يفيد", "مفيش تبديل بيفيد تاني") });
  return { frames, nn, nnLength, best: route, bestLength, swaps };
}

/** The shortest closed route of all, by dynamic programming over sets (Held–Karp); for tests and small maps. */
export function bestTour(pts: Pt[]): { route: number[]; length: number } {
  const n = pts.length;
  const m = n - 1;
  const full = (1 << m) - 1;
  const cost = new Float64Array((full + 1) * m).fill(Infinity);
  const from = new Int8Array((full + 1) * m).fill(-1);
  for (let j = 0; j < m; j++) cost[(1 << j) * m + j] = dist(pts[0]!, pts[j + 1]!);
  for (let set = 1; set <= full; set++) {
    for (let j = 0; j < m; j++) {
      if (!(set & (1 << j))) continue;
      const cur = cost[set * m + j]!;
      if (cur === Infinity) continue;
      for (let k = 0; k < m; k++) {
        if (set & (1 << k)) continue;
        const nxt = set | (1 << k);
        const c = cur + dist(pts[j + 1]!, pts[k + 1]!);
        if (c < cost[nxt * m + k]!) { cost[nxt * m + k] = c; from[nxt * m + k] = j; }
      }
    }
  }
  let end = 0, length = Infinity;
  for (let j = 0; j < m; j++) { const c = cost[full * m + j]! + dist(pts[j + 1]!, pts[0]!); if (c < length) { length = c; end = j; } }
  const back: number[] = [];
  for (let set = full, j = end; j >= 0;) { back.push(j + 1); const p = from[set * m + j]!; set &= ~(1 << j); j = p; }
  return { route: [0, ...back.reverse()], length };
}

/**
 * Kruskal's method: roads from the shortest up, each taken unless it closes a loop, until every place is joined (a
 * minimum spanning tree: the least road to pave so all villages connect). The road looked at now is `c` if taken and
 * `x` if refused; earlier ones stay `t` or dim.
 */
export function kruskalFrames(nodes: GraphNode[], edges: GraphEdge[], langs: string[], o: { unit?: Name } = {}): { frames: GraphFrame[]; tree: number[]; total: number } {
  const unit = o.unit ?? KM;
  const n = nodes.length;
  const root = nodes.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  const order = edges.map((_, k) => k).sort((p, q) => (edges[p]!.w ?? 1) - (edges[q]!.w ?? 1) || p - q);
  const st = edges.map(() => ".");
  const tree: number[] = [];
  let total = 0;
  const frames: GraphFrame[] = [{ nodes: ".".repeat(n), edges: st.join(""), total: 0, note: say(langs, "Shortest roads first; never close a loop", "الأقصر أولًا، ولا نغلق دائرة أبدًا", "الأقصر الأول، ومنقفلش دايرة أبدًا") }];
  const touched = new Set<number>();
  for (const k of order) {
    if (tree.length >= n - 1) break;
    for (let j = 0; j < st.length; j++) { if (st[j] === "c") st[j] = "t"; if (st[j] === "x") st[j] = "-"; }
    const e = edges[k]!;
    const ok = find(e.a) !== find(e.b);
    const w = fmt(e.w ?? 1);
    if (ok) { root[find(e.a)] = find(e.b); tree.push(k); total += e.w ?? 1; touched.add(e.a); touched.add(e.b); }
    st[k] = ok ? "c" : "x";
    frames.push({
      nodes: nodes.map((_, i) => (i === e.a || i === e.b ? "c" : touched.has(i) ? "v" : ".")).join(""),
      edges: st.join(""),
      total: r1(total),
      note: per(langs, (ar, eg, l) => {
        const pair = ar ? `${nameOf(nodes, e.a, l)} و${nameOf(nodes, e.b, l)}` : `${nameOf(nodes, e.a, l)}–${nameOf(nodes, e.b, l)}`;
        const u = unitOf(unit, ar, eg);
        if (ar) return ok ? `${pair}، ${w} ${u}: نأخذه` : (eg ? `${pair}، ${w} ${u}: لأ، هيقفل دايرة` : `${pair}، ${w} ${u}: لا، يغلق دائرة`);
        return ok ? `${pair}, ${w} ${u}: take it` : `${pair}, ${w} ${u}: no, it closes a loop`;
      }),
    });
  }
  frames.push({
    nodes: "v".repeat(n),
    edges: edges.map((_, k) => (tree.includes(k) ? "p" : "-")).join(""),
    total: r1(total),
    note: per(langs, (ar, eg) => ar ? (eg ? `كل الأماكن اتوصلت بـ ${fmt(total)} ${unitOf(unit, ar, eg)}` : `اتصلت كل الأماكن بـ ${fmt(total)} ${unitOf(unit, ar, eg)}`) : `Every place joined: ${fmt(total)} ${unit.en}`),
  });
  return { frames, tree, total };
}

/**
 * Colouring (exam slots): each step gives one exam the first slot none of its clashes use. `greedy` takes the exams in
 * list order (or `order`); `dsatur` always takes the exam whose clashes already use the most different slots.
 */
export function colourFrames(nodes: GraphNode[], edges: GraphEdge[], langs: string[], o: { method?: "greedy" | "dsatur"; order?: number[] } = {}): { frames: GraphFrame[]; slots: number[]; used: number } {
  const n = nodes.length;
  const nb: number[][] = nodes.map(() => []);
  for (const e of edges) { nb[e.a]!.push(e.b); nb[e.b]!.push(e.a); }
  const slots = new Array<number>(n).fill(0);
  const frames: GraphFrame[] = [{ nodes: ".".repeat(n), colours: slots.slice(), vals: slots.map(() => null), total: 0, note: say(langs, "Joined exams need different slots", "الامتحانات المتصلة تحتاج مواعيد مختلفة", "الامتحانات المتوصلة محتاجة مواعيد مختلفة") }];
  const used = (): number => new Set(slots.filter(Boolean)).size;
  for (let step = 0; step < n; step++) {
    let v = -1;
    if (o.method === "dsatur") {
      let bs = -1, bd = -1;
      for (let i = 0; i < n; i++) {
        if (slots[i]) continue;
        const sat = new Set(nb[i]!.map((j) => slots[j]).filter(Boolean)).size;
        const deg = nb[i]!.length;
        if (sat > bs || (sat === bs && deg > bd)) { v = i; bs = sat; bd = deg; }
      }
    } else v = (o.order ?? nodes.map((_, i) => i))[step]!;
    const taken = new Set(nb[v]!.map((j) => slots[j]).filter(Boolean));
    let s = 1;
    while (taken.has(s)) s++;
    slots[v] = s;
    const busy = [...taken].sort();
    frames.push({
      nodes: nodes.map((_, i) => (i === v ? "c" : ".")).join(""),
      edges: edges.map((e) => ((e.a === v && slots[e.b]) || (e.b === v && slots[e.a]) ? "c" : ".")).join(""),
      colours: slots.slice(),
      vals: slots.map((x) => (x ? x : null)),
      total: used(),
      note: per(langs, (ar, _eg, l) => {
        const nm = nameOf(nodes, v, l);
        if (!busy.length) return ar ? `${nm}: الموعد ${s}` : `${nm}: slot ${s}`;
        const list = busy.join(ar ? " و" : " and ");
        return ar ? `${nm}: تعارض مع ${busy.length > 1 ? "الموعدين" : "الموعد"} ${list}، إذن الموعد ${s}` : `${nm} clashes with ${busy.length > 1 ? "slots" : "slot"} ${list}: slot ${s}`;
      }),
    });
  }
  const k = used();
  frames.push({ nodes: ".".repeat(n), colours: slots.slice(), vals: slots.slice(), total: k, note: per(langs, (ar, eg) => ar ? (eg ? `${k} مواعيد ومفيش تعارض` : `${k} مواعيد بلا أي تعارض`) : `${k} slots, no clashes`) });
  return { frames, slots, used: k };
}

/** The fewest slots possible, by backtracking over 1, 2, 3… slots (fine for a school's handful of exams). */
export function fewestSlots(n: number, edges: [number, number][]): number {
  const nb: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { nb[a]!.push(b); nb[b]!.push(a); }
  for (let k = 1; k <= n; k++) {
    const s = new Array<number>(n).fill(0);
    const go = (v: number): boolean => {
      if (v === n) return true;
      for (let c = 1; c <= k; c++) if (nb[v]!.every((j) => s[j] !== c)) { s[v] = c; if (go(v + 1)) return true; s[v] = 0; }
      return false;
    };
    if (go(0)) return k;
  }
  return n;
}

/* ---------- knapsack ---------- */

export interface Load { label: Text; w: number; v: number }
const wv = (items: Load[], pick: Iterable<number>): [number, number] => { let w = 0, v = 0; for (const i of pick) { w += items[i]!.w; v += items[i]!.v; } return [w, v]; };

/** The best load by trying all 2ⁿ of them (for checks and small problems). */
export function knapsackBest(items: Load[], cap: number): { pick: number[]; value: number; weight: number } {
  let best = { pick: [] as number[], value: 0, weight: 0 };
  for (let m = 0; m < 1 << items.length; m++) {
    const pick = items.map((_, i) => i).filter((i) => m & (1 << i));
    const [w, v] = wv(items, pick);
    if (w <= cap && (v > best.value || (v === best.value && w < best.weight))) best = { pick, value: v, weight: w };
  }
  return best;
}

/**
 * Greedy packing: the most value per unit of weight first, each item in if it still fits. One frame per item looked at
 * (`n` in, `x` won't fit), then the result; with `best`, one more frame with the best load, to compare.
 */
export function knapsackGreedy(items: Load[], cap: number, langs: string[], o: { unit?: Name; vunit?: Name; best?: boolean } = {}): { frames: KnapsackFrame[]; pick: number[]; value: number; order: number[] } {
  const unit = o.unit ?? KG;
  const vu = o.vunit ?? PTS;
  const order = items.map((_, i) => i).sort((a, b) => items[b]!.v / items[b]!.w - items[a]!.v / items[a]!.w || items[a]!.w - items[b]!.w);
  const st = items.map(() => ".");
  const pick: number[] = [];
  let room = cap;
  const frames: KnapsackFrame[] = [{ in: st.join(""), note: per(langs, (ar, eg) => ar ? `المساحة ${fmt(cap, true)} ${unitOf(unit, ar, eg)}: الأغلى قيمةً لكل كيلو أولًا` : `${fmt(cap)} ${unit.en} of room: best value per kilo first`) }];
  for (const i of order) {
    for (let j = 0; j < st.length; j++) if (st[j] === "n") st[j] = "i";
    const it = items[i]!;
    const fits = it.w <= room;
    if (fits) { pick.push(i); room -= it.w; }
    st[i] = fits ? "n" : "x";
    frames.push({
      in: st.join(""),
      note: per(langs, (ar, eg, l) => {
        const nm = inLang(it.label, l);
        const u = unitOf(unit, ar, eg);
        if (ar) return fits ? `${nm}: تدخل، يبقى ${fmt(room, true)} ${u}` : (eg ? `${nm}: ${fmt(it.w, true)} ${u} ومفيش غير ${fmt(room, true)}` : `${nm}: ${fmt(it.w, true)} ${u} والباقي ${fmt(room, true)} فقط`);
        return fits ? `${nm}: in, ${fmt(room)} ${unit.en} left` : `${nm}: ${fmt(it.w)} ${unit.en}, only ${fmt(room)} left`;
      }),
    });
  }
  const [, value] = wv(items, pick);
  frames.push({ in: items.map((_, i) => (pick.includes(i) ? "i" : ".")).join(""), note: per(langs, (ar, eg) => ar ? (eg ? `الطريقة الجشعة: ${value} ${unitOf(vu, ar, eg)}` : `الطريقة الجشعة: ${value} ${unitOf(vu, ar, eg)}`) : `Greedy: ${value} ${vu.en}`) });
  if (o.best) {
    const b = knapsackBest(items, cap);
    frames.push({ in: items.map((_, i) => (b.pick.includes(i) ? "n" : ".")).join(""), note: per(langs, (ar, eg) => ar ? `الأفضل: ${b.value} ${unitOf(vu, ar, eg)}` : `The best load: ${b.value} ${vu.en}`) });
  }
  return { frames, pick, value, order };
}

/**
 * Dynamic programming: table[k][c] = the best value with the first k items and room c × step, filled row by row
 * (each frame one more row; between frames the cells fill one by one), then read back from the corner for the best load.
 */
export function knapsackDP(items: Load[], cap: number, step: number, langs: string[], o: { vunit?: Name } = {}): { table: number[][]; frames: KnapsackFrame[]; pick: number[]; value: number; trace: [number, number][] } {
  const vu = o.vunit ?? PTS;
  const C = Math.floor(cap / step);
  const t: number[][] = [new Array<number>(C + 1).fill(0)];
  items.forEach((it, k) => {
    const prev = t[k]!;
    const w = Math.round(it.w / step);
    t.push(prev.map((v, c) => (c >= w ? Math.max(v, prev[c - w]! + it.v) : v)));
  });
  const trace: [number, number][] = [];
  const pick: number[] = [];
  let c = C;
  for (let k = items.length; k > 0; k--) {
    trace.push([k, c]);
    if (t[k]![c] !== t[k - 1]![c]) { pick.unshift(k - 1); c -= Math.round(items[k - 1]!.w / step); }
  }
  trace.push([0, c]);
  const cols = C + 1;
  const frames: KnapsackFrame[] = [{ fill: cols, note: say(langs, "No items yet: 0 in every column", "بلا أغراض: 0 في كل عمود", "من غير حاجة: 0 في كل عمود") }];
  items.forEach((it, k) => frames.push({
    fill: (k + 2) * cols,
    // Egyptian leaves out the pronoun ("ناخد ولا نسيب"), which would have to agree with each load ("فلتر مية" is masculine).
    note: per(langs, (ar, eg, l) => ar ? (eg ? `${inLang(it.label, l)}: ناخد ولا نسيب، والأكبر يكسب` : `${inLang(it.label, l)}: نأخذها أو نتركها، والأكبر يفوز`) : `${inLang(it.label, l)}: take it or leave it, the bigger wins`),
  }));
  const value = t[items.length]![C]!;
  frames.push({ fill: (items.length + 1) * cols, trace, note: per(langs, (ar, eg, l) => {
    const names = pick.map((i) => inLang(items[i]!.label, l)).join(ar ? " و" : " and ");
    return ar ? `الأفضل: ${names}، ${value} ${unitOf(vu, ar, eg)}` : `Best: ${names}, ${value} ${vu.en}`;
  }) });
  return { table: t, frames, pick, value, trace };
}

/**
 * Branch and bound on a knapsack: depth first, each item taken (+) or left (−) in order of value per weight. A node's
 * bound is the most it could still reach (filling the room left with fractions of the next items); a branch whose bound
 * is no better than the best load found so far is pruned (✗), and a load that is too heavy is a dead end.
 */
export function branchAndBound(items: Load[], cap: number, langs: string[], o: { short?: Text[]; unit?: Name; maxNodes?: number } = {}): { steps: SearchStep[]; value: number; pick: number[] } {
  const order = items.map((_, i) => i).sort((a, b) => items[b]!.v / items[b]!.w - items[a]!.v / items[a]!.w);
  const short = (i: number, l: string): string => inLang(o.short?.[i] ?? items[i]!.label, l);
  const bound = (k: number, room: number, val: number): number => {
    let b = val;
    for (let j = k; j < order.length && room > 0; j++) {
      const it = items[order[j]!]!;
      if (it.w <= room) { b += it.v; room -= it.w; } else { b += (it.v * room) / it.w; room = 0; }
    }
    return Math.floor(b + 1e-9);
  };
  const out: SearchStep[] = [];
  let best = -1;
  let bestPick: number[] = [];
  const max = o.maxNodes ?? 31;
  const visit = (p: number, k: number, room: number, val: number, pick: number[], edge: Text | undefined): void => {
    if (out.length >= max) return;
    const i = out.length;
    const b = bound(k, room, val);
    const node: SearchStep = { p, label: String(val), ...(edge ? { edge } : {}) };
    out.push(node);
    if (room < 0) {
      Object.assign(node, { label: per(langs, (ar, eg) => `${fmt(cap - room, ar)} ${unitOf(o.unit ?? KG, ar, eg)}`), mark: "d", note: per(langs, (ar, eg) => ar ? (eg ? `${fmt(cap - room, ar)} أكتر من ${fmt(cap, ar)}: طريق مسدود` : `${fmt(cap - room, ar)} أكثر من ${fmt(cap, ar)}: طريق مسدود`) : `${fmt(cap - room)} is over ${fmt(cap)}: a dead end`) });
      return;
    }
    if (k === order.length) {
      node.mark = "l";
      node.val = val;
      if (val > best) { best = val; bestPick = pick.slice(); node.best = true; node.note = per(langs, (ar, eg) => ar ? (eg ? `حمولة كاملة: ${val}، أحسن حاجة لحد دلوقتي` : `حمولة كاملة: ${val}، الأفضل حتى الآن`) : `A full load: ${val}, the best so far`); }
      else node.note = per(langs, (ar) => ar ? `حمولة كاملة: ${val}، ليست أفضل` : `A full load: ${val}, not better`);
      return;
    }
    node.sub = `≤ ${b}`;
    if (best >= 0 && b <= best) {
      node.mark = "x";
      node.note = per(langs, (ar, eg) => ar ? (eg ? `أقصى حاجة ${b}، ومش أحسن من ${best}: نقطع الفرع` : `أقصى ما يصل إليه ${b}، لا يتجاوز ${best}: نقطع الفرع`) : `At most ${b}, no better than ${best}: prune`);
      return;
    }
    node.note = i === 0
      ? per(langs, (ar, eg) => ar ? (eg ? `من غير حاجة: نقدر نوصل لـ ${b} بالكتير` : `لا شيء بعد: يمكن الوصول إلى ${b} على الأكثر`) : `Nothing yet: at most ${b} is possible`)
      : per(langs, (ar, eg) => ar ? (eg ? `${val} لحد دلوقتي، وبالكتير ${b}` : `${val} حتى الآن، و${b} على الأكثر`) : `${val} so far, at most ${b}`);
    const it = items[order[k]!]!;
    const idx = order[k]!;
    visit(i, k + 1, room - it.w, val + it.v, [...pick, idx], per(langs, (_ar, _eg, l) => `+ ${short(idx, l)}`));
    visit(i, k + 1, room, val, pick, per(langs, (_ar, _eg, l) => `− ${short(idx, l)}`));
  };
  visit(-1, 0, cap, 0, [], undefined);
  return { steps: out, value: best, pick: bestPick.sort((a, b) => a - b) };
}

/* ---------- linear programs in two variables ---------- */

export type P2 = [number, number];
const EPS = 1e-7;
const holds = (k: { a: number; b: number; c: number; op?: string }, p: P2): boolean => (k.op === ">=" ? k.a * p[0] + k.b * p[1] >= k.c - EPS : k.a * p[0] + k.b * p[1] <= k.c + EPS);

/**
 * A two-variable linear program by vertex enumeration: every crossing of two limit lines (and the axes, x, y ≥ 0) that
 * keeps every limit is a corner; the best corner has the largest goal (or smallest, with `min`). Corners come
 * counterclockwise from the one nearest the origin, as the lp element numbers them. Null when no plan fits.
 */
export function lp2d(cons: { a: number; b: number; c: number; op?: "<=" | ">=" }[], obj?: { a: number; b: number; min?: boolean }): { corners: P2[]; values: number[]; best: number; value: number; tight: number[][] } | null {
  const lines = [...cons, { a: 1, b: 0, c: 0, op: ">=" as const }, { a: 0, b: 1, c: 0, op: ">=" as const }];
  const pts: P2[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const p = lines[i]!, q = lines[j]!;
      const det = p.a * q.b - p.b * q.a;
      if (Math.abs(det) < 1e-12) continue;
      const pt: P2 = [(p.c * q.b - p.b * q.c) / det, (p.a * q.c - p.c * q.a) / det];
      if (lines.every((k) => holds(k, pt)) && !pts.some((r) => Math.abs(r[0] - pt[0]) < 1e-6 && Math.abs(r[1] - pt[1]) < 1e-6)) pts.push([r6(pt[0]), r6(pt[1])]);
    }
  }
  if (!pts.length) return null;
  const corners = ccw(pts);
  const values = corners.map((p) => (obj ? r6(obj.a * p[0] + obj.b * p[1]) : 0));
  let best = 0;
  values.forEach((v, i) => { if (obj && (obj.min ? v < values[best]! - 1e-9 : v > values[best]! + 1e-9)) best = i; });
  const tight = corners.map((p) => cons.flatMap((k, i) => (Math.abs(k.a * p[0] + k.b * p[1] - k.c) < 1e-6 ? [i] : [])));
  return { corners, values, best, value: values[best]!, tight };
}
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0; // + 0: no −0
/** Points around their centre, counterclockwise (y up), from the one nearest the origin. */
export function ccw(pts: P2[]): P2[] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const sorted = pts.slice().sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  let s = 0;
  sorted.forEach((p, i) => { if (Math.hypot(p[0], p[1]) < Math.hypot(sorted[s]![0], sorted[s]![1]) - 1e-9) s = i; });
  return [...sorted.slice(s), ...sorted.slice(0, s)];
}
/** Levels for the goal line sliding from `from` to `to` in `n` frames (the last one at the best corner). */
export const lpLevels = (from: number, to: number, n = 4): number[] => Array.from({ length: n }, (_, i) => r1(from + ((to - from) * i) / (n - 1)));

/* ---------- timetables: propagation and search ---------- */

export interface Lesson { klass: number; subject: number }
export interface TimetableRule { klass?: number; subject?: number; allowed: number[]; say?: Name }
type Step =
  | { kind: "rule"; rule: number; removed: [number, number][]; d: number[] }
  | { kind: "prune"; from: number; d: number[] }
  | { kind: "guess"; lesson: number; period: number; d: number[]; before: number[] }
  | { kind: "dead"; lesson: number; d: number[] }
  | { kind: "undo"; lesson: number; period: number; d: number[] }
  | { kind: "done"; d: number[] }
  | { kind: "none"; d: number[] };

/**
 * A timetable as a constraint problem: each lesson needs a period (its domain, a bit set), a class and a teacher (one per
 * subject) can't be in two places at once, and rules take periods away. Propagation removes impossible periods; when it
 * can't decide, search guesses the lesson with the fewest periods left and undoes the guess at a dead end (the way
 * CP-SAT and other constraint solvers work). Every step is recorded.
 */
export function solveTimetable(lessons: Lesson[], periods: number, rules: TimetableRule[]): { steps: Step[]; guesses: number; deadEnds: number; solution: number[] | null } {
  const n = lessons.length;
  const ALL = (1 << periods) - 1;
  const only = (x: number): number => { for (let p = 0; p < periods; p++) if (x === 1 << p) return p; return -1; };
  const size = (x: number): number => { let k = 0; for (let p = 0; p < periods; p++) k += (x >> p) & 1; return k; };
  const nb = lessons.map((a, i) => lessons.flatMap((b, j) => (i !== j && (a.klass === b.klass || a.subject === b.subject) ? [j] : [])));
  const steps: Step[] = [];
  let guesses = 0, deadEnds = 0;
  let d = new Array<number>(n).fill(ALL);
  rules.forEach((r, ri) => {
    const mask = r.allowed.reduce((m, p) => m | (1 << p), 0);
    const removed: [number, number][] = [];
    d = d.map((x, i) => {
      const l = lessons[i]!;
      if ((r.klass !== undefined && r.klass !== l.klass) || (r.subject !== undefined && r.subject !== l.subject)) return x;
      for (let p = 0; p < periods; p++) if ((x >> p) & 1 && !(mask & (1 << p))) removed.push([i, p]);
      return x & mask;
    });
    steps.push({ kind: "rule", rule: ri, removed, d: d.slice() });
  });
  /** Lessons with one period left take it from their neighbours until nothing changes; false at a dead end. */
  const settle = (dom: number[]): boolean => {
    const queue = dom.flatMap((x, i) => (only(x) >= 0 ? [i] : []));
    const seen = new Set<number>();
    while (queue.length) {
      const i = queue.shift()!;
      if (seen.has(i)) continue;
      seen.add(i);
      const p = only(dom[i]!);
      if (p < 0) continue;
      let changed = false;
      for (const j of nb[i]!) if ((dom[j]! >> p) & 1) { dom[j]! &= ~(1 << p); changed = true; if (only(dom[j]!) >= 0) queue.push(j); }
      if (changed) steps.push({ kind: "prune", from: i, d: dom.slice() });
      const empty = nb[i]!.find((j) => dom[j] === 0);
      if (empty !== undefined) { steps.push({ kind: "dead", lesson: empty, d: dom.slice() }); return false; }
    }
    return true;
  };
  const go = (dom: number[]): number[] | null => {
    let pick = -1;
    for (let i = 0; i < n; i++) if (size(dom[i]!) > 1 && (pick < 0 || size(dom[i]!) < size(dom[pick]!))) pick = i;
    if (pick < 0) return dom;
    for (let p = 0; p < periods; p++) {
      if (!((dom[pick]! >> p) & 1)) continue;
      const next = dom.slice();
      next[pick] = 1 << p;
      guesses++;
      steps.push({ kind: "guess", lesson: pick, period: p, d: next.slice(), before: dom.slice() });
      if (settle(next)) { const res = go(next); if (res) return res; }
      deadEnds++;
      steps.push({ kind: "undo", lesson: pick, period: p, d: dom.slice() });
    }
    return null;
  };
  if (d.some((x) => x === 0)) { steps.push({ kind: "none", d }); return { steps, guesses, deadEnds, solution: null }; }
  const start = d.slice();
  const res = settle(start) ? go(start) : null;
  if (res) steps.push({ kind: "done", d: res });
  else steps.push({ kind: "none", d: start });
  return { steps, guesses, deadEnds, solution: res ? res.map(only) : null };
}

/**
 * A timetable grid (rows: classes, columns: periods) filled as the solver works: rules tint the periods they take away,
 * propagation places lessons with one period left (`f`), search places a guess (`g`), a dead end tints its class's row
 * in danger, and an undo takes the guess back.
 */
export function timetableFrames(langs: string[], ruleIds: string[] = ["huda", "test"], o: { maxFrames?: number } = {}): { items: ScheduleItem[]; frames: ScheduleFrame[]; guesses: number; deadEnds: number; solution: number[] | null } {
  const T = TIMETABLE;
  const lessons: Lesson[] = T.classes.flatMap((_, k) => T.subjects.map((_s, s) => ({ klass: k, subject: s })));
  const rules = ruleIds.map((id) => { const r = T.rules[id]; if (!r) throw new Error(`timetableFrames: no rule "${id}"`); return r; });
  const run = solveTimetable(lessons, T.periods, rules);
  const only = (x: number): number => { for (let p = 0; p < T.periods; p++) if (x === 1 << p) return p; return -1; };
  const items: ScheduleItem[] = lessons.map((l, i) => {
    const s = T.subjects[l.subject]!;
    return { label: sayN(langs, s.name), sub: sayN(langs, s.teacher), row: l.klass, col: run.solution?.[i] ?? 0, tone: s.tone };
  });
  const placed = (d: number[]): ([number, number] | null)[] => d.map((x, i) => (only(x) >= 0 ? [lessons[i]!.klass, only(x)] : null));
  const lesson = (i: number, l: string, ar: boolean): string => `${T.classes[lessons[i]!.klass]} ${inLang(sayN([l], T.subjects[lessons[i]!.subject]!.name), l)}`.replace(/^(\S+) (.*)$/, ar ? "$2 $1" : "$1 $2");
  const frames: ScheduleFrame[] = [{ at: lessons.map(() => null), note: say(langs, "Each lesson needs a period", "كل حصة تحتاج موعدًا", "كل حصة محتاجة ميعاد") }];
  let guessed = -1;
  let forced = new Set<number>();
  const stateOf = (d: number[], extra: (i: number) => string | null): string => d.map((x, i) => extra(i) ?? (only(x) < 0 ? "." : i === guessed ? "g" : forced.has(i) ? "f" : ".")).join("");
  for (const s of run.steps) {
    if (s.kind === "rule") {
      const rule = rules[s.rule]!;
      const bad = new Map<string, [number, number]>();
      for (const [i, p] of s.removed) bad.set(`${lessons[i]!.klass},${p}`, [lessons[i]!.klass, p]);
      const fixed = new Set(s.d.flatMap((x, i) => (only(x) >= 0 && !forced.has(i) ? [i] : [])));
      for (const i of fixed) forced.add(i);
      frames.push({ at: placed(s.d), state: stateOf(s.d, (i) => (fixed.has(i) ? "n" : null)), bad: [...bad.values()], note: rule.say ? sayN(langs, rule.say) : say(langs, "A rule", "قاعدة") });
    } else if (s.kind === "guess") {
      guessed = s.lesson;
      const opts: [number, number][] = [];
      for (let p = 0; p < T.periods; p++) if ((s.before[s.lesson]! >> p) & 1) opts.push([lessons[s.lesson]!.klass, p]);
      frames.push({ at: placed(s.d), state: stateOf(s.d, (i) => (i === s.lesson ? "g" : null)), opts, note: per(langs, (ar, eg, l) => ar ? `${eg ? "نخمّن" : "نخمّن"}: ${lesson(s.lesson, l, ar)} في الحصة ${s.period + 1}` : `Guess: ${lesson(s.lesson, l, ar)} in period ${s.period + 1}`) });
    } else if (s.kind === "prune") {
      const before = new Set(frames[frames.length - 1]!.at!.flatMap((p, i) => (p ? [i] : [])));
      const now = s.d.flatMap((x, i) => (only(x) >= 0 ? [i] : []));
      const fresh = now.filter((i) => !before.has(i));
      if (!fresh.length) continue;
      for (const i of fresh) if (i !== guessed) forced.add(i);
      frames.push({ at: placed(s.d), state: stateOf(s.d, (i) => (fresh.includes(i) ? "n" : null)), note: per(langs, (ar, eg, l) => {
        const what = fresh.map((i) => lesson(i, l, ar)).join(ar ? " و" : " and ");
        return ar ? (eg ? `فاضل ميعاد واحد: ${what}` : `بقي موعد واحد: ${what}`) : `Only one period left: ${what}`;
      }) });
    } else if (s.kind === "dead") {
      const k = lessons[s.lesson]!.klass;
      frames.push({ at: placed(s.d), state: stateOf(s.d, (i) => (i === guessed ? "x" : null)), bad: Array.from({ length: T.periods }, (_, p): [number, number] => [k, p]), note: per(langs, (ar, eg, l) => ar ? (eg ? `${lesson(s.lesson, l, ar)} مالهاش ميعاد: طريق مسدود` : `لا موعد لـ ${lesson(s.lesson, l, ar)}: طريق مسدود`) : `No period for ${lesson(s.lesson, l, ar)}: a dead end`) });
    } else if (s.kind === "undo") {
      guessed = -1;
      forced = new Set(s.d.flatMap((x, i) => (only(x) >= 0 ? [i] : [])));
      frames.push({ at: placed(s.d), state: stateOf(s.d, () => null), note: per(langs, (ar, eg, l) => ar ? (eg ? `نرجع في التخمين: ${lesson(s.lesson, l, ar)}` : `نتراجع عن التخمين: ${lesson(s.lesson, l, ar)}`) : `Undo the guess: ${lesson(s.lesson, l, ar)}`) });
    } else if (s.kind === "done") {
      frames.push({ at: placed(s.d), state: ".".repeat(lessons.length), total: run.guesses, note: per(langs, (ar, eg) => ar ? (eg ? `جدول بيحترم كل القواعد` : `جدول يحترم كل القواعد`) : "A timetable that keeps every rule") });
    } else {
      frames.push({ at: placed(s.d), state: ".".repeat(lessons.length), note: say(langs, "No timetable exists, and the solver proves it", "لا يوجد جدول، وبرنامج الحل يثبت ذلك", "مفيش جدول، والسولفر بيثبت ده") });
    }
  }
  const max = o.maxFrames ?? 60;
  if (frames.length > max) throw new Error(`timetableFrames: ${frames.length} frames, more than ${max}; add rules or use a smaller timetable`);
  return { items, frames, guesses: run.guesses, deadEnds: run.deadEnds, solution: run.solution };
}

/* ---------- Gantt charts: a two-machine flow shop ---------- */

/** Johnson's rule for two machines: jobs shorter on the first machine go first (shortest first), the rest last (longest second job first). */
export function johnson(jobs: { a: number; b: number }[]): number[] {
  const first = jobs.map((_, i) => i).filter((i) => jobs[i]!.a <= jobs[i]!.b).sort((p, q) => jobs[p]!.a - jobs[q]!.a || p - q);
  const last = jobs.map((_, i) => i).filter((i) => jobs[i]!.a > jobs[i]!.b).sort((p, q) => jobs[q]!.b - jobs[p]!.b || p - q);
  return [...first, ...last];
}
/** Start times on both machines for jobs in this order: each job prints, then is stapled once both are free. */
export function flowShop(jobs: { a: number; b: number }[], order: number[]): { startA: number[]; startB: number[]; makespan: number } {
  const startA = new Array<number>(jobs.length).fill(0);
  const startB = new Array<number>(jobs.length).fill(0);
  let ta = 0, tb = 0;
  for (const i of order) {
    startA[i] = ta;
    ta += jobs[i]!.a;
    startB[i] = Math.max(ta, tb);
    tb = startB[i]! + jobs[i]!.b;
  }
  return { startA, startB, makespan: tb };
}

/**
 * The exam papers on a Gantt chart: jobs placed one by one in list order, then all moved to Johnson's order. Items are
 * the jobs' copier parts then their stapler parts; the total is the time when the last paper is stapled.
 */
export function printingFrames(langs: string[], o: { unit?: Name } = {}): { items: ScheduleItem[]; frames: ScheduleFrame[]; listTime: number; bestTime: number; order: number[] } {
  const { jobs } = PRINTING;
  const unit = o.unit ?? { en: "min", ar: "دقيقة" };
  const tones: Tone[] = ["accent", "ok", "accent2", "danger", "muted"];
  const n = jobs.length;
  const items: ScheduleItem[] = [
    ...jobs.map((j, i) => ({ label: j.name, row: 0, len: j.a, tone: tones[i % tones.length] })),
    ...jobs.map((j, i) => ({ label: j.name, row: 1, len: j.b, tone: tones[i % tones.length] })),
  ];
  const list = jobs.map((_, i) => i);
  const a = flowShop(jobs, list);
  const best = johnson(jobs);
  const b = flowShop(jobs, best);
  const frames: ScheduleFrame[] = [{ at: items.map(() => null), note: say(langs, "Print each class's paper, then staple it", "نطبع ورقة كل فصل، ثم ندبّسها", "نطبع ورق كل فصل، وبعدين ندبّسه") }];
  list.forEach((_, k) => {
    const shown = new Set(list.slice(0, k + 1));
    const end = Math.max(...[...shown].map((i) => a.startB[i]! + jobs[i]!.b));
    frames.push({
      at: items.map((_, m) => { const i = m % n; return shown.has(i) ? (m < n ? a.startA[i]! : a.startB[i]!) : null; }),
      state: items.map((_, m) => (m % n === k ? "n" : ".")).join(""),
      total: end,
      note: per(langs, (ar) => ar ? `${jobs[k]!.name}: طباعة ${jobs[k]!.a}، تدبيس ${jobs[k]!.b}` : `${jobs[k]!.name}: print ${jobs[k]!.a}, staple ${jobs[k]!.b}`),
    });
  });
  frames.push({
    at: items.map((_, m) => { const i = m % n; return m < n ? b.startA[i]! : b.startB[i]!; }),
    state: ".".repeat(items.length),
    total: b.makespan,
    note: per(langs, (ar, eg) => ar ? (eg ? `الطباعة القصيرة الأول، والتدبيس القصير في الآخر` : `الطباعة القصيرة أولًا، والتدبيس القصير أخيرًا`) : "Short printing first, short stapling last"),
  });
  void unit;
  return { items, frames, listTime: a.makespan, bestTime: b.makespan, order: best };
}

/* ---------- builders: ready-made elements in a box, labels in the lesson's languages ---------- */

const KM_T = (langs: string[]): Text => sayN(langs, KM);
const truckItems = (langs: string[], n = TRUCK.length): Load[] => TRUCK.slice(0, n).map((t) => ({ label: sayN(langs, t.name), w: t.w, v: t.v }));
const roadMap = (langs: string[]): { nodes: GraphNode[]; edges: GraphEdge[] } => ({
  nodes: SHORTEST.nodes.map((v) => ({ x: v.x, y: v.y, label: sayN(langs, v.name), at: v.at, ...(v.square ? { shape: "square" as const } : {}) })),
  edges: SHORTEST.roads.map(([a, b, w, curve, pos]) => ({ a, b, w, ...(curve ? { curve } : {}), ...(pos ? { pos } : {}) })),
});

/** The way from home to school, stepped through Dijkstra's method (`flooded`: the bridge between Kesi and Mina is closed). */
export function shortestWay(box: Box, langs: string[], o: { flooded?: boolean } = {}): GraphElement {
  const { nodes, edges } = roadMap(langs);
  const run = dijkstraFrames(nodes, edges, SHORTEST.home, SHORTEST.school, langs, { closed: o.flooded ? [SHORTEST.bridge] : [] });
  return { ...box, type: "graph", nodes, edges, fit: "fill", frames: run.frames, totalLabel: say(langs, "Shortest way", "أقصر طريق"), unit: KM_T(langs) };
}

/** The least road to pave so every village is joined: Kruskal's method on the same map. */
export function pavedRoads(box: Box, langs: string[]): GraphElement {
  const { nodes, edges } = roadMap(langs);
  return { ...box, type: "graph", nodes, edges, fit: "fill", frames: kruskalFrames(nodes, edges, langs).frames, totalLabel: say(langs, "Road", "الطرق", "الطرق"), unit: KM_T(langs) };
}

/** The school bus route: nearest neighbour, then 2-opt swaps; the villages are numbered, the school is the square. */
export function busRoute(box: Box, langs: string[]): GraphElement {
  const run = routeFrames(BUS, langs);
  const vals = BUS.map((_, i) => (i ? i : null));
  return {
    ...box, type: "graph",
    nodes: BUS.map((p, i) => ({ x: p.x, y: p.y, ...(i ? {} : { shape: "square" as const, label: say(langs, "School", "المدرسة"), at: "b" as const }) })),
    frames: run.frames.map((f) => ({ ...f, vals })),
    totalLabel: say(langs, "Route", "طول الطريق"), unit: KM_T(langs),
  };
}

/** Exam slots: the clash graph coloured exam by exam (`dsatur`, the default, or `greedy` in list order). */
export function examSlots(box: Box, langs: string[], method: "greedy" | "dsatur" = "dsatur"): GraphElement {
  const nodes: GraphNode[] = EXAMS.spots.map(([x, y], i) => ({ x, y, label: sayN(langs, EXAMS.names[i]!), at: EXAMS.at[i] }));
  const edges: GraphEdge[] = clashEdges(EXAMS.pupils).map(([a, b]) => ({ a, b }));
  return { ...box, type: "graph", nodes, edges, fit: "fill", frames: colourFrames(nodes, edges, langs, { method }).frames, totalLabel: say(langs, "Slots", "المواعيد") };
}

/** The truck packed the greedy way (most points per 100 kg first), then (`best`, the default) the best load. */
export function truckBag(box: Box, langs: string[], o: { best?: boolean } = {}): KnapsackElement {
  const items = truckItems(langs);
  return {
    ...box, type: "knapsack", items, cap: TRUCK_CAP, unit: sayN(langs, KG), vunit: sayN(langs, PTS), per: 100,
    perLabel: say(langs, "per 100 kg", "لكل 100 كغ", "لكل 100 كيلو"), frames: knapsackGreedy(items, TRUCK_CAP, langs, { best: o.best ?? true }).frames,
  };
}

/** The truck by dynamic programming: one row per load, one column per 100 kg of room. */
export function truckTable(box: Box, langs: string[]): KnapsackElement {
  const items = truckItems(langs);
  const run = knapsackDP(items, TRUCK_CAP, 100, langs);
  return { ...box, type: "knapsack", show: "table", items, cap: TRUCK_CAP, step: 100, table: run.table, unit: sayN(langs, KG), vunit: sayN(langs, PTS), frames: run.frames };
}

/** Branch and bound on the truck's first `n` loads (3 by default, 2 in a box under 1,000 px wide: a tree small enough to read). */
export function truckTree(box: Box, langs: string[], n = box.w < 1000 ? 2 : 3): SearchTreeElement {
  const run = branchAndBound(truckItems(langs, n), TRUCK_CAP, langs, { short: TRUCK.slice(0, n).map((t) => sayN(langs, t.short)) });
  return { ...box, type: "searchtree", steps: run.steps, totalLabel: say(langs, "Best so far", "الأفضل حتى الآن", "أحسن حاجة لحد دلوقتي") };
}

/** The school garden as a linear program; the profit line slides from 0 to the best corner in `levels` frames. */
export function gardenLp(box: Box, langs: string[], o: { prices?: [number, number]; ints?: boolean; levels?: number; values?: boolean } = {}): LpElement {
  const [a, b] = o.prices ?? [GARDEN.obj.a, GARDEN.obj.b];
  const cons: LpConstraint[] = GARDEN.cons.map((k) => ({ a: k.a, b: k.b, c: k.c, label: sayN(langs, k.name) }));
  const run = lp2d(cons, { a, b })!;
  const levels = lpLevels(0, run.value, o.levels ?? 4);
  const [bx, by] = run.corners[run.best]!;
  return {
    ...box, type: "lp", xr: [0, 9], yr: [0, 8], xLabel: sayN(langs, GARDEN.x), yLabel: sayN(langs, GARDEN.y), cons,
    obj: { a, b, label: sayN(langs, GARDEN.goal) },
    frames: levels.map((level, i) => ({
      level,
      ...(i === 0 ? { note: say(langs, "Slide the profit line up", "حرّك خط الربح إلى الأعلى", "زقّ خط الربح لفوق") } : {}),
      ...(i === levels.length - 1 ? { note: per(langs, (ar) => ar ? `الأفضل: (${fmt(bx)}، ${fmt(by)})، ربح ${fmt(run.value)}` : `Best: (${fmt(bx)}, ${fmt(by)}), profit ${fmt(run.value)}`) } : {}),
    })),
    ...(o.ints ? { ints: true } : {}), ...(o.values ? { values: true } : {}),
  };
}

/** The timetable filled by propagation and search. Rows are classes, columns periods (swapped in a narrow box). */
export function timetableGrid(box: Box, langs: string[], rules: string[] = ["huda", "test", "art"]): ScheduleElement {
  const run = timetableFrames(langs, rules);
  const T = TIMETABLE;
  const classes = T.classes.map((c) => c as Text);
  // A narrow box has the periods as rows, numbered only, so the lessons' names keep their room.
  const periods = Array.from({ length: T.periods }, (_, p) => (box.w >= 900 ? say(langs, `Period ${p + 1}`, `الحصة ${p + 1}`) : String(p + 1)));
  const totalLabel = say(langs, "Guesses", "التخمينات");
  if (box.w >= 900) return { ...box, type: "schedule", rows: classes, cols: periods, items: run.items, frames: run.frames, totalLabel };
  const sw = (p: [number, number]): [number, number] => [p[1], p[0]];
  return {
    ...box, type: "schedule", rows: periods, cols: classes, totalLabel,
    items: run.items.map((it) => ({ ...it, row: it.col ?? 0, col: it.row })),
    frames: run.frames.map((f) => ({ ...f, ...(f.at ? { at: f.at.map((p) => (Array.isArray(p) ? sw(p) : p)) } : {}), ...(f.opts ? { opts: f.opts.map(sw) } : {}), ...(f.bad ? { bad: f.bad.map(sw) } : {}) })),
  };
}

/** Exam papers printed then stapled, on a Gantt chart: list order, then Johnson's rule. */
export function printingGantt(box: Box, langs: string[]): ScheduleElement {
  const run = printingFrames(langs);
  return {
    ...box, type: "schedule", kind: "gantt", rows: PRINTING.machines.map((m) => sayN(langs, m)), span: [0, Math.max(run.listTime, run.bestTime) + 1],
    unit: say(langs, "min", "دقيقة"), items: run.items, frames: run.frames, totalLabel: say(langs, "All done", "ينتهي الكل", "الكل يخلص"),
  };
}

const lastFrame = <E extends { frames?: unknown[]; steps?: unknown[] }>(el: E): E & { frame: number } => ({ ...el, frame: Math.max(0, (el.frames ?? el.steps ?? []).length - 1) });

/** A sensible default element of each type (the studio's "Add a pack element"), showing its last step. */
export function element(type: string, langs: string[], box: { id?: string; x: number; y: number; w: number; h: number }): Element {
  const b: Box = { id: box.id ?? type, x: box.x, y: box.y, w: box.w, h: box.h };
  switch (type) {
    case "graph": return lastFrame(shortestWay(b, langs));
    case "schedule": return lastFrame(timetableGrid(b, langs));
    case "knapsack": return lastFrame(truckBag(b, langs));
    case "lp": return lastFrame(gardenLp(b, langs));
    case "searchtree": return lastFrame(truckTree(b, langs));
    default: throw new Error(`element: the optimization pack has no "${type}"`);
  }
}

/* ---------- gallery scenes ---------- */

const STAGE: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };
/** The headline and the body box for a stage shape. */
function room(stage: Orient): { head: { x: number; y: number; w: number; size: number }; body: { x: number; y: number; w: number; h: number } } {
  const [W, H] = STAGE[stage];
  const m = W < 800 ? 48 : 60;
  const top = stage === "landscape" ? 140 : stage === "square" ? 170 : 210;
  return { head: { x: m, y: stage === "landscape" ? 44 : 60, w: W - 2 * m, size: W < 800 ? 44 : 48 }, body: { x: m, y: top, w: W - 2 * m, h: Math.min(H - top - 50, stage === "portrait" ? 900 : H) } };
}
type K = [When, number, Ease?];
const track = (prop: AnimProp, ...keys: K[]): Track => ({ prop, keys: keys.map(([at, value, ease]) => ({ at, value, ...(ease ? { ease } : {}) })) });
const moving = <E extends Element>(el: E, ...t: Track[]): E => ({ ...el, anim: t });

interface Preset { id: string; name: Text; scene: Scene }

/**
 * Gallery scenes for the studio, one or more per element: a headline, the element, narration in every language of
 * `langs` and keyframes on spoken words, laid out for the stage shape.
 */
export function presets(langs: string[] = ["en", "ar"], stage: Orient = "landscape"): Preset[] {
  const r = room(stage);
  const on = (en: string, ar: string, offset = 0): When => ({ word: say(langs, en, ar), ...(offset ? { offset } : {}) });
  const head = (en: string, ar: string): Element => ({ id: "title", type: "text", ...r.head, weight: 800, text: say(langs, en, ar) });
  const box = (id: string): Box => ({ id, ...r.body });
  const scene = (id: string, en: string, ar: string, narration: [string, string], body: Element): Preset => ({
    id, name: say(langs, en, ar),
    scene: { id, template: "canvas", narration: say(langs, narration[0], narration[1]) as Record<string, string>, content: { elements: [head(en, ar), body] } },
  });
  const appear = (a: When, b: When): Track => track("reveal", [a, 0], [b, 1, "linear"]);
  return [
    scene("opt-dijkstra", "The shortest way to school", "أقصر طريق إلى المدرسة", [
      "Which way to school is shortest? Dijkstra's method settles the nearest waiting village first, then checks its roads. Once the school is settled, follow the roads back: thirteen kilometres.",
      "أيّ طريق إلى المدرسة أقصر؟ طريقة ديكسترا تثبّت أقرب قرية منتظرة أولًا، ثم تفحص طرقها. وعندما تثبت المدرسة، نتتبع الطرق إلى الوراء: ثلاثة عشر كيلومترًا.",
    ], moving(shortestWay(box("map"), langs),
      appear(on("Which", "أيّ"), on("shortest", "أقصر")),
      track("frame", [on("nearest", "أقرب"), 0], [on("Once", "وعندما"), 8, "linear"], [on("follow", "نتتبع"), 9, "step"]),
      track("pass", [0, -1], [on("follow", "نتتبع"), 0, "step"], [on("thirteen", "ثلاثة"), 1, "linear"], [on("thirteen", "ثلاثة", 0.3), -1, "step"]))),
    scene("opt-route", "The bus route, made shorter", "طريق الحافلة، أقصر فأقصر", [
      "The bus always drives to the nearest village it hasn't visited, but the last road back is long. Then 2-opt takes out two roads and reverses the stretch between them, until no swap helps.",
      "تتجه الحافلة دائمًا إلى أقرب قرية لم تزرها، لكن طريق العودة الأخير طويل. ثم تزيل طريقة 2-opt طريقين وتعكس الجزء الواقع بينهما، حتى لا يفيد أي تبديل.",
    ], moving(busRoute(box("route"), langs),
      appear(on("bus", "الحافلة"), on("bus", "الحافلة", 0.8)),
      track("frame", [on("drives", "تتجه"), 0], [on("long", "طويل"), 10, "linear"], [on("takes", "تزيل"), 11, "step"], [on("until", "حتى"), 16, "linear"], [on("helps", "يفيد"), 17, "step"]))),
    scene("opt-tree", "Join every village", "صِل كل القرى", [
      "To join every village with the least road to pave, take the shortest roads first, and skip any road that would close a loop. Seven roads join all eight places.",
      "لنصل كل القرى بأقل طريق نرصفه، نأخذ أقصر الطرق أولًا، ونتجاوز أي طريق يغلق دائرة. سبعة طرق تصل الأماكن الثمانية كلها.",
    ], moving(pavedRoads(box("roads"), langs),
      appear(on("join", "لنصل"), on("pave", "نرصفه")),
      track("frame", [on("shortest", "أقصر"), 0], [on("loop", "دائرة"), 7, "linear"], [on("Seven", "سبعة"), 8, "step"]))),
    scene("opt-colour", "Exam slots without clashes", "مواعيد امتحانات بلا تعارض", [
      "Exams that share a pupil are joined: they can't be at the same time. Colour the most constrained exam first, with the first slot its clashes leave free. Three slots are enough.",
      "الامتحانات التي يشترك فيها تلميذ متصلة: لا يمكن أن تكون في الوقت نفسه. نلوّن الامتحان الأكثر تقييدًا أولًا، بأول موعد تتركه تعارضاته حرًّا. ثلاثة مواعيد تكفي.",
    ], moving(examSlots(box("exams"), langs),
      appear(on("Exams", "الامتحانات"), on("joined", "متصلة")),
      track("frame", [on("Colour", "نلوّن"), 0], [on("free", "حرًّا", 0.6), 8, "linear"], [on("enough", "تكفي"), 9, "step"]))),
    scene("opt-timetable", "A timetable, by propagation and search", "جدول بالانتشار والبحث", [
      "Every lesson needs a period, and no teacher can be in two places at once. Each rule takes periods away. When stuck, the solver guesses, and then every lesson with one period left falls into place.",
      "كل حصة تحتاج موعدًا، ولا يمكن لمعلم أن يكون في مكانين في الوقت نفسه. كل قاعدة تحذف مواعيد. وعند التوقف يخمّن برنامج الحل، ثم تأخذ كل حصة بقي لها موعد واحد مكانها.",
    ], moving(timetableGrid(box("timetable"), langs),
      appear(on("Every", "كل"), on("period", "موعدًا")),
      track("frame", [on("rule", "قاعدة"), 0], [on("away", "مواعيد", 0.5), 3, "linear"], [on("guesses", "يخمّن"), 4, "step"], [on("falls", "مكانها"), 13, "linear"]))),
    scene("opt-gantt", "Print, then staple", "اطبع ثم دبّس", [
      "Each class's paper is printed, then stapled. In list order the stapler keeps waiting: twenty-one minutes. Johnson's rule prints the short jobs first and staples the short ones last: eighteen.",
      "تُطبع ورقة كل صف ثم تُدبَّس. بترتيب القائمة تنتظر الدبّاسة كثيرًا: إحدى وعشرون دقيقة. قاعدة جونسون تطبع القصيرة أولًا وتدبّس القصيرة أخيرًا: ثماني عشرة.",
    ], moving(printingGantt(box("print"), langs),
      appear(on("printed", "تُطبع"), on("stapled", "تُدبَّس")),
      track("frame", [on("list", "القائمة"), 0], [on("twenty-one", "إحدى"), 5, "linear"], [on("Johnson's", "جونسون"), 5], [on("Johnson's", "جونسون", 1.2), 6, "linear"]))),
    scene("opt-greedy", "Pack the truck", "حمّل الشاحنة", [
      "The truck carries a thousand kilos. Greedy packing takes the most points per kilo first, then whatever still fits: sixty points. But desks and books fill it exactly: sixty-five.",
      "تحمل الشاحنة ألف كيلوغرام. الطريقة الجشعة تأخذ أكثر النقاط لكل كيلو أولًا، ثم ما يتسع بعدها: ستون نقطة. لكن المقاعد والكتب تملؤها تمامًا: خمس وستون.",
    ], moving(truckBag(box("truck"), langs),
      appear(on("truck", "الشاحنة"), on("thousand", "ألف", 0.6)),
      track("frame", [on("Greedy", "الجشعة"), 0], [on("fits", "يتسع", 0.3), 6, "linear"], [on("sixty", "ستون"), 7, "step"], [on("desks", "المقاعد"), 8, "step"]))),
    scene("opt-dp", "Every smaller truck first", "كل شاحنة أصغر أولًا", [
      "Dynamic programming solves every smaller truck first. Each row adds one item, and each cell keeps the better of leaving it or taking it. The corner holds the best: sixty-five.",
      "البرمجة الديناميكية تحل كل شاحنة أصغر أولًا. كل صف يضيف غرضًا، وكل خانة تحتفظ بالأفضل بين تركه وأخذه. والزاوية تحمل الأفضل: خمس وستون.",
    ], moving(truckTable(box("table"), langs),
      appear(on("Dynamic", "البرمجة"), on("Dynamic", "البرمجة", 1)),
      track("frame", [on("smaller", "أصغر"), 0], [on("taking", "وأخذه", 0.5), 6, "linear"], [on("corner", "والزاوية"), 7, "step"]))),
    scene("opt-lp", "The best plan is at a corner", "أفضل خطة في زاوية", [
      "The garden has limits of land, water and pupils' hours. Each limit is a line, and the plans that fit are the shaded shape. Slide the profit line up: it leaves at a corner.",
      "للحديقة قيود من الأرض والماء وساعات التلاميذ. كل قيد خط، والخطط الممكنة هي الشكل المظلل. حرّك خط الربح إلى الأعلى: إنه يغادر عند زاوية.",
    ], moving(gardenLp(box("garden"), langs),
      track("reveal", [on("land", "الأرض"), 0], [on("land", "الأرض", 0.6), 0.2, "linear"], [on("water", "والماء"), 0.2], [on("water", "والماء", 0.6), 0.4, "linear"],
        [on("hours", "التلاميذ"), 0.4], [on("hours", "التلاميذ", 0.6), 0.6, "linear"], [on("shaded", "المظلل"), 0.6], [on("shaded", "المظلل", 0.8), 1, "linear"]),
      track("frame", [on("Slide", "حرّك"), 0], [on("corner", "زاوية", 0.3), 3, "linear"]))),
    scene("opt-bnb", "Branch and bound", "التفريع والتحديد", [
      "Branch and bound tries each item in or out, but first works out the most a branch could still reach. A branch that can't beat the best load so far is cut off unseen.",
      "التفريع والتحديد يجرب كل غرض داخلًا أو خارجًا، لكنه يحسب أولًا أقصى ما يمكن أن يبلغه الفرع. والفرع الذي لا يتفوق على أفضل حمولة حتى الآن يُقطع دون فحص.",
    ], moving(truckTree(box("tree"), langs),
      track("frame", [on("tries", "يجرب"), 0], [on("reach", "يبلغه"), 5, "linear"], [on("cut", "يُقطع", 1), 10, "linear"]))),
  ];
}
