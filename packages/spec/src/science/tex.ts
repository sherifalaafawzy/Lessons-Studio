/**
 * A small TeX subset for equations in lessons (MathElement), parsed into a tree the player's science kit draws with
 * plain HTML: no KaTeX (about 280 KB) and no math fonts to download. The validator parses every equation, so a lesson
 * never reaches a phone with one the player can't draw.
 *
 * Supported: letters (italic), numbers, + − = < > ( ) [ ] , ; : ! ' | /, ^ and _, \frac, \sqrt (and \sqrt[n]), \sum
 * \prod \int with limits, Greek letters, the usual relations and arrows, \hat \bar \vec \tilde \dot, \mathbf
 * \boldsymbol, \text \mathrm \operatorname, \log \ln \exp \sin \cos \tan \tanh \max \min \arg \lim \det, \left…\right,
 * the matrix environments (matrix, pmatrix, bmatrix, vmatrix, cases), spaces (\, \; \quad \qquad), and Darsi's own
 * \g{n}{…} (a part that comes in or lights up), \c{tone}{…} (a colour) and \w{key} (a word in the lesson's language).
 */

export type MNode =
  | { t: "row"; c: MNode[] }
  /** An identifier: a letter or a Greek letter, set in italic (capital Greek upright). */
  | { t: "i"; v: string }
  | { t: "n"; v: string }
  /** An operator or punctuation, spaced by its class: "b" binary, "r" relation, "p" punctuation, "o" ordinary. */
  | { t: "o"; v: string; k: "b" | "r" | "p" | "o" }
  /** Upright text: \text, \mathrm, operator names. */
  | { t: "x"; v: string }
  /** A word from the element's `words`, in the lesson language. */
  | { t: "w"; k: string }
  | { t: "frac"; a: MNode; b: MNode }
  | { t: "s"; b: MNode; sup?: MNode; sub?: MNode }
  | { t: "sqrt"; a: MNode; n?: MNode }
  /** A large operator (∑ ∏ ∫) or an operator name with limits under it (max, lim). */
  | { t: "big"; v: string; name?: boolean; sup?: MNode; sub?: MNode }
  | { t: "acc"; v: "hat" | "bar" | "vec" | "tilde" | "dot"; a: MNode }
  | { t: "bf"; a: MNode }
  | { t: "fence"; l: string; r: string; a: MNode }
  | { t: "mat"; rows: MNode[][]; l: string; r: string }
  /** Lines of a derivation, split at &: the left column aligns to its end, the right to its start. */
  | { t: "stack"; lines: { l: MNode; r: MNode }[] }
  | { t: "g"; n: number; a: MNode }
  | { t: "c"; tone: string; a: MNode }
  | { t: "sp"; w: number };

export interface ParsedTex {
  root: MNode;
  /** The \g part numbers used, sorted. */
  groups: number[];
  /** The \w word keys used. */
  words: string[];
  /** The colour names used with \c. */
  tones: string[];
}

export class TexError extends Error {
  /** Where in the source, from 0. */
  readonly at: number;
  constructor(message: string, at: number) { super(message); this.at = at; }
}

export const TEX_MAX = 800;

