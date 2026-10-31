/**
 * Content for the science elements, computed when a lesson is made (never on the phone): real training runs of a small
 * network, gradient descent, a fitted line, k-means, and ready-made architecture diagrams with their labels in English
 * and Arabic. Everything is seeded, so the same call always gives the same lesson.
 */
import type { ArchElement, ArchKind, NetElement, PlotElement, PlotSeries, Text } from "@lessonstudio/spec";
import { compileExpr } from "@lessonstudio/spec/science";

/** mulberry32: a small seeded generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Labels for the lesson's languages: English, and the Arabic for every Arabic variant (ar, ar-EG…). */
export function tx(en: string, ar: string, langs: string[] = ["en", "ar"]): Text {
  return Object.fromEntries(langs.map((l) => [l, l.split("-")[0] === "ar" ? ar : en]));
}

/* ---------- datasets: two classes in the square [-1.5, 1.5]² ---------- */

export type Dataset = "xor" | "circle" | "moons" | "line" | "spiral";

export function dataset(name: Dataset, n = 60, seed = 7): { pts: [number, number][]; cls: number[] } {
  const r = rng(seed);
  const g = (): number => (r() + r() + r() - 1.5) * 0.35;
  const pts: [number, number][] = [];
  const cls: number[] = [];
  for (let i = 0; i < n; i++) {
    let x: number, y: number, c: number;
    switch (name) {
      case "xor": { const sx = i % 2 ? 1 : -1; const sy = (i >> 1) % 2 ? 1 : -1; x = sx * 0.75 + g(); y = sy * 0.75 + g(); c = sx * sy > 0 ? 0 : 1; break; }
      case "circle": { const a = r() * 2 * Math.PI; const inner = i % 2 === 0; const rad = inner ? r() * 0.55 : 0.95 + r() * 0.4; x = rad * Math.cos(a); y = rad * Math.sin(a); c = inner ? 1 : 0; break; }
      case "moons": { const a = r() * Math.PI; const top = i % 2 === 0; x = top ? Math.cos(a) - 0.4 : 0.6 - Math.cos(a); y = (top ? Math.sin(a) - 0.2 : 0.2 - Math.sin(a)) + g() * 0.5; c = top ? 0 : 1; break; }
      case "spiral": { const k = i % 2; const t = (i >> 1) / (n / 2) * 3.2 + 0.4; x = (t / 3.2) * 1.3 * Math.cos(t + k * Math.PI) + g() * 0.3; y = (t / 3.2) * 1.3 * Math.sin(t + k * Math.PI) + g() * 0.3; c = k; break; }
      default: { x = r() * 3 - 1.5; y = r() * 3 - 1.5; c = y > 0.5 * x + 0.1 ? 1 : 0; }
    }
    pts.push([r3(x), r3(y)]);
    cls.push(c);
  }
  return { pts, cls };
}

/* ---------- a small network trained for real ---------- */

export interface TrainOptions {
  /** Neurons per layer, inputs first: [2, 4, 4, 1]. Two inputs (x, y), one output (the class). */
  layers: number[];
  data: Dataset | { pts: [number, number][]; cls: number[] };
  epochs?: number;
  lr?: number;
  /** Snapshots to keep (frames), spread over training. */
  frames?: number;
  seed?: number;
  /** Cells per side of the decision map. */
  grid?: number;
  /** The input whose activations the network drawing shows. */
  sample?: [number, number];
}

export interface Trained {
  pts: [number, number][];
  cls: number[];
  /** [epoch, loss] and [epoch, accuracy], one per frame. */
  loss: [number, number][];
  acc: [number, number][];
  /** For a NetElement: weights[frame][layer][from][to], acts[frame][layer][neuron]. */
  weights: number[][][][];
  acts: number[][][];
  /** The class the network gives each cell of the square, per frame (rows from the top). */
  heat: number[][][];
  /** Each point's predicted class, per frame. */
  predicted: number[][];
}

