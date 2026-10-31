// Writes the example lesson "Inside a neural network" (examples/inside-a-neural-network), which shows every science
// element: an equation built term by term, activation functions, a network trained for real, its decision map and
// loss curve, gradient descent, and the architectures of a CNN and a transformer, in English and Arabic.
// Then run `npm run timing -- inside-a-neural-network` for its estimated timings.
//   node scripts/make-science-example.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Element, Scene, Text, When } from "../packages/spec/src/index.ts";
import { archPreset, descentPlot, lossPlot, presetKeys, trainingNet, trainingPlot, trainNet, tx } from "../packages/ops/src/index.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ID = "inside-a-neural-network";
const dir = join(ROOT, "examples", ID);
const langs = ["en", "ar"];
const T = (en: string, ar: string): Text => tx(en, ar, langs);
const word = (en: string, ar: string, offset = 0): When => ({ word: { en, ar }, ...(offset ? { offset } : {}) });
const anim = <E extends Element>(el: E, ...tracks: NonNullable<Element["anim"]>): E => ({ ...el, anim: [...(el.anim ?? []), ...tracks] });
const headline = (id: string, en: string, ar: string): Element => ({ id, type: "text", x: 80, y: 56, w: 1120, size: 46, weight: 800, text: T(en, ar) });

const layers = [2, 4, 4, 1];
const run = trainNet({ layers, data: "circle", epochs: 300, lr: 0.6, frames: 12, sample: [0.2, 0.3] });

