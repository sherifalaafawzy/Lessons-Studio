import { defineConfig, type Connect } from "vite";
import { existsSync, readdirSync, readFile, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const examples = join(repo, "examples");

const TYPES: Record<string, string> = { json: "application/json", vtt: "text/vtt", opus: "audio/ogg", m4a: "audio/mp4", svg: "image/svg+xml", webp: "image/webp", avif: "image/avif" };

/** Serves the example packages at /examples/<id>/…, and a list of them at /examples/index.json. */
const serveExamples: Connect.NextHandleFunction = (req, res, next) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
  if (url.split("/").includes("..")) return next();
  if (url === "/index.json") {
    const list = readdirSync(examples)
      .filter((id) => existsSync(join(examples, id, "manifest.json")))
      .map((id) => {
        const m = JSON.parse(readFileSync(join(examples, id, "manifest.json"), "utf8"));
        return { id, title: m.title };
      });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify(list));
  }
  readFile(join(examples, url), (err, body) => {
    if (err) return next();
    const ext = url.split(".").pop() ?? "";
    res.setHeader("Content-Type", `${TYPES[ext] ?? "application/octet-stream"}${ext === "json" || ext === "vtt" ? "; charset=utf-8" : ""}`);
    res.setHeader("Accept-Ranges", "bytes");
    // Audio seeks with range requests, as it would from a CDN.
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (range && (range[1] || range[2])) {
      const size = body.length;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      return res.end(body.subarray(start, end + 1));
    }
    res.end(body);
  });
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  server: { port: 4310, strictPort: true, fs: { allow: [repo] } },
  preview: { port: 4310, strictPort: true },
  build: { target: "es2019", outDir: "dist" },
  plugins: [
    {
      name: "serve-examples",
      configureServer(server) {
        server.middlewares.use("/examples", serveExamples);
      },
      configurePreviewServer(server) {
        server.middlewares.use("/examples", serveExamples);
      },
    },
  ],
});
