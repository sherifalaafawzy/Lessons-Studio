import { defineConfig } from "@playwright/test";

// Playwright 1.64 expects its own Chromium build; CHROMIUM_PATH points at any installed Chromium or Chrome instead.
const executablePath = process.env.CHROMIUM_PATH;
// The emulators' ports (e2e/emulators.ts), for the studio too.
const [auth, firestore, functions, storage] = (process.env.LS_E2E_PORTS ?? "9399,8280,5401,9289").split(",");

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4311",
    // Tests start playback from script as well as by clicking, so allow sound without a gesture.
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"], ...(executablePath ? { executablePath } : {}) },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
  webServer: [
    {
      command: "npm run dev -w @lessonstudio/playground -- --port 4311",
      url: "http://localhost:4311",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The studio on the local emulators (npm run emulators); e2e/studio.spec.ts skips itself when they're down.
      command: "npm run dev -w @lessonstudio/studio -- --port 4331",
      url: "http://localhost:4331",
      env: { VITE_EMULATORS: "1", VITE_AUTH_EMULATOR_PORT: auth!, VITE_FIRESTORE_EMULATOR_PORT: firestore!, VITE_FUNCTIONS_EMULATOR_PORT: functions!, VITE_STORAGE_EMULATOR_PORT: storage! },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
