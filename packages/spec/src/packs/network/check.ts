/**
 * Validation of the networks and the internet pack's elements (topology, sequence, layers, packet). Limits keep them
 * light on old phones and readable on a 360 px screen.
 */
import type { Text } from "../../types.ts";
import type { PackCheck, PackCheckCtx } from "../types.ts";
import type { LayersElement, NetGlyph, PacketElement, SequenceElement, TopologyElement } from "./types.ts";

export const NET_DEVICES = ["phone", "laptop", "desktop", "router", "switch", "server", "cloud", "tower", "sensor", "gateway", "satellite"] as const;
export const NET_GLYPHS: readonly NetGlyph[] = [...NET_DEVICES, "user", "bot", "tool", "globe", "database", "browser", "eye", "lock", "shield"];
export const NET_LIMITS = { devices: 16, links: 30, routes: 8, hops: 12, zones: 4, participants: 6, messages: 14, notes: 6, layers: 7, fields: 10 };

const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
const LAYOUTS = ["star", "line", "tree", "mesh"];
const LINKS = ["wired", "wireless", "down"];

export const check: PackCheck = (el, q, c) => {
  const tone = (v: unknown, at: string): void => { if (v !== undefined && !c.tones.includes(v as string)) c.err("badTone", at); };
  if (el.size !== undefined && !(isNum(el.size) && el.size >= 16 && el.size <= 80)) c.err("badSize", `${q}.size`, "16–80 px");
  if (el.frame !== undefined && !(isNum(el.frame) && el.frame >= 0)) c.err("badFrame", `${q}.frame`, "a number from 0");
  switch (el.type) {
    case "topology": return topology(el as unknown as TopologyElement, q, c, tone);
    case "sequence": return sequence(el as unknown as SequenceElement, q, c, tone);
    case "layers": return layers(el as unknown as LayersElement, q, c, tone);
    case "packet": return packet(el as unknown as PacketElement, q, c, tone);
  }
};

type ToneCheck = (v: unknown, at: string) => void;

/** Ids: well formed and unique. Returns the set. */
function ids(list: { id?: unknown }[], q: string, c: PackCheckCtx): Set<string> {
  const seen = new Set<string>();
  list.forEach((x, j) => {
    if (typeof x.id !== "string" || !ITEM_ID.test(x.id)) c.err("badId", `${q}[${j}].id`, "1–40 letters, digits, - or _");
    else if (seen.has(x.id)) c.err("dupId", `${q}[${j}].id`, x.id);
    else seen.add(x.id);
  });
  return seen;
}

