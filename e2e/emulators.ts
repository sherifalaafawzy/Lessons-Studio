// Where the e2e tests find the Firebase emulators: npm run emulators' ports, or another suite's, given as
// LS_E2E_PORTS=auth,firestore,functions,storage (playwright.config.ts passes the same ports to the studio).
const [auth, firestore, functions, storage] = (process.env.LS_E2E_PORTS ?? "9399,8280,5401,9289").split(",");

export const AUTH = `127.0.0.1:${auth}`;
export const FIRESTORE = `127.0.0.1:${firestore}`;
export const FUNCTIONS = `127.0.0.1:${functions}`;
export const STORAGE = `127.0.0.1:${storage}`;
