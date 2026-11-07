// Diagrams for the university architecture videos. The words stay the lesson's own;
// the picture is the thing the sentence is talking about (a cut, a valley, a sum), drawn
// with Darsi's science kit. Not a copy of anyone's slides.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const t = (en, ar) => ({ en, "ar-EG": ar });

const neuron = {
  who: null,
  network: {
    layers: [2, 1],
    in: [t("x₁", "س١"), t("x₂", "س٢")],
    out: [t("output", "المخرج")],
    names: [t("Inputs", "المدخلات"), t("The bend", "الانحناء")],
    s: 0,
    forward: 1,
  },
  equation: { tex: "\\hat{y}=g(w_1 x_1+w_2 x_2+b)", size: 48, s: 0 },
};

const stillOneCut = {
  who: null,
  network: {
    layers: [2, 3, 1],
    names: [t("Inputs", "المدخلات"), t("No bend", "من غير انحناء"), t("One cut", "قطع واحد")],
    s: 0,
  },
  equation: { tex: "\\hat{y}=Wx+b", size: 52, s: 1 },
};

const relu = {
  who: null,
  plot: {
    xr: [-2, 2], yr: [-0.5, 2], grid: true,
    xLabel: t("sum", "المجموع"), yLabel: t("output", "المخرج"),
    series: [
      { kind: "fn", fn: "x", tone: "muted", dash: true, label: t("No bend", "من غير انحناء") },
      { kind: "fn", fn: "max(0, x)", tone: "accent", label: t("The bend", "الانحناء") },
    ],
    s: 0,
  },
};

const ringLine = {
  who: null,
  training: { data: "circle", layers: [2, 1], epochs: 80, lr: 0.4, show: "map", frames: [0, 1] },
};

const ringBend = {
  who: null,
  training: { data: "circle", layers: [2, 4, 4, 1], show: "both", frames: [0, 1] },
};

const handStep = {
  who: null,
  equation: { tex: "\\hat{y}=\\max(0,\\,1\\cdot 2+3\\cdot 1-1)=4", size: 46, s: 1 },
};

const goodPath = [[3, 9], [2.4, 5.76], [1.92, 3.69], [1.54, 2.36], [1.23, 1.51], [0.98, 0.97]];
// The big step leaves the valley and stays there. No trail: a line between those points would cut across the curve.
const bigPath = [[3, 9], [3, 9], [-4, 16], [-4, 16], [-4, 16], [-4, 16]];
const valley = {
  who: null,
  plot: {
    // x² stays under the top of the axes (at ±5 it reached 25 and ran off the stage when the plot has no headline).
    xr: [-4.4, 4.4], yr: [0, 20], grid: true,
    xLabel: t("weight", "الوزن"), yLabel: t("loss", "الخسارة"),
    series: [
      { kind: "fn", fn: "x^2", tone: "fg" },
      { kind: "marker", tone: "ok", trail: true, label: t("Small step", "خطوة صغيرة"), pts: goodPath },
      { kind: "marker", tone: "danger", trail: false, label: t("Too big", "كبيرة زيادة"), pts: bigPath },
    ],
    frames: [0, 1],
    s: 0,
  },
};

const lossEq = { who: null, equation: { tex: "L=(\\hat{y}-y)^2", size: 64, s: 0 } };
const stepEq = {
  who: null,
  equation: { tex: "\\g{1}{\\theta=3-0.1\\times 6}\\g{2}{=2.4}", size: 56, parts: [0, 1] },
};
// The quick check's own step (theta two, a quarter), not scene 5's worked one.
const revealEq = {
  who: null,
  equation: { tex: "\\g{1}{\\theta=2-\\frac{1}{4}\\times 4}\\g{2}{=1}", size: 56, parts: [0, 1] },
};
const backprop = {
  who: null,
  network: {
    layers: [1, 2, 1],
    names: [t("Input", "المدخل"), t("Hidden", "مخفية"), t("Loss", "الخسارة")],
    s: 0,
    forward: 0,
    backward: 1,
  },
};

const fade = {
  xr: [0, 3], yr: [0, 1], grid: true,
  // «الفاضلة» (what is left of the cue), not «الفاضية» (empty).
  xLabel: t("empty steps", "خطوات فاضية"), yLabel: t("cue left", "الإشارة الفاضلة"),
  series: [{ kind: "line", pts: [[0, 1], [1, 0.5], [2, 0.25], [3, 0.12]], tone: "accent", label: t("Keep half", "احتفظ بالنص") }],
  s: 0,
};
const fadePlot = { who: null, plot: fade };
const fadeWithEq = {
  who: null,
  plot: fade,
  equation: { tex: "h_{t}=0.5\\,h_{t-1}", size: 48, s: 0 },
};
const twoMemories = {
  who: null,
  plot: {
    xr: [0, 3], yr: [0, 100], grid: true,
    xLabel: t("empty steps", "خطوات فاضية"), yLabel: t("cue left", "الإشارة الفاضلة"),
    series: [
      { kind: "line", pts: [[0, 100], [1, 20], [2, 4], [3, 1]], tone: "danger", label: t("Weak", "ضعيفة") },
      { kind: "line", pts: [[0, 100], [1, 90], [2, 81], [3, 73]], tone: "ok", label: t("Strong", "قوية") },
    ],
    s: 1,
  },
};
const halfStep = { who: null, equation: { tex: "1\\times\\frac{1}{2}=\\frac{1}{2}", size: 64, s: 1 } };

