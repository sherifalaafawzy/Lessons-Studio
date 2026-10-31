/**
 * Networks and the internet pack: content computed when a lesson is made (never on the phone), and ready-made elements
 * and scenes with labels in English and Arabic: routes found hop by hop, the frames of a message going down and up
 * the protocol stack, sequence diagrams of DNS, HTTPS, HTTP, MQTT and an agent calling a tool, networks for a home, a
 * school, the path across the internet and a mesh of sensors, and packets as an eavesdropper sees them. Seeded, so the
 * same call always gives the same lesson.
 */
import type { Element, Key, Scene, Text, Tone, When } from "@lessonstudio/spec";
import { shift } from "../presets.ts";
import { rng, tx } from "../science.ts";

export type TopologyElement = Extract<Element, { type: "topology" }>;
export type SequenceElement = Extract<Element, { type: "sequence" }>;
export type LayersElement = Extract<Element, { type: "layers" }>;
export type PacketElement = Extract<Element, { type: "packet" }>;
type Track = NonNullable<Element["anim"]>[number];
export interface Box { id?: string; x: number; y: number; w: number; h: number }
export type Stage = "landscape" | "portrait" | "square";

const boxOf = (b: Box, id: string): { id: string; x: number; y: number; w: number; h: number } => ({ id: b.id ?? id, x: b.x, y: b.y, w: b.w, h: b.h });

/* ---------- routes ---------- */

/**
 * The shortest route between two devices (fewest hops, breadth first, links in their order), skipping broken links
 * and devices, and those broken by `frame`. Throws when there is none.
 */
export function route(el: TopologyElement, from: string, to: string, o: { frame?: number; avoid?: string[] } = {}): string[] {
  const broken = (x: { downAt?: number }): boolean => o.frame !== undefined && x.downAt !== undefined && o.frame >= x.downAt;
  const off = new Set([...(o.avoid ?? []), ...el.devices.filter((d) => d.down || broken(d)).map((d) => d.id)]);
  const next = new Map<string, string[]>(el.devices.map((d) => [d.id, []]));
  for (const l of el.links) {
    if (l.kind === "down" || broken(l)) continue;
    next.get(l.from)?.push(l.to);
    next.get(l.to)?.push(l.from);
  }
  const prev = new Map<string, string>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const m of next.get(n) ?? []) {
      if (seen.has(m) || (off.has(m) && m !== to)) continue;
      seen.add(m);
      prev.set(m, n);
      queue.push(m);
    }
  }
  if (!seen.has(to)) throw new Error(`route: no way from ${from} to ${to}`);
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]!)!);
  return path;
}

/* ---------- the protocol stack ---------- */

/**
 * The frames of a message's trip through `n` layers (or a layers element): `down[i]` at the sender's layer i (top
 * first), `cross` the link, `up[i]` at the receiver's layer i (top first), `last` the end of the trip.
 */
export function encapsulationFrames(layers: number | LayersElement): { down: number[]; cross: [number, number]; up: number[]; last: number } {
  const n = typeof layers === "number" ? layers : layers.layers.length;
  return { down: Array.from({ length: n }, (_, i) => i), cross: [n - 1, n], up: Array.from({ length: n }, (_, i) => 2 * n - 1 - i), last: 2 * n - 1 };
}

/**
 * Keyframes for a layers element's `frame`, each step on a spoken word: `down[k]` moves the message from the sender's
 * layer k to k + 1 (gaining that layer's header), `cross` takes it over the link, `up[k]` moves it one layer up the
 * receiver's stack (losing a header). Each move takes `move` seconds.
 */
export function encapsulationKeys(n: number, at: { down?: When[]; cross?: When; up?: When[] }, move = 0.7): Key[] {
  const keys: Key[] = [];
  const step = (w: When, a: number, b: number, d = move): void => { keys.push({ at: w, value: a }, { at: shift(w, d), value: b, ease: "in-out" }); };
  (at.down ?? []).slice(0, n - 1).forEach((w, k) => step(w, k, k + 1));
  if (at.cross !== undefined) step(at.cross, n - 1, n, 1.4);
  (at.up ?? []).slice(0, n - 1).forEach((w, k) => step(w, n + k, n + k + 1));
  return keys;
}

type LayerModel = "tcpip" | "tcpip5" | "osi";

