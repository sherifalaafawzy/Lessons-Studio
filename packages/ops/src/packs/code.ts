/**
 * Programming pack: content computed when a lesson is made (never on the phone), and ready-made elements and scenes with
 * labels in English and Arabic. Seeded, so the same call always gives the same lesson.
 *
 * - `recordTrace(code, { inputs })` runs a Python program in real MicroPython (Node, `sys.settrace`) and records each
 *   line as it runs: the function, the call depth, the program's and the function's variables after the line, what it
 *   printed, the value a line returns, and an error. `traceCalls` turns the same run into a call tree.
 * - `sortFrames` (bubble, selection, insertion, merge, quick) and `searchFrames` (linear, binary) for `array`.
 * - `callTree` (fib, factorial, hanoi) for `calltree`; `flowchart`, `traceElement`, `arrayElement`, `calltreeElement`,
 *   `codediffElement` build elements; `element(type, langs, box)` gives a default of each type, `presets` the gallery.
 */
import type { Element, Orient, PackElement, Scene, Text, When } from "@lessonstudio/spec";
import { tx } from "../science.ts";

export type TraceElement = Extract<PackElement, { type: "trace" }>;
export type TraceStep = TraceElement["steps"][number];
export type FlowchartElement = Extract<PackElement, { type: "flowchart" }>;
export type FlowNode = FlowchartElement["nodes"][number];
export type FlowEdge = FlowchartElement["edges"][number];
export type ArrayElement = Extract<PackElement, { type: "array" }>;
export type ArrayFrame = NonNullable<ArrayElement["frames"]>[number];
export type CalltreeElement = Extract<PackElement, { type: "calltree" }>;
export type CallNode = CalltreeElement["calls"][number];
export type CodediffElement = Extract<PackElement, { type: "codediff" }>;
export interface Box { id: string; x: number; y: number; w: number; h: number }

/* ---------- recording a program: instrumentation that keeps the author's line numbers ---------- */

/**
 * MicroPython's frames have no locals, report a `while` test only on the first pass and a `for` line twice per turn, and
 * can't stop a runaway loop from the trace function. So the program is rewritten first, keeping every line where it
 * is (`map` gives each new line its line in the author's code, 0 for added lines):
 * - each `def` gets a decorator that keeps the call's frame (its parameters, then each local as it is assigned, and
 *   what it returns), and its body starts by noting the parameters;
 * - a `for` notes its loop variables first in its body;
 * - a one-line `while cond:` becomes `while True:` with `if not (cond): break` first in its body, on the same line
 *   number, so every test of the condition is a step;
 * - every loop and function body, and the program, ends with a tick: MicroPython files a loop's jump back (and a
 *   function's own return) under the block's last line, which would light a line that never ran; and a program that
 *   runs too long stops.
 */
export function instrument(code: string): { src: string; map: number[] } {
  const lines = code.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
  const out: string[] = [];
  const map: number[] = [0];
  const emit = (s: string, l: number): void => { out.push(s); map.push(l); };
  const indentOf = (s: string): number => /^ */.exec(s)![0].length;
  const isCode = (s: string | undefined): boolean => s !== undefined && /\S/.test(s) && !/^\s*#/.test(s);
  const nextCode = (from: number): number => { let k = from; while (k < lines.length && !isCode(lines[k])) k++; return k; };
  const defs: { indent: number; skip: Set<string> }[] = [];
  const blocks: { indent: number; body: number }[] = [];
  const close = (ind: number): void => {
    while (blocks.length && ind <= blocks[blocks.length - 1]!.indent) emit(`${" ".repeat(blocks.pop()!.body)}_ls_tick()`, 0);
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const ind = indentOf(line);
    if (isCode(line)) {
      while (defs.length && ind <= defs[defs.length - 1]!.indent) defs.pop();
      close(ind);
    }
    // The statement runs on while brackets or a triple-quoted string stay open, or a line ends in a backslash.
    const st = { depth: 0, quote: "" };
    let j = i;
    scan(lines[j]!, st);
    while (j + 1 < lines.length && (st.depth > 0 || st.quote || /\\$/.test(lines[j]!))) scan(lines[++j]!, st);
    const stmt = lines.slice(i, j + 1).join("\n");
    const head = codePart(stmt).trim();
    const body = (): number => { const k = nextCode(j + 1); return k < lines.length && indentOf(lines[k]!) > ind ? indentOf(lines[k]!) : -1; };
    const pad = (n: number): string => " ".repeat(n);
    const def = /^def\s+[A-Za-z_]\w*\s*\(([\s\S]*)\)\s*(?:->[\s\S]*)?:$/.exec(head);
    const loop = /^(for|while)\b[\s\S]*:$/.exec(head);
    if (def) {
      const params = paramNames(def[1]!);
      emit(`${pad(ind)}@_ls_fn(${JSON.stringify(params)})`, i + 1);
      for (let k = i; k <= j; k++) emit(lines[k]!, k + 1);
      const b = body();
      if (b >= 0 && params.length) emit(`${pad(b)}_ls_set(${pyDict(params)})`, 0);
      defs.push({ indent: ind, skip: new Set() });
      if (b >= 0) blocks.push({ indent: ind, body: b });
    } else if (loop) {
      const b = body();
      const cond = loop[1] === "while" && i === j ? /^while\s+([\s\S]+):$/.exec(head)?.[1] : undefined;
      // A while with an else keeps its own test (else runs when the test fails, never after a break).
      const k = b >= 0 ? nextCode(j + 1 + linesIn(lines, j + 1, ind)) : lines.length;
      const hasElse = k < lines.length && indentOf(lines[k]!) === ind && /^\s*else\s*:/.test(lines[k]!);
      if (cond && b >= 0 && !hasElse) {
        emit(`${pad(ind)}while True:`, i + 1);
        emit(`${pad(b)}if not (${cond}): break`, i + 1);
      } else for (let q = i; q <= j; q++) emit(lines[q]!, q + 1);
      if (b >= 0) {
        blocks.push({ indent: ind, body: b });
        const top = defs[defs.length - 1];
        if (top && loop[1] === "for") {
          const names = forNames(head).filter((n) => !top.skip.has(n));
          if (names.length) emit(`${pad(b)}_ls_set(${pyDict(names)})`, 0);
        }
      }
    } else {
      for (let k = i; k <= j; k++) emit(lines[k]!, k + 1);
      const top = defs[defs.length - 1];
      if (top) {
        const g = /^(?:global|nonlocal)\s+(.+)$/.exec(head);
        if (g) for (const n of g[1]!.split(",")) top.skip.add(n.trim());
        const names = assigned(head).filter((n) => !top.skip.has(n));
        if (names.length) emit(`${pad(ind)}_ls_set(${pyDict(names)})`, 0);
      }
    }
    i = j + 1;
  }
  close(0);
  emit("_ls_tick()", 0);
  return { src: out.join("\n") + "\n", map };
}

