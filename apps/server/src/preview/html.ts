import { fileURLToPath } from "node:url";
import { bundle, inlineScript } from "../bundle.ts";

const entry = fileURLToPath(new URL("./view.ts", import.meta.url));

/** The MCP Apps view as one self-contained HTML document (scripts inline, as hosts expect). */
export async function previewHtml(): Promise<string> {
  const js = await bundle("preview", { entry });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lesson preview</title>
<style>body{margin:0;font:14px system-ui,sans-serif;background:transparent}#p{max-width:960px}#note{padding:6px 2px;color:#666}#note a{color:inherit}</style>
</head><body><div id="p"></div><div id="note">Loading the lesson…</div><script>${inlineScript(js)}</script></body></html>`;
}
