import { describe, expect, it } from "vitest";
import { validatePackage, type Element, type LessonPackage } from "../../src/index.ts";

const pkg = (elements: Element[]): LessonPackage => ({
  manifest: {
    spec: "lesson-package", version: "0.2", id: "net", rev: 1, title: { en: "Net", ar: "شبكة" }, defaultLang: "en",
    languages: [
      { code: "en", dir: "ltr", name: "English", duration: 5, timing: "timing/en.json" },
      { code: "ar", dir: "rtl", name: "العربية", duration: 5, timing: "timing/ar.json" },
    ],
    assets: [], licence: { content: "CC-BY-4.0" }, provenance: { origin: "human" },
  } as never,
  scenes: { version: "0.2", scenes: [{ id: "s1", template: "canvas", narration: { en: "A network.", ar: "شبكة." }, content: { elements } }] },
  timing: {},
} as never);
const report = (els: unknown[]) => validatePackage(pkg(els as Element[]));
const codes = (els: unknown[]) => report(els).errors.filter((e) => e.path.includes("elements")).map((e) => e.code);
const warns = (els: unknown[]) => report(els).warnings.filter((e) => e.path.includes("elements")).map((e) => e.code);
const T = (en: string, ar: string) => ({ en, ar });
const box = { x: 0, y: 0, w: 1000, h: 520 };

const topo = (extra: object = {}) => ({
  id: "t", type: "topology", ...box,
  devices: [{ id: "phone", kind: "phone", label: T("Phone", "الهاتف") }, { id: "router", kind: "router", label: T("Router", "الموجّه"), range: 200 }, { id: "net", kind: "cloud" }],
  links: [{ from: "phone", to: "router", kind: "wireless" }, { from: "router", to: "net" }],
  routes: [{ path: ["phone", "router", "net"], label: T("Hi", "مرحبًا") }],
  ...extra,
});
const seq = (extra: object = {}) => ({
  id: "q", type: "sequence", ...box,
  participants: [{ id: "a", glyph: "browser", label: T("Browser", "المتصفح") }, { id: "b", glyph: "server", label: T("Server", "الخادم") }],
  messages: [{ from: "a", to: "b", label: "GET /" }, { from: "b", to: "a", label: T("The page", "الصفحة"), reply: true, lock: true }, { from: "b", to: "b", label: T("Logs it", "يسجّله") }],
  notes: [{ after: 1, over: ["a", "b"], text: T("Encrypted", "مشفّر") }],
  ...extra,
});
const layers = (extra: object = {}) => ({
  id: "l", type: "layers", ...box, payload: T("Hello", "مرحبًا"),
  layers: [{ name: T("Application", "التطبيقات"), header: "HTTP" }, { name: T("Transport", "النقل"), header: "TCP", note: T("ports", "المنافذ") }],
  anim: [{ prop: "frame", keys: [{ at: 0, value: 0 }, { at: 2, value: 3 }] }],
  ...extra,
});
const packet = (extra: object = {}) => ({
  id: "p", type: "packet", ...box, watch: true,
  fields: [{ name: T("To", "إلى"), value: "203.0.113.10", size: "4 B" }, { name: T("Password", "كلمة المرور"), value: "maths2026", secret: true, cipher: "9f3a c41e" }],
  groups: [{ label: "IP", span: 1, tone: "accent" }, { label: T("Data", "البيانات"), span: 1 }],
  anim: [{ prop: "frame", keys: [{ at: 0, value: 0 }, { at: 1, value: 1 }] }, { prop: "focus", keys: [{ at: 1, value: 2 }] }, { prop: "pass", keys: [{ at: 0, value: 0 }] }],
  ...extra,
});