/** How many lines after `from` belong to a block indented deeper than `ind` (blank lines and comments included). */
function linesIn(lines: string[], from: number, ind: number): number {
  let k = from;
  while (k < lines.length && (!/\S/.test(lines[k]!) || /^\s*#/.test(lines[k]!) || /^ */.exec(lines[k]!)![0].length > ind)) k++;
  return k - from;
}

/** Tracks open brackets and strings across one line of code. */
function scan(line: string, st: { depth: number; quote: string }): void {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (st.quote) {
      if (ch === "\\") i++;
      else if (line.startsWith(st.quote, i)) { i += st.quote.length - 1; st.quote = ""; }
      continue;
    }
    if (ch === "#") break;
    if (ch === "'" || ch === '"') { st.quote = line.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch; i += st.quote.length - 1; continue; }
    if ("([{".includes(ch)) st.depth++;
    else if (")]}".includes(ch)) st.depth--;
  }
  if (st.quote.length === 1) st.quote = "";
}

/** A statement without its comments (strings kept). */
function codePart(s: string): string {
  let out = "";
  for (const line of s.split("\n")) {
    let q = "";
    let k = 0;
    for (; k < line.length; k++) {
      const ch = line[k]!;
      if (q) { if (ch === "\\") k++; else if (line.startsWith(q, k)) { k += q.length - 1; q = ""; } continue; }
      if (ch === "#") break;
      if (ch === "'" || ch === '"') { q = line.startsWith(ch.repeat(3), k) ? ch.repeat(3) : ch; k += q.length - 1; }
    }
    out += (out ? "\n" : "") + line.slice(0, k).replace(/\s+$/, "");
  }
  return out;
}

const PY_WORDS = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
const pyDict = (names: string[]): string => `{${names.map((n) => `'${n}': ${n}`).join(", ")}}`;
const baseName = (t: string): string | undefined => {
  const m = /^[\s(*[]*([A-Za-z_]\w*)/.exec(t);
  return m && !PY_WORDS.has(m[1]!) ? m[1] : undefined;
};
/** Splits at commas outside brackets and strings. */
function topSplit(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q = "";
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; continue; }
    if (ch === "'" || ch === '"') q = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === sep && depth === 0) { out.push(s.slice(from, i)); from = i + 1; }
  }
  out.push(s.slice(from));
  return out;
}
/** Parameter names of a def: defaults, annotations, * and ** dropped (but *args and **kw keep their names). */
function paramNames(list: string): string[] {
  return topSplit(list, ",").map((p) => p.split("=")[0]!.split(":")[0]!.replace(/[*\s]/g, "")).filter((p) => /^[A-Za-z_]\w*$/.test(p));
}
/** The loop variables of a for header. */
function forNames(head: string): string[] {
  const m = /^for\s+([\s\S]+?)\s+in\s/.exec(head);
  return m ? topSplit(m[1]!.replace(/[()[\]]/g, ""), ",").map((t) => baseName(t)).filter((n): n is string => !!n) : [];
}
/** The names a simple statement assigns (a = …, a, b = …, a[i] = …, a += …, x: int = …). */
function assigned(stmt: string): string[] {
  const s = stmt.trim();
  const first = /^[A-Za-z_]\w*/.exec(s)?.[0];
  if (first && PY_WORDS.has(first) || s.startsWith("@")) return [];
  const cuts: number[] = [];
  let depth = 0;
  let q = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) { if (ch === "\\") i++; else if (s.startsWith(q, i)) { i += q.length - 1; q = ""; } continue; }
    if (ch === "'" || ch === '"') { q = s.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch; i += q.length - 1; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "=" && depth === 0) {
      if (s[i + 1] === "=") { i++; continue; }
      const prev = s[i - 1] ?? "";
      if ("=!:".includes(prev) || ((prev === "<" || prev === ">") && s[i - 2] !== prev)) continue;
      cuts.push(i);
    }
  }
  const names: string[] = [];
  let from = 0;
  for (const c of cuts) {
    const target = s.slice(from, c).replace(/(\*\*|\/\/|>>|<<|[-+*/%&|^@])$/, "").split(":")[0]!;
    for (const t of topSplit(target, ",")) { const n = baseName(t); if (n && !names.includes(n)) names.push(n); }
    from = c + 1;
  }
  return names;
}

/** The recorder inside MicroPython: the trace function, the frames, the captured print and input. */
const HARNESS = String.raw`
import sys, io, json
class _LsStop(BaseException):
    pass
_ls_ev = []
_ls_stack = []
_ls_calls = []
_ls_st = {'map': [], 'g': {}, 'ticks': 0, 'max': 20000, 'cap': 2000}
class _LsOut:
    def __init__(self):
        self.parts = []
        self.n = 0
    def write(self, s):
        if self.n < 4000:
            self.parts.append(s)
            self.n += len(s)
_ls_out = [_LsOut()]
def _ls_short(v):
    try:
        s = repr(v)
    except Exception:
        s = '?'
    if s[:1] == '<' and ' object at ' in s:
        s = '<' + type(v).__name__ + '>'
    return s if len(s) <= 40 else s[:37] + '...'
def _ls_vars(d):
    out = {}
    for k in d:
        v = d[k]
        if k[:1] == '_' or k in ('print', 'input') or callable(v) or type(v).__name__ == 'module':
            continue
        out[k] = _ls_short(v)
    return out
def _ls_tick():
    _ls_st['ticks'] += 1
    if _ls_st['ticks'] > _ls_st['max']:
        raise _LsStop()
def _ls_set(d):
    if _ls_stack:
        _ls_stack[-1][2].update(d)
def _ls_fn(params):
    def deco(f):
        name = f.__name__
        def w(*a, **k):
            _ls_tick()
            cid = len(_ls_calls)
            parent = _ls_stack[-1][0] if _ls_stack else -1
            label = name + '(' + ', '.join([_ls_short(x) for x in a] + [x + '=' + _ls_short(k[x]) for x in k]) + ')'
            d = {}
            for i in range(min(len(a), len(params))):
                d[params[i]] = a[i]
            d.update(k)
            _ls_calls.append([parent, label, name])
            _ls_stack.append([cid, name, d])
            _ls_ev.append(['c', cid] + _ls_snap())
            try:
                r = f(*a, **k)
            finally:
                _ls_stack.pop()
            _ls_ev.append(['r', cid, _ls_short(r)] + _ls_snap())
            return r
        return w
    return deco
def _ls_snap():
    return [_ls_vars(_ls_st['g']), [[f[0], _ls_vars(f[2])] for f in _ls_stack], _ls_out[0].n]
def _ls_tr(frame, event, arg):
    if frame.f_code.co_filename != 'main.py':
        return None
    if event == 'line' and len(_ls_ev) < _ls_st['cap']:
        n = frame.f_code.co_name
        if n[:1] == '<' and n != '<module>':
            return _ls_tr
        ln = frame.f_lineno
        m = _ls_st['map']
        L = m[ln] if ln < len(m) else 0
        if not L:
            if _ls_ev and _ls_ev[-1][0] != 'z':
                _ls_ev.append(['z'])
        else:
            top = _ls_stack[-1] if _ls_stack else None
            cid = top[0] if top is not None and top[1] == n else -1
            _ls_ev.append(['l', L, cid, len(_ls_stack)] + _ls_snap())
    return _ls_tr
def _ls_run(req):
    req = json.loads(req)
    del _ls_ev[:]
    del _ls_stack[:]
    del _ls_calls[:]
    _ls_out[0] = _LsOut()
    out = _ls_out[0]
    given = list(req.get('inputs') or [])
    def _print(*args, sep=' ', end='\n', file=None, flush=False):
        out.write(sep.join([str(x) for x in args]) + end)
    def _input(prompt=''):
        v = given.pop(0) if given else ''
        out.write(str(prompt) + v + '\n')
        return v
    g = {'__name__': '__main__', 'print': _print, 'input': _input, '_ls_fn': _ls_fn, '_ls_set': _ls_set, '_ls_tick': _ls_tick}
    _ls_st['g'] = g
    _ls_st['ticks'] = 0
    _ls_st['max'] = req.get('ticks') or 20000
    _ls_st['cap'] = req.get('cap') or 2000
    res = {'instrumented': True}
    try:
        code = compile(req['src'], 'main.py', 'exec')
        _ls_st['map'] = req['map']
    except SyntaxError:
        res['instrumented'] = False
        _ls_st['map'] = list(range(len(req['code'].split('\n')) + 2))
        try:
            code = compile(req['code'], 'main.py', 'exec')
        except SyntaxError as e:
            b = io.StringIO()
            sys.print_exception(e, b)
            res['error'] = b.getvalue().strip().split('\n')[-1]
            res['errLine'] = e.args[1][1] if len(e.args) > 1 and e.args[1] else 0
            res['ev'] = []
            res['calls'] = []
            res['final'] = [{}, [], 0]
            res['out'] = ''
            return json.dumps(res)
    sys.settrace(_ls_tr)
    try:
        exec(code, g)
    except _LsStop:
        res['stopped'] = True
    except BaseException as e:
        b = io.StringIO()
        sys.print_exception(e, b)
        lines = [l for l in b.getvalue().strip().split('\n') if '<stdin>' not in l]
        res['error'] = lines[-1] if lines else type(e).__name__
    sys.settrace(None)
    res['final'] = _ls_snap()
    res['ev'] = _ls_ev
    res['calls'] = _ls_calls
    res['out'] = ''.join(out.parts)
    g.clear()
    return json.dumps(res)
`;

