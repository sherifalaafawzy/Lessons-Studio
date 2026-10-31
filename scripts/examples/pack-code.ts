// Writes the example lesson "Watch your code think" (examples/pack-code), which shows every element of the programming
// pack: a program traced line by line (recorded in real MicroPython), the same logic as a flowchart with a token
// running through it, a function's own variables, selection sort and binary search on arrays, a recursive call tree
// recorded from a real run, and a bug and its fix, in English and Arabic.
// Then run `node scripts/make-timing.mjs pack-code` for its estimated timings.
//   node scripts/examples/pack-code.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Element, Scene, Text, When } from "../../packages/spec/src/index.ts";
import { tx } from "../../packages/ops/src/index.ts";
import {
  arrayElement, calltreeElement, codediffElement, flowchart, passAt, recordTrace, searchFrames, sortFrames, traceCalls, traceElement, yesNo,
  type CallNode,
} from "../../packages/ops/src/packs/code.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ID = "pack-code";
const dir = join(ROOT, "examples", ID);
const langs = ["en", "ar"];
const T = (en: string, ar: string): Text => tx(en, ar, langs);
const N = (en: string, ar: string): Record<string, string> => ({ en, ar });
const w = (en: string, ar: string, offset = 0, occurrence = 0): When => ({ word: { en, ar }, ...(offset ? { offset } : {}), ...(occurrence ? { occurrence } : {}) });
type Track = NonNullable<Element["anim"]>[number];
const keys = (prop: Track["prop"], list: [When, number][], ease: "in-out" | "linear" | "step" = "in-out"): Track =>
  ({ prop, keys: list.map(([at, value], i) => ({ at, value, ...(i ? { ease } : {}) })) });
const anim = <E extends Element>(el: E, ...tracks: Track[]): E => ({ ...el, anim: tracks });
const headline = (en: string, ar: string): Element => ({ id: "h", type: "text", x: 80, y: 48, w: 1120, size: 46, weight: 800, text: T(en, ar) });
const body = (id: string, h = 520): { id: string; x: number; y: number; w: number; h: number } => ({ id, x: 80, y: 160 + Math.round((520 - h) / 2), w: 1120, h });
const canvas = (id: string, narration: Record<string, string>, ...elements: Element[]): Scene => ({ id, template: "canvas", narration, content: { elements } });

// Recorded in MicroPython, as Darsi's phones run Python.
const PASSED = "marks = [45, 80, 62]\npassed = 0\nfor m in marks:\n    if m >= 50:\n        passed = passed + 1\nprint(passed)";
const GREET = "def greet(name):\n    text = 'Hi ' + name\n    return text\n\nmsg = greet('Ada')\nprint(msg)";
const FIB = "def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\nprint(fib(4))";
const BUG = "for m in [7, 5, 9]:\n    total = 0\n    total = total + m\nprint(total)";
const FIX = "total = 0\nfor m in [7, 5, 9]:\n    total = total + m\nprint(total)";
const passed = await recordTrace(PASSED);
const greet = await recordTrace(GREET);
const fib = await recordTrace(FIB);
const bugOut = (await recordTrace(BUG)).output.trim();
const fixOut = (await recordTrace(FIX)).output.trim();
const expect = (cond: boolean, what: string): void => { if (!cond) throw new Error(`pack-code: ${what}`); };
expect(passed.steps.length === 12 && passed.output === "2\n", `the marks program ran ${passed.steps.length} steps and printed ${JSON.stringify(passed.output)}`);
expect(greet.steps.length === 6 && greet.output === "Hi Ada\n", `greet ran ${greet.steps.length} steps`);
expect(bugOut === "9" && fixOut === "21", `the bug printed ${bugOut} and the fix ${fixOut}`);
// The calls fib(4) made, with the ones worked out before marked.
const calls: CallNode[] = traceCalls(fib);
const seen = new Set<string>();
for (const c of calls) { if (seen.has(c.label)) c.tone = "accent2"; seen.add(c.label); }
const again = calls.findIndex((c) => c.tone);
const tree = calltreeElement(body("tree"), calls);

