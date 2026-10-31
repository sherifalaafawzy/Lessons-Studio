// Writes the example lesson "Data, step by step" (examples/pack-data), which shows every element of the data pack: an
// ERD of a school library, three queries run for real in sql.js (a filter and sort, a join with GROUP BY and HAVING, a
// DISTINCT), a stream pipeline that sets a bad reading aside and a batch pipeline that retries one, and two
// spreadsheets (a formula filled down, and a sheet cleaned), in English and Arabic.
// Then run `node scripts/make-timing.mjs pack-data` for its estimated timings.
//   node scripts/examples/pack-data.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Element, Scene, Text, Track, When } from "../../packages/spec/src/index.ts";
import { tx } from "../../packages/ops/src/index.ts";
import {
  dataWords, erdSchema, etlPipeline, marksSheet, pipeline, pipelineEnd, pricesSheet, queryElement, queryFrame, queryStages, setupSql,
} from "../../packages/ops/src/packs/data.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ID = "pack-data";
const dir = join(ROOT, "examples", ID);
const langs = ["en", "ar"];
const T = (en: string, ar: string): Text => tx(en, ar, langs);
const word = (en: string, ar: string = en, offset = 0): When => ({ word: T(en, ar), ...(offset ? { offset } : {}) });
const box = (id: string) => ({ id, x: 50, y: 140, w: 1180, h: 550 });
const headline = (en: string, ar: string): Element => ({ id: "h", type: "text", x: 50, y: 44, w: 1180, size: 46, weight: 800, text: T(en, ar) });
const scene = (id: string, en: string, ar: string, head: [string, string], els: Element[]): Scene => ({
  id, template: "canvas", narration: { en, ar }, content: { elements: [headline(...head), ...els] },
});
const appear = (at: When = 0, dur = 1.2): Track => ({ prop: "reveal", keys: [{ at, value: 0 }, { at: typeof at === "number" ? at + dur : { ...at, offset: (at.offset ?? 0) + dur }, value: 1, ease: "out" }] });
/** Frame k arrives on its moment, gliding from the one before. */
const frames = (from: When, at: [When, number][]): Track => ({ prop: "frame", keys: [{ at: from, value: 0 }, ...at.map(([w, v]) => ({ at: w, value: v, ease: "in-out" as const }))] });
const steps = (prop: "focus", at: [When, number][]): Track => ({ prop, keys: at.map(([w, v]) => ({ at: w, value: v, ease: "step" as const })) });

// The library's ERD: tables in as they're named, then each relationship.
const library = erdSchema("library", box("erd"), langs);
library.anim = [
  { prop: "reveal", keys: [{ at: 0, value: 0 }, { at: word("members", "الأعضاء"), value: 0 }, { at: word("members", "الأعضاء", 0.5), value: 1 / 3 },
    { at: word("loans", "والإعارات", 0), value: 1 / 3, ease: "linear" }, { at: word("loans", "والإعارات", 0.5), value: 2 / 3 },
    { at: word("books.", "والكتب."), value: 2 / 3, ease: "linear" }, { at: word("books.", "والكتب.", 0.5), value: 1 }] },
  steps("focus", [[0, 0], [word("has", "فللعضو"), 4], [word("names", "تذكر"), 5]]),
];

// Three queries, run for real.
const top = await queryStages("SELECT name, mark\nFROM results\nWHERE mark >= 50\nORDER BY mark DESC\nLIMIT 3", setupSql(["results"]));
const q1 = queryElement(box("q"), top, { words: dataWords(langs) });
q1.anim = [appear(0), frames(word("table", "الجدول", 0.4), [
  [word("WHERE", "WHERE", 0.2), queryFrame(top, "where")], [word("SELECT", "SELECT", 0.2), queryFrame(top, "select")], [word("SELECT", "SELECT", 1.4), queryFrame(top, "select") + 1],
  [word("ORDER", "ORDER", 0.2), queryFrame(top, "order")], [word("LIMIT", "LIMIT", 0.2), queryFrame(top, "limit")], [word("three.", "ثلاث.", 0.5), queryFrame(top, "result")],
])];

const avg = await queryStages("SELECT class, AVG(mark)\nFROM students\nJOIN marks ON student_id = id\nGROUP BY class\nHAVING AVG(mark) >= 60", setupSql(["students", "marks"]));
const q2 = queryElement(box("q"), avg, { words: dataWords(langs) });
q2.anim = [appear(0), frames(word("JOIN"), [
  [word("JOIN", "JOIN", 0.3), queryFrame(avg, "join")], [word("JOIN", "JOIN", 2), queryFrame(avg, "join") + 1], [word("GROUP", "GROUP", 0.2), queryFrame(avg, "group")],
  [word("HAVING", "HAVING", 0.2), queryFrame(avg, "having")], [word("SELECT", "SELECT", 0.1), queryFrame(avg, "select")], [word("SELECT", "SELECT", 1.3), queryFrame(avg, "select") + 1],
  [word("SELECT", "SELECT", 2.6), queryFrame(avg, "result")],
])];

