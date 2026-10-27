import type { LessonStore } from "@lessonstudio/ops";
import type { Config } from "../config.ts";
import { FileStore } from "./file.ts";

/** The configured store: Firestore (the cloud project, or its emulator) or files on this PC. */
export async function openStore(c: Config): Promise<LessonStore> {
  if (c.store === "file") return new FileStore(c.dataDir);
  const { initializeApp, cert, applicationDefault, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { FirestoreStore } = await import("./firestore.ts");
  const app = getApps()[0] ?? initializeApp({
    ...(c.firebaseProject ? { projectId: c.firebaseProject } : {}),
    ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: c.firebaseKeyFile ? cert(c.firebaseKeyFile) : applicationDefault() }),
  });
  return new FirestoreStore(getFirestore(app));
}