/** A protocol stack ready to draw: TCP/IP in four or five layers, or OSI's seven, with the sender's message. */
export function layersPreset(model: LayerModel, box: Box, langs: string[] = ["en", "ar"], payload?: Text): LayersElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  type Row = [en: string, ar: string, header?: string, noteEn?: string, noteAr?: string];
  const app: Row = ["Application", "التطبيقات", "HTTP", "the message", "الرسالة"];
  const transport: Row = ["Transport", "النقل", "TCP", "ports", "المنافذ"];
  const rows: Row[] = model === "tcpip"
    ? [app, transport, ["Internet", "الإنترنت", "IP", "addresses", "العناوين"], ["Link", "الربط", "Wi-Fi", "the next hop", "القفزة التالية"]]
    : model === "tcpip5"
      ? [app, transport, ["Network", "الشبكة", "IP", "addresses", "العناوين"], ["Data link", "ربط البيانات", "MAC", "the next hop", "القفزة التالية"], ["Physical", "المادية", undefined, "bits, as light or radio", "بتات، ضوءًا أو موجات"]]
      : [app, ["Presentation", "العرض", undefined, "formats", "الصيغ"], ["Session", "الجلسة", undefined, "the conversation", "المحادثة"],
        transport, ["Network", "الشبكة", "IP", "addresses", "العناوين"], ["Data link", "ربط البيانات", "MAC", "the next hop", "القفزة التالية"], ["Physical", "المادية", undefined, "bits", "البتات"]];
  return {
    ...boxOf(box, "stack"), type: "layers",
    layers: rows.map(([en, ar, header, ne, na]) => ({ name: T(en, ar), ...(header ? { header } : {}), ...(ne ? { note: T(ne, na!) } : {}) })),
    payload: payload ?? T("Hello!", "مرحبًا!"),
    sender: T("Your phone", "هاتفك"), receiver: T("The server", "الخادم"), link: T("Wi-Fi and cables", "الواي فاي والكابلات"),
  };
}

/* ---------- sequence diagrams ---------- */

type P = [id: string, glyph: SequenceElement["participants"][number]["glyph"], en: string, ar: string];
type M = [from: string, to: string, en: string, ar: string, opts?: { reply?: boolean; lock?: boolean; tone?: Tone }];
function seq(box: Box, langs: string[], ps: P[], ms: M[], notes: [after: number, over: string[], en: string, ar: string][] = []): SequenceElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  return {
    ...boxOf(box, "flow"), type: "sequence",
    participants: ps.map(([id, glyph, en, ar]) => ({ id, ...(glyph ? { glyph } : {}), label: T(en, ar) })),
    messages: ms.map(([from, to, en, ar, o]) => ({ from, to, label: T(en, ar), ...(o?.reply ? { reply: true } : {}), ...(o?.lock ? { lock: true } : {}), ...(o?.tone ? { tone: o.tone } : {}) })),
    ...(notes.length ? { notes: notes.map(([after, over, en, ar]) => ({ after, over, text: T(en, ar) })) } : {}),
  };
}

/** A DNS lookup: the phone asks a resolver, the resolver asks the name servers, the address comes back and is kept. */
export const dnsLookup = (box: Box, langs: string[] = ["en", "ar"], name = "school.example", ip = "203.0.113.10"): SequenceElement => seq(box, langs,
  [["phone", "phone", "Your phone", "هاتفك"], ["dns", "server", "DNS resolver", "محلّل الأسماء"], ["ns", "globe", "Name servers", "خوادم الأسماء"], ["site", "server", "The website", "الموقع"]],
  [
    ["phone", "dns", `Where is ${name}?`, `أين ${name}؟`],
    ["dns", "ns", `Who has ${name}?`, `من يعرف ${name}؟`],
    ["ns", "dns", ip, ip, { reply: true }],
    ["dns", "phone", ip, ip, { reply: true }],
    ["phone", "site", `Page, please (to ${ip})`, `الصفحة من فضلك (إلى ${ip})`],
  ],
  [[4, ["phone"], "Kept for next time", "يحفظه للمرة القادمة"]]);

/** HTTPS starting: hello, the certificate and key shares, then everything locked; someone on the same Wi-Fi watches. */
export const tlsHandshake = (box: Box, langs: string[] = ["en", "ar"]): SequenceElement => seq(box, langs,
  [["you", "browser", "Your browser", "متصفحك"], ["spy", "eye", "On the same Wi-Fi", "على الشبكة نفسها"], ["site", "server", "grades.example", "grades.example"]],
  [
    ["you", "site", "Hello! Let's talk safely", "مرحبًا! لنتحدث بأمان"],
    ["site", "you", "Certificate and key share", "الشهادة وجزء المفتاح", { reply: true }],
    ["you", "site", "My key share", "جزء مفتاحي"],
    ["you", "site", "Show my grades", "أرني درجاتي", { lock: true, tone: "ok" }],
    ["site", "you", "Your grades", "درجاتك", { reply: true, lock: true, tone: "ok" }],
  ],
  [[2, ["you"], "Checks the certificate", "يتحقق من الشهادة"]]);

