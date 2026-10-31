/**
 * design.json bodies for the networks and the internet pack (docs/packs/network.md lists them): `topology`,
 * `sequence`, `layers` and `packet`, each from a ready-made preset or written out, and timed to sentences.
 */
import type { Element, Key, Text, When } from "../../../packages/spec/src/index.ts";
import {
  SEQUENCE_PRESETS, TOPOLOGY_PRESETS, encapsulationKeys, layersPreset, packetPreset, route, sequencePreset, sequenceReveal, topologyPreset,
  type LayersElement, type PacketElement, type SequenceElement, type SequencePreset, type TopologyElement, type TopologyPreset,
} from "../../../packages/ops/src/packs/network.ts";
import { shift } from "../../../packages/ops/src/presets.ts";
import type { AText, BodyBuilder, BodyCtx } from "./types.ts";

type Track = NonNullable<Element["anim"]>[number];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, what: string, c: BodyCtx, max = c.n - 1): number => {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > max) throw new Error(`${c.where}: ${what} must be a sentence number from 0 to ${max}, not ${JSON.stringify(v)}`);
  return v as number;
};
const list = <T>(v: unknown, what: string, c: BodyCtx): T[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${c.where}: ${what} must be a list`);
  return v as T[];
};
/** A text: the design's own ({ en, "ar-EG" }, or a string for both). */
const text = (v: unknown, what: string, c: BodyCtx): Text => c.T(v as AText, `${c.where} ${what}`);
/** The body's box: the whole width, a little taller than the headline leaves. */
const boxOf = (c: BodyCtx) => ({ x: c.box.x, y: c.box.y - 10, w: c.box.w, h: c.box.h + 30 });
/** Comes in over two seconds from sentence s. */
const reveal = (c: BodyCtx, s: number): Track => ({ prop: "reveal", keys: [{ at: c.at(s, 0.3), value: 0 }, { at: c.at(s, 2.3), value: 1, ease: "out" }] });
/** Lights the n-th part on each sentence given ({ "<key>": id or number, "s": k }). */
function focus(spec: unknown, key: string, index: (v: unknown) => number, c: BodyCtx): Track | undefined {
  const items = list<Obj>(spec, `${key} focus`, c);
  if (!items.length) return undefined;
  return { prop: "focus", keys: items.map((f) => ({ at: c.at(num(f.s, `focus ${key}`, c)), value: index(f[key]), ease: "step" as const })) };
}
/** Sentences, each moment a second after the last one on the same sentence. */
function moments(ss: number[], c: BodyCtx, gap = 1): When[] {
  const seen = new Map<number, number>();
  return ss.map((s) => { const k = seen.get(s) ?? 0; seen.set(s, k + 1); return c.at(s, 0.3 + k * gap); });
}

/* ---------- topology ---------- */

const topology: BodyBuilder = (spec, c) => {
  if (!isObj(spec)) throw new Error(`${c.where}: topology needs { preset } or { devices, links }`);
  let el: TopologyElement;
  if (spec.preset !== undefined) {
    if (!TOPOLOGY_PRESETS.includes(spec.preset as TopologyPreset)) throw new Error(`${c.where}: no topology preset "${spec.preset}" (${TOPOLOGY_PRESETS.join(", ")})`);
    el = topologyPreset(spec.preset as TopologyPreset, { id: "net", ...boxOf(c) }, c.langs);
  } else {
    const devices = list<Obj>(spec.devices, "topology devices", c);
    if (!devices.length) throw new Error(`${c.where}: topology needs devices`);
    el = {
      id: "net", ...boxOf(c), type: "topology",
      ...(spec.layout ? { layout: spec.layout as TopologyElement["layout"] } : {}),
      devices: devices.map((d) => ({
        id: String(d.id), kind: d.kind as TopologyElement["devices"][number]["kind"],
        ...(d.label !== undefined ? { label: text(d.label, `device ${d.id}`, c) } : {}),
        ...(d.note !== undefined ? { note: text(d.note, `device ${d.id} note`, c) } : {}),
        ...(typeof d.x === "number" && typeof d.y === "number" ? { x: d.x, y: d.y } : {}),
        ...(typeof d.range === "number" ? { range: d.range } : {}),
        ...(d.tone ? { tone: d.tone as never } : {}),
      })),
      // Links as [from, to] or [from, to, "wireless"], or objects.
      links: list<unknown>(spec.links, "topology links", c).map((l) => Array.isArray(l)
        ? { from: String(l[0]), to: String(l[1]), ...(l[2] ? { kind: l[2] as "wired" } : {}) }
        : { ...(l as TopologyElement["links"][number]) }),
      ...(spec.zones ? { zones: list<Obj>(spec.zones, "topology zones", c).map((z, i) => ({ devices: z.devices as string[], label: text(z.label, `zone ${i + 1}`, c) })) } : {}),
    };
  }
  // A link breaks after the k-th route: { "down": [{ "link": ["a", "b"], "after": 1 }] }.
  for (const d of list<Obj>(spec.down, "topology down", c)) {
    const [a, b] = d.link as string[];
    const l = el.links.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
    if (!l) throw new Error(`${c.where}: topology down names a link that isn't there: ${a}–${b}`);
    l.downAt = Number(d.after ?? 1);
  }
  // Routes: written out, or found from one device to another (the shortest way at that moment).
  if (spec.routes !== undefined) {
    el.routes = list<Obj>(spec.routes, "topology routes", c).map((r, k) => ({
      path: Array.isArray(r.path) ? (r.path as string[]) : route(el, String(r.from), String(r.to), { frame: k }),
      ...(r.label !== undefined ? { label: text(r.label, `route ${k + 1}`, c) } : {}),
      ...(r.tone ? { tone: r.tone as never } : {}),
    }));
  }
  const ids = el.devices.map((d) => d.id);
  const s0 = spec.s === undefined ? 0 : num(spec.s, "topology s", c);
  const tracks: Track[] = [reveal(c, s0)];
  const f = focus(spec.focus, "device", (v) => {
    const i = ids.indexOf(String(v));
    if (i < 0) throw new Error(`${c.where}: topology focus names a device that isn't there: ${v}`);
    return i + 1;
  }, c);
  if (f) tracks.push(f);
  // Route k travels on sentence play[k] (frame k → k + 1, about two seconds).
  const play = list<number>(spec.play, "topology play", c);
  if (play.length > (el.routes?.length ?? 0)) throw new Error(`${c.where}: topology play has ${play.length} sentences for ${el.routes?.length ?? 0} routes`);
  if (play.length) tracks.push({ prop: "frame", keys: moments(play.map((s) => num(s, "topology play", c)), c, 2.4).flatMap((w, k) => [{ at: w, value: k }, { at: shift(w, 2.1), value: k + 1, ease: "in-out" as const }]) });
  return [{ ...el, anim: tracks }];
};