type Snap = [Record<string, string>, [number, Record<string, string>][], number];
type Raw = ["l", number, number, number, ...Snap] | ["c", number, ...Snap] | ["r", number, string, ...Snap] | ["z"];
interface Reply { ev: Raw[]; calls: [number, string, string][]; final: Snap; out: string; error?: string; stopped?: boolean; instrumented: boolean }

/** What `recordTrace` gives: the steps, the output, the error, and every call (for a call tree). */
export interface Recorded {
  steps: TraceStep[];
  output: string;
  error?: string;
  /** Each call, in the order made: its label, the call it was made from (−1 for none) and what it returned. */
  calls: { label: string; parent: number; ret?: string }[];
  /** The run went on past `maxSteps` steps (or ran too long): the steps stop there. */
  cut?: boolean;
}

type MicroPython = { runPython(code: string): unknown; globals: { get(k: string): unknown; set(k: string, v: unknown): void } };
let python: Promise<MicroPython> | null = null;
let ready: MicroPython | null = null;
/** Node only: specifiers in variables keep bundlers (the studio, the functions) from following them. */
const nodeImport = (m: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ m);
function loadPython(): Promise<MicroPython> {
  return (python ??= (async () => {
    const proc = (globalThis as { process?: { argv: string[]; cwd(): string } }).process;
    if (!proc) throw new Error("recordTrace runs in Node, when a lesson is made");
    type Req = { resolve(id: string): string };
    const { createRequire } = (await nodeImport("node:module")) as { createRequire: (p: string) => Req };
    const { dirname, join } = (await nodeImport("node:path")) as { dirname: (p: string) => string; join: (...p: string[]) => string };
    const { pathToFileURL } = (await nodeImport("node:url")) as { pathToFileURL: (p: string) => { href: string } };
    const id = "@micropython/micropython-webassembly-pyscript/package.json";
    let pkg: string;
    try { pkg = createRequire(join(proc.cwd(), "package.json")).resolve(id); } catch { pkg = createRequire(import.meta.url).resolve(id); }
    const dir = dirname(pkg);
    // The loader starts its own REPL when its path contains process.argv[1]: hide that while importing.
    const argv1 = proc.argv[1];
    proc.argv[1] = "<lessonstudio>";
    const mod = (await nodeImport(pathToFileURL(join(dir, "micropython.mjs")).href).finally(() => { proc.argv[1] = argv1!; })) as { loadMicroPython: (o: unknown) => Promise<MicroPython> };
    const mp = await mod.loadMicroPython({ url: join(dir, "micropython-settrace.wasm"), heapsize: 4 * 1024 * 1024, linebuffer: true, stdout: () => {}, stderr: () => {} });
    mp.runPython(HARNESS);
    ready = mp;
    return mp;
  })());
}

/** Loads MicroPython once (Node only), so recordTraceSync can run programs at once. */
export async function preparePython(): Promise<void> {
  await loadPython();
}

/**
 * Runs a Python program in MicroPython and records it step by step (Node only). Each step is a line that ran, with
 * how things stood after it: the program's variables, the running function's own (with the call as written), how much
 * had been printed, and the value a `return` line gave back. When a call returns, a step goes back to the line that
 * made it, now with the result (Python Tutor does the same). Inputs answer `input()` in turn.
 */
export async function recordTrace(code: string, o: TraceOptions = {}): Promise<Recorded> {
  await loadPython();
  return recordTraceSync(code, o);
}
export interface TraceOptions {
  /** Answers to input(), in turn. */
  inputs?: string[];
  /** Steps kept (default 120): a short video can't show more. */
  maxSteps?: number;
}
/** recordTrace, once preparePython() has loaded MicroPython (for code that can't wait, like the storyboard bodies). */
export function recordTraceSync(code: string, o: TraceOptions = {}): Recorded {
  const mp = ready;
  if (!mp) throw new Error("recordTraceSync: call await preparePython() first");
  const { src, map } = instrument(code);
  mp.globals.set("_ls_req", JSON.stringify({ src, map, code, inputs: o.inputs ?? [] }));
  mp.runPython("_ls_res = _ls_run(_ls_req)");
  const r = JSON.parse(String(mp.globals.get("_ls_res"))) as Reply;
  return stepsOf(r, o.maxSteps ?? 120, code);
}