const scenes: Scene[] = [
  {
    id: "title", template: "title-hook",
    narration: { en: "What happens inside a neural network? Let's open one up.", ar: "ماذا يحدث داخل الشبكة العصبية؟ لنفتح واحدة ونرى." },
    content: { kicker: T("AI, from the inside", "الذكاء الاصطناعي من الداخل"), title: T("Inside a neural network", "داخل شبكة عصبية"), icon: "brain" },
  },
  {
    id: "neuron", template: "canvas",
    narration: {
      en: "One neuron multiplies each input by a weight, adds a bias, and squashes the total with an activation.",
      ar: "تضرب الخلية العصبية كل مدخل في وزن، وتضيف انحيازًا، ثم تضغط المجموع بدالة تنشيط.",
    },
    content: {
      elements: [
        headline("h", "One neuron", "خلية عصبية واحدة"),
        anim({ id: "eq", type: "math", x: 80, y: 170, w: 1120, h: 140, size: 64, tex: "\\g{4}{y} = \\g{3}{\\sigma}\\left(\\g{1}{w_1 x_1 + w_2 x_2} \\g{2}{+ \\c{accent}{b}}\\right)" },
          { prop: "reveal", keys: [{ at: word("weight", "وزن"), value: 0.25 }, { at: word("bias", "انحيازًا"), value: 0.5 }, { at: word("squashes", "تضغط"), value: 1 }] },
          { prop: "focus", keys: [{ at: word("weight", "وزن"), value: 1, ease: "step" }, { at: word("bias", "انحيازًا"), value: 2, ease: "step" }, { at: word("activation", "تنشيط"), value: 3, ease: "step" }] }),
        { id: "n", type: "net", x: 290, y: 340, w: 700, h: 300, layers: [2, 1], weights: [[[[0.9], [-0.6]]]], acts: [[[0.8, 0.3], [0.7]]], values: true, labels: { in: [T("x₁", "x₁"), T("x₂", "x₂")], out: [T("y", "y")] } },
      ],
    },
  },
  {
    id: "activations", template: "canvas",
    narration: {
      en: "The activation decides how strongly the neuron fires: the sigmoid, the tanh, or the simple ReLU.",
      ar: "تحدد دالة التنشيط قوة استجابة الخلية: السيجمويد، أو الظل الزائدي، أو دالة ReLU البسيطة.",
    },
    content: {
      elements: [
        headline("h", "Activation functions", "دوال التنشيط"),
        anim({ id: "p", type: "plot", x: 200, y: 150, w: 880, h: 500, xr: [-4, 4], yr: [-1.2, 1.2], grid: true,
          series: [
            { kind: "fn", fn: "sigmoid(x)", tone: "accent", label: T("sigmoid", "سيجمويد") },
            { kind: "fn", fn: "tanh(x)", tone: "ok", label: T("tanh", "الظل الزائدي") },
            { kind: "fn", fn: "relu(x)/3", tone: "danger", label: T("ReLU ÷ 3", "ReLU ÷ 3") },
          ] },
          { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: word("sigmoid", "السيجمويد"), value: 1 }] },
          { prop: "focus", keys: [{ at: word("sigmoid", "السيجمويد"), value: 1, ease: "step" }, { at: word("tanh", "الزائدي"), value: 2, ease: "step" }, { at: word("ReLU", "ReLU"), value: 3, ease: "step" }] }),
      ],
    },
  },
  {
    id: "network", template: "canvas",
    narration: {
      en: "Join many neurons in layers and you have a network. Data flows forward, and the error flows back to fix the weights.",
      ar: "اربط خلايا كثيرة في طبقات تحصل على شبكة. تتدفق البيانات إلى الأمام، ويعود الخطأ إلى الخلف ليصحّح الأوزان.",
    },
    content: {
      elements: [
        headline("h", "A network, layer by layer", "شبكة، طبقة بعد طبقة"),
        anim({ ...trainingNet(run, layers, { id: "net", x: 180, y: 150, w: 920, h: 500 }, langs), frame: 11 },
          { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: word("network", "شبكة"), value: 1 }] },
          { prop: "pass", keys: [{ at: word("forward", "الأمام"), value: 0 }, { at: word("forward", "الأمام", 1.6), value: 1, ease: "linear" }, { at: word("back", "الخلف"), value: 1 }, { at: word("back", "الخلف", 1.6), value: 2, ease: "linear" }, { at: word("back", "الخلف", 1.7), value: -1, ease: "step" }] }),
      ],
    },
  },
  {
    id: "training", template: "canvas",
    narration: {
      en: "Training repeats this many times. Watch the boundary bend around the inner circle as the loss falls.",
      ar: "يكرر التدريب ذلك مرات كثيرة. راقب الحد ينحني حول الدائرة الداخلية بينما تنخفض الخسارة.",
    },
    content: {
      elements: [
        headline("h", "Training, round by round", "التدريب، جولة بعد جولة"),
        anim(trainingPlot(run, { id: "map", x: 60, y: 140, w: 560, h: 520 }),
          { prop: "frame", keys: [{ at: word("Watch", "راقب"), value: 0 }, { at: word("falls", "تنخفض", 1.2), value: 11, ease: "linear" }] }),
        anim(lossPlot(run, { id: "loss", x: 660, y: 140, w: 580, h: 520 }, langs),
          { prop: "reveal", keys: [{ at: word("Watch", "راقب"), value: 0 }, { at: word("falls", "تنخفض", 1.2), value: 1, ease: "linear" }] }),
      ],
    },
  },
  {
    id: "descent", template: "canvas",
    narration: {
      en: "Each update is a step downhill on the error, like a ball rolling to the bottom of a valley.",
      ar: "كل تحديث خطوة إلى أسفل منحدر الخطأ، مثل كرة تتدحرج إلى قاع الوادي.",
    },
    content: {
      elements: [
        headline("h", "Gradient descent", "الانحدار التدرجي"),
        anim(descentPlot("(x-2)^2/2 + 0.5", -1.5, 0.35, 11, { id: "gd", x: 200, y: 150, w: 880, h: 500, xr: [-2, 5], yr: [0, 7] }, langs),
          { prop: "frame", keys: [{ at: word("step", "خطوة"), value: 0 }, { at: word("valley", "الوادي", 0.8), value: 11, ease: "out" }] }),
      ],
    },
  },
  {
    id: "cnn", template: "canvas",
    narration: {
      en: "For pictures, convolution layers scan for edges and shapes, then pooling layers shrink the picture before the final guess.",
      ar: "للصور، تبحث طبقات الالتفاف عن الحواف والأشكال، ثم تصغّر طبقات التجميع الصورة قبل التخمين الأخير.",
    },
    content: {
      elements: [
        headline("h", "A convolutional network", "شبكة التفافية"),
        anim(archPreset("cnn", { id: "cnn", x: 40, y: 170, w: 1200, h: 420 }, langs),
          { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: word("guess", "التخمين"), value: 1 }] },
          { prop: "focus", keys: [{ at: word("convolution", "الالتفاف"), value: 2, ease: "step" }, { at: word("pooling", "التجميع"), value: 3, ease: "step" }, { at: word("guess", "التخمين"), value: 7, ease: "step" }] }),
      ],
    },
  },
  {
    id: "transformer", template: "canvas",
    narration: {
      en: "Language models use transformers: attention lets every word look at every other word, and the block repeats many times.",
      ar: "تستخدم النماذج اللغوية المحوّلات: يتيح الانتباه لكل كلمة أن تنظر إلى كل كلمة أخرى، وتتكرر الكتلة مرات كثيرة.",
    },
    content: {
      elements: [
        headline("h", "A transformer block", "كتلة المحوّل"),
        anim(archPreset("transformer", { id: "tf", x: 40, y: 150, w: 1200, h: 470 }, langs),
          { prop: "reveal", keys: [{ at: 0.2, value: 0 }, { at: word("attention", "الانتباه"), value: 1 }] },
          { prop: "focus", keys: [{ at: word("attention", "الانتباه"), value: 3, ease: "step" }, { at: word("repeats", "تتكرر"), value: 0, ease: "step" }] },
          { prop: "pass", keys: [{ at: word("repeats", "تتكرر"), value: 0 }, { at: word("repeats", "تتكرر", 2), value: 1, ease: "linear" }, { at: word("repeats", "تتكرر", 2.1), value: -1, ease: "step" }] }),
      ],
    },
  },
  {
    id: "results", template: "canvas",
    narration: {
      en: "In the end the model gives each picture a class and how sure it is. Always check the unsure ones.",
      ar: "في النهاية يعطي النموذج كل صورة فئة ومدى ثقته. راجع دائمًا الصور التي لم يكن متأكدًا منها.",
    },
    content: {
      elements: [
        headline("h", "What the model says", "ماذا يقول النموذج"),
        anim({ id: "t", type: "table", x: 240, y: 160, w: 800, h: 400, size: 34, cols: [T("Picture", "الصورة"), T("Class", "الفئة"), T("Sure", "الثقة")],
          rows: [[T("Photo 1", "صورة 1"), T("cat", "قطة"), "97%"], [T("Photo 2", "صورة 2"), T("dog", "كلب"), "91%"], [T("Photo 3", "صورة 3"), T("cat", "قطة"), "52%"]], ltr: [2] },
          { prop: "reveal", keys: [{ at: 0.3, value: 0 }, { at: word("sure", "ثقته"), value: 1 }] },
          { prop: "focus", keys: [{ at: word("check", "راجع"), value: 3, ease: "step" }] }),
      ],
    },
  },
  {
    id: "summary", template: "summary",
    narration: { en: "Neurons, layers, training and architecture: now you've seen inside.", ar: "خلايا وطبقات وتدريب وبنية: الآن رأيت ما في الداخل." },
    content: {
      title: T("Remember", "تذكّر"),
      points: [T("A neuron: weights, a bias, an activation", "الخلية: أوزان وانحياز ودالة تنشيط"), T("Training: small steps downhill on the error", "التدريب: خطوات صغيرة نحو خطأ أقل"), T("Architecture: how the layers connect", "البنية: كيف ترتبط الطبقات")],
      takeaway: T("Every AI model is maths you can draw.", "كل نموذج ذكاء اصطناعي رياضيات يمكن رسمها."),
    },
  },
];
void presetKeys;