/** Trains a tanh network with a sigmoid output by full-batch gradient descent, keeping snapshots. */
export function trainNet(o: TrainOptions): Trained {
  const L = o.layers;
  if (L[0] !== 2 || L[L.length - 1] !== 1) throw new Error("trainNet: two inputs and one output");
  const { pts, cls } = typeof o.data === "string" ? dataset(o.data) : o.data;
  const epochs = o.epochs ?? 400;
  const lr = o.lr ?? 0.3;
  const nf = o.frames ?? 12;
  const gridN = o.grid ?? 20;
  const r = rng(o.seed ?? 3);
  // Weights W[l][i][j] from neuron i of layer l to j of layer l+1; biases B[l][j].
  const Wt = L.slice(1).map((n, l) => Array.from({ length: L[l]! }, () => Array.from({ length: n }, () => (r() * 2 - 1) * Math.sqrt(2 / (L[l]! + n)))));
  const B = L.slice(1).map((n) => Array.from({ length: n }, () => 0));
  const forward = (x: number[]): number[][] => {
    const a: number[][] = [x];
    for (let l = 0; l < L.length - 1; l++) {
      const out = B[l]!.map((b, j) => a[l]!.reduce((s, v, i) => s + v * Wt[l]![i]![j]!, b));
      a.push(l === L.length - 2 ? out.map((z) => 1 / (1 + Math.exp(-z))) : out.map(Math.tanh));
    }
    return a;
  };
  const snapEpochs = Array.from({ length: nf }, (_, k) => Math.round((k / (nf - 1)) * epochs));
  const out: Trained = { pts, cls, loss: [], acc: [], weights: [], acts: [], heat: [], predicted: [] };
  const sample = o.sample ?? pts[0]!;
  const snap = (epoch: number): void => {
    let loss = 0;
    let right = 0;
    const pred: number[] = [];
    pts.forEach((p, n) => {
      const y = forward(p)[L.length - 1]![0]!;
      loss -= cls[n]! ? Math.log(Math.max(1e-9, y)) : Math.log(Math.max(1e-9, 1 - y));
      pred.push(y > 0.5 ? 1 : 0);
      if ((y > 0.5 ? 1 : 0) === cls[n]) right++;
    });
    out.loss.push([epoch, r3(loss / pts.length)]);
    out.acc.push([epoch, r3(right / pts.length)]);
    out.predicted.push(pred);
    out.weights.push(Wt.map((m) => m.map((row) => row.map(r3))));
    out.acts.push(forward(sample).map((a) => a.map((v) => r3(Math.max(-1, Math.min(1, v))))));
    out.heat.push(Array.from({ length: gridN }, (_, row) => Array.from({ length: gridN }, (_, col) => {
      const x = -1.5 + (3 * (col + 0.5)) / gridN;
      const y = 1.5 - (3 * (row + 0.5)) / gridN;
      return forward([x, y])[L.length - 1]![0]! > 0.5 ? 1 : 0;
    })));
  };
  let next = 0;
  for (let e = 0; e <= epochs; e++) {
    if (e === snapEpochs[next]) { snap(e); next++; }
    if (e === epochs) break;
    // Gradients over the whole set (backpropagation, by hand).
    const gW = Wt.map((m) => m.map((row) => row.map(() => 0)));
    const gB = B.map((b) => b.map(() => 0));
    pts.forEach((p, n) => {
      const a = forward(p);
      let delta = [a[L.length - 1]![0]! - cls[n]!];
      for (let l = L.length - 2; l >= 0; l--) {
        for (let i = 0; i < L[l]!; i++) for (let j = 0; j < L[l + 1]!; j++) gW[l]![i]![j]! += a[l]![i]! * delta[j]!;
        for (let j = 0; j < L[l + 1]!; j++) gB[l]![j]! += delta[j]!;
        if (l > 0) delta = a[l]!.map((v, i) => (1 - v * v) * delta.reduce((s, d, j) => s + d * Wt[l]![i]![j]!, 0));
      }
    });
    const k = lr / pts.length;
    Wt.forEach((m, l) => m.forEach((row, i) => row.forEach((_, j) => { row[j] = row[j]! - k * gW[l]![i]![j]!; })));
    B.forEach((b, l) => b.forEach((_, j) => { b[j] = b[j]! - k * gB[l]![j]!; }));
  }
  return out;
}

/* ---------- gradient descent, a fitted line, k-means ---------- */

/** A ball rolling down y = fn(x): the points it visits, by gradient descent with a numeric slope. */
export function descend(fn: string, x0: number, lr: number, steps: number): [number, number][] {
  const f = compileExpr(fn);
  const out: [number, number][] = [];
  let x = x0;
  for (let s = 0; s <= steps; s++) {
    out.push([r3(x), r3(f(x, []))]);
    const slope = (f(x + 1e-4, []) - f(x - 1e-4, [])) / 2e-4;
    x -= lr * slope;
  }
  return out;
}

