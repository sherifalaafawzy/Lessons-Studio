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
  it("keeps formulas with Greek letters, ∂, ∇ and √ whole (they were split and reordered in Arabic quick checks)", () => {
    expect(runs("الخسارة θ²، وθ = 3، وη = 0.1")).toEqual(["θ²", "θ = 3", "η = 0.1"]);
    expect(runs("صح: التدرّج 2θ = 6، فـ θ = 3 − 0.1 × 6 = 2.4.")).toEqual(["2θ = 6", "θ = 3 − 0.1 × 6 = 2.4"]);
    expect(runs("∂L/∂a = 2 و∂a/∂w = 3. ∂L/∂w كام؟")).toEqual(["∂L/∂a = 2", "∂a/∂w = 3", "∂L/∂w"]);
    expect(runs("صح: √64 = 8، وده")).toEqual(["√64 = 8"]);
    expect(runs("شرح softmax(QKᵀ/√d)V")).toEqual(["softmax(QKᵀ/√d)V"]);
    expect(runs("÷√d بيمنع التشبّع")).toEqual(["÷√d"]);
    expect(runs("ليه نقسم على √d؟")).toEqual(["√d"]);
    expect(runs("المشتقة σ′ = σ(1 − σ) دايمًا")).toEqual(["σ′ = σ(1 − σ)"]);
    expect(runs("الخطأ المعياري = σ / √n")).toEqual(["σ / √n"]);
    expect(runs("مش بالظبط: p = e^(−Δ/T) = e^(−1) ≈ 0.37.")).toEqual(["p = e^(−Δ/T) = e^(−1) ≈ 0.37"]);
    expect(runs("صح: O حد أعلى، وΘ(n) هو الحد المحكم.")).toEqual(["O", "Θ(n)"]);
    expect(runs("الذاكرة hₜ")).toEqual(["hₜ"]);
  });
  it("reads an assignment to a one-letter variable left to right, and leaves other left arrows to the sentence", () => {
    expect(runs("θ ← θ − η∇R̂")).toEqual(["θ ← θ − η∇R̂"]);
    expect(runs("ثم x₁ ← 5")).toEqual(["x₁ ← 5"]);
    expect(runs("8 ← 4 ← 2")).toEqual(["8", "4", "2"]);
    expect(runs("Excel ← SQL ← Python")).toEqual(["Excel", "SQL", "Python"]);
  });
  it("ends a run at a full stop and a space, but not after an abbreviation", () => {
    expect(runs("بلغة SQL. SELECT بتختار الأعمدة")).toEqual(["SQL", "SELECT"]);
    expect(runs("b = 5، وb = 7. print(a, b) هيطبع إيه؟")).toEqual(["b = 5", "b = 7", "print(a, b)"]);
    expect(runs("النجاح 0.2. pass@2 كام؟")).toEqual(["0.2", "pass@2"]);
    expect(runs("مثل e.g. Python هنا")).toEqual(["e.g. Python"]);
    expect(runs("قال Dr. Smith كده")).toEqual(["Dr. Smith"]);
    expect(runs("الدولة U.S.A كبيرة")).toEqual(["U.S.A"]);
    expect(runs("النسخة 3.10. بعدين")).toEqual(["3.10"]);
    expect(runs("قيمة 1.5× أسرع، و n! = 120")).toEqual(["1.5×", "n! = 120"]);
  });
  it("finds nothing in plain Arabic", () => {
    expect(runs("مرحبا بكم في الدرس")).toEqual([]);
  });
});