// The melody lab's own counts (apps/web/src/labs/apps/melody/model.ts: the tune C E A E C E A E): how often each pitch
// followed each other one. Letters as the lab shows them, in both languages.
const L = (x) => t(x, x);
const counts = {
  who: null,
  table: {
    cols: [t("From", "من"), t("then C", "بعدها C"), t("then E", "بعدها E"), t("then A", "بعدها A")],
    rows: [
      [L("C"), 0, 2, 0],
      [L("E"), 1, 0, 2],
      [L("A"), 0, 2, 0],
    ],
    ltr: [0],
    s: 2,
  },
};
// Attention is not that table: the last note (E) weighs every earlier note, itself included, and the weights add up
// to 1. The new vector is their weighted sum.
const attention = {
  who: null,
  table: {
    cols: ["C", "E", "A", "E", "C", "E", "A", "E"].map(L),
    rows: [["0.05", "0.20", "0.10", "0.20", "0.05", "0.20", "0.05", "0.15"]],
    ltr: [0, 1, 2, 3, 4, 5, 6, 7],
    s: 0,
  },
  equation: { tex: "y=\\sum_i w_i\\,v_i\\qquad\\sum_i w_i=1", size: 48, s: 1 },
};

// One transformer block as the melody lab would need it: a decoder (its attention looks back only, which scene 3
// shows), not the "transformer" preset's encoder. The residual arrow carries the original around the attention; its
// name is on the block it joins, because the player writes an under-arrow's label across that block's edge.
const decoder = (extra) => ({
  who: null,
  arch: {
    blocks: [
      { id: "tok", kind: "input", label: t("Notes so far", "النغمات السابقة") },
      { id: "att", kind: "attn", label: t("Attention", "الانتباه") },
      { id: "n1", kind: "norm", label: t("Add & norm", "الجمع والتطبيع"), note: t("+ residual", "+ الوصلة المتبقية") },
      { id: "ff", kind: "ffn", label: t("Feed forward", "الشبكة الأمامية") },
      { id: "out", kind: "softmax", label: t("Next note", "النغمة الجاية") },
    ],
    edges: [
      { from: "tok", to: "att" }, { from: "att", to: "n1" }, { from: "n1", to: "ff" }, { from: "ff", to: "out" },
      { from: "tok", to: "n1", skip: true },
    ],
    ...extra,
  },
});

// The autoencoder of the code lab: two numbers, and a decode that paints a new blob (a summary, not the pixels).
const squeeze = (focus) => ({
  who: null,
  arch: {
    blocks: [
      { id: "in", kind: "input", label: t("Image", "الصورة") },
      { id: "enc", kind: "dense", label: t("Encoder", "المُرمِّز"), note: t("finds the centre", "بيلاقي المركز") },
      { id: "code", kind: "embed", label: t("Code", "الرمز"), note: t("2 numbers", "رقمين") },
      { id: "dec", kind: "dense", label: t("Decoder", "فكّ الترميز"), note: t("paints a blob", "بيرسم بقعة") },
      { id: "out", kind: "output", label: t("New blob", "بقعة جديدة"), note: t("summary", "ملخّص") },
    ],
    edges: [{ from: "in", to: "enc" }, { from: "enc", to: "code" }, { from: "code", to: "dec" }, { from: "dec", to: "out" }],
    focus,
    pass: 1,
  },
});

// The teach lab's model (Darsi Tiny): six decoder blocks, of which only the top one learns; the embedding and the
// output layer stay frozen. Not the "gpt" preset, whose last box (softmax) is the part that does not learn here.
const tiny = (extra) => ({
  who: null,
  arch: {
    blocks: [
      { id: "tok", kind: "input", label: t("Tokens so far", "التوكنز السابقة") },
      { id: "emb", kind: "embed", label: t("Embedding", "التضمين"), note: t("frozen", "مجمّد") },
      { id: "low", kind: "model", label: t("Block", "كتلة") },
      { id: "top", kind: "model", label: t("Top block", "الكتلة اللي فوق"), note: t("learns", "بتتعلّم") },
      { id: "out", kind: "softmax", label: t("Next token", "التوكن الجاي"), note: t("frozen", "مجمّد") },
    ],
    edges: [{ from: "tok", to: "emb" }, { from: "emb", to: "low" }, { from: "low", to: "top" }, { from: "top", to: "out" }],
    groups: [{ id: "frozen", label: t("Frozen", "مجمّدة"), repeat: 5, blocks: ["low"] }],
    ...extra,
  },
});