/** Own keys only: "constructor" in {} is true. */
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const OPS: Record<string, [string, "b" | "r" | "p" | "o"]> = {
  cdot: ["⋅", "b"], times: ["×", "b"], div: ["÷", "b"], pm: ["±", "b"], mp: ["∓", "b"], circ: ["∘", "b"],
  oplus: ["⊕", "b"], otimes: ["⊗", "b"], odot: ["⊙", "b"], cup: ["∪", "b"], cap: ["∩", "b"], land: ["∧", "b"], lor: ["∨", "b"],
  le: ["≤", "r"], leq: ["≤", "r"], ge: ["≥", "r"], geq: ["≥", "r"], ne: ["≠", "r"], neq: ["≠", "r"], approx: ["≈", "r"],
  sim: ["∼", "r"], equiv: ["≡", "r"], propto: ["∝", "r"], to: ["→", "r"], rightarrow: ["→", "r"], leftarrow: ["←", "r"],
  gets: ["←", "r"], Rightarrow: ["⇒", "r"], Leftarrow: ["⇐", "r"], leftrightarrow: ["↔", "r"], mapsto: ["↦", "r"],
  in: ["∈", "r"], notin: ["∉", "r"], subset: ["⊂", "r"], subseteq: ["⊆", "r"], ll: ["≪", "r"], gg: ["≫", "r"], mid: ["|", "r"],
  partial: ["∂", "o"], nabla: ["∇", "o"], infty: ["∞", "o"], forall: ["∀", "o"], exists: ["∃", "o"], neg: ["¬", "o"],
  ldots: ["…", "o"], cdots: ["⋯", "o"], vdots: ["⋮", "o"], ddots: ["⋱", "o"], prime: ["′", "o"], star: ["⋆", "o"],
  emptyset: ["∅", "o"], ell: ["ℓ", "o"], top: ["⊤", "o"], perp: ["⊥", "o"], angle: ["∠", "o"], triangle: ["△", "o"],
  lbrace: ["{", "o"], rbrace: ["}", "o"], lvert: ["|", "o"], rvert: ["|", "o"], vert: ["|", "o"], Vert: ["‖", "o"],
  colon: [":", "p"],
};
const BIG: Record<string, string> = { sum: "∑", prod: "∏", int: "∫", bigcup: "⋃", bigcap: "⋂" };
/** Operator names; those with limits under them when given a subscript. */
const NAMES = new Set(["log", "ln", "exp", "sin", "cos", "tan", "tanh", "sinh", "cosh", "det", "dim", "arg", "deg", "gcd", "Pr"]);
const LIMIT_NAMES = new Set(["max", "min", "lim", "sup", "inf", "argmax", "argmin"]);
const SPACES: Record<string, number> = { ",": 0.17, ":": 0.22, ";": 0.28, "!": -0.17, quad: 1, qquad: 2, " ": 0.25 };
const ACCENTS = new Set(["hat", "bar", "vec", "tilde", "dot", "overline", "widehat"]);
const DELIMS: Record<string, string> = { "(": "(", ")": ")", "[": "[", "]": "]", "\\{": "{", "\\}": "}", "|": "|", "\\|": "‖", ".": "", "\\langle": "⟨", "\\rangle": "⟩", "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉", "\\lvert": "|", "\\rvert": "|", "\\vert": "|" };
const ENVS: Record<string, [string, string]> = { matrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], cases: ["{", ""] };
const CHAR_OPS: Record<string, [string, "b" | "r" | "p" | "o"]> = {
  "+": ["+", "b"], "-": ["−", "b"], "*": ["∗", "b"], "/": ["/", "o"], "=": ["=", "r"], "<": ["<", "r"], ">": [">", "r"],
  ",": [",", "p"], ";": [";", "p"], ":": [":", "r"], "!": ["!", "o"], "'": ["′", "o"], "|": ["|", "o"], "(": ["(", "o"],
  ")": [")", "o"], "[": ["[", "o"], "]": ["]", "o"], "?": ["?", "o"], ".": [".", "p"],
};
export const TEX_TONES = ["fg", "muted", "accent", "accent2", "danger", "ok"] as const;