const manifest = {
  spec: "lesson-package", version: "0.2", id: ID, rev: 1,
  title: T("Inside a neural network", "داخل شبكة عصبية"),
  summary: T("Equations, plots, a network trained for real, and the architectures of CNNs and transformers, animated in step with the narration.",
    "معادلات ورسوم بيانية وشبكة مدرّبة فعلًا، وبنى الشبكات الالتفافية والمحوّلات، متحركة مع السرد."),
  topic: "ai", level: 2, defaultLang: "en", brand: "darsi-light", stage: "landscape",
  languages: [
    { code: "en", dir: "ltr", name: "English", duration: 1, timing: "timing/en.json", captions: "captions/en.vtt", quality: "draft" },
    { code: "ar", dir: "rtl", name: "العربية", duration: 1, timing: "timing/ar.json", captions: "captions/ar.vtt", quality: "machine" },
  ],
  provenance: { createdAt: "2026-10-28", createdBy: "Lesson Studio", tool: "scripts/make-science-example.ts (science elements, v0.3); timings estimated" },
  ai: { script: "ai-assisted", translation: "ai", narration: "none", visuals: "ai-assisted", avatar: "none" },
};
const old = (() => { try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; } })();
if (old) manifest.languages.forEach((l, i) => { l.duration = old.languages[i]?.duration ?? 1; });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "scenes.json"), JSON.stringify({ version: "0.2", scenes }) + "\n");
console.log(`wrote ${dir}`);
