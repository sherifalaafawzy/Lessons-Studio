/**
 * The networks and the internet pack's renderers (topology, sequence, layers, packet): a chunk the player loads only
 * for lessons that use them (packs.ts). Rules: every frame a pure function of its KitState; transform and opacity for
 * motion; no SVG ids; text isolated in right-to-left languages; CSS classes prefixed with "pn-".
 */
import type { Kit } from "../../templates/types.ts";
import { layers } from "./layers.ts";
import { packet } from "./packet.ts";
import { sequence } from "./sequence.ts";
import { topology } from "./topology.ts";

// Old phones: no filters or blur, hard edges. The halo behind labels (pn-h) is a stroke painted under the letters.
const CSS = `
.pn text{font-family:var(--ls-font);font-weight:700;fill:var(--ls-fg)}
.pn .pn-m,.pn .pn-ll{fill:var(--ls-muted)}
.pn-h{paint-order:stroke;stroke:var(--ls-bg);stroke-width:8px;stroke-linejoin:round}
.pn-gl{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}
.pn-c{fill:var(--ls-card);stroke:var(--ls-fg);stroke-width:3.5}
.pn-d.is-on .pn-c,.pn-p.is-on .pn-c,.pn-ly.is-on .pn-c,.pn-f.is-on .pn-c{stroke:var(--ls-accent);stroke-width:8}
.pn-d.is-down .pn-c{stroke:var(--ls-muted);stroke-dasharray:9 7}.pn-d.is-down .pn-gl{color:var(--ls-muted)}
.pn-x circle{fill:var(--ls-danger)}.pn-x path{fill:none;stroke:var(--ls-bg);stroke-width:4;stroke-linecap:round}
.pn-l{fill:none;stroke:var(--ls-fg);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.pn-l.is-w{stroke:var(--ls-accent);stroke-dasharray:12 11}.pn-l.is-down{stroke:var(--ls-danger);stroke-dasharray:5 11}
.pn-ring circle{fill:none;stroke:var(--ls-accent);stroke-width:3;stroke-dasharray:7 9}
.pn-ring circle+circle{stroke-opacity:.7}.pn-ring circle+circle+circle{stroke-opacity:.45}
.pn-z{color:var(--ls-muted)}.pn-z rect{fill:none;stroke:currentColor;stroke-width:3;stroke-dasharray:12 9}
.pn-rt{stroke-width:11;stroke-linecap:round;stroke-opacity:.8}
.pn-pk circle,.pn-tag{stroke:var(--ls-fg);stroke-width:3}
.pn-life{stroke:var(--ls-muted);stroke-width:3;stroke-dasharray:8 9}
.pn-ln{fill:none;stroke:currentColor;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
.pn-msg.is-reply .pn-ln{stroke-dasharray:12 9}.pn-hd{fill:currentColor}
.pn-n circle{fill:var(--ls-card);stroke:currentColor;stroke-width:3.5}
.pn-msg.is-on{color:var(--ls-accent)}.pn-msg.is-on .pn-ln{stroke-width:7}.pn-msg.is-on .pn-n circle{fill:var(--ls-accent)}
.pn-msg.is-on .pn-n text{fill:var(--ls-on-accent)}.pn .pn-msg.is-on .pn-ml{fill:var(--ls-hi-fg)}
.pn-note{stroke:var(--ls-fg);stroke-width:2.5}
.pn-ly.is-act .pn-c{stroke:var(--ls-accent);stroke-width:6;fill:var(--ls-surface)}
.pn-lk.is-act .pn-l{stroke:var(--ls-accent)}
.pn-ptr{stroke:var(--ls-accent);stroke-width:4;stroke-dasharray:6 6}
.pn-ch rect{stroke:var(--ls-fg);stroke-width:2.5}.pn-ch.is-pay rect{fill:var(--ls-card)}.pn-ch.is-on rect{stroke-width:6}
.pn-gr path{fill:none;stroke:currentColor;stroke-width:4}
.pn-v,.pn-enc{font-variant-numeric:tabular-nums}.pn-well{fill:var(--ls-fg)}.pn .pn-enc{fill:var(--ls-bg)}
.pn-eye{color:var(--ls-muted)}.pn-lock{color:var(--ls-ok)}
`;

export const kit: Kit = { draw: { topology, sequence, layers, packet }, css: CSS };
