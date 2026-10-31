// Ready-made scenes for the "Add a scene" gallery, and the first scenes of a new lesson.
// Each is designed, animated and narrated in English and Arabic; other languages start from the English.
// Every animation is anchored to a word in that scene's narration, so it stays in sync in each language.
// tests/presets.test.ts checks that each one validates with no warnings in every stage shape.
import type { AnimProp, Ease, Element, Lang, Orient, Scene, TemplateId, Text, Track, When } from "@lessonstudio/spec";
import { presetKeys, shift, type ArchPreset, type Preset } from "@lessonstudio/ops";
import { archElement, area, descentElement, equationElement, functionPlot, networkElement, trainingPair, type Room } from "./science.ts";

export interface Ctx { id: string; langs: Lang[]; stage: Orient }

export interface ScenePreset {
  id: string;
  name: { en: string; ar: string };
  template: TemplateId;
  /** "science": equations, plots, networks and model diagrams, shown in their own part of the gallery. */
  group?: "science";
  make: (c: Ctx) => Scene;
}

const SIZES: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };

/** Text in the lesson's languages: Arabic gets the Arabic wording; every other language starts from the English. */
const tx = (c: Ctx, en: string, ar: string): Text => Object.fromEntries(c.langs.map((l) => [l, l === "ar" ? ar : en]));
const say = (c: Ctx, en: string, ar: string): Record<Lang, string> => tx(c, en, ar) as Record<Lang, string>;
/** The moment a word is spoken, in each language. */
const on = (c: Ctx, en: string, ar: string, offset = 0): When => ({ word: tx(c, en, ar), ...(offset ? { offset } : {}) });
/** An element with a ready-made animation. */
function anim<E extends Element>(el: E, preset: Preset, at: When, dur?: number): E {
  return { ...el, anim: presetKeys(el, preset, at, dur) };
}

/* ---------- templates ---------- */

const title: ScenePreset = {
  id: "title", name: { en: "Title with icon", ar: "عنوان مع أيقونة" }, template: "title-hook",
  make: (c) => ({
    id: c.id, template: "title-hook",
    narration: say(c, "Every day, messages ask us to click. Some of them are traps. In two minutes, you will learn to spot them.",
      "كل يوم تطلب منا رسائل أن نضغط. بعضها فخاخ. في دقيقتين ستتعلم كيف تكتشفها."),
    content: {
      kicker: tx(c, "Cyber safety", "الأمان الرقمي"),
      title: tx(c, "Spot the trap before you click", "اكتشف الفخ قبل أن تضغط"),
      hook: tx(c, "Two minutes that protect your accounts", "دقيقتان تحميان حساباتك"),
      icon: "shield",
    },
    cues: [
      { word: tx(c, "traps", "فخاخ"), action: "pulse", target: "title" },
      { word: tx(c, "learn", "ستتعلم"), action: "highlight", target: "hook" },
    ],
  }),
};

const steps: ScenePreset = {
  id: "steps", name: { en: "Three steps", ar: "ثلاث خطوات" }, template: "steps",
  make: (c) => ({
    id: c.id, template: "steps",
    narration: say(c, "First, pause and ask who sent it. Then look closely at the link. Finally, check through the official app, not the message.",
      "أولًا، توقف واسأل من أرسلها. ثم انظر جيدًا إلى الرابط. أخيرًا، تحقق عبر التطبيق الرسمي، لا عبر الرسالة."),
    content: {
      title: tx(c, "Before you click", "قبل أن تضغط"),
      steps: [
        tx(c, "Pause: who sent it?", "توقف: من أرسلها؟"),
        tx(c, "Look: where does the link go?", "انظر: إلى أين يأخذك الرابط؟"),
        tx(c, "Check in the official app", "تحقق من التطبيق الرسمي"),
      ],
    },
    cues: [
      { word: tx(c, "First", "أولًا"), action: "reveal", target: "1" },
      { word: tx(c, "Then", "ثم"), action: "reveal", target: "2" },
      { word: tx(c, "Finally", "أخيرًا"), action: "reveal", target: "3" },
      { word: tx(c, "link", "الرابط"), action: "highlight", target: "2" },
    ],
  }),
};

const pipeline: ScenePreset = {
  id: "pipeline", name: { en: "A pipeline", ar: "مسار خطوة بخطوة" }, template: "flow",
  make: (c) => ({
    id: c.id, template: "flow",
    narration: say(c, "You type a question. The model reads it and predicts an answer, word by word. Then the answer comes back to you.",
      "تكتب سؤالًا. يقرأه النموذج ويتنبأ بالإجابة كلمة بكلمة. ثم تعود الإجابة إليك."),
    content: {
      title: tx(c, "From question to answer", "من السؤال إلى الإجابة"),
      nodes: [
        { id: "you", label: tx(c, "You", "أنت"), icon: "user", tone: "trusted" },
        { id: "model", label: tx(c, "AI model", "النموذج"), icon: "bot", tone: "system" },
        { id: "answer", label: tx(c, "Answer", "الإجابة"), icon: "spark" },
      ],
      edges: [{ from: "you", to: "model", label: tx(c, "question", "سؤال") }, { from: "model", to: "answer" }],
    },
    cues: [
      { word: tx(c, "question", "سؤالًا"), action: "move", target: "you>model" },
      { word: tx(c, "model", "النموذج"), action: "highlight", target: "model" },
      { word: tx(c, "predicts", "يتنبأ"), action: "move", target: "model>answer" },
      { word: tx(c, "back", "تعود"), action: "pulse", target: "answer" },
    ],
  }),
};