const dist = await queryStages("SELECT DISTINCT class\nFROM results\nWHERE mark < 60", setupSql(["results"]));
const q3 = queryElement(box("q"), dist, { words: dataWords(langs) });
q3.anim = [appear(0), frames(word("WHERE", "WHERE"), [
  [word("WHERE", "WHERE", 0.3), queryFrame(dist, "where")], [word("SELECT", "SELECT", 0.2), queryFrame(dist, "select")], [word("SELECT", "SELECT", 1.3), queryFrame(dist, "select") + 1],
  [word("DISTINCT", "DISTINCT", 0.2), queryFrame(dist, "distinct")], [word("DISTINCT", "DISTINCT", 1.6), queryFrame(dist, "result")],
])];

// Two pipelines: a stream that sets a bad reading aside, a batch that sends one back.
const stream = etlPipeline(box("p"), langs, { mode: "stream", fix: "aside", records: 8 });
stream.anim = [appear(0, 1), { prop: "frame", keys: [{ at: word("one", "واحدة"), value: 0 }, { at: word("through.", "عبرت.", 0.6), value: pipelineEnd(stream), ease: "linear" }] },
  steps("focus", [[0, 0], [word("check", "الفحص"), 2], [word("counters", "العدادات"), 0]])];
const batch = pipeline(box("p"), {
  stages: [
    { id: "register", label: T("Register", "السجل"), icon: "page", kind: "source" },
    { id: "check", label: T("Check", "فحص"), icon: "shield", kind: "check" },
    { id: "save", label: T("Save", "حفظ"), icon: "data", kind: "store" },
  ],
  records: 10, mode: "batch", bad: [6], fix: "retry",
});
batch.anim = [appear(0, 1), { prop: "frame", keys: [{ at: word("once.", "واحدة."), value: 0 }, { at: word("others.", "بالباقي.", 0.6), value: pipelineEnd(batch), ease: "linear" }] }];

// Two sheets: a formula filled down, and a sheet cleaned.
const marks = marksSheet(box("s"), langs);
marks.el.anim = [appear(0, 1), { prop: "frame", keys: [{ at: word("fill", "اسحبها"), value: 0 }, { at: word("average.", "المتوسطات.", 0.6), value: marks.last, ease: "linear" }] }];
const prices = pricesSheet(box("s"), langs);
prices.el.anim = [appear(0, 1),
  steps("focus", [[0, 0], [word("typo", "إملائي"), 1], [word("blank", "فارغ"), 2], [word("twice.", "مرتين."), 3], [word("fix", "نصحح"), 0]]),
  { prop: "frame", keys: [{ at: word("fix", "نصحح"), value: 0 }, { at: word("fix", "نصحح", 0.6), value: prices.fixes[0]! }, { at: word("remove", "ونحذف"), value: prices.fixes[0]! }, { at: word("remove", "ونحذف", 0.6), value: prices.fixes[1]! }] },
];