const { yes, no } = yesNo(langs);
const path = ["start", "init", "more", "test", "more", "test", "inc", "more", "test", "inc", "more", "show", "end"];
const chart = flowchart(body("flow"), [
  { id: "start", kind: "start", label: T("Start", "ابدأ") },
  { id: "init", kind: "process", label: "passed = 0" },
  { id: "more", kind: "decision", label: T("More marks?", "بقيت درجات؟") },
  { id: "test", kind: "decision", label: "m >= 50?" },
  { id: "show", kind: "io", label: "print(passed)" },
  { id: "inc", kind: "process", label: "passed = passed + 1" },
  { id: "end", kind: "end", label: T("End", "النهاية") },
], [
  { from: "start", to: "init" }, { from: "init", to: "more" }, { from: "more", to: "test", label: yes }, { from: "more", to: "show", label: no },
  { from: "test", to: "inc", label: yes }, { from: "test", to: "more", label: no }, { from: "inc", to: "more" }, { from: "show", to: "end" },
], { path });

const sortVals = [5, 3, 8, 1, 6, 2];
const sel = sortFrames("selection", sortVals, langs);
const findVals = [4, 9, 15, 22, 30, 37, 41, 50];
const bin = searchFrames("binary", findVals, 37, langs);
expect(bin.frames.length === 5 && bin.found === 5, `the binary search took ${bin.frames.length} frames`);