const grid = {
  who: null,
  table: {
    cols: [t("Row", "صف"), t("Left", "شمال"), t("Middle", "نص"), t("Right", "يمين")],
    rows: [
      ["1", 20, 180, 20],
      ["2", 20, 180, 20],
      ["3", 20, 180, 20],
    ],
    ltr: [0, 1, 2, 3],
    s: 0,
  },
};
// Many layers before a name. The "cnn" preset's seven blocks are too narrow for "Convolution" (7 px over its box),
// so the filter-and-pool pair is drawn once and repeated; the last box is the name the lesson talks about.
const cnn = {
  who: null,
  arch: {
    blocks: [
      { id: "img", kind: "input", label: t("Image", "الصورة"), note: "28×28" },
      { id: "conv", kind: "conv", label: t("Convolution", "الالتفاف"), note: "8 × 3×3" },
      { id: "pool", kind: "pool", label: t("Pooling", "التجميع"), note: "2×2" },
      { id: "fc", kind: "dense", label: t("Dense", "طبقة كاملة"), note: "64" },
      { id: "out", kind: "softmax", label: t("Name", "الاسم"), note: t("1 of 10", "1 من 10") },
    ],
    edges: [{ from: "img", to: "conv" }, { from: "conv", to: "pool" }, { from: "pool", to: "fc" }, { from: "fc", to: "out" }],
    groups: [{ id: "layers", label: t("Layers", "طبقات"), repeat: 2, blocks: ["conv", "pool"] }],
    pass: 1,
  },
};
const patch = {
  who: null,
  table: {
    cols: [t("Cell", "خانة"), t("Left", "شمال"), t("Middle", "نص"), t("Right", "يمين")],
    rows: [
      [t("Top", "فوق"), 1, 0, 2],
      [t("Middle", "نص"), 0, 1, 0],
      [t("Low", "تحت"), 3, 0, 1],
    ],
    ltr: [1, 2, 3],
    // Four rows above the equation fit at 32 px (the default 34 ran 6 px past the table's box).
    size: 32,
    s: 0,
  },
  equation: { tex: "1+0+2+0+1+0+3+0+1=8", size: 44, s: 1 },
};

const face = (box) => ({
  who: null,
  plot: {
    xr: [0, 1], yr: [0, 1], grid: true,
    xLabel: t("eye spacing", "مسافة العين"), yLabel: t("score", "الدرجة"),
    series: [
      { kind: "hline", at: 0.55, tone: "danger", dash: true, label: t("The line", "الخط") },
      {
        kind: "dots",
        pts: box ? [[0.28, 0.82], [0.78, 0.32], [0.55, 0.18]] : [[0.28, 0.82], [0.78, 0.32]],
        cls: box ? [1, 2, 2] : [1, 2],
        label: t("Drawings", "رسومات"),
      },
    ],
    s: 0,
  },
});

const codeDot = {
  who: null,
  plot: {
    xr: [0, 1], yr: [0, 1], grid: true,
    xLabel: t("across", "أفقي"), yLabel: t("down", "لتحت"),
    series: [{ kind: "dots", pts: [[0.32, 0.46]], cls: [0], label: t("The code", "الرمز") }],
    s: 0,
  },
};

const denoise = {
  who: null,
  plot: {
    xr: [0, 5], yr: [0, 1], grid: true,
    xLabel: t("step", "الخطوة"), yLabel: t("noise", "الضوضاء"),
    series: [{ kind: "line", pts: [[0, 0.08], [1, 0.45], [2, 1], [3, 0.62], [4, 0.35], [5, 0.16]], tone: "accent", label: t("Add, then remove a little", "ضيف، وبعدين شيل شوية") }],
    s: 0,
  },
};

const loop = {
  who: null,
  arch: {
    blocks: [
      { id: "agent", kind: "model", label: t("Agent", "الوكيل") },
      { id: "world", kind: "box", label: t("World", "الدنيا") },
      { id: "reward", kind: "output", label: t("Later reward", "مكافأة متأخرة") },
    ],
    edges: [
      { from: "agent", to: "world" },
      { from: "world", to: "reward" },
      { from: "reward", to: "agent", skip: true, label: t("credit", "الفضل") },
    ],
    pass: 1,
  },
};