/** Fits y = a·x + b to points by gradient descent: the parameters per frame, and the loss (mean squared error). */
export function fitLine(pts: [number, number][], o: { steps?: number; lr?: number; frames?: number; a0?: number; b0?: number } = {}): { params: number[][]; loss: [number, number][] } {
  const steps = o.steps ?? 200;
  const lr = o.lr ?? 0.05;
  const nf = o.frames ?? 12;
  let a = o.a0 ?? -0.5;
  let b = o.b0 ?? 0;
  const params: number[][] = [];
  const loss: [number, number][] = [];
  const at = new Set(Array.from({ length: nf }, (_, k) => Math.round((k / (nf - 1)) * steps)));
  for (let s = 0; s <= steps; s++) {
    const err = pts.map(([x, y]) => a * x + b - y);
    if (at.has(s)) { params.push([r3(a), r3(b)]); loss.push([s, r3(err.reduce((t, e) => t + e * e, 0) / pts.length)]); }
    a -= lr * (2 / pts.length) * err.reduce((t, e, i) => t + e * pts[i]![0], 0);
    b -= lr * (2 / pts.length) * err.reduce((t, e) => t + e, 0);
  }
  return { params, loss };
}

/** k-means on points: each step's centres, and each point's group, per frame. */
export function kmeans(pts: [number, number][], k: number, steps = 6, seed = 5): { centres: [number, number][][]; groups: number[][] } {
  const r = rng(seed);
  let c: [number, number][] = Array.from({ length: k }, () => pts[Math.floor(r() * pts.length)]!.slice() as [number, number]);
  const centres: [number, number][][] = [];
  const groups: number[][] = [];
  for (let s = 0; s <= steps; s++) {
    const g = pts.map((p) => c.reduce((best, q, j) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(p[0] - c[best]![0], p[1] - c[best]![1]) ? j : best), 0));
    centres.push(c.map(([x, y]) => [r3(x), r3(y)]));
    groups.push(g);
    c = c.map((q, j) => {
      const mine = pts.filter((_, i) => g[i] === j);
      return mine.length ? [mine.reduce((t, p) => t + p[0], 0) / mine.length, mine.reduce((t, p) => t + p[1], 0) / mine.length] : q;
    });
  }
  return { centres, groups };
}

/* ---------- ready-made elements ---------- */

type Box = { id: string; x: number; y: number; w: number; h: number };

/** A plot of a training run: the points coloured by the network's answer, over its decision map, frame by frame. */
export function trainingPlot(t: Trained, box: Box): PlotElement {
  return {
    ...box, type: "plot", xr: [-1.5, 1.5], yr: [-1.5, 1.5], xTicks: [-1, 0, 1], yTicks: [-1, 0, 1],
    series: [
      { kind: "heat", frames: t.heat },
      // Dots in their true class, over the map of the network's answers: the mistakes stand out.
      { kind: "dots", pts: t.pts, cls: t.cls },
    ],
  };
}

/** The loss curve of a training run, to draw as training goes. */
export function lossPlot(t: Trained, box: Box, langs: string[] = ["en", "ar"]): PlotElement {
  const maxLoss = Math.max(...t.loss.map((p) => p[1]));
  const last = t.loss[t.loss.length - 1]![0];
  return {
    ...box, type: "plot", xr: [0, last], yr: [0, Math.ceil(maxLoss * 10) / 10], grid: true,
    xLabel: tx("Training round", "جولة التدريب", langs), yLabel: tx("Error (loss)", "الخطأ (الخسارة)", langs),
    series: [{ kind: "line", pts: t.loss, tone: "accent", label: tx("Loss", "الخسارة", langs) }],
  };
}

/** The network itself, with its weights and the sample's activations per frame. */
export function trainingNet(t: Trained, layers: number[], box: Box, langs: string[] = ["en", "ar"]): NetElement {
  return {
    ...box, type: "net", layers, weights: t.weights, acts: t.acts,
    labels: { in: [tx("x", "x", langs), tx("y", "y", langs)], out: [tx("Class", "الفئة", langs)] },
  };
}

