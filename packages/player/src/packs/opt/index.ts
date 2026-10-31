/**
 * The optimization pack's renderers (graph, schedule, knapsack, lp, searchtree): a chunk the player loads only for lessons that use
 * them (packs.ts). Rules: every frame a pure function of its KitState; transform and opacity for motion; no SVG ids; text
 * through rich() in right-to-left languages; CSS classes prefixed with the pack's own letters.
 */
import type { Kit } from "../../templates/types.ts";
import { graph } from "./graph.ts";
import { knapsack } from "./knapsack.ts";
import { lp } from "./lp.ts";
import { schedule } from "./schedule.ts";
import { searchtree } from "./tree.ts";

// Old-phone rules: no filters or blur, hard shadows, motion by transform and opacity. Text 32 px or more.
const CSS = `
.po{position:relative;width:100%;height:100%;font-weight:700;line-height:1.15;color:var(--ls-fg)}
.po>*,.po-ov>*{position:absolute;box-sizing:border-box}
.po-svg,.po-ov{left:0;top:0}.po-svg{overflow:visible}.po-ov{width:100%;height:100%}
.po-svg text{font-family:var(--ls-font);font-weight:700;font-size:32px;fill:var(--ls-fg)}
.po-mk{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}
.po-pn{display:flex;align-items:center;gap:24px;padding:0 22px;font-size:32px}
.po-card{background:var(--ls-card);border:3px solid var(--ls-line);border-radius:16px;box-shadow:var(--ls-shadow)}
.po-pn.is-side{flex-direction:column;align-items:stretch;justify-content:center;padding:0}
.is-side .po-card{display:flex;flex-direction:column;gap:18px;padding:24px 28px}
.po-nt{flex:1;font-weight:650}.po-tt{display:flex;align-items:baseline;gap:12px;white-space:nowrap}
.po-tl{color:var(--ls-muted)}.po-tv{color:var(--ls-hi-fg);font-weight:800}
.is-side .po-tt{flex-direction:column;gap:2px}.is-side .po-tv{font-size:64px;line-height:1.05}
.po-e{fill:none;stroke:var(--ls-muted);stroke-width:5;stroke-linecap:round}
.po-e.s-c{stroke:var(--ls-accent);stroke-width:10}.po-e.s-t{stroke:var(--ls-ok);stroke-width:9}
.po-e.s-p{stroke:var(--ls-accent);stroke-width:13}.po-e.s-x{stroke:var(--ls-danger);stroke-dasharray:12 10}
.po-e.s-o{stroke:var(--ls-danger);stroke-width:10}.po-e.s--{stroke-opacity:.25}
.po-w rect{fill:var(--ls-card);stroke:var(--ls-line);stroke-width:2}
.po-n>:first-child{fill:var(--ls-card);stroke:var(--ls-line);stroke-width:4}
.po-n.s-f>:first-child{stroke:var(--ls-accent);stroke-width:7;stroke-dasharray:9 6}
.po-n.s-c>:first-child{fill:var(--ls-accent);stroke:var(--ls-fg);stroke-width:6}
.po-n.s-v>:first-child,.po-k2>:first-child{fill:var(--ls-ok)}
.po-n.s-p>:first-child{fill:var(--ls-accent2);stroke:var(--ls-fg);stroke-width:6}
.po-k1>:first-child{fill:var(--ls-accent)}.po-k3>:first-child{fill:var(--ls-accent2)}.po-k4>:first-child{fill:var(--ls-muted)}
.po-k5>:first-child{fill:var(--ls-fg)}.po-k6>:first-child{fill:var(--ls-hi-fg)}
.po-svg .s-c text,.po-svg .s-p text,.po-svg .po-k1 text,.po-svg .po-k3 text{fill:var(--ls-on-accent)}
.po-svg .s-v text,.po-svg .po-k2 text,.po-svg .po-k4 text,.po-svg .po-k5 text,.po-svg .po-k6 text{fill:var(--ls-bg)}
.po-n.is-on>:first-child{stroke:var(--ls-hi-fg);stroke-width:10}
.po-r{fill:none;stroke:var(--ls-accent);stroke-width:8;stroke-linejoin:round;stroke-linecap:round}
.po-cut{fill:none;stroke:var(--ls-danger);stroke-width:10;stroke-dasharray:14 10}
.po-add{fill:none;stroke:var(--ls-ok);stroke-width:12;stroke-linecap:round}
.po-bus{fill:var(--ls-accent2);stroke:var(--ls-fg);stroke-width:4}
.po-l{white-space:nowrap;font-size:34px;background:var(--ls-bg);padding:0 6px;border-radius:8px}.po-lb{transform:translate(-50%,0)}.po-lt{transform:translate(-50%,-100%)}
.po-ll{transform:translate(-100%,-50%)}.po-lr{transform:translate(0,-50%)}
.po-rl,.po-h,.po-th,.po-td,.po-blk{display:flex;align-items:center;justify-content:center}
.po-rl{font-size:34px;font-weight:800;padding:0 8px}.po-h,.po-th{font-size:32px;color:var(--ls-muted)}
.po-c{border-radius:12px;background:var(--ls-surface);border:2px dashed var(--ls-line)}
.po-c.is-blk{background:repeating-linear-gradient(45deg,var(--ls-surface) 0 10px,var(--ls-muted) 10px 13px)}
.po-c.is-opt{background:var(--ls-accent2)}
.po-c.is-bad{background:repeating-linear-gradient(45deg,var(--ls-surface) 0 9px,var(--ls-danger) 9px 15px)}
.po-i{display:flex;flex-direction:column;justify-content:center;padding:2px 8px;background:var(--ls-card);border:3px solid var(--ls-line);
  border-inline-start:14px solid var(--po-t);border-radius:12px;box-shadow:var(--ls-shadow);overflow:hidden;white-space:nowrap}
.po-it{font-size:32px;font-weight:800}.po-is{font-size:32px;font-weight:600;color:var(--ls-muted)}
.po-i.s-n{outline:6px solid var(--ls-accent);outline-offset:2px}.po-i.s-g{border-style:dashed}
.po-i.s-x{background:var(--ls-danger);color:var(--ls-bg)}.po-i.s-x .po-is{color:var(--ls-bg)}
.po-i.is-on{outline:6px solid var(--ls-hi-fg);outline-offset:3px}
.is-gantt .po-i{border:3px solid var(--ls-line);background:var(--po-t);color:var(--po-on);padding:0;align-items:center}
.po-tk{font-size:32px;color:var(--ls-muted);transform:translateX(-50%)}.po-tu{font-size:32px;color:var(--ls-muted);transform:translateX(-100%)}
.po-end{left:0;top:0;background:var(--ls-danger)}
.po-kh,.po-kr{display:flex;align-items:center;padding:0 14px;font-size:34px;white-space:nowrap}
.po-kh{color:var(--ls-muted);font-size:32px;white-space:normal;align-items:flex-end;padding-bottom:6px;line-height:1.1}.po-kr{background:var(--ls-card);border:3px solid var(--ls-line);border-radius:12px}
.po-ks{flex:none;position:relative;width:36px;height:36px;border-radius:50%;border:7px solid var(--po-t);margin-inline-end:14px;background:var(--ls-card)}
.po-kh .po-ks{border-color:transparent;background:none}
.po-ks .po-mk{position:absolute;left:-4px;top:-4px;width:30px;height:30px;display:none}
.po-ok{stroke:var(--ls-fg)}.po-no{stroke:var(--ls-danger)}
.s-i .po-ok,.s-n .po-ok,.s-x .po-no{display:block!important}
.po-kn{flex:1;overflow:hidden}.po-kv{flex:none;text-align:end;font-variant-numeric:tabular-nums}
.po-kr.s-c,.po-kr.s-n{outline:6px solid var(--ls-accent);outline-offset:2px}.po-kr.s-x{color:var(--ls-muted);border-style:dashed}
.po-kr.is-on{outline:6px solid var(--ls-hi-fg);outline-offset:2px}
.po-bag{border:4px solid var(--ls-line);border-radius:10px;background:var(--ls-surface)}.po-bag.is-over{border-color:var(--ls-danger)}
.po-cap{font-size:32px;transform:translateX(-50%);white-space:nowrap}
.po-blk{background:var(--po-t);color:var(--po-on);border:3px solid var(--ls-line);border-radius:8px;font-size:32px;transform-origin:50% 100%}
.po-blk.is-on{outline:6px solid var(--ls-hi-fg)}
.po-kt{display:flex;flex-direction:column;justify-content:center;gap:28px;font-size:44px;font-weight:800;white-space:nowrap}
.po-kw.is-over{color:var(--ls-danger)}.po-kp{color:var(--ls-hi-fg)}
.po-tr,.po-tc{justify-content:flex-start;padding-inline-start:10px;white-space:nowrap}.po-tr{color:var(--ls-fg)}
.po-tw{color:var(--ls-muted);font-weight:600;margin-inline-start:.35em}
.po-td{font-size:32px;background:var(--ls-card);border:2px solid var(--ls-line);border-radius:8px}
.po-td.is-now{background:var(--ls-accent);color:var(--ls-on-accent)}.po-td.is-from{outline:5px dashed var(--ls-accent);outline-offset:-2px}
.po-td.is-tr{background:var(--ls-ok);color:var(--ls-bg)}.po-td.is-on{outline:5px solid var(--ls-hi-fg)}
.po-svg .po-tick{fill:var(--ls-muted)}.po-grid{stroke:var(--ls-line);stroke-width:1.5;opacity:.15}
.po-axis{fill:none;stroke:var(--ls-fg);stroke-width:3}
.po-al{font-size:32px;white-space:nowrap;transform:translateX(-50%)}.po-al.is-y{transform:translate(-50%,-50%) rotate(-90deg);left:24px!important}
.po-off{fill:var(--ls-fg);fill-opacity:.055}.po-con{stroke-width:6;stroke-linecap:round}.po-con.is-on{stroke-width:11}
.po-fit{fill:var(--ls-ok);fill-opacity:.28;stroke:var(--ls-ok);stroke-width:5;stroke-linejoin:round}
.po-goal{stroke:var(--ls-accent);stroke-width:7;stroke-dasharray:18 10;stroke-linecap:round}
.po-int circle{fill:var(--ls-fg)}
.po-bdg circle,.po-ls circle{fill:var(--ls-card);stroke:currentColor;stroke-width:4}
.po-svg .po-bdg text,.po-ls text{fill:currentColor;font-size:32px;font-weight:800}
.po-cn circle{fill:var(--ls-fg);stroke:var(--ls-bg);stroke-width:3}
.po-cn.is-best circle{fill:var(--ls-accent);stroke:var(--ls-fg);stroke-width:7}.po-cn.is-on circle{stroke:var(--ls-hi-fg);stroke-width:10}
.po-svg .po-cl,.po-svg .po-tick{paint-order:stroke;stroke:var(--ls-bg);stroke-width:8px;stroke-linejoin:round}
.po-svg .po-cv{fill:var(--ls-hi-fg);font-size:38px;font-weight:800}
.po-lg{display:flex;flex-direction:column;justify-content:center;font-size:32px}.po-lgc{display:flex;flex-direction:column;gap:10px;padding:20px 24px}
.po-lgr{display:flex;align-items:center;gap:14px}.po-lgr.is-on{color:var(--ls-hi-fg)}
.po-ls{flex:none}.po-ls line{stroke-width:6}.po-ls .is-goal{stroke:var(--ls-accent);stroke-dasharray:12 7}
.po-lg .po-nt{margin-top:8px}
.po-tln{stroke:var(--ls-line);stroke-width:4}.po-tln.is-x{stroke:var(--ls-muted);stroke-dasharray:8 8}
.po-te{font-size:32px;white-space:nowrap;background:var(--ls-bg);padding:0 6px;border-radius:8px;transform:translate(-50%,-50%)}
.po-te.is-l{transform:translate(-100%,-50%);margin-left:-6px}.po-te.is-r{transform:translate(0,-50%);margin-left:6px}
.po-tn{display:flex;align-items:center;justify-content:center;gap:10px;font-size:32px;white-space:nowrap;background:var(--ls-card);
  border:3px solid var(--ls-line);border-radius:14px;box-shadow:var(--ls-shadow)}
.po-tb{color:var(--ls-muted)}.po-tn .po-mk{flex:none;width:28px;height:28px;stroke:var(--ls-ok)}
.po-tn.s-x{color:var(--ls-muted);border-style:dashed;box-shadow:none}.po-tn.s-x .po-mk{stroke:var(--ls-muted)}
.po-tn.s-d{border-color:var(--ls-danger)}.po-tn.s-d .po-mk{stroke:var(--ls-danger)}
.po-tn.is-now{outline:6px solid var(--ls-accent);outline-offset:3px}.po-tn.is-on{outline:6px solid var(--ls-hi-fg);outline-offset:3px}
.po-tn.is-best{background:var(--ls-ok);color:var(--ls-bg)}.po-tn.is-best .po-tb{color:var(--ls-bg)}.po-tn.is-best .po-mk{stroke:var(--ls-bg)}
`;

export const kit: Kit = { draw: { graph, schedule, knapsack, lp, searchtree }, css: CSS };
