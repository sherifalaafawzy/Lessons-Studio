import { describe, expect, it } from "vitest";
import { validatePackage, type Element, type LessonPackage } from "../../../packages/spec/src/index.ts";
import { bodies } from "../../darsi/packs/network.ts";
import type { AText, BodyCtx } from "../../darsi/packs/types.ts";

// Sentence k starts at 4k seconds; texts are { en, "ar-EG" } (a string for both).
const c: BodyCtx = {
  at: (k, o = 0) => Math.round((k * 4 + o) * 1000) / 1000,
  n: 4,
  T: (t: AText, what: string) => {
    if (typeof t === "string") return { en: t, "ar-EG": t };
    if (!t.en || !t["ar-EG"]) throw new Error(`${what}: needs en and ar-EG`);
    return { en: t.en, "ar-EG": t["ar-EG"] };
  },
  langs: ["en", "ar-EG"],
  box: { x: 90, y: 210, w: 1100, h: 400 },
  where: "test scene 2",
};
const pkg = (elements: Element[]): LessonPackage => ({
  manifest: {
    spec: "lesson-package", version: "0.2", id: "net", rev: 1, title: { en: "Net", "ar-EG": "شبكة" }, defaultLang: "en",
    languages: [
      { code: "en", dir: "ltr", name: "English", duration: 16, timing: "timing/en.json" },
      { code: "ar-EG", dir: "rtl", name: "مصري", duration: 16, timing: "timing/ar-EG.json" },
    ],
    assets: [], licence: { content: "CC-BY-4.0" }, provenance: { origin: "human" },
  } as never,
  scenes: { version: "0.2", scenes: [{ id: "s1", template: "canvas", narration: { en: "One. Two. Three. Four.", "ar-EG": "واحد. اتنين. تلاتة. أربعة." }, content: { elements } }] },
  timing: {},
} as never);
const problems = (els: Element[]) => validatePackage(pkg(els)).errors.filter((e) => e.path.includes("elements"));
const track = (el: Element, prop: string) => el.anim?.find((t) => t.prop === prop);
const AR = (en: string, ar: string) => ({ en, "ar-EG": ar });

describe("network pack storyboard bodies", () => {
  it("builds a preset network, lit and travelled on its sentences", () => {
    const [el] = bodies.topology!({ preset: "home-wifi", s: 0, focus: [{ device: "router", s: 1 }], play: [2, 3] }, c);
    expect(el!.type).toBe("topology");
    expect(track(el!, "focus")!.keys).toEqual([{ at: 4, value: 1, ease: "step" }]);
    expect(track(el!, "frame")!.keys.map((k) => [k.at, k.value])).toEqual([[8.3, 0], [10.4, 1], [12.3, 1], [14.4, 2]]);
    expect(problems([el!])).toEqual([]);
  });

  it("builds a network written out, finding routes round a broken link", () => {
    const [el] = bodies.topology!({
      layout: "mesh",
      devices: [{ id: "gw", kind: "gateway", label: AR("Gateway", "البوابة") }, { id: "a", kind: "sensor", label: "A" }, { id: "b", kind: "sensor", label: "B" }, { id: "c", kind: "sensor", label: "C" }],
      links: [["gw", "a", "wireless"], ["gw", "b", "wireless"], ["a", "c", "wireless"], ["b", "c", "wireless"]],
      down: [{ link: ["a", "c"], after: 1 }],
      routes: [{ from: "c", to: "gw", label: "24 °C" }, { from: "c", to: "gw", label: "25 °C" }],
      play: [1, 2],
    }, c) as [Extract<Element, { type: "topology" }>];
    expect(el.routes!.map((r) => r.path)).toEqual([["c", "a", "gw"], ["c", "b", "gw"]]);
    expect(el.links.find((l) => l.from === "a" && l.to === "c")!.downAt).toBe(1);
    expect(problems([el])).toEqual([]);
  });

  it("builds sequence diagrams row by row, on the sentences given or spread over the scene", () => {
    const [dns] = bodies.sequence!({ preset: "dns", rows: [1, 1, 2, 2, 2, 3], focus: [{ message: 5, s: 3 }] }, c);
    const keys = track(dns!, "reveal")!.keys;
    expect(keys).toHaveLength(14);
    expect(keys.map((k) => k.at)).toEqual([0.2, 1, 4.3, 5.1, 5.3, 6.1, 8.3, 9.1, 9.3, 10.1, 10.3, 11.1, 12.3, 13.1]);
    expect(problems([dns!])).toEqual([]);
    const [own] = bodies.sequence!({
      participants: [{ id: "app", glyph: "phone", label: AR("App", "التطبيق") }, { id: "broker", glyph: "server", label: AR("Broker", "الوسيط") }],
      messages: [{ from: "app", to: "broker", text: "SUBSCRIBE room1/temp" }, { from: "broker", to: "app", text: "24 °C", reply: true }],
      notes: [{ after: 2, over: ["broker"], text: AR("Every subscriber gets it", "كل مشترك يوصله") }],
    }, c);
    expect(track(own!, "reveal")!.keys).toHaveLength(8);
    expect(problems([own!])).toEqual([]);
  });

  it("builds the stack, step by step or over sentences", () => {
    const [step] = bodies.layers!({ model: "tcpip", payload: AR("Hello", "أهلًا"), down: [1, 1, 1], cross: 2, up: [3, 3, 3] }, c);
    expect(track(step!, "frame")!.keys.map((k) => k.value)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
    expect(problems([step!])).toEqual([]);
    const [trip] = bodies.layers!({ model: "osi", frames: [1, 3], focus: [{ layer: 4, s: 2 }] }, c);
    expect(track(trip!, "frame")!.keys).toEqual([{ at: 4, value: 0 }, { at: 14.5, value: 13, ease: "linear" }]);
    expect(problems([trip!])).toEqual([]);
  });

  it("builds a packet that encrypts on its sentence", () => {
    const [p] = bodies.packet!({ preset: "https", encrypt: 2, focus: [{ field: 4, s: 1 }] }, c);
    expect(track(p!, "frame")!.keys).toEqual([{ at: 8, value: 0 }, { at: 9.2, value: 1, ease: "in-out" }]);
    expect(problems([p!])).toEqual([]);
    const [own] = bodies.packet!({ fields: [{ name: AR("To", "لـ"), value: "203.0.113.10", size: "4 B" }, { name: AR("Data", "البيانات"), value: "hello", secret: true }], watch: true }, c);
    expect(problems([own!])).toEqual([]);
  });

  it("says which scene is wrong", () => {
    expect(() => bodies.topology!({ preset: "office" }, c)).toThrow(/test scene 2.*no topology preset/);
    expect(() => bodies.sequence!({ preset: "dns", rows: [1, 2] }, c)).toThrow(/test scene 2.*6 sentences/);
    expect(() => bodies.sequence!({ preset: "dns", rows: [1, 1, 2, 2, 2, 9] }, c)).toThrow(/test scene 2.*sentence number from 0 to 3/);
    expect(() => bodies.layers!({ model: "osi8" }, c)).toThrow(/test scene 2/);
    expect(() => bodies.packet!({ preset: "https", focus: [{ field: 9, s: 1 }] }, c)).toThrow(/test scene 2.*1–5/);
    expect(() => bodies.topology!({ preset: "home-wifi", focus: [{ device: "toaster", s: 1 }] }, c)).toThrow(/test scene 2.*toaster/);
    expect(() => bodies.topology!({ devices: [{ id: "a", kind: "phone", label: { en: "Phone" } }], links: [] }, c)).toThrow(/needs en and ar-EG/);
  });
});