const chain: ScenePreset = {
  id: "chain", name: { en: "An attack chain", ar: "سلسلة هجوم" }, template: "flow",
  make: (c) => ({
    id: c.id, template: "flow",
    narration: say(c, "A scammer sends a fake message. Its link opens a fake page. If you type your password there, the scammer gets it.",
      "يرسل المحتال رسالة مزيفة. يفتح رابطها صفحة مزيفة. وإذا كتبت كلمة مرورك هناك، يحصل عليها المحتال."),
    content: {
      title: tx(c, "How a scam steals a password", "كيف تسرق الخدعة كلمة المرور"),
      nodes: [
        { id: "scammer", label: tx(c, "Scammer", "المحتال"), icon: "user", tone: "danger" },
        { id: "message", label: tx(c, "Fake message", "رسالة مزيفة"), icon: "mail" },
        { id: "page", label: tx(c, "Fake page", "صفحة مزيفة"), icon: "link", tone: "danger" },
        { id: "password", label: tx(c, "Your password", "كلمة مرورك"), icon: "key", tone: "trusted" },
      ],
      edges: [{ from: "scammer", to: "message" }, { from: "message", to: "page" }, { from: "page", to: "password" }],
    },
    cues: [
      { word: tx(c, "sends", "يرسل"), action: "move", target: "scammer>message" },
      { word: tx(c, "opens", "يفتح"), action: "move", target: "message>page" },
      { word: tx(c, "password", "مرورك"), action: "highlight", target: "password" },
      { word: tx(c, "gets", "يحصل"), action: "pulse", target: "scammer" },
    ],
  }),
};

const sms: ScenePreset = {
  id: "sms", name: { en: "A scam text message", ar: "رسالة نصية احتيالية" }, template: "message-mock",
  make: (c) => ({
    id: c.id, template: "message-mock",
    narration: say(c, "Read this message slowly. The sender is unknown. It rushes you to pay a fee. And the link is not the real post office.",
      "اقرأ هذه الرسالة ببطء. المرسل مجهول. وهي تستعجلك لتدفع رسومًا. والرابط ليس موقع البريد الحقيقي."),
    content: {
      kind: "sms", from: tx(c, "Delivery info", "معلومات التوصيل"), time: "09:41",
      lines: [
        tx(c, "Your parcel could not be delivered.", "تعذّر توصيل طردك."),
        tx(c, "Pay a 1.99 fee within 2 hours or it goes back:", "ادفع رسومًا قدرها 1.99 خلال ساعتين وإلا سيُعاد:"),
      ],
      link: "parcel-help.example/pay",
      flags: [
        { id: "sender", line: "from", label: tx(c, "Unknown sender", "مرسل مجهول") },
        { id: "rush", line: 1, label: tx(c, "Rushes you to pay", "يستعجلك لتدفع") },
        { id: "badlink", line: "link", label: tx(c, "Not the real site", "ليس الموقع الحقيقي") },
      ],
    },
    cues: [
      { word: tx(c, "sender", "المرسل"), action: "highlight", target: "sender" },
      { word: tx(c, "rushes", "تستعجلك"), action: "highlight", target: "rush" },
      { word: tx(c, "link", "والرابط"), action: "highlight", target: "badlink" },
    ],
  }),
};

const email: ScenePreset = {
  id: "email", name: { en: "A phishing email", ar: "بريد تصيّد" }, template: "message-mock",
  make: (c) => ({
    id: c.id, template: "message-mock",
    narration: say(c, "Emails can be traps too. Look at the address: it is not your school's. The threat to close your mailbox is there to scare you into signing in.",
      "قد يكون البريد فخًا أيضًا. انظر إلى العنوان: ليس عنوان مدرستك. والتهديد بإغلاق بريدك هدفه أن يخيفك لتسجّل الدخول."),
    content: {
      kind: "email", from: tx(c, "IT desk <it-desk@school-mail.example>", "الدعم الفني <it-desk@school-mail.example>"), time: "07:55",
      subject: tx(c, "Your mailbox is full", "صندوق بريدك ممتلئ"),
      lines: [
        tx(c, "Dear user,", "عزيزي المستخدم،"),
        tx(c, "Your mailbox will be closed today.", "سيُغلق صندوق بريدك اليوم."),
        tx(c, "Sign in now to keep your emails:", "سجّل الدخول الآن لتحتفظ برسائلك:"),
      ],
      link: "school-mail.example/login",
      flags: [
        { id: "address", line: "from", label: tx(c, "Not your school's address", "ليس عنوان مدرستك") },
        { id: "threat", line: 1, label: tx(c, "A threat to scare you", "تهديد لإخافتك") },
        { id: "signin", line: "link", label: tx(c, "Asks you to sign in", "يطلب تسجيل الدخول") },
      ],
    },
    cues: [
      { word: tx(c, "address", "العنوان"), action: "highlight", target: "address" },
      { word: tx(c, "threat", "والتهديد"), action: "highlight", target: "threat" },
      { word: tx(c, "signing", "لتسجل"), action: "highlight", target: "signin" },
    ],
  }),
};

const quiz: ScenePreset = {
  id: "quiz", name: { en: "A quick question", ar: "سؤال سريع" }, template: "quiz",
  make: (c) => ({
    id: c.id, template: "quiz",
    narration: say(c, "Your turn. Which link is safer to open? Choose, then check your answer.",
      "دورك الآن. أي رابط أكثر أمانًا؟ اختر، ثم تحقق من إجابتك."),
    content: { title: tx(c, "Your turn", "دورك") },
    check: {
      type: "single-choice", id: `${c.id}-q`,
      prompt: tx(c, "Which link is safer to open?", "أي رابط أكثر أمانًا؟"),
      options: [
        { id: "typed", text: tx(c, "An address you typed yourself", "عنوان كتبته بنفسك") },
        { id: "rushed", text: tx(c, "A link in a message that rushes you", "رابط في رسالة تستعجلك") },
      ],
      answer: "typed",
      explain: tx(c, "You know where an address you typed goes. A rushed link may not go where it says.", "أنت تعرف إلى أين يأخذك عنوان كتبته بنفسك. أما الرابط المستعجل فقد لا يأخذك إلى حيث يقول."),
    },
    cues: [{ word: tx(c, "safer", "أمانًا"), action: "highlight", target: "prompt" }],
  }),
};