/* ---------- sequence ---------- */

const sequence: BodyBuilder = (spec, c) => {
  if (!isObj(spec)) throw new Error(`${c.where}: sequence needs { preset } or { participants, messages }`);
  let el: SequenceElement;
  if (spec.preset !== undefined) {
    if (!SEQUENCE_PRESETS.includes(spec.preset as SequencePreset)) throw new Error(`${c.where}: no sequence preset "${spec.preset}" (${SEQUENCE_PRESETS.join(", ")})`);
    el = sequencePreset(spec.preset as SequencePreset, { id: "flow", ...boxOf(c) }, c.langs);
  } else {
    const ps = list<Obj>(spec.participants, "sequence participants", c);
    const ms = list<Obj>(spec.messages, "sequence messages", c);
    if (!ps.length || !ms.length) throw new Error(`${c.where}: sequence needs participants and messages`);
    el = {
      id: "flow", ...boxOf(c), type: "sequence",
      participants: ps.map((p) => ({ id: String(p.id), ...(p.glyph ? { glyph: p.glyph as never } : {}), label: text(p.label, `participant ${p.id}`, c) })),
      messages: ms.map((m, i) => ({
        from: String(m.from), to: String(m.to), label: text(m.text, `message ${i + 1}`, c),
        ...(m.reply ? { reply: true } : {}), ...(m.lock ? { lock: true } : {}), ...(m.tone ? { tone: m.tone as never } : {}),
      })),
      ...(spec.notes ? { notes: list<Obj>(spec.notes, "sequence notes", c).map((n, i) => ({ after: Number(n.after), over: n.over as string[], text: text(n.text, `note ${i + 1}`, c) })) } : {}),
    };
  }
  // The rows (messages and notes, in order) each on a sentence; without `rows`, spread over the scene.
  const n = el.messages.length + (el.notes?.length ?? 0);
  const s0 = spec.s === undefined ? 0 : num(spec.s, "sequence s", c);
  let rows = list<number>(spec.rows, "sequence rows", c).map((s) => num(s, "sequence rows", c));
  if (spec.rows !== undefined && rows.length !== n) throw new Error(`${c.where}: sequence rows needs ${n} sentences (each message and note), not ${rows.length}`);
  if (!rows.length) rows = Array.from({ length: n }, (_, k) => Math.min(c.n - 1, s0 + Math.floor(((k + 1) * (c.n - s0)) / (n + 1))));
  const tracks: Track[] = [{ prop: "reveal", keys: sequenceReveal(el, [c.at(s0, 0.2), ...moments(rows, c)]) }];
  const f = focus(spec.focus, "message", (v) => {
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > el.messages.length) throw new Error(`${c.where}: sequence focus message must be 1–${el.messages.length}`);
    return v as number;
  }, c);
  if (f) tracks.push(f);
  return [{ ...el, anim: tracks }];
};

/* ---------- layers ---------- */

