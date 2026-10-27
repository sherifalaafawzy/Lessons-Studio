import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));

// The studio. Settings come from the repository's .env.local (VITE_ variables only): the Firebase web config,
// or VITE_EMULATORS=1 for the local emulators (npm run emulators), which is also the default without a config.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: repo,
  // public/lib/ is the shared library (cast, icons) that lessons refer to as @lib/...
  publicDir: "public",
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  server: { port: 4330, strictPort: true, fs: { allow: [repo] } },
  preview: { port: 4330, strictPort: true },
  build: {
    target: "es2020",
    outDir: "dist",
    rolldownOptions: {
      output: {
        // Firebase is most of the weight: one cacheable chunk that changes only when the SDK does.
        codeSplitting: {
          groups: [{ name: "firebase", test: /node_modules[\\/](?:@firebase|firebase|idb)[\\/]/ }],
        },
      },
    },
  },
});
