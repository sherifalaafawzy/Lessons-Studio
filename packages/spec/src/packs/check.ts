/** Sends each pack element to its pack's validator. */
import { check as code } from "./code/check.ts";
import { check as data } from "./data/check.ts";
import { check as iot } from "./iot/check.ts";
import { check as network } from "./network/check.ts";
import { check as opt } from "./opt/check.ts";
import { packOf, type PackId } from "./registry.ts";
import type { PackCheck, PackCheckCtx } from "./types.ts";

const CHECKS: Partial<Record<PackId, PackCheck>> = { code, data, iot, network, opt };

/** Validates a technology pack's element (not the science pack's, which validate.ts checks itself). */
export function checkPackElement(el: { type: string } & Record<string, unknown>, q: string, c: PackCheckCtx): void {
  const id = packOf(el.type);
  const check = id ? CHECKS[id] : undefined;
  if (check) check(el, q, c);
}