const summary: ScenePreset = {
  id: "summary", name: { en: "Summary", ar: "خلاصة" }, template: "summary",
  make: (c) => ({
    id: c.id, template: "summary",
    narration: say(c, "Remember three things. Pause before you click. Read the whole address. Check in the official app. When in doubt, don't click.",
      "تذكّر ثلاثة أمور. توقف قبل أن تضغط. اقرأ العنوان كاملًا. تحقق من التطبيق الرسمي. وإذا شككت، فلا تضغط."),
    content: {
      title: tx(c, "Remember", "تذكّر"),
      points: [tx(c, "Pause before you click", "توقف قبل أن تضغط"), tx(c, "Read the whole address", "اقرأ العنوان كاملًا"), tx(c, "Check in the official app", "تحقق من التطبيق الرسمي")],
      takeaway: tx(c, "When in doubt, don't click.", "إذا شككت، فلا تضغط."),
    },
    cues: [
      { word: tx(c, "Pause", "توقف"), action: "reveal", target: "1" },
      { word: tx(c, "Read", "اقرأ"), action: "reveal", target: "2" },
      { word: tx(c, "Check", "تحقق"), action: "reveal", target: "3" },
      { word: tx(c, "doubt", "شككت"), action: "reveal", target: "takeaway" },
    ],
  }),
};

/* ---------- canvas ---------- */

const bigNumber: ScenePreset = {
  id: "big-number", name: { en: "A big number", ar: "رقم كبير" }, template: "canvas",
  make: (c) => {
    const [w, h] = SIZES[c.stage];
    const top = Math.round(h * 0.18);
    return {
      id: c.id, template: "canvas", transition: { type: "zoom" },
      narration: say(c, "It takes one click. One click on a fake link can hand your password to a stranger. So that click deserves a second look.",
        "تكفي ضغطة واحدة. ضغطة واحدة على رابط مزيف قد تسلّم كلمة مرورك لغريب. لذلك تستحق تلك الضغطة نظرة ثانية."),
      content: {
        elements: [
          anim({ id: "num", type: "text", x: 60, y: top, w: w - 120, size: Math.min(260, Math.round(Math.min(w, h) * 0.34)), weight: 800, align: "center", tone: "accent", text: tx(c, "1", "1") }, "pop", on(c, "one", "واحدة")),
          anim({ id: "rule", type: "line", x: Math.round(w / 2 - 140), y: top + Math.round(Math.min(w, h) * 0.46), x2: Math.round(w / 2 + 140), y2: top + Math.round(Math.min(w, h) * 0.46), tone: "accent", strokeWidth: 8 }, "draw", on(c, "click", "ضغطة")),
          anim({ id: "label", type: "text", x: 60, y: top + Math.round(Math.min(w, h) * 0.5), w: w - 120, size: 52, weight: 700, align: "center", text: tx(c, "click is all it takes", "ضغطة واحدة تكفي") }, "rise", on(c, "fake", "مزيف")),
          anim({ id: "note", type: "text", x: 60, y: top + Math.round(Math.min(w, h) * 0.5) + 90, w: w - 120, size: 34, align: "center", tone: "muted", text: tx(c, "Give every link a second look", "امنح كل رابط نظرة ثانية") }, "fade-in", on(c, "second", "ثانية")),
        ],
      },
      cues: [{ word: tx(c, "password", "مرورك"), action: "pulse", target: "num" }],
    };
  },
};

const compare: ScenePreset = {
  id: "compare", name: { en: "Two sides compared", ar: "مقارنة بين جانبين" }, template: "canvas",
  make: (c) => {
    const [w, h] = SIZES[c.stage];
    const tall = h > w;
    const m = 60, gap = 40, head = 150;
    const bw = tall ? w - 2 * m : (w - 2 * m - gap) / 2;
    const bh = tall ? (h - head - m - gap) / 2 : h - head - m;
    const box = (side: 0 | 1) => ({ x: Math.round(tall ? m : m + side * (bw + gap)), y: Math.round(tall ? head + side * (bh + gap) : head) });
    const panel = (side: 0 | 1, id: string, tone: "danger" | "ok", icon: "cross" | "check", name: Text, ex: Text, at: When, exAt: When, exPreset: Preset): Element[] => {
      const b = box(side);
      return [
        anim({ id, type: "shape", shape: "rect", x: b.x, y: b.y, w: Math.round(bw), h: Math.round(bh), fill: "surface", stroke: tone, strokeWidth: 4, radius: 22 }, "rise", at),
        anim({ id: `${id}-icon`, type: "icon", icon, x: b.x + 36, y: b.y + 36, w: 72, h: 72, tone }, "pop", at, 0.5),
        anim({ id: `${id}-name`, type: "text", x: b.x + 130, y: b.y + 44, w: Math.round(bw) - 160, size: 44, weight: 800, tone, text: name }, "fade-in", at),
        anim({ id: `${id}-ex`, type: "text", x: b.x + 36, y: b.y + Math.round(bh / 2), w: Math.round(bw) - 72, size: 40, weight: 600, text: ex }, exPreset, exAt),
      ];
    };
    return {
      id: c.id, template: "canvas", transition: { type: "slide" },
      narration: say(c, "A weak password is short and easy to guess. A strong password is long, like a sentence only you know.",
        "كلمة المرور الضعيفة قصيرة وسهلة التخمين. أما القوية فطويلة، مثل جملة لا يعرفها غيرك."),
      content: {
        elements: [
          { id: "title", type: "text", x: m, y: 50, w: w - 2 * m, size: 48, weight: 800, text: tx(c, "Weak or strong?", "ضعيفة أم قوية؟") },
          ...panel(0, "weak", "danger", "cross", tx(c, "Weak", "ضعيفة"), tx(c, "123456", "123456"), on(c, "weak", "الضعيفة"), on(c, "short", "قصيرة"), "pop"),
          ...panel(1, "strong", "ok", "check", tx(c, "Strong", "قوية"), tx(c, "my goat sings at seven", "عنزتي تغني في السابعة"), on(c, "strong", "القوية"), on(c, "sentence", "جملة"), "type"),
        ],
      },
      cues: [{ word: tx(c, "guess", "التخمين"), action: "pulse", target: "weak-ex" }],
    };
  },
};

