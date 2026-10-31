import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LIMITS, beyond, bidiAdvice, bidiProblems, controlIsolated, describeSides, emBox, firstStrong, fontFinding, fontLevel, formatLesson,
  inOrder, intersect, ltrRuns, merge, minDesignPx, nameOf, nested, onScreen, onceForTemplates, overflowOf, overlapShare, phonePx,
  smallest, totals, union, type CharPos, type Finding, type Rect, type SceneResult,
} from "../video/layout-rules.ts";
import { analyse, resolveInputs, type Snapshot, type UnitM } from "../video/layout-check.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LRI = "\u{2066}";
const PDI = "\u{2069}";
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const STAGE = r(0, 0, 1280, 720);

/** Positions for a text whose characters are drawn in `screen` order: the logical indices from left to right. */
function drawn(s: string, screen: number[], y = 100): (CharPos | null)[] {
  const pos: (CharPos | null)[] = new Array(s.length).fill(null);
  screen.forEach((i, k) => { pos[i] = { x: 10 + k * 20, y, h: 40 }; });
  return pos;
}
/** A run drawn left to right (as it should be) or right to left (reversed), the rest of the text untouched. */
function runDrawn(s: string, run: string, reversed: boolean): (CharPos | null)[] {
  const at = s.indexOf(run);
  const idx = [...run].map((_, k) => at + k);
  return drawn(s, reversed ? idx.reverse() : idx);
}

describe("layout check: boxes", () => {
  it("intersects, unites and measures how far a box leaves the stage", () => {
    expect(intersect(r(0, 0, 10, 10), r(5, 5, 10, 10))).toEqual(r(5, 5, 5, 5));
    expect(intersect(r(0, 0, 10, 10), r(10, 0, 5, 5))).toBeNull();
    expect(union([r(0, 0, 10, 10), r(20, 5, 5, 20)])).toEqual(r(0, 0, 25, 25));
    expect(union([])).toBeNull();
    expect(beyond(r(1270, 10, 14, 10), STAGE)).toBeNull(); // 4 px past: within the tolerance
    const out = beyond(r(1200, -30, 300, 100), STAGE)!;
    expect(out).toEqual({ left: 0, right: 220, top: 30, bottom: 0 });
    expect(describeSides(out)).toBe("220 px past the right and 30 px past the top edge");
  });

  it("narrows a line box to one em, so tall Arabic line boxes set close together don't overlap", () => {
    expect(emBox(r(0, 0, 100, 68), 40)).toEqual(r(0, 14, 100, 40));
    expect(emBox(r(0, 0, 100, 30), 40)).toEqual(r(0, 0, 100, 30));
    // Two 40 px lines 48 px apart: their 68 px line boxes overlap, their letters don't.
    const a = r(0, 0, 300, 68), b = r(0, 48, 300, 68);
    expect(overlapShare([a], [b])).toBeGreaterThan(LIMITS.overlap);
    expect(overlapShare([emBox(a, 40)], [emBox(b, 40)])).toBe(0);
  });

  it("measures overlap against the smaller text, line by line", () => {
    expect(overlapShare([r(0, 0, 100, 40)], [r(50, 0, 100, 40)])).toBeCloseTo(0.5);
    // A short label inside a long two-line text: all of the label overlaps.
    expect(overlapShare([r(0, 0, 400, 40), r(0, 50, 400, 40)], [r(10, 55, 50, 30)])).toBe(1);
    expect(overlapShare([], [r(0, 0, 10, 10)])).toBe(0);
  });

  it("tells a parent and its child from two separate boxes", () => {
    expect(nested([0, 1], [0, 1, 3])).toBe(true);
    expect(nested([0, 1, 3], [0, 1])).toBe(true);
    expect(nested([0, 1], [0, 2])).toBe(false);
  });

  it("finds overflow from the scroll width or from the lines poking out", () => {
    const none = { left: 0, right: 0, top: 0, bottom: 0 };
    expect(overflowOf({ clientW: 200, clientH: 58, scrollW: 445, scrollH: 58, ink: none })).toEqual({ dx: 245, dy: 0 });
    expect(overflowOf({ clientW: 200, clientH: 58, scrollW: 202, scrollH: 58, ink: none })).toEqual({ dx: 0, dy: 0 });
    // A flex-centred block: its text pokes out at the top and the bottom.
    expect(overflowOf({ clientW: 120, clientH: 80, scrollW: 120, scrollH: 80, ink: { left: 0, right: 0, top: 9, bottom: 9 } })).toEqual({ dx: 0, dy: 18 });
  });
});

