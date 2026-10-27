// The studio, end to end, on the local Firebase emulators (npm run emulators: Auth 9399, Firestore 8280).
// Skipped when they aren't running.
import { expect, test, type Page } from "@playwright/test";

const STUDIO = "http://localhost:4331";
const FIRESTORE = "127.0.0.1:8280";

async function emulatorsUp(): Promise<boolean> {
  try {
    const [a, f] = await Promise.all([fetch("http://127.0.0.1:9399/"), fetch(`http://${FIRESTORE}/`)]);
    return a.ok && f.ok;
  } catch {
    return false;
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto(STUDIO);
  await page.getByLabel("Test account").fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByRole("button", { name: "Sign in with the test account" }).click();
  await expect(page.getByRole("heading", { name: "Your lessons" })).toBeVisible();
}

async function newLesson(page: Page, en: string, ar: string): Promise<string> {
  await page.getByRole("button", { name: "+ New lesson" }).click();
  const titles = page.locator(".modal fieldset").nth(1).locator("input");
  await titles.nth(0).fill(en);
  await titles.nth(1).fill(ar);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/lessons\/[a-z0-9-]+$/);
  await expect(page.locator(".status")).toHaveText("Saved");
  return page.url().split("/").pop()!;
}

/** An edit made the way the MCP server makes one: the server's Firestore store, as an AI client. */
async function aiEdit(lessonId: string, ops: unknown[]): Promise<void> {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { FirestoreStore } = await import("../apps/server/src/stores/firestore.ts");
  const app = getApps().find((a) => a.name === "e2e") ?? initializeApp({ projectId: "demo-lessonstudio" }, "e2e");
  const db = getFirestore(app);
  const owner = (await db.collection("lessons").doc(lessonId).get()).data()!.owner as string;
  await new FirestoreStore(db).apply(lessonId, ops as never, { uid: owner, via: "mcp:Claude" });
}

test.describe("studio", () => {
  test.beforeAll(async () => {
    test.skip(!(await emulatorsUp()), "The Firebase emulators aren't running (npm run emulators).");
  });

  test("build a canvas scene, animate it on a word, and work alongside an AI", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "The phone layout has its own test.");
    await signIn(page);
    const id = await newLesson(page, "How a phishing link works", "كيف يعمل رابط التصيّد");

    // A canvas scene, with narration that says the word we animate on.
    await page.getByRole("button", { name: "+ Add a scene" }).click();
    await page.getByRole("group", { name: "Choose a scene type" }).getByRole("button", { name: "Canvas" }).click();
    const narration = page.locator(".narr textarea");
    await narration.nth(0).fill("The link looks real. Then it opens a fake page.");
    await narration.nth(0).blur();
    await narration.nth(1).fill("يبدو الرابط حقيقيًا. ثم يفتح صفحة مزيفة.");
    await narration.nth(1).blur();
    await expect(page.locator(".status")).toHaveText("Saved");

    // Add an icon; it's selected, with its properties in the inspector.
    await page.getByRole("toolbar", { name: "Add an element" }).getByRole("button", { name: "Icon" }).click();
    await expect(page.locator(".sel-name")).toHaveText("icon");
    const xField = page.getByLabel("X", { exact: true });
    const x0 = Number(await xField.inputValue());

    // Drag it on the stage.
    const box = (await page.locator(".sel").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect.poll(async () => Number(await xField.inputValue())).toBeGreaterThan(x0 + 100);

    // Pop it in when "opens" / "يفتح" is said.
    await page.getByRole("combobox", { name: "Animation", exact: true }).selectOption("pop");
    await page.locator(".words-pick .words-row").nth(0).getByRole("button", { name: "opens", exact: true }).click();
    await page.locator(".words-pick .words-row").nth(1).getByRole("button", { name: "يفتح", exact: true }).click();
    await page.getByRole("button", { name: "Add animation" }).click();
    await expect(page.locator(".anim strong").first()).toHaveText("Size");
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(page.locator(".checks-sum")).toHaveText("All checks pass");

    // In Arabic the stage mirrors: the icon keeps its distance from the right edge.
    await page.getByRole("combobox", { name: "Lesson language" }).selectOption("ar");
    const icon = page.locator('.stage-player [data-el="icon"]');
    await expect(icon).toHaveAttribute("style", /right:\s*\d/);
    await page.getByRole("combobox", { name: "Lesson language" }).selectOption("en");

    // An AI edits the same scene through MCP: it shows up at once, and says who did it.
    await aiEdit(id, [
      { op: "addElement", scene: "canvas", element: { id: "warn", type: "icon", icon: "warning", x: 1040, y: 470, w: 110, h: 110, tone: "danger" } },
    ]);
    await expect(page.locator(".ai-banner")).toContainText("Claude (MCP)");
    await expect(page.locator('.stage-player [data-el="warn"]')).toHaveCount(1);

    // Undo takes back only my last change (the animation); the AI's element stays.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".anim")).toHaveCount(0);
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(page.locator('.stage-player [data-el="warn"]')).toHaveCount(1);

    // The learner's view on a low-end phone, with the download size.
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.locator(".modal .device.phone")).toBeVisible();
    await expect(page.locator(".modal")).toContainText(/downloads about \d/);
    await page.getByRole("button", { name: "Close" }).click();
    await page.locator(".stage").screenshot({ path: `e2e/screenshots/studio-${info.project.name}.png` });
  });

  test("on a phone, the editor shows one panel at a time", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "Phone only.");
    await signIn(page);
    await newLesson(page, "Phone check", "فحص الهاتف");
    const tabs = page.getByRole("navigation", { name: "Panels" });
    await expect(page.locator(".stage")).toBeVisible();
    await expect(page.locator(".board")).toBeHidden();
    await tabs.getByRole("button", { name: "Scenes" }).click();
    await expect(page.locator(".board")).toBeVisible();
    await expect(page.locator(".stage")).toBeHidden();
    await tabs.getByRole("button", { name: "Details" }).click();
    await expect(page.locator(".inspector")).toBeVisible();
    // Nothing spills sideways at 375 px.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
  });
});