const process: ScenePreset = {
  id: "process", name: { en: "A process with arrows", ar: "عملية بالأسهم" }, template: "canvas",
  make: (c) => {
    const [w, h] = SIZES[c.stage];
    const tall = h > w;
    const size = tall ? 220 : Math.min(260, Math.round((w - 120 - 2 * 110) / 3));
    const pos = (i: number) => tall
      ? { x: Math.round(w / 2 - size / 2), y: 200 + i * (size + 120) }
      : { x: Math.round((w - (3 * size + 2 * 110)) / 2 + i * (size + 110)), y: Math.round(h / 2 - size / 2 + 30) };
    const stage = (i: number, id: string, icon: "data" | "chip" | "bot", label: Text, at: When): Element[] => {
      const p = pos(i);
      return [
        anim({ id, type: "shape", shape: "rect", x: p.x, y: p.y, w: size, h: size, fill: "surface", stroke: "accent", strokeWidth: 4, radius: 28 }, "pop", at),
        anim({ id: `${id}-icon`, type: "icon", icon, x: p.x + size / 2 - 50, y: p.y + 40, w: 100, h: 100, tone: "accent" }, "pop", at, 0.55),
        anim({ id: `${id}-label`, type: "text", x: p.x + 10, y: p.y + size - 80, w: size - 20, size: 36, weight: 700, align: "center", text: label }, "fade-in", at),
      ];
    };
    const arrow = (i: number, id: string, at: When): Element => {
      const a = pos(i), b = pos(i + 1);
      return anim(tall
        ? { id, type: "line", x: a.x + size / 2, y: a.y + size + 16, x2: b.x + size / 2, y2: b.y - 16, arrow: "end", tone: "muted", strokeWidth: 6 }
        : { id, type: "line", x: a.x + size + 16, y: a.y + size / 2, x2: b.x - 16, y2: b.y + size / 2, arrow: "end", tone: "muted", strokeWidth: 6 }, "draw", at, 0.7);
    };
    return {
      id: c.id, template: "canvas",
      narration: say(c, "It starts with data: many examples. Training finds the patterns in them. The result is a model that can make good guesses.",
        "تبدأ القصة بالبيانات: أمثلة كثيرة. ثم يجد التدريب الأنماط فيها. والنتيجة نموذج يستطيع أن يخمّن جيدًا."),
      content: {
        elements: [
          { id: "title", type: "text", x: 60, y: 50, w: w - 120, size: 48, weight: 800, text: tx(c, "How a model is made", "كيف يُصنع النموذج") },
          ...stage(0, "data", "data", tx(c, "Data", "البيانات"), on(c, "data", "بالبيانات")),
          arrow(0, "arrow1", on(c, "Training", "التدريب", -0.5)),
          ...stage(1, "training", "chip", tx(c, "Training", "التدريب"), on(c, "Training", "التدريب")),
          arrow(1, "arrow2", on(c, "result", "والنتيجة", -0.3)),
          ...stage(2, "model", "bot", tx(c, "Model", "النموذج"), on(c, "model", "نموذج")),
        ],
      },
      cues: [{ word: tx(c, "patterns", "الأنماط"), action: "pulse", target: "training" }],
    };
  },
};

const chart: ScenePreset = {
  id: "chart", name: { en: "A chart that grows", ar: "رسم بياني يكبر" }, template: "canvas",
  make: (c) => {
    const [w, h] = SIZES[c.stage];
    return {
      id: c.id, template: "canvas",
      narration: say(c, "Look at the scores over four weeks. With every week of practice, they climb. Small steps add up.",
        "انظر إلى الدرجات خلال أربعة أسابيع. مع كل أسبوع من التمرين ترتفع. الخطوات الصغيرة تتراكم."),
      content: {
        elements: [
          { id: "title", type: "text", x: 60, y: 50, w: w - 120, size: 48, weight: 800, text: tx(c, "Practice pays off", "التمرين يؤتي ثماره") },
          anim({
            id: "scores", type: "chart", kind: "bar", x: 80, y: 160, w: w - 160, h: h - 330, max: 100, tone: "accent", data: [32, 48, 66, 85],
            labels: [tx(c, "Week 1", "أسبوع 1"), tx(c, "Week 2", "أسبوع 2"), tx(c, "Week 3", "أسبوع 3"), tx(c, "Week 4", "أسبوع 4")],
          }, "type", on(c, "climb", "ترتفع"), 1.6),
          anim({ id: "caption", type: "text", x: 60, y: h - 130, w: w - 120, size: 38, weight: 600, align: "center", tone: "muted", text: tx(c, "Small steps add up", "الخطوات الصغيرة تتراكم") }, "rise", on(c, "Small", "الصغيرة")),
        ],
      },
      cues: [{ word: tx(c, "scores", "الدرجات"), action: "highlight", target: "title" }],
    };
  },
};

const code: ScenePreset = {
  id: "code", name: { en: "Code that types itself", ar: "شيفرة تُكتب أمامك" }, template: "canvas",
  make: (c) => {
    const [w, h] = SIZES[c.stage];
    const cw = Math.min(w - 120, 900);
    return {
      id: c.id, template: "canvas",
      narration: say(c, "Here is a tiny program. It checks one thing: is the password at least twelve characters long? Short passwords fail the test.",
        "هذا برنامج صغير. يتحقق من أمر واحد: هل طول كلمة المرور اثنا عشر حرفًا على الأقل؟ الكلمات القصيرة لا تنجح."),
      content: {
        elements: [
          { id: "title", type: "text", x: 60, y: 50, w: w - 120, size: 48, weight: 800, text: tx(c, "A password check, in code", "فحص كلمة المرور بالشيفرة") },
          anim({ id: "code", type: "code", x: Math.round((w - cw) / 2), y: 170, w: cw, h: 220, size: 30, fixed: true, highlight: [2],
            code: "def strong_enough(password):\n    return len(password) >= 12\n\nstrong_enough(\"123456\")   # False" }, "type", on(c, "program", "برنامج"), 1.8),
          anim({ id: "rule", type: "text", x: 60, y: Math.min(h - 160, 450), w: w - 120, size: 40, weight: 700, align: "center", tone: "accent", text: tx(c, "12 characters or more", "12 حرفًا أو أكثر") }, "pop", on(c, "twelve", "عشر")),
          anim({ id: "fail", type: "text", x: 60, y: Math.min(h - 90, 530), w: w - 120, size: 34, align: "center", tone: "danger", text: tx(c, "Short passwords fail", "الكلمات القصيرة لا تنجح") }, "fade-in", on(c, "fail", "تنجح")),
        ],
      },
      cues: [{ word: tx(c, "checks", "يتحقق"), action: "pulse", target: "code" }],
    };
  },
};