function stepsOf(r: Reply, maxSteps: number, code: string): Recorded {
  const calls = r.calls.map(([parent, label, name]) => ({ parent, label, name }));
  const depthOf = (cid: number): number => (cid < 0 ? 0 : depthOf(calls[cid]!.parent) + 1);
  const ev = r.ev;
  const snapAt = (k: number): Snap | undefined => {
    const e = ev[k]!;
    return (e[0] === "l" ? e.slice(4) : e[0] === "c" ? e.slice(2) : e[0] === "r" ? e.slice(3) : undefined) as Snap | undefined;
  };
  /** How things stand just after event k: the next event that knows, or the end. */
  const after = (k: number): Snap => { for (let q = k + 1; q < ev.length; q++) { const s = snapAt(q); if (s) return s; } return r.final; };
  const steps: TraceStep[] = [];
  const last = new Map<number, number>();
  const localsIn = (s: Snap, cid: number): Record<string, string> | undefined => s[1].find((f) => f[0] === cid)?.[1];
  const make = (line: number, cid: number, now: Snap, before: Snap, ret?: string): TraceStep => {
    const s: TraceStep = { line };
    const d = depthOf(cid);
    if (cid >= 0) { s.fn = calls[cid]!.name; s.call = calls[cid]!.label.slice(0, 40); }
    if (d) s.depth = d;
    s.vars = now[0];
    if (cid >= 0) s.locals = localsIn(now, cid) ?? localsIn(before, cid) ?? {};
    if (now[2]) s.out = now[2];
    if (ret !== undefined) s.ret = ret;
    return s;
  };
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]!;
    if (e[0] !== "l") continue;
    const [, line, cid] = e;
    const snap = snapAt(i)!;
    last.set(cid, line);
    const rets: [number, string, number][] = [];
    for (let j = i + 1; j < ev.length && ev[j]![0] !== "l"; j++) { const x = ev[j]!; if (x[0] === "r") rets.push([x[1], x[2], j]); }
    const step = make(line, cid, after(i), snap, rets.find((x) => x[0] === cid)?.[1]);
    // MicroPython reports some lines twice in a row (a for line, a rewritten while): one step, the later one.
    const p = ev[i - 1];
    if (p && p[0] === "l" && p[1] === line && p[2] === cid && steps.length) steps[steps.length - 1] = step;
    else steps.push(step);
    // Back in the line that made each call that returned, now with what it gave back.
    for (const [c, , at] of rets) {
      const par = calls[c]!.parent;
      const l = last.get(par);
      if (l !== undefined) steps.push(make(l, par, after(at), snap, rets.find((x) => x[0] === par && x[2] > at)?.[1]));
    }
  }
  let cut = !!r.stopped;
  if (steps.length > maxSteps) { steps.length = maxSteps; cut = true; }
  if (r.error && !cut && steps.length) steps[steps.length - 1]!.err = true;
  // Variables in a steady order: the step they first appear in, then where they first appear in the code.
  const pos = (n: string): number => { const m = new RegExp(`\\b${n}\\b`).exec(code); return m ? m.index : 1e9; };
  const ordered = (list: (Record<string, string> | undefined)[]): string[] => {
    const seen = new Map<string, number>();
    list.forEach((v, k) => { for (const n of Object.keys(v ?? {})) if (!seen.has(n)) seen.set(n, k); });
    return [...seen.keys()].sort((a, b) => seen.get(a)! - seen.get(b)! || pos(a) - pos(b));
  };
  const pick = (v: Record<string, string>, names: string[]): Record<string, string> => Object.fromEntries(names.filter((n) => n in v).map((n) => [n, v[n]!]));
  const gOrder = ordered(steps.map((s) => s.vars));
  const lOrder = new Map<string, string[]>();
  for (const s of steps) if (s.fn && !lOrder.has(s.fn)) lOrder.set(s.fn, ordered(steps.filter((x) => x.fn === s.fn).map((x) => x.locals)));
  for (const s of steps) {
    s.vars = pick(s.vars ?? {}, gOrder);
    if (s.locals) s.locals = pick(s.locals, lOrder.get(s.fn!) ?? []);
  }
  const upto = steps.reduce((a, s) => Math.max(a, s.out ?? 0), 0);
  const rec: Recorded = { steps, output: r.out.slice(0, cut ? upto : undefined), calls: calls.map((c, i) => {
    const ret = (ev.find((x) => x[0] === "r" && x[1] === i) as ["r", number, string] | undefined)?.[2];
    return { label: c.label, parent: c.parent, ...(ret !== undefined ? { ret } : {}) };
  }) };
  if (r.error) rec.error = r.error;
  if (cut) rec.cut = true;
  return rec;
}

/** A recorded run's calls as a call tree's (the first call is the root; calls outside it are left out). */
export function traceCalls(rec: Recorded, o: { root?: number; ret?: boolean } = {}): CallNode[] {
  const root = o.root ?? 0;
  const keep = new Map<number, number>();
  const out: CallNode[] = [];
  rec.calls.forEach((c, i) => {
    if (i !== root && !keep.has(c.parent)) return;
    keep.set(i, out.length);
    out.push({ label: c.label.slice(0, 24), ...(i !== root ? { parent: keep.get(c.parent)! } : {}), ...(o.ret !== false && c.ret !== undefined ? { ret: c.ret.slice(0, 16) } : {}) });
  });
  return out;
}

/* ---------- arrays: sorting and searching, frame by frame ---------- */

export type SortAlgorithm = "bubble" | "selection" | "insertion" | "merge" | "quick";
export const SORTS: SortAlgorithm[] = ["bubble", "selection", "insertion", "merge", "quick"];

const cmpNote = (a: number, b: number): string => `${a} ${a > b ? ">" : a < b ? "<" : "=="} ${b}`;

/**
 * Every comparison and every move of a sort, as array frames: the first frame is the list as given, the last has every
 * slot done. Each frame counts [comparisons, swaps] (moves, for merge sort) and says what is compared ("5 > 2").
 * Bubble marks the neighbours it compares; selection points i, j and min; insertion points i; merge shows lo, mid and
 * hi of the part it merges; quick marks the pivot and points i and j inside lo…hi.
 */
