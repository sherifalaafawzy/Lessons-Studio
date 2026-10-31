import { describe, expect, it } from "vitest";
import { ltrRuns } from "../src/bidi.ts";

/** The runs of `s` as strings. */
const runs = (s: string): string[] => ltrRuns(s).map(([a, b]) => s.slice(a, b));

describe("left-to-right runs in Arabic text", () => {
  it("keeps Latin words and phrases whole", () => {
    expect(runs("حقن الأوامر (Prompt injection)")).toEqual(["(Prompt injection)"]);
    expect(runs("زر salary-help.example/verify الآن")).toEqual(["salary-help.example/verify"]);
  });
  it("catches runs that start with a digit (the old pattern split them)", () => {
    expect(runs("الصف 6B يبدأ")).toEqual(["6B"]);
    expect(runs("الرمز 9Z مهم")).toEqual(["9Z"]);
    expect(runs("دقة 96–98% في الاختبار")).toEqual(["96–98%"]);
    expect(runs("خوارزمية 2-opt تحسّن المسار")).toEqual(["2-opt"]);
  });
  it("keeps small formulas, lists and calls together", () => {
    expect(runs("إذا كان x ≤ 10 نتوقف")).toEqual(["x ≤ 10"]);
    expect(runs("القائمة [14, 74] مرتبة")).toEqual(["[14, 74]"]);
    expect(runs("استدعِ check() ثم انتظر")).toEqual(["check()"]);
    expect(runs("التذكير 6B: PE غدًا")).toEqual(["6B: PE"]);
    expect(runs("المعادلة a + b = c واضحة")).toEqual(["a + b = c"]);
  });
  it("keeps sums with a real minus, ≈, arrows and powers together (found by the layout check)", () => {
    expect(runs("تقريبًا 1750 ÷ 4 ≈ 440 لكل يوم")).toEqual(["1750 ÷ 4 ≈ 440"]);
    expect(runs("الفرق 295 − 290 = 5 فقط")).toEqual(["295 − 290 = 5"]);
    expect(runs("لأن 64 = 2⁶ بالضبط")).toEqual(["64 = 2⁶"]);
    expect(runs("أكثر من 10¹⁸ طريقة")).toEqual(["10¹⁸"]);
    expect(runs("من 90 → 152 صفًا")).toEqual(["90 → 152"]);
    expect(runs("العد 3-2-1 ثم ابدأ")).toEqual(["3-2-1"]);
    expect(runs("الحرارة 24 °C الآن")).toEqual(["24 °C"]);
  });
  it("leaves sentence punctuation and Arabic commas to the sentence", () => {
    expect(runs("نستخدم ReLU.")).toEqual(["ReLU"]);
    expect(runs("مثل Python، ثم SQL؟")).toEqual(["Python", "SQL"]);
    expect(runs("انظر (مثل GPT)")).toEqual(["GPT"]);
  });
  it("finds nothing in plain Arabic", () => {
    expect(runs("مرحبا بكم في الدرس")).toEqual([]);
  });
});
