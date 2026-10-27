// AI keys, per person: sealed with AES-256-GCM under a key derived from the AI_KEYS_SECRET secret and the
// person's uid (so a sealed key only opens for its owner). The key itself never goes back to a client.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface Sealed { iv: string; data: string; tag: string }

export const PROVIDERS = ["gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];

const keyFor = (secret: string, uid: string): Buffer => Buffer.from(hkdfSync("sha256", secret, uid, "lessonstudio ai keys v1", 32));

export function seal(secret: string, uid: string, plain: string): Sealed {
  if (secret.length < 32) throw new Error("AI_KEYS_SECRET must be at least 32 characters.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(secret, uid), iv);
  c.setAAD(Buffer.from(uid));
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { iv: iv.toString("base64"), data: data.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

export function unseal(secret: string, uid: string, s: Sealed): string {
  const d = createDecipheriv("aes-256-gcm", keyFor(secret, uid), Buffer.from(s.iv, "base64"));
  d.setAAD(Buffer.from(uid));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]).toString("utf8");
}

/** What a key looks like before Google is asked: an error message, or null. */
export function keyShapeProblem(provider: string, key: string): string | null {
  if (!(PROVIDERS as readonly string[]).includes(provider)) return `Unknown provider "${provider}".`;
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(key)) return "That doesn't look like a Gemini API key. Copy it again from aistudio.google.com/apikey.";
  return null;
}

/** What a client may see about a stored key: that it is set, its last four characters, and when. */
export interface KeyStatus { set: boolean; last4?: string; setAt?: number }
export function statusOf(stored: { last4?: string; setAt?: number } | undefined): KeyStatus {
  return stored?.last4 ? { set: true, last4: stored.last4, ...(stored.setAt ? { setAt: stored.setAt } : {}) } : { set: false };
}
