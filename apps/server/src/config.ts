import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The repository; in the Cloud Functions bundle (functions/build.mjs defines LS_BUNDLED), the folder beside the bundle.
export const ROOT = fileURLToPath(new URL(process.env.LS_BUNDLED ? "./" : "../../../", import.meta.url));

export interface Config {
  port: number;
  /** The public address through ngrok, e.g. "https://lessonstudio.ngrok.app". Absent: this PC only. */
  publicUrl?: string;
  /** Where the studio runs, for links in tool results. */
  studioUrl?: string;
  /** "firestore" once the Firebase project is set up; "file" keeps lessons in .data/lessons on this PC. */
  store: "firestore" | "file";
  dataDir: string;
  /** The account local clients (stdio, or HTTP from this PC) act as. */
  localUid: string;
  /** Google accounts allowed to sign in through OAuth (lower case). */
  allowedEmails: string[];
  /** Signs MCP access tokens. Required when publicUrl is set. */
  tokenSecret?: string;
  /**
   * Lets sign-in be approved with a passcode instead of a Google account, signing in as localUid
   * (for trying the online MCP before the Firebase project exists). At least 12 characters.
   */
  approvePasscode?: string;
  firebaseProject?: string;
  /** A service-account key file; else application-default credentials or the emulator. */
  firebaseKeyFile?: string;
  /** The Firebase web config the sign-in page needs (apiKey and authDomain). */
  firebaseWeb?: { apiKey: string; authDomain: string; projectId: string };
  chromiumPath?: string;
  /** Express "trust proxy": "loopback" behind ngrok on this PC; true in Cloud Functions, behind Google's front end. */
  trustProxy: boolean | string;
}

/** The newest Playwright Chromium on this machine, when CHROMIUM_PATH isn't set. */
function findChromium(): string | undefined {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    for (const exe of [
      "chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win/chrome.exe", "chrome-win64/chrome.exe",
      "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/chrome",
    ]) {
      const p = join(base, d, exe);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicUrl = env.LS_PUBLIC_URL?.replace(/\/+$/, "") || undefined;
  const keyFile = env.LS_FIREBASE_KEY ?? (existsSync(join(ROOT, ".secrets", "firebase-admin.json")) ? join(ROOT, ".secrets", "firebase-admin.json") : undefined);
  const firestore = env.LS_STORE ? env.LS_STORE === "firestore" : !!(keyFile || env.FIRESTORE_EMULATOR_HOST);
  const c: Config = {
    port: Number(env.LS_PORT ?? 4320),
    store: firestore ? "firestore" : "file",
    dataDir: env.LS_DATA_DIR ?? join(ROOT, ".data"),
    localUid: env.LS_LOCAL_UID ?? "local",
    allowedEmails: (env.LS_ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    trustProxy: env.LS_TRUST_PROXY === "1" ? true : "loopback",
  };
  if (publicUrl) c.publicUrl = publicUrl;
  if (env.LS_STUDIO_URL) c.studioUrl = env.LS_STUDIO_URL.replace(/\/+$/, "");
  if (env.MCP_TOKEN_SECRET) c.tokenSecret = env.MCP_TOKEN_SECRET;
  if (env.LS_APPROVE_PASSCODE) {
    if (env.LS_APPROVE_PASSCODE.length < 12) throw new Error("LS_APPROVE_PASSCODE must be at least 12 characters.");
    c.approvePasscode = env.LS_APPROVE_PASSCODE;
  }
  if (env.LS_FIREBASE_PROJECT) c.firebaseProject = env.LS_FIREBASE_PROJECT;
  if (keyFile) c.firebaseKeyFile = keyFile;
  if (env.LS_FIREBASE_API_KEY && env.LS_FIREBASE_AUTH_DOMAIN) {
    c.firebaseWeb = { apiKey: env.LS_FIREBASE_API_KEY, authDomain: env.LS_FIREBASE_AUTH_DOMAIN, projectId: env.LS_FIREBASE_PROJECT ?? "" };
  }
  const chromium = env.CHROMIUM_PATH ?? findChromium();
  if (chromium) c.chromiumPath = chromium;
  if (c.publicUrl && (!c.tokenSecret || c.tokenSecret.length < 32)) {
    throw new Error("LS_PUBLIC_URL is set, so MCP_TOKEN_SECRET must be set too (32 characters or more) to sign access tokens.");
  }
  return c;
}