const callout: ScenePreset = {
  id: "callout", name: { en: "A callout over a screen", ar: "تنبيه على شاشة" }, template: "canvas",
  make: (c) => {
    const [w, h] = SIZES[c.stage];
    const pw = Math.min(380, Math.round(w * 0.5)), ph = Math.min(Math.round(h * 0.8), 640);
    const px = h > w ? Math.round((w - pw) / 2) : Math.round(w * 0.12), py = Math.round((h - ph) / 2) + (h > w ? 120 : 20);
    const linkY = py + 250;
    const lx = h > w ? 60 : px + pw + 80, ly = h > w ? 70 : linkY - 30;
    return {
      id: c.id, template: "canvas", transition: { type: "fade" },
      narration: say(c, "Before you tap, look at the link. The real address hides at the end, after the last dot. Here it is not the post office.",
        "قبل أن تضغط، انظر إلى الرابط. العنوان الحقيقي يختبئ في آخره، بعد النقطة الأخيرة. وهنا ليس موقع البريد."),
      content: {
        elements: [
          { id: "phone", type: "shape", shape: "rect", x: px, y: py, w: pw, h: ph, fill: "surface", stroke: "muted", strokeWidth: 4, radius: 40 },
          { id: "screen-title", type: "text", x: px + 30, y: py + 40, w: pw - 60, size: 26, weight: 700, tone: "muted", text: tx(c, "Messages", "الرسائل") },
          { id: "bubble", type: "shape", shape: "rect", x: px + 24, y: py + 110, w: pw - 48, h: 210, fill: "bg", radius: 20 },
          { id: "bubble-text", type: "text", x: px + 44, y: py + 130, w: pw - 88, size: 26, text: tx(c, "Your parcel is waiting:", "طردك بانتظارك:") },
          { id: "link", type: "text", x: px + 44, y: linkY, w: pw - 88, size: 20, weight: 600, tone: "accent", fixed: true, text: tx(c, "post.office.parcel-help.example", "post.office.parcel-help.example") },
          anim({ id: "ring", type: "shape", shape: "rect", x: px + 26, y: linkY - 16, w: pw - 52, h: 92, stroke: "danger", strokeWidth: 5, radius: 18 }, "draw", on(c, "link", "الرابط"), 0.8),
          anim({ id: "label", type: "text", x: lx, y: ly, w: h > w ? w - 120 : w - lx - 60, size: 38, weight: 800, tone: "danger", text: tx(c, "Read the end of the address", "اقرأ نهاية العنوان") }, "slide-in", on(c, "end", "آخره")),
        ],
      },
      cues: [{ word: tx(c, "not", "ليس"), action: "pulse", target: "ring" }],
    };
  },
};

/* ---------- science and AI: equations, plots, networks and model diagrams ---------- */

type K = [When, number, Ease?];
const track = (prop: AnimProp, ...keys: K[]): Track => ({ prop, keys: keys.map(([at, value, ease]) => ({ at, value, ...(ease ? { ease } : {}) })) });
const tracks = <E extends Element>(el: E, ...t: Track[]): E => ({ ...el, anim: t });
const room = (c: Ctx): Room => { const [w, h] = SIZES[c.stage]; return { w, h, langs: c.langs }; };
const heading = (c: Ctx, en: string, ar: string): Element => {
  const [w] = SIZES[c.stage];
  return { id: "title", type: "text", x: 60, y: 50, w: w - 120, size: w < 800 ? 44 : 48, weight: 800, text: tx(c, en, ar) };
};
/** Comes in part by part (blocks along the arrows, an equation's parts, a curve drawn) between two spoken words. */
const revealOn = (from: When, to: When): Track => track("reveal", [from, 0], [to, 1, "linear"]);
/** Lights one part at each word: a block, a series, a layer, an equation's \g part (0 lights none). */
const lightOn = (...steps: [When, number][]): Track => track("focus", ...steps.map(([w, n]): K => [w, n, "step"]));
/** A packet runs through a diagram from its input on a word; hidden before and after. */
const runOn = (at: When, dur = 2): Track => track("pass", [0, -1], [at, 0, "step"], [shift(at, dur), 1, "linear"], [shift(at, dur + 0.05), -1, "step"]);

const equation: ScenePreset = {
  id: "equation", group: "science", name: { en: "An equation, part by part", ar: "معادلة جزءًا بعد جزء" }, template: "canvas",
  make: (c) => {
    const r = room(c);
    const a = area(r);
    const tall = r.h > r.w;
    const eq = { ...equationElement("eq", r), y: a.y, h: 150 };
    const net = tall ? { x: a.x, y: a.y + 230, w: a.w, h: Math.min(560, a.h - 260) } : { x: a.x + Math.round(a.w * 0.2), y: a.y + 200, w: Math.round(a.w * 0.6), h: a.h - 210 };
    const passes = on(c, "passes", "تمرّر");
    return {
      id: c.id, template: "canvas",
      narration: say(c, "One neuron is simple maths. It multiplies each input by a weight, adds a bias, and passes the total through an activation to give its output.",
        "الخلية العصبية الواحدة رياضيات بسيطة. فهي تضرب كل مدخل في وزن، وتضيف انحيازًا، ثم تمرّر المجموع عبر دالة تنشيط لتعطي مخرجها."),
      content: {
        elements: [
          heading(c, "One neuron, in maths", "خلية عصبية بلغة الرياضيات"),
          tracks(eq,
            track("reveal",
              [on(c, "multiplies", "تضرب"), 0], [on(c, "weight", "وزن"), 0.25, "out"],
              [on(c, "bias", "انحيازًا", -0.35), 0.25], [on(c, "bias", "انحيازًا"), 0.5, "out"],
              [on(c, "activation", "تنشيط", -0.35), 0.5], [on(c, "activation", "تنشيط"), 0.75, "out"],
              [on(c, "output", "مخرجها", -0.35), 0.75], [on(c, "output", "مخرجها"), 1, "out"]),
            lightOn([on(c, "weight", "وزن"), 1], [on(c, "bias", "انحيازًا"), 2], [on(c, "activation", "تنشيط"), 3], [on(c, "output", "مخرجها"), 4])),
          tracks({ id: "neuron", type: "net", ...net, layers: [2, 1], weights: [[[[0.9], [-0.6]]]], acts: [[[0.8, 0.3], [0.7]]], values: true, labels: { in: ["x₁", "x₂"], out: ["y"] } },
            track("opacity", [on(c, "neuron", "الخلية"), 0], [on(c, "neuron", "الخلية", 0.5), 1, "out"]),
            track("pass", [passes, 0], [shift(passes, 1.4), 1, "linear"], [shift(passes, 1.45), -1, "step"])),
        ],
      },
    };
  },
};

