import { afterAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import type { LessonPackage } from "@lessonstudio/spec";
import { loadConfig } from "../src/config.ts";
import { previewHtml } from "../src/preview/html.ts";
import { loadExample } from "../../../scripts/lib/examples.mjs";

let browser: Browser | null = null;
afterAll(async () => { await browser?.close(); });

/**
 * A stand-in for Claude or ChatGPT: it frames the preview as MCP Apps hosts do, answers ui/initialize,
 * then sends the preview_lesson result, and records what the view sends back.
 */
const HOST = `<!doctype html><html><body><iframe id="f" sandbox="allow-scripts" style="width:900px;height:700px;border:0"></iframe><script>
window.log = [];
const f = document.getElementById("f");
window.addEventListener("message", (e) => {
  const m = e.data; window.log.push(m.method || "response");
  if (m.method === "ui/initialize") {
    f.contentWindow.postMessage({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "fake", version: "1" }, hostCapabilities: {}, hostContext: {} } }, "*");
  }
  if (m.method === "ui/notifications/initialized") {
    f.contentWindow.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [], structuredContent: window.result } }, "*");
  }
  if (m.method === "ui/notifications/size-changed") window.height = m.params.height;
});
window.start = (html, result) => { window.result = result; f.srcdoc = html; };
</script></body></html>`;

describe("in-chat preview (MCP Apps)", () => {
  it("shakes hands with the host, then plays the lesson it is sent", async () => {
    const config = loadConfig({ ...process.env, LS_STORE: "file" });
    if (!config.chromiumPath) return;
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ executablePath: config.chromiumPath });
    const page = await browser.newPage();
    await page.setContent(HOST);
    const { pkg } = loadExample("how-ai-learns") as { pkg: LessonPackage };
    await page.evaluate(([html, p]) => (window as any).start(html, { package: p, lang: "ar" }), [await previewHtml(), pkg] as const);
    const frame = page.frameLocator("#f");
    await frame.locator("#p .ls-player").waitFor({ timeout: 10_000 });
    expect(await frame.locator("#p .ls-player").getAttribute("dir")).toBe("rtl");
    const log: string[] = await page.evaluate(() => (window as any).log);
    expect(log.slice(0, 2)).toEqual(["ui/initialize", "ui/notifications/initialized"]);
    await expect.poll(() => page.evaluate(() => (window as any).height ?? 0)).toBeGreaterThan(300);
    // Play it: the clock runs inside the host's frame.
    await frame.locator("#p .ls-bigplay").click();
    await page.waitForTimeout(1200);
    const playing = await page.frames()[1]!.evaluate(() => {
      const t = document.querySelector("#p")!.shadowRoot!.querySelector(".ls-time")!.textContent;
      return t;
    });
    expect(playing).toMatch(/^0:01 \//);
  }, 60_000);
});
