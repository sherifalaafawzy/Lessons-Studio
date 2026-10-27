/** Tiny DOM helpers. Package text only ever goes in through text nodes, never as HTML. */

type Kid = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined> | null;

function fill(el: Element, attrs: Attrs, kids: Kid[]): void {
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      el.setAttribute(k === "className" ? "class" : k, v === true ? "" : String(v));
    }
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k);
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  fill(el, attrs ?? null, kids);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag: string, attrs?: Attrs, ...kids: Kid[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  fill(el, attrs ?? null, kids);
  return el;
}

// Latin words, links and codes inside right-to-left text, e.g. "Prompt injection", "salary-help.example/verify", "PIN".
const LATIN_RUN = /[A-Za-z][A-Za-z0-9._\-/:@#'’]*(?:\s+[A-Za-z0-9][A-Za-z0-9._\-/:@#'’]*)*/g;

/**
 * Text for the stage. In right-to-left text each Latin run is isolated in <bdi>, so mixed
 * Arabic and English ("حقن الأوامر (Prompt injection)") keeps its word order.
 */
export function rich(s: string, rtl: boolean): Node[] {
  if (!rtl || !/[A-Za-z]/.test(s)) return [document.createTextNode(s)];
  const out: Node[] = [];
  let last = 0;
  for (const m of s.matchAll(LATIN_RUN)) {
    if (m.index! > last) out.push(document.createTextNode(s.slice(last, m.index)));
    out.push(h("bdi", null, m[0]));
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push(document.createTextNode(s.slice(last)));
  return out;
}

/** Splits text into units for word-by-word motion. A Latin run in right-to-left text stays one unit. */
export function units(s: string, rtl: boolean): Node[][] {
  const parts = rich(s, rtl);
  const out: Node[][] = [];
  for (const p of parts) {
    if (p.nodeType !== 3) { out.push([p]); continue; }
    for (const w of (p.textContent ?? "").split(/(\s+)/)) if (w) out.push([document.createTextNode(w)]);
  }
  return out;
}

/**
 * Writes inline styles and classes, skipping writes that wouldn't change anything.
 * The cache only saves work: what ends up on screen depends on the last call alone.
 */
export class Writer {
  private cache = new WeakMap<Element, Record<string, string>>();

  style(el: Element, prop: string, value: string): void {
    let c = this.cache.get(el);
    if (!c) this.cache.set(el, (c = {}));
    if (c[prop] === value) return;
    c[prop] = value;
    (el as HTMLElement).style.setProperty(prop, value);
  }

  attr(el: Element, name: string, value: string): void {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  cls(el: Element, name: string, on: boolean): void {
    if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
  }
}