const activations: ScenePreset = {
  id: "activations", group: "science", name: { en: "Activation functions", ar: "دوال التنشيط" }, template: "canvas",
  make: (c) => ({
    id: c.id, template: "canvas",
    narration: say(c, "An activation shapes a neuron's answer. The sigmoid squeezes it between zero and one, tanh between minus one and one, and ReLU cuts off everything below zero.",
      "تشكّل دالة التنشيط جواب الخلية. فالسيجمويد تحصره بين الصفر والواحد، والظل الزائدي بين سالب واحد وواحد، أما ReLU فتقطع كل ما دون الصفر."),
    content: {
      elements: [
        heading(c, "Activation functions", "دوال التنشيط"),
        tracks(functionPlot("curves", room(c)),
          revealOn(on(c, "shapes", "تشكّل"), on(c, "sigmoid", "السيجمويد")),
          lightOn([on(c, "sigmoid", "السيجمويد"), 1], [on(c, "tanh", "الزائدي"), 2], [on(c, "ReLU", "ReLU"), 3])),
      ],
    },
  }),
};

const training: ScenePreset = {
  id: "training", group: "science", name: { en: "Training: decision map and loss", ar: "التدريب: خريطة القرار والخسارة" }, template: "canvas",
  make: (c) => {
    const [map, loss] = trainingPair(["map", "loss"], room(c));
    const from = on(c, "Watch", "راقب");
    const to = on(c, "falls", "تنخفض", 1.2);
    return {
      id: c.id, template: "canvas",
      narration: say(c, "Training repeats one small step many times. Watch the coloured map bend around the inner circle while the loss falls.",
        "يكرر التدريب خطوة صغيرة مرات كثيرة. راقب الخريطة الملوّنة تنحني حول الدائرة الداخلية بينما تنخفض الخسارة."),
      content: {
        elements: [
          heading(c, "Training, round by round", "التدريب جولة بعد جولة"),
          tracks(map, track("frame", [from, 0], [to, map.frame ?? 11, "linear"])),
          tracks(loss, revealOn(from, to)),
        ],
      },
    };
  },
};

const network: ScenePreset = {
  id: "network", group: "science", name: { en: "A neural network", ar: "شبكة عصبية" }, template: "canvas",
  make: (c) => {
    const fwd = on(c, "forward", "الأمام");
    const back = on(c, "back", "الخلف");
    return {
      id: c.id, template: "canvas",
      narration: say(c, "Neurons join in layers to make a network. Data flows forward from the inputs to the answer. Then the error flows back to correct every weight.",
        "ترتبط الخلايا العصبية في طبقات لتكوّن شبكة. تتدفق البيانات إلى الأمام من المدخلات حتى الجواب. ثم يعود الخطأ إلى الخلف ليصحّح كل وزن."),
      content: {
        elements: [
          heading(c, "A network, layer by layer", "شبكة طبقة بعد طبقة"),
          tracks(networkElement("net", room(c)),
            revealOn(on(c, "Neurons", "الخلايا"), on(c, "network", "شبكة")),
            track("pass", [fwd, 0], [shift(fwd, 1.6), 1, "linear"], [back, 1], [shift(back, 1.6), 2, "linear"], [shift(back, 1.7), -1, "step"])),
        ],
      },
    };
  },
};

const descent: ScenePreset = {
  id: "descent", group: "science", name: { en: "Gradient descent", ar: "الانحدار التدرجي" }, template: "canvas",
  make: (c) => ({
    id: c.id, template: "canvas",
    narration: say(c, "Learning is a walk downhill. Each step follows the slope of the error, like a ball rolling to the bottom of a valley.",
      "التعلّم نزول على منحدر. كل خطوة تتبع ميل الخطأ، مثل كرة تتدحرج إلى قاع الوادي."),
    content: {
      elements: [
        heading(c, "Gradient descent", "الانحدار التدرجي"),
        tracks(descentElement("gd", room(c)), track("frame", [on(c, "step", "خطوة"), 0], [on(c, "valley", "الوادي", 0.8), 11, "out"])),
      ],
    },
  }),
};

/** A model's architecture, narrated: blocks come in, light up as they are named, and data runs through. */
function archScene(model: ArchPreset, name: { en: string; ar: string }, title: [string, string], narration: [string, string], anim: (c: Ctx) => Track[]): ScenePreset {
  return {
    id: `arch-${model}`, group: "science", name, template: "canvas",
    make: (c) => ({
      id: c.id, template: "canvas",
      narration: say(c, narration[0], narration[1]),
      content: { elements: [heading(c, title[0], title[1]), tracks(archElement(model, "model", room(c)), ...anim(c))] },
    }),
  };
}