const layers: BodyBuilder = (spec, c) => {
  if (!isObj(spec)) throw new Error(`${c.where}: layers needs { model }`);
  const model = (spec.model ?? "tcpip") as "tcpip" | "tcpip5" | "osi";
  if (!["tcpip", "tcpip5", "osi"].includes(model)) throw new Error(`${c.where}: layers model is tcpip, tcpip5 or osi, not ${model}`);
  const el: LayersElement = layersPreset(model, { id: "stack", ...boxOf(c) }, c.langs, spec.payload !== undefined ? text(spec.payload, "payload", c) : undefined);
  for (const k of ["sender", "receiver", "link"] as const) if (spec[k] !== undefined) el[k] = text(spec[k], k, c);
  if (spec.single) el.single = true;
  const L = el.layers.length;
  const s0 = spec.s === undefined ? 0 : num(spec.s, "layers s", c);
  const tracks: Track[] = [{ prop: "reveal", keys: [{ at: c.at(s0, 0.1), value: 0 }, { at: c.at(s0, 1.4), value: 1, ease: "out" }] }];
  const last = el.single ? L - 1 : 2 * L - 1;
  let keys: Key[] = [];
  if (spec.frames !== undefined) {
    // The whole trip over sentences [a, b].
    const [a, b] = list<number>(spec.frames, "layers frames", c);
    keys = [{ at: c.at(num(a, "layers frames", c)), value: 0 }, { at: c.at(Math.min(num(b, "layers frames", c) + 1, c.n - 1), num(b, "layers frames", c) + 1 > c.n - 1 ? 2.5 : 0), value: last, ease: "linear" }];
  } else if (spec.down !== undefined || spec.cross !== undefined || spec.up !== undefined) {
    // Each step on a sentence: down (one per header gained), cross (the link), up (one per header lost).
    const down = moments(list<number>(spec.down, "layers down", c).map((s) => num(s, "layers down", c)), c);
    const cross = spec.cross !== undefined ? c.at(num(spec.cross, "layers cross", c), 0.3) : undefined;
    const up = moments(list<number>(spec.up, "layers up", c).map((s) => num(s, "layers up", c)), c);
    keys = encapsulationKeys(L, { down, ...(cross ? { cross } : {}), up });
  }
  if (keys.length) tracks.push({ prop: "frame", keys });
  const f = focus(spec.focus, "layer", (v) => {
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > L) throw new Error(`${c.where}: layers focus layer must be 1–${L}`);
    return v as number;
  }, c);
  if (f) tracks.push(f);
  return [{ ...el, anim: tracks }];
};

/* ---------- packet ---------- */

const packet: BodyBuilder = (spec, c) => {
  if (!isObj(spec)) throw new Error(`${c.where}: packet needs { preset } or { fields }`);
  let el: PacketElement;
  if (spec.preset !== undefined) {
    if (spec.preset !== "https" && spec.preset !== "frame") throw new Error(`${c.where}: no packet preset "${spec.preset}" (https, frame)`);
    el = packetPreset(spec.preset, { id: "packet", ...boxOf(c) }, c.langs);
  } else {
    const fs = list<Obj>(spec.fields, "packet fields", c);
    if (!fs.length) throw new Error(`${c.where}: packet needs fields`);
    el = {
      id: "packet", ...boxOf(c), type: "packet",
      fields: fs.map((f, i) => ({
        name: text(f.name, `field ${i + 1}`, c), value: text(f.value, `field ${i + 1} value`, c),
        ...(f.size ? { size: String(f.size) } : {}), ...(f.secret ? { secret: true } : {}), ...(f.cipher ? { cipher: String(f.cipher) } : {}),
      })),
      ...(spec.groups ? { groups: list<Obj>(spec.groups, "packet groups", c).map((g, i) => ({ label: text(g.label, `group ${i + 1}`, c), span: Number(g.span), ...(g.tone ? { tone: g.tone as never } : {}) })) } : {}),
    };
  }
  if (spec.watch !== undefined) el.watch = !!spec.watch;
  const s0 = spec.s === undefined ? 0 : num(spec.s, "packet s", c);
  const tracks: Track[] = [{ prop: "reveal", keys: [{ at: c.at(s0, 0.3), value: 0 }, { at: c.at(s0, 1.8), value: 1, ease: "out" }] }];
  if (spec.encrypt !== undefined) {
    const s = num(spec.encrypt, "packet encrypt", c);
    tracks.push({ prop: "frame", keys: [{ at: c.at(s), value: 0 }, { at: c.at(s, 1.2), value: 1, ease: "in-out" }] });
  }
  const f = focus(spec.focus, "field", (v) => {
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > el.fields.length) throw new Error(`${c.where}: packet focus field must be 1–${el.fields.length}`);
    return v as number;
  }, c);
  if (f) tracks.push(f);
  return [{ ...el, anim: tracks }];
};

export const bodies: Record<string, BodyBuilder> = { topology, sequence, layers, packet };
