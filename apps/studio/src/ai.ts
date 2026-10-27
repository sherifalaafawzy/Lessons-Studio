// The Cloud Functions the studio calls (functions/src/index.ts). The SDK for them loads only when first needed.
import type { Functions } from "firebase/functions";
import { app, emulators } from "./fb.ts";

let fns: Promise<Functions> | null = null;
function functions(): Promise<Functions> {
  fns ??= import("firebase/functions").then(({ getFunctions, connectFunctionsEmulator }) => {
    const f = getFunctions(app, "europe-west1");
    if (emulators) connectFunctionsEmulator(f, "127.0.0.1", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? 5401));
    return f;
  });
  return fns;
}

/** Calls a function; its error comes back as an Error with the function's own message. */
export async function call<T>(name: string, data: unknown = {}, timeout = 540_000): Promise<T> {
  const { httpsCallable } = await import("firebase/functions");
  try {
    return (await httpsCallable<unknown, T>(await functions(), name, { timeout })(data)).data;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    throw new CallError(err.code?.replace(/^functions\//, "") ?? "unknown", err.message ?? String(e));
  }
}

export class CallError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface KeyStatus { set: boolean; last4?: string; setAt?: number }
export interface AiStatus { gemini: KeyStatus; model: string; price: { input: number; output: number } }
export interface Exported { name: string; mp4: string; bytes: number; seconds: number }
export interface Drafted { id: string; attempts: number; warnings: number; usage: { input: number; output: number }; usd: number }

export { mcpAddress } from "./env.ts";
