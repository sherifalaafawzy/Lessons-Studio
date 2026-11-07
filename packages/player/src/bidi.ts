/**
 * Left-to-right runs inside right-to-left text: Latin words, numbers, codes and small formulas that must keep their
 * own order in an Arabic sentence. Each run starts with a Latin or Greek letter, a digit, ∂ or ∇ (or a bracket, ÷ or √
 * before one: "(Prompt injection)", "√64 = 8", "÷√d") and goes on through letters, digits and the punctuation inside
 * codes ("9Z", "2-opt", "96–98%", "salary-help.example/verify", "check()"), Greek letters, accents and small letters
 * ("2θ", "R̂", "QKᵀ", "xₜ"), across spaces to the next such word, around operators ("x ≤ 10", "a + b", "σ / √n") and
 * after a comma or colon that is followed by one ("[14, 74]", "6B: PE"). Punctuation that ends the sentence stays
 * outside the run, and a full stop followed by a space ends it ("= 3. ∂L/∂w", "SQL. SELECT"), except after an
 * abbreviation ("e.g. Python", "Dr. Smith").
 * No lookbehind: older Safari can't parse it.
 */
// Greek letters only (not Greek punctuation such as ano teleia, which looks like the middle dot), and ℓ.
const LETTER = "A-Za-z\\u0391-\\u03A9\\u03B1-\\u03C9\\u03D1\\u03D5\\u03D6\\u03F0\\u03F1\\u03F5\\u2113";
// What stays on a letter: accents ("R̂", "x̄"), modifier and small letters ("Kᵀ"), super- and subscripts ("2⁶", "xₜ", "n₀"), primes ("σ′").
const SUFFIX = "\\u0300-\\u036F\\u1D00-\\u1DBF\\u2070-\\u209F¹²³′″";
const OPEN = "[(\\[{°÷√∂∇]*";
const START = `[${LETTER}0-9∂∇]`;
// Superscripts, signs and degrees stay with their number ("10¹⁸", "24 °C"). A full stop joins only what follows it at once ("0.37", "e.g").
const CONT = `(?:[${LETTER}0-9${SUFFIX}_\\-/:@#'’%+×*=<>≤≥≠–−^()\\[\\]{},°!∂∇√⋅]|\\.(?=\\S))*`;
// An abbreviation keeps its full stop when another left-to-right word follows ("e.g. Python", "U.S. law", "Dr. Smith").
const NEXT = `(?=\\s+${OPEN}${START})`;
const ABBR = `(?:[A-Za-z]\\.){2,}${NEXT}|(?:Dr|Mrs?|Ms|Prof|vs|[Ff]ig|[Ee]q|cf|approx)\\.${NEXT}`;
const WORD = `${OPEN}(?:${ABBR}|${START}${CONT})`;
// The real minus sign (−), ≈ and → join a formula ("295 − 290 = 5", "1750 ÷ 4 ≈ 440", "90 → 152").
const SEP = "(?:\\s*(?:[=<>≤≥≠≈±+\\-−×÷⋅*/^–→]|&&|\\|\\|)\\s*|\\s*[,;:]\\s+|\\s+)";
// A left arrow (←) belongs to the right-to-left sentence ("8 ← 4 ← 2", "Excel ← SQL"), except in an assignment to a
// one-letter variable, which reads left to right as in maths ("θ ← θ − η∇R̂", "x₁ ← 5").
const VAR = `[${LETTER}][${SUFFIX}]*`;
const RUN = new RegExp(`(?:${VAR}\\s*←\\s*${WORD}|${WORD})(?:${SEP}${WORD})*`, "g");
const ANY = new RegExp(START);
const TRAILING = /[.,:;!?،؛؟]+$/;

/** [start, end) of each left-to-right run in `s`. */
export function ltrRuns(s: string): [number, number][] {
  const out: [number, number][] = [];
  if (!ANY.test(s)) return out;
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