const ARCH: ScenePreset[] = [
  archScene("mlp", { en: "Multilayer perceptron (MLP)", ar: "الشبكة متعددة الطبقات (MLP)" }, ["A multilayer perceptron", "شبكة متعددة الطبقات"],
    ["The simplest deep network passes its input through hidden layers, one after another. Then the output layer turns the result into a choice.",
      "أبسط شبكة عميقة تمرّر مدخلاتها عبر طبقات مخفية، واحدة بعد أخرى. ثم تحوّل طبقة المخرجات النتيجة إلى اختيار."],
    (c) => [
      revealOn(on(c, "input", "مدخلاتها"), on(c, "another", "أخرى")),
      lightOn([on(c, "hidden", "مخفية"), 2], [on(c, "output", "المخرجات"), 4]),
      runOn(on(c, "result", "النتيجة")),
    ]),
  archScene("cnn", { en: "Convolutional network (CNN)", ar: "الشبكة الالتفافية (CNN)" }, ["A convolutional network", "شبكة التفافية"],
    ["For pictures, convolution layers scan for edges and shapes. Pooling layers shrink the picture, and a dense layer makes the final guess.",
      "مع الصور، تبحث طبقات الالتفاف عن الحواف والأشكال. ثم تصغّر طبقات التجميع الصورة، وتخرج طبقة كاملة الاتصال بالتخمين الأخير."],
    (c) => [
      revealOn(on(c, "pictures", "الصور"), on(c, "guess", "بالتخمين")),
      lightOn([on(c, "convolution", "الالتفاف"), 2], [on(c, "Pooling", "التجميع"), 3], [on(c, "dense", "كاملة"), 6], [on(c, "guess", "بالتخمين"), 7]),
    ]),
  archScene("rnn", { en: "Recurrent network (RNN)", ar: "الشبكة المتكررة (RNN)" }, ["A recurrent network", "شبكة متكررة"],
    ["A recurrent network reads a sentence one word at a time. Its cell keeps a memory of the words so far, and predicts the next word.",
      "تقرأ الشبكة المتكررة الجملة كلمة بعد كلمة. وتحتفظ خليتها بذاكرة للكلمات السابقة، ثم تتنبأ بالكلمة التالية."],
    (c) => [
      revealOn(on(c, "reads", "تقرأ"), on(c, "time", "بعد")),
      lightOn([on(c, "word", "كلمة"), 1], [on(c, "memory", "بذاكرة"), 2], [on(c, "next", "التالية"), 3]),
      runOn(on(c, "predicts", "تتنبأ"), 1.8),
    ]),
  archScene("transformer", { en: "Transformer", ar: "المحوّل (Transformer)" }, ["A transformer block", "كتلة المحوّل"],
    ["A transformer turns words into tokens and embeddings. Attention lets every token look at all the others, a feed forward layer works on each one, and the block repeats six times.",
      "يحوّل المحوّل الكلمات إلى رموز وتضمينات. يتيح الانتباه لكل رمز أن ينظر إلى الرموز الأخرى كلها، وتعالج الشبكة الأمامية كل رمز وحده، وتتكرر الكتلة ست مرات."],
    (c) => [
      revealOn(on(c, "turns", "يحوّل"), on(c, "Attention", "الانتباه")),
      lightOn([on(c, "tokens", "رموز"), 1], [on(c, "embeddings", "وتضمينات"), 2], [on(c, "Attention", "الانتباه"), 3], [on(c, "feed", "الأمامية"), 5], [on(c, "repeats", "وتتكرر"), 0]),
      runOn(on(c, "repeats", "وتتكرر")),
    ]),
  archScene("gpt", { en: "GPT (decoder only)", ar: "GPT (فكّ الترميز فقط)" }, ["How GPT writes", "كيف يكتب GPT"],
    ["GPT reads the tokens so far. Masked attention looks only at earlier tokens, the block repeats twelve times, and the model picks the next token, again and again.",
      "يقرأ GPT الرموز حتى الآن. ينظر الانتباه المقنّع إلى الرموز السابقة فقط، وتتكرر الكتلة اثنتي عشرة مرة، ثم يختار النموذج الرمز التالي، مرة بعد مرة."],
    (c) => [
      revealOn(on(c, "reads", "يقرأ"), on(c, "Masked", "المقنّع")),
      lightOn([on(c, "tokens", "الرموز"), 1], [on(c, "Masked", "المقنّع"), 3], [on(c, "repeats", "وتتكرر"), 0], [on(c, "next", "التالي"), 7]),
      runOn(on(c, "picks", "يختار")),
    ]),
  archScene("seq2seq", { en: "Encoder and decoder", ar: "المُرمِّز وفكّ الترميز" }, ["Encoder and decoder", "المُرمِّز وفكّ الترميز"],
    ["To translate, the encoder reads the whole sentence and squeezes its meaning into numbers. Then the decoder turns that meaning into words, one at a time, in the new language.",
      "للترجمة، يقرأ المُرمِّز الجملة كلها ويضغط معناها في أرقام. ثم يحوّل فكّ الترميز هذا المعنى إلى كلمات، واحدة بعد أخرى، باللغة الجديدة."],
    (c) => [
      revealOn(on(c, "translate", "للترجمة"), on(c, "meaning", "معناها")),
      lightOn([on(c, "encoder", "المُرمِّز"), 2], [on(c, "decoder", "الترميز"), 4], [on(c, "language", "باللغة"), 5]),
      runOn(on(c, "turns", "يحوّل")),
    ]),
  archScene("resnet", { en: "Residual block (ResNet)", ar: "الكتلة المتبقية (ResNet)" }, ["A residual block", "الكتلة المتبقية"],
    ["Very deep networks are hard to train. A residual block adds a shortcut: the input skips the layers and joins their result, so learning flows easily.",
      "يصعب تدريب الشبكات العميقة جدًا. لذلك تضيف الكتلة المتبقية اختصارًا: يتخطى المدخل الطبقات وينضم إلى نتيجتها، فيسهل التعلّم."],
    (c) => [
      revealOn(on(c, "deep", "العميقة"), on(c, "shortcut", "اختصارًا")),
      lightOn([on(c, "input", "المدخل"), 1], [on(c, "joins", "وينضم"), 7]),
      runOn(on(c, "learning", "التعلّم")),
    ]),
  archScene("autoencoder", { en: "Autoencoder", ar: "المُرمِّز التلقائي" }, ["An autoencoder", "المُرمِّز التلقائي"],
    ["An autoencoder squeezes a picture into a short code of eight numbers, then rebuilds it. If the copy looks right, the code kept what matters.",
      "يضغط المُرمِّز التلقائي الصورة في رمز قصير من ثمانية أرقام، ثم يعيد بناءها. فإذا بدت النسخة صحيحة، فقد حفظ الرمز ما يهم."],
    (c) => [
      revealOn(on(c, "autoencoder", "المُرمِّز"), on(c, "rebuilds", "يعيد")),
      lightOn([on(c, "squeezes", "يضغط"), 2], [on(c, "short", "قصير"), 3], [on(c, "rebuilds", "يعيد"), 4], [on(c, "copy", "النسخة"), 5]),
    ]),
  archScene("gan", { en: "GAN: generator and discriminator", ar: "GAN: المولِّد والمميِّز" }, ["Two networks that compete", "شبكتان تتنافسان"],
    ["A GAN trains two networks against each other. The generator turns noise into fake images, and the discriminator tries to tell real from fake. Each one makes the other better.",
      "تدرّب الشبكة التوليدية التنافسية شبكتين إحداهما ضد الأخرى. يحوّل المولِّد الضوضاء إلى صور مزيّفة، ويحاول المميِّز أن يفرّق بين الحقيقي والمزيّف. وكل منهما يجعل الآخر أفضل."],
    (c) => [
      revealOn(on(c, "trains", "تدرّب"), on(c, "discriminator", "المميِّز")),
      lightOn([on(c, "generator", "المولِّد"), 2], [on(c, "fake", "مزيّفة"), 3], [on(c, "discriminator", "المميِّز"), 5], [on(c, "better", "أفضل"), 0]),
      runOn(on(c, "tell", "يفرّق")),
    ]),
  archScene("agent", { en: "AI agent with tools", ar: "وكيل ذكاء اصطناعي بأدوات" }, ["An AI agent with tools", "وكيل ذكاء اصطناعي بأدوات"],
    ["An agent is a language model that plans. It reads the request and its memory, calls a tool such as a calculator, reads the result, and only then answers.",
      "الوكيل نموذج لغوي يخطّط. يقرأ الطلب وذاكرته، ويستدعي أداة مثل الحاسبة، ثم يقرأ النتيجة، وبعدها فقط يجيب."],
    (c) => [
      revealOn(on(c, "agent", "الوكيل"), on(c, "plans", "يخطّط")),
      lightOn([on(c, "plans", "يخطّط"), 2], [on(c, "request", "الطلب"), 1], [on(c, "memory", "وذاكرته"), 3], [on(c, "tool", "أداة"), 4], [on(c, "answers", "يجيب"), 5]),
      runOn(on(c, "calls", "ويستدعي")),
    ]),
  archScene("rag", { en: "Retrieval (RAG)", ar: "الاسترجاع (RAG)" }, ["Answers from your own documents", "إجابات من مستنداتك"],
    ["Retrieval helps a model answer from real documents. The question goes to a search, the best documents go to the model with it, and the answer can name its sources.",
      "يساعد الاسترجاع النموذج على الإجابة من مستندات حقيقية. يذهب السؤال إلى البحث، وتصل أفضل المستندات إلى النموذج معه، فيذكر الجواب مصادره."],
    (c) => [
      revealOn(on(c, "Retrieval", "الاسترجاع"), on(c, "search", "البحث")),
      lightOn([on(c, "question", "السؤال"), 1], [on(c, "search", "البحث"), 2], [on(c, "best", "أفضل"), 3], [on(c, "sources", "مصادره"), 5]),
      runOn(on(c, "goes", "يذهب")),
    ]),
];

