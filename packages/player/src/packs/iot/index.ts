/**
 * The electronics and iot pack's renderers (circuit, pinout, signal, gates, bits): a chunk the player loads only for lessons that use
 * them (packs.ts). Rules: every frame a pure function of its KitState; transform and opacity for motion; no SVG ids; text
 * through rich() in right-to-left languages; CSS classes prefixed with the pack's own letters.
 */
import type { Kit } from "../../templates/types.ts";
import { bits } from "./bits.ts";
import { circuit } from "./circuit.ts";
import { gates } from "./gates.ts";
import { pinout } from "./pinout.ts";
import { signal } from "./signal.ts";

// Old-phone rules: no filters or blur; glows are circles at low opacity; motion by transform and opacity.
const CSS = `
.pi text{font-family:var(--ls-font);fill:var(--ls-fg);font-weight:700}
.pi .pi-v{fill:var(--ls-hi-fg);font-weight:800}.pi .pi-bad{fill:var(--ls-danger)}.pi .pi-m{fill:var(--ls-muted);font-weight:600}
.pi .pi-on{fill:var(--ls-on-accent)}
.pi-w{fill:none;stroke:var(--ls-fg);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.pi-s{fill:var(--ls-card);stroke:var(--ls-fg);stroke-width:4.5;stroke-linejoin:round;stroke-linecap:round}
.pi .pi-n{fill:none}.pi-j{fill:var(--ls-fg)}
.pi-dot{fill:var(--ls-accent2);stroke:var(--ls-fg);stroke-width:2.5;stroke-linejoin:round}
.pi-a{stroke:var(--ls-fg);stroke-width:3.5;stroke-linecap:round}.pi-ah{fill:var(--ls-fg)}
.pi-g1{fill:currentColor;opacity:.2}.pi-g2{fill:currentColor;opacity:.35}.pi-lit{fill:currentColor;stroke:none}
.pi-red{color:var(--ls-danger)}.pi-green{color:var(--ls-ok)}.pi-yellow,.pi-white,.pi-lamp{color:var(--ls-accent2)}.pi-blue{color:#3d7dff}
.pi .pi-over{stroke:var(--ls-danger);stroke-width:7}.pi-x{fill:none;stroke:var(--ls-danger);stroke-width:7;stroke-linecap:round}
.pi-heat{fill:var(--ls-danger);stroke:none}.pi-plate{stroke-width:5}.pi-neg{stroke-width:11}.pi-lever{stroke-width:6}
.pi-base{stroke-width:6}.pi-wave{stroke-width:4}.pi-turn{fill:var(--ls-accent);stroke:var(--ls-fg);stroke-width:2}
.pi-tag{fill:var(--ls-surface)}.pi-lv{fill:var(--ls-card);stroke:var(--ls-fg);stroke-width:3}.pi .is-hi{fill:var(--ls-accent)}
.pi-part.is-on .pi-s{stroke:var(--ls-accent);stroke-width:7}.pi-part.is-on text{fill:var(--ls-hi-fg)}
.pi .pi-inv{fill:var(--ls-bg)}.pi-hot{stroke:var(--ls-accent)}.pi-lw{stroke:var(--ls-muted)}.pi-lw.pi-hot{stroke:var(--ls-accent);stroke-width:7}
.pi-grid{stroke:var(--ls-line);stroke-width:1.5;opacity:.18}.pi-lvl{stroke:var(--ls-ok);stroke-width:2;stroke-dasharray:4 7}
.pi-th{stroke:var(--ls-danger);stroke-width:4;stroke-dasharray:14 10}.pi-cur{stroke:var(--ls-hi-fg);stroke-width:3}
.pi-curve{fill:none;stroke:var(--ls-accent);stroke-width:6;stroke-linejoin:round}.pi-stem{stroke:var(--ls-muted);stroke-width:2}
.pi-smp{fill:var(--ls-accent2);stroke:var(--ls-fg);stroke-width:2.5}.pi-step{fill:none;stroke:var(--ls-ok);stroke-width:5}
.pi-dig{fill:var(--ls-accent2);fill-opacity:.6;stroke:var(--ls-fg);stroke-width:4;stroke-linejoin:round}
.pi-avg{fill:none;stroke:var(--ls-fg);stroke-width:4;stroke-dasharray:12 8}
.is-on .pi-curve{stroke-width:9}.is-on .pi-step,.is-on .pi-avg{stroke-width:8}.is-on .pi-stem{stroke:var(--ls-fg)}
.is-1 .pi-cell,.is-1 .pi-key{fill:var(--ls-accent)}.pi .is-1 .pi-bv{fill:var(--ls-on-accent)}.pi text.is-lit{fill:var(--ls-hi-fg)}
.pi-bit.is-on .pi-cell,.pi-gate.is-on .pi-s{stroke:var(--ls-accent);stroke-width:7}.pi-gate.is-1 .pi-gs{fill:var(--ls-accent2)}
.pi-glo{opacity:0}.is-1 .pi-glo{opacity:.4}.is-1 .pi-bulb{fill:var(--ls-accent2)}.pi-row{fill:var(--ls-accent2);fill-opacity:.55}
.pi-board{stroke-width:5}.pi-usb{fill:var(--ls-surface)}.pi-chip{fill:var(--ls-fg)}.pi-pad{fill:var(--ls-accent2)}
.pi-hole{fill:var(--ls-bg);stroke:var(--ls-fg);stroke-width:3}.pi-ring{fill:none;stroke:var(--ls-accent);stroke-width:5}
.pi .pi-bled.is-hi{fill:var(--ls-ok)}.pi-mx{fill:var(--ls-surface);stroke:var(--ls-muted);stroke-width:2}.pi-mx.is-lit{fill:var(--ls-danger);stroke:var(--ls-danger)}
.pi-lead{fill:none;stroke:var(--ls-muted);stroke-width:2.5}.pi-pl.is-on text{fill:var(--ls-hi-fg)}.pi-eye{fill:var(--ls-accent2);stroke:var(--ls-fg);stroke-width:3}
`;

export const kit: Kit = { draw: { circuit, pinout, signal, gates, bits }, css: CSS };
