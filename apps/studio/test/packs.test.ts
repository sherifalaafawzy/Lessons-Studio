// Every technology pack's gallery scenes (packs.<id>.presets in packages/ops) validate with no errors and no warnings,
// in every stage shape and language set the studio offers. Packs without presets yet are skipped, so a pack is checked
// from the moment its first preset lands.
import { describe, expect, it } from "vitest";
import type { Element, Orient } from "@lessonstudio/spec";
import { PACKS, packOf, walkElements } from "@lessonstudio/spec";
import { check, newLesson, packs, type Lesson } from "@lessonstudio/ops";
import { TECH_PACKS, type TechPack } from "../src/packs.ts";

const NAMES: Record<string, string> = { en: "English", ar: "العربية", fr: "Français" };
const SIZE: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };
type Preset = { id: string; name: unknown; scene: Lesson["scenes"]["scenes"][number] };
const presetsOf = (pack: TechPack, langs: string[], stage: Orient = "landscape"): Preset[] =>
  ((packs as unknown as Record<string, { presets: (l: string[], s?: Orient) => Preset[] }>)[pack]!.presets)(langs, stage);
const lessonWith = (langs: string[], stage: Orient): Lesson =>
  newLesson({ id: "pack-presets", title: Object.fromEntries(langs.map((l) => [l, "Packs"])), languages: langs.map((code) => ({ code, name: NAMES[code]! })), stage, createdBy: "u" }, "2026-10-28");

describe("technology pack presets", () => {
  for (const pack of TECH_PACKS) {
    const has = presetsOf(pack, ["en", "ar"]).length > 0;
    describe(pack, () => {
      it.skipIf(!has)("have unique ids, a name in English and Arabic, and only the pack's own element types", () => {
        const list = presetsOf(pack, ["en", "ar"]);
        expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
        for (const p of list) {
          const name = p.name as Record<string, string> | string;
          expect(typeof name === "string" || (!!name.en && !!name.ar), `${pack}/${p.id} name`).toBe(true);
          expect(p.scene.template, `${pack}/${p.id}`).toBe("canvas");
          const types: string[] = [];
          walkElements(p.scene, (el) => types.push(el.type));
          expect(types.some((t) => (PACKS[pack] as readonly string[]).includes(t)), `${pack}/${p.id} uses one of its types`).toBe(true);
          for (const t of types) if (packOf(t) && packOf(t) !== "science") expect(packOf(t), `${pack}/${p.id}: ${t}`).toBe(pack);
          expect(JSON.stringify(p.scene), `${pack}/${p.id}`).not.toContain("·");
        }
      });

      for (const stage of ["landscape", "portrait", "square"] as const) {
        for (const langs of [["en", "ar"], ["ar"], ["en", "ar", "fr"]]) {
          it.skipIf(!has)(`validate cleanly: ${stage}, ${langs.join("+")}`, () => {
            for (const p of presetsOf(pack, langs, stage)) {
              const l = lessonWith(langs, stage);
              l.scenes.scenes = [{ ...p.scene, id: "s" }];
              const r = check(l);
              expect(r.errors, `${pack}/${p.id}`).toEqual([]);
              expect(r.warnings, `${pack}/${p.id}`).toEqual([]);
            }
          });
        }
      }

      it.skipIf(!has)("keep their elements on the 1280 × 720 stage", () => {
        const [w, h] = SIZE.landscape;
        for (const p of presetsOf(pack, ["en", "ar"])) {
          walkElements(p.scene, (el: Element) => {
            expect(el.x >= 0 && el.y >= 0 && el.x + (el.w ?? 0) <= w && el.y + (el.h ?? 0) <= h, `${pack}/${p.id} ${el.id}`).toBe(true);
          });
        }
      });
    });
  }
});