describe("network pack elements in a package", () => {
  it("accepts a good topology, sequence, layers and packet", () => {
    const r = report([topo(), seq(), layers(), packet()]);
    expect(r.errors.filter((e) => e.path.includes("elements"))).toEqual([]);
    expect(r.warnings.filter((w) => w.path.includes("elements"))).toEqual([]);
  });

  it("names what's wrong in a topology", () => {
    expect(codes([topo({ devices: [{ id: "a", kind: "toaster" }] , links: [], routes: [] })])).toEqual(["badKind"]);
    expect(codes([topo({ links: [{ from: "phone", to: "nowhere" }] })])).toEqual(["badLink", "noLink", "noLink"]);
    expect(codes([topo({ routes: [{ path: ["phone", "net"] }] })])).toEqual(["noLink"]);
    expect(codes([topo({ routes: [{ path: ["phone", "ghost"] }] })])).toEqual(["badRoute"]);
    expect(codes([topo({ layout: "ring" })])).toEqual(["badLayout"]);
    expect(codes([topo({ zones: [{ devices: ["phone", "ghost"], label: T("Home", "البيت") }] })])).toEqual(["badZone"]);
    expect(codes([topo({ zones: [{ devices: ["phone"] }] })])).toEqual(["missingText"]);
    expect(codes([topo({ devices: [{ id: "a", kind: "phone", x: 5 }, { id: "a", kind: "laptop" }], links: [], routes: [] })]).sort()).toEqual(["badPlace", "dupId"]);
    expect(codes([topo({ devices: [{ id: "a", kind: "phone", label: { en: "Phone" } }], links: [], routes: [] })])).toEqual(["missingText"]);
    expect(codes([topo({ devices: [{ id: "a", kind: "phone", label: T("Phone", "الهاتف · المحمول") }], links: [], routes: [] })])).toEqual(["middleDot"]);
    expect(codes([topo({ devices: Array.from({ length: 17 }, (_, i) => ({ id: `d${i}`, kind: "sensor" })), links: [], routes: [] })])).toEqual(["badCount"]);
  });

  it("warns about routes over broken links, and doubled links", () => {
    expect(warns([topo({ links: [{ from: "phone", to: "router", kind: "down" }, { from: "router", to: "net" }] })])).toEqual(["routeDown"]);
    // A link that breaks at frame 1 is fine for route 1 (frames 0 → 1) but not for route 2 (frames 1 → 2).
    const late = { links: [{ from: "phone", to: "router", downAt: 1 }, { from: "router", to: "net" }] };
    expect(warns([topo(late)])).toEqual([]);
    expect(warns([topo({ ...late, routes: [{ path: ["router", "net"] }, { path: ["phone", "router"] }] })])).toEqual(["routeDown"]);
    expect(warns([topo({ links: [{ from: "phone", to: "router" }, { from: "router", to: "phone" }, { from: "router", to: "net" }] })])).toEqual(["dupLink"]);
  });

  it("names what's wrong in a sequence", () => {
    expect(codes([seq({ messages: [{ from: "a", to: "c", label: "x" }] })])).toEqual(["badMessage"]);
    expect(codes([seq({ participants: [{ id: "a", glyph: "toaster", label: "A" }, { id: "b", label: "B" }] })])).toEqual(["badKind"]);
    expect(codes([seq({ notes: [{ after: 9, over: ["a"], text: "x" }] })])).toEqual(["badNote"]);
    expect(codes([seq({ notes: [{ after: 1, over: ["a", "b", "a"], text: "x" }] })])).toEqual(["badNote"]);
    expect(codes([seq({ messages: [], notes: [] })])).toEqual(["badCount"]);
    expect(warns([seq({ h: 300, messages: Array.from({ length: 8 }, () => ({ from: "a", to: "b", label: "x" })) })])).toEqual(["tooTall"]);
  });

  it("names what's wrong in layers and packets", () => {
    expect(codes([layers({ layers: [{ name: T("Only", "فقط") }] })])).toEqual(["badCount"]);
    expect(codes([layers({ payload: undefined })])).toEqual(["missingText"]);
    expect(warns([layers({ frame: 9 })])).toEqual(["badFrame"]);
    expect(codes([packet({ groups: [{ label: "IP", span: 1 }] })])).toEqual(["badGroup"]);
    expect(codes([packet({ fields: [{ name: T("To", "إلى") }] , groups: [] })])).toEqual(["missingText"]);
    expect(codes([packet({ fields: [{ name: "x", value: "y", cipher: "" }], groups: [] })])).toEqual(["badField"]);
    expect(codes([packet({ tone: "pink" })])).toEqual(["badTone"]);
    expect(codes([{ ...packet(), w: undefined }])).toEqual(["badBox"]);
  });
});
