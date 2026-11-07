import { describe, expect, it } from "vitest";
import { labelsFor, withoutVerdict } from "../src/labels.ts";

describe("a quick check's explanation under the player's verdict", () => {
  it("drops the verdict the explanation opens with, in English and Arabic", () => {
    // The player's line already says "Correct" / «إجابة صحيحة» or "Not quite" / «ليس تمامًا».
    expect(withoutVerdict("Not quite — which mistake is worse is a value people choose.")).toBe("Which mistake is worse is a value people choose.");
    expect(withoutVerdict("Correct: the page hid an instruction.")).toBe("The page hid an instruction.");
    expect(withoutVerdict("Right! a tool needs a place and a day.")).toBe("A tool needs a place and a day.");
    expect(withoutVerdict("Yes — it isn’t broken.")).toBe("It isn’t broken.");
    expect(withoutVerdict("Not quite. The village is missing.")).toBe("The village is missing.");
    expect(withoutVerdict("صح — أنهي غلطة أوحش دي قيمة، مش حقيقة.")).toBe("أنهي غلطة أوحش دي قيمة، مش حقيقة.");
    expect(withoutVerdict("مش بالظبط: الأداة محتاجة مكان ويوم.")).toBe("الأداة محتاجة مكان ويوم.");
    expect(withoutVerdict("لأ: «دالا» اتقرت عادي.")).toBe("«دالا» اتقرت عادي.");
    expect(withoutVerdict("أيوه! ده المقصود.")).toBe("ده المقصود.");
  });

  it("keeps code, names and maths as written", () => {
    expect(withoutVerdict("Correct — range(3) gives 0, 1 and 2.")).toBe("range(3) gives 0, 1 and 2.");
    expect(withoutVerdict("Correct — json.loads turns JSON text into a dictionary.")).toBe("json.loads turns JSON text into a dictionary.");
    expect(withoutVerdict("Not quite — y got a copy of 5.")).toBe("y got a copy of 5.");
    expect(withoutVerdict("Correct: p = e^(−Δ/T) ≈ 0.37.")).toBe("p = e^(−Δ/T) ≈ 0.37.");
    expect(withoutVerdict("Correct — total = 5 after the loop.")).toBe("total = 5 after the loop.");
    expect(withoutVerdict("Correct — fact(4) down to fact(0) is five frames.")).toBe("fact(4) down to fact(0) is five frames.");
    expect(withoutVerdict("Correct — √64 = 8.")).toBe("√64 = 8.");
    expect(withoutVerdict("Correct — “above 50” is one straight cut.")).toBe("“above 50” is one straight cut.");
  });

  it("leaves an explanation without a verdict, or with nothing after one, alone", () => {
    expect(withoutVerdict("The page hid an instruction.")).toBe("The page hid an instruction.");
    expect(withoutVerdict("Yes, but only on the phone.")).toBe("Yes, but only on the phone.");
    expect(withoutVerdict("Rightly so — the page hid it.")).toBe("Rightly so — the page hid it.");
    expect(withoutVerdict("Correct.")).toBe("Correct.");
    expect(withoutVerdict("صحيح — ")).toBe("صحيح — ");
  });

  it("has a spoken position for the progress line in both languages", () => {
    expect(labelsFor("en").position).toBe("{t} of {d}");
    expect(labelsFor("ar-EG").position).toBe("{t} من {d}");
  });
});