const scenes: Scene[] = [
  {
    id: "title", template: "title-hook",
    narration: N("What does a program do while it runs? Let's watch.", "ماذا يفعل البرنامج وهو يعمل؟ هيا نشاهد."),
    content: { title: T("Watch your code think", "شاهد الكود وهو يفكّر"), hook: T("Programming, from the inside", "البرمجة من الداخل"), icon: "chip" },
  },
  canvas("trace",
    N("This program counts the marks of fifty or more. passed starts at zero. For forty-five, the test fails, so nothing changes. For eighty, the test passes and passed becomes one. Sixty-two passes too, so passed is two, and the program prints two.",
      "يعدّ هذا البرنامج الدرجات التي تبلغ خمسين أو أكثر. يبدأ passed من الصفر. مع خمسة وأربعين يفشل الشرط، فلا يتغير شيء. ومع ثمانين ينجح الشرط ويصبح passed واحدًا. والدرجة اثنان وستون تنجح أيضًا، فيصبح passed اثنين، ويطبع البرنامج اثنين."),
    headline("A program, line by line", "برنامج، سطرًا بسطر"),
    anim(traceElement(body("code"), PASSED, passed, { langs }),
      keys("reveal", [[w("This", "يعد"), 0], [w("This", "يعد", 1), 1]], "linear"),
      keys("frame", [[w("counts", "يعد"), 0], [w("zero", "الصفر"), 1], [w("forty-five", "خمسة"), 2], [w("fails", "يفشل"), 3], [w("eighty", "ثمانين"), 4],
        [w("becomes", "واحدا"), 6], [w("Sixty-two", "وستون"), 7], [w("too", "أيضا"), 9], [w("prints", "ويطبع"), 11]]))),
  canvas("flowchart",
    N("Here is the same program as a flowchart. Take the next mark and test it. Forty-five fails, so we go back for the next one. Eighty passes, so we add one. Sixty-two passes too. With no marks left, we print the count and stop.",
      "هذا هو البرنامج نفسه في مخطط انسيابي. نأخذ الدرجة التالية ونختبرها. خمسة وأربعون تفشل، فنعود لنأخذ التالية. ثمانون تنجح، فنضيف واحدًا. واثنان وستون تنجح أيضًا. وحين لا تبقى درجات، نطبع العدد ونتوقف."),
    headline("The same logic as a flowchart", "المنطق نفسه في مخطط انسيابي"),
    anim(chart,
      keys("reveal", [[w("Here", "هذا"), 0], [w("flowchart", "انسيابي"), 1]], "linear"),
      keys("pass", [[w("Here", "هذا"), 0], [w("Take", "نأخذ"), passAt(path, 2)], [w("test", "ونختبرها"), passAt(path, 3)], [w("back", "فنعود"), passAt(path, 4)],
        [w("Eighty", "ثمانون"), passAt(path, 5)], [w("add", "فنضيف"), passAt(path, 6)], [w("too", "أيضا"), passAt(path, 9)], [w("With", "وحين"), passAt(path, 10)],
        [w("print", "نطبع"), passAt(path, 11)], [w("stop", "ونتوقف"), 1]]))),
  canvas("function",
    N("Python reads the function first, but runs nothing. Line five calls greet with the name Ada. Inside, text joins Hi and the name. Return hands it back, msg gets it, and print shows it.",
      "يقرأ بايثون الدالة أولًا، لكنه لا ينفّذ شيئًا. ثم يستدعي السطر الخامس greet بالاسم Ada. في داخلها يجمع text بين Hi والاسم. ثم تُعيده return، فيأخذه msg، وتعرضه print."),
    headline("A function has its own variables", "للدالة متغيراتها الخاصة"),
    anim(traceElement(body("code"), GREET, greet, { langs }),
      keys("reveal", [[w("Python", "يقرأ"), 0], [w("Python", "يقرأ", 1), 1]], "linear"),
      keys("frame", [[w("reads", "يقرأ"), 0], [w("calls", "يستدعي"), 1], [w("Inside", "داخلها"), 2], [w("Return", "تعيده"), 3], [w("msg", "msg"), 4], [w("print", "وتعرضه"), 5]]))),
  canvas("sort",
    N("Selection sort finds the smallest bar, with j scanning and min remembering the best so far. Then it swaps that bar to the front, at i. Round by round the sorted part grows, and the counters add up the work.",
      "يبحث الترتيب بالاختيار عن أصغر عمود، فيمرّ j على الأعمدة ويتذكّر min أصغرها حتى الآن. ثم يبدّله إلى المقدمة عند i. وجولة بعد جولة يكبر الجزء المرتّب، ويجمع العدّادان مقدار العمل."),
    headline("Selection sort", "الترتيب بالاختيار"),
    anim(arrayElement(body("arr", 500), sortVals, { frames: sel.frames, counters: sel.counters, view: "bars" }),
      keys("reveal", [[w("Selection", "يبحث"), 0], [w("smallest", "أصغر"), 1]], "linear"),
      keys("frame", [[w("finds", "يبحث"), 0], [w("work", "العمل"), sel.frames.length - 1]], "linear"))),
  canvas("search",
    N("Binary search for 37. The middle holds 22, too small, so lo jumps past it. The new middle holds 37. Found it, in just two looks.",
      "بحث ثنائي عن 37. في المنتصف 22، وهو أصغر، فيقفز lo بعده. والمنتصف الجديد فيه 37. وجدناه بنظرتين فقط."),
    headline("Binary search", "البحث الثنائي"),
    anim(arrayElement(body("arr", 400), findVals, { frames: bin.frames, counters: bin.counters, index: true }),
      keys("reveal", [[w("Binary", "بحث"), 0], [w("Binary", "بحث", 0.8), 1]], "linear"),
      keys("frame", [[w("search", "بحث"), 0], [w("middle", "المنتصف"), 1], [w("jumps", "فيقفز"), 2], [w("new", "الجديد"), 3], [w("Found", "وجدناه"), 4]]))),
  canvas("recursion",
    N("Recursion: fib of four calls fib of three and fib of two, and each of those calls again, down to one and zero. The answers climb back up, adding as they go. The yellow calls repeat work already done.",
      "الاستدعاء الذاتي: يستدعي fib(4) كلًّا من fib(3) و fib(2)، وكل منهما يستدعي من جديد، حتى نصل إلى واحد وصفر. ثم تصعد الإجابات وهي تُجمع. والاستدعاءات الصفراء تكرّر عملًا سبق إنجازه."),
    headline("Recursion: a function that calls itself", "الاستدعاء الذاتي: دالة تستدعي نفسها"),
    anim(tree,
      keys("frame", [[w("calls", "يستدعي"), 0], [w("adding", "تجمع", 1.2), tree.steps!.length - 1]], "linear"),
      keys("focus", [[w("yellow", "الصفراء"), again + 1]], "step"))),
  canvas("bug",
    N("This loop should add up the marks, but it prints nine. The bug: total is set to zero inside the loop, so it starts again every time. The fix moves that line above the loop. Now it prints twenty-one.",
      "يُفترض أن تجمع هذه الحلقة الدرجات، لكنها تطبع تسعة. الخطأ: يُضبط total على صفر داخل الحلقة، فيبدأ من جديد في كل مرة. والإصلاح ينقل هذا السطر فوق الحلقة. الآن يطبع واحدًا وعشرين."),
    headline("Find the bug", "اعثر على الخطأ"),
    anim(codediffElement(body("diff", 470), BUG, FIX, { langs, output: { before: bugOut, after: fixOut } }),
      keys("reveal", [[w("This", "يفترض"), 0], [w("This", "يفترض", 1), 1]], "linear"),
      keys("focus", [[w("inside", "داخل"), 2], [w("moves", "ينقل"), 0]], "step"),
      keys("frame", [[w("moves", "ينقل"), 0], [w("moves", "ينقل", 1), 1]]))),
  {
    id: "summary", template: "summary",
    narration: N("Trace it, draw it, watch it run: that is how code starts to make sense.", "تتبّعه، وارسمه، وشاهده يعمل: هكذا يصبح الكود مفهومًا."),
    content: {
      title: T("Remember", "تذكّر"),
      points: [T("Trace a program line by line", "تتبّع البرنامج سطرًا بسطر"), T("Draw its logic as a flowchart", "ارسم منطقه في مخطط انسيابي"), T("Watch sorts, searches and recursion step by step", "شاهد الترتيب والبحث والاستدعاء الذاتي خطوة بخطوة")],
      takeaway: T("Seeing code run is how you learn to read it.", "أن ترى الكود يعمل هو طريقك إلى فهمه."),
    },
  },
];

