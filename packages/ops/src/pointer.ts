/** JSON Pointers (RFC 6901) inside a scene: "/content/title/en", "/cues/0", "/cues/-" (append). */

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

export function parsePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error(`A path must start with "/": ${path}`);
  return path.slice(1).split("/").map((p) => {
    const k = p.replace(/~1/g, "/").replace(/~0/g, "~");
    if (FORBIDDEN.has(k)) throw new Error(`Path part not allowed: ${k}`);
    return k;
  });
}

type Box = Record<string, unknown> | unknown[];
const isBox = (v: unknown): v is Box => typeof v === "object" && v !== null;

function parentOf(root: unknown, parts: string[]): { parent: Box; key: string } {
  if (!parts.length) throw new Error("The path can't be empty");
  let cur = root;
  for (const p of parts.slice(0, -1)) {
    if (!isBox(cur)) throw new Error(`No such path at "${p}"`);
    cur = Array.isArray(cur) ? cur[index(cur, p, false)] : (cur as Record<string, unknown>)[p];
  }
  if (!isBox(cur)) throw new Error("No such path");
  return { parent: cur, key: parts[parts.length - 1]! };
}

function index(arr: unknown[], p: string, append: boolean): number {
  if (append && p === "-") return arr.length;
  if (!/^(0|[1-9]\d*)$/.test(p)) throw new Error(`Not an array index: ${p}`);
  const i = Number(p);
  if (i > arr.length || (!append && i >= arr.length)) throw new Error(`Index out of range: ${p}`);
  return i;
}

export function getAt(root: unknown, path: string): unknown {
  let cur = root;
  for (const p of parsePointer(path)) {
    if (!isBox(cur)) return undefined;
    cur = Array.isArray(cur) ? cur[Number(p)] : (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Replaces (or adds) the value at a path. Arrays: the index must exist. */
export function setAt(root: unknown, path: string, value: unknown): void {
  const { parent, key } = parentOf(root, parsePointer(path));
  if (Array.isArray(parent)) parent[index(parent, key, false)] = value;
  else parent[key] = value;
}

/** Inserts into an array at an index, or appends with "-". On an object it adds a key that must not exist yet. */
export function insertAt(root: unknown, path: string, value: unknown): void {
  const { parent, key } = parentOf(root, parsePointer(path));
  if (Array.isArray(parent)) parent.splice(index(parent, key, true), 0, value);
  else if (key in parent) throw new Error(`Already set: ${path}`);
  else parent[key] = value;
}

export function removeAt(root: unknown, path: string): void {
  const { parent, key } = parentOf(root, parsePointer(path));
  if (Array.isArray(parent)) parent.splice(index(parent, key, false), 1);
  else if (!(key in parent)) throw new Error(`Nothing at ${path}`);
  else delete parent[key];
}
