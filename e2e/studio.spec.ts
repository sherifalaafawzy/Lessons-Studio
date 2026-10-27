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

/** A box on the stage once it has stopped changing (the stage player is re-made after edits and language switches). */
async function stableBox(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i < 40; i++) {
    const b = await page.locator(selector).boundingBox().catch(() => null);
    if (b && prev && Math.abs(b.x - prev.x) < 1 && Math.abs(b.y - prev.y) < 1) return b;
    prev = b;
    await page.waitForTimeout(100);
  }
  throw new Error(`${selector} never settled`);
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

    // Pop it in when "opens" / "يفتح" is said (the Animate tab).
    await page.getByRole("tab", { name: "Animate" }).click();
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

  test("start from each example lesson, and import a lesson file", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await signIn(page);
    const examples: [string, number][] = [["Prompt injection in 60 seconds", 5], ["Spot a phishing message", 5], ["How an AI model learns", 4]];
    for (const [title, scenes] of examples) {
      await page.getByRole("button", { name: "+ New lesson" }).click();
      await page.getByRole("radio", { name: "An example" }).click();
      await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
      await expect(page).toHaveURL(/\/lessons\/[a-z0-9-]+$/);
      await expect(page.locator(".board .card")).toHaveCount(scenes);
      await expect(page.locator(".checks-sum")).not.toHaveClass(/bad/);
      await page.goto(STUDIO);
      await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    }

    // A file holding {manifest, scenes}, as get_lesson returns it.
    const fs = await import("node:fs/promises");
    const file = JSON.stringify({
      manifest: JSON.parse(await fs.readFile("examples/phishing-message/manifest.json", "utf8")),
      scenes: JSON.parse(await fs.readFile("examples/phishing-message/scenes.json", "utf8")),
    });
    await page.getByRole("button", { name: "+ New lesson" }).click();
    await page.getByRole("radio", { name: "A lesson file" }).click();
    await page.getByLabel("Lesson file (JSON)").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{\"hello\": 1}") });
    await expect(page.getByRole("alert")).toContainText("No lesson in this file");
    await page.getByLabel("Lesson file (JSON)").setInputFiles({ name: "phishing.json", mimeType: "application/json", buffer: Buffer.from(file) });
    await expect(page).toHaveURL(/\/lessons\/spot-a-phishing-message-[a-z0-9]+$/);
    await expect(page.locator(".board .card")).toHaveCount(5);
  });

  test("a Darsi lesson plays its cast and the library's icons, in English and Egyptian Arabic", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await signIn(page);
    const fs = await import("node:fs/promises");
    const file = JSON.stringify({
      manifest: JSON.parse(await fs.readFile("content/darsi/lessons/cy-1-1-2/manifest.json", "utf8")),
      scenes: JSON.parse(await fs.readFile("content/darsi/lessons/cy-1-1-2/scenes.json", "utf8")),
    });
    await page.getByRole("button", { name: "+ New lesson" }).click();
    await page.getByRole("radio", { name: "A lesson file" }).click();
    await page.getByLabel("Lesson file (JSON)").setInputFiles({ name: "cy-1-1-2.json", mimeType: "application/json", buffer: Buffer.from(file) });
    await expect(page).toHaveURL(/\/lessons\/[a-z0-9-]+$/);
    await expect(page.locator(".board .card")).toHaveCount(13);
    // Only the length note: Darsi's videos are three minutes.
    await expect(page.locator(".checks-sum")).not.toHaveClass(/bad/);

    // The hook: Salma from the shared library, and icons the player fetched from it.
    await page.locator(".board .card").nth(0).click();
    const who = page.locator('.stage-player [data-el="who"] img');
    await expect(who).toHaveAttribute("src", /\/lib\/v1\/cast\/salma_talking\.svg$/);
    await expect.poll(() => who.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.stage-player [data-el="icon1"] [data-icon="banknote"] path').first()).toBeAttached();

    // In Egyptian Arabic the stage turns right to left and shows the Arabic.
    await page.getByRole("combobox", { name: "Lesson language" }).selectOption("ar-EG");
    await expect(page.locator('.stage-player [data-el="label1"]')).toContainText("المرتب موقوف");
    await expect(page.locator('.stage-player [data-el="who"]')).toHaveAttribute("style", /right:\s*\d/);
  });

  test("export a lesson as an MP4, made on the server", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    test.setTimeout(300_000);
    await signIn(page);
    await page.getByRole("button", { name: "+ New lesson" }).click();
    await page.getByRole("radio", { name: "An example" }).click();
    await page.getByRole("button", { name: /^Spot a phishing message/ }).click();
    await expect(page).toHaveURL(/\/lessons\/[a-z0-9-]+$/);
    await expect(page.locator(".board .card")).toHaveCount(5);
    await page.keyboard.press("r");
    await page.getByRole("combobox", { name: "Size" }).selectOption("144");
    const download = page.waitForEvent("download", { timeout: 280_000 });
    await page.getByRole("button", { name: "Make MP4" }).click();
    await expect(page.getByRole("button", { name: "Making the video…" })).toBeDisabled();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^phishing-message-[a-z0-9]+-en-144p\.mp4$/);
    if (process.env.LS_KEEP_MP4) await file.saveAs(process.env.LS_KEEP_MP4);
    const bytes = (await import("node:fs")).readFileSync(await file.path());
    // An MP4 starts with an "ftyp" box, and a minute of 144p is tens of kilobytes.
    expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(bytes.length).toBeGreaterThan(20_000);
    await expect(page.getByRole("status").filter({ hasText: /Saved .*144p\.mp4/ })).toBeVisible();
  });

  test("new lessons start with three scenes; add a ready-made scene and repair a word after rewording", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await signIn(page);
    await newLesson(page, "Fractions", "الكسور");
    await expect(page.locator(".board .card")).toHaveCount(3);
    await expect(page.locator(".checks-sum")).toHaveText("All checks pass");

    await page.getByRole("button", { name: "+ Add a scene" }).click();
    await expect(page.locator(".gal-card")).toHaveCount(14);
    await page.getByRole("button", { name: /A process with arrows/ }).click();
    await expect(page.locator(".board .card")).toHaveCount(4);
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(page.locator(".checks-sum")).toHaveText("All checks pass");
    await expect(page.locator('.stage-player [data-el="arrow1"]')).toHaveCount(1);

    // Reword the English narration so "Training" is no longer said: the checks offer to pick the new word.
    const narration = page.locator(".narr textarea").nth(0);
    await narration.fill("It starts with data: many examples. Practice finds the patterns in them. The result is a model that can make good guesses.");
    await narration.blur();
    await expect(page.locator(".checks-sum")).toHaveText(/0 errors, \d+ warnings/);
    await page.locator(".checks-sum").click();
    await page.getByRole("button", { name: "Pick the new word" }).first().click();
    await page.locator(".checks-list .words-row").getByRole("button", { name: "Practice", exact: true }).click();
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(page.locator(".checks-sum")).toHaveText("All checks pass");
  });

  test("type over texts on the stage in each language, and convert a template scene to canvas", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await signIn(page);
    await newLesson(page, "Fractions", "الكسور");
    await page.locator(".board .card").nth(0).click();
    const titleField = page.locator('.inspector [data-path="/content/title"]');

    // Double-click the title on the stage and type: only the stage language changes.
    const typeOver = async (part: string, text: string) => {
      const box = await stableBox(page, `.stage-player [data-part="${part}"]`);
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      const area = page.getByRole("textbox", { name: /Type the new text/ });
      await expect(area).toBeVisible();
      await area.fill(text);
      await area.press("Enter");
      await expect(page.locator(".status")).toHaveText("Saved");
    };
    await typeOver("title", "Fractions made easy");
    await expect(titleField.locator('input[lang="en"]')).toHaveValue("Fractions made easy");
    await expect(titleField.locator('input[lang="ar"]')).toHaveValue("الكسور");
    await page.getByRole("combobox", { name: "Lesson language" }).selectOption("ar");
    await typeOver("title", "الكسور ببساطة");
    await expect(titleField.locator('input[lang="ar"]')).toHaveValue("الكسور ببساطة");
    await expect(titleField.locator('input[lang="en"]')).toHaveValue("Fractions made easy");
    await page.getByRole("combobox", { name: "Lesson language" }).selectOption("en");

    // A single click selects a part and shows its field; Escape leaves typing without a change.
    const hook = await stableBox(page, '.stage-player [data-part="hook"]');
    await page.mouse.click(hook.x + hook.width / 2, hook.y + hook.height / 2);
    await expect(page.locator(".sel.part")).toBeVisible();
    await expect(page.locator('.inspector [data-path="/content/hook"]')).toHaveClass(/flash/);
    await page.mouse.dblclick(hook.x + hook.width / 2, hook.y + hook.height / 2);
    await page.getByRole("textbox", { name: /Type the new text/ }).fill("Not this");
    await page.keyboard.press("Escape");
    await expect(page.locator('.inspector [data-path="/content/hook"] input[lang="en"]')).toHaveValue("Why it matters");

    // The steps scene becomes free elements, with its cues still on the steps; undo brings the template back.
    await page.locator(".board .card").nth(1).click();
    await page.getByRole("button", { name: "Convert to canvas" }).click();
    await page.locator(".confirm-box").getByRole("button", { name: "Convert to canvas" }).click();
    await expect(page.locator(".board .card").nth(1).locator(".badge")).toHaveText("Canvas");
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(page.locator('.stage-player [data-el="title"]')).toHaveCount(1);
    await expect(page.locator('.stage-player [data-el="1"]')).toHaveCount(1);
    await expect(page.locator(".checks-sum")).not.toHaveClass(/bad/);
    await page.locator(".stage").screenshot({ path: `e2e/screenshots/converted-${info.project.name}.png` });
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".board .card").nth(1).locator(".badge")).toHaveText("Steps");
  });

  test("the timeline: drag a keyframe onto a spoken word, and edit or remove a moment", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await signIn(page);
    await newLesson(page, "Timeline", "الخط الزمني");
    await page.getByRole("button", { name: "+ Add a scene" }).click();
    await page.getByRole("button", { name: /A process with arrows/ }).click();
    await expect(page.locator(".status")).toHaveText("Saved");

    // The second arrow starts drawing just before "result"; drag its first diamond onto "patterns".
    const row = page.locator(".tl-row", { has: page.locator(".tl-label", { hasText: /^arrow2$/ }) });
    await row.scrollIntoViewIfNeeded();
    const key = row.locator(".tl-key").first();
    const from = (await key.boundingBox())!;
    const word = (await page.locator(".tl-word", { hasText: /^patterns$/ }).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(word.x + 1, from.y + from.height / 2, { steps: 8 });
    await expect(page.locator(".tl-word.snap")).toHaveText("patterns");
    await page.mouse.up();
    await expect(page.locator(".status")).toHaveText("Saved");
    await row.locator(".tl-label").click();
    await page.getByRole("tab", { name: "Animate" }).click();
    await expect(page.locator(".inspector")).toContainText("«patterns»");
    // Only English moved: Arabic keeps its own word, so the checks stay clean.
    await expect(page.locator(".checks-sum")).toHaveText("All checks pass");

    // Click a diamond to edit that moment; remove it.
    const modelRow = page.locator(".tl-row", { has: page.locator(".tl-label", { hasText: /^model-label$/ }) });
    await modelRow.scrollIntoViewIfNeeded();
    const before = await modelRow.locator(".tl-key").count();
    await modelRow.locator(".tl-key").first().click();
    await expect(page.locator(".tl-editor")).toBeVisible();
    await page.locator(".tl-editor").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(".status")).toHaveText("Saved");
    await expect(modelRow.locator(".tl-key")).toHaveCount(before - 1);
    await page.locator(".stage").screenshot({ path: `e2e/screenshots/timeline-${info.project.name}.png` });
  });

  test("settings: add a Gemini key, draft a lesson with AI, see how to connect AI apps, remove the key", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    test.skip(!(await fetch("http://127.0.0.1:5401/").then(() => true, () => false)), "The functions emulator isn't running.");
    // A stand-in for Gemini on the port the functions emulator calls (functions/.env.demo-lessonstudio).
    const KEY = "AIzaSyStandInKeyForTests0123456789";
    const { GALLERY } = await import("../apps/studio/src/presets.ts");
    const scenes = ["title", "steps", "quiz", "summary"].map((id, i) => GALLERY.find((g) => g.id === id)!.make({ id: `s${i + 1}`, langs: ["en", "ar"], stage: "landscape" }));
    const answer = JSON.stringify({ title: { en: "Before you click", ar: "قبل أن تضغط" }, summary: { en: "Three checks", ar: "ثلاث خطوات" }, scenes });
    const { createServer } = await import("node:http");
    const stub = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.headers["x-goog-api-key"] !== KEY) { res.statusCode = 400; res.end("{}"); return; }
      res.end(req.method === "GET" ? "{}" : JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 5000 } }));
    });
    await new Promise<void>((r) => stub.listen(4599, "127.0.0.1", () => r()));
    try {
      await signIn(page);
      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await expect(page.getByText("No key yet")).toBeVisible();
      await page.getByRole("button", { name: "Add a key" }).click();
      await page.getByLabel("Gemini API key").fill(KEY);
      await page.getByRole("button", { name: "Check and save" }).click();
      await expect(page.getByText("Key ending …6789")).toBeVisible();
      await expect(page.getByLabel("Gemini API key")).toHaveCount(0);

      await page.getByRole("button", { name: /Back to your lessons|Lessons/ }).first().click();
      await page.getByRole("button", { name: "+ New lesson" }).click();
      await page.getByRole("radio", { name: "Draft with AI" }).click();
      await page.getByLabel("What is the lesson about?").fill("Checking a link before clicking it");
      await page.getByRole("button", { name: "Draft the lesson" }).click();
      await expect(page).toHaveURL(/\/lessons\/checking-a-link-before-clicking-it-[a-z0-9]+$/, { timeout: 30_000 });
      await expect(page.locator(".board .card")).toHaveCount(4);
      await expect(page.locator(".toast")).toContainText("Your draft is ready");
      await expect(page.locator(".checks-sum")).not.toHaveClass(/bad/);

      await page.getByRole("link", { name: "Connect your AI" }).click();
      await expect(page.locator(".addr code")).toHaveText("http://127.0.0.1:4320/mcp");
      await expect(page.locator(".snippet").first()).toContainText("claude mcp add --transport http lessonstudio http://127.0.0.1:4320/mcp");
      await page.screenshot({ path: `e2e/screenshots/connect-${info.project.name}.png`, fullPage: true });

      await page.getByRole("link", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Remove" }).click();
      await page.getByRole("button", { name: "Yes" }).click();
      await expect(page.getByText("No key yet")).toBeVisible();
    } finally {
      stub.close();
    }
  });

  test("the editor: reorder and drop scenes on the timeline, the command palette, export and import, zoom and pan", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await newLesson(page, "Editor", "المحرر");
    const badges = page.locator(".board .card .badge");
    await expect(badges).toHaveText(["Title", "Steps", "Summary"]);

    // Drag the last clip to the front of the timeline.
    const clips = page.locator(".tl-scenes .clip");
    const last = (await clips.nth(2).boundingBox())!;
    const first = (await clips.nth(0).boundingBox())!;
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + 4, first.y + first.height / 2, { steps: 10 });
    await expect(page.locator(".clip-marker")).toHaveCount(1);
    await page.mouse.up();
    await expect(badges).toHaveText(["Summary", "Title", "Steps"]);
    await expect(page.locator(".status")).toHaveText("Saved");

    // Drop a ready-made scene from the Add panel between the first two clips.
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const target = (await clips.nth(1).boundingBox())!;
    const box = (await page.locator(".tl-scenes .tl-track").boundingBox())!;
    await page.locator(".gal-card", { hasText: "A big number" }).dragTo(page.locator(".tl-scenes .tl-track"), { targetPosition: { x: target.x - box.x + 3, y: 20 } });
    await page.getByRole("button", { name: "Scenes", exact: true }).click();
    await expect(badges).toHaveText(["Summary", "Canvas", "Title", "Steps"]);

    // The command palette adds a scene.
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Commands" }).fill("add scene quick question");
    await page.keyboard.press("Enter");
    await expect(page.locator(".board .card")).toHaveCount(5);
    await expect(page.locator(".status")).toHaveText("Saved");

    // Export downloads the lesson file; importing it makes a copy with the same scenes.
    await page.keyboard.press("r");
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    const path = await file.path();
    const saved = JSON.parse(await (await import("node:fs/promises")).readFile(path!, "utf8"));
    expect(saved.scenes.scenes.length).toBe(5);
    await page.keyboard.press("Escape");

    // Zoom: actual size is 1280 px wide; Space+drag pans; Ctrl+0 fits again.
    await page.locator(".bar h1").click();
    await page.keyboard.press("Control+1");
    await expect(page.locator(".stage-wrap")).toHaveAttribute("style", /width:\s*1280px/);
    const board = page.locator(".pasteboard");
    const b = (await board.boundingBox())!;
    const before = await board.evaluate((el) => el.scrollLeft);
    await page.keyboard.down("Space");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 150, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    expect(await board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 100);
    await page.keyboard.press("Control+0");
    await expect(page.getByRole("combobox", { name: "Zoom" })).toHaveValue("fit");
    await page.screenshot({ path: `e2e/screenshots/editor-${info.project.name}.png` });

    await page.goto(STUDIO);
    await page.getByRole("button", { name: "+ New lesson" }).click();
    await page.getByRole("radio", { name: "A lesson file" }).click();
    await page.getByLabel("Lesson file (JSON)").setInputFiles(path!);
    await expect(page).toHaveURL(/\/lessons\/editor-[a-z0-9]+$/);
    await expect(page.locator(".board .card")).toHaveCount(5);
  });

  test("the canvas: snapping guides while moving, eight handles, rotation, layers", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "Desktop only.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await newLesson(page, "Canvas", "اللوحة");
    await page.getByRole("button", { name: "+ Add a scene" }).click();
    await page.getByRole("group", { name: "Choose a scene type" }).getByRole("button", { name: "Canvas" }).click();
    await page.getByRole("toolbar", { name: "Add an element" }).getByRole("button", { name: "Box" }).click();
    await expect(page.locator(".sel-name")).toHaveText("rect");
    const width = page.getByLabel("Width", { exact: true });
    const turn = page.getByLabel("Turn (°)", { exact: true });

    // Drag the box towards the middle of the stage: a guide appears as its centre lines up with the stage's.
    const ov = (await page.locator(".overlay").boundingBox())!;
    const sel = (await page.locator(".sel").boundingBox())!;
    await page.mouse.move(sel.x + sel.width / 2, sel.y + sel.height / 2);
    await page.mouse.down();
    await page.mouse.move(ov.x + ov.width / 2 + 3, sel.y + sel.height / 2 + 20, { steps: 8 });
    await expect(page.locator(".snap-guide").first()).toBeVisible();
    await page.mouse.up();
    await expect(page.locator(".status")).toHaveText("Saved");
    const after = (await page.locator(".sel").boundingBox())!;
    expect(Math.abs(after.x + after.width / 2 - (ov.x + ov.width / 2))).toBeLessThan(2);

    // Widen it with the right-hand handle.
    const w0 = Number(await width.inputValue());
    const e = (await page.locator(".grip.h-e").boundingBox())!;
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(e.x + 80, e.y + e.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Number(await width.inputValue())).toBeGreaterThan(w0 + 60);

    // Turn it with the rotation handle, 15° at a time with Shift.
    const r = (await page.locator(".rot").boundingBox())!;
    const box = (await page.locator(".sel").boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width + 150, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect.poll(async () => Number(await turn.inputValue())).toBe(90);

    // Layers lists it; the timeline's row for it is there too.
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    await expect(page.locator(".layers li.on")).toContainText("rect");
    await page.screenshot({ path: `e2e/screenshots/canvas-${info.project.name}.png` });
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

// The public homepage needs no emulators: it loads no Firebase until someone signs in.
test("the homepage: a real lesson plays, turns right to left in Arabic, and no Firebase loads before sign-in", async ({ page }, info) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.goto(STUDIO);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Animated lessons");
  // It plays only while on screen.
  await expect(page.locator(".hp-host .ls-player")).toHaveCount(1);
  await page.locator(".hp-frame").scrollIntoViewIfNeeded();
  const time = page.locator(".hp-host .ls-time");
  await expect.poll(async () => (await time.textContent()) ?? "", { timeout: 20_000 }).not.toMatch(/^0:00 /);
  await page.getByRole("radio", { name: "العربية" }).click();
  await expect(page.locator(".hp-host .ls-player")).toHaveAttribute("dir", "rtl");
  await page.getByRole("radio", { name: "Low-end phone" }).click();
  await expect(page.locator(".hp-host .ls-player")).toHaveAttribute("data-tier", "lite");
  expect(urls.filter((u) => /firebase|studio\.tsx|googleapis/.test(u))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({ path: `e2e/screenshots/home-${info.project.name}.png` });
});
