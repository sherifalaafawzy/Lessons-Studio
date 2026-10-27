// The dark theme's text colours stay readable: every pair the studio uses is at least 4.5:1 (WCAG AA for text).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const root = /:root\s*{([^}]*)}/.exec(css)![1]!;
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`no --${name}`);
  return m[1]!;
};
const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe("theme", () => {
  const surfaces = ["bg", "panel", "raised", "field", "soft"];
  for (const text of ["fg", "muted", "accent-fg", "ok", "warn", "bad"]) {
    for (const s of surfaces) {
      it(`${text} on ${s}`, () => expect(contrast(token(text), token(s))).toBeGreaterThanOrEqual(4.5));
    }
  }
  it("white on the accent and danger buttons", () => {
    expect(contrast("#ffffff", token("accent"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", token("bad-bg"))).toBeGreaterThanOrEqual(4.5);
  });
});
