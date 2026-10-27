// Gives an account access to the private studio (the `studio` claim the Firestore rules and the functions require),
// or takes it away. Only the Admin SDK can set claims, so access can't be given from a browser.
//   node scripts/grant-access.mjs <email> [--revoke] [--emulator]
// Uses this PC's Google Cloud login (application default credentials) for the project in .firebaserc. The person
// gets in on their next page load (the studio refreshes its token at sign-in).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const revoke = args.includes("--revoke");
const emulator = args.includes("--emulator");
if (!email) {
  console.error("Usage: node scripts/grant-access.mjs <email> [--revoke] [--emulator]");
  process.exit(1);
}
const rc = JSON.parse(readFileSync(fileURLToPath(new URL("../.firebaserc", import.meta.url)), "utf8"));
const projectId = emulator ? rc.projects.emulators : rc.projects.default;
if (emulator) process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9399";
// A personal Google login needs a project to bill Identity Toolkit calls to.
else process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
const auth = getAuth(initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) }));

const u = await auth.getUserByEmail(email);
const claims = { ...(u.customClaims ?? {}) };
if (revoke) delete claims.studio;
else claims.studio = true;
await auth.setCustomUserClaims(u.uid, claims);
// Sessions already open lose access at once on revoke: their refresh tokens stop working.
if (revoke) await auth.revokeRefreshTokens(u.uid);
console.log(`${projectId}: ${email} ${revoke ? "no longer has" : "has"} access to the studio.`);
process.exit(0);