describe("layout check: font size on a 360 px phone", () => {
  it("scales the stage to the phone's width", () => {
    expect(phonePx(27, 1280)).toBeCloseTo(7.59, 2);
    expect(phonePx(36, 720)).toBe(18);
    expect(fontLevel(phonePx(27, 1280))).toBe("error");
    expect(fontLevel(phonePx(35, 1280))).toBe("warn");
    expect(fontLevel(phonePx(40, 1280))).toBeNull();
    expect(minDesignPx(1280, LIMITS.fontError)).toBe(32);
    expect(minDesignPx(1280)).toBeCloseTo(39.1, 1);
    expect(minDesignPx(720)).toBe(22);
  });

  it("keeps the smallest few, smallest first, and counts the rest", () => {
    const texts = [40, 27, 35, 30, 20, 34, 60].map((px, i) => ({ key: `t${i}`, px }));
    const { worst, more } = smallest(texts, 1280);
    expect(worst.map((t) => t.key)).toEqual(["t4", "t1", "t3"]);
    expect(worst[0]!.level).toBe("error");
    expect(more).toBe(2); // 34 and 35 px are under 11 px on the phone too; 40 and 60 px pass
  });

  it("reports a scene's small texts in one finding", () => {
    const f = fontFinding([
      { el: "label1", text: "البنك", css: 27, px: 27, phone: 7.59, level: "error" },
      { part: "hook", text: "Five signs", css: 38, px: 38, phone: 10.69, level: "warn" },
      { el: "eq", text: "y = wx", css: 64, px: 32, phone: 9, level: "warn" },
    ], 4, 0.97)!;
    expect(f.level).toBe("error");
    expect(f.el).toBe("label1");
    expect(f.message).toBe('on a 360 px phone: label1 "البنك" 27 px → 7.6 px; part hook "Five signs" 38 px → 10.7 px; eq "y = wx" 64 px, drawn at 32 px → 9.0 px; and 4 more under 11 px');
    expect(fontFinding([], 0, 0.97)).toBeNull();
  });
});

describe("layout check: left-to-right runs in Arabic", () => {
  const runs = (s: string): string[] => ltrRuns(s).map((x) => x.text);

  it("finds codes, numbers with signs, formulas and lists", () => {
    expect(runs("حركة 2-opt بتحسّن الطريق")).toEqual(["2-opt"]);
    expect(runs("النطاق 96–98% دايمًا")).toEqual(["96–98%"]);
    expect(runs("لو x ≤ 10 خليها")).toEqual(["x ≤ 10"]);
    expect(runs("القائمة [14, 74] جاهزة")).toEqual(["14, 74"]);
    expect(runs("استدعي check() الأول")).toEqual(["check()"]);
    expect(runs("فصل 9Z و6B بكرة")).toEqual(["9Z", "6B"]);
    expect(runs("نسخة 3-2-1، وجرّبها")).toEqual(["3-2-1"]);
  });

  it("leaves the sentence its own punctuation, brackets and quotes", () => {
    expect(runs("حقن الأوامر (Prompt injection).")).toEqual(["Prompt injection"]);
    expect(runs("استخدم «Python»، وبعدين")).toEqual(["Python"]);
    expect(runs("النسبة = 30% بس")).toEqual(["30%"]);
    // A label and its value in an Arabic sentence are two things, laid out right to left.
    expect(runs("SMS: 140 بايت")).toEqual(["SMS", "140"]);
    expect(runs("خطوة 1: الطريق")).toEqual([]);
  });

  it("takes a paragraph with no Arabic as one run, punctuation and all", () => {
    expect(ltrRuns("Hello, world!")).toEqual([{ start: 0, end: 13, text: "Hello, world!", mixed: false }]);
    expect(runs("1. Collect data")).toEqual(["1. Collect data"]);
    expect(runs("(optional)")).toEqual(["optional"]);
  });

  it("reads Arabic punctuation and left arrows as the right-to-left sentence's", () => {
    // An Arabic list of numbers, and Arabic's "19 ← 18" for "19 → 18": both read right to left.
    expect(runs("1، 2، 3، 4، 5")).toEqual([]);
    expect(runs("A 13، B 9، D 7")).toEqual(["A 13", "B 9", "D 7"]);
    expect(runs("19 ← 18")).toEqual(["19", "18"]);
    expect(runs("الأقل: 0 ← 55")).toEqual(["55"]);
    // A right arrow stays in the run: "90 → 152" must read left to right.
    expect(runs("90 → 152")).toEqual(["90 → 152"]);
  });

  it("checks each paragraph on its own", () => {
    const s = "الالتفاف\n8 × 3×3";
    expect(ltrRuns(s)).toEqual([{ start: 9, end: 16, text: "8 × 3×3", mixed: false }]);
  });

  it("sees through invisible bidi controls", () => {
    const s = `فصل ${LRI}9Z${PDI} بكرة`;
    expect(runs(s)).toEqual(["9Z"]);
    expect(controlIsolated(s)).toBe("0000011000000");
    expect(controlIsolated(`a${LRI}bc${PDI}d`)).toBe("001100");
  });

  it("knows the first strong letter", () => {
    expect(firstStrong("2 Python هي")).toBe("ltr");
    expect(firstStrong("١٢ الدرس Python")).toBe("rtl");
    expect(firstStrong("123 – 456")).toBeNull();
  });
});