/** A web page: a request and its answer, then one more for a picture on it. */
export const httpRequest = (box: Box, langs: string[] = ["en", "ar"]): SequenceElement => seq(box, langs,
  [["you", "browser", "Your browser", "متصفحك"], ["site", "server", "The web server", "خادم الويب"]],
  [
    ["you", "site", "GET /timetable", "GET /timetable"],
    ["site", "you", "200 OK + the page", "200 OK + الصفحة", { reply: true }],
    ["you", "site", "GET /logo.png", "GET /logo.png"],
    ["site", "you", "200 OK + the picture", "200 OK + الصورة", { reply: true }],
  ],
  [[4, ["you", "site"], "Every page is many requests", "كل صفحة طلبات كثيرة"]]);

/** MQTT: the app subscribes to a topic, the sensor publishes, the broker passes each reading on. */
export const mqttPubSub = (box: Box, langs: string[] = ["en", "ar"], topic = "school/room1/temp"): SequenceElement => seq(box, langs,
  [["sensor", "sensor", "Classroom sensor", "مستشعر الصف"], ["broker", "server", "Broker", "الوسيط"], ["app", "phone", "Teacher's app", "تطبيق المعلم"]],
  [
    ["app", "broker", `Subscribe: ${topic}`, `اشترك: ${topic}`],
    ["sensor", "broker", `Publish: ${topic} = 24 °C`, `انشر: ${topic} = 24 °C`],
    ["broker", "app", `${topic} = 24 °C`, `${topic} = 24 °C`],
    ["sensor", "broker", "Publish: 31 °C", "انشر: 31 °C"],
    ["broker", "app", "31 °C: too hot!", "31 °C: حار جدًا!", { tone: "danger" }],
  ],
  [[3, ["broker"], "Sends it to every subscriber", "يرسلها إلى كل مشترك"]]);

/** An AI agent asks before it acts: the teacher's request, the agent's question, her yes, the tool call, the result. */
export const agentToolCall = (box: Box, langs: string[] = ["en", "ar"]): SequenceElement => seq(box, langs,
  [["user", "user", "Teacher", "المعلّمة"], ["agent", "bot", "AI agent", "الوكيل الذكي"], ["tool", "tool", "Booking tool", "أداة الحجز"]],
  [
    ["user", "agent", "Book the lab for Tuesday", "احجز المختبر يوم الثلاثاء"],
    ["agent", "user", "Lab 2, Tue 10:00. Shall I?", "المختبر 2، الثلاثاء 10:00. أحجزه؟", { tone: "accent" }],
    ["user", "agent", "Yes, go ahead", "نعم، تفضّل", { reply: true, tone: "ok" }],
    ["agent", "tool", "book(lab2, Tue 10:00)", "book(lab2, Tue 10:00)"],
    ["tool", "agent", "Booked", "تم الحجز", { reply: true }],
    ["agent", "user", "Done: Lab 2 is yours", "تم: المختبر 2 لكِ", { reply: true }],
  ]);

export type SequencePreset = "dns" | "tls" | "http" | "mqtt" | "agent";
export const SEQUENCE_PRESETS: SequencePreset[] = ["dns", "tls", "http", "mqtt", "agent"];
export function sequencePreset(name: SequencePreset, box: Box, langs: string[] = ["en", "ar"]): SequenceElement {
  return { dns: dnsLookup, tls: tlsHandshake, http: httpRequest, mqtt: mqttPubSub, agent: agentToolCall }[name](box, langs);
}

/** Keyframes for a sequence's `reveal`: the participants at `at[0]`, then each row (messages and notes, in order) on its word. */
export function sequenceReveal(el: SequenceElement, at: When[], dur = 0.8): Key[] {
  const n = 1 + el.messages.length + (el.notes?.length ?? 0);
  if (at.length !== n) throw new Error(`sequenceReveal: ${n} moments (the participants, then each message and note), not ${at.length}`);
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  return at.flatMap((w, k) => [{ at: w, value: r(k / n) }, { at: shift(w, dur), value: r((k + 1) / n), ease: "out" as const }]);
}

/* ---------- networks ---------- */

