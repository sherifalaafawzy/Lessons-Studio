import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const env = import.meta.env;

/** The local emulators (npm run emulators) unless a Firebase web config is set. */
export const emulators = env.VITE_EMULATORS === "1" || !env.VITE_FIREBASE_API_KEY;

export const app = initializeApp(
  emulators
    ? { apiKey: "demo-key", authDomain: "demo-lessonstudio.firebaseapp.com", projectId: "demo-lessonstudio" }
    : {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        appId: env.VITE_FIREBASE_APP_ID,
      },
);

export const auth = getAuth(app);
// The offline cache keeps the lesson on the device and queues an edit made without signal.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

if (emulators) {
  connectAuthEmulator(auth, `http://127.0.0.1:${env.VITE_AUTH_EMULATOR_PORT ?? 9399}`, { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", Number(env.VITE_FIRESTORE_EMULATOR_PORT ?? 8280));
}