describe("layout check: bidi mistakes from where the letters were drawn", () => {
  it("passes a run drawn left to right and fails one drawn backwards", () => {
    const s = "النطاق 96–98% دايمًا";
    const run = ltrRuns(s)[0]!;
    expect(inOrder(run, runDrawn(s, "96–98%", false), s)).toBe(true);
    expect(inOrder(run, runDrawn(s, "96–98%", true), s)).toBe(false);
    expect(onScreen(run, runDrawn(s, "96–98%", true), s)).toBe("%89–69");
  });

  it("checks a run broken over two lines line by line", () => {
    const s = "abc def";
    const pos: (CharPos | null)[] = [
      { x: 10, y: 20, h: 40 }, { x: 30, y: 20, h: 40 }, { x: 50, y: 20, h: 40 }, null,
      { x: 5, y: 70, h: 40 }, { x: 25, y: 70, h: 40 }, { x: 45, y: 70, h: 40 },
    ];
    expect(inOrder(ltrRuns(s)[0]!, pos, s)).toBe(true);
    expect(onScreen(ltrRuns(s)[0]!, pos, s)).toBe("abc / def");
  });

  it("shows brackets laid out right to left mirrored, as they look", () => {
    const s = "استدعي check() الأول";
    const at = s.indexOf("check()");
    // "check" left to right, then the brackets drawn to its left, the closing one leftmost: "()check".
    const pos = drawn(s, [at + 6, at + 5, at, at + 1, at + 2, at + 3, at + 4]);
    const [p] = bidiProblems(s, pos, "0".repeat(s.length));
    expect(p).toMatchObject({ level: "error", how: "mixed", run: "check()", shown: "()check", split: false, isolated: false });
    expect(bidiAdvice(p!)).toBe(`"check()" reads "()check" on the screen: it isn't isolated; wrap it in <bdi dir="ltr"> (rich())`);
  });

  it("tells a partly isolated run, a lone number's sign and a Latin paragraph apart", () => {
    const s = "فصل 9Z بكرة";
    const iso = [...s].map((c) => (c === "Z" ? "1" : "0")).join("");
    const [split] = bidiProblems(s, runDrawn(s, "9Z", true), iso);
    expect(split).toMatchObject({ run: "9Z", shown: "Z9", split: true, level: "error" });
    expect(bidiAdvice(split!)).toContain("only part of it is isolated");

    const n = "صح 90% من المرات";
    const [num] = bidiProblems(n, runDrawn(n, "90%", true), "0".repeat(n.length));
    expect(num).toMatchObject({ run: "90%", number: true, level: "warn" });

    const l = "Hello, world!";
    const pos = drawn(l, [12, ...[...Array(12).keys()]]);
    const [latin] = bidiProblems(l, pos, "0".repeat(l.length));
    expect(latin).toMatchObject({ how: "latin", run: "Hello, world!", shown: "!Hello, world" });
    expect(bidiAdvice(latin!)).toContain('set dir="ltr"');
  });

  it("treats a lone number's sign or unit as a matter of convention", () => {
    for (const [s, n] of [["مشمس، 35°، مطر", "35°"], ["كل خانة: ×10", "×10"], ["≈ 5%", "≈ 5%"], ["سعر $5 بس", "$5"]] as const) {
      const [p] = bidiProblems(s, runDrawn(s, n, true), "0".repeat(s.length));
      expect(p, s).toMatchObject({ run: n, number: true, level: "warn" });
    }
    const s = "64 = 2⁶";
    expect(bidiProblems(s, runDrawn(s, s, true), "0".repeat(s.length))[0]).toMatchObject({ number: false, level: "error" });
  });

  it("wants a left arrow between two runs laid out right to left", () => {
    const s = "19 ← 18";
    // Right to left, as Arabic means it: "18 ← 19" on the screen, the arrow pointing from 19 to 18.
    expect(bidiProblems(s, drawn(s, [5, 6, 4, 3, 2, 0, 1]), "0000000")).toEqual([]);
    // Left to right: the arrow points back at 19.
    const [p] = bidiProblems(s, drawn(s, [0, 1, 2, 3, 4, 5, 6]), "0000000");
    expect(p).toMatchObject({ how: "arrow", run: "19 ← 18", shown: "19 ← 18", level: "error" });
    expect(bidiAdvice(p!)).toContain("points back");
  });

  it("counts isolates written into the text", () => {
    const s = `فصل ${LRI}9Z${PDI} بكرة`;
    const [p] = bidiProblems(s, runDrawn(s, "9Z", true), "0".repeat(s.length));
    expect(p).toMatchObject({ run: "9Z", isolated: true });
    expect(bidiProblems(s, runDrawn(s, "9Z", false), "0".repeat(s.length))).toEqual([]);
  });
});