type D = [id: string, kind: TopologyElement["devices"][number]["kind"], en: string, ar: string, extra?: Partial<TopologyElement["devices"][number]>];
type Ln = [from: string, to: string, kind?: "wired" | "wireless" | "down", extra?: Partial<TopologyElement["links"][number]>];
function topo(box: Box, langs: string[], layout: TopologyElement["layout"], ds: D[], ls: Ln[], extra: Partial<TopologyElement> = {}): TopologyElement {
  return {
    ...boxOf(box, "net"), type: "topology", ...(layout ? { layout } : {}),
    devices: ds.map(([id, kind, en, ar, x]) => ({ id, kind, label: tx(en, ar, langs), ...x })),
    links: ls.map(([from, to, kind, x]) => ({ from, to, ...(kind && kind !== "wired" ? { kind } : {}), ...x })),
    ...extra,
  };
}

/** A home: phone and laptop on the router's Wi-Fi, a desktop on a cable, the router's line to the internet; a request out and its answer back. */
export function homeWifi(box: Box, langs: string[] = ["en", "ar"]): TopologyElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  return topo(box, langs, "star", [
    ["router", "router", "Home router", "الموجّه المنزلي", { note: "192.168.1.1", range: Math.round(Math.min(box.w, box.h) * 0.36) }],
    ["phone", "phone", "Phone", "الهاتف", { note: "192.168.1.20" }],
    ["laptop", "laptop", "Laptop", "الحاسوب المحمول", { note: "192.168.1.21" }],
    ["desktop", "desktop", "Desktop", "الحاسوب المكتبي", { note: "192.168.1.22" }],
    ["net", "cloud", "The internet", "الإنترنت"],
  ], [["phone", "router", "wireless"], ["laptop", "router", "wireless"], ["desktop", "router"], ["router", "net"]], {
    routes: [
      { path: ["phone", "router", "net"], label: T("Request", "طلب") },
      { path: ["net", "router", "phone"], label: T("Answer", "الجواب"), tone: "ok" },
    ],
  });
}

/** A school: the router, a switch for the lab, a Wi-Fi point for laptops and phones, and the school's server. */
export function schoolNetwork(box: Box, langs: string[] = ["en", "ar"]): TopologyElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  return topo(box, langs, "tree", [
    ["net", "cloud", "Internet", "الإنترنت"],
    ["router", "router", "School router", "موجّه المدرسة"],
    ["switch", "switch", "Lab switch", "مبدّل المختبر"],
    ["wifi", "router", "Wi-Fi point", "نقطة الواي فاي", { range: Math.round(Math.min(box.w, box.h) * 0.2) }],
    ["server", "server", "School server", "خادم المدرسة"],
    ["pc1", "desktop", "Lab PC", "حاسوب المختبر"],
    ["pc2", "desktop", "Lab PC", "حاسوب المختبر"],
    ["laptop", "laptop", "Laptop", "حاسوب محمول"],
    ["phone", "phone", "Phone", "هاتف"],
  ], [["net", "router"], ["router", "switch"], ["router", "wifi"], ["router", "server"], ["switch", "pc1"], ["switch", "pc2"], ["wifi", "laptop", "wireless"], ["wifi", "phone", "wireless"]], {
    routes: [{ path: ["phone", "wifi", "router", "net"], label: T("Hi!", "مرحبًا!") }],
  });
}

/** The path across the internet: home, provider, the internet's routers, the website; a request there and the page back. */
export function internetPath(box: Box, langs: string[] = ["en", "ar"]): TopologyElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const path = ["laptop", "home", "isp", "net", "site"];
  return topo(box, langs, "line", [
    ["laptop", "laptop", "Your laptop", "حاسوبك"],
    ["home", "router", "Home router", "موجّه البيت"],
    ["isp", "tower", "Internet provider", "مزوّد الإنترنت"],
    ["net", "cloud", "Routers on the way", "موجّهات في الطريق"],
    ["site", "server", "The website", "الموقع"],
  ], [["laptop", "home", "wireless"], ["home", "isp"], ["isp", "net"], ["net", "site"]], {
    zones: [
      { devices: ["laptop", "home"], label: T("Your home", "بيتك") },
      { devices: ["isp", "net"], label: T("The internet", "الإنترنت") },
    ],
    routes: [{ path, label: T("Request", "طلب") }, { path: [...path].reverse(), label: T("Page", "الصفحة"), tone: "ok" }],
  });
}

/**
 * Sensors in a mesh: each reading hops from neighbour to neighbour to the gateway. A link breaks once the first reading
 * is in (frame 1), and the second finds another way (`route` at that frame). Placed by hand, turned upright in a tall box.
 */
