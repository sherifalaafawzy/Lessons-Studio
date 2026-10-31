/** Every technology pack's design.json bodies, by name ({ "trace": {…} }, { "topology": {…} }, …). */
import { bodies as code } from "./code.ts";
import { bodies as data } from "./data.ts";
import { bodies as iot } from "./iot.ts";
import { bodies as network } from "./network.ts";
import { bodies as opt } from "./opt.ts";
import type { BodyBuilder } from "./types.ts";

export const PACK_BODIES: Record<string, BodyBuilder> = { ...code, ...data, ...iot, ...network, ...opt };
export type { BodyBuilder, BodyCtx, AText } from "./types.ts";
