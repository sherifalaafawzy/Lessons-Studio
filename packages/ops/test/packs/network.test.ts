import { describe, expect, it } from "vitest";
import { check, newLesson } from "../../src/draft.ts";
import {
  SEQUENCE_PRESETS, TOPOLOGY_PRESETS, cipher, element, encapsulationFrames, encapsulationKeys, homeWifi, layersPreset, presets, route,
  sensorMesh, sequencePreset, sequenceReveal, stageFrame, topologyPreset, type TopologyElement,
} from "../../src/packs/network.ts";
import type { Orient } from "@lessonstudio/spec";

const box = { x: 80, y: 150, w: 1120, h: 540 };
const lesson = (langs: string[], stage: Orient) =>
  newLesson({ id: "net", title: Object.fromEntries(langs.map((l) => [l, "Net"])), languages: langs.map((code) => ({ code, name: code })), stage, createdBy: "u" } as never, "2026-10-29");

describe("routes", () => {
  const mesh = sensorMesh(box);
  it("finds the fewest hops, and the way round a broken link", () => {
    expect(route(mesh, "s5", "gw")).toEqual(["s5", "s3", "s1", "gw"]);
    // s1–s3 breaks at frame 1.
    expect(route(mesh, "s5", "gw", { frame: 1 })).toEqual(["s5", "s4", "s2", "gw"]);
    expect(() => route(mesh, "s5", "gw", { frame: 1, avoid: ["s4"] })).toThrow();
    expect(mesh.routes!.map((r) => r.path)).toEqual([["s5", "s3", "s1", "gw"], ["s5", "s4", "s2", "gw"]]);
  });
  it("refuses when there is no way", () => {
    const cut: TopologyElement = { ...homeWifi(box), links: [{ from: "phone", to: "router", kind: "down" }, { from: "router", to: "net" }] };
    expect(() => route(cut, "phone", "net")).toThrow(/no way from phone to net/);
    expect(route(cut, "router", "net")).toEqual(["router", "net"]);
  });
});

describe("the protocol stack", () => {
  it("numbers the trip: down the sender, across, up the receiver", () => {
    expect(encapsulationFrames(4)).toEqual({ down: [0, 1, 2, 3], cross: [3, 4], up: [7, 6, 5, 4], last: 7 });
    expect(encapsulationFrames(layersPreset("osi", box)).last).toBe(13);
  });
  it("keys each step to its moment, in order", () => {
    const keys = encapsulationKeys(4, { down: [1, 2, 3], cross: 4, up: [6, 7, 8] }, 0.5);
    expect(keys.map((k) => k.value)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
    expect(keys.map((k) => k.at)).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 5.4, 6, 6.5, 7, 7.5, 8, 8.5]);
  });
  it("has four, five or seven layers, with headers only where a layer adds one", () => {
    expect(layersPreset("tcpip", box).layers.map((l) => l.header)).toEqual(["HTTP", "TCP", "IP", "Wi-Fi"]);
    expect(layersPreset("tcpip5", box).layers).toHaveLength(5);
    expect(layersPreset("osi", box).layers.filter((l) => l.header)).toHaveLength(4);
  });
});

describe("sequences and packets", () => {
  it("reveals the participants, then each row on its moment", () => {
    const dns = sequencePreset("dns", box);
    const keys = sequenceReveal(dns, [0, 1, 2, 3, 4, 5, 6]);
    expect(keys[0]).toEqual({ at: 0, value: 0 });
    expect(keys[keys.length - 1]!.value).toBe(1);
    expect(() => sequenceReveal(dns, [0, 1])).toThrow(/7 moments/);
  });
  it("scrambles the same way every time", () => {
    expect(cipher("maths2026")).toBe(cipher("maths2026"));
    expect(cipher("maths2026")).not.toBe(cipher("maths2027"));
    expect(cipher("maths2026")).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){0,2}$/);
  });
});

describe("ready-made elements and gallery scenes", () => {
  it("gives a valid element of each type, for the studio", () => {
    const l = lesson(["en", "ar"], "landscape");
    l.scenes.scenes = [{ id: "s", template: "canvas", narration: { en: "Networks.", ar: "الشبكات." }, content: { elements: ["topology", "sequence", "layers", "packet"].map((t, i) => ({ ...element(t, ["en", "ar"]), id: `e${i}` })) } }];
    const r = check(l);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(() => element("graph")).toThrow();
  });

  it("validate cleanly in every stage shape and language set, with Arabic never using the middle dot", () => {
    for (const stage of ["landscape", "portrait", "square"] as const) {
      for (const langs of [["en", "ar"], ["ar"], ["en", "ar", "fr"]]) {
        const list = presets(langs, stage);
        expect(list.length).toBeGreaterThanOrEqual(4);
        for (const p of list) {
          const l = lesson(langs, stage);
          l.scenes.scenes = [{ ...p.scene, id: "s" }];
          const r = check(l);
          expect(r.errors, `${stage} ${langs} ${p.id}`).toEqual([]);
          expect(r.warnings, `${stage} ${langs} ${p.id}`).toEqual([]);
          expect(JSON.stringify(p.scene)).not.toContain("·");
        }
      }
    }
  });

  it("use every element type, inside the body of each stage", () => {
    const types = new Set(presets(["en", "ar"]).map((p) => (p.scene.template === "canvas" ? p.scene.content.elements[1]!.type : "")));
    expect([...types].sort()).toEqual(["layers", "packet", "sequence", "topology"]);
    for (const stage of ["landscape", "portrait", "square"] as const) {
      const { body } = stageFrame(stage);
      for (const p of presets(["en", "ar"], stage)) {
        const el = p.scene.template === "canvas" ? p.scene.content.elements[1]! : undefined;
        expect(el && el.x >= body.x && el.y >= body.y && el.x + el.w! <= body.x + body.w && el.y + el.h! <= body.y + body.h, `${stage} ${p.id}`).toBe(true);
      }
    }
  });

  it("are the same on every call (seeded)", () => {
    expect(JSON.stringify(presets(["en", "ar"]))).toBe(JSON.stringify(presets(["en", "ar"])));
    for (const n of TOPOLOGY_PRESETS) expect(topologyPreset(n, box).devices.length).toBeGreaterThan(2);
    for (const n of SEQUENCE_PRESETS) expect(sequencePreset(n, box).messages.length).toBeLessThanOrEqual(6);
  });
});
