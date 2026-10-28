// Settings the first screen needs without loading Firebase.
const env = import.meta.env;

/** The local emulators (npm run emulators) unless a Firebase web config is set. */
export const emulators = env.VITE_EMULATORS === "1" || !env.VITE_FIREBASE_API_KEY;

/** Where AI apps connect: this project's Hosting address, or the server on this PC when on the emulators. */
export function mcpAddress(): string {
  const project = env.VITE_FIREBASE_PROJECT_ID;
  return emulators || !project ? "http://127.0.0.1:4320/mcp" : `https://${project}.web.app/mcp`;
}

/** The shared library (@lib/ paths), served by this same site, so the studio works offline on the dev server too. */
export const LIBRARY = typeof location !== "undefined" ? new URL("/lib/", location.origin).href : "https://lessons-studio-6b509.web.app/lib/";

/**
 * Where lessons' media (their narration) is fetched from: the Storage bucket's download address, which `mediaResolver`
 * (packages/ops) completes with an object name. On the emulators, the Storage emulator's default bucket.
 */
export function mediaBucketUrl(): string {
  return emulators
    ? `http://127.0.0.1:${env.VITE_STORAGE_EMULATOR_PORT ?? 9289}/v0/b/demo-lessonstudio.appspot.com/o/`
    : `https://firebasestorage.googleapis.com/v0/b/${env.VITE_FIREBASE_STORAGE_BUCKET}/o/`;
}

/** Whether this browser had someone signed in last time: then the studio (and Firebase) loads straight away. */
export function hadSession(): boolean {
  try { return localStorage.getItem("ls-session") === "1"; } catch { return false; }
}
export function rememberSession(on: boolean): void {
  try { if (on) localStorage.setItem("ls-session", "1"); else localStorage.removeItem("ls-session"); } catch { /* private mode */ }
}