describe("layout check: findings and the report", () => {
  const f = (o: Partial<Finding>): Finding => ({ level: "error", kind: "overlap", message: "m", at: [0.5], amount: 0.2, ...o });

  it("merges a finding seen at both moments, keeping the worst", () => {
    const out = merge([
      f({ el: "a", other: { el: "b" }, level: "warn", amount: 0.2, at: [0.5] }),
      f({ el: "b", other: { el: "a" }, level: "error", amount: 0.4, at: [0.97], message: "worse" }),
      f({ kind: "offstage", el: "c", at: [0.97] }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "offstage" });
    expect(out[1]).toMatchObject({ level: "error", message: "worse", at: [0.5, 0.97] });
  });

  it("names elements, parts, their insides and template text", () => {
    expect(nameOf({ el: "headline" })).toBe("headline");
    expect(nameOf({ part: "step:2" })).toBe("part step:2");
    expect(nameOf({ el: "cnn", sub: 'block "Pooling"' })).toBe('cnn › block "Pooling"');
    expect(nameOf({ sub: ".ls-num" })).toBe("template .ls-num");
  });

  it("reports the template's own small text once per lesson", () => {
    const quiz = (id: string): SceneResult => ({
      id, index: 0, template: "quiz",
      findings: [f({ kind: "font", part: "title", message: "small", items: [{ part: "title", text: "Quick check", css: 26, px: 26, phone: 7.3 }] })],
    });
    const scenes = [quiz("s07"), { id: "s08", index: 1, template: "canvas", findings: [] }, quiz("s11"), quiz("s13")];
    onceForTemplates(scenes);
    expect(scenes[0]!.findings[0]!.message).toBe("small (the same in s11, s13)");
    expect(scenes[2]!.findings).toEqual([]);
    expect(scenes[3]!.findings).toEqual([]);
  });

  it("writes a readable report and totals", () => {
    const lesson = {
      id: "cy-1-1-2", lang: "ar-EG", dir: "rtl" as const, stage: { orient: "landscape", W: 1280, H: 720 }, timing: "aligned", errors: 1, warnings: 0,
      scenes: [{ id: "s03", index: 2, template: "canvas", findings: [f({ kind: "overflow", message: 'label3 "x" (text box): the text is 12 px wider than its box (226×65)', at: [0.97] })] }],
    };
    expect(formatLesson(lesson)).toBe([
      "cy-1-1-2 ar-EG (rtl, landscape 1280×720, aligned timing): 1 error, 0 warnings",
      "  s03 (canvas, scene 3)",
      '    error overflow label3 "x" (text box): the text is 12 px wider than its box (226×65) [at 0.97]',
    ].join("\n"));
    expect(totals([lesson])).toMatchObject({ errors: 1, warnings: 0, byKind: { overflow: { errors: 1, warnings: 0 } } });
  });
});

describe("layout check: what a scene's measurements mean", () => {
  const unit = (o: Partial<UnitM>): UnitM => ({ key: "el:a", group: "el:a", el: "a", path: [0, 0], text: "Text", rects: [r(100, 100, 200, 40)], opacity: 1, px: 48, css: 48, rtl: false, ...o });
  const snap = (o: Partial<Snapshot>): Snapshot => ({ stage: STAGE, units: [], boxes: [], over: [], camera: false, ...o });
  const kinds = (fs: Finding[]): string[] => fs.map((x) => `${x.level} ${x.kind}`);

  it("finds text off the stage; a shape or a moved camera only warns", () => {
    const box = (el: string, type: string, x: number) => ({ key: `el:${el}`, el, type, box: r(x, 100, 300, 50), ink: r(x, 100, 300, 50), sized: false, text: "" });
    const s = snap({ boxes: [box("t", "text", 1100), box("bleed", "shape", 1200), box("ok", "text", 100)] });
    expect(kinds(analyse(s, 0.97, 1280, false))).toEqual(["error offstage", "warn offstage"]);
    expect(kinds(analyse({ ...s, camera: true }, 0.97, 1280, false))).toEqual(["warn offstage", "warn offstage"]);
  });

  it("warns about a text box that reaches off the stage while its text fits", () => {
    const s = snap({ boxes: [{ key: "el:b", el: "b", type: "text", box: r(900, 300, 600, 36), ink: r(1100, 300, 80, 36), sized: true, text: "Short" }] });
    const [w] = analyse(s, 0.97, 1280, false);
    expect(w).toMatchObject({ level: "warn", kind: "offstage", el: "b" });
    expect(w!.message).toContain("its box (600 px wide) goes 220 px past the right edge");
  });

  it("finds overflow and an equation shrunk too far", () => {
    const none = { left: 0, right: 0, top: 0, bottom: 0 };
    const s = snap({
      over: [
        { key: "el:wide", el: "wide", what: "text box", w: 200, h: 58, m: { clientW: 200, clientH: 58, scrollW: 445, scrollH: 58, ink: none }, box: r(0, 0, 200, 58), text: "Supercalifragilistic" },
        { key: "el:eq", el: "eq", what: "equation", w: 300, h: 80, m: { clientW: 300, clientH: 80, scrollW: 300, scrollH: 80, ink: none }, scale: 0.31, box: r(0, 0, 300, 80), text: "y" },
      ],
    });
    const out = analyse(s, 0.5, 1280, false);
    expect(out.map((x) => x.message)).toEqual([
      'wide "Supercalifragilistic" (text box): the text is 245 px wider than its box (200×58)',
      "eq (equation): shrunk to 0.31 of its size to fit its box (300×80); give it more room or split it",
    ]);
  });

  it("finds overlapping texts once, but not a parent and its child or invisible text", () => {
    const s = snap({
      units: [
        unit({ key: "el:a", group: "el:a", el: "a", path: [0, 0], rects: [r(100, 100, 400, 40)] }),
        unit({ key: "el:b", group: "el:b", el: "b", path: [0, 1], rects: [r(120, 110, 400, 40)] }),
        unit({ key: "el:c", group: "el:c", el: "c", path: [0, 0, 2], rects: [r(100, 100, 100, 40)] }),
        unit({ key: "el:d", group: "el:d", el: "d", path: [0, 3], rects: [r(100, 100, 400, 40)], opacity: 0 }),
      ],
    });
    const out = analyse(s, 0.5, 1280, false).filter((x) => x.kind === "overlap");
    expect(out.map((x) => [x.el, x.other?.el, x.level])).toEqual([["a", "b", "error"], ["b", "c", "error"]]);
  });

  it("judges font sizes and bidi only as the scene ends", () => {
    const s = snap({ units: [unit({ px: 27, css: 27 })] });
    expect(analyse(s, 0.5, 1280, false).filter((x) => x.kind === "font")).toEqual([]);
    const [font] = analyse(s, 0.97, 1280, true);
    expect(font).toMatchObject({ level: "error", kind: "font", el: "a" });

    const text = "استدعي check() الأول";
    const at = text.indexOf("check()");
    const bidi = snap({ units: [unit({ text, rtl: true, pos: drawn(text, [at + 6, at + 5, at, at + 1, at + 2, at + 3, at + 4]), iso: "0".repeat(text.length) })] });
    expect(analyse(bidi, 0.97, 1280, true).filter((x) => x.kind === "bidi").map((x) => x.message))
      .toEqual([`a: "check()" reads "()check" on the screen: it isn't isolated; wrap it in <bdi dir="ltr"> (rich())`]);
  });
});

describe("layout check: which lessons", () => {
  it("takes Darsi ids, example ids, folders of lessons and patterns", () => {
    const names = (args: string[]): string[] => resolveInputs(args, ROOT).map((d) => d.replace(/\\/g, "/").split("/").pop()!);
    expect(names(["CY-1-1-2", "how-ai-learns"])).toEqual(["cy-1-1-2", "how-ai-learns"]);
    expect(names(["ai-1-1-*"])).toEqual(["ai-1-1-1", "ai-1-1-2", "ai-1-1-3", "ai-1-1-4"]);
    expect(names([`${ROOT}examples`])).toContain("inside-a-neural-network");
    expect(() => resolveInputs(["no-such-lesson"], ROOT)).toThrow(/No lesson/);
  });
});