/** A curve and a ball rolling down it by gradient descent. */
export function descentPlot(fn: string, x0: number, lr: number, steps: number, box: Box & { xr: [number, number]; yr: [number, number] }, langs: string[] = ["en", "ar"]): PlotElement {
  const { xr, yr, ...b } = box;
  const series: PlotSeries[] = [
    { kind: "fn", fn, tone: "fg" },
    { kind: "marker", pts: descend(fn, x0, lr, steps), trail: true, tone: "accent", label: tx("Each step downhill", "كل خطوة إلى الأسفل", langs) },
  ];
  return { ...b, type: "plot", xr, yr, series, xLabel: tx("Weight", "الوزن", langs), yLabel: tx("Error", "الخطأ", langs) };
}

/* ---------- architecture diagrams ---------- */

export type ArchPreset = "mlp" | "cnn" | "rnn" | "transformer" | "gpt" | "seq2seq" | "resnet" | "autoencoder" | "gan" | "agent" | "rag";
export const ARCH_PRESETS: ArchPreset[] = ["mlp", "cnn", "rnn", "transformer", "gpt", "seq2seq", "resnet", "autoencoder", "gan", "agent", "rag"];

type B = [id: string, kind: ArchKind, en: string, ar: string, noteEn?: string, noteAr?: string];