export function sensorMesh(box: Box, langs: string[] = ["en", "ar"]): TopologyElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const tall = box.h > box.w * 1.2;
  const at = (fx: number, fy: number): { x: number; y: number } => tall
    ? { x: Math.round(fy * box.w), y: Math.round(fx * box.h) }
    : { x: Math.round(fx * box.w), y: Math.round(fy * box.h * 0.92) };
  const el = topo(box, langs, "mesh", [
    ["gw", "gateway", "Gateway", "البوابة", { ...at(0.1, 0.45), tone: "accent" }],
    ["s1", "sensor", "Class 1", "الصف 1", at(0.34, 0.2)],
    ["s2", "sensor", "Class 2", "الصف 2", at(0.34, 0.74)],
    ["s3", "sensor", "Library", "المكتبة", at(0.62, 0.2)],
    ["s4", "sensor", "Lab", "المختبر", at(0.62, 0.74)],
    ["s5", "sensor", "Garden", "الحديقة", at(0.9, 0.45)],
  ], [["gw", "s1", "wireless"], ["gw", "s2", "wireless"], ["s1", "s2", "wireless"], ["s1", "s3", "wireless", { downAt: 1 }], ["s2", "s4", "wireless"], ["s3", "s4", "wireless"], ["s3", "s5", "wireless"], ["s4", "s5", "wireless"]]);
  el.routes = [
    { path: route(el, "s5", "gw"), label: T("24 °C", "24 °C") },
    { path: route(el, "s5", "gw", { frame: 1 }), label: T("25 °C", "25 °C"), tone: "ok" },
  ];
  return el;
}

export type TopologyPreset = "home-wifi" | "school" | "internet-path" | "sensor-mesh";
export const TOPOLOGY_PRESETS: TopologyPreset[] = ["home-wifi", "school", "internet-path", "sensor-mesh"];
export function topologyPreset(name: TopologyPreset, box: Box, langs: string[] = ["en", "ar"]): TopologyElement {
  return { "home-wifi": homeWifi, school: schoolNetwork, "internet-path": internetPath, "sensor-mesh": sensorMesh }[name](box, langs);
}

/* ---------- packets ---------- */

/** What an eavesdropper sees instead of `value`: groups of hex, as long as the value, the same every time. */
export function cipher(value: string, seed = 1): string {
  let h = seed >>> 0;
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 0x9e3779b1) >>> 0;
  const r = rng(h);
  const n = Math.max(1, Math.min(3, Math.ceil(value.length / 5)));
  return Array.from({ length: n }, () => Array.from({ length: 4 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("")).join(" ");
}

type F = [en: string, ar: string, value: string | Text, size?: string, secret?: boolean];
function pkt(box: Box, langs: string[], groups: [en: string, ar: string, span: number, tone: Tone][], fs: F[], watch = false): PacketElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  return {
    ...boxOf(box, "packet"), type: "packet",
    fields: fs.map(([en, ar, value, size, secret], i) => ({
      name: T(en, ar), value, ...(size ? { size } : {}),
      ...(secret ? { secret: true, cipher: cipher(typeof value === "string" ? value : Object.values(value)[0] ?? "", i + 1) } : {}),
    })),
    groups: groups.map(([en, ar, span, tone]) => ({ label: T(en, ar), span, tone })),
    ...(watch ? { watch: true } : {}),
  };
}

/** A request on café Wi-Fi: the addresses and port anyone can read, and the page and password HTTPS scrambles (frame 1). */
export const httpsPacket = (box: Box, langs: string[] = ["en", "ar"]): PacketElement => pkt(box, langs,
  [["IP header", "ترويسة IP", 2, "accent"], ["TCP", "TCP", 1, "accent2"], ["Data", "البيانات", 2, "ok"]],
  [["From", "من", "192.168.1.20", "4 B"], ["To", "إلى", "203.0.113.10", "4 B"], ["Port", "المنفذ", "443", "2 B"],
    ["Page", "الصفحة", "/grades?id=7", "12 B", true], ["Password", "كلمة المرور", "maths2026", "9 B", true]], true);

/** A whole frame as it leaves a laptop on Wi-Fi: MAC addresses, IP addresses, ports, and the data. */
export const framePacket = (box: Box, langs: string[] = ["en", "ar"]): PacketElement => pkt(box, langs,
  [["Wi-Fi (MAC)", "الواي فاي (MAC)", 2, "muted"], ["IP", "IP", 2, "ok"], ["TCP", "TCP", 2, "accent2"], ["HTTP", "HTTP", 1, "accent"]],
  [["To", "إلى", "a4:…:01", "6 B"], ["From", "من", "3c:…:9e", "6 B"], ["From", "من", "192.168.1.20", "4 B"], ["To", "إلى", "203.0.113.10", "4 B"],
    ["From port", "منفذ المصدر", "51012", "2 B"], ["To port", "منفذ الوجهة", "80", "2 B"], ["Data", "البيانات", "GET /", "≈ 300 B"]]);

