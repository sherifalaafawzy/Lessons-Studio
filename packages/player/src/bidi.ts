/**
 * Left-to-right runs inside right-to-left text: Latin words, numbers, codes and small formulas that must keep their
 * own order in an Arabic sentence. Each run starts with a Latin letter or a digit (or a bracket before one) and goes
 * on through letters, digits and the punctuation inside codes ("9Z", "2-opt", "96–98%", "salary-help.example/verify",
 * "check()"), across spaces to the next such word, around operators ("x ≤ 10", "a + b") and after a comma or colon
 * that is followed by one ("[14, 74]", "6B: PE"). Punctuation that ends the sentence stays outside the run.
 * No lookbehind: older Safari can't parse it.
 */
// Superscript digits, signs and degrees stay with their number ("2⁶", "10¹⁸", "24 °C"); the real minus sign (−), ≈ and → join a formula
// ("295 − 290 = 5", "1750 ÷ 4 ≈ 440", "90 → 152"). A left arrow (←) belongs to the right-to-left sentence.
const WORD = "[(\\[{°]?[A-Za-z0-9][A-Za-z0-9._\\-/:@#'’%+×*=<>≤≥≠–−^()\\[\\]{},⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺°₀₁₂₃₄₅₆₇₈₉!]*";
const RUN = new RegExp(`${WORD}(?:(?:\\s*(?:[=<>≤≥≠≈±+\\-−×÷⋅*/^–→]|&&|\\|\\|)\\s*|\\s*[,;:]\\s+|\\s+)${WORD})*`, "g");
const TRAILING = /[.,:;!?،؛؟]+$/;

/** [start, end) of each left-to-right run in `s`. */
export function ltrRuns(s: string): [number, number][] {
  const out: [number, number][] = [];
  if (!/[A-Za-z0-9]/.test(s)) return out;
  for (const m of s.matchAll(RUN)) {
    let text = m[0];
    // Sentence punctuation after the run belongs to the Arabic sentence; so does an unmatched closing bracket.
    const tail = TRAILING.exec(text);
    if (tail) text = text.slice(0, -tail[0].length);
    while (/[)\]}]$/.test(text) && count(text, /[([{]/g) < count(text, /[)\]}]/g)) text = text.slice(0, -1);
    if (text) out.push([m.index!, m.index! + text.length]);
  }
  return out;
}

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