export function sortFrames(algorithm: SortAlgorithm, values: number[], langs: string[] = ["en", "ar"]): { frames: ArrayFrame[]; counters: Text[] } {
  const n = values.length;
  const order = values.map((_, i) => i);
  const v = (s: number): number => values[order[s]!]!;
  const frames: ArrayFrame[] = [];
  let cmp = 0;
  let moves = 0;
  const done = new Set<number>();
  const push = (f: ArrayFrame, moved = false): void => {
    frames.push({ ...(moved || !frames.length ? { order: [...order] } : {}), ...f, ...(done.size ? { done: [...done].sort((a, b) => a - b) } : {}), count: [cmp, moves] });
  };
  const swap = (a: number, b: number): void => { [order[a], order[b]] = [order[b]!, order[a]!]; moves++; };
  push({});
  switch (algorithm) {
    case "bubble":
      for (let pass = 0; pass < n - 1; pass++) {
        let swapped = false;
        for (let j = 0; j < n - 1 - pass; j++) {
          cmp++;
          const note = cmpNote(v(j), v(j + 1));
          push({ compare: [j, j + 1], note });
          if (v(j) > v(j + 1)) { swap(j, j + 1); swapped = true; push({ swap: [j, j + 1], note }, true); }
        }
        done.add(n - 1 - pass);
        if (!swapped) break;
      }
      break;
    case "selection":
      for (let i = 0; i < n - 1; i++) {
        let min = i;
        for (let j = i + 1; j < n; j++) {
          cmp++;
          push({ compare: [min, j], ptr: { i, j, min }, note: cmpNote(v(j), v(min)) });
          if (v(j) < v(min)) min = j;
        }
        if (min !== i) { swap(i, min); push({ swap: [i, min], ptr: { i, min }, note: `min = ${v(i)}` }, true); }
        done.add(i);
      }
      break;
    case "insertion":
      for (let i = 1; i < n; i++) {
        for (let j = i; j > 0; j--) {
          cmp++;
          const note = cmpNote(v(j - 1), v(j));
          push({ compare: [j - 1, j], ptr: { i }, note });
          if (v(j - 1) <= v(j)) break;
          swap(j - 1, j);
          push({ swap: [j - 1, j], ptr: { i }, note }, true);
        }
      }
      break;
    case "merge": {
      const sort = (lo: number, hi: number): void => {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1;
        sort(lo, mid);
        sort(mid + 1, hi);
        const left = order.slice(lo, mid + 1);
        const right = order.slice(mid + 1, hi + 1);
        const placed: number[] = [];
        let a = 0;
        let b = 0;
        while (a < left.length && b < right.length) {
          cmp++;
          const k = lo + placed.length;
          const x = values[left[a]!]!;
          const y = values[right[b]!]!;
          push({ compare: [k, k + left.length - a], lo, mid, hi, note: cmpNote(x, y) });
          if (x <= y) { placed.push(left[a++]!); continue; }
          placed.push(right[b++]!);
          order.splice(lo, hi - lo + 1, ...placed, ...left.slice(a), ...right.slice(b));
          moves++;
          push({ swap: [k], lo, mid, hi, note: cmpNote(x, y) }, true);
        }
      };
      sort(0, n - 1);
      break;
    }
    case "quick": {
      const sort = (lo: number, hi: number): void => {
        if (lo > hi) return;
        if (lo === hi) { done.add(lo); return; }
        let i = lo;
        for (let j = lo; j < hi; j++) {
          cmp++;
          push({ compare: [j, hi], pivot: hi, lo, hi, ptr: { i, j }, note: cmpNote(v(j), v(hi)) });
          if (v(j) < v(hi)) {
            if (i !== j) { swap(i, j); push({ swap: [i, j], pivot: hi, lo, hi, ptr: { i, j }, note: cmpNote(v(i), v(hi)) }, true); }
            i++;
          }
        }
        if (i !== hi) { swap(i, hi); push({ swap: [i, hi], pivot: i, lo, hi, note: `pivot = ${v(i)}` }, true); }
        done.add(i);
        sort(lo, i - 1);
        sort(i + 1, hi);
      };
      sort(0, n - 1);
      break;
    }
  }
  for (let s = 0; s < n; s++) done.add(s);
  push({});
  const moved = algorithm === "merge";
  return { frames, counters: [tx("comparisons", "المقارنات", langs), moved ? tx("moves", "النقلات", langs) : tx("swaps", "التبديلات", langs)] };
}

/**
 * A search, frame by frame. Linear looks at each slot in turn (pointer i); binary keeps lo…hi, looks at the middle,
 * then keeps the half where the target can be ("lo = mid + 1"). Values for a binary search must be sorted. Each frame
 * counts its comparisons; the last says what the search returns.
 */
export function searchFrames(kind: "linear" | "binary", values: number[], target: number, langs: string[] = ["en", "ar"]): { frames: ArrayFrame[]; counters: Text[]; found: number } {
  const frames: ArrayFrame[] = [];
  let cmp = 0;
  let found = -1;
  const counters = [tx("comparisons", "المقارنات", langs)];
  if (kind === "linear") {
    frames.push({ note: `target = ${target}`, count: [0] });
    for (let i = 0; i < values.length; i++) {
      cmp++;
      if (values[i] === target) { found = i; frames.push({ compare: [i], found: i, ptr: { i }, note: `a[${i}] == ${target}`, count: [cmp] }); break; }
      frames.push({ compare: [i], ptr: { i }, note: `a[${i}] = ${values[i]} != ${target}`, count: [cmp] });
    }
    frames.push({ ...(found >= 0 ? { found, ptr: { i: found } } : {}), note: `return ${found}`, count: [cmp] });
    return { frames, counters, found };
  }
  for (let i = 1; i < values.length; i++) if (values[i]! < values[i - 1]!) throw new Error("searchFrames: a binary search needs sorted values");
  let lo = 0;
  let hi = values.length - 1;
  frames.push({ lo, hi, note: `target = ${target}`, count: [0] });
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    cmp++;
    const v = values[mid]!;
    if (v === target) {
      frames.push({ lo, mid, hi, compare: [mid], note: `a[${mid}] = ${v} == ${target}`, count: [cmp] });
      found = mid;
      frames.push({ lo, mid, hi, found: mid, note: `return ${mid}`, count: [cmp] });
      return { frames, counters, found };
    }
    frames.push({ lo, mid, hi, compare: [mid], note: `a[${mid}] = ${v} ${v < target ? "<" : ">"} ${target}`, count: [cmp] });
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
    frames.push({ lo: Math.min(lo, values.length - 1), hi: Math.max(hi, 0), note: v < target ? "lo = mid + 1" : "hi = mid - 1", count: [cmp] });
  }
  frames.push({ note: "return -1", count: [cmp] });
  return { frames, counters, found };
}

/* ---------- call trees ---------- */

/** The run of a call tree, depth first: i + 1 when call i starts, −(i + 1) when it returns. */
export function callSteps(calls: readonly { parent?: number }[]): number[] {
  const out: number[] = [];
  const stack: number[] = [];
  calls.forEach((c, i) => {
    const p = i ? c.parent ?? 0 : -1;
    while (stack.length && stack[stack.length - 1] !== p) out.push(-(stack.pop()! + 1));
    out.push(i + 1);
    stack.push(i);
  });
  while (stack.length) out.push(-(stack.pop()! + 1));
  return out;
}

/**
 * The calls of a recursive function, in the order they are made, with what each returns: fib(n) (two calls each, down
 * to 1 and 0; `repeats` marks the calls worked out before), factorial(n) (a chain down to 1), hanoi(n) (each call
 * moves one disc; its badge says which move it is, 1 to 2ⁿ − 1, in the order the moves happen).
 */