function topology(el: TopologyElement, q: string, c: PackCheckCtx, tone: ToneCheck): void {
  const devices = arr(el.devices);
  if (!devices.length || devices.length > NET_LIMITS.devices) c.err("badCount", `${q}.devices`, `1–${NET_LIMITS.devices}`);
  if (!devices.every(isObj)) return c.err("badDevice", `${q}.devices`, "each device is an object with an id and a kind");
  const known = ids(devices, `${q}.devices`, c);
  const w = el.w ?? 0;
  const h = el.h ?? 0;
  devices.forEach((d, j) => {
    const dq = `${q}.devices[${j}]`;
    if (!NET_GLYPHS.includes(d.kind)) c.err("badKind", `${dq}.kind`, `${String(d.kind)} is not a glyph (${NET_GLYPHS.join(", ")})`);
    c.text(d.label, `${dq}.label`, false);
    c.text(d.note, `${dq}.note`, false);
    tone(d.tone, `${dq}.tone`);
    if ((d.x === undefined) !== (d.y === undefined)) c.err("badPlace", dq, "x and y together");
    else if (d.x !== undefined && (!isNum(d.x) || !isNum(d.y) || d.x < 0 || d.x > w || d.y! < 0 || d.y! > h)) c.err("badPlace", dq, "inside the element's box");
    if (d.range !== undefined && !(isNum(d.range) && d.range >= 20 && d.range <= 800)) c.err("badRange", `${dq}.range`, "20–800 px");
    if (d.downAt !== undefined && !(isNum(d.downAt) && d.downAt >= 0)) c.err("badFrame", `${dq}.downAt`, "the frame it breaks at, from 0");
  });
  if (el.layout !== undefined && !LAYOUTS.includes(el.layout)) c.err("badLayout", `${q}.layout`, `${String(el.layout)}: star, line, tree or mesh`);

  const links = arr(el.links);
  if (!Array.isArray(el.links) || links.length > NET_LIMITS.links) c.err("badCount", `${q}.links`, `0–${NET_LIMITS.links}`);
  const pairs = new Map<string, { down: boolean; downAt?: number }>();
  const key = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  links.forEach((l, j) => {
    const lq = `${q}.links[${j}]`;
    if (!isObj(l) || !known.has(l.from) || !known.has(l.to) || l.from === l.to) return c.err("badLink", lq, "from and to must be two different devices of this element");
    if (l.kind !== undefined && !LINKS.includes(l.kind)) c.err("badLink", `${lq}.kind`, `${String(l.kind)}: wired, wireless or down`);
    if (l.downAt !== undefined && !(isNum(l.downAt) && l.downAt >= 0)) c.err("badFrame", `${lq}.downAt`, "the frame it breaks at, from 0");
    c.text(l.label, `${lq}.label`, false);
    const k = key(l.from, l.to);
    if (pairs.has(k)) c.warn("dupLink", lq, `${l.from} and ${l.to} are already linked`);
    pairs.set(k, { down: l.kind === "down", ...(l.downAt !== undefined ? { downAt: l.downAt } : {}) });
  });

  const routes = arr(el.routes);
  if (routes.length > NET_LIMITS.routes) c.err("badCount", `${q}.routes`, `at most ${NET_LIMITS.routes}`);
  const byId = new Map(devices.map((d) => [d.id, d]));
  routes.forEach((r, j) => {
    const rq = `${q}.routes[${j}]`;
    if (!isObj(r) || !Array.isArray(r.path) || r.path.length < 2 || r.path.length > NET_LIMITS.hops) return c.err("badRoute", rq, `2–${NET_LIMITS.hops} devices`);
    c.text(r.label, `${rq}.label`, false);
    tone(r.tone, `${rq}.tone`);
    r.path.forEach((id, k) => {
      if (!known.has(id)) return c.err("badRoute", `${rq}.path[${k}]`, `no device ${String(id)}`);
      const d = byId.get(id)!;
      // Route j travels from frame j to j + 1: a device or link broken by then is a mistake.
      if (d.down || (d.downAt !== undefined && d.downAt <= j)) c.warn("routeDown", `${rq}.path[${k}]`, `${id} is down when route ${j + 1} travels (frames ${j} to ${j + 1})`);
      if (k === 0) return;
      const prev = r.path[k - 1]!;
      const link = pairs.get(key(prev, id));
      if (!link) c.err("noLink", `${rq}.path[${k}]`, `no link between ${prev} and ${id}`);
      else if (link.down || (link.downAt !== undefined && link.downAt <= j)) c.warn("routeDown", `${rq}.path[${k}]`, `the link ${prev}–${id} is broken when route ${j + 1} travels (frames ${j} to ${j + 1})`);
    });
  });

  const zones = arr(el.zones);
  if (zones.length > NET_LIMITS.zones) c.err("badCount", `${q}.zones`, `at most ${NET_LIMITS.zones}`);
  const zoned = new Set<string>();
  zones.forEach((z, j) => {
    const zq = `${q}.zones[${j}]`;
    if (!isObj(z) || !Array.isArray(z.devices) || !z.devices.length) return c.err("badZone", zq, "a zone needs a list of devices and a label");
    for (const id of z.devices) {
      if (!known.has(id)) c.err("badZone", `${zq}.devices`, String(id));
      else if (zoned.has(id)) c.err("badZone", `${zq}.devices`, `${id} is in two zones`);
      zoned.add(id);
    }
    c.text(z.label, `${zq}.label`);
    tone(z.tone, `${zq}.tone`);
  });
}