const scenes: Scene[] = [
  {
    id: "title", template: "title-hook",
    narration: { en: "Data engineering, step by step. Let's watch data move.", ar: "هندسة البيانات خطوة بخطوة. لنشاهد البيانات وهي تتحرك." },
    content: { title: T("Data, step by step", "البيانات خطوة بخطوة"), hook: T("Tables, queries, pipelines and sheets, drawn as they work.", "جداول واستعلامات وخطوط بيانات وجداول بيانات، مرسومة وهي تعمل."), icon: "data" },
  },
  scene("library",
    "A school library needs three tables: members, loans and books. A member can borrow many books, so each member has many loans, and each loan names one book.",
    "تحتاج مكتبة المدرسة إلى ثلاثة جداول: الأعضاء والإعارات والكتب. يستطيع العضو أن يستعير كتبًا كثيرة، فللعضو الواحد إعارات كثيرة، وكل إعارة تذكر كتابًا واحدًا.",
    ["A library database", "قاعدة بيانات المكتبة"], [library]),
  scene("top",
    "The database reads the table first. WHERE keeps the marks of fifty or more. SELECT picks the name and the mark. ORDER BY puts the highest first, and LIMIT keeps the top three.",
    "تقرأ قاعدة البيانات الجدول أولًا. يُبقي WHERE الدرجات من خمسين فأكثر. ويختار SELECT الاسم والدرجة. ثم يضع ORDER BY الأعلى أولًا، ويُبقي LIMIT أعلى ثلاث.",
    ["The top three", "أعلى ثلاث درجات"], [q1]),
  scene("having",
    "Which classes average sixty or more? JOIN puts each mark beside its student. GROUP BY gathers the rows by class. HAVING keeps the groups that average sixty or more. Then SELECT gives each class its average.",
    "أي الفصول متوسطها ستون أو أكثر؟ يضع JOIN كل درجة بجانب طالبها. ثم يجمع GROUP BY الصفوف حسب الفصل. ويُبقي HAVING المجموعات التي متوسطها ستون أو أكثر. ثم يعطي SELECT كل فصل متوسطه.",
    ["Classes that average 60 or more", "الفصول التي متوسطها 60 فأكثر"], [q2]),
  scene("distinct",
    "Which classes have a mark under sixty? WHERE keeps those marks. SELECT takes only the class, and DISTINCT removes the repeats.",
    "أي الفصول فيها درجة أقل من ستين؟ يُبقي WHERE تلك الدرجات. ويأخذ SELECT الفصل فقط، ثم يحذف DISTINCT التكرار.",
    ["Each class once", "كل فصل مرة واحدة"], [q3]),
  scene("stream",
    "Rain gauges send readings all day, one at a time: that's a stream. The check catches a reading below zero and sets it aside, and the counters show how many got through.",
    "ترسل مقاييس المطر قراءاتها طوال اليوم، واحدة تلو الأخرى: هذا تدفق مستمر. يكتشف الفحص قراءة أقل من الصفر ويضعها جانبًا، وتُظهر العدادات كم قراءة عبرت.",
    ["A stream of readings", "تدفق من القراءات"], [stream]),
  scene("batch",
    "Attendance moves in batches: every evening, the whole day's register goes at once. One record has a missing name, so it goes back to be fixed, then joins the others.",
    "ينتقل الحضور على دفعات: كل مساء، يذهب سجل اليوم كله مرة واحدة. في أحد السجلات اسم ناقص، فيعود ليُصحَّح، ثم يلحق بالباقي.",
    ["A batch, once a day", "دفعة واحدة كل يوم"], [batch]),
  scene("fill",
    "Type the formula once, in the first row. Then fill it down, and the sheet works out every average.",
    "اكتب المعادلة مرة واحدة في الصف الأول. ثم اسحبها إلى الأسفل، فيحسب الجدول كل المتوسطات.",
    ["Every average in one move", "كل المتوسطات بحركة واحدة"], [marks.el]),
  scene("clean",
    "Before we count anything, we clean the data. Here is a typo, a blank price, and a row typed twice. We fix the typo and remove the repeated row.",
    "قبل أن نحسب أي شيء، ننظف البيانات. هنا خطأ إملائي، وسعر فارغ، وصف مكتوب مرتين. نصحح الخطأ ونحذف الصف المكرر.",
    ["Clean before you count", "نظّف قبل أن تحسب"], [prices.el]),
  {
    id: "summary", template: "summary",
    narration: { en: "Tables and links, a query step by step, a pipeline and a clean sheet: that's data engineering.", ar: "جداول وروابط، واستعلام خطوة بخطوة، وخط بيانات، وجدول نظيف: هذه هي هندسة البيانات." },
    content: {
      title: T("Remember", "تذكّر"),
      points: [
        T("An ERD shows the tables and their links", "مخطط الكيانات يبيّن الجداول وروابطها"),
        T("A query runs FROM first and SELECT later", "يبدأ الاستعلام من FROM ويأتي SELECT لاحقًا"),
        T("A pipeline checks every record", "خط البيانات يفحص كل سجل"),
        T("Clean the data before you count", "نظّف البيانات قبل أن تحسب"),
      ],
      takeaway: T("Data work is steps you can watch.", "العمل مع البيانات خطوات يمكنك مشاهدتها."),
    },
  },
];

const manifest = {
  spec: "lesson-package", version: "0.2", id: ID, rev: 1,
  title: T("Data, step by step", "البيانات خطوة بخطوة"),
  summary: T("An ERD, three SQL queries run step by step, a stream and a batch pipeline, and two spreadsheets, animated in step with the narration.",
    "مخطط كيانات، وثلاثة استعلامات SQL خطوة بخطوة، وخطا بيانات متدفق ودفعي، وجدولا بيانات، متحركة مع السرد."),
  topic: "data", level: 1, defaultLang: "en", brand: "darsi-light", stage: "landscape",
  languages: [
    { code: "en", dir: "ltr", name: "English", duration: 1, timing: "timing/en.json", captions: "captions/en.vtt", quality: "draft" },
    { code: "ar", dir: "rtl", name: "العربية", duration: 1, timing: "timing/ar.json", captions: "captions/ar.vtt", quality: "machine" },
  ],
  provenance: { createdAt: "2026-10-29", createdBy: "Lesson Studio", tool: "scripts/examples/pack-data.ts (data pack); timings estimated" },
  ai: { script: "ai-assisted", translation: "ai", narration: "none", visuals: "ai-assisted", avatar: "none" },
};
const old = (() => { try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; } })();
if (old) manifest.languages.forEach((l, i) => { l.duration = old.languages[i]?.duration ?? 1; });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "scenes.json"), JSON.stringify({ version: "0.2", scenes }) + "\n");
console.log(`wrote ${dir}`);