export function callTree(fn: "fib" | "factorial" | "hanoi", n: number, o: { repeats?: boolean } = {}): { calls: CallNode[]; steps: number[] } {
  const calls: CallNode[] = [];
  const add = (label: string, parent: number): number => { calls.push({ label, ...(parent >= 0 ? { parent } : {}) }); return calls.length - 1; };
  if (fn === "fib") {
    const fib = (k: number, parent: number): number => {
      const me = add(`fib(${k})`, parent);
      const r = k < 2 ? k : fib(k - 1, me) + fib(k - 2, me);
      calls[me]!.ret = String(r);
      return r;
    };
    fib(n, -1);
    if (o.repeats) {
      const seen = new Set<string>();
      for (const c of calls) { if (seen.has(c.label)) c.tone = "accent2"; seen.add(c.label); }
    }
  } else if (fn === "factorial") {
    const fact = (k: number, parent: number): number => {
      const me = add(`factorial(${k})`, parent);
      const r = k <= 1 ? 1 : k * fact(k - 1, me);
      calls[me]!.ret = String(r);
      return r;
    };
    fact(n, -1);
  } else {
    let move = 0;
    const hanoi = (k: number, from: string, to: string, via: string, parent: number): void => {
      const me = add(`hanoi(${k},${from},${to})`, parent);
      if (k > 1) hanoi(k - 1, from, via, to, me);
      calls[me]!.ret = String(++move);
      if (k > 1) hanoi(k - 1, via, to, from, me);
    };
    hanoi(n, "A", "C", "B", -1);
  }
  return { calls, steps: callSteps(calls) };
}

/* ---------- elements ---------- */

export const traceLabels = (langs: string[] = ["en", "ar"]): { vars: Text; out: Text } => ({ vars: tx("Variables", "المتغيرات", langs), out: tx("Output", "المخرجات", langs) });
export const yesNo = (langs: string[] = ["en", "ar"]): { yes: Text; no: Text } => ({ yes: tx("Yes", "نعم", langs), no: tx("No", "لا", langs) });

/** A trace of a recorded run (recordTrace), with its panels' headings. */
export function traceElement(box: Box, code: string, rec: Pick<Recorded, "steps" | "output" | "error">, o: { langs?: string[]; lang?: "python" | "sql" | "plain"; size?: number } = {}): TraceElement {
  return {
    ...box, type: "trace", code: code.replace(/\n+$/, ""), steps: rec.steps, ...(o.lang && o.lang !== "python" ? { lang: o.lang } : {}),
    ...(rec.output ? { output: rec.output } : {}), ...(rec.error ? { error: rec.error } : {}), labels: traceLabels(o.langs), ...(o.size ? { size: o.size } : {}),
  };
}

/** An array of values, with the frames of a sort or a search and its counters (without counters, frames drop their counts). */
export function arrayElement(box: Box, values: (number | string)[], o: { frames?: ArrayFrame[]; counters?: Text[]; view?: "boxes" | "bars"; index?: boolean; size?: number } = {}): ArrayElement {
  const frames = o.frames && !o.counters?.length ? o.frames.map(({ count: _, ...f }) => f) : o.frames;
  return {
    ...box, type: "array", values, ...(frames ? { frames } : {}), ...(o.counters?.length ? { counters: o.counters } : {}),
    ...(o.view === "bars" ? { view: "bars" } : {}), ...(o.index ? { index: true } : {}), ...(o.size ? { size: o.size } : {}),
  };
}

/** A call tree with its run (one frame per call starting or returning). */
export function calltreeElement(box: Box, calls: CallNode[], o: { size?: number } = {}): CalltreeElement {
  return { ...box, type: "calltree", calls, steps: callSteps(calls), ...(o.size ? { size: o.size } : {}) };
}

/** A bug and its fix, with headings and (optionally) what each prints. */
export function codediffElement(box: Box, before: string, after: string, o: { langs?: string[]; output?: { before?: string; after?: string }; lang?: "python" | "sql" | "plain"; size?: number } = {}): CodediffElement {
  const langs = o.langs ?? ["en", "ar"];
  return {
    ...box, type: "codediff", before: before.replace(/\n+$/, ""), after: after.replace(/\n+$/, ""), ...(o.lang && o.lang !== "python" ? { lang: o.lang } : {}),
    labels: { before: tx("The bug", "الخطأ", langs), after: tx("The fix", "الإصلاح", langs) }, ...(o.output ? { output: o.output } : {}), ...(o.size ? { size: o.size } : {}),
  };
}

/** A flowchart from nodes and arrows (a decision's first arrow goes down, its second to the side), and a run through it. */
export function flowchart(box: Box, nodes: FlowNode[], edges: FlowEdge[], o: { path?: string[]; size?: number } = {}): FlowchartElement {
  return { ...box, type: "flowchart", nodes, edges, ...(o.path ? { path: o.path } : {}), ...(o.size ? { size: o.size } : {}) };
}
/** The `pass` value at which a flowchart's token reaches path[k]. */
export const passAt = (path: readonly unknown[], k: number): number => Math.round((k / Math.max(1, path.length - 1)) * 10000) / 10000;

/** The loop "count from 1 to 3" as a flowchart, with a run through it. */
export function loopChart(box: Box, langs: string[] = ["en", "ar"]): FlowchartElement {
  const { yes, no } = yesNo(langs);
  return flowchart(box, [
    { id: "start", kind: "start", label: tx("Start", "ابدأ", langs) },
    { id: "set", kind: "process", label: "count = 1" },
    { id: "test", kind: "decision", label: "count <= 3?" },
    { id: "show", kind: "io", label: "print(count)" },
    { id: "add", kind: "process", label: "count = count + 1" },
    { id: "end", kind: "end", label: tx("End", "النهاية", langs) },
  ], [
    { from: "start", to: "set" }, { from: "set", to: "test" }, { from: "test", to: "show", label: yes }, { from: "show", to: "add" },
    { from: "add", to: "test" }, { from: "test", to: "end", label: no },
  ], { path: ["start", "set", "test", "show", "add", "test", "show", "add", "test", "show", "add", "test", "end"] });
}

/* ---------- ready-made programs (recorded with recordTrace; a test keeps them in step) ---------- */

export const SUM_CODE = "marks = [7, 5, 9]\ntotal = 0\nfor m in marks:\n    total = total + m\nprint(total)";
export const SUM_RUN: Pick<Recorded, "steps" | "output"> = {
  steps: [
    { line: 1, vars: { marks: "[7, 5, 9]" } }, { line: 2, vars: { marks: "[7, 5, 9]", total: "0" } },
    { line: 3, vars: { marks: "[7, 5, 9]", total: "0", m: "7" } }, { line: 4, vars: { marks: "[7, 5, 9]", total: "7", m: "7" } },
    { line: 3, vars: { marks: "[7, 5, 9]", total: "7", m: "5" } }, { line: 4, vars: { marks: "[7, 5, 9]", total: "12", m: "5" } },
    { line: 3, vars: { marks: "[7, 5, 9]", total: "12", m: "9" } }, { line: 4, vars: { marks: "[7, 5, 9]", total: "21", m: "9" } },
    { line: 3, vars: { marks: "[7, 5, 9]", total: "21", m: "9" } }, { line: 5, vars: { marks: "[7, 5, 9]", total: "21", m: "9" }, out: 3 },
  ],
  output: "21\n",
};
export const AREA_CODE = "def area(w, h):\n    a = w * h\n    return a\n\nroom = area(4, 3)\nprint(room)";
export const AREA_RUN: Pick<Recorded, "steps" | "output"> = {
  steps: [
    { line: 1, vars: {} }, { line: 5, vars: {} },
    { line: 2, fn: "area", call: "area(4, 3)", depth: 1, vars: {}, locals: { w: "4", h: "3", a: "12" } },
    { line: 3, fn: "area", call: "area(4, 3)", depth: 1, vars: {}, locals: { w: "4", h: "3", a: "12" }, ret: "12" },
    { line: 5, vars: { room: "12" } }, { line: 6, vars: { room: "12" }, out: 3 },
  ],
  output: "12\n",
};
export const RANGE_BUG = { before: "total = 0\nfor i in range(1, 5):\n    total = total + i\nprint(total)", after: "total = 0\nfor i in range(1, 6):\n    total = total + i\nprint(total)", output: { before: "10", after: "15" } };