export type PacketPreset = "https" | "frame";
export function packetPreset(name: PacketPreset, box: Box, langs: string[] = ["en", "ar"]): PacketElement {
  return name === "https" ? httpsPacket(box, langs) : framePacket(box, langs);
}

/* ---------- elements for the studio, and gallery scenes ---------- */

/** A sensible element of each type, without animation (the studio's "Add a pack element"). */
export function element(type: string, langs: string[] = ["en", "ar"], box: Box = { x: 80, y: 150, w: 1120, h: 540 }): Element {
  switch (type) {
    case "topology": return homeWifi(box, langs);
    case "sequence": return dnsLookup(box, langs);
    case "layers": return layersPreset("tcpip", box, langs);
    case "packet": return httpsPacket(box, langs);
  }
  throw new Error(`the network pack has no element type "${type}"`);
}

/** Where a scene's headline and body go on each stage shape. */
export function stageFrame(stage: Stage = "landscape"): { head: { x: number; y: number; w: number; size: number }; body: { x: number; y: number; w: number; h: number } } {
  if (stage === "portrait") return { head: { x: 48, y: 90, w: 624, size: 44 }, body: { x: 40, y: 260, w: 640, h: 940 } };
  if (stage === "square") return { head: { x: 60, y: 60, w: 960, size: 46 }, body: { x: 60, y: 190, w: 960, h: 830 } };
  return { head: { x: 80, y: 48, w: 1120, size: 46 }, body: { x: 80, y: 150, w: 1120, h: 540 } };
}

