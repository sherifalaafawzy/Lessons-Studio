import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";

/** Small records with an expiry (OAuth clients, codes and refresh tokens). Keys of secrets are hashes, never the secrets. */
export interface Kv {
  get<T>(col: string, key: string): Promise<T | null>;
  put(col: string, key: string, value: unknown, ttlMs?: number): Promise<void>;
  /** Reads and deletes in one step, so a one-time code can't be used twice. */
  take<T>(col: string, key: string): Promise<T | null>;
  del(col: string, key: string): Promise<void>;
}

interface Rec { v: unknown; exp?: number }

/** In a JSON file under the data folder (the file store). */
export class FileKv implements Kv {
  private path: string;
  private data: Record<string, Record<string, Rec>>;
  private now: () => number;

  constructor(dir: string, now: () => number = Date.now) {
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, "oauth.json");
    this.now = now;
    this.data = existsSync(this.path) ? JSON.parse(readFileSync(this.path, "utf8")) : {};
  }

  private save(): void {
    const t = this.now();
    for (const col of Object.values(this.data)) for (const [k, r] of Object.entries(col)) if (r.exp && r.exp < t) delete col[k];
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data));
    renameSync(`${this.path}.tmp`, this.path);
  }

  async get<T>(col: string, key: string): Promise<T | null> {
    const r = this.data[col]?.[key];
    return r && (!r.exp || r.exp >= this.now()) ? (r.v as T) : null;
  }
  async put(col: string, key: string, value: unknown, ttlMs?: number): Promise<void> {
    (this.data[col] ??= {})[key] = ttlMs ? { v: value, exp: this.now() + ttlMs } : { v: value };
    this.save();
  }
  async take<T>(col: string, key: string): Promise<T | null> {
    const v = await this.get<T>(col, key);
    if (this.data[col]?.[key]) {
      delete this.data[col][key];
      this.save();
    }
    return v;
  }
  async del(col: string, key: string): Promise<void> {
    if (this.data[col]?.[key]) {
      delete this.data[col][key];
      this.save();
    }
  }
}

/** In Firestore collections named oauth_<col> (only the server reads them; the rules deny everyone else). */
export class FirestoreKv implements Kv {
  private db: import("firebase-admin/firestore").Firestore;
  private now: () => number;

  constructor(db: import("firebase-admin/firestore").Firestore, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }
  private ref(col: string, key: string) {
    return this.db.collection(`oauth_${col}`).doc(key);
  }
  async get<T>(col: string, key: string): Promise<T | null> {
    const r = (await this.ref(col, key).get()).data() as Rec | undefined;
    return r && (!r.exp || r.exp >= this.now()) ? (r.v as T) : null;
  }
  async put(col: string, key: string, value: unknown, ttlMs?: number): Promise<void> {
    await this.ref(col, key).set(ttlMs ? { v: value, exp: this.now() + ttlMs } : { v: value });
  }
  async take<T>(col: string, key: string): Promise<T | null> {
    const ref = this.ref(col, key);
    return this.db.runTransaction(async (tx) => {
      const r = (await tx.get(ref)).data() as Rec | undefined;
      if (!r) return null;
      tx.delete(ref);
      return !r.exp || r.exp >= this.now() ? (r.v as T) : null;
    });
  }
  async del(col: string, key: string): Promise<void> {
    await this.ref(col, key).delete();
  }
}

export async function openKv(c: Config): Promise<Kv> {
  if (c.store === "file") return new FileKv(c.dataDir);
  const { getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  return new FirestoreKv(getFirestore(getApps()[0]!));
}