/** A sensible element of each type, for the studio's "Add a pack element". */
export function element(type: string, langs: string[] = ["en", "ar"], box: Partial<Box> = {}): Element {
  const b: Box = { id: box.id ?? type, x: box.x ?? 80, y: box.y ?? 160, w: box.w ?? 1120, h: box.h ?? 500 };
  switch (type) {
    case "trace": return traceElement(b, SUM_CODE, SUM_RUN, { langs });
    case "flowchart": return loopChart(b, langs);
    case "array": { const s = sortFrames("bubble", [4, 2, 5, 1, 3], langs); return arrayElement(b, [4, 2, 5, 1, 3], { frames: s.frames, counters: s.counters }); }
    case "calltree": return calltreeElement(b, callTree("factorial", 4).calls);
    case "codediff": return codediffElement(b, RANGE_BUG.before, RANGE_BUG.after, { langs, output: RANGE_BUG.output });
  }
  throw new Error(`The code pack has no element type "${type}"`);
}

/* ---------- gallery scenes ---------- */

interface Layout { head: { x: number; y: number; w: number }; body: { x: number; y: number; w: number; h: number } }
const LAYOUT: Record<Orient, Layout> = {
  landscape: { head: { x: 80, y: 48, w: 1120 }, body: { x: 80, y: 160, w: 1120, h: 520 } },
  portrait: { head: { x: 60, y: 90, w: 600 }, body: { x: 60, y: 280, w: 600, h: 900 } },
  square: { head: { x: 70, y: 60, w: 940 }, body: { x: 70, y: 200, w: 940, h: 800 } },
};
type Track = NonNullable<Element["anim"]>[number];

