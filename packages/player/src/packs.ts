/**
 * Where each technology pack's renderers come from: one dynamic import per pack, so a bundler makes each pack its own
 * file and a lesson downloads only the packs it uses (Player.ready waits for them). Hosts can pass their own loaders
 * (PlayerOptions.packs), e.g. from files they vendor.
 */
import type { PackId } from "@lessonstudio/spec/core";
import type { Kit } from "./templates/types.ts";

export const PACK_LOADERS: Record<PackId, () => Promise<Kit>> = {
  science: () => import("./science/index.ts").then((m) => m.kit),
  code: () => import("./packs/code/index.ts").then((m) => m.kit),
  data: () => import("./packs/data/index.ts").then((m) => m.kit),
  iot: () => import("./packs/iot/index.ts").then((m) => m.kit),
  network: () => import("./packs/network/index.ts").then((m) => m.kit),
  opt: () => import("./packs/opt/index.ts").then((m) => m.kit),
};
