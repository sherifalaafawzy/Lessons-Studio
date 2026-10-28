// Bundles the functions into lib/index.js with esbuild: the shared packages, the MCP server from apps/server and
// the studio's scene gallery all go in; only firebase-functions and firebase-admin stay as installed packages.
// The browser scripts the MCP server builds on the fly on a PC (the player, the in-chat preview) are built here once
// and baked in, and the guide and the example lesson it reads are copied beside the bundle.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const server = `${root}apps/server/src/`;

const browser = { bundle: true, minify: true, format: "iife", target: "es2020", write: false, logLevel: "silent" };
const [player, preview] = await Promise.all([
  build({ ...browser, stdin: { contents: 'export { createPlayer } from "@lessonstudio/player";', resolveDir: server, loader: "ts" }, globalName: "LS" }),
  build({ ...browser, entryPoints: [`${server}preview/view.ts`] }),
]).then((r) => r.map((x) => x.outputFiles[0].text));

// apps/server/src/bundle.ts, with the scripts already built.
const prebuilt = {
  name: "prebuilt-browser-scripts",
  setup(b) {
    b.onResolve({ filter: /\/bundle\.ts$/ }, (a) => (a.importer.replace(/\\/g, "/").includes("apps/server/src") ? { path: "bundle", namespace: "prebuilt" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "prebuilt" }, () => ({
      loader: "js",
      contents: `const B = ${JSON.stringify({ player, preview })};
export const bundle = (key) => Promise.resolve(B[key]);
export const playerScript = () => Promise.resolve(B.player);
export const inlineScript = (js) => js.replace(/<\\/script/gi, "<\\\\/script");`,
    }));
  },
};

rmSync(`${here}lib`, { recursive: true, force: true });
await build({
  entryPoints: [`${here}src/index.ts`],
  outfile: `${here}lib/index.js`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  // Installed in the cloud, not bundled; exportVideo loads them only when it runs (esbuild only on a PC).
  external: ["firebase-functions", "firebase-functions/*", "firebase-admin", "firebase-admin/*", "playwright-core", "@sparticuz/chromium", "ffmpeg-static", "esbuild"],
  loader: { ".md": "text" },
  define: { "process.env.LS_BUNDLED": '"1"' },
  // Bundled CommonJS packages (express and friends) still call require for Node's own modules.
  banner: { js: "import { createRequire as __lsRequire } from 'node:module'; const require = __lsRequire(import.meta.url);" },
  plugins: [prebuilt],
  logLevel: "warning",
});
cpSync(`${server}guide.md`, `${here}lib/guide.md`);
// For exportVideo (src/video.ts): the player, the shared library and the Noto Sans web fonts.
writeFileSync(`${here}lib/player.js`, player);
cpSync(`${root}apps/studio/public/lib`, `${here}lib/library`, { recursive: true });
mkdirSync(`${here}lib/fonts`, { recursive: true });
for (const [pkg, file] of [["noto-sans", "noto-sans-latin-wght-normal.woff2"], ["noto-sans", "noto-sans-latin-ext-wght-normal.woff2"], ["noto-sans-arabic", "noto-sans-arabic-arabic-wght-normal.woff2"]]) {
  cpSync(`${root}node_modules/@fontsource-variable/${pkg}/files/${file}`, `${here}lib/fonts/${file}`);
}
mkdirSync(`${here}lib/examples`, { recursive: true });
cpSync(`${root}examples/how-ai-learns`, `${here}lib/examples/how-ai-learns`, { recursive: true });

// The real project's settings, from the repository's .env.local (one place for them): functions/.env.<project>,
// which Firebase loads into the functions' environment. All of it is public (the web config, the address);
// the secrets live in Secret Manager.
const local = existsSync(`${root}.env.local`) ? parseEnv(readFileSync(`${root}.env.local`, "utf8")) : {};
const project = local.LS_FIREBASE_PROJECT;
if (project) {
  const out = {
    LS_PUBLIC_URL: `https://${project}.web.app`,
    LS_FIREBASE_PROJECT: project,
    LS_FIREBASE_API_KEY: local.LS_FIREBASE_API_KEY ?? "",
    LS_FIREBASE_AUTH_DOMAIN: local.LS_FIREBASE_AUTH_DOMAIN ?? `${project}.firebaseapp.com`,
    LS_ALLOWED_EMAILS: local.LS_ALLOWED_EMAILS ?? "",
    LS_STUDIO_URL: local.LS_STUDIO_URL ?? `https://${project}.web.app`,
    // Where lessons' narration is kept (packages/ops mediaObject); exportVideo reads it from there.
    LS_MEDIA_BUCKET: local.VITE_FIREBASE_STORAGE_BUCKET ?? `${project}.firebasestorage.app`,
  };
  writeFileSync(`${here}.env.${project}`, `# Written by functions/build.mjs from .env.local; edit that instead.\n${Object.entries(out).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
}
console.log(`functions built: lib/index.js${project ? `, settings for ${project}` : ""}`);
