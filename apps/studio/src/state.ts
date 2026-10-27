import { signal } from "@preact/signals";
import type { User } from "firebase/auth";

export const user = signal<User | null | undefined>(undefined);
/** Whether the signed-in account may use the studio (its `studio` claim); undefined while that is checked. */
export const allowed = signal<boolean | undefined>(undefined);
export const route = signal(location.pathname);

export function go(path: string): void {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  route.value = path;
}
addEventListener("popstate", () => { route.value = location.pathname; });

/** A short message at the bottom of the screen. */
export const toast = signal<{ text: string; bad?: boolean } | null>(null);
let toastTimer = 0;
export function say(text: string, bad = false): void {
  toast.value = { text, bad };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = null; }, bad ? 6000 : 2500);
}