/** Gallery scenes for the studio: an id, a name per language, and a scene laid out for the stage's shape. */
export function presets(langs: string[] = ["en", "ar"], stage: Orient = "landscape"): { id: string; name: Text; scene: Scene }[] {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const L = LAYOUT[stage] ?? LAYOUT.landscape;
  const w = (en: string, ar: string, offset = 0): When => ({ word: T(en, ar), ...(offset ? { offset } : {}) });
  const head = (en: string, ar: string): Element => ({ id: "h", type: "text", ...L.head, size: stage === "portrait" ? 44 : 46, weight: 800, text: T(en, ar) });
  const body = (id: string, h = L.body.h): Box => ({ id, x: L.body.x, y: L.body.y + Math.round((L.body.h - h) / 2), w: L.body.w, h });
  const keys = (prop: Track["prop"], list: [When, number][], ease: "in-out" | "linear" | "step" = "in-out"): Track =>
    ({ prop, keys: list.map(([at, value], i) => ({ at, value, ...(i ? { ease } : {}) })) });
  const shown = (at: When): Track => keys("reveal", [[at, 0], [shiftWhen(at, 1), 1]], "linear");
  const scene = (id: string, narration: Text, ...elements: Element[]): Scene => ({ id, template: "canvas", narration: narration as Record<string, string>, content: { elements } });
  const anim = <E extends Element>(el: E, ...tracks: Track[]): E => ({ ...el, anim: tracks });

  const out: { id: string; name: Text; scene: Scene }[] = [];

  out.push({
    id: "trace-loop", name: T("Code, line by line", "الكود سطرًا بسطر"),
    scene: scene("trace-loop",
      T("Python runs one line at a time. First it makes the list of marks, and total starts at zero. Each time round the loop, m takes the next mark and total grows: seven, then twelve, then twenty-one. When the marks run out, it prints the total.",
        "ينفّذ بايثون سطرًا واحدًا في كل مرة. أولًا ينشئ قائمة الدرجات، ويبدأ المجموع total من الصفر. في كل دورة يأخذ m الدرجة التالية ويكبر المجموع: سبعة، ثم اثنا عشر، ثم واحد وعشرون. وعندما تنتهي الدرجات، يطبع المجموع."),
      head("Python runs one line at a time", "ينفّذ بايثون سطرًا في كل مرة"),
      anim(traceElement(body("code"), SUM_CODE, SUM_RUN, { langs }), shown(w("Python", "ينفذ")),
        keys("frame", [[w("list", "قائمة"), 0], [w("zero", "الصفر"), 1], [w("round", "دورة"), 2], [w("seven", "سبعة"), 3], [w("twelve", "عشر"), 5], [w("twenty-one", "وعشرون"), 7], [w("run", "تنتهي"), 8], [w("prints", "يطبع"), 9]]))),
  });

  out.push({
    id: "trace-function", name: T("A function call", "استدعاء دالة"),
    scene: scene("trace-function",
      T("First Python learns the function, without running it. Then line five calls area with four and three. Inside, w and h hold those values, and a becomes twelve. The return sends twelve back, so room is twelve, and the program prints it.",
        "يتعرّف بايثون أولًا على الدالة دون أن ينفّذها. ثم يستدعي السطر الخامس الدالة area بالعددين أربعة وثلاثة. في داخلها يحمل المتغيران w و h هاتين القيمتين، وتصبح a اثني عشر. ثم تُرجع return القيمة اثني عشر، فتصبح room اثني عشر، ويطبعها البرنامج."),
      head("A function gets its own variables", "للدالة متغيراتها الخاصة"),
      anim(traceElement(body("code"), AREA_CODE, AREA_RUN, { langs }), shown(w("First", "يتعرف")),
        keys("frame", [[w("learns", "يتعرف"), 0], [w("calls", "يستدعي"), 1], [w("Inside", "داخلها"), 2], [w("sends", "ترجع"), 3], [w("room", "room"), 4], [w("prints", "ويطبعها"), 5]]))),
  });

  {
    const ch = loopChart(body("flow"), langs);
    const p = ch.path!;
    out.push({
      id: "flowchart-loop", name: T("A loop as a flowchart", "حلقة في مخطط انسيابي"),
      scene: scene("flowchart-loop",
        T("The program starts by setting count to one. Is count at most three? Yes, so it prints count, then adds one. Round it goes for two and three. When count reaches four, the answer is no, and the program ends.",
          "يبدأ البرنامج بوضع count على واحد. هل count ثلاثة أو أقل؟ نعم، فيطبع count ثم يضيف إليه واحدًا. وهكذا يدور مع اثنين وثلاثة. وعندما يصل count إلى أربعة يكون الجواب لا، فينتهي البرنامج."),
        head("A loop, step by step", "حلقة تكرار، خطوة بخطوة"),
        anim(ch, keys("reveal", [[w("starts", "يبدأ"), 0], [w("setting", "بوضع"), 1]], "linear"),
          keys("pass", [[w("starts", "يبدأ"), 0], [w("setting", "بوضع"), passAt(p, 1)], [w("most", "أقل"), passAt(p, 2)], [w("prints", "فيطبع"), passAt(p, 3)], [w("adds", "يضيف"), passAt(p, 4)],
            [w("Round", "يدور"), passAt(p, 4)], [w("When", "وعندما"), passAt(p, 10)], [w("four", "أربعة"), passAt(p, 11)], [w("ends", "فينتهي"), 1]]))),
    });
  }

  {
    const vals = [4, 2, 5, 1, 3];
    const s = sortFrames("bubble", vals, langs);
    const pass1 = s.frames.findIndex((f) => f.done?.includes(vals.length - 1));
    out.push({
      id: "array-bubble", name: T("Bubble sort", "الترتيب الفقاعي"),
      scene: scene("array-bubble",
        T("Bubble sort compares neighbours and swaps them when they are in the wrong order. After one pass, the biggest number has bubbled to the end. Pass after pass, the list sorts itself, and the counters show the work it took.",
          "يقارن الترتيب الفقاعي كل عددين متجاورين، ويبدّلهما إذا كانا في ترتيب خاطئ. بعد جولة واحدة يصل أكبر عدد إلى النهاية. وجولة بعد جولة يترتب الكل، ويُظهر العدّادان مقدار العمل."),
        head("Bubble sort: swap the neighbours", "الترتيب الفقاعي: بدّل الجارين"),
        anim(arrayElement(body("arr", Math.min(L.body.h, 380)), vals, { frames: s.frames, counters: s.counters, index: true }), shown(w("Bubble", "يقارن")),
          keys("frame", [[w("compares", "يقارن"), 0], [w("end", "النهاية"), pass1], [w("counters", "العدادان"), s.frames.length - 1]], "linear"))),
    });
  }

  {
    const vals = [3, 8, 12, 17, 23, 31, 40];
    const s = searchFrames("binary", vals, 23, langs);
    out.push({
      id: "array-binary", name: T("Binary search", "البحث الثنائي"),
      scene: scene("array-binary",
        T("To find 23, binary search looks at the middle first. 17 is too small, so the whole left half goes. In what is left, the middle is 31: too big, so the right part goes. Now the middle is 23. Found in three looks, not seven.",
          "للبحث عن 23، ينظر البحث الثنائي إلى المنتصف أولًا. العدد 17 أصغر من المطلوب، فيُستبعد النصف الأيسر كله. وفي الباقي، المنتصف هو 31: أكبر من المطلوب، فيُستبعد الجزء الأيمن. والآن المنتصف هو 23. وجدناه في ثلاث نظرات بدلًا من سبع."),
        head("Binary search halves the list", "البحث الثنائي يقسم القائمة نصفين"),
        anim(arrayElement(body("arr", Math.min(L.body.h, 400)), vals, { frames: s.frames, counters: s.counters, index: true }), shown(w("find", "للبحث")),
          keys("frame", [[w("find", "للبحث"), 0], [w("middle", "المنتصف"), 1], [w("goes", "فيستبعد"), 2], [w("31", "31"), 3], [w("big", "أكبر"), 4], [w("Now", "والآن"), 5], [w("Found", "وجدناه"), 6]]))),
    });
  }

  {
    const t = callTree("fib", stage === "portrait" ? 3 : 4, { repeats: true });
    const again = t.calls.findIndex((c) => c.tone);
    out.push({
      id: "calltree-fib", name: T("Recursion: Fibonacci", "الاستدعاء الذاتي: فيبوناتشي"),
      scene: scene("calltree-fib",
        T("To work out a Fibonacci number, the function calls itself twice, for the two numbers before it. Those calls make calls of their own, down to one and zero. Then the answers come back up and add together. Notice that the same call is worked out more than once.",
          "لحساب عدد من أعداد فيبوناتشي، تستدعي الدالة نفسها مرتين، للعددين اللذين قبله. وكل استدعاء منهما يولّد استدعاءات أخرى، حتى نصل إلى واحد وصفر. ثم تعود الإجابات إلى الأعلى وتُجمع. لاحظ أن الاستدعاء نفسه يُحسب أكثر من مرة."),
        head("Each call makes two more", "كل استدعاء يولّد استدعاءين"),
        anim(calltreeElement(body("tree"), t.calls), keys("frame", [[w("calls", "تستدعي"), 0], [w("together", "وتجمع"), t.steps.length - 1]], "linear"),
          keys("focus", [[w("Notice", "لاحظ"), again + 1]], "step"))),
    });
  }

  {
    const t = callTree("factorial", 4);
    out.push({
      id: "calltree-factorial", name: T("Recursion: factorial", "الاستدعاء الذاتي: المضروب"),
      scene: scene("calltree-factorial",
        T("Factorial of four needs factorial of three, which needs the one below it, all the way down to one. One is the base case: it answers straight away. Then each call multiplies on the way back up: two, six, twenty-four.",
          "مضروب أربعة يحتاج إلى مضروب ثلاثة، الذي يحتاج إلى ما دونه، وهكذا حتى نصل إلى واحد. الواحد هو الحالة الأساسية: يجيب فورًا. ثم يضرب كل استدعاء في طريق العودة إلى الأعلى: اثنان، ستة، أربعة وعشرون."),
        head("Down to the base case, and back up", "نزولًا إلى الحالة الأساسية ثم صعودًا"),
        anim(calltreeElement(body("tree"), t.calls), keys("frame", [[w("Factorial", "مضروب"), 0], [w("one", "واحد"), 3], [w("straight", "فورا"), 4], [w("two", "اثنان"), 5], [w("six", "ستة"), 6], [w("twenty-four", "وعشرون"), 7]]))),
    });
  }

  out.push({
    id: "codediff-range", name: T("A bug and its fix", "خطأ وإصلاحه"),
    scene: scene("codediff-range",
      T("We want to add the numbers from one to five, but the program prints ten. The bug is in the range: it stops before its end, so five is never added. The fix is to end the range at six. Now it prints fifteen.",
        "نريد أن نجمع الأعداد من واحد إلى خمسة، لكن البرنامج يطبع عشرة. الخطأ في range: فهي تتوقف قبل نهايتها، فلا يُضاف العدد خمسة أبدًا. والإصلاح أن ننهي range عند ستة. الآن يطبع خمسة عشر."),
      head("Off by one", "خطأ بفارق واحد"),
      anim(codediffElement(body("diff", Math.min(L.body.h, 470)), RANGE_BUG.before, RANGE_BUG.after, { langs, output: RANGE_BUG.output }), shown(w("We", "نريد")),
        keys("focus", [[w("range", "range"), 2]], "step"), keys("frame", [[w("fix", "والإصلاح"), 0], [w("fix", "والإصلاح", 1), 1]]))),
  });
  return out;
}

const shiftWhen = (at: When, o: number): When => (typeof at === "number" ? at + o : { ...at, offset: Math.round(((at.offset ?? 0) + o) * 1000) / 1000 });
