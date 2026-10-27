import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const cache = new Map<string, Promise<string>>();

/** Bundles browser code once per process: minified, one script, for pages the server builds (frames, previews). */
export function bundle(key: string, opts: { entry?: string; contents?: string; globalName?: string }): Promise<string> {
  let p = cache.get(key);
  if (!p) {
    p = build({
      ...(opts.entry ? { entryPoints: [opts.entry] } : { stdin: { contents: opts.contents ?? "", resolveDir: here, loader: "ts" } }),
      bundle: true,
      minify: true,
      format: "iife",
      target: "es2020",
      write: false,
      ...(opts.globalName ? { globalName: opts.globalName } : {}),
      logLevel: "silent",
    }).then((r) => r.outputFiles[0]!.text);
    cache.set(key, p);
  }
  return p;
}

/** The player as a global `LS.createPlayer`. */
export const playerScript = (): Promise<string> =>
  bundle("player", { contents: 'export { createPlayer } from "@lessonstudio/player";', globalName: "LS" });

/** Closes a script safely inside an HTML <script> element. */
export const inlineScript = (js: string): string => js.replace(/<\/script/gi, "<\\/script");