// The inventor makes a picture from noise. The real picture goes to the judge, not back into the inventor.
const contest = {
  who: null,
  arch: {
    blocks: [
      { id: "noise", kind: "input", label: t("Noise", "ضوضاء") },
      { id: "gen", kind: "model", label: t("Inventor", "المخترع") },
      { id: "fake", kind: "box", label: t("Made-up", "مخترعة") },
      { id: "judge", kind: "model", label: t("Judge", "المميِّز") },
      { id: "real", kind: "input", label: t("Real picture", "صورة حقيقية") },
      { id: "out", kind: "output", label: t("Real or made up?", "حقيقية ولا لأ؟") },
    ],
    edges: [
      { from: "noise", to: "gen" },
      { from: "gen", to: "fake" },
      { from: "fake", to: "judge" },
      { from: "real", to: "judge", skip: true },
      { from: "judge", to: "out" },
    ],
    pass: 1,
  },
};

const stored = {
  who: null,
  table: {
    cols: [t("Stored", "المتخزّن"), t("It grows with", "بيكبر مع")],
    rows: [
      [t("Weights", "الأوزان"), t("the width", "العرض")],
      // A step keeps these too (the units' reading); the split lab counts only the weights and the activations.
      [t("Gradients, optimiser state", "التدرّجات وحالة المحسِّن"), t("the width", "العرض")],
      [t("Activations", "التنشيطات"), t("the batch and the width", "الدفعة والعرض")],
    ],
    s: 0,
  },
};

/** Concept scenes, shared by the student lesson and the lecturer cut. Scene numbers. */
export const RICH = {
  "A stack of neurons": { 3: neuron, 4: stillOneCut, 5: relu, 6: ringBend },
  "Loss, descent and backprop": { 3: lossEq, 4: backprop, 5: stepEq, 6: valley, 8: revealEq },
  "Sequences and the memory that fades": { 3: { who: null, arch: { preset: "rnn", pass: 1 } }, 4: fadeWithEq, 6: twoMemories },
  "Attention and the transformer": { 3: attention, 4: decoder({ focus: [{ block: "n1", s: 0 }] }), 6: decoder({ pass: 1 }) },
  "A picture is a grid of numbers": { 4: patch, 6: patch, 8: cnn },
  "Who a detector misses": {
    4: face(true),
    6: face(false),
    8: face(false),
  },
  "Squeeze and sample": {
    3: squeeze([{ block: "enc", s: 0 }, { block: "dec", s: 1 }]),
    6: squeeze([{ block: "code", s: 0 }, { block: "out", s: 1 }]),
  },
  "Adversaries and noise": { 3: contest, 4: denoise },
  "Learn from reward": { 3: loop },
  "A language model, and changing one": {
    3: tiny({ focus: [{ block: "top", s: 0 }], pass: 1 }),
    6: tiny({ focus: [{ block: "low", s: 0 }, { block: "top", s: 1 }], pass: 1 }),
  },
  "Science stand-ins, and one machine": { 4: stored },
};

/** Opening picture, students only: the lecturer's first line is a different sentence. */
export const HOOKS = {
  "A stack of neurons": ringLine,
  "Loss, descent and backprop": valley,
  "Sequences and the memory that fades": fadePlot,
  "Attention and the transformer": counts,
  "A picture is a grid of numbers": grid,
  "Who a detector misses": face(false),
  "Squeeze and sample": codeDot,
  "Learn from reward": loop,
  "A language model, and changing one": tiny({ focus: [{ block: "out", s: 0 }], pass: 0 }),
};

/** The paper exercise, students only. */
export const PAPER = {
  "A stack of neurons": handStep,
  "Loss, descent and backprop": stepEq,
  "Sequences and the memory that fades": halfStep,
  "A picture is a grid of numbers": { who: null, equation: { tex: "1+0+2+0+1+0+3+0+1=8", size: 52, s: 1 } },
};

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(here, "..", "..", "content", "darsi");
  let n = 0;
  for (const file of readdirSync(join(root, "source"))) {
    if (!file.startsWith("AI-")) continue;
    const story = JSON.parse(readFileSync(join(root, "source", file), "utf8"));
    const title = story.lesson?.title;
    if (!RICH[title] && !HOOKS[title]) continue;
    const id = story.id.toLowerCase();
    const teach = id.startsWith("ai-u");
    const designPath = join(root, id, "design.json");
    const design = JSON.parse(readFileSync(designPath, "utf8"));
    const rich = RICH[title] ?? {};
    for (const [scene, board] of Object.entries(rich)) design.scenes[scene] = board;
    if (!teach && HOOKS[title]) design.scenes["1"] = HOOKS[title];
    if (!teach && PAPER[title]) design.scenes["12"] = PAPER[title];
    writeFileSync(designPath, JSON.stringify(design, null, 2) + "\n");
    n++;
  }
  console.log(`diagrams written into ${n} design files`);
}