export const GALLERY: ScenePreset[] = [title, steps, pipeline, chain, sms, email, quiz, summary, bigNumber, compare, process, chart, code, callout,
  equation, activations, training, network, descent, ...ARCH];

/**
 * The first scenes of a new lesson: its title, the idea in three steps, and a summary. The wording is a
 * scaffold to replace; the animations are already anchored to its words, so they keep working when the
 * words "First", "Then" and "Finally" stay.
 */
export function starterScenes(c: Omit<Ctx, "id">, lessonTitle: Text): Scene[] {
  const t = (l: Lang): string => (typeof lessonTitle === "string" ? lessonTitle : lessonTitle[l] ?? Object.values(lessonTitle)[0] ?? "");
  const x = { ...c, id: "" };
  return [
    {
      id: "intro", template: "title-hook",
      narration: Object.fromEntries(c.langs.map((l) => [l, l === "ar" ? `${t(l)}. في الدقيقة القادمة سترى لماذا يهم هذا.` : `${t(l)}. In the next minute, you will see why it matters.`])),
      content: { title: lessonTitle, hook: tx(x, "Why it matters", "لماذا يهم ذلك"), icon: "spark" },
      cues: [{ word: tx(x, "matters", "يهم"), action: "highlight", target: "hook" }],
    },
    {
      id: "idea", template: "steps",
      narration: say(x, "First, the first point. Then, the second point. Finally, the third point.", "أولًا، النقطة الأولى. ثم النقطة الثانية. أخيرًا، النقطة الثالثة."),
      content: { title: tx(x, "The idea", "الفكرة"), steps: [tx(x, "First point", "النقطة الأولى"), tx(x, "Second point", "النقطة الثانية"), tx(x, "Third point", "النقطة الثالثة")] },
      cues: [
        { word: tx(x, "First", "أولًا"), action: "reveal", target: "1" },
        { word: tx(x, "Then", "ثم"), action: "reveal", target: "2" },
        { word: tx(x, "Finally", "أخيرًا"), action: "reveal", target: "3" },
      ],
    },
    {
      id: "summary", template: "summary",
      narration: say(x, "Remember the key point. Try it in class today.", "تذكّر الفكرة الأساسية. وجرّبها في الصف اليوم."),
      content: { title: tx(x, "Remember", "تذكّر"), points: [tx(x, "The key point", "الفكرة الأساسية")], takeaway: tx(x, "Try it in class today.", "جرّبها في الصف اليوم.") },
      cues: [{ word: tx(x, "Try", "وجربها"), action: "reveal", target: "takeaway" }],
    },
  ];
}
