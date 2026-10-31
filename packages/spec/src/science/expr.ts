/**
 * Plot expressions: y as a function of x and the parameters a, b, c, d, e.g. "a*x + b", "1/(1+exp(-x))",
 * "max(0, x)", "(x-2)^2 + 1". Parsed once into a closure (never eval, which a strict page forbids anyway).
 */

export type Fn = (x: number, p: readonly number[]) => number;

export class ExprError extends Error {
  /** Where in the expression, from 0. */
  readonly at: number;
  constructor(message: string, at: number) { super(message); this.at = at; }
}

const F1: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tanh: Math.tanh, exp: Math.exp, abs: Math.abs, sqrt: Math.sqrt,
  log: Math.log, ln: Math.log, log2: Math.log2, log10: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, sigmoid: (v) => 1 / (1 + Math.exp(-v)), relu: (v) => Math.max(0, v), step: (v) => (v >= 0 ? 1 : 0),
};
const F2: Record<string, (a: number, b: number) => number> = { max: Math.max, min: Math.min, pow: Math.pow };
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };
const PARAMS = ["a", "b", "c", "d"];
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Compiles an expression; throws ExprError when it isn't one. At most 200 characters. */
export function compileExpr(src: string): Fn {
  if (typeof src !== "string" || !src.trim()) throw new ExprError("empty", 0);
  if (src.length > 200) throw new ExprError("longer than 200 characters", 200);
  let i = 0;
  const fail = (m: string, at = i): never => { throw new ExprError(m, at); };
  const skip = (): void => { while (src[i] === " ") i++; };
  const eat = (c: string): boolean => { skip(); if (src[i] === c) { i++; return true; } return false; };

  // expr := term (("+"|"-") term)*; term := unary (("*"|"/") unary)*; unary := "-" unary | power;
  // power := atom ("^" unary)?; atom := number | x | param | const | name "(" args ")" | "(" expr ")"
  const expr = (): Fn => {
    let f = term();
    for (;;) {
      if (eat("+")) { const a = f, b = term(); f = (x, p) => a(x, p) + b(x, p); }
      else if (eat("-")) { const a = f, b = term(); f = (x, p) => a(x, p) - b(x, p); }
      else return f;
    }
  };
  const term = (): Fn => {
    let f = unary();
    for (;;) {
      if (eat("*")) { const a = f, b = unary(); f = (x, p) => a(x, p) * b(x, p); }
      else if (eat("/")) { const a = f, b = unary(); f = (x, p) => a(x, p) / b(x, p); }
      else return f;
    }
  };
  const unary = (): Fn => {
    if (eat("-")) { const a = unary(); return (x, p) => -a(x, p); }
    if (eat("+")) return unary();
    return power();
  };
  const power = (): Fn => {
    const base = atom();
    if (eat("^")) { const ex = unary(); return (x, p) => Math.pow(base(x, p), ex(x, p)); }
    return base;
  };
  const atom = (): Fn => {
    skip();
    const at = i;
    const c = src[i];
    if (c === undefined) return fail("unexpected end");
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) return fail("a bad number");
      i += m[0].length;
      const v = Number(m[0]);
      return () => v;
    }
    if (c === "(") {
      i++;
      const f = expr();
      if (!eat(")")) fail("a ( without its )", at);
      return f;
    }
    if (/[a-z]/i.test(c)) {
      const m = /^[a-z][a-z0-9]*/i.exec(src.slice(i))!;
      i += m[0].length;
      const name = m[0];
      if (name === "x") return (x) => x;
      const pi = PARAMS.indexOf(name);
      if (pi >= 0) return (_x, p) => p[pi] ?? 0;
      if (has(CONST, name)) { const v = CONST[name]!; return () => v; }
      if (has(F1, name) || has(F2, name)) {
        if (!eat("(")) fail(`${name} needs (…)`);
        const a = expr();
        if (has(F2, name)) {
          if (!eat(",")) fail(`${name} takes two values`);
          const b = expr();
          if (!eat(")")) fail("a ( without its )", at);
          const g = F2[name]!;
          return (x, p) => g(a(x, p), b(x, p));
        }
        if (!eat(")")) fail("a ( without its )", at);
        const g = F1[name]!;
        return (x, p) => g(a(x, p));
      }
      return fail(`unknown name ${name}`, at);
    }
    return fail(`unexpected ${c}`);
  };

  const f = expr();
  skip();
  if (i < src.length) fail(`unexpected ${src[i]}`);
  return f;
}