/** Parses an equation; throws TexError (with the position) when it isn't in the subset. */
export function parseTex(src: string): ParsedTex {
  if (typeof src !== "string" || !src.trim()) throw new TexError("empty", 0);
  if (src.length > TEX_MAX) throw new TexError(`longer than ${TEX_MAX} characters`, TEX_MAX);
  let i = 0;
  const groups = new Set<number>();
  const words = new Set<string>();
  const tones = new Set<string>();
  let depth = 0;

  const fail = (msg: string, at = i): never => { throw new TexError(msg, at); };
  const skip = (): void => { while (i < src.length && /\s/.test(src[i]!)) i++; };
  const peek = (): string | undefined => { skip(); return src[i]; };
  const command = (): string => {
    // At a backslash: a run of letters, or one other character (\, \{ \\).
    const start = ++i;
    if (/[A-Za-z]/.test(src[i] ?? "")) { while (/[A-Za-z]/.test(src[i] ?? "")) i++; return src.slice(start, i); }
    if (i >= src.length) fail("a lone backslash");
    return src[i++]!;
  };
  /** A {…} argument (or a single token), as a row. */
  const arg = (): MNode => {
    const c = peek();
    if (c === "{") { i++; const r = row("}"); if (src[i] !== "}") fail("a { without its }"); i++; return r; }
    if (c === undefined || c === "}" || c === "&") fail("a missing argument");
    return atom() ?? fail("a missing argument");
  };
  /** A {…} argument read as plain text (\text, \operatorname, \w and \c names). */
  const rawArg = (): string => {
    skip();
    if (src[i] !== "{") fail("expected {");
    const start = ++i;
    let level = 1;
    while (i < src.length && level) { if (src[i] === "{") level++; else if (src[i] === "}") level--; if (level) i++; }
    if (level) fail("a { without its }", start);
    return src.slice(start, i++);
  };
  const delim = (): string => {
    skip();
    if (src[i] === "\\") {
      const at = i;
      const name = "\\" + command();
      if (!has(DELIMS, name)) fail(`unknown delimiter ${name}`, at);
      return DELIMS[name]!;
    }
    const c = src[i++];
    if (c === undefined || !has(DELIMS, c)) fail(`unknown delimiter ${c ?? ""}`);
    return DELIMS[c!]!;
  };
  const scripts = (base: MNode): MNode => {
    let sup: MNode | undefined;
    let sub: MNode | undefined;
    for (;;) {
      const c = peek();
      if (c === "^" && !sup) { i++; sup = arg(); }
      else if (c === "_" && !sub) { i++; sub = arg(); }
      else if (c === "'" && !sup) { i++; sup = { t: "o", v: "′", k: "o" }; }
      else if (c === "^" || c === "_") fail("a double script (use braces)");
      else break;
    }
    if (!sup && !sub) return base;
    if (base.t === "big") return { ...base, ...(sup ? { sup } : {}), ...(sub ? { sub } : {}) };
    return { t: "s", b: base, ...(sup ? { sup } : {}), ...(sub ? { sub } : {}) };
  };
  /** A derivation: each line is split at & so the equals signs line up. */
  const aligned = (): MNode => {
    const lines: { l: MNode; r: MNode }[] = [];
    for (;;) {
      const l = row("&");
      skip();
      let r: MNode = { t: "row", c: [] };
      if (src.startsWith("&", i)) { i++; r = row("&"); skip(); }
      lines.push({ l, r });
      if (src.startsWith("\\\\", i)) { i += 2; continue; }
      if (src.startsWith("\\end", i)) {
        i += 4;
        if (rawArg() !== "aligned") fail("\\end does not match \\begin{aligned}");
        break;
      }
      fail("\\begin{aligned} without \\end");
    }
    if (lines.length > 8) fail("more than 8 lines");
    return { t: "stack", lines };
  };
  const env = (name: string): MNode => {
    if (name === "aligned") return aligned();
    const [l, r] = has(ENVS, name) ? ENVS[name]! : fail(`unknown environment ${name}`);
    const rows: MNode[][] = [[]];
    for (;;) {
      const cell = row("&");
      rows[rows.length - 1]!.push(cell);
      skip();
      if (src.startsWith("&", i)) { i++; continue; }
      if (src.startsWith("\\\\", i)) { i += 2; rows.push([]); continue; }
      if (src.startsWith("\\end", i)) {
        i += 4;
        if (rawArg() !== name) fail(`\\end does not match \\begin{${name}}`);
        break;
      }
      fail(`\\begin{${name}} without \\end`);
    }
    if (rows.length > 1 && rows[rows.length - 1]!.length === 1 && isEmpty(rows[rows.length - 1]![0]!)) rows.pop();
    if (rows.length > 6 || rows.some((r) => r.length > 6)) fail("a matrix larger than 6 × 6");
    return { t: "mat", rows, l, r };
  };
  const atom = (): MNode | null => {
    const c = peek();
    if (c === undefined) return null;
    const at = i;
    if (c === "{") { i++; const r = row("}"); if (src[i] !== "}") fail("a { without its }", at); i++; return r; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const start = i;
      while (/[0-9]/.test(src[i] ?? "") || (src[i] === "." && /[0-9]/.test(src[i + 1] ?? ""))) i++;
      return { t: "n", v: src.slice(start, i) };
    }
    if (/\p{L}/u.test(c)) { i++; return { t: "i", v: c }; }
    if (has(CHAR_OPS, c)) { i++; const [v, k] = CHAR_OPS[c]!; return { t: "o", v, k }; }
    if (c !== "\\") return fail(`unexpected ${c}`);
    const name = command();
    if (has(GREEK, name)) { const v = GREEK[name]!; return { t: "i", v }; }
    if (has(OPS, name)) { const [v, k] = OPS[name]!; return { t: "o", v, k }; }
    if (has(BIG, name)) return { t: "big", v: BIG[name]! };
    if (LIMIT_NAMES.has(name)) return { t: "big", v: name === "argmax" ? "arg max" : name === "argmin" ? "arg min" : name, name: true };
    if (NAMES.has(name)) return { t: "x", v: name };
    if (has(SPACES, name)) return { t: "sp", w: SPACES[name]! };
    if (name === "\\") return fail("a line break outside a matrix", at);
    if (name === "{" || name === "}") return { t: "o", v: name, k: "o" };
    if (name === "frac" || name === "dfrac" || name === "tfrac") { const a = arg(); const b = arg(); return { t: "frac", a, b }; }
    if (name === "sqrt") {
      let n: MNode | undefined;
      if (peek() === "[") { i++; n = row("]"); if (src[i] !== "]") fail("a [ without its ]", at); i++; }
      return { t: "sqrt", a: arg(), ...(n ? { n } : {}) };
    }
    if (ACCENTS.has(name)) return { t: "acc", v: name === "overline" ? "bar" : name === "widehat" ? "hat" : (name as "hat"), a: arg() };
    if (name === "mathbf" || name === "boldsymbol" || name === "bm") return { t: "bf", a: arg() };
    if (name === "mathrm" || name === "text" || name === "textrm" || name === "mathit") {
      const v = rawArg();
      if (/[\\{}]/.test(v)) fail(`\\${name} takes plain text`, at);
      return name === "mathit" ? { t: "i", v } : { t: "x", v };
    }
    if (name === "operatorname") {
      const v = rawArg();
      if (!/^[A-Za-z][A-Za-z0-9 -]*$/.test(v)) fail("\\operatorname takes a plain name", at);
      return { t: "x", v };
    }
    if (name === "left") {
      const l = delim();
      const a = row("\\right");
      if (!src.startsWith("\\right", i)) fail("\\left without \\right", at);
      i += 6;
      return { t: "fence", l, r: delim(), a };
    }
    if (name === "right") return fail("\\right without \\left", at);
    if (name === "big" || name === "Big" || name === "bigg" || name === "Bigg") { const d = delim(); return { t: "o", v: d, k: "o" }; }
    if (name === "begin") return env(rawArg());
    if (name === "g") {
      const n = Number(rawArg());
      if (!Number.isInteger(n) || n < 1 || n > 20) fail("\\g takes a part number from 1 to 20", at);
      groups.add(n);
      return { t: "g", n, a: arg() };
    }
    if (name === "c") {
      const tone = rawArg();
      if (!(TEX_TONES as readonly string[]).includes(tone)) fail(`\\c takes a colour: ${TEX_TONES.join(", ")}`, at);
      tones.add(tone);
      return { t: "c", tone, a: arg() };
    }
    if (name === "w") {
      const k = rawArg();
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) fail("\\w takes a word key (letters, digits, - and _)", at);
      words.add(k);
      return { t: "w", k };
    }
    return fail(`unknown command \\${name}`, at);
  };
  /** A sequence of atoms with their scripts, up to `stop` ("}", "]", "&", "\\right") or the end. */
  const row = (stop?: string): MNode => {
    if (++depth > 12) fail("nested too deeply");
    const c: MNode[] = [];
    for (;;) {
      const ch = peek();
      if (ch === undefined) break;
      if (stop === "}" && ch === "}") break;
      if (stop === "]" && ch === "]") break;
      if (stop === "&" && (ch === "&" || src.startsWith("\\\\", i) || src.startsWith("\\end", i))) break;
      if (stop === "\\right" && src.startsWith("\\right", i)) break;
      if (ch === "}") fail("a } without its {");
      if (ch === "&" || src.startsWith("\\\\", i)) fail("& or \\\\ outside a matrix");
      if (ch === "^" || ch === "_") { c.push(scripts({ t: "row", c: [] })); continue; }
      const a = atom();
      if (!a) break;
      const prev = c[c.length - 1];
      if (a.t === "o" && a.k === "b" && (a.v === "−" || a.v === "+") && (!prev || (prev.t === "o" && (prev.k !== "o" || "([{".includes(prev.v))))) a.k = "o";
      c.push(scripts(a));
    }
    depth--;
    return c.length === 1 ? c[0]! : { t: "row", c };
  };

  const root = row();
  if (i < src.length) fail(`unexpected ${src[i]}`);
  return { root, groups: [...groups].sort((a, b) => a - b), words: [...words], tones: [...tones] };
}

function isEmpty(n: MNode): boolean { return n.t === "row" && n.c.length === 0; }