const manifest = {
  spec: "lesson-package", version: "0.2", id: ID, rev: 1,
  title: T("Watch your code think", "شاهد الكود وهو يفكّر"),
  summary: T("A program traced line by line in real MicroPython, its flowchart, a function's variables, selection sort, binary search, a recursive call tree and a bug fixed, animated in step with the narration.",
    "برنامج يُتتبّع سطرًا بسطر في MicroPython حقيقي، ومخططه الانسيابي، ومتغيرات دالة، والترتيب بالاختيار، والبحث الثنائي، وشجرة استدعاءات ذاتية، وخطأ يُصلح، متحركة مع السرد."),
  topic: "programming", level: 1, defaultLang: "en", brand: "darsi-light", stage: "landscape",
  languages: [
    { code: "en", dir: "ltr", name: "English", duration: 1, timing: "timing/en.json", captions: "captions/en.vtt", quality: "draft" },
    { code: "ar", dir: "rtl", name: "العربية", duration: 1, timing: "timing/ar.json", captions: "captions/ar.vtt", quality: "machine" },
  ],
  provenance: { createdAt: "2026-10-29", createdBy: "Lesson Studio", tool: "scripts/examples/pack-code.ts (the programming pack); timings estimated" },
  ai: { script: "ai-assisted", translation: "ai", narration: "none", visuals: "ai-assisted", avatar: "none" },
};
const old = (() => { try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; } })();
if (old) manifest.languages.forEach((l, i) => { l.duration = old.languages[i]?.duration ?? 1; });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "scenes.json"), JSON.stringify({ version: "0.2", scenes }) + "\n");
console.log(`wrote ${dir}`);
