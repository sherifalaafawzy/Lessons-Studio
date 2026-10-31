/**
 * The programming pack's renderers (trace, flowchart, array, calltree, codediff): a chunk the player loads only for lessons that use
 * them (packs.ts). Rules: every frame a pure function of its KitState; transform and opacity for motion; no SVG ids; text
 * through rich() in right-to-left languages; CSS classes prefixed with the pack's own letters.
 */
import type { Kit } from "../../templates/types.ts";
import { array } from "./array.ts";
import { calltree } from "./calltree.ts";
import { codediff } from "./codediff.ts";
import { flowchart } from "./flowchart.ts";
import { trace } from "./trace.ts";

const MONO = `ui-monospace,Menlo,Consolas,"Noto Sans Mono","Droid Sans Mono",monospace`;
// Old-phone rules hold here too: no filters or blur, hard shadows, motion by transform and opacity.
const CSS = `
.pc-abs{position:absolute}
.pc-code,.pc-panel{box-sizing:border-box;border:3px solid var(--ls-line);border-radius:16px;box-shadow:var(--ls-shadow);color:var(--ls-fg)}
.pc-code{background:var(--ls-card);padding:12px 14px;font-family:${MONO}}
.pc-bar{position:absolute;left:0;right:0;top:0;box-shadow:inset 7px 0 0 var(--ls-accent)}
.pc-bar::before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;background:var(--ls-accent2);opacity:.5}
.ls-brand-studio-dark .pc-bar::before{opacity:.3}
.pc-bar.is-err{box-shadow:inset 7px 0 0 var(--ls-danger)}.pc-bar.is-err::before{background:var(--ls-danger);opacity:.3}
.pc-ln{position:relative;display:flex;white-space:pre}
.pc-ln>span{position:relative}
.pc-no{flex:none;color:var(--ls-muted);text-align:end;margin-inline-end:.6em}
.pc-no.is-on{color:var(--ls-hi-fg);font-weight:800}
.pc-ln.is-focus,.pc-it.is-focus{outline:5px solid var(--ls-accent);outline-offset:3px;border-radius:6px}
.pc-k{color:var(--ls-hi-fg);font-weight:700}.pc-f{font-weight:700}.pc-s{color:var(--ls-ok)}.pc-n{color:var(--ls-hi-fg)}
.pc-c{color:var(--ls-muted);font-style:italic}
.pc-panel{background:var(--ls-surface);padding:8px 10px;overflow:hidden}
.pc-head{font:800 32px var(--ls-font);color:var(--ls-muted);line-height:1.4;white-space:nowrap}
.pc-vr{position:relative;display:flex;align-items:center;gap:.3em;font:700 32px ${MONO};white-space:nowrap;border-radius:10px;padding:0 6px}
.pc-vn{flex:none}.pc-vn::after{content:" =";color:var(--ls-muted)}
.pc-vv{flex:0 1 auto;min-width:1.2em;font-weight:800;background:var(--ls-card);border:2px solid var(--ls-line);border-radius:8px;
  padding:0 .25em;line-height:1.3;overflow:hidden;text-overflow:ellipsis;text-align:center}
.pc-vr.is-new .pc-vv{background:var(--ls-accent2);color:var(--ls-on-accent);border-color:var(--ls-fg)}
.pc-vr.is-l{background:var(--ls-card);box-shadow:inset 6px 0 0 var(--ls-accent)}
.pc-vr.is-h{color:var(--ls-hi-fg);font-weight:800}.pc-vr.is-h .pc-vn::after,.pc-vr.is-r .pc-vn::after{content:none}
.pc-vr.is-h .pc-vv{display:none}.pc-vr.is-r .pc-vn{color:var(--ls-hi-fg)}
.pc-vr.pc-d{box-shadow:inset 6px 0 0 var(--ls-accent),6px -6px 0 -2px var(--ls-card),6px -6px 0 0 var(--ls-line)}
.pc-out{font-family:${MONO}}
.pc-ol{font-size:32px;line-height:1.35;white-space:pre;overflow:hidden;text-overflow:ellipsis}
.pc-ol.is-new{font-weight:800}.pc-ol.is-err,.pc-dout.is-err .pc-ol{color:var(--ls-danger);font-weight:800}
.pc-dout.is-ok .pc-ol{color:var(--ls-ok);font-weight:800}
.pc-dl{position:absolute;left:14px;right:14px}
.pc-del::before,.pc-add::before{content:"";position:absolute;top:0;bottom:0;left:-8px;right:-8px;border-radius:6px;opacity:.2}
.pc-del::before{background:var(--ls-danger)}.pc-add::before{background:var(--ls-ok)}
.pc-del{box-shadow:-8px 0 0 var(--ls-danger)}.pc-add{box-shadow:-8px 0 0 var(--ls-ok)}
.pc-del .pc-no{color:var(--ls-danger);font-weight:800}.pc-add .pc-no{color:var(--ls-ok);font-weight:800}
.pc-dh{display:flex;align-items:center;font-size:32px;font-weight:800;padding-inline-start:16px;border-inline-start:8px solid;white-space:nowrap}
.pc-hb{color:var(--ls-danger)}.pc-ha{color:var(--ls-ok)}
.pc-flow,.pc-arr,.pc-tree{position:relative}
.pc-fs{fill:var(--ls-card);stroke:var(--ls-fg);stroke-width:3.5}
.pc-f-start,.pc-f-end{fill:var(--ls-accent2)}.pc-f-decision{stroke:var(--ls-accent);stroke-width:4.5}
.pc-fs.is-on{stroke:var(--ls-accent);stroke-width:9}
.pc-fe path{stroke:var(--ls-muted);stroke-width:3.5;stroke-linejoin:round}.pc-fe polygon{fill:var(--ls-muted)}
.pc-fe.is-on path{stroke:var(--ls-accent);stroke-width:6}.pc-fe.is-on polygon{fill:var(--ls-accent)}
.pc-fl{fill:var(--ls-fg);font-weight:800;font-family:var(--ls-font)}
.pc-fn{display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.15;font-weight:700}
.pc-fk-start,.pc-fk-end{color:var(--ls-on-accent)}
.pc-tok{fill:var(--ls-accent2);stroke:var(--ls-fg);stroke-width:3.5}
.pc-arr{font-family:${MONO}}
.pc-it{position:absolute;left:0;top:0;box-sizing:border-box;text-align:center;font-weight:800;color:var(--ls-fg)}
.pc-box{background:var(--ls-card);border:3px solid var(--ls-fg);border-radius:14px;box-shadow:var(--ls-shadow)}
.pc-bar2{display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.pc-fill{width:100%;flex:none;box-sizing:border-box;background:var(--ls-card);border:3px solid var(--ls-fg);border-radius:6px 6px 0 0}
.pc-bv{line-height:1.3}
.pc-box.is-cmp,.is-cmp .pc-fill{background:var(--ls-accent2);color:var(--ls-on-accent)}
.pc-box.is-swap,.is-swap .pc-fill{background:var(--ls-accent);color:var(--ls-on-accent)}
.pc-box.is-done{border-color:var(--ls-ok);border-width:6px;color:var(--ls-ok)}.is-done .pc-fill{background:var(--ls-ok)}
.pc-box.is-piv{border-color:var(--ls-danger);border-width:6px}.is-piv .pc-fill{background:var(--ls-danger)}
.pc-box.is-found,.is-found .pc-fill{background:var(--ls-ok);color:var(--ls-bg)}
.pc-ix{text-align:center;font-size:32px;line-height:1.3;color:var(--ls-muted)}
.pc-ptr{left:0;font-size:32px;line-height:1.2;font-weight:800;color:var(--ls-hi-fg);padding-top:14px;white-space:nowrap}
.pc-ptr::before{content:"";position:absolute;top:0;left:50%;margin-left:-11px;border:11px solid transparent;border-top:0;border-bottom:13px solid currentColor}
.pc-p-pivot{color:var(--ls-danger)}
.pc-atop{left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;gap:24px;font:700 32px var(--ls-font);white-space:nowrap}
.pc-cnts{display:flex;gap:28px;color:var(--ls-muted)}.pc-cnt b{color:var(--ls-fg);font-family:${MONO}}
.pc-ce{stroke:var(--ls-muted);stroke-width:3.5}.pc-ce.is-ret{stroke:var(--ls-ok);stroke-dasharray:9 7}
.pc-call{box-sizing:border-box;text-align:center;font-family:${MONO};font-weight:700;white-space:nowrap;background:var(--pc-bg,var(--ls-card));
  border:3px solid var(--ls-line);border-radius:12px;color:var(--ls-fg)}
.pc-call.is-open{border:5px solid var(--ls-accent)}
.pc-call.is-now{background:var(--ls-accent);color:var(--ls-on-accent);box-shadow:var(--ls-shadow)}
.pc-call.is-focus{outline:5px solid var(--ls-accent2);outline-offset:4px}
.pc-ret,.pc-chip{line-height:1.2;padding:0 .3em;font-family:${MONO};font-weight:800;background:var(--ls-ok);color:var(--ls-bg);
  border:2px solid var(--ls-fg);border-radius:999px;white-space:nowrap}
.pc-ret{position:absolute;right:-.5em;bottom:-.6em}
.pc-chip{left:0;top:0}
`;

export const kit: Kit = { draw: { trace, flowchart, array, calltree, codediff }, css: CSS };
