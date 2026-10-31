/**
 * The data pack's renderers (erd, query, pipeline, sheet): a chunk the player loads only for lessons that use
 * them (packs.ts). Rules: every frame a pure function of its KitState; transform and opacity for motion; no SVG ids; text
 * through rich() in right-to-left languages; CSS classes prefixed with the pack's own letters.
 */
import type { Kit } from "../../templates/types.ts";
import { erd } from "./erd.ts";
import { pipeline } from "./pipeline.ts";
import { query } from "./query.ts";
import { sheet } from "./sheet.ts";

// Sizes are in em of each element's text size, so an element shrunk to fit stays in proportion. Old-phone rules hold:
// no filters or blur, hard shadows, motion by transform and opacity.
const MONO = `font-family:ui-monospace,Menlo,Consolas,"Noto Sans Mono",monospace`;
const CSS = `
.pd-q,.pd-erd,.pd-p,.pd-s{position:relative;width:100%;height:100%;line-height:1.2}
.pd-links{position:absolute;left:0;top:0;pointer-events:none}
.pd-sql{position:absolute;background:var(--ls-card);border:3px solid var(--ls-line);border-radius:14px;box-shadow:var(--ls-shadow);padding:.35em .5em;${MONO};white-space:pre}
.pd-ln{position:relative;display:flex;align-items:center;height:1.25em;padding-left:.3em;border-radius:.3em}
.pd-ln>*{position:relative}
.pd-ln::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;border-radius:.3em;background:var(--ls-accent2);opacity:0}
.pd-ln.is-now::before{opacity:.45}.pd-ln.is-now{box-shadow:inset .2em 0 0 var(--ls-accent)}
.pd-split{border-left:3px solid var(--ls-line)}[dir=rtl] .pd-split{border-left:0;border-right:3px solid var(--ls-line)}
.pd-b{display:inline-flex;align-items:center;justify-content:center;flex:none;width:1.15em;height:1.15em;margin:0 .3em 0 0;border-radius:50%;
  border:2px solid var(--ls-muted);color:var(--ls-muted);font:700 .95em/1 var(--ls-font)}
.pd-b.is-now{background:var(--ls-accent);border-color:var(--ls-accent);color:var(--ls-on-accent)}
.pd-kw{color:var(--ls-hi-fg);font-weight:800}.pd-str{color:var(--ls-ok)}.pd-nu{color:var(--ls-danger)}
.pd-g{position:absolute;left:0;top:0;background:var(--ls-card);border:3px solid var(--ls-line);box-shadow:var(--ls-shadow);box-sizing:content-box}
.pd-g.is-res{border-color:var(--ls-accent);border-width:5px;margin:-2px}
.pd-h{display:flex;height:1.3em;background:var(--ls-surface);border-bottom:2px solid var(--ls-line);font-weight:800}
.pd-h .pd-c{${MONO};font-size:.94em}
.pd-c{display:flex;align-items:center;flex:none;padding:0 .45em;white-space:nowrap;overflow:visible;height:100%}
.pd-c.pd-num{justify-content:flex-end;font-variant-numeric:tabular-nums}
.pd-h .pd-c.is-lit{background:var(--ls-accent);color:var(--ls-on-accent)}
.pd-r .pd-c.is-lit{color:var(--ls-hi-fg);font-weight:800}
.pd-ar{margin-inline-start:.15em;font-family:var(--ls-font)}
.pd-r{position:absolute;left:0;top:0;width:100%;display:flex;height:1.25em;border-bottom:1px solid var(--ls-line);box-sizing:border-box}
.pd-r.is-out{color:var(--ls-danger);text-decoration:line-through;text-decoration-thickness:.1em}
.pd-k0{box-shadow:inset .3em 0 0 var(--ls-accent)}.pd-k1{box-shadow:inset .3em 0 0 var(--ls-ok)}
.pd-k2{box-shadow:inset .3em 0 0 var(--ls-accent2)}.pd-k3{box-shadow:inset .3em 0 0 var(--ls-danger)}
[dir=rtl] .pd-k0{box-shadow:inset -.3em 0 0 var(--ls-accent)}[dir=rtl] .pd-k1{box-shadow:inset -.3em 0 0 var(--ls-ok)}
[dir=rtl] .pd-k2{box-shadow:inset -.3em 0 0 var(--ls-accent2)}[dir=rtl] .pd-k3{box-shadow:inset -.3em 0 0 var(--ls-danger)}
.pd-cut{position:absolute;left:-.4em;right:-.4em;top:0;border-top:4px dashed var(--ls-danger)}
.pd-link{fill:none;stroke:var(--ls-accent);stroke-width:4}
.pd-t{position:absolute;background:var(--ls-card);border:3px solid var(--pd-tone,var(--ls-line));border-radius:12px;box-shadow:var(--ls-shadow);overflow:hidden}
.pd-t.is-on{outline:5px solid var(--ls-accent);outline-offset:3px}
.pd-th{background:var(--pd-tone,var(--ls-surface));border-bottom:2px solid var(--ls-line);padding:.12em .55em .1em;text-align:center}
.pd-tn{${MONO};font-weight:800;font-size:1.05em;line-height:1.4}
.pd-tl{font-size:.875em;color:var(--ls-muted);font-weight:700;line-height:1.25}
.pd-tc{display:flex;align-items:center;height:1.3em;padding:0 .55em;${MONO};white-space:nowrap}
.pd-tc:first-of-type{margin-top:.2em}
.pd-tc.is-pk .pd-cn{font-weight:800;text-decoration:underline;text-underline-offset:.15em}
.pd-tc.is-fk .pd-cn{font-style:italic}
.pd-tc.is-on,.pd-tc.is-on .pd-key,.pd-tc.is-on .pd-ct{background:var(--ls-accent2);color:var(--ls-on-accent)}
.pd-key{flex:none;width:2.17em;font:800 .875em var(--ls-font);color:var(--ls-hi-fg)}
.pd-ct{margin-left:auto;padding-left:.8em;color:var(--ls-muted);font-size:.875em}
.pd-rel path{fill:none;stroke:var(--ls-fg);stroke-width:3.5;stroke-linejoin:round}
.pd-rel.is-on path{stroke:var(--ls-accent);stroke-width:6}
.pd-rl{fill:var(--ls-muted);font-weight:700;paint-order:stroke;stroke:var(--ls-bg);stroke-width:8px;stroke-linejoin:round}
.pd-st{position:absolute;display:flex;flex-direction:column;align-items:center;padding-top:.5em;gap:.15em;text-align:center;
  background:var(--ls-card);border:3px solid var(--pd-tone,var(--ls-line));border-radius:16px;box-shadow:var(--ls-shadow)}
.pd-st .ls-icon{color:var(--ls-accent)}.pd-st-check .ls-icon{color:var(--ls-danger)}
.pd-st-source,.pd-st-store{border-radius:16px 16px 40% 40%/16px 16px 22% 22%}
.pd-st.is-on{outline:5px solid var(--ls-accent);outline-offset:4px}
.pd-sl{font-weight:800;line-height:1.22;padding:0 .4em}
.pd-cnt{position:absolute;top:-.65em;inset-inline-end:-.55em;min-width:1.6em;padding:0 .3em;height:1.3em;line-height:1.3em;border-radius:.65em;
  background:var(--ls-accent2);color:var(--ls-on-accent);border:2px solid var(--ls-fg);font-weight:800;text-align:center;font-variant-numeric:tabular-nums}
.pd-tray{position:absolute;border:3px dashed var(--ls-danger);border-radius:14px;text-align:center;padding-top:.2em;background:var(--ls-bg)}
.pd-tl2{font-weight:700;font-size:.875em;color:var(--ls-danger)}
.pd-tray .pd-cnt{background:var(--ls-danger);color:var(--ls-bg)}
.pd-pe path{stroke:var(--ls-fg);stroke-width:3.5}.pd-pe polygon{fill:var(--ls-fg)}
.pd-pa path{stroke:var(--ls-danger);stroke-dasharray:8 7}.pd-pa polygon{fill:var(--ls-danger)}
.pd-dot{fill:var(--ls-accent);stroke:var(--ls-fg);stroke-width:2}
.pd-dot.is-bad{fill:var(--ls-danger)}.pd-dot.is-ok{fill:var(--ls-ok)}
.pd-fb,.pd-sh,.pd-sc,.pd-is,.pd-sel,.pd-tag{position:absolute}
.pd-fb{display:flex;align-items:center;gap:.4em;background:var(--ls-card);border:2px solid var(--ls-line);border-radius:10px;padding:0 .3em}
.pd-nb{flex:none;min-width:2.4em;padding:0 .3em;border-inline-end:2px solid var(--ls-line);font-weight:800;${MONO}}
.pd-fx{flex:none;font-style:italic;font-weight:700;color:var(--ls-muted);font-family:Georgia,serif}
.pd-ff{white-space:nowrap;overflow:hidden}.pd-ff.is-f{${MONO}}
.pd-sh{display:flex;align-items:center;justify-content:center;background:var(--ls-surface);border:1px solid var(--ls-line);color:var(--ls-muted);font-weight:700;box-sizing:border-box}
.pd-sh.is-sel{background:var(--ls-accent2);color:var(--ls-on-accent)}
.pd-sc{background:var(--ls-card);border:1px solid var(--ls-line);box-sizing:border-box}
.pd-sc.is-b{font-weight:800;background:var(--ls-surface)}
.pd-v{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;padding:0 .4em;white-space:nowrap}
.pd-v.pd-num{justify-content:flex-end;font-variant-numeric:tabular-nums}
.pd-sc.is-out .pd-v{color:var(--ls-muted);text-decoration:line-through;text-decoration-thickness:.1em}
.pd-sc.is-new .pd-v{color:var(--ls-ok);font-weight:800}
.pd-is{border:4px solid var(--ls-danger);margin:-3px;box-sizing:content-box;border-radius:4px}
.pd-is-blank{border-style:dashed}
.pd-is.is-on{border-width:7px;margin:-6px}
.pd-is.is-fixed{border-color:var(--ls-ok)}
.pd-tag{background:var(--ls-danger);color:var(--ls-bg);font-weight:800;font-size:.875em;padding:.05em .45em;border-radius:8px;white-space:nowrap;line-height:1.3}
.pd-sel{left:0;top:0;border:5px solid var(--ls-accent);margin:-3px;box-sizing:content-box;pointer-events:none}
.pd-fh{position:absolute;bottom:-.3em;inset-inline-end:-.3em;width:.45em;height:.45em;background:var(--ls-accent);border:2px solid var(--ls-card)}
`;

export const kit: Kit = { draw: { erd, query, pipeline, sheet }, css: CSS };
