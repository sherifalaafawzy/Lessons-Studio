import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { MemoryStore } from "@lessonstudio/ops";
import { loadConfig } from "../src/config.ts";
import { buildServer } from "../src/mcp.ts";
import { closeRenderer } from "../src/render.ts";
import { FileStore } from "../src/stores/file.ts";

type Result = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };

async function connect(store = new MemoryStore(), uid = "teacher") {
  const config = { ...loadConfig({ LS_STORE: "file", LS_DATA_DIR: tmpdir() }) };
  const server = buildServer({ store, config }, { uid, via: "mcp:test" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result;
  const json = (r: Result) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);
  return { client, call, json, store };
}

afterAll(async () => { await closeRenderer(); });

describe("MCP server", () => {
  it("offers the tools, resources and prompts an AI needs", async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([
      "add_scene", "animate_element", "create_lesson", "edit_lesson", "estimate_cost", "get_lesson", "list_lessons",
      "preview_lesson", "render_frame", "undo", "validate_lesson",
    ]);
    const edit = (await client.listTools()).tools.find((t) => t.name === "edit_lesson")!;
    expect(JSON.stringify(edit.inputSchema)).toContain("setKeyframe");
    const preview = (await client.listTools()).tools.find((t) => t.name === "preview_lesson")!;
    expect(JSON.stringify(preview._meta)).toContain("ui://lessonstudio/preview.html");
    const guide = await client.readResource({ uri: "lessonstudio://guide" });
    expect(String((guide.contents[0] as { text: string }).text)).toContain("word anchor".split(" ")[0]);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort();
    expect(prompts).toEqual(["storyboard_lesson", "translate_lesson"]);
  });

  it("builds an animated two-language lesson from start to finish", async () => {
    const { call, json } = await connect();
    const made = json(await call("create_lesson", {
      title: { en: "How a password manager helps", ar: "كيف يساعد مدير كلمات المرور" },
      languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }],
    }));
    expect(made.id).toBe("how-a-password-manager-helps");

    const scene = json(await call("add_scene", {
      lesson: made.id, template: "canvas", id: "vault",
      narration: { en: "The manager keeps every password in one locked vault.", ar: "يحفظ المدير كل كلمات المرور في خزنة واحدة مقفلة." },
      content: { elements: [
        { id: "vault", type: "shape", shape: "rect", x: 440, y: 200, w: 400, h: 300, stroke: "accent", strokeWidth: 6 },
        { id: "lock", type: "icon", icon: "lock", x: 590, y: 300, w: 100, h: 100 },
        { id: "label", type: "text", x: 440, y: 540, size: 36, text: { en: "One vault", ar: "خزنة واحدة" } },
      ] },
    }));
    expect(scene.errors).toEqual([]);

    const anim = json(await call("animate_element", { lesson: made.id, scene: "vault", element: "lock", preset: "pop", at: { en: "locked", ar: "مقفلة" } }));
    expect(anim.errors).toEqual([]);
    expect(anim.warnings.filter((w: string) => w.startsWith("keyWordMissing"))).toEqual([]);

    // A batch through edit_lesson, with a word anchor and a draw.
    const edited = json(await call("edit_lesson", { lesson: made.id, ops: [
      { op: "animate", scene: "vault", element: "vault", preset: "draw", at: 0.2 },
      { op: "animate", scene: "vault", element: "label", preset: "type", at: { word: { en: "vault", ar: "خزنة" } } },
    ] }));
    expect(edited.errors).toEqual([]);

    const got = json(await call("get_lesson", { lesson: made.id }));
    expect(got.summary.scenes.map((s: { id: string }) => s.id)).toEqual(["intro", "vault"]);
    expect(got.summary.scenes[1].elements.find((e: { id: string }) => e.id === "lock").animated).toEqual(["scale", "opacity"]);

    const v = json(await call("validate_lesson", { lesson: made.id }));
    expect(v.errors).toEqual([]);
  });

  it("offers the packs' pages: the contract, science, and every pack page that exists", async () => {
    const { client } = await connect();
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    const root = join(fileURLToPath(new URL("../../../", import.meta.url)), "docs");
    const pages = existsSync(join(root, "packs")) ? readdirSync(join(root, "packs")).filter((f) => f.endsWith(".md")).map((f) => `lessonstudio://docs/packs/${f.slice(0, -3)}`) : [];
    expect(uris).toEqual(expect.arrayContaining(["lessonstudio://docs/packs", "lessonstudio://docs/science", ...pages]));
    const contract = String(((await client.readResource({ uri: "lessonstudio://docs/packs" })).contents[0] as { text: string }).text);
    expect(contract).toBe(readFileSync(join(root, "packs.md"), "utf8"));
    const guide = String(((await client.readResource({ uri: "lessonstudio://guide" })).contents[0] as { text: string }).text);
    for (const w of ["## Technology packs", "lessonstudio://docs/packs/<id>", "`searchtree`", "`topology`"]) expect(guide).toContain(w);
  });

  it("adds and animates the science elements: an equation, a plot, a network and a model diagram", async () => {
    const { client, call, json } = await connect();
    const tools = (await client.listTools()).tools;
    expect(JSON.stringify(tools.find((t) => t.name === "edit_lesson")!.inputSchema)).toMatch(/"frame","focus","pass"/);
    expect(tools.find((t) => t.name === "animate_element")!.description).toMatch(/train \(.*forward \(.*backward \(/);
    const example = await client.readResource({ uri: "lessonstudio://examples/inside-a-neural-network" });
    const ex = JSON.parse(String((example.contents[0] as { text: string }).text));
    expect(ex.scenes.scenes.some((s: { content: { elements?: { type: string }[] } }) => s.content.elements?.some((e) => e.type === "arch"))).toBe(true);
    const guide = String(((await client.readResource({ uri: "lessonstudio://guide" })).contents[0] as { text: string }).text);
    for (const w of ["\\g{n}", "\\c{tone}", "\\w{key}", "sigmoid", "\"pass\"", "backward"]) expect(guide).toContain(w);

    const { id } = json(await call("create_lesson", { title: { en: "Inside a model", ar: "داخل نموذج" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }] }));
    const added = json(await call("add_scene", {
      lesson: id, template: "canvas", id: "model",
      narration: { en: "The line fits the points. Data flows forward, and attention looks at every word.", ar: "يقترب الخط من النقاط. تتدفق البيانات إلى الأمام، وينظر الانتباه إلى كل كلمة." },
      content: { elements: [
        { id: "eq", type: "math", x: 40, y: 20, w: 600, h: 100, tex: "\\g{1}{y} = \\g{2}{a x + b}" },
        { id: "fit", type: "plot", x: 40, y: 130, w: 600, h: 400, xr: [0, 4], yr: [0, 4], series: [{ kind: "dots", pts: [[1, 1], [2, 2.2], [3, 2.8]] }, { kind: "fn", fn: "a*x + b", params: [[0, 1], [0.5, 0.6], [0.9, 0.1]] }] },
        { id: "net", type: "net", x: 680, y: 20, w: 560, h: 300, layers: [2, 3, 1] },
        { id: "tf", type: "arch", x: 680, y: 340, w: 560, h: 340, blocks: [{ id: "tok", kind: "input", label: { en: "Tokens", ar: "الرموز" } }, { id: "att", kind: "attn", label: { en: "Attention", ar: "الانتباه" } }], edges: [{ from: "tok", to: "att" }] },
      ] },
    }));
    expect(added.errors).toEqual([]);
    const on = (en: string, ar: string) => ({ en, ar });
    expect(json(await call("animate_element", { lesson: id, scene: "model", element: "fit", preset: "train", at: on("fits", "يقترب") })).errors).toEqual([]);
    expect(json(await call("animate_element", { lesson: id, scene: "model", element: "net", preset: "forward", at: on("forward", "الأمام") })).errors).toEqual([]);
    const refused = await call("animate_element", { lesson: id, scene: "model", element: "eq", preset: "train", at: 0 });
    expect(refused.isError).toBe(true);
    const edited = json(await call("edit_lesson", { lesson: id, ops: [
      { op: "setKeyframe", scene: "model", element: "tf", prop: "focus", key: { at: { word: on("attention", "الانتباه") }, value: 2, ease: "step" } },
      { op: "animate", scene: "model", element: "eq", preset: "type", at: { word: on("line", "الخط") } },
    ] }));
    expect(edited.errors).toEqual([]);
    expect(edited.warnings.filter((w: string) => w.startsWith("keyWordMissing"))).toEqual([]);
    const got = json(await call("get_lesson", { lesson: id }));
    const animated = Object.fromEntries(got.summary.scenes[1].elements.map((e: { id: string; animated?: string[] }) => [e.id, e.animated]));
    expect(animated).toEqual({ eq: ["reveal"], fit: ["frame"], net: ["pass"], tf: ["focus"] });
    // The frame renderer's player draws them too (its science kit is in the same bundle), where there is a browser.
    if (loadConfig({ ...process.env, LS_STORE: "file" }).chromiumPath) {
      const f = await call("render_frame", { lesson: id, scene: "model", lang: "ar" });
      expect(f.isError).toBeFalsy();
      expect(f.content.find((c) => c.type === "image")!.mimeType).toBe("image/png");
    }
  }, 60_000);

  it("explains a bad edit and changes nothing, and undoes its own edits", async () => {
    const { call, json } = await connect();
    const { id } = json(await call("create_lesson", { title: "Undo test", languages: [{ code: "en", name: "English" }] }));
    const bad = await call("edit_lesson", { lesson: id, ops: [{ op: "removeScene", scene: "nope" }] });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toMatch(/No scene "nope"/);
    const refused = await call("edit_lesson", { lesson: id, ops: [{ op: "explode" }] });
    expect(refused.isError).toBe(true);

    json(await call("edit_lesson", { lesson: id, ops: [{ op: "setNarration", scene: "intro", lang: "en", text: "Changed." }] }));
    const undone = json(await call("undo", { lesson: id }));
    expect(undone.undone).toBe(1);
    expect(json(await call("get_lesson", { lesson: id, full: true })).lesson.scenes.scenes[0].narration.en).toBe("Undo test.");
  });

  it("keeps each person to their own lessons", async () => {
    const store = new MemoryStore();
    const a = await connect(store, "alice");
    const b = await connect(store, "bob");
    const { id } = a.json(await a.call("create_lesson", { title: "Private", languages: [{ code: "en", name: "English" }] }));
    const r = await b.call("get_lesson", { lesson: id });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/Not allowed/);
    expect(b.json(await b.call("list_lessons"))).toEqual([]);
  });

  it("gives the preview the whole package to play", async () => {
    const { call, json } = await connect();
    const { id } = json(await call("create_lesson", { title: { en: "Preview", ar: "معاينة" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }] }));
    const r = await call("preview_lesson", { lesson: id, lang: "ar" });
    const pkg = r.structuredContent!.package as { manifest: { id: string }; timing: Record<string, unknown> };
    expect(pkg.manifest.id).toBe(id);
    expect(Object.keys(pkg.timing).sort()).toEqual(["ar", "en"]);
    expect(r.structuredContent!.lang).toBe("ar");
  });

  it("estimates narration cost and download size", async () => {
    const { call, json } = await connect();
    const { id } = json(await call("create_lesson", { title: "Cost", languages: [{ code: "en", name: "English" }] }));
    const [en] = json(await call("estimate_cost", { lesson: id }));
    expect(en.lang).toBe("en");
    expect(en.costBatchUSD).toBeGreaterThan(0);
    expect(en.downloadKB).toBeGreaterThan(0);
  });

  it("renders a frame with the real player", async () => {
    const config = loadConfig({ ...process.env, LS_STORE: "file" });
    if (!config.chromiumPath) return;
    const dir = mkdtempSync(join(tmpdir(), "ls-"));
    try {
      const { call, json } = await connect(new FileStore(dir) as never);
      const { id } = json(await call("create_lesson", { title: { en: "Frame", ar: "إطار" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }] }));
      const r = await call("render_frame", { lesson: id, lang: "ar" });
      expect(r.isError).toBeFalsy();
      const img = r.content.find((c) => c.type === "image")!;
      expect(img.mimeType).toBe("image/png");
      expect(Buffer.from(img.data!, "base64").subarray(1, 4).toString()).toBe("PNG");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
