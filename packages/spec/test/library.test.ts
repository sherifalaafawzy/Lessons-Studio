// The shared library: cast and icon names, @lib paths in lessons.
import { describe, expect, it } from "vitest";
import { castPath, isIcon, isLibPath, needsLibraryIcon, newLibraryCheck } from "./library-helpers.ts";

describe("library", () => {
  it("knows its files", () => {
    expect(castPath("salma", "talking")).toBe("@lib/v1/cast/salma_talking.svg");
    expect(isLibPath("@lib/v1/cast/salma_talking.svg")).toBe(true);
    expect(isLibPath("@lib/v1/brand/darsi-mark.svg")).toBe(true);
    expect(isLibPath("@lib/v1/cast/nobody_talking.svg")).toBe(false);
    expect(isLibPath("@lib/v2/cast/salma_talking.svg")).toBe(false);
  });
  it("knows the player's icons and the library's", () => {
    expect(isIcon("lock")).toBe(true);
    expect(isIcon("banknote")).toBe(true);
    expect(isIcon("unicorn")).toBe(false);
    expect(needsLibraryIcon("lock")).toBe(false);
    expect(needsLibraryIcon("banknote")).toBe(true);
  });
  it("the validator accepts library images and icons, and refuses unknown ones", () => {
    expect(newLibraryCheck("@lib/v1/cast/amina_happy.svg", "banknote")).toEqual([]);
    expect(newLibraryCheck("@lib/v1/cast/zed_happy.svg", "banknote")).toEqual(["badLibPath"]);
    expect(newLibraryCheck("@lib/v1/cast/amina_happy.svg", "unicorn")).toEqual(["badIcon"]);
  });
});