function sequence(el: SequenceElement, q: string, c: PackCheckCtx, tone: ToneCheck): void {
  const ps = arr(el.participants);
  if (!ps.length || ps.length > NET_LIMITS.participants) c.err("badCount", `${q}.participants`, `1–${NET_LIMITS.participants}`);
  if (!ps.every(isObj)) return c.err("badParticipant", `${q}.participants`, "each participant is an object with an id and a label");
  const known = ids(ps, `${q}.participants`, c);
  ps.forEach((p, j) => {
    const pq = `${q}.participants[${j}]`;
    if (p.glyph !== undefined && !NET_GLYPHS.includes(p.glyph)) c.err("badKind", `${pq}.glyph`, `${String(p.glyph)} is not a glyph (${NET_GLYPHS.join(", ")})`);
    c.text(p.label, `${pq}.label`);
    tone(p.tone, `${pq}.tone`);
  });
  const ms = arr(el.messages);
  if (!ms.length || ms.length > NET_LIMITS.messages) c.err("badCount", `${q}.messages`, `1–${NET_LIMITS.messages}`);
  ms.forEach((m, j) => {
    const mq = `${q}.messages[${j}]`;
    if (!isObj(m) || !known.has(m.from) || !known.has(m.to)) return c.err("badMessage", mq, "from and to must be participants of this element");
    c.text(m.label, `${mq}.label`);
    tone(m.tone, `${mq}.tone`);
  });
  const notes = arr(el.notes);
  if (notes.length > NET_LIMITS.notes) c.err("badCount", `${q}.notes`, `at most ${NET_LIMITS.notes}`);
  notes.forEach((n, j) => {
    const nq = `${q}.notes[${j}]`;
    if (!isObj(n) || !Number.isInteger(n.after) || n.after < 0 || n.after > ms.length) return c.err("badNote", `${nq}.after`, `0–${ms.length}`);
    if (!Array.isArray(n.over) || n.over.length < 1 || n.over.length > 2 || !n.over.every((id) => known.has(id))) c.err("badNote", `${nq}.over`, "one or two participants");
    c.text(n.text, `${nq}.text`);
    tone(n.tone, `${nq}.tone`);
  });
  if (el.numbers !== undefined && typeof el.numbers !== "boolean") c.err("badFlag", `${q}.numbers`, "true or false");
  // Each row needs about two lines of text (a label over its arrow), the participants about three.
  const fs = el.size ?? 34;
  const need = fs * 3.3 + (ms.length + notes.length) * fs * 1.95;
  if (isNum(el.h) && need > el.h * 1.06) c.warn("tooTall", q, `${ms.length + notes.length} rows want about ${Math.round(need)} px of height at ${fs} px text; split the flow or make the box taller`);
}

function layers(el: LayersElement, q: string, c: PackCheckCtx, tone: ToneCheck): void {
  const ls = arr(el.layers);
  if (ls.length < 2 || ls.length > NET_LIMITS.layers) c.err("badCount", `${q}.layers`, `2–${NET_LIMITS.layers}`);
  ls.forEach((l, j) => {
    const lq = `${q}.layers[${j}]`;
    if (!isObj(l)) return c.err("badLayer", lq, "each layer is an object with a name");
    c.text(l.name, `${lq}.name`);
    c.text(l.header, `${lq}.header`, false);
    c.text(l.note, `${lq}.note`, false);
    tone(l.tone, `${lq}.tone`);
  });
  c.text(el.payload, `${q}.payload`);
  for (const k of ["sender", "receiver", "link"] as const) c.text(el[k] as Text | undefined, `${q}.${k}`, false);
  if (el.single !== undefined && typeof el.single !== "boolean") c.err("badFlag", `${q}.single`, "true or false");
  const last = el.single ? ls.length - 1 : 2 * ls.length - 1;
  if (isNum(el.frame) && el.frame > last) c.warn("badFrame", `${q}.frame`, `the trip ends at frame ${last}`);
}

function packet(el: PacketElement, q: string, c: PackCheckCtx, tone: ToneCheck): void {
  const fs = arr(el.fields);
  if (!fs.length || fs.length > NET_LIMITS.fields) c.err("badCount", `${q}.fields`, `1–${NET_LIMITS.fields}`);
  fs.forEach((f, j) => {
    const fq = `${q}.fields[${j}]`;
    if (!isObj(f)) return c.err("badField", fq, "each field is an object with a name and a value");
    c.text(f.name, `${fq}.name`);
    c.text(f.value, `${fq}.value`);
    if (f.size !== undefined && (typeof f.size !== "string" || f.size.length > 12)) c.err("badField", `${fq}.size`, "a short string, e.g. \"4 B\"");
    if (f.cipher !== undefined && (typeof f.cipher !== "string" || !f.cipher.length || f.cipher.length > 40)) c.err("badField", `${fq}.cipher`, "1–40 characters");
    if (f.secret !== undefined && typeof f.secret !== "boolean") c.err("badFlag", `${fq}.secret`, "true or false");
    tone(f.tone, `${fq}.tone`);
  });
  const groups = arr(el.groups);
  let n = 0;
  groups.forEach((g, j) => {
    const gq = `${q}.groups[${j}]`;
    if (!isObj(g) || !Number.isInteger(g.span) || g.span < 1) return c.err("badGroup", `${gq}.span`, "how many fields the group covers, from 1");
    n += g.span;
    c.text(g.label, `${gq}.label`);
    tone(g.tone, `${gq}.tone`);
  });
  if (groups.length && n !== fs.length) c.err("badGroup", `${q}.groups`, `the spans cover ${n} fields of ${fs.length}`);
  if (el.watch !== undefined && typeof el.watch !== "boolean") c.err("badFlag", `${q}.watch`, "true or false");
  if (isNum(el.frame) && el.frame > 1) c.warn("badFrame", `${q}.frame`, "0 (plain) to 1 (encrypted)");
}