/** A ready-made architecture: blocks, arrows and groups with labels in the lesson's languages. Place it with `box`. */
export function archPreset(name: ArchPreset, box: Box, langs: string[] = ["en", "ar"]): ArchElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const blocks = (list: B[]): ArchElement["blocks"] =>
    list.map(([id, kind, en, ar, ne, na]) => ({ id, kind, label: T(en, ar), ...(ne ? { note: T(ne, na ?? ne) } : {}) }));
  const chain = (ids: string[]): ArchElement["edges"] => ids.slice(1).map((to, i) => ({ from: ids[i]!, to }));
  const make = (b: B[], edges: ArchElement["edges"], extra: Partial<ArchElement> = {}): ArchElement =>
    ({ ...box, type: "arch", blocks: blocks(b), edges, ...extra });
  switch (name) {
    case "mlp": return make([
      ["in", "input", "Input", "المدخلات", "x₁ … xₙ"], ["h1", "dense", "Hidden layer", "طبقة مخفية", "ReLU"],
      ["h2", "dense", "Hidden layer", "طبقة مخفية", "ReLU"], ["out", "softmax", "Output", "المخرجات", "softmax"],
    ], chain(["in", "h1", "h2", "out"]));
    case "cnn": return make([
      ["img", "input", "Image", "الصورة", "28×28"], ["c1", "conv", "Convolution", "الالتفاف", "8 × 3×3"], ["p1", "pool", "Pooling", "التجميع", "2×2"],
      ["c2", "conv", "Convolution", "الالتفاف", "16 × 3×3"], ["p2", "pool", "Pooling", "التجميع", "2×2"],
      ["fc", "dense", "Dense", "طبقة كاملة", "64"], ["out", "softmax", "Class", "الفئة", "10"],
    ], chain(["img", "c1", "p1", "c2", "p2", "fc", "out"]));
    case "rnn": return make([
      ["x", "input", "Word now", "الكلمة الآن", "xₜ"], ["h", "rnn", "Recurrent cell", "خلية متكررة", "memory hₜ", "الذاكرة hₜ"],
      ["y", "softmax", "Next word", "الكلمة التالية", "yₜ"],
    ], chain(["x", "h", "y"]));
    case "transformer": return make([
      ["tok", "input", "Tokens", "الرموز"], ["emb", "embed", "Embedding + position", "التضمين والموضع"],
      ["att", "attn", "Multi-head attention", "الانتباه متعدد الرؤوس"], ["n1", "norm", "Add & norm", "الجمع والتطبيع"],
      ["ff", "ffn", "Feed forward", "الشبكة الأمامية"], ["n2", "norm", "Add & norm", "الجمع والتطبيع"],
    ], [...chain(["tok", "emb", "att", "n1", "ff", "n2"]), { from: "emb", to: "n1", skip: true }, { from: "n1", to: "n2", skip: true }],
    { groups: [{ id: "enc", label: T("Encoder block", "كتلة المُرمِّز"), repeat: 6, blocks: ["att", "n1", "ff", "n2"] }] });
    case "gpt": return make([
      ["tok", "input", "Tokens so far", "الرموز حتى الآن"], ["emb", "embed", "Embedding + position", "التضمين والموضع"],
      ["att", "attn", "Masked self-attention", "انتباه ذاتي مقنّع"], ["n1", "norm", "Add & norm", "الجمع والتطبيع"],
      ["ff", "ffn", "Feed forward", "الشبكة الأمامية"], ["n2", "norm", "Add & norm", "الجمع والتطبيع"],
      ["out", "softmax", "Next token", "الرمز التالي", "softmax"],
    ], [...chain(["tok", "emb", "att", "n1", "ff", "n2", "out"]), { from: "emb", to: "n1", skip: true }, { from: "n1", to: "n2", skip: true }],
    { groups: [{ id: "dec", label: T("Decoder block", "كتلة فكّ الترميز"), repeat: 12, blocks: ["att", "n1", "ff", "n2"] }] });
    case "seq2seq": return make([
      ["src", "input", "Sentence in", "الجملة الأصلية"], ["enc", "rnn", "Encoder", "المُرمِّز"],
      ["tgt", "input", "Words so far", "الكلمات حتى الآن"], ["dec", "rnn", "Decoder", "فكّ الترميز"],
      ["out", "softmax", "Next word", "الكلمة التالية"],
    ], [{ from: "src", to: "enc" }, { from: "enc", to: "dec", label: T("meaning", "المعنى") }, { from: "tgt", to: "dec" }, { from: "dec", to: "out" }]);
    case "resnet": return make([
      ["in", "input", "Input", "المدخل"], ["c1", "conv", "Conv", "التفاف", "3×3"], ["b1", "norm", "Batch norm", "تطبيع"],
      ["r1", "act", "ReLU", "ReLU"], ["c2", "conv", "Conv", "التفاف", "3×3"], ["b2", "norm", "Batch norm", "تطبيع"],
      ["add", "add", "", ""], ["r2", "act", "ReLU", "ReLU"],
    ], [...chain(["in", "c1", "b1", "r1", "c2", "b2", "add", "r2"]), { from: "in", to: "add", skip: true, label: T("shortcut", "اختصار") }],
    { groups: [{ id: "blk", label: T("Residual block", "كتلة متبقية"), blocks: ["c1", "b1", "r1", "c2", "b2", "add"] }] });
    case "autoencoder": return make([
      ["in", "input", "Image", "الصورة"], ["enc", "dense", "Encoder", "المُرمِّز", "shrinks", "يضغط"],
      ["code", "embed", "Code", "الرمز المضغوط", "8 numbers", "8 أرقام"], ["dec", "dense", "Decoder", "فكّ الترميز", "rebuilds", "يعيد البناء"],
      ["out", "output", "Copy of the image", "نسخة من الصورة"],
    ], chain(["in", "enc", "code", "dec", "out"]));
    case "gan": return make([
      ["noise", "input", "Random noise", "ضوضاء عشوائية"], ["gen", "model", "Generator", "المولِّد"],
      ["fake", "box", "Fake image", "صورة مزيّفة"], ["real", "input", "Real image", "صورة حقيقية"],
      ["disc", "model", "Discriminator", "المميِّز"], ["out", "softmax", "Real or fake?", "حقيقية أم مزيّفة؟"],
    ], [...chain(["noise", "gen", "fake", "disc", "out"]), { from: "real", to: "disc" }]);
    case "agent": return make([
      ["req", "input", "Request", "الطلب"], ["llm", "model", "Language model", "النموذج اللغوي", "plans", "يخطّط"],
      ["mem", "store", "Memory", "الذاكرة"], ["tool", "tool", "Tool", "أداة", "calculator, search…", "حاسبة، بحث…"],
      ["ans", "output", "Answer", "الجواب"],
    ], [{ from: "req", to: "llm" }, { from: "mem", to: "llm" }, { from: "llm", to: "tool", label: T("call", "استدعاء") }, { from: "tool", to: "llm", skip: true, label: T("result", "النتيجة") }, { from: "llm", to: "ans" }]);
    case "rag": return make([
      ["q", "input", "Question", "السؤال"], ["search", "tool", "Search", "البحث"], ["docs", "store", "Documents", "المستندات"],
      ["llm", "model", "Language model", "النموذج اللغوي"], ["ans", "output", "Answer with sources", "جواب بالمصادر"],
    ], [...chain(["q", "search", "docs", "llm", "ans"]), { from: "q", to: "llm", skip: true }]);
  }
}