/** Gallery scenes for the studio: an id, a name per language, and a scene laid out for the stage shape. */
export function presets(langs: string[] = ["en", "ar"], stage: Stage = "landscape"): { id: string; name: Text; scene: Scene }[] {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const word = (en: string, ar: string, offset = 0): When => ({ word: T(en, ar), ...(offset ? { offset } : {}) });
  const ramp = (prop: Track["prop"], from: When, to: When, a = 0, b = 1, ease: Key["ease"] = "linear"): Track => ({ prop, keys: [{ at: from, value: a }, { at: to, value: b, ease }] });
  const steps = (prop: Track["prop"], list: [When, number][]): Track => ({ prop, keys: list.map(([at, value]) => ({ at, value, ease: "step" as const })) });
  const { head, body } = stageFrame(stage);
  const scene = (id: string, en: string, ar: string, title: [string, string], el: Element, ...anim: Track[]): { id: string; name: Text; scene: Scene } => ({
    id, name: T(...title),
    scene: {
      id, template: "canvas", narration: T(en, ar) as Record<string, string>,
      content: { elements: [{ id: "h", type: "text", ...head, weight: 800, text: T(...title) }, { ...el, anim }] },
    },
  });
  const b = { ...body };

  const tcp = layersPreset("tcpip", b, langs);
  const osi = layersPreset("osi", b, langs, T("Hi!", "مرحبًا!"));
  const dns = dnsLookup(b, langs);
  const tls = tlsHandshake(b, langs);
  const mqtt = mqttPubSub(b, langs);
  const agent = agentToolCall(b, langs);

  return [
    scene("net-home",
      "At home, your phone and laptop reach the router by Wi-Fi, and the desktop by cable. The router sends each request out to the internet, and the answer comes back the same way.",
      "في البيت، يصل هاتفك وحاسوبك المحمول إلى الموجّه عبر الواي فاي، ويصل الحاسوب المكتبي بكابل. يرسل الموجّه كل طلب إلى الإنترنت، ويعود الجواب من الطريق نفسه.",
      ["Your home network", "شبكة بيتك"], homeWifi(b, langs),
      ramp("reveal", 0.3, word("cable", "بكابل", 0.3)),
      steps("focus", [[word("router", "الموجّه"), 1], [word("sends", "يرسل"), 0]]),
      { prop: "frame", keys: [{ at: word("sends", "يرسل"), value: 0 }, { at: word("sends", "يرسل", 2.2), value: 1, ease: "in-out" }, { at: word("answer", "الجواب"), value: 1 }, { at: word("answer", "الجواب", 2.2), value: 2, ease: "in-out" }] }),
    scene("net-path",
      "A message from your laptop doesn't fly straight to the website. It hops from your home router to your internet provider, then across the internet, router by router, until it reaches the server.",
      "لا تطير رسالتك من الحاسوب إلى الموقع مباشرة. بل تقفز من موجّه البيت إلى مزوّد الإنترنت، ثم عبر الإنترنت من موجّه إلى موجّه، حتى تصل إلى الخادم.",
      ["Across the internet", "عبر الإنترنت"], internetPath(b, langs),
      ramp("reveal", 0.3, word("website", "الموقع", 0.4)),
      ramp("frame", word("hops", "تقفز"), word("server", "الخادم", 0.6), 0, 1, "linear"),
      steps("focus", [[word("provider", "مزوّد"), 3], [word("server", "الخادم"), 5]])),
    scene("net-school",
      "A school network is shaped like a tree. The school router links everyone to the internet. A switch joins the lab computers by cable, and a Wi-Fi point serves laptops and phones.",
      "شبكة المدرسة على شكل شجرة. يربط موجّه المدرسة الجميع بالإنترنت. ويصل المبدّل حواسيب المختبر بالكابلات، وتخدم نقطة الواي فاي الحواسيب المحمولة والهواتف.",
      ["A school network", "شبكة المدرسة"], schoolNetwork(b, langs),
      ramp("reveal", 0.3, word("switch", "المبدّل", 0.6)),
      steps("focus", [[word("router", "موجّه"), 2], [word("switch", "المبدّل"), 3], [word("point", "نقطة"), 4]]),
      ramp("frame", word("serves", "وتخدم"), word("phones", "والهواتف", 0.4), 0, 1, "linear")),
    scene("net-mesh",
      "Sensors in a mesh pass each reading to a neighbour, hop by hop, until it reaches the gateway. If a link fails, the mesh simply finds another way.",
      "في الشبكة المتداخلة، يمرّر كل مستشعر قراءته إلى جاره، قفزة بعد قفزة، حتى تصل إلى البوابة. وإذا تعطّل رابط، تجد الشبكة طريقًا آخر ببساطة.",
      ["A mesh of sensors", "شبكة من المستشعرات"], sensorMesh(b, langs),
      ramp("reveal", 0.2, word("neighbour", "جاره", 0.3)),
      { prop: "frame", keys: [{ at: word("hop", "قفزة"), value: 0 }, { at: word("gateway", "البوابة", 0.4), value: 1, ease: "in-out" }, { at: word("another", "آخر"), value: 1 }, { at: word("another", "آخر", 2.6), value: 2, ease: "in-out" }] }),
    scene("net-dns",
      "Your phone only knows the name school.example. It asks a DNS resolver, which asks the name servers. The address comes back, your phone keeps it, and only then does it ask the website for the page.",
      "لا يعرف هاتفك إلا الاسم school.example. فيسأل محلّل الأسماء، الذي يسأل خوادم الأسماء. يعود العنوان، فيحفظه هاتفك، وبعدها فقط يطلب الصفحة من الموقع.",
      ["Finding a website: DNS", "العثور على موقع: DNS"], dns,
      { prop: "reveal", keys: sequenceReveal(dns, [0.2, word("asks", "فيسأل"), word("which", "الذي"), word("address", "العنوان"), word("address", "العنوان", 1), word("keeps", "فيحفظه"), word("website", "الموقع")]) }),
    scene("net-tls",
      "Before HTTPS sends anything private, your browser and the website shake hands. The site shows its certificate, the browser checks it, and both make the same secret key. From then on, everything travels locked.",
      "قبل أن يرسل HTTPS أي شيء خاص، يتصافح متصفحك والموقع. يعرض الموقع شهادته، ويتحقق منها المتصفح، ثم يصنع الطرفان المفتاح السري نفسه. ومن بعدها، يسافر كل شيء مقفلًا.",
      ["A secure connection: HTTPS", "اتصال آمن: HTTPS"], tls,
      { prop: "reveal", keys: sequenceReveal(tls, [0.2, word("shake", "يتصافح"), word("certificate", "شهادته"), word("checks", "ويتحقق"), word("key", "المفتاح"), word("everything", "يسافر"), word("locked", "مقفلًا")]) },
      steps("focus", [[word("everything", "يسافر"), 4], [word("locked", "مقفلًا", 0.8), 5]])),
    scene("net-mqtt",
      "With MQTT, the teacher's app subscribes to a topic at the broker. When the classroom sensor publishes a reading, the broker passes it to every subscriber. So a warning arrives the moment the room gets too hot.",
      "مع بروتوكول MQTT، يشترك تطبيق المعلم في موضوع لدى الوسيط. وعندما ينشر مستشعر الصف قراءة، يمرّرها الوسيط إلى كل مشترك. وهكذا يصل التنبيه لحظة اشتداد الحرارة في الصف.",
      ["Publish and subscribe: MQTT", "النشر والاشتراك: MQTT"], mqtt,
      { prop: "reveal", keys: sequenceReveal(mqtt, [0.2, word("subscribes", "يشترك"), word("publishes", "ينشر"), word("passes", "يمرّرها"), word("subscriber", "مشترك"), word("warning", "التنبيه"), word("hot", "الحرارة")]) },
      steps("focus", [[word("hot", "الحرارة"), 5]])),
    scene("net-agent",
      "A good AI agent asks before it acts. The teacher asks it to book the lab. The agent checks the details with her, and only after she says yes does it call the booking tool, then it reports back.",
      "الوكيل الذكي الجيد يستأذن قبل أن يتصرّف. تطلب المعلّمة منه حجز المختبر. فيراجع الوكيل التفاصيل معها، وبعد أن توافق يستدعي أداة الحجز، ثم يخبرها بالنتيجة.",
      ["An agent asks before it acts", "الوكيل يستأذن قبل أن يتصرّف"], agent,
      { prop: "reveal", keys: sequenceReveal(agent, [0.2, word("book", "حجز"), word("checks", "فيراجع"), word("yes", "توافق"), word("call", "يستدعي"), word("call", "يستدعي", 1), word("reports", "يخبرها")]) },
      steps("focus", [[word("checks", "فيراجع"), 2], [word("yes", "توافق"), 3], [word("call", "يستدعي"), 0]])),
    scene("net-layers",
      "To send a message, each layer wraps it in its own header: the transport layer adds ports, the internet layer adds addresses, and the link layer adds the next hop. The receiver unwraps it layer by layer, back to the message.",
      "لإرسال رسالة، تغلّفها كل طبقة بترويستها الخاصة: تضيف طبقة النقل المنافذ، وتضيف طبقة الإنترنت العناوين، وتضيف طبقة الربط القفزة التالية. ثم يستقبلها الطرف الآخر ويفتحها طبقة بعد طبقة، حتى يصل إلى الرسالة.",
      ["Down the stack and up again", "نزولًا في الطبقات ثم صعودًا"], tcp,
      ramp("reveal", 0.1, 1.4),
      { prop: "frame", keys: [{ at: 0.2, value: 0 }, ...encapsulationKeys(4, {
        down: [word("ports", "المنافذ"), word("addresses", "العناوين"), word("hop", "القفزة")],
        cross: word("receiver", "يستقبلها"),
        up: [word("unwraps", "يفتحها", 0.2), word("unwraps", "يفتحها", 1), word("back", "يصل")],
      })] }),
    scene("net-osi",
      "The OSI model splits the same journey into seven layers. Its top three, application, presentation and session, do the work of the application layer in TCP/IP.",
      "يقسّم نموذج OSI الرحلة نفسها إلى سبع طبقات. وأعلى ثلاث منها، التطبيقات والعرض والجلسة، تقوم بعمل طبقة التطبيقات في TCP/IP.",
      ["The seven OSI layers", "طبقات OSI السبع"], osi,
      ramp("reveal", 0.2, word("seven", "سبع", 0.6)),
      steps("focus", [[word("application", "التطبيقات"), 1], [word("presentation", "والعرض"), 2], [word("session", "والجلسة"), 3]])),
    scene("net-https",
      "On a café's Wi-Fi, anyone nearby can capture your packets. With plain HTTP they can read everything, even your password. With HTTPS they still see the addresses and the port, but the page and the password are scrambled.",
      "على شبكة الواي فاي في المقهى، يستطيع أي شخص قريب التقاط حزمك. مع HTTP العادي يمكنه قراءة كل شيء، حتى كلمة مرورك. أما مع HTTPS فيرى العناوين والمنفذ فقط، وتبقى الصفحة وكلمة المرور مشفّرة.",
      ["What HTTPS hides", "ما الذي يخفيه HTTPS"], httpsPacket(b, langs),
      ramp("reveal", 0.2, word("capture", "التقاط", 0.5)),
      steps("focus", [[word("password", "مرورك"), 5], [word("HTTPS", "HTTPS"), 0]]),
      ramp("frame", word("HTTPS", "HTTPS"), word("scrambled", "مشفّرة", 0.4), 0, 1, "in-out")),
  ];
}
